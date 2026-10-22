/**
 * Ejecuta las entradas de lib/ai-casos-prueba.ts contra Gemini con los mismos prompts que usa el
 * Worker de IA (workers/ai-proxy) y muestra qué hizo la IA con cada una.
 * Uso:
 *   node --experimental-strip-types scripts/probar-ia.mts               casos de un requerimiento (KAN-25)
 *   node --experimental-strip-types scripts/probar-ia.mts --generacion  generación iterativa (KAN-40)
 *   node --experimental-strip-types scripts/probar-ia.mts --offline     comprobaciones sin llamar a Gemini
 * Las dos primeras necesitan GEMINI_API_KEY (en el entorno, en workers/ai-proxy/.dev.vars o en
 * .env.local) y consumen cuota de esa key. `--offline` no necesita nada.
 */
import { readFileSync } from 'node:fs';

// Lee GEMINI_API_KEY del entorno o de los archivos de variables locales
function leerClave(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  for (const archivo of ['workers/ai-proxy/.dev.vars', '.env.local']) {
    try {
      for (const linea of readFileSync(archivo, 'utf-8').split(/\r?\n/)) {
        const m = linea.match(/^\s*GEMINI_API_KEY\s*=\s*(.*?)\s*$/);
        if (m) return m[1].replace(/^["']|["']$/g, '');
      }
    } catch {
      // el archivo no existe: se prueba con el siguiente
    }
  }
  console.error('Falta GEMINI_API_KEY (entorno, workers/ai-proxy/.dev.vars o .env.local).');
  process.exit(1);
}

// Modelo configurado en el Worker
function leerModelo(): string {
  const cfg = readFileSync('workers/ai-proxy/wrangler.jsonc', 'utf-8');
  return cfg.match(/"GEMINI_MODEL"\s*:\s*"([^"]+)"/)?.[1] ?? 'gemini-3.5-flash-lite';
}

const { callGemini, callGeminiJson } = await import('../workers/ai-proxy/src/gemini.ts');
const prompts = await import('../workers/ai-proxy/src/prompts.ts');
const { buildSinglePrompt, entradaSinSentido, interpretarGeneracion } = prompts;
const { CASOS_PRUEBA_IA, CASOS_GENERACION_IA } = await import('../lib/ai-casos-prueba.ts');
const { similitud, UMBRAL_DUPLICADO, UMBRAL_POSIBLE_DUPLICADO } = await import('../lib/dedup-requerimientos.ts');

// El plan gratuito permite 15 peticiones por minuto: se espera entre casos para no toparse con el límite
const PAUSA_MS = 5000;
const esperar = () => new Promise((res) => setTimeout(res, PAUSA_MS));

const modo = process.argv.includes('--offline') ? 'offline' : process.argv.includes('--generacion') ? 'generacion' : 'single';

// ---------------------------------------------------------------------------
// Comprobaciones sin IA: interpretación del plan, cifras, estrictez máxima y dedup léxico
// ---------------------------------------------------------------------------
function probarOffline(): number {
  let fallos = 0;
  const comprobar = (ok: boolean, nombre: string, detalle = '') => {
    if (!ok) fallos++;
    console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${!ok && detalle ? `\n        ✗ ${detalle}` : ''}`);
  };

  const planSinCalidad = JSON.stringify({ valido: true, alcance: 'sistema', areas: [{ nombre: 'Catálogo', enfoque: 'productos' }, { nombre: 'Pagos', enfoque: 'cobros' }] });
  const sistema = prompts.interpretarPlanGeneracion(planSinCalidad, 'auto', 2, 20);
  const transversales = sistema.areas.filter((a) => a.transversal).length;
  comprobar(transversales === prompts.AREAS_TRANSVERSALES.length, 'plan sistema: añade las áreas de calidad que faltan', `transversales: ${transversales}`);
  const literal = prompts.interpretarPlanGeneracion(planSinCalidad, 'auto', 4, 20);
  comprobar(literal.areas.length === 2, 'plan sistema en estrictez máxima: no añade áreas no pedidas', `áreas: ${literal.areas.length}`);
  const muchas = JSON.stringify({ valido: true, alcance: 'modulo', areas: Array.from({ length: 6 }, (_, i) => ({ nombre: `Área ${i}`, enfoque: '' })) });
  comprobar(prompts.interpretarPlanGeneracion(muchas, 'auto', 3, 20).areas.length === 3, 'plan módulo: como mucho 3 áreas');
  const tope = JSON.stringify({ valido: true, alcance: 'sistema', areas: Array.from({ length: 30 }, (_, i) => ({ nombre: `Módulo ${i}`, enfoque: '' })) });
  const recortado = prompts.interpretarPlanGeneracion(tope, 'sistema', 2, 20);
  comprobar(
    recortado.areas.length === 20 && recortado.areas.filter((a) => a.transversal).length === prompts.AREAS_TRANSVERSALES.length,
    'plan sistema: el recorte a 20 áreas conserva las de calidad'
  );

  comprobar(prompts.cifrasSinRespaldo('responder en menos de 2 segundos', 'que el sistema responda rápido').join() === '2', 'detecta una cifra que no está en el pedido');
  comprobar(prompts.cifrasSinRespaldo('soportar 500 usuarios', 'debe soportar 500 usuarios a la vez').length === 0, 'acepta una cifra que sí dio el usuario');

  const lote = JSON.stringify({
    requerimientos: [
      { name: 'El sistema debe mostrar las calificaciones del alumno.', type_furps: 'Functionality', origen: 'explicito', prioridad: 'Must', justificacion: 'pedido' },
      { name: 'El sistema debe enviar avisos por correo.', type_furps: 'Functionality', origen: 'inferido', prioridad: 'Could', justificacion: 'deducido' }
    ],
    completo: false,
    pendiente: ['historial']
  });
  const interpretado = prompts.interpretarLoteArea(lote, { estrictez: 4, ejemplos: [] }, 'alumnos consultan calificaciones', 25);
  comprobar(interpretado.requerimientos.length === 1 && interpretado.requerimientos[0].origen === 'explicito', 'estrictez máxima: descarta lo inferido');
  comprobar(prompts.interpretarLoteArea('{"requerimientos": [], "completo": false, "pendiente": []}', { estrictez: 3, ejemplos: [] }, '', 25).completo, 'lote vacío sin pendientes: el área queda completa');

  comprobar(prompts.pareceTitulo('Tipografía legible para niños'), 'detecta un título en lugar de un requerimiento');
  comprobar(prompts.pareceTitulo('Instrucciones por voz en lugar de texto extenso para los niños pequeños'), 'detecta una frase nominal larga sin verbo');
  comprobar(!prompts.pareceTitulo('El sistema deberá reproducir las instrucciones por voz al abrir una lección.'), 'acepta un enunciado completo');
  comprobar(!prompts.pareceTitulo('El niño navega por el menú principal con botones grandes y coloridos.', '[Actor] + [Acción] + [Objeto]'), 'con patrón, acepta un enunciado sin "debe"');
  comprobar(prompts.pareceTitulo('Instrucciones por voz en lugar de texto extenso', '[Actor] + [Acción] + [Objeto]'), 'con patrón, detecta un tema sin verbo');
  comprobar(prompts.pareceTitulo('Botones grandes y coloridos para niños pequeños en la pantalla', 'When <trigger>, the <system> shall <response>.'), 'con patrón EARS, exige "shall"');

  const sinTildes = prompts.corregirOrtografia('El padre debe ingresar su contrasena desde la aplicacion movil para autorizar la sesion de los ninos.');
  comprobar(sinTildes === 'El padre debe ingresar su contraseña desde la aplicación móvil para autorizar la sesión de los niños.', 'corrige tildes y eñes perdidas', sinTildes);
  comprobar(prompts.corregirOrtografia('El sistema debe guardar las notificaciones y la version del archivo.') === 'El sistema debe guardar las notificaciones y la versión del archivo.', 'no toca plurales en -ciones');
  comprobar(prompts.corregirOrtografia('The system shall store the session and the file version.') === 'The system shall store the session and the file version.', 'no toca textos en inglés');

  const base = 'El sistema debe permitir al usuario iniciar sesión con su correo electrónico y contraseña.';
  comprobar(similitud(base, 'el sistema deberá permitir al usuario iniciar sesion con su correo electronico y contrasena') >= UMBRAL_DUPLICADO, 'dedup: misma frase con otro formato se descarta');
  const parecido = similitud(base, 'El usuario debe poder iniciar sesión usando su correo y una contraseña.');
  comprobar(parecido >= UMBRAL_POSIBLE_DUPLICADO, 'dedup: una reformulación cercana se marca como posible duplicado', `similitud ${parecido.toFixed(2)}`);
  const distinto = similitud(base, 'El sistema debe generar un reporte mensual de ventas en PDF.');
  comprobar(distinto < UMBRAL_POSIBLE_DUPLICADO, 'dedup: un requerimiento distinto no se marca', `similitud ${distinto.toFixed(2)}`);
  return fallos;
}

// ---------------------------------------------------------------------------
// Casos de un requerimiento (KAN-25)
// ---------------------------------------------------------------------------
async function probarSingle(clave: string, modelo: string): Promise<number> {
  let fallos = 0;
  for (const caso of CASOS_PRUEBA_IA) {
    // Igual que el Worker: el texto evidentemente sin sentido se rechaza sin llamar a la IA
    let r: { name: string; type_furps: string; valido?: boolean; motivo?: string } | null;
    const motivoLocal = entradaSinSentido(caso.entrada);
    let llamoALaIA = false;
    if (motivoLocal) {
      r = { name: '', type_furps: '-', valido: false, motivo: motivoLocal };
    } else {
      llamoALaIA = true;
      try {
        r = interpretarGeneracion(await callGemini(buildSinglePrompt(caso.entrada, { pattern: caso.patron, estrictez: 3, ejemplos: [] }), clave, modelo), caso.patron);
      } catch (err) {
        r = null;
        console.log(`      (${err instanceof Error ? err.message.slice(0, 120) : err})`);
      }
    }

    if (!r) {
      // null = la llamada a la IA falló (cuota, red...) o no se pudo leer la respuesta, no es un rechazo del modelo
      fallos++;
      console.log(`ERROR ${caso.id.padEnd(16)} ${caso.entrada}\n        → sin respuesta utilizable de la IA (¿cuota o conexión?)`);
      await esperar();
      continue;
    }
    const rechazado = r.valido === false || !r.name;
    let ok = caso.esperado === 'rechazar' ? rechazado : !rechazado;
    const problemas: string[] = [];
    if (!ok) problemas.push(caso.esperado === 'rechazar' ? 'debía rechazarse y generó texto' : 'debía generar y se rechazó');
    if (caso.esperado === 'aceptar' && !rechazado && caso.noDebeContener) {
      for (const re of caso.noDebeContener) {
        if (re.test(r.name)) {
          ok = false;
          problemas.push(`contiene algo no dicho por el usuario (${re})`);
        }
      }
    }
    if (!ok) fallos++;
    const salida = rechazado ? `RECHAZADO: ${r.motivo ?? '(sin motivo)'}` : `"${r.name}" [${r.type_furps}]`;
    console.log(`${ok ? 'OK   ' : 'FALLA'} ${caso.id.padEnd(16)} ${caso.entrada}\n        → ${salida}${problemas.length ? `\n        ✗ ${problemas.join('; ')}` : ''}`);
    if (llamoALaIA) await esperar();
  }
  console.log(`\n${CASOS_PRUEBA_IA.length - fallos}/${CASOS_PRUEBA_IA.length} casos correctos`);
  return fallos;
}

// ---------------------------------------------------------------------------
// Generación iterativa (KAN-40): plan y primer lote del primer área
// ---------------------------------------------------------------------------
async function probarGeneracion(clave: string, modelo: string): Promise<number> {
  let fallos = 0;
  for (const caso of CASOS_GENERACION_IA) {
    const opciones = { estrictez: caso.estrictez, ejemplos: [] as string[] };
    const temperature = prompts.TEMPERATURA_ESTRICTEZ[caso.estrictez];
    const existentes = (caso.existentes ?? []).map((e, i) => `REQ-${String(i + 1).padStart(3, '0')} | ${e}`);
    const problemas: string[] = [];
    let resumen = '';
    try {
      const plan = prompts.interpretarPlanGeneracion(
        await callGeminiJson(prompts.buildGenPlanPrompt(caso.pedido, caso.alcance, existentes.join('\n') || undefined, opciones, 20), clave, modelo, {
          temperature,
          responseSchema: prompts.ESQUEMA_PLAN
        }),
        caso.alcance,
        caso.estrictez,
        20
      );
      if (!plan.valido) throw new Error(`plan rechazado: ${plan.motivo}`);
      if (plan.alcance !== caso.alcanceEsperado) problemas.push(`alcance ${plan.alcance}, se esperaba ${caso.alcanceEsperado}`);
      if (caso.minAreas && plan.areas.length < caso.minAreas) problemas.push(`${plan.areas.length} áreas, se esperaban al menos ${caso.minAreas}`);
      if (caso.maxAreas && plan.areas.length > caso.maxAreas) problemas.push(`${plan.areas.length} áreas, se esperaban como mucho ${caso.maxAreas}`);
      for (const re of caso.areasObligatorias ?? []) {
        if (!plan.areas.some((a) => re.test(a.nombre))) problemas.push(`falta un área que cumpla ${re}`);
      }
      await esperar();

      const area = plan.areas.find((a) => !a.transversal) ?? plan.areas[0];
      const lote = prompts.interpretarLoteArea(
        await callGeminiJson(
          prompts.buildGenAreaPrompt(
            {
              userPrompt: caso.pedido,
              alcance: plan.alcance,
              area,
              otrasAreas: plan.areas.filter((a) => a !== area).map((a) => a.nombre),
              existentesArea: existentes,
              generados: [],
              pendiente: [],
              lote: 20
            },
            opciones
          ),
          clave,
          modelo,
          { temperature, responseSchema: prompts.ESQUEMA_LOTE_AREA, maxOutputTokens: 16_384 }
        ),
        opciones,
        caso.pedido,
        20
      );
      // Igual que el Worker: las copias literales de lo existente se quitan antes de devolver el lote
      lote.requerimientos = prompts.quitarCopias(lote.requerimientos, existentes);
      const titulos = lote.requerimientos.filter((r) => prompts.pareceTitulo(r.name));
      if (titulos.length) problemas.push(`${titulos.length} títulos en lugar de enunciados (p. ej. "${titulos[0].name}")`);
      for (const r of lote.requerimientos) {
        for (const re of caso.noDebeContener ?? []) if (re.test(r.name)) problemas.push(`"${r.name}" cumple ${re}`);
        if (caso.sinInferidos && r.origen === 'inferido') problemas.push(`inferido en estrictez máxima: "${r.name}"`);
        for (const e of caso.existentes ?? []) {
          const s = similitud(r.name, e);
          if (s >= UMBRAL_DUPLICADO) problemas.push(`repite un existente (${s.toFixed(2)}): "${r.name}"`);
        }
      }
      resumen = `${plan.alcance}, ${plan.areas.length} áreas (${plan.areas.map((a) => a.nombre).join(', ')}); lote de "${area.nombre}": ${lote.requerimientos.length} requerimientos, completo=${lote.completo}`;
    } catch (err) {
      problemas.push(err instanceof Error ? err.message.slice(0, 160) : String(err));
    }
    if (problemas.length) fallos++;
    console.log(`${problemas.length ? 'FALLA' : 'OK   '} ${caso.id.padEnd(18)} ${caso.pedido}\n        → ${resumen || '(sin resultado)'}${problemas.length ? `\n        ✗ ${problemas.slice(0, 6).join('\n        ✗ ')}` : ''}`);
    await esperar();
  }
  console.log(`\n${CASOS_GENERACION_IA.length - fallos}/${CASOS_GENERACION_IA.length} casos correctos`);
  return fallos;
}

const fallos =
  modo === 'offline'
    ? probarOffline()
    : modo === 'generacion'
      ? await probarGeneracion(leerClave(), leerModelo())
      : await probarSingle(leerClave(), leerModelo());
process.exit(fallos ? 1 : 0);
