import type { ElementoSintactico } from './database.types';

/** Identificador de los 6 tonos semánticos definidos en `app/globals.css` (`--syntax-1`..`--syntax-6`). */
export type TonoSintaxis = 1 | 2 | 3 | 4 | 5 | 6;

const TODOS_LOS_TONOS: ReadonlyArray<TonoSintaxis> = [1, 2, 3, 4, 5, 6];

export const MAX_ELEMENTOS_SINTAXIS = 12;

export type SegmentoSintaxis =
  | { tipo: 'texto'; texto: string }
  | {
      tipo: 'elemento';
      texto: string;
      /** Clave canónica normalizada para cruzar con la simbología y el foco activo. */
      clave: string;
      /** Nombre original del elemento en el patrón (p. ej. "trigger" o "Actor"). */
      elemento: string;
      /** Etiqueta legible en español para mostrar en chips y descripciones. */
      etiqueta: string;
      tono: TonoSintaxis;
    };

export interface ItemLeyendaSintaxis {
  clave: string;
  elemento: string;
  etiqueta: string;
  tono: TonoSintaxis;
}

/** Traducciones canónicas de los marcadores estándar en inglés (EARS y Sistemas Embebidos). */
const ETIQUETAS_ESPANOL: Readonly<Record<string, string>> = {
  'system name': 'Sistema',
  system: 'Sistema',
  'system/component': 'Sistema / componente',
  component: 'Componente',
  'system response': 'Respuesta del sistema',
  response: 'Respuesta',
  'safe response': 'Respuesta segura',
  trigger: 'Disparador',
  state: 'Estado',
  'state/mode': 'Estado / modo',
  'safe state': 'Estado seguro',
  'undesired condition': 'Condición no deseada',
  condition: 'Condición',
  'fault condition': 'Condición de fallo',
  'hazard condition': 'Condición de peligro',
  'startup condition': 'Condición de arranque',
  'feature is included': 'Característica opcional',
  feature: 'Característica opcional',
  event: 'Evento',
  behavior: 'Comportamiento',
  'interface behavior': 'Comportamiento de interfaz',
  'initialization behavior': 'Comportamiento inicial',
  'time constraint': 'Restricción de tiempo',
  'time interval': 'Intervalo de tiempo',
  'resource limit': 'Límite de recursos',
  actor: 'Actor',
  action: 'Acción',
  object: 'Objeto',
  benefit: 'Beneficio',
};

/** Clave canónica insensible a mayúsculas, tildes y espacios repetidos. */
export function claveElemento(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalizarInicial(texto: string): string {
  if (!texto) return '';
  return texto[0].toUpperCase() + texto.slice(1);
}

/** Nombre legible en español para un elemento sintáctico del patrón. */
export function etiquetaElemento(elemento: string): string {
  const limpio = elemento.trim().replace(/^[<\[]+|[>\]]+$/g, '').trim();
  if (!limpio) return '';
  const traducida = ETIQUETAS_ESPANOL[limpio.toLowerCase().replace(/\s+/g, ' ')];
  return traducida ?? capitalizarInicial(limpio);
}

/**
 * Extrae en orden de aparición los marcadores sintácticos (`<...>` o `[...]`) definidos en
 * la plantilla de un patrón, sin duplicados.
 */
export function extraerElementosPatron(patron?: string | null): string[] {
  if (!patron?.trim()) return [];
  const vistos = new Set<string>();
  const resultado: string[] = [];
  const regex = /<([^<>]+)>|\[([^\[\]]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(patron)) !== null) {
    const crudo = (match[1] ?? match[2] ?? '').trim();
    const clave = claveElemento(crudo);
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);
    resultado.push(crudo);
  }
  return resultado;
}

/**
 * Asigna una familia cromática preferida según la función gramatical/semántica del componente:
 * 1 = Actor / Sistema · 2 = Acción / Respuesta · 3 = Disparador / Condición / Estado ·
 * 4 = Objeto / Característica / Recurso · 5 = Datos / Tiempo · 6 = Resultado / Beneficio.
 */
export function tonoPreferidoElemento(elemento: string): TonoSintaxis {
  const c = claveElemento(elemento);
  if (/\b(safe state|estado seguro|objeto|object|feature|caracteristica|resource|recurso|limit|limite|interfaz|interface)\b/.test(c)) {
    return 4;
  }
  if (/\b(resultado|result|beneficio|benefit|valor|efecto|salida|output|para)\b/.test(c)) {
    return 6;
  }
  if (/\b(dato|datos|data|entrada|input|time|tiempo|interval|intervalo|constraint|restriccion|medio)\b/.test(c)) {
    return 5;
  }
  if (/\b(trigger|disparador|event|evento|condicion|condition|state|estado|mode|modo|mientras|cuando|startup|arranque|hazard|peligro|fault|fallo|precondicion)\b/.test(c)) {
    return 3;
  }
  if (/\b(accion|action|response|respuesta|behavior|comportamiento|quiero|operacion|transicion|transition)\b/.test(c)) {
    return 2;
  }
  if (/\b(actor|sistema|system|component|componente|rol|usuario|sujeto|agente)\b/.test(c)) {
    return 1;
  }
  return 4;
}

/**
 * Construye un mapa `{ claveCanónica -> TonoSintaxis }` respetando la familia semántica de cada
 * elemento y evitando que dos componentes del mismo patrón compartan color (hasta 6 elementos).
 */
export function construirMapaTonos(elementos: ReadonlyArray<string>): Map<string, TonoSintaxis> {
  const mapa = new Map<string, TonoSintaxis>();
  const usados = new Set<TonoSintaxis>();

  for (const elem of elementos) {
    const clave = claveElemento(elem);
    if (!clave || mapa.has(clave)) continue;
    const preferido = tonoPreferidoElemento(elem);
    let elegido: TonoSintaxis;
    if (!usados.has(preferido)) {
      elegido = preferido;
    } else {
      elegido = TODOS_LOS_TONOS.find(t => !usados.has(t)) ?? TODOS_LOS_TONOS[mapa.size % TODOS_LOS_TONOS.length];
    }
    usados.add(elegido);
    mapa.set(clave, elegido);
  }

  return mapa;
}

export function resolverTonoElemento(
  elemento: string,
  mapaTonos?: ReadonlyMap<string, TonoSintaxis>
): TonoSintaxis {
  const clave = claveElemento(elemento);
  return mapaTonos?.get(clave) ?? tonoPreferidoElemento(elemento);
}

/**
 * Reúne la lista ordenada de elementos únicos para poblar la simbología: respeta primero el orden
 * canónico del patrón (si se conoce) y añade después cualquier elemento presente en los datos.
 */
export function construirLeyendaSintaxis(
  listas: ReadonlyArray<ReadonlyArray<ElementoSintactico> | null | undefined>,
  patron?: string | null
): { items: ItemLeyendaSintaxis[]; mapaTonos: Map<string, TonoSintaxis> } {
  const presentes = new Map<string, string>();
  for (const lista of listas) {
    if (!lista) continue;
    for (const item of lista) {
      if (!item?.elemento?.trim() || !item?.fragmento?.trim()) continue;
      const clave = claveElemento(item.elemento);
      if (clave && !presentes.has(clave)) {
        presentes.set(clave, item.elemento.trim());
      }
    }
  }

  if (presentes.size === 0) {
    return { items: [], mapaTonos: new Map() };
  }

  const ordenados: string[] = [];
  const agregados = new Set<string>();

  for (const delPatron of extraerElementosPatron(patron)) {
    const clave = claveElemento(delPatron);
    const original = presentes.get(clave);
    if (original && !agregados.has(clave)) {
      agregados.add(clave);
      ordenados.push(original);
    }
  }

  for (const [clave, original] of presentes.entries()) {
    if (!agregados.has(clave)) {
      agregados.add(clave);
      ordenados.push(original);
    }
  }

  const mapaTonos = construirMapaTonos(ordenados);
  const items: ItemLeyendaSintaxis[] = ordenados.map(elemento => {
    const clave = claveElemento(elemento);
    return {
      clave,
      elemento,
      etiqueta: etiquetaElemento(elemento),
      tono: mapaTonos.get(clave) ?? tonoPreferidoElemento(elemento),
    };
  });

  return { items, mapaTonos };
}

// ==========================================================
// SEGMENTACIÓN EXACTA SIN SOLAPAMIENTOS NI PÉRDIDA DE TEXTO
// ==========================================================

interface TextoIndexado {
  normalizado: string;
  inicios: number[];
  fines: number[];
}

const ES_ESPACIO = /\s/;
const ES_CARACTER_PALABRA = /[\p{L}\p{N}]/u;

/**
 * Normaliza `texto` (minúsculas, sin diacríticos y con espacios colapsados) conservando para cada
 * carácter normalizado su rango exacto `[inicio, fin)` en índices UTF-16 del `texto` original.
 */
function indexarTextoNormalizado(texto: string): TextoIndexado {
  let normalizado = '';
  const inicios: number[] = [];
  const fines: number[] = [];

  for (let i = 0; i < texto.length; ) {
    if (ES_ESPACIO.test(texto[i])) {
      const inicioEspacio = i;
      while (i < texto.length && ES_ESPACIO.test(texto[i])) i++;
      normalizado += ' ';
      inicios.push(inicioEspacio);
      fines.push(i);
      continue;
    }

    const cp = texto.codePointAt(i)!;
    const paso = cp > 0xffff ? 2 : 1;
    const base = texto
      .slice(i, i + paso)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    for (let k = 0; k < base.length; k++) {
      normalizado += base[k];
      inicios.push(i);
      fines.push(i + paso);
    }
    i += paso;
  }

  return { normalizado, inicios, fines };
}

function limpiarFragmentoBusqueda(fragmento: string): string {
  return fragmento
    .trim()
    .replace(/^[«"'“”‘’\s]+|[»"'“”‘’\s.,;:]+$/g, '')
    .trim();
}

function normalizarFragmentoBusqueda(fragmento: string): string {
  return limpiarFragmentoBusqueda(fragmento)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function respetaLimitesPalabra(texto: string, inicio: number, fin: number): boolean {
  if (inicio > 0 && ES_CARACTER_PALABRA.test(texto[inicio]) && ES_CARACTER_PALABRA.test(texto[inicio - 1])) {
    return false;
  }
  if (fin < texto.length && ES_CARACTER_PALABRA.test(texto[fin - 1]) && ES_CARACTER_PALABRA.test(texto[fin])) {
    return false;
  }
  return true;
}

interface RangoMarcado {
  inicio: number;
  fin: number;
  clave: string;
  elemento: string;
  etiqueta: string;
  tono: TonoSintaxis;
}

function solapaConExistente(rangos: ReadonlyArray<RangoMarcado>, inicio: number, fin: number): boolean {
  return rangos.some(r => inicio < r.fin && fin > r.inicio);
}

/**
 * Divide `texto` en tramos planos y tramos sintácticos resaltados sin solapamientos.
 * Garantiza invariante estricta: `segmentos.map(s => s.texto).join('') === texto`.
 */
export function segmentarTextoSintaxis(
  texto: string,
  elementos?: ReadonlyArray<ElementoSintactico> | null,
  mapaTonos?: ReadonlyMap<string, TonoSintaxis>
): SegmentoSintaxis[] {
  if (!texto) return [];
  if (!elementos || elementos.length === 0) {
    return [{ tipo: 'texto', texto }];
  }

  const tonos = mapaTonos ?? construirMapaTonos(elementos.map(e => e.elemento));
  const indexado = indexarTextoNormalizado(texto);
  if (!indexado.normalizado) {
    return [{ tipo: 'texto', texto }];
  }

  const candidatos = elementos
    .map((item, orden) => ({
      elemento: item.elemento?.trim() ?? '',
      busqueda: normalizarFragmentoBusqueda(item.fragmento ?? ''),
      orden,
    }))
    .filter(c => c.elemento.length > 0 && c.busqueda.length > 0)
    // Los fragmentos más largos reclaman su rango primero para que un componente corto
    // (p. ej. "el sistema") no robe una aparición interna de una cláusula más larga.
    .sort((a, b) => b.busqueda.length - a.busqueda.length || a.orden - b.orden);

  const marcados: RangoMarcado[] = [];

  for (const cand of candidatos) {
    let desde = 0;
    while (desde <= indexado.normalizado.length - cand.busqueda.length) {
      const pos = indexado.normalizado.indexOf(cand.busqueda, desde);
      if (pos === -1) break;

      const inicio = indexado.inicios[pos];
      const fin = indexado.fines[pos + cand.busqueda.length - 1];

      if (
        inicio < fin &&
        respetaLimitesPalabra(texto, inicio, fin) &&
        !solapaConExistente(marcados, inicio, fin)
      ) {
        const clave = claveElemento(cand.elemento);
        marcados.push({
          inicio,
          fin,
          clave,
          elemento: cand.elemento,
          etiqueta: etiquetaElemento(cand.elemento),
          tono: tonos.get(clave) ?? tonoPreferidoElemento(cand.elemento),
        });
        break;
      }

      desde = pos + 1;
    }
  }

  if (marcados.length === 0) {
    return [{ tipo: 'texto', texto }];
  }

  marcados.sort((a, b) => a.inicio - b.inicio);

  const segmentos: SegmentoSintaxis[] = [];
  let cursor = 0;

  for (const m of marcados) {
    if (m.inicio > cursor) {
      segmentos.push({ tipo: 'texto', texto: texto.slice(cursor, m.inicio) });
    }
    segmentos.push({
      tipo: 'elemento',
      texto: texto.slice(m.inicio, m.fin),
      clave: m.clave,
      elemento: m.elemento,
      etiqueta: m.etiqueta,
      tono: m.tono,
    });
    cursor = m.fin;
  }

  if (cursor < texto.length) {
    segmentos.push({ tipo: 'texto', texto: texto.slice(cursor) });
  }

  return segmentos;
}

/**
 * Conserva únicamente los elementos sintácticos cuyo fragmento sigue presente en `texto`,
 * actualizando el fragmento al corte real del enunciado listo para guardar en Firestore.
 */
export function filtrarElementosPresentes(
  texto: string,
  elementos?: ReadonlyArray<ElementoSintactico> | null
): ElementoSintactico[] | null {
  if (!texto.trim() || !elementos?.length) return null;
  const segmentos = segmentarTextoSintaxis(texto, elementos);
  const vigentes = segmentos
    .filter((s): s is Extract<SegmentoSintaxis, { tipo: 'elemento' }> => s.tipo === 'elemento')
    .map(s => ({
      elemento: s.elemento.slice(0, 80),
      fragmento: s.texto.slice(0, 1000),
    }))
    .slice(0, MAX_ELEMENTOS_SINTAXIS);
  return vigentes.length > 0 ? vigentes : null;
}

/** Valida y limpia una lista arbitraria (p. ej. leída de Firestore o sessionStorage). */
export function sanitizarElementosSintaxis(raw: unknown): ElementoSintactico[] | null {
  if (!Array.isArray(raw)) return null;
  const limpios: ElementoSintactico[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const reg = item as Record<string, unknown>;
    if (typeof reg.elemento !== 'string' || typeof reg.fragmento !== 'string') continue;
    const elemento = reg.elemento.trim().slice(0, 80);
    const fragmento = reg.fragmento.trim().slice(0, 1000);
    if (!elemento || !fragmento) continue;
    limpios.push({ elemento, fragmento });
    if (limpios.length >= MAX_ELEMENTOS_SINTAXIS) break;
  }
  return limpios.length > 0 ? limpios : null;
}

