'use client';

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from '@/lib/supabase-client';
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { 
  Users, Plus, Search, ChevronRight, Folder, 
  Filter, MoreVertical, LayoutGrid, List as ListIcon, X, Save, Edit2, Trash2
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
  description?: string;
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
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [formData, setFormData] = useState({ name: '', groupId: '', description: '' });

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

  const openModal = (team: Team | null = null) => {
    if (team) {
      setEditingTeam(team);
      setFormData({ 
        name: team.name, 
        groupId: team.groupId.toString(), 
        description: team.description || '' 
      });
    } else {
      setEditingTeam(null);
      setFormData({ name: '', groupId: '', description: '' });
    }
    setIsModalOpen(true);
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.groupId) {
      toast.error("Por favor completa los campos");
      return;
    }

    if (editingTeam) {
      const { error } = await supabase
        .from('equipos')
        .update({ 
          name: formData.name, 
          groupId: Number(formData.groupId),
          description: formData.description
        })
        .eq('id', editingTeam.id);

      if (error) toast.error("Error al actualizar equipo");
      else {
        toast.success("Equipo actualizado con éxito");
        setIsModalOpen(false);
        fetchData();
      }
    } else {
      const { error } = await supabase
        .from('equipos')
        .insert([{ 
          name: formData.name, 
          groupId: Number(formData.groupId),
          description: formData.description
        }]);

      if (error) toast.error("Error al crear equipo");
      else {
        toast.success("Equipo creado con éxito");
        setIsModalOpen(false);
        fetchData();
      }
    }
  };
  const handleDeleteTeam = async () => {
    if (deleteConfirmText !== 'BORRAR' || !teamToDelete) return;

    const { error } = await supabase
      .from('equipos')
      .delete()
      .eq('id', teamToDelete.id);

    if (error) {
      toast.error("Error al eliminar equipo. Verifica que no tenga registros vinculados.");
    } else {
      toast.success("Equipo eliminado permanentemente");
      setIsDeleteModalOpen(false);
      setTeamToDelete(null);
      setDeleteConfirmText("");
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
              className="group bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 rounded-[32px] p-8 hover:border-blue-500 dark:hover:border-blue-500 transition-all relative overflow-hidden active:scale-[0.98] flex flex-col"
            >
              <div className="flex items-start justify-between mb-6">
                <div 
                  onClick={() => router.push(`/equipos?teamId=${team.id}`)}
                  className="w-14 h-14 bg-zinc-50 dark:bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner cursor-pointer"
                >
                  <Users size={28} />
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); openModal(team); }}
                    className="p-2 text-zinc-300 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all"
                  >
                    <Edit2 size={18} />
                  </button>
                  <div 
                    onClick={() => router.push(`/equipos?teamId=${team.id}`)}
                    className="p-2 text-zinc-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all cursor-pointer"
                  >
                    <ChevronRight size={24} />
                  </div>
                </div>
              </div>

              <div className="space-y-1 flex-1 cursor-pointer" onClick={() => router.push(`/equipos?teamId=${team.id}`)}>
                <h3 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight group-hover:text-blue-600 transition-colors line-clamp-1">
                  {team.name}
                </h3>
                <div className="flex items-center text-xs font-bold text-zinc-400 uppercase tracking-widest pt-1">
                  <Folder size={14} className="mr-2 text-amber-500" />
                  {team.grupos?.name || 'Sin grupo'}
                </div>
                {team.description && (
                  <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2 italic leading-relaxed">
                    {team.description}
                  </p>
                )}
              </div>

              <div 
                onClick={() => router.push(`/equipos?teamId=${team.id}`)}
                className="mt-8 pt-6 border-t border-zinc-50 dark:border-zinc-800 flex items-center justify-between cursor-pointer"
              >
                <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest group-hover:text-zinc-500">ID: {team.id}</span>
                <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Ver Requerimientos</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE/EDIT TEAM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <form onSubmit={handleSaveTeam} className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
                  {editingTeam ? 'Editar Equipo' : 'Nuevo Equipo'}
                </h3>
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
                  className="w-full px-6 py-5 rounded-3xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:border-blue-500 outline-none font-bold appearance-none"
                  value={formData.groupId}
                  onChange={(e) => setFormData({...formData, groupId: e.target.value})}
                >
                  <option value="">Seleccionar grupo...</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400 ml-1">Descripción del Proyecto</label>
                <textarea
                  placeholder="Breve descripción del propósito del equipo..."
                  className="w-full px-6 py-5 rounded-3xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:border-blue-500 outline-none transition-all font-medium min-h-[120px]"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>
            </div>

            <div className="p-10 bg-zinc-50 dark:bg-zinc-800/30 flex items-center justify-between gap-4">
              {editingTeam && (
                <button 
                  type="button"
                  onClick={() => {
                    setTeamToDelete(editingTeam);
                    setIsDeleteModalOpen(true);
                  }}
                  className="p-4 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-3xl hover:bg-red-200 transition-colors"
                  title="Eliminar equipo"
                >
                  <Trash2 size={24} />
                </button>
              )}
              <button type="submit" className="flex-1 py-5 bg-blue-600 text-white rounded-3xl font-black uppercase text-xs tracking-[0.3em] shadow-2xl shadow-blue-500/40 hover:bg-blue-700 active:scale-[0.98] transition-all flex items-center justify-center">
                <Save size={18} className="mr-3" /> {editingTeam ? 'Actualizar Equipo' : 'Crear Equipo'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteModalOpen && teamToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden border-4 border-red-500/20 animate-in zoom-in-95">
            <div className="p-10 text-center space-y-6">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-[30px] flex items-center justify-center mx-auto">
                <Trash2 size={40} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Eliminar Equipo</h3>
                <p className="text-zinc-500 text-sm mt-2">
                  Esta acción eliminará permanentemente a <span className="font-black text-red-600">{teamToDelete.name}</span> y todos sus datos asociados.
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
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-0 border-t border-zinc-100 dark:border-zinc-800">
              <button 
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeleteConfirmText("");
                }}
                className="py-6 font-black uppercase text-xs tracking-widest text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleDeleteTeam}
                disabled={deleteConfirmText !== 'BORRAR'}
                className="py-6 font-black uppercase text-xs tracking-widest text-white bg-red-600 hover:bg-red-700 disabled:opacity-30 disabled:grayscale transition-all"
              >
                Eliminar Ahora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
