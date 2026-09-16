'use client';

import React, { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { 
  Plus, Edit2, Trash2, FolderGit2, ChevronRight, Search, 
  Layers, Users, X, Save, CheckCircle2, Cpu, Smartphone, Globe, Laptop, Server
} from 'lucide-react';
import type { Proyecto, TipoSistema } from '@/lib/database.types';
import { 
  getProyectos, 
  getTiposSistema, 
  createProyecto, 
  updateProyecto, 
  deleteProyecto,
  getRequerimientos,
  getProyectoEquipos
} from '@/lib/firestore-service';

interface ProyectoConStats extends Proyecto {
  tipos_sistema?: TipoSistema | null;
  requerimientos_count?: number;
  equipos_count?: number;
}

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<Array<ProyectoConStats>>([]);
  const [tiposSistema, setTiposSistema] = useState<Array<TipoSistema>>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Proyecto | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    id_tipo_sistema: ''
  });
  const [saving, setSaving] = useState(false);

  // Cargar Tipos de Sistema
  const fetchTiposSistema = useCallback(async () => {
    const data = await getTiposSistema();
    setTiposSistema(data);
  }, []);

  // Cargar Proyectos con su tipo y contadores
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const [projectsData, reqs, pes] = await Promise.all([
        getProyectos(),
        getRequerimientos(),
        getProyectoEquipos()
      ]);

      const reqCountMap: Record<string, number> = {};
      (reqs || []).forEach((r: any) => {
        if (r.id_proyecto) {
          reqCountMap[r.id_proyecto] = (reqCountMap[r.id_proyecto] || 0) + 1;
        }
      });

      const peCountMap: Record<string, number> = {};
      (pes || []).forEach((pe: any) => {
        if (pe.id_proyecto) {
          peCountMap[pe.id_proyecto] = (peCountMap[pe.id_proyecto] || 0) + 1;
        }
      });

      const formatted: ProyectoConStats[] = projectsData.map((p) => ({
        ...p,
        requerimientos_count: reqCountMap[p.proyecto_id] || 0,
        equipos_count: peCountMap[p.proyecto_id] || 0
      }));

      setProjects(formatted);
    } catch (err: any) {
      console.error('Excepción al consultar proyectos en Firestore:', err);
      toast.error('Error al cargar proyectos de Firestore');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTiposSistema();
    fetchProjects();
  }, [fetchTiposSistema, fetchProjects]);

  const openCreateModal = () => {
    setEditingProject(null);
    setFormData({
      nombre: '',
      descripcion: '',
      id_tipo_sistema: tiposSistema[0]?.id || ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (p: Proyecto) => {
    setEditingProject(p);
    setFormData({
      nombre: p.nombre,
      descripcion: p.descripcion || '',
      id_tipo_sistema: p.id_tipo_sistema || ''
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      toast.error('El nombre del proyecto es obligatorio');
      return;
    }

    setSaving(true);
    try {
      if (editingProject) {
        // Actualizar
        await updateProyecto(editingProject.proyecto_id, {
          nombre: formData.nombre.trim(),
          descripcion: formData.descripcion.trim(),
          id_tipo_sistema: formData.id_tipo_sistema || null
        });
        toast.success('Proyecto actualizado correctamente');
      } else {
        // Crear
        await createProyecto({
          nombre: formData.nombre.trim(),
          descripcion: formData.descripcion.trim(),
          id_tipo_sistema: formData.id_tipo_sistema || null
        });
        toast.success('Proyecto creado correctamente');
      }

      setIsModalOpen(false);
      fetchProjects();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Error al guardar el proyecto');
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async (id: string, nombre: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar el proyecto "${nombre}"? Esta acción eliminará también sus requerimientos asociados.`)) {
      return;
    }

    try {
      await deleteProyecto(id);
      toast.success('Proyecto eliminado');
      fetchProjects();
    } catch (error: any) {
      toast.error('Error al eliminar el proyecto');
    }
  };

  const getTipoSistemaIcon = (nombre?: string) => {
    const n = (nombre || '').toLowerCase();
    if (n.includes('móvil') || n.includes('movil')) return <Smartphone size={16} className="text-purple-500" />;
    if (n.includes('embebido') || n.includes('iot')) return <Cpu size={16} className="text-amber-500" />;
    if (n.includes('escritorio')) return <Laptop size={16} className="text-emerald-500" />;
    if (n.includes('api') || n.includes('microservicio')) return <Server size={16} className="text-rose-500" />;
    return <Globe size={16} className="text-blue-500" />;
  };

  const filteredProjects = projects.filter(p => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.tipos_sistema?.nombre && p.tipos_sistema.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">Proyectos</h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Gestión centralizada de sistemas de software y especificación de requerimientos técnicos.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center justify-center px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-xs font-medium text-xs gap-1.5 cursor-pointer"
        >
          <Plus size={15} />
          Nuevo Proyecto
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
          <Search size={15} />
        </div>
        <input
          type="text"
          placeholder="Buscar proyecto por nombre o tipo de sistema..."
          className="block w-full pl-9 pr-4 py-2.5 border border-zinc-200/80 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900/60 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Grid Projects */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-2xl bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 animate-pulse" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl flex items-center justify-center mx-auto mb-3">
            <FolderGit2 size={22} />
          </div>
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No hay proyectos encontrados</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
            {searchTerm ? "No coincide ningún proyecto con tu búsqueda." : "Crea tu primer proyecto para empezar a registrar requerimientos técnicos."}
          </p>
          {!searchTerm && (
            <button
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition-all shadow-xs gap-1.5 cursor-pointer"
            >
              <Plus size={15} />
              Crear Proyecto
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((proj) => (
            <div
              key={proj.proyecto_id}
              className="group bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 relative flex flex-col justify-between"
            >
              <div>
                {/* Header Card */}
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl flex items-center justify-center text-zinc-700 dark:text-zinc-300 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-200">
                    <FolderGit2 size={18} />
                  </div>
                  
                  <div className="flex items-center space-x-1">
                    <button 
                      onClick={() => openEditModal(proj)}
                      title="Editar Proyecto"
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button 
                      onClick={() => deleteProject(proj.proyecto_id, proj.nombre)}
                      title="Eliminar Proyecto"
                      className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Badge Tipo Sistema */}
                {proj.tipos_sistema && (
                  <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 text-[10px] font-medium mb-2.5 border border-zinc-200/50 dark:border-zinc-700/50">
                    {getTipoSistemaIcon(proj.tipos_sistema.nombre)}
                    <span>{proj.tipos_sistema.nombre}</span>
                  </div>
                )}

                {/* Info */}
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {proj.nombre}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                  {proj.descripcion || "Sin descripción proporcionada."}
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                {/* Stats */}
                <div className="flex items-center space-x-3 text-[11px] text-zinc-500">
                  <span className="flex items-center gap-1 font-mono">
                    <Layers size={13} className="text-zinc-400" />
                    {proj.requerimientos_count} reqs
                  </span>
                  <span className="flex items-center gap-1 font-mono">
                    <Users size={13} className="text-zinc-400" />
                    {proj.equipos_count} eq
                  </span>
                </div>

                {/* Actions Button */}
                <button
                  onClick={() => router.push(`/requerimientos?id=${proj.proyecto_id}`)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer"
                >
                  <span>Requerimientos</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar Proyecto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {editingProject ? 'Editar Proyecto' : 'Crear Nuevo Proyecto'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Nombre del Proyecto <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Sistema de Pagos Móvil"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Tipo de Sistema
                </label>
                <select
                  value={formData.id_tipo_sistema}
                  onChange={(e) => setFormData({ ...formData, id_tipo_sistema: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-zinc-900 dark:text-zinc-100"
                >
                  <option value="">Selecciona un tipo de sistema</option>
                  {tiposSistema.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Descripción
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe brevemente el alcance u objetivos del proyecto..."
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-950 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-zinc-900 dark:text-zinc-100 resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 transition-all"
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
    </div>
  );
}
