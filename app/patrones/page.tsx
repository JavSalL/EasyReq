'use client';

import React, { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  Plus, Edit2, Trash2, Save, Search, Copy, Check
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
import PageHeader from '@/components/ui/PageHeader';
import { useCierreSeguro } from '@/lib/use-cierre-seguro';
import { useEstadoSesion } from '@/lib/use-estado-sesion';

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
  const [selectedModeloFilter, setSelectedModeloFilter] = useEstadoSesion<string>("easyreq:patrones:modelo", "todos");
  const [searchTerm, setSearchTerm] = useEstadoSesion("easyreq:patrones:buscar", "");
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
  const { hayCambios, intentarCerrar } = useCierreSeguro(isModalOpen, formData, () => setIsModalOpen(false));

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
          Se eliminará el patrón <strong className="text-ink">{pattern.nombre}</strong>.
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
  // Los patrones se muestran agrupados por modelo, cada grupo con su título
  const gruposPatrones = [
    ...modelos.map(m => ({
      id: m.id,
      nombre: m.nombre,
      descripcion: m.descripcion,
      patrones: filteredPatrones.filter(p => p.id_modelo === m.id)
    })),
    {
      id: 'sin-modelo',
      nombre: 'Sin modelo',
      descripcion: null,
      patrones: filteredPatrones.filter(p => !modelos.some(m => m.id === p.id_modelo))
    }
  ].filter(g => g.patrones.length > 0);

  const claseFiltro = (activo: boolean) =>
    `px-3 py-1.5 rounded-ui text-xs font-medium transition-colors cursor-pointer ${
      activo
        ? 'bg-brand-solid text-on-solid'
        : 'bg-sunken text-ink-muted hover:bg-sunken-strong'
    }`;

  return (
    <div className="space-y-6 animate-in fade-in">
      <PageHeader
        title="Patrones y Modelos"
        description="Catálogo de sintaxis estructuradas para redactar requerimientos (EARS, Sistemas Embebidos, Lenguaje Natural)."
        actions={
          puedeEditar && (
            <button onClick={() => openModal()} className={btnPrimario}>
              <Plus size={16} />
              Nuevo patrón
            </button>
          )
        }
      />

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
      </div>

      {/* Buscador */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-subtle">
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
        <div role="status" aria-label="Cargando" className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-sunken animate-pulse" />
          ))}
        </div>
      ) : filteredPatrones.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-lg font-semibold text-ink">
            {termino ? 'Sin resultados' : 'No hay patrones en este modelo'}
          </p>
          <p className="text-base text-ink-muted mt-2 max-w-sm mx-auto">
            {termino ? 'Ningún patrón coincide con tu búsqueda.' : 'Agrega el primero para poder usarlo al redactar requerimientos.'}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {termino && (
              <button onClick={() => setSearchTerm('')} className={btnSecundario}>Limpiar búsqueda</button>
            )}
            {!termino && puedeEditar && (
              <button onClick={() => openModal()} className={btnPrimario}>
                <Plus size={15} />
                Nuevo Patrón
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-12">
          {gruposPatrones.map((grupo) => (
            <section key={grupo.id} aria-labelledby={`grupo-${grupo.id}`}>
              <div className="pb-3 mb-5 border-b-2 border-line-strong">
                <h2 id={`grupo-${grupo.id}`} className="text-xl font-semibold text-ink">
                  {grupo.nombre}
                  <span className="ml-2 text-sm font-normal text-ink-subtle">
                    {grupo.patrones.length} {grupo.patrones.length === 1 ? 'patrón' : 'patrones'}
                  </span>
                </h2>
                {grupo.descripcion && (
                  <p className="text-sm text-ink-muted mt-1 max-w-prose">{grupo.descripcion}</p>
                )}
              </div>

              <ul className="space-y-4">
                {grupo.patrones.map((pat) => (
                  <li key={pat.patron_id} className={`${tarjeta} p-5`}>
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <h3 className="text-base font-semibold text-ink min-w-0">{pat.nombre}</h3>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => copyPrompt(pat)}
                          title="Copiar sintaxis"
                          aria-label={`Copiar sintaxis de ${pat.nombre}`}
                          className={btnIcono}
                        >
                          {copiadoId === pat.patron_id ? <Check size={16} className="text-success" /> : <Copy size={16} />}
                        </button>
                        {puedeEditar && (
                          <button
                            onClick={() => openModal(pat)}
                            title="Editar patrón"
                            aria-label={`Editar ${pat.nombre}`}
                            className={btnIcono}
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                        {puedeEditar && (
                          <button
                            onClick={() => handleDelete(pat)}
                            title="Eliminar patrón"
                            aria-label={`Eliminar ${pat.nombre}`}
                            className={btnIconoPeligro}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Sintaxis del patrón */}
                    <div className="bg-sunken px-4 py-3 rounded-ui border border-line border-l-4 border-l-brand-solid font-mono text-sm text-ink leading-relaxed overflow-x-auto whitespace-pre-wrap">
                      {pat.promt}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar Patrón */}
      <Modal
        open={isModalOpen}
        onClose={intentarCerrar}
        cerrarConFondo={!hayCambios}
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
                Nombre del Patrón <span className="text-danger">*</span>
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
                Sintaxis / Estructura <span className="text-danger">*</span>
              </label>
              <textarea
                id="patron-sintaxis"
                rows={4}
                placeholder="Ej: When <trigger>, the <system name> shall <system response>."
                value={formData.promt}
                onChange={(e) => setFormData({ ...formData, promt: e.target.value })}
                className={`${campo} font-mono leading-relaxed`}
              />
              <p className="text-xs text-ink-subtle mt-1">
                Usa &lt;marcadores&gt; o [corchetes] para las partes que se deben completar.
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <button type="button" onClick={intentarCerrar} className={btnSecundario}>
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
