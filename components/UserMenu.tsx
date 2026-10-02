'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/firebase-auth-provider';
import { getProfesionesLabel } from '@/lib/firestore-service';
import ThemeToggle from '@/components/ThemeToggle';
import ProfileModal from '@/components/ProfileModal';

const itemMenu =
  'w-full flex items-center gap-3 px-3 min-h-10 pointer-coarse:min-h-11 rounded-ui text-sm font-medium text-ink-muted hover:bg-sunken hover:text-ink transition-colors cursor-pointer';

/** Menú de la cuenta: datos del usuario, edición de perfil, cambio de tema y cierre de sesión. */
export default function UserMenu() {
  const { user, profile, logout } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [modalPerfilAbierto, setModalPerfilAbierto] = useState(false);
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
  const sinProfesion = !profile?.ids_profesiones || profile.ids_profesiones.length === 0;
  const subtitulo = sinProfesion
    ? 'Completa tu perfil...'
    : getProfesionesLabel(profile, profile?.correo || user?.email || 'Miembro');
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
    <>
      <div ref={contenedor} className="relative">
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          aria-haspopup="menu"
          aria-label="Menú de la cuenta"
          className="flex items-center gap-2 rounded-ui pl-1 pr-2 min-h-10 pointer-coarse:min-h-11 hover:bg-sunken transition-colors cursor-pointer"
        >
          <span className="relative size-8 rounded-full border border-brand-line bg-brand-subtle text-brand-text flex items-center justify-center text-xs font-semibold">
            {iniciales}
            {sinProfesion && (
              <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-brand-text border-2 border-surface" title="Perfil incompleto" />
            )}
          </span>
          <ChevronDown size={16} aria-hidden className={`text-ink-subtle transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </button>

        {abierto && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-2 z-50 w-64 bg-surface border border-line-strong rounded-ui p-1 animate-in fade-in shadow-lg"
          >
            <div className="px-3 py-3 border-b border-line mb-1">
              <p className="text-sm font-semibold text-ink truncate">{nombre}</p>
              <p className={`text-xs truncate ${sinProfesion ? 'text-brand-text font-medium' : 'text-ink-subtle'}`}>
                {subtitulo}
              </p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                setModalPerfilAbierto(true);
              }}
              className={itemMenu}
            >
              <User size={18} aria-hidden />
              Configurar perfil
            </button>
            <ThemeToggle conEtiqueta className={itemMenu} />
            <button type="button" role="menuitem" onClick={cerrarSesion} className={`${itemMenu} hover:text-danger`}>
              <LogOut size={18} aria-hidden />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>

      {/* Modal de edición de perfil */}
      <ProfileModal
        open={modalPerfilAbierto}
        onClose={() => setModalPerfilAbierto(false)}
      />
    </>
  );
}

