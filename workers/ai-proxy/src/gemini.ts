export interface GeminiOptions {
  /** 0 = lo más literal posible. Por defecto 0.2 (KAN-25: fidelidad al texto del usuario). */
  temperature?: number;
  /** `application/json` por defecto; `text/plain` para la extracción de texto de documentos. */
  responseMimeType?: 'application/json' | 'text/plain';
  /** Archivo que acompaña al prompt (p. ej. un PDF en base64 para extraer su texto). */
  inlineData?: { mimeType: string; data: string };
  /** Tope de tokens de la respuesta. Sin tope, una lista larga podía cortarse a medias sin aviso. */
  maxOutputTokens?: number;
  /** Esquema (subconjunto de OpenAPI que admite Gemini) que debe cumplir la respuesta JSON. */
  responseSchema?: Record<string, unknown>;
  /**
   * Se llama después de cada petición a Gemini (también la del reintento) con los tokens que
   * reportó `usageMetadata` (KAN-43). Sirve para registrar el gasto y el contador global.
   */
  alUsar?: (uso: UsoTokens) => void | Promise<void>;
}

/** Tokens de una petición según `usageMetadata` de Gemini. */
export interface UsoTokens {
  entrada: number;
  salida: number;
  total: number;
}

/** Tope por defecto: holgado para un lote de requerimientos, pero evita respuestas sin fin. */
export const MAX_OUTPUT_TOKENS_POR_DEFECTO = 8192;

interface RespuestaGemini {
  texto: string;
  /** `MAX_TOKENS` indica que la respuesta se cortó por el tope de tokens. */
  finishReason?: string;
  uso: UsoTokens;
}

interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

/** Normaliza `usageMetadata`; los razonamientos (thoughts) se cobran como salida. */
export function usoDe(meta: UsageMetadata | undefined): UsoTokens {
  const entrada = Number(meta?.promptTokenCount) || 0;
  const salida = (Number(meta?.candidatesTokenCount) || 0) + (Number(meta?.thoughtsTokenCount) || 0);
  const total = Number(meta?.totalTokenCount) || entrada + salida;
  return { entrada, salida, total };
}

async function solicitarGemini(prompt: string, apiKey: string, model: string, options: GeminiOptions): Promise<RespuestaGemini> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const parts: Array<Record<string, unknown>> = [];
  if (options.inlineData) parts.push({ inline_data: { mime_type: options.inlineData.mimeType, data: options.inlineData.data } });
  parts.push({ text: prompt });

  const responseMimeType = options.responseMimeType ?? 'application/json';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      // temperature baja por defecto: se busca fidelidad al texto del usuario, no creatividad (KAN-25).
      // El nivel de estrictez elegido por el usuario la ajusta.
      generationConfig: {
        responseMimeType,
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxOutputTokens ?? MAX_OUTPUT_TOKENS_POR_DEFECTO,
        ...(options.responseSchema && responseMimeType === 'application/json' ? { responseSchema: options.responseSchema } : {}),
      },
    }),
  });

  if (!res.ok) {
    // Solo se registra el estado y el cuerpo de error de Gemini, nunca la key.
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini respondió ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: UsageMetadata;
  };

  const candidato = data.candidates?.[0];
  const uso = usoDe(data.usageMetadata);
  // Un fallo al registrar el gasto no debe tumbar la respuesta.
  try {
    await options.alUsar?.(uso);
  } catch (err) {
    console.error('No se pudo registrar el uso de tokens:', err instanceof Error ? err.message : err);
  }
  return {
    texto: (candidato?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
    finishReason: candidato?.finishReason,
    uso,
  };
}

/**
 * Llamada a la API REST de Gemini (sin SDK, para no depender de librerías
 * que puedan no ser compatibles con el runtime de Workers).
 * Devuelve el texto de la respuesta del modelo.
 */
export async function callGemini(prompt: string, apiKey: string, model: string, options: GeminiOptions = {}): Promise<string> {
  return (await solicitarGemini(prompt, apiKey, model, options)).texto;
}

/** ¿Es un JSON completo? Acepta la respuesta envuelta en ```json ... ``` como hace `safeJsonParse`. */
function esJsonCompleto(texto: string): boolean {
  const limpio = texto.replace(/```(?:json)?\s*|\s*```/gi, '').trim();
  if (!limpio) return false;
  try {
    JSON.parse(limpio);
    return true;
  } catch {
    return false;
  }
}

/**
 * Como `callGemini`, pero para respuestas JSON: si la respuesta llega cortada (tope de tokens)
 * o no es un JSON válido, se pide una vez más. Si el segundo intento tampoco sirve, se devuelve
 * tal cual y el intérprete de cada acción aplica su respaldo.
 */
export async function callGeminiJson(prompt: string, apiKey: string, model: string, options: GeminiOptions = {}): Promise<string> {
  const primera = await solicitarGemini(prompt, apiKey, model, options);
  if (primera.finishReason !== 'MAX_TOKENS' && esJsonCompleto(primera.texto)) return primera.texto;

  // En el reintento se pide una respuesta más corta, que es lo que suele cortarla.
  const segunda = await solicitarGemini(
    `${prompt}\n\nIMPORTANTE: tu respuesta anterior llegó incompleta. Responde SOLO con el JSON pedido, completo y bien cerrado; si no cabe, devuelve menos elementos.`,
    apiKey,
    model,
    options
  );
  return segunda.texto;
}

/** Máximo de textos por petición `batchEmbedContents`. */
const EMBEDDINGS_POR_PETICION = 100;
/** Espera total que se admite por 429 al pedir embeddings (la respuesta al cliente no debe tardar minutos). */
const MAX_ESPERA_EMBEDDINGS_S = 75;

/** Segundos que pide esperar un 429 de Gemini ("retryDelay": "23s"), con un segundo de margen. */
export function segundosDeEspera(detalle: string): number | null {
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(detalle);
  return m ? Math.ceil(Number(m[1])) + 1 : null;
}

/**
 * Embeddings de varios textos (para comparar significados, no palabras). Se piden en tandas de
 * 100, que es lo que admite `batchEmbedContents`. Devuelve un vector por texto, en el mismo orden.
 */
export async function embedTexts(texts: string[], apiKey: string, model: string, dimensiones = 768): Promise<number[][]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents`;
  const vectores: number[][] = [];
  let esperaAcumulada = 0;
  for (let i = 0; i < texts.length; i += EMBEDDINGS_POR_PETICION) {
    const tanda = texts.slice(i, i + EMBEDDINGS_POR_PETICION);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        requests: tanda.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType: 'SEMANTIC_SIMILARITY',
          outputDimensionality: dimensiones,
        })),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // KAN-47: en el nivel gratuito cada texto cuenta como una petición por minuto, así que una
      // segunda tanda de 100 casi siempre recibe 429 con el tiempo de espera ("retryDelay").
      // Se espera lo que pide (con tope) y se repite la misma tanda.
      const segundos = res.status === 429 ? segundosDeEspera(detail) : null;
      if (segundos !== null && esperaAcumulada + segundos <= MAX_ESPERA_EMBEDDINGS_S) {
        esperaAcumulada += segundos;
        await new Promise((r) => setTimeout(r, segundos * 1000));
        i -= EMBEDDINGS_POR_PETICION;
        continue;
      }
      throw new Error(`Gemini (embeddings) respondió ${res.status}: ${detail.slice(0, 500)}`);
    }
    const data = (await res.json()) as { embeddings?: { values?: number[] }[] };
    const recibidos = data.embeddings ?? [];
    if (recibidos.length !== tanda.length) throw new Error('Gemini devolvió una cantidad de embeddings distinta a la pedida.');
    vectores.push(...recibidos.map((e) => e.values ?? []));
  }
  return vectores;
}

/** Similitud del coseno entre dos vectores (1 = mismo significado). */
export function coseno(a: number[], b: number[]): number {
  let punto = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    punto += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? punto / Math.sqrt(na * nb) : 0;
}
