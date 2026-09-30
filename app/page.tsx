'use client';

import React, { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import {
  Plus, Edit2, Trash2, FolderGit2, ChevronRight, Search,
  Layers, Users, Save, Cpu, Smartphone, Globe, Laptop, Server, Lock
} from 'lucide-react';
import type { Proyecto, TipoSistema } from '@/lib/database.types';
import {
  getProyectos,
  getTiposSistema,
  createProyecto,
  updateProyecto,
  deleteProyecto,
  getRequerimientos,
  getProyectoEquipos,
  getProyectosRelacionados
} from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';
import { mensajeError } from '@/lib/errores';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  btnPrimario, btnSecundario, btnIcono, btnIconoPeligro, buscador, campo, etiqueta, tarjeta
} from '@/components/ui/estilos';

interface ProyectoConStats extends Proyecto {
  requerimientos_count?: number;
  equipos_count?: number;
}

const plural = (n: number, singular: string, pluralTxt: string) => `${n} ${n === 1 ? singular : pluralTxt}`;

export default function Home() {
  const router = useRouter();
  const confirmar = useConfirm();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [projects, setProjects] = useState<Array<ProyectoConStats>>([]);
  const [tiposSistema, setTiposSistema] = useState<Array<TipoSistema>>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [soloMios, setSoloMios] = useState(false);

  // Control de acceso: todo proyecto es visible para autenticados;
  // cualquier autenticado puede crear; editar/eliminar solo relacionados
  // (creador con `id_creador==uid` o miembro de equipo vinculado).
  const [proyectosPermitidos, setProyectosPermitidos] = useState<Array<string>>([]);
  const [loadingPermisos, setLoadingPermisos] = useState(true);

  const cargarPermisos = useCallback(async () => {
    try {
      const ids = uid ? await getProyectosRelacionados(uid) : [];
      setProyectosPermitidos(ids);
    } catch (err) {
      console.error('Error al cargar permisos de proyectos:', err);
      setProyectosPermitidos([]);
    } finally {
      setLoadingPermisos(false);
    }
  }, [uid]);

  useEffect(() => {
    cargarPermisos();
  }, [cargarPermisos]);

  const puedeEditarProyecto = (proyectoId: string) =>
    proyectosPermitidos.includes(proyectoId);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Proyecto | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    id_tipo_sistema: ''
  });
  const [saving, setSaving] = useState(false);

  // Cargar Proyectos con su tipo y contadores
  const fetchProjects = useCallback(async () => {
    try {
      const [projectsData, reqs, pes, tipos] = await Promise.all([
        getProyectos(),
        getRequerimientos(),
        getProyectoEquipos(),
        getTiposSistema()
      ]);
      setTiposSistema(tipos);

      const reqCountMap: Record<string, number> = {};
      reqs.forEach((r) => {
        if (r.id_proyecto) {
          reqCountMap[r.id_proyecto] = (reqCountMap[r.id_proyecto] || 0) + 1;
        }
      });

      const peCountMap: Record<string, number> = {};
      pes.forEach((pe) => {
        if (pe.id_proyecto) {
          peCountMap[pe.id_proyecto] = (peCountMap[pe.id_proyecto] || 0) + 1;
        }
      });

      const formatted: ProyectoConStats[] = projectsData
        .map((p) => ({
          ...p,
          requerimientos_count: reqCountMap[p.proyecto_id] || 0,
          equipos_count: peCountMap[p.proyecto_id] || 0
        }))
        // Más recientes primero
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

      setProjects(formatted);
    } catch (err) {
      console.error('Excepción al consultar proyectos en Firestore:', err);
      toast.error(mensajeError(err, 'No se pudieron cargar los proyectos'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

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
    if (!puedeEditarProyecto(p.proyecto_id)) {
      toast.error('Solo el creador o miembros de un equipo vinculado pueden editar este proyecto');
      return;
    }
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
    if (!uid) {
      toast.error('Debes iniciar sesión para guardar proyectos');
      return;
    }

    setSaving(true);
    try {
      if (editingProject) {
        // Actualizar (defensa en cliente: solo relacionados al proyecto)
        if (!puedeEditarProyecto(editingProject.proyecto_id)) {
          toast.error('No tienes permiso para editar este proyecto');
          return;
        }
        await updateProyecto(editingProject.proyecto_id, {
          nombre: formData.nombre.trim(),
          descripcion: formData.descripcion.trim(),
          id_tipo_sistema: formData.id_tipo_sistema || null
        });
        toast.success('Proyecto actualizado');
      } else {
        // Se registra `id_creador=uid` para que el creador pueda editar/eliminar.
        await createProyecto({
          nombre: formData.nombre.trim(),
          descripcion: formData.descripcion.trim(),
          id_tipo_sistema: formData.id_tipo_sistema || null,
          id_creador: uid
        });
        toast.success('Proyecto creado');
      }

      setIsModalOpen(false);
      await Promise.all([fetchProjects(), cargarPermisos()]);
    } catch (error) {
      console.error(error);
      toast.error(mensajeError(error, 'No se pudo guardar el proyecto'));
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async (proj: ProyectoConStats) => {
    if (!puedeEditarProyecto(proj.proyecto_id)) {
      toast.error('Solo el creador o miembros de un equipo vinculado pueden eliminar este proyecto');
      return;
    }
    const reqs = proj.requerimientos_count || 0;
    const ok = await confirmar({
      titulo: '¿Eliminar proyecto?',
      mensaje: (
        <>
          Se eliminará <strong className="text-zinc-900 dark:text-zinc-100">{proj.nombre}</strong>
          {reqs > 0 ? <> junto con sus {plural(reqs, 'requerimiento', 'requerimientos')}</> : null}.
          Esta acción no se puede deshacer.
        </>
      ),
      textoConfirmar: 'Eliminar',
      peligro: true
    });
    if (!ok) return;

    try {
      await deleteProyecto(proj.proyecto_id);
      toast.success('Proyecto eliminado');
      fetchProjects();
    } catch (error) {
      toast.error(mensajeError(error, 'No se pudo eliminar el proyecto'));
    }
  };

  const abrirProyecto = (id: string) => router.push(`/requerimientos/?id=${id}`);

  const getTipoSistemaIcon = (nombre?: string) => {
    const n = (nombre || '').toLowerCase();
    if (n.includes('móvil') || n.includes('movil')) return <Smartphone size={14} className="text-purple-500" />;
    if (n.includes('embebido') || n.includes('iot')) return <Cpu size={14} className="text-amber-500" />;
    if (n.includes('escritorio')) return <Laptop size={14} className="text-emerald-500" />;
    if (n.includes('api') || n.includes('microservicio')) return <Server size={14} className="text-rose-500" />;
    return <Globe size={14} className="text-blue-500" />;
  };

  const termino = searchTerm.trim().toLowerCase();
  const filteredProjects = projects.filter(p => {
    if (soloMios && !puedeEditarProyecto(p.proyecto_id)) return false;
    if (!termino) return true;
    return p.nombre.toLowerCase().includes(termino) ||
      (p.descripcion || '').toLowerCase().includes(termino) ||
      (p.tipos_sistema?.nombre || '').toLowerCase().includes(termino);
  });
  const hayFiltros = termino !== '' || soloMios;

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
            <FolderGit2 className="text-zinc-700 dark:text-zinc-300" size={24} />
            Proyectos
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Sistemas de software y la especificación de sus requerimientos.
          </p>
        </div>
        <button onClick={openCreateModal} className={btnPrimario}>
          <Plus size={15} />
          Nuevo Proyecto
        </button>
      </div>

      {/* Búsqueda y filtro */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
            <Search size={14} />
          </div>
          <input
            type="search"
            placeholder="Buscar por nombre, descripción o tipo de sistema..."
            aria-label="Buscar proyectos"
            className={buscador}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div role="group" aria-label="Filtrar proyectos" className="inline-flex p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl self-start">
          {[
            { valor: false, texto: 'Todos' },
            { valor: true, texto: 'Mis proyectos' }
          ].map(op => (
            <button
              key={op.texto}
              type="button"
              onClick={() => setSoloMios(op.valor)}
              aria-pressed={soloMios === op.valor}
              disabled={op.valor && loadingPermisos}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                soloMios === op.valor
                  ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              {op.texto}
            </button>
          ))}
        </div>
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
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {hayFiltros ? 'Sin resultados' : 'Todavía no hay proyectos'}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
            {termino
              ? 'Ningún proyecto coincide con tu búsqueda.'
              : soloMios
                ? 'Aún no participas en ningún proyecto. Crea uno o pide que vinculen a tu equipo.'
                : 'Crea tu primer proyecto para empezar a registrar requerimientos.'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {hayFiltros && (
              <button onClick={() => { setSearchTerm(''); setSoloMios(false); }} className={btnSecundario}>
                Quitar filtros
              </button>
            )}
            {!termino && (
              <button onClick={openCreateModal} className={btnPrimario}>
                <Plus size={15} />
                Crear Proyecto
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((proj) => {
            const editable = puedeEditarProyecto(proj.proyecto_id);
            const reqs = proj.requerimientos_count || 0;
            const eqs = proj.equipos_count || 0;
            return (
              <div
                key={proj.proyecto_id}
                role="link"
                tabIndex={0}
                onClick={() => abrirProyecto(proj.proyecto_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.target === e.currentTarget) abrirProyecto(proj.proyecto_id);
                }}
                aria-label={`Abrir requerimientos de ${proj.nombre}`}
                className={`group ${tarjeta} p-5 hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-sm transition-all duration-200 flex flex-col justify-between cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40`}
              >
                <div>
                  {/* Header Card */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-9 h-9 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl flex items-center justify-center text-zinc-700 dark:text-zinc-300 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-200">
                      <FolderGit2 size={18} />
                    </div>

                    <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                      {editable ? (
                        <>
                          <button
                            onClick={() => openEditModal(proj)}
                            title="Editar proyecto"
                            aria-label={`Editar ${proj.nombre}`}
                            className={btnIcono}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => deleteProject(proj)}
                            title="Eliminar proyecto"
                            aria-label={`Eliminar ${proj.nombre}`}
                            className={btnIconoPeligro}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      ) : !loadingPermisos && (
                        <span
                          title="Solo el creador o miembros de un equipo vinculado pueden editar este proyecto"
                          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500"
                        >
                          <Lock size={12} />
                          Solo lectura
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                    {proj.tipos_sistema && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 text-[10px] font-medium border border-zinc-200/50 dark:border-zinc-700/50">
                        {getTipoSistemaIcon(proj.tipos_sistema.nombre)}
                        {proj.tipos_sistema.nombre}
                      </span>
                    )}
                    {uid !== null && proj.id_creador === uid && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] font-medium border border-blue-200/60 dark:border-blue-800/60">
                        Creado por ti
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {proj.nombre}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">
                    {proj.descripcion || "Sin descripción."}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1" title="Requerimientos">
                      <Layers size={13} className="text-zinc-400" />
                      {plural(reqs, 'requerimiento', 'requerimientos')}
                    </span>
                    <span className="flex items-center gap-1" title="Equipos vinculados">
                      <Users size={13} className="text-zinc-400" />
                      {plural(eqs, 'equipo', 'equipos')}
                    </span>
                  </div>
                  <ChevronRight size={16} className="text-zinc-300 dark:text-zinc-600 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Crear / Editar Proyecto */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProject ? 'Editar Proyecto' : 'Nuevo Proyecto'}
      >
        <form onSubmit={handleSave} noValidate className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-4">
            <div>
              <label htmlFor="proyecto-nombre" className={etiqueta}>
                Nombre del Proyecto <span className="text-rose-500">*</span>
              </label>
              <input
                id="proyecto-nombre"
                type="text"
                placeholder="Ej. Sistema de Pagos Móvil"
                maxLength={120}
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                className={campo}
              />
            </div>

            <div>
              <label htmlFor="proyecto-tipo" className={etiqueta}>Tipo de Sistema</label>
              <select
                id="proyecto-tipo"
                value={formData.id_tipo_sistema}
                onChange={(e) => setFormData({ ...formData, id_tipo_sistema: e.target.value })}
                className={campo}
              >
                <option value="">Sin especificar</option>
                {tiposSistema.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="proyecto-descripcion" className={etiqueta}>Descripción</label>
              <textarea
                id="proyecto-descripcion"
                rows={3}
                placeholder="Describe brevemente el alcance u objetivos del proyecto..."
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                className={`${campo} resize-none`}
              />
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
              {saving ? 'Guardando...' : editingProject ? 'Guardar cambios' : 'Crear Proyecto'}
            </button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
