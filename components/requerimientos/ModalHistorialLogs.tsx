'use client';

import React from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { LogRequerimiento, Requerimiento } from '@/lib/database.types';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { fechaCompleta } from '@/lib/fechas';
import { btnSecundario } from '@/components/ui/estilos';

function estiloAccion(accion: string) {
  const accionNormalizada = accion.toLocaleLowerCase('es');

  if (accionNormalizada.includes('rechazo')) {
    return {
      borde: 'border-l-danger',
      etiqueta: 'border-danger-line bg-danger-subtle text-danger',
    };
  }
  if (accionNormalizada.includes('aprobación') || accionNormalizada.includes('creación')) {
    return {
      borde: 'border-l-success',
      etiqueta: 'border-success-line bg-success-subtle text-success',
    };
  }
  if (accionNormalizada.includes('restauración') || accionNormalizada.includes('reenvío')) {
    return {
      borde: 'border-l-warning',
      etiqueta: 'border-warning-line bg-warning-subtle text-warning',
    };
  }
  return {
    borde: 'border-l-brand',
    etiqueta: 'border-brand-line bg-brand-subtle text-brand-text',
  };
}

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
              const cambiosClasificacion = Array.isArray(detalles?.cambios_clasificacion)
                ? detalles.cambios_clasificacion.filter(
                    cambio => cambio &&
                      typeof cambio.campo === 'string' &&
                      typeof cambio.anterior === 'string' &&
                      typeof cambio.nuevo === 'string'
                  )
                : [];
              const tieneVersionAnterior = typeof detalles?.enunciado_anterior === 'string';
              const tieneVersionNueva = typeof detalles?.enunciado_nuevo === 'string';
              const tieneCambioEnunciado = tieneVersionAnterior &&
                tieneVersionNueva &&
                detalles.enunciado_anterior !== detalles.enunciado_nuevo;
              const esTextoInicial = !tieneVersionAnterior && tieneVersionNueva;
              const enunciadoSinVersionAnterior = campos.includes('enunciado') &&
                !tieneVersionAnterior &&
                !tieneVersionNueva;
              const tieneVersionRestaurable = tieneVersionAnterior || cambiosClasificacion.length > 0;
              const fechaValida = !!log.fecha_hora && !Number.isNaN(Date.parse(log.fecha_hora));
              const coloresAccion = estiloAccion(log.accion);
              return (
                <li key={log.id} className={`p-3 bg-sunken rounded-ui border border-line border-l-4 ${coloresAccion.borde} text-xs space-y-2`}>
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${coloresAccion.etiqueta}`}>
                      {log.accion}
                    </span>
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
                  {tieneCambioEnunciado ? (
                    <div className="space-y-1">
                      <p className="font-semibold text-danger">Enunciado anterior</p>
                      <p className="whitespace-pre-wrap break-words rounded-ui border border-danger-line bg-danger-subtle p-2 font-mono text-ink">
                        {detalles.enunciado_anterior || 'Sin enunciado'}
                      </p>
                      <p className="font-semibold text-success flex items-center gap-1">
                        Enunciado nuevo <ArrowRight size={11} />
                      </p>
                      <p className="whitespace-pre-wrap break-words rounded-ui border border-success-line bg-success-subtle p-2 font-mono text-ink">
                        {detalles.enunciado_nuevo || 'Sin enunciado'}
                      </p>
                    </div>
                  ) : esTextoInicial ? (
                    <div>
                      <p className="text-ink-subtle">Texto inicial</p>
                      <p className="whitespace-pre-wrap break-words rounded-ui border border-line bg-surface p-2 font-mono text-ink">
                        {detalles.enunciado_nuevo || 'Sin enunciado'}
                      </p>
                    </div>
                  ) : enunciadoSinVersionAnterior ? (
                    <p className="text-ink-subtle">
                      No se guardó el texto anterior de este cambio, por lo que no se puede restaurar.
                    </p>
                  ) : null}
                  {campos.length > 0 && (
                    <p className="text-xs text-ink-subtle">Cambió: {campos.join(', ')}</p>
                  )}
                  {cambiosClasificacion.length > 0 && (
                    <div className="space-y-1">
                      {cambiosClasificacion.map((cambio, index) => (
                        <div key={`${cambio.campo}-${index}`} className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-ink-muted capitalize">{cambio.campo}:</span>
                          <span className="rounded-ui border border-danger-line bg-danger-subtle px-1.5 py-0.5 text-danger">
                            {cambio.anterior}
                          </span>
                          <ArrowRight size={11} className="text-ink-subtle" />
                          <span className="rounded-ui border border-success-line bg-success-subtle px-1.5 py-0.5 text-success">
                            {cambio.nuevo}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-ink-subtle">
                      Por <strong className="text-ink-muted">{autor}</strong>
                    </p>
                    {puedeRestaurar && tieneVersionRestaurable && (
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
