import { getBearerToken, verifyFirebaseToken } from './auth';
import { borrarJob, consumeDailyQuota, consumirLlamadaJob, crearJob, marcarJobConResultado } from './quota';
import { callGemini, callGeminiJson, coseno, embedTexts, type GeminiOptions } from './gemini';
import {
  buildAreaPrompt,
  buildCoberturaPrompt,
  buildEvaluatePrompt,
  buildExtraerTextoPrompt,
  buildGenAreaPrompt,
  buildGenCoberturaPrompt,
  buildGenPlanPrompt,
  buildPlanPrompt,
  buildSinglePrompt,
  entradaSinSentido,
  ESQUEMA_COBERTURA,
  ESQUEMA_LISTA_REQUERIMIENTOS,
  ESQUEMA_LOTE_AREA,
  ESQUEMA_PLAN,
  ESTRICTEZ_POR_DEFECTO,
  interpretarCobertura,
  interpretarEvaluacion,
  interpretarGeneracion,
  interpretarGeneracionMasiva,
  interpretarLoteArea,
  interpretarPlan,
  interpretarPlanGeneracion,
  pareceTitulo,
  quitarCopias,
  CORRECCION_TITULOS,
  type RequerimientoIterativo,
  TEMPERATURA_ESTRICTEZ,
  type AIRequirement,
  type AlcanceGeneracion,
  type Estrictez,
  type OpcionesRedaccion,
} from './prompts';

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  // Secreto (wrangler secret put GEMINI_API_KEY / .dev.vars en local)
  GEMINI_API_KEY: string;
  // Variables (wrangler.jsonc)
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string; // separadas por comas
  GEMINI_MODEL: string;
  /** Modelo de embeddings para los duplicados por significado (KAN-40). Opcional. */
  GEMINI_EMBEDDING_MODEL?: string;
  DAILY_LIMIT: string;
  /** Corridas de generación iterativa por usuario y día (KAN-40). Opcional: 3 por defecto. */
  DAILY_JOB_LIMIT?: string;
  REQUIRE_EMAIL_VERIFIED: string; // "true" | "false"
  // Bindings
  USER_LIMITER: RateLimiter;
  DB: D1Database;
}

// Límites de tamaño de entrada para evitar prompts gigantes.
const MAX_TEXT = 2000;
const MAX_PATTERN = 1000;
const MAX_TIPO = 100;
const MAX_EJEMPLOS = 3;
const MAX_EJEMPLO = 1500;
// Contexto del proyecto (descripción + archivos de la pestaña Contexto). Gemini admite mucho más,
// pero se acota para que cada llamada siga siendo rápida y barata.
const MAX_CONTEXTO = 300_000;
// Generación masiva: límites del plan y del total devuelto.
const MAX_AREAS = 8;
const MAX_POR_AREA = 12;
const MAX_COBERTURA = 10;
const MAX_TOTAL = 60;
// Un PDF de 15 MB ocupa ~20 MB en base64, el máximo que Gemini acepta en línea.
const MAX_PDF_BASE64 = 20_000_000;
// Generación iterativa (KAN-40): cada paso es una llamada a Gemini y el cliente encadena los pasos.
const GEN_MAX_AREAS = 20;
const GEN_LOTE_MIN = 15;
const GEN_LOTE_MAX = 25;
const GEN_MAX_COBERTURA = 20;
/** Tope de llamadas a Gemini por corrida (el plan cuenta como la primera). */
const GEN_MAX_LLAMADAS_JOB = 60;
const GEN_JOBS_DIARIOS_POR_DEFECTO = 3;
// Listas que manda el cliente: lo existente y lo ya generado, en líneas compactas.
const GEN_MAX_LINEA = 700;
const GEN_MAX_GENERADOS = 800;
const GEN_MAX_EXISTENTES_AREA = 300;
const GEN_MAX_RESUMEN = 60_000;
// Tope de tokens de la respuesta: un lote de 25 requerimientos con su justificación cabe holgado.
const TOKENS_LOTE = 16_384;
// Duplicados por significado (embeddings): cuántos textos se comparan y desde qué coseno se marcan.
const GEN_MAX_EMBED_NUEVOS = 400;
const GEN_MAX_EMBED_EXISTENTES = 600;
const UMBRAL_COSENO = 0.9;

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public headers: Record<string, string> = {}) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  if (!origin || !allowedOrigins(env).includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Expose-Headers': 'Retry-After',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

// ---------------------------------------------------------------------------
// Validación de entrada
// ---------------------------------------------------------------------------

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, 'INVALID_INPUT', `El campo "${field}" es obligatorio.`);
  }
  if (value.length > MAX_TEXT) {
    throw new HttpError(400, 'INVALID_INPUT', `El campo "${field}" supera ${MAX_TEXT} caracteres.`);
  }
  return value;
}

// Texto sin significado (solo símbolos, una letra repetida...): se rechaza aquí, antes de gastar
// cuota y sin llamar a Gemini (KAN-25).
function meaningfulText(value: unknown, field: string): string {
  const text = requiredText(value, field);
  const motivo = entradaSinSentido(text);
  if (motivo) throw new HttpError(400, 'INVALID_INPUT', motivo);
  return text;
}

function optionalPattern(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new HttpError(400, 'INVALID_INPUT', 'El patrón debe ser texto.');
  if (value.length > MAX_PATTERN) {
    throw new HttpError(400, 'INVALID_INPUT', `El patrón supera ${MAX_PATTERN} caracteres.`);
  }
  return value;
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new HttpError(400, 'INVALID_INPUT', `El campo "${field}" debe ser texto.`);
  if (value.length > max) throw new HttpError(400, 'INVALID_INPUT', `El campo "${field}" supera ${max} caracteres.`);
  return value.trim() || undefined;
}

function estrictezDe(value: unknown): Estrictez {
  if (value === undefined || value === null) return ESTRICTEZ_POR_DEFECTO;
  if (value !== 1 && value !== 2 && value !== 3 && value !== 4) {
    throw new HttpError(400, 'INVALID_INPUT', 'La estrictez debe ser un entero entre 1 y 4.');
  }
  return value;
}

function ejemplosDe(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_EJEMPLOS) {
    throw new HttpError(400, 'INVALID_INPUT', `Puedes dar hasta ${MAX_EJEMPLOS} ejemplos.`);
  }
  return value
    .map((e) => optionalText(e, 'ejemplos', MAX_EJEMPLO))
    .filter((e): e is string => !!e);
}

/** Lista de textos cortos (existentes, generados, áreas...). Los vacíos se descartan. */
function listaTextos(value: unknown, field: string, maxItems: number, maxLen = GEN_MAX_LINEA): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new HttpError(400, 'INVALID_INPUT', `El campo "${field}" debe ser una lista de hasta ${maxItems} textos.`);
  }
  return value
    .map((v) => optionalText(v, field, maxLen))
    .filter((v): v is string => !!v);
}

function alcanceDe(value: unknown, admiteAuto: boolean): AlcanceGeneracion | 'auto' {
  if (value === 'sistema' || value === 'modulo') return value;
  if (admiteAuto && (value === undefined || value === null || value === 'auto')) return 'auto';
  throw new HttpError(400, 'INVALID_INPUT', 'El alcance debe ser "sistema" o "modulo".');
}

/** Opciones comunes a la generación individual y masiva. */
function opcionesRedaccion(body: Record<string, unknown>): OpcionesRedaccion {
  return {
    pattern: optionalPattern(body.pattern),
    tipo: optionalText(body.tipo, 'tipo', MAX_TIPO),
    estrictez: estrictezDe(body.estrictez),
    ejemplos: ejemplosDe(body.ejemplos),
    contexto: optionalText(body.contexto, 'contexto', MAX_CONTEXTO),
  };
}

// ---------------------------------------------------------------------------
// Acciones de IA
// ---------------------------------------------------------------------------

async function runGemini(prompt: string, env: Env, options: GeminiOptions = {}): Promise<string> {
  try {
    // Las respuestas JSON se validan y, si llegan cortadas o rotas, se piden una vez más.
    return options.responseMimeType === 'text/plain'
      ? await callGemini(prompt, env.GEMINI_API_KEY, env.GEMINI_MODEL, options)
      : await callGeminiJson(prompt, env.GEMINI_API_KEY, env.GEMINI_MODEL, options);
  } catch (err) {
    console.error('Error llamando a Gemini:', err instanceof Error ? err.message : err);
    throw new HttpError(502, 'UNAVAILABLE', 'El servicio de IA no está disponible en este momento.');
  }
}

// Cada handler valida la entrada de forma síncrona (lanza 400 si es inválida)
// y devuelve la función que hace la llamada a Gemini. Así una petición
// inválida se rechaza antes de consumir cuota.
type Executor = (env: Env) => Promise<unknown>;
type Handler = (body: Record<string, unknown>) => Executor;

/**
 * Cómo cuenta cada ruta contra la cuota:
 * - 'diaria': un uso de la cuota diaria por petición (las acciones de siempre).
 * - 'plan': crea un job de generación iterativa y consume UN uso para toda la corrida.
 * - 'job': paso de una corrida (lote de área, cobertura); exige un job válido del mismo usuario
 *   y cuenta una llamada en él, sin gastar cuota diaria.
 */
type TipoCuota = 'diaria' | 'plan' | 'job';

const handleGenerateSingle: Handler = (body) => {
  const userPrompt = meaningfulText(body.userPrompt, 'userPrompt');
  const opciones = opcionesRedaccion(body);

  return async (env) => {
    const text = await runGemini(buildSinglePrompt(userPrompt, opciones), env, {
      temperature: TEMPERATURA_ESTRICTEZ[opciones.estrictez],
    });
    return interpretarGeneracion(text, opciones.pattern);
  };
};

/** Quita espacios, mayúsculas y puntuación para detectar requerimientos repetidos. */
const claveDuplicado = (texto: string) => texto.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Generación masiva (varios requerimientos a partir de un pedido y del contexto del proyecto).
 * La IA trabaja en tres pasos: 1) decide las áreas a cubrir y cuántos requerimientos necesita
 * cada una (pocas si el pedido es de una parte concreta, muchas si es el sistema en general);
 * 2) redacta los de cada área en paralelo; 3) revisa la cobertura y añade lo que falte.
 */
const handleGenerateBulk: Handler = (body) => {
  const userPrompt = meaningfulText(body.userPrompt, 'userPrompt');
  const opciones = opcionesRedaccion(body);
  const temperature = TEMPERATURA_ESTRICTEZ[opciones.estrictez];

  return async (env) => {
    const plan = interpretarPlan(
      await runGemini(buildPlanPrompt(userPrompt, opciones, MAX_AREAS, MAX_POR_AREA), env, { temperature }),
      MAX_AREAS,
      MAX_POR_AREA
    );
    if (!plan.valido) return { valido: false, motivo: plan.motivo, areas: [], requerimientos: [] };

    const vistos = new Set<string>();
    const requerimientos: Array<AIRequirement & { area?: string }> = [];
    const agregar = (lista: AIRequirement[], area?: string) => {
      for (const r of lista) {
        const clave = claveDuplicado(r.name);
        if (!clave || vistos.has(clave) || requerimientos.length >= MAX_TOTAL) continue;
        vistos.add(clave);
        requerimientos.push({ ...r, area });
      }
    };

    // Un área que falla no tumba a las demás: se pierde solo su parte.
    const porArea = await Promise.all(
      plan.areas.map(async (area) => {
        try {
          const otras = plan.areas.filter((a) => a !== area).map((a) => a.nombre);
          const text = await runGemini(buildAreaPrompt(userPrompt, area, otras, opciones), env, {
            temperature,
            responseSchema: ESQUEMA_LISTA_REQUERIMIENTOS,
          });
          return interpretarGeneracionMasiva(text, opciones.pattern);
        } catch {
          return [];
        }
      })
    );
    porArea.forEach((lista, i) => agregar(lista, plan.areas[i].nombre));

    if (requerimientos.length === 0) {
      return { valido: false, motivo: 'La IA no encontró requerimientos que respalden el pedido. Detállalo más o agrega contexto al proyecto.', areas: plan.areas, requerimientos: [] };
    }

    // Revisión de cobertura: una pasada más que solo añade lo que falte.
    if (requerimientos.length < MAX_TOTAL) {
      try {
        const faltantes = Math.min(MAX_COBERTURA, MAX_TOTAL - requerimientos.length);
        const text = await runGemini(
          buildCoberturaPrompt(userPrompt, requerimientos.map((r) => r.name), opciones, faltantes),
          env,
          { temperature, responseSchema: ESQUEMA_LISTA_REQUERIMIENTOS }
        );
        agregar(interpretarGeneracionMasiva(text, opciones.pattern).slice(0, faltantes), 'Cobertura adicional');
      } catch {
        // Sin la revisión, lo generado sigue siendo válido.
      }
    }

    return { valido: true, motivo: '', areas: plan.areas, requerimientos };
  };
};

// ---------------------------------------------------------------------------
// Generación iterativa (KAN-40): el cliente encadena plan -> lotes por área -> cobertura
// ---------------------------------------------------------------------------

/** Texto contra el que se comprueba si una cifra del requerimiento tiene respaldo. */
const fuenteDe = (...partes: Array<string | undefined>) => partes.filter(Boolean).join('\n');

/** Paso 1: mapa de áreas. Crea el job de la corrida (lo hace la entrada principal). */
const handleGenerationPlan: Handler = (body) => {
  const userPrompt = meaningfulText(body.userPrompt, 'userPrompt');
  const alcance = alcanceDe(body.alcance, true);
  const existentes = optionalText(body.existentes, 'existentes', GEN_MAX_RESUMEN);
  const opciones = opcionesRedaccion(body);

  return async (env) => {
    const text = await runGemini(buildGenPlanPrompt(userPrompt, alcance, existentes, opciones, GEN_MAX_AREAS), env, {
      temperature: temperaturaIterativa(opciones.estrictez),
      responseSchema: ESQUEMA_PLAN,
    });
    return interpretarPlanGeneracion(text, alcance, opciones.estrictez, GEN_MAX_AREAS);
  };
};

/**
 * Temperatura de la generación iterativa: la de la estrictez, pero con tope. Aquí lo que se infiere
 * lo deciden las reglas del prompt; una temperatura alta solo traía erratas ("explirita").
 */
const temperaturaIterativa = (estrictez: Estrictez) => Math.min(TEMPERATURA_ESTRICTEZ[estrictez], 0.3);

/** A partir de esta proporción de títulos en una respuesta, se pide de nuevo. */
const PROPORCION_TITULOS_REINTENTO = 0.25;

/**
 * Pide a Gemini e interpreta; si muchos "name" son títulos en lugar de enunciados
 * ("Tipografía legible para niños"), repite una vez con una corrección. Los títulos que queden
 * se descartan: no son requerimientos que el usuario pueda registrar.
 */
async function pedirSinTitulos<T extends { requerimientos: RequerimientoIterativo[] }>(
  prompt: string,
  env: Env,
  options: GeminiOptions,
  interpretar: (text: string) => T,
  pattern?: string
): Promise<T> {
  let resultado = interpretar(await runGemini(prompt, env, options));
  const titulos = resultado.requerimientos.filter((r) => pareceTitulo(r.name, pattern)).length;
  if (resultado.requerimientos.length > 0 && titulos / resultado.requerimientos.length >= PROPORCION_TITULOS_REINTENTO) {
    const otra = interpretar(await runGemini(prompt + CORRECCION_TITULOS, env, options));
    if (otra.requerimientos.length > 0) resultado = otra;
  }
  return { ...resultado, requerimientos: resultado.requerimientos.filter((r) => !pareceTitulo(r.name, pattern)) };
}

/** Paso 2: un lote (15-25) de requerimientos de un área. */
const handleGenerationArea: Handler = (body) => {
  const userPrompt = requiredText(body.userPrompt, 'userPrompt');
  const alcance = alcanceDe(body.alcance, false) as AlcanceGeneracion;
  const areaBody = (body.area && typeof body.area === 'object' ? body.area : {}) as Record<string, unknown>;
  const nombre = optionalText(areaBody.nombre, 'area.nombre', 120);
  if (!nombre) throw new HttpError(400, 'INVALID_INPUT', 'Falta el nombre del área.');
  const area = { nombre, enfoque: optionalText(areaBody.enfoque, 'area.enfoque', 300) ?? '' };
  const lote = Math.min(GEN_LOTE_MAX, Math.max(GEN_LOTE_MIN, Math.round(Number(body.lote) || 20)));
  const entrada = {
    userPrompt,
    alcance,
    area,
    otrasAreas: listaTextos(body.otras_areas, 'otras_areas', GEN_MAX_AREAS + 10, 120),
    existentesArea: listaTextos(body.existentes_area, 'existentes_area', GEN_MAX_EXISTENTES_AREA),
    existentesResto: optionalText(body.existentes_resto, 'existentes_resto', GEN_MAX_RESUMEN),
    generados: listaTextos(body.generados, 'generados', GEN_MAX_GENERADOS),
    pendiente: listaTextos(body.pendiente, 'pendiente', 40, 200),
    lote,
  };
  const opciones = opcionesRedaccion(body);

  return async (env) => {
    const resultado = await pedirSinTitulos(
      buildGenAreaPrompt(entrada, opciones),
      env,
      { temperature: temperaturaIterativa(opciones.estrictez), responseSchema: ESQUEMA_LOTE_AREA, maxOutputTokens: TOKENS_LOTE },
      (text) => interpretarLoteArea(text, opciones, fuenteDe(userPrompt, opciones.contexto, area.enfoque), lote),
      opciones.pattern
    );
    const conocidos = [...entrada.existentesArea, ...entrada.generados, ...(entrada.existentesResto ?? '').split(/\r?\n/)];
    return { ...resultado, requerimientos: quitarCopias(resultado.requerimientos, conocidos) };
  };
};

/** Paso 3: revisión de cobertura; devuelve solo lo que falta (o una lista vacía). */
const handleGenerationCobertura: Handler = (body) => {
  const userPrompt = requiredText(body.userPrompt, 'userPrompt');
  const alcance = alcanceDe(body.alcance, false) as AlcanceGeneracion;
  const areas = listaTextos(body.areas, 'areas', GEN_MAX_AREAS + 10, 120);
  const maximo = Math.min(GEN_MAX_COBERTURA, Math.max(1, Math.round(Number(body.maximo) || GEN_MAX_COBERTURA)));
  const entrada = {
    userPrompt,
    alcance,
    areas,
    generados: listaTextos(body.generados, 'generados', GEN_MAX_GENERADOS),
    existentes: optionalText(body.existentes, 'existentes', GEN_MAX_RESUMEN),
    maximo,
  };
  const opciones = opcionesRedaccion(body);

  return async (env) => {
    const { requerimientos: faltantes } = await pedirSinTitulos(
      buildGenCoberturaPrompt(entrada, opciones),
      env,
      { temperature: temperaturaIterativa(opciones.estrictez), responseSchema: ESQUEMA_COBERTURA, maxOutputTokens: TOKENS_LOTE },
      (text) => ({ requerimientos: interpretarCobertura(text, opciones, fuenteDe(userPrompt, opciones.contexto), areas, maximo) }),
      opciones.pattern
    );
    return { requerimientos: quitarCopias(faltantes, [...entrada.generados, ...(entrada.existentes ?? '').split(/\r?\n/)]) };
  };
};

/**
 * Paso opcional: posibles duplicados por significado. Compara cada propuesta nueva con los
 * existentes y con las propuestas anteriores a ella usando embeddings; devuelve las que superan
 * el umbral del coseno. Complementa el filtro léxico del cliente, que no entiende sinónimos.
 */
const handleGenerationEmbed: Handler = (body) => {
  const nuevos = listaTextos(body.nuevos, 'nuevos', GEN_MAX_EMBED_NUEVOS);
  const existentesBody = Array.isArray(body.existentes) ? body.existentes : [];
  if (existentesBody.length > GEN_MAX_EMBED_EXISTENTES) {
    throw new HttpError(400, 'INVALID_INPUT', `Puedes comparar con hasta ${GEN_MAX_EMBED_EXISTENTES} requerimientos existentes.`);
  }
  const existentes = existentesBody
    .map((e) => (e && typeof e === 'object' ? (e as Record<string, unknown>) : {}))
    .map((e) => ({ etiqueta: optionalText(e.etiqueta, 'existentes.etiqueta', 40), texto: optionalText(e.texto, 'existentes.texto', GEN_MAX_LINEA) }))
    .filter((e): e is { etiqueta: string; texto: string } => !!e.etiqueta && !!e.texto);

  return async (env) => {
    if (nuevos.length === 0) return { duplicados: [] };
    let vectores: number[][];
    try {
      vectores = await embedTexts([...existentes.map((e) => e.texto), ...nuevos], env.GEMINI_API_KEY, env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001');
    } catch (err) {
      console.error('Error llamando a Gemini (embeddings):', err instanceof Error ? err.message : err);
      throw new HttpError(502, 'UNAVAILABLE', 'El servicio de IA no está disponible en este momento.');
    }
    const vExistentes = vectores.slice(0, existentes.length);
    const vNuevos = vectores.slice(existentes.length);

    const duplicados: Array<{ indice: number; etiqueta: string; similitud: number }> = [];
    vNuevos.forEach((v, i) => {
      let mejor = { etiqueta: '', similitud: 0 };
      vExistentes.forEach((w, j) => {
        const s = coseno(v, w);
        if (s > mejor.similitud) mejor = { etiqueta: existentes[j].etiqueta, similitud: s };
      });
      // Contra las propuestas anteriores de la misma lista: la primera se queda, la otra se marca.
      for (let j = 0; j < i; j++) {
        const s = coseno(v, vNuevos[j]);
        if (s > mejor.similitud) mejor = { etiqueta: `#${j}`, similitud: s };
      }
      if (mejor.similitud >= UMBRAL_COSENO) duplicados.push({ indice: i, ...mejor, similitud: Math.round(mejor.similitud * 1000) / 1000 });
    });
    return { duplicados };
  };
};

const handleEvaluate: Handler = (body) => {
  const requirementText = requiredText(body.requirementText, 'requirementText');
  const pattern = optionalPattern(body.pattern);

  return async (env) => {
    const text = await runGemini(buildEvaluatePrompt(requirementText, pattern), env);
    return interpretarEvaluacion(text);
  };
};

/** Extrae el texto de un PDF para usarlo como contexto del proyecto. */
const handleExtractText: Handler = (body) => {
  if (body.mimeType !== 'application/pdf') {
    throw new HttpError(400, 'INVALID_INPUT', 'Solo se puede extraer texto de archivos PDF.');
  }
  const data = body.data;
  if (typeof data !== 'string' || data.length === 0 || !/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 1000))) {
    throw new HttpError(400, 'INVALID_INPUT', 'El archivo debe enviarse en base64.');
  }
  if (data.length > MAX_PDF_BASE64) {
    throw new HttpError(400, 'INVALID_INPUT', 'El PDF es demasiado grande para extraer su texto.');
  }

  return async (env) => {
    const texto = await runGemini(buildExtraerTextoPrompt(), env, {
      temperature: 0,
      responseMimeType: 'text/plain',
      inlineData: { mimeType: 'application/pdf', data },
    });
    return { texto: texto.trim() };
  };
};

// `generaResultado`: un paso que termina bien hace que la corrida cuente para el tope diario de corridas.
const ROUTES: Record<string, { handler: Handler; cuota: TipoCuota; generaResultado?: boolean }> = {
  '/generate-single': { handler: handleGenerateSingle, cuota: 'diaria' },
  '/generate-bulk': { handler: handleGenerateBulk, cuota: 'diaria' },
  '/evaluate': { handler: handleEvaluate, cuota: 'diaria' },
  '/extract-text': { handler: handleExtractText, cuota: 'diaria' },
  '/generation/plan': { handler: handleGenerationPlan, cuota: 'plan' },
  '/generation/area': { handler: handleGenerationArea, cuota: 'job', generaResultado: true },
  '/generation/cobertura': { handler: handleGenerationCobertura, cuota: 'job' },
  '/generation/embed': { handler: handleGenerationEmbed, cuota: 'job' },
};

const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Consume un uso de la cuota diaria o lanza 429. */
async function consumirCuotaDiaria(env: Env, uid: string): Promise<void> {
  const dailyLimit = Number.parseInt(env.DAILY_LIMIT, 10) || 50;
  const quota = await consumeDailyQuota(env.DB, uid, dailyLimit);
  if (!quota.allowed) {
    throw new HttpError(429, 'DAILY_LIMIT', `Alcanzaste el límite diario de ${dailyLimit} usos de IA. Vuelve mañana.`);
  }
}

/**
 * Ejecuta una ruta según cómo cuenta contra la cuota. En las de generación iterativa la respuesta
 * lleva el id del job y las llamadas que le quedan, para que el cliente reparta el presupuesto.
 */
async function ejecutarConCuota(cuota: TipoCuota, execute: Executor, body: Record<string, unknown>, uid: string, env: Env, generaResultado = false): Promise<unknown> {
  if (cuota === 'diaria') {
    await consumirCuotaDiaria(env, uid);
    return execute(env);
  }

  if (cuota === 'plan') {
    const jobsDiarios = Number.parseInt(env.DAILY_JOB_LIMIT ?? '', 10) || GEN_JOBS_DIARIOS_POR_DEFECTO;
    const jobId = await crearJob(env.DB, uid, jobsDiarios);
    if (!jobId) {
      throw new HttpError(429, 'DAILY_LIMIT', `Alcanzaste el límite de ${jobsDiarios} generaciones completas por día. Vuelve mañana.`);
    }
    try {
      await consumirCuotaDiaria(env, uid);
      const result = (await execute(env)) as { valido?: boolean };
      // Un plan rechazado no deja un job abierto (el uso diario sí se gastó, como en el resto).
      if (result?.valido === false) {
        await borrarJob(env.DB, jobId, uid);
        return result;
      }
      return { ...result, job_id: jobId, llamadas_restantes: GEN_MAX_LLAMADAS_JOB - 1 };
    } catch (err) {
      await borrarJob(env.DB, jobId, uid).catch(() => {});
      throw err;
    }
  }

  const jobId = body.job_id;
  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) {
    throw new HttpError(400, 'INVALID_INPUT', 'Falta el identificador de la generación (job_id).');
  }
  const job = await consumirLlamadaJob(env.DB, jobId, uid, GEN_MAX_LLAMADAS_JOB);
  if (!job.ok) {
    throw job.motivo === 'AGOTADO'
      ? new HttpError(429, 'JOB_LIMIT', `Esta generación ya usó sus ${GEN_MAX_LLAMADAS_JOB} llamadas a la IA. Revisa lo generado o inicia otra.`)
      : new HttpError(403, 'JOB_INVALID', 'La generación caducó o no es tuya. Iníciala de nuevo.');
  }
  const result = (await execute(env)) as Record<string, unknown>;
  if (generaResultado) await marcarJobConResultado(env.DB, jobId);
  return { ...result, llamadas_restantes: GEN_MAX_LLAMADAS_JOB - job.llamadas };
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);
    const { pathname } = new URL(request.url);

    // Preflight de CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: Object.keys(cors).length ? 204 : 403, headers: cors });
    }

    try {
      // Un navegador desde un origen no permitido se rechaza. Las llamadas sin
      // Origin (curl, scripts) siguen necesitando un token válido.
      if (origin && !Object.keys(cors).length) {
        throw new HttpError(403, 'FORBIDDEN_ORIGIN', 'Origen no permitido.');
      }

      const route = ROUTES[pathname];
      if (!route) throw new HttpError(404, 'NOT_FOUND', 'Ruta no encontrada.');
      if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Usa POST.');

      // 1. Sesión
      const token = getBearerToken(request);
      if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Debes iniciar sesión para usar la IA.');

      let uid: string;
      try {
        const user = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        if (env.REQUIRE_EMAIL_VERIFIED === 'true' && !user.emailVerified) {
          throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Verifica tu correo para usar la IA.');
        }
        uid = user.uid;
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(401, 'UNAUTHENTICATED', 'Sesión inválida o expirada. Vuelve a iniciar sesión.');
      }

      // 2. Límite de ráfagas (por minuto)
      const { success } = await env.USER_LIMITER.limit({ key: uid });
      if (!success) {
        throw new HttpError(429, 'RATE_LIMITED', 'Demasiadas peticiones seguidas. Espera un minuto.', { 'Retry-After': '60' });
      }

      // 3. Cuerpo de la petición (se valida antes de gastar cuota)
      let body: Record<string, unknown>;
      try {
        const parsed = await request.json();
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        body = parsed as Record<string, unknown>;
      } catch {
        throw new HttpError(400, 'INVALID_INPUT', 'El cuerpo debe ser un objeto JSON.');
      }
      const execute = route.handler(body);

      // 4. Cuota (diaria, o del job en la generación iterativa) y 5. Gemini
      const result = await ejecutarConCuota(route.cuota, execute, body, uid, env, route.generaResultado);
      return json({ data: result }, 200, cors);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: { code: err.code, message: err.message } }, err.status, { ...cors, ...err.headers });
      }
      console.error('Error inesperado:', err instanceof Error ? err.message : err);
      return json({ error: { code: 'INTERNAL', message: 'Error interno.' } }, 500, cors);
    }
  },
} satisfies ExportedHandler<Env>;
