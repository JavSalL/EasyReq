'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Briefcase, Check, ChevronDown, X } from 'lucide-react';
import type { Profesion } from '@/lib/database.types';

interface SelectorProfesionesProps {
  profesiones: Profesion[];
  valor: string[];
  onChange: (ids: string[]) => void;
  /** Texto de la etiqueta; el selector la enlaza al botón con `id`. */
  etiqueta?: string;
  id?: string;
}

/**
 * Desplegable de selección múltiple de profesiones, con chips de lo elegido.
 * Lo comparten el registro, el editor de perfil y el paso de registro de las
 * cuentas de Google, para que se vea y se comporte igual en los tres.
 */
export default function SelectorProfesiones({
  profesiones,
  valor,
  onChange,
  etiqueta = 'Profesión / Especialidad',
  id = 'selector-profesiones'
}: SelectorProfesionesProps) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  // Cerrar con clic fuera o con Escape. Escape se atiende en la fase de captura y se
  // detiene aquí, para que dentro de un modal cierre solo el desplegable y no el modal.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: PointerEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setAbierto(false);
      }
    };
    document.addEventListener('pointerdown', alPulsar);
    document.addEventListener('keydown', alTeclear, true);
    return () => {
      document.removeEventListener('pointerdown', alPulsar);
      document.removeEventListener('keydown', alTeclear, true);
    };
  }, [abierto]);

  const alternar = (idProfesion: string) =>
    onChange(valor.includes(idProfesion) ? valor.filter((v) => v !== idProfesion) : [...valor, idProfesion]);

  const textoBoton =
    valor.length === 0
      ? 'Seleccionar profesiones...'
      : valor.length === 1
        ? (profesiones.find((p) => p.id === valor[0])?.nombre ?? '1 seleccionada')
        : `${valor.length} profesiones seleccionadas`;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink mb-2">
        {etiqueta}
      </label>
      <div ref={contenedor} className="relative">
        <button
          id={id}
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          className={`relative block w-full pl-10 pr-10 min-h-10 pointer-coarse:min-h-11 py-2 bg-surface border rounded-ui text-base text-left focus:outline-none focus:border-brand-text focus:ring-1 focus:ring-brand-text cursor-pointer ${
            abierto ? 'border-brand-text ring-1 ring-brand-text' : 'border-line-strong'
          } ${valor.length === 0 ? 'text-ink-subtle' : 'text-ink'}`}
        >
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-ink-subtle">
            <Briefcase size={18} aria-hidden />
          </span>
          <span className="block truncate">{textoBoton}</span>
          <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-ink-subtle">
            <ChevronDown size={18} aria-hidden className={`transition-transform ${abierto ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {abierto && (
          <div className="absolute z-20 mt-2 w-full rounded-ui border border-line-strong bg-surface overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-line">
              <span className="text-sm text-ink-subtle">Elige una o más ({valor.length})</span>
              {valor.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-sm font-semibold text-brand-text hover:underline cursor-pointer"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div role="listbox" aria-multiselectable className="max-h-56 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
              {profesiones.length === 0 && <p className="text-sm text-ink-subtle px-2.5 py-2">Cargando profesiones...</p>}
              {profesiones.map((p) => {
                const marcada = valor.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 px-2.5 min-h-10 rounded-ui text-sm cursor-pointer transition-colors ${
                      marcada ? 'bg-brand-subtle text-ink font-medium' : 'text-ink-muted hover:bg-sunken'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => alternar(p.id)}
                      className="size-4 accent-brand-text shrink-0 cursor-pointer"
                    />
                    <span className="flex-1 truncate">{p.nombre}</span>
                    {marcada && <Check size={14} aria-hidden className="text-brand-text shrink-0" />}
                  </label>
                );
              })}
            </div>
            <div className="p-2 border-t border-line">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="w-full min-h-10 rounded-ui bg-brand-solid hover:bg-brand-solid-hover text-on-solid text-sm font-semibold transition-colors cursor-pointer"
              >
                Listo{valor.length > 0 ? ` (${valor.length})` : ''}
              </button>
            </div>
          </div>
        )}
      </div>

      {valor.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {valor.map((idProfesion) => {
            const profesion = profesiones.find((p) => p.id === idProfesion);
            if (!profesion) return null;
            return (
              <span
                key={idProfesion}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 text-xs font-medium bg-brand-subtle text-brand-text border border-brand-line rounded-full"
              >
                <span className="max-w-40 truncate">{profesion.nombre}</span>
                <button
                  type="button"
                  aria-label={`Quitar ${profesion.nombre}`}
                  onClick={() => alternar(idProfesion)}
                  className="size-4 rounded-full hover:bg-brand-line flex items-center justify-center cursor-pointer"
                >
                  <X size={11} aria-hidden />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
