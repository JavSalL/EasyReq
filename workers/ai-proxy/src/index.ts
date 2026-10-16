import { getBearerToken, verifyFirebaseToken } from './auth';
import { consumeDailyQuota } from './quota';
import { callGemini, type GeminiOptions } from './gemini';
import {
  buildAreaPrompt,
  buildCoberturaPrompt,
  buildEvaluatePrompt,
  buildExtraerTextoPrompt,
  buildPlanPrompt,
  buildSinglePrompt,
  entradaSinSentido,
  ESTRICTEZ_POR_DEFECTO,
  interpretarEvaluacion,
  interpretarGeneracion,
  interpretarGeneracionMasiva,
  interpretarPlan,
  TEMPERATURA_ESTRICTEZ,
  type AIRequirement,
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
  DAILY_LIMIT: string;
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

async function runGemini(prompt: string, env: Env, options?: GeminiOptions): Promise<string> {
  try {
    return await callGemini(prompt, env.GEMINI_API_KEY, env.GEMINI_MODEL, options);
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
          const text = await runGemini(buildAreaPrompt(userPrompt, area, otras, opciones), env, { temperature });
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
          { temperature }
        );
        agregar(interpretarGeneracionMasiva(text, opciones.pattern).slice(0, faltantes), 'Cobertura adicional');
      } catch {
        // Sin la revisión, lo generado sigue siendo válido.
      }
    }

    return { valido: true, motivo: '', areas: plan.areas, requerimientos };
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

const ROUTES: Record<string, Handler> = {
  '/generate-single': handleGenerateSingle,
  '/generate-bulk': handleGenerateBulk,
  '/evaluate': handleEvaluate,
  '/extract-text': handleExtractText,
};

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

      const handler = ROUTES[pathname];
      if (!handler) throw new HttpError(404, 'NOT_FOUND', 'Ruta no encontrada.');
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
      const execute = handler(body);

      // 4. Cuota diaria
      const dailyLimit = Number.parseInt(env.DAILY_LIMIT, 10) || 50;
      const quota = await consumeDailyQuota(env.DB, uid, dailyLimit);
      if (!quota.allowed) {
        throw new HttpError(429, 'DAILY_LIMIT', `Alcanzaste el límite diario de ${dailyLimit} usos de IA. Vuelve mañana.`);
      }

      // 5. Gemini
      const result = await execute(env);
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
