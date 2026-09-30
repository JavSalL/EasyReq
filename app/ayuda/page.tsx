'use client';

import React from 'react';
import Link from 'next/link';
import {
  HelpCircle, FolderGit2, FileText, Users, BookOpen, Shield, Sparkles, Keyboard, ChevronRight
} from 'lucide-react';
import { tarjeta } from '@/components/ui/estilos';

const SECCIONES = [
  {
    icono: FolderGit2,
    titulo: 'Proyectos',
    href: '/',
    puntos: [
      'Cualquier usuario puede crear un proyecto; quien lo crea puede editarlo y eliminarlo.',
      'Haz clic en la tarjeta de un proyecto para ver sus requerimientos.',
      'Arriba ves "Mis proyectos" (los que puedes editar) y abajo los de la comunidad.',
      'Las solicitudes de equipos que recibas aparecen en el botón "Solicitudes de equipos".',
    ],
  },
  {
    icono: FileText,
    titulo: 'Requerimientos',
    puntos: [
      'Elige un modelo (EARS, Sistemas Embebidos, Dr. Reyes) y un patrón; con "Usar plantilla" se copia su estructura al enunciado.',
      'Cambia el estado de un requerimiento directamente desde su tarjeta.',
      'El botón de historial muestra quién hizo cada cambio y cuándo.',
    ],
  },
  {
    icono: Sparkles,
    titulo: 'Generación con IA',
    puntos: [
      'Dentro del formulario de un requerimiento, describe la funcionalidad y presiona "Generar".',
      'La IA redacta el enunciado siguiendo el patrón seleccionado; revísalo antes de guardar.',
    ],
  },
  {
    icono: Users,
    titulo: 'Equipos y roles',
    href: '/equipos-global/',
    puntos: [
      'Quien crea un equipo queda como su líder.',
      'El líder invita a los usuarios con uno o varios roles; se unen al aceptar la invitación en "Invitaciones".',
      'El líder puede cambiar los roles de un miembro. El equipo siempre debe conservar al menos un líder.',
      'Para vincular un equipo a un proyecto, el creador del proyecto lo invita desde el botón "Equipos" y el líder del equipo acepta.',
    ],
  },
  {
    icono: BookOpen,
    titulo: 'Patrones y modelos',
    href: '/patrones/',
    puntos: [
      'Catálogo de estructuras sintácticas para redactar requerimientos sin ambigüedad.',
      'Puedes copiar un patrón o crear uno nuevo para cualquier modelo.',
    ],
  },
];

const PERMISOS: Array<[string, string]> = [
  ['Ver proyectos, requerimientos, equipos y patrones', 'Cualquier usuario con sesión'],
  ['Crear proyectos y equipos', 'Cualquier usuario con sesión'],
  ['Editar o eliminar un proyecto', 'Su creador o miembros de un equipo vinculado'],
  ['Crear, editar o aprobar requerimientos', 'Su creador o miembros de un equipo vinculado'],
  ['Invitar un equipo a un proyecto', 'El creador del proyecto (el líder del equipo acepta)'],
  ['Pedir desvincular un equipo de un proyecto', 'El creador del proyecto o el líder del equipo'],
  ['Editar un equipo, invitar miembros y cambiar roles', 'Los líderes del equipo'],
];

export default function AyudaPage() {

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="pb-4 border-b border-zinc-200/60 dark:border-zinc-800/60">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
          <HelpCircle className="text-zinc-700 dark:text-zinc-300" size={24} />
          Ayuda
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Guía rápida para trabajar con EasyReq.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECCIONES.map(({ icono: Icono, titulo, href, puntos }) => (
          <section key={titulo} className={`${tarjeta} p-5`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Icono size={16} className="text-blue-600 dark:text-blue-400" />
                {titulo}
              </h2>
              {href && (
                <Link href={href} className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center">
                  Ir <ChevronRight size={12} />
                </Link>
              )}
            </div>
            <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed list-disc pl-4">
              {puntos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className={`${tarjeta} overflow-hidden`}>
        <h2 className="px-5 py-4 border-b border-zinc-200/60 dark:border-zinc-800/60 text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <Shield size={16} className="text-blue-600 dark:text-blue-400" />
          ¿Quién puede hacer qué?
        </h2>
        <table className="w-full text-xs">
          <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
            {PERMISOS.map(([accion, quien]) => (
              <tr key={accion}>
                <td className="px-5 py-2.5 text-zinc-800 dark:text-zinc-200">{accion}</td>
                <td className="px-5 py-2.5 text-zinc-500 dark:text-zinc-400">{quien}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`${tarjeta} p-5`}>
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-3">
          <Keyboard size={16} className="text-blue-600 dark:text-blue-400" />
          Atajos
        </h2>
        <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <li>
            <kbd className="px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 font-mono text-[10px]">Esc</kbd>
            {' '}cierra cualquier ventana abierta.
          </li>
          <li>
            <kbd className="px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 font-mono text-[10px]">Ctrl</kbd>
            {' + '}
            <kbd className="px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 font-mono text-[10px]">Enter</kbd>
            {' '}guarda el requerimiento que estás redactando.
          </li>
        </ul>
      </section>
    </div>
  );
}
