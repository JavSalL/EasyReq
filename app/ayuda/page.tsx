'use client';

import React from 'react';
import Link from 'next/link';
import {
  FolderGit2, FileText, Users, BookOpen, Shield, Sparkles, Keyboard, ChevronRight
} from 'lucide-react';
import { tarjeta } from '@/components/ui/estilos';
import PageHeader from '@/components/ui/PageHeader';

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
      'Cada requerimiento tiene un identificador dentro de su proyecto (REQ-001, REQ-002...). Van en orden y, si borras uno, su número no se reutiliza. Haz clic en el identificador para copiarlo, o búscalo escribiendo su número.',
      'Con «Insertar después» (el icono de lista con un +, en cada fila) añades un requerimiento entre dos: se registra con el número siguiente y todos los que venían después suben un número.',
      'Cambia el estado de un requerimiento directamente desde su fila.',
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
    <div className="animate-in fade-in">
      <PageHeader title="Ayuda" description="Guía rápida para trabajar con EasyReq." />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECCIONES.map(({ icono: Icono, titulo, href, puntos }) => (
          <section key={titulo} className={`${tarjeta} p-5`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-ink flex items-center gap-2">
                <Icono size={16} className="text-brand-text" />
                {titulo}
              </h2>
              {href && (
                <Link href={href} className="text-xs font-semibold text-brand-text hover:underline inline-flex items-center">
                  Ir <ChevronRight size={12} />
                </Link>
              )}
            </div>
            <ul className="space-y-1.5 text-xs text-ink-muted leading-relaxed list-disc pl-4">
              {puntos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className={`${tarjeta} overflow-hidden`}>
        <h2 className="px-5 py-4 border-b border-line text-base font-semibold text-ink flex items-center gap-2">
          <Shield size={16} className="text-brand-text" />
          ¿Quién puede hacer qué?
        </h2>
        <table className="w-full text-xs">
          <tbody className="divide-y divide-line">
            {PERMISOS.map(([accion, quien]) => (
              <tr key={accion}>
                <td className="px-5 py-2.5 text-ink">{accion}</td>
                <td className="px-5 py-2.5 text-ink-subtle">{quien}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={`${tarjeta} p-5`}>
        <h2 className="text-base font-semibold text-ink flex items-center gap-2 mb-3">
          <Keyboard size={16} className="text-brand-text" />
          Atajos
        </h2>
        <ul className="space-y-1.5 text-xs text-ink-muted">
          <li>
            <kbd className="px-1.5 py-0.5 rounded-ui border border-line-strong bg-sunken font-mono text-xs">/</kbd>
            {' '}lleva el cursor al buscador de la pantalla.
          </li>
          <li>
            <kbd className="px-1.5 py-0.5 rounded-ui border border-line-strong bg-sunken font-mono text-xs">Esc</kbd>
            {' '}cierra cualquier ventana abierta. Si tienes cambios sin guardar, te pregunta antes de descartarlos.
          </li>
          <li>
            <kbd className="px-1.5 py-0.5 rounded-ui border border-line-strong bg-sunken font-mono text-xs">Ctrl</kbd>
            {' + '}
            <kbd className="px-1.5 py-0.5 rounded-ui border border-line-strong bg-sunken font-mono text-xs">Enter</kbd>
            {' '}guarda el formulario abierto (proyecto, equipo, patrón o requerimiento).
          </li>
          <li>
            Al registrar varios requerimientos seguidos, usa «Guardar y añadir otro»: la ventana se queda abierta
            con el mismo modelo y tipo para que solo escribas el siguiente enunciado.
          </li>
        </ul>
      </section>
    </div>
  );
}
