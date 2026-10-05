/**
 * Llamada a la API REST de Gemini (sin SDK, para no depender de librerías
 * que puedan no ser compatibles con el runtime de Workers).
 * Devuelve el texto de la respuesta del modelo.
 */
export async function callGemini(prompt: string, apiKey: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // temperature baja a propósito: se busca fidelidad al texto del usuario, no creatividad (KAN-25)
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
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
