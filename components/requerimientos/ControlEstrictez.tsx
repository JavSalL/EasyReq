'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Gauge } from 'lucide-react';
import { ESTRICTEZ_POR_DEFECTO, NIVELES_ESTRICTEZ, type Estrictez } from '@/lib/ai-actions';

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
          <div className="flex items-baseline gap-2">
            <label htmlFor={`${id}-slider`} className="text-sm text-ink-muted">Estrictez</label>
            <span className="text-sm font-semibold text-ink">{nivel.nombre}</span>
          </div>
          <div className="flex justify-between text-xs text-ink-subtle mt-4 mb-2" aria-hidden>
            <span>Más libre</span>
            <span>Más literal</span>
          </div>
          {/* Pista propia (puntos en cada nivel y perilla), con el range nativo encima para teclado y lectores */}
          <div className="relative h-7 rounded-full bg-sunken-strong focus-within:ring-2 focus-within:ring-brand-text">
            {NIVELES.map(n => (
              <span
                key={n}
                aria-hidden
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-1 rounded-full bg-ink-subtle"
                style={{ left: `calc(14px + ${(n - 1) / 3} * (100% - 28px))` }}
              />
            ))}
            <span
              aria-hidden
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-5 rounded-full bg-surface border border-line-strong shadow transition-[left]"
              style={{ left: `calc(14px + ${(valor - 1) / 3} * (100% - 28px))` }}
            />
            <input
              id={`${id}-slider`}
              type="range"
              min={1}
              max={4}
              step={1}
              value={valor}
              onChange={(e) => onChange(Number(e.target.value) as Estrictez)}
              aria-valuetext={nivel.nombre}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <p className="text-xs text-ink-subtle mt-2 h-4">{valor === ESTRICTEZ_POR_DEFECTO ? 'Recomendado' : ''}</p>
          <p className="text-xs text-ink-muted mt-1 leading-relaxed">{nivel.descripcion}</p>
        </div>
      )}
    </div>
  );
}
