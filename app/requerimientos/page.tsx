'use client';

import React, { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, Plus, Edit2, Trash2, Search, User, Clock, Save,
  Sparkles, CheckCheck, History, Lock, Wand2, ArrowRight, Copy, ListPlus, ListOrdered,
  Check, XCircle, Send
} from 'lucide-react';
import { generateSingleRequirement, AIError } from '@/lib/ai-actions';
import type {
  Proyecto, Requerimiento, TipoRequerimiento, Estado,
  Modalidad, Modelo, Patron, PerfilUsuario, LogRequerimiento, Equipo
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
  getEquiposDelProyecto,
  getEquiposLideradosPor,
  reenviarRequerimientoAprobacion,
  decidirAprobacionRequerimiento,
  MODALIDAD_GENERADO_IA,
  ESTADO_APROBADO,
  ESTADO_RECHAZADO,
  ESTADO_PENDIENTE_APROBACION
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
import ModalHistorialLogs from '@/components/requerimientos/ModalHistorialLogs';
import EquiposDelProyecto from '@/components/equipos/EquiposDelProyecto';
import MiembrosDelProyecto from '@/components/proyectos/MiembrosDelProyecto';
import { irA, leerNavegacion, suscribirNavegacion, type VistaProyecto } from '@/lib/navegacion-proyecto';
import { useCierreSeguro } from '@/lib/use-cierre-seguro';
import { useEstadoSesion } from '@/lib/use-estado-sesion';
import { fechaCompleta, fechaRelativa } from '@/lib/fechas';
import { codigoDe, codigoRequerimiento, numeroDesdeBusqueda } from '@/lib/requerimientos';
import { esMiembroDelProyecto } from '@/lib/equipos-proyecto';
import {
  estaPendienteDeAprobacion,
  estaRechazado,
  puedeAprobarRequerimientos,
  puedeEditarRequerimiento,
  puedeReenviarRequerimiento
} from '@/lib/permisos';

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
  id_equipo: ''
};

// Nombres legibles de los campos, para describir qué cambió en el historial.
// Fuera los que KAN-18 congela: `id_autor`, `id_aprobador`, `id_equipo` e
// `id_estado` no se editan desde el formulario, así que nunca aparecen como
// "campos modificados". El estado tiene su propio historial en el log.
const CAMPOS_EDITABLES: Array<[keyof typeof FORM_VACIO & keyof Requerimiento, string]> = [
  ['enunciado', 'enunciado'],
  ['id_tipo_requerimiento', 'tipo'],
  ['id_modalidad', 'modalidad'],
  ['id_modelo', 'modelo']
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

  // Vista del proyecto (requerimientos o equipos), reflejada en la URL
  const [vista, setVista] = useState<VistaProyecto>('requerimientos');
  useEffect(() => {
    const leer = () => setVista(leerNavegacion().vista);
    leer();
    return suscribirNavegacion(leer);
  }, []);
  // Cantidad de equipos del proyecto, para la pestaña (la lista la carga EquiposDelProyecto)
  const [cantidadEquipos, setCantidadEquipos] = useState<number | null>(null);
  // Cantidad de miembros: la pestaña la ajusta al cargar (suma a quienes entraron por un equipo)
  const [cantidadMiembros, setCantidadMiembros] = useState<number | null>(null);

  // Control de acceso (KAN-18). Lectura total para cualquiera con sesión; escribir
  // requiere ser miembro del proyecto.
//
// Se usa `esMiembroDelProyecto` de `lib/equipos-proyecto.ts`, que es el espejo
// exacto del helper homónimo de `firestore.rules`: creador, o estar en
// `ids_miembros`. Antes se llamaba a `isUsuarioRelacionadoAProyecto`, que además
// daba por bueno a quien llega por un equipo vinculado de los proyectos anteriores
// a KAN-24. Esos proyectos no tienen `ids_miembros`, y las reglas no pueden
// enumerar las membresías de equipo (no hay `getAll` y una consulta sin índice por
// `id_usuario` no es legal en una regla), así que para el backend ese usuario no
// existe. Con el criterio antiguo la interfaz ofrecía botones que el backend
// denegaba; este los esconde. Es una pérdida de capacidad real, pero solo sobre
// datos previos a KAN-24, y prefiero una limitación visible a un error de permisos.
  const esMiembroProyecto = esMiembroDelProyecto(proyecto, uid);

  // KAN-18: los equipos donde el usuario es líder, que son los únicos que puede
  // aprobar. Se piden una sola vez por sesión, y en paralelo al resto de la carga.
  useEffect(() => {
    let activo = true;
    if (!uid) {
      setEquiposLiderados([]);
      return;
    }
    getEquiposLideradosPor(uid)
      .then(ids => { if (activo) setEquiposLiderados(ids); })
      .catch(e => {
        console.error('No se pudieron cargar los equipos liderados:', e);
        if (activo) setEquiposLiderados([]);
      });
    return () => { activo = false; };
  }, [uid]);

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
        ? [formData.id_tipo_requerimiento, formData.id_modalidad, formData.id_modelo, formData.id_equipo]
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

  // Recarga solo el proyecto (p. ej. tras agregar o quitar miembros)
  const recargarProyecto = useCallback(async () => {
    if (!proyectoId) return;
    const actualizado = await getProyectoById(proyectoId);
    if (actualizado) setProyecto(actualizado);
  }, [proyectoId]);

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

  // Apertura de modal nuevo
  const abrirNuevo = (despuesDe: Requerimiento | null) => {
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
      id_modalidad: sigueExistiendo(modalidades.map(m => m.id), previa?.id_modalidad)
        ? previa!.id_modalidad!
        : modalidades[0]?.id || '',
      id_modelo: modeloInicial,
      id_patron_seleccionado: patronInicial?.patron_id || '',
      // Si el proyecto tiene un solo equipo no hay nada que decidir; con varios se
      // recuerda el último, que es lo que se viene eligendo al encadenar altas.
      id_equipo: equiposProyecto.length === 1
        ? equiposProyecto[0].equipo_id
        : sigueExistiendo(equiposProyecto.map(e => e.equipo_id), previa?.id_equipo)
          ? previa!.id_equipo!
          : ''
    });
    setAiPrompt('');
    setIsModalOpen(true);
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
      id_patron_seleccionado: patrones.find(p => p.id_modelo === req.id_modelo)?.patron_id || '',
      id_equipo: req.id_equipo || ''
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
    const datos = {
      enunciado: formData.enunciado.trim(),
      id_tipo_requerimiento: formData.id_tipo_requerimiento || null,
      id_modalidad: formData.id_modalidad || null,
      id_modelo: formData.id_modelo || null,
      id_equipo: formData.id_equipo
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

        // El equipo no se manda al editar. Es inmutable por dos motivos: las reglas lo
        // excluyen de las claves editables (`esReenvioDelAutor` y
        // `esEdicionEnFlujoNormal`), y cambiarlo movería al juez: un requerimiento
        // rechazado que pasa al equipo de otro líder se esquivaría de la revisión que
        // letocaba. El selector está deshabilitado mientras se edita por lo mismo.
        await updateRequerimiento(editingReq.id, {
          enunciado: datos.enunciado,
          id_tipo_requerimiento: datos.id_tipo_requerimiento,
          id_modalidad: datos.id_modalidad,
          id_modelo: datos.id_modelo
        });
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
              ? { inicio: `Insertado después de ${insertarDespuesDe.codigo}`, renumerados }
              : { inicio: 'Creación inicial' }
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
          id_equipo: formData.id_equipo
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
        // KAN-18: "Generar req con IA" marca la modalidad "Generado con IA" sin
        // que nadie la elija. Si el catálogo no la tiene, se avisa y se deja la
        // modalidad como estaba: es información de la tarjeta, no un dato que
        // impida registrar el requerimiento.
        const idGeneradoConIA = modalidades.find(m => m.nombre_modalidad === MODALIDAD_GENERADO_IA)?.id;
        setFormData(prev => ({
          ...prev,
          enunciado: generated.name,
          id_modalidad: idGeneradoConIA ?? prev.id_modalidad
        }));
        toast.success(
          idGeneradoConIA
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
      toast.error('Solo el líder del equipo de este requerimiento puede aprobarlo o rechazarlo.');
      return;
    }
    const anterior = nombreEstadoDe(req);
    const ok = await confirmar({
      titulo: decision === 'aprobar' ? '¿Aprobar requerimiento?' : '¿Rechazar requerimiento?',
      mensaje: decision === 'aprobar'
        ? 'El requerimiento entra al flujo normal y a partir de aquí lo edita cualquier miembro del proyecto.'
        : 'Vuelve al autor para que lo corrija y lo reenvíe. El motivo queda en el historial del requerimiento.',
      textoConfirmar: decision === 'aprobar' ? 'Aprobar' : 'Rechazar',
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
          : `${codigoDe(req) ?? 'Requerimiento'} rechazado. Su autor puede corregirlo y reenviarlo.`
      );
      fetchRequerimientos();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo registrar la decisión'));
    }
  };

  /** El autor devuelve su requerimiento rechazado al ciclo de aprobación. */
  const handleReenviar = async (req: Requerimiento) => {
    if (!puedeReenviarEste(req)) {
      toast.error('Solo su autor puede reenviar un requerimiento rechazado.');
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

  // Eliminar Requerimiento
  const handleDeleteReq = async (req: Requerimiento) => {
    // Borrar sigue igual que antes de KAN-18: lo que las reglas permiten es a
    // cualquier autenticado, así que el botón no se estrecha más de lo que ya estaba.
    if (!esMiembroProyecto) {
      toast.error('Solo los miembros del proyecto pueden eliminar requerimientos');
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
                  {/* El estado ya no es un desplegable (KAN-18). Antes cualquiera con permiso de
                    edición podía elegir "Aprobado" sobre su propio requerimiento.
                    Ahora es una etiqueta y lo mueve el líder o el autor. */}
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium border ${getBadgeColorEstado(req.estado?.nombre_estado)}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {req.estado?.nombre_estado || 'Sin estado'}
                  </span>

                  {/* Sin equipo no hay líder que apruebe. Los requerimientos de antes
                      de KAN-18 están así y no se pueden migrar: el texto guardado no
                      dice a qué equipo pertenecían. */}
                  {!req.id_equipo && (
                    <span
                      className="px-2 py-0.5 rounded-ui bg-sunken text-ink-muted font-medium border border-line"
                      title="Creado antes de la aprobación por líder: no tiene equipo, así que nadie puede aprobarlo. Se puede editar como cualquier otro requerimiento del proyecto."
                    >
                      Sin equipo
                    </span>
                  )}
                  {estaPendienteDeAprobacion(req.estado?.nombre_estado) && (
                    <span className="px-2 py-0.5 rounded-ui bg-sunken text-ink-muted font-medium border border-line">
                      Esperando al líder de {nombreEquipoDe(req.id_equipo) ?? 'su equipo'}
                    </span>
                  )}
                  {estaRechazado(req.estado?.nombre_estado) && (
                    <span className="px-2 py-0.5 rounded-ui bg-sunken text-ink-muted font-medium border border-line">
                      {req.id_autor === uid ? 'Corrígelo y vuelve a enviarlo' : 'Corregido por su autor, pendiente de reenvío'}
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
                {puedeDecidir(req) && (
                  <>
                    <button
                      onClick={() => handleDecision(req, 'aprobar')}
                      title="Aprobar requerimiento"
                      aria-label={`Aprobar requerimiento ${codigoDe(req) ?? ''}`.trim()}
                      className={`${btnIcono} text-success`}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => handleDecision(req, 'rechazar')}
                      title="Rechazar requerimiento"
                      aria-label={`Rechazar requerimiento ${codigoDe(req) ?? ''}`.trim()}
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
                    aria-label={`Reenviar a aprobación el requerimiento ${codigoDe(req) ?? ''}`.trim()}
                    className={btnIcono}
                  >
                    <Send size={16} />
                  </button>
                )}
                {esMiembroProyecto && (
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
                    {puedeAbrirEditor(req) && (
                      <button
                        onClick={() => openEditModal(req)}
                        title="Editar requerimiento"
                        aria-label="Editar requerimiento"
                        className={btnIcono}
                      >
                        <Edit2 size={16} />
                      </button>
                    )}
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
          vista === 'requerimientos' && esMiembroProyecto && (
            <button onClick={openCreateModal} className={btnPrimario}>
              <Plus size={16} />
              Nuevo requerimiento
            </button>
          )
        }
      />

      {/* Secciones del proyecto */}
      {proyecto && proyectoId && (
        <nav aria-label="Secciones del proyecto" className="flex gap-1 border-b border-line">
          {[
            { id: 'requerimientos' as const, nombre: 'Requerimientos', cantidad: loading ? null : requerimientos.length },
            {
              id: 'miembros' as const,
              nombre: 'Miembros',
              cantidad: cantidadMiembros ?? new Set([proyecto.id_creador, ...(proyecto.ids_miembros ?? [])].filter(Boolean)).size
            },
            { id: 'equipos' as const, nombre: 'Equipos', cantidad: cantidadEquipos }
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

      {vista === 'equipos' || vista === 'miembros' ? (
        !proyecto ? (
          <div role="status" aria-label="Cargando" className="h-40 bg-sunken rounded-ui animate-pulse" />
        ) : vista === 'equipos' ? (
          <EquiposDelProyecto proyecto={proyecto} onCantidad={setCantidadEquipos} />
        ) : (
          <MiembrosDelProyecto proyecto={proyecto} onCambio={recargarProyecto} onCantidad={setCantidadMiembros} />
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
              : esMiembroProyecto
                ? 'Redacta el primero usando las sintaxis de los modelos o genéralo con IA. Quedará pendiente de que lo apruebe el líder de su equipo.'
                : 'Cuando el equipo redacte requerimientos, aparecerán aquí.'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {hayFiltros && (
              <button onClick={limpiarFiltros} className={btnSecundario}>Quitar filtros</button>
            )}
            {!hayFiltros && esMiembroProyecto && (
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

      </>
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

            {/* Equipo: decide qué líder aprueba (KAN-18) */}
            <div>
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
              <p id="req-equipo-ayuda" className="text-xs text-ink-subtle mt-1">
                {editingReq
                  ? 'El equipo no se puede cambiar al editar: de él depende qué líder aprueba, y moverlo movería al juez.'
                  : 'Su líder es quien aprueba este requerimiento. No se puede cambiar después.'}
              </p>
            </div>

            {/* Estado, autor y aprobador: información, no campos.
                El estado nace en "Pendiente de aprobación" y lo mueven el líder o el
                autor; el autor lo pone el sistema y el aprobador solo lo escribe quien
                aprueba. Por eso son de solo lectura y no hay nada que elegir. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="req-estado-info" className={etiqueta}>Estado</label>
                <input
                  id="req-estado-info"
                  readOnly
                  value={editingReq ? (editingReq.estado?.nombre_estado ?? 'Sin estado') : 'Pendiente de aprobación'}
                  className={`${campo} opacity-70 cursor-default`}
                />
              </div>

              <div>
                <label htmlFor="req-autor-info" className={etiqueta}>Autor</label>
                <input
                  id="req-autor-info"
                  readOnly
                  value={editingReq ? (nombreUsuario(editingReq.id_autor) ?? 'Sin autor') : (nombreUsuario(uid) ?? 'Tú')}
                  className={`${campo} opacity-70 cursor-default`}
                />
              </div>

              <div>
                <label htmlFor="req-aprobador-info" className={etiqueta}>Aprobador</label>
                <input
                  id="req-aprobador-info"
                  readOnly
                  value={editingReq ? (nombreUsuario(editingReq.id_aprobador) ?? 'Sin asignar todavía') : 'Lo asigna su líder al aprobar'}
                  className={`${campo} opacity-70 cursor-default`}
                />
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
      <ModalHistorialLogs
        open={currentReqForLogs !== null}
        onClose={() => setCurrentReqForLogs(null)}
        requerimiento={currentReqForLogs}
        logs={selectedReqLogs}
        loading={loadingLogs}
        nombreUsuario={nombreUsuario}
        codigoDe={codigoDe}
      />

    </div>
  );
}
