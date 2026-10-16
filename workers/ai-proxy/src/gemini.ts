export interface GeminiOptions {
  /** 0 = lo más literal posible. Por defecto 0.2 (KAN-25: fidelidad al texto del usuario). */
  temperature?: number;
  /** `application/json` por defecto; `text/plain` para la extracción de texto de documentos. */
  responseMimeType?: 'application/json' | 'text/plain';
  /** Archivo que acompaña al prompt (p. ej. un PDF en base64 para extraer su texto). */
  inlineData?: { mimeType: string; data: string };
}

/**
 * Llamada a la API REST de Gemini (sin SDK, para no depender de librerías
 * que puedan no ser compatibles con el runtime de Workers).
 * Devuelve el texto de la respuesta del modelo.
 */
export async function callGemini(prompt: string, apiKey: string, model: string, options: GeminiOptions = {}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const parts: Array<Record<string, unknown>> = [];
  if (options.inlineData) parts.push({ inline_data: { mime_type: options.inlineData.mimeType, data: options.inlineData.data } });
  parts.push({ text: prompt });

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
        responseMimeType: options.responseMimeType ?? 'application/json',
        temperature: options.temperature ?? 0.2,
      },
    }),
  });

  if (!res.ok) {
    // Solo se registra el estado y el cuerpo de error de Gemini, nunca la key.
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini respondió ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  return (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('');
}
