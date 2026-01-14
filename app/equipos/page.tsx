'use client';

import React, { use, useEffect, useState, useCallback } from "react";
import styles from "./page.module.css";
import '../globals.css';
import { supabase } from '@/lib/supabase-client';
import toast from "react-hot-toast";
import Image from "next/image";
import { useRouter } from "next/navigation";

type Section = {
  id: number;
  teamId: number;
  level: number;
  name: string;
}

type Content = {
  id: number;
  sectionId: number;
  name: string;
}

type Tag = {
  id: number;
  contentId: number;
  name: string;
}

export default function Home({ searchParams }: { searchParams: Promise<{ teamId?: string }> }) {
  const params = use(searchParams);
  const router = useRouter();
  const teamId = params.teamId ? Number(params.teamId) : null;
  const [sections, setSections] = useState<Array<Section>>([]);
  const [contents, setContents] = useState<Array<Content>>([]);
  const [tags, setTags] = useState<Array<Tag>>([]);
  const [maxLevel, setMaxLevel] = useState<number>(0);
  const [readOnly, setReadOnly] = useState<boolean>(true);

  const fetchSections = useCallback(async () => {
    if(!teamId) return;
    const { data, error } = await supabase
      .from('secciones')
      .select('*')
      .eq('teamId', teamId)
      .order('level', { ascending: true });
    if (error) {
      toast.error('Error al obtener las secciones');
      console.error(error);
    } else {
      setSections(data || []);
    }
  }, [teamId]);

  const getMaxLevel = (sections: Array<Section>) => {
    let max = 0;
    sections.forEach((section) => {
      if (section.level > max) {
        max = section.level;
      }
    });
    setMaxLevel(max);
  };

  const editSection = async (id: number, newName: string) => {
    const { data, error } = await supabase
      .from('secciones')
      .update({ name: newName })
      .eq('id', id);
    if (error) {
      toast.error('Error al editar la sección');
      console.error(error);
    } else {
      toast.success('Sección editada correctamente');
      fetchSections();
    }
  };

  const updateSectionLevel = async (id: number, newLevel: number) => {
    const { data, error } = await supabase
      .from('secciones')
      .update({ level: newLevel })
      .eq('id', id);
    if (error) {
      toast.error('Error al actualizar el nivel de la sección');
      console.error(error);
    } else {
      toast.success('Nivel de sección actualizado correctamente');
      fetchSections();
    }
  };

  const addSection = async (name: string, level: number) => {
    const { data, error } = await supabase
      .from('secciones')
      .insert([{ teamId, name, level }]);
    if (error) {
      toast.error('Error al agregar la sección');
      console.error(error);
    } else {
      toast.success('Sección agregada correctamente');
      fetchSections();
    }
  };

  const deleteSection = async (id: number) => {
    const { data, error } = await supabase
      .from('secciones')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('Error al eliminar la sección');
      console.error(error);
    } else {
      toast.success('Sección eliminada correctamente');
      fetchSections();
    }
  };

  const orderSectionsAfterLevelChange = async (id: number, direction: 'up' | 'down') => {
    const section = sections.find((sec) => sec.id === id);
    if (!section) return;

    const newLevel = direction === 'up' ? section.level - 1 : section.level + 1;
    for (const sec of sections) {
      if (sec.level === newLevel) {
        await updateSectionLevel(sec.id, section.level);
        break;
      }
    }
    await updateSectionLevel(id, newLevel);
  };

  const fetchContents = useCallback(async () => {
    const { data, error } = await supabase
      .from('contenido')
      .select('*')
      .eq('teamId', teamId);
    if (error) {
      toast.error('Error al obtener los contenidos');
      console.error(error);
    } else {
      setContents(data || []);
    }
  }, []);

  const addContent = async (sectionId: number, name: string) => {
    const { data, error } = await supabase
      .from('contenido')
      .insert([{ teamId, sectionId, name }]);
    if (error) {
      toast.error('Error al agregar el contenido');
      console.error(error);
    } else {
      toast.success('Contenido agregado correctamente');
      fetchContents();
    }
  };

  const editContent = async (id: number, newName: string) => {
    const { data, error } = await supabase
      .from('contenido')
      .update({ name: newName })
      .eq('id', id);
    if (error) {
      toast.error('Error al editar el contenido');
      console.error(error);
    } else {
      toast.success('Contenido editado correctamente');
      fetchContents();
    }
  };

  const deleteContent = async (id: number) => {
    const { data, error } = await supabase
      .from('contenido')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('Error al eliminar el contenido');
      console.error(error);
    } else {
      toast.success('Contenido eliminado correctamente');
      fetchContents();
    }
  };

  const fetchTags = useCallback(async () => {
    const { data, error } = await supabase
      .from('tags')
      .select('*');
    if (error) {
      toast.error('Error al obtener los tags');
      console.error(error);
    } else {
      setTags(data || []);
    }
  }, []);

  const addTag = async (contentId: number, name: string) => {
    const { data, error } = await supabase
      .from('tags')
      .insert([{ contentId, name }]);
    if (error) {
      toast.error('Error al agregar el tag');
      console.error(error);
    } else {
      toast.success('Tag agregado correctamente');
      fetchTags();
    }
  };
  const editTag = async (id: number, newName: string) => {
    const { data, error } = await supabase
      .from('tags')
      .update({ name: newName })
      .eq('id', id);
    if (error) {
      toast.error('Error al editar el tag');
      console.error(error);
    } else {
      toast.success('Tag editado correctamente');
      fetchTags();
    }
  };
  const deleteTag = async (id: number) => {
    const { data, error } = await supabase
      .from('tags')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('Error al eliminar el tag');
      console.error(error);
    } else {
      toast.success('Tag eliminado correctamente');
      fetchTags();
    }
  };

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  useEffect(() => {
    fetchContents();
  }, [fetchContents]);

  useEffect(() => {
    getMaxLevel(sections);
  }, [sections]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-white">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-black dark:bg-white text-black sm:items-start">
        {sections.length === 0 ? (
          <p className="text-2xl">Cargando secciones...</p>
        ) : (
          <div>
            <ul className="list-disc pl-5">
              {sections.map((section) => (
                <div key={section.id}>
                  <button className="mr-18">{section.name}</button>
                  {section.level !== 1 && !readOnly && <button className={"mr-2 rounded bg-blue-500 px-2 py-1 text-white hover:bg-blue-600"}
                    onClick={() => orderSectionsAfterLevelChange(section.id, 'up')}>↑</button>}
                  {section.level !== maxLevel && !readOnly && <button className={"mr-2 rounded bg-blue-500 px-2 py-1 text-white hover:bg-blue-600"} 
                    onClick={() => orderSectionsAfterLevelChange(section.id, 'down')}>↓</button>}
                  {readOnly ? null : <button
                    className="mr-2 rounded bg-yellow-500 px-2 py-1 text-white hover:bg-yellow-600"
                    onClick={() => {
                      const newName = prompt("Nuevo nombre de la sección:", section.name);
                      if (newName && newName !== '') {
                        editSection(section.id, newName);
                      }
                    }}
                  >
                    Editar
                  </button>}
                  {readOnly ? null : <button
                    className="rounded bg-red-500 px-2 py-1 text-white hover:bg-red-600"
                    onClick={() => deleteSection(section.id)}
                  >
                    Eliminar
                  </button>}
                  <ul className="list-disc pl-5 mt-2">
                    {contents.filter((content) => content.sectionId === section.id).map((content) => (
                      <div key={content.id} className="ml-8">
                        <li>{content.name}</li>
                        {readOnly ? null : <button
                          className="mr-2 rounded bg-yellow-500 px-2 py-1 text-white hover:bg-yellow-600"
                          onClick={() => {
                            const newName = prompt("Nuevo nombre del contenido:", content.name);
                            if (newName && newName !== '') {
                              editContent(content.id, newName);
                            }
                          }}
                        >
                          Editar
                        </button>}
                        {readOnly ? null : <button
                          className="rounded bg-red-500 px-2 py-1 text-white hover:bg-red-600"
                          onClick={() => deleteContent(content.id)}
                        >
                          Eliminar
                        </button>}
                      </div>
                    ))}
                  </ul>
                  {readOnly ? null : <button className="ml-8 mt-2 rounded bg-green-500 px-2 py-1 text-white hover:bg-green-600"
                    onClick={() => {
                      const contentName = prompt("Nombre del contenido:");
                      if (contentName && contentName !== '') {
                        addContent(section.id, contentName);
                      }
                    }}
                  >
                    + Agregar Contenido
                  </button>}
                </div>
              ))}
            </ul>
          </div>
        )}
        <div>
          <input
            type="text"
            placeholder="Nombre de la sección"
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
                addSection(input.value, maxLevel + 1);
                setMaxLevel(maxLevel + 1);
              }
            }}
          >
            Agregar Sección
          </button>
        </div>
      </main>
      <button
        className="fixed bottom-4 right-4 rounded-full bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        onClick={() => setReadOnly(!readOnly)}
      >
        {readOnly ? 'Modo Edición' : 'Modo Solo Lectura'}
      </button>
    </div>
  );
}
