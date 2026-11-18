import type { PasoTour } from '@/components/ui/TourGuiado';

export const PASOS_TUTORIAL_EQUIPOS: PasoTour[] = [
  {
    objetivo: 'tour-eq-nuevo',
    titulo: 'Crea un equipo global',
    texto: 'Los equipos globales agrupan integrantes y roles para reutilizarlos en uno o varios proyectos sin tener que volver a armarlos.',
  },
  {
    objetivo: 'tour-eq-filtros',
    titulo: 'Busca y filtra equipos',
    texto: 'Encuentra un equipo por nombre, descripción o integrante, o cambia a «Mis equipos» para ver solo en los que participas.',
  },
  {
    objetivo: 'tour-eq-lista',
    titulo: 'Gestiona miembros e invitaciones',
    texto: 'Haz clic en cualquier equipo para invitar personas por correo, asignar líderes y consultar el historial de cambios.',
  },
];

export const PASOS_TUTORIAL_PATRONES: PasoTour[] = [
  {
    objetivo: 'tour-pat-modelos',
    titulo: 'Filtra por modelo',
    texto: 'Elige un estándar como EARS, Sistemas Embebidos o Lenguaje Natural para ver únicamente las plantillas de ese modelo.',
  },
  {
    objetivo: 'tour-pat-buscar',
    titulo: 'Busca por nombre o sintaxis',
    texto: 'Escribe palabras clave para localizar rápidamente el patrón que mejor se adapte al requerimiento que vas a redactar.',
  },
  {
    objetivo: 'tour-pat-nuevo',
    titulo: 'Agrega nuevos patrones',
    texto: 'Si necesitas una estructura personalizada para tu equipo o materia, puedes registrar un patrón nuevo desde aquí.',
  },
  {
    objetivo: 'tour-pat-lista',
    titulo: 'Usa o copia la sintaxis',
    texto: 'Cada tarjeta muestra la plantilla y sus palabras clave. Puedes copiar la sintaxis con un clic para usarla en tus requerimientos.',
  },
];

export const PASOS_TUTORIAL_PROYECTO: PasoTour[] = [
  {
    objetivo: 'tour-req-tabs',
    titulo: 'Secciones del proyecto',
    texto: 'Alterna entre los Requerimientos del sistema, los Equipos asignados y el Contexto que usa la IA como referencia.',
  },
  {
    objetivo: 'tour-req-exportar',
    titulo: 'Exporta tu especificación',
    texto: 'Descarga los requerimientos del proyecto en PDF, Markdown o Word cuando necesites entregar o compartir el documento.',
  },
  {
    objetivo: 'tour-req-nuevo',
    titulo: 'Crea requerimientos con o sin IA',
    texto: 'Abre el formulario para redactar un requerimiento individual o generar varios a la vez siguiendo el patrón que elijas.',
  },
];
