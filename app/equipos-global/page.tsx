'use client';

import React, { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  Users, Plus, Search, ChevronRight, ChevronLeft, FolderGit2,
  Save, Edit2, Trash2, Crown, UserPlus, Check, Lock, Bell, Send
} from 'lucide-react';
import type { Equipo, PerfilUsuario, Rol, InvitacionEquipo } from '@/lib/database.types';
import {
  getEquipos,
  createEquipo,
  updateEquipo,
  deleteEquipo,
  getProyectos,
  getAllUsers,
  getRoles,
  getProyectoEquipos,
  getMiembrosEquipo,
  actualizarRolesMiembro,
  removeMiembroEquipo,
  getEquiposLideradosPor,
  esRolLider,
  getInvitacionesRecibidas,
  crearInvitacionEquipo,
  aceptarInvitacionEquipo,
  rechazarInvitacionEquipo,
  crearSolicitudProyectoEquipo,
  getSolicitudesProyectoEquipoEnviadas
} from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';
import { mensajeError } from '@/lib/errores';
import { usePageTitle } from '@/lib/use-page-title';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import ProjectTeamRequestInbox from '@/components/ProjectTeamRequestInbox';
import {
  btnPrimario, btnSecundario, btnIcono, btnIconoPeligro, buscador, campo, etiqueta, tarjeta
} from '@/components/ui/estilos';

interface MiembroDetallado {
  usuario: PerfilUsuario;
  roles: Rol[];
  esLider: boolean;
}

interface ProyectoDelEquipo {
  proyecto_id: string;
  nombre: string;
  solicitudDesvinculacionPendiente: boolean;
}

interface EquipoDetallado extends Equipo {
  proyectos: ProyectoDelEquipo[];
  miembros: MiembroDetallado[];
}

const nombreDe = (u: PerfilUsuario) => u.nombre || u.correo;
const iniciales = (u: PerfilUsuario) => nombreDe(u).slice(0, 2).toUpperCase();

export default function EquiposGlobalPage() {
  const confirmar = useConfirm();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [equipos, setEquipos] = useState<Array<EquipoDetallado>>([]);
  const [usuarios, setUsuarios] = useState<Array<PerfilUsuario>>([]);
  const [roles, setRoles] = useState<Array<Rol>>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Control de acceso: lectura total; solo el líder de cada equipo puede
  // editarlo y gestionar sus miembros.
  const [equiposLiderados, setEquiposLiderados] = useState<Array<string>>([]);

  const cargarLiderazgo = useCallback(async () => {
    try {
      const ids = uid ? await getEquiposLideradosPor(uid) : [];
      setEquiposLiderados(ids);
    } catch (err) {
      console.error('Error al cargar liderazgo de equipos:', err);
      setEquiposLiderados([]);
    }
  }, [uid]);

  useEffect(() => {
    cargarLiderazgo();
  }, [cargarLiderazgo]);

  const puedeGestionarEquipo = (equipoId: string) =>
    equiposLiderados.includes(equipoId);

  // Invitaciones recibidas para unirse a equipos
  const [invitaciones, setInvitaciones] = useState<Array<InvitacionEquipo>>([]);
  const [loadingInvitaciones, setLoadingInvitaciones] = useState(true);
  const [invitacionesAbiertas, setInvitacionesAbiertas] = useState(false);
  const [invitacionEnProceso, setInvitacionEnProceso] = useState<string | null>(null);

  // Modal Equipo (Crear / Editar)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEquipo, setEditingEquipo] = useState<Equipo | null>(null);
  const [formData, setFormData] = useState({ nombre: '', descripcion: '' });
  const [saving, setSaving] = useState(false);

  // Vista de miembros (se refleja en la URL como ?equipo=ID para que el botón
  // "atrás" del navegador regrese a la lista)
  const [equipoAbiertoId, setEquipoAbiertoId] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState({
    id_usuario: '',
    id_roles: [] as string[]
  });
  const [guardandoMiembro, setGuardandoMiembro] = useState(false);

  useEffect(() => {
    const leerUrl = () => {
      setEquipoAbiertoId(new URLSearchParams(window.location.search).get('equipo'));
      setMemberForm({ id_usuario: '', id_roles: [] });
    };
    leerUrl();
    window.addEventListener('popstate', leerUrl);
    return () => window.removeEventListener('popstate', leerUrl);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [projData, usersData, rolesData, equiposData, peData, meData, solicitudesEnviadas] = await Promise.all([
        getProyectos(),
        getAllUsers(),
        getRoles(),
        getEquipos(),
        getProyectoEquipos(),
        getMiembrosEquipo(),
        uid ? getSolicitudesProyectoEquipoEnviadas(uid) : Promise.resolve([])
      ]);

      setUsuarios([...usersData].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b))));
      setRoles(rolesData);

      const projMap = new Map(projData.map(p => [p.proyecto_id, p]));
      const desvinculacionesPendientes = new Set(
        solicitudesEnviadas
          .filter(s => s.tipo === 'desvincular')
          .map(s => `${s.id_proyecto}_${s.id_equipo}`)
      );

      const formated: EquipoDetallado[] = equiposData.map(eq => {
        const projs = peData
          .filter(pe => pe.id_equipo === eq.equipo_id)
          .map(pe => projMap.get(pe.id_proyecto))
          .filter((p): p is NonNullable<typeof p> => Boolean(p))
          .map(p => ({
            proyecto_id: p.proyecto_id,
            nombre: p.nombre,
            solicitudDesvinculacionPendiente: desvinculacionesPendientes.has(`${p.proyecto_id}_${eq.equipo_id}`)
          }));

        const members = meData
          .filter(me => me.id_equipo === eq.equipo_id && me.usuario)
          .map(me => {
            const rolesMiembro = me.roles ?? [];
            return {
              usuario: me.usuario!,
              roles: rolesMiembro,
              esLider: rolesMiembro.some(r => esRolLider(r.nombre_rol))
            };
          })
          // Líderes primero, luego por nombre
          .sort((a, b) => Number(b.esLider) - Number(a.esLider) || nombreDe(a.usuario).localeCompare(nombreDe(b.usuario)));

        return { ...eq, proyectos: projs, miembros: members };
      });

      setEquipos(formated.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudieron cargar los equipos'));
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchInvitaciones = useCallback(async () => {
    if (!uid) {
      setInvitaciones([]);
      setLoadingInvitaciones(false);
      return;
    }
    setLoadingInvitaciones(true);
    try {
      setInvitaciones(await getInvitacionesRecibidas(uid));
    } catch (err) {
      console.error('Error al cargar invitaciones de equipos:', err);
      toast.error(mensajeError(err, 'No se pudieron cargar tus invitaciones'));
    } finally {
      setLoadingInvitaciones(false);
    }
  }, [uid]);

  useEffect(() => {
    fetchInvitaciones();
  }, [fetchInvitaciones]);

  const equipoAbierto = equipos.find(e => e.equipo_id === equipoAbiertoId) ?? null;
  usePageTitle(equipoAbierto ? `Miembros de ${equipoAbierto.nombre}` : 'Equipos');

  const abrirMiembros = (team: EquipoDetallado) => {
    window.history.pushState(null, '', `?equipo=${team.equipo_id}`);
    setEquipoAbiertoId(team.equipo_id);
    setMemberForm({ id_usuario: '', id_roles: [] });
    window.scrollTo({ top: 0 });
  };

  const cerrarMiembros = () => {
    window.history.pushState(null, '', window.location.pathname);
    setEquipoAbiertoId(null);
  };

  const recargar = async () => {
    await Promise.all([fetchData(), cargarLiderazgo()]);
  };

  // Apertura modal equipo
  const openModal = (team: EquipoDetallado | null = null) => {
    // Crear equipo está permitido a cualquier autenticado (queda como líder
    // inicial); editar requiere ser líder de ese equipo.
    if (team && !puedeGestionarEquipo(team.equipo_id)) {
      toast.error('Solo el líder del equipo puede editarlo');
      return;
    }
    setEditingEquipo(team);
    setFormData({ nombre: team?.nombre ?? '', descripcion: team?.descripcion ?? '' });
    setIsModalOpen(true);
  };

  // Guardar Equipo
  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      toast.error("El nombre del equipo es obligatorio");
      return;
    }
    if (!formData.descripcion.trim()) {
      toast.error("La descripción del equipo es obligatoria");
      return;
    }

    setSaving(true);
    try {
      if (editingEquipo) {
        if (!puedeGestionarEquipo(editingEquipo.equipo_id)) {
          toast.error('Solo el líder del equipo puede editarlo');
          return;
        }
        await updateEquipo(editingEquipo.equipo_id, {
          nombre: formData.nombre.trim(),
          descripcion: formData.descripcion.trim()
        });
      } else {
        if (!uid) {
          toast.error('Debes iniciar sesión para crear un equipo');
          return;
        }
        // El creador queda como líder inicial para poder gestionar el equipo.
        const rolLider = roles.find(r => esRolLider(r.nombre_rol));
        if (!rolLider) {
          toast.error('No está configurado el rol de líder; no se puede crear el equipo');
          return;
        }
        await createEquipo({
          nombre: formData.nombre.trim(),
          descripcion: formData.descripcion.trim(),
          id_creador: uid,
          id_rol_lider: rolLider.id
        });
      }

      toast.success(editingEquipo ? "Equipo actualizado" : "Equipo creado. Eres su líder.");
      setIsModalOpen(false);
      await recargar();
    } catch (e) {
      console.error(e);
      toast.error(mensajeError(e, 'No se pudo guardar el equipo'));
    } finally {
      setSaving(false);
    }
  };

  // Eliminar Equipo
  const handleDeleteTeam = async (team: EquipoDetallado) => {
    if (!puedeGestionarEquipo(team.equipo_id)) {
      toast.error('Solo el líder del equipo puede eliminarlo');
      return;
    }
    const ok = await confirmar({
      titulo: '¿Eliminar equipo?',
      mensaje: (
        <>
          Se eliminará <strong className="text-zinc-900 dark:text-zinc-100">{team.nombre}</strong> con sus miembros,
          invitaciones y vínculos con proyectos. Sus miembros podrían perder el permiso de editar esos proyectos.
        </>
      ),
      textoConfirmar: 'Eliminar',
      peligro: true
    });
    if (!ok) return;
    try {
      await deleteEquipo(team.equipo_id);
      toast.success("Equipo eliminado");
      if (equipoAbiertoId === team.equipo_id) cerrarMiembros();
      await recargar();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo eliminar el equipo'));
    }
  };

  // Responder una invitación recibida
  const responderInvitacion = async (invitacion: InvitacionEquipo, aceptar: boolean) => {
    if (!uid) return;
    setInvitacionEnProceso(invitacion.id);
    try {
      if (aceptar) {
        await aceptarInvitacionEquipo(invitacion.id, uid);
        toast.success('Te uniste al equipo');
      } else {
        await rechazarInvitacionEquipo(invitacion.id, uid);
        toast.success('Invitación rechazada');
      }
      await Promise.all([fetchInvitaciones(), recargar()]);
    } catch (err) {
      console.error('Error al responder la invitación:', err);
      toast.error(mensajeError(err, 'No se pudo responder la invitación'));
    } finally {
      setInvitacionEnProceso(null);
    }
  };

  // Miembros del equipo abierto según los datos más recientes
  const miembrosActuales = () => equipoAbierto?.miembros ?? [];

  const esIdRolLider = (id: string) => esRolLider(roles.find(r => r.id === id)?.nombre_rol);

  // Un equipo con líder no puede quedarse sin ninguno: nadie podría gestionarlo
  const quedariaSinLider = (userId: string, nuevosIdRoles: string[]) => {
    const tieneLider = (ids: string[]) => ids.some(esIdRolLider);
    const miembros = miembrosActuales();
    const habiaLider = miembros.some(m => m.esLider);
    const quedaLider = miembros.some(m =>
      tieneLider(m.usuario.id === userId ? nuevosIdRoles : m.roles.map(r => r.id))
    );
    return habiaLider && !quedaLider;
  };

  // Invitar a un usuario nuevo o actualizar los roles de un miembro
  const handleGuardarMiembro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipoAbierto || !uid) return;
    if (!memberForm.id_usuario) {
      toast.error('Selecciona un usuario');
      return;
    }
    if (!puedeGestionarEquipo(equipoAbierto.equipo_id)) {
      toast.error('Solo el líder del equipo puede invitar miembros o cambiar roles');
      return;
    }

    const esMiembroExistente = miembrosActuales().some(m => m.usuario.id === memberForm.id_usuario);
    if (esMiembroExistente && quedariaSinLider(memberForm.id_usuario, memberForm.id_roles)) {
      toast.error('El equipo debe conservar al menos un líder');
      return;
    }

    setGuardandoMiembro(true);
    try {
      if (esMiembroExistente) {
        await actualizarRolesMiembro(equipoAbierto.equipo_id, memberForm.id_usuario, memberForm.id_roles);
        toast.success("Roles actualizados");
        await recargar();
      } else {
        // La membresía se crea cuando el usuario acepta la invitación
        await crearInvitacionEquipo(equipoAbierto.equipo_id, uid, memberForm.id_usuario, memberForm.id_roles);
        toast.success('Invitación enviada. El usuario se unirá cuando la acepte.');
      }
      setMemberForm({ id_usuario: '', id_roles: [] });
    } catch (e) {
      console.error('Error al guardar miembro del equipo:', e);
      toast.error(mensajeError(e, esMiembroExistente ? 'No se pudieron actualizar los roles' : 'No se pudo enviar la invitación'));
    } finally {
      setGuardandoMiembro(false);
    }
  };

  // Remover Miembro del Equipo (el líder no puede removerse a sí mismo)
  const handleRemoveMember = async (miembro: MiembroDetallado) => {
    if (!equipoAbierto) return;
    if (!puedeGestionarEquipo(equipoAbierto.equipo_id)) {
      toast.error('Solo el líder del equipo puede remover miembros');
      return;
    }
    if (miembro.usuario.id === uid) {
      toast.error('No puedes removerte a ti mismo del equipo');
      return;
    }
    const ok = await confirmar({
      titulo: '¿Remover miembro?',
      mensaje: <><strong className="text-zinc-900 dark:text-zinc-100">{nombreDe(miembro.usuario)}</strong> dejará de ser miembro de {equipoAbierto.nombre}.</>,
      textoConfirmar: 'Remover',
      peligro: true
    });
    if (!ok) return;
    try {
      await removeMiembroEquipo(equipoAbierto.equipo_id, miembro.usuario.id);
      toast.success("Miembro removido");
      if (memberForm.id_usuario === miembro.usuario.id) setMemberForm({ id_usuario: '', id_roles: [] });
      await recargar();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo remover al miembro'));
    }
  };

  // El líder pide al creador del proyecto desvincular al equipo
  const solicitarDesvinculacion = async (proyecto: ProyectoDelEquipo) => {
    if (!uid || !equipoAbierto) return;
    if (!puedeGestionarEquipo(equipoAbierto.equipo_id)) {
      toast.error('Solo el líder del equipo puede solicitar la desvinculación');
      return;
    }
    const ok = await confirmar({
      titulo: '¿Solicitar desvinculación?',
      mensaje: (
        <>
          Se pedirá al creador de <strong className="text-zinc-900 dark:text-zinc-100">{proyecto.nombre}</strong> que
          acepte desvincular a {equipoAbierto.nombre}.
        </>
      ),
      textoConfirmar: 'Enviar solicitud'
    });
    if (!ok) return;
    try {
      await crearSolicitudProyectoEquipo(proyecto.proyecto_id, equipoAbierto.equipo_id, uid, 'desvincular');
      toast.success('Solicitud de desvinculación enviada al creador del proyecto');
      await fetchData();
    } catch (err) {
      console.error('Error al solicitar desvinculación del proyecto:', err);
      toast.error(mensajeError(err, 'No se pudo enviar la solicitud'));
    }
  };

  // Al elegir un usuario que ya es miembro, precargar sus roles para editarlos
  const seleccionarUsuarioMiembro = (userId: string) => {
    const existente = miembrosActuales().find(m => m.usuario.id === userId);
    setMemberForm({
      id_usuario: userId,
      id_roles: existente ? existente.roles.map(r => r.id) : []
    });
  };

  const toggleRolMiembro = (rolId: string) => {
    setMemberForm(prev => ({
      ...prev,
      id_roles: prev.id_roles.includes(rolId)
        ? prev.id_roles.filter(id => id !== rolId)
        : [...prev.id_roles, rolId]
    }));
  };

  const termino = searchTerm.trim().toLowerCase();
  const filteredTeams = equipos.filter(t =>
    !termino ||
    t.nombre.toLowerCase().includes(termino) ||
    t.proyectos.some(p => p.nombre.toLowerCase().includes(termino)) ||
    t.miembros.some(m => nombreDe(m.usuario).toLowerCase().includes(termino))
  );
  const esMiembro = (team: EquipoDetallado) => team.miembros.some(m => m.usuario.id === uid);
  const gruposEquipos = [
    {
      titulo: 'Mis equipos',
      equipos: filteredTeams.filter(esMiembro),
      mensajeVacio: termino
        ? 'Ninguno de tus equipos coincide con la búsqueda.'
        : 'Aún no formas parte de ningún equipo. Crea uno o acepta una invitación.'
    },
    {
      titulo: 'Equipos de la comunidad',
      equipos: filteredTeams.filter(t => !esMiembro(t)),
      mensajeVacio: termino
        ? 'Ningún otro equipo coincide con la búsqueda.'
        : 'No hay otros equipos.'
    }
  ];

  // ==========================================
  // MODAL CREAR / EDITAR EQUIPO
  // ==========================================
  const modalEquipo = (
    <Modal
      open={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      title={editingEquipo ? 'Editar Equipo' : 'Nuevo Equipo'}
      description={editingEquipo ? undefined : 'Quedarás como líder del equipo.'}
    >
      <form onSubmit={handleSaveTeam} noValidate className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-4">
          <div>
            <label htmlFor="equipo-nombre" className={etiqueta}>
              Nombre del Equipo <span className="text-rose-500">*</span>
            </label>
            <input
              id="equipo-nombre"
              type="text"
              placeholder="Ej. Frontend Squad"
              maxLength={80}
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              className={campo}
            />
          </div>

          <div>
            <label htmlFor="equipo-descripcion" className={etiqueta}>
              Descripción <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="equipo-descripcion"
              rows={2}
              placeholder="Objetivos o enfoque del equipo..."
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              className={`${campo} resize-none`}
            />
          </div>
          <p className="text-[11px] text-zinc-400">
            Para vincular el equipo a un proyecto, el creador del proyecto lo invita desde la página del proyecto.
          </p>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setIsModalOpen(false)} className={btnSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} className={btnPrimario}>
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {saving ? 'Guardando...' : editingEquipo ? 'Guardar cambios' : 'Crear Equipo'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );

  // ==========================================
  // VISTA DE MIEMBROS DE UN EQUIPO
  // ==========================================
  if (equipoAbiertoId && (equipoAbierto || loading)) {
    if (!equipoAbierto) {
      return (
        <div className="space-y-4">
          <div className="h-8 w-72 max-w-full bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
          <div className="h-40 bg-zinc-100 dark:bg-zinc-900/40 rounded-2xl animate-pulse" />
        </div>
      );
    }

    const puedeGestionar = puedeGestionarEquipo(equipoAbierto.equipo_id);
    const editandoMiembro = equipoAbierto.miembros.some(m => m.usuario.id === memberForm.id_usuario);
    const idsMiembros = new Set(equipoAbierto.miembros.map(m => m.usuario.id));

    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
          <div className="min-w-0">
            <button
              onClick={cerrarMiembros}
              className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors mb-2 group cursor-pointer"
            >
              <ChevronLeft size={14} className="mr-1 group-hover:-translate-x-0.5 transition-transform" />
              Equipos
            </button>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
              <Users className="text-zinc-700 dark:text-zinc-300 shrink-0" size={24} />
              {equipoAbierto.nombre}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs">
              {equipoAbierto.descripcion || 'Sin descripción.'}
            </p>
          </div>
          {puedeGestionar && (
            <button onClick={() => openModal(equipoAbierto)} className={`${btnSecundario} shrink-0`}>
              <Edit2 size={14} />
              Editar equipo
            </button>
          )}
        </div>

        {/* Invitar miembros o cambiar roles (solo líder) */}
        {!puedeGestionar ? (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl p-4 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <Lock size={15} className="shrink-0" />
            <span>Solo los líderes de este equipo pueden invitar o remover miembros. Tienes acceso de lectura.</span>
          </div>
        ) : (
          <div className={`${tarjeta} p-5 shadow-xs`}>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
              <UserPlus size={16} className="text-blue-600" />
              {editandoMiembro ? 'Editar roles del miembro' : 'Invitar a un usuario'}
            </h3>
            <p className="text-[11px] text-zinc-500 mb-3">
              {editandoMiembro
                ? 'Los cambios se aplican de inmediato.'
                : 'El usuario se unirá al equipo con estos roles cuando acepte la invitación.'}
            </p>
            <form onSubmit={handleGuardarMiembro} noValidate className="space-y-3">
              <div>
                <label htmlFor="miembro-usuario" className={etiqueta}>
                  Usuario <span className="text-rose-500">*</span>
                </label>
                <select
                  id="miembro-usuario"
                  value={memberForm.id_usuario}
                  onChange={(e) => seleccionarUsuarioMiembro(e.target.value)}
                  className={campo}
                >
                  <option value="">Seleccionar usuario...</option>
                  {usuarios
                    // Uno mismo solo aparece si ya es miembro (para editar sus roles)
                    .filter(u => u.id !== uid || idsMiembros.has(u.id))
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {nombreDe(u)} ({u.correo}){idsMiembros.has(u.id) ? ' · ya es miembro' : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <span className={etiqueta}>Roles en el equipo</span>
                {roles.length === 0 ? (
                  <p className="text-[11px] text-zinc-400">No hay roles disponibles</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Roles en el equipo">
                    {roles.map(r => {
                      const seleccionado = memberForm.id_roles.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => toggleRolMiembro(r.id)}
                          aria-pressed={seleccionado}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                            seleccionado
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-blue-400'
                          }`}
                        >
                          {seleccionado ? <Check size={11} /> : esRolLider(r.nombre_rol) ? <Crown size={11} /> : null}
                          {r.nombre_rol}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                {memberForm.id_usuario && (
                  <button
                    type="button"
                    onClick={() => setMemberForm({ id_usuario: '', id_roles: [] })}
                    className={btnSecundario}
                  >
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={guardandoMiembro} className={btnPrimario}>
                  {editandoMiembro ? <Save size={14} /> : <Send size={14} />}
                  {guardandoMiembro ? 'Guardando...' : editandoMiembro ? 'Guardar roles' : 'Enviar invitación'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Proyectos vinculados */}
        {equipoAbierto.proyectos.length > 0 && (
          <div className={`${tarjeta} overflow-hidden`}>
            <div className="px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Proyectos vinculados ({equipoAbierto.proyectos.length})
              </h3>
            </div>
            <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
              {equipoAbierto.proyectos.map(p => (
                <div key={p.proyecto_id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <Link
                    href={`/requerimientos/?id=${p.proyecto_id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    <FolderGit2 size={13} className="text-zinc-400" />
                    {p.nombre}
                  </Link>
                  {puedeGestionar && (
                    p.solicitudDesvinculacionPendiente ? (
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40">
                        Solicitud pendiente
                      </span>
                    ) : (
                      <button
                        onClick={() => solicitarDesvinculacion(p)}
                        className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:text-rose-600 hover:border-rose-300 cursor-pointer"
                      >
                        Solicitar desvinculación
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista de Miembros Actuales */}
        <div className={`${tarjeta} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Integrantes ({equipoAbierto.miembros.length})
            </h3>
          </div>

          <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
            {equipoAbierto.miembros.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                Este equipo aún no tiene miembros.
              </div>
            ) : (
              equipoAbierto.miembros.map(m => (
                <div
                  key={m.usuario.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    memberForm.id_usuario === m.usuario.id ? 'bg-blue-50/60 dark:bg-blue-950/20' : 'hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-8 h-8 shrink-0 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold">
                      {iniciales(m.usuario)}
                      {m.esLider && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-white flex items-center justify-center" title="Líder">
                          <Crown size={9} />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                        {m.usuario.nombre || 'Usuario'}
                        {m.usuario.id === uid && <span className="font-normal text-zinc-400"> (tú)</span>}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate">{m.usuario.correo}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:justify-end">
                    <div className="flex flex-wrap gap-1 sm:justify-end">
                      {m.roles.length === 0 ? (
                        <span className="text-[10px] text-zinc-400 italic">Sin rol</span>
                      ) : m.roles.map(r => (
                        <span key={r.id} className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40">
                          {r.nombre_rol}
                        </span>
                      ))}
                    </div>
                    {puedeGestionar && (
                      <div className="flex items-center shrink-0">
                        <button
                          onClick={() => {
                            seleccionarUsuarioMiembro(m.usuario.id);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={btnIcono}
                          title="Editar roles"
                          aria-label={`Editar roles de ${nombreDe(m.usuario)}`}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => handleRemoveMember(m)}
                          disabled={m.usuario.id === uid}
                          className={btnIconoPeligro}
                          title={m.usuario.id === uid ? 'No puedes removerte a ti mismo' : 'Remover miembro'}
                          aria-label={`Remover a ${nombreDe(m.usuario)}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {modalEquipo}
      </div>
    );
  }

  // ==========================================
  // LISTA DE EQUIPOS
  // ==========================================
  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
            <Users className="text-zinc-700 dark:text-zinc-300" size={24} />
            Equipos
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Equipos multidisciplinarios, sus integrantes, roles y proyectos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectTeamRequestInbox userId={uid} onResponded={recargar} />

          {/* Invitaciones recibidas */}
          <div className="relative">
            <button
              onClick={() => {
                if (!invitacionesAbiertas) void fetchInvitaciones();
                setInvitacionesAbiertas(abierto => !abierto);
              }}
              aria-expanded={invitacionesAbiertas}
              aria-haspopup="dialog"
              className={btnSecundario}
            >
              <Bell size={15} />
              Invitaciones
              {invitaciones.length > 0 && (
                <span className="min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {invitaciones.length}
                </span>
              )}
            </button>
            {invitacionesAbiertas && (
              <div
                role="dialog"
                aria-label="Invitaciones recibidas"
                className="absolute right-0 top-full mt-2 z-40 w-[min(22rem,calc(100vw-2rem))] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl overflow-hidden animate-in zoom-in"
              >
                <div className="px-4 py-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Invitaciones recibidas</h2>
                </div>
                <div className="max-h-[min(26rem,70vh)] overflow-y-auto">
                  {loadingInvitaciones ? (
                    <div className="p-6 flex justify-center">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : invitaciones.length === 0 ? (
                    <p className="p-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                      No tienes invitaciones pendientes.
                    </p>
                  ) : (
                    <ul className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                      {invitaciones.map(invitacion => {
                        const equipo = equipos.find(item => item.equipo_id === invitacion.id_equipo);
                        const invitador = usuarios.find(item => item.id === invitacion.id_invitador);
                        const idsRoles = invitacion.id_roles ?? (invitacion.id_rol ? [invitacion.id_rol] : []);
                        const rolesPropuestos = roles.filter(r => idsRoles.includes(r.id));
                        const enProceso = invitacionEnProceso === invitacion.id;
                        return (
                          <li key={invitacion.id} className="p-4">
                            <p className="text-xs text-zinc-700 dark:text-zinc-200">
                              <span className="font-semibold">{invitador ? nombreDe(invitador) : 'Un usuario'}</span>
                              {' te invita a unirte a '}
                              <span className="font-semibold">{equipo?.nombre || 'un equipo'}</span>.
                            </p>
                            {rolesPropuestos.length > 0 && (
                              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                Roles: {rolesPropuestos.map(r => r.nombre_rol).join(', ')}
                              </p>
                            )}
                            <div className="mt-3 flex justify-end gap-2">
                              <button
                                onClick={() => responderInvitacion(invitacion, false)}
                                disabled={enProceso}
                                className="px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                              >
                                Rechazar
                              </button>
                              <button
                                onClick={() => responderInvitacion(invitacion, true)}
                                disabled={enProceso}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-[11px] font-medium text-white disabled:opacity-50 cursor-pointer"
                              >
                                {enProceso ? 'Procesando...' : 'Aceptar'}
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

          <button onClick={() => openModal()} className={btnPrimario}>
            <Plus size={15} />
            Nuevo Equipo
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
          <Search size={14} />
        </div>
        <input
          type="search"
          placeholder="Buscar por equipo, proyecto o integrante..."
          aria-label="Buscar equipos"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={buscador}
        />
      </div>

      {/* Grid de Equipos */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Users size={22} />
          </div>
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {termino ? 'Sin resultados' : 'Todavía no hay equipos'}
          </h3>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">
            {termino ? 'Ningún equipo coincide con tu búsqueda.' : 'Crea tu primer equipo para organizar miembros y proyectos.'}
          </p>
          <div className="mt-4 flex justify-center">
            {termino ? (
              <button onClick={() => setSearchTerm('')} className={btnSecundario}>Limpiar búsqueda</button>
            ) : (
              <button onClick={() => openModal()} className={btnPrimario}>
                <Plus size={15} />
                Crear Equipo
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {gruposEquipos.map(({ titulo, equipos: equiposGrupo, mensajeVacio }) => (
            <section key={titulo} className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                {titulo}
                <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400">({equiposGrupo.length})</span>
              </h2>
              {equiposGrupo.length === 0 ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{mensajeVacio}</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {equiposGrupo.map((team) => {
                    const gestionable = puedeGestionarEquipo(team.equipo_id);
                    const lideres = team.miembros.filter(m => m.esLider);
                    return (
                      <div
                        key={team.equipo_id}
                        role="link"
                        tabIndex={0}
                        onClick={() => abrirMiembros(team)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.target === e.currentTarget) abrirMiembros(team);
                        }}
                        aria-label={`Ver miembros de ${team.nombre}`}
                        className={`group ${tarjeta} p-5 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-sm transition-all duration-200 flex flex-col justify-between cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40`}
                      >
                        <div>
                          <div className="flex items-start justify-between mb-3">
                            <div className="w-9 h-9 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-700 dark:text-zinc-300 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                              <Users size={18} />
                            </div>
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              {gestionable ? (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 mr-1 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-medium border border-amber-200/60 dark:border-amber-800/40">
                                    <Crown size={10} />
                                    Líder
                                  </span>
                                  <button
                                    onClick={() => openModal(team)}
                                    title="Editar equipo"
                                    aria-label={`Editar ${team.nombre}`}
                                    className={btnIcono}
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTeam(team)}
                                    title="Eliminar equipo"
                                    aria-label={`Eliminar ${team.nombre}`}
                                    className={btnIconoPeligro}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              ) : !esMiembro(team) && (
                                <span
                                  title="Solo el líder del equipo puede editarlo"
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500"
                                >
                                  <Lock size={12} />
                                  Solo lectura
                                </span>
                              )}
                            </div>
                          </div>

                          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {team.nombre}
                          </h3>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                            {team.descripcion || "Sin descripción."}
                          </p>

                          {lideres.length > 0 && (
                            <p className="mt-2 text-[11px] text-zinc-500 flex items-center gap-1 truncate">
                              <Crown size={11} className="text-amber-500 shrink-0" />
                              {lideres.map(l => nombreDe(l.usuario)).join(', ')}
                            </p>
                          )}

                          {/* Proyectos Vinculados */}
                          <div className="mt-3 flex flex-wrap gap-1">
                            {team.proyectos.length > 0 ? (
                              team.proyectos.map(p => (
                                <span key={p.proyecto_id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-medium border border-zinc-200/50 dark:border-zinc-700/50">
                                  <FolderGit2 size={10} />
                                  {p.nombre}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-zinc-400 italic">Sin proyectos vinculados</span>
                            )}
                          </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="flex -space-x-1.5">
                              {team.miembros.slice(0, 4).map(m => (
                                <span
                                  key={m.usuario.id}
                                  title={nombreDe(m.usuario)}
                                  className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 ring-2 ring-white dark:ring-zinc-900 flex items-center justify-center text-[9px] font-bold"
                                >
                                  {iniciales(m.usuario)}
                                </span>
                              ))}
                            </div>
                            <span className="text-zinc-500 text-[11px]">
                              {team.miembros.length} {team.miembros.length === 1 ? 'integrante' : 'integrantes'}
                            </span>
                          </div>
                          <span className="font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-0.5">
                            Miembros
                            <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {modalEquipo}
    </div>
  );
}
