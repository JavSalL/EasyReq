'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
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
  nombreUsuario: (id: string | null | undefined) => string | null;
  codigoDe: (req: Requerimiento) => string | null;
}

export default function ModalHistorialLogs({
  open,
  onClose,
  requerimiento,
  logs,
  loading,
  nombreUsuario,
  codigoDe,
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
        ) : logs.length === 0 ? (
          <p className="text-xs text-ink-subtle text-center py-6">No hay registros de cambios todavía.</p>
        ) : (
          <ol className="space-y-2">
            {logs.map((log) => {
              const autor = log.autor ? (log.autor.nombre || log.autor.correo) : nombreUsuario(log.id_autor);
              const campos: string[] = Array.isArray(log.detalles?.campos) ? log.detalles.campos : [];
              return (
                <li key={log.id} className="p-3 bg-sunken rounded-ui border border-line text-xs space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-ink">{log.accion}</span>
                    <time className="text-xs text-ink-subtle shrink-0" dateTime={log.fecha_hora}>
                      {fechaCompleta(log.fecha_hora)}
                    </time>
                  </div>
                  {log.detalles?.estado_anterior !== undefined && log.detalles?.estado_nuevo && (
                    <p className="text-xs text-ink-subtle flex items-center gap-1">
                      {log.detalles.estado_anterior || 'Sin estado'}
                      <ArrowRight size={11} />
                      {log.detalles.estado_nuevo}
                    </p>
                  )}
                  {campos.length > 0 && (
                    <p className="text-xs text-ink-subtle">Cambió: {campos.join(', ')}</p>
                  )}
                  {autor && (
                    <p className="text-xs text-ink-subtle">
                      Por <strong className="text-ink-muted">{autor}</strong>
                    </p>
                  )}
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
