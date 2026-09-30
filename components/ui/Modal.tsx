'use client';

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

// Pila de modales abiertos: solo el de arriba responde a Escape.
const pilaModales: string[] = [];

const ANCHOS = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
} as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: keyof typeof ANCHOS;
  children: React.ReactNode;
}

/**
 * Ventana modal compartida. Se cierra con Escape, con clic en el fondo o con
 * la X. El contenido va en `ModalBody` (con scroll) y `ModalFooter`; si hay un
 * formulario, debe envolver a ambos para que el botón de enviar funcione.
 */
export function Modal({ open, onClose, title, description, size = 'md', children }: ModalProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    pilaModales.push(id);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pilaModales[pilaModales.length - 1] === id) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // Enfocar el primer campo del modal (o el panel) al abrir
    const primerCampo = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
    );
    (primerCampo ?? panelRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const i = pilaModales.indexOf(id);
      if (i !== -1) pilaModales.splice(i, 1);
      if (pilaModales.length === 0) document.body.style.overflow = overflowPrevio;
    };
  }, [open, id]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        tabIndex={-1}
        className={`bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl w-full ${ANCHOS[size]} shadow-2xl max-h-[90vh] flex flex-col overflow-hidden outline-none animate-in zoom-in`}
      >
        <div className="px-5 sm:px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id={`${id}-titulo`} className="text-base font-bold text-zinc-900 dark:text-white tracking-tight">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar (Esc)"
            className="p-1.5 -mr-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ModalBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-5 sm:px-6 py-5 overflow-y-auto flex-1 min-h-0 custom-scrollbar ${className}`}>
      {children}
    </div>
  );
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 sm:px-6 py-3.5 border-t border-zinc-100 dark:border-zinc-800/80 shrink-0 flex items-center justify-end gap-2 bg-zinc-50/80 dark:bg-zinc-900/80">
      {children}
    </div>
  );
}
