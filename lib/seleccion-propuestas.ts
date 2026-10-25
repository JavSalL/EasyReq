/**
 * Selección de propuestas de la generación iterativa (KAN-50).
 *
 * La selección vive en cada propuesta (`elegida`), no en un estado paralelo: así
 * sobrevive a los filtros y a los cambios de agrupación sin sincronizar dos
 * listas. Estas funciones son puras para poder probarlas sin React ni Firestore.
 */

/** Una propuesta sin enunciado no se puede registrar: no cuenta como disponible. */
export function esSeleccionable(propuesta: { texto: string }): boolean {
  return propuesta.texto.trim().length > 0;
}

export function contarSeleccionadas(propuestas: ReadonlyArray<{ elegida: boolean }>): number {
  return propuestas.reduce((total, p) => total + (p.elegida ? 1 : 0), 0);
}

export function todasSeleccionadas(propuestas: ReadonlyArray<{ elegida: boolean }>): boolean {
  return propuestas.length > 0 && propuestas.every(p => p.elegida);
}

export type EstadoSeleccion = 'vacia' | 'parcial' | 'completa';

/** Estado de un grupo (por ejemplo, un área) para el checkbox y su estado mixto. */
export function estadoSeleccion(propuestas: ReadonlyArray<{ elegida: boolean }>): EstadoSeleccion {
  if (propuestas.length === 0) return 'vacia';
  const seleccionadas = contarSeleccionadas(propuestas);
  if (seleccionadas === 0) return 'vacia';
  return seleccionadas === propuestas.length ? 'completa' : 'parcial';
}

/**
 * Marca o desmarca las claves indicadas. Al marcar, ignora las propuestas sin
 * texto; al desmarcar, las incluye para que un estado viejo no deje basura.
 */
export function aplicarSeleccion<T extends { clave: string; texto: string; elegida: boolean }>(
  propuestas: ReadonlyArray<T>,
  claves: Iterable<string>,
  elegida: boolean
): T[] {
  const set = new Set(claves);
  return propuestas.map(p => {
    if (!set.has(p.clave)) return p;
    if (p.elegida === elegida) return p;
    if (elegida && !esSeleccionable(p)) return p;
    return { ...p, elegida };
  });
}

export interface PreparacionRegistro<T> {
  /** Lo que se enviará al servicio: seleccionado, con texto y sin claves repetidas. */
  elegidas: T[];
  /** Seleccionadas que no se pueden registrar porque su enunciado está vacío. */
  sinTexto: number;
}

/**
 * Prepara el lote de registro a partir de la selección. La página usa
 * `sinTexto` para avisar antes de abrir la confirmación, y `elegidas` para el
 * conteo y el envío. Las claves repetidas se colapsan como defensa extra.
 */
export function prepararRegistro<T extends { clave: string; texto: string; elegida: boolean }>(
  propuestas: ReadonlyArray<T>
): PreparacionRegistro<T> {
  const seleccionadas = propuestas.filter(p => p.elegida);
  const sinTexto = seleccionadas.filter(p => !esSeleccionable(p)).length;
  const elegidas = [
    ...new Map(seleccionadas.filter(esSeleccionable).map(p => [p.clave, p])).values()
  ];
  return { elegidas, sinTexto };
}
