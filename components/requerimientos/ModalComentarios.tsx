'use client';

import React, { useId, useState } from 'react';
import { Check, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { Comentario, Requerimiento } from '@/lib/database.types';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { fechaCompleta, fechaRelativa } from '@/lib/fechas';
import { puedeBorrarComentario, puedeEditarComentario } from '@/lib/permisos';
import {
  btnIcono,
  btnIconoPeligro,
  btnPrimario,
  btnSecundario,
  campo,
  etiqueta
} from '@/components/ui/estilos';

/**
 * Límite de caracteres del texto de un comentario. El mismo que fija
 * `firestore.rules` y `comentarios-service.ts`; aquí solo evita que se pueda
 * escribir de más y que el rechazo llegue como un error al publicar.
 */
const COMENTARIO_MAXIMO = 4000;

interface ModalComentariosProps {
  open: boolean;
  onClose: () => void;
  requerimiento: Requerimiento | null;
  comentarios: Comentario[];
  loading: boolean;
  /** Error al cargar el hilo o al operar sobre él. Nulo cuando no hay. */
  error: string | null;
  /** UID de quien tiene la sesión. Con null no se ofrece escribir ni borrar. */
  uid: string | null;
  /** ¿Es el creador del proyecto? Puede borrar comentarios ajenos. */
  esCreadorProyecto: boolean;
  /** ¿Puede comentar? Es la membresía del proyecto, calculada en la página. */
  puedeComentar: boolean;
  /** Mientras una operación está en vuelo, para no mandar dos. */
  guardando: boolean;
  codigoDe: (req: Requerimiento) => string | null;
  onPublicar: (texto: string) => void;
  onEditar: (comentario: Comentario, texto: string) => void;
  onBorrar: (comentario: Comentario) => void;
}

/**
 * Hilo de comentarios de un requerimiento (KAN-27).
 *
 * Se abre desde la tarjeta, del mismo modo que el historial. El autor de cada
 * comentario y su fecha salen del propio documento; el nombre se resuelve con el
 * perfil que trae el servicio.
 *
 * Quién puede corregir o borrar cada comentario se resuelve con las funciones de
 * `lib/permisos.ts`, que son el espejo de las reglas: aquí no se decide nada suelto,
 * solo se pinta lo que le toca a cada persona.
 */
export default function ModalComentarios({
  open,
  onClose,
  requerimiento,
  comentarios,
  loading,
  error,
  uid,
  esCreadorProyecto,
  puedeComentar,
  guardando,
  codigoDe,
  onPublicar,
  onEditar,
  onBorrar
}: ModalComentariosProps) {
  const ids = useId();
  const idTexto = `${ids}-texto`;
  const idEdicion = `${ids}-edicion`;
  const [texto, setTexto] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicion, setTextoEdicion] = useState('');

  // El borrador y la corrección en curso se limpian al cerrar sin usar un efecto:
  // quien renderiza el modal le pasa una `key` que cambia con el requerimiento
  // abierto, y eso monta el componente de nuevo con su estado vacío. Un `useEffect`
  // que hiciera lo mismo encadena renders y el lint lo rechaza, con razón.

  const publicar = (evento: React.FormEvent) => {
    evento.preventDefault();
    const limpio = texto.trim();
    if (!limpio || guardando) return;
    onPublicar(limpio);
    setTexto('');
  };

  const guardarEdicion = (comentario: Comentario) => {
    const limpio = textoEdicion.trim();
    if (!limpio || guardando) return;
    onEditar(comentario, limpio);
    setEditandoId(null);
    setTextoEdicion('');
  };

  const confirmarBorrado = (comentario: Comentario) => {
    const quien =
      comentario.autor?.nombre || comentario.autor?.correo || 'esta persona';
    // Se confirma porque es irreversible, y con el nombre del autor del comentario
    // para que no haya duda de cuál se va.
    if (window.confirm(`¿Borrar el comentario de ${quien}?`)) {
      onBorrar(comentario);
    }
  };

  const titulo = requerimiento && codigoDe(requerimiento)
    ? `Comentarios de ${codigoDe(requerimiento)}`
    : 'Comentarios';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titulo}
      description="Lo que la gente del proyecto dice sobre este requerimiento."
      size="lg"
    >
      <form onSubmit={publicar} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-3">
          {requerimiento && (
            <p className="font-mono text-xs text-ink-muted line-clamp-2 border-l-2 border-line-strong pl-2">
              {requerimiento.enunciado}
            </p>
          )}

          {loading ? (
            [1, 2].map(i => (
              <div key={i} className="h-14 bg-sunken rounded-ui animate-pulse" />
            ))
          ) : error ? (
            <p role="alert" className="text-xs text-danger text-center py-6">
              {error}
            </p>
          ) : comentarios.length === 0 ? (
            <p className="text-xs text-ink-subtle text-center py-6 flex flex-col items-center gap-2">
              <MessageSquare size={20} className="text-ink-subtle" />
              Todavía no hay comentarios. {puedeComentar
                ? 'Sé la primera persona en comentar.'
                : 'Solo los miembros del proyecto pueden escribir aquí.'}
            </p>
          ) : (
            <ol className="space-y-2">
              {comentarios.map(comentario => {
                const esAutor = !!uid && comentario.id_autor === uid;
                // Las dos decisiones salen de `lib/permisos.ts`, que es el espejo de
                // las reglas; aquí no se decide nada suelto.
                const esEditable =
                  puedeEditarComentario(esAutor) && editandoId !== comentario.id;
                const puedeBorrar = puedeBorrarComentario(esAutor, esCreadorProyecto);
                const fechaValida =
                  !!comentario.created_at &&
                  !Number.isNaN(Date.parse(comentario.created_at));
                return (
                  <li
                    key={comentario.id}
                    className="p-3 bg-sunken rounded-ui border border-line border-l-4 border-l-brand text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-ink">
                        {comentario.autor?.nombre ||
                          comentario.autor?.correo ||
                          'Usuario no disponible'}
                      </span>
                      {fechaValida ? (
                        <time
                          className="text-xs text-ink-subtle shrink-0"
                          dateTime={comentario.created_at}
                          title={fechaCompleta(comentario.created_at)}
                        >
                          {fechaRelativa(comentario.created_at)}
                        </time>
                      ) : (
                        <span className="text-xs text-ink-subtle shrink-0">
                          Fecha no disponible
                        </span>
                      )}
                    </div>

                    {editandoId === comentario.id ? (
                      <div className="space-y-2">
                        <label className={etiqueta} htmlFor={idEdicion}>
                          Corregir comentario
                        </label>
                        <textarea
                          id={idEdicion}
                          className={campo}
                          rows={3}
                          maxLength={COMENTARIO_MAXIMO}
                          value={textoEdicion}
                          onChange={e => setTextoEdicion(e.target.value)}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditandoId(null);
                              setTextoEdicion('');
                            }}
                            className={btnSecundario}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => guardarEdicion(comentario)}
                            disabled={guardando || !textoEdicion.trim()}
                            className={btnPrimario}
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-ink whitespace-pre-wrap break-words">
                          {comentario.texto}
                        </p>
                        <div className="flex items-center justify-end gap-1">
                          {comentario.updated_at && (
                            <span className="text-xs text-ink-subtle mr-auto">
                              Corregido
                            </span>
                          )}
                          {esEditable && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditandoId(comentario.id);
                                setTextoEdicion(comentario.texto);
                              }}
                              title="Corregir mi comentario"
                              aria-label="Corregir mi comentario"
                              className={btnIcono}
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {puedeBorrar && (
                            <button
                              type="button"
                              onClick={() => confirmarBorrado(comentario)}
                              title="Borrar comentario"
                              aria-label="Borrar comentario"
                              className={btnIconoPeligro}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {puedeComentar && (
            <div className="pt-2 border-t border-line">
              <label className={etiqueta} htmlFor={idTexto}>
                Escribe un comentario
              </label>
              <textarea
                id={idTexto}
                className={campo}
                rows={3}
                maxLength={COMENTARIO_MAXIMO}
                placeholder="Comenta este requerimiento…"
                value={texto}
                onChange={e => setTexto(e.target.value)}
              />
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          {puedeComentar && (
            <button
              type="submit"
              disabled={guardando || !texto.trim()}
              className={btnPrimario}
            >
              <Check size={16} />
              Publicar
            </button>
          )}
        </ModalFooter>
      </form>
    </Modal>
  );
}
