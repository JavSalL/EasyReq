'use client';

import React, { useEffect, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from '@/lib/supabase-client';
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { 
  Plus, Edit2, Trash2, FolderGit2, ChevronRight, Search, 
  Layers, Users, X, Save, CheckCircle2, Cpu, Smartphone, Globe, Laptop, Server,
  AlertTriangle
} from 'lucide-react';
import type { Proyecto, TipoSistema } from '@/lib/database.types';

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
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase
      .from('tipos_sistema')
      .select('*')
      .order('nombre');
    if (!error && data) {
      setTiposSistema(data);
    }
  }, []);

  // Cargar Proyectos con su tipo y contadores
  const fetchProjects = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Consulta segura sin columnas aggregate inexistentes
      const { data: projectsData, error } = await supabase
        .from('proyecto')
        .select(`
          *,
          tipos_sistema (
            id,
            nombre
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error al obtener proyectos:', error.message || error);
        toast.error(`Error al obtener proyectos: ${error.message || ''}`);
        setProjects([]);
      } else {
        // 2. Obtener contadores en paralelo
        const [{ data: reqs }, { data: pes }] = await Promise.all([
          supabase.from('requerimiento').select('id_proyecto'),
          supabase.from('proyecto_equipos').select('id_proyecto')
        ]);

        const reqCountMap: Record<string, number> = {};
        (reqs || []).forEach((r: any) => {
          reqCountMap[r.id_proyecto] = (reqCountMap[r.id_proyecto] || 0) + 1;
        });

        const peCountMap: Record<string, number> = {};
        (pes || []).forEach((pe: any) => {
          peCountMap[pe.id_proyecto] = (peCountMap[pe.id_proyecto] || 0) + 1;
        });

        const formatted: ProyectoConStats[] = (projectsData || []).map((p: any) => ({
          ...p,
          requerimientos_count: reqCountMap[p.proyecto_id] || 0,
          equipos_count: peCountMap[p.proyecto_id] || 0
        }));
        setProjects(formatted);
      }
    } catch (err: any) {
      console.error('Excepción al consultar proyectos:', err);
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
        const { error } = await supabase
          .from('proyecto')
          .update({
            nombre: formData.nombre.trim(),
            descripcion: formData.descripcion.trim(),
            id_tipo_sistema: formData.id_tipo_sistema || null
          })
          .eq('proyecto_id', editingProject.proyecto_id);

        if (error) throw error;
        toast.success('Proyecto actualizado correctamente');
      } else {
        // Crear
        const { error } = await supabase
          .from('proyecto')
          .insert([{
            nombre: formData.nombre.trim(),
            descripcion: formData.descripcion.trim(),
            id_tipo_sistema: formData.id_tipo_sistema || null
          }]);

        if (error) throw error;
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

    const { error } = await supabase
      .from('proyecto')
      .delete()
      .eq('proyecto_id', id);

    if (error) {
      toast.error('Error al eliminar el proyecto');
    } else {
      toast.success('Proyecto eliminado');
      fetchProjects();
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
          className="inline-flex items-center justify-center px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 rounded-xl transition-all shadow-xs font-medium text-xs gap-1.5 cursor-pointer"
        >
          <Plus size={15} />
          Nuevo Proyecto
        </button>
      </div>

      {/* Alerta si falta .env.local */}
      {!isSupabaseConfigured && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3 text-xs">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
          <div className="space-y-1">
            <h4 className="font-semibold text-amber-900 dark:text-amber-200">
              Falta configurar las credenciales de Supabase
            </h4>
            <p className="text-amber-800/80 dark:text-amber-300/80 leading-relaxed text-[11px]">
              Crea o guarda el archivo <code className="px-1 py-0.5 bg-amber-500/20 rounded font-mono text-[10px]">.env.local</code> en la raíz del proyecto con <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> y <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
            </p>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
          <Search size={15} />
        </div>
        <input
          type="text"
          placeholder="Buscar proyecto por nombre o tipo de sistema..."
          className="block w-full pl-9 pr-4 py-2.5 border border-zinc-200/80 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900/60 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10 focus:border-zinc-400 dark:focus:border-zinc-600 transition-all text-xs"
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
              className="mt-4 inline-flex items-center px-3.5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white rounded-xl text-xs font-medium transition-all shadow-xs gap-1.5"
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
                  <div className="w-9 h-9 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl flex items-center justify-center text-zinc-700 dark:text-zinc-300 group-hover:bg-zinc-900 group-hover:text-white dark:group-hover:bg-zinc-100 dark:group-hover:text-zinc-900 transition-colors duration-200">
                    <FolderGit2 size={18} />
                  </div>
                  
                  <div className="flex items-center space-x-1">
                    <button 
                      onClick={() => openEditModal(proj)}
                      title="Editar Proyecto"
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      onClick={() => deleteProject(proj.proyecto_id, proj.nombre)}
                      title="Eliminar Proyecto"
                      className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Project Title & System Type */}
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-2 leading-snug">
                  {proj.nombre}
                </h2>

                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/50 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                  {getTipoSistemaIcon(proj.tipos_sistema?.nombre)}
                  <span>{proj.tipos_sistema?.nombre || 'General'}</span>
                </div>
                
                {proj.descripcion && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 line-clamp-2 leading-relaxed">
                    {proj.descripcion}
                  </p>
                )}
              </div>

              {/* Stats & Actions */}
              <div className="space-y-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/60">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Users size={13} className="text-zinc-400" />
                    <strong className="text-zinc-700 dark:text-zinc-300">{proj.equipos_count}</strong> equipos
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Layers size={13} className="text-zinc-400" />
                    <strong className="text-zinc-700 dark:text-zinc-300">{proj.requerimientos_count}</strong> req.
                  </span>
                </div>

                <button
                  onClick={() => router.push(`/requerimientos?proyectoId=${proj.proyecto_id}`)}
                  className="w-full py-2 px-3 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-900 hover:text-white dark:hover:bg-zinc-100 dark:hover:text-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700/60 rounded-xl transition-all duration-150 flex items-center justify-center text-xs font-semibold group/btn cursor-pointer"
                >
                  Gestionar Requerimientos
                  <ChevronRight size={14} className="ml-1 group-hover/btn:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar Proyecto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl max-w-md w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between shrink-0 bg-white dark:bg-zinc-900">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {editingProject ? 'Editar Proyecto' : 'Nuevo Proyecto'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="p-5 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Nombre del Proyecto
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Sistema de Telemetría Satelital"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10 focus:border-zinc-400 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Descripción
                  </label>
                  <textarea
                    placeholder="Breve descripción del proyecto..."
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10 focus:border-zinc-400 text-xs resize-none h-20"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
                    Tipo de Sistema
                  </label>
                  <select
                    value={formData.id_tipo_sistema}
                    onChange={(e) => setFormData({ ...formData, id_tipo_sistema: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10 focus:border-zinc-400 text-xs"
                  >
                    <option value="">Selecciona un tipo de sistema...</option>
                    {tiposSistema.map((ts) => (
                      <option key={ts.id} value={ts.id}>
                        {ts.nombre}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Clasificación para aplicar patrones de redacción IEEE 830 / ISO 29148.
                  </p>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/80 shrink-0 flex items-center justify-end gap-2 bg-zinc-50/50 dark:bg-zinc-900/50">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 disabled:opacity-50 rounded-lg text-xs font-semibold transition-all shadow-xs gap-1 cursor-pointer"
                >
                  <Save size={14} />
                  {saving ? 'Guardando...' : editingProject ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

