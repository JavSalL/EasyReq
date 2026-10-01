'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { btnSecundario } from '@/components/ui/estilos';
import { Bell, X } from 'lucide-react';
import type { SolicitudProyectoEquipo } from '@/lib/database.types';
import {
  getSolicitudesProyectoEquipoRecibidas,
  responderSolicitudProyectoEquipo
} from '@/lib/firestore-service';

interface ProjectTeamRequestInboxProps {
  userId: string | null;
  onResponded?: () => void | Promise<void>;
}

export default function ProjectTeamRequestInbox({
  userId,
  onResponded
}: ProjectTeamRequestInboxProps) {
  const [requests, setRequests] = useState<SolicitudProyectoEquipo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!userId) {
      setRequests([]);
      return;
    }

    setIsLoading(true);
    try {
      setRequests(await getSolicitudesProyectoEquipoRecibidas(userId));
    } catch (error) {
      console.error('Error al cargar solicitudes de proyectos y equipos:', error);
      toast.error('No se pudieron cargar las solicitudes de equipos');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const respond = async (request: SolicitudProyectoEquipo, accept: boolean) => {
    if (!userId) return;
    setProcessingId(request.id);
    try {
      await responderSolicitudProyectoEquipo(request.id, userId, accept);
      toast.success(
        request.tipo === 'vincular'
          ? (accept ? 'Equipo vinculado al proyecto' : 'Invitación rechazada')
          : (accept ? 'Equipo desvinculado del proyecto' : 'Solicitud de desvinculación rechazada')
      );
      await Promise.all([loadRequests(), Promise.resolve(onResponded?.())]);
    } catch (error) {
      console.error('Error al responder solicitud de proyecto y equipo:', error);
      toast.error(error instanceof Error ? error.message : 'No se pudo responder la solicitud');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => {
          if (!isOpen) void loadRequests();
          setIsOpen(open => !open);
        }}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`relative ${btnSecundario}`}
      >
        <Bell size={15} />
        Solicitudes de equipos
        {requests.length > 0 && (
          <span className="min-w-4 h-4 px-1 rounded-full bg-danger-solid text-white text-xs font-bold flex items-center justify-center">
            {requests.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Solicitudes de proyectos y equipos"
          className="absolute right-0 top-full mt-2 z-40 w-[min(24rem,calc(100vw-2rem))] bg-surface border border-line-strong rounded-ui overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">Solicitudes de equipos</h2>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar solicitudes"
              className="p-1 rounded-ui text-ink-subtle hover:text-ink-muted cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
          <div className="max-h-[min(26rem,70vh)] overflow-y-auto">
            {isLoading ? (
              <div className="p-6 flex justify-center">
                <div className="w-5 h-5 border-2 border-brand-text border-t-transparent rounded-full animate-spin" />
              </div>
            ) : requests.length === 0 ? (
              <p className="p-6 text-center text-xs text-ink-subtle">
                No tienes solicitudes pendientes.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {requests.map(request => {
                  const isProcessing = processingId === request.id;
                  const isLink = request.tipo === 'vincular';
                  return (
                    <li key={request.id} className="p-4">
                      <p className="text-xs text-ink-muted">
                        <span className="font-semibold">{request.nombre_solicitante}</span>
                        {isLink ? ' te invita a vincular el equipo ' : ' solicita desvincular el equipo '}
                        <span className="font-semibold">{request.nombre_equipo}</span>
                        {' al proyecto '}
                        <span className="font-semibold">{request.nombre_proyecto}</span>.
                      </p>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          onClick={() => void respond(request, false)}
                          disabled={isProcessing}
                          className="px-3 py-1.5 border border-line rounded-ui text-xs font-medium text-ink-muted hover:bg-sunken disabled:opacity-50 cursor-pointer"
                        >
                          Rechazar
                        </button>
                        <button
                          onClick={() => void respond(request, true)}
                          disabled={isProcessing}
                          className="px-3 py-1.5 bg-brand-solid hover:bg-brand-solid-hover rounded-ui text-xs font-medium text-on-solid disabled:opacity-50 cursor-pointer"
                        >
                          {isProcessing ? 'Procesando...' : 'Aceptar'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
