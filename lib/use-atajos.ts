'use client';

import { useEffect, useRef } from 'react';

/** ¿El foco está en un sitio donde se escribe? Ahí las letras son texto, no atajos. */
export function escribiendoEn(el: EventTarget | null): boolean {
  const nodo = el as HTMLElement | null;
  if (!nodo) return false;
  return nodo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(nodo.tagName) || nodo.getAttribute('role') === 'textbox';
}

/**
 * Atajos de una sola tecla para quien usa mucho la app. Las claves son `e.key`
 * en minúsculas ("a", "arrowright", "?"). No se disparan mientras se escribe,
 * con Ctrl/Cmd/Alt pulsado ni, salvo `dentroDeDialogo`, con una ventana abierta.
 * Dentro de un diálogo tampoco cuando hay otro encima (p. ej. una confirmación).
 */
export function useAtajos(
  atajos: Record<string, () => void>,
  { activo = true, dentroDeDialogo = false }: { activo?: boolean; dentroDeDialogo?: boolean } = {}
) {
  // Siempre la versión más reciente de las acciones, sin volver a suscribirse en cada render
  const ref = useRef(atajos);
  useEffect(() => {
    ref.current = atajos;
  });

  useEffect(() => {
    if (!activo) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (escribiendoEn(e.target)) return;
      const dialogos = document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length;
      if (dentroDeDialogo ? dialogos > 1 : dialogos > 0) return;
      const accion = ref.current[e.key.toLowerCase()];
      if (!accion) return;
      e.preventDefault();
      accion();
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [activo, dentroDeDialogo]);
}
