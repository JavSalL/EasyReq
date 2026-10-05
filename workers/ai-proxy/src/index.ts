import { getBearerToken, verifyFirebaseToken } from './auth';
import { consumeDailyQuota } from './quota';
import { callGemini } from './gemini';
import {
  AIRequirement,
  buildBulkPrompt,
  buildEvaluatePrompt,
  buildSinglePrompt,
  limpiarRedaccion,
  safeJsonParse,
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
const MAX_COUNT = 20;

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

function optionalPattern(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new HttpError(400, 'INVALID_INPUT', 'El patrón debe ser texto.');
  if (value.length > MAX_PATTERN) {
    throw new HttpError(400, 'INVALID_INPUT', `El patrón supera ${MAX_PATTERN} caracteres.`);
  }
  return value;
}

function optionalCount(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_COUNT) {
    throw new HttpError(400, 'INVALID_INPUT', `La cantidad debe ser un entero entre 1 y ${MAX_COUNT}.`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Acciones de IA
// ---------------------------------------------------------------------------

async function runGemini(prompt: string, env: Env): Promise<string> {
  try {
    return await callGemini(prompt, env.GEMINI_API_KEY, env.GEMINI_MODEL);
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
  const userPrompt = requiredText(body.userPrompt, 'userPrompt');
  const pattern = optionalPattern(body.pattern);

  return async (env) => {
    const text = await runGemini(buildSinglePrompt(userPrompt, pattern), env);
    const generado = safeJsonParse<AIRequirement | null>(text, null);
    return generado && typeof generado.name === 'string'
      ? { ...generado, name: limpiarRedaccion(generado.name, pattern) }
      : generado;
  };
};

const handleGenerateBulk: Handler = (body) => {
  const projectDesc = requiredText(body.projectDesc, 'projectDesc');
  const pattern = optionalPattern(body.pattern);
  const count = optionalCount(body.count);

  return async (env) => {
    const text = await runGemini(buildBulkPrompt(projectDesc, pattern, count), env);
    const generados = safeJsonParse<AIRequirement[]>(text, []);
    return Array.isArray(generados)
      ? generados.map((r) => (r && typeof r.name === 'string' ? { ...r, name: limpiarRedaccion(r.name, pattern) } : r))
      : [];
  };
};

const handleEvaluate: Handler = (body) => {
  const requirementText = requiredText(body.requirementText, 'requirementText');
  const pattern = optionalPattern(body.pattern);

  return async (env) => {
    const text = await runGemini(buildEvaluatePrompt(requirementText, pattern), env);
    return safeJsonParse<Partial<AIRequirement>>(text, {});
  };
};

const ROUTES: Record<string, Handler> = {
  '/generate-single': handleGenerateSingle,
  '/generate-bulk': handleGenerateBulk,
  '/evaluate': handleEvaluate,
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
