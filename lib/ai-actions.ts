import { auth } from "./firebase";

// Las llamadas a Gemini se hacen en un Cloudflare Worker (workers/ai-proxy).
// La key de Gemini vive allí como secreto; el navegador solo envía el ID token
// de Firebase y los parámetros. Los prompts se construyen en el Worker.
// La URL del Worker es pública (no es un secreto): se usa la desplegada en Cloudflare y
// NEXT_PUBLIC_AI_API_URL solo hace falta para apuntar a otro Worker (p. ej. uno local).
const AI_API_URL_POR_DEFECTO = "https://easyreq-ai.easy-req.workers.dev";
const AI_API_URL = (process.env.NEXT_PUBLIC_AI_API_URL || AI_API_URL_POR_DEFECTO).replace(/\/+$/, "");

export interface AIRequirement {
  name: string;
  type_furps: 'Functionality' | 'Usability' | 'Reliability' | 'Performance' | 'Supportability';
  ai_evaluation: {
    actor: boolean;
    accion: boolean;
    objeto: boolean;
    datos_entrada: boolean;
    resultado: boolean;
  };
  ai_observations?: string;
  /** false cuando la entrada no da base para un requerimiento; entonces `motivo` explica qué falta. */
  valido?: boolean;
  motivo?: string;
}

export type AIErrorCode =
  | 'UNAUTHENTICATED'
  | 'EMAIL_NOT_VERIFIED'
  | 'RATE_LIMITED'
  | 'DAILY_LIMIT'
  | 'INVALID_INPUT'
  | 'UNAVAILABLE';

/** Error del servicio de IA con un mensaje apto para mostrar al usuario. */
export class AIError extends Error {
  constructor(public code: AIErrorCode, message: string) {
    super(message);
    this.name = 'AIError';
  }
}

/**
 * Llama a un endpoint del Worker de IA con el ID token del usuario actual.
 * Lanza `AIError` si no hay sesión, si se superó el límite o si el servicio falla.
 */
async function callAI<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!AI_API_URL) {
    console.error('[EasyReq] Falta NEXT_PUBLIC_AI_API_URL en .env.local');
    throw new AIError('UNAVAILABLE', 'El servicio de IA no está configurado.');
  }

  const user = auth.currentUser;
  if (!user) {
    throw new AIError('UNAUTHENTICATED', 'Debes iniciar sesión para usar la IA.');
  }
  const token = await user.getIdToken();

  let res: Response;
  try {
    res = await fetch(`${AI_API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AIError('UNAVAILABLE', 'No se pudo conectar con el servicio de IA. Inténtalo de nuevo.');
  }

  const payload = await res.json().catch(() => null) as
    | { data?: T; error?: { code?: string; message?: string } }
    | null;

  if (!res.ok) {
    const code = (payload?.error?.code ?? 'UNAVAILABLE') as AIErrorCode;
    const message = payload?.error?.message ?? 'El servicio de IA no está disponible en este momento.';
    throw new AIError(code, message);
  }

  return payload?.data as T;
}

/** Qué tan estricta es la IA al redactar: 1 flexible ... 4 literal. 3 es el valor por defecto. */
export type Estrictez = 1 | 2 | 3 | 4;

export const NIVELES_ESTRICTEZ: Record<Estrictez, { nombre: string; descripcion: string }> = {
  1: { nombre: 'Baja', descripcion: 'Completa con detalles habituales del dominio cuando el texto no los da.' },
  2: { nombre: 'Media', descripcion: 'Deduce lo implícito del texto y del contexto, sin inventar cifras.' },
  3: { nombre: 'Alta', descripcion: 'Solo usa lo que escribiste; lo que falte queda «(por definir)».' },
  4: { nombre: 'Máxima', descripcion: 'Literal: si falta actor, acción u objeto, no lo redacta.' }
};

export const ESTRICTEZ_POR_DEFECTO: Estrictez = 3;

/** Opciones de redacción comunes a la generación individual y masiva. */
export interface OpcionesGeneracion {
  /** Estructura del patrón elegido. */
  pattern?: string;
  /** Nombre del tipo de requerimiento elegido (p. ej. "Confiabilidad"). */
  tipo?: string;
  estrictez?: Estrictez;
  /** Hasta 3 ejemplos en los que se basa la IA (few-shot). */
  ejemplos?: string[];
  /** Contexto del proyecto (descripción y archivos), ya unido en texto. */
  contexto?: string;
}

export interface ResultadoMasivo {
  valido: boolean;
  motivo?: string;
  areas: Array<{ nombre: string; enfoque: string; cantidad: number }>;
  requerimientos: Array<AIRequirement & { area?: string }>;
}

const cuerpoOpciones = (o: OpcionesGeneracion) => ({
  pattern: o.pattern || undefined,
  tipo: o.tipo || undefined,
  estrictez: o.estrictez ?? ESTRICTEZ_POR_DEFECTO,
  ejemplos: (o.ejemplos ?? []).map(e => e.trim()).filter(Boolean),
  contexto: o.contexto?.trim() || undefined
});

/**
 * Genera varios requerimientos a partir de un pedido y del contexto del proyecto. La IA decide
 * cuántos según el alcance del pedido (una parte del sistema o el sistema completo).
 */
export async function generateBulkRequirements(userPrompt: string, opciones: OpcionesGeneracion = {}): Promise<ResultadoMasivo> {
  const result = await callAI<ResultadoMasivo>('/generate-bulk', { userPrompt, ...cuerpoOpciones(opciones) });
  return {
    valido: result?.valido !== false,
    motivo: result?.motivo,
    areas: Array.isArray(result?.areas) ? result.areas : [],
    requerimientos: Array.isArray(result?.requerimientos) ? result.requerimientos : []
  };
}

/**
 * Genera un requerimiento a partir del texto del usuario.
 */
export async function generateSingleRequirement(userPrompt: string, opciones: OpcionesGeneracion = {}): Promise<AIRequirement | null> {
  const result = await callAI<AIRequirement | null>('/generate-single', { userPrompt, ...cuerpoOpciones(opciones) });
  return result ?? null;
}

/** Extrae el texto de un PDF (en base64) para usarlo como contexto del proyecto. */
export async function extraerTextoPdf(base64: string): Promise<string> {
  const result = await callAI<{ texto?: string }>('/extract-text', { mimeType: 'application/pdf', data: base64 });
  return result?.texto ?? '';
}

/**
 * Evalúa un requerimiento existente de forma inteligente.
 */
export async function evaluateRequirement(requirementText: string, pattern?: string): Promise<Partial<AIRequirement>> {
  const result = await callAI<Partial<AIRequirement>>('/evaluate', { requirementText, pattern });
  return result ?? {};
}
