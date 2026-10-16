'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, ChevronRight, Download, Edit2, FileText, Folder, FolderInput, FolderPlus,
  Globe, Lock, Pencil, Plus, Trash2, Upload
} from 'lucide-react';
import type { ArchivoContexto, FormatoContexto, Proyecto } from '@/lib/database.types';
import {
  actualizarTextoContexto,
  construirContextoIA,
  crearCarpetaContexto,
  eliminarContexto,
  FORMATOS_CONTEXTO,
  formatoDeNombre,
  getContextoProyecto,
  guardarArchivoContexto,
  leerBytesContexto,
  MAX_BYTES_ARCHIVO,
  moverArchivoContexto,
  renombrarContexto
} from '@/lib/firestore-service';
import { extraerTextoPdf, AIError } from '@/lib/ai-actions';
import { useAuth } from '@/lib/firebase-auth-provider';
import { esMiembroDelProyecto } from '@/lib/equipos-proyecto';
import { mensajeError } from '@/lib/errores';
import { fechaCompleta, fechaRelativa } from '@/lib/fechas';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { btnIcono, btnIconoPeligro, btnPrimario, btnSecundario, campo, etiqueta } from '@/components/ui/estilos';

const LIMITE_MB = MAX_BYTES_ARCHIVO / (1024 * 1024);

export function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Base64 de un archivo, sin el prefijo `data:...;base64,`. */
function leerBase64(archivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '');
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(archivo);
  });
}

function descargar(bytes: Uint8Array, nombre: string, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Editor {
  archivo: ArchivoContexto | null;
  nombre: string;
  formato: Exclude<FormatoContexto, 'pdf'>;
  contenido: string;
  cargando: boolean;
}

interface ContextoDelProyectoProps {
  proyecto: Proyecto;
  onCantidad?: (cantidad: number) => void;
}

/**
 * Pestaña Contexto: archivos que la IA lee al generar requerimientos. Los de la raíz son contexto
 * global (siempre entran); los de cada carpeta entran cuando se elige esa carpeta al generar.
 */
export default function ContextoDelProyecto({ proyecto, onCantidad }: ContextoDelProyectoProps) {
  const confirmar = useConfirm();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const proyectoId = proyecto.proyecto_id;
  const puedeEditar = esMiembroDelProyecto(proyecto, uid);

  const [items, setItems] = useState<ArchivoContexto[]>([]);
  const [loading, setLoading] = useState(true);
  const [carpetaActual, setCarpetaActual] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [demasiadoGrandes, setDemasiadoGrandes] = useState<Array<{ nombre: string; tamano: number }>>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [guardandoEditor, setGuardandoEditor] = useState(false);
  // Crear carpeta (item null) o cambiar el nombre de un archivo/carpeta
  const [dialogoNombre, setDialogoNombre] = useState<{ item: ArchivoContexto | null; valor: string } | null>(null);
  const inputArchivosRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try {
      setItems(await getContextoProyecto(proyectoId));
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudo cargar el contexto del proyecto'));
    } finally {
      setLoading(false);
    }
  }, [proyectoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const archivos = items.filter(i => i.tipo === 'archivo');
  const carpetas = items.filter(i => i.tipo === 'carpeta');
  useEffect(() => {
    if (!loading) onCantidad?.(archivos.length);
  }, [loading, archivos.length, onCantidad]);

  const carpeta = carpetas.find(c => c.id === carpetaActual) ?? null;
  const visibles = carpeta
    ? archivos.filter(a => a.id_carpeta === carpeta.id)
    : [...carpetas, ...archivos.filter(a => a.id_carpeta === null)];
  const caracteresGlobales = construirContextoIA(proyecto, items).length;

  // ------------------------------------------
  // Subida de archivos
  // ------------------------------------------
  const subirArchivos = async (lista: FileList | File[]) => {
    if (!puedeEditar || !uid) return;
    const todos = Array.from(lista);
    const grandes = todos.filter(f => f.size > MAX_BYTES_ARCHIVO);
    const noAdmitidos = todos.filter(f => f.size <= MAX_BYTES_ARCHIVO && !formatoDeNombre(f.name));
    const validos = todos.filter(f => f.size <= MAX_BYTES_ARCHIVO && formatoDeNombre(f.name));

    if (grandes.length > 0) setDemasiadoGrandes(grandes.map(f => ({ nombre: f.name, tamano: f.size })));
    if (noAdmitidos.length > 0) {
      toast.error(
        `Solo se admiten archivos PDF, Markdown (.md) y texto (.txt). Se omitió: ${noAdmitidos.map(f => f.name).join(', ')}`
      );
    }

    let subidos = 0;
    for (const f of validos) {
      const formato = formatoDeNombre(f.name)!;
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        let texto = '';
        if (formato === 'pdf') {
          setSubiendo(`Extrayendo el texto de ${f.name}...`);
          try {
            texto = await extraerTextoPdf(await leerBase64(f));
          } catch (err) {
            toast.error(
              `${f.name}: no se pudo extraer su texto (${err instanceof AIError ? err.message : 'error del servicio de IA'}). Se guardará igual, pero la IA no lo leerá.`,
              { duration: 6000 }
            );
          }
          if (!texto) toast(`${f.name} no tiene texto legible para la IA.`, { icon: '⚠️' });
        } else {
          texto = new TextDecoder().decode(bytes);
        }
        setSubiendo(`Subiendo ${f.name}...`);
        await guardarArchivoContexto({
          id_proyecto: proyectoId,
          id_carpeta: carpetaActual,
          nombre: f.name,
          formato,
          bytes,
          texto,
          id_autor: uid
        });
        subidos++;
      } catch (err) {
        console.error(err);
        toast.error(mensajeError(err, `No se pudo subir ${f.name}`));
      }
    }
    setSubiendo(null);
    if (subidos > 0) {
      toast.success(subidos === 1 ? 'Archivo agregado al contexto' : `${subidos} archivos agregados al contexto`);
      await cargar();
    }
  };

  // ------------------------------------------
  // Carpetas, renombrar, mover, eliminar
  // ------------------------------------------
  const nuevaCarpeta = () => setDialogoNombre({ item: null, valor: '' });
  const renombrar = (item: ArchivoContexto) => setDialogoNombre({ item, valor: item.nombre });

  /** Crea la carpeta o cambia el nombre, según lo que abrió el diálogo. */
  const guardarNombre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dialogoNombre || !uid) return;
    const nombre = dialogoNombre.valor.trim();
    const { item } = dialogoNombre;
    if (!nombre) {
      toast.error('Escribe un nombre');
      return;
    }
    if (
      (!item || item.tipo === 'carpeta') &&
      carpetas.some(c => c.id !== item?.id && c.nombre.toLowerCase() === nombre.toLowerCase())
    ) {
      toast.error('Ya existe una carpeta con ese nombre');
      return;
    }
    try {
      if (!item) {
        await crearCarpetaContexto(proyectoId, nombre, uid);
        toast.success('Carpeta creada');
      } else if (nombre !== item.nombre) {
        await renombrarContexto(item.id, nombre);
      }
      setDialogoNombre(null);
      await cargar();
    } catch (err) {
      toast.error(mensajeError(err, item ? 'No se pudo cambiar el nombre' : 'No se pudo crear la carpeta'));
    }
  };

  const mover = async (item: ArchivoContexto, destino: string) => {
    try {
      await moverArchivoContexto(item.id, destino === 'raiz' ? null : destino);
      toast.success(destino === 'raiz' ? 'Movido a la raíz: ahora es contexto global' : 'Archivo movido');
      await cargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo mover el archivo'));
    }
  };

  const eliminar = async (item: ArchivoContexto) => {
    const contenidos = item.tipo === 'carpeta' ? archivos.filter(a => a.id_carpeta === item.id).length : 0;
    const ok = await confirmar({
      titulo: item.tipo === 'carpeta' ? '¿Eliminar carpeta?' : '¿Eliminar archivo?',
      mensaje: (
        <>
          <strong className="text-ink">{item.nombre}</strong>
          {item.tipo === 'carpeta' && contenidos > 0
            ? ` y sus ${contenidos} ${contenidos === 1 ? 'archivo' : 'archivos'} dejarán de estar en el contexto.`
            : ' dejará de estar en el contexto de la IA.'}{' '}
          Esta acción no se puede deshacer.
        </>
      ),
      textoConfirmar: 'Eliminar',
      peligro: true
    });
    if (!ok) return;
    try {
      await eliminarContexto(item, items);
      if (item.id === carpetaActual) setCarpetaActual(null);
      toast.success('Eliminado');
      await cargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo eliminar'));
    }
  };

  const bajar = async (archivo: ArchivoContexto) => {
    try {
      const bytes = await leerBytesContexto(archivo);
      descargar(bytes, archivo.nombre, FORMATOS_CONTEXTO[archivo.formato ?? 'txt'].mime);
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo descargar el archivo'));
    }
  };

  // ------------------------------------------
  // Editor de archivos txt/md
  // ------------------------------------------
  const abrirNuevoArchivo = () =>
    setEditor({ archivo: null, nombre: '', formato: 'md', contenido: '', cargando: false });

  const abrirEdicion = async (archivo: ArchivoContexto) => {
    const formato = archivo.formato === 'txt' ? 'txt' : 'md';
    setEditor({ archivo, nombre: archivo.nombre, formato, contenido: '', cargando: true });
    try {
      const contenido = new TextDecoder().decode(await leerBytesContexto(archivo));
      setEditor(e => (e && e.archivo?.id === archivo.id ? { ...e, contenido, cargando: false } : e));
    } catch (err) {
      setEditor(null);
      toast.error(mensajeError(err, 'No se pudo abrir el archivo'));
    }
  };

  const guardarEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor || !uid) return;
    const base = editor.nombre.trim().replace(/\.(md|markdown|txt)$/i, '');
    if (!base) {
      toast.error('Ponle un nombre al archivo');
      return;
    }
    const nombre = `${base}${FORMATOS_CONTEXTO[editor.formato].extension}`;
    const bytes = new TextEncoder().encode(editor.contenido);
    if (bytes.length > MAX_BYTES_ARCHIVO) {
      setDemasiadoGrandes([{ nombre, tamano: bytes.length }]);
      return;
    }
    setGuardandoEditor(true);
    try {
      if (editor.archivo) {
        await actualizarTextoContexto(editor.archivo, editor.contenido, nombre);
        toast.success('Archivo guardado');
      } else {
        await guardarArchivoContexto({
          id_proyecto: proyectoId,
          id_carpeta: carpetaActual,
          nombre,
          formato: editor.formato,
          bytes,
          texto: editor.contenido,
          id_autor: uid
        });
        toast.success('Archivo creado en el contexto');
      }
      setEditor(null);
      await cargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo guardar el archivo'));
    } finally {
      setGuardandoEditor(false);
    }
  };

  // ------------------------------------------
  // Vista
  // ------------------------------------------
  const filaArchivo = (a: ArchivoContexto) => (
    <li key={a.id} className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-sunken/60">
      <div className="flex items-center gap-3 min-w-0">
        <span className="size-9 shrink-0 rounded-ui bg-sunken border border-line text-ink-muted flex items-center justify-center">
          <FileText size={16} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{a.nombre}</p>
          <p className="text-xs text-ink-subtle flex flex-wrap items-center gap-x-2">
            <span className="uppercase font-medium">{a.formato}</span>
            <span>{formatoTamano(a.tamano)}</span>
            {a.updated_at && (
              <time dateTime={a.updated_at} title={fechaCompleta(a.updated_at)}>{fechaRelativa(a.updated_at)}</time>
            )}
            {!a.texto && (
              <span className="inline-flex items-center gap-1 text-warning">
                <AlertTriangle size={11} aria-hidden /> Sin texto para la IA
              </span>
            )}
            {a.texto_truncado && <span className="text-warning">Solo se usa el inicio del texto</span>}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
        <button onClick={() => bajar(a)} title="Descargar" aria-label={`Descargar ${a.nombre}`} className={btnIcono}>
          <Download size={16} />
        </button>
        {puedeEditar && (
          <>
            {a.formato !== 'pdf' && (
              <button onClick={() => abrirEdicion(a)} title="Editar contenido" aria-label={`Editar ${a.nombre}`} className={btnIcono}>
                <Edit2 size={16} />
              </button>
            )}
            <button onClick={() => renombrar(a)} title="Cambiar nombre" aria-label={`Cambiar el nombre de ${a.nombre}`} className={btnIcono}>
              <Pencil size={16} />
            </button>
            {carpetas.length > 0 && (
              <label className={`${btnIcono} relative`} title="Mover a otra carpeta">
                <FolderInput size={16} aria-hidden />
                <span className="sr-only">Mover {a.nombre}</span>
                <select
                  value=""
                  onChange={(e) => e.target.value && mover(a, e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label={`Mover ${a.nombre} a otra carpeta`}
                >
                  <option value="">Mover a...</option>
                  {a.id_carpeta !== null && <option value="raiz">Raíz (contexto global)</option>}
                  {carpetas.filter(c => c.id !== a.id_carpeta).map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </label>
            )}
            <button onClick={() => eliminar(a)} title="Eliminar" aria-label={`Eliminar ${a.nombre}`} className={btnIconoPeligro}>
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </li>
  );

  const filaCarpeta = (c: ArchivoContexto) => {
    const cantidad = archivos.filter(a => a.id_carpeta === c.id).length;
    return (
      <li key={c.id} className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-sunken/60">
        <button
          type="button"
          onClick={() => setCarpetaActual(c.id)}
          className="flex items-center gap-3 min-w-0 text-left cursor-pointer flex-1"
        >
          <span className="size-9 shrink-0 rounded-ui bg-brand-subtle border border-brand-line text-brand-text flex items-center justify-center">
            <Folder size={16} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink truncate">{c.nombre}</span>
            <span className="block text-xs text-ink-subtle">
              {cantidad} {cantidad === 1 ? 'archivo' : 'archivos'} · se elige al generar
            </span>
          </span>
        </button>
        {puedeEditar && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => renombrar(c)} title="Cambiar nombre" aria-label={`Cambiar el nombre de ${c.nombre}`} className={btnIcono}>
              <Pencil size={16} />
            </button>
            <button onClick={() => eliminar(c)} title="Eliminar carpeta" aria-label={`Eliminar la carpeta ${c.nombre}`} className={btnIconoPeligro}>
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div className="max-w-prose space-y-1">
          <p className="text-base text-ink-muted">
            Documentos que la IA lee al generar requerimientos. Los archivos de la raíz son{' '}
            <strong className="text-ink">contexto global</strong> y se usan siempre; los de una carpeta se usan cuando eliges esa carpeta al generar.
          </p>
          <p className="text-xs text-ink-subtle">
            PDF, Markdown o texto, máximo {LIMITE_MB} MB por archivo. Contexto global actual: {caracteresGlobales.toLocaleString('es-MX')} caracteres (incluye la descripción del proyecto).
          </p>
        </div>
        {puedeEditar && (
          <div className="flex flex-wrap gap-2 shrink-0">
            {!carpeta && (
              <button onClick={nuevaCarpeta} className={btnSecundario}>
                <FolderPlus size={16} />
                Nueva carpeta
              </button>
            )}
            <button onClick={abrirNuevoArchivo} className={btnSecundario}>
              <Plus size={16} />
              Crear archivo
            </button>
            <button onClick={() => inputArchivosRef.current?.click()} disabled={!!subiendo} className={btnPrimario}>
              <Upload size={16} />
              Subir archivos
            </button>
            <input
              ref={inputArchivosRef}
              type="file"
              multiple
              accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void subirArchivos(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        )}
      </div>

      {!puedeEditar && (
        <div className="bg-warning-subtle border border-warning-line rounded-ui p-3.5 flex items-center gap-2.5 text-xs text-warning">
          <Lock size={15} className="shrink-0" />
          <span>Solo los miembros del proyecto pueden agregar o cambiar el contexto.</span>
        </div>
      )}

      {/* Ruta */}
      <nav aria-label="Ubicación" className="flex items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => setCarpetaActual(null)}
          className={`inline-flex items-center gap-1.5 px-2 min-h-8 rounded-ui cursor-pointer ${carpeta ? 'text-ink-muted hover:text-ink hover:bg-sunken' : 'text-ink font-semibold'}`}
        >
          <Globe size={14} aria-hidden />
          Raíz (global)
        </button>
        {carpeta && (
          <>
            <ChevronRight size={14} className="text-ink-subtle" aria-hidden />
            <span className="inline-flex items-center gap-1.5 px-2 font-semibold text-ink">
              <Folder size={14} aria-hidden />
              {carpeta.nombre}
            </span>
          </>
        )}
      </nav>

      {subiendo && (
        <div role="status" className="flex items-center gap-2.5 bg-brand-subtle border border-brand-line rounded-ui p-3 text-sm text-brand-text">
          <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          {subiendo}
        </div>
      )}

      {/* Lista (también acepta archivos arrastrados) */}
      <div
        onDragOver={(e) => {
          if (!puedeEditar) return;
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          if (!puedeEditar) return;
          e.preventDefault();
          setArrastrando(false);
          if (e.dataTransfer.files.length) void subirArchivos(e.dataTransfer.files);
        }}
        className={`rounded-ui transition-colors ${arrastrando ? 'ring-2 ring-brand-text ring-offset-2 ring-offset-canvas' : ''}`}
      >
        {loading ? (
          <div role="status" aria-label="Cargando" className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-sunken animate-pulse" />)}
          </div>
        ) : visibles.length === 0 ? (
          <div className="text-center py-16 bg-surface border border-dashed border-line-strong rounded-ui">
            <FileText size={28} className="mx-auto text-ink-subtle" aria-hidden />
            <h3 className="text-base font-semibold text-ink mt-3">
              {carpeta ? 'Esta carpeta está vacía' : 'Aún no hay contexto'}
            </h3>
            <p className="text-sm text-ink-muted mt-1 max-w-sm mx-auto">
              {puedeEditar
                ? 'Sube documentos del sistema (especificaciones, actas, manuales) o arrástralos aquí para que la IA los use al redactar.'
                : 'Cuando los miembros agreguen documentos, aparecerán aquí.'}
            </p>
          </div>
        ) : (
          <ul className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
            {visibles.map(i => (i.tipo === 'carpeta' ? filaCarpeta(i) : filaArchivo(i)))}
          </ul>
        )}
      </div>

      {/* Aviso: archivo de más de 15 MB */}
      <Modal
        open={demasiadoGrandes.length > 0}
        onClose={() => setDemasiadoGrandes([])}
        title="Archivo demasiado grande"
        size="sm"
      >
        <ModalBody className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="size-9 shrink-0 rounded-full bg-warning-subtle text-warning flex items-center justify-center">
              <AlertTriangle size={18} aria-hidden />
            </span>
            <div className="text-sm text-ink-muted space-y-2">
              <p>
                El límite máximo por archivo es de <strong className="text-ink">{LIMITE_MB} MB</strong>.
                {demasiadoGrandes.length === 1 ? ' Este archivo no se agregó:' : ' Estos archivos no se agregaron:'}
              </p>
              <ul className="space-y-1">
                {demasiadoGrandes.map(f => (
                  <li key={f.nombre} className="font-mono text-xs bg-sunken border border-line rounded-ui px-2 py-1">
                    {f.nombre} · {formatoTamano(f.tamano)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setDemasiadoGrandes([])} className={btnPrimario}>
            Entendido
          </button>
        </ModalFooter>
      </Modal>

      {/* Nombre de carpeta nueva o cambio de nombre */}
      <Modal
        open={dialogoNombre !== null}
        onClose={() => setDialogoNombre(null)}
        title={!dialogoNombre?.item ? 'Nueva carpeta' : dialogoNombre.item.tipo === 'carpeta' ? 'Cambiar nombre de la carpeta' : 'Cambiar nombre del archivo'}
        description={!dialogoNombre?.item ? 'Sus archivos solo se usan cuando eliges la carpeta al generar requerimientos.' : undefined}
        size="sm"
      >
        {dialogoNombre && (
          <form onSubmit={guardarNombre} noValidate className="flex flex-col flex-1 min-h-0">
            <ModalBody>
              <label htmlFor="ctx-dialogo-nombre" className={etiqueta}>Nombre</label>
              <input
                id="ctx-dialogo-nombre"
                autoFocus
                value={dialogoNombre.valor}
                onChange={(e) => setDialogoNombre({ ...dialogoNombre, valor: e.target.value })}
                placeholder={dialogoNombre.item ? '' : 'Ej. Módulo de pagos'}
                className={campo}
              />
            </ModalBody>
            <ModalFooter>
              <button type="button" onClick={() => setDialogoNombre(null)} className={btnSecundario}>Cancelar</button>
              <button type="submit" className={btnPrimario}>{dialogoNombre.item ? 'Guardar' : 'Crear carpeta'}</button>
            </ModalFooter>
          </form>
        )}
      </Modal>

      {/* Crear o editar un archivo de texto */}
      <Modal
        open={editor !== null}
        onClose={() => !guardandoEditor && setEditor(null)}
        cerrarConFondo={false}
        title={editor?.archivo ? `Editar ${editor.archivo.nombre}` : 'Crear archivo de contexto'}
        description={
          editor?.archivo
            ? undefined
            : carpeta
              ? `Se guardará en la carpeta ${carpeta.nombre}.`
              : 'Se guardará en la raíz: será contexto global.'
        }
        size="3xl"
      >
        {editor && (
          <form onSubmit={guardarEditor} noValidate className="flex flex-col flex-1 min-h-0">
            <ModalBody className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                <div>
                  <label htmlFor="ctx-nombre" className={etiqueta}>Nombre</label>
                  <input
                    id="ctx-nombre"
                    value={editor.nombre}
                    onChange={(e) => setEditor({ ...editor, nombre: e.target.value })}
                    placeholder="Ej. glosario-del-negocio"
                    className={campo}
                    autoFocus={!editor.archivo}
                  />
                </div>
                <div>
                  <span className={etiqueta}>Formato</span>
                  <div className="flex gap-2" role="radiogroup" aria-label="Formato del archivo">
                    {(['md', 'txt'] as const).map(f => (
                      <button
                        key={f}
                        type="button"
                        role="radio"
                        aria-checked={editor.formato === f}
                        onClick={() => setEditor({ ...editor, formato: f })}
                        className={`px-3 min-h-10 rounded-ui text-sm font-semibold border cursor-pointer ${
                          editor.formato === f ? 'bg-ink text-white border-ink' : 'bg-surface border-line-strong text-ink-muted hover:bg-sunken'
                        }`}
                      >
                        {FORMATOS_CONTEXTO[f].extension}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label htmlFor="ctx-contenido" className={etiqueta}>Contenido</label>
                {editor.cargando ? (
                  <div className="h-72 bg-sunken rounded-ui animate-pulse" role="status" aria-label="Cargando" />
                ) : (
                  <textarea
                    id="ctx-contenido"
                    rows={16}
                    value={editor.contenido}
                    onChange={(e) => setEditor({ ...editor, contenido: e.target.value })}
                    placeholder={'# Glosario\n\n- Cliente: persona que compra en la tienda...\n- Pedido: ...'}
                    className={`${campo} font-mono text-sm leading-relaxed`}
                  />
                )}
                <p className="text-xs text-ink-subtle mt-1">
                  {formatoTamano(new TextEncoder().encode(editor.contenido).length)} de {LIMITE_MB} MB.
                </p>
              </div>
            </ModalBody>
            <ModalFooter>
              <button type="button" onClick={() => setEditor(null)} disabled={guardandoEditor} className={btnSecundario}>
                Cancelar
              </button>
              <button type="submit" disabled={guardandoEditor || editor.cargando} className={btnPrimario}>
                {guardandoEditor ? 'Guardando...' : editor.archivo ? 'Guardar cambios' : 'Crear archivo'}
              </button>
            </ModalFooter>
          </form>
        )}
      </Modal>
    </div>
  );
}
