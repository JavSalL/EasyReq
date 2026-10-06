/**
 * Ejecuta las entradas de lib/ai-casos-prueba.ts contra Gemini con los mismos prompts que usa el
 * Worker de IA (workers/ai-proxy) y muestra qué hizo la IA con cada una.
 * Uso: node --experimental-strip-types scripts/probar-ia.mts
 * Necesita GEMINI_API_KEY (en el entorno, en workers/ai-proxy/.dev.vars o en .env.local) y
 * consume cuota de esa key.
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

const { callGemini } = await import('../workers/ai-proxy/src/gemini.ts');
const { buildSinglePrompt, entradaSinSentido, interpretarGeneracion } = await import('../workers/ai-proxy/src/prompts.ts');
const { CASOS_PRUEBA_IA } = await import('../lib/ai-casos-prueba.ts');

const clave = leerClave();
const modelo = leerModelo();

// El plan gratuito permite 15 peticiones por minuto: se espera entre casos para no toparse con el límite
const PAUSA_MS = 5000;
const esperar = () => new Promise((res) => setTimeout(res, PAUSA_MS));

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
      r = interpretarGeneracion(await callGemini(buildSinglePrompt(caso.entrada, caso.patron), clave, modelo), caso.patron);
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
process.exit(fallos ? 1 : 0);
