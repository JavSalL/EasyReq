import { auth } from "./firebase";
import { IndiceDuplicados, clasificarDuplicado } from "./dedup-requerimientos";

// Las llamadas a Gemini se hacen en un Cloudflare Worker (workers/ai-proxy).
// La key de Gemini vive allí como secreto; el navegador solo envía el ID token
// de Firebase y los parámetros. Los prompts se construyen en el Worker.
// La URL del Worker es pública (no es un secreto): se usa la desplegada en Cloudflare y
// NEXT_PUBLIC_AI_API_URL solo hace falta para apuntar a otro Worker (p. ej. uno local).
const AI_API_URL_POR_DEFECTO = "https://easyreq-ai.easy-req.workers.dev";
const AI_API_URL = (process.env.NEXT_PUBLIC_AI_API_URL || AI_API_URL_POR_DEFECTO).replace(/\/+$/, "");

export interface AIRequirement {
  name: string;
  type_furps: 'Functionality' | 'Usability' | 'Reliability' | 'Performance' | 'Supportability';
  ai_evaluation: {
    actor: boolean;
    accion: boolean;
    objeto: boolean;
    datos_entrada: boolean;
    resultado: boolean;
  };
  ai_observations?: string;
  /** false cuando la entrada no da base para un requerimiento; entonces `motivo` explica qué falta. */
  valido?: boolean;
  motivo?: string;
}

export type AIErrorCode =
  | 'UNAUTHENTICATED'
  | 'EMAIL_NOT_VERIFIED'
  | 'RATE_LIMITED'
  | 'DAILY_LIMIT'
  | 'INVALID_INPUT'
  | 'UNAVAILABLE'
  // Generación iterativa (KAN-40): la corrida caducó o no es del usuario / gastó sus llamadas.
  | 'JOB_INVALID'
  | 'JOB_LIMIT';

/** Error del servicio de IA con un mensaje apto para mostrar al usuario. */
export class AIError extends Error {
  /** Segundos que pide esperar el servicio antes de reintentar (cabecera Retry-After). */
  constructor(public code: AIErrorCode, message: string, public retryAfter?: number) {
    super(message);
    this.name = 'AIError';
  }
}

/**
 * Llama a un endpoint del Worker de IA con el ID token del usuario actual.
 * Lanza `AIError` si no hay sesión, si se superó el límite o si el servicio falla.
 */
async function callAI<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  if (!AI_API_URL) {
    console.error('[EasyReq] Falta NEXT_PUBLIC_AI_API_URL en .env.local');
    throw new AIError('UNAVAILABLE', 'El servicio de IA no está configurado.');
  }

  const user = auth.currentUser;
  if (!user) {
    throw new AIError('UNAUTHENTICATED', 'Debes iniciar sesión para usar la IA.');
  }
  const token = await user.getIdToken();

  let res: Response;
  try {
    res = await fetch(`${AI_API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    // Una cancelación del usuario no es un fallo del servicio: se deja pasar tal cual.
    if (signal?.aborted) throw err;
    throw new AIError('UNAVAILABLE', 'No se pudo conectar con el servicio de IA. Inténtalo de nuevo.');
  }

  const payload = await res.json().catch(() => null) as
    | { data?: T; error?: { code?: string; message?: string } }
    | null;

  if (!res.ok) {
    const code = (payload?.error?.code ?? 'UNAVAILABLE') as AIErrorCode;
    const message = payload?.error?.message ?? 'El servicio de IA no está disponible en este momento.';
    const retryAfter = Number.parseInt(res.headers.get('Retry-After') ?? '', 10);
    throw new AIError(code, message, Number.isFinite(retryAfter) ? retryAfter : undefined);
  }

  return payload?.data as T;
}

/** Qué tan estricta es la IA al redactar: 1 flexible ... 4 literal. 3 es el valor por defecto. */
export type Estrictez = 1 | 2 | 3 | 4;

export const NIVELES_ESTRICTEZ: Record<Estrictez, { nombre: string; descripcion: string }> = {
  1: { nombre: 'Baja', descripcion: 'Completa con detalles habituales del dominio cuando el texto no los da.' },
  2: { nombre: 'Media', descripcion: 'Deduce lo implícito del texto y del contexto, sin inventar cifras.' },
  3: { nombre: 'Alta', descripcion: 'Solo usa lo que escribiste; lo que falte queda «(por definir)».' },
  4: { nombre: 'Máxima', descripcion: 'Literal: si falta actor, acción u objeto, no lo redacta.' }
};

export const ESTRICTEZ_POR_DEFECTO: Estrictez = 3;

/** Opciones de redacción comunes a la generación individual y masiva. */
export interface OpcionesGeneracion {
  /** Estructura del patrón elegido. */
  pattern?: string;
  /** Nombre del tipo de requerimiento elegido (p. ej. "Confiabilidad"). */
  tipo?: string;
  estrictez?: Estrictez;
  /** Hasta 3 ejemplos en los que se basa la IA (few-shot). */
  ejemplos?: string[];
  /** Contexto del proyecto (descripción y archivos), ya unido en texto. */
  contexto?: string;
}

export interface ResultadoMasivo {
  valido: boolean;
  motivo?: string;
  areas: Array<{ nombre: string; enfoque: string; cantidad: number }>;
  requerimientos: Array<AIRequirement & { area?: string }>;
}

const cuerpoOpciones = (o: OpcionesGeneracion) => ({
  pattern: o.pattern || undefined,
  tipo: o.tipo || undefined,
  estrictez: o.estrictez ?? ESTRICTEZ_POR_DEFECTO,
  ejemplos: (o.ejemplos ?? []).map(e => e.trim()).filter(Boolean),
  contexto: o.contexto?.trim() || undefined
});

/**
 * Genera varios requerimientos a partir de un pedido y del contexto del proyecto. La IA decide
 * cuántos según el alcance del pedido (una parte del sistema o el sistema completo).
 */
export async function generateBulkRequirements(userPrompt: string, opciones: OpcionesGeneracion = {}): Promise<ResultadoMasivo> {
  const result = await callAI<ResultadoMasivo>('/generate-bulk', { userPrompt, ...cuerpoOpciones(opciones) });
  return {
    valido: result?.valido !== false,
    motivo: result?.motivo,
    areas: Array.isArray(result?.areas) ? result.areas : [],
    requerimientos: Array.isArray(result?.requerimientos) ? result.requerimientos : []
  };
}

/**
 * Genera un requerimiento a partir del texto del usuario.
 */
export async function generateSingleRequirement(userPrompt: string, opciones: OpcionesGeneracion = {}): Promise<AIRequirement | null> {
  const result = await callAI<AIRequirement | null>('/generate-single', { userPrompt, ...cuerpoOpciones(opciones) });
  return result ?? null;
}

/** Extrae el texto de un PDF (en base64) para usarlo como contexto del proyecto. */
export async function extraerTextoPdf(base64: string): Promise<string> {
  const result = await callAI<{ texto?: string }>('/extract-text', { mimeType: 'application/pdf', data: base64 });
  return result?.texto ?? '';
}

/**
 * Evalúa un requerimiento existente de forma inteligente.
 */
export async function evaluateRequirement(requirementText: string, pattern?: string): Promise<Partial<AIRequirement>> {
  const result = await callAI<Partial<AIRequirement>>('/evaluate', { requirementText, pattern });
  return result ?? {};
}

// ==========================================
// GENERACIÓN ITERATIVA (KAN-40)
// ==========================================
// La IA arma un mapa de áreas y luego redacta cada área por lotes hasta darla por cubierta; al
// final una revisión de cobertura busca lo que falte. Cada paso es una llamada al Worker y este
// orquestador decide cuándo seguir. Toda la corrida cuenta como un solo uso de la cuota diaria:
// el plan abre un "job" y los pasos siguientes lo presentan. Nada se registra: el resultado son
// propuestas que el usuario revisa.

export type AlcanceGeneracion = 'sistema' | 'modulo';
export type OrigenIA = 'explicito' | 'inferido';
export type PrioridadMoSCoW = 'Must' | 'Should' | 'Could' | 'Wont';

export interface AreaGeneracion {
  nombre: string;
  enfoque: string;
  /** Área de calidad que atraviesa todo el sistema (seguridad, rendimiento...). */
  transversal: boolean;
}

export interface PlanGeneracion {
  valido: boolean;
  motivo?: string;
  alcance: AlcanceGeneracion;
  areas: AreaGeneracion[];
  job_id?: string;
  llamadas_restantes?: number;
}

export interface RequerimientoIA extends AIRequirement {
  origen: OrigenIA;
  prioridad: PrioridadMoSCoW;
  justificacion: string;
  /** Cifras que no aparecen en el pedido ni en el contexto (probablemente inventadas). */
  cifras_sin_respaldo?: string[];
  area?: string;
}

/** Un requerimiento propuesto por la IA, listo para revisar. */
export interface PropuestaIA extends RequerimientoIA {
  clave: string;
  area: string;
  /**
   * Parecido con un requerimiento existente u otra propuesta: léxico (0,6-0,85 de trigramas) o,
   * con `semantico`, por significado (coseno de embeddings ≥ 0,90).
   */
  posibleDuplicado?: { etiqueta: string; texto: string; similitud: number; semantico?: boolean };
}

/** Requerimiento que ya tiene el proyecto, en la forma compacta que se manda a la IA. */
export interface RequerimientoExistente {
  codigo: string;
  modulo?: string | null;
  enunciado: string;
}

export type EstadoArea = 'pendiente' | 'generando' | 'completa' | 'detenida' | 'error';

export interface ProgresoArea {
  nombre: string;
  estado: EstadoArea;
  lotes: number;
  /** Propuestas nuevas que aportó (tras quitar repetidos). */
  nuevas: number;
  /** Candidatas descartadas por repetir algo existente o ya generado. */
  descartadas: number;
  mensaje?: string;
}

export interface ProgresoGeneracion {
  fase: 'plan' | 'revision-plan' | 'areas' | 'cobertura' | 'duplicados' | 'fin';
  areas: ProgresoArea[];
  total: number;
  llamadasRestantes: number;
  /** Segundos de espera por el límite de peticiones por minuto, si aplica. */
  esperando?: number;
}

export interface OpcionesIterativas extends OpcionesGeneracion {
  /** 'auto' deja que la IA decida si el pedido es del sistema completo o de un módulo. */
  alcance?: AlcanceGeneracion | 'auto';
  existentes?: RequerimientoExistente[];
  signal?: AbortSignal;
}

export interface CallbacksGeneracion {
  /**
   * Recibe el mapa de áreas y devuelve el que el usuario confirmó (con áreas quitadas, añadidas o
   * renombradas), o null si canceló.
   */
  revisarPlan: (plan: PlanGeneracion) => Promise<AreaGeneracion[] | null>;
  onProgreso?: (progreso: ProgresoGeneracion) => void;
  /** Propuestas nuevas de un lote, ya filtradas de repetidos. */
  onPropuestas?: (nuevas: PropuestaIA[]) => void;
  /** Propuestas que, al final, resultaron parecidas por significado a algo existente u otra propuesta. */
  onDuplicadosSemanticos?: (marcas: Array<{ clave: string; etiqueta: string; texto: string; similitud: number }>) => void;
}

export interface ResultadoIterativo {
  /** completo: terminó; cancelado: el usuario lo detuvo; limite: se agotó el presupuesto; error: falló. */
  estado: 'completo' | 'cancelado' | 'limite' | 'error' | 'invalido';
  motivo?: string;
  plan: PlanGeneracion | null;
  propuestas: PropuestaIA[];
}

// Topes de la corrida. El Worker impone sus propios límites (60 llamadas por job); estos solo
// reparten el presupuesto para que todas las áreas reciban su parte.
const LOTE_POR_DEFECTO = 20;
const MAX_LOTES_POR_AREA = 8;
const MAX_PROPUESTAS = 400;
/** Lotes seguidos con menos de este número de propuestas nuevas dan el área por agotada. */
const MIN_NUEVAS_POR_LOTE = 3;
const MAX_LOTES_FLOJOS = 2;
const MAX_RONDAS_COBERTURA = 3;
/** Llamadas que se guardan para la cobertura (3 rondas) y la revisión de duplicados por significado. */
const RESERVA_COBERTURA = 4;
/** Áreas que se generan a la vez (el Worker admite 10 peticiones por minuto). */
const AREAS_EN_PARALELO = 2;
const MAX_REINTENTOS = 5;
// Lo que se manda como contexto de existentes: el del área completo y del resto un resumen.
const MAX_EXISTENTES_AREA = 300;
const MAX_LINEA = 700;
const MAX_RESUMEN = 50_000;
const MAX_GENERADOS = 800;
/** Existentes con los que se comparan las propuestas por significado (el Worker admite 600). */
const MAX_EMBED_EXISTENTES = 600;

const normalizarModulo = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** "REQ-001 | Pagos | enunciado", recortado a `max` caracteres de enunciado. */
const lineaExistente = (r: RequerimientoExistente, max: number) =>
  `${r.codigo} | ${r.modulo?.trim() || 'sin módulo'} | ${r.enunciado.length > max ? `${r.enunciado.slice(0, max)}…` : r.enunciado}`;

/** Resumen acotado de requerimientos existentes, para el plan y la cobertura. */
export function resumirExistentes(existentes: RequerimientoExistente[], maxCaracteres = MAX_RESUMEN): string {
  const lineas: string[] = [];
  let usados = 0;
  for (const r of existentes) {
    const linea = lineaExistente(r, 160);
    if (usados + linea.length + 1 > maxCaracteres) {
      lineas.push(`… y ${existentes.length - lineas.length} requerimientos más.`);
      break;
    }
    lineas.push(linea);
    usados += linea.length + 1;
  }
  return lineas.join('\n');
}

/** ¿El módulo guardado corresponde a esta área? Igual o uno contiene al otro, sin acentos. */
const esDelArea = (modulo: string | null | undefined, area: string) => {
  if (!modulo?.trim()) return false;
  const m = normalizarModulo(modulo);
  const a = normalizarModulo(area);
  return m === a || (m.length >= 4 && a.includes(m)) || (a.length >= 4 && m.includes(a));
};

const esperar = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Cancelado', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', alAbortar);
      resolve();
    }, ms);
    const alAbortar = () => {
      clearTimeout(t);
      reject(new DOMException('Cancelado', 'AbortError'));
    };
    signal?.addEventListener('abort', alAbortar, { once: true });
  });

const esCancelacion = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

/**
 * Llama al Worker respetando el límite por minuto: ante un 429 RATE_LIMITED espera lo que diga
 * Retry-After y reintenta solo. Un fallo pasajero del servicio se reintenta una vez.
 */
async function llamarConReintentos<T>(
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  onEspera: (segundos: number | undefined) => void
): Promise<T> {
  let caidas = 0;
  for (let intento = 0; ; intento++) {
    try {
      return await callAI<T>(path, body, signal);
    } catch (err) {
      if (!(err instanceof AIError) || intento >= MAX_REINTENTOS) throw err;
      if (err.code === 'RATE_LIMITED') {
        const segundos = err.retryAfter && err.retryAfter > 0 ? err.retryAfter : 60;
        onEspera(segundos);
        await esperar(segundos * 1000, signal);
        onEspera(undefined);
        continue;
      }
      if (err.code === 'UNAVAILABLE' && caidas++ === 0) {
        await esperar(3000, signal);
        continue;
      }
      throw err;
    }
  }
}

/** Ejecuta las tareas con a lo sumo `limite` a la vez. */
async function enParalelo<T>(items: T[], limite: number, tarea: (item: T) => Promise<void>): Promise<void> {
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (siguiente < items.length) await tarea(items[siguiente++]);
  });
  await Promise.all(trabajadores);
}

/** Pide el mapa de áreas (abre el job de la corrida y consume 1 uso de la cuota diaria). */
export async function planificarGeneracion(userPrompt: string, opciones: OpcionesIterativas = {}): Promise<PlanGeneracion> {
  const result = await callAI<PlanGeneracion>('/generation/plan', {
    userPrompt,
    alcance: opciones.alcance ?? 'auto',
    existentes: opciones.existentes?.length ? resumirExistentes(opciones.existentes) : undefined,
    ...cuerpoOpciones(opciones)
  }, opciones.signal);
  return {
    valido: result?.valido !== false,
    motivo: result?.motivo,
    alcance: result?.alcance === 'modulo' ? 'modulo' : 'sistema',
    areas: Array.isArray(result?.areas) ? result.areas : [],
    job_id: result?.job_id,
    llamadas_restantes: result?.llamadas_restantes
  };
}

/**
 * Genera todos los requerimientos del pedido (el sistema completo o un módulo) iterando por áreas.
 *
 * 1. Plan: la IA propone el mapa de áreas y el usuario lo edita (`revisarPlan`).
 * 2. Por área, lotes de ~20 hasta que la IA la dé por completa, o dos lotes seguidos aporten menos
 *    de 3 propuestas nuevas, o se llegue a 8 lotes. Las áreas avanzan por rondas para que el
 *    presupuesto de llamadas alcance a todas.
 * 3. Cobertura: hasta 3 revisiones que solo añaden lo que falte.
 *
 * Cada candidata se compara con los requerimientos existentes y con lo ya generado: si es casi
 * igual (≥ 0,85) se descarta, si se parece (0,6-0,85) se marca como posible duplicado. Cancelar
 * (con `signal`) conserva lo generado hasta ese momento.
 */
export async function runIterativeGeneration(
  userPrompt: string,
  opciones: OpcionesIterativas,
  callbacks: CallbacksGeneracion
): Promise<ResultadoIterativo> {
  const { signal } = opciones;
  const existentes = opciones.existentes ?? [];
  const propuestas: PropuestaIA[] = [];
  const progreso: ProgresoGeneracion = { fase: 'plan', areas: [], total: 0, llamadasRestantes: 0 };
  const avisar = () => callbacks.onProgreso?.({ ...progreso, areas: progreso.areas.map(a => ({ ...a })) });
  const onEspera = (segundos: number | undefined) => {
    progreso.esperando = segundos;
    avisar();
  };

  // Índice de lo conocido: lo existente desde el principio y cada propuesta al aceptarla.
  const indice = new IndiceDuplicados();
  existentes.forEach(r => indice.agregar(r.enunciado, r.codigo));

  let secuencia = 0;
  /** Filtra repetidos, registra las que pasan y devuelve cuántas entraron y cuántas se descartaron. */
  const incorporar = (candidatas: RequerimientoIA[], area: string) => {
    const nuevas: PropuestaIA[] = [];
    let descartadas = 0;
    for (const c of candidatas) {
      if (propuestas.length + nuevas.length >= MAX_PROPUESTAS) break;
      const veredicto = clasificarDuplicado(indice, c.name);
      if (veredicto.tipo === 'duplicado') {
        descartadas++;
        continue;
      }
      const propuesta: PropuestaIA = {
        ...c,
        area: c.area || area,
        clave: `${Date.now().toString(36)}-${(secuencia++).toString(36)}`,
        ...(veredicto.tipo === 'posible' ? { posibleDuplicado: veredicto.de } : {})
      };
      indice.agregar(c.name, `otra propuesta (${propuesta.area})`);
      nuevas.push(propuesta);
    }
    propuestas.push(...nuevas);
    progreso.total = propuestas.length;
    if (nuevas.length) callbacks.onPropuestas?.(nuevas);
    return { nuevas: nuevas.length, descartadas };
  };

  const base = cuerpoOpciones(opciones);
  let plan: PlanGeneracion | null = null;
  try {
    // 1. Plan
    avisar();
    plan = await planificarGeneracion(userPrompt, opciones);
    if (!plan.valido || plan.areas.length === 0 || !plan.job_id) {
      return { estado: 'invalido', motivo: plan.motivo || 'El pedido no da base para generar requerimientos.', plan, propuestas };
    }
    progreso.llamadasRestantes = plan.llamadas_restantes ?? 0;
    progreso.fase = 'revision-plan';
    avisar();

    const areas = await callbacks.revisarPlan(plan);
    if (!areas || areas.length === 0 || signal?.aborted) return { estado: 'cancelado', plan, propuestas };
    const jobId = plan.job_id;
    const alcance = plan.alcance;
    const nombres = areas.map(a => a.nombre);

    const resumenResto = (area: string) =>
      resumirExistentes(existentes.filter(r => !esDelArea(r.modulo, area)), MAX_RESUMEN / 2);
    const existentesArea = (area: string) =>
      existentes
        .filter(r => esDelArea(r.modulo, area))
        .slice(0, MAX_EXISTENTES_AREA)
        .map(r => lineaExistente(r, MAX_LINEA - 20));

    // 2. Lotes por área, por rondas
    progreso.fase = 'areas';
    progreso.areas = areas.map(a => ({ nombre: a.nombre, estado: 'pendiente', lotes: 0, nuevas: 0, descartadas: 0 }));
    avisar();
    const estado = areas.map(() => ({ pendiente: [] as string[], flojos: 0, terminada: false }));
    // Lo comparten las áreas que corren en paralelo: un objeto para que el cierre lo vea al día.
    const control: { limite: boolean; error: AIError | null } = { limite: false, error: null };

    const pasoDeArea = async (i: number) => {
      const area = areas[i];
      const p = progreso.areas[i];
      const e = estado[i];
      if (e.terminada || control.error || signal?.aborted) return;
      if (progreso.llamadasRestantes <= RESERVA_COBERTURA || propuestas.length >= MAX_PROPUESTAS) {
        control.limite = true;
        e.terminada = true;
        p.estado = 'detenida';
        p.mensaje = 'Se alcanzó el tope de la corrida.';
        avisar();
        return;
      }
      p.estado = 'generando';
      // La llamada se descuenta antes de hacerla: dos áreas en paralelo no deben gastar la misma.
      progreso.llamadasRestantes--;
      avisar();
      try {
        const lote = await llamarConReintentos<{ requerimientos?: RequerimientoIA[]; completo?: boolean; pendiente?: string[]; llamadas_restantes?: number }>(
          '/generation/area',
          {
            job_id: jobId,
            userPrompt,
            alcance,
            area: { nombre: area.nombre, enfoque: area.enfoque },
            otras_areas: nombres.filter(n => n !== area.nombre),
            existentes_area: existentesArea(area.nombre),
            existentes_resto: resumenResto(area.nombre) || undefined,
            generados: propuestas.filter(x => x.area === area.nombre).slice(-MAX_GENERADOS).map(x => x.name.slice(0, MAX_LINEA)),
            pendiente: e.pendiente,
            lote: Math.min(LOTE_POR_DEFECTO, Math.max(1, MAX_PROPUESTAS - propuestas.length)),
            ...base
          },
          signal,
          onEspera
        );
        if (typeof lote?.llamadas_restantes === 'number') progreso.llamadasRestantes = lote.llamadas_restantes;
        const { nuevas, descartadas } = incorporar(Array.isArray(lote?.requerimientos) ? lote.requerimientos : [], area.nombre);
        p.lotes++;
        p.nuevas += nuevas;
        p.descartadas += descartadas;
        e.pendiente = Array.isArray(lote?.pendiente) ? lote.pendiente : [];
        e.flojos = nuevas < MIN_NUEVAS_POR_LOTE ? e.flojos + 1 : 0;
        if (lote?.completo || e.flojos >= MAX_LOTES_FLOJOS || p.lotes >= MAX_LOTES_POR_AREA) {
          e.terminada = true;
          p.estado = 'completa';
        } else {
          p.estado = 'pendiente';
        }
      } catch (err) {
        if (esCancelacion(err) || signal?.aborted) return;
        if (err instanceof AIError && err.code === 'JOB_LIMIT') {
          control.limite = true;
          progreso.llamadasRestantes = 0;
        } else if (err instanceof AIError && ['JOB_INVALID', 'DAILY_LIMIT', 'UNAUTHENTICATED', 'EMAIL_NOT_VERIFIED'].includes(err.code)) {
          // Ningún área podrá seguir: se corta la corrida y se conserva lo generado.
          control.error = err;
        }
        e.terminada = true;
        p.estado = 'error';
        p.mensaje = err instanceof AIError ? err.message : 'No se pudo generar esta área.';
      } finally {
        avisar();
      }
    };

    while (!signal?.aborted && !control.error && estado.some(e => !e.terminada)) {
      const ronda = areas.map((_, i) => i).filter(i => !estado[i].terminada);
      await enParalelo(ronda, AREAS_EN_PARALELO, pasoDeArea);
    }

    if (signal?.aborted) {
      marcarDetenidas(progreso);
      return { estado: 'cancelado', plan, propuestas };
    }
    if (control.error) {
      marcarDetenidas(progreso);
      return { estado: 'error', motivo: control.error.message, plan, propuestas };
    }

    // 3. Cobertura en ciclo, mientras encuentre algo y quede presupuesto
    progreso.fase = 'cobertura';
    avisar();
    for (let ronda = 0; ronda < MAX_RONDAS_COBERTURA; ronda++) {
      // La última llamada se guarda para la revisión de duplicados por significado.
      if (signal?.aborted || progreso.llamadasRestantes <= 1 || propuestas.length >= MAX_PROPUESTAS) break;
      progreso.llamadasRestantes--;
      try {
        const respuesta = await llamarConReintentos<{ requerimientos?: RequerimientoIA[]; llamadas_restantes?: number }>(
          '/generation/cobertura',
          {
            job_id: jobId,
            userPrompt,
            alcance,
            areas: nombres,
            generados: propuestas.slice(-MAX_GENERADOS).map(x => `${x.area} | ${x.name.slice(0, 300)}`),
            existentes: existentes.length ? resumirExistentes(existentes, MAX_RESUMEN / 2) : undefined,
            maximo: Math.min(20, MAX_PROPUESTAS - propuestas.length),
            ...base
          },
          signal,
          onEspera
        );
        if (typeof respuesta?.llamadas_restantes === 'number') progreso.llamadasRestantes = respuesta.llamadas_restantes;
        const candidatas = Array.isArray(respuesta?.requerimientos) ? respuesta.requerimientos : [];
        const { nuevas } = incorporar(candidatas, 'Otros');
        // Sumar a cada área lo que la cobertura le añadió.
        for (const x of propuestas.slice(propuestas.length - nuevas)) {
          const p = progreso.areas.find(a => a.nombre === x.area);
          if (p) p.nuevas++;
        }
        avisar();
        if (nuevas === 0) break;
      } catch (err) {
        if (esCancelacion(err) || signal?.aborted) break;
        if (err instanceof AIError && err.code === 'JOB_LIMIT') control.limite = true;
        // Sin la revisión, lo generado sigue siendo válido.
        break;
      }
    }

    // 4. Duplicados por significado: una llamada más, opcional. Si falla, quedan las marcas léxicas.
    if (!signal?.aborted && progreso.llamadasRestantes > 0 && propuestas.length > 0) {
      progreso.fase = 'duplicados';
      progreso.llamadasRestantes--;
      avisar();
      try {
        const respuesta = await llamarConReintentos<{ duplicados?: Array<{ indice: number; etiqueta: string; similitud: number }> }>(
          '/generation/embed',
          {
            job_id: jobId,
            nuevos: propuestas.map(x => x.name.slice(0, MAX_LINEA)),
            existentes: existentes.slice(0, MAX_EMBED_EXISTENTES).map(e => ({ etiqueta: e.codigo.slice(0, 40), texto: e.enunciado.slice(0, MAX_LINEA) }))
          },
          signal,
          onEspera
        );
        const marcas: Array<{ clave: string; etiqueta: string; texto: string; similitud: number }> = [];
        const textoExistente = new Map(existentes.map(e => [e.codigo, e.enunciado]));
        for (const d of Array.isArray(respuesta?.duplicados) ? respuesta.duplicados : []) {
          const propuesta = propuestas[d.indice];
          if (!propuesta || propuesta.posibleDuplicado) continue;
          // "#3" es otra propuesta de la misma lista (la 3), no un requerimiento existente.
          const otra = /^#(\d+)$/.exec(d.etiqueta);
          const parecida = otra ? propuestas[Number(otra[1])] : undefined;
          const etiqueta = otra ? `otra propuesta (${parecida?.area ?? 'esta generación'})` : d.etiqueta;
          const texto = otra ? parecida?.name ?? '' : textoExistente.get(d.etiqueta) ?? '';
          propuesta.posibleDuplicado = { etiqueta, texto, similitud: d.similitud, semantico: true };
          marcas.push({ clave: propuesta.clave, etiqueta, texto, similitud: d.similitud });
        }
        if (marcas.length) callbacks.onDuplicadosSemanticos?.(marcas);
      } catch (err) {
        if (!esCancelacion(err) && !signal?.aborted) console.warn('No se pudieron revisar los duplicados por significado:', err);
      }
    }

    if (signal?.aborted) {
      marcarDetenidas(progreso);
      return { estado: 'cancelado', plan, propuestas };
    }
    return { estado: control.limite ? 'limite' : 'completo', plan, propuestas };
  } catch (err) {
    if (esCancelacion(err) || signal?.aborted) {
      marcarDetenidas(progreso);
      return { estado: 'cancelado', plan, propuestas };
    }
    return {
      estado: 'error',
      motivo: err instanceof AIError ? err.message : 'No se pudo conectar con el servicio de IA. Inténtalo de nuevo.',
      plan,
      propuestas
    };
  } finally {
    progreso.fase = 'fin';
    progreso.esperando = undefined;
    avisar();
  }
}

function marcarDetenidas(progreso: ProgresoGeneracion) {
  for (const a of progreso.areas) {
    if (a.estado === 'pendiente' || a.estado === 'generando') a.estado = 'detenida';
  }
}
