'use client';

import { useEffect } from 'react';

/** Título de la pestaña del navegador para la pantalla actual. */
export function usePageTitle(titulo: string | null | undefined) {
  useEffect(() => {
    document.title = titulo ? `${titulo} | EasyReq` : 'EasyReq';
  }, [titulo]);
}
