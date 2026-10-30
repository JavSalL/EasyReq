'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, CircleDashed, Copy, Loader2, Map as MapaIcono, Plus, Search, Square, X, XCircle
} from 'lucide-react';
import {
  AIError,
  continuarGeneracion,
  generateBulkRequirements,
  runIterativeGeneration,
  type AlcanceGeneracion,
  type AreaGeneracion,
  type Estrictez,
  type OpcionesGeneracion,
  type OrigenIA,
  type PlanGeneracion,
  type PrioridadMoSCoW,
  type ProgresoGeneracion,
  type PropuestaIA,
  type RequerimientoExistente,
  type ResultadoIterativo
} from '@/lib/ai-actions';
import { clasificarDuplicado, IndiceDuplicados } from '@/lib/dedup-requerimientos';
import { btnPrimario, btnSecundario, btnIconoPeligro, campo } from '@/components/ui/estilos';

// ==========================================
// GENERACIÓN ITERATIVA DE REQUERIMIENTOS (KAN-40 / KAN-42)
// ==========================================
// El hook guarda el estado de una corrida (mapa de áreas, progreso, propuestas) y el panel lo
// muestra dentro del modal de "Nuevo requerimiento" cuando está activo "Varios requerimientos".
// La página solo lanza la corrida y registra las propuestas elegidas: nada se registra solo.

/** "completa" recorre áreas por lotes hasta cubrirlo todo; "rapida" es la generación masiva de una sola pasada. */
export type Profundidad = 'completa' | 'rapida';

/** Una propuesta en revisión: lo que propuso la IA más lo que el usuario edita y elige. */
export interface PropuestaRevisable extends Omit<PropuestaIA, 'origen' | 'prioridad' | 'justificacion'> {
  origen?: OrigenIA;
  prioridad?: PrioridadMoSCoW;
  justificacion?: string;
  texto: string;
  elegida: boolean;
}

export type Fase = 'inactivo' | 'planificando' | 'revisando-plan' | 'generando' | 'listo';

/** Un job de generación iterativa en el Worker tiene vigencia de 6 horas. */
const VIGENCIA_JOB_MS = 6 * 60 * 60 * 1000;

// Datos que se guardan en sessionStorage para recuperar la corrida tras recargar la pestaña.
export interface OpcionesGuardadas {
  pattern?: string;
  tipo?: string;
  estrictez?: Estrictez;
  ejemplos?: string[];
  contexto?: string;
  alcance: AlcanceGeneracion | 'auto';
}

export interface EstadoGeneracionGuardada {
  fase: Fase;
  plan: PlanGeneracion | null;
  areasPlan: AreaGeneracion[];
  progreso: ProgresoGeneracion | null;
  propuestas: PropuestaRevisable[] | null;
  resultado: { estado: ResultadoIterativo['estado'] | 'rapida'; motivo?: string } | null;
  userPrompt: string;
  opciones: OpcionesGuardadas;
  creadoEn?: number;
}

// Todas nacen elegidas, también los posibles duplicados: la etiqueta dice de cuál podrían
// serlo y el usuario decide si los quita.
const aRevisable = (p: PropuestaIA): PropuestaRevisable => ({ ...p, texto: p.name, elegida: true });

/**
 * Ordena las propuestas por el orden de las áreas (el recorrido de navegación del mapa) sin
 * alterar el orden dentro de cada área. Los lotes de varias áreas llegan intercalados; así la
 * lista, y la numeración REQ al registrar, siguen el orden del SRS.
 */
export function ordenarPorArea<T extends { area: string }>(lista: T[], ordenAreas: string[]): T[] {
  const posicion = (area: string) => {
    const i = ordenAreas.indexOf(area);
    return i === -1 ? ordenAreas.length : i;
  };
  return lista
    .map((p, i) => ({ p, i }))
    .sort((a, b) => posicion(a.p.area) - posicion(b.p.area) || a.i - b.i)
    .map(x => x.p);
}

/**
 * Construye un `ProgresoGeneracion` válido a partir de lo guardado. Si la recarga ocurrió justo al
 * confirmar el mapa (antes del primer `onProgreso`) o si hay áreas en estado `'generando'`,
 * normaliza las áreas no completadas a `'pendiente'` para que la corrida las retome.
 */
function normalizarProgresoParaReanudar(
  plan: PlanGeneracion,
  areasPlan: AreaGeneracion[],
  progresoGuardado: ProgresoGeneracion | null,
  propuestasGuardadas: PropuestaRevisable[] | null
): ProgresoGeneracion {
  const porNombre = new Map((progresoGuardado?.areas ?? []).map(a => [a.nombre, a]));
  const areas = areasPlan.map(a => {
    const prev = porNombre.get(a.nombre);
    if (!prev) {
      return { nombre: a.nombre, estado: 'pendiente' as const, lotes: 0, nuevas: 0, descartadas: 0 };
    }
    const yaCompleta = prev.estado === 'completa';
    return {
      ...prev,
      estado: yaCompleta ? ('completa' as const) : ('pendiente' as const),
      mensaje: yaCompleta ? prev.mensaje : undefined,
      ...(prev.pendiente ? { pendiente: [...prev.pendiente] } : {})
    };
  });
  return {
    fase: 'areas',
    areas,
    total: propuestasGuardadas?.length ?? progresoGuardado?.total ?? 0,
    llamadasRestantes: progresoGuardado?.llamadasRestantes ?? plan.llamadas_restantes ?? 0,
    esperando: undefined
  };
}

export function useGeneracionIterativa(proyectoId: string | null) {
  const [fase, setFase] = useState<Fase>('inactivo');
  const [plan, setPlan] = useState<PlanGeneracion | null>(null);
  const [areasPlan, setAreasPlan] = useState<AreaGeneracion[]>([]);
  const [progreso, setProgreso] = useState<ProgresoGeneracion | null>(null);
  const [propuestas, setPropuestas] = useState<PropuestaRevisable[] | null>(null);
  const [resultado, setResultado] = useState<{ estado: ResultadoIterativo['estado'] | 'rapida'; motivo?: string } | null>(null);
  // Datos de la última corrida iniciada: se guardan para poder reanudar tras una recarga sin
  // volver a pedir el plan ni gastar otro uso diario.
  const promptRef = useRef<string>('');
  const opcionesRef = useRef<OpcionesGuardadas>({ alcance: 'auto' });
  const creadoEnRef = useRef<number>(Date.now());

  const controladorRef = useRef<AbortController | null>(null);
  // La promesa que espera el orquestador mientras el usuario edita el mapa de áreas.
  const resolverPlanRef = useRef<((areas: AreaGeneracion[] | null) => void) | null>(null);
  // Orden de las áreas confirmadas: el de la lista de propuestas.
  const ordenAreasRef = useRef<string[]>([]);

  const CLAVE = proyectoId ? `easyreq:gen:${proyectoId}` : null;

  function leerEstado(clave: string | null): EstadoGeneracionGuardada | null {
    if (!clave || typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(clave);
      if (raw === null) return null;
      const parsed = JSON.parse(raw) as EstadoGeneracionGuardada;
      const tienePropuestas = (parsed.propuestas?.length ?? 0) > 0;
      const caducado = typeof parsed.creadoEn === 'number' && Date.now() - parsed.creadoEn > VIGENCIA_JOB_MS;
      // Si el job caducó (> 6 h) y no dejó propuestas listas para registrar, se limpia.
      if (caducado && !tienePropuestas) {
        window.sessionStorage.removeItem(clave);
        return null;
      }
      // Si caducó pero había propuestas ya generadas, se conservan en estado 'listo' para poder registrarlas.
      if (caducado && tienePropuestas && parsed.fase !== 'listo') {
        return {
          ...parsed,
          fase: 'listo',
          resultado: {
            estado: 'cancelado',
            motivo: 'El tiempo de la corrida expiró, pero puedes revisar y registrar las propuestas que se alcanzaron a generar.'
          }
        };
      }
      // Una generación rápida ('rapida') que quedó en 'generando' sin propuestas ni plan no tiene job que reanudar.
      if (parsed.fase === 'generando' && !parsed.plan && !tienePropuestas) {
        window.sessionStorage.removeItem(clave);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  const [claveActual, setClaveActual] = useState(CLAVE);
  const [guardado, setGuardado] = useState<EstadoGeneracionGuardada | null>(() => leerEstado(CLAVE));
  // Vuelve a leer cuando cambia el proyecto (se conoce tras cargar la URL de la pestaña).
  if (CLAVE !== claveActual) {
    setClaveActual(CLAVE);
    setGuardado(leerEstado(CLAVE));
  }

  const ocupado = fase === 'planificando' || fase === 'revisando-plan' || fase === 'generando';
  const tienePropuestasGuardadas = (guardado?.propuestas?.length ?? 0) > 0;
  // Un trabajo fallido sin propuestas no tiene nada útil que restaurar; si ya tenía propuestas, sí se ofrece recuperarlas.
  const hayGuardado =
    !!guardado &&
    (tienePropuestasGuardadas || !(guardado.resultado?.estado === 'error' || guardado.resultado?.estado === 'limite'));

  /**
   * Guarda el estado en curso (o lo limpia) en sessionStorage. Si no hay almacenamiento
   * disponible (o se agota el cupo), la corrida sigue viviendo solo en memoria y la app
   * funciona igual.
   */
  useEffect(() => {
    if (!CLAVE) return;
    const hayEstado = fase !== 'inactivo' && fase !== 'planificando';
    const hayPropuestas = (propuestas ?? []).length > 0;
    // Si el trabajo murió sin propuestas que rescatar, se limpia de sessionStorage.
    const sinNadaUtil = (resultado?.estado === 'error' || resultado?.estado === 'invalido') && !hayPropuestas;
    const payload: EstadoGeneracionGuardada | null = (hayEstado || hayPropuestas) && !sinNadaUtil
      ? {
          fase,
          plan,
          areasPlan,
          progreso,
          propuestas,
          resultado,
          userPrompt: promptRef.current,
          opciones: opcionesRef.current,
          creadoEn: creadoEnRef.current
        }
      : null;
    try {
      if (payload) {
        window.sessionStorage.setItem(CLAVE, JSON.stringify(payload));
      } else if (!guardado) {
        // Solo limpiamos sessionStorage si no hay un estado pendiente de que el usuario decida restaurar o descartar.
        window.sessionStorage.removeItem(CLAVE);
      }
    } catch {
      // Sin almacenamiento disponible: nada que persistir, solo memoria.
    }
  }, [CLAVE, fase, plan, areasPlan, progreso, propuestas, resultado, guardado]);

  const limpiarGuardado = useCallback(() => {
    setGuardado(null);
    if (!CLAVE) return;
    try { window.sessionStorage.removeItem(CLAVE); } catch {}
  }, [CLAVE]);

  /**
   * Aplica lo guardado al estado del hook y devuelve los datos normalizados para reanudar la corrida
   * (prompt, opciones, plan, áreas, progreso y propuestas). Solo se aplica una vez.
   */
  const aplicarGuardado = useCallback((): EstadoGeneracionGuardada | null => {
    const g = guardado;
    if (!g) return null;
    const tienePropuestas = (g.propuestas?.length ?? 0) > 0;
    if ((g.resultado?.estado === 'error' || g.resultado?.estado === 'invalido') && !tienePropuestas) {
      limpiarGuardado();
      return null;
    }

    const areasNormalizadas = g.areasPlan?.length ? g.areasPlan : (g.plan?.areas ?? []);
    const progresoNormalizado =
      g.fase === 'generando' && g.plan
        ? normalizarProgresoParaReanudar(g.plan, areasNormalizadas, g.progreso, g.propuestas)
        : g.progreso;
    const propuestasNormalizadas = g.propuestas ?? (g.fase === 'generando' ? [] : null);

    const estadoNormalizado: EstadoGeneracionGuardada = {
      ...g,
      areasPlan: areasNormalizadas,
      progreso: progresoNormalizado,
      propuestas: propuestasNormalizadas
    };

    setFase(estadoNormalizado.fase);
    setPlan(estadoNormalizado.plan);
    setAreasPlan(estadoNormalizado.areasPlan);
    setProgreso(estadoNormalizado.progreso);
    setPropuestas(estadoNormalizado.propuestas);
    setResultado(estadoNormalizado.resultado);
    ordenAreasRef.current = estadoNormalizado.areasPlan.map(a => a.nombre);
    promptRef.current = estadoNormalizado.userPrompt;
    opcionesRef.current = estadoNormalizado.opciones;
    creadoEnRef.current = estadoNormalizado.creadoEn ?? Date.now();
    setGuardado(null);
    return estadoNormalizado;
  }, [guardado, limpiarGuardado]);

  const iniciar = useCallback(async (
    userPrompt: string,
    opciones: OpcionesGeneracion & { alcance: AlcanceGeneracion | 'auto'; existentes: RequerimientoExistente[] }
  ): Promise<ResultadoIterativo> => {
    limpiarGuardado();
    promptRef.current = userPrompt;
    creadoEnRef.current = Date.now();
    opcionesRef.current = {
      pattern: opciones.pattern, tipo: opciones.tipo, estrictez: opciones.estrictez,
      ejemplos: opciones.ejemplos, contexto: opciones.contexto, alcance: opciones.alcance ?? 'auto'
    };
    controladorRef.current?.abort();
    const controlador = new AbortController();
    controladorRef.current = controlador;
    setFase('planificando');
    setPlan(null);
    setProgreso(null);
    setPropuestas([]);
    setResultado(null);

    const res = await runIterativeGeneration(userPrompt, { ...opciones, signal: controlador.signal }, {
      revisarPlan: planIA =>
        new Promise(resolve => {
          setPlan(planIA);
          setAreasPlan(planIA.areas.map(a => ({ ...a })));
          ordenAreasRef.current = planIA.areas.map(a => a.nombre);
          setFase('revisando-plan');
          resolverPlanRef.current = resolve;
        }),
      onProgreso: setProgreso,
      onPropuestas: nuevas =>
        setPropuestas(prev => ordenarPorArea([...(prev ?? []), ...nuevas.map(aRevisable)], ordenAreasRef.current)),
      // Un parecido por significado se marca igual que uno léxico; la propuesta sigue elegida.
      onDuplicadosSemanticos: marcas => {
        const porClave = new Map(marcas.map(m => [m.clave, m]));
        setPropuestas(prev => prev?.map(p => {
          const m = porClave.get(p.clave);
          return m ? { ...p, posibleDuplicado: { etiqueta: m.etiqueta, texto: m.texto, similitud: m.similitud, semantico: true } } : p;
        }) ?? null);
      }
    });

    resolverPlanRef.current = null;
    if (controladorRef.current === controlador) controladorRef.current = null;
    // Un plan cancelado antes de generar no deja nada que revisar.
    if (res.propuestas.length === 0) {
      setPropuestas(null);
      setFase('inactivo');
    } else {
      setFase('listo');
    }
    setResultado({ estado: res.estado, motivo: res.motivo });
    return res;
  }, [limpiarGuardado]);

  /** Generación masiva de una sola pasada (la de antes), con el mismo filtro de repetidos. */
  const iniciarRapida = useCallback(async (
    userPrompt: string,
    opciones: OpcionesGeneracion & { existentes: RequerimientoExistente[] }
  ) => {
    limpiarGuardado();
    promptRef.current = userPrompt;
    creadoEnRef.current = Date.now();
    opcionesRef.current = { ...opciones, alcance: 'auto' };
    setFase('generando');
    setPlan(null);
    setProgreso(null);
    setPropuestas(null);
    setResultado(null);
    try {
      const r = await generateBulkRequirements(userPrompt, opciones);
      if (!r.valido || r.requerimientos.length === 0) {
        setFase('inactivo');
        setResultado({ estado: 'invalido', motivo: r.motivo || 'La IA no encontró requerimientos que respalden el pedido. Detállalo más o agrega contexto al proyecto.' });
        return { cantidad: 0, motivo: r.motivo };
      }
      const indice = new IndiceDuplicados();
      opciones.existentes.forEach(e => indice.agregar(e.enunciado, e.codigo));
      const lista: PropuestaRevisable[] = [];
      r.requerimientos.forEach((req, i) => {
        const v = clasificarDuplicado(indice, req.name);
        if (v.tipo === 'duplicado') return;
        indice.agregar(req.name, `otra propuesta (${req.area ?? 'General'})`);
        lista.push({
          ...req,
          area: req.area ?? 'General',
          clave: `${Date.now()}-${i}`,
          texto: req.name,
          elegida: true,
          ...(v.tipo === 'posible' ? { posibleDuplicado: v.de } : {})
        });
      });
      setPropuestas(ordenarPorArea(lista, r.areas.map(a => a.nombre)));
      setFase(lista.length ? 'listo' : 'inactivo');
      setResultado({ estado: 'rapida' });
      return { cantidad: lista.length, descartadas: r.requerimientos.length - lista.length, areas: r.areas.length };
    } catch (err) {
      setFase('inactivo');
      const motivo = err instanceof AIError ? err.message : 'No se pudo conectar con el servicio de IA. Inténtalo de nuevo.';
      setResultado({ estado: 'error', motivo });
      return { cantidad: 0, motivo };
    }
  }, [limpiarGuardado]);

  /**
   * Reanuda una corrida interrumpida por recarga desde las áreas que quedaron pendientes,
   * sin pedir otro plan ni gastar otro uso diario (mientras el job siga vigente).
   */
  const continuar = useCallback(async (
    userPrompt: string,
    opciones: OpcionesGeneracion & { alcance: AlcanceGeneracion | 'auto' },
    existentes: RequerimientoExistente[],
    /** Datos restaurados de sessionStorage. Se pasan explícitamente porque el setState de
     *  `aplicarGuardado` aún no se ha reflejado en el estado del hook en este mismo render. */
    datosParaReanudar?: {
      plan: PlanGeneracion;
      areasPlan: AreaGeneracion[];
      progreso: ProgresoGeneracion | null;
      propuestas: PropuestaRevisable[] | null;
    }
  ): Promise<ResultadoIterativo> => {
    const planActual = datosParaReanudar?.plan ?? plan;
    const areasPlanActual = datosParaReanudar?.areasPlan ?? areasPlan;
    const propuestasActual = datosParaReanudar?.propuestas ?? propuestas ?? [];

    if (!planActual || areasPlanActual.length === 0) {
      return { estado: 'error', motivo: 'No hay una corrida guardada para reanudar.', plan: null, propuestas: [] };
    }

    const progresoActual = normalizarProgresoParaReanudar(
      planActual,
      areasPlanActual,
      datosParaReanudar?.progreso ?? progreso,
      propuestasActual
    );

    controladorRef.current?.abort();
    const controlador = new AbortController();
    controladorRef.current = controlador;
    promptRef.current = userPrompt;
    opcionesRef.current = {
      pattern: opciones.pattern, tipo: opciones.tipo, estrictez: opciones.estrictez,
      ejemplos: opciones.ejemplos, contexto: opciones.contexto, alcance: opciones.alcance
    };
    ordenAreasRef.current = areasPlanActual.map(a => a.nombre);
    setPlan(planActual);
    setAreasPlan(areasPlanActual);
    setProgreso(progresoActual);
    setPropuestas(propuestasActual);
    setFase('generando');
    setResultado(null);

    try {
      const propuestasIA: PropuestaIA[] = propuestasActual.map(p => ({
        clave: p.clave,
        name: p.texto || p.name,
        area: p.area,
        type_furps: p.type_furps,
        ai_evaluation: p.ai_evaluation,
        ai_observations: p.ai_observations,
        origen: p.origen ?? 'explicito',
        prioridad: p.prioridad ?? 'Must',
        justificacion: p.justificacion ?? '',
        cifras_sin_respaldo: p.cifras_sin_respaldo,
        posibleDuplicado: p.posibleDuplicado
      }));
      const res = await continuarGeneracion(
        userPrompt,
        { ...opciones, alcance: opciones.alcance, existentes, signal: controlador.signal },
        {
          revisarPlan: async () => areasPlanActual,
          onProgreso: setProgreso,
          onPropuestas: nuevas =>
            setPropuestas(prev => ordenarPorArea([...(prev ?? []), ...nuevas.map(aRevisable)], ordenAreasRef.current)),
          // Un parecido por significado se marca igual que uno léxico; la propuesta sigue elegida.
          onDuplicadosSemanticos: marcas => {
            const porClave = new Map(marcas.map(m => [m.clave, m]));
            setPropuestas(prev => prev?.map(p => {
              const m = porClave.get(p.clave);
              return m ? { ...p, posibleDuplicado: { etiqueta: m.etiqueta, texto: m.texto, similitud: m.similitud, semantico: true } } : p;
            }) ?? null);
          }
        },
        planActual, areasPlanActual, progresoActual, propuestasIA
      );
      resolverPlanRef.current = null;
      if (controladorRef.current === controlador) controladorRef.current = null;
      if (res.codigoError === 'JOB_INVALID' && res.propuestas.length === 0) {
        limpiarGuardado();
      }
      setResultado({ estado: res.estado, motivo: res.motivo });
      if (res.propuestas.length === 0) {
        setPropuestas(null);
        setFase('inactivo');
      } else {
        setFase('listo');
      }
      return res;
    } catch (err) {
      if (controladorRef.current === controlador) controladorRef.current = null;
      const tienePropuestas = propuestasActual.length > 0;
      setFase(tienePropuestas ? 'listo' : 'inactivo');
      if (!tienePropuestas) setPropuestas(null);
      const motivo = err instanceof AIError ? err.message : 'No se pudo reanudar la generación. Inténtalo de nuevo.';
      setResultado({ estado: 'error', motivo });
      return { estado: 'error', motivo, plan: planActual, propuestas: [] };
    }
  }, [plan, areasPlan, progreso, propuestas, limpiarGuardado]);

  const confirmarPlan = useCallback((existentesParaReanudar?: RequerimientoExistente[]) => {
    const areas = areasPlan
      .map(a => ({ ...a, nombre: a.nombre.trim(), enfoque: a.enfoque.trim() }))
      .filter(a => a.nombre);
    // Dos áreas con el mismo nombre se pisarían los generados: se queda la primera.
    const unicas = areas.filter((a, i) => areas.findIndex(b => b.nombre.toLowerCase() === a.nombre.toLowerCase()) === i);
    if (unicas.length === 0) return false;
    ordenAreasRef.current = unicas.map(a => a.nombre);
    setAreasPlan(unicas);
    setFase('generando');
    if (resolverPlanRef.current) {
      resolverPlanRef.current(unicas);
      resolverPlanRef.current = null;
    } else if (plan) {
      // Si se restauró desde sessionStorage mientras estaba en 'revisando-plan', no hay promesa viva
      // de `iniciar`: se arranca directamente `continuar` con el job_id del plan guardado.
      void continuar(promptRef.current, opcionesRef.current, existentesParaReanudar ?? [], {
        plan,
        areasPlan: unicas,
        progreso: normalizarProgresoParaReanudar(plan, unicas, progreso, propuestas),
        propuestas: propuestas ?? []
      });
    }
    return true;
  }, [areasPlan, plan, progreso, propuestas, continuar]);

  const cancelarPlan = useCallback(() => {
    if (resolverPlanRef.current) {
      resolverPlanRef.current(null);
      resolverPlanRef.current = null;
    } else {
      limpiarGuardado();
      setFase('inactivo');
      setPlan(null);
      setProgreso(null);
      setPropuestas(null);
      setResultado(null);
    }
  }, [limpiarGuardado]);

  /** Detiene la corrida; lo generado hasta aquí se conserva para revisarlo. */
  const detener = useCallback(() => {
    controladorRef.current?.abort();
    resolverPlanRef.current?.(null);
    resolverPlanRef.current = null;
  }, []);

  const reiniciar = useCallback(() => {
    controladorRef.current?.abort();
    resolverPlanRef.current?.(null);
    resolverPlanRef.current = null;
    limpiarGuardado();
    setFase('inactivo');
    setPlan(null);
    setProgreso(null);
    setPropuestas(null);
    setResultado(null);
  }, [limpiarGuardado]);

  /** Quita de la revisión las propuestas ya registradas. */
  const quitar = useCallback((claves: Set<string>) => {
    setPropuestas(prev => {
      const quedan = (prev ?? []).filter(p => !claves.has(p.clave));
      return quedan.length ? quedan : null;
    });
  }, []);

  // Una corrida en marcha se cancela si el componente que la usa desaparece.
  useEffect(() => () => controladorRef.current?.abort(), []);

  return {
    fase, ocupado, plan, areasPlan, setAreasPlan, progreso, propuestas, setPropuestas, resultado,
    guardado, hayGuardado, aplicarGuardado, limpiarGuardado,
    iniciar, iniciarRapida, continuar, confirmarPlan, cancelarPlan, detener, reiniciar, quitar
  };
}

export type GeneracionIterativa = ReturnType<typeof useGeneracionIterativa>;

// ==========================================
// PANEL
// ==========================================

/** Textarea que crece con su contenido: el enunciado se lee entero, sin scroll interno. */
function TextareaAutoajustable({ value, onChange, disabled, ...rest }: {
  value: string;
  onChange: (valor: string) => void;
  disabled?: boolean;
  'aria-label': string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ajustar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useLayoutEffect(ajustar, [value, ajustar]);
  // Al cambiar el ancho (girar el móvil, redimensionar) el texto ocupa otras líneas
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let ancho = el.clientWidth;
    const observador = new ResizeObserver(() => {
      if (el.clientWidth !== ancho) {
        ancho = el.clientWidth;
        ajustar();
      }
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [ajustar]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      {...rest}
      className="block w-full px-2 py-1 bg-transparent border border-transparent hover:border-line focus:border-brand-text rounded-ui text-sm text-ink leading-relaxed resize-none overflow-hidden focus:outline-none"
    />
  );
}

const NOMBRES_FURPS: Record<PropuestaIA['type_furps'], string> = {
  Functionality: 'Funcional',
  Usability: 'Usabilidad',
  Reliability: 'Confiabilidad',
  Performance: 'Rendimiento',
  Supportability: 'Soporte'
};

const etiquetaChip = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-ui text-[11px] font-medium border';
const selectChico = 'px-2 min-h-8 text-xs border border-line-strong rounded-ui bg-surface text-ink focus:outline-none focus:border-brand-text';

interface FiltrosPropuestas {
  q: string;
  origen: 'todos' | OrigenIA;
  prioridad: 'todas' | PrioridadMoSCoW;
  furps: 'todos' | PropuestaIA['type_furps'];
  duplicados: 'todos' | 'ocultar' | 'solo';
}

const FILTROS_VACIOS: FiltrosPropuestas = { q: '', origen: 'todos', prioridad: 'todas', furps: 'todos', duplicados: 'todos' };

interface PanelProps {
  gen: GeneracionIterativa;
  /** Nombre del tipo del catálogo con el que se registrará cada propuesta. */
  nombreTipo: (p: PropuestaRevisable) => string;
  /** Requerimientos existentes del proyecto (para reanudar desde un mapa restaurado). */
  existentes?: RequerimientoExistente[];
  /** Mientras se registran, nada se puede editar. */
  bloqueado?: boolean;
}

export default function PanelGeneracionIterativa({ gen, nombreTipo, existentes, bloqueado }: PanelProps) {
  const { fase, plan, areasPlan, setAreasPlan, progreso, propuestas, setPropuestas, resultado } = gen;
  const [filtros, setFiltros] = useState<FiltrosPropuestas>(FILTROS_VACIOS);

  const contenedorRef = useRef<HTMLDivElement>(null);
  const seccionPlanificandoRef = useRef<HTMLElement>(null);
  const seccionMapaRef = useRef<HTMLElement>(null);
  const seccionProgresoRef = useRef<HTMLElement>(null);
  const seccionCargandoRapidaRef = useRef<HTMLElement>(null);

  const scrollHacia = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const scroll = () => {
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    requestAnimationFrame(scroll);
    const timer = setTimeout(scroll, 100);
    return () => clearTimeout(timer);
  }, []);

  const faseAnteriorRef = useRef<Fase>(fase);
  useEffect(() => {
    const previa = faseAnteriorRef.current;
    faseAnteriorRef.current = fase;

    if (fase === 'planificando') {
      scrollHacia(seccionPlanificandoRef.current ?? contenedorRef.current);
    } else if (fase === 'revisando-plan') {
      scrollHacia(seccionMapaRef.current ?? contenedorRef.current);
    } else if (fase === 'generando' && previa !== 'generando') {
      scrollHacia(seccionProgresoRef.current ?? seccionCargandoRapidaRef.current ?? contenedorRef.current);
    }
  }, [fase, scrollHacia]);

  const visibles = useMemo(() => {
    const q = filtros.q.trim().toLowerCase();
    return (propuestas ?? []).filter(p =>
      (!q || p.texto.toLowerCase().includes(q) || p.area.toLowerCase().includes(q)) &&
      (filtros.origen === 'todos' || p.origen === filtros.origen) &&
      (filtros.prioridad === 'todas' || p.prioridad === filtros.prioridad) &&
      (filtros.furps === 'todos' || p.type_furps === filtros.furps) &&
      (filtros.duplicados === 'todos' || (filtros.duplicados === 'solo') === !!p.posibleDuplicado)
    );
  }, [propuestas, filtros]);

  // Agrupadas por área, en el orden del mapa (y al final las que la cobertura puso en otras).
  const grupos = useMemo(() => {
    const orden = progreso?.areas.map(a => a.nombre) ?? areasPlan.map(a => a.nombre);
    const mapa = new Map<string, PropuestaRevisable[]>();
    for (const p of visibles) mapa.set(p.area, [...(mapa.get(p.area) ?? []), p]);
    return [...mapa.entries()].sort(([a], [b]) => {
      const ia = orden.indexOf(a);
      const ib = orden.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [visibles, progreso, areasPlan]);

  /** Mueve un área del mapa una posición arriba (-1) o abajo (+1). */
  const moverArea = (i: number, paso: -1 | 1) =>
    setAreasPlan(prev => {
      const j = i + paso;
      if (j < 0 || j >= prev.length) return prev;
      const copia = [...prev];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });

  const actualizar = (clave: string, cambio: Partial<PropuestaRevisable>) =>
    setPropuestas(prev => prev?.map(p => (p.clave === clave ? { ...p, ...cambio } : p)) ?? null);

  /** Elige o quita de una vez un conjunto de propuestas (las visibles de un área, o todas las visibles). */
  const elegirVarias = (claves: string[], elegida: boolean) => {
    const set = new Set(claves);
    setPropuestas(prev => prev?.map(p => (set.has(p.clave) ? { ...p, elegida } : p)) ?? null);
  };

  const hayFiltros = JSON.stringify(filtros) !== JSON.stringify(FILTROS_VACIOS);
  const elegidas = propuestas?.filter(p => p.elegida).length ?? 0;
  const todasVisiblesElegidas = visibles.length > 0 && visibles.every(p => p.elegida);
  const hayPropuestas = !!propuestas?.length;

  // Cómo terminó la última corrida, si hay algo que contar además de las propuestas.
  const aviso = !resultado || fase === 'generando' || fase === 'revisando-plan'
    ? null
    : resultado.estado === 'cancelado' && hayPropuestas
      ? (resultado.motivo || 'Detuviste la generación: puedes revisar y registrar lo que se alcanzó a generar.')
      : resultado.estado === 'limite'
        ? 'Se alcanzó el tope de esta generación. Revisa lo generado; si falta algo, inicia otra con un pedido más concreto.'
        : resultado.estado === 'error' && resultado.motivo
          ? hayPropuestas ? `${resultado.motivo} Se conserva lo generado hasta el fallo.` : resultado.motivo
          : null;

  return (
    <div ref={contenedorRef} className="space-y-4 scroll-mt-4">
      {/* Paso 0: armando el plan */}
      {fase === 'planificando' && (
        <section
          ref={seccionPlanificandoRef}
          aria-labelledby="gen-planificando-titulo"
          aria-live="polite"
          className="rounded-ui border border-brand-line bg-brand-subtle/40 p-4 space-y-2 animate-in fade-in scroll-mt-4"
        >
          <div className="flex items-center gap-2.5">
            <Loader2 size={16} className="animate-spin text-brand-text shrink-0" aria-hidden />
            <h3 id="gen-planificando-titulo" className="text-sm font-semibold text-ink">
              Armando el mapa de áreas...
            </h3>
          </div>
          <p className="text-xs text-ink-muted">
            Analizando el pedido y el contexto para estructurar la generación por áreas funcionales. En unos segundos podrás revisar y ajustar el mapa.
          </p>
        </section>
      )}

      {/* Generación rápida cargando */}
      {fase === 'generando' && !progreso && (!propuestas || propuestas.length === 0) && (
        <section
          ref={seccionCargandoRapidaRef}
          aria-labelledby="gen-rapida-cargando"
          aria-live="polite"
          className="rounded-ui border border-brand-line bg-brand-subtle/40 p-4 space-y-2 animate-in fade-in scroll-mt-4"
        >
          <div className="flex items-center gap-2.5">
            <Loader2 size={16} className="animate-spin text-brand-text shrink-0" aria-hidden />
            <h3 id="gen-rapida-cargando" className="text-sm font-semibold text-ink">
              Generando requerimientos...
            </h3>
          </div>
          <p className="text-xs text-ink-muted">
            Analizando el sistema y redactando las propuestas de requerimientos.
          </p>
        </section>
      )}

      {/* Paso 1: mapa de áreas editable */}
      {fase === 'revisando-plan' && plan && (
        <section
          ref={seccionMapaRef}
          id="gen-mapa"
          aria-labelledby="gen-mapa-titulo"
          className="rounded-ui border border-brand-line bg-brand-subtle/40 p-4 space-y-3 animate-in fade-in scroll-mt-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 id="gen-mapa-titulo" className="text-sm font-semibold text-ink flex items-center gap-1.5">
                <MapaIcono size={15} aria-hidden className="text-brand-text" />
                Mapa de áreas ({plan.alcance === 'sistema' ? 'sistema completo' : 'un módulo'})
              </h3>
              <p className="text-xs text-ink-muted mt-0.5">
                Están en el orden en que se recorre el sistema. Reordénalas, quítalas, agrégalas o renómbralas antes de generar: ese orden es el de la lista y el de la numeración.
              </p>
            </div>
          </div>
          <ul className="space-y-2">
            {areasPlan.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-2.5 w-5 shrink-0 text-right text-xs font-semibold text-ink-subtle tabular-nums">{i + 1}.</span>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
                  <input
                    value={a.nombre}
                    maxLength={120}
                    onChange={e => setAreasPlan(prev => prev.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
                    aria-label={`Nombre del área ${i + 1}`}
                    className={`${campo} text-sm font-medium`}
                  />
                  <input
                    value={a.enfoque}
                    maxLength={300}
                    placeholder="Qué debe cubrir (opcional)"
                    onChange={e => setAreasPlan(prev => prev.map((x, j) => (j === i ? { ...x, enfoque: e.target.value } : x)))}
                    aria-label={`Enfoque del área ${i + 1}`}
                    className={`${campo} text-sm`}
                  />
                </div>
                {a.transversal && (
                  <span className={`${etiquetaChip} mt-2.5 bg-sunken text-ink-muted border-line`} title="Área de calidad que atraviesa todo el sistema">
                    Calidad
                  </span>
                )}
                <div className="flex flex-col shrink-0">
                  <button
                    type="button"
                    onClick={() => moverArea(i, -1)}
                    disabled={i === 0}
                    aria-label={`Subir el área ${a.nombre || i + 1}`}
                    title="Subir"
                    className="inline-flex items-center justify-center size-5 rounded-ui text-ink-subtle hover:text-ink hover:bg-sunken cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moverArea(i, 1)}
                    disabled={i === areasPlan.length - 1}
                    aria-label={`Bajar el área ${a.nombre || i + 1}`}
                    title="Bajar"
                    className="inline-flex items-center justify-center size-5 rounded-ui text-ink-subtle hover:text-ink hover:bg-sunken cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setAreasPlan(prev => prev.filter((_, j) => j !== i))}
                  aria-label={`Quitar el área ${a.nombre || i + 1}`}
                  className={`${btnIconoPeligro} mt-0.5 shrink-0`}
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setAreasPlan(prev => [...prev, { nombre: '', enfoque: '', transversal: false }])}
              disabled={areasPlan.length >= 25}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-text hover:underline cursor-pointer disabled:opacity-50"
            >
              <Plus size={13} aria-hidden />
              Agregar área
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={gen.cancelarPlan} className={btnSecundario}>Cancelar</button>
              <button
                type="button"
                onClick={() => gen.confirmarPlan(existentes)}
                disabled={!areasPlan.some(a => a.nombre.trim())}
                className={btnPrimario}
              >
                Generar {areasPlan.filter(a => a.nombre.trim()).length} áreas
              </button>
            </div>
          </div>
          <p className="text-[11px] text-ink-subtle">
            Toda la generación cuenta como un solo uso de IA del día. Puedes detenerla cuando quieras y conservar lo generado.
          </p>
        </section>
      )}

      {/* Paso 2: progreso por área */}
      {(fase === 'generando' || fase === 'listo') && progreso && progreso.areas.length > 0 && (
        <section
          ref={seccionProgresoRef}
          id="gen-progreso"
          aria-labelledby="gen-progreso-titulo"
          className="rounded-ui border border-line p-3 space-y-2 animate-in fade-in scroll-mt-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 id="gen-progreso-titulo" className="text-sm font-semibold text-ink">
              {fase === 'generando'
                ? progreso.fase === 'cobertura'
                  ? 'Revisando que no falte nada...'
                  : progreso.fase === 'duplicados' ? 'Buscando duplicados por significado...' : 'Generando por áreas...'
                : 'Generación terminada'}
              <span className="font-normal text-ink-subtle"> · {progreso.total} propuestas</span>
            </h3>
            {fase === 'generando' && (
              <button type="button" onClick={gen.detener} className={`${btnSecundario} min-h-8 px-3 text-xs`}>
                <Square size={12} aria-hidden />
                Detener
              </button>
            )}
          </div>
          {progreso.esperando ? (
            <p className="text-xs text-warning" role="status">
              Se alcanzó el límite de peticiones por minuto: se reanuda solo en {progreso.esperando} s.
            </p>
          ) : null}
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {progreso.areas.map(a => (
              <li key={a.nombre} className="flex items-center gap-2 min-w-0" title={a.mensaje}>
                {a.estado === 'generando' ? (
                  <Loader2 size={13} className="animate-spin text-brand-text shrink-0" aria-label="Generando" />
                ) : a.estado === 'completa' ? (
                  <Check size={13} className="text-success shrink-0" aria-label="Completa" />
                ) : a.estado === 'error' ? (
                  <XCircle size={13} className="text-danger shrink-0" aria-label="Con error" />
                ) : a.estado === 'detenida' ? (
                  <Square size={11} className="text-ink-subtle shrink-0" aria-label="Detenida" />
                ) : (
                  <CircleDashed size={13} className="text-ink-subtle shrink-0" aria-label="En espera" />
                )}
                <span className="truncate text-ink">{a.nombre}</span>
                <span className="ml-auto shrink-0 text-ink-subtle tabular-nums">
                  {a.nuevas}{a.descartadas ? ` · ${a.descartadas} repetidas` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {aviso && (
        <p className="flex items-start gap-2 text-xs text-ink-muted" role="status">
          <AlertTriangle size={14} className="text-warning shrink-0 mt-px" aria-hidden />
          {aviso}
        </p>
      )}

      {/* Paso 3: revisión de las propuestas */}
      {propuestas && propuestas.length > 0 && (
        <section aria-labelledby="gen-propuestas" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="gen-propuestas" className="text-sm font-semibold text-ink">
              Propuestas de la IA{' '}
              <span className="font-normal text-ink-subtle">({elegidas} de {propuestas.length} elegidas)</span>
            </h3>
            <button
              type="button"
              onClick={() => elegirVarias(visibles.map(p => p.clave), !todasVisiblesElegidas)}
              disabled={bloqueado || visibles.length === 0}
              className="text-xs font-semibold text-brand-text hover:underline cursor-pointer disabled:opacity-50"
            >
              {todasVisiblesElegidas ? 'Quitar las visibles' : 'Elegir las visibles'}
            </button>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-40">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" aria-hidden />
              <input
                value={filtros.q}
                onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
                placeholder="Buscar en las propuestas"
                aria-label="Buscar en las propuestas"
                className={`${selectChico} w-full pl-7`}
              />
            </div>
            <select value={filtros.origen} onChange={e => setFiltros(f => ({ ...f, origen: e.target.value as FiltrosPropuestas['origen'] }))} aria-label="Filtrar por origen" className={selectChico}>
              <option value="todos">Explícitos e inferidos</option>
              <option value="explicito">Solo explícitos</option>
              <option value="inferido">Solo inferidos</option>
            </select>
            <select value={filtros.prioridad} onChange={e => setFiltros(f => ({ ...f, prioridad: e.target.value as FiltrosPropuestas['prioridad'] }))} aria-label="Filtrar por prioridad" className={selectChico}>
              <option value="todas">Toda prioridad</option>
              <option value="Must">Must</option>
              <option value="Should">Should</option>
              <option value="Could">Could</option>
              <option value="Wont">Won&apos;t</option>
            </select>
            <select value={filtros.furps} onChange={e => setFiltros(f => ({ ...f, furps: e.target.value as FiltrosPropuestas['furps'] }))} aria-label="Filtrar por tipo" className={selectChico}>
              <option value="todos">Todo tipo</option>
              {Object.entries(NOMBRES_FURPS).map(([valor, nombre]) => (
                <option key={valor} value={valor}>{nombre}</option>
              ))}
            </select>
            <select value={filtros.duplicados} onChange={e => setFiltros(f => ({ ...f, duplicados: e.target.value as FiltrosPropuestas['duplicados'] }))} aria-label="Filtrar posibles duplicados" className={selectChico}>
              <option value="todos">Con posibles duplicados</option>
              <option value="ocultar">Sin posibles duplicados</option>
              <option value="solo">Solo posibles duplicados</option>
            </select>
            {hayFiltros && (
              <button type="button" onClick={() => setFiltros(FILTROS_VACIOS)} className="text-xs font-semibold text-brand-text hover:underline cursor-pointer">
                Quitar filtros
              </button>
            )}
          </div>

          {grupos.length === 0 ? (
            <p className="text-sm text-ink-subtle py-6 text-center border border-line rounded-ui">Ninguna propuesta coincide con los filtros.</p>
          ) : (
            <div className="sm:max-h-[28rem] sm:overflow-y-auto rounded-ui border border-line custom-scrollbar">
              {grupos.map(([area, lista]) => {
                const todasElegidas = lista.every(p => p.elegida);
                return (
                  <section key={area} aria-label={`Área ${area}`}>
                    <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-sunken border-b border-line">
                      <input
                        type="checkbox"
                        checked={todasElegidas}
                        disabled={bloqueado}
                        onChange={() => elegirVarias(lista.map(p => p.clave), !todasElegidas)}
                        aria-label={`Seleccionar toda el área ${area}`}
                        title="Seleccionar toda el área"
                        className="size-4 accent-brand-text shrink-0 cursor-pointer"
                      />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted truncate">{area}</span>
                      <span className="ml-auto text-[11px] text-ink-subtle tabular-nums">
                        {lista.filter(p => p.elegida).length}/{lista.length}
                      </span>
                    </div>
                    <ul className="divide-y divide-line">
                      {lista.map(p => (
                        <li key={p.clave} className={`flex items-start gap-3 px-3 py-2.5 ${p.elegida ? '' : 'opacity-60'}`}>
                          <input
                            type="checkbox"
                            checked={p.elegida}
                            disabled={bloqueado}
                            onChange={() => actualizar(p.clave, { elegida: !p.elegida })}
                            aria-label={`Registrar: ${p.texto.slice(0, 60)}`}
                            className="mt-2 size-4 accent-brand-text shrink-0 cursor-pointer"
                          />
                          <div className="flex-1 min-w-0 space-y-1">
                            <TextareaAutoajustable
                              value={p.texto}
                              disabled={bloqueado}
                              onChange={texto => actualizar(p.clave, { texto })}
                              aria-label="Texto de la propuesta"
                            />
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`${etiquetaChip} bg-sunken text-ink-muted border-line`}>{nombreTipo(p)}</span>
                              {p.prioridad && (
                                <span className={`${etiquetaChip} bg-surface text-ink-muted border-line`} title="Prioridad MoSCoW propuesta">
                                  {p.prioridad === 'Wont' ? "Won't" : p.prioridad}
                                </span>
                              )}
                              {p.origen === 'inferido' && (
                                <span className={`${etiquetaChip} bg-brand-subtle text-brand-text border-brand-line`} title="La IA lo dedujo: el pedido y el contexto no lo dicen">
                                  Inferido
                                </span>
                              )}
                              {p.posibleDuplicado && (
                                <span className={`${etiquetaChip} bg-warning-subtle text-warning border-warning-line`}>
                                  <Copy size={10} aria-hidden />
                                  Posible duplicado de {p.posibleDuplicado.etiqueta}
                                  <span className="font-normal opacity-80">
                                    ({p.posibleDuplicado.semantico ? 'mismo significado' : 'texto parecido'}, {Math.round(p.posibleDuplicado.similitud * 100)} %)
                                  </span>
                                </span>
                              )}
                              {p.cifras_sin_respaldo?.length ? (
                                <span className={`${etiquetaChip} bg-danger-subtle text-danger border-danger-line`} title="Estas cifras no aparecen en el pedido ni en el contexto">
                                  <AlertTriangle size={10} aria-hidden />
                                  Revisa: {p.cifras_sin_respaldo.join(', ')}
                                </span>
                              ) : null}
                            </div>
                            {p.posibleDuplicado?.texto && (
                              <p className="text-xs text-ink-muted leading-snug border-l-2 border-warning-line pl-2">
                                <span className="font-semibold">{p.posibleDuplicado.etiqueta}:</span> {p.posibleDuplicado.texto}
                              </p>
                            )}
                            {p.justificacion && <p className="text-[11px] text-ink-subtle leading-snug">{p.justificacion}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
