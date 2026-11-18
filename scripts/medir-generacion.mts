/**
 * KAN-47: corrida completa de la generación iterativa contra Gemini, midiendo lo que cuesta.
 *
 * Repite el recorrido del cliente (`correrIterativo` en lib/ai-actions.ts) con los prompts e
 * intérpretes del Worker: plan, lotes por área hasta darla por cubierta, cobertura y duplicados por
 * significado, con los mismos topes (60 llamadas, 8 lotes por área, 400 propuestas). Llama a Gemini
 * directamente (sin el Worker ni Firebase) y espaciando las llamadas 6 s, como el límite de 10 por
 * minuto del Worker. Guarda en scripts/resultados/ un JSON con todo y un resumen en Markdown.
 *
 * Uso:
 *   node --experimental-strip-types scripts/medir-generacion.mts <id> "<pedido>" [estrictez] [archivo de contexto]
 * Necesita GEMINI_API_KEY (entorno, workers/ai-proxy/.dev.vars o .env.local) y consume su cuota.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

function leerClave(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  for (const archivo of ['workers/ai-proxy/.dev.vars', '.env.local']) {
    try {
      for (const linea of readFileSync(archivo, 'utf-8').split(/\r?\n/)) {
        const m = linea.match(/^\s*GEMINI_API_KEY\s*=\s*(.*?)\s*$/);
        if (m && m[1]) return m[1].replace(/^["']|["']$/g, '');
      }
    } catch {
      // siguiente archivo
    }
  }
  console.error('Falta GEMINI_API_KEY.');
  process.exit(1);
}
const leerModelo = () => readFileSync('workers/ai-proxy/wrangler.jsonc', 'utf-8').match(/"GEMINI_MODEL"\s*:\s*"([^"]+)"/)?.[1] ?? 'gemini-3.5-flash-lite';

const { callGeminiJson, embedTexts, coseno } = await import('../workers/ai-proxy/src/gemini.ts');
const prompts = await import('../workers/ai-proxy/src/prompts.ts');
const { IndiceDuplicados, clasificarDuplicado, similitud } = await import('../lib/dedup-requerimientos.ts');
const { fragmentosRelevantes, UMBRAL_CONTEXTO_RESUMIDO } = await import('../lib/contexto-ia.ts');

const [id = 'corrida', pedido = '', estrictezArg = '2', archivoContexto] = process.argv.slice(2);
if (!pedido) {
  console.error('Uso: medir-generacion.mts <id> "<pedido>" [estrictez] [archivo de contexto]');
  process.exit(1);
}
const estrictez = Math.min(4, Math.max(1, Number(estrictezArg) || 2)) as 1 | 2 | 3 | 4;
const contexto = archivoContexto ? readFileSync(archivoContexto, 'utf-8').slice(0, 300_000) : undefined;
const clave = leerClave();
const modelo = leerModelo();

// Mismos topes que el cliente y el Worker
const MAX_LLAMADAS = 60;
const LOTE = 20;
const MAX_LOTES_POR_AREA = 8;
const MAX_PROPUESTAS = 400;
const MIN_NUEVAS_POR_LOTE = 3;
const MAX_LOTES_FLOJOS = 2;
const MAX_RONDAS_COBERTURA = 3;
const RESERVA_COBERTURA = 4;
const PAUSA_MS = 6_000; // 10 por minuto, como USER_LIMITER

type Paso = { tipo: 'plan' | 'area' | 'cobertura' | 'embed'; area?: string; lote?: number; ms: number; llamadasGemini: number; entrada: number; salida: number; recibidas?: number; nuevas?: number; descartadas?: number; titulosQuitados?: number; error?: string };
const pasos: Paso[] = [];
let llamadasJob = 0;
let ultimaLlamada = 0;
const inicio = Date.now();

async function pedir(prompt: string, options: Record<string, unknown>, paso: Paso): Promise<string> {
  const espera = ultimaLlamada + PAUSA_MS - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaLlamada = Date.now();
  return callGeminiJson(prompt, clave, modelo, {
    ...options,
    alUsar: (uso: { entrada: number; salida: number }) => {
      paso.llamadasGemini++;
      paso.entrada += uso.entrada;
      paso.salida += uso.salida;
    }
  });
}

const opciones = { estrictez, ejemplos: [] as string[], contexto };
const temperature = Math.min(prompts.TEMPERATURA_ESTRICTEZ[estrictez], 0.3);
const pedirResumen = !!contexto && contexto.length > UMBRAL_CONTEXTO_RESUMIDO;

// 1. Plan
const pasoPlan: Paso = { tipo: 'plan', ms: 0, llamadasGemini: 0, entrada: 0, salida: 0 };
let t = Date.now();
const plan = prompts.interpretarPlanGeneracion(
  await pedir(prompts.buildGenPlanPrompt(pedido, 'auto', undefined, opciones, 20, pedirResumen), { temperature, responseSchema: prompts.ESQUEMA_PLAN }, pasoPlan),
  'auto',
  estrictez,
  20
);
pasoPlan.ms = Date.now() - t;
pasos.push(pasoPlan);
llamadasJob = 1;
if (!plan.valido) {
  console.error('Plan rechazado:', plan.motivo);
  process.exit(1);
}
console.log(`Plan (${plan.alcance}): ${plan.areas.length} áreas: ${plan.areas.map((a) => a.nombre).join(', ')}`);

// 2. Lotes por área (en rondas, como el cliente)
type Propuesta = { name: string; area: string; origen: string; prioridad: string; lote: number; posible?: { etiqueta: string; texto: string; similitud: number }; cifras?: string[] };
const propuestas: Propuesta[] = [];
const indice = new IndiceDuplicados();
const estado = plan.areas.map(() => ({ lotes: 0, flojos: 0, pendiente: [] as string[], terminada: false, motivo: '' }));
const nombres = plan.areas.map((a) => a.nombre);
const opcionesLote = (area: (typeof plan.areas)[number], pendiente: string[]) => {
  if (!contexto || contexto.length <= UMBRAL_CONTEXTO_RESUMIDO) return { opc: opciones, resumen: undefined };
  return { opc: { ...opciones, contexto: fragmentosRelevantes(contexto, { ...area, pendiente }, plan.resumen_contexto ? undefined : UMBRAL_CONTEXTO_RESUMIDO) }, resumen: plan.resumen_contexto };
};

let limite = false;
while (estado.some((e) => !e.terminada)) {
  for (let i = 0; i < plan.areas.length; i++) {
    const e = estado[i];
    const area = plan.areas[i];
    if (e.terminada) continue;
    if (MAX_LLAMADAS - llamadasJob <= RESERVA_COBERTURA || propuestas.length >= MAX_PROPUESTAS) {
      e.terminada = true;
      e.motivo = 'tope de la corrida';
      limite = true;
      continue;
    }
    llamadasJob++;
    const paso: Paso = { tipo: 'area', area: area.nombre, lote: e.lotes + 1, ms: 0, llamadasGemini: 0, entrada: 0, salida: 0 };
    t = Date.now();
    try {
      const { opc, resumen } = opcionesLote(area, e.pendiente);
      const entrada = {
        userPrompt: pedido,
        alcance: plan.alcance,
        area,
        otrasAreas: nombres.filter((n) => n !== area.nombre),
        existentesArea: [],
        generados: propuestas.filter((p) => p.area === area.nombre).map((p) => p.name),
        pendiente: e.pendiente,
        lote: Math.min(LOTE, MAX_PROPUESTAS - propuestas.length),
        resumenContexto: resumen
      };
      const prompt = prompts.buildGenAreaPrompt(entrada, opc);
      const opts = { temperature, responseSchema: prompts.esquemaLoteArea(undefined), maxOutputTokens: 16_384 };
      const fuente = [pedido, resumen, opc.contexto, area.enfoque].filter(Boolean).join('\n');
      let lote = prompts.interpretarLoteArea(await pedir(prompt, opts, paso), opc, fuente, entrada.lote);
      const titulos = lote.requerimientos.filter((r) => prompts.pareceTitulo(r.name)).length;
      if (lote.requerimientos.length && titulos / lote.requerimientos.length >= 0.25) {
        const otra = prompts.interpretarLoteArea(await pedir(prompt + prompts.CORRECCION_TITULOS, opts, paso), opc, fuente, entrada.lote);
        if (otra.requerimientos.length) lote = otra;
      }
      const sinTitulos = lote.requerimientos.filter((r) => !prompts.pareceTitulo(r.name));
      paso.titulosQuitados = lote.requerimientos.length - sinTitulos.length;
      const candidatas = prompts.quitarCopias(sinTitulos, entrada.generados);
      paso.recibidas = lote.requerimientos.length;
      let nuevas = 0;
      let descartadas = lote.requerimientos.length - candidatas.length - paso.titulosQuitados;
      for (const c of candidatas) {
        if (propuestas.length >= MAX_PROPUESTAS) break;
        const v = clasificarDuplicado(indice, c.name);
        if (v.tipo === 'duplicado') {
          descartadas++;
          continue;
        }
        indice.agregar(c.name, `otra propuesta (${area.nombre})`);
        propuestas.push({ name: c.name, area: area.nombre, origen: c.origen, prioridad: c.prioridad, lote: e.lotes + 1, ...(v.tipo === 'posible' ? { posible: v.de } : {}), ...(c.cifras_sin_respaldo?.length ? { cifras: c.cifras_sin_respaldo } : {}) });
        nuevas++;
      }
      paso.nuevas = nuevas;
      paso.descartadas = descartadas;
      e.lotes++;
      e.pendiente = lote.pendiente;
      e.flojos = nuevas < MIN_NUEVAS_POR_LOTE ? e.flojos + 1 : 0;
      if (lote.completo) [e.terminada, e.motivo] = [true, 'la IA la dio por completa'];
      else if (e.flojos >= MAX_LOTES_FLOJOS) [e.terminada, e.motivo] = [true, 'dos lotes seguidos con menos de 3 nuevas'];
      else if (e.lotes >= MAX_LOTES_POR_AREA) [e.terminada, e.motivo] = [true, 'tope de 8 lotes'];
    } catch (err) {
      paso.error = err instanceof Error ? err.message.slice(0, 200) : String(err);
      e.terminada = true;
      e.motivo = 'error';
    }
    paso.ms = Date.now() - t;
    pasos.push(paso);
    console.log(`  ${area.nombre} lote ${paso.lote}: ${paso.recibidas ?? 0} recibidas, ${paso.nuevas ?? 0} nuevas, ${paso.descartadas ?? 0} descartadas${paso.error ? ` (error: ${paso.error})` : ''}`);
  }
}

// 3. Cobertura
for (let ronda = 0; ronda < MAX_RONDAS_COBERTURA; ronda++) {
  if (MAX_LLAMADAS - llamadasJob <= 1 || propuestas.length >= MAX_PROPUESTAS) break;
  llamadasJob++;
  const paso: Paso = { tipo: 'cobertura', lote: ronda + 1, ms: 0, llamadasGemini: 0, entrada: 0, salida: 0 };
  t = Date.now();
  try {
    const maximo = Math.min(20, MAX_PROPUESTAS - propuestas.length);
    const entrada = { userPrompt: pedido, alcance: plan.alcance, areas: nombres, generados: propuestas.map((p) => `${p.area} | ${p.name.slice(0, 300)}`), maximo };
    const lista = prompts.interpretarCobertura(
      await pedir(prompts.buildGenCoberturaPrompt(entrada, opciones), { temperature, responseSchema: prompts.esquemaCobertura(undefined), maxOutputTokens: 16_384 }, paso),
      opciones,
      [pedido, contexto].filter(Boolean).join('\n'),
      nombres,
      maximo
    ).filter((r) => !prompts.pareceTitulo(r.name));
    const candidatas = prompts.quitarCopias(lista, entrada.generados);
    let nuevas = 0;
    for (const c of candidatas) {
      const v = clasificarDuplicado(indice, c.name);
      if (v.tipo === 'duplicado') continue;
      indice.agregar(c.name, `otra propuesta (${c.area ?? 'Otros'})`);
      propuestas.push({ name: c.name, area: c.area ?? 'Otros', origen: c.origen, prioridad: c.prioridad, lote: 0, ...(v.tipo === 'posible' ? { posible: v.de } : {}) });
      nuevas++;
    }
    paso.recibidas = lista.length;
    paso.nuevas = nuevas;
    paso.ms = Date.now() - t;
    pasos.push(paso);
    console.log(`  Cobertura ${ronda + 1}: ${lista.length} recibidas, ${nuevas} nuevas`);
    if (nuevas === 0) break;
  } catch (err) {
    paso.error = err instanceof Error ? err.message.slice(0, 200) : String(err);
    pasos.push(paso);
    break;
  }
}

// 4. Duplicados por significado: se guardan los mejores parecidos para revisar los umbrales a mano
const pasoEmbed: Paso = { tipo: 'embed', ms: 0, llamadasGemini: 0, entrada: 0, salida: 0 };
t = Date.now();
llamadasJob++;
type Par = { a: number; b: number; coseno: number; lexico: number };
const pares: Par[] = [];
try {
  const vectores = await embedTexts(propuestas.map((p) => p.name), clave, 'gemini-embedding-001');
  pasoEmbed.llamadasGemini = Math.ceil(propuestas.length / 100);
  vectores.forEach((v, i) => {
    let mejor = { b: -1, coseno: 0 };
    for (let j = 0; j < i; j++) {
      const c = coseno(v, vectores[j]);
      if (c > mejor.coseno) mejor = { b: j, coseno: c };
    }
    if (mejor.b >= 0) pares.push({ a: i, b: mejor.b, coseno: Math.round(mejor.coseno * 1000) / 1000, lexico: Math.round(similitud(propuestas[i].name, propuestas[mejor.b].name) * 1000) / 1000 });
  });
} catch (err) {
  pasoEmbed.error = err instanceof Error ? err.message.slice(0, 200) : String(err);
}
pasoEmbed.ms = Date.now() - t;
pasos.push(pasoEmbed);

// Resumen
const duracionS = Math.round((Date.now() - inicio) / 1000);
const suma = (tipo?: Paso['tipo']) => pasos.filter((p) => !tipo || p.tipo === tipo).reduce((acc, p) => ({ llamadas: acc.llamadas + p.llamadasGemini, entrada: acc.entrada + p.entrada, salida: acc.salida + p.salida }), { llamadas: 0, entrada: 0, salida: 0 });
const porLote = new Map<number, { nuevas: number; descartadas: number; pasos: number }>();
for (const p of pasos.filter((x) => x.tipo === 'area')) {
  const r = porLote.get(p.lote!) ?? { nuevas: 0, descartadas: 0, pasos: 0 };
  r.nuevas += p.nuevas ?? 0;
  r.descartadas += p.descartadas ?? 0;
  r.pasos++;
  porLote.set(p.lote!, r);
}
const umbrales = [0.85, 0.88, 0.9, 0.92, 0.95].map((u) => ({ umbral: u, marcadas: pares.filter((p) => p.coseno >= u).length }));
const lexicos = [0.5, 0.6, 0.7, 0.85].map((u) => ({ umbral: u, marcadas: propuestas.filter((p) => p.posible && p.posible.similitud >= u).length }));
const resultado = {
  id,
  fecha: new Date().toISOString(),
  modelo,
  pedido,
  estrictez,
  contextoCaracteres: contexto?.length ?? 0,
  resumenContexto: plan.resumen_contexto ?? null,
  areas: plan.areas.map((a, i) => ({ ...a, lotes: estado[i].lotes, motivoFin: estado[i].motivo, propuestas: propuestas.filter((p) => p.area === a.nombre).length })),
  llamadasDelJob: llamadasJob,
  topeAlcanzado: limite,
  duracionSegundos: duracionS,
  tokens: { total: suma(), plan: suma('plan'), lotes: suma('area'), cobertura: suma('cobertura') },
  propuestas: propuestas.length,
  inferidas: propuestas.filter((p) => p.origen === 'inferido').length,
  conCifrasSinRespaldo: propuestas.filter((p) => p.cifras).length,
  posiblesDuplicadosLexicos: lexicos,
  duplicadosSemanticosPorUmbral: umbrales,
  porNumeroDeLote: [...porLote.entries()].sort((a, b) => a[0] - b[0]).map(([lote, r]) => ({ lote, ...r })),
  pasos,
  paresMasParecidos: pares.sort((x, y) => y.coseno - x.coseno).slice(0, 40).map((p) => ({ coseno: p.coseno, lexico: p.lexico, a: propuestas[p.a].name, b: propuestas[p.b].name, areas: [propuestas[p.a].area, propuestas[p.b].area] })),
  posiblesLexicos: propuestas.filter((p) => p.posible).map((p) => ({ similitud: Math.round(p.posible!.similitud * 1000) / 1000, a: p.name, b: p.posible!.texto })),
  listado: propuestas
};
mkdirSync('scripts/resultados', { recursive: true });
writeFileSync(`scripts/resultados/${id}.json`, JSON.stringify(resultado, null, 2));
console.log(JSON.stringify({ ...resultado, pasos: undefined, paresMasParecidos: undefined, posiblesLexicos: undefined, listado: undefined, resumenContexto: undefined }, null, 2));
