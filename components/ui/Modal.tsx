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
  /** Si es false, un clic en el fondo no cierra el modal (formularios con cambios sin guardar). */
  cerrarConFondo?: boolean;
  /** Si es false, el modal no se puede cerrar (ni Esc, ni clic fuera, ni X): es un paso obligatorio. */
  cerrable?: boolean;
  children: React.ReactNode;
}

/**
 * Ventana modal compartida. Se cierra con Escape, con clic en el fondo o con
 * la X. El contenido va en `ModalBody` (con scroll) y `ModalFooter`; si hay un
 * formulario, debe envolver a ambos para que el botón de enviar funcione.
 */
export function Modal({ open, onClose, title, description, size = 'md', cerrarConFondo = true, cerrable = true, children }: ModalProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const cerrableRef = useRef(cerrable);
  useEffect(() => {
    onCloseRef.current = onClose;
    cerrableRef.current = cerrable;
  }, [onClose, cerrable]);

  useEffect(() => {
    if (!open) return;
    pilaModales.push(id);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (pilaModales[pilaModales.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (cerrableRef.current) onCloseRef.current();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        // Ctrl/Cmd + Enter envía el formulario del modal desde cualquier campo
        const formulario = panelRef.current?.querySelector('form');
        if (formulario) {
          e.preventDefault();
          formulario.requestSubmit();
        }
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-scrim animate-in fade-in"
      onMouseDown={(e) => {
        if (cerrable && cerrarConFondo && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        tabIndex={-1}
        className={`bg-surface border border-line rounded-ui w-full ${ANCHOS[size]} max-h-[90vh] flex flex-col overflow-hidden outline-none animate-in zoom-in`}
      >
        <div className="px-5 sm:px-6 py-4 border-b border-line flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h3 id={`${id}-titulo`} className="text-base font-bold text-ink ">
              {title}
            </h3>
            {description && (
              <p className="text-xs text-ink-subtle mt-0.5">{description}</p>
            )}
          </div>
          {cerrable && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              title="Cerrar (Esc)"
              className="p-1.5 -mr-1.5 rounded-ui text-ink-subtle hover:text-ink-muted hover:bg-sunken transition-colors cursor-pointer shrink-0"
            >
              <X size={18} />
            </button>
          )}
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
    <div className="px-5 sm:px-6 py-3.5 border-t border-line shrink-0 flex items-center justify-end gap-2 bg-sunken">
      {children}
    </div>
  );
}
