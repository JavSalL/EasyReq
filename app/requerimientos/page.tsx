'use client';

import React, { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { 
  ChevronLeft, Plus, Edit2, Trash2, Search, CheckCircle2, 
  User, Users, Clock, X, Save,
  Sparkles, CheckCheck, FileText,
  History, Lock
} from 'lucide-react';
import { generateSingleRequirement } from '@/lib/ai-actions';
import type { 
  Proyecto, Requerimiento, TipoRequerimiento, Estado, 
  Modalidad, Modelo, Patron, PerfilUsuario 
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
  linkEquipoToProyecto,
  unlinkEquipoFromProyecto,
  isUsuarioRelacionadoAProyecto
} from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';

export default function RequerimientosPage() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  // Lectura directa de window.location.search: con `output: 'export'` (sitio estático
  // en Firebase Hosting) no hay servidor que resuelva `searchParams` por request, así
  // que se lee la URL real del navegador en el cliente en vez de usar el hook de Next.
  const [proyectoId, setProyectoId] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setProyectoId(sp.get('id') || sp.get('proyectoId') || null);
  }, []);

  // States
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [requerimientos, setRequerimientos] = useState<Array<Requerimiento>>([]);
  const [loading, setLoading] = useState(true);

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
  const [formData, setFormData] = useState({
    enunciado: '',
    id_tipo_requerimiento: '',
    id_estado: '',
    id_modalidad: '',
    id_modelo: '',
    id_patron_seleccionado: '',
    id_autor: '',
    id_aprobador: ''
  });
  const [saving, setSaving] = useState(false);

  // Modal de Historial / Logs
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedReqLogs, setSelectedReqLogs] = useState<Array<any>>([]);
  const [currentReqForLogs, setCurrentReqForLogs] = useState<Requerimiento | null>(null);

  // Equipos asignados al proyecto
  const [equipos, setEquipos] = useState<Array<any>>([]);
  const [equiposAsignados, setEquiposAsignados] = useState<string[]>([]);
  const [showEquiposModal, setShowEquiposModal] = useState(false);

  // Control de acceso: lectura total; crear/editar requerimientos y
  // vincular equipos solo si el usuario está relacionado al proyecto
  // (miembro de un equipo vinculado).
  const [puedeEditar, setPuedeEditar] = useState(false);

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
      }
    };
    cargarPermiso();
    return () => { activo = false; };
  }, [uid, proyectoId]);

  // AI Generation State
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  // 1. Cargar datos del proyecto y catálogos
  const loadCatalogsAndProject = useCallback(async () => {
    if (!proyectoId) return;
    setLoading(true);

    try {
      const [found, trData, estData, modData, modelData, patData, userData] = await Promise.all([
        getProyectoById(proyectoId),
        getTiposRequerimientos(),
        getEstados(),
        getModalidades(),
        getModelos(),
        getPatrones(),
        getAllUsers()
      ]);

      if (!found) {
        toast.error('Proyecto no encontrado');
        router.push('/');
        return;
      }
      setProyecto(found);

      setTiposReq(trData);
      setEstados(estData);
      setModalidades(modData);
      setModelos(modelData);
      setPatrones(patData);
      setUsuarios(userData);
    } catch (e) {
      console.error(e);
      toast.error('Error al cargar datos del proyecto');
    } finally {
      setLoading(false);
    }
  }, [proyectoId, router]);

  // 2. Cargar lista de requerimientos
  const fetchRequerimientos = useCallback(async () => {
    if (!proyectoId) return;
    try {
      const data = await getRequerimientos(proyectoId);
      setRequerimientos(data);
    } catch (err) {
      console.error(err);
    }
  }, [proyectoId]);

  // 3. Cargar equipos
  const fetchEquipos = useCallback(async () => {
    if (!proyectoId) return;
    try {
      const [todos, pes] = await Promise.all([
        getEquipos(),
        getProyectoEquipos()
      ]);
      setEquipos(todos);
      const asignados = pes.filter(p => p.id_proyecto === proyectoId).map(p => p.id_equipo);
      setEquiposAsignados(asignados);
    } catch (err) {
      console.error(err);
    }
  }, [proyectoId]);

  useEffect(() => {
    loadCatalogsAndProject();
    fetchRequerimientos();
    fetchEquipos();
  }, [loadCatalogsAndProject, fetchRequerimientos, fetchEquipos]);

  // Filtrar patrones según el modelo seleccionado
  const patronesFiltrados = patrones.filter(p => p.id_modelo === formData.id_modelo);

  // Apertura de modal nuevo
  const openCreateModal = () => {
    if (!puedeEditar) {
      toast.error('Solo miembros de un equipo vinculado pueden crear requerimientos');
      return;
    }
    setEditingReq(null);
    const primerModelo = modelos[0]?.id || '';
    const primerPatron = patrones.find(p => p.id_modelo === primerModelo);

    setFormData({
      enunciado: '',
      id_tipo_requerimiento: tiposReq[0]?.tipo_req || '',
      id_estado: estados.find(e => e.nombre_estado === 'Borrador')?.id || estados[0]?.id || '',
      id_modalidad: modalidades[0]?.id || '',
      id_modelo: primerModelo,
      id_patron_seleccionado: primerPatron?.patron_id || '',
      id_autor: usuarios[0]?.id || '',
      id_aprobador: ''
    });
    setIsModalOpen(true);
  };

  // Apertura de modal editar
  const openEditModal = (req: Requerimiento) => {
    if (!puedeEditar) {
      toast.error('Solo miembros de un equipo vinculado pueden editar requerimientos');
      return;
    }
    setEditingReq(req);
    setFormData({
      enunciado: req.enunciado,
      id_tipo_requerimiento: req.id_tipo_requerimiento || '',
      id_estado: req.id_estado || '',
      id_modalidad: req.id_modalidad || '',
      id_modelo: req.id_modelo || '',
      id_patron_seleccionado: '',
      id_autor: req.id_autor || '',
      id_aprobador: req.id_aprobador || ''
    });
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

  const handlePatronChange = (nuevoPatronId: string) => {
    setFormData({
      ...formData,
      id_patron_seleccionado: nuevoPatronId
    });
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

    setSaving(true);
    try {
      if (editingReq) {
        // Actualizar
        await updateRequerimiento(editingReq.id, {
          enunciado: formData.enunciado.trim(),
          id_tipo_requerimiento: formData.id_tipo_requerimiento || null,
          id_estado: formData.id_estado || null,
          id_modalidad: formData.id_modalidad || null,
          id_modelo: formData.id_modelo || null,
          id_autor: formData.id_autor || null,
          id_aprobador: formData.id_aprobador || null
        });

        // Registrar log
        await addLogRequerimiento({
          id_requerimiento: editingReq.id,
          accion: 'Edición de requerimiento',
          id_autor: formData.id_autor || null,
          detalles: { cambio: 'Modificación de contenido o clasificación' }
        });

        toast.success('Requerimiento actualizado');
      } else {
        // Crear
        const newReq = await createRequerimiento({
          enunciado: formData.enunciado.trim(),
          id_proyecto: proyectoId!,
          id_tipo_requerimiento: formData.id_tipo_requerimiento || null,
          id_estado: formData.id_estado || null,
          id_modalidad: formData.id_modalidad || null,
          id_modelo: formData.id_modelo || null,
          id_autor: formData.id_autor || null,
          id_aprobador: formData.id_aprobador || null
        });

        if (newReq?.id) {
          await addLogRequerimiento({
            id_requerimiento: newReq.id,
            accion: 'Creación de requerimiento',
            id_autor: formData.id_autor || null,
            detalles: { inicio: 'Creación inicial' }
          });
        }

        toast.success('Requerimiento registrado');
      }

      setIsModalOpen(false);
      fetchRequerimientos();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Error al guardar requerimiento');
    } finally {
      setSaving(false);
    }
  };

  // AI Generate Requirement
  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Ingresa una descripción para generar el requerimiento");
      return;
    }
    
    setIsAILoading(true);
    try {
      const p = patrones.find(pat => pat.patron_id === formData.id_patron_seleccionado);
      const generated = await generateSingleRequirement(aiPrompt, p?.promt);
      if (generated && generated.name) {
        setFormData(prev => ({
          ...prev,
          enunciado: generated.name,
        }));
        toast.success("Requerimiento generado con IA");
        setAiPrompt('');
      } else {
        toast.error("La IA no pudo generar el requerimiento");
      }
    } catch (e) {
      toast.error("Error al conectar con Gemini");
    } finally {
      setIsAILoading(false);
    }
  };

  // Cambio rápido de estado (Aprobar, Rechazar, etc.)
  const handleQuickStatusChange = async (req: Requerimiento, nuevoEstadoNombre: string) => {
    if (!puedeEditar) {
      toast.error('Solo miembros de un equipo vinculado pueden cambiar el estado');
      return;
    }
    const targetEstado = estados.find(e => e.nombre_estado.toLowerCase() === nuevoEstadoNombre.toLowerCase());
    if (!targetEstado) return;

    try {
      const updateData: any = { id_estado: targetEstado.id };
      if (nuevoEstadoNombre.toLowerCase() === 'aprobado' && usuarios.length > 0) {
        updateData.id_aprobador = usuarios[0].id;
      }

      await updateRequerimiento(req.id, updateData);

      await addLogRequerimiento({
        id_requerimiento: req.id,
        accion: `Cambio de estado a ${targetEstado.nombre_estado}`,
        id_autor: req.id_autor || null,
        detalles: { estado_anterior: req.estado?.nombre_estado, estado_nuevo: targetEstado.nombre_estado }
      });

      toast.success(`Estado actualizado a ${targetEstado.nombre_estado}`);
      fetchRequerimientos();
    } catch (e: any) {
      toast.error('Error al cambiar estado');
    }
  };

  // Eliminar Requerimiento
  const handleDeleteReq = async (id: string) => {
    if (!puedeEditar) {
      toast.error('Solo miembros de un equipo vinculado pueden eliminar requerimientos');
      return;
    }
    if (!confirm('¿Estás seguro de eliminar este requerimiento?')) return;
    try {
      await deleteRequerimiento(id);
      toast.success('Requerimiento eliminado');
      fetchRequerimientos();
    } catch (e: any) {
      toast.error('Error al eliminar requerimiento');
    }
  };

  // Ver Logs del Requerimiento
  const handleViewLogs = async (req: Requerimiento) => {
    setCurrentReqForLogs(req);
    setShowLogsModal(true);
    const logs = await getLogsRequerimientos(req.id);
    setSelectedReqLogs(logs);
  };

  // Toggle asignar equipo al proyecto
  const toggleEquipoAsignado = async (equipoId: string) => {
    if (!proyectoId) return;
    if (!puedeEditar) {
      toast.error('Solo miembros de un equipo vinculado pueden vincular equipos');
      return;
    }
    const isAsignado = equiposAsignados.includes(equipoId);
    try {
      if (isAsignado) {
        await unlinkEquipoFromProyecto(proyectoId, equipoId);
        setEquiposAsignados(prev => prev.filter(id => id !== equipoId));
        toast.success('Equipo removido del proyecto');
      } else {
        await linkEquipoToProyecto(proyectoId, equipoId);
        setEquiposAsignados(prev => [...prev, equipoId]);
        toast.success('Equipo asignado al proyecto');
      }
    } catch (e) {
      toast.error('Error al actualizar equipos');
    }
  };

  // Filtrado de lista
  const filteredRequerimientos = requerimientos.filter((r) => {
    const matchSearch = r.enunciado.toLowerCase().includes(searchTerm.toLowerCase());
    const matchEstado = filterEstado === 'todos' || r.id_estado === filterEstado;
    const matchTipo = filterTipo === 'todos' || r.id_tipo_requerimiento === filterTipo;
    const matchModelo = filterModelo === 'todos' || r.id_modelo === filterModelo;
    return matchSearch && matchEstado && matchTipo && matchModelo;
  });

  const getBadgeColorEstado = (nombre?: string) => {
    const n = (nombre || '').toLowerCase();
    if (n.includes('aprobado')) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20';
    if (n.includes('rechazado')) return 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20';
    if (n.includes('revisión') || n.includes('revision')) return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
    if (n.includes('implementado')) return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20';
    return 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20';
  };

  if (!proyectoId) {
    return (
      <div className="p-8 text-center bg-white dark:bg-zinc-900/60 rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <p className="text-xs text-zinc-500">ID de proyecto no especificado.</p>
        <button onClick={() => router.push('/')} className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold">
          Volver a Proyectos
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Barra superior de navegación */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
        <div>
          <button 
            onClick={() => router.push('/')}
            className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors mb-2 group cursor-pointer"
          >
            <ChevronLeft size={14} className="mr-1 group-hover:-translate-x-0.5 transition-transform" />
            Volver a Proyectos
          </button>
          
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {proyecto?.nombre || 'Cargando proyecto...'}
            </h1>
            {proyecto?.tipos_sistema?.nombre && (
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/50">
                {proyecto.tipos_sistema.nombre}
              </span>
            )}
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">
            {proyecto?.descripcion || 'Sin descripción'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowEquiposModal(true)}
            className="inline-flex items-center px-3 py-2 bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 rounded-xl transition-all font-medium text-xs gap-1.5 cursor-pointer shadow-xs"
          >
            <Users size={15} className="text-zinc-500" />
            Equipos ({equiposAsignados.length})
          </button>

          {puedeEditar && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all font-medium text-xs gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus size={15} />
              Nuevo Requerimiento
            </button>
          )}
        </div>
      </div>

      {/* Aviso de solo lectura para no relacionados */}
      {!puedeEditar && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 rounded-2xl p-3.5 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
          <Lock size={15} className="shrink-0" />
          <span>Tienes acceso de lectura a este proyecto. Solo miembros de un equipo vinculado pueden crear o editar requerimientos y vincular equipos.</span>
        </div>
      )}

      {/* Barra de Búsqueda y Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* Input búsqueda */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
            <Search size={14} />
          </div>
          <input
            type="text"
            placeholder="Buscar enunciado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-zinc-900 dark:text-zinc-100"
          />
        </div>

        {/* Filtro Estado */}
        <div>
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-zinc-700 dark:text-zinc-300"
          >
            <option value="todos">Todos los Estados</option>
            {estados.map((e) => (
              <option key={e.id} value={e.id}>{e.nombre_estado}</option>
            ))}
          </select>
        </div>

        {/* Filtro Tipo */}
        <div>
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-zinc-700 dark:text-zinc-300"
          >
            <option value="todos">Todos los Tipos</option>
            {tiposReq.map((t) => (
              <option key={t.tipo_req} value={t.tipo_req}>{t.nombre}</option>
            ))}
          </select>
        </div>

        {/* Filtro Modelo */}
        <div>
          <select
            value={filterModelo}
            onChange={(e) => setFilterModelo(e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-zinc-700 dark:text-zinc-300"
          >
            <option value="todos">Todos los Modelos</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </div>
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
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No hay requerimientos</h3>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1 max-w-sm mx-auto">
            {searchTerm || filterEstado !== 'todos' ? 'No se encontraron requerimientos que coincidan con los filtros.' : 'Comienza redactando tu primer requerimiento usando las sintaxis de los modelos.'}
          </p>
          <button
            onClick={openCreateModal}
            disabled={!puedeEditar}
            title={puedeEditar ? 'Redactar un requerimiento' : 'Solo miembros de un equipo vinculado pueden redactar'}
            className="mt-4 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Redactar Requerimiento
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequerimientos.map((req) => (
            <div
              key={req.id}
              className="bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-150 flex flex-col md:flex-row md:items-start justify-between gap-4"
            >
              {/* Contenido Principal */}
              <div className="space-y-2.5 flex-1 min-w-0">
                {/* Badges de clasificación */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {/* Badge Estado con punto indicador */}
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium border ${getBadgeColorEstado(req.estado?.nombre_estado)}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {req.estado?.nombre_estado || 'Sin estado'}
                  </span>

                  {/* Badge Tipo */}
                  {req.tipo_requerimiento && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 font-medium border border-zinc-200/60 dark:border-zinc-700/50">
                      {req.tipo_requerimiento.nombre}
                    </span>
                  )}

                  {/* Badge Modelo */}
                  {req.modelo && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-medium border border-indigo-200/60 dark:border-indigo-800/40">
                      {req.modelo.nombre}
                    </span>
                  )}

                  {/* Badge Modalidad */}
                  {req.modalidad && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-medium border border-amber-200/60 dark:border-amber-800/40">
                      {req.modalidad.nombre_modalidad}
                    </span>
                  )}
                </div>

                {/* Enunciado con borde estilizado */}
                <div className="border-l-2 border-zinc-900 dark:border-zinc-100 pl-3 py-0.5">
                  <p className="text-zinc-900 dark:text-zinc-100 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                    {req.enunciado}
                  </p>
                </div>

                {/* Metadatos (Autor, Aprobador, Fecha) */}
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 pt-1">
                  {req.autor && (
                    <span className="flex items-center gap-1">
                      <User size={12} className="text-zinc-400" />
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
                    <span className="flex items-center gap-1">
                      <Clock size={12} className="text-zinc-400" />
                      {new Date(req.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Botones de Acción (solo relacionados al proyecto) */}
              {puedeEditar && (
              <div className="flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-zinc-100 dark:border-zinc-800">
                {/* Aprobación rápida */}
                {req.estado?.nombre_estado?.toLowerCase() !== 'aprobado' && (
                  <button
                    onClick={() => handleQuickStatusChange(req, 'Aprobado')}
                    title="Aprobar Requerimiento"
                    className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-400 hover:text-emerald-600 rounded-xl transition-colors cursor-pointer"
                  >
                    <CheckCircle2 size={18} />
                  </button>
                )}

                {/* Ver Historial */}
                <button
                  onClick={() => handleViewLogs(req)}
                  title="Ver Historial de Cambios"
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl transition-colors cursor-pointer"
                >
                  <History size={18} />
                </button>

                {/* Editar */}
                <button
                  onClick={() => openEditModal(req)}
                  title="Editar Requerimiento"
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600 rounded-xl transition-colors cursor-pointer"
                >
                  <Edit2 size={18} />
                </button>

                {/* Eliminar */}
                <button
                  onClick={() => handleDeleteReq(req.id)}
                  title="Eliminar Requerimiento"
                  className="p-2 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-zinc-400 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                >
                  <Trash2 size={18} />
                </button>
              </div>
              )}
              {!puedeEditar && (
              <div className="flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-zinc-100 dark:border-zinc-800">
                {/* Ver Historial (lectura) */}
                <button
                  onClick={() => handleViewLogs(req)}
                  title="Ver Historial de Cambios"
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl transition-colors cursor-pointer"
                >
                  <History size={18} />
                </button>
              </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Redactar / Editar Requerimiento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-3xl max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between shrink-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
                  {editingReq ? 'Editar Requerimiento' : 'Nuevo Requerimiento'}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Selecciona el Modelo de Especificación y redacta respetando la estructura sintáctica.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSaveReq} className="flex flex-col flex-1 min-h-0">
              <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
                {/* Selector de Modelo y Patrón */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50/80 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-200/60 dark:border-zinc-700/50">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                      Modelo de Requisitos
                    </label>
                    <select
                      value={formData.id_modelo}
                      onChange={(e) => handleModeloChange(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-white"
                    >
                      <option value="">Selecciona un modelo...</option>
                      {modelos.map((m) => (
                        <option key={m.id} value={m.id}>{m.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                      Patrón Específico (Plantilla)
                    </label>
                    <select
                      value={formData.id_patron_seleccionado}
                      onChange={(e) => handlePatronChange(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-white"
                    >
                      <option value="">Selecciona un patrón...</option>
                      {patronesFiltrados.map((p) => (
                        <option key={p.patron_id} value={p.patron_id}>{p.nombre}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* AI Generation */}
                <div className="bg-gradient-to-r from-indigo-50/70 to-blue-50/70 dark:from-indigo-950/30 dark:to-blue-950/30 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800/40">
                  <label className="block text-[11px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-600 dark:text-indigo-400" />
                    Generar con IA (Gemini)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
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
                      disabled={isAILoading}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      {isAILoading ? 'Generando...' : 'Generar'}
                    </button>
                  </div>
                </div>

                {/* Enunciado Textarea */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2">
                    Enunciado del Requerimiento
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder={patrones.find(p => p.patron_id === formData.id_patron_seleccionado)?.promt || "Escribe el enunciado aquí siguiendo la estructura sintáctica..."}
                    value={formData.enunciado}
                    onChange={(e) => setFormData({ ...formData, enunciado: e.target.value })}
                    className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-mono text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                  />
                </div>

                {/* Clasificación (Tipo, Estado, Modalidad) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Tipo Requerimiento
                    </label>
                    <select
                      value={formData.id_tipo_requerimiento}
                      onChange={(e) => setFormData({ ...formData, id_tipo_requerimiento: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Seleccionar...</option>
                      {tiposReq.map((t) => (
                        <option key={t.tipo_req} value={t.tipo_req}>{t.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Estado
                    </label>
                    <select
                      value={formData.id_estado}
                      onChange={(e) => setFormData({ ...formData, id_estado: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Seleccionar...</option>
                      {estados.map((e) => (
                        <option key={e.id} value={e.id}>{e.nombre_estado}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Modalidad
                    </label>
                    <select
                      value={formData.id_modalidad}
                      onChange={(e) => setFormData({ ...formData, id_modalidad: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Seleccionar...</option>
                      {modalidades.map((m) => (
                        <option key={m.id} value={m.id}>{m.nombre_modalidad}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Responsables (Autor y Aprobador) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Autor
                    </label>
                    <select
                      value={formData.id_autor}
                      onChange={(e) => setFormData({ ...formData, id_autor: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Sin autor asignado</option>
                      {usuarios.map((u) => (
                        <option key={u.id} value={u.id}>{u.nombre || u.correo}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">
                      Aprobador
                    </label>
                    <select
                      value={formData.id_aprobador}
                      onChange={(e) => setFormData({ ...formData, id_aprobador: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Sin aprobador asignado</option>
                      {usuarios.map((u) => (
                        <option key={u.id} value={u.id}>{u.nombre || u.correo}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Fixed Footer */}
              <div className="p-4 sm:p-5 border-t border-zinc-100 dark:border-zinc-800/80 shrink-0 flex items-center justify-end gap-3 bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  <Save size={15} className="mr-1.5" />
                  {saving ? 'Guardando...' : editingReq ? 'Actualizar' : 'Registrar Requerimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial / Logs */}
      {showLogsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-3xl max-w-lg w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between shrink-0 bg-white/80 dark:bg-zinc-900/80">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  Historial de Cambios
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Trazabilidad y auditoría de modificaciones
                </p>
              </div>
              <button
                onClick={() => setShowLogsModal(false)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1 custom-scrollbar">
              {selectedReqLogs.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-6">No hay registros de cambios todavía.</p>
              ) : (
                selectedReqLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{log.accion}</span>
                      <span className="text-[10px] text-zinc-400">
                        {new Date(log.fecha_hora).toLocaleString()}
                      </span>
                    </div>
                    {log.autor && (
                      <p className="text-[11px] text-zinc-500">
                        Realizado por: <strong className="text-zinc-700 dark:text-zinc-300">{log.autor.nombre || log.autor.correo}</strong>
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-3 border-t border-zinc-100 dark:border-zinc-800/80 shrink-0 text-right bg-zinc-50/80 dark:bg-zinc-900/80">
              <button
                onClick={() => setShowLogsModal(false)}
                className="px-4 py-2 text-xs font-semibold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Equipos Asignados */}
      {showEquiposModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-3xl max-w-md w-full shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between shrink-0 bg-white/80 dark:bg-zinc-900/80">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                Equipos del Proyecto
              </h3>
              <button onClick={() => setShowEquiposModal(false)} className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto space-y-2 flex-1 custom-scrollbar">
              {equipos.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-4">No hay equipos registrados en el sistema.</p>
              ) : (
                equipos.map(eq => {
                  const isAssigned = equiposAsignados.includes(eq.equipo_id);
                  return (
                    <div key={eq.equipo_id} className="flex items-center justify-between p-3 bg-zinc-50/80 dark:bg-zinc-800/50 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60">
                      <div>
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs sm:text-sm">{eq.nombre}</p>
                        {eq.descripcion && <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[200px]">{eq.descripcion}</p>}
                      </div>
                      <button
                        onClick={() => toggleEquipoAsignado(eq.equipo_id)}
                        disabled={!puedeEditar}
                        title={puedeEditar ? (isAssigned ? 'Remover equipo del proyecto' : 'Asignar equipo al proyecto') : 'Solo miembros de un equipo vinculado pueden modificar asignaciones'}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isAssigned ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'}`}
                      >
                        {isAssigned ? 'Remover' : 'Asignar'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-6 py-3 border-t border-zinc-100 dark:border-zinc-800/80 shrink-0 text-right bg-zinc-50/80 dark:bg-zinc-900/80">
              <button
                onClick={() => setShowEquiposModal(false)}
                className="px-4 py-2 text-xs font-semibold bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
