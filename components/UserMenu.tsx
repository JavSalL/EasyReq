'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/firebase-auth-provider';
import ThemeToggle from '@/components/ThemeToggle';

const itemMenu =
  'w-full flex items-center gap-3 px-3 min-h-10 pointer-coarse:min-h-11 rounded-ui text-sm font-medium text-ink-muted hover:bg-sunken hover:text-ink transition-colors cursor-pointer';

/** Menú de la cuenta: datos del usuario, cambio de tema y cierre de sesión. */
export default function UserMenu() {
  const { user, profile, logout } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', alPulsar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('mousedown', alPulsar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  const nombre = profile?.nombre || user?.displayName || user?.email?.split('@')[0] || 'Usuario';
  const iniciales = nombre.slice(0, 2).toUpperCase();

  const cerrarSesion = async () => {
    try {
      await logout();
      toast.success('Sesión finalizada');
      window.location.href = '/login/';
    } catch {
      toast.error('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    }
  };

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label="Menú de la cuenta"
        className="flex items-center gap-2 rounded-ui pl-1 pr-2 min-h-10 pointer-coarse:min-h-11 hover:bg-sunken transition-colors cursor-pointer"
      >
        <span className="size-8 rounded-full border border-brand-line bg-brand-subtle text-brand-text flex items-center justify-center text-xs font-semibold">
          {iniciales}
        </span>
        <ChevronDown size={16} aria-hidden className={`text-ink-subtle transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 z-50 w-64 bg-surface border border-line-strong rounded-ui p-1 animate-in fade-in"
        >
          <div className="px-3 py-3 border-b border-line mb-1">
            <p className="text-sm font-semibold text-ink truncate">{nombre}</p>
          </div>
          <ThemeToggle conEtiqueta className={itemMenu} />
          <button type="button" role="menuitem" onClick={cerrarSesion} className={`${itemMenu} hover:text-danger`}>
            <LogOut size={18} aria-hidden />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
