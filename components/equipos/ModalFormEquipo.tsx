'use client';

import React from 'react';
import { Save } from 'lucide-react';
import { Equipo } from '@/lib/database.types';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { btnPrimario, btnSecundario, campo, etiqueta } from '@/components/ui/estilos';

interface ModalFormEquipoProps {
  open: boolean;
  onClose: () => void;
  cerrarConFondo?: boolean;
  editingEquipo: Equipo | null;
  formData: { nombre: string; descripcion: string };
  setFormData: React.Dispatch<React.SetStateAction<{ nombre: string; descripcion: string }>>;
  onSave: (e: React.FormEvent) => void;
  saving: boolean;
}

export default function ModalFormEquipo({
  open,
  onClose,
  cerrarConFondo = true,
  editingEquipo,
  formData,
  setFormData,
  onSave,
  saving,
}: ModalFormEquipoProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      cerrarConFondo={cerrarConFondo}
      title={editingEquipo ? 'Editar Equipo' : 'Nuevo Equipo'}
      description={editingEquipo ? undefined : 'Quedarás como líder del equipo.'}
    >
      <form onSubmit={onSave} noValidate className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-4">
          <div>
            <label htmlFor="equipo-nombre" className={etiqueta}>
              Nombre del Equipo <span className="text-danger">*</span>
            </label>
            <input
              id="equipo-nombre"
              type="text"
              placeholder="Ej. Frontend Squad"
              maxLength={80}
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              className={campo}
            />
          </div>

          <div>
            <label htmlFor="equipo-descripcion" className={etiqueta}>
              Descripción <span className="text-danger">*</span>
            </label>
            <textarea
              id="equipo-descripcion"
              rows={2}
              placeholder="Objetivos o enfoque del equipo..."
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              className={`${campo} resize-none`}
            />
          </div>
          <p className="text-xs text-ink-subtle">
            Para vincular el equipo a un proyecto, el creador del proyecto lo invita desde la página del proyecto.
          </p>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={onClose} className={btnSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} className={btnPrimario}>
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {saving ? 'Guardando...' : editingEquipo ? 'Guardar cambios' : 'Crear Equipo'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
