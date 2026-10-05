import { auth } from "./firebase";

// Las llamadas a Gemini se hacen en un Cloudflare Worker (workers/ai-proxy).
// La key de Gemini vive allí como secreto; el navegador solo envía el ID token
// de Firebase y los parámetros. Los prompts se construyen en el Worker.
const AI_API_URL = (process.env.NEXT_PUBLIC_AI_API_URL || "").replace(/\/+$/, "");

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

/**
 * Genera requerimientos en masa basados en la descripción de un proyecto.
 */
export async function generateBulkRequirements(projectDesc: string, pattern?: string, count?: number): Promise<AIRequirement[]> {
  const result = await callAI<AIRequirement[]>('/generate-bulk', { projectDesc, pattern, count });
  return Array.isArray(result) ? result : [];
}

/**
 * Refina o genera un requerimiento específico basado en un prompt del usuario.
 */
export async function generateSingleRequirement(userPrompt: string, pattern?: string): Promise<AIRequirement | null> {
  const result = await callAI<AIRequirement | null>('/generate-single', { userPrompt, pattern });
  return result ?? null;
}

/**
 * Evalúa un requerimiento existente de forma inteligente.
 */
export async function evaluateRequirement(requirementText: string, pattern?: string): Promise<Partial<AIRequirement>> {
  const result = await callAI<Partial<AIRequirement>>('/evaluate', { requirementText, pattern });
  return result ?? {};
}
