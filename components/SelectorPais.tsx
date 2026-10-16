'use client';

import React, { useMemo } from 'react';
import { Globe } from 'lucide-react';
import { getPaises } from '@/lib/paises';

interface SelectorPaisProps {
  id: string;
  valor: string;
  onChange: (codigo: string) => void;
  /** Clases del <select>; por defecto, las del campo estándar con espacio para el icono. */
  className?: string;
  obligatorio?: boolean;
}

/** Desplegable de países (nombre en español, valor = código ISO). Al escribir con el foco salta al país. */
export default function SelectorPais({ id, valor, onChange, className, obligatorio = true }: SelectorPaisProps) {
  const paises = useMemo(() => getPaises(), []);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink mb-2">
        País {obligatorio && <span className="text-danger">*</span>}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-ink-subtle">
          <Globe size={18} aria-hidden />
        </div>
        <select
          id={id}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="country"
          className={
            className ??
            'block w-full pl-10 pr-4 min-h-10 py-2 bg-surface border border-line-strong rounded-ui text-base text-ink focus:outline-none focus:border-brand-text focus:ring-1 focus:ring-brand-text cursor-pointer'
          }
        >
          <option value="">Selecciona tu país...</option>
          {paises.map((p) => (
            <option key={p.codigo} value={p.codigo}>{p.nombre}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
