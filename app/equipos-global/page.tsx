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
import PageHeader from '@/components/ui/PageHeader';
import { useCierreSeguro } from '@/lib/use-cierre-seguro';
import { useEstadoSesion } from '@/lib/use-estado-sesion';

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
  const [searchTerm, setSearchTerm] = useEstadoSesion("easyreq:equipos:buscar", "");

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
  const { hayCambios, intentarCerrar } = useCierreSeguro(isModalOpen, formData, () => setIsModalOpen(false));

  // Vista de miembros (se refleja en la URL como ?equipo=ID para que el botón
  // "atrás" del navegador regrese a la lista)
  const [equipoAbiertoId, setEquipoAbiertoId] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState({
    id_usuario: '',
    id_roles: [] as string[]
  });
  const [guardandoMiembro, setGuardandoMiembro] = useState(false);
  // Texto para encontrar rápido a un usuario en la lista de invitación
  const [filtroUsuario, setFiltroUsuario] = useState('');

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
    setFiltroUsuario('');
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
          Se eliminará <strong className="text-ink">{team.nombre}</strong> con sus miembros,
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
      setFiltroUsuario('');
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
      mensaje: <><strong className="text-ink">{nombreDe(miembro.usuario)}</strong> dejará de ser miembro de {equipoAbierto.nombre}.</>,
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
          Se pedirá al creador de <strong className="text-ink">{proyecto.nombre}</strong> que
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
      onClose={intentarCerrar}
      cerrarConFondo={!hayCambios}
      title={editingEquipo ? 'Editar Equipo' : 'Nuevo Equipo'}
      description={editingEquipo ? undefined : 'Quedarás como líder del equipo.'}
    >
      <form onSubmit={handleSaveTeam} noValidate className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-4">
          <div>
            <label htmlFor="equipo-nombre" className={etiqueta}>
              Nombre del Equipo <span className="text-danger">*</span>
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
              Descripción <span className="text-danger">*</span>
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
          <p className="text-xs text-ink-subtle">
            Para vincular el equipo a un proyecto, el creador del proyecto lo invita desde la página del proyecto.
          </p>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={intentarCerrar} className={btnSecundario}>
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
          <div className="h-8 w-72 max-w-full bg-sunken-strong rounded-ui animate-pulse" />
          <div className="h-40 bg-sunken rounded-ui animate-pulse" />
        </div>
      );
    }

    const puedeGestionar = puedeGestionarEquipo(equipoAbierto.equipo_id);
    const editandoMiembro = equipoAbierto.miembros.some(m => m.usuario.id === memberForm.id_usuario);
    const idsMiembros = new Set(equipoAbierto.miembros.map(m => m.usuario.id));

    return (
      <div className="space-y-6 animate-in fade-in">
        <PageHeader
          back={
            <button
              onClick={cerrarMiembros}
              className="inline-flex items-center text-sm font-medium text-ink-subtle hover:text-ink transition-colors group cursor-pointer"
            >
              <ChevronLeft size={16} className="mr-1 group-hover:-translate-x-0.5 transition-transform" />
              Equipos
            </button>
          }
          title={equipoAbierto.nombre}
          description={equipoAbierto.descripcion || 'Sin descripción.'}
          actions={
            puedeGestionar && (
              <button onClick={() => openModal(equipoAbierto)} className={btnSecundario}>
                <Edit2 size={16} />
                Editar equipo
              </button>
            )
          }
        />

        {/* Invitar miembros o cambiar roles (solo líder) */}
        {!puedeGestionar ? (
          <div className="bg-warning-subtle border border-warning-line rounded-ui p-4 flex items-center gap-2.5 text-xs text-warning">
            <Lock size={15} className="shrink-0" />
            <span>Solo los líderes de este equipo pueden invitar o remover miembros. Tienes acceso de lectura.</span>
          </div>
        ) : (
          <div className={`${tarjeta} p-5`}>
            <h3 className="text-base font-semibold text-ink mb-1 flex items-center gap-2">
              <UserPlus size={16} className="text-brand-text" />
              {editandoMiembro ? 'Editar roles del miembro' : 'Invitar a un usuario'}
            </h3>
            <p className="text-xs text-ink-subtle mb-3">
              {editandoMiembro
                ? 'Los cambios se aplican de inmediato.'
                : 'El usuario se unirá al equipo con estos roles cuando acepte la invitación.'}
            </p>
            <form onSubmit={handleGuardarMiembro} noValidate className="space-y-3">
              <div>
                <label htmlFor="miembro-usuario" className={etiqueta}>
                  Usuario <span className="text-danger">*</span>
                </label>
                {!editandoMiembro && usuarios.length > 8 && (
                  <input
                    type="search"
                    value={filtroUsuario}
                    onChange={(e) => setFiltroUsuario(e.target.value)}
                    placeholder="Filtrar por nombre o correo..."
                    aria-label="Filtrar usuarios por nombre o correo"
                    className={`${campo} mb-2`}
                  />
                )}
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
                    .filter(u => {
                      const filtro = filtroUsuario.trim().toLowerCase();
                      return !filtro || u.id === memberForm.id_usuario || `${nombreDe(u)} ${u.correo}`.toLowerCase().includes(filtro);
                    })
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
                  <p className="text-xs text-ink-subtle">No hay roles disponibles</p>
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
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                            seleccionado
                              ? 'bg-brand-solid border-brand-text text-on-solid'
                              : 'bg-sunken border-line text-ink-muted hover:border-brand-text'
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
            <div className="px-5 py-4 border-b border-line">
              <h3 className="text-base font-semibold text-ink">
                Proyectos vinculados ({equipoAbierto.proyectos.length})
              </h3>
            </div>
            <div className="divide-y divide-line">
              {equipoAbierto.proyectos.map(p => (
                <div key={p.proyecto_id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <Link
                    href={`/requerimientos/?id=${p.proyecto_id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-ink hover:text-brand-text"
                  >
                    <FolderGit2 size={13} className="text-ink-subtle" />
                    {p.nombre}
                  </Link>
                  {puedeGestionar && (
                    p.solicitudDesvinculacionPendiente ? (
                      <span className="px-2.5 py-1 rounded-ui text-xs font-medium text-warning bg-warning-subtle border border-warning-line">
                        Solicitud pendiente
                      </span>
                    ) : (
                      <button
                        onClick={() => solicitarDesvinculacion(p)}
                        className="px-3 py-1.5 border border-line rounded-ui text-xs font-medium text-ink-muted hover:text-danger hover:border-danger-line cursor-pointer"
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
          <div className="px-5 py-4 border-b border-line">
            <h3 className="text-base font-semibold text-ink">
              Integrantes ({equipoAbierto.miembros.length})
            </h3>
          </div>

          <div className="divide-y divide-line">
            {equipoAbierto.miembros.length === 0 ? (
              <div className="p-8 text-center text-xs text-ink-subtle">
                Este equipo aún no tiene miembros.
              </div>
            ) : (
              equipoAbierto.miembros.map(m => (
                <div
                  key={m.usuario.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    memberForm.id_usuario === m.usuario.id ? 'bg-brand-subtle' : 'hover:bg-sunken'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-8 h-8 shrink-0 rounded-full bg-brand-subtle text-brand-text flex items-center justify-center text-xs font-bold">
                      {iniciales(m.usuario)}
                      {m.esLider && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-warning text-canvas flex items-center justify-center" title="Líder">
                          <Crown size={9} />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">
                        {m.usuario.nombre || 'Usuario'}
                        {m.usuario.id === uid && <span className="font-normal text-ink-subtle"> (tú)</span>}
                      </p>
                      <p className="text-xs text-ink-subtle truncate">{m.usuario.correo}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:justify-end">
                    <div className="flex flex-wrap gap-1 sm:justify-end">
                      {m.roles.length === 0 ? (
                        <span className="text-xs text-ink-subtle italic">Sin rol</span>
                      ) : m.roles.map(r => (
                        <span key={r.id} className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-subtle text-brand-text border border-brand-line">
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
      <PageHeader
        title="Equipos"
        description="Equipos multidisciplinarios, sus integrantes, roles y proyectos."
        actions={
          <>
          {/*<ProjectTeamRequestInbox userId={uid} onResponded={recargar} />*/}
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
                <span className="min-w-4 h-4 px-1 rounded-full bg-danger-solid text-white text-xs font-bold flex items-center justify-center">
                  {invitaciones.length}
                </span>
              )}
            </button>
            {invitacionesAbiertas && (
              <div
                role="dialog"
                aria-label="Invitaciones recibidas"
                className="absolute right-0 top-full mt-2 z-40 w-[min(22rem,calc(100vw-2rem))] bg-surface border border-line-strong rounded-ui overflow-hidden animate-in zoom-in"
              >
                <div className="px-4 py-3 border-b border-line">
                  <h2 className="text-base font-semibold text-ink">Invitaciones recibidas</h2>
                </div>
                <div className="max-h-[min(26rem,70vh)] overflow-y-auto">
                  {loadingInvitaciones ? (
                    <div className="p-6 flex justify-center">
                      <div className="w-5 h-5 border-2 border-brand-text border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : invitaciones.length === 0 ? (
                    <p className="p-6 text-center text-xs text-ink-subtle">
                      No tienes invitaciones pendientes.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {invitaciones.map(invitacion => {
                        const equipo = equipos.find(item => item.equipo_id === invitacion.id_equipo);
                        const invitador = usuarios.find(item => item.id === invitacion.id_invitador);
                        const idsRoles = invitacion.id_roles ?? (invitacion.id_rol ? [invitacion.id_rol] : []);
                        const rolesPropuestos = roles.filter(r => idsRoles.includes(r.id));
                        const enProceso = invitacionEnProceso === invitacion.id;
                        return (
                          <li key={invitacion.id} className="p-4">
                            <p className="text-xs text-ink-muted">
                              <span className="font-semibold">{invitador ? nombreDe(invitador) : 'Un usuario'}</span>
                              {' te invita a unirte a '}
                              <span className="font-semibold">{equipo?.nombre || 'un equipo'}</span>.
                            </p>
                            {rolesPropuestos.length > 0 && (
                              <p className="mt-1 text-xs text-ink-subtle">
                                Roles: {rolesPropuestos.map(r => r.nombre_rol).join(', ')}
                              </p>
                            )}
                            <div className="mt-3 flex justify-end gap-2">
                              <button
                                onClick={() => responderInvitacion(invitacion, false)}
                                disabled={enProceso}
                                className="px-3 py-1.5 border border-line rounded-ui text-xs font-medium text-ink-muted hover:bg-sunken disabled:opacity-50 cursor-pointer"
                              >
                                Rechazar
                              </button>
                              <button
                                onClick={() => responderInvitacion(invitacion, true)}
                                disabled={enProceso}
                                className="px-3 py-1.5 bg-brand-solid hover:bg-brand-solid-hover rounded-ui text-xs font-medium text-on-solid disabled:opacity-50 cursor-pointer"
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
            <Plus size={16} />
            Nuevo equipo
          </button>
          </>
        }
      />

      {/* Buscador */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-subtle">
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
        <div className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden" role="status" aria-label="Cargando">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-sunken animate-pulse" />
          ))}
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="text-center py-20">
          <h3 className="text-lg font-semibold text-ink">
            {termino ? 'Sin resultados' : 'Todavía no hay equipos'}
          </h3>
          <p className="text-base text-ink-muted mt-2 max-w-sm mx-auto">
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
        <div className="space-y-12">
          {gruposEquipos.map(({ titulo, equipos: equiposGrupo, mensajeVacio }) => (
            <section key={titulo}>
              <h2 className="text-lg font-semibold text-ink mb-3">
                {titulo}
                <span className="ml-2 text-sm font-normal text-ink-subtle">{equiposGrupo.length}</span>
              </h2>
              {equiposGrupo.length === 0 ? (
                <p className="text-sm text-ink-subtle">{mensajeVacio}</p>
              ) : (
                <ul className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
                  {equiposGrupo.map((team) => {
                    const gestionable = puedeGestionarEquipo(team.equipo_id);
                    const lideres = team.miembros.filter(m => m.esLider);
                    return (
                      <li key={team.equipo_id}>
                        <div
                          role="link"
                          tabIndex={0}
                          onClick={() => abrirMiembros(team)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.target === e.currentTarget) abrirMiembros(team);
                          }}
                          aria-label={`Ver miembros de ${team.nombre}`}
                          className="group flex items-center gap-4 px-5 py-5 cursor-pointer hover:bg-sunken focus-visible:bg-sunken"
                        >
                          <span className="hidden sm:flex size-10 shrink-0 items-center justify-center rounded-ui bg-brand-solid text-on-solid">
                            <Users size={20} aria-hidden />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <h3 className="text-base font-semibold text-ink">{team.nombre}</h3>
                              {gestionable && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-subtle text-warning text-xs font-medium border border-warning-line">
                                  <Crown size={12} aria-hidden />
                                  Líder
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-ink-muted mt-1 line-clamp-1">
                              {team.descripcion || 'Sin descripción.'}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-subtle">
                              {lideres.length > 0 && (
                                <span className="flex items-center gap-1 min-w-0">
                                  <Crown size={12} aria-hidden className="text-warning shrink-0" />
                                  <span className="truncate">{lideres.map(l => nombreDe(l.usuario)).join(', ')}</span>
                                </span>
                              )}
                              <span className="flex items-center gap-1 min-w-0">
                                <FolderGit2 size={12} aria-hidden className="shrink-0" />
                                <span className="truncate">
                                  {team.proyectos.length > 0
                                    ? team.proyectos.map(p => p.nombre).join(', ')
                                    : 'Sin proyectos vinculados'}
                                </span>
                              </span>
                            </div>
                          </div>

                          <div className="hidden md:flex items-center gap-3 shrink-0 text-sm text-ink-muted">
                            <div className="flex -space-x-1.5">
                              {team.miembros.slice(0, 4).map(m => (
                                <span
                                  key={m.usuario.id}
                                  title={nombreDe(m.usuario)}
                                  className="size-7 rounded-full bg-brand-subtle text-brand-text ring-2 ring-surface flex items-center justify-center text-xs font-bold"
                                >
                                  {iniciales(m.usuario)}
                                </span>
                              ))}
                            </div>
                            <span>
                              {team.miembros.length} {team.miembros.length === 1 ? 'integrante' : 'integrantes'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {gestionable ? (
                              <>
                                <button
                                  onClick={() => openModal(team)}
                                  title="Editar equipo"
                                  aria-label={`Editar ${team.nombre}`}
                                  className={btnIcono}
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteTeam(team)}
                                  title="Eliminar equipo"
                                  aria-label={`Eliminar ${team.nombre}`}
                                  className={btnIconoPeligro}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            ) : !esMiembro(team) && (
                              <span
                                title="Solo el líder del equipo puede editarlo"
                                className="inline-flex items-center gap-1 px-2 text-xs font-medium text-ink-subtle"
                              >
                                <Lock size={14} aria-hidden />
                                Solo lectura
                              </span>
                            )}
                          </div>
                          <ChevronRight size={18} aria-hidden className="text-ink-muted group-hover:text-ink shrink-0" />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {modalEquipo}
    </div>
  );
}
