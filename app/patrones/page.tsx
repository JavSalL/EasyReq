'use client';

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from '@/lib/supabase-client';
import toast from "react-hot-toast";
import { 
  Plus, Edit2, Trash2, Save, X, BookOpen, ChevronLeft, 
  Sparkles, Layers, Cpu, Check, Filter, Search, Copy
} from 'lucide-react';
import { useRouter } from "next/navigation";
import type { Modelo, Patron } from '@/lib/database.types';

export default function PatronesPage() {
  const router = useRouter();
  const [modelos, setModelos] = useState<Array<Modelo>>([]);
  const [patrones, setPatrones] = useState<Array<Patron>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModeloFilter, setSelectedModeloFilter] = useState<string>("todos");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPattern, setEditingPattern] = useState<Patron | null>(null);
  const [formData, setFormData] = useState({ 
    nombre: '', 
    promt: '', 
    id_modelo: '' 
  });
  const [saving, setSaving] = useState(false);

  // Delete State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [patternToDelete, setPatternToDelete] = useState<Patron | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Cargar Modelos
      const { data: modelosData } = await supabase
        .from('modelo')
        .select('*')
        .order('nombre');
      setModelos(modelosData || []);

      // 2. Cargar Patrones con su modelo asociado
      const { data: patronesData, error } = await supabase
        .from('patron')
        .select(`
          *,
          modelo:modelo(id, nombre, descripcion)
        `)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error(error);
        toast.error("Error al cargar patrones");
      } else {
        setPatrones(patronesData || []);
      }
    } catch (e) {
      console.error(e);
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
        id_modelo: modelos[0]?.id || '' 
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim() || !formData.promt.trim()) {
      toast.error("El nombre y la sintaxis/prompt son obligatorios");
      return;
    }

    setSaving(true);
    try {
      if (editingPattern) {
        const { error } = await supabase
          .from('patron')
          .update({
            nombre: formData.nombre.trim(),
            promt: formData.promt.trim(),
            id_modelo: formData.id_modelo || null
          })
          .eq('patron_id', editingPattern.patron_id);
        
        if (error) throw error;
        toast.success("Patrón actualizado");
      } else {
        const { error } = await supabase
          .from('patron')
          .insert([{
            nombre: formData.nombre.trim(),
            promt: formData.promt.trim(),
            id_modelo: formData.id_modelo || null
          }]);
        
        if (error) throw error;
        toast.success("Patrón registrado con éxito");
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Error al guardar el patrón");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (pattern: Patron) => {
    setPatternToDelete(pattern);
    setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!patternToDelete) return;
    try {
      const { error } = await supabase
        .from('patron')
        .delete()
        .eq('patron_id', patternToDelete.patron_id);

      if (error) throw error;
      toast.success("Patrón eliminado");
      setIsDeleteModalOpen(false);
      fetchData();
    } catch (e: any) {
      toast.error("Error al eliminar patrón");
    }
  };

  const copyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Sintaxis copiada al portapapeles");
  };

  const filteredPatrones = patrones.filter((p) => {
    const matchSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        p.promt.toLowerCase().includes(searchTerm.toLowerCase());
    const matchModelo = selectedModeloFilter === 'todos' || p.id_modelo === selectedModeloFilter;
    return matchSearch && matchModelo;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div>
          <button 
            onClick={() => router.push('/')}
            className="inline-flex items-center text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-2 group"
          >
            <ChevronLeft size={16} className="mr-1 group-hover:-translate-x-0.5 transition-transform" />
            Volver a Proyectos
          </button>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
            <BookOpen className="text-blue-600" size={32} />
            Modelos y Patrones de Requisitos
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-sm">
            Catálogo formal de sintaxis y patrones estructurados (EARS, Sistemas Embebidos, Lenguaje Natural Dr. Reyes).
          </p>
        </div>
        
        <button
          onClick={() => openModal()}
          className="inline-flex items-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-md shadow-blue-500/20 font-medium text-sm"
        >
          <Plus size={18} className="mr-2" />
          Nuevo Patrón
        </button>
      </div>

      {/* Tabs / Filtros por Modelo */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setSelectedModeloFilter('todos')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
            selectedModeloFilter === 'todos'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
          }`}
        >
          Todos los Modelos ({patrones.length})
        </button>
        {modelos.map((m) => {
          const count = patrones.filter(p => p.id_modelo === m.id).length;
          return (
            <button
              key={m.id}
              onClick={() => setSelectedModeloFilter(m.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                selectedModeloFilter === m.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {m.nombre} ({count})
            </button>
          );
        })}
      </div>

      {/* Buscador */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <Search size={16} className="text-zinc-400" />
        </div>
        <input
          type="text"
          placeholder="Buscar patrón por nombre o sintaxis..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-white"
        />
      </div>

      {/* Grid de Patrones */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl animate-pulse" />
          ))}
        </div>
      ) : filteredPatrones.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <p className="text-zinc-500 text-sm">No se encontraron patrones para este criterio.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredPatrones.map((pat) => (
            <div
              key={pat.patron_id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                {/* Encabezado del Patrón */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                        {pat.nombre}
                      </h3>
                    </div>
                    {pat.modelo && (
                      <span className="inline-block mt-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2.5 py-0.5 rounded-md border border-blue-200 dark:border-blue-800/50">
                        {pat.modelo.nombre}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => copyPrompt(pat.promt)}
                      title="Copiar sintaxis"
                      className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg transition-colors"
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      onClick={() => openModal(pat)}
                      title="Editar patrón"
                      className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-blue-600 rounded-lg transition-colors"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => confirmDelete(pat)}
                      title="Eliminar patrón"
                      className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Caja de Sintaxis / Template */}
                <div className="bg-zinc-50 dark:bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 font-mono text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                  {pat.promt}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar Patrón */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                {editingPattern ? 'Editar Patrón' : 'Nuevo Patrón'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Modelo Perteneciente
                </label>
                <select
                  value={formData.id_modelo}
                  onChange={(e) => setFormData({ ...formData, id_modelo: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-white"
                >
                  <option value="">Selecciona un modelo...</option>
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Nombre del Patrón
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Event-Driven, State-Based, Ubiquitous..."
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Sintaxis / Estructura del Patrón
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Ej: When <trigger>, the <system name> shall <system response>."
                  value={formData.promt}
                  onChange={(e) => setFormData({ ...formData, promt: e.target.value })}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-all shadow-md shadow-blue-500/20"
                >
                  <Save size={15} className="mr-1.5" />
                  {saving ? 'Guardando...' : editingPattern ? 'Actualizar' : 'Crear Patrón'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminar */}
      {isDeleteModalOpen && patternToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              ¿Eliminar patrón?
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              ¿Estás seguro de que deseas eliminar el patrón <strong>{patternToDelete.nombre}</strong>?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="px-3.5 py-1.5 text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
