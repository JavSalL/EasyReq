/**
 * Ejecuta las entradas de lib/ai-casos-prueba.ts contra Gemini y muestra qué hizo la IA con cada una.
 * Uso: node --experimental-strip-types scripts/probar-ia.mts
 * Necesita NEXT_PUBLIC_GEMINI_API_KEY en .env.local (consume cuota de esa key).
 */
import { readFileSync } from 'node:fs';

// Carga .env.local a mano (esto se ejecuta fuera de Next)
try {
  for (const linea of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {
  console.error('No se encontró .env.local');
  process.exit(1);
}

// Importación dinámica: la key se lee al cargar el módulo, por eso va después del .env
const { generateSingleRequirement } = await import('../lib/ai-actions.ts');
const { CASOS_PRUEBA_IA } = await import('../lib/ai-casos-prueba.ts');

// El plan gratuito permite 15 peticiones por minuto: se espera entre casos para no toparse con el límite
const PAUSA_MS = 5000;
let fallos = 0;
for (const caso of CASOS_PRUEBA_IA) {
  const r = await generateSingleRequirement(caso.entrada, caso.patron);
  if (!r) {
    // null = la llamada a la IA falló (cuota, red...), no es un rechazo del modelo
    fallos++;
    console.log(`ERROR ${caso.id.padEnd(16)} ${caso.entrada}
        → sin respuesta de la IA (¿cuota o conexión?)`);
    await new Promise(res => setTimeout(res, PAUSA_MS));
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
  await new Promise(res => setTimeout(res, PAUSA_MS));
}
console.log(`\n${CASOS_PRUEBA_IA.length - fallos}/${CASOS_PRUEBA_IA.length} casos correctos`);
process.exit(fallos ? 1 : 0);
