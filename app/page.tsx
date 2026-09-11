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
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">Panel de Proyectos</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">
            Gestiona los proyectos de software, clasifícalos por tipo de sistema y define sus requerimientos.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-md shadow-blue-500/20 font-medium text-sm"
        >
          <Plus size={18} className="mr-2" />
          Nuevo Proyecto
        </button>
      </div>

      {/* Alerta si falta .env.local */}
      {!isSupabaseConfigured && (
        <div className="p-5 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-200 dark:border-amber-800/80 rounded-2xl flex items-start gap-4">
          <AlertTriangle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={24} />
          <div className="space-y-1 text-sm">
            <h4 className="font-bold text-amber-900 dark:text-amber-200">
              Falta configurar las credenciales de Supabase
            </h4>
            <p className="text-amber-800/90 dark:text-amber-300/90 leading-relaxed text-xs">
              Crea o guarda el archivo <code className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/60 rounded font-mono text-[11px] font-semibold">.env.local</code> en la raíz del proyecto con tus variables <code className="font-mono text-[11px]">NEXT_PUBLIC_SUPABASE_URL</code> y <code className="font-mono text-[11px]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              Una vez creado el archivo, reinicia el servidor de desarrollo (<code className="font-mono font-semibold">npm run dev</code>).
            </p>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search size={18} className="text-zinc-400" />
        </div>
        <input
          type="text"
          placeholder="Buscar por nombre de proyecto o tipo de sistema..."
          className="block w-full pl-10 pr-4 py-3 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Grid Projects */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-56 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-pulse" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <FolderGit2 size={28} />
          </div>
          <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">No hay proyectos encontrados</h3>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
            {searchTerm ? "No coincide ningún proyecto con tu búsqueda." : "Crea tu primer proyecto para empezar a registrar requerimientos técnicos."}
          </p>
          {!searchTerm && (
            <button
              onClick={openCreateModal}
              className="mt-5 inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all"
            >
              <Plus size={16} className="mr-1.5" />
              Crear Proyecto Ahora
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((proj) => (
            <div
              key={proj.proyecto_id}
              className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 hover:shadow-xl hover:shadow-zinc-200/50 dark:hover:shadow-none hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-300 relative flex flex-col justify-between"
            >
              <div>
                {/* Header Card */}
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform duration-300">
                    <FolderGit2 size={24} />
                  </div>
                  
                  <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => openEditModal(proj)}
                      title="Editar Proyecto"
                      className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => deleteProject(proj.proyecto_id, proj.nombre)}
                      title="Eliminar Proyecto"
                      className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Project Title & System Type */}
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2 leading-tight">
                  {proj.nombre}
                </h2>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700/60 text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-4">
                  {getTipoSistemaIcon(proj.tipos_sistema?.nombre)}
                  <span>{proj.tipos_sistema?.nombre || 'Tipo no asignado'}</span>
                </div>
                
                {proj.descripcion && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 line-clamp-2">
                    {proj.descripcion}
                  </p>
                )}
              </div>

              {/* Stats & Actions */}
              <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
                <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <Users size={14} className="text-indigo-500" />
                    <strong>{proj.equipos_count}</strong> equipos
                  </span>
                </div>

                <button
                  onClick={() => router.push(`/requerimientos?proyectoId=${proj.proyecto_id}`)}
                  className="w-full py-2.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-600 hover:text-white text-blue-600 dark:text-blue-400 rounded-xl transition-all duration-200 flex items-center justify-center text-sm font-medium group/btn shadow-sm"
                >
                  Gestionar Requerimientos
                  <ChevronRight size={16} className="ml-1.5 group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar Proyecto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                {editingProject ? 'Editar Proyecto' : 'Nuevo Proyecto'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
                  Nombre del Proyecto
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Sistema de Telemetría Satelital"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
                  Descripción
                </label>
                <textarea
                  placeholder="Breve descripción del proyecto..."
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none h-24"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
                  Tipo de Sistema
                </label>
                <select
                  value={formData.id_tipo_sistema}
                  onChange={(e) => setFormData({ ...formData, id_tipo_sistema: e.target.value })}
                  className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">Selecciona un tipo de sistema...</option>
                  {tiposSistema.map((ts) => (
                    <option key={ts.id} value={ts.id}>
                      {ts.nombre}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5">
                  Ayuda a clasificar la naturaleza del software para los patrones de redacción.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all shadow-md shadow-blue-500/20"
                >
                  <Save size={16} className="mr-1.5" />
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

