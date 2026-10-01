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
import PageHeader from '@/components/ui/PageHeader';
import { useCierreSeguro } from '@/lib/use-cierre-seguro';
import { useEstadoSesion } from '@/lib/use-estado-sesion';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import ProjectTeamRequestInbox from '@/components/ProjectTeamRequestInbox';
import {
  btnPrimario, btnSecundario, btnIcono, btnIconoPeligro, buscador, campo, etiqueta
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
  const [searchTerm, setSearchTerm] = useEstadoSesion("easyreq:proyectos:buscar", "");

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
  const { hayCambios, intentarCerrar } = useCierreSeguro(isModalOpen, formData, () => setIsModalOpen(false));

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
          Se eliminará <strong className="text-ink">{proj.nombre}</strong>
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
    if (n.includes('móvil') || n.includes('movil')) return <Smartphone size={14} className="text-brand-text" />;
    if (n.includes('embebido') || n.includes('iot')) return <Cpu size={14} className="text-warning" />;
    if (n.includes('escritorio')) return <Laptop size={14} className="text-success" />;
    if (n.includes('api') || n.includes('microservicio')) return <Server size={14} className="text-danger" />;
    return <Globe size={14} className="text-brand-text" />;
  };

  const termino = searchTerm.trim().toLowerCase();
  const filteredProjects = projects.filter(p => {
    if (!termino) return true;
    return p.nombre.toLowerCase().includes(termino) ||
      (p.descripcion || '').toLowerCase().includes(termino) ||
      (p.tipos_sistema?.nombre || '').toLowerCase().includes(termino);
  });
  const gruposProyectos = [
    {
      titulo: 'Mis proyectos',
      proyectos: filteredProjects.filter(p => puedeEditarProyecto(p.proyecto_id)),
      mensajeVacio: termino
        ? 'Ninguno de tus proyectos coincide con la búsqueda.'
        : 'Aún no participas en ningún proyecto. Crea uno o pide que inviten a tu equipo.'
    },
    {
      titulo: 'Proyectos de la comunidad',
      proyectos: filteredProjects.filter(p => !puedeEditarProyecto(p.proyecto_id)),
      mensajeVacio: termino
        ? 'Ningún otro proyecto coincide con la búsqueda.'
        : 'No hay otros proyectos.'
    }
  ];

  return (
    <div className="animate-in fade-in">
      <PageHeader
        title="Proyectos"
        description="Sistemas de software y la especificación de sus requerimientos."
        actions={
          <>
            <ProjectTeamRequestInbox
              userId={uid}
              onResponded={async () => {
                await Promise.all([fetchProjects(), cargarPermisos()]);
              }}
            />
            <button onClick={openCreateModal} className={btnPrimario}>
              <Plus size={16} />
              Nuevo proyecto
            </button>
          </>
        }
      />

      {/* Búsqueda */}
      <div className="relative mb-10">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-subtle">
          <Search size={16} />
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

      {loading || loadingPermisos ? (
        <div className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden" role="status" aria-label="Cargando">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse bg-sunken" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-20">
          <h3 className="text-lg font-semibold text-ink">
            {termino ? 'Sin resultados' : 'Todavía no hay proyectos'}
          </h3>
          <p className="text-base text-ink-muted mt-2 max-w-sm mx-auto">
            {termino
              ? 'Ningún proyecto coincide con tu búsqueda.'
              : 'Crea tu primer proyecto para empezar a registrar requerimientos.'}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            {termino ? (
              <button onClick={() => setSearchTerm('')} className={btnSecundario}>
                Limpiar búsqueda
              </button>
            ) : (
              <button onClick={openCreateModal} className={btnPrimario}>
                <Plus size={16} />
                Crear proyecto
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-12">
          {gruposProyectos.map(({ titulo, proyectos, mensajeVacio }) => (
            <section key={titulo}>
              <h2 className="text-lg font-semibold text-ink mb-3">
                {titulo}
                <span className="ml-2 text-sm font-normal text-ink-subtle">{proyectos.length}</span>
              </h2>
              {proyectos.length === 0 ? (
                <p className="text-sm text-ink-subtle">{mensajeVacio}</p>
              ) : (
                <ul className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
                  {proyectos.map((proj) => {
                    const editable = puedeEditarProyecto(proj.proyecto_id);
                    const reqs = proj.requerimientos_count || 0;
                    const eqs = proj.equipos_count || 0;
                    return (
                      <li key={proj.proyecto_id}>
                        <div
                          role="link"
                          tabIndex={0}
                          onClick={() => abrirProyecto(proj.proyecto_id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.target === e.currentTarget) abrirProyecto(proj.proyecto_id);
                          }}
                          aria-label={`Abrir requerimientos de ${proj.nombre}`}
                          className="group flex items-center gap-4 px-5 py-5 cursor-pointer hover:bg-sunken focus-visible:bg-sunken"
                        >
                          <span className="hidden sm:flex size-10 shrink-0 items-center justify-center rounded-ui bg-brand-solid text-on-solid">
                            <FolderGit2 size={20} aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <h3 className="text-base font-semibold text-ink">{proj.nombre}</h3>
                              {proj.tipos_sistema && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sunken border border-line text-xs font-medium text-ink-muted">
                                  {getTipoSistemaIcon(proj.tipos_sistema.nombre)}
                                  {proj.tipos_sistema.nombre}
                                </span>
                              )}
                              {uid !== null && proj.id_creador === uid && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-subtle text-brand-text text-xs font-medium border border-brand-line">
                                  Creado por ti
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-ink-muted mt-1 line-clamp-1">
                              {proj.descripcion || 'Sin descripción.'}
                            </p>
                          </div>

                          <div className="hidden sm:flex items-center gap-6 text-sm text-ink-muted tabular-nums shrink-0">
                            <span title="Requerimientos" className="flex items-center gap-1.5">
                              <Layers size={16} aria-hidden />
                              {plural(reqs, 'requerimiento', 'requerimientos')}
                            </span>
                            <span title="Equipos vinculados" className="flex items-center gap-1.5">
                              <Users size={16} aria-hidden />
                              {plural(eqs, 'equipo', 'equipos')}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {editable ? (
                              <>
                                <button
                                  onClick={() => openEditModal(proj)}
                                  title="Editar proyecto"
                                  aria-label={`Editar ${proj.nombre}`}
                                  className={btnIcono}
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => deleteProject(proj)}
                                  title="Eliminar proyecto"
                                  aria-label={`Eliminar ${proj.nombre}`}
                                  className={btnIconoPeligro}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            ) : !loadingPermisos && (
                              <span
                                title="Solo el creador o miembros de un equipo vinculado pueden editar este proyecto"
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

      {/* Modal Crear / Editar Proyecto */}
      <Modal
        open={isModalOpen}
        onClose={intentarCerrar}
        cerrarConFondo={!hayCambios}
        title={editingProject ? 'Editar Proyecto' : 'Nuevo Proyecto'}
      >
        <form onSubmit={handleSave} noValidate className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-4">
            <div>
              <label htmlFor="proyecto-nombre" className={etiqueta}>
                Nombre del Proyecto <span className="text-danger">*</span>
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
            <button type="button" onClick={intentarCerrar} className={btnSecundario}>
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
