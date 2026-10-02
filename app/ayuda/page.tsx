'use client';

import React from 'react';
import Link from 'next/link';
import {
  HelpCircle, FolderGit2, FileText, Users, BookOpen, Shield, Sparkles, Keyboard, ChevronRight, ChevronDown
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
      'Un proyecto tiene miembros y se divide en equipos. Tú, como creador, agregas a los miembros desde la pestaña Miembros, y al crearlo (o desde "Editar") eliges quién puede crear equipos y quién puede agregar miembros.',
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
    puntos: [
      'Los equipos viven dentro de cada proyecto y se arman solo con sus miembros: abre un proyecto y entra a su pestaña "Equipos".',
      'Quien crea un equipo queda como su líder. Quién puede crear equipos en un proyecto lo define su creador: solo él, miembros que elija o cualquier miembro.',
      'El líder invita a los usuarios con uno o varios roles. La invitación te llega a la campana de la barra superior y te unes al aceptarla.',
      'El líder puede cambiar los roles de un miembro. El equipo siempre debe conservar al menos un líder.',
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
  ['Crear proyectos', 'Cualquier usuario con sesión'],
  ['Agregar o quitar miembros de un proyecto', 'El creador y los miembros que él autorice'],
  ['Crear equipos en un proyecto', 'Lo define el creador: solo él, miembros que elija o cualquier miembro'],
  ['Cambiar quién crea equipos o gestiona miembros', 'El creador del proyecto'],
  ['Editar o eliminar un proyecto', 'Su creador y sus miembros'],
  ['Crear, editar o aprobar requerimientos', 'Su creador y sus miembros'],
  ['Editar un equipo, invitar miembros y cambiar roles', 'Los líderes del equipo'],
  ['Editar o eliminar patrones y modelos', 'Nadie por ahora. Se pueden copiar y crear nuevos'],
];

const FAQS = [
  {
    pregunta: '¿Qué es un modelo y en qué se diferencia de un patrón?',
    respuesta: 'El modelo es el enfoque o familia de especificación (EARS, Sistemas Embebidos, Dr. Reyes). El patrón es una plantilla concreta dentro de ese modelo (por ejemplo, “Event-Driven” dentro de EARS). Un modelo agrupa varios patrones.',
  },
  {
    pregunta: '¿Cómo copio la sintaxis de un patrón?',
    respuesta: 'Ve a Patrones y Modelos, localiza la tarjeta del patrón y pulsa el icono de copiar (Copy). Verás un aviso de “Sintaxis copiada al portapapeles” y podrás pegarla en el editor del requerimiento.',
  },
  {
    pregunta: '¿Cómo creo un patrón nuevo?',
    respuesta: 'En Patrones y Modelos pulsa “Nuevo Patrón”, elige el modelo al que pertenece, escribe un nombre descriptivo (por ejemplo “Timing Constraint”) y la sintaxis o prompt con placeholders entre < >. Guarda y aparecerá en el catálogo.',
  },
  {
    pregunta: '¿Qué hago si un modelo no tiene patrones?',
    respuesta: 'Verifica que el filtro de pestaña sea el correcto y limpia el buscador. Si el catálogo aún está vacío, es probable que falte la siembra inicial (seed) de Firestore; pide a un administrador que ejecute la inicialización de catálogos o crea los patrones manualmente con “Nuevo Patrón”.',
  },
  {
    pregunta: '¿Cómo se vincula un modelo a un requerimiento?',
    respuesta: 'Al crear o editar un requerimiento selecciona el modelo correspondiente y redacta el texto siguiendo la sintaxis del patrón elegido. El modelo queda registrado como referencia del estilo usado; el texto del requerimiento es el que debe respetar la plantilla.',
  },
  {
    pregunta: '¿Cómo funcionan los proyectos, equipos y roles?',
    respuesta: 'Los proyectos agrupan requerimientos. Cada proyecto tiene miembros (los agrega su creador desde la pestaña “Miembros”) y se divide en equipos armados con esos miembros, cada uno con sus roles (por ejemplo, líder, analista). Los equipos se gestionan desde la pestaña “Equipos”, y las invitaciones que recibas para unirte a un equipo aparecen en la campana de la barra superior.',
  },
  {
    pregunta: '¿A quién pido ayuda si algo falla?',
    respuesta: 'Pregunta primero a tu líder de equipo o administrador del proyecto. Si el problema es técnico (error al guardar, catálogo vacío, sesión), repórtalo con captura de pantalla, pasos para reproducirlo y el mensaje de error exacto.',
  },
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

      <section className={`${tarjeta} p-5`}>
        <h2 className="text-base font-semibold text-ink flex items-center gap-2 mb-3">
          <HelpCircle size={16} className="text-brand-text" />
          Preguntas frecuentes
        </h2>
        <div className="space-y-2">
          {FAQS.map((faq) => (
            <details
              key={faq.pregunta}
              className="group rounded-ui border border-line p-3 text-sm open:bg-sunken transition-colors"
            >
              <summary className="font-medium text-ink cursor-pointer list-none flex items-center justify-between gap-2">
                <span>{faq.pregunta}</span>
                <ChevronDown size={14} className="text-ink-subtle group-open:rotate-180 transition-transform shrink-0" />
              </summary>
              <p className="mt-2 text-ink-muted leading-relaxed pl-1">
                {faq.respuesta}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
