'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import { accionConDeshacer } from '@/lib/deshacer';
import { elementosSegunPatron, patronReconocible } from '@/lib/sintaxis-en-vivo';
import { useAtajos } from '@/lib/use-atajos';
import { avisoColaToast } from "@/lib/aviso-cola";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Plus, Edit2, Trash2, Search, Save,
  Sparkles, CheckCheck, History, Lock, Wand2, Copy, ListPlus, ListOrdered,
  Check, XCircle, Send, Download, Folder, X, Layers, MessageSquare, ArrowRight, Map as MapaIcono,
  SlidersHorizontal, Keyboard
} from 'lucide-react';
import {
  generateSingleRequirement,
  AIError,
  ESTRICTEZ_POR_DEFECTO,
  type AIRequirement,
  type Estrictez
} from '@/lib/ai-actions';
import type {
  Proyecto, Requerimiento, TipoRequerimiento, Estado,
  Modalidad, Modelo, Patron, PerfilUsuario, LogRequerimiento, Equipo, ArchivoContexto,
  Comentario, ElementoSintactico, PrioridadMoSCoW
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
  deleteRequerimiento,
  addLogRequerimiento,
  getLogsRequerimientos,
  actualizarRequerimientoConHistorial,
  restaurarVersionRequerimiento,
  getEquiposDelProyecto,
  getEquiposLideradosPor,
  reenviarRequerimientoAprobacion,
  decidirAprobacionRequerimiento,
  MODALIDAD_GENERADO_IA,
  ESTADO_APROBADO,
  ESTADO_RECHAZADO,
  ESTADO_PENDIENTE_APROBACION,
  marcarRequerimientoImplementado,
  reabrirRequerimientoAprobado,
  getContextoProyecto,
  construirContextoIA,
  suscribirComentariosRequerimiento,
  crearComentario,
  editarComentario,
  borrarComentario,
  esMiembroPorEquipoVinculado,
  asegurarAccesoComentariosProyecto,
  crearRequerimientosEnLote
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
import ListaEsqueleto from '@/components/ui/Esqueleto';
import MenuAcciones, { type AccionMenu } from '@/components/ui/MenuAcciones';
import EjemploSintaxis from '@/components/EjemploSintaxis';
import ModalHistorialLogs from '@/components/requerimientos/ModalHistorialLogs';
import ModalComentarios from '@/components/requerimientos/ModalComentarios';
import EquiposDelProyecto from '@/components/equipos/EquiposDelProyecto';
import ContextoDelProyecto from '@/components/proyectos/ContextoDelProyecto';
import ControlEstrictez from '@/components/requerimientos/ControlEstrictez';
import { BotonPista, Pista, PistaCampo, usePista } from '@/components/ui/Pista';
import PanelGeneracionIterativa, {
  useGeneracionIterativa,
  type OpcionesGuardadas,
  type Profundidad,
  type PropuestaRevisable
} from '@/components/requerimientos/GeneracionIterativa';
import {
  BarraSintaxis,
  BotonDesgloseSintaxis,
  DesgloseSintaxis,
  TextoConSintaxis,
  EditorEnunciadoConSintaxis,
  useFocoSintaxis
} from '@/components/requerimientos/SintaxisRequerimiento';
import { construirLeyendaSintaxis, filtrarElementosPresentes } from '@/lib/sintaxis-requerimiento';
import type { AlcanceGeneracion } from '@/lib/ai-actions';
import { prepararRegistro } from '@/lib/seleccion-propuestas';
import { irA, leerNavegacion, suscribirNavegacion, type VistaProyecto } from '@/lib/navegacion-proyecto';
import { useCierreSeguro } from '@/lib/use-cierre-seguro';
import { useEstadoSesion } from '@/lib/use-estado-sesion';
import { fechaCompleta, fechaRelativa } from '@/lib/fechas';
import { codigoDe, codigoRequerimiento, numeroDesdeBusqueda } from '@/lib/requerimientos';
import { esCreadorDelProyecto, esMiembroDelProyecto } from '@/lib/equipos-proyecto';
import {
  estaPendienteDeAprobacion,
  estaRechazado,
  puedeAprobarRequerimientos,
  puedeEditarRequerimiento,
  puedeReenviarRequerimiento,
  puedeComentarRequerimiento,
  puedeMarcarImplementado,
  puedeReabrirRequerimiento
} from '@/lib/permisos';
import {
  prepararItems,
  exportarMarkdown,
  exportarWord,
  exportarPdf,
  type FormatoExportacion,
  type AlcanceExportacion,
  type AgrupacionExportacion
} from '@/lib/export-requerimientos';

// ==========================================
// APROBACIÓN DE REQUERIMIENTOS (KAN-18)
// ==========================================
// Lo que sigue es la parte de la interfaz del flujo de aprobación. Las decisiones
// que cuentan son las de `lib/permisos.ts`, y esas son espejo de las reglas de
// `firestore.rules`, que es donde manda. Aquí solo se decide qué botones se ven.
//
// El estado ya no se elige a mano: nace "Pendiente de aprobación" y lo mueve el
// líder con Aprobar/Rechazar, o el autor con Reenviar tras corregir. El autor lo
// pone el sistema. Por eso `FORM_VACIO` ya no lleva `id_autor` ni `id_aprobador`:
// no hay nada que elegir.

const FORM_VACIO = {
  enunciado: '',
  id_tipo_requerimiento: '',
  id_modalidad: '',
  id_modelo: '',
  id_patron_seleccionado: '',
  id_equipo: '',
  modulo: '',
  prioridad: ''
};

// Nombres legibles de los campos, para describir qué cambió en el historial.
// Fuera los que KAN-18 congela: `id_autor`, `id_aprobador`, `id_equipo` e
// `id_estado` no se editan desde el formulario, así que nunca aparecen como
// "campos modificados". El estado tiene su propio historial en el log.
// `id_patron` (KAN-28) sí se edita: guarda la plantilla usada al redactar.
const CAMPOS_EDITABLES: Array<[
  | 'enunciado'
  | 'id_tipo_requerimiento'
  | 'id_modalidad'
  | 'id_modelo'
  | 'id_patron'
  | 'modulo'
  | 'prioridad',
  string
]> = [
  ['enunciado', 'enunciado'],
  ['id_tipo_requerimiento', 'tipo'],
  ['id_modalidad', 'modalidad'],
  ['id_modelo', 'modelo'],
  ['id_patron', 'patrón'],
  ['modulo', 'módulo'],
  ['prioridad', 'prioridad']
];

/** Máximo de ejemplos (few-shot) que se le dan a la IA. */
const MAX_EJEMPLOS = 3;

/** Categoría FURPS que devuelve la IA -> inicio del nombre del tipo en el catálogo. */
const TIPO_POR_FURPS: Record<AIRequirement['type_furps'], string> = {
  Functionality: 'funcional',
  Usability: 'usabilidad',
  Reliability: 'confiabilidad',
  Performance: 'rendimiento',
  Supportability: 'soporte'
};

/** Áreas de la generación con IA que no son un módulo real y no se guardan como tal (KAN-40). */
const AREAS_SIN_MODULO = new Set(['otros', 'general', 'cobertura adicional']);

type Orden = 'recientes' | 'antiguos' | 'estado' | 'numero';
type Agrupar = 'ninguno' | 'tipo' | 'modelo';

const FILTROS_INICIALES = {
  q: '',
  estado: 'todos',
  tipo: 'todos',
  modelo: 'todos',
  // Módulo (KAN-40): 'todos', '__sin__' (sin módulo) o el nombre del módulo
  modulo: 'todos',
  orden: 'numero' as Orden,
  agrupar: 'ninguno' as Agrupar
};

// Los colores se eligen por el nombre EXACTO del estado, no por que el texto
// "contenga" algo. Con `includes`, "Pendiente de aprobación" no casa con
// 'aprobado' (no es subcadena) y un estado nuevo se quedaría en gris sin que nadie
// lo notara. La comparación literal obliga a decidir el color al añadir un estado,
// que es justo cuando hay que hacerlo.
const COLORES_ESTADO: Array<[string, string]> = [
  ['Aprobado', 'bg-success-subtle text-success border-success-line'],
  ['Rechazado', 'bg-danger-subtle text-danger border-danger-line'],
  ['Pendiente de aprobación', 'bg-warning-subtle text-warning border-warning-line'],
  ['En Revisión', 'bg-warning-subtle text-warning border-warning-line'],
  ['Implementado', 'bg-brand-subtle text-brand-text border-brand-line'],
  ['Borrador', 'bg-sunken text-ink-muted border-line']
];

const getBadgeColorEstado = (nombre?: string) => {
  const n = (nombre || '').trim().toLowerCase();
  const exacto = COLORES_ESTADO.find(([estado]) => estado.toLowerCase() === n);
  if (exacto) return exacto[1];
  // Un estado que no esté en la lista (catálogo antigo, entorno a medio sembrar)
  // no se queda sin color: se busca por coincidencia parcial.
  const parcial = COLORES_ESTADO.find(([estado]) => n.includes(estado.toLowerCase()));
  return parcial ? parcial[1] : 'bg-sunken text-ink-muted border-line';
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
  // Equipos del proyecto: el selector de "a qué equipo pertenece" y el que cuenta
  // para la pestaña. Vienen del mismo getter, así que el número de la pestaña y las
  // opciones del formulario nunca discrepan.
  const [equiposProyecto, setEquiposProyecto] = useState<Array<Equipo>>([]);
  // Equipos donde el usuario es líder. Se cargan una vez y sirven para los tres
  // sitios que necesitan saber si puede aprobar.
  const [equiposLiderados, setEquiposLiderados] = useState<Array<string>>([]);

  // Filtros
  // Se recuerdan por proyecto mientras dure la sesión del navegador
  const [filtros, setFiltros] = useEstadoSesion(proyectoId ? `easyreq:req:v2:${proyectoId}` : null, FILTROS_INICIALES);
  const [panelFiltrosAbierto, setPanelFiltrosAbierto] = useState(false);
  const { q: searchTerm, estado: filterEstado, tipo: filterTipo, modelo: filterModelo, orden } = filtros;
  const setSearchTerm = (q: string) => setFiltros(f => ({ ...f, q }));
  const setFilterEstado = (estado: string) => setFiltros(f => ({ ...f, estado }));
  const setFilterTipo = (tipo: string) => setFiltros(f => ({ ...f, tipo }));
  const setFilterModelo = (modelo: string) => setFiltros(f => ({ ...f, modelo }));
  // Los filtros guardados antes de KAN-40 no traen el módulo
  const filterModulo = filtros.modulo ?? 'todos';
  const setFilterModulo = (modulo: string) => setFiltros(f => ({ ...f, modulo }));
  const setOrden = (nuevo: Orden) => setFiltros(f => ({ ...f, orden: nuevo }));
  // Los filtros guardados antes de existir "agrupar" no lo traen
  const agrupar: Agrupar = filtros.agrupar ?? 'ninguno';
  const setAgrupar = (nuevo: Agrupar) => setFiltros(f => ({ ...f, agrupar: nuevo }));

  // Exportación a documento (KAN-28): se genera en el navegador, sin servidor.
  const [showExportModal, setShowExportModal] = useState(false);
  const [formatoExport, setFormatoExport] = useState<FormatoExportacion>('pdf');
  const [alcanceExport, setAlcanceExport] = useState<AlcanceExportacion>('visibles');
  const [agrupacionExport, setAgrupacionExport] = useState<AgrupacionExportacion>('ninguna');
  const [exportando, setExportando] = useState(false);

  // Modal State Requerimiento
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Requerimiento | null>(null);
  const [formData, setFormData] = useState(FORM_VACIO);
  const [elementosSintaxisForm, setElementosSintaxisForm] = useState<ElementoSintactico[] | null>(null);
  // Cuando el usuario elige "Otro (escribir)" en el select de módulo se activa
  // el input libre para escribir un módulo nuevo.
  const [moduloModoLibre, setModuloModoLibre] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Resaltado sintáctico en la lista principal del proyecto
  const [mostrarSintaxisLista, setMostrarSintaxisLista] = useEstadoSesion(
    urlLeida ? 'easyreq:sintaxis:visible' : null,
    true
  );
  const focoSintaxisLista = useFocoSintaxis();
  const [desglosesListaAbiertos, setDesglosesListaAbiertos] = useState<Set<string>>(() => new Set());
  const alternarDesgloseLista = useCallback((id: string) => {
    setDesglosesListaAbiertos(prev => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }, []);

  // Modal de Historial / Logs
  const [currentReqForLogs, setCurrentReqForLogs] = useState<Requerimiento | null>(null);
  const [selectedReqLogs, setSelectedReqLogs] = useState<Array<LogRequerimiento>>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [restoringLogId, setRestoringLogId] = useState<string | null>(null);

  // Modal de comentarios (KAN-27)
  const [reqComentarios, setReqComentarios] = useState<Requerimiento | null>(null);
  const [comentarios, setComentarios] = useState<Array<Comentario>>([]);
  const [loadingComentarios, setLoadingComentarios] = useState(false);
  const [comentariosError, setComentariosError] = useState<string | null>(null);
  const [guardandoComentario, setGuardandoComentario] = useState(false);

  // Vista del proyecto (requerimientos o equipos), reflejada en la URL
  const [vista, setVista] = useState<VistaProyecto>('requerimientos');
  useEffect(() => {
    const leer = () => setVista(leerNavegacion().vista);
    leer();
    return suscribirNavegacion(leer);
  }, []);
  // Cantidad de equipos del proyecto, para la pestaña (la lista la carga EquiposDelProyecto)
  const [cantidadEquipos, setCantidadEquipos] = useState<number | null>(null);

  // Control de acceso: lectura total para cualquiera con sesión; escribir
  // requiere ser creador del proyecto o miembro activo de algún equipo activo vinculado.
  const esMiembroDirecto = esMiembroDelProyecto(proyecto, uid);
  const [esMiembroPorEquipo, setEsMiembroPorEquipo] = useState(false);
  useEffect(() => {
    let activo = true;
    if (uid && proyecto?.proyecto_id) {
      esMiembroPorEquipoVinculado(proyecto.proyecto_id, uid)
        .then((res) => { if (activo) setEsMiembroPorEquipo(res); })
        .catch(() => { if (activo) setEsMiembroPorEquipo(false); });
    } else {
      setEsMiembroPorEquipo(false);
    }
    return () => { activo = false; };
  }, [uid, proyecto?.proyecto_id, cantidadEquipos]);
  const esMiembroProyecto = esMiembroDirecto || esMiembroPorEquipo;
  const esMiembroDelHilo = esMiembroProyecto;
  // KAN-27: el creador del proyecto puede borrar comentarios ajenos en el hilo.
  const esCreadorProyecto = esCreadorDelProyecto(proyecto, uid);
  // KAN-27: comentar es cosa de miembros del proyecto, y no depende del estado de
  // aprobación del requerimiento: discutirlo no lo mueve.
  const puedeComentar = puedeComentarRequerimiento(esMiembroDelHilo);

  // KAN-18: los equipos donde el usuario es líder (global o local en este proyecto), que son los únicos que puede
  // aprobar.
  useEffect(() => {
    let activo = true;
    if (!uid) {
      setEquiposLiderados([]);
      return;
    }
    getEquiposLideradosPor(uid, proyectoId ?? undefined)
      .then(ids => { if (activo) setEquiposLiderados(ids); })
      .catch(e => {
        console.error('No se pudieron cargar los equipos liderados:', e);
        if (activo) setEquiposLiderados([]);
      });
    return () => { activo = false; };
  }, [uid, proyectoId, cantidadEquipos]);

  // KAN-60: al agregar o quitar un equipo en la pestaña Equipos cambia la cantidad; se vuelve a leer
  // la lista para que "Nuevo requerimiento" y el selector de equipo la vean sin recargar la página.
  useEffect(() => {
    if (!proyectoId || cantidadEquipos === null) return;
    let activo = true;
    getEquiposDelProyecto(proyectoId)
      .then(equipos => { if (activo) setEquiposProyecto(equipos); })
      .catch(e => console.error('No se pudieron recargar los equipos del proyecto:', e));
    return () => { activo = false; };
  }, [proyectoId, cantidadEquipos]);

  // AI Generation State
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  // Opciones de la IA: se conservan entre aperturas del modal mientras dure la página
  const [estrictez, setEstrictez] = useState<Estrictez>(ESTRICTEZ_POR_DEFECTO);
  const [ejemplos, setEjemplos] = useState<string[]>([]);
  const [modoMasivo, setModoMasivo] = useState(false);
  // Contexto del proyecto (pestaña Contexto): la raíz entra siempre, las carpetas si se eligen
  const [archivosContexto, setArchivosContexto] = useState<ArchivoContexto[]>([]);
  const [carpetasElegidas, setCarpetasElegidas] = useState<string[]>([]);
  const [cantidadContexto, setCantidadContexto] = useState<number | null>(null);
  // Generación de varios requerimientos (KAN-40): la corrida y las propuestas a revisar viven en
  // el hook, que ahora recuerda el estado en sessionStorage por proyecto para no perderlo al
  // recargar; aquí solo se elige el alcance y se registran las elegidas.
  const gen = useGeneracionIterativa(proyectoId);
  const propuestas = gen.propuestas;
  const [alcanceIA, setAlcanceIA] = useState<AlcanceGeneracion | 'auto'>('auto');
  const [profundidad, setProfundidad] = useState<Profundidad>('completa');
  const [registrandoMasivo, setRegistrandoMasivo] = useState<{ hechos: number; total: number } | null>(null);
  // Evita que un doble clic o un Enter repetido lancen dos registros del mismo lote.
  const registrandoMasivoRef = useRef(false);

  // Al registrar varios requerimientos seguidos: "guardar y añadir otro" y
  // recordar la clasificación del último para no volver a elegirla.
  const crearOtroRef = useRef(false);
  // Si no es null, el requerimiento nuevo se inserta justo después de este y los siguientes suben un número
  const [insertarDespuesDe, setInsertarDespuesDe] = useState<{ numero: number; codigo: string } | null>(null);
  const ultimaClasificacionRef = useRef<Partial<typeof FORM_VACIO> | null>(null);

  // Pistas en su sitio (sin tapar la pantalla): una para el proyecto y otras debajo de cada parte del formulario
  const pistaProyecto = usePista('proyecto');
  const pistaCrear = usePista('crear-requerimiento');

  // Cambios sin guardar: el enunciado, el texto de la IA y, al editar, el resto de campos
  const { hayCambios, intentarCerrar } = useCierreSeguro(
    isModalOpen,
    {
      enunciado: formData.enunciado,
      ia: aiPrompt,
      propuestas: propuestas?.length ?? 0,
      generando: gen.ocupado,
      resto: editingReq
        ? [formData.id_tipo_requerimiento, formData.id_modalidad, formData.id_modelo, formData.id_equipo, formData.modulo, formData.prioridad]
        : null
    },
    () => setIsModalOpen(false)
  );

  // Aviso nativo del navegador antes de recargar o cerrar la pestaña si hay una generación en curso
  // o propuestas sin registrar (KAN-42 / KAN-45).
  const tieneTrabajoIAPendiente = gen.ocupado || (propuestas?.length ?? 0) > 0;
  useEffect(() => {
    if (!tieneTrabajoIAPendiente) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [tieneTrabajoIAPendiente]);

  // Cerrar el modal detiene una generación en marcha (no sigue gastando llamadas de fondo)
  const { detener: detenerGeneracion } = gen;
  useEffect(() => {
    if (!isModalOpen) detenerGeneracion();
  }, [isModalOpen, detenerGeneracion]);

  // Cargar lista de requerimientos (más recientes primero)
  // Requerimientos borrados que aún se pueden deshacer: no se pintan aunque se recargue la lista
  const eliminandoRef = useRef(new Set<string>());

  const fetchRequerimientos = useCallback(async () => {
    if (!proyectoId) return;
    const data = (await getRequerimientos(proyectoId)).filter(r => !eliminandoRef.current.has(r.id));
    setRequerimientos(data.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
  }, [proyectoId]);

  // Cargar proyecto, catálogos, requerimientos y equipos
  const cargarTodo = useCallback(async () => {
    if (!proyectoId) return;
    setLoading(true);

    try {
      const [found, trData, estData, modData, modelData, patData, userData, equipos] = await Promise.all([
        getProyectoById(proyectoId),
        getTiposRequerimientos(),
        getEstados(),
        getModalidades(),
        getModelos(),
        getPatrones(),
        getAllUsers(),
        // KAN-24/KAN-18: los equipos del proyecto, no los de toda la aplicación. Antes
        // se leían las colecciones `equipo` y `proyecto_equipos` enteras y se filtraba
        // aquí; con este getter el filtro vive en Firestore y llega ya lo que se usa.
        getEquiposDelProyecto(proyectoId),
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
      // Un proyecto sin equipos no puede registrar requerimientos: `id_equipo` decide
      // qué líder aprueba, así que sin equipo no hay a quién preguntarle.
      setEquiposProyecto(equipos);
      setCantidadEquipos(equipos.length);
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

  // Contexto del proyecto para la IA. Se relee al abrir el modal para usar lo último que se subió.
  const cargarContexto = useCallback(async () => {
    if (!proyectoId) return;
    try {
      const lista = await getContextoProyecto(proyectoId);
      setArchivosContexto(lista);
      setCantidadContexto(lista.filter(a => a.tipo === 'archivo').length);
      // Una carpeta elegida que ya no existe deja de contar
      setCarpetasElegidas(prev => prev.filter(id => lista.some(a => a.id === id && a.tipo === 'carpeta')));
    } catch (e) {
      console.error('No se pudo cargar el contexto del proyecto:', e);
    }
  }, [proyectoId]);

  useEffect(() => {
    void cargarContexto();
  }, [cargarContexto]);

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
  // Partes del enunciado reconocidas al escribir, comparando con la plantilla (sin IA).
  // Si el texto no sigue la estructura se usan las que marcó la IA al generar.
  const elementosEnVivo = useMemo(
    () => elementosSegunPatron(formData.enunciado, patronSeleccionado?.promt),
    [formData.enunciado, patronSeleccionado?.promt]
  );
  const elementosEnunciado = elementosEnVivo ?? (elementosSintaxisForm?.length ? elementosSintaxisForm : null);
  const enunciadoFueraDePatron =
    !elementosEnunciado &&
    patronReconocible(patronSeleccionado?.promt) &&
    formData.enunciado.trim().length >= 25 &&
    formData.enunciado.trim() !== patronSeleccionado?.promt.trim();
  const nombreUsuario = (id: string | null | undefined) => {
    const u = usuarios.find(x => x.id === id);
    return u ? (u.nombre || u.correo) : null;
  };

  /** Nombre del equipo por su ID. Sale del proyecto en curso, no de toda la app. */
  const nombreEquipoDe = (id: string | null | undefined) => {
    const e = equiposProyecto.find(x => x.equipo_id === id);
    return e ? e.nombre : null;
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

  // ==========================================
  // CONSULTAS DE PERMISOS POR REQUERIMIENTO (KAN-18)
  // ==========================================
  // El nombre del estado es lo que decide, porque es lo que comparan las reglas
  // (`esEstadoPendienteAprobacion` y compañía leen `nombre_estado`). Los IDs los
  // asigna Firestore y no significan nada por sí solos.
  const nombreEstadoDe = (req: Requerimiento) => req.estado?.nombre_estado ?? null;

  /** ¿Este usuario lidera el equipo al que pertenece el requerimiento? */
  const lideraSuEquipo = (req: Requerimiento) =>
    !!req.id_equipo && equiposLiderados.includes(req.id_equipo);

  /** ¿Puede aprobar o rechazar este requerimiento? Ver `puedeAprobarRequerimientos`. */
  const puedeDecidir = (req: Requerimiento) =>
    puedeAprobarRequerimientos(lideraSuEquipo(req), nombreEstadoDe(req));

  /** ¿Puede corregir el texto? Ver `puedeEditarRequerimiento`. */
  const puedeEditarEste = (req: Requerimiento) =>
    puedeEditarRequerimiento(req.id_autor != null && req.id_autor === uid);

  /** ¿Puede devolverlo al flujo tras un rechazo? Ver `puedeReenviarRequerimiento`. */
  const puedeReenviarEste = (req: Requerimiento) =>
    puedeReenviarRequerimiento(req.id_autor != null && req.id_autor === uid, nombreEstadoDe(req));

  /**
   * ¿Aparece el botón de editar? Es el OR de las dos reglas de actualización:
   *
   * - dentro del ciclo de aprobación (`esReenvioDelAutor`): solo el autor. El líder
   *   no edita el texto, decide.
   * - fuera del ciclo (`esEdicionEnFlujoNormal`): cualquier miembro del proyecto.
   * - sin equipo (creado antes de KAN-18): entra por la segunda vía. No hay a quién
   * preguntarle, así que no hay puerta que saltarse; queda como estaba.
   */
  const puedeAbrirEditor = (req: Requerimiento) => {
    if (!esMiembroProyecto) return false;
    if (!req.id_equipo) return true;
    return puedeEditarEste(req) || !enCicloAprobacion(req);
  };

  /** ¿Está en "Pendiente de aprobación" o en "Rechazado"? */
  const enCicloAprobacion = (req: Requerimiento) => {
    const nombre = nombreEstadoDe(req);
    return estaPendienteDeAprobacion(nombre) || estaRechazado(nombre);
  };

  /** Requerimientos del proyecto en la forma compacta que la IA usa para no repetirlos. */
  const existentesParaIA = useCallback(() =>
    [...requerimientos]
      .sort((a, b) => (a.numero ?? Number.MAX_SAFE_INTEGER) - (b.numero ?? Number.MAX_SAFE_INTEGER))
      .map(r => ({ codigo: codigoDe(r) ?? 'REQ-?', modulo: r.modulo ?? null, enunciado: r.enunciado })),
  [requerimientos]);

  /**
   * Construye el estado inicial de `formData` para un requerimiento nuevo, respetando la última
   * clasificación usada en la sesión o las opciones de una corrida guardada.
   */
  const construirFormInicial = useCallback((opcionesGuardadas?: OpcionesGuardadas) => {
    const primerModelo = modelos[0]?.id || '';
    const primerPatron = patrones.find(p => p.id_modelo === primerModelo);
    const previa = ultimaClasificacionRef.current;
    const sigueExistiendo = (lista: Array<string>, id?: string) => !!id && lista.includes(id);

    let modeloInicial = sigueExistiendo(modelos.map(m => m.id), previa?.id_modelo) ? previa!.id_modelo! : primerModelo;
    let patronInicial =
      patrones.find(p => p.patron_id === previa?.id_patron_seleccionado && p.id_modelo === modeloInicial) ??
      patrones.find(p => p.id_modelo === modeloInicial) ??
      primerPatron;

    if (opcionesGuardadas?.pattern) {
      const patronGuardado = patrones.find(pt => pt.promt === opcionesGuardadas.pattern);
      if (patronGuardado) {
        patronInicial = patronGuardado;
        if (patronGuardado.id_modelo) modeloInicial = patronGuardado.id_modelo;
      }
    }

    let tipoInicial = sigueExistiendo(tiposReq.map(t => t.tipo_req), previa?.id_tipo_requerimiento)
      ? previa!.id_tipo_requerimiento!
      : tiposReq[0]?.tipo_req || '';

    if (opcionesGuardadas) {
      const tipoGuardado = opcionesGuardadas.tipo ? tiposReq.find(t => t.nombre === opcionesGuardadas.tipo) : null;
      // En modo masivo, sin tipo explícito significa "Todos (la IA los clasifica)" ('')
      tipoInicial = tipoGuardado ? tipoGuardado.tipo_req : '';
    }

    return {
      ...FORM_VACIO,
      id_tipo_requerimiento: tipoInicial,
      id_modalidad: sigueExistiendo(modalidades.map(m => m.id), previa?.id_modalidad)
        ? previa!.id_modalidad!
        : modalidades[0]?.id || '',
      id_modelo: modeloInicial,
      id_patron_seleccionado: patronInicial?.patron_id || '',
      id_equipo: equiposProyecto.length === 1
        ? equiposProyecto[0].equipo_id
        : sigueExistiendo(equiposProyecto.map(e => e.equipo_id), previa?.id_equipo)
          ? previa!.id_equipo!
          : ''
    };
  }, [modelos, patrones, tiposReq, modalidades, equiposProyecto]);

  /**
   * Pregunta al usuario si desea restaurar o descartar la generación guardada en sessionStorage.
   * Si elige restaurar, abre el modal en modo masivo con el estado recuperado y reanuda la corrida
   * si había quedado en curso. Devuelve `true` si se restauró.
   */
  const ofrecerRestaurarGeneracion = useCallback(async (): Promise<boolean> => {
    if (!proyectoId || !gen.hayGuardado) return false;
    const estadoGuardado = gen.guardado;
    const ibaEnMarcha = estadoGuardado?.fase === 'generando';
    const cantPropuestas = estadoGuardado?.propuestas?.length ?? 0;

    const restaurar = await confirmar({
      titulo: ibaEnMarcha ? '¿Reanudar la generación interrumpida?' : '¿Restaurar la generación previa?',
      mensaje: ibaEnMarcha
        ? `La generación de requerimientos se interrumpió al recargar la página${cantPropuestas > 0 ? ` (llevaba ${cantPropuestas} propuestas)` : ''}. Puedes reanudarla desde el área en que quedó sin gastar otro uso diario de IA, o descartarla.`
        : 'Hay un mapa de áreas y propuestas de esta sesión que aún no se han registrado. Puedes restaurarlos para continuar donde quedaste o descartarlos.',
      textoConfirmar: ibaEnMarcha ? 'Reanudar generación' : 'Restaurar',
      textoCancelar: 'Descartar'
    });

    if (!restaurar) {
      gen.limpiarGuardado();
      return false;
    }

    const datos = gen.aplicarGuardado();
    if (!datos) return false;

    setEditingReq(null);
    setInsertarDespuesDe(null);
    setElementosSintaxisForm(null);
    setModoMasivo(true);
    setAiPrompt(datos.userPrompt);
    setProfundidad(datos.resultado?.estado === 'rapida' ? 'rapida' : 'completa');
    setAlcanceIA(datos.opciones.alcance);
    setEstrictez(datos.opciones.estrictez ?? ESTRICTEZ_POR_DEFECTO);
    setEjemplos(datos.opciones.ejemplos ?? []);
    setFormData(construirFormInicial(datos.opciones));
    setIsModalOpen(true);
    void cargarContexto();

    if (datos.fase === 'generando' && datos.plan) {
      toast('Reanudando la generación desde donde quedó...');
      void gen.continuar(datos.userPrompt, datos.opciones, existentesParaIA(), {
        plan: datos.plan,
        areasPlan: datos.areasPlan,
        progreso: datos.progreso,
        propuestas: datos.propuestas
      }).then(res => {
        if (res.estado === 'error') {
          toast.error(res.motivo || 'No se pudo reanudar la generación.');
        } else if (res.propuestas.length > 0 && res.estado === 'completo') {
          const areas = new Set(res.propuestas.map(p => p.area)).size;
          toast.success(`Generación completada: ${res.propuestas.length} requerimientos en ${areas} ${areas === 1 ? 'área' : 'áreas'}.`);
        }
      });
    }
    return true;
  }, [proyectoId, gen, confirmar, construirFormInicial, cargarContexto, existentesParaIA]);

  // Al cargar la página (p. ej. tras un refresh en mitad de la generación), si hay una sesión
  // guardada se ofrece inmediatamente restaurarla o descartarla sin esperar a pulsar "Nuevo requerimiento".
  const avisoRecargaMostradoRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !proyectoId || !esMiembroProyecto || equiposProyecto.length === 0) return;
    if (!gen.hayGuardado || isModalOpen) return;
    if (avisoRecargaMostradoRef.current === proyectoId) return;
    avisoRecargaMostradoRef.current = proyectoId;
    void ofrecerRestaurarGeneracion();
  }, [loading, proyectoId, esMiembroProyecto, equiposProyecto.length, gen.hayGuardado, isModalOpen, ofrecerRestaurarGeneracion]);

  // Apertura de modal nuevo
  const abrirNuevo = async (despuesDe: Requerimiento | null) => {
    if (!esMiembroProyecto) {
      toast.error('Solo los miembros del proyecto pueden registrar requerimientos');
      return;
    }
    // Sin equipo no hay líder que apruebe, así que un requerimiento sin equipo se
    // quedaría esperando para siempre. Se dice aquí, no en un error de permisos
    // cinco clics más adelante.
    if (equiposProyecto.length === 0) {
      toast.error('Este proyecto no tiene equipos. Crea al menos uno antes de registrar requerimientos.');
      return;
    }

    // Si hay una generación guardada de esta sesión y aún no se ha decidido sobre ella,
    // se ofrece restaurarla o descartarla antes de abrir el modal.
    if (!despuesDe && proyectoId && gen.hayGuardado) {
      avisoRecargaMostradoRef.current = proyectoId;
      const restaurada = await ofrecerRestaurarGeneracion();
      if (restaurada) return;
    }

    setEditingReq(null);
    const codigoBase = despuesDe ? codigoDe(despuesDe) : null;
    setInsertarDespuesDe(despuesDe && codigoBase && despuesDe.numero != null ? { numero: despuesDe.numero, codigo: codigoBase } : null);
    setFormData(construirFormInicial());
    setElementosSintaxisForm(null);
    setAiPrompt('');
    gen.reiniciar();
    setIsModalOpen(true);
    void cargarContexto();
  };

  const openCreateModal = () => abrirNuevo(null);
  const openInsertModal = (req: Requerimiento) => abrirNuevo(req);

  // Apertura de modal editar
  const openEditModal = (req: Requerimiento) => {
    if (!esMiembroProyecto) {
      toast.error('Solo los miembros del proyecto pueden editar requerimientos');
      return;
    }
    // El autor no cambia al editar: `id_autor` es inmutable en las reglas
    // (`esReenvioDelAutor` y `esEdicionEnFlujoNormal` lo excluyen de las claves
    // que se pueden tocar). Aquí solo se lleva al formulario para poder mostrarlo.
    if (!puedeAbrirEditor(req)) {
      toast.error(
        estaPendienteDeAprobacion(nombreEstadoDe(req))
          ? 'Este requerimiento está esperando aprobación. Solo quien puede aprobarlo puede decidir su futuro; para corregir el texto hay que esperar la respuesta.'
          : 'Solo su autor puede corregir este requerimiento mientras está en revisión.'
      );
      return;
    }
    setEditingReq(req);
    setInsertarDespuesDe(null);
    setFormData({
      enunciado: req.enunciado,
      id_tipo_requerimiento: req.id_tipo_requerimiento || '',
      id_modalidad: req.id_modalidad || '',
      id_modelo: req.id_modelo || '',
      // Conserva el patrón guardado (KAN-28); solo como respaldo se infiere por
      // modelo, para documentos anteriores que no lo guardaban.
      id_patron_seleccionado: req.id_patron || patrones.find(p => p.id_modelo === req.id_modelo)?.patron_id || '',
      id_equipo: req.id_equipo || '',
      modulo: req.modulo || '',
      prioridad: req.prioridad || ''
    });
    setElementosSintaxisForm(req.elementos_sintaxis ?? null);
    setAiPrompt('');
    gen.reiniciar();
    setIsModalOpen(true);
    void cargarContexto();
  };

  const handleModeloChange = (nuevoModeloId: string) => {
    const primerP = patrones.find(p => p.id_modelo === nuevoModeloId);
    setFormData({
      ...formData,
      id_modelo: nuevoModeloId,
      id_patron_seleccionado: primerP?.patron_id || ''
    });
    setElementosSintaxisForm(null);
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
    setElementosSintaxisForm(null);
    const navegarAEnunciado = () => {
      const seccion = document.getElementById('seccion-enunciado') ?? document.getElementById('req-enunciado');
      seccion?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('req-enunciado')?.focus({ preventScroll: true });
    };
    requestAnimationFrame(navegarAEnunciado);
    setTimeout(navegarAEnunciado, 60);
  };

  // Guardar Requerimiento (Crear o Editar)
  const handleSaveReq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (esMasivo) {
      crearOtroRef.current = false;
      if (registrandoMasivoRef.current || gen.ocupado) return;
      if (propuestas?.some(p => p.elegida && p.texto.trim())) {
        void registrarPropuestas();
      } else {
        toast.error('Selecciona al menos un requerimiento para registrar');
      }
      return;
    }
    const crearOtro = crearOtroRef.current;
    crearOtroRef.current = false;
    if (!esMiembroProyecto) {
      toast.error('No tienes permiso para modificar requerimientos de este proyecto');
      return;
    }
    // El formulario es el único camino normal para editar, pero esta comprobación
    // también cubre el envío directo (Enter en el campo). `esReenvioDelAutor` en
    // `firestore.rules` denegaría igual, pero con un mensaje que no explica nada.
    if (editingReq && !puedeAbrirEditor(editingReq)) {
      toast.error('Solo su autor puede corregir este requerimiento.');
      return;
    }
    if (!formData.enunciado.trim()) {
      toast.error('El enunciado del requerimiento es obligatorio');
      return;
    }
    // El equipo decide quién aprueba, así que sin él el requerimiento no se puede
    // registrar. Se valida aquí además de en las reglas para que el error llegue
    // con su explicación y no como un `permission-denied` mudo.
    if (!formData.id_equipo) {
      toast.error('Elige el equipo al que pertenece el requerimiento: su líder es quien lo aprueba.');
      return;
    }

    // Ni estado, ni autor, ni aprobador. El estado inicial lo pone el servicio, el
    // autor lo pone el servicio y el aprobador solo lo escribe quien aprueba. Si se
    // mandaran aquí, `datosDeAlta` los sobrescribiría igualmente y el historial
    // describiría un cambio que no ocurrió.
    const elementosVigentes = formData.id_patron_seleccionado
      ? filtrarElementosPresentes(formData.enunciado.trim(), elementosEnunciado)
      : null;

    const datos = {
      enunciado: formData.enunciado.trim(),
      id_tipo_requerimiento: formData.id_tipo_requerimiento || null,
      id_modalidad: formData.id_modalidad || null,
      id_modelo: formData.id_modelo || null,
      // Plantilla usada al redactar (KAN-28): viaja en el alta y en la edición
      // para que la especificación exportada la muestre. Las reglas la admiten
      // en el alta (`isValidRequerimientoCreate`) y no la prohíben al editar.
      id_patron: formData.id_patron_seleccionado || null,
      id_equipo: formData.id_equipo,
      // Módulo y prioridad (KAN-44): se ven y se editan tanto al crear como al
      // editar. Los requerimientos antiguos los guardan en null y siguen igual.
      modulo: formData.modulo.trim() || null,
      prioridad: formData.prioridad ? (formData.prioridad as PrioridadMoSCoW) : null,
      ...(elementosVigentes ? { elementos_sintaxis: elementosVigentes } : {})
    };

    setSaving(true);
    let siguientePosicion: { numero: number; codigo: string } | null = null;
    try {
      if (editingReq) {
        const camposModificados = CAMPOS_EDITABLES.filter(
          ([campoReq]) => (editingReq[campoReq] || null) !== datos[campoReq]
        );
        const cambioSintaxis =
          JSON.stringify(editingReq.elementos_sintaxis ?? null) !== JSON.stringify(elementosVigentes);
        const cambios = camposModificados.map(([, nombre]) => nombre);
        if (cambios.length === 0 && !cambioSintaxis) {
          toast('No hay cambios que guardar');
          setIsModalOpen(false);
          return;
        }

        const nombreValorClasificacion = (campo: string, id: string | null) => {
          if (!id) {
            return {
              tipo: 'Sin tipo',
              modalidad: 'Sin modalidad',
              modelo: 'Sin modelo',
              patrón: 'Sin patrón'
            }[campo] || 'Sin valor';
          }
          switch (campo) {
            case 'tipo':
              return tiposReq.find(tipo => tipo.tipo_req === id)?.nombre || 'Tipo no disponible';
            case 'modalidad':
              return modalidades.find(modalidad => modalidad.id === id)?.nombre_modalidad || 'Modalidad no disponible';
            case 'modelo':
              return modelos.find(modelo => modelo.id === id)?.nombre || 'Modelo no disponible';
            case 'patrón':
              return patrones.find(patron => patron.patron_id === id)?.nombre || 'Patrón no disponible';
            case 'módulo':
              return id || 'Sin módulo';
            case 'prioridad':
              return id === 'Wont' ? "Won't" : (id || 'Sin prioridad');
            default:
              return id;
          }
        };
        const cambiosClasificacion = camposModificados
          .filter(([campoReq]) => campoReq !== 'enunciado')
          .map(([campoReq, nombre]) => ({
            campo: nombre,
            anterior: nombreValorClasificacion(nombre, editingReq[campoReq] || null),
            nuevo: nombreValorClasificacion(nombre, datos[campoReq] || null),
            anteriorId: editingReq[campoReq] || null,
            nuevoId: datos[campoReq] || null
          }));

        // El equipo no se manda al editar. Es inmutable por dos motivos: las reglas lo
        // excluyen de las claves editables (`esReenvioDelAutor` y
        // `esEdicionEnFlujoNormal`), y cambiarlo movería al juez: un requerimiento
        // rechazado que pasa al equipo de otro líder se esquivaría de la revisión que
        // letocaba. El selector está deshabilitado mientras se edita por lo mismo.
        await actualizarRequerimientoConHistorial(editingReq.id, {
          enunciado: datos.enunciado,
          id_tipo_requerimiento: datos.id_tipo_requerimiento,
          id_modalidad: datos.id_modalidad,
          id_modelo: datos.id_modelo,
          id_patron: datos.id_patron,
          modulo: datos.modulo,
          prioridad: datos.prioridad,
          elementos_sintaxis: elementosVigentes
        }, uid!, cambios.length > 0 ? cambios : ['sintaxis'], cambiosClasificacion);
        toast.success('Requerimiento actualizado');
      } else {
        let newReq: Requerimiento;
        let renumerados = 0;
        if (insertarDespuesDe) {
          const resultado = await insertarRequerimientoDespuesDe(
            proyectoId!,
            insertarDespuesDe.numero,
            { ...datos, id_proyecto: proyectoId! },
            uid!
          );
          newReq = resultado.requerimiento;
          renumerados = resultado.renumerados;
          // Para "insertar y añadir otro": el siguiente va justo después del que se acaba de insertar
          siguientePosicion = { numero: newReq.numero!, codigo: codigoDe(newReq)! };
        } else {
          // KAN-18: `uid` es el autor y el requerimiento nace pendiente de aprobación. El
        // servicio lo impone, no esta página.
        newReq = await createRequerimiento({ ...datos, id_proyecto: proyectoId! }, uid!);
        }
        if (newReq?.id) {
          await addLogRequerimiento({
            id_requerimiento: newReq.id,
            accion: 'Creación de requerimiento',
            id_autor: uid,
            detalles: insertarDespuesDe
              ? {
                  inicio: `Insertado después de ${insertarDespuesDe.codigo}`,
                  renumerados,
                  enunciado_nuevo: newReq.enunciado
                }
              : { inicio: 'Creación inicial', enunciado_nuevo: newReq.enunciado }
          });
        }
        toast.success(
          insertarDespuesDe
            ? `Registrado como ${codigoDe(newReq)}.` +
              (renumerados > 0 ? ` Los ${renumerados} siguientes subieron un número.` : '')
            : `Requerimiento registrado. Queda pendiente de que lo apruebe el líder de ${nombreEquipoDe(formData.id_equipo)}.`
        );
        ultimaClasificacionRef.current = {
          id_tipo_requerimiento: formData.id_tipo_requerimiento,
          id_modalidad: formData.id_modalidad,
          id_modelo: formData.id_modelo,
          id_patron_seleccionado: formData.id_patron_seleccionado,
          id_equipo: formData.id_equipo,
          modulo: formData.modulo,
          prioridad: formData.prioridad
        };
      }

      if (crearOtro && !editingReq) {
        // Se queda abierto con la misma clasificación para redactar el siguiente
        setFormData(prev => ({ ...prev, enunciado: '' }));
        setElementosSintaxisForm(null);
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

  // ==========================================
  // GENERACIÓN CON IA
  // ==========================================
  const tipoSeleccionado = tiposReq.find(t => t.tipo_req === formData.id_tipo_requerimiento) ?? null;
  const carpetasContexto = archivosContexto.filter(a => a.tipo === 'carpeta');
  // El modo masivo no aplica al editar ni al insertar en una posición concreta
  const masivoDisponible = !editingReq && !insertarDespuesDe;
  const esMasivo = modoMasivo && masivoDisponible;
  // Mismo criterio que el envío: seleccionadas, con texto y sin claves repetidas.
  const cantidadSeleccionada = prepararRegistro(propuestas ?? []).elegidas.length;

  /** Tipo del catálogo que corresponde a la categoría FURPS que devolvió la IA. */
  const tipoDesdeFurps = (furps?: AIRequirement['type_furps']) => {
    const inicio = furps ? TIPO_POR_FURPS[furps] : undefined;
    return inicio ? tiposReq.find(t => t.nombre.toLowerCase().startsWith(inicio))?.tipo_req ?? null : null;
  };

  const opcionesIA = () => ({
    pattern: patronSeleccionado?.promt,
    tipo: tipoSeleccionado?.nombre,
    estrictez,
    ejemplos,
    contexto: proyecto ? construirContextoIA(proyecto, archivosContexto, carpetasElegidas) : undefined
  });

  const idGeneradoConIA = () => modalidades.find(m => m.nombre_modalidad === MODALIDAD_GENERADO_IA)?.id;

  const handleAIGenerate = async () => {
    // Si el plan ya está listo para revisar, bajar la vista al mapa de áreas
    if (gen.fase === 'revisando-plan') {
      const seccion = document.getElementById('gen-mapa') ?? document.getElementById('contenedor-generacion-ia');
      seccion?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // Enter en el campo de la IA no debe lanzar otra generación encima de la que está en marcha
    if (isAILoading || gen.ocupado) return;
    if (!aiPrompt.trim()) {
      toast.error(esMasivo ? 'Describe qué parte del sistema (o el sistema completo) quieres especificar' : 'Describe la funcionalidad para generar el requerimiento');
      return;
    }
    if (esMasivo) {
      // Al iniciar generación, bajar la vista al panel del plan/progreso
      requestAnimationFrame(() => {
        document.getElementById('contenedor-generacion-ia')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return handleAIGenerateMasivo();
    }

    setIsAILoading(true);
    try {
      const generated = await generateSingleRequirement(aiPrompt, opcionesIA(), avisoColaToast());
      if (generated && generated.valido === false) {
        // La IA no inventa: si el texto no da base, se explica qué falta y se conserva lo escrito
        toast.error(generated.motivo || 'No se pudo identificar qué debe hacer el sistema. Descríbelo con más detalle.');
      } else if (generated && generated.name) {
        // KAN-18: "Generar req con IA" marca la modalidad "Generado con IA" sin
        // que nadie la elija. Si el catálogo no la tiene, se avisa y se deja la
        // modalidad como estaba: es información de la tarjeta, no un dato que
        // impida registrar el requerimiento.
        const idIA = idGeneradoConIA();
        setFormData(prev => ({
          ...prev,
          enunciado: generated.name,
          id_modalidad: idIA ?? prev.id_modalidad,
          // Sin tipo elegido, se usa el que la IA le asignó
          id_tipo_requerimiento: prev.id_tipo_requerimiento || tipoDesdeFurps(generated.type_furps) || ''
        }));
        setElementosSintaxisForm(generated.elementos_sintaxis ?? null);
        requestAnimationFrame(() => {
          document.getElementById('req-enunciado')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        toast.success(
          idIA
            ? "Requerimiento generado. Revísalo antes de guardar."
            : "Requerimiento generado, pero falta la modalidad \"Generado con IA\" en el catálogo: pídela a quien administre el proyecto para que la marca se vea."
        );
        setAiPrompt('');
      } else {
        toast.error("La IA no devolvió un requerimiento. Intenta describirlo con más detalle.");
      }
    } catch (err) {
      toast.error(err instanceof AIError ? err.message : "No se pudo conectar con el servicio de IA. Inténtalo de nuevo.");
    } finally {
      setIsAILoading(false);
    }
  };

  /**
   * Varios requerimientos. "Completa" (KAN-40): la IA arma un mapa de áreas que el usuario edita
   * y luego redacta cada área por lotes hasta cubrirla. "Rápida": la generación masiva de una sola
   * pasada. En las dos se descarta lo que repite requerimientos existentes.
   */
  const handleAIGenerateMasivo = async () => {
    if (profundidad === 'rapida') {
      setIsAILoading(true);
      try {
        const r = await gen.iniciarRapida(aiPrompt, { ...opcionesIA(), existentes: existentesParaIA() });
        if (r.cantidad === 0) {
          toast.error(r.motivo || 'La IA no propuso nada nuevo: lo que encontró ya está en el proyecto.');
        } else {
          toast.success(
            `La IA propuso ${r.cantidad} requerimientos${r.descartadas ? ` (descartó ${r.descartadas} repetidos)` : ''}. Revísalos antes de registrarlos.`
          );
        }
      } finally {
        setIsAILoading(false);
      }
      return;
    }

    const res = await gen.iniciar(aiPrompt, { ...opcionesIA(), alcance: alcanceIA, existentes: existentesParaIA() });
    if (res.estado === 'invalido' || (res.estado === 'error' && res.propuestas.length === 0)) {
      toast.error(res.motivo || 'La IA no encontró requerimientos que respalden el pedido. Detállalo más o agrega contexto al proyecto.');
    } else if (res.propuestas.length > 0) {
      const areas = new Set(res.propuestas.map(p => p.area)).size;
      toast.success(`La IA propuso ${res.propuestas.length} requerimientos en ${areas} ${areas === 1 ? 'área' : 'áreas'}. Revísalos antes de registrarlos.`);
    } else if (res.estado === 'completo') {
      toast('La IA no encontró nada nuevo: lo que pide el texto ya está en el proyecto.');
    }
  };

  /**
   * Registra únicamente las propuestas seleccionadas con la clasificación del formulario. Los
   * números se reservan de una vez y los documentos se escriben por lotes
   * (`crearRequerimientosEnLote`); el área de la IA se guarda como módulo.
   *
   * La selección vive en las propuestas, no en un estado aparte: lo que se manda al servicio es
   * exactamente lo que el usuario marcó. `registrandoMasivoRef` cubre el doble clic y el Enter
   * repetido antes de que React alcance a deshabilitar el botón.
   */
  const registrarPropuestas = async () => {
    if (registrandoMasivoRef.current) return;

    if (!esMiembroProyecto || !uid) {
      toast.error('No tienes permiso para registrar requerimientos en este proyecto');
      return;
    }

    const { elegidas, sinTexto } = prepararRegistro(propuestas ?? []);
    if (elegidas.length === 0 && sinTexto === 0) {
      toast.error('Elige al menos un requerimiento para registrar');
      return;
    }
    if (sinTexto > 0) {
      toast.error(
        `Hay ${sinTexto} ${sinTexto === 1 ? 'propuesta seleccionada' : 'propuestas seleccionadas'} sin texto. Escribe el enunciado o desmárcalas antes de registrar.`
      );
      return;
    }
    if (!formData.id_equipo) {
      toast.error('Elige el equipo al que pertenecen los requerimientos: su líder es quien los aprueba.');
      return;
    }

    const totalPropuestas = (propuestas ?? []).length;
    const totalTexto = `${totalPropuestas} ${totalPropuestas === 1 ? 'propuesta' : 'propuestas'}`;
    registrandoMasivoRef.current = true;
    const ok = await confirmar({
      titulo: `¿Registrar ${elegidas.length} ${elegidas.length === 1 ? 'requerimiento' : 'requerimientos'}?`,
      mensaje: `Se registrarán ${elegidas.length} de ${totalTexto}. Las que no seleccionaste no se registrarán. Quedarán pendientes de aprobación del líder de ${nombreEquipoDe(formData.id_equipo)}.`,
      textoConfirmar: 'Registrar'
    });
    if (!ok) {
      registrandoMasivoRef.current = false;
      return;
    }

    const idIA = idGeneradoConIA();
    const moduloDe = (p: PropuestaRevisable) => {
      const area = p.area.trim().slice(0, 120);
      return area && !AREAS_SIN_MODULO.has(area.toLowerCase()) ? area : null;
    };
    setRegistrandoMasivo({ hechos: 0, total: elegidas.length });
    try {
      const { creados, error, logsFallidos } = await crearRequerimientosEnLote(
        proyectoId!,
        elegidas.map(p => {
          const enunciadoLimpio = p.texto.trim();
          const sintaxis = formData.id_patron_seleccionado
            ? filtrarElementosPresentes(enunciadoLimpio, p.elementos_sintaxis)
            : null;
          return {
            enunciado: enunciadoLimpio,
            id_tipo_requerimiento: formData.id_tipo_requerimiento || tipoDesdeFurps(p.type_furps),
            id_modalidad: idIA ?? (formData.id_modalidad || null),
            id_modelo: formData.id_modelo || null,
            id_patron: formData.id_patron_seleccionado || null,
            id_equipo: formData.id_equipo,
            modulo: moduloDe(p),
            origen_ia: p.origen ?? null,
            prioridad: p.prioridad ?? null,
            ...(sintaxis ? { elementos_sintaxis: sintaxis } : {})
          };
        }),
        uid,
        { inicio: 'Generación masiva con IA' },
        (hechos, total) => setRegistrandoMasivo({ hechos, total })
      );
      // Las que ya se registraron salen de la lista para no duplicarlas al reintentar
      gen.quitar(new Set(elegidas.slice(0, creados.length).map(p => p.clave)));
      if (logsFallidos > 0) {
        toast.error(
          `${logsFallidos} ${logsFallidos === 1 ? 'requerimiento se registró' : 'requerimientos se registraron'} sin su entrada de historial.`
        );
      }
      if (error) {
        console.error(error);
        toast.error(mensajeError(error, `Se registraron ${creados.length} de ${elegidas.length}. No se pudo registrar el resto`));
        return;
      }
      toast.success(
        `${creados.length} ${creados.length === 1 ? 'requerimiento registrado' : 'requerimientos registrados'}. Quedan pendientes de que los apruebe el líder de ${nombreEquipoDe(formData.id_equipo)}.`
      );
      ultimaClasificacionRef.current = {
        id_tipo_requerimiento: formData.id_tipo_requerimiento,
        id_modalidad: formData.id_modalidad,
        id_modelo: formData.id_modelo,
        id_patron_seleccionado: formData.id_patron_seleccionado,
        id_equipo: formData.id_equipo
      };
      // Si quedan propuestas sin elegir, el modal sigue abierto para registrarlas después.
      if ((propuestas ?? []).length === elegidas.length) {
        gen.reiniciar();
        setAiPrompt('');
        setIsModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudieron registrar los requerimientos'));
    } finally {
      registrandoMasivoRef.current = false;
      setRegistrandoMasivo(null);
      fetchRequerimientos();
    }
  };

  // ==========================================
  // DECISIÓN DE APROBACIÓN (KAN-18)
  // ==========================================
  // El estado ya no se cambia con un desplegable. Antes cualquier miembro del
  // proyecto podía poner el que quisiera, incluido "Aprobado", y su propio
  // requerimiento se saltaba la revisión solo. Ahora hay dos verbos y cada uno
  // responde a una pregunta distinta: el líder acepta o rechaza; el autor devuelve
  // el suyo tras corregirlo.
  const handleDecision = async (req: Requerimiento, decision: 'aprobar' | 'rechazar') => {
    if (!puedeDecidir(req)) {
      toast.error('Solo el líder del equipo de este requerimiento puede aprobarlo o devolverlo.');
      return;
    }
    const anterior = nombreEstadoDe(req);
    const ok = await confirmar({
      titulo: decision === 'aprobar' ? '¿Aprobar requerimiento?' : '¿Devolver requerimiento?',
      mensaje: decision === 'aprobar'
        ? 'El requerimiento entra al flujo normal y a partir de aquí lo edita cualquier miembro del proyecto.'
        : 'Vuelve al autor para que lo corrija y lo reenvíe. El motivo queda en el historial del requerimiento.',
      textoConfirmar: decision === 'aprobar' ? 'Aprobar' : 'Devolver',
      peligro: decision === 'rechazar'
    });
    if (!ok) return;

    try {
      await decidirAprobacionRequerimiento(req.id, decision, uid!);
      await addLogRequerimiento({
        id_requerimiento: req.id,
        accion: decision === 'aprobar' ? 'Aprobación del líder' : 'Rechazo del líder',
        id_autor: uid,
        detalles: {
          estado_anterior: anterior,
          estado_nuevo: decision === 'aprobar' ? ESTADO_APROBADO : ESTADO_RECHAZADO
        }
      });
      toast.success(
        decision === 'aprobar'
          ? `${codigoDe(req) ?? 'Requerimiento'} aprobado. Ya continúa con el flujo normal.`
          : `${codigoDe(req) ?? 'Requerimiento'} devuelto. Su autor puede corregirlo y reenviarlo.`
      );
      fetchRequerimientos();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo registrar la decisión'));
    }
  };

  /** El autor devuelve su requerimiento devuelto al ciclo de aprobación. */
  const handleReenviar = async (req: Requerimiento) => {
    if (!puedeReenviarEste(req)) {
      toast.error('Solo su autor puede reenviar un requerimiento devuelto.');
      return;
    }
    try {
      await reenviarRequerimientoAprobacion(req.id);
      await addLogRequerimiento({
        id_requerimiento: req.id,
        accion: 'Reenvío a aprobación',
        id_autor: uid,
        detalles: { estado_anterior: nombreEstadoDe(req), estado_nuevo: ESTADO_PENDIENTE_APROBACION }
      });
      toast.success('Reenviado. Vuelve a estar pendiente de aprobación.');
      fetchRequerimientos();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo reenviar el requerimiento'));
    }
  };

  /** Marca un requerimiento aprobado como implementado: el desarrollo terminó. */
  const handleMarcarImplementado = async (req: Requerimiento) => {
    if (!puedeMarcarImplementado(esMiembroProyecto, nombreEstadoDe(req))) {
      toast.error('Solo los miembros del proyecto pueden marcar como implementado.');
      return;
    }
    const ok = await confirmar({
      titulo: '¿Marcar como implementado?',
      mensaje: '¿Estás seguro de que el desarrollo/programación de este requerimiento ha finalizado? Esta acción cambia el estado a "Implementado" y registra la transición en el historial.',
      textoConfirmar: 'Marcar como implementado',
      textoCancelar: 'Cancelar'
    });
    if (!ok) return;
    try {
      await marcarRequerimientoImplementado(req.id, uid!);
      toast.success('Requerimiento marcado como implementado');
      fetchRequerimientos();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo marcar el requerimiento como implementado'));
    }
  };

  /** Reabre un requerimiento implementado y lo devuelve a "Aprobado". */
  const handleReabrirRequerimiento = async (req: Requerimiento) => {
    if (!puedeReabrirRequerimiento(esMiembroProyecto, nombreEstadoDe(req))) {
      toast.error('Solo los miembros del proyecto pueden reabrir un requerimiento.');
      return;
    }
    const ok = await confirmar({
      titulo: '¿Reabrir requerimiento?',
      mensaje: '¿El requerimiento tiene un error o queda trabajo pendiente? Esta acción regresa el estado a "Aprobado" y permite retomar el desarrollo.',
      textoConfirmar: 'Reabrir',
      textoCancelar: 'Cancelar'
    });
    if (!ok) return;
    try {
      await reabrirRequerimientoAprobado(req.id, uid!);
      toast.success('Requerimiento regresado a aprobado');
      fetchRequerimientos();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo reabrir el requerimiento'));
    }
  };

  // Eliminar Requerimiento
  const handleDeleteReq = (req: Requerimiento) => {
    // Borrar sigue igual que antes de KAN-18: lo que las reglas permiten es a
    // cualquier autenticado, así que el botón no se estrecha más de lo que ya estaba.
    if (!esMiembroProyecto || !uid) {
      toast.error('Solo los miembros del proyecto pueden eliminar requerimientos');
      return;
    }
    // Sin «¿Seguro?»: se quita de la lista al momento y se borra de verdad
    // pasados unos segundos, con «Deshacer» a mano por si fue un error.
    accionConDeshacer({
      mensaje: `${codigoDe(req) ?? 'Requerimiento'} eliminado`,
      alAplicar: () => {
        eliminandoRef.current.add(req.id);
        setRequerimientos(prev => prev.filter(r => r.id !== req.id));
      },
      alDeshacer: () => {
        eliminandoRef.current.delete(req.id);
        void fetchRequerimientos();
      },
      alConfirmar: async () => {
        try {
          const renumerados = await deleteRequerimiento(req.id, uid);
          if (renumerados > 0) toast.success(`Se actualizaron ${renumerados} identificadores.`);
        } catch (e) {
          toast.error(mensajeError(e, 'No se pudo eliminar el requerimiento'));
        } finally {
          eliminandoRef.current.delete(req.id);
          await fetchRequerimientos();
        }
      },
    });
  };

  // Ver Logs del Requerimiento
  const handleViewLogs = async (req: Requerimiento) => {
    setCurrentReqForLogs(req);
    setSelectedReqLogs([]);
    setLogsError(null);
    setLoadingLogs(true);
    try {
      setSelectedReqLogs(await getLogsRequerimientos(req.id));
    } catch (e) {
      const mensaje = mensajeError(e, 'No se pudo cargar el historial');
      setLogsError(mensaje);
      toast.error(mensaje);
    } finally {
      setLoadingLogs(false);
    }
  };

  // ==========================================================
  // COMENTARIOS (KAN-27)
  // ==========================================================
  // El contador que muestra la tarjeta vive en el propio requerimiento y lo mueve
  // el servicio junto al comentario. Mientras el hilo está abierto se mantiene una
  // suscripción en vivo: si otra persona publica, corrige o borra, la lista se
  // actualiza sin cerrar el modal. La longitud de cada emisión es la fuente que
  // corrige el indicador de la tarjeta, sin una consulta de conteo por requerimiento.

  // Cada apertura recibe un testigo. Si mientras se repara la caché se cierra el
  // modal o se abre otro hilo, el testigo deja de coincidir y esa apertura no
  // llega a suscribirse. Sin él, cerrar y reabrir el mismo requerimiento podía
  // dejar dos escuchas vivas.
  const aperturaComentariosRef = useRef(0);
  const cerrarSuscripcionComentariosRef = useRef<(() => void) | null>(null);
  // Un ref, y no el estado, porque dos clics seguidos comparten el mismo render y
  // `guardandoComentario` todavía valdría `false` en el segundo.
  const guardandoComentarioRef = useRef(false);

  const ajustarConteoComentarios = (requerimientoId: string, total: number) => {
    setRequerimientos(prev =>
      prev.map(r => (r.id === requerimientoId ? { ...r, total_comentarios: total } : r))
    );
    setReqComentarios(prev =>
      prev && prev.id === requerimientoId ? { ...prev, total_comentarios: total } : prev
    );
  };

  const cerrarSuscripcionComentarios = useCallback(() => {
    cerrarSuscripcionComentariosRef.current?.();
    cerrarSuscripcionComentariosRef.current = null;
  }, []);

  // La escucha no puede sobrevivir a la página: al desmontar se cancela y se
  // invalida cualquier apertura que siga esperando la reparación de la caché.
  useEffect(() => () => {
    aperturaComentariosRef.current++;
    cerrarSuscripcionComentarios();
  }, [cerrarSuscripcionComentarios]);

  const cerrarComentarios = useCallback(() => {
    aperturaComentariosRef.current++;
    cerrarSuscripcionComentarios();
    setReqComentarios(null);
  }, [cerrarSuscripcionComentarios]);

  const abrirComentarios = async (req: Requerimiento) => {
    const apertura = ++aperturaComentariosRef.current;
    cerrarSuscripcionComentarios();
    setReqComentarios(req);
    setComentarios([]);
    setComentariosError(null);
    setLoadingComentarios(true);

    // Si la membresía llega por un equipo, las reglas leen el puntero de acceso
    // del proyecto. Se asegura antes de abrir el hilo: si el usuario salió del
    // equipo o el equipo se desvinculó, el puntero se repara o se descarta.
    let acceso = false;
    if (uid) {
      try {
        acceso = await asegurarAccesoComentariosProyecto(req.id_proyecto, uid);
      } catch (e) {
        if (apertura !== aperturaComentariosRef.current) return;
        const mensaje = mensajeError(e, 'No se pudo comprobar el acceso a los comentarios');
        setComentariosError(mensaje);
        setLoadingComentarios(false);
        toast.error(mensaje);
        return;
      }
    }

    // El modal pudo cerrarse (o cambiarse de requerimiento) mientras se comprobaba
    // el acceso. Sin esta comprobación quedaría una escucha abierta sin modal que la use.
    if (apertura !== aperturaComentariosRef.current) return;

    if (!acceso) {
      const mensaje = 'No tienes acceso a los comentarios de este proyecto.';
      setComentariosError(mensaje);
      setLoadingComentarios(false);
      toast.error(mensaje);
      return;
    }

    cerrarSuscripcionComentariosRef.current = suscribirComentariosRequerimiento(
      req.id,
      hilo => {
        setComentarios(hilo);
        setComentariosError(null);
        setLoadingComentarios(false);
        ajustarConteoComentarios(req.id, hilo.length);
      },
      error => {
        const mensaje = mensajeError(error, 'No se pudo cargar los comentarios');
        setComentariosError(mensaje);
        setLoadingComentarios(false);
        toast.error(mensaje);
      }
    );
  };

  const handlePublicarComentario = async (texto: string): Promise<boolean> => {
    const req = reqComentarios;
    if (!req || !uid || guardandoComentarioRef.current) return false;
    guardandoComentarioRef.current = true;
    setGuardandoComentario(true);
    try {
      await crearComentario(req.id, texto, uid);
      // El hilo y el contador se actualizan solos con la emisión de la suscripción.
      toast.success('Comentario publicado.');
      return true;
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo publicar el comentario'));
      return false;
    } finally {
      guardandoComentarioRef.current = false;
      setGuardandoComentario(false);
    }
  };

  const handleEditarComentario = async (
    comentario: Comentario,
    texto: string
  ): Promise<boolean> => {
    const req = reqComentarios;
    if (!req || guardandoComentarioRef.current) return false;
    guardandoComentarioRef.current = true;
    setGuardandoComentario(true);
    try {
      await editarComentario(req.id, comentario.id, texto);
      toast.success('Comentario corregido.');
      return true;
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo corregir el comentario'));
      return false;
    } finally {
      guardandoComentarioRef.current = false;
      setGuardandoComentario(false);
    }
  };

  // Comentarios borrados que aún se pueden deshacer: se esconden del hilo mientras tanto
  const [comentariosOcultos, setComentariosOcultos] = useState<ReadonlySet<string>>(new Set());
  const mostrarComentario = (id: string, mostrar: boolean) =>
    setComentariosOcultos(prev => {
      const sig = new Set(prev);
      if (mostrar) sig.delete(id);
      else sig.add(id);
      return sig;
    });

  const handleBorrarComentario = (comentario: Comentario) => {
    const req = reqComentarios;
    if (!req) return;
    accionConDeshacer({
      mensaje: 'Comentario borrado',
      alAplicar: () => mostrarComentario(comentario.id, false),
      alDeshacer: () => mostrarComentario(comentario.id, true),
      alConfirmar: async () => {
        try {
          await borrarComentario(req.id, comentario.id);
        } catch (e) {
          toast.error(mensajeError(e, 'No se pudo borrar el comentario'));
        } finally {
          mostrarComentario(comentario.id, true);
        }
      },
    });
  };

  const handleRestoreVersion = async (log: LogRequerimiento) => {
    const req = currentReqForLogs;
    const detalles = log.detalles;
    const cambiosClasificacionOriginales = Array.isArray(detalles?.cambios_clasificacion)
      ? detalles.cambios_clasificacion.filter(
          cambio => cambio &&
            typeof cambio.campo === 'string' &&
            typeof cambio.anterior === 'string'
        )
      : [];
    const resolverIdClasificacion = (campo: string, nombre: string): string | null | undefined => {
      const sinValor = {
        tipo: 'Sin tipo',
        modalidad: 'Sin modalidad',
        modelo: 'Sin modelo',
        patrón: 'Sin patrón'
      }[campo];
      if (nombre === sinValor) return null;

      const opciones = {
        tipo: tiposReq
          .filter(tipo => tipo.nombre === nombre)
          .map(tipo => tipo.tipo_req),
        modalidad: modalidades
          .filter(modalidad => modalidad.nombre_modalidad === nombre)
          .map(modalidad => modalidad.id),
        modelo: modelos.filter(modelo => modelo.nombre === nombre).map(modelo => modelo.id),
        patrón: patrones.filter(patron => patron.nombre === nombre).map(patron => patron.patron_id)
      }[campo];
      return opciones?.length === 1 ? opciones[0] : undefined;
    };
    const cambiosClasificacion = cambiosClasificacionOriginales.map(cambio => ({
      ...cambio,
      anteriorId: typeof cambio.anteriorId === 'string' || cambio.anteriorId === null
        ? cambio.anteriorId
        : resolverIdClasificacion(cambio.campo, cambio.anterior),
      nuevoId: typeof cambio.nuevoId === 'string' || cambio.nuevoId === null
        ? cambio.nuevoId
        : resolverIdClasificacion(cambio.campo, cambio.nuevo)
    }));
    const cambiosClasificacionRestaurables = cambiosClasificacion.filter(
      cambio => typeof cambio.anteriorId === 'string' || cambio.anteriorId === null
    );
    const tieneEnunciadoAnterior = typeof detalles?.enunciado_anterior === 'string';
    if (!req || !esMiembroProyecto || !puedeAbrirEditor(req) || !uid) {
      toast.error('No tienes permiso para restaurar esta versión.');
      return;
    }
    if (cambiosClasificacionRestaurables.length !== cambiosClasificacionOriginales.length) {
      toast.error('No se puede identificar de forma única alguno de los valores de esta versión en el catálogo.');
      return;
    }
    if (!tieneEnunciadoAnterior && cambiosClasificacionRestaurables.length === 0) {
      toast.error('Esta versión no contiene valores anteriores que se puedan restaurar.');
      return;
    }

    const logRestaurable: LogRequerimiento = {
      ...log,
      detalles: {
        ...detalles,
        cambios_clasificacion: cambiosClasificacionRestaurables
      }
    };
    const ok = await confirmar({
      titulo: '¿Restaurar esta versión?',
      mensaje: 'Los campos que cambiaron volverán a los valores de esta versión. La restauración quedará registrada como un cambio nuevo.',
      textoConfirmar: 'Restaurar versión'
    });
    if (!ok) return;

    setRestoringLogId(log.id);
    try {
      const restaurado = await restaurarVersionRequerimiento(req.id, logRestaurable, uid);
      if (!restaurado) {
        toast('El requerimiento ya tiene los valores de esta versión.');
        return;
      }
      const [requerimientosActualizados] = await Promise.all([
        getRequerimientos(req.id_proyecto),
        getLogsRequerimientos(req.id).then(setSelectedReqLogs)
      ]);
      setRequerimientos(
        requerimientosActualizados.sort((a, b) =>
          (b.created_at || '').localeCompare(a.created_at || '')
        )
      );
      const actualizado = requerimientosActualizados.find(item => item.id === req.id) ?? null;
      if (actualizado) setCurrentReqForLogs(actualizado);
      toast.success('Versión restaurada y registrada en el historial.');
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo restaurar la versión'));
    } finally {
      setRestoringLogId(null);
    }
  };

  // Filtrado de lista
  const termino = searchTerm.trim().toLowerCase();
  const hayFiltros = termino !== '' || filterEstado !== 'todos' || filterTipo !== 'todos' || filterModelo !== 'todos' || filterModulo !== 'todos';
  // Módulos que usan los requerimientos del proyecto (los pone la generación con IA, KAN-40)
  const modulosProyecto = [...new Set(requerimientos.map(r => r.modulo?.trim()).filter((m): m is string => !!m))]
    .sort((a, b) => a.localeCompare(b));
  const limpiarFiltros = () => setFiltros(f => ({ ...FILTROS_INICIALES, orden: f.orden, agrupar: f.agrupar }));
  // Filtros del panel que no están en su valor por defecto, como chips que se quitan con un clic.
  // El estado no entra: ya se ve en el control segmentado.
  const filtrosActivos: { clave: string; etiqueta: string; quitar: () => void }[] = [
    ...(termino !== '' ? [{ clave: 'q', etiqueta: `“${searchTerm.trim()}”`, quitar: () => setSearchTerm('') }] : []),
    ...(filterTipo !== 'todos'
      ? [{ clave: 'tipo', etiqueta: tiposReq.find(t => String(t.tipo_req) === String(filterTipo))?.nombre ?? 'Tipo', quitar: () => setFilterTipo('todos') }]
      : []),
    ...(filterModelo !== 'todos'
      ? [{ clave: 'modelo', etiqueta: modelos.find(m => String(m.id) === String(filterModelo))?.nombre ?? 'Modelo', quitar: () => setFilterModelo('todos') }]
      : []),
    ...(filterModulo !== 'todos'
      ? [{ clave: 'modulo', etiqueta: filterModulo === '__sin__' ? 'Sin módulo' : filterModulo, quitar: () => setFilterModulo('todos') }]
      : []),
  ];
  // Coincidencia con todo salvo el estado: sirve para contar cuántos hay en cada pestaña de estado
  const numeroBuscado = numeroDesdeBusqueda(termino);
  const coincideSinEstado = (r: Requerimiento) =>
    (!termino ||
      r.enunciado.toLowerCase().includes(termino) ||
      (numeroBuscado !== null && r.numero === numeroBuscado) ||
      !!codigoDe(r)?.toLowerCase().includes(termino)) &&
    (filterTipo === 'todos' || r.id_tipo_requerimiento === filterTipo) &&
    (filterModelo === 'todos' || r.id_modelo === filterModelo) &&
    (filterModulo === 'todos' || (filterModulo === '__sin__' ? !r.modulo?.trim() : r.modulo?.trim() === filterModulo));
  const esDelEstado = (r: Requerimiento, id: string) =>
    id === 'todos' || (id === 'sin-estado' ? !r.id_estado : r.id_estado === id);
  const requerimientosBase = requerimientos.filter(coincideSinEstado);
  const conteoEstado = (id: string) => requerimientosBase.filter(r => esDelEstado(r, id)).length;
  const filteredRequerimientos = requerimientosBase.filter(r => esDelEstado(r, filterEstado));
  // El orden deseado de izquierda a derecha. Comparamos en minúsculas.
  // "rechaz" atrapa "Rechazado" y "Rechazada", que es como se llama este estado en
  // el catálogo sembrado y en `firestore.rules` (`esEstadoRechazado`).
  const ORDEN_PESTANAS = ['pendiente', 'rechaz', 'aprobado'];

  const getPesoPestana = (nombre: string) => {
    const min = nombre.toLowerCase();
    const index = ORDEN_PESTANAS.findIndex(k => min.includes(k));
    return index === -1 ? 99 : index; // Si hay otros estados extraños, los manda al final
  };

  const estadosOrdenados = [...estados].sort((a, b) => getPesoPestana(a.nombre_estado) - getPesoPestana(b.nombre_estado));

  const pestanasEstado = [
    { id: 'todos', nombre: 'Todos' },
    ...estadosOrdenados.map(e => ({ id: e.id, nombre: e.nombre_estado })),
    ...(requerimientos.some(r => !r.id_estado) ? [{ id: 'sin-estado', nombre: 'Sin estado' }] : [])
  ];
  // Orden de la pantalla, reutilizable: la exportación de "todos" usa el mismo.
  const ordenarParaPantalla = (lista: Array<Requerimiento>) => [...lista].sort((a, b) => {
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
  // La carga ya viene del más nuevo al más antiguo
  const requerimientosOrdenados = ordenarParaPantalla(filteredRequerimientos);

  // Exportación a documento (KAN-28). Los identificadores son los mismos de la
  // pantalla (`codigoDe`: el `codigo` guardado) y el orden también: "visibles"
  // exporta la lista tal como se ve (con búsqueda, pestañas y orden aplicados).
  const itemsAExportar =
    alcanceExport === 'visibles' ? requerimientosOrdenados : ordenarParaPantalla(requerimientos);
  const conteoExport = itemsAExportar.length;

  const handleExportar = async () => {
    if (!proyecto) {
      toast.error('Aún no se cargó el proyecto');
      return;
    }
    if (conteoExport === 0) {
      toast.error(
        requerimientos.length === 0
          ? 'Este proyecto aún no tiene requerimientos para exportar'
          : 'Ningún requerimiento coincide con los filtros actuales'
      );
      return;
    }
    setExportando(true);
    try {
      const items = prepararItems(itemsAExportar, patrones);
      if (formatoExport === 'markdown') {
        const nombre = exportarMarkdown(proyecto, items, agrupacionExport);
        toast.success(`Markdown descargado (${nombre})`);
      } else if (formatoExport === 'word') {
        const nombre = exportarWord(proyecto, items, agrupacionExport);
        toast.success(`Documento Word descargado (${nombre})`);
      } else {
        const nombre = await exportarPdf(proyecto, items, agrupacionExport);
        toast.success(`PDF descargado (${nombre})`);
      }
      setShowExportModal(false);
    } catch (e) {
      console.error('Error al exportar requerimientos:', e);
      toast.error(mensajeError(e, 'No se pudo generar el documento'));
    } finally {
      setExportando(false);
    }
  };

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

  const patronFiltroUnico = useMemo(() => {
    const idsPatron = new Set(
      filteredRequerimientos
        .filter(r => r.elementos_sintaxis?.length && r.id_patron)
        .map(r => r.id_patron!)
    );
    if (idsPatron.size !== 1) return null;
    const unicoId = [...idsPatron][0];
    return patrones.find(p => p.patron_id === unicoId)?.promt ?? null;
  }, [filteredRequerimientos, patrones]);

  const { items: leyendaLista, mapaTonos: mapaTonosLista } = useMemo(
    () =>
      construirLeyendaSintaxis(
        filteredRequerimientos.map(r => r.elementos_sintaxis),
        patronFiltroUnico
      ),
    [filteredRequerimientos, patronFiltroUnico]
  );

  // Atajos de teclado de la lista: J/K recorren las filas y la letra actúa sobre la marcada
  const [filaActiva, setFilaActiva] = useState<string | null>(null);
  const [verAtajos, setVerAtajos] = useState(false);
  const moverFila = (paso: 1 | -1) => {
    const filas = Array.from(document.querySelectorAll<HTMLElement>('[data-fila-req]'));
    if (filas.length === 0) return;
    const actual = filas.findIndex(f => f.dataset.filaReq === filaActiva);
    const siguiente = actual === -1 ? (paso === 1 ? 0 : filas.length - 1) : Math.min(filas.length - 1, Math.max(0, actual + paso));
    setFilaActiva(filas[siguiente].dataset.filaReq ?? null);
    filas[siguiente].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const reqActivo = filaActiva ? requerimientos.find(r => r.id === filaActiva) : undefined;
  useAtajos(
    {
      j: () => moverFila(1),
      k: () => moverFila(-1),
      a: () => { if (reqActivo && puedeDecidir(reqActivo)) void handleDecision(reqActivo, 'aprobar'); },
      r: () => { if (reqActivo && puedeDecidir(reqActivo)) void handleDecision(reqActivo, 'rechazar'); },
      e: () => { if (reqActivo && esMiembroProyecto && puedeAbrirEditor(reqActivo)) openEditModal(reqActivo); },
      c: () => { if (reqActivo && puedeComentar) void abrirComentarios(reqActivo); },
      n: () => { if (esMiembroProyecto) void openCreateModal(); },
      escape: () => setFilaActiva(null),
      '?': () => setVerAtajos(true),
    },
    { activo: vista === 'requerimientos' && !loading }
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
  const filaRequerimiento = (req: Requerimiento) => {
    const codigo = codigoDe(req);
    // Clasificación en una sola línea de texto separada por "·" (sin cajitas):
    // el color se reserva para el estado, que es lo que se busca de un vistazo.
    const clasificacion = [
      req.modulo,
      req.tipo_requerimiento?.nombre,
      req.prioridad ? (req.prioridad === 'Wont' ? "Won't" : req.prioridad) : null,
      req.modelo?.nombre,
      req.modalidad?.nombre_modalidad,
    ].filter((v): v is string => !!v);

    const accionesMenu: AccionMenu[] = [
      { etiqueta: 'Copiar enunciado', icono: <Copy size={16} />, onSelect: () => copiarEnunciado(req) },
    ];
    if (codigo) {
      accionesMenu.push({ etiqueta: `Copiar ${codigo}`, icono: <Copy size={16} />, onSelect: () => copiarCodigo(codigo) });
    }
    if (esMiembroProyecto) {
      accionesMenu.push({ etiqueta: 'Ver historial de cambios', icono: <History size={16} />, onSelect: () => handleViewLogs(req) });
      if (req.numero != null) {
        accionesMenu.push({ etiqueta: `Insertar uno después de ${codigo}`, icono: <ListPlus size={16} />, onSelect: () => openInsertModal(req) });
      }
      accionesMenu.push({ etiqueta: 'Eliminar', icono: <Trash2 size={16} />, onSelect: () => handleDeleteReq(req), peligro: true });
    }

    return (
    <li
              key={req.id}
              data-fila-req={req.id}
              aria-current={filaActiva === req.id ? 'true' : undefined}
              className="px-5 py-5 scroll-my-24 hover:bg-sunken/60 aria-[current=true]:bg-brand-subtle/50 aria-[current=true]:shadow-[inset_3px_0_0_var(--brand-solid)] transition-colors flex flex-col md:flex-row md:items-start justify-between gap-3 md:gap-4 first:rounded-t-ui last:rounded-b-ui"
            >
              <div className="space-y-2 flex-1 min-w-0">
                {/* Código y estado; las notas de estado van como texto, no como etiqueta */}
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm">
                  {codigo && (
                    <button
                      type="button"
                      onClick={() => copiarCodigo(codigo)}
                      title="Copiar identificador"
                      aria-label={`Copiar identificador ${codigo}`}
                      className="font-semibold tabular-nums text-ink rounded-ui hover:underline underline-offset-2 cursor-pointer"
                    >
                      {codigo}
                    </button>
                  )}
                  {/* El estado ya no es un desplegable (KAN-18). Antes cualquiera con permiso de
                    edición podía elegir "Aprobado" sobre su propio requerimiento.
                    Ahora es una etiqueta y lo mueve el líder o el autor. */}
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getBadgeColorEstado(req.estado?.nombre_estado)}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {req.estado?.nombre_estado || 'Sin estado'}
                  </span>

                  {/* Sin equipo no hay líder que apruebe. Los requerimientos de antes
                      de KAN-18 están así y no se pueden migrar: el texto guardado no
                      dice a qué equipo pertenecían. */}
                  {!req.id_equipo && (
                    <span
                      className="text-ink-subtle"
                      title="Creado antes de la aprobación por líder: no tiene equipo, así que nadie puede aprobarlo. Se puede editar como cualquier otro requerimiento del proyecto."
                    >
                      Sin equipo
                    </span>
                  )}
                  {estaPendienteDeAprobacion(req.estado?.nombre_estado) && (
                    <span className="text-ink-subtle">
                      Esperando al líder de {nombreEquipoDe(req.id_equipo) ?? 'su equipo'}
                    </span>
                  )}
                  {estaRechazado(req.estado?.nombre_estado) && (
                    <span className="text-ink-subtle">
                      {req.id_autor === uid ? 'Corrígelo y vuelve a enviarlo' : 'Corregido por su autor, pendiente de reenvío'}
                    </span>
                  )}
                </div>

                {/* El enunciado es lo que se viene a leer: va en la fuente del texto y a tamaño de lectura */}
                <p className="text-ink text-base leading-relaxed whitespace-pre-wrap break-words max-w-[75ch]">
                  {mostrarSintaxisLista && req.elementos_sintaxis?.length ? (
                    <TextoConSintaxis
                      texto={req.enunciado}
                      elementos={req.elementos_sintaxis}
                      mapaTonos={mapaTonosLista}
                      claveEnfocada={focoSintaxisLista.claveActiva}
                    />
                  ) : (
                    req.enunciado
                  )}
                </p>

                {desglosesListaAbiertos.has(req.id) && req.elementos_sintaxis?.length ? (
                  <DesgloseSintaxis
                    texto={req.enunciado}
                    elementos={req.elementos_sintaxis}
                    patron={req.patron?.promt}
                    mapaTonos={mapaTonosLista}
                  />
                ) : null}

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-subtle">
                  {[
                    clasificacion.length > 0 ? (
                      <span key="clasificacion" className="text-ink-muted">{clasificacion.join(' · ')}</span>
                    ) : null,
                    req.autor ? <span key="autor">Por {req.autor.nombre || req.autor.correo}</span> : null,
                    req.aprobador ? (
                      <span key="aprobador" className="inline-flex items-center gap-1">
                        <CheckCheck size={14} className="text-success" aria-hidden />
                        Aprobó {req.aprobador.nombre || req.aprobador.correo}
                      </span>
                    ) : null,
                    req.created_at ? (
                      <time key="fecha" dateTime={req.created_at} title={fechaCompleta(req.created_at)}>
                        {fechaRelativa(req.created_at)}
                      </time>
                    ) : null,
                  ]
                    .filter(Boolean)
                    // El "·" va al final de cada dato para que, al partirse la línea en móvil,
                    // ninguna línea empiece con un separador
                    .map((nodo, i, lista) => (
                      <span key={i} className="inline-flex items-center">
                        {nodo}
                        {i < lista.length - 1 && <span aria-hidden className="ml-2">·</span>}
                      </span>
                    ))}
                  {req.elementos_sintaxis?.length ? (
                    <BotonDesgloseSintaxis
                      abierto={desglosesListaAbiertos.has(req.id)}
                      onAlternar={() => alternarDesgloseLista(req.id)}
                      cantidad={req.elementos_sintaxis.length}
                    />
                  ) : null}
                </div>
              </div>

              {/* Acciones: a la vista solo las del flujo (decidir, reenviar, editar, comentar);
                  el resto en el menú "⋯" */}
              <div className="flex flex-wrap items-center gap-1 -ml-2 md:ml-0">
                {puedeDecidir(req) && (
                  <>
                    <button
                      onClick={() => handleDecision(req, 'aprobar')}
                      title="Aprobar requerimiento"
                      aria-label={`Aprobar requerimiento ${codigo ?? ''}`.trim()}
                      className={`${btnIcono} text-success`}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => handleDecision(req, 'rechazar')}
                      title="Devolver requerimiento"
                      aria-label={`Devolver requerimiento ${codigo ?? ''}`.trim()}
                      className={`${btnIcono} text-danger`}
                    >
                      <XCircle size={16} />
                    </button>
                  </>
                )}
                {puedeReenviarEste(req) && (
                  <button
                    onClick={() => handleReenviar(req)}
                    title="Reenviar a aprobación"
                    aria-label={`Reenviar a aprobación el requerimiento ${codigo ?? ''}`.trim()}
                    className={btnIcono}
                  >
                    <Send size={16} />
                  </button>
                )}
                {puedeComentar && (
                  <button
                    onClick={() => abrirComentarios(req)}
                    title={`Ver comentarios (${req.total_comentarios ?? 0})`}
                    aria-label={`Ver comentarios de ${codigo ?? ''} (${req.total_comentarios ?? 0})`.trim()}
                    className={`${btnIcono} relative`}
                  >
                    <MessageSquare size={16} />
                    {/* El indicador de la lista (KAN-27). Con cero no se pinta nada,
                        para no cargar de puntos la tarjeta; el título y el nombre
                        accesible siempre dicen la cantidad. */}
                    {(req.total_comentarios ?? 0) > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-brand-solid text-on-solid text-[10px] font-bold leading-4"
                      >
                        {req.total_comentarios}
                      </span>
                    )}
                  </button>
                )}
                {esMiembroProyecto && puedeAbrirEditor(req) && (
                  <button
                    onClick={() => openEditModal(req)}
                    title="Editar requerimiento"
                    aria-label={`Editar requerimiento ${codigo ?? ''}`.trim()}
                    className={btnIcono}
                  >
                    <Edit2 size={16} />
                  </button>
                )}
                {puedeMarcarImplementado(esMiembroProyecto, nombreEstadoDe(req)) && (
                  <button
                    onClick={() => handleMarcarImplementado(req)}
                    title="Marcar como implementado"
                    aria-label={`Marcar como implementado el requerimiento ${codigo ?? ''}`.trim()}
                    className={`${btnIcono} text-success`}
                  >
                    <Check size={16} />
                  </button>
                )}
                {puedeReabrirRequerimiento(esMiembroProyecto, nombreEstadoDe(req)) && (
                  <button
                    onClick={() => handleReabrirRequerimiento(req)}
                    title="Reabrir"
                    aria-label={`Reabrir el requerimiento ${codigo ?? ''}`.trim()}
                    className={`${btnIcono} text-brand`}
                  >
                    <ArrowRight size={16} />
                  </button>
                )}
                <MenuAcciones
                  acciones={accionesMenu}
                  label={`Más acciones de ${codigo ?? 'este requerimiento'}`}
                />
              </div>
            </li>
    );
  };


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
            <span className="flex flex-wrap items-center gap-2.5">
              {proyecto.nombre}
              <BotonPista activo={pistaProyecto.visible} onClick={pistaProyecto.alternar} />
              {proyecto.estado_proyecto?.nombre_estado && (
                <span className="px-2.5 py-0.5 rounded-full tracking-normal text-xs font-semibold bg-brand-subtle text-brand-text border border-brand-line">
                  {proyecto.estado_proyecto.nombre_estado}
                </span>
              )}
            </span>
          ) : (
            <span className="block h-8 w-64 max-w-full bg-sunken-strong rounded-ui animate-pulse" />
          )
        }
        description={
          proyecto ? (
            <>
              {(() => {
                // Tipo, naturaleza y campañas como una línea de texto: el color queda solo para el estado
                const meta = [
                  proyecto.tipos_sistema?.nombre,
                  proyecto.naturaleza_proyecto?.nombre_naturaleza,
                  ...(proyecto.colaboraciones ?? []).map(c => `Campaña: ${c.nombre}`),
                ].filter((v): v is string => !!v);
                return meta.length > 0 ? (
                  <span className="block text-sm text-ink-subtle mb-1">{meta.join(' · ')}</span>
                ) : null;
              })()}
              <span className="block">{proyecto.descripcion || 'Sin descripción'}</span>
            </>
          ) : undefined
        }
        actions={
          vista === 'requerimientos' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <button
               
                onClick={() => setShowExportModal(true)}
                className={btnSecundario}
                title="Exportar requerimientos a PDF, Markdown o Word"
              >
                <Download size={16} />
                Exportar
              </button>
              {esMiembroProyecto && (
                <button onClick={openCreateModal} className={btnPrimario}>
                  <Plus size={16} />
                  Nuevo requerimiento
                </button>
              )}
            </div>
          )
        }
      />

      {/* Secciones del proyecto */}
      {proyecto && proyectoId && (
        <nav aria-label="Secciones del proyecto" className="flex gap-1 border-b border-line overflow-x-auto overflow-y-hidden custom-scrollbar">
          {[
            { id: 'requerimientos' as const, nombre: 'Requerimientos', cantidad: loading ? null : requerimientos.length },
            { id: 'equipos' as const, nombre: 'Equipos', cantidad: cantidadEquipos },
            { id: 'contexto' as const, nombre: 'Contexto', cantidad: cantidadContexto }
          ].map((p) => {
            const activa = vista === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => irA(proyectoId, p.id)}
                aria-current={activa ? 'page' : undefined}
                className={`px-4 min-h-11 text-base whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                  activa ? 'border-ink text-ink font-semibold' : 'border-transparent text-ink-muted font-medium hover:text-ink'
                }`}
              >
                {p.nombre}
                {p.cantidad !== null && <span className="ml-2 text-sm tabular-nums text-ink-subtle">{p.cantidad}</span>}
              </button>
            );
          })}
        </nav>
      )}

      {proyecto && vista === 'requerimientos' && (
        <Pista visible={pistaProyecto.visible} onOcultar={pistaProyecto.ocultar} titulo="Cómo funciona un proyecto" className="mt-6">
          Aquí viven los requerimientos del sistema. Crea uno con IA o a mano desde{' '}
          <strong className="font-semibold text-ink">Nuevo requerimiento</strong> y descarga la especificación con{' '}
          <strong className="font-semibold text-ink">Exportar</strong>. En <strong className="font-semibold text-ink">Equipos</strong>{' '}
          decides quién aprueba, y en <strong className="font-semibold text-ink">Contexto</strong> lo que la IA toma como referencia.
        </Pista>
      )}

      {vista === 'equipos' || vista === 'contexto' ? (
        !proyecto ? (
          <div role="status" aria-label="Cargando" className="h-40 bg-sunken rounded-ui animate-pulse" />
        ) : vista === 'equipos' ? (
          <EquiposDelProyecto proyecto={proyecto} onCantidad={setCantidadEquipos} />
        ) : (
          <ContextoDelProyecto proyecto={proyecto} onCantidad={setCantidadContexto} />
        )
      ) : (
      <>
      {/* Aviso de solo lectura para no miembros del proyecto */}
      {!loading && !esMiembroProyecto && (
        <div className="bg-warning-subtle border border-warning-line rounded-ui p-3.5 flex items-center gap-2.5 text-xs text-warning">
          <Lock size={15} className="shrink-0" />
          <span>
            Tienes acceso de lectura. Solo los miembros del proyecto pueden registrar o editar
            requerimientos, y quien lo aprueba es el líder del equipo al que pertenece.
          </span>
        </div>
      )}

      {/* Estados: control segmentado (no pestañas), para no confundirse con
          las secciones del proyecto que van justo arriba */}
      {!loading && requerimientos.length > 0 && (
        <div className="overflow-x-auto custom-scrollbar -mx-1 px-1">
          <div
            role="group"
            aria-label="Filtrar por estado"
            className="inline-flex gap-1 p-1 rounded-ui bg-sunken"
          >
            {pestanasEstado.map((p) => {
              const activa = filterEstado === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFilterEstado(p.id)}
                  aria-pressed={activa}
                  className={`shrink-0 px-3 min-h-9 pointer-coarse:min-h-11 rounded-ui text-sm whitespace-nowrap transition-colors cursor-pointer ${
                    activa
                      ? 'bg-surface text-ink font-semibold'
                      : 'text-ink-muted font-medium hover:text-ink'
                  }`}
                >
                  {p.nombre}
                  <span className="ml-1.5 text-xs tabular-nums text-ink-subtle">{conteoEstado(p.id)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Búsqueda y filtros: una sola fila; el detalle se abre bajo demanda */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
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
          <button
            type="button"
            onClick={() => setPanelFiltrosAbierto((a) => !a)}
            aria-expanded={panelFiltrosAbierto}
            aria-controls="panel-filtros-req"
            className={`${btnSecundario} shrink-0`}
          >
            <SlidersHorizontal size={16} aria-hidden />
            <span className="hidden sm:inline">Filtros</span>
            {filtrosActivos.length > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-brand-solid text-on-solid text-xs font-semibold leading-5 tabular-nums">
                {filtrosActivos.length}
              </span>
            )}
          </button>
        </div>

        {panelFiltrosAbierto && (
          <div id="panel-filtros-req" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3 rounded-ui bg-sunken">
            <label className="text-sm text-ink-muted space-y-1">
              <span className="block font-medium">Tipo</span>
              <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className={selectFiltro}>
                <option value="todos">Todos los tipos</option>
                {tiposReq.map((t) => (
                  <option key={t.tipo_req} value={t.tipo_req}>{t.nombre}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink-muted space-y-1">
              <span className="block font-medium">Modelo</span>
              <select value={filterModelo} onChange={(e) => setFilterModelo(e.target.value)} className={selectFiltro}>
                <option value="todos">Todos los modelos</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </label>
            {(modulosProyecto.length > 0 || filterModulo !== 'todos') && (
              <label className="text-sm text-ink-muted space-y-1">
                <span className="block font-medium">Módulo</span>
                <select value={filterModulo} onChange={(e) => setFilterModulo(e.target.value)} className={selectFiltro}>
                  <option value="todos">Todos los módulos</option>
                  {modulosProyecto.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="__sin__">Sin módulo</option>
                </select>
              </label>
            )}
            <label className="text-sm text-ink-muted space-y-1">
              <span className="block font-medium">Agrupar</span>
              <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupar)} className={selectFiltro}>
                <option value="ninguno">Sin agrupar</option>
                <option value="tipo">Por tipo</option>
                <option value="modelo">Por modelo</option>
              </select>
            </label>
            <label className="text-sm text-ink-muted space-y-1">
              <span className="block font-medium">Ordenar</span>
              <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className={selectFiltro}>
                <option value="numero">Por número</option>
                <option value="recientes">Más recientes</option>
                <option value="antiguos">Más antiguos</option>
                <option value="estado">Por estado</option>
              </select>
            </label>
          </div>
        )}

        {!loading && requerimientos.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-subtle">
            <span aria-live="polite" className="font-medium">
              {hayFiltros
                ? `Mostrando ${filteredRequerimientos.length} de ${requerimientos.length}`
                : `${requerimientos.length} ${requerimientos.length === 1 ? 'requerimiento' : 'requerimientos'}`}
            </span>
            {filtrosActivos.map((f) => (
              <button
                key={f.clave}
                type="button"
                onClick={f.quitar}
                aria-label={`Quitar filtro ${f.etiqueta}`}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 min-h-7 pointer-coarse:min-h-10 rounded-full bg-sunken text-ink text-xs font-medium hover:bg-sunken-strong transition-colors cursor-pointer"
              >
                {f.etiqueta}
                <X size={12} aria-hidden />
              </button>
            ))}
            {hayFiltros && (
              <button
                type="button"
                onClick={limpiarFiltros}
                className="font-semibold text-brand-text hover:underline cursor-pointer"
              >
                Quitar filtros
              </button>
            )}
            <button
              type="button"
              onClick={() => setVerAtajos(true)}
              className="ml-auto hidden pointer-fine:inline-flex items-center gap-1.5 text-ink-subtle hover:text-ink cursor-pointer"
            >
              <Keyboard size={15} aria-hidden />
              Atajos
              <kbd className="px-1.5 rounded border border-line-strong text-xs font-sans">?</kbd>
            </button>
          </div>
        )}
        {!loading && leyendaLista.length > 0 && (
          <BarraSintaxis
            activo={mostrarSintaxisLista}
            onCambiarActivo={setMostrarSintaxisLista}
            items={leyendaLista}
            foco={focoSintaxisLista}
          />
        )}
      </div>

      {/* Lista de Requerimientos */}
      {loading ? (
        <ListaEsqueleto filas={4} etiqueta="Cargando requerimientos" />
      ) : filteredRequerimientos.length === 0 ? (
        hayFiltros ? (
          <div className="text-center py-20">
            <h3 className="text-lg font-semibold text-ink">Sin resultados</h3>
            <p className="text-base text-ink-muted mt-2 max-w-sm mx-auto">
              Ningún requerimiento coincide con los filtros seleccionados.
            </p>
            <div className="mt-4 flex justify-center">
              <button onClick={limpiarFiltros} className={btnSecundario}>Quitar filtros</button>
            </div>
          </div>
        ) : (
          // Proyecto nuevo: se enseña cómo se ve un requerimiento bien escrito y los dos caminos para empezar
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center bg-surface rounded-ui p-6 sm:p-10">
            <div>
              <h3 className="text-2xl font-semibold tracking-tight text-ink">Todavía no hay requerimientos</h3>
              <p className="text-base text-ink-muted mt-3 max-w-[48ch]">
                {esMiembroProyecto
                  ? 'Redacta el primero con un patrón como EARS o describe el sistema y deja que la IA proponga una lista. Cada uno queda pendiente hasta que lo aprueba el líder de su equipo.'
                  : 'Cuando el equipo redacte requerimientos, aparecerán aquí.'}
              </p>
              {esMiembroProyecto && (
                <div className="mt-6 flex flex-wrap gap-2">
                  <button onClick={openCreateModal} className={btnPrimario}>
                    <Plus size={16} />
                    Nuevo requerimiento
                  </button>
                </div>
              )}
            </div>
            <EjemploSintaxis className="bg-sunken" />
          </div>
        )
      ) : (
        agrupar === 'ninguno' ? (
          <ul className="bg-surface rounded-ui divide-y divide-canvas">
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
                <ul className="bg-surface rounded-ui divide-y divide-canvas">
                  {grupo.items.map(filaRequerimiento)}
                </ul>
              </section>
            ))}
          </div>
        )
      )}

      </>
      )}

      {/* Modal Redactar / Editar requerimiento */}
      <Modal
        open={isModalOpen}
        onClose={intentarCerrar}
        cerrarConFondo={!hayCambios}
        title={
          editingReq ? (
            'Editar requerimiento'
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {insertarDespuesDe ? `Nuevo requerimiento después de ${insertarDespuesDe.codigo}` : 'Nuevo requerimiento'}
              <BotonPista activo={pistaCrear.visible} onClick={pistaCrear.alternar} />
            </span>
          )
        }
        description={
          esMasivo
            ? 'Elige el tipo y el modelo, describe qué parte del sistema especificar y revisa lo que propone la IA.'
            : 'Elige el tipo y el modelo, genera con IA o redacta respetando la estructura del patrón.'
        }
        // Más ancho al revisar varias propuestas: el texto completo cabe sin tantos saltos de línea
        size={esMasivo ? '3xl' : 'xl'}
      >
        <form ref={formRef} onSubmit={handleSaveReq} noValidate className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-6">
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

            {/* Tipo, modelo y patrón: lo primero que se elige; la IA los respeta al redactar */}
            <div className="space-y-4">
              <div>
                <label htmlFor="req-tipo" className={etiqueta}>Tipo de requerimiento</label>
                <select
                  id="req-tipo"
                  value={formData.id_tipo_requerimiento}
                  onChange={(e) => setFormData({ ...formData, id_tipo_requerimiento: e.target.value })}
                  className={campo}
                >
                  <option value="">{esMasivo ? 'Todos (la IA los clasifica)' : 'Sin tipo'}</option>
                  {tiposReq.map((t) => (
                    <option key={t.tipo_req} value={t.tipo_req}>{t.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="req-modelo" className={etiqueta}>Modelo de requisitos</label>
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
                    onChange={(e) => {
                      setFormData({ ...formData, id_patron_seleccionado: e.target.value });
                      setElementosSintaxisForm(null);
                    }}
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
                <div className="flex items-start justify-between gap-3 bg-sunken border border-line rounded-ui px-4 py-3">
                  <code className="font-mono text-xs text-ink leading-relaxed whitespace-pre-wrap">
                    {patronSeleccionado.promt}
                  </code>
                  {!esMasivo && (
                    <button
                      type="button"
                      onClick={usarPlantilla}
                      className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-brand-text hover:underline cursor-pointer"
                    >
                      <Wand2 size={12} />
                      Usar plantilla
                    </button>
                  )}
                </div>
              )}
              <PistaCampo visible={pistaCrear.visible}>
                Todo es opcional. El patrón es una plantilla con la estructura que debe seguir el enunciado, y la IA la respeta al redactar.
              </PistaCampo>
            </div>

            {/* Prompt para la IA */}
            <div>
              <label htmlFor="req-ia" className={`${etiqueta} flex items-center gap-1.5`}>
                <Sparkles size={14} className="text-brand-text" aria-hidden />
                Generar con IA
              </label>

              <div className="rounded-ui border border-line-strong bg-surface focus-within:border-brand-text focus-within:ring-1 focus-within:ring-brand-text transition-colors">
                <textarea
                  id="req-ia"
                  rows={esMasivo ? 4 : 3}
                  placeholder={
                    esMasivo
                      ? 'Ej. «Requerimientos del módulo de pagos» o «Todos los requerimientos del sistema». La IA decide cuántos según el alcance y el contexto del proyecto.'
                      : 'Describe la funcionalidad brevemente...'
                  }
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter genera; Shift+Enter hace un salto de línea; Ctrl+Enter sigue guardando el formulario
                    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault();
                      handleAIGenerate();
                    }
                  }}
                  className="block w-full px-4 pt-3.5 pb-2 bg-transparent text-base text-ink placeholder:text-ink-subtle resize-none focus:outline-none"
                />

                {/* Carpetas de contexto opcionales (la raíz de la pestaña Contexto se usa siempre) */}
                {carpetasContexto.length > 0 && (
                  <div className="px-4 pb-3 flex flex-wrap items-center gap-1.5 text-xs">
                    {carpetasContexto.map((c) => {
                      const activa = carpetasElegidas.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={activa}
                          onClick={() => setCarpetasElegidas(prev => activa ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                          className={`inline-flex items-center gap-1 px-2.5 min-h-7 rounded-full border cursor-pointer transition-colors ${
                            activa ? 'bg-brand-subtle border-brand-text text-brand-text' : 'bg-surface border-line text-ink-muted hover:text-ink'
                          }`}
                          title={activa ? 'Quitar esta carpeta del contexto' : 'Usar también esta carpeta como contexto'}
                        >
                          <Folder size={12} aria-hidden />
                          {c.nombre}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Profundidad y alcance de la generación de varios requerimientos (KAN-40): van antes del botón de generar para mantener un flujo lineal */}
                {esMasivo && (
                  <div className="px-3.5 py-2.5 border-t border-line bg-sunken/40 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
                    <label className="inline-flex items-center gap-2">
                      Generación
                      <select
                        value={profundidad}
                        onChange={(e) => setProfundidad(e.target.value as Profundidad)}
                        disabled={gen.ocupado || isAILoading}
                        className="px-2 min-h-8 border border-line-strong rounded-ui bg-surface text-ink focus:outline-none focus:border-brand-text"
                      >
                        <option value="completa">Completa (por áreas, hasta cubrirlo todo)</option>
                        <option value="rapida">Rápida (una sola pasada)</option>
                      </select>
                    </label>
                    {profundidad === 'completa' && (
                      <label className="inline-flex items-center gap-2">
                        Alcance
                        <select
                          value={alcanceIA}
                          onChange={(e) => setAlcanceIA(e.target.value as AlcanceGeneracion | 'auto')}
                          disabled={gen.ocupado}
                          className="px-2 min-h-8 border border-line-strong rounded-ui bg-surface text-ink focus:outline-none focus:border-brand-text"
                        >
                          <option value="auto">Lo decide la IA según el pedido</option>
                          <option value="sistema">Sistema completo</option>
                          <option value="modulo">Solo el módulo pedido</option>
                        </select>
                      </label>
                    )}
                    <span className="text-ink-subtle">
                      La estrictez decide cuánto infiere: Baja añade lo habitual del dominio; Máxima, solo lo literal.
                    </span>
                  </div>
                )}

                {/* Barra inferior: modo masivo a la izquierda; estrictez y generar a la derecha */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-t border-line">
                  {masivoDisponible ? (
                    <label className="inline-flex items-center gap-2 px-1 min-h-8 text-xs font-semibold text-ink-muted cursor-pointer select-none">
                      <span className="relative inline-flex">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={modoMasivo}
                          onChange={(e) => {
                            setModoMasivo(e.target.checked);
                            gen.reiniciar();
                          }}
                          className="peer sr-only"
                        />
                        <span className="w-8 h-[18px] rounded-full bg-line-strong peer-checked:bg-brand-solid transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-text" />
                        <span className="absolute top-[2px] left-[2px] size-[14px] rounded-full bg-surface shadow transition-transform peer-checked:translate-x-[14px]" />
                      </span>
                      <Layers size={13} aria-hidden />
                      Varios requerimientos
                    </label>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-1 ml-auto">
                    <ControlEstrictez valor={estrictez} onChange={setEstrictez} disabled={isAILoading || gen.ocupado} />
                    <button
                      type="button"
                      onClick={handleAIGenerate}
                      disabled={isAILoading || (gen.fase !== 'inactivo' && gen.fase !== 'revisando-plan') || !aiPrompt.trim()}
                      className="px-3.5 min-h-8 bg-brand-solid hover:bg-brand-solid-hover text-on-solid rounded-ui text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      {isAILoading || gen.fase === 'planificando' || gen.fase === 'generando' ? (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : gen.fase === 'revisando-plan' ? (
                        <MapaIcono size={13} aria-hidden />
                      ) : (
                        <Sparkles size={13} aria-hidden />
                      )}
                      {gen.fase === 'planificando'
                        ? 'Armando el mapa...'
                        : gen.fase === 'revisando-plan'
                          ? 'Revisa el mapa abajo'
                          : gen.fase === 'generando'
                            ? 'Generando...'
                            : isAILoading ? (esMasivo ? 'Analizando el sistema...' : 'Generando...') : esMasivo ? 'Generar varios' : 'Generar'}
                    </button>
                  </div>
                </div>
              </div>

              <PistaCampo visible={pistaCrear.visible}>
                {esMasivo
                  ? 'Pide un módulo o el sistema entero; la IA decide cuántos requerimientos proponer. La estrictez decide cuánto se apega a lo que escribiste.'
                  : 'Describe en pocas palabras lo que necesitas y pulsa Generar (o Enter). Si no sabes qué estrictez elegir, déjala como está.'}
              </PistaCampo>

              {/* Ejemplos (few-shot) */}

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-ink-muted">
                    Ejemplos para la IA (opcional)
                    {pistaCrear.visible && <span className="text-ink-subtle">: la IA imitará su estilo</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEjemplos(prev => [...prev, ''])}
                    disabled={ejemplos.length >= MAX_EJEMPLOS}
                    title={ejemplos.length >= MAX_EJEMPLOS ? `Máximo ${MAX_EJEMPLOS} ejemplos` : 'Agregar un ejemplo'}
                    aria-label="Agregar un ejemplo"
                    className={btnIcono}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {ejemplos.map((ejemplo, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <textarea
                      rows={2}
                      value={ejemplo}
                      onChange={(e) => setEjemplos(prev => prev.map((x, j) => (j === i ? e.target.value : x)))}
                      placeholder="Ej. El sistema debe permitir al cliente descargar su factura en PDF desde el historial de pedidos."
                      aria-label={`Ejemplo ${i + 1}`}
                      maxLength={1500}
                      className={`${campo} text-sm leading-relaxed`}
                    />
                    <button
                      type="button"
                      onClick={() => setEjemplos(prev => prev.filter((_, j) => j !== i))}
                      aria-label={`Quitar el ejemplo ${i + 1}`}
                      className={`${btnIconoPeligro} mt-0.5 shrink-0`}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {esMasivo ? (
              /* Mapa de áreas, progreso y propuestas de la generación con IA (KAN-40) */
              <div id="contenedor-generacion-ia" className="scroll-mt-4">
                <PanelGeneracionIterativa
                  gen={gen}
                  existentes={existentesParaIA()}
                  bloqueado={registrandoMasivo !== null}
                  nombreTipo={(p) =>
                    tiposReq.find(t => t.tipo_req === (formData.id_tipo_requerimiento || tipoDesdeFurps(p.type_furps)))?.nombre ?? p.type_furps
                  }
                />
              </div>
            ) : (
              /* 4. Enunciado */
              <div id="seccion-enunciado" className="scroll-mt-4">
                <label htmlFor="req-enunciado" className={etiqueta}>
                  Enunciado del requerimiento <span className="text-danger">*</span>
                </label>
                {/* Las partes del patrón se marcan dentro del propio campo mientras se escribe */}
                <EditorEnunciadoConSintaxis
                  id="req-enunciado"
                  rows={4}
                  placeholder={patronSeleccionado?.promt || "Escribe el enunciado siguiendo la estructura del patrón..."}
                  value={formData.enunciado}
                  onChange={(enunciado) => setFormData({ ...formData, enunciado })}
                  elementos={formData.enunciado.trim() ? elementosEnunciado : null}
                  patron={patronSeleccionado?.promt}
                  className={`${campo} min-h-28 leading-relaxed`}
                />
                <PistaCampo visible={pistaCrear.visible}>
                  Escríbelo a mano o edita lo que generó la IA. Es el único campo obligatorio.
                </PistaCampo>
                <p className="text-xs text-ink-subtle mt-1">Ctrl + Enter para guardar.</p>
                {enunciadoFueraDePatron && (
                  <p className="mt-1.5 text-sm text-ink-muted" role="status">
                    Aún no reconozco la estructura del patrón en este texto. Revisa que tenga sus palabras fijas
                    (por ejemplo «Cuando…, el sistema deberá…») o usa la plantilla.
                  </p>
                )}
              </div>
            )}

            {/* Modalidad y equipo: decide qué líder aprueba (KAN-18) */}
            <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!esMasivo && (
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
              )}

              <div className={esMasivo ? 'sm:col-span-2' : ''}>
                <label htmlFor="req-equipo" className={etiqueta}>Equipo</label>
                <select
                  id="req-equipo"
                  value={formData.id_equipo}
                  onChange={(e) => setFormData({ ...formData, id_equipo: e.target.value })}
                  disabled={editingReq !== null}
                  aria-describedby="req-equipo-ayuda"
                  className={`${campo} disabled:opacity-60 disabled:cursor-not-allowed`}
                >
                  <option value="">Sin equipo</option>
                  {equiposProyecto.map((e) => (
                    <option key={e.equipo_id} value={e.equipo_id}>{e.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            <p id="req-equipo-ayuda" className="text-xs text-ink-subtle mt-1.5">
              {editingReq
                ? 'El equipo no se puede cambiar al editar: de él depende qué líder aprueba, y moverlo movería al juez.'
                : esMasivo
                  ? 'Su líder aprueba los requerimientos registrados. Se marcan como «Generado con IA».'
                  : 'Su líder es quien aprueba este requerimiento. No se puede cambiar después.'}
            </p>
            </div>

            {/* Módulo y prioridad (KAN-44): se ven y se editan tanto al crear como al editar.
                El módulo sugiere los que ya usa el proyecto y permite escribir uno nuevo. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="req-modulo" className={etiqueta}>Módulo</label>
                <div className="relative">
                  <select
                    id="req-modulo"
                    value={formData.modulo || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const esOtro = val === '__otro__';
                      setModuloModoLibre(esOtro);
                      setFormData({
                        ...formData,
                        modulo: esOtro ? '' : val
                      });
                    }}
                    className={campo}
                  >
                    <option value="">Sin módulo</option>
                    {modulosProyecto.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="__otro__">Otro (escribir)</option>
                  </select>
                  {(moduloModoLibre ||
                    ((formData.modulo || '') !== '' &&
                      !modulosProyecto.includes(formData.modulo))) && (
                    <div className="flex items-center gap-1">
                      <input
                        id="req-modulo-libre"
                        value={formData.modulo || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, modulo: e.target.value })
                        }
                        placeholder="Escribe el módulo"
                        maxLength={120}
                        className={campo}
                      />
                      {formData.modulo && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, modulo: '' });
                            setModuloModoLibre(false);
                          }}
                          aria-label="Borrar módulo"
                          className="inline-flex items-center justify-center size-6 rounded-ui border border-line-strong bg-surface text-ink-muted hover:bg-sunken hover:text-ink transition-colors"
                        >
                          <X size={12} aria-hidden />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-ink-subtle mt-1">
                  Sugerencias: los módulos que ya usa el proyecto (máx. 120 caracteres).
                </p>
              </div>

              <div>
                <label htmlFor="req-prioridad" className={etiqueta}>
                  Prioridad (MoSCoW)
                </label>
                <select
                  id="req-prioridad"
                  value={formData.prioridad}
                  onChange={(e) =>
                    setFormData({ ...formData, prioridad: e.target.value })
                  }
                  className={campo}
                >
                  <option value="">Sin prioridad</option>
                  <option value="Must">Must</option>
                  <option value="Should">Should</option>
                  <option value="Could">Could</option>
                  <option value="Wont">Won&apos;t</option>
                </select>
                <p className="text-xs text-ink-subtle mt-1">
                  MoSCoW: Must (imprescindible), Should (debería), Could (podría),
                  Won&apos;t (no ahora).
                </p>
              </div>
            </div>

            {/* Estado, autor y aprobador: información de solo lectura.
                Solo se muestra al editar para dar contexto; al crear es redundante. */}
            {editingReq && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="req-estado-info" className={etiqueta}>Estado</label>
                  <input
                    id="req-estado-info"
                    readOnly
                    value={editingReq.estado?.nombre_estado ?? 'Sin estado'}
                    className={`${campo} opacity-70 cursor-default`}
                  />
                </div>

                <div>
                  <label htmlFor="req-autor-info" className={etiqueta}>Autor</label>
                  <input
                    id="req-autor-info"
                    readOnly
                    value={nombreUsuario(editingReq.id_autor) ?? 'Sin autor'}
                    className={`${campo} opacity-70 cursor-default`}
                  />
                </div>

                <div>
                  <label htmlFor="req-aprobador-info" className={etiqueta}>Aprobador</label>
                  <input
                    id="req-aprobador-info"
                    readOnly
                    value={nombreUsuario(editingReq.id_aprobador) ?? 'Sin asignar todavía'}
                    className={`${campo} opacity-70 cursor-default`}
                  />
                </div>
              </div>
            )}
          </ModalBody>

          <ModalFooter>
            <button type="button" onClick={intentarCerrar} disabled={registrandoMasivo !== null} className={btnSecundario}>
              Cancelar
            </button>
            {esMasivo ? (
              <button
                type="button"
                onClick={registrarPropuestas}
                disabled={registrandoMasivo !== null || gen.ocupado || cantidadSeleccionada === 0}
                className={btnPrimario}
                title={cantidadSeleccionada === 0 ? 'Selecciona al menos un requerimiento con texto' : undefined}
              >
                <Save size={16} />
                {registrandoMasivo
                  ? `Registrando ${registrandoMasivo.hechos} de ${registrandoMasivo.total}...`
                  : cantidadSeleccionada > 0
                    ? `Registrar ${cantidadSeleccionada} ${cantidadSeleccionada === 1 ? 'requerimiento' : 'requerimientos'}`
                    : 'Registrar requerimientos'}
              </button>
            ) : (
              <>
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
              </>
            )}
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal Historial */}
      <ModalHistorialLogs
        open={currentReqForLogs !== null}
        onClose={() => setCurrentReqForLogs(null)}
        requerimiento={currentReqForLogs}
        logs={selectedReqLogs}
        loading={loadingLogs}
        error={logsError}
        nombreUsuario={nombreUsuario}
        codigoDe={codigoDe}
        puedeRestaurar={!!currentReqForLogs && esMiembroProyecto && puedeAbrirEditor(currentReqForLogs)}
        restoringLogId={restoringLogId}
        onRestore={handleRestoreVersion}
      />

      {/* Modal de comentarios (KAN-27). La `key` reinicia el borrador y la
          corrección en curso cada vez que se abre el hilo de otro requerimiento (o
          se cierra), sin necesidad de un efecto que limpie el estado. */}
      <ModalComentarios
        key={reqComentarios?.id ?? 'comentarios-cerrados'}
        open={reqComentarios !== null}
        onClose={cerrarComentarios}
        requerimiento={reqComentarios}
        comentarios={comentariosOcultos.size ? comentarios.filter(c => !comentariosOcultos.has(c.id)) : comentarios}
        loading={loadingComentarios}
        error={comentariosError}
        uid={uid}
        esCreadorProyecto={esCreadorProyecto}
        puedeComentar={puedeComentar}
        guardando={guardandoComentario}
        codigoDe={codigoDe}
        onPublicar={handlePublicarComentario}
        onEditar={handleEditarComentario}
        onBorrar={handleBorrarComentario}
      />

      <Modal open={verAtajos} onClose={() => setVerAtajos(false)} title="Atajos de teclado" size="md">
        <ModalBody>
          <dl className="divide-y divide-line text-sm">
            {[
              ['J / K', 'Bajar o subir por la lista'],
              ['A', 'Aprobar el requerimiento marcado (si eres líder)'],
              ['R', 'Devolverlo a su autor (si eres líder)'],
              ['E', 'Editarlo'],
              ['C', 'Ver sus comentarios'],
              ['N', 'Nuevo requerimiento'],
              ['/', 'Buscar'],
              ['Esc', 'Quitar la marca'],
            ].map(([tecla, que]) => (
              <div key={tecla} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-ink-muted">{que}</dt>
                <dd>
                  <kbd className="inline-block min-w-8 px-2 py-0.5 rounded-ui border border-line-strong bg-sunken text-center text-xs font-semibold text-ink">
                    {tecla}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-ink-subtle">
            Al revisar las propuestas de la IA una por una: S selecciona, X descarta y las flechas cambian de propuesta.
          </p>
        </ModalBody>
      </Modal>

      {/* Modal Exportar especificación (KAN-28) */}
      <Modal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Exportar requerimientos"
        description="Genera el documento de especificación en el navegador, con los mismos identificadores y orden de la pantalla."
      >
        <ModalBody className="space-y-4">
          {requerimientos.length === 0 ? (
            <div className="bg-warning-subtle border border-warning-line rounded-ui p-3.5 text-sm text-warning">
              Este proyecto aún no tiene requerimientos. Registra el primero antes de exportar; no se genera
              un documento vacío.
            </div>
          ) : (
            <>
              <div>
                <span className={etiqueta}>Formato</span>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Formato de exportación">
                  {([
                    ['pdf', 'PDF'],
                    ['markdown', 'Markdown'],
                    ['word', 'Word (.doc)'],
                  ] as Array<[FormatoExportacion, string]>).map(([valor, texto]) => (
                    <button
                      key={valor}
                      type="button"
                      role="radio"
                      aria-checked={formatoExport === valor}
                      onClick={() => setFormatoExport(valor)}
                      className={`px-3 min-h-10 rounded-ui text-sm font-semibold border transition-colors cursor-pointer ${formatoExport === valor
                        ? 'bg-ink text-white border-ink'
                        : 'bg-surface border-line-strong text-ink-muted hover:bg-sunken'}`}
                    >
                      {texto}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="export-alcance" className={etiqueta}>Requerimientos a incluir</label>
                <select
                  id="export-alcance"
                  value={alcanceExport}
                  onChange={(e) => setAlcanceExport(e.target.value as AlcanceExportacion)}
                  className={campo}
                >
                  <option value="visibles">
                    Los visibles en pantalla ({requerimientosOrdenados.length})
                    {hayFiltros ? ' — respeta búsqueda y filtros' : ''}
                  </option>
                  <option value="todos">Todos los del proyecto ({requerimientos.length})</option>
                </select>
              </div>

              <div>
                <label htmlFor="export-agrupacion" className={etiqueta}>Organización</label>
                <select
                  id="export-agrupacion"
                  value={agrupacionExport}
                  onChange={(e) => setAgrupacionExport(e.target.value as AgrupacionExportacion)}
                  className={campo}
                >
                  <option value="ninguna">En el orden de la pantalla</option>
                  <option value="tipo">Agrupados por tipo FURPS</option>
                </select>
              </div>

              {conteoExport === 0 ? (
                <div className="bg-warning-subtle border border-warning-line rounded-ui p-3.5 text-sm text-warning">
                  Ningún requerimiento coincide con los filtros actuales. Ajusta la búsqueda o elige
                  «Todos los del proyecto»; no se genera un documento vacío.
                </div>
              ) : (
                <p className="text-xs text-ink-subtle">
                  Se exportarán {conteoExport} {conteoExport === 1 ? 'requerimiento' : 'requerimientos'} con
                  identificador, texto, tipo FURPS y patrón usado. El documento incluye el nombre y la
                  descripción del proyecto.
                </p>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setShowExportModal(false)} className={btnSecundario}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleExportar}
            disabled={exportando || conteoExport === 0}
            className={btnPrimario}
          >
            {exportando ? (
              <span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {exportando ? 'Generando...' : 'Descargar'}
          </button>
        </ModalFooter>
      </Modal>

    </div>
  );
}
