'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, CircleHelp, X } from 'lucide-react';

export interface PasoTour {
  /** id del elemento a resaltar. Si no está en pantalla, el paso se salta. */
  objetivo: string;
  titulo: string;
  texto: React.ReactNode;
}

interface TourGuiadoProps {
  abierto: boolean;
  pasos: PasoTour[];
  onTerminar: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MARGEN = 6; // aire alrededor del elemento resaltado
const ANCHO_TARJETA = 320;

/**
 * Recorrido guiado: oscurece la pantalla, deja "encendido" un elemento a la vez
 * y explica para qué sirve en una tarjeta con Anterior / Siguiente.
 * Se cierra con Escape, con la X o al terminar. Las flechas del teclado avanzan y retroceden.
 */
export default function TourGuiado({ abierto, pasos, onTerminar }: TourGuiadoProps) {
  if (!abierto || typeof document === 'undefined') return null;
  return <TourActivo pasos={pasos} onTerminar={onTerminar} />;
}

function TourActivo({ pasos, onTerminar }: Omit<TourGuiadoProps, 'abierto'>) {
  const abierto = true;
  const [indice, setIndice] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const tarjetaRef = useRef<HTMLDivElement>(null);
  const [altoTarjeta, setAltoTarjeta] = useState(180);

  // Solo los pasos cuyo elemento existe ahora (p. ej. el enunciado no está en modo "varios")
  const [visibles] = useState(() => pasos.filter(p => document.getElementById(p.objetivo)));
  // Si no hay nada que mostrar, la guía se cierra sola
  useEffect(() => {
    if (visibles.length === 0) onTerminar();
  }, [visibles.length, onTerminar]);

  const paso = visibles[indice];

  const medir = useCallback(() => {
    if (!paso) return;
    const el = document.getElementById(paso.objetivo);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [paso]);

  // Al cambiar de paso: llevar el elemento a la vista y medirlo
  useEffect(() => {
    if (!abierto || !paso) return;
    const el = document.getElementById(paso.objetivo);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const frame = window.requestAnimationFrame(medir);
    // El scroll suave tarda un poco; se vuelve a medir cuando termina
    const t = window.setTimeout(medir, 350);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(t);
    };
  }, [abierto, paso, medir]);

  // Seguir al elemento si cambia el tamaño de la ventana o se hace scroll en el modal
  useEffect(() => {
    if (!abierto) return;
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [abierto, medir]);

  useLayoutEffect(() => {
    if (tarjetaRef.current) setAltoTarjeta(tarjetaRef.current.offsetHeight);
  }, [paso, rect]);

  const terminar = useCallback(() => {
    setRect(null);
    onTerminar();
  }, [onTerminar]);

  const siguiente = useCallback(() => {
    if (indice >= visibles.length - 1) terminar();
    else setIndice(i => i + 1);
  }, [indice, visibles.length, terminar]);

  const anterior = useCallback(() => setIndice(i => Math.max(0, i - 1)), []);

  // Teclado. Se escucha en fase de captura para que Escape cierre el tour y no el modal de abajo.
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        terminar();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        siguiente();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        anterior();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [abierto, terminar, siguiente, anterior]);

  if (!paso) return null;

  // Posición de la tarjeta: debajo del elemento si cabe; si no, arriba; si tampoco, centrada abajo
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ancho = Math.min(ANCHO_TARJETA, vw - 24);
  let top = vh - altoTarjeta - 16;
  let left = (vw - ancho) / 2;
  if (rect) {
    const abajo = rect.top + rect.height + MARGEN + 12;
    const arriba = rect.top - MARGEN - 12 - altoTarjeta;
    if (abajo + altoTarjeta <= vh - 8) top = abajo;
    else if (arriba >= 8) top = arriba;
    left = Math.min(Math.max(12, rect.left), vw - ancho - 12);
  }

  return createPortal(
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      {/* Capa que bloquea los clics mientras dura el recorrido */}
      <div className="absolute inset-0" onMouseDown={(e) => e.preventDefault()} />

      {/* Hueco iluminado: la sombra enorme oscurece todo lo demás */}
      {rect ? (
        <div
          className="absolute rounded-ui ring-2 ring-brand-text pointer-events-none transition-all duration-300 ease-out"
          style={{
            top: rect.top - MARGEN,
            left: rect.left - MARGEN,
            width: rect.width + MARGEN * 2,
            height: rect.height + MARGEN * 2,
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.6)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      <div
        ref={tarjetaRef}
        role="dialog"
        aria-label={`Guía: ${paso.titulo}`}
        className="absolute bg-surface border border-line-strong ring-1 ring-black/15 dark:ring-white/20 rounded-ui shadow-2xl p-4 transition-[top,left] duration-300 ease-out"
        style={{ top, left, width: ancho }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold text-brand-text">
            Paso {indice + 1} de {visibles.length}
          </p>
          <button
            type="button"
            onClick={terminar}
            aria-label="Cerrar la guía"
            title="Cerrar la guía (Esc)"
            className="p-1 -m-1 rounded-ui text-ink-subtle hover:text-ink hover:bg-sunken transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        <h4 className="mt-1 text-sm font-bold text-ink">{paso.titulo}</h4>
        <div className="mt-1.5 text-sm text-ink-muted leading-relaxed">{paso.texto}</div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={terminar}
            className="text-xs font-semibold text-ink-subtle hover:text-ink cursor-pointer"
          >
            Saltar guía
          </button>
          <div className="flex items-center gap-1.5">
            {indice > 0 && (
              <button
                type="button"
                onClick={anterior}
                className="inline-flex items-center gap-1 px-2.5 min-h-8 rounded-ui border border-line-strong bg-surface text-ink text-xs font-semibold hover:bg-sunken cursor-pointer"
              >
                <ChevronLeft size={14} aria-hidden />
                Anterior
              </button>
            )}
            <button
              type="button"
              onClick={siguiente}
              autoFocus
              className="inline-flex items-center gap-1 px-3 min-h-8 rounded-ui bg-brand-solid hover:bg-brand-solid-hover text-on-solid text-xs font-semibold cursor-pointer"
            >
              {indice >= visibles.length - 1 ? '¡Entendido!' : 'Siguiente'}
              {indice < visibles.length - 1 && <ChevronRight size={14} aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

const VENTANA_CUENTA_NUEVA_MS = 24 * 60 * 60 * 1000;

/**
 * Devuelve true solo si la cuenta se creó hace menos de 24 horas.
 * Evita interrumpir con guías automáticas a usuarios que ya llevan tiempo en la app.
 */
export function esCuentaNueva(creationTime?: string | null): boolean {
  if (!creationTime) return false;
  const creada = Date.parse(creationTime);
  if (Number.isNaN(creada)) return false;
  return Date.now() - creada <= VENTANA_CUENTA_NUEVA_MS;
}

/**
 * Controla un recorrido guiado por sección:
 * - Se abre solo la primera vez cuando `autoAbrir` es true.
 * - Siempre permite abrirlo manualmente con `abrir` (p. ej. desde el botón ?).
 */
export function useTutorialSeccion(clave: string, uid: string | null, autoAbrir: boolean) {
  const [abierto, setAbierto] = useState(false);
  const storageKey = uid ? `easyreq:tour:${clave}:${uid}` : `easyreq:tour:${clave}`;

  useEffect(() => {
    if (!uid || !autoAbrir) return;
    try {
      if (window.localStorage.getItem(storageKey) === '1') return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => setAbierto(true), 450);
    return () => window.clearTimeout(t);
  }, [uid, autoAbrir, storageKey]);

  const abrir = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => {
    setAbierto(false);
    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      // Sin almacenamiento: la guía podrá volver a salir
    }
  }, [storageKey]);

  return { abierto, abrir, cerrar };
}

/** Botón discreto (?) junto al título de una página o modal para abrir su guía. */
export function BotonAyudaTour({
  onClick,
  label = 'Ver la guía de esta sección',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center size-7 rounded-full text-ink-subtle hover:text-brand-text hover:bg-sunken transition-colors cursor-pointer align-middle"
    >
      <CircleHelp size={17} />
    </button>
  );
}
