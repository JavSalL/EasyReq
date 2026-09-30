'use client';

import React, { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import {
  Users, Plus, Search, ChevronRight, ChevronLeft, FolderGit2,
  Save, Edit2, Trash2, Crown, UserPlus, Check, Lock
} from 'lucide-react';
import type { Equipo, Proyecto, PerfilUsuario, Rol } from '@/lib/database.types';
import {
  getEquipos,
  createEquipo,
  updateEquipo,
  deleteEquipo,
  getProyectos,
  getAllUsers,
  getRoles,
  getProyectoEquipos,
  linkEquipoToProyecto,
  unlinkEquipoFromProyecto,
  getMiembrosEquipo,
  addMiembroEquipo,
  removeMiembroEquipo,
  getEquiposLideradosPor,
  esRolLider
} from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';
import { mensajeError } from '@/lib/errores';
import { usePageTitle } from '@/lib/use-page-title';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  btnPrimario, btnSecundario, btnIcono, btnIconoPeligro, buscador, campo, etiqueta, tarjeta
} from '@/components/ui/estilos';

interface MiembroDetallado {
  usuario: PerfilUsuario;
  roles: Rol[];
  esLider: boolean;
}

interface EquipoDetallado extends Equipo {
  proyectos: Array<{ proyecto_id: string; nombre: string }>;
  miembros: MiembroDetallado[];
}

const nombreDe = (u: PerfilUsuario) => u.nombre || u.correo;
const iniciales = (u: PerfilUsuario) => nombreDe(u).slice(0, 2).toUpperCase();

export default function EquiposGlobalPage() {
  const confirmar = useConfirm();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [equipos, setEquipos] = useState<Array<EquipoDetallado>>([]);
  const [proyectos, setProyectos] = useState<Array<Proyecto>>([]);
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

  // Modal Equipo (Crear / Editar)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEquipo, setEditingEquipo] = useState<Equipo | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    proyectos_seleccionados: [] as string[]
  });
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
      const [projData, usersData, rolesData, equiposData, peData, meData] = await Promise.all([
        getProyectos(),
        getAllUsers(),
        getRoles(),
        getEquipos(),
        getProyectoEquipos(),
        getMiembrosEquipo()
      ]);

      setProyectos([...projData].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setUsuarios([...usersData].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b))));
      setRoles(rolesData);

      const projMap = new Map(projData.map(p => [p.proyecto_id, p]));

      const formated: EquipoDetallado[] = equiposData.map(eq => {
        const projs = peData
          .filter(pe => pe.id_equipo === eq.equipo_id)
          .map(pe => projMap.get(pe.id_proyecto))
          .filter((p): p is Proyecto => Boolean(p))
          .map(p => ({ proyecto_id: p.proyecto_id, nombre: p.nombre }));

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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  // Apertura modal equipo
  const openModal = (team: EquipoDetallado | null = null) => {
    // Crear equipo está permitido a cualquier autenticado (queda como líder
    // inicial); editar requiere ser líder de ese equipo.
    if (team && !puedeGestionarEquipo(team.equipo_id)) {
      toast.error('Solo el líder del equipo puede editarlo');
      return;
    }
    setEditingEquipo(team);
    setFormData({
      nombre: team?.nombre ?? '',
      descripcion: team?.descripcion ?? '',
      proyectos_seleccionados: (team?.proyectos || []).map(p => p.proyecto_id)
    });
    setIsModalOpen(true);
  };

  const toggleProyectoFormulario = (proyectoId: string) => {
    setFormData(prev => ({
      ...prev,
      proyectos_seleccionados: prev.proyectos_seleccionados.includes(proyectoId)
        ? prev.proyectos_seleccionados.filter(id => id !== proyectoId)
        : [...prev.proyectos_seleccionados, proyectoId]
    }));
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
      let teamId = editingEquipo?.equipo_id;

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
        const newTeam = await createEquipo({
          nombre: formData.nombre.trim(),
          descripcion: formData.descripcion.trim()
        });
        teamId = newTeam.equipo_id;
        // El creador queda como líder inicial para poder gestionar el equipo.
        if (uid) {
          const rolLider = roles.find(r => esRolLider(r.nombre_rol));
          try {
            await addMiembroEquipo(teamId, uid, rolLider ? [rolLider.id] : []);
          } catch (e) {
            console.error('No se pudo asignar al creador como miembro líder:', e);
          }
        }
      }

      // Sincronizar vínculos con proyectos (solo los que cambiaron)
      if (teamId) {
        const allPE = await getProyectoEquipos();
        const actuales = allPE.filter(pe => pe.id_equipo === teamId).map(pe => pe.id_proyecto);
        const seleccionados = formData.proyectos_seleccionados;
        await Promise.all([
          ...actuales.filter(id => !seleccionados.includes(id)).map(id => unlinkEquipoFromProyecto(id, teamId!)),
          ...seleccionados.filter(id => !actuales.includes(id)).map(id => linkEquipoToProyecto(id, teamId!))
        ]);
      }

      toast.success(editingEquipo ? "Equipo actualizado" : "Equipo creado. Eres su líder.");
      setIsModalOpen(false);
      await Promise.all([fetchData(), cargarLiderazgo()]);
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
          Se eliminará <strong className="text-zinc-900 dark:text-zinc-100">{team.nombre}</strong> y sus vínculos
          con proyectos. Sus miembros podrían perder el permiso de editar esos proyectos.
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
      await Promise.all([fetchData(), cargarLiderazgo()]);
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo eliminar el equipo'));
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
    ) || tieneLider(nuevosIdRoles);
    return habiaLider && !quedaLider;
  };

  // Agregar miembro o actualizar sus roles
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipoAbierto) return;
    if (!memberForm.id_usuario) {
      toast.error('Selecciona un usuario');
      return;
    }
    if (!puedeGestionarEquipo(equipoAbierto.equipo_id)) {
      toast.error('Solo el líder del equipo puede agregar miembros');
      return;
    }
    if (quedariaSinLider(memberForm.id_usuario, memberForm.id_roles)) {
      toast.error('El equipo debe conservar al menos un líder');
      return;
    }

    const esMiembroExistente = miembrosActuales()
      .some(m => m.usuario.id === memberForm.id_usuario);

    setGuardandoMiembro(true);
    try {
      // El rol de líder va primero: es el que se guarda en el `id_rol` legacy
      const idRolesOrdenados = [...memberForm.id_roles].sort((a, b) => Number(esIdRolLider(b)) - Number(esIdRolLider(a)));
      await addMiembroEquipo(equipoAbierto.equipo_id, memberForm.id_usuario, idRolesOrdenados);
      toast.success(esMiembroExistente ? "Roles actualizados" : "Miembro agregado al equipo");
      setMemberForm({ id_usuario: '', id_roles: [] });
      await Promise.all([fetchData(), cargarLiderazgo()]);
    } catch (e) {
      toast.error(mensajeError(e, esMiembroExistente ? 'No se pudieron actualizar los roles' : 'No se pudo agregar al miembro'));
    } finally {
      setGuardandoMiembro(false);
    }
  };

  // Remover Miembro del Equipo
  const handleRemoveMember = async (miembro: MiembroDetallado) => {
    if (!equipoAbierto) return;
    if (!puedeGestionarEquipo(equipoAbierto.equipo_id)) {
      toast.error('Solo el líder del equipo puede remover miembros');
      return;
    }
    if (quedariaSinLider(miembro.usuario.id, [])) {
      toast.error('No puedes remover al único líder del equipo');
      return;
    }
    const esUnoMismo = miembro.usuario.id === uid;
    const ok = await confirmar({
      titulo: esUnoMismo ? '¿Salir del equipo?' : '¿Remover miembro?',
      mensaje: esUnoMismo
        ? <>Dejarás de ser miembro de <strong className="text-zinc-900 dark:text-zinc-100">{equipoAbierto.nombre}</strong> y ya no podrás gestionarlo.</>
        : <><strong className="text-zinc-900 dark:text-zinc-100">{nombreDe(miembro.usuario)}</strong> dejará de ser miembro de {equipoAbierto.nombre}.</>,
      textoConfirmar: esUnoMismo ? 'Salir' : 'Remover',
      peligro: true
    });
    if (!ok) return;
    try {
      await removeMiembroEquipo(equipoAbierto.equipo_id, miembro.usuario.id);
      toast.success(esUnoMismo ? "Saliste del equipo" : "Miembro removido");
      if (memberForm.id_usuario === miembro.usuario.id) setMemberForm({ id_usuario: '', id_roles: [] });
      await Promise.all([fetchData(), cargarLiderazgo()]);
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo remover al miembro'));
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
            {equipoAbierto.proyectos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {equipoAbierto.proyectos.map(p => (
                  <Link
                    key={p.proyecto_id}
                    href={`/requerimientos/?id=${p.proyecto_id}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-medium border border-zinc-200/50 dark:border-zinc-700/50 hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    <FolderGit2 size={10} />
                    {p.nombre}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {puedeGestionar && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => openModal(equipoAbierto)} className={btnSecundario}>
                <Edit2 size={14} />
                Editar equipo
              </button>
            </div>
          )}
        </div>

        {/* Formulario para agregar miembro (solo líder) */}
        {!puedeGestionar ? (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl p-4 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <Lock size={15} className="shrink-0" />
            <span>Solo los líderes de este equipo pueden agregar o remover miembros. Tienes acceso de lectura.</span>
          </div>
        ) : (
          <div className={`${tarjeta} p-5 shadow-xs`}>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
              <UserPlus size={16} className="text-blue-600" />
              {editandoMiembro ? 'Editar roles del miembro' : 'Agregar miembro'}
            </h3>
            <form onSubmit={handleAddMember} noValidate className="space-y-3">
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
                  {usuarios.map(u => (
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
                  {editandoMiembro ? <Save size={14} /> : <Plus size={14} />}
                  {guardandoMiembro ? 'Guardando...' : editandoMiembro ? 'Guardar roles' : 'Agregar miembro'}
                </button>
              </div>
            </form>
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
                          className={btnIconoPeligro}
                          title={m.usuario.id === uid ? 'Salir del equipo' : 'Remover miembro'}
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

        {renderModalEquipo()}
      </div>
    );
  }

  // ==========================================
  // MODAL CREAR / EDITAR EQUIPO
  // ==========================================
  function renderModalEquipo() {
    return (
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

            <div>
              <span className={etiqueta}>
                Proyectos vinculados
                {formData.proyectos_seleccionados.length > 0 && (
                  <span className="text-zinc-400 font-normal"> ({formData.proyectos_seleccionados.length})</span>
                )}
              </span>
              <div className="max-h-40 overflow-y-auto space-y-0.5 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1.5 bg-zinc-50/50 dark:bg-zinc-950 custom-scrollbar">
                {proyectos.length === 0 ? (
                  <p className="text-[11px] text-zinc-400 p-1.5">No hay proyectos disponibles</p>
                ) : (
                  proyectos.map(p => (
                    <label key={p.proyecto_id} className="flex items-center gap-2 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={formData.proyectos_seleccionados.includes(p.proyecto_id)}
                        onChange={() => toggleProyectoFormulario(p.proyecto_id)}
                        className="rounded accent-blue-600"
                      />
                      <span className="text-zinc-800 dark:text-zinc-200">{p.nombre}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
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
        <button onClick={() => openModal()} className={btnPrimario}>
          <Plus size={15} />
          Nuevo Equipo
        </button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeams.map((team) => {
            const gestionable = puedeGestionarEquipo(team.equipo_id);
            const lideres = team.miembros.filter(m => m.esLider);
            const soyMiembro = team.miembros.some(m => m.usuario.id === uid);
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
                      ) : soyMiembro ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] font-medium border border-blue-200/60 dark:border-blue-800/40">
                          Eres miembro
                        </span>
                      ) : (
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

      {renderModalEquipo()}
    </div>
  );
}
