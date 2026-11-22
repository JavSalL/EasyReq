'use client';

import React, { useCallback, useSyncExternalStore } from 'react';
import { CircleHelp, Lightbulb, X } from 'lucide-react';

const prefijo = 'easyreq:pista:';

const evento = 'easyreq:pistas';

function leer(clave: string): boolean {
  try {
    return window.localStorage.getItem(prefijo + clave) !== 'oculta';
  } catch {
    return true;
  }
}

function suscribir(aviso: () => void) {
  window.addEventListener(evento, aviso);
  window.addEventListener('storage', aviso);
  return () => {
    window.removeEventListener(evento, aviso);
    window.removeEventListener('storage', aviso);
  };
}

/**
 * Estado de las pistas de una sección. Se muestran hasta que la persona las
 * oculta; el botón (?) las vuelve a mostrar. En el render del servidor quedan
 * ocultas para que no parpadeen al cargar.
 */
export function usePista(clave: string) {
  const visible = useSyncExternalStore(suscribir, () => leer(clave), () => false);

  const guardar = useCallback(
    (mostrar: boolean) => {
      try {
        if (mostrar) window.localStorage.removeItem(prefijo + clave);
        else window.localStorage.setItem(prefijo + clave, 'oculta');
      } catch {
        // Sin almacenamiento: la pista volverá a salir en la próxima visita
      }
      window.dispatchEvent(new Event(evento));
    },
    [clave]
  );

  const ocultar = useCallback(() => guardar(false), [guardar]);
  const alternar = useCallback(() => guardar(!leer(clave)), [guardar, clave]);

  return { visible, ocultar, alternar };
}

/**
 * Explicación corta de una sección, en su sitio y sin tapar nada. Se cierra
 * con la X y no vuelve a salir hasta que la persona pulse (?).
 */
export function Pista({
  visible,
  onOcultar,
  titulo,
  children,
  className = '',
}: {
  visible: boolean;
  onOcultar: () => void;
  titulo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!visible) return null;
  return (
    <aside
      aria-label={titulo ?? 'Pista'}
      className={`flex items-start gap-3 rounded-ui bg-brand-subtle text-ink px-4 py-3 animate-in fade-in ${className}`}
    >
      <Lightbulb size={18} aria-hidden className="mt-0.5 shrink-0 text-brand-text" />
      <div className="flex-1 min-w-0 text-sm leading-relaxed [&>*]:max-w-[75ch]">
        {titulo && <p className="font-semibold">{titulo}</p>}
        <div className="text-ink-muted">{children}</div>
      </div>
      <button
        type="button"
        onClick={onOcultar}
        aria-label="Ocultar esta pista"
        title="Ocultar (la puedes volver a ver con el botón ?)"
        className="-m-1 p-1 rounded-ui text-ink-subtle hover:text-ink hover:bg-surface/60 transition-colors cursor-pointer"
      >
        <X size={16} />
      </button>
    </aside>
  );
}

/** Ayuda breve debajo de un campo; solo aparece mientras las pistas están visibles. */
export function PistaCampo({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  if (!visible) return null;
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-muted">
      <Lightbulb size={14} aria-hidden className="mt-[3px] shrink-0 text-brand-text" />
      <span>{children}</span>
    </p>
  );
}

/** Botón (?) junto a un título: muestra u oculta las pistas de esa sección. */
export function BotonPista({ activo, onClick }: { activo: boolean; onClick: () => void }) {
  const label = activo ? 'Ocultar las pistas' : 'Mostrar las pistas';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={activo}
      title={label}
      className={`inline-flex items-center justify-center size-7 rounded-full transition-colors cursor-pointer align-middle ${
        activo ? 'text-brand-text bg-brand-subtle' : 'text-ink-subtle hover:text-brand-text hover:bg-sunken'
      }`}
    >
      <CircleHelp size={17} />
    </button>
  );
}
