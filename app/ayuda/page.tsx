'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  HelpCircle,
  ChevronLeft,
  Search,
  Copy,
  Check,
  BookOpen,
  Cpu,
  PenLine,
  ListOrdered,
  ArrowRight,
} from 'lucide-react';

interface ModeloAyuda {
  nombre: string;
  descripcion: string;
  ejemplo: string;
  cuandoUsar: string;
  patrones: string[];
  icono: React.ReactNode;
}

const MODELOS: ModeloAyuda[] = [
  {
    nombre: 'EARS (Easy Approach to Requirements Syntax)',
    descripcion:
      'Sintaxis estructurada basada en palabras clave para reducir la ambigüedad en especificaciones de requisitos.',
    ejemplo: 'When <trigger>, the <system name> shall <system response>.',
    cuandoUsar:
      'Úsalo para requisitos de software general cuando quieras eliminar ambigüedad con plantillas simples (ubicuos, dirigidos por eventos o estados).',
    patrones: [
      'Ubiquitous',
      'Event-Driven',
      'State-Driven',
      'Unwanted Behavior',
      'Optional Feature',
      'Complex: State + Event',
      'Complex: Optional + State + Event',
    ],
    icono: <BookOpen size={18} />,
  },
  {
    nombre: 'Sistemas Embebidos y Programables',
    descripcion:
      'Orientado a hardware, determinismo temporal, interfaces físicas, tolerancia a fallos y restricciones de recursos.',
    ejemplo: 'When <event>, the <system> shall <response> within <time constraint>.',
    cuandoUsar:
      'Úsalo para firmware, IoT o hardware programable: restricciones de tiempo, comportamiento periódico, manejo de fallos e interfaces físicas.',
    patrones: [
      'Event-Response',
      'State-Based',
      'State + Event',
      'Timing Constraint',
      'Periodic Behavior',
      'Fault Handling',
      'Interface',
      'Resource Constraint',
      'Startup / Initialization',
      'Safety Integrity',
    ],
    icono: <Cpu size={18} />,
  },
  {
    nombre: 'Modelo Dr. Reyes',
    descripcion:
      'Enfoque de lenguaje natural estructurado: Actor + Acción + Objeto de Acción + Datos de entrada + Resultado esperado.',
    ejemplo: '[Actor] + [Acción] + [Objeto de Acción] + [Datos de entrada] + [Resultado esperado].',
    cuandoUsar:
      'Úsalo cuando prefieras lenguaje natural legible por cualquier interesado, sin palabras clave rígidas, pero con estructura fija de 5 partes.',
    patrones: ['Lenguaje Natural Estructurado'],
    icono: <PenLine size={18} />,
  },
];

const PASOS = [
  {
    titulo: 'Ir a Patrones & Modelos',
    detalle: 'En el menú lateral entra a “Patrones & Modelos” para ver el catálogo completo de modelos y sus patrones.',
  },
  {
    titulo: 'Elegir la pestaña del modelo',
    detalle: 'Filtra por pestaña: EARS, Sistemas Embebidos o Modelo Dr. Reyes. El contador de cada pestaña indica cuántos patrones contiene.',
  },
  {
    titulo: 'Buscar el patrón',
    detalle: 'Usa el buscador por nombre o fragmento de sintaxis (por ejemplo “Timing” o “When”).',
  },
  {
    titulo: 'Copiar la sintaxis con el botón Copy',
    detalle: 'Pulsa el icono de copiar en la tarjeta del patrón para llevar la plantilla al portapapeles y pegarla donde la necesites.',
  },
  {
    titulo: 'Crear o editar patrones y aplicarlos al requerimiento',
    detalle:
      'Usa “Nuevo Patrón” para registrar variantes (nombre + sintaxis + modelo). Al crear o editar un requerimiento, selecciona el modelo y redacta siguiendo la plantilla copiada.',
  },
];

const FAQS = [
  {
    pregunta: '¿Qué es un modelo y en qué se diferencia de un patrón?',
    respuesta:
      'El modelo es el enfoque o familia de especificación (EARS, Sistemas Embebidos, Dr. Reyes). El patrón es una plantilla concreta dentro de ese modelo (por ejemplo, “Event-Driven” dentro de EARS). Un modelo agrupa varios patrones.',
  },
  {
    pregunta: '¿Cómo copio la sintaxis de un patrón?',
    respuesta:
      'Ve a Patrones & Modelos, localiza la tarjeta del patrón y pulsa el icono de copiar (Copy). Verás un aviso de “Sintaxis copiada al portapapeles” y podrás pegarla en el editor del requerimiento.',
  },
  {
    pregunta: '¿Cómo creo un patrón nuevo?',
    respuesta:
      'En Patrones & Modelos pulsa “Nuevo Patrón”, elige el modelo al que pertenece, escribe un nombre descriptivo (por ejemplo “Timing Constraint”) y la sintaxis o prompt con placeholders entre < >. Guarda y aparecerá en el catálogo.',
  },
  {
    pregunta: '¿Qué hago si un modelo no tiene patrones?',
    respuesta:
      'Verifica que el filtro de pestaña sea el correcto y limpia el buscador. Si el catálogo aún está vacío, es probable que falte la siembra inicial (seed) de Firestore; pide a un administrador que ejecute la inicialización de catálogos o crea los patrones manualmente con “Nuevo Patrón”.',
  },
  {
    pregunta: '¿Cómo se vincula un modelo a un requerimiento?',
    respuesta:
      'Al crear o editar un requerimiento selecciona el modelo correspondiente y redacta el texto siguiendo la sintaxis del patrón elegido. El modelo queda registrado como referencia del estilo usado; el texto del requerimiento es el que debe respetar la plantilla.',
  },
  {
    pregunta: '¿Cómo funcionan los proyectos, equipos y roles?',
    respuesta:
      'Los proyectos agrupan requerimientos. Cada proyecto tiene un equipo con miembros y roles (por ejemplo, administrador, analista). Gestiona los equipos desde la sección “Equipos” y asigna personas a cada proyecto para colaborar.',
  },
  {
    pregunta: '¿A quién pido ayuda si algo falla?',
    respuesta:
      'Pregunta primero a tu líder de equipo o administrador del proyecto. Si el problema es técnico (error al guardar, catálogo vacío, sesión), repórtalo con captura de pantalla, pasos para reproducirlo y el mensaje de error exacto.',
  },
];

export default function AyudaPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [copiado, setCopiado] = useState<string | null>(null);

  const q = searchTerm.trim().toLowerCase();

  const modelosFiltrados = useMemo(() => {
    if (!q) return MODELOS;
    return MODELOS.filter(
      (m) =>
        m.nombre.toLowerCase().includes(q) ||
        m.descripcion.toLowerCase().includes(q) ||
        m.ejemplo.toLowerCase().includes(q) ||
        m.patrones.some((p) => p.toLowerCase().includes(q)),
    );
  }, [q]);

  const pasosFiltrados = useMemo(() => {
    if (!q) return PASOS;
    return PASOS.filter(
      (p) => p.titulo.toLowerCase().includes(q) || p.detalle.toLowerCase().includes(q),
    );
  }, [q]);

  const faqsFiltradas = useMemo(() => {
    if (!q) return FAQS;
    return FAQS.filter(
      (f) => f.pregunta.toLowerCase().includes(q) || f.respuesta.toLowerCase().includes(q),
    );
  }, [q]);

  const sinResultados = modelosFiltrados.length === 0 && pasosFiltrados.length === 0 && faqsFiltradas.length === 0;

  const copiar = async (texto: string, id: string) => {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiado(id);
    window.setTimeout(() => setCopiado((c) => (c === id ? null : c)), 1500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-5">
        <div>
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors mb-2 group cursor-pointer"
          >
            <ChevronLeft size={14} className="mr-1 group-hover:-translate-x-0.5 transition-transform" />
            Volver a Proyectos
          </button>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight flex items-center gap-2.5">
            <HelpCircle className="text-zinc-700 dark:text-zinc-300" size={24} />
            Centro de Ayuda
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1 text-xs">
            Aprende a usar los modelos y patrones para redactar requerimientos claros y sin ambigüedad.
          </p>
        </div>
        <button
          onClick={() => router.push('/patrones/')}
          className="inline-flex items-center px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all font-medium text-xs gap-1.5 cursor-pointer shadow-xs"
        >
          Ir a Patrones & Modelos
          <ArrowRight size={15} />
        </button>
      </div>

      {/* Buscador */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
          <Search size={14} />
        </div>
        <input
          type="text"
          placeholder="Buscar en la ayuda (modelo, patrón, pregunta...)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-8 pr-3 py-2 bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-zinc-900 dark:text-zinc-100"
        />
      </div>

      {sinResultados ? (
        <div className="text-center py-14 bg-white dark:bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
          <p className="text-zinc-500 text-xs">No se encontraron resultados para “{searchTerm}”.</p>
        </div>
      ) : (
        <>
          {/* Cómo usar los modelos */}
          {pasosFiltrados.length > 0 && (
            <section className="bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 sm:p-5">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-1">
                <ListOrdered size={16} className="text-zinc-500" />
                Cómo usar los Modelos
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                Flujo recomendado paso a paso, del catálogo al requerimiento.
              </p>
              <ol className="space-y-3">
                {pasosFiltrados.map((paso, i) => (
                  <li key={paso.titulo} className="flex gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{paso.titulo}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">{paso.detalle}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Modelos */}
          {modelosFiltrados.length > 0 && (
            <section>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-3">
                <BookOpen size={16} className="text-zinc-500" />
                Modelos disponibles
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {modelosFiltrados.map((m) => (
                  <article
                    key={m.nombre}
                    className="bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-150"
                  >
                    <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                      {m.icono}
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug">{m.nombre}</h3>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">{m.descripcion}</p>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                        Ejemplo de sintaxis
                      </p>
                      <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/80 font-mono text-[11px] text-emerald-400/90 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                        {m.ejemplo}
                      </div>
                      <button
                        onClick={() => copiar(m.ejemplo, m.nombre)}
                        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
                      >
                        {copiado === m.nombre ? <Check size={13} /> : <Copy size={13} />}
                        {copiado === m.nombre ? 'Copiado' : 'Copiar ejemplo'}
                      </button>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
                        Cuándo usarlo
                      </p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{m.cuandoUsar}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1.5">
                        Patrones ({m.patrones.length})
                      </p>
                      <ul className="flex flex-wrap gap-1.5">
                        {m.patrones.map((p) => (
                          <li
                            key={p}
                            className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded-md border border-zinc-200/60 dark:border-zinc-700/50"
                          >
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* FAQ */}
          {faqsFiltradas.length > 0 && (
            <section className="bg-white dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl p-4 sm:p-5">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-1">
                <HelpCircle size={16} className="text-zinc-500" />
                Preguntas frecuentes
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                Haz clic en cada pregunta para ver la respuesta.
              </p>
              <div className="space-y-2">
                {faqsFiltradas.map((f) => (
                  <details
                    key={f.pregunta}
                    className="group border border-zinc-200/80 dark:border-zinc-800 rounded-xl px-3 py-2.5 open:bg-zinc-50 dark:open:bg-zinc-800/40 transition-colors"
                  >
                    <summary className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 cursor-pointer list-none flex items-center justify-between gap-2">
                      {f.pregunta}
                      <span className="text-zinc-400 group-open:rotate-45 transition-transform text-base leading-none">+</span>
                    </summary>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">{f.respuesta}</p>
                  </details>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
