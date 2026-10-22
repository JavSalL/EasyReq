/**
 * Detección léxica de requerimientos repetidos (KAN-40), sin llamar a la IA.
 *
 * Cada texto se normaliza (minúsculas, sin acentos, sin palabras vacías ni el relleno típico de
 * un requerimiento como "el sistema debe") y se compara por trigramas de caracteres con el
 * coeficiente de Dice. Es rápido (cientos de textos contra cientos en milisegundos) y detecta
 * reformulaciones cercanas; no entiende sinónimos, para eso haría falta comparar embeddings.
 */

/** A partir de aquí se considera el mismo requerimiento y se descarta. */
export const UMBRAL_DUPLICADO = 0.85;
/** Entre este valor y el anterior se marca como "posible duplicado" para que lo revise el usuario. */
export const UMBRAL_POSIBLE_DUPLICADO = 0.6;

// Palabras que no distinguen un requerimiento de otro: artículos, preposiciones y el relleno
// de la redacción ("el sistema deberá permitir...").
const PALABRAS_VACIAS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo', 'al', 'del', 'de', 'a', 'en', 'y', 'o', 'u', 'e',
  'que', 'con', 'por', 'para', 'sin', 'sobre', 'entre', 'su', 'sus', 'se', 'como', 'cuando', 'si', 'es', 'son',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'cada', 'todo', 'toda', 'todos', 'todas', 'mas', 'muy',
  'sistema', 'aplicacion', 'plataforma', 'debe', 'deben', 'debera', 'deberan', 'deberia', 'permitir', 'permite',
  'permitira', 'poder', 'pueda', 'puedan', 'podra', 'podran', 'ser', 'sera', 'estar', 'tener', 'tendra',
  'the', 'a', 'an', 'of', 'to', 'in', 'and', 'or', 'for', 'with', 'on', 'by', 'system', 'shall', 'must',
  'should', 'will', 'be', 'able', 'allow', 'allows', 'can'
]);

/** Texto en minúsculas, sin acentos ni signos, y sin palabras vacías. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .split(' ')
    .filter(p => p && !PALABRAS_VACIAS.has(p))
    .join(' ');
}

/** Conjunto de trigramas de caracteres del texto normalizado. */
export function trigramas(texto: string): Set<string> {
  const limpio = ` ${normalizarTexto(texto)} `;
  const set = new Set<string>();
  for (let i = 0; i + 3 <= limpio.length; i++) set.add(limpio.slice(i, i + 3));
  return set;
}

/** Coeficiente de Dice entre dos conjuntos de trigramas (0 = nada en común, 1 = iguales). */
export function similitudTrigramas(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [menor, mayor] = a.size <= b.size ? [a, b] : [b, a];
  let comunes = 0;
  for (const t of menor) if (mayor.has(t)) comunes++;
  return (2 * comunes) / (a.size + b.size);
}

export function similitud(a: string, b: string): number {
  return similitudTrigramas(trigramas(a), trigramas(b));
}

export interface CoincidenciaDuplicado {
  /** Cómo se muestra al usuario: "REQ-014" o "otra propuesta (Pagos)". */
  etiqueta: string;
  /** Enunciado del requerimiento parecido, para que el usuario compare. */
  texto: string;
  similitud: number;
}

/** Índice de textos ya conocidos (existentes del proyecto y lo que se va generando). */
export class IndiceDuplicados {
  private entradas: Array<{ etiqueta: string; texto: string; firma: Set<string> }> = [];

  agregar(texto: string, etiqueta: string): void {
    const firma = trigramas(texto);
    if (firma.size > 0) this.entradas.push({ etiqueta, texto, firma });
  }

  /** El texto conocido más parecido, o null si no hay ninguno. */
  masParecido(texto: string): CoincidenciaDuplicado | null {
    const firma = trigramas(texto);
    let mejor: CoincidenciaDuplicado | null = null;
    for (const e of this.entradas) {
      const s = similitudTrigramas(firma, e.firma);
      if (!mejor || s > mejor.similitud) mejor = { etiqueta: e.etiqueta, texto: e.texto, similitud: s };
    }
    return mejor;
  }

  get tamano(): number {
    return this.entradas.length;
  }
}

export type VeredictoDuplicado =
  | { tipo: 'nuevo' }
  | { tipo: 'posible'; de: CoincidenciaDuplicado }
  | { tipo: 'duplicado'; de: CoincidenciaDuplicado };

/** Clasifica un texto frente al índice según los umbrales. */
export function clasificarDuplicado(indice: IndiceDuplicados, texto: string): VeredictoDuplicado {
  const mejor = indice.masParecido(texto);
  if (!mejor || mejor.similitud < UMBRAL_POSIBLE_DUPLICADO) return { tipo: 'nuevo' };
  return mejor.similitud >= UMBRAL_DUPLICADO ? { tipo: 'duplicado', de: mejor } : { tipo: 'posible', de: mejor };
}

/** Quita acentos y mayúsculas para comparar nombres de módulos o áreas. */
export const normalizarNombre = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
