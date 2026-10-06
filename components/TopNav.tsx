'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UserMenu from '@/components/UserMenu';
import InvitacionesBell from '@/components/InvitacionesBell';
import Logo from '@/components/Logo';

const enlaces = [
  // `rutas`: pantallas que marcan activa la opción (p. ej. los requerimientos
  // son una subpantalla de Proyectos)
  { nombre: 'Proyectos', href: '/', rutas: ['/', '/requerimientos'] },
  { nombre: 'Patrones y Modelos', href: '/patrones/', rutas: ['/patrones'] },
  { nombre: 'Ayuda', href: '/ayuda/', rutas: ['/ayuda'] },
];

/**
 * Barra superior: marca, navegación y menú de la cuenta. En pantallas
 * estrechas la navegación baja a una segunda fila con desplazamiento
 * horizontal, así siempre se ve en qué sección se está (sin hamburguesa).
 */
export default function TopNav() {
  const pathname = usePathname();
  const ruta = pathname && pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname || '/';

  const lista = (
    <ul className="flex items-stretch gap-1 h-full">
      {enlaces.map((e) => {
        const activo = e.rutas.includes(ruta);
        return (
          <li key={e.nombre} className="flex">
            <Link
              href={e.href}
              aria-current={activo ? 'page' : undefined}
              className={`relative inline-flex items-center px-3 text-sm whitespace-nowrap transition-colors ${
                activo ? 'text-ink font-semibold' : 'text-ink-muted font-medium hover:text-ink'
              }`}
            >
              {e.nombre}
              {activo && <span aria-hidden className="absolute left-3 right-3 -bottom-px h-0.5 bg-brand-text" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <header className="sticky top-0 z-40 bg-surface border-b border-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
        <Link href="/" aria-label="EasyReq, ir a Proyectos" className="flex items-center gap-3 shrink-0 rounded-ui text-ink">
          <Logo variante="marca" className="h-8 w-auto" />
          <Logo variante="nombre" className="h-5 w-auto" />
        </Link>
        <nav aria-label="Navegación principal" className="hidden md:block h-full">
          {lista}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <InvitacionesBell />
          <UserMenu />
        </div>
      </div>
      <nav aria-label="Navegación principal" className="md:hidden border-t border-line overflow-x-auto custom-scrollbar">
        <div className="px-3 h-11 min-w-max">{lista}</div>
      </nav>
    </header>
  );
}
