'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Crown, Globe, History, Layers, UserCheck, UserMinus, UserPlus, RefreshCw } from 'lucide-react';
import type { AccionLogIntegrante, LogIntegrante, Proyecto } from '@/lib/database.types';
import { getHistorialMiembrosEquipo } from '@/lib/firestore-service';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { btnSecundario } from '@/components/ui/estilos';

interface HistorialMiembrosModalProps {
  open: boolean;
  onClose: () => void;
  equipoId: string;
  equipoNombre: string;
  /** Si se pasa `proyectoId`, filtra por los movimientos de ese proyecto; si es `undefined`, muestra todos. */
  proyectoId?: string | null;
  proyectoNombre?: string;
  proyectosMap?: Map<string, Proyecto>;
}

const ETIQUETA_ACCION: Record<AccionLogIntegrante, { texto: string; clase: string; icono: React.ReactNode }> = {
  alta: {
    texto: 'Alta de integrante',
    clase: 'bg-success-subtle text-success border-success-line',
    icono: <UserPlus size={13} aria-hidden />,
  },
  baja: {
    texto: 'Baja / Inactivación',
    clase: 'bg-danger-subtle text-danger border-danger-line',
    icono: <UserMinus size={13} aria-hidden />,
  },
  cambio_roles: {
    texto: 'Cambio de roles',
    clase: 'bg-brand-subtle text-brand-text border-brand-line',
    icono: <RefreshCw size={13} aria-hidden />,
  },
  cambio_estado: {
    texto: 'Cambio de estado',
    clase: 'bg-warning-subtle text-warning border-warning-line',
    icono: <UserCheck size={13} aria-hidden />,
  },
  clonado_proyecto: {
    texto: 'Sincronizado en proyecto',
    clase: 'bg-sunken text-ink-muted border-line',
    icono: <Layers size={13} aria-hidden />,
  },
};

function formatearFechaHora(iso: string): string {
  if (!iso) return 'Fecha desconocida';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const nombreUsuario = (u?: { nombre?: string; correo?: string } | null, fallbackId?: string | null) =>
  u?.nombre || u?.correo || fallbackId || 'Usuario';

export function HistorialMiembrosModal({
  open,
  onClose,
  equipoId,
  equipoNombre,
  proyectoId,
  proyectoNombre,
  proyectosMap,
}: HistorialMiembrosModalProps) {
  const [logs, setLogs] = useState<LogIntegrante[]>([]);
  const [cargando, setCargando] = useState(false);
  const [alcance, setAlcance] = useState<'contexto' | 'todo'>('contexto');

  const cargar = useCallback(async () => {
    if (!open || !equipoId) return;
    setCargando(true);
    try {
      const filtroProyecto =
        proyectoId !== undefined && alcance === 'contexto' ? proyectoId : undefined;
      const resultado = await getHistorialMiembrosEquipo(equipoId, filtroProyecto);
      setLogs(resultado);
    } finally {
      setCargando(false);
    }
  }, [open, equipoId, proyectoId, alcance]);

  useEffect(() => {
    if (open) {
      setAlcance('contexto');
    }
  }, [open, equipoId, proyectoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <span className="inline-flex items-center gap-2">
          <History size={18} className="text-brand-text shrink-0" />
          Historial de miembros — {equipoNombre}
        </span>
      }
      description={
        proyectoNombre
          ? `Bitácora de movimientos del equipo en el proyecto "${proyectoNombre}".`
          : 'Bitácora de altas, bajas y modificaciones de roles en el equipo.'
      }
    >
      <ModalBody className="space-y-4">
        {proyectoId !== undefined && (
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-line">
            <span className="text-xs text-ink-subtle">Alcance del historial:</span>
            <div className="inline-flex rounded-ui border border-line bg-sunken p-0.5">
              <button
                type="button"
                onClick={() => setAlcance('contexto')}
                className={`px-3 py-1 rounded-ui text-xs font-medium transition-colors cursor-pointer ${
                  alcance === 'contexto'
                    ? 'bg-surface text-ink font-semibold shadow-2xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {proyectoId ? 'Solo este proyecto' : 'Solo plantilla global'}
              </button>
              <button
                type="button"
                onClick={() => setAlcance('todo')}
                className={`px-3 py-1 rounded-ui text-xs font-medium transition-colors cursor-pointer ${
                  alcance === 'todo'
                    ? 'bg-surface text-ink font-semibold shadow-2xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Todo el equipo
              </button>
            </div>
          </div>
        )}

        {cargando ? (
          <div role="status" aria-label="Cargando historial" className="space-y-3 py-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-sunken rounded-ui animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center">
            <Clock size={28} className="mx-auto text-ink-subtle mb-2" />
            <p className="text-sm font-medium text-ink">Aún no hay movimientos registrados</p>
            <p className="text-xs text-ink-subtle mt-1">
              Las altas, bajas y cambios de roles o estado aparecerán aquí en orden cronológico.
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-line border border-line rounded-ui bg-surface overflow-hidden">
            {logs.map(log => {
              const meta =
                (ETIQUETA_ACCION as Partial<Record<string, (typeof ETIQUETA_ACCION)[AccionLogIntegrante]>>)[
                  log.accion
                ] ?? ETIQUETA_ACCION.cambio_roles;
              const nombreAfectado = nombreUsuario(log.usuario_afectado, log.id_usuario_afectado);
              const nombreAutor = nombreUsuario(log.autor, log.id_autor);
              const nombreLider = log.lider ? nombreUsuario(log.lider, log.id_lider_en_momento) : null;
              const proyNombre = log.id_proyecto
                ? (proyectoNombre && log.id_proyecto === proyectoId
                    ? proyectoNombre
                    : proyectosMap?.get(log.id_proyecto)?.nombre ?? 'Proyecto vinculado')
                : null;

              const rolesAnt = log.detalles?.nombres_roles_anteriores ?? [];
              const rolesNue = log.detalles?.nombres_roles_nuevos ?? [];

              return (
                <li key={log.id} className="p-4 space-y-2 hover:bg-sunken transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${meta.clase}`}
                      >
                        {meta.icono}
                        {meta.texto}
                      </span>

                      {proyNombre ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sunken text-ink-muted border border-line">
                          <Layers size={11} aria-hidden />
                          {proyNombre}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sunken text-ink-subtle border border-line">
                          <Globe size={11} aria-hidden />
                          Plantilla global
                        </span>
                      )}

                      {log.detalles?.es_local && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-subtle text-brand-text border border-brand-line">
                          Miembro local del proyecto
                        </span>
                      )}
                    </div>

                    <time className="text-xs text-ink-subtle tabular-nums">
                      {formatearFechaHora(log.fecha_hora)}
                    </time>
                  </div>

                  <p className="text-sm text-ink">
                    Integrante: <strong className="font-semibold">{nombreAfectado}</strong>
                  </p>

                  {/* Detalles de cambios de roles o estado */}
                  {(rolesAnt.length > 0 || rolesNue.length > 0) && (
                    <div className="text-xs text-ink-muted flex flex-wrap items-center gap-1.5">
                      {rolesAnt.length > 0 && (
                        <span>
                          Roles previos: <strong className="text-ink">{rolesAnt.join(', ')}</strong>
                        </span>
                      )}
                      {rolesAnt.length > 0 && rolesNue.length > 0 && <span>→</span>}
                      {rolesNue.length > 0 && (
                        <span>
                          Roles asignados: <strong className="text-ink">{rolesNue.join(', ')}</strong>
                        </span>
                      )}
                    </div>
                  )}

                  {(log.detalles?.estado_anterior || log.detalles?.estado_nuevo) && (
                    <p className="text-xs text-ink-muted">
                      Estado en el proyecto:{' '}
                      {log.detalles.estado_anterior && (
                        <>
                          <span className="font-medium text-ink">{log.detalles.estado_anterior}</span>
                          {' → '}
                        </>
                      )}
                      <span className="font-semibold text-ink">{log.detalles.estado_nuevo}</span>
                    </p>
                  )}

                  {log.detalles?.nota && (
                    <p className="text-xs text-ink-subtle italic">{log.detalles.nota}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-ink-subtle">
                    <span>
                      Realizado por: <strong className="font-medium text-ink-muted">{nombreAutor}</strong>
                    </span>
                    {nombreLider && (
                      <span className="inline-flex items-center gap-1">
                        <Crown size={11} className="text-warning" aria-hidden />
                        Líder en turno: <strong className="font-medium text-ink-muted">{nombreLider}</strong>
                      </span>
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
