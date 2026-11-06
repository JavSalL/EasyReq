'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Highlighter } from 'lucide-react';
import type { ElementoSintactico } from '@/lib/database.types';
import {
  claveElemento,
  construirLeyendaSintaxis,
  etiquetaElemento,
  extraerElementosPatron,
  resolverTonoElemento,
  segmentarTextoSintaxis,
  type ItemLeyendaSintaxis,
  type SegmentoSintaxis,
  type TonoSintaxis,
} from '@/lib/sintaxis-requerimiento';

/**
 * Clases estáticas por tono semántico (`--syntax-1`..`--syntax-6` en `app/globals.css`).
 * Nunca se interpolan nombres dinámicos para que el escáner estático de Tailwind v4 las incluya todas.
 */
const ESTILOS_TONO: Readonly<
  Record<
    TonoSintaxis,
    {
      marca: string;
      marcaEnfocada: string;
      chip: string;
      chipFijo: string;
      punto: string;
      etiqueta: string;
      bordeIzquierdo: string;
    }
  >
> = {
  1: {
    marca: 'bg-syntax-1-subtle/80 border-b-2 border-syntax-1-line text-ink',
    marcaEnfocada: 'bg-syntax-1-subtle border-b-2 border-syntax-1 text-ink ring-1 ring-syntax-1-line',
    chip: 'bg-syntax-1-subtle/70 border-syntax-1-line text-ink hover:border-syntax-1',
    chipFijo: 'bg-syntax-1-subtle border-syntax-1 text-ink ring-1 ring-syntax-1',
    punto: 'bg-syntax-1',
    etiqueta: 'text-syntax-1',
    bordeIzquierdo: 'border-syntax-1-line',
  },
  2: {
    marca: 'bg-syntax-2-subtle/80 border-b-2 border-syntax-2-line text-ink',
    marcaEnfocada: 'bg-syntax-2-subtle border-b-2 border-syntax-2 text-ink ring-1 ring-syntax-2-line',
    chip: 'bg-syntax-2-subtle/70 border-syntax-2-line text-ink hover:border-syntax-2',
    chipFijo: 'bg-syntax-2-subtle border-syntax-2 text-ink ring-1 ring-syntax-2',
    punto: 'bg-syntax-2',
    etiqueta: 'text-syntax-2',
    bordeIzquierdo: 'border-syntax-2-line',
  },
  3: {
    marca: 'bg-syntax-3-subtle/80 border-b-2 border-syntax-3-line text-ink',
    marcaEnfocada: 'bg-syntax-3-subtle border-b-2 border-syntax-3 text-ink ring-1 ring-syntax-3-line',
    chip: 'bg-syntax-3-subtle/70 border-syntax-3-line text-ink hover:border-syntax-3',
    chipFijo: 'bg-syntax-3-subtle border-syntax-3 text-ink ring-1 ring-syntax-3',
    punto: 'bg-syntax-3',
    etiqueta: 'text-syntax-3',
    bordeIzquierdo: 'border-syntax-3-line',
  },
  4: {
    marca: 'bg-syntax-4-subtle/80 border-b-2 border-syntax-4-line text-ink',
    marcaEnfocada: 'bg-syntax-4-subtle border-b-2 border-syntax-4 text-ink ring-1 ring-syntax-4-line',
    chip: 'bg-syntax-4-subtle/70 border-syntax-4-line text-ink hover:border-syntax-4',
    chipFijo: 'bg-syntax-4-subtle border-syntax-4 text-ink ring-1 ring-syntax-4',
    punto: 'bg-syntax-4',
    etiqueta: 'text-syntax-4',
    bordeIzquierdo: 'border-syntax-4-line',
  },
  5: {
    marca: 'bg-syntax-5-subtle/80 border-b-2 border-syntax-5-line text-ink',
    marcaEnfocada: 'bg-syntax-5-subtle border-b-2 border-syntax-5 text-ink ring-1 ring-syntax-5-line',
    chip: 'bg-syntax-5-subtle/70 border-syntax-5-line text-ink hover:border-syntax-5',
    chipFijo: 'bg-syntax-5-subtle border-syntax-5 text-ink ring-1 ring-syntax-5',
    punto: 'bg-syntax-5',
    etiqueta: 'text-syntax-5',
    bordeIzquierdo: 'border-syntax-5-line',
  },
  6: {
    marca: 'bg-syntax-6-subtle/80 border-b-2 border-syntax-6-line text-ink',
    marcaEnfocada: 'bg-syntax-6-subtle border-b-2 border-syntax-6 text-ink ring-1 ring-syntax-6-line',
    chip: 'bg-syntax-6-subtle/70 border-syntax-6-line text-ink hover:border-syntax-6',
    chipFijo: 'bg-syntax-6-subtle border-syntax-6 text-ink ring-1 ring-syntax-6',
    punto: 'bg-syntax-6',
    etiqueta: 'text-syntax-6',
    bordeIzquierdo: 'border-syntax-6-line',
  },
};

/**
 * Gestiona el foco interactivo de la simbología: pasar el cursor previsualiza un elemento
 * y hacer clic lo deja fijado mientras se recorre la lista.
 */
export function useFocoSintaxis() {
  const [claveFijada, setClaveFijada] = useState<string | null>(null);
  const [claveTemporal, setClaveTemporal] = useState<string | null>(null);

  const claveActiva = claveTemporal ?? claveFijada;

  const alternarFija = useCallback((clave: string) => {
    setClaveFijada(prev => (prev === clave ? null : clave));
  }, []);

  const limpiar = useCallback(() => {
    setClaveFijada(null);
    setClaveTemporal(null);
  }, []);

  return {
    claveActiva,
    claveFijada,
    setClaveTemporal,
    alternarFija,
    limpiar,
  };
}

export type ControlFocoSintaxis = ReturnType<typeof useFocoSintaxis>;

function descripcionChipLeyenda(item: ItemLeyendaSintaxis, fijado: boolean): string {
  const original = item.elemento.trim();
  const base =
    original.toLowerCase() !== item.etiqueta.toLowerCase()
      ? `${item.etiqueta} (${original})`
      : item.etiqueta;
  return fijado
    ? `${base} — clic para volver a mostrar todos los elementos`
    : `${base} — pasa el cursor o haz clic para aislar este elemento`;
}

export interface BarraSintaxisProps {
  activo: boolean;
  onCambiarActivo: (activo: boolean) => void;
  items: ReadonlyArray<ItemLeyendaSintaxis>;
  foco: ControlFocoSintaxis;
}

/**
 * Barra compacta con interruptor global de resaltado y simbología interactiva de colores.
 */
export function BarraSintaxis({ activo, onCambiarActivo, items, foco }: BarraSintaxisProps) {
  if (items.length === 0) return null;

  const handleToggle = () => {
    const siguiente = !activo;
    if (!siguiente) foco.limpiar();
    onCambiarActivo(siguiente);
  };

  return (
    <div
      role="region"
      aria-label="Simbología de elementos sintácticos"
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-ui border border-line bg-sunken/40 px-3 py-2 text-xs"
    >
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        onClick={handleToggle}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-ui border font-semibold transition-colors cursor-pointer ${
          activo
            ? 'bg-brand-subtle border-brand-line text-brand-text'
            : 'bg-surface border-line-strong text-ink-muted hover:bg-sunken'
        }`}
      >
        <Highlighter size={13} aria-hidden />
        <span>Resaltar sintaxis</span>
      </button>

      {activo ? (
        <>
          <span className="text-[11px] font-medium text-ink-subtle select-none">Simbología:</span>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Elementos del patrón">
            {items.map(item => {
              const estilos = ESTILOS_TONO[item.tono];
              const fijado = foco.claveFijada === item.clave;
              const atenuado = foco.claveActiva !== null && foco.claveActiva !== item.clave;
              return (
                <button
                  key={item.clave}
                  type="button"
                  aria-pressed={fijado}
                  title={descripcionChipLeyenda(item, fijado)}
                  onClick={() => foco.alternarFija(item.clave)}
                  onMouseEnter={() => foco.setClaveTemporal(item.clave)}
                  onMouseLeave={() => foco.setClaveTemporal(null)}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-ui border text-[11px] font-medium transition-all cursor-pointer ${
                    fijado ? estilos.chipFijo : estilos.chip
                  } ${atenuado ? 'opacity-50' : ''}`}
                >
                  <span className={`size-2 rounded-full shrink-0 ${estilos.punto}`} aria-hidden />
                  <span>{item.etiqueta}</span>
                </button>
              );
            })}
          </div>
          {foco.claveFijada && (
            <button
              type="button"
              onClick={foco.limpiar}
              className="text-[11px] font-semibold text-brand-text hover:underline cursor-pointer ml-auto"
            >
              Ver todos
            </button>
          )}
        </>
      ) : (
        <span className="text-[11px] text-ink-subtle">
          Activa el resaltado para distinguir los elementos del patrón en cada enunciado.
        </span>
      )}
    </div>
  );
}

export interface TextoConSintaxisProps {
  texto: string;
  elementos?: ReadonlyArray<ElementoSintactico> | null;
  mapaTonos?: ReadonlyMap<string, TonoSintaxis>;
  claveEnfocada?: string | null;
  className?: string;
}

/**
 * Renderiza el enunciado subrayando y coloreando sutilmente cada componente sintáctico identificado.
 * Conserva exactamente el texto íntegro del requerimiento.
 */
export function TextoConSintaxis({
  texto,
  elementos,
  mapaTonos,
  claveEnfocada = null,
  className = '',
}: TextoConSintaxisProps) {
  const segmentos = useMemo(
    () => segmentarTextoSintaxis(texto, elementos, mapaTonos),
    [texto, elementos, mapaTonos]
  );

  const tieneElementos = useMemo(
    () => segmentos.some(s => s.tipo === 'elemento'),
    [segmentos]
  );

  if (!tieneElementos) {
    return <span className={className}>{texto}</span>;
  }

  return (
    <span className={className}>
      {segmentos.map((seg, idx) => {
        if (seg.tipo === 'texto') {
          return (
            <span
              key={idx}
              className={claveEnfocada ? 'opacity-45 transition-opacity' : 'transition-opacity'}
            >
              {seg.texto}
            </span>
          );
        }

        const estilos = ESTILOS_TONO[seg.tono];
        const esEnfocado = claveEnfocada === seg.clave;
        const atenuado = claveEnfocada !== null && !esEnfocado;

        return (
          <mark
            key={idx}
            title={`${seg.etiqueta}: ${seg.texto}`}
            className={`px-1 py-px rounded-[3px] font-normal transition-opacity ${
              esEnfocado ? estilos.marcaEnfocada : estilos.marca
            } ${atenuado ? 'opacity-35' : ''}`}
          >
            {seg.texto}
          </mark>
        );
      })}
    </span>
  );
}

export interface BotonDesgloseSintaxisProps {
  abierto: boolean;
  onAlternar: () => void;
  cantidad: number;
}

/** Botón discreto por tarjeta para desplegar bajo demanda la ficha de elementos sintácticos. */
export function BotonDesgloseSintaxis({ abierto, onAlternar, cantidad }: BotonDesgloseSintaxisProps) {
  if (cantidad <= 0) return null;
  return (
    <button
      type="button"
      aria-expanded={abierto}
      onClick={onAlternar}
      title={abierto ? 'Ocultar el desglose de elementos del patrón' : 'Ver el desglose de elementos del patrón'}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-ui text-[11px] font-medium border transition-colors cursor-pointer ${
        abierto
          ? 'bg-brand-subtle text-brand-text border-brand-line'
          : 'bg-surface text-ink-muted border-line hover:bg-sunken hover:text-ink'
      }`}
    >
      <span>Sintaxis ({cantidad})</span>
      {abierto ? <ChevronUp size={11} aria-hidden /> : <ChevronDown size={11} aria-hidden />}
    </button>
  );
}

export interface DesgloseSintaxisProps {
  texto: string;
  elementos: ReadonlyArray<ElementoSintactico>;
  patron?: string | null;
  mapaTonos?: ReadonlyMap<string, TonoSintaxis>;
}

/**
 * Ficha individual desplegable bajo demanda con la lista clave-valor de elementos sintácticos.
 * Avisa si algún marcador del patrón dejó de coincidir tras editar manualmente el texto.
 */
export function DesgloseSintaxis({ texto, elementos, patron, mapaTonos }: DesgloseSintaxisProps) {
  const { encontrados, ausentes } = useMemo(() => {
    const segmentos = segmentarTextoSintaxis(texto, elementos, mapaTonos);
    const activos = segmentos.filter(
      (s): s is Extract<SegmentoSintaxis, { tipo: 'elemento' }> => s.tipo === 'elemento'
    );
    const clavesActivas = new Set(activos.map(a => a.clave));

    const esperados = extraerElementosPatron(patron);
    const faltanDelPatron = esperados
      .filter(slot => !clavesActivas.has(claveElemento(slot)))
      .map(slot => ({
        clave: claveElemento(slot),
        etiqueta: etiquetaElemento(slot),
        tono: resolverTonoElemento(slot, mapaTonos),
      }));

    // Si no se conoce la plantilla pero un elemento original dejó de aparecer tras editar el enunciado
    const faltanDeOriginales =
      esperados.length === 0
        ? elementos
            .filter(e => e.elemento?.trim() && !clavesActivas.has(claveElemento(e.elemento)))
            .map(e => ({
              clave: claveElemento(e.elemento),
              etiqueta: etiquetaElemento(e.elemento),
              tono: resolverTonoElemento(e.elemento, mapaTonos),
            }))
        : [];

    return {
      encontrados: activos,
      ausentes: [...faltanDelPatron, ...faltanDeOriginales],
    };
  }, [texto, elementos, patron, mapaTonos]);

  if (encontrados.length === 0 && ausentes.length === 0) return null;

  return (
    <dl
      aria-label="Desglose de elementos sintácticos"
      className="grid grid-cols-1 sm:grid-cols-[max-content_1fr] gap-x-3 gap-y-1 rounded-ui border border-line bg-sunken/50 px-3 py-2 text-xs animate-in fade-in"
    >
      {encontrados.map((item, idx) => {
        const estilos = ESTILOS_TONO[item.tono];
        return (
          <React.Fragment key={`${item.clave}-${idx}`}>
            <dt className="flex items-center gap-1.5 font-semibold text-ink">
              <span className={`size-2 rounded-full shrink-0 ${estilos.punto}`} aria-hidden />
              <span className={estilos.etiqueta}>{item.etiqueta}:</span>
            </dt>
            <dd className="text-ink-muted leading-snug break-words">{item.texto}</dd>
          </React.Fragment>
        );
      })}
      {ausentes.map(item => (
        <React.Fragment key={`ausente-${item.clave}`}>
          <dt className="flex items-center gap-1.5 font-medium text-ink-subtle">
            <span className="size-2 rounded-full shrink-0 border border-line-strong" aria-hidden />
            <span>{item.etiqueta}:</span>
          </dt>
          <dd className="text-ink-subtle italic leading-snug">No detectado en el enunciado actual</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

export interface VistaPreviaSintaxisProps {
  texto: string;
  elementos: ReadonlyArray<ElementoSintactico>;
  patron?: string | null;
}

/**
 * Vista previa en vivo para el formulario de creación/edición individual de un requerimiento.
 * Acompaña al textarea sin estorbar la escritura y se actualiza conforme cambia el enunciado.
 */
export function VistaPreviaSintaxis({ texto, elementos, patron }: VistaPreviaSintaxisProps) {
  const foco = useFocoSintaxis();
  const [verDesglose, setVerDesglose] = useState(false);

  const { items, mapaTonos } = useMemo(
    () => construirLeyendaSintaxis([elementos], patron),
    [elementos, patron]
  );

  const cantidadActiva = useMemo(
    () =>
      segmentarTextoSintaxis(texto, elementos, mapaTonos).filter(s => s.tipo === 'elemento').length,
    [texto, elementos, mapaTonos]
  );

  if (!texto.trim() || items.length === 0) return null;

  return (
    <div className="mt-2 rounded-ui border border-line bg-sunken/35 p-3 space-y-2 animate-in fade-in">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-muted mr-1">
          <Highlighter size={12} className="text-brand-text" aria-hidden />
          Elementos del patrón:
        </span>
        {items.map(item => {
          const estilos = ESTILOS_TONO[item.tono];
          const fijado = foco.claveFijada === item.clave;
          return (
            <button
              key={item.clave}
              type="button"
              aria-pressed={fijado}
              title={descripcionChipLeyenda(item, fijado)}
              onClick={() => foco.alternarFija(item.clave)}
              onMouseEnter={() => foco.setClaveTemporal(item.clave)}
              onMouseLeave={() => foco.setClaveTemporal(null)}
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-ui border text-[11px] font-medium transition-all cursor-pointer ${
                fijado ? estilos.chipFijo : estilos.chip
              }`}
            >
              <span className={`size-2 rounded-full shrink-0 ${estilos.punto}`} aria-hidden />
              <span>{item.etiqueta}</span>
            </button>
          );
        })}
        <div className="ml-auto">
          <BotonDesgloseSintaxis
            abierto={verDesglose}
            onAlternar={() => setVerDesglose(v => !v)}
            cantidad={cantidadActiva || elementos.length}
          />
        </div>
      </div>

      <p className="text-sm text-ink leading-relaxed bg-surface border border-line rounded-ui px-3 py-2">
        <TextoConSintaxis
          texto={texto}
          elementos={elementos}
          mapaTonos={mapaTonos}
          claveEnfocada={foco.claveActiva}
        />
      </p>

      {verDesglose && (
        <DesgloseSintaxis
          texto={texto}
          elementos={elementos}
          patron={patron}
          mapaTonos={mapaTonos}
        />
      )}
    </div>
  );
}

