
import { GoogleGenerativeAI } from "@google/generative-ai";

// Usamos el SDK estándar con el nombre de modelo más compatible
const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({ 
  model: "gemini-3.5-flash-lite", // Versión Lite con mayor límite de peticiones diarias
  generationConfig: {
    responseMimeType: "application/json",
  },
});

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

/**
 * Función auxiliar para parsear respuestas JSON con fallbacks seguros.
 */
function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text.trim());
  } catch {
    try {
      const cleaned = text.replace(/```(?:json)?\s*|\s*```/gi, '').trim();
      return JSON.parse(cleaned);
    } catch {
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try { return JSON.parse(arrayMatch[0]); } catch {}
      }
      const objMatch = text.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try { return JSON.parse(objMatch[0]); } catch {}
      }
      return fallback;
    }
  }
}

/**
 * Genera requerimientos en masa basados en la descripción de un proyecto.
 */
export async function generateBulkRequirements(projectDesc: string, pattern?: string, count?: number): Promise<AIRequirement[]> {
  const prompt = `
    Actúa como un experto en ingeniería de requisitos. Basado en la siguiente descripción del proyecto:
    "${projectDesc}"
    
    INSTRUCCIONES DE REDACCIÓN:
    ${pattern ? `IMPORTANTE: Debes seguir estrictamente este patrón de redacción específico: \n"${pattern}"\n` : 'REGLA: Redacta en 6 palabras o menos'}
    
    IDIOMA: Puedes redactar los requerimientos en ESPAÑOL o INGLÉS. Basado en si la descripción del proyecto está en español o inglés.

    Genera ${count ? `exactamente ${count}` : 'una lista de al menos 8'} requerimientos técnicos siguiendo el modelo FURPS (Functionality, Usability, Reliability, Performance, Supportability).
    
    Para cada requerimiento, evalúa si cumple con estos tags de redacción (TRUE/FALSE):
    - actor
    - accion
    - objeto
    - datos_entrada
    - resultado
    
    IMPORTANTE: 
    1. No generes observaciones ni notas IA durante la generación masiva (déjalas vacías o nulas).
    2. Responde con un array JSON válido con la siguiente estructura:
    [{ "name": "...", "type_furps": "...", "ai_evaluation": { "actor": true, ... } }]
     donde name es el texto del requerimiento, type_furps es su categoría FURPS, y ai_evaluation es un objeto con los tags de redacción evaluados como booleanos.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return safeJsonParse<AIRequirement[]>(text, []);
  } catch (err) {
    console.error('Error al generar requerimientos en lote:', err);
    return [];
  }
}

/**
 * Refina o genera un requerimiento específico basado en un prompt del usuario.
 */
export async function generateSingleRequirement(userPrompt: string, pattern?: string): Promise<AIRequirement | null> {
  const prompt = `
    Genera un requerimiento técnico profesional basado en este prompt: "${userPrompt}"
    ${pattern ? `Debes usar estrictamente este patrón de redacción: \n"${pattern}"` : ''}
    
    IDIOMA: Puedes redactar en ESPAÑOL o INGLÉS. Sé flexible con el idioma pero estricto con la estructura del patrón.

    Clasifícalo en una categoría FURPS.
    
    IMPORTANTE:
    1. No generes observaciones ni notas IA (déjalas vacías o nulas).
    2. Responde con un objeto JSON válido:
    { "name": "...", "type_furps": "...", "ai_evaluation": { "actor": false, "accion": false, "objeto": false, "datos_entrada": false, "resultado": false } }
     donde name es el texto del requerimiento, type_furps es su categoría FURPS, y ai_evaluation debe ir con los valores por defecto.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return safeJsonParse<AIRequirement | null>(text, null);
  } catch (err) {
    console.error('Error al generar requerimiento individual:', err);
    return null;
  }
}

/**
 * Evalúa un requerimiento existente de forma inteligente.
 */
export async function evaluateRequirement(requirementText: string, pattern?: string): Promise<Partial<AIRequirement>> {
  const prompt = `
    Actúa como un Auditor de Ingeniería de Requisitos equilibrado y experto (IEEE 830).
    Tu objetivo es evaluar si el siguiente texto cumple con los estándares de redacción técnica.
    
    ${pattern ? `Debes evaluar basándote específicamente en este patrón de redacción: \n"${pattern}"` : 'Evalúa siguiendo estándares de completitud técnica (Actor, Acción, Objeto, etc).'}

    IDIOMA: El requerimiento puede estar en ESPAÑOL o INGLÉS. Si el patrón especifica palabras clave en inglés (como EARS 'When'), pero el usuario las implementó en español ('Cuando'), acéptalo como válido.

    TEXTO A EVALUAR: "${requirementText}"
    
    CRITERIOS DE EVALUACIÓN (Devuelve TRUE/FALSE para cada uno según el patrón):
    1. actor: identificación de quién realiza la acción.
    2. accion: verbo técnico definido.
    3. objeto: sobre qué recae la acción.
    4. datos_entrada: fuente o medio/datos usados.
    5. resultado: fin esperado o efecto.

    Responde con un objeto JSON:
    { 
      "type_furps": "...", 
      "ai_evaluation": { 
        "actor": boolean, 
        "accion": boolean, 
        "objeto": boolean, 
        "datos_entrada": boolean, 
        "resultado": boolean 
      },
      "ai_observations": "Breve explicación de máximo 15 palabras de por qué faltan puntos o cómo mejorar según el patrón y el idioma detectado."
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    return safeJsonParse<Partial<AIRequirement>>(text, {});
  } catch (err) {
    console.error('Error al evaluar requerimiento:', err);
    return {};
  }
}
