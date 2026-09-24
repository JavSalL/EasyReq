'use client';

import React, { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { 
  Users, Plus, Search, ChevronRight, ChevronLeft, FolderGit2, 
  X, Save, Edit2, Trash2, Crown, UserPlus, Shield, Check, Lock
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

interface EquipoDetallado extends Equipo {
  proyectos?: Array<{ proyecto_id: string; nombre: string }>;
  miembros?: Array<{
    usuario: PerfilUsuario;
    rol: Rol | null;
  }>;
  lider_actual?: PerfilUsuario | null;
}

export default function EquiposGlobalPage() {
  const router = useRouter();
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

  // Modal Miembros
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [equipoParaMiembros, setEquipoParaMiembros] = useState<EquipoDetallado | null>(null);
  const [memberForm, setMemberForm] = useState({
    id_usuario: '',
    id_rol: ''
  });

  // Modal Eliminar
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [equipoToDelete, setEquipoToDelete] = useState<Equipo | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [projData, usersData, rolesData, equiposData, peData, meData] = await Promise.all([
        getProyectos(),
        getAllUsers(),
        getRoles(),
        getEquipos(),
        getProyectoEquipos(),
        getMiembrosEquipo()
      ]);

      setProyectos(projData);
      setUsuarios(usersData);
      setRoles(rolesData);

      const projMap = new Map(projData.map(p => [p.proyecto_id, p]));

      const formated: EquipoDetallado[] = equiposData.map(eq => {
        const assignedProjIds = peData
          .filter(pe => pe.id_equipo === eq.equipo_id)
          .map(pe => pe.id_proyecto);

        const projs = assignedProjIds
          .map(id => projMap.get(id))
          .filter(Boolean)
          .map(p => ({ proyecto_id: p!.proyecto_id, nombre: p!.nombre }));

        const members = meData
          .filter(me => me.id_equipo === eq.equipo_id && me.usuario)
          .map(me => ({
            usuario: me.usuario!,
            rol: me.rol || null
          }));

        // Identificar líder por rol
        const liderMember = members.find(m => m.rol?.nombre_rol?.toLowerCase().includes('líder') || m.rol?.nombre_rol?.toLowerCase().includes('lider'));

        return {
          ...eq,
          proyectos: projs,
          miembros: members,
          lider_actual: liderMember ? liderMember.usuario : null
        };
      });

      setEquipos(formated);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar equipos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Apertura modal equipo
  const openModal = (team: EquipoDetallado | null = null) => {
    // Crear equipo está permitido a cualquier autenticado (queda como líder
    // inicial); editar requiere ser líder de ese equipo.
    if (team && !puedeGestionarEquipo(team.equipo_id)) {
      toast.error('Solo el líder del equipo puede editarlo');
      return;
    }
    if (team) {
      setEditingEquipo(team);
      setFormData({ 
        nombre: team.nombre, 
        descripcion: team.descripcion || '',
        proyectos_seleccionados: (team.proyectos || []).map(p => p.proyecto_id)
      });
    } else {
      setEditingEquipo(null);
      setFormData({ 
        nombre: '', 
        descripcion: '',
        proyectos_seleccionados: []
      });
    }
    setIsModalOpen(true);
  };

  // Guardar Equipo
  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      toast.error("El nombre del equipo es obligatorio");
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
          descripcion: formData.descripcion.trim() || undefined
        });
      } else {
        const newTeam = await createEquipo({ 
          nombre: formData.nombre.trim(), 
          descripcion: formData.descripcion.trim() || undefined
        });
        teamId = newTeam.equipo_id;
        // El creador queda como líder inicial para poder gestionar el equipo.
        if (uid) {
          const rolLider = roles.find(r => esRolLider(r.nombre_rol));
          try {
            await addMiembroEquipo(teamId, uid, rolLider?.id ?? null);
          } catch (e) {
            console.error('No se pudo asignar al creador como miembro líder:', e);
          }
        }
      }

      // Sincronizar asignaciones de proyectos
      if (teamId) {
        // Unlink old
        const allPE = await getProyectoEquipos();
        const currentPE = allPE.filter(pe => pe.id_equipo === teamId);
        for (const pe of currentPE) {
          if (!formData.proyectos_seleccionados.includes(pe.id_proyecto)) {
            await unlinkEquipoFromProyecto(pe.id_proyecto, teamId);
          }
        }
        // Link new
        for (const projId of formData.proyectos_seleccionados) {
          await linkEquipoToProyecto(projId, teamId);
        }
      }

      toast.success(editingEquipo ? "Equipo actualizado" : "Equipo creado con éxito");
      setIsModalOpen(false);
      fetchData();
      cargarLiderazgo();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Error al guardar equipo");
    } finally {
      setSaving(false);
    }
  };

  // Eliminar Equipo
  const handleDeleteTeam = async () => {
    if (!equipoToDelete) return;
    if (!puedeGestionarEquipo(equipoToDelete.equipo_id)) {
      toast.error('Solo el líder del equipo puede eliminarlo');
      return;
    }
    try {
      await deleteEquipo(equipoToDelete.equipo_id);
      toast.success("Equipo eliminado");
      setIsDeleteModalOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error("Error al eliminar equipo");
    }
  };

  // Abrir Modal de Miembros
  const openMembersModal = (team: EquipoDetallado) => {
    setEquipoParaMiembros(team);
    setMemberForm({
      id_usuario: '',
      id_rol: ''
    });
    setIsMemberModalOpen(true);
  };

  // Agregar Miembro al Equipo
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipoParaMiembros || !memberForm.id_usuario) return;
    if (!puedeGestionarEquipo(equipoParaMiembros.equipo_id)) {
      toast.error('Solo el líder del equipo puede agregar miembros');
      return;
    }

    try {
      await addMiembroEquipo(equipoParaMiembros.equipo_id, memberForm.id_usuario, memberForm.id_rol || null);
      toast.success("Miembro agregado al equipo");
      fetchData();
      cargarLiderazgo();
    } catch (e: any) {
      toast.error("Error al agregar miembro");
    }
  };

  // Remover Miembro del Equipo
  const handleRemoveMember = async (userId: string) => {
    if (!equipoParaMiembros) return;
    if (!puedeGestionarEquipo(equipoParaMiembros.equipo_id)) {
      toast.error('Solo el líder del equipo puede remover miembros');
      return;
    }
    try {
      await removeMiembroEquipo(equipoParaMiembros.equipo_id, userId);
      toast.success("Miembro removido");
      fetchData();
      cargarLiderazgo();
    } catch (e: any) {
      toast.error("Error al remover miembro");
    }
  };

  const filteredTeams = equipos.filter(t => 
    t.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.proyectos || []).some(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isMemberModalOpen && equipoParaMiembros) {
    // Buscar datos actualizados del equipo
    const currentDetailed = equipos.find(e => e.equipo_id === equipoParaMiembros.equipo_id) || equipoParaMiembros;
    // Lectura total: cualquiera ve miembros; solo el líder gestiona.
    const puedeGestionar = puedeGestionarEquipo(currentDetailed.equipo_id);

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
          <div>
            <button 
              onClick={() => {
                setIsMemberModalOpen(false);
                setEquipoParaMiembros(null);
              }}
              className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors mb-2 group cursor-pointer"
            >
              <ChevronLeft size={14} className="mr-1 group-hover:-translate-x-0.5 transition-transform" />
              Volver a Equipos
            </button>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
              <Users className="text-zinc-700 dark:text-zinc-300" size={24} />
              Gestión de Miembros: {currentDetailed.nombre}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs">
              {currentDetailed.descripcion || 'Asigna usuarios registrados a este equipo con su respectivo rol.'}
            </p>
          </div>
        </div>

        {/* Formulario para agregar miembro (solo líder) */}
        {!puedeGestionar ? (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl p-4 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <Lock size={15} className="shrink-0" />
            <span>Solo el líder de este equipo puede agregar o remover miembros. Tienes acceso de lectura.</span>
          </div>
        ) : (
        <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-5 shadow-xs">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3 flex items-center gap-2">
            <UserPlus size={16} className="text-blue-600" />
            Asignar Nuevo Miembro
          </h3>
          <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Usuario Registrado <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={memberForm.id_usuario}
                onChange={(e) => setMemberForm({ ...memberForm, id_usuario: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white"
              >
                <option value="">Seleccionar usuario...</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre || u.correo} ({u.correo})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                Rol en el Equipo
              </label>
              <select
                value={memberForm.id_rol}
                onChange={(e) => setMemberForm({ ...memberForm, id_rol: e.target.value })}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white"
              >
                <option value="">Seleccionar rol...</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.nombre_rol}</option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus size={14} />
              Agregar Miembro
            </button>
          </form>
        </div>
        )}

        {/* Lista de Miembros Actuales */}
        <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Integrantes Actuales ({currentDetailed.miembros?.length || 0})
            </h3>
          </div>

          <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
            {!currentDetailed.miembros || currentDetailed.miembros.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                Este equipo aún no tiene miembros asignados.
              </div>
            ) : (
              currentDetailed.miembros.map(m => (
                <div key={m.usuario.id} className="p-4 flex items-center justify-between hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center justify-center text-xs font-bold uppercase">
                      {(m.usuario.nombre || m.usuario.correo).slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {m.usuario.nombre || 'Usuario'}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {m.usuario.correo}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {m.rol && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40">
                        {m.rol.nombre_rol}
                      </span>
                    )}
                    <button
                      onClick={() => handleRemoveMember(m.usuario.id)}
                      disabled={!puedeGestionar}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      title={puedeGestionar ? "Remover miembro" : "Solo el líder puede remover miembros"}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
            <Users className="text-zinc-700 dark:text-zinc-300" size={24} />
            Equipos de Desarrollo
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Gestión global de equipos multidisciplinarios, integrantes, asignación de roles y proyectos.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          title="Cualquier usuario autenticado puede crear un equipo (queda como líder inicial)"
          className="inline-flex items-center justify-center px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-xs font-medium text-xs gap-1.5 cursor-pointer"
        >
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
          type="text"
          placeholder="Buscar por nombre de equipo o proyecto vinculado..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-8 pr-3 py-2 bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-zinc-900 dark:text-zinc-100"
        />
      </div>

      {/* Grid de Equipos */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-44 bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Users size={22} />
          </div>
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No hay equipos registrados</h3>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">
            {searchTerm ? 'No se encontraron equipos para esta búsqueda.' : 'Crea tu primer equipo para organizar miembros y proyectos.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeams.map((team) => (
            <div
              key={team.equipo_id}
              className="bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-700 dark:text-zinc-300">
                    <Users size={18} />
                  </div>
                  <div className="flex items-center space-x-1">
                    {puedeGestionarEquipo(team.equipo_id) ? (
                      <>
                        <button
                          onClick={() => openModal(team)}
                          title="Editar equipo"
                          className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => {
                            setEquipoToDelete(team);
                            setIsDeleteModalOpen(true);
                          }}
                          title="Eliminar equipo"
                          className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
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

                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  {team.nombre}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                  {team.descripcion || "Sin descripción."}
                </p>

                {/* Proyectos Vinculados */}
                <div className="mt-3 flex flex-wrap gap-1">
                  {team.proyectos && team.proyectos.length > 0 ? (
                    team.proyectos.map(p => (
                      <span key={p.proyecto_id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-medium border border-zinc-200/50 dark:border-zinc-700/50">
                        <FolderGit2 size={10} />
                        {p.nombre}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-zinc-400 italic">Sin proyectos asignados</span>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs">
                <span className="text-zinc-500 text-[11px]">
                  {team.miembros?.length || 0} integrantes
                </span>
                <button
                  onClick={() => openMembersModal(team)}
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                >
                  <span>Gestionar Miembros</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar Equipo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {editingEquipo ? 'Editar Equipo' : 'Nuevo Equipo'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveTeam} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Nombre del Equipo <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Frontend Squad"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Descripción
                </label>
                <textarea
                  rows={2}
                  placeholder="Objetivos o enfoque del equipo..."
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-zinc-900 dark:text-zinc-100 resize-none"
                />
              </div>

              {/* Selector de Proyectos */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Asignar a Proyectos
                </label>
                <div className="max-h-36 overflow-y-auto space-y-1 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2 bg-zinc-50/50 dark:bg-zinc-950 custom-scrollbar">
                  {proyectos.length === 0 ? (
                    <p className="text-[11px] text-zinc-400">No hay proyectos disponibles</p>
                  ) : (
                    proyectos.map(p => {
                      const isChecked = formData.proyectos_seleccionados.includes(p.proyecto_id);
                      return (
                        <label key={p.proyecto_id} className="flex items-center gap-2 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  proyectos_seleccionados: [...formData.proyectos_seleccionados, p.proyecto_id]
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  proyectos_seleccionados: formData.proyectos_seleccionados.filter(id => id !== p.proyecto_id)
                                });
                              }
                            }}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-zinc-800 dark:text-zinc-200">{p.nombre}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {saving ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save size={14} />
                  )}
                  <span>Guardar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminar */}
      {isDeleteModalOpen && equipoToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              ¿Eliminar equipo?
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              ¿Estás seguro de que deseas eliminar el equipo <strong>{equipoToDelete.nombre}</strong>? Esta acción removerá todas sus asignaciones.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteTeam}
                className="px-3.5 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-xl"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
