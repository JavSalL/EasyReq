'use client';

import { useEffect } from 'react';
import { leerTema, suscribirTema } from '@/lib/theme';

const COLOR_TEMA_CLARO = '#ffffff';
const COLOR_TEMA_OSCURO = '#121217';

export default function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Registrar Service Worker para instalabilidad PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          console.warn('No se pudo registrar el Service Worker:', err);
        });
    }

    // 2. Sincronizar el color de la barra de título (theme-color) con el tema activo
    const sincronizarMetaThemeColor = () => {
      const color = leerTema() === 'dark' ? COLOR_TEMA_OSCURO : COLOR_TEMA_CLARO;
      const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
      if (metas.length === 0) {
        const meta = document.createElement('meta');
        meta.name = 'theme-color';
        meta.content = color;
        document.head.appendChild(meta);
      } else {
        metas.forEach((meta) => {
          meta.removeAttribute('media');
          meta.content = color;
        });
      }
    };

    sincronizarMetaThemeColor();
    return suscribirTema(sincronizarMetaThemeColor);
  }, []);

  return null;
}
