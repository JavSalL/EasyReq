'use client';

import React, { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Plus, Edit2, Trash2, Search, User, Users, Clock, Save,
  Sparkles, CheckCheck, History, Lock, Wand2, ArrowRight, Copy, ListPlus, ListOrdered
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
  insertarRequerimientoDespuesDe,
  asignarNumerosRequerimientos,
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
  btnPrimario, btnSecundario, btnIcono, btnIconoPeligro, buscador, campo, etiqueta
} from '@/components/ui/estilos';
import PageHeader from '@/components/ui/PageHeader';
import { useCierreSeguro } from '@/lib/use-cierre-seguro';
import { useEstadoSesion } from '@/lib/use-estado-sesion';
import { fechaCompleta, fechaRelativa } from '@/lib/fechas';
import { codigoDe, codigoRequerimiento, numeroDesdeBusqueda } from '@/lib/requerimientos';

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

type Orden = 'recientes' | 'antiguos' | 'estado' | 'numero';
type Agrupar = 'ninguno' | 'tipo' | 'modelo';

const FILTROS_INICIALES = {
  q: '',
  estado: 'todos',
  tipo: 'todos',
  modelo: 'todos',
  orden: 'numero' as Orden,
  agrupar: 'ninguno' as Agrupar
};

const getBadgeColorEstado = (nombre?: string) => {
  const n = (nombre || '').toLowerCase();
  if (n.includes('aprobado')) return 'bg-success-subtle text-success border-success-line';
  if (n.includes('rechazado')) return 'bg-danger-subtle text-danger border-danger-line';
  if (n.includes('revisión') || n.includes('revision')) return 'bg-warning-subtle text-warning border-warning-line';
  if (n.includes('implementado')) return 'bg-brand-subtle text-brand-text border-brand-line';
  return 'bg-sunken text-ink-muted border-line';
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
  // Se recuerdan por proyecto mientras dure la sesión del navegador
  const [filtros, setFiltros] = useEstadoSesion(proyectoId ? `easyreq:req:v2:${proyectoId}` : null, FILTROS_INICIALES);
  const { q: searchTerm, estado: filterEstado, tipo: filterTipo, modelo: filterModelo, orden } = filtros;
  const setSearchTerm = (q: string) => setFiltros(f => ({ ...f, q }));
  const setFilterEstado = (estado: string) => setFiltros(f => ({ ...f, estado }));
  const setFilterTipo = (tipo: string) => setFiltros(f => ({ ...f, tipo }));
  const setFilterModelo = (modelo: string) => setFiltros(f => ({ ...f, modelo }));
  const setOrden = (nuevo: Orden) => setFiltros(f => ({ ...f, orden: nuevo }));
  // Los filtros guardados antes de existir "agrupar" no lo traen
  const agrupar: Agrupar = filtros.agrupar ?? 'ninguno';
  const setAgrupar = (nuevo: Agrupar) => setFiltros(f => ({ ...f, agrupar: nuevo }));

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

  // Al registrar varios requerimientos seguidos: "guardar y añadir otro" y
  // recordar la clasificación del último para no volver a elegirla.
  const crearOtroRef = useRef(false);
  // Si no es null, el requerimiento nuevo se inserta justo después de este y los siguientes suben un número
  const [insertarDespuesDe, setInsertarDespuesDe] = useState<{ numero: number; codigo: string } | null>(null);
  const ultimaClasificacionRef = useRef<Partial<typeof FORM_VACIO> | null>(null);

  // Cambios sin guardar: el enunciado, el texto de la IA y, al editar, el resto de campos
  const { hayCambios, intentarCerrar } = useCierreSeguro(
    isModalOpen,
    {
      enunciado: formData.enunciado,
      ia: aiPrompt,
      resto: editingReq
        ? [formData.id_tipo_requerimiento, formData.id_estado, formData.id_modalidad, formData.id_modelo, formData.id_autor, formData.id_aprobador]
        : null
    },
    () => setIsModalOpen(false)
  );

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

  // Los requerimientos anteriores a los identificadores reciben su número (en orden de creación).
  // Lo inicia cualquier sesión que abra el proyecto, también las de solo lectura: es una
  // asignación mecánica (solo escribe `numero` y `codigo`) y es segura si dos sesiones coinciden.
  const numerandoRef = useRef(false);
  const numeracionFallidaRef = useRef(false);
  useEffect(() => {
    if (loading || !proyectoId || numerandoRef.current || numeracionFallidaRef.current) return;
    const pendientes = requerimientos.filter(r => r.numero == null || !r.codigo);
    if (pendientes.length === 0) return;
    numerandoRef.current = true;
    asignarNumerosRequerimientos(proyectoId, pendientes)
      .then(fetchRequerimientos)
      .catch(e => {
        console.error('No se pudieron numerar los requerimientos:', e);
        numeracionFallidaRef.current = true;
        toast.error('No se pudieron asignar los identificadores de los requerimientos. Recarga la página para reintentar.');
      })
      .finally(() => {
        numerandoRef.current = false;
      });
  }, [loading, proyectoId, requerimientos, fetchRequerimientos]);

  // Filtrar patrones según el modelo seleccionado
  const patronesFiltrados = patrones.filter(p => p.id_modelo === formData.id_modelo);
  const patronSeleccionado = patrones.find(p => p.patron_id === formData.id_patron_seleccionado);
  const nombreUsuario = (id: string | null | undefined) => {
    const u = usuarios.find(x => x.id === id);
    return u ? (u.nombre || u.correo) : null;
  };

  const copiarCodigo = async (codigo: string) => {
    try {
      await navigator.clipboard.writeText(codigo);
      toast.success(`${codigo} copiado`);
    } catch {
      toast.error('No se pudo copiar el identificador.');
    }
  };

  const copiarEnunciado = async (req: Requerimiento) => {
    try {
      await navigator.clipboard.writeText(req.enunciado);
      toast.success('Enunciado copiado');
    } catch {
      toast.error('No se pudo copiar. Selecciona el texto y cópialo manualmente.');
    }
  };

  // Apertura de modal nuevo
  const abrirNuevo = (despuesDe: Requerimiento | null) => {
    if (!puedeEditar) {
      toast.error('Solo el creador o miembros de un equipo vinculado pueden crear requerimientos');
      return;
    }
    setEditingReq(null);
    const codigoBase = despuesDe ? codigoDe(despuesDe) : null;
    setInsertarDespuesDe(despuesDe && codigoBase && despuesDe.numero != null ? { numero: despuesDe.numero, codigo: codigoBase } : null);
    const primerModelo = modelos[0]?.id || '';
    const primerPatron = patrones.find(p => p.id_modelo === primerModelo);

    const previa = ultimaClasificacionRef.current;
    const sigueExistiendo = (lista: Array<string>, id?: string) => !!id && lista.includes(id);
    const modeloInicial = sigueExistiendo(modelos.map(m => m.id), previa?.id_modelo) ? previa!.id_modelo! : primerModelo;
    const patronPrevio = patrones.find(p => p.patron_id === previa?.id_patron_seleccionado && p.id_modelo === modeloInicial);
    const patronInicial = patronPrevio ?? patrones.find(p => p.id_modelo === modeloInicial) ?? primerPatron;

    setFormData({
      ...FORM_VACIO,
      id_tipo_requerimiento: sigueExistiendo(tiposReq.map(t => t.tipo_req), previa?.id_tipo_requerimiento)
        ? previa!.id_tipo_requerimiento!
        : tiposReq[0]?.tipo_req || '',
      id_estado: estados.find(e => e.nombre_estado === 'Borrador')?.id || estados[0]?.id || '',
      id_modalidad: sigueExistiendo(modalidades.map(m => m.id), previa?.id_modalidad)
        ? previa!.id_modalidad!
        : modalidades[0]?.id || '',
      id_modelo: modeloInicial,
      id_patron_seleccionado: patronInicial?.patron_id || '',
      // Por defecto el autor es quien lo redacta
      id_autor: usuarios.some(u => u.id === uid) ? uid! : '',
      id_aprobador: sigueExistiendo(usuarios.map(u => u.id), previa?.id_aprobador) ? previa!.id_aprobador! : ''
    });
    setAiPrompt('');
    setIsModalOpen(true);
  };

  const openCreateModal = () => abrirNuevo(null);
  const openInsertModal = (req: Requerimiento) => abrirNuevo(req);

  // Apertura de modal editar
  const openEditModal = (req: Requerimiento) => {
    if (!puedeEditar) {
      toast.error('Solo el creador o miembros de un equipo vinculado pueden editar requerimientos');
      return;
    }
    setEditingReq(req);
    setInsertarDespuesDe(null);
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
    const crearOtro = crearOtroRef.current;
    crearOtroRef.current = false;
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
    let siguientePosicion: { numero: number; codigo: string } | null = null;
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
        let newReq: Requerimiento;
        let renumerados = 0;
        if (insertarDespuesDe) {
          const resultado = await insertarRequerimientoDespuesDe(
            proyectoId!,
            insertarDespuesDe.numero,
            { ...datos, id_proyecto: proyectoId! },
            uid
          );
          newReq = resultado.requerimiento;
          renumerados = resultado.renumerados;
          // Para "insertar y añadir otro": el siguiente va justo después del que se acaba de insertar
          siguientePosicion = { numero: newReq.numero!, codigo: codigoDe(newReq)! };
        } else {
          newReq = await createRequerimiento({ ...datos, id_proyecto: proyectoId! });
        }
        if (newReq?.id) {
          await addLogRequerimiento({
            id_requerimiento: newReq.id,
            accion: 'Creación de requerimiento',
            id_autor: uid,
            detalles: insertarDespuesDe
              ? { inicio: `Insertado después de ${insertarDespuesDe.codigo}`, renumerados }
              : { inicio: 'Creación inicial' }
          });
        }
        toast.success(
          insertarDespuesDe
            ? `Registrado como ${codigoDe(newReq)}.` +
              (renumerados > 0 ? ` Los ${renumerados} siguientes subieron un número.` : '')
            : 'Requerimiento registrado'
        );
        ultimaClasificacionRef.current = {
          id_tipo_requerimiento: formData.id_tipo_requerimiento,
          id_modalidad: formData.id_modalidad,
          id_modelo: formData.id_modelo,
          id_patron_seleccionado: formData.id_patron_seleccionado,
          id_aprobador: formData.id_aprobador
        };
      }

      if (crearOtro && !editingReq) {
        // Se queda abierto con la misma clasificación para redactar el siguiente
        setFormData(prev => ({ ...prev, enunciado: '' }));
        setAiPrompt('');
        if (siguientePosicion) setInsertarDespuesDe(siguientePosicion);
        requestAnimationFrame(() => document.getElementById('req-enunciado')?.focus());
      } else {
        setIsModalOpen(false);
      }
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
          <span className="block font-mono text-xs bg-sunken border border-line rounded-ui p-2 mb-2 text-ink">
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
            Se pedirá al líder de <strong className="text-ink">{equipo.nombre}</strong> que
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
  const limpiarFiltros = () => setFiltros(f => ({ ...FILTROS_INICIALES, orden: f.orden, agrupar: f.agrupar }));
  // Coincidencia con todo salvo el estado: sirve para contar cuántos hay en cada pestaña de estado
  const numeroBuscado = numeroDesdeBusqueda(termino);
  const coincideSinEstado = (r: Requerimiento) =>
    (!termino ||
      r.enunciado.toLowerCase().includes(termino) ||
      (numeroBuscado !== null && r.numero === numeroBuscado) ||
      !!codigoDe(r)?.toLowerCase().includes(termino)) &&
    (filterTipo === 'todos' || r.id_tipo_requerimiento === filterTipo) &&
    (filterModelo === 'todos' || r.id_modelo === filterModelo);
  const esDelEstado = (r: Requerimiento, id: string) =>
    id === 'todos' || (id === 'sin-estado' ? !r.id_estado : r.id_estado === id);
  const requerimientosBase = requerimientos.filter(coincideSinEstado);
  const conteoEstado = (id: string) => requerimientosBase.filter(r => esDelEstado(r, id)).length;
  const filteredRequerimientos = requerimientosBase.filter(r => esDelEstado(r, filterEstado));
  const pestanasEstado = [
    { id: 'todos', nombre: 'Todos' },
    ...estados.map(e => ({ id: e.id, nombre: e.nombre_estado })),
    ...(requerimientos.some(r => !r.id_estado) ? [{ id: 'sin-estado', nombre: 'Sin estado' }] : [])
  ];
  // La carga ya viene del más nuevo al más antiguo
  const requerimientosOrdenados = [...filteredRequerimientos].sort((a, b) => {
    if (orden === 'antiguos') return (a.created_at || '').localeCompare(b.created_at || '');
    if (orden === 'numero') {
      const sinNumero = Number.MAX_SAFE_INTEGER;
      return (a.numero ?? sinNumero) - (b.numero ?? sinNumero);
    }
    if (orden === 'estado') {
      const porEstado = (a.estado?.nombre_estado || 'zzz').localeCompare(b.estado?.nombre_estado || 'zzz', 'es');
      return porEstado || (b.created_at || '').localeCompare(a.created_at || '');
    }
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  // Secciones cuando se agrupa por tipo o por modelo (en el orden del catálogo)
  const gruposRequerimientos = (() => {
    if (agrupar === 'ninguno') return [];
    const catalogo = agrupar === 'tipo'
      ? tiposReq.map(t => ({ id: t.tipo_req, nombre: t.nombre }))
      : modelos.map(m => ({ id: m.id, nombre: m.nombre }));
    const idDe = (r: Requerimiento) => (agrupar === 'tipo' ? r.id_tipo_requerimiento : r.id_modelo);
    const grupos = catalogo.map(c => ({ ...c, items: requerimientosOrdenados.filter(r => idDe(r) === c.id) }));
    const resto = requerimientosOrdenados.filter(r => !catalogo.some(c => c.id === idDe(r)));
    return [
      ...grupos,
      { id: 'sin-clasificar', nombre: agrupar === 'tipo' ? 'Sin tipo' : 'Sin modelo', items: resto }
    ].filter(g => g.items.length > 0);
  })();

  // Equipos vinculados primero en el modal
  const equiposOrdenados = [...equipos].sort(
    (a, b) => Number(equiposAsignados.includes(b.equipo_id)) - Number(equiposAsignados.includes(a.equipo_id))
  );

  if (urlLeida && !proyectoId) {
    return (
      <div className="p-8 text-center bg-surface rounded-ui border border-line">
        <p className="text-sm font-semibold text-ink">No se indicó ningún proyecto</p>
        <p className="text-xs text-ink-subtle mt-1">Abre un proyecto desde la lista para ver sus requerimientos.</p>
        <button onClick={() => router.push('/')} className={`${btnPrimario} mt-4`}>
          Ir a Proyectos
        </button>
      </div>
    );
  }

  const selectFiltro = campo;

  // Una fila de la lista de requerimientos
  const filaRequerimiento = (req: Requerimiento) => (
    <li
              key={req.id}
              className="px-5 py-5 hover:bg-sunken/60 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-4"
            >
              <div className="space-y-2.5 flex-1 min-w-0">
                {/* Badges de clasificación */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {codigoDe(req) && (
                    <button
                      type="button"
                      onClick={() => copiarCodigo(codigoDe(req)!)}
                      title="Copiar identificador"
                      aria-label={`Copiar identificador ${codigoDe(req)}`}
                      className="px-2 py-0.5 rounded-ui border border-line-strong bg-surface font-mono font-semibold text-ink hover:bg-sunken transition-colors cursor-pointer"
                    >
                      {codigoDe(req)}
                    </button>
                  )}
                  {puedeEditar ? (
                    <select
                      value={req.id_estado || ''}
                      onChange={(e) => handleCambioEstado(req, e.target.value)}
                      aria-label="Cambiar estado"
                      title="Cambiar estado"
                      className={`pl-2.5 pr-1 py-0.5 rounded-full font-medium border cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-text/30 ${getBadgeColorEstado(req.estado?.nombre_estado)}`}
                    >
                      {!req.id_estado && <option value="">Sin estado</option>}
                      {estados.map((e) => (
                        <option key={e.id} value={e.id} className="text-ink">{e.nombre_estado}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium border ${getBadgeColorEstado(req.estado?.nombre_estado)}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {req.estado?.nombre_estado || 'Sin estado'}
                    </span>
                  )}

                  {req.tipo_requerimiento && (
                    <span className="px-2 py-0.5 rounded-ui bg-sunken text-ink-muted font-medium border border-line">
                      {req.tipo_requerimiento.nombre}
                    </span>
                  )}
                  {req.modelo && (
                    <span className="px-2 py-0.5 rounded-ui bg-brand-subtle text-brand-text font-medium border border-brand-line">
                      {req.modelo.nombre}
                    </span>
                  )}
                  {req.modalidad && (
                    <span className="px-2 py-0.5 rounded-ui bg-warning-subtle text-warning font-medium border border-warning-line">
                      {req.modalidad.nombre_modalidad}
                    </span>
                  )}
                </div>

                <div className="border-l-2 border-line-strong pl-3 py-0.5">
                  <p className="text-ink font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {req.enunciado}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-ink-subtle pt-1">
                  {req.autor && (
                    <span className="flex items-center gap-1">
                      <User size={12} />
                      Autor: <strong className="text-ink-muted font-medium">{req.autor.nombre || req.autor.correo}</strong>
                    </span>
                  )}
                  {req.aprobador && (
                    <span className="flex items-center gap-1">
                      <CheckCheck size={12} className="text-success" />
                      Aprobado por: <strong className="text-ink-muted font-medium">{req.aprobador.nombre || req.aprobador.correo}</strong>
                    </span>
                  )}
                  {req.created_at && (
                    <time dateTime={req.created_at} title={fechaCompleta(req.created_at)} className="flex items-center gap-1">
                      <Clock size={12} />
                      {fechaRelativa(req.created_at)}
                    </time>
                  )}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex items-center gap-1 border-t md:border-t-0 pt-3 md:pt-0 border-line">
                <button
                  onClick={() => copiarEnunciado(req)}
                  title="Copiar enunciado"
                  aria-label="Copiar enunciado"
                  className={btnIcono}
                >
                  <Copy size={16} />
                </button>
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
                    {req.numero != null && (
                      <button
                        onClick={() => openInsertModal(req)}
                        title={`Insertar un requerimiento después de ${codigoDe(req)}`}
                        aria-label={`Insertar un requerimiento después de ${codigoDe(req)}`}
                        className={btnIcono}
                      >
                        <ListPlus size={16} />
                      </button>
                    )}
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
            </li>
  );

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader
        back={
          <Link
            href="/"
            className="inline-flex items-center text-sm font-medium text-ink-subtle hover:text-ink transition-colors group"
          >
            <ChevronLeft size={16} className="mr-1 group-hover:-translate-x-0.5 transition-transform" />
            Proyectos
          </Link>
        }
        title={
          proyecto ? (
            <span className="flex flex-wrap items-center gap-3">
              {proyecto.nombre}
              {proyecto.tipos_sistema?.nombre && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-sunken text-ink-muted border border-line">
                  {proyecto.tipos_sistema.nombre}
                </span>
              )}
            </span>
          ) : (
            <span className="block h-8 w-64 max-w-full bg-sunken-strong rounded-ui animate-pulse" />
          )
        }
        description={proyecto ? proyecto.descripcion || 'Sin descripción' : undefined}
        actions={
          <>
            <button onClick={() => setShowEquiposModal(true)} className={btnSecundario}>
              <Users size={16} className="text-ink-subtle" />
              Equipos ({equiposAsignados.length})
            </button>

            {puedeEditar && (
              <button onClick={openCreateModal} className={btnPrimario}>
                <Plus size={16} />
                Nuevo requerimiento
              </button>
            )}
          </>
        }
      />

      {/* Aviso de solo lectura para no relacionados */}
      {permisoCargado && !puedeEditar && (
        <div className="bg-warning-subtle border border-warning-line rounded-ui p-3.5 flex items-center gap-2.5 text-xs text-warning">
          <Lock size={15} className="shrink-0" />
          <span>
            Tienes acceso de lectura. Solo el creador del proyecto o miembros de un equipo vinculado pueden
            crear o editar requerimientos; el creador administra las invitaciones de equipos.
          </span>
        </div>
      )}

      {/* Navegación por estado: un clic muestra solo los requerimientos de ese estado */}
      {!loading && requerimientos.length > 0 && (
        <div
          role="group"
          aria-label="Filtrar por estado"
          className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line custom-scrollbar"
        >
          {pestanasEstado.map((p) => {
            const activa = filterEstado === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setFilterEstado(p.id)}
                aria-pressed={activa}
                className={`shrink-0 px-4 min-h-11 text-sm whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                  activa
                    ? 'border-ink text-ink font-semibold'
                    : 'border-transparent text-ink-muted font-medium hover:text-ink'
                }`}
              >
                {p.nombre}
                <span className="ml-2 text-xs tabular-nums text-ink-subtle">{conteoEstado(p.id)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Barra de Búsqueda y Filtros */}
      <div className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-subtle">
              <Search size={14} />
            </div>
            <input
              type="search"
              placeholder="Buscar enunciado o número (REQ-014)..."
              aria-label="Buscar requerimientos"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={buscador}
            />
          </div>

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
          <div className="flex items-center justify-between gap-3 text-sm text-ink-subtle px-1">
            <span aria-live="polite">
              {hayFiltros
                ? `Mostrando ${filteredRequerimientos.length} de ${requerimientos.length} requerimientos`
                : `${requerimientos.length} ${requerimientos.length === 1 ? 'requerimiento' : 'requerimientos'}`}
            </span>
            <div className="flex items-center gap-4">
              {hayFiltros && (
                <button onClick={limpiarFiltros} className="font-semibold text-brand-text hover:underline cursor-pointer">
                  Quitar filtros
                </button>
              )}
              <label className="flex items-center gap-2">
                <span>Agrupar</span>
                <select
                  value={agrupar}
                  onChange={(e) => setAgrupar(e.target.value as Agrupar)}
                  aria-label="Agrupar requerimientos"
                  className="bg-transparent text-ink font-medium text-sm cursor-pointer rounded-ui focus:outline-none focus-visible:outline-2"
                >
                  <option value="ninguno">Sin agrupar</option>
                  <option value="tipo">Por tipo</option>
                  <option value="modelo">Por modelo</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <span>Ordenar</span>
                <select
                  value={orden}
                  onChange={(e) => setOrden(e.target.value as Orden)}
                  aria-label="Ordenar requerimientos"
                  className="bg-transparent text-ink font-medium text-sm cursor-pointer rounded-ui focus:outline-none focus-visible:outline-2"
                >
                  <option value="numero">Por número</option>
                  <option value="recientes">Más recientes</option>
                  <option value="antiguos">Más antiguos</option>
                  <option value="estado">Por estado</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Lista de Requerimientos */}
      {loading ? (
        <div className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden" role="status" aria-label="Cargando">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-sunken animate-pulse" />
          ))}
        </div>
      ) : filteredRequerimientos.length === 0 ? (
        <div className="text-center py-20">
          <h3 className="text-lg font-semibold text-ink">
            {hayFiltros ? 'Sin resultados' : 'Todavía no hay requerimientos'}
          </h3>
          <p className="text-base text-ink-muted mt-2 max-w-sm mx-auto">
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
        agrupar === 'ninguno' ? (
          <ul className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
            {requerimientosOrdenados.map(filaRequerimiento)}
          </ul>
        ) : (
          <div className="space-y-10">
            {gruposRequerimientos.map((grupo) => (
              <section key={grupo.id} aria-labelledby={`req-grupo-${grupo.id}`}>
                <h2
                  id={`req-grupo-${grupo.id}`}
                  className="text-lg font-semibold text-ink pb-3 mb-4 border-b-2 border-line-strong"
                >
                  {grupo.nombre}
                  <span className="ml-2 text-sm font-normal text-ink-subtle">{grupo.items.length}</span>
                </h2>
                <ul className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
                  {grupo.items.map(filaRequerimiento)}
                </ul>
              </section>
            ))}
          </div>
        )
      )}

      {/* Modal Redactar / Editar Requerimiento */}
      <Modal
        open={isModalOpen}
        onClose={intentarCerrar}
        cerrarConFondo={!hayCambios}
        title={
          editingReq
            ? 'Editar Requerimiento'
            : insertarDespuesDe
              ? `Nuevo requerimiento después de ${insertarDespuesDe.codigo}`
              : 'Nuevo Requerimiento'
        }
        description="Elige el modelo de especificación y redacta respetando la estructura del patrón."
        size="xl"
      >
        <form ref={formRef} onSubmit={handleSaveReq} noValidate className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-5">
            {insertarDespuesDe && !editingReq && (
              <div className="flex items-start gap-3 rounded-ui border border-warning-line bg-warning-subtle p-3 text-sm text-warning">
                <ListOrdered size={18} aria-hidden className="mt-0.5 shrink-0" />
                <p>
                  Se registrará como <strong>{codigoRequerimiento(insertarDespuesDe.numero + 1)}</strong>.{' '}
                  {requerimientos.filter(r => (r.numero ?? 0) > insertarDespuesDe.numero).length > 0
                    ? `Los ${requerimientos.filter(r => (r.numero ?? 0) > insertarDespuesDe.numero).length} requerimientos que van después subirán un número.`
                    : 'No hay requerimientos posteriores que renumerar.'}
                </p>
              </div>
            )}

            {/* Selector de Modelo y Patrón */}
            <div className="bg-sunken p-4 rounded-ui border border-line space-y-3">
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
                <div className="flex items-start justify-between gap-3 bg-sunken border border-line rounded-ui px-3 py-2">
                  <code className="font-mono text-xs text-ink leading-relaxed whitespace-pre-wrap">
                    {patronSeleccionado.promt}
                  </code>
                  <button
                    type="button"
                    onClick={usarPlantilla}
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-brand-text hover:underline cursor-pointer"
                  >
                    <Wand2 size={12} />
                    Usar plantilla
                  </button>
                </div>
              )}
            </div>

            {/* AI Generation */}
            <div className="bg-brand-subtle p-4 rounded-ui border border-brand-line">
              <label htmlFor="req-ia" className="text-sm font-semibold text-brand-text mb-2 flex items-center gap-1.5">
                <Sparkles size={14} className="text-brand-text" />
                Generar con IA
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="req-ia"
                  type="text"
                  placeholder="Describe la funcionalidad brevemente..."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="flex-1 px-3 min-h-10 pointer-coarse:min-h-11 py-2 bg-surface border border-line-strong rounded-ui text-base focus:outline-none focus:border-brand-text focus:ring-1 focus:ring-brand-text text-ink placeholder:text-ink-subtle"
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
                  className="px-4 py-2 bg-brand-solid hover:bg-brand-solid-hover text-on-solid rounded-ui text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {isAILoading && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {isAILoading ? 'Generando...' : 'Generar'}
                </button>
              </div>
              {patronSeleccionado && (
                <p className="text-xs text-brand-text mt-1.5">
                  Se usará el patrón <strong>{patronSeleccionado.nombre}</strong>.
                </p>
              )}
            </div>

            {/* Enunciado */}
            <div>
              <label htmlFor="req-enunciado" className={etiqueta}>
                Enunciado del Requerimiento <span className="text-danger">*</span>
              </label>
              <textarea
                id="req-enunciado"
                rows={4}
                placeholder={patronSeleccionado?.promt || "Escribe el enunciado siguiendo la estructura del patrón..."}
                value={formData.enunciado}
                onChange={(e) => setFormData({ ...formData, enunciado: e.target.value })}
                className={`${campo} font-mono leading-relaxed`}
              />
              <p className="text-xs text-ink-subtle mt-1">Ctrl + Enter para guardar.</p>
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
            <button type="button" onClick={intentarCerrar} className={btnSecundario}>
              Cancelar
            </button>
            {!editingReq && (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  crearOtroRef.current = true;
                  formRef.current?.requestSubmit();
                }}
                className={btnSecundario}
              >
                {insertarDespuesDe ? 'Insertar y añadir otro' : 'Guardar y añadir otro'}
              </button>
            )}
            <button type="submit" disabled={saving} className={btnPrimario}>
              <Save size={16} />
              {saving ? 'Guardando...' : editingReq ? 'Guardar cambios' : insertarDespuesDe ? 'Insertar requerimiento' : 'Registrar requerimiento'}
            </button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal Historial */}
      <Modal
        open={currentReqForLogs !== null}
        onClose={() => setCurrentReqForLogs(null)}
        title={
          currentReqForLogs && codigoDe(currentReqForLogs)
            ? `Historial de ${codigoDe(currentReqForLogs)}`
            : 'Historial de Cambios'
        }
        description="Quién modificó el requerimiento y cuándo."
        size="lg"
      >
        <ModalBody className="space-y-3">
          {currentReqForLogs && (
            <p className="font-mono text-xs text-ink-muted line-clamp-2 border-l-2 border-line-strong pl-2">
              {currentReqForLogs.enunciado}
            </p>
          )}
          {loadingLogs ? (
            [1, 2].map(i => (
              <div key={i} className="h-14 bg-sunken rounded-ui animate-pulse" />
            ))
          ) : selectedReqLogs.length === 0 ? (
            <p className="text-xs text-ink-subtle text-center py-6">No hay registros de cambios todavía.</p>
          ) : (
            <ol className="space-y-2">
              {selectedReqLogs.map((log) => {
                const autor = log.autor ? (log.autor.nombre || log.autor.correo) : nombreUsuario(log.id_autor);
                const campos: string[] = Array.isArray(log.detalles?.campos) ? log.detalles.campos : [];
                return (
                  <li key={log.id} className="p-3 bg-sunken rounded-ui border border-line text-xs space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold text-ink">{log.accion}</span>
                      <time className="text-xs text-ink-subtle shrink-0" dateTime={log.fecha_hora}>
                        {fechaCompleta(log.fecha_hora)}
                      </time>
                    </div>
                    {log.detalles?.estado_anterior !== undefined && log.detalles?.estado_nuevo && (
                      <p className="text-xs text-ink-subtle flex items-center gap-1">
                        {log.detalles.estado_anterior || 'Sin estado'}
                        <ArrowRight size={11} />
                        {log.detalles.estado_nuevo}
                      </p>
                    )}
                    {campos.length > 0 && (
                      <p className="text-xs text-ink-subtle">Cambió: {campos.join(', ')}</p>
                    )}
                    {autor && (
                      <p className="text-xs text-ink-subtle">
                        Por <strong className="text-ink-muted">{autor}</strong>
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
            <p className="text-ink-subtle text-xs text-center py-4">No hay equipos registrados todavía.</p>
          ) : (
            equiposOrdenados.map(eq => {
              const isAssigned = equiposAsignados.includes(eq.equipo_id);
              const pendiente = solicitudesEquiposPendientes.includes(eq.equipo_id);
              if (!puedeGestionarVinculos && !isAssigned) return null;
              return (
                <div key={eq.equipo_id} className={`flex items-center justify-between gap-3 p-3 rounded-ui border ${isAssigned ? 'bg-brand-subtle border-brand-line' : 'bg-sunken border-line'}`}>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink text-xs sm:text-sm">{eq.nombre}</p>
                    {eq.descripcion && <p className="text-xs text-ink-subtle truncate">{eq.descripcion}</p>}
                  </div>
                  {puedeGestionarVinculos && (
                    pendiente ? (
                      <span className="shrink-0 px-3 py-1.5 rounded-ui text-xs font-medium text-warning bg-warning-subtle border border-warning-line">
                        Solicitud pendiente
                      </span>
                    ) : (
                      <button
                        onClick={() => solicitarVinculoEquipo(eq)}
                        title={isAssigned ? 'Pedir al líder del equipo que acepte desvincularse' : 'Invitar al líder del equipo a vincularse'}
                        className={`shrink-0 px-3 py-1.5 rounded-ui text-xs font-semibold transition-colors cursor-pointer ${isAssigned ? 'bg-surface border border-line text-ink-muted hover:text-danger hover:border-danger-line' : 'bg-brand-solid text-on-solid hover:bg-brand-solid-hover'}`}
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
            <p className="text-ink-subtle text-xs text-center py-4">Este proyecto aún no tiene equipos vinculados.</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Link href="/equipos-global/" className="mr-auto text-xs font-semibold text-brand-text hover:underline">
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
