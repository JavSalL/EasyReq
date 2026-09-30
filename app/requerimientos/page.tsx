'use client';

import React, { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Plus, Edit2, Trash2, Search, User, Users, Clock, Save,
  Sparkles, CheckCheck, FileText, History, Lock, Wand2, ArrowRight
} from 'lucide-react';
import { generateSingleRequirement } from '@/lib/ai-actions';
import type {
  Proyecto, Requerimiento, TipoRequerimiento, Estado,
  Modalidad, Modelo, Patron, PerfilUsuario, Equipo, LogRequerimiento
} from '@/lib/database.types';
import {
  getProyectoById,
  getTiposRequerimientos,
  getEstados,
  getModalidades,
  getModelos,
  getPatrones,
  getAllUsers,
  getRequerimientos,
  createRequerimiento,
  updateRequerimiento,
  deleteRequerimiento,
  addLogRequerimiento,
  getLogsRequerimientos,
  getEquipos,
  getProyectoEquipos,
  crearSolicitudProyectoEquipo,
  getSolicitudesProyectoEquipoEnviadas,
  isUsuarioRelacionadoAProyecto
} from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';
import { mensajeError } from '@/lib/errores';
import { usePageTitle } from '@/lib/use-page-title';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  btnPrimario, btnSecundario, btnIcono, btnIconoPeligro, buscador, campo, etiqueta, tarjeta
} from '@/components/ui/estilos';

const FORM_VACIO = {
  enunciado: '',
  id_tipo_requerimiento: '',
  id_estado: '',
  id_modalidad: '',
  id_modelo: '',
  id_patron_seleccionado: '',
  id_autor: '',
  id_aprobador: ''
};

// Nombres legibles de los campos, para describir qué cambió en el historial
const CAMPOS_EDITABLES: Array<[keyof typeof FORM_VACIO & keyof Requerimiento, string]> = [
  ['enunciado', 'enunciado'],
  ['id_tipo_requerimiento', 'tipo'],
  ['id_estado', 'estado'],
  ['id_modalidad', 'modalidad'],
  ['id_modelo', 'modelo'],
  ['id_autor', 'autor'],
  ['id_aprobador', 'aprobador']
];

const getBadgeColorEstado = (nombre?: string) => {
  const n = (nombre || '').toLowerCase();
  if (n.includes('aprobado')) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20';
  if (n.includes('rechazado')) return 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20';
  if (n.includes('revisión') || n.includes('revision')) return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
  if (n.includes('implementado')) return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20';
  return 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20';
};

export default function RequerimientosPage() {
  const router = useRouter();
  const confirmar = useConfirm();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  // Lectura directa de window.location.search: con `output: 'export'` (sitio estático
  // en Firebase Hosting) no hay servidor que resuelva `searchParams` por request, así
  // que se lee la URL real del navegador en el cliente en vez de usar el hook de Next.
  const [proyectoId, setProyectoId] = useState<string | null>(null);
  const [urlLeida, setUrlLeida] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setProyectoId(sp.get('id') || sp.get('proyectoId') || null);
    setUrlLeida(true);
  }, []);

  // States
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [requerimientos, setRequerimientos] = useState<Array<Requerimiento>>([]);
  const [loading, setLoading] = useState(true);
  usePageTitle(proyecto?.nombre ?? 'Requerimientos');

  // Catálogos
  const [tiposReq, setTiposReq] = useState<Array<TipoRequerimiento>>([]);
  const [estados, setEstados] = useState<Array<Estado>>([]);
  const [modalidades, setModalidades] = useState<Array<Modalidad>>([]);
  const [modelos, setModelos] = useState<Array<Modelo>>([]);
  const [patrones, setPatrones] = useState<Array<Patron>>([]);
  const [usuarios, setUsuarios] = useState<Array<PerfilUsuario>>([]);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [filterModelo, setFilterModelo] = useState<string>("todos");

  // Modal State Requerimiento
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Requerimiento | null>(null);
  const [formData, setFormData] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Modal de Historial / Logs
  const [currentReqForLogs, setCurrentReqForLogs] = useState<Requerimiento | null>(null);
  const [selectedReqLogs, setSelectedReqLogs] = useState<Array<LogRequerimiento>>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Equipos asignados al proyecto
  const [equipos, setEquipos] = useState<Array<Equipo>>([]);
  const [equiposAsignados, setEquiposAsignados] = useState<string[]>([]);
  const [solicitudesEquiposPendientes, setSolicitudesEquiposPendientes] = useState<string[]>([]);
  const [showEquiposModal, setShowEquiposModal] = useState(false);

  // Control de acceso: lectura total; crear/editar requerimientos y
  // vincular equipos solo si el usuario está relacionado al proyecto
  // (creador o miembro de un equipo vinculado).
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [permisoCargado, setPermisoCargado] = useState(false);
  // Solo el creador invita equipos o pide desvincularlos (lo acepta el líder)
  const puedeGestionarVinculos = uid !== null && proyecto?.id_creador === uid;

  // Equipos con una solicitud de vínculo/desvínculo enviada y sin responder
  useEffect(() => {
    if (!uid || !proyectoId) return;
    getSolicitudesProyectoEquipoEnviadas(uid, proyectoId)
      .then(solicitudes => setSolicitudesEquiposPendientes(solicitudes.map(s => s.id_equipo)))
      .catch(err => console.error('Error al cargar solicitudes enviadas:', err));
  }, [uid, proyectoId]);

  useEffect(() => {
    let activo = true;
    const cargarPermiso = async () => {
      try {
        const ok = uid && proyectoId
          ? await isUsuarioRelacionadoAProyecto(uid, proyectoId)
          : false;
        if (activo) setPuedeEditar(ok);
      } catch (err) {
        console.error('Error al verificar permiso sobre el proyecto:', err);
        if (activo) setPuedeEditar(false);
      } finally {
        if (activo) setPermisoCargado(true);
      }
    };
    cargarPermiso();
    return () => { activo = false; };
  }, [uid, proyectoId]);

  // AI Generation State
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  // Cargar lista de requerimientos (más recientes primero)
  const fetchRequerimientos = useCallback(async () => {
    if (!proyectoId) return;
    const data = await getRequerimientos(proyectoId);
    setRequerimientos(data.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
  }, [proyectoId]);

  // Cargar proyecto, catálogos, requerimientos y equipos
  const cargarTodo = useCallback(async () => {
    if (!proyectoId) return;
    setLoading(true);

    try {
      const [found, trData, estData, modData, modelData, patData, userData, todosEquipos, pes] = await Promise.all([
        getProyectoById(proyectoId),
        getTiposRequerimientos(),
        getEstados(),
        getModalidades(),
        getModelos(),
        getPatrones(),
        getAllUsers(),
        getEquipos(),
        getProyectoEquipos(),
        fetchRequerimientos()
      ]);

      if (!found) {
        toast.error('El proyecto no existe o fue eliminado');
        router.push('/');
        return;
      }
      setProyecto(found);

      setTiposReq(trData);
      setEstados(estData);
      setModalidades(modData);
      setModelos(modelData);
      setPatrones(patData);
      setUsuarios([...userData].sort((a, b) => (a.nombre || a.correo).localeCompare(b.nombre || b.correo)));
      setEquipos([...todosEquipos].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setEquiposAsignados(pes.filter(p => p.id_proyecto === proyectoId).map(p => p.id_equipo));
    } catch (e) {
      console.error(e);
      toast.error(mensajeError(e, 'No se pudieron cargar los datos del proyecto'));
    } finally {
      setLoading(false);
    }
  }, [proyectoId, router, fetchRequerimientos]);

  useEffect(() => {
    cargarTodo();
  }, [cargarTodo]);

  // Filtrar patrones según el modelo seleccionado
  const patronesFiltrados = patrones.filter(p => p.id_modelo === formData.id_modelo);
  const patronSeleccionado = patrones.find(p => p.patron_id === formData.id_patron_seleccionado);
  const nombreUsuario = (id: string | null | undefined) => {
    const u = usuarios.find(x => x.id === id);
    return u ? (u.nombre || u.correo) : null;
  };

  // Apertura de modal nuevo
  const openCreateModal = () => {
    if (!puedeEditar) {
      toast.error('Solo el creador o miembros de un equipo vinculado pueden crear requerimientos');
      return;
    }
    setEditingReq(null);
    const primerModelo = modelos[0]?.id || '';
    const primerPatron = patrones.find(p => p.id_modelo === primerModelo);

    setFormData({
      ...FORM_VACIO,
      id_tipo_requerimiento: tiposReq[0]?.tipo_req || '',
      id_estado: estados.find(e => e.nombre_estado === 'Borrador')?.id || estados[0]?.id || '',
      id_modalidad: modalidades[0]?.id || '',
      id_modelo: primerModelo,
      id_patron_seleccionado: primerPatron?.patron_id || '',
      // Por defecto el autor es quien lo redacta
      id_autor: usuarios.some(u => u.id === uid) ? uid! : ''
    });
    setAiPrompt('');
    setIsModalOpen(true);
  };

  // Apertura de modal editar
  const openEditModal = (req: Requerimiento) => {
    if (!puedeEditar) {
      toast.error('Solo el creador o miembros de un equipo vinculado pueden editar requerimientos');
      return;
    }
    setEditingReq(req);
    setFormData({
      enunciado: req.enunciado,
      id_tipo_requerimiento: req.id_tipo_requerimiento || '',
      id_estado: req.id_estado || '',
      id_modalidad: req.id_modalidad || '',
      id_modelo: req.id_modelo || '',
      id_patron_seleccionado: patrones.find(p => p.id_modelo === req.id_modelo)?.patron_id || '',
      id_autor: req.id_autor || '',
      id_aprobador: req.id_aprobador || ''
    });
    setAiPrompt('');
    setIsModalOpen(true);
  };

  const handleModeloChange = (nuevoModeloId: string) => {
    const primerP = patrones.find(p => p.id_modelo === nuevoModeloId);
    setFormData({
      ...formData,
      id_modelo: nuevoModeloId,
      id_patron_seleccionado: primerP?.patron_id || ''
    });
  };

  // Copia la estructura del patrón al enunciado para completarla
  const usarPlantilla = async () => {
    if (!patronSeleccionado) return;
    if (formData.enunciado.trim() && formData.enunciado.trim() !== patronSeleccionado.promt) {
      const ok = await confirmar({
        titulo: '¿Reemplazar el enunciado?',
        mensaje: 'El texto que ya escribiste se reemplazará por la plantilla del patrón.',
        textoConfirmar: 'Reemplazar'
      });
      if (!ok) return;
    }
    setFormData(prev => ({ ...prev, enunciado: patronSeleccionado.promt }));
  };

  // Guardar Requerimiento (Crear o Editar)
  const handleSaveReq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeEditar) {
      toast.error('No tienes permiso para modificar requerimientos de este proyecto');
      return;
    }
    if (!formData.enunciado.trim()) {
      toast.error('El enunciado del requerimiento es obligatorio');
      return;
    }

    const datos = {
      enunciado: formData.enunciado.trim(),
      id_tipo_requerimiento: formData.id_tipo_requerimiento || null,
      id_estado: formData.id_estado || null,
      id_modalidad: formData.id_modalidad || null,
      id_modelo: formData.id_modelo || null,
      id_autor: formData.id_autor || null,
      id_aprobador: formData.id_aprobador || null
    };

    setSaving(true);
    try {
      if (editingReq) {
        const cambios = CAMPOS_EDITABLES
          .filter(([campoReq]) => (editingReq[campoReq] || null) !== datos[campoReq])
          .map(([, nombre]) => nombre);
        if (cambios.length === 0) {
          toast('No hay cambios que guardar');
          setIsModalOpen(false);
          return;
        }

        await updateRequerimiento(editingReq.id, datos);
        await addLogRequerimiento({
          id_requerimiento: editingReq.id,
          accion: 'Edición de requerimiento',
          id_autor: uid,
          detalles: { campos: cambios }
        });
        toast.success('Requerimiento actualizado');
      } else {
        const newReq = await createRequerimiento({ ...datos, id_proyecto: proyectoId! });
        if (newReq?.id) {
          await addLogRequerimiento({
            id_requerimiento: newReq.id,
            accion: 'Creación de requerimiento',
            id_autor: uid,
            detalles: { inicio: 'Creación inicial' }
          });
        }
        toast.success('Requerimiento registrado');
      }

      setIsModalOpen(false);
      fetchRequerimientos();
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudo guardar el requerimiento'));
    } finally {
      setSaving(false);
    }
  };

  // AI Generate Requirement
  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Describe la funcionalidad para generar el requerimiento");
      return;
    }

    setIsAILoading(true);
    try {
      const generated = await generateSingleRequirement(aiPrompt, patronSeleccionado?.promt);
      if (generated && generated.name) {
        setFormData(prev => ({ ...prev, enunciado: generated.name }));
        toast.success("Requerimiento generado. Revísalo antes de guardar.");
        setAiPrompt('');
      } else {
        toast.error("La IA no devolvió un requerimiento. Intenta describirlo con más detalle.");
      }
    } catch {
      toast.error("No se pudo conectar con el servicio de IA. Inténtalo de nuevo.");
    } finally {
      setIsAILoading(false);
    }
  };

  // Cambio de estado directo desde la tarjeta
  const handleCambioEstado = async (req: Requerimiento, nuevoEstadoId: string) => {
    if (!puedeEditar) {
      toast.error('Solo el creador o miembros de un equipo vinculado pueden cambiar el estado');
      return;
    }
    const targetEstado = estados.find(e => e.id === nuevoEstadoId);
    if (!targetEstado || targetEstado.id === req.id_estado) return;

    try {
      const updateData: Partial<Requerimiento> = { id_estado: targetEstado.id };
      // Quien aprueba queda registrado como aprobador
      if (targetEstado.nombre_estado.toLowerCase() === 'aprobado' && uid) {
        updateData.id_aprobador = uid;
      }

      await updateRequerimiento(req.id, updateData);
      await addLogRequerimiento({
        id_requerimiento: req.id,
        accion: `Cambio de estado a ${targetEstado.nombre_estado}`,
        id_autor: uid,
        detalles: { estado_anterior: req.estado?.nombre_estado ?? null, estado_nuevo: targetEstado.nombre_estado }
      });

      toast.success(`Estado cambiado a ${targetEstado.nombre_estado}`);
      fetchRequerimientos();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo cambiar el estado'));
    }
  };

  // Eliminar Requerimiento
  const handleDeleteReq = async (req: Requerimiento) => {
    if (!puedeEditar) {
      toast.error('Solo el creador o miembros de un equipo vinculado pueden eliminar requerimientos');
      return;
    }
    const extracto = req.enunciado.length > 120 ? `${req.enunciado.slice(0, 120)}…` : req.enunciado;
    const ok = await confirmar({
      titulo: '¿Eliminar requerimiento?',
      mensaje: (
        <>
          <span className="block font-mono text-[11px] bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 mb-2 text-zinc-800 dark:text-zinc-200">
            {extracto}
          </span>
          Esta acción no se puede deshacer.
        </>
      ),
      textoConfirmar: 'Eliminar',
      peligro: true
    });
    if (!ok) return;
    try {
      await deleteRequerimiento(req.id);
      toast.success('Requerimiento eliminado');
      fetchRequerimientos();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo eliminar el requerimiento'));
    }
  };

  // Ver Logs del Requerimiento
  const handleViewLogs = async (req: Requerimiento) => {
    setCurrentReqForLogs(req);
    setSelectedReqLogs([]);
    setLoadingLogs(true);
    try {
      setSelectedReqLogs(await getLogsRequerimientos(req.id));
    } finally {
      setLoadingLogs(false);
    }
  };

  // Solicitar al líder del equipo que se vincule o desvincule del proyecto.
  // El vínculo solo cambia cuando el líder acepta la solicitud.
  const solicitarVinculoEquipo = async (equipo: Equipo) => {
    if (!proyectoId || !uid) return;
    if (!puedeGestionarVinculos) {
      toast.error('Solo el creador del proyecto puede invitar equipos o solicitar su desvinculación');
      return;
    }
    const isAsignado = equiposAsignados.includes(equipo.equipo_id);
    if (isAsignado) {
      const ok = await confirmar({
        titulo: '¿Solicitar desvinculación?',
        mensaje: (
          <>
            Se pedirá al líder de <strong className="text-zinc-900 dark:text-zinc-100">{equipo.nombre}</strong> que
            acepte desvincular su equipo. Si acepta, sus miembros podrían perder el permiso de editar este proyecto.
          </>
        ),
        textoConfirmar: 'Enviar solicitud',
        peligro: true
      });
      if (!ok) return;
    }
    try {
      await crearSolicitudProyectoEquipo(proyectoId, equipo.equipo_id, uid, isAsignado ? 'desvincular' : 'vincular');
      setSolicitudesEquiposPendientes(prev => [...new Set([...prev, equipo.equipo_id])]);
      toast.success(
        isAsignado
          ? 'Solicitud de desvinculación enviada al líder del equipo'
          : 'Invitación enviada al líder del equipo'
      );
    } catch (e) {
      console.error('Error al crear solicitud de vínculo proyecto-equipo:', e);
      toast.error(mensajeError(e, 'No se pudo enviar la solicitud'));
    }
  };

  // Filtrado de lista
  const termino = searchTerm.trim().toLowerCase();
  const hayFiltros = termino !== '' || filterEstado !== 'todos' || filterTipo !== 'todos' || filterModelo !== 'todos';
  const limpiarFiltros = () => {
    setSearchTerm('');
    setFilterEstado('todos');
    setFilterTipo('todos');
    setFilterModelo('todos');
  };
  const filteredRequerimientos = requerimientos.filter((r) => {
    const matchSearch = !termino || r.enunciado.toLowerCase().includes(termino);
    const matchEstado = filterEstado === 'todos' || r.id_estado === filterEstado;
    const matchTipo = filterTipo === 'todos' || r.id_tipo_requerimiento === filterTipo;
    const matchModelo = filterModelo === 'todos' || r.id_modelo === filterModelo;
    return matchSearch && matchEstado && matchTipo && matchModelo;
  });

  // Equipos vinculados primero en el modal
  const equiposOrdenados = [...equipos].sort(
    (a, b) => Number(equiposAsignados.includes(b.equipo_id)) - Number(equiposAsignados.includes(a.equipo_id))
  );

  if (urlLeida && !proyectoId) {
    return (
      <div className="p-8 text-center bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No se indicó ningún proyecto</p>
        <p className="text-xs text-zinc-500 mt-1">Abre un proyecto desde la lista para ver sus requerimientos.</p>
        <button onClick={() => router.push('/')} className={`${btnPrimario} mt-4`}>
          Ir a Proyectos
        </button>
      </div>
    );
  }

  const selectFiltro = `${campo} !text-xs bg-white dark:bg-zinc-900/60 border-zinc-200/80 dark:border-zinc-800`;

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Barra superior de navegación */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
        <div className="min-w-0">
          <Link
            href="/"
            className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors mb-2 group"
          >
            <ChevronLeft size={14} className="mr-1 group-hover:-translate-x-0.5 transition-transform" />
            Proyectos
          </Link>

          {proyecto ? (
            <>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  {proyecto.nombre}
                </h1>
                {proyecto.tipos_sistema?.nombre && (
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/50">
                    {proyecto.tipos_sistema.nombre}
                  </span>
                )}
              </div>
              <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">
                {proyecto.descripcion || 'Sin descripción'}
              </p>
            </>
          ) : (
            <div className="space-y-2">
              <div className="h-7 w-64 max-w-full bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-3 w-80 max-w-full bg-zinc-100 dark:bg-zinc-900 rounded animate-pulse" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button onClick={() => setShowEquiposModal(true)} className={btnSecundario}>
            <Users size={15} className="text-zinc-500" />
            Equipos ({equiposAsignados.length})
          </button>

          {puedeEditar && (
            <button onClick={openCreateModal} className={btnPrimario}>
              <Plus size={15} />
              Nuevo Requerimiento
            </button>
          )}
        </div>
      </div>

      {/* Aviso de solo lectura para no relacionados */}
      {permisoCargado && !puedeEditar && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl p-3.5 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
          <Lock size={15} className="shrink-0" />
          <span>
            Tienes acceso de lectura. Solo el creador del proyecto o miembros de un equipo vinculado pueden
            crear o editar requerimientos; el creador administra las invitaciones de equipos.
          </span>
        </div>
      )}

      {/* Barra de Búsqueda y Filtros */}
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
              <Search size={14} />
            </div>
            <input
              type="search"
              placeholder="Buscar enunciado..."
              aria-label="Buscar requerimientos"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={buscador}
            />
          </div>

          <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)} aria-label="Filtrar por estado" className={selectFiltro}>
            <option value="todos">Todos los estados</option>
            {estados.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre_estado}</option>
            ))}
          </select>

          <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} aria-label="Filtrar por tipo" className={selectFiltro}>
            <option value="todos">Todos los tipos</option>
            {tiposReq.map((t) => (
              <option key={t.tipo_req} value={t.tipo_req}>{t.nombre}</option>
            ))}
          </select>

          <select value={filterModelo} onChange={(e) => setFilterModelo(e.target.value)} aria-label="Filtrar por modelo" className={selectFiltro}>
            <option value="todos">Todos los modelos</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </div>
        {!loading && requerimientos.length > 0 && (
          <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1">
            <span>
              {hayFiltros
                ? `Mostrando ${filteredRequerimientos.length} de ${requerimientos.length} requerimientos`
                : `${requerimientos.length} ${requerimientos.length === 1 ? 'requerimiento' : 'requerimientos'}`}
            </span>
            {hayFiltros && (
              <button onClick={limpiarFiltros} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                Quitar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lista de Requerimientos */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredRequerimientos.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl flex items-center justify-center mx-auto mb-3">
            <FileText size={22} />
          </div>
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {hayFiltros ? 'Sin resultados' : 'Todavía no hay requerimientos'}
          </h3>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1 max-w-sm mx-auto">
            {hayFiltros
              ? 'Ningún requerimiento coincide con los filtros seleccionados.'
              : puedeEditar
                ? 'Redacta el primero usando las sintaxis de los modelos o genéralo con IA.'
                : 'Cuando el equipo redacte requerimientos, aparecerán aquí.'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {hayFiltros && (
              <button onClick={limpiarFiltros} className={btnSecundario}>Quitar filtros</button>
            )}
            {!hayFiltros && puedeEditar && (
              <button onClick={openCreateModal} className={btnPrimario}>
                <Plus size={15} />
                Redactar Requerimiento
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequerimientos.map((req) => (
            <div
              key={req.id}
              className={`${tarjeta} p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-4`}
            >
              <div className="space-y-2.5 flex-1 min-w-0">
                {/* Badges de clasificación */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {puedeEditar ? (
                    <select
                      value={req.id_estado || ''}
                      onChange={(e) => handleCambioEstado(req, e.target.value)}
                      aria-label="Cambiar estado"
                      title="Cambiar estado"
                      className={`pl-2.5 pr-1 py-0.5 rounded-full font-medium border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${getBadgeColorEstado(req.estado?.nombre_estado)}`}
                    >
                      {!req.id_estado && <option value="">Sin estado</option>}
                      {estados.map((e) => (
                        <option key={e.id} value={e.id} className="text-zinc-900">{e.nombre_estado}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium border ${getBadgeColorEstado(req.estado?.nombre_estado)}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {req.estado?.nombre_estado || 'Sin estado'}
                    </span>
                  )}

                  {req.tipo_requerimiento && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 font-medium border border-zinc-200/60 dark:border-zinc-700/50">
                      {req.tipo_requerimiento.nombre}
                    </span>
                  )}
                  {req.modelo && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium border border-indigo-200/60 dark:border-indigo-800/40">
                      {req.modelo.nombre}
                    </span>
                  )}
                  {req.modalidad && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium border border-amber-200/60 dark:border-amber-800/40">
                      {req.modalidad.nombre_modalidad}
                    </span>
                  )}
                </div>

                <div className="border-l-2 border-zinc-900 dark:border-zinc-100 pl-3 py-0.5">
                  <p className="text-zinc-900 dark:text-zinc-100 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
                    {req.enunciado}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 pt-1">
                  {req.autor && (
                    <span className="flex items-center gap-1">
                      <User size={12} />
                      Autor: <strong className="text-zinc-700 dark:text-zinc-300 font-medium">{req.autor.nombre || req.autor.correo}</strong>
                    </span>
                  )}
                  {req.aprobador && (
                    <span className="flex items-center gap-1">
                      <CheckCheck size={12} className="text-emerald-500" />
                      Aprobado por: <strong className="text-zinc-700 dark:text-zinc-300 font-medium">{req.aprobador.nombre || req.aprobador.correo}</strong>
                    </span>
                  )}
                  {req.created_at && (
                    <span className="flex items-center gap-1" title={new Date(req.created_at).toLocaleString()}>
                      <Clock size={12} />
                      {new Date(req.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-1 border-t md:border-t-0 pt-3 md:pt-0 border-zinc-100 dark:border-zinc-800">
                <button
                  onClick={() => handleViewLogs(req)}
                  title="Ver historial de cambios"
                  aria-label="Ver historial de cambios"
                  className={btnIcono}
                >
                  <History size={16} />
                </button>
                {puedeEditar && (
                  <>
                    <button
                      onClick={() => openEditModal(req)}
                      title="Editar requerimiento"
                      aria-label="Editar requerimiento"
                      className={btnIcono}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteReq(req)}
                      title="Eliminar requerimiento"
                      aria-label="Eliminar requerimiento"
                      className={btnIconoPeligro}
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Redactar / Editar Requerimiento */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingReq ? 'Editar Requerimiento' : 'Nuevo Requerimiento'}
        description="Elige el modelo de especificación y redacta respetando la estructura del patrón."
        size="xl"
      >
        <form ref={formRef} onSubmit={handleSaveReq} noValidate className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-5">
            {/* Selector de Modelo y Patrón */}
            <div className="bg-zinc-50/80 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-200/60 dark:border-zinc-700/50 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="req-modelo" className={etiqueta}>Modelo de Requisitos</label>
                  <select
                    id="req-modelo"
                    value={formData.id_modelo}
                    onChange={(e) => handleModeloChange(e.target.value)}
                    className={campo}
                  >
                    <option value="">Sin modelo</option>
                    {modelos.map((m) => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="req-patron" className={etiqueta}>Patrón (plantilla)</label>
                  <select
                    id="req-patron"
                    value={formData.id_patron_seleccionado}
                    onChange={(e) => setFormData({ ...formData, id_patron_seleccionado: e.target.value })}
                    disabled={patronesFiltrados.length === 0}
                    className={campo}
                  >
                    <option value="">{patronesFiltrados.length === 0 ? 'Este modelo no tiene patrones' : 'Sin patrón'}</option>
                    {patronesFiltrados.map((p) => (
                      <option key={p.patron_id} value={p.patron_id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              {patronSeleccionado && (
                <div className="flex items-start justify-between gap-3 bg-zinc-950 rounded-xl px-3 py-2">
                  <code className="font-mono text-[11px] text-emerald-400/90 leading-relaxed whitespace-pre-wrap">
                    {patronSeleccionado.promt}
                  </code>
                  <button
                    type="button"
                    onClick={usarPlantilla}
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300 hover:text-emerald-200 cursor-pointer"
                  >
                    <Wand2 size={12} />
                    Usar plantilla
                  </button>
                </div>
              )}
            </div>

            {/* AI Generation */}
            <div className="bg-gradient-to-r from-indigo-50/70 to-blue-50/70 dark:from-indigo-950/30 dark:to-blue-950/30 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800/40">
              <label htmlFor="req-ia" className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Sparkles size={14} className="text-indigo-600 dark:text-indigo-400" />
                Generar con IA
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="req-ia"
                  type="text"
                  placeholder="Describe la funcionalidad brevemente..."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="flex-1 px-3.5 py-2 bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800/60 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-900 dark:text-white placeholder:text-zinc-400"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAIGenerate();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleAIGenerate}
                  disabled={isAILoading || !aiPrompt.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {isAILoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {isAILoading ? 'Generando...' : 'Generar'}
                </button>
              </div>
              {patronSeleccionado && (
                <p className="text-[11px] text-indigo-600/80 dark:text-indigo-300/70 mt-1.5">
                  Se usará el patrón <strong>{patronSeleccionado.nombre}</strong>.
                </p>
              )}
            </div>

            {/* Enunciado */}
            <div>
              <label htmlFor="req-enunciado" className={etiqueta}>
                Enunciado del Requerimiento <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="req-enunciado"
                rows={4}
                placeholder={patronSeleccionado?.promt || "Escribe el enunciado siguiendo la estructura del patrón..."}
                value={formData.enunciado}
                onChange={(e) => setFormData({ ...formData, enunciado: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
                className={`${campo} font-mono leading-relaxed`}
              />
              <p className="text-[11px] text-zinc-400 mt-1">Ctrl + Enter para guardar.</p>
            </div>

            {/* Clasificación */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="req-tipo" className={etiqueta}>Tipo</label>
                <select
                  id="req-tipo"
                  value={formData.id_tipo_requerimiento}
                  onChange={(e) => setFormData({ ...formData, id_tipo_requerimiento: e.target.value })}
                  className={campo}
                >
                  <option value="">Sin tipo</option>
                  {tiposReq.map((t) => (
                    <option key={t.tipo_req} value={t.tipo_req}>{t.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="req-estado" className={etiqueta}>Estado</label>
                <select
                  id="req-estado"
                  value={formData.id_estado}
                  onChange={(e) => setFormData({ ...formData, id_estado: e.target.value })}
                  className={campo}
                >
                  <option value="">Sin estado</option>
                  {estados.map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre_estado}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="req-modalidad" className={etiqueta}>Modalidad</label>
                <select
                  id="req-modalidad"
                  value={formData.id_modalidad}
                  onChange={(e) => setFormData({ ...formData, id_modalidad: e.target.value })}
                  className={campo}
                >
                  <option value="">Sin modalidad</option>
                  {modalidades.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre_modalidad}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Responsables */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="req-autor" className={etiqueta}>Autor</label>
                <select
                  id="req-autor"
                  value={formData.id_autor}
                  onChange={(e) => setFormData({ ...formData, id_autor: e.target.value })}
                  className={campo}
                >
                  <option value="">Sin autor asignado</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre || u.correo}{u.id === uid ? ' (tú)' : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="req-aprobador" className={etiqueta}>Aprobador</label>
                <select
                  id="req-aprobador"
                  value={formData.id_aprobador}
                  onChange={(e) => setFormData({ ...formData, id_aprobador: e.target.value })}
                  className={campo}
                >
                  <option value="">Sin aprobador asignado</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre || u.correo}{u.id === uid ? ' (tú)' : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          </ModalBody>

          <ModalFooter>
            <button type="button" onClick={() => setIsModalOpen(false)} className={btnSecundario}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className={btnPrimario}>
              <Save size={14} />
              {saving ? 'Guardando...' : editingReq ? 'Guardar cambios' : 'Registrar Requerimiento'}
            </button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal Historial */}
      <Modal
        open={currentReqForLogs !== null}
        onClose={() => setCurrentReqForLogs(null)}
        title="Historial de Cambios"
        description="Quién modificó el requerimiento y cuándo."
        size="lg"
      >
        <ModalBody className="space-y-3">
          {currentReqForLogs && (
            <p className="font-mono text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-2 border-l-2 border-zinc-300 dark:border-zinc-700 pl-2">
              {currentReqForLogs.enunciado}
            </p>
          )}
          {loadingLogs ? (
            [1, 2].map(i => (
              <div key={i} className="h-14 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl animate-pulse" />
            ))
          ) : selectedReqLogs.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-6">No hay registros de cambios todavía.</p>
          ) : (
            <ol className="space-y-2">
              {selectedReqLogs.map((log) => {
                const autor = log.autor ? (log.autor.nombre || log.autor.correo) : nombreUsuario(log.id_autor);
                const campos: string[] = Array.isArray(log.detalles?.campos) ? log.detalles.campos : [];
                return (
                  <li key={log.id} className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 text-xs space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{log.accion}</span>
                      <time className="text-[10px] text-zinc-400 shrink-0" dateTime={log.fecha_hora}>
                        {new Date(log.fecha_hora).toLocaleString()}
                      </time>
                    </div>
                    {log.detalles?.estado_anterior !== undefined && log.detalles?.estado_nuevo && (
                      <p className="text-[11px] text-zinc-500 flex items-center gap-1">
                        {log.detalles.estado_anterior || 'Sin estado'}
                        <ArrowRight size={11} />
                        {log.detalles.estado_nuevo}
                      </p>
                    )}
                    {campos.length > 0 && (
                      <p className="text-[11px] text-zinc-500">Cambió: {campos.join(', ')}</p>
                    )}
                    {autor && (
                      <p className="text-[11px] text-zinc-500">
                        Por <strong className="text-zinc-700 dark:text-zinc-300">{autor}</strong>
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setCurrentReqForLogs(null)} className={btnSecundario}>
            Cerrar
          </button>
        </ModalFooter>
      </Modal>

      {/* Modal Equipos del Proyecto */}
      <Modal
        open={showEquiposModal}
        onClose={() => setShowEquiposModal(false)}
        title="Equipos del Proyecto"
        description={puedeGestionarVinculos
          ? 'Invita equipos a este proyecto. El vínculo se crea cuando el líder del equipo acepta.'
          : 'Equipos que trabajan en este proyecto. Solo el creador del proyecto invita equipos.'}
      >
        <ModalBody className="space-y-2">
          {equipos.length === 0 ? (
            <p className="text-zinc-500 text-xs text-center py-4">No hay equipos registrados todavía.</p>
          ) : (
            equiposOrdenados.map(eq => {
              const isAssigned = equiposAsignados.includes(eq.equipo_id);
              const pendiente = solicitudesEquiposPendientes.includes(eq.equipo_id);
              if (!puedeGestionarVinculos && !isAssigned) return null;
              return (
                <div key={eq.equipo_id} className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${isAssigned ? 'bg-blue-50/60 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-800/40' : 'bg-zinc-50/80 dark:bg-zinc-800/50 border-zinc-200/60 dark:border-zinc-700/60'}`}>
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs sm:text-sm">{eq.nombre}</p>
                    {eq.descripcion && <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{eq.descripcion}</p>}
                  </div>
                  {puedeGestionarVinculos && (
                    pendiente ? (
                      <span className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40">
                        Solicitud pendiente
                      </span>
                    ) : (
                      <button
                        onClick={() => solicitarVinculoEquipo(eq)}
                        title={isAssigned ? 'Pedir al líder del equipo que acepte desvincularse' : 'Invitar al líder del equipo a vincularse'}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${isAssigned ? 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-rose-600 hover:border-rose-300' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                      >
                        {isAssigned ? 'Solicitar desvinculación' : 'Invitar equipo'}
                      </button>
                    )
                  )}
                </div>
              );
            })
          )}
          {!puedeGestionarVinculos && equipos.length > 0 && equiposAsignados.length === 0 && (
            <p className="text-zinc-500 text-xs text-center py-4">Este proyecto aún no tiene equipos vinculados.</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Link href="/equipos-global/" className="mr-auto text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Gestionar equipos
          </Link>
          <button type="button" onClick={() => setShowEquiposModal(false)} className={btnSecundario}>
            Cerrar
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
