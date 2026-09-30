'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, ModalBody, ModalFooter } from './Modal';
import { btnPeligro, btnPrimario, btnSecundario } from './estilos';

interface OpcionesConfirmacion {
  titulo: string;
  mensaje: React.ReactNode;
  textoConfirmar?: string;
  /** Acción destructiva: botón rojo e ícono de advertencia. */
  peligro?: boolean;
}

type Confirmar = (opciones: OpcionesConfirmacion) => Promise<boolean>;

const ConfirmContext = createContext<Confirmar>(async () => false);

/**
 * Diálogo de confirmación propio (reemplaza a `window.confirm`).
 * Uso: `const confirmar = useConfirm(); if (await confirmar({...})) { ... }`
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opciones, setOpciones] = useState<OpcionesConfirmacion | null>(null);
  const resolverRef = useRef<((valor: boolean) => void) | null>(null);

  const confirmar = useCallback<Confirmar>((nuevas) => {
    resolverRef.current?.(false);
    setOpciones(nuevas);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const responder = (valor: boolean) => {
    resolverRef.current?.(valor);
    resolverRef.current = null;
    setOpciones(null);
  };

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      <Modal
        open={opciones !== null}
        onClose={() => responder(false)}
        title={opciones?.titulo ?? ''}
        size="sm"
      >
        <ModalBody>
          <div className="flex gap-3">
            {opciones?.peligro && (
              <div className="w-8 h-8 shrink-0 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <AlertTriangle size={16} />
              </div>
            )}
            <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{opciones?.mensaje}</div>
          </div>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => responder(false)} className={btnSecundario}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => responder(true)}
            className={opciones?.peligro ? btnPeligro : btnPrimario}
          >
            {opciones?.textoConfirmar ?? 'Confirmar'}
          </button>
        </ModalFooter>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirmar {
  return useContext(ConfirmContext);
}
