import type { ElementoSintactico } from './database.types';

/**
 * Reconoce, sin IA, las partes de un enunciado escrito a mano a partir de la
 * plantilla del patrón. De "When <trigger>, the <system name> shall <system
 * response>." se toman las palabras fijas ("when", "the", "shall") y lo que
 * queda entre ellas es cada elemento. Las plantillas están en inglés y los
 * requerimientos suelen escribirse en español, así que cada palabra fija
 * acepta también sus equivalentes ("cuando", "el", "deberá").
 */

// Frases que en español cambian de orden: se reconocen enteras antes que palabra por palabra.
const FRASES: ReadonlyArray<[string, string[]]> = [
  ['shall not exceed', ['shall not exceed', 'no deberá exceder', 'no debe exceder', 'no deberá superar', 'no debe superar', 'no deberá sobrepasar', 'no debe sobrepasar']],
  ['shall transition to', ['shall transition to', 'deberá pasar a', 'debe pasar a', 'deberá cambiar a', 'debe cambiar a', 'deberá transicionar a', 'debe transicionar a']],
];

// Grupos de palabras equivalentes. Una palabra fija de la plantilla acepta cualquiera de su grupo.
const EQUIVALENTES: ReadonlyArray<string[]> = [
  ['when', 'cuando'],
  ['while', 'mientras', 'mientras que'],
  ['if', 'si'],
  ['then', 'entonces'],
  ['where', 'donde', 'en caso de que', 'si se incluye'],
  ['the', 'el', 'la', 'los', 'las'],
  ['shall', 'deberá', 'deberán', 'debe', 'deben'],
  ['within', 'en menos de', 'en un plazo de', 'dentro de', 'en un máximo de'],
  ['every', 'cada'],
  ['upon', 'al', 'tras', 'después de'],
];

/** Palabras que se pueden omitir al escribir. */
const OPCIONALES = new Set(['then']);

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Variante sin tildes para aceptar "debera" igual que "deberá". */
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

function alternativas(opciones: string[]): string {
  const todas = new Set<string>();
  for (const o of opciones) {
    todas.add(o);
    todas.add(sinTildes(o));
  }
  // Las más largas primero: "mientras que" antes que "mientras"
  const lista = [...todas].sort((a, b) => b.length - a.length);
  return `(?:${lista.map(o => o.split(/\s+/).map(escapar).join('\\s+')).join('|')})`;
}

/** Regex de una parte fija de la plantilla (p. ej. ", the " o " shall "). */
function regexLiteral(literal: string, estricto: boolean): { regex: string; tienePalabras: boolean } {
  let resto = literal.toLowerCase();
  const partes: string[] = [];
  let tienePalabras = false;

  while (resto.length > 0) {
    const espacio = /^\s+/.exec(resto);
    if (espacio) {
      partes.push('\\s+');
      resto = resto.slice(espacio[0].length);
      continue;
    }
    const puntuacion = /^[,;:.]/.exec(resto);
    if (puntuacion) {
      const signo = escapar(puntuacion[0]);
      // Al escribir a mano se olvida la coma: en el segundo intento es opcional
      partes.push(estricto && puntuacion[0] === ',' ? `\\s*${signo}` : `\\s*${signo}?`);
      resto = resto.slice(1);
      continue;
    }
    const frase = FRASES.find(([f]) => resto.startsWith(f) && !/\p{L}/u.test(resto[f.length] ?? ''));
    if (frase) {
      partes.push(alternativas(frase[1]));
      resto = resto.slice(frase[0].length);
      tienePalabras = true;
      continue;
    }
    const palabra = /^[\p{L}\p{N}/'-]+/u.exec(resto);
    if (palabra) {
      const p = palabra[0];
      const grupo = EQUIVALENTES.find(g => g.some(x => x === p || sinTildes(x) === sinTildes(p)));
      resto = resto.slice(p.length);
      if (grupo && OPCIONALES.has(grupo[0])) {
        // "If ..., then the ..." se escribe a menudo sin "entonces"
        partes.push(`(?:${alternativas(grupo)}\\s+)?`);
        resto = resto.replace(/^\s+/, '');
        continue;
      }
      partes.push(grupo ? alternativas(grupo) : alternativas([p]));
      tienePalabras = true;
      continue;
    }
    // Símbolos como "+" de las plantillas de lenguaje natural: no ayudan a separar
    partes.push(`\\s*${escapar(resto[0])}?\\s*`);
    resto = resto.slice(1);
  }

  // Varios "\s+" seguidos (p. ej. por una coma opcional) se vuelven uno flexible
  return { regex: partes.join('').replace(/(\\s\+)+/g, '\\s+'), tienePalabras };
}

interface PlantillaCompilada {
  elementos: string[];
  regex: RegExp[];
}

const cache = new Map<string, PlantillaCompilada | null>();

function compilar(patron: string): PlantillaCompilada | null {
  if (cache.has(patron)) return cache.get(patron)!;

  const piezas = patron.trim().split(/(<[^<>]+>|\[[^\[\]]+\])/);
  const elementos: string[] = [];
  const literales: string[] = [];
  for (let i = 0; i < piezas.length; i++) {
    if (i % 2 === 0) literales.push(piezas[i]);
    else elementos.push(piezas[i].slice(1, -1).trim());
  }

  let resultado: PlantillaCompilada | null = null;
  if (elementos.length > 0) {
    const construir = (estricto: boolean) => {
      let hayPalabras = false;
      let cuerpo = '';
      literales.forEach((lit, i) => {
        const esUltimo = i === literales.length - 1;
        // El punto final es opcional mientras se escribe
        const { regex, tienePalabras } = regexLiteral(esUltimo ? lit.replace(/\.\s*$/, '') : lit, estricto);
        hayPalabras ||= tienePalabras;
        cuerpo += regex;
        if (!esUltimo) cuerpo += '(.+?)';
      });
      return hayPalabras ? new RegExp(`^\\s*${cuerpo}\\s*\\.?\\s*$`, 'iu') : null;
    };
    const estricto = construir(true);
    const flexible = construir(false);
    // Sin palabras fijas (p. ej. "[Actor] + [Acción] + ...") no hay forma de separar las partes
    if (estricto && flexible) resultado = { elementos, regex: [estricto, flexible] };
  }

  cache.set(patron, resultado);
  return resultado;
}

/** ¿Se puede reconocer este patrón al escribir? (tiene palabras fijas que separan las partes) */
export function patronReconocible(patron?: string | null): boolean {
  return !!patron?.trim() && compilar(patron) !== null;
}

/**
 * Elementos del enunciado según la plantilla, o `null` si el texto no sigue la
 * estructura (o el patrón no se puede reconocer sin IA).
 */
export function elementosSegunPatron(texto: string, patron?: string | null): ElementoSintactico[] | null {
  if (!texto.trim() || !patron?.trim()) return null;
  const plantilla = compilar(patron);
  if (!plantilla) return null;

  for (const regex of plantilla.regex) {
    const m = regex.exec(texto);
    if (!m) continue;
    const elementos = plantilla.elementos
      .map((elemento, i) => ({ elemento, fragmento: (m[i + 1] ?? '').trim() }))
      // Un marcador que sigue tal cual ("<trigger>") todavía no es contenido
      .filter(e => e.fragmento && !/^[<\[].*[>\]]$/.test(e.fragmento));
    return elementos.length > 0 ? elementos : null;
  }
  return null;
}
