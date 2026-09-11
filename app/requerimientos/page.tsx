'use client';

import React, { use, useEffect, useState, useCallback } from "react";
import { supabase } from '@/lib/supabase-client';
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { 
  ChevronLeft, Plus, Edit2, Trash2, Search, CheckCircle2, 
  AlertCircle, ArrowRight, User, Users, Clock, X, Check, Save,
  Layers, Sparkles, BookOpen, Filter, Tag, CheckCheck, XCircle, FileText,
  HelpCircle, Eye, History, ArrowUpRight
} from 'lucide-react';
import { generateSingleRequirement, evaluateRequirement, type AIRequirement } from '@/lib/ai-actions';
import type { 
  Proyecto, Requerimiento, TipoRequerimiento, Estado, 
  Modalidad, Modelo, Patron, PerfilUsuario 
} from '@/lib/database.types';

export default function RequerimientosPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ proyectoId?: string }> 
}) {
  const params = use(searchParams);
  const router = useRouter();
  const proyectoId = params.proyectoId || null;

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

  // AI Generation State
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  // 1. Cargar datos del proyecto y catálogos
  const loadCatalogsAndProject = useCallback(async () => {
    if (!proyectoId) return;
    setLoading(true);

    try {
      // Proyecto
      const { data: projData, error: projErr } = await supabase
        .from('proyecto')
        .select(`*, tipos_sistema(id, nombre)`)
        .eq('proyecto_id', proyectoId)
        .single();

      if (projErr || !projData) {
        toast.error('Proyecto no encontrado');
        router.push('/');
        return;
      }
      setProyecto(projData);

      // Cargar catálogos en paralelo
      const [
        { data: trData },
        { data: estData },
        { data: modData },
        { data: modelData },
        { data: patData },
        { data: userData }
      ] = await Promise.all([
        supabase.from('tipos_requerimientos').select('*').order('nombre'),
        supabase.from('estados').select('*').order('nombre_estado'),
        supabase.from('modalidades').select('*').order('nombre_modalidad'),
        supabase.from('modelo').select('*').order('nombre'),
        supabase.from('patron').select('*').order('nombre'),
        supabase.from('perfil_usuario').select('*').order('nombre')
      ]);

      setTiposReq(trData || []);
      setEstados(estData || []);
      setModalidades(modData || []);
      setModelos(modelData || []);
      setPatrones(patData || []);
      setUsuarios(userData || []);

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
      const { data, error } = await supabase
        .from('requerimiento')
        .select(`
          *,
          tipo_requerimiento:tipos_requerimientos(tipo_req, nombre),
          estado:estados(id, nombre_estado),
          modalidad:modalidades(id, nombre_modalidad),
          modelo:modelo(id, nombre),
          autor:perfil_usuario!requerimiento_id_autor_fkey(id, nombre, correo),
          aprobador:perfil_usuario!requerimiento_id_aprobador_fkey(id, nombre, correo)
        `)
        .eq('id_proyecto', proyectoId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        toast.error('Error al cargar requerimientos');
      } else {
        setRequerimientos(data || []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [proyectoId]);

  // 3. Cargar equipos
  const fetchEquipos = useCallback(async () => {
    if (!proyectoId) return;
    try {
      const { data: todos } = await supabase.from('equipo').select('*').order('nombre');
      const { data: asignados } = await supabase.from('proyecto_equipos').select('id_equipo').eq('id_proyecto', proyectoId);
      setEquipos(todos || []);
      setEquiposAsignados((asignados || []).map(a => a.id_equipo));
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

  // Al cambiar de modelo en el modal, preseleccionar su primer patrón
  const handleModeloChange = (nuevoModeloId: string) => {
    const primerP = patrones.find(p => p.id_modelo === nuevoModeloId);
    setFormData({
      ...formData,
      id_modelo: nuevoModeloId,
      id_patron_seleccionado: primerP?.patron_id || ''
    });
  };

  // Al cambiar de patrón, cargar su estructura en el textarea
  const handlePatronChange = (nuevoPatronId: string) => {
    const pat = patrones.find(p => p.patron_id === nuevoPatronId);
    setFormData({
      ...formData,
      id_patron_seleccionado: nuevoPatronId
    });
  };

  // Guardar Requerimiento (Crear o Editar)
  const handleSaveReq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.enunciado.trim()) {
      toast.error('El enunciado del requerimiento es obligatorio');
      return;
    }

    setSaving(true);
    try {
      if (editingReq) {
        // Actualizar
        const { error } = await supabase
          .from('requerimiento')
          .update({
            enunciado: formData.enunciado.trim(),
            id_tipo_requerimiento: formData.id_tipo_requerimiento || null,
            id_estado: formData.id_estado || null,
            id_modalidad: formData.id_modalidad || null,
            id_modelo: formData.id_modelo || null,
            id_autor: formData.id_autor || null,
            id_aprobador: formData.id_aprobador || null
          })
          .eq('id', editingReq.id);

        if (error) throw error;

        // Registrar log
        await supabase.from('logs_requerimientos').insert([{
          id_requerimiento: editingReq.id,
          accion: 'Edición de requerimiento',
          id_autor: formData.id_autor || null,
          detalles: { cambio: 'Modificación de contenido o clasificación' }
        }]);

        toast.success('Requerimiento actualizado');
      } else {
        // Crear
        const { data: newReq, error } = await supabase
          .from('requerimiento')
          .insert([{
            enunciado: formData.enunciado.trim(),
            id_proyecto: proyectoId,
            id_tipo_requerimiento: formData.id_tipo_requerimiento || null,
            id_estado: formData.id_estado || null,
            id_modalidad: formData.id_modalidad || null,
            id_modelo: formData.id_modelo || null,
            id_autor: formData.id_autor || null,
            id_aprobador: formData.id_aprobador || null
          }])
          .select()
          .single();

        if (error) throw error;

        // Registrar log inicial
        if (newReq) {
          await supabase.from('logs_requerimientos').insert([{
            id_requerimiento: newReq.id,
            accion: 'Creación de requerimiento',
            id_autor: formData.id_autor || null,
            detalles: { inicio: 'Creación inicial' }
          }]);
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
    const targetEstado = estados.find(e => e.nombre_estado.toLowerCase() === nuevoEstadoNombre.toLowerCase());
    if (!targetEstado) return;

    try {
      const updateData: any = { id_estado: targetEstado.id };
      if (nuevoEstadoNombre.toLowerCase() === 'aprobado' && usuarios.length > 0) {
        updateData.id_aprobador = usuarios[0].id;
      }

      const { error } = await supabase
        .from('requerimiento')
        .update(updateData)
        .eq('id', req.id);

      if (error) throw error;

      await supabase.from('logs_requerimientos').insert([{
        id_requerimiento: req.id,
        accion: `Cambio de estado a ${targetEstado.nombre_estado}`,
        id_autor: req.id_autor,
        detalles: { estado_anterior: req.estado?.nombre_estado, estado_nuevo: targetEstado.nombre_estado }
      }]);

      toast.success(`Estado actualizado a ${targetEstado.nombre_estado}`);
      fetchRequerimientos();
    } catch (e: any) {
      toast.error('Error al cambiar estado');
    }
  };

  // Eliminar Requerimiento
  const handleDeleteReq = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este requerimiento?')) return;
    try {
      const { error } = await supabase
        .from('requerimiento')
        .delete()
        .eq('id', id);

      if (error) throw error;
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
    const { data } = await supabase
      .from('logs_requerimientos')
      .select(`
        *,
        autor:perfil_usuario!logs_requerimientos_id_autor_fkey(nombre, correo)
      `)
      .eq('id_requerimiento', req.id)
      .order('fecha_hora', { ascending: false });

    setSelectedReqLogs(data || []);
  };

  // Toggle asignar equipo al proyecto
  const toggleEquipoAsignado = async (equipoId: string) => {
    const isAsignado = equiposAsignados.includes(equipoId);
    try {
      if (isAsignado) {
        await supabase.from('proyecto_equipos').delete().eq('id_proyecto', proyectoId).eq('id_equipo', equipoId);
        setEquiposAsignados(prev => prev.filter(id => id !== equipoId));
        toast.success('Equipo removido del proyecto');
      } else {
        await supabase.from('proyecto_equipos').insert([{ id_proyecto: proyectoId, id_equipo: equipoId }]);
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
    if (n.includes('aprobado')) return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800';
    if (n.includes('rechazado')) return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800';
    if (n.includes('revisión') || n.includes('revision')) return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800';
    if (n.includes('implementado')) return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800';
    return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
  };

  if (!proyectoId) {
    return (
      <div className="p-8 text-center">
        <p className="text-zinc-500">ID de proyecto no especificado.</p>
        <button onClick={() => router.push('/')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl">
          Volver a Proyectos
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Barra superior de navegación */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div>
          <button 
            onClick={() => router.push('/')}
            className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-2 group"
          >
            <ChevronLeft size={16} className="mr-1 group-hover:-translate-x-0.5 transition-transform" />
            Volver a Proyectos
          </button>
          
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">
              {proyecto?.nombre || 'Cargando proyecto...'}
            </h1>
            {proyecto?.tipos_sistema?.nombre && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50">
                {proyecto.tipos_sistema.nombre}
              </span>
            )}
          </div>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
            {proyecto?.descripcion || 'Sin descripción'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowEquiposModal(true)}
            className="inline-flex items-center px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl transition-all shadow-sm font-medium text-sm"
          >
            <Users size={18} className="mr-2 text-indigo-500" />
            Equipos ({equiposAsignados.length})
          </button>

          <button
            onClick={openCreateModal}
            className="inline-flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-md shadow-blue-500/20 font-medium text-sm"
          >
            <Plus size={18} className="mr-2" />
            Nuevo Requerimiento
          </button>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Input búsqueda */}
        <div className="md:col-span-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search size={16} className="text-zinc-400" />
          </div>
          <input
            type="text"
            placeholder="Buscar enunciado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-white"
          />
        </div>

        {/* Filtro Estado */}
        <div>
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="w-full px-3 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-700 dark:text-zinc-300"
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
            className="w-full px-3 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-700 dark:text-zinc-300"
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
            className="w-full px-3 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-700 dark:text-zinc-300"
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
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredRequerimientos.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <FileText size={26} />
          </div>
          <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">No hay requerimientos</h3>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1 max-w-sm mx-auto">
            {searchTerm || filterEstado !== 'todos' ? 'No se encontraron requerimientos que coincidan con los filtros.' : 'Comienza redactando tu primer requerimiento usando las sintaxis de los modelos.'}
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all"
          >
            Redactar Requerimiento
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRequerimientos.map((req) => (
            <div
              key={req.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              {/* Contenido Principal */}
              <div className="space-y-3 flex-1 min-w-0">
                {/* Badges de clasificación */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {/* Badge Estado */}
                  <span className={`px-2.5 py-0.5 rounded-md font-semibold border ${getBadgeColorEstado(req.estado?.nombre_estado)}`}>
                    {req.estado?.nombre_estado || 'Sin estado'}
                  </span>

                  {/* Badge Tipo */}
                  {req.tipo_requerimiento && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
                      {req.tipo_requerimiento.nombre}
                    </span>
                  )}

                  {/* Badge Modelo */}
                  {req.modelo && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 font-medium border border-indigo-200 dark:border-indigo-800/60">
                      {req.modelo.nombre}
                    </span>
                  )}

                  {/* Badge Modalidad */}
                  {req.modalidad && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 font-medium border border-amber-200 dark:border-amber-800/60">
                      {req.modalidad.nombre_modalidad}
                    </span>
                  )}
                </div>

                {/* Enunciado */}
                <p className="text-zinc-900 dark:text-white font-mono text-sm leading-relaxed whitespace-pre-wrap">
                  {req.enunciado}
                </p>

                {/* Metadatos (Autor, Aprobador, Fecha) */}
                <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400 pt-1">
                  {req.autor && (
                    <span className="flex items-center gap-1">
                      <User size={13} className="text-zinc-400" />
                      Autor: <strong className="text-zinc-700 dark:text-zinc-300">{req.autor.nombre}</strong>
                    </span>
                  )}
                  {req.aprobador && (
                    <span className="flex items-center gap-1">
                      <CheckCheck size={13} className="text-emerald-500" />
                      Aprobado por: <strong className="text-zinc-700 dark:text-zinc-300">{req.aprobador.nombre}</strong>
                    </span>
                  )}
                  {req.created_at && (
                    <span className="flex items-center gap-1">
                      <Clock size={13} className="text-zinc-400" />
                      {new Date(req.created_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-zinc-100 dark:border-zinc-800">
                {/* Aprobación rápida */}
                {req.estado?.nombre_estado?.toLowerCase() !== 'aprobado' && (
                  <button
                    onClick={() => handleQuickStatusChange(req, 'Aprobado')}
                    title="Aprobar Requerimiento"
                    className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-zinc-400 hover:text-emerald-600 rounded-xl transition-colors"
                  >
                    <CheckCircle2 size={18} />
                  </button>
                )}

                {/* Ver Historial */}
                <button
                  onClick={() => handleViewLogs(req)}
                  title="Ver Historial de Cambios"
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-xl transition-colors"
                >
                  <History size={18} />
                </button>

                {/* Editar */}
                <button
                  onClick={() => openEditModal(req)}
                  title="Editar Requerimiento"
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600 rounded-xl transition-colors"
                >
                  <Edit2 size={18} />
                </button>

                {/* Eliminar */}
                <button
                  onClick={() => handleDeleteReq(req.id)}
                  title="Eliminar Requerimiento"
                  className="p-2 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-zinc-400 hover:text-rose-600 rounded-xl transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Redactar / Editar Requerimiento */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                  {editingReq ? 'Editar Requerimiento' : 'Nuevo Requerimiento'}
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Selecciona el Modelo de Especificación y redacta respetando la estructura sintáctica.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveReq} className="space-y-4">
              {/* Selector de Modelo y Patrón */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-700/60">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                    Modelo de Requisitos
                  </label>
                  <select
                    value={formData.id_modelo}
                    onChange={(e) => handleModeloChange(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-white"
                  >
                    <option value="">Selecciona un modelo...</option>
                    {modelos.map((m) => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                    Patrón Específico (Plantilla)
                  </label>
                  <select
                    value={formData.id_patron_seleccionado}
                    onChange={(e) => handlePatronChange(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-white"
                  >
                    <option value="">Selecciona un patrón...</option>
                    {patronesFiltrados.map((p) => (
                      <option key={p.patron_id} value={p.patron_id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* AI Generation */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                <label className="block text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles size={14} />
                  Generar con IA
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Describe el requerimiento brevemente..."
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="flex-1 px-3 py-2 bg-white dark:bg-zinc-900 border border-indigo-200 dark:border-indigo-800/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-900 dark:text-white placeholder:text-zinc-400"
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
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isAILoading ? 'Generando...' : 'Generar'}
                  </button>
                </div>
              </div>

              {/* Enunciado Textarea */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
                  Enunciado del Requerimiento
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder={patrones.find(p => p.patron_id === formData.id_patron_seleccionado)?.promt || "Escribe el enunciado aquí siguiendo la estructura sintáctica..."}
                  value={formData.enunciado}
                  onChange={(e) => setFormData({ ...formData, enunciado: e.target.value })}
                  className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                />
              </div>

              {/* Clasificación (Tipo, Estado, Modalidad) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
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
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
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
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Autor
                  </label>
                  <select
                    value={formData.id_autor}
                    onChange={(e) => setFormData({ ...formData, id_autor: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sin autor asignado</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>{u.correo}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                    Aprobador
                  </label>
                  <select
                    value={formData.id_aprobador}
                    onChange={(e) => setFormData({ ...formData, id_aprobador: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sin aprobador asignado</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>{u.correo}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Botones modal */}
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
                  {saving ? 'Guardando...' : editingReq ? 'Actualizar' : 'Registrar Requerimiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial / Logs */}
      {showLogsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
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
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
              {selectedReqLogs.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-6">No hay registros de cambios todavía.</p>
              ) : (
                selectedReqLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700/60 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">{log.accion}</span>
                      <span className="text-[10px] text-zinc-400">
                        {new Date(log.fecha_hora).toLocaleString()}
                      </span>
                    </div>
                    {log.autor && (
                      <p className="text-[11px] text-zinc-500">
                        Realizado por: <strong className="text-zinc-700 dark:text-zinc-300">{log.autor.nombre}</strong>
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="text-right pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setShowLogsModal(false)}
                className="px-4 py-2 text-sm font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl hover:bg-zinc-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Equipos Asignados */}
      {showEquiposModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                Equipos del Proyecto
              </h3>
              <button onClick={() => setShowEquiposModal(false)} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                <X size={18} />
              </button>
            </div>
            
            <div className="max-h-80 overflow-y-auto space-y-2">
              {equipos.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-4">No hay equipos registrados en el sistema.</p>
              ) : (
                equipos.map(eq => {
                  const isAssigned = equiposAsignados.includes(eq.equipo_id);
                  return (
                    <div key={eq.equipo_id} className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700">
                      <div>
                        <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">{eq.nombre}</p>
                        {eq.descripcion && <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[200px]">{eq.descripcion}</p>}
                      </div>
                      <button
                        onClick={() => toggleEquipoAsignado(eq.equipo_id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isAssigned ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:hover:bg-rose-900/50' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'}`}
                      >
                        {isAssigned ? 'Remover' : 'Asignar'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="text-right pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setShowEquiposModal(false)}
                className="px-4 py-2 text-sm font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl hover:bg-zinc-200"
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
