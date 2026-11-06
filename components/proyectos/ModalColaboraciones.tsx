'use client';

import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Edit2, FolderGit2, Handshake, Plus, Save, Trash2, X } from 'lucide-react';
import type { Colaboracion, ColaboracionProyecto, Proyecto } from '@/lib/database.types';
import {
  createColaboracion,
  deleteColaboracion,
  desvincularProyectoDeColaboracion,
  updateColaboracion,
  vincularProyectoAColaboracion,
} from '@/lib/firestore-service';
import { mensajeError } from '@/lib/errores';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import {
  btnIcono,
  btnIconoPeligro,
  btnPrimario,
  btnSecundario,
  campo,
  etiqueta,
  tarjeta,
} from '@/components/ui/estilos';

interface ModalColaboracionesProps {
  open: boolean;
  onClose: () => void;
  uid: string | null;
  colaboraciones: Colaboracion[];
  relaciones: ColaboracionProyecto[];
  proyectos: Proyecto[];
  proyectosPermitidos: string[];
  onCambio: () => Promise<void>;
}

export function ModalColaboraciones({
  open,
  onClose,
  uid,
  colaboraciones,
  relaciones,
  proyectos,
  proyectosPermitidos,
  onCambio,
}: ModalColaboracionesProps) {
  const confirmar = useConfirm();
  const [editando, setEditando] = useState<Colaboracion | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [proyectosSeleccionados, setProyectosSeleccionados] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const limpiarFormulario = () => {
    setEditando(null);
    setNombre('');
    setDescripcion('');
    setProyectosSeleccionados([]);
  };

  const iniciarEdicion = (colab: Colaboracion) => {
    setEditando(colab);
    setNombre(colab.nombre);
    setDescripcion(colab.descripcion || '');
    const actuales = relaciones
      .filter(r => r.id_colaboracion === colab.id)
      .map(r => r.id_proyecto);
    setProyectosSeleccionados(actuales);
  };

  const alternarProyecto = (idProyecto: string) => {
    setProyectosSeleccionados(prev =>
      prev.includes(idProyecto) ? prev.filter(id => id !== idProyecto) : [...prev, idProyecto]
    );
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) {
      toast.error('Debes iniciar sesión');
      return;
    }
    if (!nombre.trim()) {
      toast.error('El nombre de la colaboración es obligatorio');
      return;
    }

    setGuardando(true);
    try {
      if (editando) {
        await updateColaboracion(editando.id, {
          nombre: nombre.trim(),
          descripcion: descripcion.trim(),
        });

        // Sincronizar proyectos vinculados
        const actuales = new Set(
          relaciones
            .filter(r => r.id_colaboracion === editando.id)
            .map(r => r.id_proyecto)
        );
        const nuevos = new Set(proyectosSeleccionados);

        for (const idProy of nuevos) {
          if (!actuales.has(idProy)) {
            await vincularProyectoAColaboracion(editando.id, idProy, uid);
          }
        }
        for (const idProy of actuales) {
          if (!nuevos.has(idProy)) {
            await desvincularProyectoDeColaboracion(editando.id, idProy);
          }
        }
        toast.success('Colaboración actualizada');
      } else {
        await createColaboracion({
          nombre: nombre.trim(),
          descripcion: descripcion.trim(),
          id_creador: uid,
          ids_proyectos: proyectosSeleccionados,
        });
        toast.success('Colaboración creada');
      }
      limpiarFormulario();
      await onCambio();
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudo guardar la colaboración'));
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (colab: Colaboracion) => {
    const ok = await confirmar({
      titulo: '¿Eliminar colaboración?',
      mensaje: (
        <>
          Se eliminará la campaña <strong className="text-ink">{colab.nombre}</strong>. Los proyectos que pertenecían
          a ella no se borrarán, solo dejarán de estar agrupados en esta campaña.
        </>
      ),
      textoConfirmar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;

    try {
      await deleteColaboracion(colab.id);
      toast.success('Colaboración eliminada');
      if (editando?.id === colab.id) limpiarFormulario();
      await onCambio();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo eliminar la colaboración'));
    }
  };

  // Proyectos que el usuario puede vincular (los suyos o cualquiera ya vinculado en modo edición)
  const proyectosElegibles = proyectos.filter(
    p =>
      proyectosPermitidos.includes(p.proyecto_id) ||
      proyectosSeleccionados.includes(p.proyecto_id)
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="3xl"
      title={
        <span className="inline-flex items-center gap-2">
          <Handshake size={18} className="text-brand-text shrink-0" />
          Colaboraciones y Campañas
        </span>
      }
      description="Agrupa múltiples proyectos que forman parte de una misma iniciativa o campaña."
    >
      <ModalBody className="space-y-6">
        {/* Formulario Crear / Editar */}
        <form onSubmit={guardar} noValidate className={`${tarjeta} p-4 sm:p-5 space-y-4`}>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-ink">
              {editando ? `Editando: ${editando.nombre}` : 'Nueva colaboración'}
            </h4>
            {editando && (
              <button
                type="button"
                onClick={limpiarFormulario}
                className="inline-flex items-center gap-1 text-xs font-medium text-ink-subtle hover:text-ink cursor-pointer"
              >
                <X size={14} />
                Cancelar edición
              </button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="colab-nombre" className={etiqueta}>
                Nombre de la campaña <span className="text-danger">*</span>
              </label>
              <input
                id="colab-nombre"
                type="text"
                maxLength={120}
                placeholder="Ej. Ecosistema Académico 2026"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                className={campo}
              />
            </div>
            <div>
              <label htmlFor="colab-desc" className={etiqueta}>
                Descripción
              </label>
              <input
                id="colab-desc"
                type="text"
                maxLength={240}
                placeholder="Objetivo común de los proyectos participantes..."
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                className={campo}
              />
            </div>
          </div>

          {proyectosElegibles.length > 0 && (
            <div>
              <span className={etiqueta}>Proyectos vinculados a esta campaña</span>
              <div className="flex flex-wrap gap-2">
                {proyectosElegibles.map(p => {
                  const activo = proyectosSeleccionados.includes(p.proyecto_id);
                  return (
                    <button
                      key={p.proyecto_id}
                      type="button"
                      onClick={() => alternarProyecto(p.proyecto_id)}
                      aria-pressed={activo}
                      className={`inline-flex items-center gap-1.5 px-3 min-h-8 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                        activo
                          ? 'bg-brand-solid border-brand-text text-on-solid'
                          : 'bg-sunken border-line text-ink-muted hover:border-brand-text'
                      }`}
                    >
                      {activo ? <Check size={12} /> : <FolderGit2 size={12} />}
                      {p.nombre}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button type="submit" disabled={guardando} className={btnPrimario}>
              {editando ? <Save size={15} /> : <Plus size={15} />}
              {guardando
                ? 'Guardando...'
                : editando
                  ? 'Guardar cambios'
                  : 'Crear colaboración'}
            </button>
          </div>
        </form>

        {/* Lista de colaboraciones */}
        <section>
          <h4 className="text-sm font-semibold text-ink mb-2.5">
            Colaboraciones registradas
            <span className="ml-2 text-xs font-normal text-ink-subtle">
              {colaboraciones.length}
            </span>
          </h4>
          {colaboraciones.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink-subtle border border-line rounded-ui bg-surface">
              Todavía no se ha registrado ninguna campaña de colaboración.
            </p>
          ) : (
            <ul className="divide-y divide-line border border-line rounded-ui bg-surface overflow-hidden">
              {colaboraciones.map(c => {
                const proysIds = relaciones
                  .filter(r => r.id_colaboracion === c.id)
                  .map(r => r.id_proyecto);
                const proys = proyectos.filter(p => proysIds.includes(p.proyecto_id));
                const puedeGestionar =
                  !c.id_creador ||
                  c.id_creador === uid ||
                  proysIds.some(id => proyectosPermitidos.includes(id));

                return (
                  <li
                    key={c.id}
                    className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      editando?.id === c.id ? 'bg-brand-subtle' : 'hover:bg-sunken'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h5 className="text-sm font-semibold text-ink">{c.nombre}</h5>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-sunken text-ink-muted border border-line">
                          {proys.length} {proys.length === 1 ? 'proyecto' : 'proyectos'}
                        </span>
                      </div>
                      {c.descripcion && (
                        <p className="text-xs text-ink-muted mt-1">{c.descripcion}</p>
                      )}
                      {proys.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {proys.map(p => (
                            <span
                              key={p.proyecto_id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-subtle text-brand-text border border-brand-line"
                            >
                              <FolderGit2 size={11} aria-hidden />
                              {p.nombre}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {puedeGestionar && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => iniciarEdicion(c)}
                          className={btnIcono}
                          title="Editar colaboración"
                          aria-label={`Editar ${c.nombre}`}
                        >
                          <Edit2 size={16} />
                        </button>
                        {(!c.id_creador || c.id_creador === uid) && (
                          <button
                            type="button"
                            onClick={() => eliminar(c)}
                            className={btnIconoPeligro}
                            title="Eliminar colaboración"
                            aria-label={`Eliminar ${c.nombre}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btnSecundario}>
          Cerrar
        </button>
      </ModalFooter>
    </Modal>
  );
}

