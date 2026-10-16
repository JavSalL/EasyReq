import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import type { ArchivoContexto, FormatoContexto, UUID } from '../database.types';

// ==========================================
// CONTEXTO DEL PROYECTO
// ==========================================
// Archivos (PDF, Markdown, texto) y carpetas que alimentan a la IA al generar requerimientos.
// Los archivos de la raíz son contexto global: entran siempre. Los de una carpeta entran cuando
// quien genera elige esa carpeta.
//
// No se usa Firebase Storage: el archivo original se guarda en Firestore partido en fragmentos
// (`contexto_fragmentos`, un documento por cada ~700 KB) para no exceder el límite de 1 MiB por
// documento. El texto que lee la IA va aparte, en el propio documento del archivo (`texto`).

const COL_ARCHIVOS = 'contexto_proyecto';
const COL_FRAGMENTOS = 'contexto_fragmentos';

/** Tamaño máximo por archivo: 15 MB. */
export const MAX_BYTES_ARCHIVO = 15 * 1024 * 1024;
/** Bytes por fragmento: deja margen bajo el límite de 1 MiB por documento de Firestore. */
const BYTES_FRAGMENTO = 700 * 1024;
/** Caracteres del texto extraído que se guardan para la IA (mantiene el documento bajo 1 MiB). */
export const MAX_TEXTO_ARCHIVO = 350_000;
/** Caracteres de contexto que se mandan a la IA en cada generación (lo acepta el Worker). */
export const MAX_CONTEXTO_IA = 300_000;

export const FORMATOS_CONTEXTO: Record<FormatoContexto, { extension: string; mime: string; nombre: string }> = {
  pdf: { extension: '.pdf', mime: 'application/pdf', nombre: 'PDF' },
  md: { extension: '.md', mime: 'text/markdown', nombre: 'Markdown' },
  txt: { extension: '.txt', mime: 'text/plain', nombre: 'Texto' }
};

/** Formato a partir del nombre del archivo, o null si no se admite (p. ej. imágenes). */
export function formatoDeNombre(nombre: string): FormatoContexto | null {
  const ext = nombre.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'txt') return 'txt';
  return null;
}

function aArchivo(id: string, data: Record<string, unknown>): ArchivoContexto {
  return {
    id,
    id_proyecto: data.id_proyecto as string,
    tipo: data.tipo === 'carpeta' ? 'carpeta' : 'archivo',
    nombre: (data.nombre as string) || 'Sin nombre',
    id_carpeta: (data.id_carpeta as string | null | undefined) ?? null,
    formato: (data.formato as FormatoContexto | undefined) ?? undefined,
    tamano: typeof data.tamano === 'number' ? data.tamano : 0,
    texto: typeof data.texto === 'string' ? data.texto : '',
    texto_truncado: data.texto_truncado === true,
    num_fragmentos: typeof data.num_fragmentos === 'number' ? data.num_fragmentos : 0,
    id_autor: (data.id_autor as string | null | undefined) ?? null,
    created_at: (data.created_at as string) || '',
    updated_at: (data.updated_at as string) || ''
  };
}

/** Archivos y carpetas del contexto de un proyecto (carpetas primero, luego por nombre). */
export async function getContextoProyecto(id_proyecto: string): Promise<ArchivoContexto[]> {
  const snap = await getDocs(query(collection(db, COL_ARCHIVOS), where('id_proyecto', '==', id_proyecto)));
  return snap.docs
    .map(d => aArchivo(d.id, d.data()))
    .sort((a, b) =>
      a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre, 'es', { numeric: true }) : a.tipo === 'carpeta' ? -1 : 1
    );
}

export async function crearCarpetaContexto(id_proyecto: string, nombre: string, id_autor: UUID): Promise<ArchivoContexto> {
  const ref = doc(collection(db, COL_ARCHIVOS));
  const ahora = new Date().toISOString();
  const datos = {
    id_proyecto,
    tipo: 'carpeta' as const,
    nombre: nombre.trim(),
    id_carpeta: null,
    id_autor,
    created_at: ahora,
    updated_at: ahora
  };
  await setDoc(ref, datos);
  return aArchivo(ref.id, datos);
}

export async function renombrarContexto(id: string, nombre: string): Promise<void> {
  await updateDoc(doc(db, COL_ARCHIVOS, id), { nombre: nombre.trim(), updated_at: new Date().toISOString() });
}

/** Mueve un archivo a otra carpeta (null = raíz, contexto global). */
export async function moverArchivoContexto(id: string, id_carpeta: string | null): Promise<void> {
  await updateDoc(doc(db, COL_ARCHIVOS, id), { id_carpeta, updated_at: new Date().toISOString() });
}

async function guardarFragmentos(id_archivo: string, id_proyecto: string, bytes: Uint8Array, anteriores = 0): Promise<number> {
  const total = Math.max(1, Math.ceil(bytes.length / BYTES_FRAGMENTO));
  // Uno a uno: un lote de escritura de Firestore no admite más de 10 MiB por petición.
  for (let i = 0; i < total; i++) {
    await setDoc(doc(db, COL_FRAGMENTOS, `${id_archivo}_${i}`), {
      id_archivo,
      id_proyecto,
      indice: i,
      datos: Bytes.fromUint8Array(bytes.subarray(i * BYTES_FRAGMENTO, (i + 1) * BYTES_FRAGMENTO))
    });
  }
  // Si el archivo se achicó al editarlo, sobran fragmentos de la versión anterior
  for (let i = total; i < anteriores; i++) {
    await deleteDoc(doc(db, COL_FRAGMENTOS, `${id_archivo}_${i}`));
  }
  return total;
}

const recortarTexto = (texto: string) => ({
  texto: texto.slice(0, MAX_TEXTO_ARCHIVO),
  texto_truncado: texto.length > MAX_TEXTO_ARCHIVO
});

/**
 * Guarda un archivo nuevo: los bytes originales en fragmentos y el texto (ya extraído) para la IA.
 * Lanza un error si supera 15 MB; la interfaz lo valida antes para mostrar el aviso.
 */
export async function guardarArchivoContexto(datos: {
  id_proyecto: string;
  id_carpeta: string | null;
  nombre: string;
  formato: FormatoContexto;
  bytes: Uint8Array;
  texto: string;
  id_autor: UUID;
}): Promise<ArchivoContexto> {
  if (datos.bytes.length > MAX_BYTES_ARCHIVO) throw new Error('El archivo supera el límite de 15 MB.');
  const ref = doc(collection(db, COL_ARCHIVOS));
  const ahora = new Date().toISOString();
  const num_fragmentos = await guardarFragmentos(ref.id, datos.id_proyecto, datos.bytes);
  const registro = {
    id_proyecto: datos.id_proyecto,
    tipo: 'archivo' as const,
    nombre: datos.nombre.trim(),
    id_carpeta: datos.id_carpeta,
    formato: datos.formato,
    tamano: datos.bytes.length,
    ...recortarTexto(datos.texto),
    num_fragmentos,
    id_autor: datos.id_autor,
    created_at: ahora,
    updated_at: ahora
  };
  // El documento del archivo se escribe al final: si una subida se corta, no queda un archivo a medias en la lista
  await setDoc(ref, registro);
  return aArchivo(ref.id, registro);
}

/** Reemplaza el contenido de un archivo de texto (txt/md) editado en la app. */
export async function actualizarTextoContexto(archivo: ArchivoContexto, contenido: string, nombre?: string): Promise<void> {
  const bytes = new TextEncoder().encode(contenido);
  if (bytes.length > MAX_BYTES_ARCHIVO) throw new Error('El archivo supera el límite de 15 MB.');
  const num_fragmentos = await guardarFragmentos(archivo.id, archivo.id_proyecto, bytes, archivo.num_fragmentos);
  await updateDoc(doc(db, COL_ARCHIVOS, archivo.id), {
    ...(nombre ? { nombre: nombre.trim() } : {}),
    tamano: bytes.length,
    ...recortarTexto(contenido),
    num_fragmentos,
    updated_at: new Date().toISOString()
  });
}

/** Bytes originales de un archivo (para descargarlo o editarlo). */
export async function leerBytesContexto(archivo: ArchivoContexto): Promise<Uint8Array> {
  const partes = await Promise.all(
    Array.from({ length: archivo.num_fragmentos }, (_, i) => getDoc(doc(db, COL_FRAGMENTOS, `${archivo.id}_${i}`)))
  );
  const trozos = partes.map(p => (p.exists() ? (p.data().datos as Bytes).toUint8Array() : new Uint8Array()));
  const salida = new Uint8Array(trozos.reduce((n, t) => n + t.length, 0));
  let pos = 0;
  for (const t of trozos) {
    salida.set(t, pos);
    pos += t.length;
  }
  return salida;
}

/** Elimina un archivo o una carpeta (con todos sus archivos). */
export async function eliminarContexto(item: ArchivoContexto, todos: ArchivoContexto[]): Promise<void> {
  const archivos = item.tipo === 'carpeta' ? todos.filter(a => a.id_carpeta === item.id) : [item];
  for (const archivo of archivos) {
    for (let i = 0; i < archivo.num_fragmentos; i++) {
      await deleteDoc(doc(db, COL_FRAGMENTOS, `${archivo.id}_${i}`));
    }
    await deleteDoc(doc(db, COL_ARCHIVOS, archivo.id));
  }
  if (item.tipo === 'carpeta') await deleteDoc(doc(db, COL_ARCHIVOS, item.id));
}

/** Borra todo el contexto de un proyecto. Se llama antes de borrar el proyecto (las reglas piden que exista). */
export async function eliminarContextoDeProyecto(id_proyecto: string): Promise<void> {
  const [archivos, fragmentos] = await Promise.all([
    getDocs(query(collection(db, COL_ARCHIVOS), where('id_proyecto', '==', id_proyecto))),
    getDocs(query(collection(db, COL_FRAGMENTOS), where('id_proyecto', '==', id_proyecto)))
  ]);
  for (const d of fragmentos.docs) await deleteDoc(d.ref);
  for (const d of archivos.docs) await deleteDoc(d.ref);
}

/**
 * Une el contexto que recibe la IA: la descripción del proyecto, los archivos de la raíz (globales)
 * y los de las carpetas elegidas. Se recorta a `MAX_CONTEXTO_IA` caracteres.
 */
export function construirContextoIA(
  proyecto: { nombre: string; descripcion?: string; tipos_sistema?: { nombre: string } | null },
  archivos: ArchivoContexto[],
  idsCarpetas: string[] = []
): string {
  const partes: string[] = [`Proyecto: ${proyecto.nombre}`];
  if (proyecto.tipos_sistema?.nombre) partes.push(`Tipo de sistema: ${proyecto.tipos_sistema.nombre}`);
  if (proyecto.descripcion?.trim()) partes.push(`Descripción del proyecto:\n${proyecto.descripcion.trim()}`);

  const carpetas = new Map(archivos.filter(a => a.tipo === 'carpeta').map(c => [c.id, c.nombre]));
  const incluidos = archivos.filter(
    a => a.tipo === 'archivo' && a.texto && (a.id_carpeta === null || idsCarpetas.includes(a.id_carpeta))
  );
  for (const a of incluidos) {
    const ruta = a.id_carpeta ? `${carpetas.get(a.id_carpeta) ?? 'Carpeta'}/${a.nombre}` : a.nombre;
    partes.push(`### Archivo de contexto: ${ruta}\n${a.texto}`);
  }

  const contexto = partes.join('\n\n');
  return contexto.length > MAX_CONTEXTO_IA
    ? `${contexto.slice(0, MAX_CONTEXTO_IA - 100)}\n\n[El contexto se recortó por su tamaño.]`
    : contexto;
}
