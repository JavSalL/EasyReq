'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Gauge } from 'lucide-react';
import { NIVELES_ESTRICTEZ, type Estrictez } from '@/lib/ai-actions';

const NIVELES: Estrictez[] = [1, 2, 3, 4];

interface ControlEstrictezProps {
  valor: Estrictez;
  onChange: (nivel: Estrictez) => void;
  disabled?: boolean;
}

/**
 * Botón compacto con un desplegable que contiene un slider, al estilo del control de "effort" de
 * Claude: va en la esquina inferior derecha de la caja del prompt y abre hacia arriba.
 */
export default function ControlEstrictez({ valor, onChange, disabled }: ControlEstrictezProps) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const nivel = NIVELES_ESTRICTEZ[valor];

  // Se cierra con clic fuera o con Escape (sin cerrar el modal que lo contiene)
  useEffect(() => {
    if (!abierto) return;
    const alClic = (e: MouseEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', alClic);
    document.addEventListener('keydown', alTecla, true);
    return () => {
      document.removeEventListener('mousedown', alClic);
      document.removeEventListener('keydown', alTecla, true);
    };
  }, [abierto]);

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        disabled={disabled}
        aria-expanded={abierto}
        aria-controls={`${id}-panel`}
        title="Qué tan estricta es la IA al redactar"
        className="inline-flex items-center gap-1.5 px-2.5 min-h-8 rounded-ui text-xs font-semibold text-ink-muted hover:text-ink hover:bg-sunken transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Gauge size={14} aria-hidden />
        Estrictez: {nivel.nombre}
        <ChevronDown size={12} aria-hidden className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div
          id={`${id}-panel`}
          role="dialog"
          aria-label="Nivel de estrictez"
          className="absolute right-0 bottom-full mb-2 z-30 w-72 max-w-[calc(100vw-3rem)] bg-surface border border-line-strong rounded-ui shadow-lg p-4"
        >
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={`${id}-slider`} className="text-sm font-semibold text-ink">Estrictez</label>
            <span className="text-sm font-semibold text-brand-text">{nivel.nombre}</span>
          </div>
          <input
            id={`${id}-slider`}
            type="range"
            min={1}
            max={4}
            step={1}
            value={valor}
            onChange={(e) => onChange(Number(e.target.value) as Estrictez)}
            aria-valuetext={nivel.nombre}
            className="w-full mt-3 accent-brand-text cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-ink-subtle mt-1" aria-hidden>
            {NIVELES.map(n => (
              <button
                key={n}
                type="button"
                tabIndex={-1}
                onClick={() => onChange(n)}
                className={`cursor-pointer ${n === valor ? 'text-ink font-semibold' : 'hover:text-ink'}`}
              >
                {NIVELES_ESTRICTEZ[n].nombre}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-muted mt-3 leading-relaxed">{nivel.descripcion}</p>
        </div>
      )}
    </div>
  );
}
