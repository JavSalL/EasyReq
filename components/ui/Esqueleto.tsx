import React from 'react';

const barra = 'block rounded-full bg-sunken-strong/70';

/**
 * Silueta de una lista mientras carga: filas con la misma forma y alto que las
 * reales (código, texto y línea de datos), para que la página no salte cuando
 * llegan los datos. Las barras laten suavemente; con «reducir movimiento» quedan quietas.
 */
export default function ListaEsqueleto({
  filas = 3,
  forma = 'requerimiento',
  etiqueta = 'Cargando',
}: {
  filas?: number;
  forma?: 'requerimiento' | 'proyecto' | 'tarjeta';
  etiqueta?: string;
}) {
  return (
    <div role="status" aria-label={etiqueta} className="bg-surface rounded-ui divide-y divide-canvas">
      {Array.from({ length: filas }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className="px-5 py-5 motion-safe:animate-pulse"
          // Cada fila empieza a latir un poco después: se lee como que la lista "llega"
          style={{ animationDelay: `${i * 120}ms` }}
        >
          {forma === 'requerimiento' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className={`${barra} h-4 w-16`} />
                <span className={`${barra} h-5 w-20`} />
              </div>
              <div className="space-y-2 max-w-[75ch]">
                <span className={`${barra} h-4 w-full`} />
                <span className={`${barra} h-4 ${i % 2 ? 'w-2/3' : 'w-5/6'}`} />
              </div>
              <span className={`${barra} h-3 w-64 max-w-full`} />
            </div>
          )}
          {forma === 'proyecto' && (
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1 space-y-2.5">
                <span className={`${barra} h-5 ${i % 2 ? 'w-40' : 'w-56'} max-w-full`} />
                <span className={`${barra} h-3.5 w-full max-w-md`} />
                <span className={`${barra} h-3 w-48 max-w-full`} />
              </div>
              <span className={`${barra} hidden sm:block h-2 w-32`} />
            </div>
          )}
          {forma === 'tarjeta' && (
            <div className="space-y-2.5">
              <span className={`${barra} h-5 ${i % 2 ? 'w-36' : 'w-52'} max-w-full`} />
              <span className={`${barra} h-3.5 w-full max-w-lg`} />
              <span className={`${barra} h-3.5 w-2/3 max-w-sm`} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
