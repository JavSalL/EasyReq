'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PasoTour } from '@/components/ui/TourGuiado';

// Se guarda en el navegador: la guía sale sola solo la primera vez
const CLAVE_VISTO = 'easyreq:tutorial-crear-req:visto';

/**
 * Pasos de la guía del formulario "Nuevo requerimiento". Cada `objetivo` es el id
 * de una sección del formulario en app/requerimientos/page.tsx; los que no estén
 * en pantalla (p. ej. el enunciado en modo "Varios requerimientos") se saltan.
 */
export const PASOS_TUTORIAL_CREAR: PasoTour[] = [
  {
    objetivo: 'tour-clasificacion',
    titulo: 'Primero, clasifícalo',
    texto: 'Elige el tipo de requerimiento y, si quieres, un modelo y un patrón. El patrón es una plantilla con la estructura que debe seguir el enunciado. Todo es opcional.',
  },
  {
    objetivo: 'tour-ia',
    titulo: 'Genera con IA',
    texto: 'Describe en pocas palabras lo que necesitas y pulsa Generar (o Enter). La IA redacta el enunciado respetando el tipo y el patrón que elegiste.',
  },
  {
    objetivo: 'tour-ia-opciones',
    titulo: 'Ajusta la generación',
    texto: 'La estrictez decide cuánto se apega la IA a lo que escribiste. Con «Varios requerimientos» puedes pedir un módulo entero de una vez. Si no sabes qué elegir, déjalo como está.',
  },
  {
    objetivo: 'tour-ejemplos',
    titulo: 'Ejemplos (opcional)',
    texto: 'Si tienes requerimientos que te gusten, agrégalos aquí y la IA imitará su estilo. Puedes saltarte esta parte.',
  },
  {
    objetivo: 'seccion-enunciado',
    titulo: 'El enunciado',
    texto: 'Aquí queda el texto final del requerimiento. Puedes escribirlo a mano o editar lo que generó la IA. Es el único campo obligatorio.',
  },
  {
    objetivo: 'tour-equipo',
    titulo: 'Equipo responsable',
    texto: 'El líder del equipo que elijas es quien aprueba el requerimiento. Ojo: el equipo no se puede cambiar después.',
  },
  {
    objetivo: 'tour-modulo',
    titulo: 'Módulo y prioridad',
    texto: 'Sirven para ordenar y filtrar la lista. Si no lo tienes claro, puedes completarlos más tarde.',
  },
  {
    objetivo: 'tour-guardar',
    titulo: '¡Listo para registrar!',
    texto: 'Cuando el enunciado esté bien, regístralo. Si te pierdes, pulsa el botón (?) junto al título para ver esta guía otra vez.',
  },
];

function yaVisto() {
  try {
    return window.localStorage.getItem(CLAVE_VISTO) === '1';
  } catch {
    return true; // Sin almacenamiento, mejor no insistir cada vez
  }
}

/**
 * Controla la guía: la abre sola la primera vez que `formularioAbierto` pasa a true
 * y ofrece `abrir` para el botón (?). Al cerrarla queda marcada como vista.
 */
export function useTutorialCrear(formularioAbierto: boolean) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!formularioAbierto || yaVisto()) return;
    // Espera a que termine la animación de entrada del modal para medir bien
    const t = window.setTimeout(() => setAbierto(true), 400);
    return () => window.clearTimeout(t);
  }, [formularioAbierto]);

  const abrir = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => {
    setAbierto(false);
    try {
      window.localStorage.setItem(CLAVE_VISTO, '1');
    } catch {
      // Sin almacenamiento: la guía podrá volver a salir sola
    }
  }, []);

  // Si se cierra el formulario a mitad de la guía, la guía se oculta con él
  return { abierto: abierto && formularioAbierto, abrir, cerrar };
}
