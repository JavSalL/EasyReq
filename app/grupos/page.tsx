'use client';

import React, { use, useEffect, useState, useCallback } from "react";
import styles from "./page.module.css";
import '../globals.css';
import { supabase } from '@/lib/supabase-client';
import toast from "react-hot-toast";
import Image from "next/image";
import { useRouter } from "next/navigation";

type Team = {
  id: number;
  groupId: number;
  name: string;
}

export default function Home({ searchParams }: { searchParams: Promise<{ groupId?: string }> }) {
  const params = use(searchParams);
  const router = useRouter();
  const groupId = params.groupId ? Number(params.groupId) : null;
  const [teams, setTeams] = useState<Array<Team>>([]);

  const fetchTeams = useCallback(async () => {
    if (!groupId) return;
    console.log("Fetching teams for groupId:", groupId);
    const { data, error } = await supabase
      .from('equipos')
      .select('*')
      .eq('groupId', groupId);
    if (error) {
      toast.error('Error al obtener los equipos');
      console.error(error);
    } else {
      setTeams(data || []);
    }
  }, []);

  const editTeam = async (id: number, newName: string) => {
    const { data, error } = await supabase
      .from('equipos')
      .update({ name: newName })
      .eq('id', id);
    if (error) {
      toast.error('Error al editar el equipo');
      console.error(error);
    } else {
      toast.success('Equipo editado correctamente');
      fetchTeams();
    }
  };

  const addTeam = async (name: string) => {
    const { data, error } = await supabase
      .from('equipos')
      .insert([{ groupId, name }]);
    if (error) {
      toast.error('Error al agregar el equipo');
      console.error(error);
    } else {
      toast.success('Equipo agregado correctamente');
      fetchTeams();
    }
  };

  const deleteTeam = async (id: number) => {
    const { data, error } = await supabase
      .from('equipos')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('Error al eliminar el equipo');
      console.error(error);
    } else {
      toast.success('Equipo eliminado correctamente');
      fetchTeams();
    }
  };

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-white">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-black dark:bg-white text-black sm:items-start">
        {teams.length === 0 ? (
          <p className="text-2xl">Cargando equipos...</p>
        ) : (
          <div>
            <h1 className="text-2xl font-bold mb-4">Equipos</h1>
            <ul className="list-disc pl-5">
              {teams.map((team) => (
                <div key={team.id}>
                  <li key={team.id} className="mb-2">
                    <button
                      className="mr-2 rounded bg-blue-500 px-2 py-1 text-white hover:bg-blue-600"
                      onClick={() => {
                        toast.success(`Has seleccionado el equipo: ${team.name}`);
                        router.push(`/equipos?teamId=${team.id}`);
                      }}
                    >
                      {team.name}
                    </button>
                    <button
                      className="ms-18 mr-2 rounded bg-yellow-500 px-2 py-1 text-white hover:bg-yellow-600"
                      onClick={() => {
                        const newName = prompt("Nuevo nombre del equipo:", team.name);
                        if (newName && newName !== '') {
                          editTeam(team.id, newName);
                        }
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="rounded bg-red-500 px-2 py-1 text-white hover:bg-red-600"
                      onClick={() => deleteTeam(team.id)}
                    >
                      Eliminar
                    </button>
                  </li>
                </div>
              ))}
            </ul>
          </div>
        )}
        <div>
          <input
            type="text"
            placeholder="Nombre del equipo"
            className="mt-8 rounded border border-gray-300 px-4 py-2"
            id="new-group-name"
          />
          <button
            className="mt-8 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
            onClick={() => {
              const input = document.getElementById('new-group-name') as HTMLInputElement;
              if (input.value === '') {
                toast.error("Falta nombre");
              } else {
                addTeam(input.value);
              }
            }}
          >
            Agregar Equipo
          </button>
        </div>
      </main>
    </div>
  );
}
