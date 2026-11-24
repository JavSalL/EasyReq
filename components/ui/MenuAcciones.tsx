'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { btnIcono } from '@/components/ui/estilos';

export interface AccionMenu {
  etiqueta: string;
  icono?: React.ReactNode;
  onSelect: () => void;
  peligro?: boolean;
}

const itemMenu =
  'w-full flex items-center gap-3 px-3 min-h-10 pointer-coarse:min-h-11 rounded-ui text-sm font-medium text-left whitespace-nowrap transition-colors cursor-pointer focus:outline-none';

/**
 * Botón "⋯" con un menú de acciones secundarias. Se cierra con Escape, al
 * pulsar fuera o al elegir una opción; las flechas recorren las opciones.
 */
export default function MenuAcciones({
  acciones,
  label = 'Más acciones',
}: {
  acciones: AccionMenu[];
  label?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!abierto) return;
    const items = () =>
      Array.from(contenedor.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    items()[0]?.focus();

    const alPulsar = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        boton.current?.focus();
        return;
      }
      if (e.key === 'Tab') {
        setAbierto(false);
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      const lista = items();
      if (lista.length === 0) return;
      e.preventDefault();
      const actual = lista.indexOf(document.activeElement as HTMLButtonElement);
      let siguiente = 0;
      if (e.key === 'End') siguiente = lista.length - 1;
      else if (e.key === 'ArrowDown') siguiente = (actual + 1) % lista.length;
      else if (e.key === 'ArrowUp') siguiente = (actual - 1 + lista.length) % lista.length;
      lista[siguiente]?.focus();
    };
    document.addEventListener('mousedown', alPulsar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alPulsar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  if (acciones.length === 0) return null;

  return (
    <div ref={contenedor} className="relative">
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-controls={abierto ? idMenu : undefined}
        aria-label={label}
        title={label}
        className={btnIcono}
      >
        <MoreHorizontal size={18} />
      </button>
      {abierto && (
        <div
          id={idMenu}
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full mt-1 z-30 w-max max-w-[calc(100vw-2rem)] bg-surface border border-line-strong rounded-ui p-1 shadow-lg animate-in fade-in"
        >
          {acciones.map((a) => (
            <button
              key={a.etiqueta}
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                a.onSelect();
              }}
              className={`${itemMenu} ${
                a.peligro
                  ? 'text-danger hover:bg-danger-subtle focus:bg-danger-subtle'
                  : 'text-ink-muted hover:bg-sunken hover:text-ink focus:bg-sunken focus:text-ink'
              }`}
            >
              {a.icono && <span aria-hidden className="shrink-0">{a.icono}</span>}
              {a.etiqueta}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
