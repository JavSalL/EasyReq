'use client';

import React, { useId, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { PerfilUsuario } from '@/lib/database.types';
import { etiqueta } from '@/components/ui/estilos';

const nombreDe = (u: PerfilUsuario) => u.nombre || u.correo;
const iniciales = (u: PerfilUsuario) => nombreDe(u).slice(0, 2).toUpperCase();

/** Caracteres mínimos para buscar: así nunca se muestra el directorio completo de usuarios. */
const MIN_CARACTERES = 2;
const MAX_RESULTADOS = 6;

interface BuscadorPersonasProps {
  /** Personas entre las que se busca. Nunca se listan todas: solo las que coinciden con lo escrito. */
  candidatos: PerfilUsuario[];
  valor: string[];
  onChange: (ids: string[]) => void;
  titulo?: string;
  /** Texto bajo el campo. */
  ayuda?: string;
  /** Con `false` solo se elige una persona (la nueva reemplaza a la anterior). */
  multiple?: boolean;
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
}

/**
 * Buscador de personas al estilo de "Add people" de GitHub: se escribe un nombre o correo y
 * aparecen solo las coincidencias; las elegidas quedan como fichas encima del campo.
 */
export default function BuscadorPersonas({
  candidatos,
  valor,
  onChange,
  titulo = 'Miembros',
  ayuda,
  multiple = true,
  placeholder = 'Busca por nombre o correo...',
  id,
  autoFocus
}: BuscadorPersonasProps) {
  const idGenerado = useId();
  const inputId = id ?? `buscador-${idGenerado}`;
  const listaId = `${inputId}-resultados`;
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const termino = texto.trim().toLowerCase();
  const buscando = termino.length >= MIN_CARACTERES;
  const resultados = buscando
    ? candidatos
        .filter((u) => !valor.includes(u.id))
        .map((u) => {
          const nombre = nombreDe(u).toLowerCase();
          const correo = (u.correo || '').toLowerCase();
          // Primero lo que empieza igual (nombre, alguna palabra del nombre o el correo), luego lo que lo contiene
          const empieza =
            nombre.startsWith(termino) || correo.startsWith(termino) || nombre.split(/\s+/).some((p) => p.startsWith(termino));
          const contiene = nombre.includes(termino) || correo.includes(termino);
          return { u, puntos: empieza ? 2 : contiene ? 1 : 0 };
        })
        .filter((r) => r.puntos > 0)
        .sort((a, b) => b.puntos - a.puntos || nombreDe(a.u).localeCompare(nombreDe(b.u)))
        .slice(0, MAX_RESULTADOS)
        .map((r) => r.u)
    : [];

  const elegidos = valor
    .map((id) => candidatos.find((u) => u.id === id))
    .filter((u): u is PerfilUsuario => Boolean(u));

  const elegir = (u: PerfilUsuario) => {
    onChange(multiple ? [...valor, u.id] : [u.id]);
    setTexto('');
    setActivo(0);
    setAbierto(false);
    inputRef.current?.focus();
  };

  const quitar = (idQuitar: string) => onChange(valor.filter((x) => x !== idQuitar));

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && resultados.length > 0) {
      e.preventDefault();
      setAbierto(true);
      setActivo((a) => (a + 1) % resultados.length);
    } else if (e.key === 'ArrowUp' && resultados.length > 0) {
      e.preventDefault();
      setActivo((a) => (a - 1 + resultados.length) % resultados.length);
    } else if (e.key === 'Enter') {
      // Enter elige el resultado resaltado y nunca envía el formulario que lo contiene
      e.preventDefault();
      if (abierto && resultados[activo]) elegir(resultados[activo]);
    } else if (e.key === 'Escape' && abierto) {
      e.stopPropagation();
      setAbierto(false);
    } else if (e.key === 'Backspace' && !texto && valor.length > 0 && multiple) {
      quitar(valor[valor.length - 1]);
    }
  };

  const mostrarLista = abierto && buscando;

  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className={etiqueta}>
        {titulo}
        {multiple && valor.length > 0 && (
          <span className="font-normal text-ink-subtle"> ({valor.length} {valor.length === 1 ? 'elegida' : 'elegidas'})</span>
        )}
      </label>

      {elegidos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2" aria-label="Personas elegidas">
          {elegidos.map((u) => (
            <li
              key={u.id}
              className="inline-flex items-center gap-1.5 pl-1 pr-1 py-0.5 rounded-full bg-brand-subtle border border-brand-line text-sm text-brand-text max-w-full"
            >
              <span className="size-5 shrink-0 rounded-full bg-surface text-[10px] font-bold flex items-center justify-center">
                {iniciales(u)}
              </span>
              <span className="truncate" title={u.correo}>{nombreDe(u)}</span>
              <button
                type="button"
                onClick={() => quitar(u.id)}
                aria-label={`Quitar a ${nombreDe(u)}`}
                className="size-5 shrink-0 rounded-full flex items-center justify-center hover:bg-surface cursor-pointer"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-subtle">
          <Search size={14} aria-hidden />
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={mostrarLista}
          aria-controls={listaId}
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          value={texto}
          placeholder={placeholder}
          onChange={(e) => {
            setTexto(e.target.value);
            setActivo(0);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          // El retraso deja que el clic en un resultado llegue antes de cerrar la lista
          onBlur={() => setTimeout(() => setAbierto(false), 150)}
          onKeyDown={alTeclear}
          className="w-full pl-9 pr-3 min-h-10 pointer-coarse:min-h-11 py-2 bg-surface border border-line-strong rounded-ui text-base text-ink placeholder:text-ink-subtle focus:outline-none focus:border-brand-text focus:ring-1 focus:ring-brand-text"
        />

        {mostrarLista && (
          <ul
            id={listaId}
            role="listbox"
            className="absolute z-20 left-0 right-0 mt-1 bg-surface border border-line-strong rounded-ui shadow-lg overflow-hidden"
          >
            {resultados.length === 0 ? (
              <li className="px-3 py-3 text-sm text-ink-subtle">Nadie coincide con «{texto.trim()}».</li>
            ) : (
              resultados.map((u, i) => (
                <li
                  key={u.id}
                  role="option"
                  aria-selected={i === activo}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(u)}
                  onMouseEnter={() => setActivo(i)}
                  className={`flex items-center gap-3 px-3 min-h-11 cursor-pointer ${i === activo ? 'bg-sunken' : ''}`}
                >
                  <span className="size-7 shrink-0 rounded-full bg-brand-subtle text-brand-text text-[11px] font-bold flex items-center justify-center">
                    {iniciales(u)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink truncate">{nombreDe(u)}</span>
                    <span className="block text-xs text-ink-subtle truncate">{u.correo}</span>
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <p className="text-xs text-ink-subtle mt-1.5">
        {ayuda ?? `Escribe al menos ${MIN_CARACTERES} letras del nombre o correo de la persona.`}
      </p>
    </div>
  );
}
