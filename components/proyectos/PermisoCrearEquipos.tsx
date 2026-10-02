'use client';

import React, { useState } from 'react';
import type { PerfilUsuario, QuienCreaEquipos } from '@/lib/database.types';
import { OPCIONES_CREAR_EQUIPOS } from '@/lib/equipos-proyecto';
import { campo, etiqueta } from '@/components/ui/estilos';

interface PermisoCrearEquiposProps {
  quien: QuienCreaEquipos;
  ids: string[];
  /** Usuarios que se pueden elegir (sin el creador, que siempre puede). */
  usuarios: PerfilUsuario[];
  onChange: (cambio: { quien: QuienCreaEquipos; ids: string[] }) => void;
}

const nombreDe = (u: PerfilUsuario) => u.nombre || u.correo;

/**
 * "¿Quién puede crear equipos en este proyecto?": solo el creador, usuarios elegidos o cualquiera.
 * Se usa al crear un proyecto y al editarlo (solo su creador).
 */
export default function PermisoCrearEquipos({ quien, ids, usuarios, onChange }: PermisoCrearEquiposProps) {
  const [filtro, setFiltro] = useState('');
  const texto = filtro.trim().toLowerCase();
  const visibles = usuarios.filter((u) => !texto || `${nombreDe(u)} ${u.correo}`.toLowerCase().includes(texto));

  const alternar = (id: string) =>
    onChange({ quien, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });

  return (
    <fieldset>
      <legend className={etiqueta}>¿Quién puede crear equipos en este proyecto?</legend>
      <div className="space-y-2">
        {OPCIONES_CREAR_EQUIPOS.map((opcion) => {
          const activa = quien === opcion.valor;
          return (
            <label
              key={opcion.valor}
              className={`flex items-start gap-3 p-3 rounded-ui border cursor-pointer transition-colors ${
                activa ? 'border-brand-text bg-brand-subtle' : 'border-line-strong bg-surface hover:bg-sunken'
              }`}
            >
              <input
                type="radio"
                name="quien-crea-equipos"
                checked={activa}
                onChange={() => onChange({ quien: opcion.valor, ids })}
                className="mt-1 size-4 accent-brand-text shrink-0 cursor-pointer"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{opcion.titulo}</span>
                <span className="block text-xs text-ink-subtle mt-0.5">{opcion.descripcion}</span>
              </span>
            </label>
          );
        })}
      </div>

      {quien === 'seleccionados' && (
        <div className="mt-3">
          <p className="text-sm font-medium text-ink mb-2">
            Usuarios autorizados <span className="font-normal text-ink-subtle">({ids.length} elegidos)</span>
          </p>
          {usuarios.length > 6 && (
            <input
              type="search"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por nombre o correo..."
              aria-label="Filtrar usuarios por nombre o correo"
              className={`${campo} mb-2`}
            />
          )}
          <div className="max-h-48 overflow-y-auto rounded-ui border border-line divide-y divide-line custom-scrollbar">
            {visibles.length === 0 ? (
              <p className="p-3 text-sm text-ink-subtle">No hay usuarios que coincidan.</p>
            ) : (
              visibles.map((u) => (
                <label key={u.id} className="flex items-center gap-3 px-3 min-h-11 cursor-pointer hover:bg-sunken">
                  <input
                    type="checkbox"
                    checked={ids.includes(u.id)}
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
        </div>
      )}
    </fieldset>
  );
}
