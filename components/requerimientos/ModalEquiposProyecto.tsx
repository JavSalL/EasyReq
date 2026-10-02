'use client';

import React from 'react';
import Link from 'next/link';
import { Equipo } from '@/lib/database.types';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { btnSecundario } from '@/components/ui/estilos';

interface ModalEquiposProyectoProps {
  open: boolean;
  onClose: () => void;
  equipos: Equipo[];
  equiposAsignados: string[];
  solicitudesEquiposPendientes: string[];
  puedeGestionarVinculos: boolean;
  onSolicitarVinculo: (equipo: Equipo) => void;
}

export default function ModalEquiposProyecto({
  open,
  onClose,
  equipos,
  equiposAsignados,
  solicitudesEquiposPendientes,
  puedeGestionarVinculos,
  onSolicitarVinculo,
}: ModalEquiposProyectoProps) {
  const equiposOrdenados = [...equipos].sort((a, b) => {
    const aVinculado = equiposAsignados.includes(a.equipo_id);
    const bVinculado = equiposAsignados.includes(b.equipo_id);
    if (aVinculado !== bVinculado) return aVinculado ? -1 : 1;
    return a.nombre.localeCompare(b.nombre);
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Equipos del Proyecto"
      description={
        puedeGestionarVinculos
          ? 'Invita equipos a este proyecto. El vínculo se crea cuando el líder del equipo acepta.'
          : 'Equipos que trabajan en este proyecto. Solo el creador del proyecto invita equipos.'
      }
    >
      <ModalBody className="space-y-2">
        {equipos.length === 0 ? (
          <p className="text-ink-subtle text-xs text-center py-4">No hay equipos registrados todavía.</p>
        ) : (
          equiposOrdenados.map((eq) => {
            const isAssigned = equiposAsignados.includes(eq.equipo_id);
            const pendiente = solicitudesEquiposPendientes.includes(eq.equipo_id);
            if (!puedeGestionarVinculos && !isAssigned) return null;
            return (
              <div
                key={eq.equipo_id}
                className={`flex items-center justify-between gap-3 p-3 rounded-ui border ${
                  isAssigned ? 'bg-brand-subtle border-brand-line' : 'bg-sunken border-line'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink text-xs sm:text-sm">{eq.nombre}</p>
                  {eq.descripcion && <p className="text-xs text-ink-subtle truncate">{eq.descripcion}</p>}
                </div>
                {puedeGestionarVinculos &&
                  (pendiente ? (
                    <span className="shrink-0 px-3 py-1.5 rounded-ui text-xs font-medium text-warning bg-warning-subtle border border-warning-line">
                      Solicitud pendiente
                    </span>
                  ) : (
                    <button
                      onClick={() => onSolicitarVinculo(eq)}
                      title={
                        isAssigned
                          ? 'Pedir al líder del equipo que acepte desvincularse'
                          : 'Invitar al líder del equipo a vincularse'
                      }
                      className={`shrink-0 px-3 py-1.5 rounded-ui text-xs font-semibold transition-colors cursor-pointer ${
                        isAssigned
                          ? 'bg-surface border border-line text-ink-muted hover:text-danger hover:border-danger-line'
                          : 'bg-brand-solid text-on-solid hover:bg-brand-solid-hover'
                      }`}
                    >
                      {isAssigned ? 'Solicitar desvinculación' : 'Invitar equipo'}
                    </button>
                  ))}
              </div>
            );
          })
        )}
        {!puedeGestionarVinculos && equipos.length > 0 && equiposAsignados.length === 0 && (
          <p className="text-ink-subtle text-xs text-center py-4">Este proyecto aún no tiene equipos vinculados.</p>
        )}
      </ModalBody>
      <ModalFooter>
        <Link href="/equipos-global/" className="mr-auto text-xs font-semibold text-brand-text hover:underline">
          Gestionar equipos
        </Link>
        <button type="button" onClick={onClose} className={btnSecundario}>
          Cerrar
        </button>
      </ModalFooter>
    </Modal>
  );
}
