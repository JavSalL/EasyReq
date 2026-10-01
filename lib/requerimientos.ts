/** Identificador visible de un requerimiento dentro de su proyecto: 14 → "REQ-014". */
export function codigoRequerimiento(numero: number): string {
  return `REQ-${String(numero).padStart(3, '0')}`;
}

/**
 * Interpreta lo que se escribe en el buscador como un identificador: acepta
 * "14", "req14", "req-14" o "REQ-014". Devuelve el número, o null si el texto
 * no parece un identificador.
 */
export function numeroDesdeBusqueda(texto: string): number | null {
  const coincidencia = texto.trim().toLowerCase().match(/^(?:req-?)?(\d+)$/);
  return coincidencia ? Number(coincidencia[1]) : null;
}
