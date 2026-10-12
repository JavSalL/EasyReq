'use client';

import React from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { LogRequerimiento, Requerimiento } from '@/lib/database.types';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { fechaCompleta } from '@/lib/fechas';
import { btnSecundario } from '@/components/ui/estilos';

interface ModalHistorialLogsProps {
  open: boolean;
  onClose: () => void;
  requerimiento: Requerimiento | null;
  logs: LogRequerimiento[];
  loading: boolean;
  error: string | null;
  nombreUsuario: (id: string | null | undefined) => string | null;
  codigoDe: (req: Requerimiento) => string | null;
  puedeRestaurar: boolean;
  restoringLogId: string | null;
  onRestore: (log: LogRequerimiento) => void;
}

export default function ModalHistorialLogs({
  open,
  onClose,
  requerimiento,
  logs,
  loading,
  error,
  nombreUsuario,
  codigoDe,
  puedeRestaurar,
  restoringLogId,
  onRestore,
}: ModalHistorialLogsProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        requerimiento && codigoDe(requerimiento)
          ? `Historial de ${codigoDe(requerimiento)}`
          : 'Historial de Cambios'
      }
      description="Quién modificó el requerimiento y cuándo."
      size="lg"
    >
      <ModalBody className="space-y-3">
        {requerimiento && (
          <p className="font-mono text-xs text-ink-muted line-clamp-2 border-l-2 border-line-strong pl-2">
            {requerimiento.enunciado}
          </p>
        )}
        {loading ? (
          [1, 2].map((i) => (
            <div key={i} className="h-14 bg-sunken rounded-ui animate-pulse" />
          ))
        ) : error ? (
          <p role="alert" className="text-xs text-danger text-center py-6">{error}</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-ink-subtle text-center py-6">No hay registros de cambios todavía.</p>
        ) : (
          <ol className="space-y-2">
            {logs.map((log) => {
              const autor = (
                (log.autor && (log.autor.nombre || log.autor.correo)) ||
                nombreUsuario(log.id_autor)
              ) || 'Usuario no disponible';
              const detalles = log.detalles;
              const campos = Array.isArray(detalles?.campos)
                ? detalles.campos.filter((campo): campo is string => typeof campo === 'string')
                : [];
              const tieneVersionAnterior = typeof detalles?.enunciado_anterior === 'string';
              const tieneVersionNueva = typeof detalles?.enunciado_nuevo === 'string';
              const fechaValida = !!log.fecha_hora && !Number.isNaN(Date.parse(log.fecha_hora));
              return (
                <li key={log.id} className="p-3 bg-sunken rounded-ui border border-line text-xs space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-ink">{log.accion}</span>
                    {fechaValida ? (
                      <time className="text-xs text-ink-subtle shrink-0" dateTime={log.fecha_hora}>
                        {fechaCompleta(log.fecha_hora)}
                      </time>
                    ) : (
                      <span className="text-xs text-ink-subtle shrink-0">Fecha no disponible</span>
                    )}
                  </div>
                  {detalles?.estado_anterior !== undefined && typeof detalles?.estado_nuevo === 'string' && (
                    <p className="text-xs text-ink-subtle flex items-center gap-1">
                      {typeof detalles.estado_anterior === 'string' && detalles.estado_anterior
                        ? detalles.estado_anterior
                        : 'Sin estado'}
                      <ArrowRight size={11} />
                      {detalles.estado_nuevo}
                    </p>
                  )}
                  {typeof detalles?.de === 'string' && typeof detalles?.a === 'string' && (
                    <p className="text-xs text-ink-subtle flex items-center gap-1">
                      {detalles.de}
                      <ArrowRight size={11} />
                      {detalles.a}
                    </p>
                  )}
                  {typeof detalles?.inicio === 'string' && (
                    <p className="text-xs text-ink-subtle">{detalles.inicio}</p>
                  )}
                  {tieneVersionAnterior && tieneVersionNueva ? (
                    <div className="space-y-1">
                      <p className="text-ink-subtle">Enunciado anterior</p>
                      <p className="whitespace-pre-wrap break-words rounded-ui border border-line bg-surface p-2 font-mono text-ink">
                        {detalles.enunciado_anterior || 'Sin enunciado'}
                      </p>
                      <p className="text-ink-subtle flex items-center gap-1">
                        Enunciado nuevo <ArrowRight size={11} />
                      </p>
                      <p className="whitespace-pre-wrap break-words rounded-ui border border-line bg-surface p-2 font-mono text-ink">
                        {detalles.enunciado_nuevo || 'Sin enunciado'}
                      </p>
                    </div>
                  ) : tieneVersionNueva ? (
                    <div>
                      <p className="text-ink-subtle">Texto inicial</p>
                      <p className="whitespace-pre-wrap break-words rounded-ui border border-line bg-surface p-2 font-mono text-ink">
                        {detalles.enunciado_nuevo || 'Sin enunciado'}
                      </p>
                    </div>
                  ) : campos.includes('enunciado') ? (
                    <p className="text-ink-subtle">
                      No se guardó el texto anterior de este cambio, por lo que no se puede restaurar.
                    </p>
                  ) : null}
                  {campos.length > 0 && (
                    <p className="text-xs text-ink-subtle">Cambió: {campos.join(', ')}</p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-ink-subtle">
                      Por <strong className="text-ink-muted">{autor}</strong>
                    </p>
                    {puedeRestaurar && tieneVersionAnterior && (
                      <button
                        type="button"
                        onClick={() => onRestore(log)}
                        disabled={restoringLogId !== null}
                        className="inline-flex items-center gap-1 rounded-ui px-2 py-1 text-xs font-medium text-brand-text hover:bg-brand-subtle disabled:opacity-50"
                      >
                        <RotateCcw size={12} />
                        {restoringLogId === log.id ? 'Restaurando...' : 'Restaurar esta versión'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btnSecundario}>
          Cerrar
        </button>
      </ModalFooter>
    </Modal>
  );
}
