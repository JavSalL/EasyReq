'use client';

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from '@/lib/supabase-client';
import toast from "react-hot-toast";
import { 
  Plus, Edit2, Trash2, Save, X, BookOpen, ChevronLeft, 
  MessageSquare, Layout, Sparkles, BrainCircuit
} from 'lucide-react';
import { useRouter } from "next/navigation";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Pattern = {
  id: number;
  name: string;
  description: string;
  prompt: string;
  created_at: string;
}

export default function PatronesPage() {
  const router = useRouter();
  const [patrones, setPatrones] = useState<Array<Pattern>>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPattern, setEditingPattern] = useState<Pattern | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', prompt: '' });

  // Delete State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [patternToDelete, setPatternToDelete] = useState<Pattern | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('patrones')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (error) toast.error("Error al cargar patrones");
    else setPatrones(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openModal = (pattern: Pattern | null = null) => {
    if (pattern) {
      setEditingPattern(pattern);
      setFormData({ 
        name: pattern.name, 
        description: pattern.description || '', 
        prompt: pattern.prompt 
      });
    } else {
      setEditingPattern(null);
      setFormData({ name: '', description: '', prompt: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.prompt) {
      toast.error("Nombre y Prompt son obligatorios");
      return;
    }

    if (editingPattern) {
      const { error } = await supabase
        .from('patrones')
        .update(formData)
        .eq('id', editingPattern.id);
      
      if (error) toast.error("Error al actualizar");
      else {
        toast.success("Patrón actualizado");
        setIsModalOpen(false);
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from('patrones')
        .insert([formData]);
      
      if (error) toast.error("Error al crear");
      else {
        toast.success("Patrón creado");
        setIsModalOpen(false);
        fetchData();
      }
    }
  };

  const handleDelete = async () => {
    if (confirmText !== 'BORRAR' || !patternToDelete) return;

    const { error } = await supabase
      .from('patrones')
      .delete()
      .eq('id', patternToDelete.id);

    if (error) toast.error("Error al eliminar");
    else {
      toast.success("Patrón eliminado");
      setIsDeleteModalOpen(false);
      setPatternToDelete(null);
      setConfirmText("");
      fetchData();
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-700 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => router.push('/')}
            className="p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-2xl transition-all text-zinc-500"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tighter">Patrones de IA</h1>
            <p className="text-zinc-500 font-medium">Define las reglas que seguirá Gemini para redactar requerimientos.</p>
          </div>
        </div>
        <button 
          onClick={() => openModal()}
          className="px-8 py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-3xl font-black uppercase text-xs tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center shadow-2xl"
        >
          <Plus size={18} className="mr-2" /> Nuevo Patrón
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map(i => <div key={i} className="h-64 bg-zinc-100 dark:bg-zinc-900 rounded-[40px] animate-pulse" />)}
        </div>
      ) : patrones.length === 0 ? (
        <div className="py-40 text-center space-y-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-[60px] border-4 border-dashed border-zinc-100 dark:border-zinc-800">
          <BookOpen size={64} className="mx-auto text-zinc-200" />
          <p className="text-2xl font-black text-zinc-300">No hay patrones registrados</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {patrones.map((p) => (
            <div 
              key={p.id}
              className="group bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 rounded-[48px] p-10 hover:border-blue-500 transition-all flex flex-col shadow-sm hover:shadow-2xl hover:shadow-blue-500/10"
            >
              <div className="flex items-start justify-between mb-8">
                <div className="w-16 h-16 bg-zinc-50 dark:bg-zinc-800 rounded-[24px] flex items-center justify-center text-zinc-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
                  <BrainCircuit size={32} />
                </div>
                <div className="flex space-x-2">
                  <button onClick={() => openModal(p)} className="p-3 text-zinc-300 hover:text-blue-500 hover:bg-blue-50 rounded-2xl transition-all">
                    <Edit2 size={20} />
                  </button>
                  <button 
                    onClick={() => { setPatternToDelete(p); setIsDeleteModalOpen(true); }}
                    className="p-3 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 space-y-4">
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight leading-tight">{p.name}</h3>
                <p className="text-zinc-500 text-sm font-medium line-clamp-3 leading-relaxed">{p.description}</p>
              </div>

              <div className="mt-8 pt-8 border-t border-zinc-50 dark:border-zinc-800">
                <div className="flex items-center space-x-3 text-zinc-400">
                  <MessageSquare size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Prompt Activo</span>
                </div>
                <div className="mt-3 p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800 group-hover:border-blue-100 transition-all">
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-2 font-mono italic">
                    {p.prompt}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: CREATE/EDIT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <form 
            onSubmit={handleSave}
            className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95"
          >
            <div className="p-10 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
              <div>
                <h3 className="text-3xl font-black text-zinc-900 dark:text-white tracking-tighter">
                  {editingPattern ? 'Editar Patrón' : 'Nuevo Patrón'}
                </h3>
                <p className="text-sm text-zinc-500 font-medium italic mt-1">Configura la lógica de redacción técnica.</p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-4 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-3xl text-zinc-400 transition-all">
                <X size={28} />
              </button>
            </div>
            
            <div className="p-10 space-y-8">
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 ml-1">Nombre del Patrón</label>
                <input
                  required
                  placeholder="Ej: Patrón Dr. Reyes (V2)"
                  className="w-full px-8 py-5 rounded-[24px] border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:border-blue-500 outline-none transition-all font-bold text-lg shadow-inner"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 ml-1">Descripción Breve</label>
                <input
                  placeholder="Para qué sirve este patrón..."
                  className="w-full px-8 py-4 rounded-[20px] border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:border-blue-500 outline-none transition-all font-medium shadow-inner"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400 ml-1">Prompt de Instrucción para IA</label>
                <textarea
                  required
                  placeholder="Redacta el requerimiento usando la siguiente estructura..."
                  className="w-full px-8 py-6 rounded-[32px] border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:border-blue-500 outline-none transition-all font-medium min-h-[200px] shadow-inner text-sm leading-relaxed"
                  value={formData.prompt}
                  onChange={(e) => setFormData({...formData, prompt: e.target.value})}
                />
              </div>
            </div>

            <div className="p-10 bg-zinc-50 dark:bg-zinc-800/30 flex justify-end">
              <button type="submit" className="w-full py-6 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-[24px] font-black uppercase text-xs tracking-[0.3em] shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center">
                <Save size={18} className="mr-3" /> {editingPattern ? 'Actualizar Patrón' : 'Guardar Patrón'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {isDeleteModalOpen && patternToDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[48px] shadow-2xl overflow-hidden border-4 border-red-500/20 animate-in zoom-in-95">
            <div className="p-10 text-center space-y-6">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-[30px] flex items-center justify-center mx-auto">
                <Trash2 size={40} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Eliminar Patrón</h3>
                <p className="text-zinc-500 text-sm mt-2">
                  Esta acción eliminará permanentemente el patrón <span className="font-black text-red-600">{patternToDelete.name}</span>.
                </p>
              </div>

              <div className="space-y-4 pt-4 text-left">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">
                  Escribe <span className="text-red-600">BORRAR</span> para confirmar
                </label>
                <input
                  type="text"
                  placeholder="BORRAR"
                  className="w-full px-6 py-4 rounded-2xl border-2 border-red-100 dark:border-red-900/20 bg-red-50/30 dark:bg-red-900/5 text-red-600 focus:border-red-500 outline-none transition-all font-black text-center tracking-[0.5em]"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 border-t border-zinc-100 dark:border-zinc-800">
              <button 
                onClick={() => { setIsDeleteModalOpen(false); setConfirmText(""); }}
                className="py-8 font-black uppercase text-xs tracking-widest text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleDelete}
                disabled={confirmText !== 'BORRAR'}
                className="py-8 font-black uppercase text-xs tracking-widest text-white bg-red-600 hover:bg-red-700 disabled:opacity-30 disabled:grayscale transition-all"
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
