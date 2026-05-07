'use client';

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from '@/lib/supabase-client';
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { 
  Users, Plus, Search, ChevronRight, Folder, 
  Filter, MoreVertical, LayoutGrid, List as ListIcon, X, Save
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Team = {
  id: number;
  groupId: number;
  name: string;
  grupos: { name: string };
}

type Group = {
  id: number;
  name: string;
}

export default function EquiposGlobalPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Array<Team>>([]);
  const [groups, setGroups] = useState<Array<Group>>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', groupId: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    
    // Fetch Teams with Group info
    const { data: teamsData, error: teamsError } = await supabase
      .from('equipos')
      .select(`
        *,
        grupos (name)
      `);
    
    if (teamsError) toast.error('Error al cargar equipos');
    else setTeams(teamsData || []);

    // Fetch Groups for the modal
    const { data: groupsData } = await supabase.from('grupos').select('*');
    setGroups(groupsData || []);
    
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.groupId) {
      toast.error("Por favor completa los campos");
      return;
    }

    const { error } = await supabase
      .from('equipos')
      .insert([{ name: formData.name, groupId: Number(formData.groupId) }]);

    if (error) toast.error("Error al crear equipo");
    else {
      toast.success("Equipo creado con éxito");
      setIsModalOpen(false);
      setFormData({ name: '', groupId: '' });
      fetchData();
    }
  };

  const filteredTeams = teams.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.grupos?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">Directorio de Equipos</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Explora todos los equipos de la organización.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl transition-all shadow-xl shadow-blue-500/20 font-bold"
        >
          <Plus size={20} className="mr-2" />
          Nuevo Equipo
        </button>
      </div>

      {/* Search & Stats */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search size={20} className="text-zinc-400 group-focus-within:text-blue-500 transition-colors" />
          </div>
          <input
            type="text"
            placeholder="Buscar por equipo o grupo..."
            className="block w-full pl-12 pr-4 py-4 border-2 border-zinc-100 dark:border-zinc-800 rounded-[24px] bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 focus:border-blue-500 outline-none transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 rounded-[24px] px-6 py-4">
          <span className="text-sm font-bold text-zinc-400 uppercase tracking-widest mr-3">Total</span>
          <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{teams.length}</span>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-48 bg-white dark:bg-zinc-900 rounded-[32px] animate-pulse" />)}
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="text-center py-32 bg-white dark:bg-zinc-900 rounded-[40px] border-2 border-dashed border-zinc-100 dark:border-zinc-800">
          <Users size={48} className="mx-auto text-zinc-200 dark:text-zinc-800 mb-4" />
          <p className="text-xl font-bold text-zinc-400">No se encontraron equipos</p>
          <p className="text-sm text-zinc-500 mt-2 italic">Prueba con otro término o crea uno nuevo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTeams.map((team) => (
            <div
              key={team.id}
              onClick={() => router.push(`/grupos?groupId=${team.groupId}`)}
              className="group bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 rounded-[32px] p-8 hover:border-blue-500 dark:hover:border-blue-500 transition-all cursor-pointer relative overflow-hidden active:scale-[0.98]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="w-14 h-14 bg-zinc-50 dark:bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner">
                  <Users size={28} />
                </div>
                <div className="p-2 text-zinc-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all">
                  <ChevronRight size={24} />
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight group-hover:text-blue-600 transition-colors line-clamp-1">
                  {team.name}
                </h3>
                <div className="flex items-center text-xs font-bold text-zinc-400 uppercase tracking-widest pt-1">
                  <Folder size={14} className="mr-2 text-amber-500" />
                  {team.grupos?.name || 'Sin grupo'}
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-zinc-50 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest group-hover:text-zinc-500">ID: {team.id}</span>
                <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Ver Detalles</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE TEAM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <form onSubmit={handleCreateTeam} className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">Nuevo Equipo</h3>
                <p className="text-sm text-zinc-500 font-medium italic">Asignación global de proyectos.</p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-2xl text-zinc-400">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-10 space-y-8">
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400 ml-1">Nombre del Equipo</label>
                <input
                  required
                  placeholder="Ej: Alpha Squad"
                  className="w-full px-6 py-5 rounded-3xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:border-blue-500 outline-none transition-all font-bold text-lg"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400 ml-1">Asignar a Grupo</label>
                <select
                  required
                  className="w-full px-6 py-5 rounded-3xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:border-blue-500 outline-none appearance-none font-bold"
                  value={formData.groupId}
                  onChange={(e) => setFormData({...formData, groupId: e.target.value})}
                >
                  <option value="">Seleccionar grupo...</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
            </div>

            <div className="p-10 bg-zinc-50 dark:bg-zinc-800/30 flex justify-end">
              <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase text-xs tracking-[0.3em] shadow-2xl shadow-blue-500/40 hover:bg-blue-700 active:scale-[0.98] transition-all flex items-center justify-center">
                <Save size={18} className="mr-3" /> Crear Equipo
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
