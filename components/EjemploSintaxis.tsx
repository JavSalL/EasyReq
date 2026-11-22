import React from 'react';

/**
 * Un requerimiento de ejemplo con sus partes marcadas como las marca EasyReq
 * (mismos tonos `--syntax-*`). Es la firma visual de la app: se usa en el login
 * y en los estados vacíos para enseñar qué hace la herramienta en vez de decirlo.
 */
const PARTES = [
  { texto: 'Cuando ', tono: null },
  { texto: 'el usuario falle cinco intentos de inicio de sesión', tono: 3, elemento: 'Disparador' },
  { texto: ', ', tono: null },
  { texto: 'el sistema', tono: 1, elemento: 'Sistema' },
  { texto: ' debe ', tono: null },
  { texto: 'bloquear la cuenta', tono: 2, elemento: 'Respuesta' },
  { texto: ' ', tono: null },
  { texto: 'durante 15 minutos', tono: 5, elemento: 'Restricción' },
  { texto: '.', tono: null },
] as const;

const MARCA: Record<number, string> = {
  1: 'bg-syntax-1-subtle/80 border-b-2 border-syntax-1-line',
  2: 'bg-syntax-2-subtle/80 border-b-2 border-syntax-2-line',
  3: 'bg-syntax-3-subtle/80 border-b-2 border-syntax-3-line',
  5: 'bg-syntax-5-subtle/80 border-b-2 border-syntax-5-line',
};

const PUNTO: Record<number, string> = {
  1: 'bg-syntax-1',
  2: 'bg-syntax-2',
  3: 'bg-syntax-3',
  5: 'bg-syntax-5',
};

export default function EjemploSintaxis({
  grande = false,
  className = '',
}: {
  grande?: boolean;
  className?: string;
}) {
  const elementos = PARTES.filter((p): p is Extract<(typeof PARTES)[number], { elemento: string }> => 'elemento' in p);
  return (
    <figure className={`bg-surface rounded-ui p-5 sm:p-6 ${className}`}>
      <div className="flex items-center gap-2.5 text-sm">
        <span className="font-semibold tabular-nums text-ink">REQ-014</span>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-success-subtle text-success border-success-line">
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          Aprobado
        </span>
        <span className="text-ink-subtle">EARS · por evento</span>
      </div>
      <blockquote className={`mt-3 text-ink leading-relaxed ${grande ? 'text-xl sm:text-2xl' : 'text-base'}`}>
        {PARTES.map((p, i) =>
          p.tono ? (
            <span key={i} className={`${MARCA[p.tono]} rounded-[2px] px-0.5`}>
              {p.texto}
            </span>
          ) : (
            <React.Fragment key={i}>{p.texto}</React.Fragment>
          )
        )}
      </blockquote>
      <figcaption className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink-muted">
        {elementos.map(e => (
          <span key={e.elemento} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`size-2 rounded-full ${PUNTO[e.tono]}`} />
            {e.elemento}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
