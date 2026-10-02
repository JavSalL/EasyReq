'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { fijarTema, leerTema, suscribirTema, temaServidor } from '@/lib/theme';

interface ThemeToggleProps {
  className?: string;
  /** Muestra el texto "Modo oscuro / Modo claro" junto al icono */
  conEtiqueta?: boolean;
}

export default function ThemeToggle({ className = '', conEtiqueta = false }: ThemeToggleProps) {
  const tema = useSyncExternalStore(suscribirTema, leerTema, temaServidor);
  const esOscuro = tema === 'dark';
  const etiqueta = esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  const Icono = esOscuro ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={() => fijarTema(esOscuro ? 'light' : 'dark')}
      aria-label={etiqueta}
      title={etiqueta}
      className={className}
    >
      <Icono size={conEtiqueta ? 18 : 16} aria-hidden />
      {conEtiqueta && <span>{esOscuro ? 'Modo claro' : 'Modo oscuro'}</span>}
    </button>
  );
}
