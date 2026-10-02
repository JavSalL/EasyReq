'use client';

import React, { useState } from 'react';
import type { PerfilUsuario } from '@/lib/database.types';
import { campo, etiqueta } from '@/components/ui/estilos';

const nombreDe = (u: PerfilUsuario) => u.nombre || u.correo;

interface SelectorMiembrosProps {
  usuarios: PerfilUsuario[];
  valor: string[];
  onChange: (ids: string[]) => void;
  titulo?: string;
}

/** Lista con buscador para elegir varias personas (p. ej. los miembros iniciales de un proyecto). */
export default function SelectorMiembros({ usuarios, valor, onChange, titulo = 'Miembros' }: SelectorMiembrosProps) {
  const [filtro, setFiltro] = useState('');
  const texto = filtro.trim().toLowerCase();
  const visibles = usuarios.filter((u) => !texto || `${nombreDe(u)} ${u.correo}`.toLowerCase().includes(texto));

  const alternar = (id: string) => onChange(valor.includes(id) ? valor.filter((x) => x !== id) : [...valor, id]);

  return (
    // `min-w-0`: un fieldset no se encoge por debajo de su contenido más ancho y se saldría del modal
    <fieldset className="min-w-0">
      <legend className={etiqueta}>
        {titulo} <span className="font-normal text-ink-subtle">({valor.length} elegidos)</span>
      </legend>
      {usuarios.length > 5 && (
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por nombre o correo..."
          aria-label="Buscar personas por nombre o correo"
          className={`${campo} mb-2`}
        />
      )}
      <div className="max-h-40 overflow-y-auto rounded-ui border border-line-strong divide-y divide-line custom-scrollbar">
        {usuarios.length === 0 ? (
          <p className="p-3 text-sm text-ink-subtle">No hay otras personas registradas todavía.</p>
        ) : visibles.length === 0 ? (
          <p className="p-3 text-sm text-ink-subtle">Nadie coincide con la búsqueda.</p>
        ) : (
          visibles.map((u) => (
            <label key={u.id} className="flex items-center gap-3 px-3 min-h-10 cursor-pointer hover:bg-sunken">
              <input
                type="checkbox"
                checked={valor.includes(u.id)}
                onChange={() => alternar(u.id)}
                className="size-4 accent-brand-text shrink-0 cursor-pointer"
              />
              <span className="min-w-0 text-sm text-ink truncate">
                {nombreDe(u)} <span className="text-ink-subtle">({u.correo})</span>
              </span>
            </label>
          ))
        )}
      </div>
    </fieldset>
  );
}
