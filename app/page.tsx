'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  Plus,
  Edit2,
  Trash2,
  ChevronRight,
  Search,
  Save,
  Lock,
  Handshake,
  Check,
} from 'lucide-react';
import type {
  Proyecto,
  TipoSistema,
  EstadoProyecto,
  NaturalezaProyecto,
  Colaboracion,
  ColaboracionProyecto,
} from '@/lib/database.types';
import {
  getProyectos,
  getTiposSistema,
  getEstadosProyecto,
  getNaturalezasProyecto,
  getColaboraciones,
  getColaboracionProyectos,
  createColaboracion,
  vincularProyectoAColaboracion,
  desvincularProyectoDeColaboracion,
  createProyecto,
  updateProyecto,
  deleteProyecto,
  getRequerimientos,
  ESTADO_APROBADO,
  ESTADO_PENDIENTE_APROBACION,
  ESTADO_RECHAZADO,
  getProyectoEquipos,
  getProyectosRelacionados,
} from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';
import { mensajeError } from '@/lib/errores';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import PageHeader from '@/components/ui/PageHeader';
import { useCierreSeguro } from '@/lib/use-cierre-seguro';
import { useEstadoSesion } from '@/lib/use-estado-sesion';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { ModalColaboraciones } from '@/components/proyectos/ModalColaboraciones';
import TourGuiado, { BotonAyudaTour, esCuentaNueva } from '@/components/ui/TourGuiado';
import {
  PASOS_TUTORIAL_BIENVENIDA,
  useTutorialBienvenida,
} from '@/components/proyectos/tutorial-bienvenida';
import {
  btnPrimario,
  btnSecundario,
  btnSecundarioCompacto,
  btnIcono,
  btnIconoPeligro,
  buscador,
  campo,
  etiqueta,
} from '@/components/ui/estilos';

interface ConteoEstados {
  aprobados: number;
  pendientes: number;
  rechazados: number;
}

interface ProyectoConStats extends Proyecto {
  requerimientos_count?: number;
  equipos_count?: number;
  estados_count?: ConteoEstados;
}

/** Barra apilada de estados de los requerimientos; lo que no cae en los tres va en gris. */
function BarraEstados({ conteo, total }: { conteo?: ConteoEstados; total: number }) {
  const c = conteo ?? { aprobados: 0, pendientes: 0, rechazados: 0 };
  const partes = [
    { n: c.aprobados, clase: 'bg-success', nombre: 'aprobados' },
    { n: c.pendientes, clase: 'bg-syntax-3-line', nombre: 'pendientes de aprobación' },
    { n: c.rechazados, clase: 'bg-danger', nombre: 'devueltos' },
  ];
  const resumen = total === 0
    ? 'Sin requerimientos todavía'
    : partes.filter(p => p.n > 0).map(p => `${p.n} ${p.nombre}`).join(', ') || 'Ninguno aprobado todavía';
  return (
    <div className="mt-2">
      <div className="flex h-1.5 rounded-full overflow-hidden bg-sunken-strong" role="img" aria-label={resumen} title={resumen}>
        {total > 0 && partes.map(p => p.n > 0 && (
          <span key={p.nombre} className={p.clase} style={{ width: `${(p.n / total) * 100}%` }} />
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-subtle">
        {total === 0 ? 'Sin requerimientos' : `${c.aprobados} de ${total} aprobados`}
      </p>
    </div>
  );
}

const plural = (n: number, singular: string, pluralTxt: string) =>
  `${n} ${n === 1 ? singular : pluralTxt}`;

function claseInsigniaEstadoProyecto(nombreEstado?: string): string {
  const n = (nombreEstado || '').toLowerCase();
  if (n.includes('progreso')) return 'bg-brand-subtle text-brand-text border-brand-line';
  if (n.includes('pausado')) return 'bg-warning-subtle text-warning border-warning-line';
  if (n.includes('finalizado')) return 'bg-success-subtle text-success border-success-line';
  if (n.includes('cancelado')) return 'bg-danger-subtle text-danger border-danger-line';
  return 'bg-sunken text-ink-muted border-line';
}

export default function Home() {
  const confirmar = useConfirm();
  const { user, profile, profileLoaded } = useAuth();
  const uid = user?.uid ?? null;

  const [projects, setProjects] = useState<Array<ProyectoConStats>>([]);
  const [tiposSistema, setTiposSistema] = useState<Array<TipoSistema>>([]);
  const [estadosProyecto, setEstadosProyecto] = useState<Array<EstadoProyecto>>([]);
  const [naturalezasProyecto, setNaturalezasProyecto] = useState<Array<NaturalezaProyecto>>([]);
  const [colaboraciones, setColaboraciones] = useState<Array<Colaboracion>>([]);
  const [relacionesColaboracion, setRelacionesColaboracion] = useState<Array<ColaboracionProyecto>>([]);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useEstadoSesion('easyreq:proyectos:buscar', '');
  const [filtroEstado, setFiltroEstado] = useEstadoSesion('easyreq:proyectos:estado', '');
  const [filtroNaturaleza, setFiltroNaturaleza] = useEstadoSesion('easyreq:proyectos:naturaleza', '');
  const [filtroColaboracion, setFiltroColaboracion] = useEstadoSesion('easyreq:proyectos:colaboracion', '');

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
    void cargarPermisos();
  }, [cargarPermisos]);

  const puedeEditarProyecto = (proyectoId: string) => proyectosPermitidos.includes(proyectoId);

  // Modal Crear / Editar proyecto
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isColabModalOpen, setIsColabModalOpen] = useState(false);

  // Guía de bienvenida: solo se abre sola en cuentas nuevas sin proyectos; los demás pueden abrirla con (?)
  const tutorial = useTutorialBienvenida(
    uid,
    Boolean(
      user &&
        profileLoaded &&
        profile &&
        !loading &&
        !loadingPermisos &&
        !isModalOpen &&
        !isColabModalOpen &&
        esCuentaNueva(user.metadata?.creationTime) &&
        projects.length === 0
    )
  );
  const [editingProject, setEditingProject] = useState<Proyecto | null>(null);

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    id_tipo_sistema: '',
    id_estado_proyecto: '',
    id_naturaleza_proyecto: '',
    en_colaboracion: false,
    ids_colaboraciones: [] as string[],
  });

  // Creación rápida de campaña dentro del modal de proyecto
  const [creandoColabRapida, setCreandoColabRapida] = useState(false);
  const [nuevaColabNombre, setNuevaColabNombre] = useState('');
  const [nuevaColabDesc, setNuevaColabDesc] = useState('');
  const [guardandoColabRapida, setGuardandoColabRapida] = useState(false);

  const [saving, setSaving] = useState(false);
  const { hayCambios, intentarCerrar } = useCierreSeguro(isModalOpen, formData, () =>
    setIsModalOpen(false)
  );

  const fetchProjects = useCallback(async () => {
    try {
      const [projectsData, reqs, pes, tipos, estados, naturalezas, colabs, relColabs] =
        await Promise.all([
          getProyectos(),
          getRequerimientos(),
          getProyectoEquipos(true),
          getTiposSistema(),
          getEstadosProyecto(),
          getNaturalezasProyecto(),
          getColaboraciones(),
          getColaboracionProyectos(),
        ]);

      setTiposSistema(tipos);
      setEstadosProyecto(estados);
      setNaturalezasProyecto(naturalezas);
      setColaboraciones(colabs);
      setRelacionesColaboracion(relColabs);

      const reqCountMap: Record<string, number> = {};
      const estadosMap: Record<string, ConteoEstados> = {};
      reqs.forEach(r => {
        if (r.id_proyecto) {
          reqCountMap[r.id_proyecto] = (reqCountMap[r.id_proyecto] || 0) + 1;
          const e = (estadosMap[r.id_proyecto] ??= { aprobados: 0, pendientes: 0, rechazados: 0 });
          const nombre = r.estado?.nombre_estado;
          if (nombre === ESTADO_APROBADO) e.aprobados++;
          else if (nombre === ESTADO_PENDIENTE_APROBACION) e.pendientes++;
          else if (nombre === ESTADO_RECHAZADO) e.rechazados++;
        }
      });

      const peCountMap: Record<string, number> = {};
      pes.forEach(pe => {
        if (pe.id_proyecto) {
          peCountMap[pe.id_proyecto] = (peCountMap[pe.id_proyecto] || 0) + 1;
        }
      });

      const formatted: ProyectoConStats[] = projectsData
        .map(p => ({
          ...p,
          requerimientos_count: reqCountMap[p.proyecto_id] || 0,
          estados_count: estadosMap[p.proyecto_id],
          equipos_count: peCountMap[p.proyecto_id] || 0,
        }))
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
    void fetchProjects();
  }, [fetchProjects]);

  const openCreateModal = () => {
    setEditingProject(null);
    setCreandoColabRapida(false);
    setNuevaColabNombre('');
    setNuevaColabDesc('');
    const estadoDefault =
      estadosProyecto.find(e => e.nombre_estado.toLowerCase() === 'en progreso')?.id ||
      estadosProyecto[0]?.id ||
      '';
    const naturalezaDefault =
      naturalezasProyecto.find(n => n.nombre_naturaleza.toLowerCase() === 'independiente')?.id ||
      naturalezasProyecto[0]?.id ||
      '';
    setFormData({
      nombre: '',
      descripcion: '',
      id_tipo_sistema: tiposSistema[0]?.id || '',
      id_estado_proyecto: estadoDefault,
      id_naturaleza_proyecto: naturalezaDefault,
      en_colaboracion: false,
      ids_colaboraciones: [],
    });
    setIsModalOpen(true);
  };

  const openEditModal = (p: Proyecto) => {
    if (!puedeEditarProyecto(p.proyecto_id)) {
      toast.error('Solo el creador o miembros de un equipo vinculado pueden editar este proyecto');
      return;
    }
    setEditingProject(p);
    setCreandoColabRapida(false);
    setNuevaColabNombre('');
    setNuevaColabDesc('');
    const idsColabs =
      p.colaboraciones?.map(c => c.id) ??
      relacionesColaboracion
        .filter(r => r.id_proyecto === p.proyecto_id)
        .map(r => r.id_colaboracion);
    setFormData({
      nombre: p.nombre,
      descripcion: p.descripcion || '',
      id_tipo_sistema: p.id_tipo_sistema || '',
      id_estado_proyecto: p.id_estado_proyecto || '',
      id_naturaleza_proyecto: p.id_naturaleza_proyecto || '',
      en_colaboracion: Boolean(p.en_colaboracion || idsColabs.length > 0),
      ids_colaboraciones: idsColabs,
    });
    setIsModalOpen(true);
  };

  const toggleColaboracionProyecto = (idColab: string) => {
    setFormData(prev => {
      const yaEsta = prev.ids_colaboraciones.includes(idColab);
      const nuevas = yaEsta
        ? prev.ids_colaboraciones.filter(id => id !== idColab)
        : [...prev.ids_colaboraciones, idColab];
      return {
        ...prev,
        ids_colaboraciones: nuevas,
        en_colaboracion: nuevas.length > 0 ? true : prev.en_colaboracion,
      };
    });
  };

  const handleCrearColaboracionRapida = async () => {
    if (!uid) return;
    if (!nuevaColabNombre.trim()) {
      toast.error('Ingresa el nombre de la nueva colaboración');
      return;
    }
    setGuardandoColabRapida(true);
    try {
      const creada = await createColaboracion({
        nombre: nuevaColabNombre.trim(),
        descripcion: nuevaColabDesc.trim(),
        id_creador: uid,
      });
      setColaboraciones(prev => [...prev, creada]);
      setFormData(prev => ({
        ...prev,
        en_colaboracion: true,
        ids_colaboraciones: [...prev.ids_colaboraciones, creada.id],
      }));
      setNuevaColabNombre('');
      setNuevaColabDesc('');
      setCreandoColabRapida(false);
      toast.success('Colaboración creada y seleccionada');
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo crear la colaboración'));
    } finally {
      setGuardandoColabRapida(false);
    }
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

    const idsColabsFinales = formData.en_colaboracion ? formData.ids_colaboraciones : [];
    const enColaboracionFinal = formData.en_colaboracion || idsColabsFinales.length > 0;

    setSaving(true);
    try {
      if (editingProject) {
        if (!puedeEditarProyecto(editingProject.proyecto_id)) {
          toast.error('No tienes permiso para editar este proyecto');
          return;
        }
        await updateProyecto(editingProject.proyecto_id, {
          nombre: formData.nombre.trim(),
          descripcion: formData.descripcion.trim(),
          id_tipo_sistema: formData.id_tipo_sistema || null,
          id_estado_proyecto: formData.id_estado_proyecto || null,
          id_naturaleza_proyecto: formData.id_naturaleza_proyecto || null,
          en_colaboracion: enColaboracionFinal,
        });

        // Sincronizar colaboraciones del proyecto
        const prevIds = new Set(
          relacionesColaboracion
            .filter(r => r.id_proyecto === editingProject.proyecto_id)
            .map(r => r.id_colaboracion)
        );
        const nextIds = new Set(idsColabsFinales);

        for (const idColab of nextIds) {
          if (!prevIds.has(idColab)) {
            await vincularProyectoAColaboracion(idColab, editingProject.proyecto_id, uid);
          }
        }
        for (const idColab of prevIds) {
          if (!nextIds.has(idColab)) {
            await desvincularProyectoDeColaboracion(idColab, editingProject.proyecto_id);
          }
        }

        toast.success('Proyecto actualizado');
      } else {
        const creado = await createProyecto({
          nombre: formData.nombre.trim(),
          descripcion: formData.descripcion.trim(),
          id_tipo_sistema: formData.id_tipo_sistema || null,
          id_estado_proyecto: formData.id_estado_proyecto || null,
          id_naturaleza_proyecto: formData.id_naturaleza_proyecto || null,
          en_colaboracion: enColaboracionFinal,
          id_creador: uid,
        });

        for (const idColab of idsColabsFinales) {
          await vincularProyectoAColaboracion(idColab, creado.proyecto_id, uid);
        }

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
      peligro: true,
    });
    if (!ok) return;

    try {
      await deleteProyecto(proj.proyecto_id);
      toast.success('Proyecto eliminado');
      void fetchProjects();
    } catch (error) {
      toast.error(mensajeError(error, 'No se pudo eliminar el proyecto'));
    }
  };

  const termino = searchTerm.trim().toLowerCase();
  const hayFiltrosActivos = Boolean(termino || filtroEstado || filtroNaturaleza || filtroColaboracion);

  const filteredProjects = projects.filter(p => {
    if (filtroEstado && p.id_estado_proyecto !== filtroEstado) return false;
    if (filtroNaturaleza && p.id_naturaleza_proyecto !== filtroNaturaleza) return false;
    if (filtroColaboracion) {
      if (filtroColaboracion === '__en_colaboracion__') {
        if (!p.en_colaboracion && (!p.colaboraciones || p.colaboraciones.length === 0)) {
          return false;
        }
      } else {
        const pertenece = (p.colaboraciones ?? []).some(c => c.id === filtroColaboracion);
        if (!pertenece) return false;
      }
    }
    if (!termino) return true;
    const nombresColab = (p.colaboraciones ?? []).map(c => c.nombre.toLowerCase()).join(' ');
    return (
      p.nombre.toLowerCase().includes(termino) ||
      (p.descripcion || '').toLowerCase().includes(termino) ||
      (p.tipos_sistema?.nombre || '').toLowerCase().includes(termino) ||
      (p.estado_proyecto?.nombre_estado || '').toLowerCase().includes(termino) ||
      (p.naturaleza_proyecto?.nombre_naturaleza || '').toLowerCase().includes(termino) ||
      nombresColab.includes(termino)
    );
  });

  const gruposProyectos = [
    {
      titulo: 'Mis proyectos',
      proyectos: filteredProjects.filter(p => puedeEditarProyecto(p.proyecto_id)),
      mensajeVacio: hayFiltrosActivos
        ? 'Ninguno de tus proyectos coincide con los filtros.'
        : 'Aún no participas en ningún proyecto. Crea uno o vincula uno de tus equipos.',
    },
    {
      titulo: 'Proyectos de la comunidad',
      proyectos: filteredProjects.filter(p => !puedeEditarProyecto(p.proyecto_id)),
      mensajeVacio: hayFiltrosActivos
        ? 'Ningún otro proyecto coincide con los filtros.'
        : 'No hay otros proyectos.',
    },
  ];

  const limpiarFiltros = () => {
    setSearchTerm('');
    setFiltroEstado('');
    setFiltroNaturaleza('');
    setFiltroColaboracion('');
  };

  return (
    <div className="animate-in fade-in">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Proyectos
            <BotonAyudaTour onClick={tutorial.abrir} label="¿Cómo empezar? Ver la guía" />
          </span>
        }
        description="Sistemas de software y la especificación de sus requerimientos."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="tour-colaboraciones"
              type="button"
              onClick={() => setIsColabModalOpen(true)}
              className={btnSecundario}
            >
              <Handshake size={16} />
              Colaboraciones
              {colaboraciones.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-xs bg-sunken text-ink-subtle tabular-nums">
                  {colaboraciones.length}
                </span>
              )}
            </button>
            <button id="tour-nuevo-proyecto" onClick={openCreateModal} className={btnPrimario}>
              <Plus size={16} />
              Nuevo proyecto
            </button>
          </div>
        }
      />

      {/* Búsqueda y Filtros */}
      <div className="space-y-3 mb-10">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-subtle">
            <Search size={16} />
          </div>
          <input
            type="search"
            placeholder="Buscar por nombre, descripción, tipo, estado, naturaleza o campaña..."
            aria-label="Buscar proyectos"
            className={buscador}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <select
            aria-label="Filtrar por estado del proyecto"
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            className={campo}
          >
            <option value="">Todos los estados</option>
            {estadosProyecto.map(e => (
              <option key={e.id} value={e.id}>
                Estado: {e.nombre_estado}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por naturaleza del proyecto"
            value={filtroNaturaleza}
            onChange={e => setFiltroNaturaleza(e.target.value)}
            className={campo}
          >
            <option value="">Todas las naturalezas</option>
            {naturalezasProyecto.map(n => (
              <option key={n.id} value={n.id}>
                Naturaleza: {n.nombre_naturaleza}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por colaboración o campaña"
            value={filtroColaboracion}
            onChange={e => setFiltroColaboracion(e.target.value)}
            className={campo}
          >
            <option value="">Todas las colaboraciones</option>
            <option value="__en_colaboracion__">En alguna colaboración</option>
            {colaboraciones.map(c => (
              <option key={c.id} value={c.id}>
                Campaña: {c.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading || loadingPermisos ? (
        <div
          className="bg-surface rounded-ui divide-y divide-canvas overflow-hidden"
          role="status"
          aria-label="Cargando"
        >
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 animate-pulse bg-sunken" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-20">
          <h3 className="text-lg font-semibold text-ink">
            {hayFiltrosActivos ? 'Sin resultados' : 'Todavía no hay proyectos'}
          </h3>
          <p className="text-base text-ink-muted mt-2 max-w-sm mx-auto">
            {hayFiltrosActivos
              ? 'Ningún proyecto coincide con tu búsqueda o filtros.'
              : 'Crea tu primer proyecto para empezar a registrar requerimientos.'}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            {hayFiltrosActivos ? (
              <button onClick={limpiarFiltros} className={btnSecundario}>
                Limpiar filtros
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
          {gruposProyectos.map(({ titulo, proyectos, mensajeVacio }, idxGrupo) => (
            <section key={titulo}>
              <h2 className="text-lg font-semibold text-ink mb-3">
                {titulo}
                <span className="ml-2 text-sm font-normal text-ink-subtle">{proyectos.length}</span>
              </h2>
              {proyectos.length === 0 ? (
                idxGrupo === 0 && !hayFiltrosActivos ? (
                  // Sin proyectos propios: una invitación con el siguiente paso, no solo una línea de texto
                  <div className="bg-surface rounded-ui p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-ink">Aún no participas en ningún proyecto</p>
                      <p className="text-sm text-ink-muted mt-1 max-w-[56ch]">
                        Crea uno para empezar a redactar requerimientos, o pide al líder de un equipo que vincule el tuyo a su proyecto.
                      </p>
                    </div>
                    <button onClick={openCreateModal} className={`${btnPrimario} shrink-0`}>
                      <Plus size={16} />
                      Nuevo proyecto
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-ink-subtle">{mensajeVacio}</p>
                )
              ) : (
                <ul className="bg-surface rounded-ui divide-y divide-canvas overflow-hidden">
                  {proyectos.map((proj, idxProj) => {
                    const editable = puedeEditarProyecto(proj.proyecto_id);
                    const reqs = proj.requerimientos_count || 0;
                    const eqs = proj.equipos_count || 0;
                    const colabs = proj.colaboraciones ?? [];
                    return (
                      <li
                        key={proj.proyecto_id}
                        id={idxGrupo === 0 && idxProj === 0 ? 'tour-lista-proyectos' : undefined}
                      >
                        {/* Toda la fila es clicable gracias al enlace del nombre (su ::after la cubre),
                            así funciona el clic central, "abrir en pestaña nueva" y el lector de pantalla
                            lo anuncia como enlace. Los botones de acción quedan por encima (z-10). */}
                        <div className="group relative flex items-center gap-4 px-5 py-5 hover:bg-sunken has-[a:focus-visible]:bg-sunken has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-brand-text">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                              <h3 className="text-base font-semibold text-ink">
                                <Link
                                  href={`/requerimientos/?id=${proj.proyecto_id}`}
                                  className="after:absolute after:inset-0 focus-visible:outline-none"
                                >
                                  {proj.nombre}
                                </Link>
                              </h3>
                              {proj.estado_proyecto && (
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${claseInsigniaEstadoProyecto(
                                    proj.estado_proyecto.nombre_estado
                                  )}`}
                                >
                                  {proj.estado_proyecto.nombre_estado}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-ink-muted mt-1 line-clamp-1">
                              {proj.descripcion || 'Sin descripción.'}
                            </p>
                            {/* Clasificación como texto: el color queda solo para el estado */}
                            {(() => {
                              const meta = [
                                proj.tipos_sistema?.nombre,
                                proj.naturaleza_proyecto?.nombre_naturaleza,
                                ...colabs.map(c => `Campaña: ${c.nombre}`),
                                proj.en_colaboracion && colabs.length === 0 ? 'En colaboración' : null,
                                uid !== null && proj.id_creador === uid ? 'Creado por ti' : null,
                              ].filter((v): v is string => !!v);
                              return meta.length > 0 ? (
                                <p className="text-sm text-ink-subtle mt-1">{meta.join(' · ')}</p>
                              ) : null;
                            })()}
                          </div>

                          {/* Avance real del proyecto en lugar de un ícono decorativo: cuántos
                              requerimientos están aprobados, esperando o devueltos */}
                          <div className="hidden sm:block w-56 shrink-0 text-sm text-ink-muted tabular-nums">
                            <div className="flex items-baseline justify-between gap-3">
                              <span>{plural(reqs, 'requerimiento', 'requerimientos')}</span>
                              <span className="text-ink-subtle">{plural(eqs, 'equipo', 'equipos')}</span>
                            </div>
                            <BarraEstados conteo={proj.estados_count} total={reqs} />
                          </div>

                          <div className="relative z-10 flex items-center gap-1 shrink-0">
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
                            ) : (
                              !loadingPermisos && (
                                <span
                                  title="Solo el creador o miembros de un equipo vinculado pueden editar este proyecto"
                                  className="inline-flex items-center gap-1 px-2 text-xs font-medium text-ink-subtle"
                                >
                                  <Lock size={14} aria-hidden />
                                  Solo lectura
                                </span>
                              )
                            )}
                          </div>
                          <ChevronRight
                            size={18}
                            aria-hidden
                            className="text-ink-muted group-hover:text-ink shrink-0"
                          />
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

      {/* Modal Crear / Editar proyecto */}
      <Modal
        open={isModalOpen}
        onClose={intentarCerrar}
        cerrarConFondo={!hayCambios}
        title={editingProject ? 'Editar proyecto' : 'Nuevo proyecto'}
        size="xl"
      >
        <form onSubmit={handleSave} noValidate className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-5">
            <div>
              <label htmlFor="proyecto-nombre" className={etiqueta}>
                Nombre del proyecto <span className="text-danger">*</span>
              </label>
              <input
                id="proyecto-nombre"
                type="text"
                placeholder="Ej. Sistema de Pagos Móvil"
                maxLength={120}
                value={formData.nombre}
                onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                className={campo}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="proyecto-tipo" className={etiqueta}>
                  Tipo de sistema
                </label>
                <select
                  id="proyecto-tipo"
                  value={formData.id_tipo_sistema}
                  onChange={e => setFormData({ ...formData, id_tipo_sistema: e.target.value })}
                  className={campo}
                >
                  <option value="">Sin especificar</option>
                  {tiposSistema.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="proyecto-estado" className={etiqueta}>
                  Estado del proyecto
                </label>
                <select
                  id="proyecto-estado"
                  value={formData.id_estado_proyecto}
                  onChange={e => setFormData({ ...formData, id_estado_proyecto: e.target.value })}
                  className={campo}
                >
                  <option value="">Sin especificar</option>
                  {estadosProyecto.map(est => (
                    <option key={est.id} value={est.id}>
                      {est.nombre_estado}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="proyecto-naturaleza" className={etiqueta}>
                  Naturaleza
                </label>
                <select
                  id="proyecto-naturaleza"
                  value={formData.id_naturaleza_proyecto}
                  onChange={e =>
                    setFormData({ ...formData, id_naturaleza_proyecto: e.target.value })
                  }
                  className={campo}
                >
                  <option value="">Sin especificar</option>
                  {naturalezasProyecto.map(nat => (
                    <option key={nat.id} value={nat.id}>
                      {nat.nombre_naturaleza}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="proyecto-descripcion" className={etiqueta}>
                Descripción
              </label>
              <textarea
                id="proyecto-descripcion"
                rows={3}
                placeholder="Describe brevemente el alcance u objetivos del proyecto..."
                value={formData.descripcion}
                onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                className={`${campo} resize-none`}
              />
            </div>

            {/* Colaboración / Campañas */}
            <div className="pt-2 border-t border-line space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label htmlFor="proyecto-en-colaboracion" className="text-sm font-medium text-ink cursor-pointer">
                    Proyecto en colaboración
                  </label>
                  <p className="text-xs text-ink-subtle">
                    Indica si este proyecto forma parte de una campaña o iniciativa junto con otros proyectos.
                  </p>
                </div>
                <input
                  id="proyecto-en-colaboracion"
                  type="checkbox"
                  checked={formData.en_colaboracion}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      en_colaboracion: e.target.checked,
                      ids_colaboraciones: e.target.checked ? prev.ids_colaboraciones : [],
                    }))
                  }
                  className="size-4 accent-brand-solid cursor-pointer"
                />
              </div>

              {formData.en_colaboracion && (
                <div className="p-4 rounded-ui bg-sunken border border-line space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink">
                      Campañas vinculadas ({formData.ids_colaboraciones.length})
                    </span>
                    {!creandoColabRapida && (
                      <button
                        type="button"
                        onClick={() => setCreandoColabRapida(true)}
                        className={btnSecundarioCompacto}
                      >
                        <Plus size={13} />
                        Nueva campaña
                      </button>
                    )}
                  </div>

                  {colaboraciones.length === 0 && !creandoColabRapida ? (
                    <p className="text-xs text-ink-subtle">
                      Aún no hay campañas registradas. Crea una nueva campaña para asociar este proyecto.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {colaboraciones.map(c => {
                        const seleccionada = formData.ids_colaboraciones.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleColaboracionProyecto(c.id)}
                            aria-pressed={seleccionada}
                            className={`inline-flex items-center gap-1.5 px-3 min-h-8 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                              seleccionada
                                ? 'bg-brand-solid border-brand-text text-on-solid'
                                : 'bg-surface border-line text-ink-muted hover:border-brand-text'
                            }`}
                          >
                            {seleccionada ? <Check size={12} /> : <Handshake size={12} />}
                            {c.nombre}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {creandoColabRapida && (
                    <div className="p-3 rounded-ui bg-surface border border-line space-y-3">
                      <p className="text-xs font-semibold text-ink">Crear nueva campaña</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          type="text"
                          placeholder="Nombre de la campaña *"
                          maxLength={120}
                          value={nuevaColabNombre}
                          onChange={e => setNuevaColabNombre(e.target.value)}
                          className={campo}
                        />
                        <input
                          type="text"
                          placeholder="Descripción (opcional)"
                          maxLength={240}
                          value={nuevaColabDesc}
                          onChange={e => setNuevaColabDesc(e.target.value)}
                          className={campo}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCreandoColabRapida(false);
                            setNuevaColabNombre('');
                            setNuevaColabDesc('');
                          }}
                          className={btnSecundarioCompacto}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={guardandoColabRapida}
                          onClick={handleCrearColaboracionRapida}
                          className={btnSecundarioCompacto}
                        >
                          <Plus size={13} />
                          {guardandoColabRapida ? 'Creando...' : 'Agregar campaña'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
              {saving ? 'Guardando...' : editingProject ? 'Guardar cambios' : 'Crear proyecto'}
            </button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal Gestionar Colaboraciones */}
      <ModalColaboraciones
        open={isColabModalOpen}
        onClose={() => setIsColabModalOpen(false)}
        uid={uid}
        colaboraciones={colaboraciones}
        relaciones={relacionesColaboracion}
        proyectos={projects}
        proyectosPermitidos={proyectosPermitidos}
        onCambio={fetchProjects}
      />

      <TourGuiado abierto={tutorial.abierto} pasos={PASOS_TUTORIAL_BIENVENIDA} onTerminar={tutorial.cerrar} />
    </div>
  );
}
