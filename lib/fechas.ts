const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

/** Fecha y hora completas, p. ej. "30 de septiembre de 2026, 19:47". Para tooltips e historial. */
export function fechaCompleta(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
}

/** "hace 3 horas", "ayer"; pasados 30 días muestra la fecha ("30 sep 2026"). */
export function fechaRelativa(iso: string, ahora: number = Date.now()): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  const diferencia = fecha.getTime() - ahora;
  const abs = Math.abs(diferencia);

  if (abs < MINUTO) return 'justo ahora';
  if (abs < HORA) return relativo.format(Math.round(diferencia / MINUTO), 'minute');
  if (abs < DIA) return relativo.format(Math.round(diferencia / HORA), 'hour');
  if (abs < 30 * DIA) return relativo.format(Math.round(diferencia / DIA), 'day');
  return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}
