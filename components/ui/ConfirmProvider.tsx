'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, ModalBody, ModalFooter } from './Modal';
import { btnPeligro, btnPrimario, btnSecundario, campo } from './estilos';

interface OpcionesConfirmacion {
  titulo: string;
  mensaje: React.ReactNode;
  textoConfirmar?: string;
  textoCancelar?: string;
  /** Acción destructiva: botón rojo e ícono de advertencia. */
  peligro?: boolean;
  /** Frase exacta que el usuario debe escribir para habilitar la confirmación. */
  confirmacionEscrita?: string;
  /** Etiqueta personalizada sobre el campo de confirmación escrita. */
  etiquetaConfirmacionEscrita?: React.ReactNode;
}

type Confirmar = (opciones: OpcionesConfirmacion) => Promise<boolean>;

const ConfirmContext = createContext<Confirmar>(async () => false);

/**
 * Diálogo de confirmación propio (reemplaza a `window.confirm`).
 * Uso: `const confirmar = useConfirm(); if (await confirmar({...})) { ... }`
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opciones, setOpciones] = useState<OpcionesConfirmacion | null>(null);
  const [textoEscrito, setTextoEscrito] = useState('');
  const resolverRef = useRef<((valor: boolean) => void) | null>(null);

  const confirmar = useCallback<Confirmar>((nuevas) => {
    resolverRef.current?.(false);
    setTextoEscrito('');
    setOpciones(nuevas);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const responder = (valor: boolean) => {
    resolverRef.current?.(valor);
    resolverRef.current = null;
    setTextoEscrito('');
    setOpciones(null);
  };

  const fraseRequerida = opciones?.confirmacionEscrita;
  const puedeConfirmar = !fraseRequerida || textoEscrito.trim() === fraseRequerida;

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
          <div className="space-y-4">
            <div className="flex gap-3">
              {opciones?.peligro && (
                <div className="w-8 h-8 shrink-0 rounded-full bg-danger-subtle text-danger flex items-center justify-center">
                  <AlertTriangle size={16} />
                </div>
              )}
              <div className="text-xs text-ink-muted leading-relaxed">{opciones?.mensaje}</div>
            </div>

            {fraseRequerida && (
              <div className="pt-3 border-t border-line space-y-2">
                <label htmlFor="confirm-written-input" className="block text-xs text-ink-muted leading-relaxed">
                  {opciones?.etiquetaConfirmacionEscrita ?? (
                    <>
                      Escribe{' '}
                      <code className="px-1.5 py-0.5 rounded bg-sunken border border-line text-ink font-mono font-semibold">
                        {fraseRequerida}
                      </code>{' '}
                      para confirmar
                    </>
                  )}
                </label>
                <input
                  id="confirm-written-input"
                  type="text"
                  value={textoEscrito}
                  onChange={(e) => setTextoEscrito(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (puedeConfirmar) responder(true);
                    }
                  }}
                  placeholder={fraseRequerida}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={campo}
                />
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => responder(false)} className={btnSecundario}>
            {opciones?.textoCancelar ?? 'Cancelar'}
          </button>
          <button
            type="button"
            disabled={!puedeConfirmar}
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
