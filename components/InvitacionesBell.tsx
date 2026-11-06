'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  Equipo,
  InvitacionEquipo,
  PerfilUsuario,
  Proyecto,
  Rol,
  SolicitudProyectoEquipo,
} from '@/lib/database.types';
import {
  aceptarInvitacionEquipo,
  getAllUsers,
  getEquipos,
  getInvitacionesRecibidas,
  getProyectos,
  getRoles,
  getSolicitudesProyectoEquipoRecibidas,
  rechazarInvitacionEquipo,
  responderSolicitudProyectoEquipo,
} from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';
import { mensajeError } from '@/lib/errores';
import { EVENTO_EQUIPOS_CAMBIARON } from '@/lib/navegacion-proyecto';
import { btnIcono, btnPrimario, btnSecundario } from '@/components/ui/estilos';

interface DatosInvitaciones {
  equipos: Equipo[];
  usuarios: PerfilUsuario[];
  roles: Rol[];
  proyectos: Proyecto[];
}

const nombreDe = (u: PerfilUsuario) => u.nombre || u.correo;

/**
 * Campana de la barra superior: invitaciones recibidas para unirse a un equipo
 * y solicitudes de vinculación/desvinculación de equipos con proyectos.
 * Visible en cualquier pantalla; el contador se actualiza al cargar y al volver a la pestaña.
 */
export default function InvitacionesBell() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [invitaciones, setInvitaciones] = useState<InvitacionEquipo[]>([]);
  const [solicitudes, setSolicitudes] = useState<SolicitudProyectoEquipo[]>([]);
  const [datos, setDatos] = useState<DatosInvitaciones | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [enProceso, setEnProceso] = useState<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  const cargarInvitaciones = useCallback(async () => {
    if (!uid) {
      setInvitaciones([]);
      setSolicitudes([]);
      return;
    }
    try {
      const [invData, solData] = await Promise.all([
        getInvitacionesRecibidas(uid),
        getSolicitudesProyectoEquipoRecibidas(uid),
      ]);
      setInvitaciones(invData);
      setSolicitudes(solData);
    } catch (err) {
      console.error('Error al cargar notificaciones:', err);
    }
  }, [uid]);

  // Contador: al montar y cada vez que se vuelve a la pestaña
  useEffect(() => {
    void cargarInvitaciones();
    const alEnfocar = () => void cargarInvitaciones();
    window.addEventListener('focus', alEnfocar);
    return () => window.removeEventListener('focus', alEnfocar);
  }, [cargarInvitaciones]);

  // Cerrar con clic fuera o con Escape
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', alPulsar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alPulsar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  const alternar = async () => {
    const abrir = !abierto;
    setAbierto(abrir);
    if (!abrir) return;
    setCargando(true);
    try {
      const [equipos, usuarios, roles, proyectos] = await Promise.all([
        getEquipos(),
        getAllUsers(),
        getRoles(),
        getProyectos(),
        cargarInvitaciones()
      ]);
      setDatos({ equipos, usuarios, roles, proyectos });
    } catch (err) {
      console.error('Error al cargar los datos de las notificaciones:', err);
      toast.error(mensajeError(err, 'No se pudieron cargar tus notificaciones'));
    } finally {
      setCargando(false);
    }
  };

  const responder = async (invitacion: InvitacionEquipo, aceptar: boolean) => {
    if (!uid) return;
    setEnProceso(invitacion.id);
    try {
      if (aceptar) {
        await aceptarInvitacionEquipo(invitacion.id, uid);
        toast.success('Te uniste al equipo');
        // Las pantallas con equipos abiertas se actualizan solas
        window.dispatchEvent(new Event(EVENTO_EQUIPOS_CAMBIARON));
      } else {
        await rechazarInvitacionEquipo(invitacion.id, uid);
        toast.success('Invitación rechazada');
      }
      await cargarInvitaciones();
    } catch (err) {
      console.error('Error al responder la invitación:', err);
      toast.error(mensajeError(err, 'No se pudo responder la invitación'));
    } finally {
      setEnProceso(null);
    }
  };

  const responderSolicitud = async (solicitud: SolicitudProyectoEquipo, aceptar: boolean) => {
    if (!uid) return;
    setEnProceso(solicitud.id);
    try {
      await responderSolicitudProyectoEquipo(solicitud.id, uid, aceptar);
      if (aceptar) {
        toast.success(
          solicitud.tipo === 'vincular'
            ? 'Equipo vinculado al proyecto'
            : 'Equipo desvinculado del proyecto'
        );
        window.dispatchEvent(new Event(EVENTO_EQUIPOS_CAMBIARON));
      } else {
        toast.success('Solicitud rechazada');
      }
      await cargarInvitaciones();
    } catch (err) {
      console.error('Error al responder la solicitud proyecto-equipo:', err);
      toast.error(mensajeError(err, 'No se pudo responder la solicitud'));
    } finally {
      setEnProceso(null);
    }
  };

  const totalPendientes = invitaciones.length + solicitudes.length;
  const etiqueta = totalPendientes > 0
    ? `Notificaciones (${totalPendientes} pendientes)`
    : 'Notificaciones';

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        aria-label={etiqueta}
        title={etiqueta}
        className={`relative ${btnIcono}`}
      >
        <Bell size={18} aria-hidden />
        {totalPendientes > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-danger-solid text-white text-xs font-bold leading-none flex items-center justify-center">
            {totalPendientes}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Notificaciones e invitaciones"
          className="absolute right-0 top-full mt-2 z-50 w-[min(24rem,calc(100vw-2rem))] bg-surface border border-line-strong rounded-ui overflow-hidden animate-in fade-in"
        >
          <div className="px-4 py-3 border-b border-line">
            <h2 className="text-base font-semibold text-ink">Notificaciones</h2>
          </div>
          <div className="max-h-[min(28rem,70vh)] overflow-y-auto custom-scrollbar">
            {cargando && !datos ? (
              <div role="status" aria-label="Cargando" className="p-6 flex justify-center">
                <div className="size-5 border-2 border-brand-text border-t-transparent rounded-full animate-spin" />
              </div>
            ) : totalPendientes === 0 ? (
              <p className="p-6 text-center text-sm text-ink-subtle">No tienes invitaciones ni solicitudes pendientes.</p>
            ) : (
              <ul className="divide-y divide-line">
                {invitaciones.map((invitacion) => {
                  const equipo = datos?.equipos.find((e) => e.equipo_id === invitacion.id_equipo);
                  const invitador = datos?.usuarios.find((u) => u.id === invitacion.id_invitador);
                  const proyecto = equipo?.id_proyecto
                    ? datos?.proyectos.find((p) => p.proyecto_id === equipo.id_proyecto)
                    : undefined;
                  const idsRoles = invitacion.id_roles ?? (invitacion.id_rol ? [invitacion.id_rol] : []);
                  const roles = datos?.roles.filter((r) => idsRoles.includes(r.id)) ?? [];
                  const ocupada = enProceso === invitacion.id;
                  return (
                    <li key={`inv-${invitacion.id}`} className="p-4">
                      <span className="inline-block px-2 py-0.5 mb-1.5 rounded-full text-[11px] font-semibold bg-brand-subtle text-brand-text border border-brand-line">
                        Invitación a equipo
                      </span>
                      <p className="text-sm text-ink-muted">
                        <span className="font-semibold text-ink">{invitador ? nombreDe(invitador) : 'Un usuario'}</span>
                        {' te invita a unirte al equipo '}
                        <span className="font-semibold text-ink">{equipo?.nombre || 'un equipo'}</span>
                        {proyecto && (
                          <>
                            {' del proyecto '}
                            <span className="font-semibold text-ink">{proyecto.nombre}</span>
                          </>
                        )}
                        .
                      </p>
                      {roles.length > 0 && (
                        <p className="text-xs text-ink-subtle mt-1">Roles: {roles.map((r) => r.nombre_rol).join(', ')}</p>
                      )}
                      <div className="mt-3 flex justify-end gap-2">
                        <button type="button" disabled={ocupada} onClick={() => responder(invitacion, false)} className={btnSecundario}>
                          Rechazar
                        </button>
                        <button type="button" disabled={ocupada} onClick={() => responder(invitacion, true)} className={btnPrimario}>
                          {ocupada ? 'Procesando...' : 'Aceptar'}
                        </button>
                      </div>
                    </li>
                  );
                })}
                {solicitudes.map((solicitud) => {
                  const ocupada = enProceso === solicitud.id;
                  return (
                    <li key={`sol-${solicitud.id}`} className="p-4">
                      <span className="inline-block px-2 py-0.5 mb-1.5 rounded-full text-[11px] font-semibold bg-warning-subtle text-warning border border-warning-line">
                        {solicitud.tipo === 'vincular' ? 'Solicitud de vinculación' : 'Solicitud de desvinculación'}
                      </span>
                      <p className="text-sm text-ink-muted">
                        <span className="font-semibold text-ink">{solicitud.nombre_solicitante}</span>
                        {solicitud.tipo === 'vincular'
                          ? ' solicita vincular el equipo '
                          : ' solicita desvincular el equipo '}
                        <span className="font-semibold text-ink">{solicitud.nombre_equipo}</span>
                        {' con el proyecto '}
                        <span className="font-semibold text-ink">{solicitud.nombre_proyecto}</span>
                        .
                      </p>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={ocupada}
                          onClick={() => responderSolicitud(solicitud, false)}
                          className={btnSecundario}
                        >
                          Rechazar
                        </button>
                        <button
                          type="button"
                          disabled={ocupada}
                          onClick={() => responderSolicitud(solicitud, true)}
                          className={btnPrimario}
                        >
                          {ocupada ? 'Procesando...' : 'Aceptar'}
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
