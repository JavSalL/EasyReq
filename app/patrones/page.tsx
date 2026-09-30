'use client';

import React, { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  Plus, Edit2, Trash2, Save, BookOpen, Search, Copy, Check
} from 'lucide-react';
import type { Modelo, Patron } from '@/lib/database.types';
import {
  getModelos,
  getPatrones,
  createPatron,
  updatePatron,
  deletePatron
} from '@/lib/firestore-service';
import { puedeEditarCatalogos } from '@/lib/permisos';
import { mensajeError } from '@/lib/errores';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  btnPrimario, btnSecundario, btnIcono, btnIconoPeligro, buscador, campo, etiqueta, tarjeta
} from '@/components/ui/estilos';

export default function PatronesPage() {
  const confirmar = useConfirm();
  // KAN-17: `false` para todos los usuarios por ahora, así que los botones de
  // editar y eliminar no se renderizan. El JSX sigue aquí detrás de la condición
  // a propósito: cuando exista el sistema de roles, `puedeEditarCatalogos` empezará
  // a devolver `true` para los perfiles autorizados y aparecerán solos, sin
  // reescribir esta página.
  const puedeEditar = puedeEditarCatalogos();
  const [modelos, setModelos] = useState<Array<Modelo>>([]);
  const [patrones, setPatrones] = useState<Array<Patron>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModeloFilter, setSelectedModeloFilter] = useState<string>("todos");
  const [searchTerm, setSearchTerm] = useState("");
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPattern, setEditingPattern] = useState<Patron | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    promt: '',
    id_modelo: ''
  });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [modelosData, patronesData] = await Promise.all([
        getModelos(),
        getPatrones()
      ]);
      setModelos(modelosData);
      setPatrones([...patronesData].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (e) {
      console.error(e);
      toast.error(mensajeError(e, 'No se pudieron cargar los patrones'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openModal = (pattern: Patron | null = null) => {
    if (pattern) {
      setEditingPattern(pattern);
      setFormData({
        nombre: pattern.nombre,
        promt: pattern.promt,
        id_modelo: pattern.id_modelo || ''
      });
    } else {
      setEditingPattern(null);
      setFormData({
        nombre: '',
        promt: '',
        // Si hay un modelo filtrado, el patrón nuevo va en ese modelo
        id_modelo: selectedModeloFilter !== 'todos' ? selectedModeloFilter : modelos[0]?.id || ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      toast.error("El nombre del patrón es obligatorio");
      return;
    }
    if (!formData.promt.trim()) {
      toast.error("La sintaxis del patrón es obligatoria");
      return;
    }

    setSaving(true);
    try {
      const datos = {
        nombre: formData.nombre.trim(),
        promt: formData.promt.trim(),
        id_modelo: formData.id_modelo || null
      };
      if (editingPattern) {
        await updatePatron(editingPattern.patron_id, datos);
        toast.success("Patrón actualizado");
      } else {
        await createPatron(datos);
        toast.success("Patrón creado");
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudo guardar el patrón'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pattern: Patron) => {
    const ok = await confirmar({
      titulo: '¿Eliminar patrón?',
      mensaje: (
        <>
          Se eliminará el patrón <strong className="text-zinc-900 dark:text-zinc-100">{pattern.nombre}</strong>.
          Los requerimientos ya redactados con él no se modifican.
        </>
      ),
      textoConfirmar: 'Eliminar',
      peligro: true
    });
    if (!ok) return;
    try {
      await deletePatron(pattern.patron_id);
      toast.success("Patrón eliminado");
      fetchData();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo eliminar el patrón'));
    }
  };

  const copyPrompt = async (pat: Patron) => {
    try {
      await navigator.clipboard.writeText(pat.promt);
      setCopiadoId(pat.patron_id);
      setTimeout(() => setCopiadoId(actual => (actual === pat.patron_id ? null : actual)), 1500);
      toast.success("Sintaxis copiada al portapapeles");
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto y cópialo manualmente.");
    }
  };

  const termino = searchTerm.trim().toLowerCase();
  const filteredPatrones = patrones.filter((p) => {
    const matchSearch = !termino ||
      p.nombre.toLowerCase().includes(termino) ||
      p.promt.toLowerCase().includes(termino);
    const matchModelo = selectedModeloFilter === 'todos' || p.id_modelo === selectedModeloFilter;
    return matchSearch && matchModelo;
  });
  const modeloSeleccionado = modelos.find(m => m.id === selectedModeloFilter);

  const claseFiltro = (activo: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
      activo
        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
        : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
    }`;

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
            <BookOpen className="text-zinc-700 dark:text-zinc-300" size={24} />
            Patrones y Modelos
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs">
            Catálogo de sintaxis estructuradas para redactar requerimientos (EARS, Sistemas Embebidos, Lenguaje Natural).
          </p>
        </div>

        <button onClick={() => openModal()} className={btnPrimario}>
          <Plus size={15} />
          Nuevo Patrón
        </button>
      </div>

      {/* Filtros por Modelo */}
      <div className="space-y-2">
        <div role="group" aria-label="Filtrar por modelo" className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedModeloFilter('todos')}
            aria-pressed={selectedModeloFilter === 'todos'}
            className={claseFiltro(selectedModeloFilter === 'todos')}
          >
            Todos ({patrones.length})
          </button>
          {modelos.map((m) => {
            const count = patrones.filter(p => p.id_modelo === m.id).length;
            return (
              <button
                key={m.id}
                onClick={() => setSelectedModeloFilter(m.id)}
                aria-pressed={selectedModeloFilter === m.id}
                className={claseFiltro(selectedModeloFilter === m.id)}
              >
                {m.nombre} ({count})
              </button>
            );
          })}
        </div>
        {modeloSeleccionado?.descripcion && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 pl-1">{modeloSeleccionado.descripcion}</p>
        )}
      </div>

      {/* Buscador */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
          <Search size={14} />
        </div>
        <input
          type="search"
          placeholder="Buscar patrón por nombre o sintaxis..."
          aria-label="Buscar patrones"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={buscador}
        />
      </div>

      {/* Grid de Patrones */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredPatrones.length === 0 ? (
        <div className="text-center py-14 bg-white dark:bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {termino ? 'Sin resultados' : 'No hay patrones en este modelo'}
          </p>
          <p className="text-zinc-500 text-xs mt-1">
            {termino ? 'Ningún patrón coincide con tu búsqueda.' : 'Agrega el primero para poder usarlo al redactar requerimientos.'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {termino && (
              <button onClick={() => setSearchTerm('')} className={btnSecundario}>Limpiar búsqueda</button>
            )}
            {!termino && (
              <button onClick={() => openModal()} className={btnPrimario}>
                <Plus size={15} />
                Nuevo Patrón
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPatrones.map((pat) => (
            <div
              key={pat.patron_id}
              className={`${tarjeta} p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors flex flex-col`}
            >
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {pat.nombre}
                  </h3>
                  {pat.modelo && (
                    <span className="inline-block mt-1 text-[10px] font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded-md border border-zinc-200/60 dark:border-zinc-700/50">
                      {pat.modelo.nombre}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => copyPrompt(pat)}
                    title="Copiar sintaxis"
                    aria-label={`Copiar sintaxis de ${pat.nombre}`}
                    className={btnIcono}
                  >
                    {copiadoId === pat.patron_id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                  {puedeEditar && (
                    <button
                      onClick={() => openModal(pat)}
                      title="Editar patrón"
                      aria-label={`Editar ${pat.nombre}`}
                      className={btnIcono}
                    >
                      <Edit2 size={14} />
                    </button>
                  )}
                  {puedeEditar && (
                    <button
                      onClick={() => handleDelete(pat)}
                      title="Eliminar patrón"
                      aria-label={`Eliminar ${pat.nombre}`}
                      className={btnIconoPeligro}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Caja de Sintaxis */}
              <div className="flex-1 bg-zinc-950 p-3 rounded-xl border border-zinc-800/80 font-mono text-[11px] text-emerald-400/90 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                {pat.promt}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar Patrón */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPattern ? 'Editar Patrón' : 'Nuevo Patrón'}
        size="lg"
      >
        <form onSubmit={handleSave} noValidate className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-4">
            <div>
              <label htmlFor="patron-modelo" className={etiqueta}>Modelo</label>
              <select
                id="patron-modelo"
                value={formData.id_modelo}
                onChange={(e) => setFormData({ ...formData, id_modelo: e.target.value })}
                className={campo}
              >
                <option value="">Sin modelo</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="patron-nombre" className={etiqueta}>
                Nombre del Patrón <span className="text-rose-500">*</span>
              </label>
              <input
                id="patron-nombre"
                type="text"
                placeholder="Ej: Event-Driven, State-Based, Ubiquitous..."
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                className={campo}
              />
            </div>

            <div>
              <label htmlFor="patron-sintaxis" className={etiqueta}>
                Sintaxis / Estructura <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="patron-sintaxis"
                rows={4}
                placeholder="Ej: When <trigger>, the <system name> shall <system response>."
                value={formData.promt}
                onChange={(e) => setFormData({ ...formData, promt: e.target.value })}
                className={`${campo} font-mono leading-relaxed`}
              />
              <p className="text-[11px] text-zinc-400 mt-1">
                Usa &lt;marcadores&gt; o [corchetes] para las partes que se deben completar.
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <button type="button" onClick={() => setIsModalOpen(false)} className={btnSecundario}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className={btnPrimario}>
              <Save size={14} />
              {saving ? 'Guardando...' : editingPattern ? 'Guardar cambios' : 'Crear Patrón'}
            </button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
