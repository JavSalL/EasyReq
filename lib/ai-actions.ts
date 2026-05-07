
import { GoogleGenerativeAI } from "@google/generative-ai";

// Usamos el SDK estándar con el nombre de modelo más compatible
const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({ 
  model: "gemini-flash-latest",
});

export interface AIRequirement {
  name: string;
  type_furps: 'Functionality' | 'Usability' | 'Reliability' | 'Performance' | 'Supportability';
  essence_state: 'conceived' | 'bounded' | 'coherent' | 'acceptable' | 'addressed' | 'fulfilled';
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
 * Genera requerimientos en masa basados en la descripción de un proyecto.
 */
export async function generateBulkRequirements(projectDesc: string): Promise<AIRequirement[]> {
  const prompt = `
    Actúa como un experto en ingeniería de requisitos. Basado en la siguiente descripción del proyecto:
    "${projectDesc}"
    
    Genera una lista de al menos 8 requerimientos técnicos siguiendo el modelo FURPS (Functionality, Usability, Reliability, Performance, Supportability).
    
    Para cada requerimiento, evalúa si cumple con estos tags de redacción (TRUE/FALSE):
    - actor (¿hay un sujeto claro?)
    - accion (¿hay un verbo de acción?)
    - objeto (¿sobre qué se actúa?)
    - datos_entrada (¿qué datos usa?)
    - resultado (¿qué se espera?)
    
    Asigna un estado inicial de Essence (conceived, bounded, coherent, acceptable, addressed, fulfilled).
    
    IMPORTANTE: Responde ÚNICAMENTE con un array JSON válido con la siguiente estructura:
    [{ "name": "...", "type_furps": "...", "essence_state": "...", "ai_evaluation": { "actor": true, ... }, "ai_observations": "..." }]
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  
  // Limpiar posibles bloques de código markdown
  const jsonMatch = text.match(/\[.*\]/s);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
}

/**
 * Refina o genera un requerimiento específico basado en un prompt del usuario.
 */
export async function generateSingleRequirement(userPrompt: string): Promise<AIRequirement | null> {
  const prompt = `
    Genera un requerimiento técnico profesional basado en este prompt: "${userPrompt}"
    Clasifícalo en una categoría FURPS y asígnale un estado inicial de Essence.
    
    Responde ÚNICAMENTE con un objeto JSON válido:
    { "name": "...", "type_furps": "...", "essence_state": "...", "ai_evaluation": { ... }, "ai_observations": "..." }
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  
  const jsonMatch = text.match(/\{.*\}/s);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}

/**
 * Evalúa un requerimiento existente de forma inteligente.
 */
export async function evaluateRequirement(requirementText: string): Promise<Partial<AIRequirement>> {
  const prompt = `
    Actúa como un Auditor de Ingeniería de Requisitos equilibrado y experto (IEEE 830).
    Tu objetivo es evaluar si el siguiente texto cumple con los estándares de redacción técnica, siendo flexible con el estilo pero estricto con la completitud.
    
    TEXTO A EVALUAR: "${requirementText}"
    
    CRITERIOS DE EVALUACIÓN:
    1. actor: TRUE si se identifica quién o qué realiza la acción (ej. "El sistema", "El usuario", o si la frase implica una función automatizada).
    2. accion: TRUE si hay una acción técnica definida (ej. "autenticar", "implementar", "permitir").
    3. objeto: TRUE si se especifica sobre qué recae la acción (ej. "el acceso", "los datos").
    4. datos_entrada: TRUE si menciona la fuente o medio (ej. "mediante OAuth 2.0", "usando Google API").
    5. resultado: TRUE si menciona el fin esperado (ej. "para gestionar el acceso").

    Responde ÚNICAMENTE con un objeto JSON:
    { 
      "type_furps": "...", 
      "essence_state": "...", 
      "ai_evaluation": { 
        "actor": boolean, 
        "accion": boolean, 
        "objeto": boolean, 
        "datos_entrada": boolean, 
        "resultado": boolean 
      },
      "ai_observations": "Breve explicación de máximo 15 palabras de por qué faltan puntos o cómo mejorar."
    }
  `;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  
  const jsonMatch = text.match(/\{.*\}/s);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
}
