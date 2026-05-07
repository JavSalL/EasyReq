'use client';

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from '@/lib/supabase-client';
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { Plus, Edit2, Trash2, Folder, ChevronRight, Search } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Group = {
  id: number;
  name: string;
}

export default function Home() {
  const router = useRouter();
  const [groups, setGroups] = useState<Array<Group>>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('grupos')
      .select('*');
    if (error) {
      toast.error('Error al obtener los grupos');
      console.error(error);
    } else {
      setGroups(data || []);
    }
    setLoading(false);
  }, []);

  const editGroup = async (id: number, currentName: string) => {
    const newName = prompt("Nuevo nombre del grupo:", currentName);
    if (!newName || newName === currentName) return;

    const { error } = await supabase
      .from('grupos')
      .update({ name: newName })
      .eq('id', id);
    if (error) {
      toast.error('Error al editar el grupo');
    } else {
      toast.success('Grupo editado correctamente');
      fetchGroups();
    }
  };

  const addGroup = async () => {
    const name = prompt("Nombre del nuevo grupo:");
    if (!name) return;

    const { error } = await supabase
      .from('grupos')
      .insert([{ name }]);
    if (error) {
      toast.error('Error al agregar el grupo');
    } else {
      toast.success('Grupo agregado correctamente');
      fetchGroups();
    }
  };

  const deleteGroup = async (id: number) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este grupo?")) return;

    const { error } = await supabase
      .from('grupos')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('Error al eliminar el grupo');
    } else {
      toast.success('Grupo eliminado correctamente');
      fetchGroups();
    }
  };

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const filteredGroups = groups.filter(g => 
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Panel de Grupos</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Gestiona los grupos de proyectos y sus equipos.</p>
        </div>
        <button
          onClick={addGroup}
          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-md shadow-blue-500/20 font-medium"
        >
          <Plus size={18} className="mr-2" />
          Nuevo Grupo
        </button>
      </div>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search size={18} className="text-zinc-400" />
        </div>
        <input
          type="text"
          placeholder="Buscar grupos..."
          className="block w-full pl-10 pr-3 py-3 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-3xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 animate-pulse" />
          ))}
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Folder size={24} className="text-zinc-400" />
          </div>
          <p className="text-zinc-500 dark:text-zinc-400">No se encontraron grupos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGroups.map((group) => (
            <div
              key={group.id}
              className="group bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 hover:shadow-xl hover:shadow-zinc-200/50 dark:hover:shadow-none transition-all duration-300 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => editGroup(group.id, group.name)}
                  className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  onClick={() => deleteGroup(group.id)}
                  className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 group-hover:scale-110 transition-transform duration-300">
                <Folder size={24} />
              </div>

              <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">{group.name}</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-500 mb-6">Gestiona los equipos y requerimientos de este grupo.</p>

              <button
                onClick={() => router.push(`/grupos?groupId=${group.id}`)}
                className="w-full py-3 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-blue-600 hover:text-white dark:text-zinc-300 dark:hover:bg-blue-600 dark:hover:text-white rounded-xl transition-all duration-200 flex items-center justify-center font-medium group/btn"
              >
                Explorar Grupo
                <ChevronRight size={18} className="ml-2 group-hover/btn:translate-x-1 transition-transform" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
