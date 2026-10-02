'use client';

import React, { useState } from 'react';
import type { PerfilUsuario, QuienAgregaMiembros, QuienCreaEquipos } from '@/lib/database.types';
import { OPCIONES_AGREGAR_MIEMBROS, OPCIONES_CREAR_EQUIPOS } from '@/lib/equipos-proyecto';
import { campo, etiqueta } from '@/components/ui/estilos';

const nombreDe = (u: PerfilUsuario) => u.nombre || u.correo;

interface GrupoProps<T extends string> {
  nombre: string;
  titulo: string;
  opciones: Array<{ valor: T; titulo: string; descripcion: string }>;
  valor: T;
  ids: string[];
  /** Miembros entre los que se pueden elegir (sin el creador, que siempre puede). */
  candidatos: PerfilUsuario[];
  onChange: (cambio: { valor: T; ids: string[] }) => void;
}

function GrupoPermiso<T extends string>({ nombre, titulo, opciones, valor, ids, candidatos, onChange }: GrupoProps<T>) {
  const [filtro, setFiltro] = useState('');
  const texto = filtro.trim().toLowerCase();
  const visibles = candidatos.filter((u) => !texto || `${nombreDe(u)} ${u.correo}`.toLowerCase().includes(texto));
  const sinCandidatos = candidatos.length === 0;

  const alternar = (id: string) => onChange({ valor, ids: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });

  return (
    // `min-w-0`: un fieldset no se encoge por debajo de su contenido más ancho y se saldría del modal
    <fieldset className="min-w-0">
      <legend className={etiqueta}>{titulo}</legend>
      <div className="space-y-1.5">
        {opciones.map((opcion) => {
          const activa = valor === opcion.valor;
          // Elegir miembros concretos solo tiene sentido cuando ya hay miembros
          const deshabilitada = opcion.valor === 'seleccionados' && sinCandidatos;
          return (
            <label
              key={opcion.valor}
              className={`flex items-start gap-3 px-3 py-2.5 rounded-ui border transition-colors ${
                deshabilitada
                  ? 'border-line bg-sunken opacity-60 cursor-not-allowed'
                  : activa
                    ? 'border-brand-text bg-brand-subtle cursor-pointer'
                    : 'border-line-strong bg-surface hover:bg-sunken cursor-pointer'
              }`}
            >
              <input
                type="radio"
                name={nombre}
                checked={activa}
                disabled={deshabilitada}
                onChange={() => onChange({ valor: opcion.valor, ids })}
                className="mt-1 size-4 accent-brand-text shrink-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{opcion.titulo}</span>
                {/* La descripción solo se muestra en la opción elegida, para ocupar menos espacio */}
                {deshabilitada ? (
                  <span className="block text-xs text-ink-subtle mt-0.5">Cuando el proyecto tenga miembros.</span>
                ) : (
                  activa && <span className="block text-xs text-ink-subtle mt-0.5">{opcion.descripcion}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {valor === 'seleccionados' && !sinCandidatos && (
        <div className="mt-3">
          <p className="text-sm font-medium text-ink mb-2">
            Miembros autorizados <span className="font-normal text-ink-subtle">({ids.length} elegidos)</span>
          </p>
          {candidatos.length > 6 && (
            <input
              type="search"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por nombre o correo..."
              aria-label="Filtrar miembros por nombre o correo"
              className={`${campo} mb-2`}
            />
          )}
          <div className="max-h-48 overflow-y-auto rounded-ui border border-line divide-y divide-line custom-scrollbar">
            {visibles.length === 0 ? (
              <p className="p-3 text-sm text-ink-subtle">No hay miembros que coincidan.</p>
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

export interface ValorPermisos {
  quienCreaEquipos: QuienCreaEquipos;
  idsCreadoresEquipos: string[];
  quienAgregaMiembros: QuienAgregaMiembros;
  idsGestoresMiembros: string[];
}

interface PermisosProyectoProps {
  valor: ValorPermisos;
  /** Miembros actuales del proyecto (sin el creador): entre ellos se elige a quién autorizar. */
  miembros: PerfilUsuario[];
  onChange: (valor: ValorPermisos) => void;
}

/** Permisos del proyecto que define su creador: quién crea equipos y quién agrega miembros. */
export default function PermisosProyecto({ valor, miembros, onChange }: PermisosProyectoProps) {
  return (
    <div className="space-y-4">
      <GrupoPermiso
        nombre="quien-crea-equipos"
        titulo="¿Quién puede crear equipos en este proyecto?"
        opciones={OPCIONES_CREAR_EQUIPOS}
        valor={valor.quienCreaEquipos}
        ids={valor.idsCreadoresEquipos}
        candidatos={miembros}
        onChange={({ valor: quien, ids }) => onChange({ ...valor, quienCreaEquipos: quien, idsCreadoresEquipos: ids })}
      />
      <GrupoPermiso
        nombre="quien-agrega-miembros"
        titulo="¿Quién puede agregar y quitar miembros?"
        opciones={OPCIONES_AGREGAR_MIEMBROS}
        valor={valor.quienAgregaMiembros}
        ids={valor.idsGestoresMiembros}
        candidatos={miembros}
        onChange={({ valor: quien, ids }) => onChange({ ...valor, quienAgregaMiembros: quien, idsGestoresMiembros: ids })}
      />
    </div>
  );
}
