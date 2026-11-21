// ==========================================
// CONTEXTO DE LOS LOTES DE LA IA (KAN-43)
// ==========================================
// El contexto del proyecto puede llegar a 300 000 caracteres y antes se reenviaba entero en cada
// lote de la generación iterativa. Ahora el contexto completo solo va al plan y a la cobertura;
// cada lote recibe un resumen (lo escribe el plan y se guarda en Firestore) más los fragmentos del
// contexto que tienen que ver con su área. Si el contexto es corto, se manda entero: resumirlo
// costaría más que reenviarlo.

/** Hasta este tamaño el contexto se manda entero a cada lote. */
export const UMBRAL_CONTEXTO_RESUMIDO = 40_000;
/** Caracteres de fragmentos relevantes por lote (más el resumen). */
export const MAX_FRAGMENTOS_LOTE = 24_000;
/** Tamaño aproximado de cada fragmento en que se parte el contexto. */
const TAMANO_FRAGMENTO = 1_500;

/** Huella corta del contexto (cyrb53): si cambia el contexto, el resumen guardado deja de valer. */
export function huellaContexto(texto: string): string {
  let h1 = 0xdeadbeef ^ texto.length;
  let h2 = 0x41c6ce57 ^ texto.length;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${texto.length.toString(36)}-${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

const PALABRAS_VACIAS = new Set([
  'para', 'como', 'esta', 'este', 'estos', 'estas', 'sobre', 'entre', 'desde', 'hasta', 'donde', 'cuando', 'cada',
  'todo', 'toda', 'todos', 'todas', 'debe', 'deben', 'puede', 'pueden', 'sistema', 'usuario', 'usuarios', 'datos',
  'with', 'from', 'that', 'this', 'will', 'shall', 'should', 'system', 'user', 'users', 'otros', 'otras', 'tambien'
]);

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Raíces de las palabras con significado (4+ letras, recortadas a 6 para juntar plurales y conjugaciones). */
function raices(texto: string): string[] {
  return (sinAcentos(texto).match(/[a-z0-9ñ]{4,}/g) ?? [])
    .filter(p => !PALABRAS_VACIAS.has(p))
    .map(p => p.slice(0, 6));
}

/** Parte el contexto en fragmentos de ~TAMANO_FRAGMENTO caracteres, por párrafos. */
export function partirContexto(contexto: string, tamano = TAMANO_FRAGMENTO): string[] {
  const parrafos = contexto.split(/\n\s*\n/);
  const fragmentos: string[] = [];
  let actual = '';
  for (const p of parrafos) {
    // Un párrafo enorme (un PDF sin saltos) se corta en trozos.
    for (let i = 0; i < Math.max(1, p.length); i += tamano * 2) {
      const trozo = p.slice(i, i + tamano * 2);
      if (actual && actual.length + trozo.length + 2 > tamano) {
        fragmentos.push(actual);
        actual = '';
      }
      actual = actual ? `${actual}\n\n${trozo}` : trozo;
    }
  }
  if (actual.trim()) fragmentos.push(actual);
  return fragmentos;
}

/**
 * Fragmentos del contexto relacionados con un área: se puntúan por las palabras del nombre, el
 * enfoque y los temas pendientes del área que aparecen en cada fragmento (las raras pesan más) y se
 * toman los mejores hasta `max` caracteres, en su orden original. El primer fragmento (nombre,
 * tipo y descripción del proyecto) entra siempre.
 */
export function fragmentosRelevantes(contexto: string, area: { nombre: string; enfoque?: string; pendiente?: string[] }, max = MAX_FRAGMENTOS_LOTE): string {
  if (contexto.length <= max) return contexto;
  const fragmentos = partirContexto(contexto);
  const consulta = new Set(raices([area.nombre, area.enfoque ?? '', ...(area.pendiente ?? [])].join(' ')));
  if (consulta.size === 0) return contexto.slice(0, max);

  const porFragmento = fragmentos.map(f => new Set(raices(f)));
  // Peso tipo IDF: una palabra que sale en todos los fragmentos no distingue nada.
  const peso = new Map<string, number>();
  for (const r of consulta) {
    const n = porFragmento.filter(s => s.has(r)).length;
    peso.set(r, n ? Math.log(1 + fragmentos.length / n) : 0);
  }
  const puntos = porFragmento.map(s => [...consulta].reduce((acc, r) => acc + (s.has(r) ? peso.get(r) ?? 0 : 0), 0));

  const elegidos = new Set<number>([0]);
  let usados = fragmentos[0].length;
  const orden = fragmentos.map((_, i) => i).filter(i => i > 0 && puntos[i] > 0).sort((a, b) => puntos[b] - puntos[a] || a - b);
  for (const i of orden) {
    if (usados + fragmentos[i].length + 6 > max) continue;
    elegidos.add(i);
    usados += fragmentos[i].length + 6;
  }
  return [...elegidos].sort((a, b) => a - b).map(i => fragmentos[i]).join('\n\n[…]\n\n').slice(0, max);
}
