import React from 'react';
import { LOGO_MARCA, LOGO_NOMBRE, LOGO_TOTAL } from '@/lib/logo-paths';

type Variante = 'marca' | 'nombre' | 'completo';

interface LogoProps {
  /** `marca`: la R con la palomita. `nombre`: el texto "EasyReq". `completo`: marca sobre nombre. */
  variante?: Variante;
  className?: string;
}

/**
 * Logo de EasyReq como SVG en línea. Usa `currentColor`, así que toma el color
 * del texto (negro en claro, blanco en oscuro). El tamaño se controla con la
 * altura, p. ej. `className="h-8 w-auto"`. Es decorativo: el nombre accesible
 * lo pone el elemento que lo contiene.
 */
export default function Logo({ variante = 'completo', className }: LogoProps) {
  if (variante === 'marca') {
    return (
      <svg viewBox={`0 0 ${LOGO_MARCA.ancho} ${LOGO_MARCA.alto}`} className={className} aria-hidden focusable="false">
        <path fill="currentColor" fillRule="evenodd" d={LOGO_MARCA.d} />
      </svg>
    );
  }

  if (variante === 'nombre') {
    return (
      <svg viewBox={`0 0 ${LOGO_NOMBRE.ancho} ${LOGO_NOMBRE.alto}`} className={className} aria-hidden focusable="false">
        <path fill="currentColor" fillRule="evenodd" d={LOGO_NOMBRE.d} />
      </svg>
    );
  }

  return (
    <svg viewBox={`0 0 ${LOGO_TOTAL.ancho} ${LOGO_TOTAL.alto}`} className={className} aria-hidden focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        transform={`translate(${LOGO_MARCA.x} ${LOGO_MARCA.y})`}
        d={LOGO_MARCA.d}
      />
      <path
        fill="currentColor"
        fillRule="evenodd"
        transform={`translate(${LOGO_NOMBRE.x} ${LOGO_NOMBRE.y})`}
        d={LOGO_NOMBRE.d}
      />
    </svg>
  );
}
