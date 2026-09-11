'use client';

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from '@/lib/supabase-client';
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { 
  Users, Plus, Search, ChevronRight, ChevronLeft, FolderGit2, 
  X, Save, Edit2, Trash2, Crown, UserPlus, Shield, Check
} from 'lucide-react';
import type { Equipo, Proyecto, PerfilUsuario, Rol } from '@/lib/database.types';

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
  const [equipos, setEquipos] = useState<Array<EquipoDetallado>>([]);
  const [proyectos, setProyectos] = useState<Array<Proyecto>>([]);
  const [usuarios, setUsuarios] = useState<Array<PerfilUsuario>>([]);
  const [roles, setRoles] = useState<Array<Rol>>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

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
      // 1. Cargar proyectos, usuarios y roles para selectores
      const [
        { data: projData },
        { data: usersData },
        { data: rolesData },
        { data: equiposData }
      ] = await Promise.all([
        supabase.from('proyecto').select('*').order('nombre'),
        supabase.from('perfil_usuario').select('id, nombre, correo').order('nombre'),
        supabase.from('roles').select('id, nombre_rol').order('nombre_rol'),
        supabase.from('equipo').select('*').order('created_at', { ascending: false })
      ]);

      setProyectos(projData || []);
      setUsuarios(usersData || []);
      setRoles(rolesData || []);

      if (equiposData && equiposData.length > 0) {
        const equipoIds = equiposData.map(e => e.equipo_id);

        // Consultar proyectos asignados a estos equipos
        const { data: peData } = await supabase
          .from('proyecto_equipos')
          .select('id_equipo, proyecto:proyecto(proyecto_id, nombre)')
          .in('id_equipo', equipoIds);

        // Consultar miembros de estos equipos
        const { data: meData } = await supabase
          .from('miembros_equipo')
          .select(`
            id_equipo,
            usuario:perfil_usuario(id, nombre, correo),
            rol:roles(id, nombre_rol)
          `)
          .in('id_equipo', equipoIds);

        // Consultar líderes actuales
        const { data: lideresData } = await supabase
          .from('historial_lideres')
          .select('id_equipo, usuario:perfil_usuario(id, nombre, correo)')
          .eq('es_actual', true)
          .in('id_equipo', equipoIds);

        const formated: EquipoDetallado[] = equiposData.map(eq => {
          const projs = (peData || [])
            .filter((pe: any) => pe.id_equipo === eq.equipo_id && pe.proyecto)
            .map((pe: any) => pe.proyecto);

          const members = (meData || [])
            .filter((me: any) => me.id_equipo === eq.equipo_id && me.usuario)
            .map((me: any) => ({
              usuario: me.usuario,
              rol: me.rol
            }));

          const lider = (lideresData || []).find((l: any) => l.id_equipo === eq.equipo_id)?.usuario;

          return {
            ...eq,
            proyectos: projs,
            miembros: members,
            lider_actual: lider || null
          };
        });

        setEquipos(formated);
      } else {
        setEquipos([]);
      }
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
        // Actualizar datos del equipo
        const { error } = await supabase
          .from('equipo')
          .update({ 
            nombre: formData.nombre.trim(), 
            descripcion: formData.descripcion.trim() || null
          })
          .eq('equipo_id', editingEquipo.equipo_id);

        if (error) throw error;
      } else {
        // Crear nuevo equipo
        const { data: newTeam, error } = await supabase
          .from('equipo')
          .insert([{ 
            nombre: formData.nombre.trim(), 
            descripcion: formData.descripcion.trim() || null
          }])
          .select()
          .single();

        if (error) throw error;
        teamId = newTeam.equipo_id;
      }

      // Sincronizar asignaciones de proyectos (proyecto_equipos)
      if (teamId) {
        // Eliminar anteriores
        await supabase.from('proyecto_equipos').delete().eq('id_equipo', teamId);

        // Insertar seleccionados
        if (formData.proyectos_seleccionados.length > 0) {
          const rows = formData.proyectos_seleccionados.map(projId => ({
            id_equipo: teamId,
            id_proyecto: projId
          }));
          await supabase.from('proyecto_equipos').insert(rows);
        }
      }

      toast.success(editingEquipo ? "Equipo actualizado" : "Equipo creado con éxito");
      setIsModalOpen(false);
      fetchData();
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
    try {
      const { error } = await supabase
        .from('equipo')
        .delete()
        .eq('equipo_id', equipoToDelete.equipo_id);

      if (error) throw error;
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
      id_usuario: usuarios[0]?.id || '',
      id_rol: roles[0]?.id || ''
    });
    setIsMemberModalOpen(true);
  };

  // Agregar Miembro al Equipo
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipoParaMiembros || !memberForm.id_usuario) return;

    try {
      const { error } = await supabase
        .from('miembros_equipo')
        .upsert([{
          id_equipo: equipoParaMiembros.equipo_id,
          id_usuario: memberForm.id_usuario,
          id_rol: memberForm.id_rol || null
        }]);

      if (error) throw error;
      toast.success("Miembro agregado al equipo");
      fetchData();
    } catch (e: any) {
      toast.error("Error al agregar miembro");
    }
  };

  // Remover Miembro del Equipo
  const handleRemoveMember = async (userId: string) => {
    if (!equipoParaMiembros) return;
    try {
      const { error } = await supabase
        .from('miembros_equipo')
        .delete()
        .eq('id_equipo', equipoParaMiembros.equipo_id)
        .eq('id_usuario', userId);

      if (error) throw error;
      toast.success("Miembro removido");
      fetchData();
    } catch (e: any) {
      toast.error("Error al remover miembro");
    }
  };

  const filteredTeams = equipos.filter(t => 
    t.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.proyectos || []).some(p => p.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isMemberModalOpen && equipoParaMiembros) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <div>
            <button 
              onClick={() => {
                setIsMemberModalOpen(false);
                setEquipoParaMiembros(null);
              }}
              className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-2 group"
            >
              <ChevronLeft size={16} className="mr-1 group-hover:-translate-x-0.5 transition-transform" />
              Volver a Equipos
            </button>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
              <Users className="text-blue-600" size={32} />
              Gestión de Miembros: {equipoParaMiembros.nombre}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">
              {equipoParaMiembros.descripcion || 'Asigna usuarios registrados a este equipo con su respectivo rol.'}
            </p>
          </div>
        </div>

        {/* Formulario para agregar miembro */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-4">Agregar Nuevo Miembro</h3>
          <form onSubmit={handleAddMember} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">Usuario</label>
              <select
                value={memberForm.id_usuario}
                onChange={(e) => setMemberForm({ ...memberForm, id_usuario: e.target.value })}
                className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecciona un usuario...</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nombre} ({u.correo})</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">Rol</label>
              <select
                value={memberForm.id_rol}
                onChange={(e) => setMemberForm({ ...memberForm, id_rol: e.target.value })}
                className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Seleccionar rol...</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>{r.nombre_rol}</option>
                ))}
              </select>
            </div>
            
            <div className="md:col-span-1">
              <button
                type="submit"
                className="w-full h-[42px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus size={16} />
                Agregar
              </button>
            </div>
          </form>
        </div>

        {/* Lista actual de miembros */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-4">Miembros Actuales ({equipoParaMiembros.miembros?.length || 0})</h3>
          
          {(equipoParaMiembros.miembros || []).length === 0 ? (
            <div className="text-center py-10 bg-zinc-50 dark:bg-zinc-800/20 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700">
              <p className="text-zinc-500 dark:text-zinc-400">Este equipo aún no tiene miembros asignados.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {equipoParaMiembros.miembros!.map(m => (
                <div key={m.usuario.id} className="flex items-start justify-between p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200 dark:border-zinc-700/60">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center font-bold">
                      {m.usuario.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100 block text-sm">{m.usuario.nombre}</span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">{m.usuario.correo}</span>
                      <div className="mt-1.5 inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-medium rounded-md text-[10px]">
                        {m.rol?.nombre_rol || 'Sin Rol'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveMember(m.usuario.id)}
                    title="Remover miembro"
                    className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
            <Users className="text-blue-600" size={32} />
            Directorio de Equipos
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">
            Gestiona los equipos de trabajo, asigna proyectos y organiza a los integrantes con sus roles.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="inline-flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-md shadow-blue-500/20 font-medium text-sm"
        >
          <Plus size={18} className="mr-2" />
          Nuevo Equipo
        </button>
      </div>

      {/* Buscador */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search size={18} className="text-zinc-400" />
        </div>
        <input
          type="text"
          placeholder="Buscar equipo o proyecto asignado..."
          className="block w-full pl-10 pr-4 py-3 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Grid de Equipos */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="h-56 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 animate-pulse" />)}
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <Users size={36} className="mx-auto text-zinc-400 mb-3" />
          <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">No se encontraron equipos</h3>
          <p className="text-zinc-500 text-sm mt-1">Crea tu primer equipo de desarrollo o ingeniería.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTeams.map((team) => (
            <div
              key={team.equipo_id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 hover:shadow-xl hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                {/* Header card */}
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Users size={24} />
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => openModal(team)}
                      title="Editar Equipo"
                      className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-600 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => { setEquipoToDelete(team); setIsDeleteModalOpen(true); }}
                      title="Eliminar Equipo"
                      className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-rose-600 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Título y Descripción */}
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-1.5">{team.nombre}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 line-clamp-2">
                  {team.descripcion || "Sin descripción proporcionada."}
                </p>

                {/* Proyectos asignados */}
                <div className="mb-4">
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">
                    Proyectos Asignados ({team.proyectos?.length || 0})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(team.proyectos || []).length === 0 ? (
                      <span className="text-xs text-zinc-400 italic">Ningún proyecto asignado</span>
                    ) : (
                      team.proyectos!.map(p => (
                        <span key={p.proyecto_id} className="inline-flex items-center gap-1 text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded-md">
                          <FolderGit2 size={12} className="text-blue-500" />
                          {p.nombre}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Líder actual si existe */}
                {team.lider_actual && (
                  <div className="mb-4 flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                    <Crown size={14} className="text-amber-500 shrink-0" />
                    <span>Líder: <strong>{team.lider_actual.nombre}</strong></span>
                  </div>
                )}
              </div>

              {/* Botón Gestionar Miembros */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  onClick={() => openMembersModal(team)}
                  className="w-full py-2.5 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-blue-600 hover:text-white text-zinc-700 dark:text-zinc-300 rounded-xl transition-all duration-200 flex items-center justify-center text-xs font-semibold gap-1.5"
                >
                  <UserPlus size={15} />
                  Miembros ({team.miembros?.length || 0})
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar Equipo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                {editingEquipo ? 'Editar Equipo' : 'Nuevo Equipo'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Nombre del Equipo
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Equipo Backend Core"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Descripción
                </label>
                <textarea
                  rows={2}
                  placeholder="Responsabilidades del equipo..."
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Asignar a Proyectos
                </label>
                <div className="max-h-40 overflow-y-auto space-y-1.5 border border-zinc-200 dark:border-zinc-700/60 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/30">
                  {proyectos.map((p) => {
                    const isChecked = formData.proyectos_seleccionados.includes(p.proyecto_id);
                    return (
                      <label key={p.proyecto_id} className="flex items-center gap-2 p-1 text-xs cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700/40 rounded-lg">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setFormData({
                                ...formData,
                                proyectos_seleccionados: formData.proyectos_seleccionados.filter(id => id !== p.proyecto_id)
                              });
                            } else {
                              setFormData({
                                ...formData,
                                proyectos_seleccionados: [...formData.proyectos_seleccionados, p.proyecto_id]
                              });
                            }
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-zinc-800 dark:text-zinc-200 font-medium">{p.nombre}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium transition-all shadow-md shadow-blue-500/20"
                >
                  <Save size={15} className="mr-1.5" />
                  {saving ? 'Guardando...' : editingEquipo ? 'Actualizar' : 'Crear Equipo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* El modal de miembros fue reemplazado por la vista principal condicional arriba */}

      {/* Modal Confirmar Eliminar */}
      {isDeleteModalOpen && equipoToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">¿Eliminar Equipo?</h3>
            <p className="text-xs text-zinc-500">
              ¿Estás seguro de que deseas eliminar el equipo <strong>{equipoToDelete.nombre}</strong>?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteTeam}
                className="px-3.5 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all"
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
