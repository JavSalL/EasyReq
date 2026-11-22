'use client';

import type { PasoTour } from '@/components/ui/TourGuiado';
import { useTutorialSeccion } from '@/components/ui/TourGuiado';

/**
 * Pasos de la guía de bienvenida en la pantalla principal (Proyectos). Cada `objetivo`
 * es el id de una sección en TopNav o app/page.tsx; los que no estén en pantalla
 * (p. ej. el primer proyecto cuando la cuenta es nueva) se saltan automáticamente.
 */
export const PASOS_TUTORIAL_BIENVENIDA: PasoTour[] = [
  {
    objetivo: 'tour-nav-principal',
    titulo: 'Bienvenido a EasyReq',
    texto: 'Desde aquí navegas entre tus Proyectos, Equipos globales, Patrones y modelos de especificación y la sección de Ayuda.',
  },
  {
    objetivo: 'tour-nuevo-proyecto',
    titulo: 'Crea tu primer proyecto',
    texto: 'Un proyecto representa el sistema de software que vas a especificar. Pulsa aquí para registrar uno nuevo con su tipo de sistema y estado.',
  },
  {
    objetivo: 'tour-colaboraciones',
    titulo: 'Colaboraciones y campañas',
    texto: 'Si trabajas en proyectos vinculados a una materia, beca o campaña, aquí puedes agruparlos y administrarlos en conjunto.',
  },
  {
    objetivo: 'tour-lista-proyectos',
    titulo: 'Entra a tus requerimientos',
    texto: 'Haz clic en cualquier proyecto para abrir sus requerimientos, redactarlos con IA, asignar equipos y gestionar su aprobación.',
  },
  {
    objetivo: 'tour-invitaciones',
    titulo: 'Invitaciones y tu cuenta',
    texto: 'En la campana verás invitaciones a equipos o proyectos, y en tu menú puedes editar tu perfil o cambiar de tema. Puedes repetir esta guía con el botón (?).',
  },
];

/**
 * Controla la guía de bienvenida: solo se abre sola cuando `autoAbrir` es true
 * (cuenta nueva, sin proyectos previos, perfil completo y sin modales abiertos)
 * y siempre permite abrirla con el botón (?).
 */
export function useTutorialBienvenida(uid: string | null, autoAbrir: boolean) {
  return useTutorialSeccion('bienvenida', uid, autoAbrir);
}
