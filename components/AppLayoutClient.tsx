'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FirebaseAuthProvider, useAuth } from '@/lib/firebase-auth-provider';
import TopNav from './TopNav';
import { ConfirmProvider } from './ui/ConfirmProvider';

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  // Con trailingSlash:true (exportación estática para Firebase Hosting) la ruta real
  // es "/login/", así que se normaliza quitando la barra final antes de comparar.
  const normalizedPath = pathname !== '/' ? pathname.replace(/\/+$/, '') : pathname;
  const isLoginPage = normalizedPath === '/login';

  useEffect(() => {
    if (loading) return;

    if (!user && !isLoginPage) {
      router.replace('/login/');
    } else if (user && isLoginPage) {
      router.replace('/');
    }
  }, [user, loading, isLoginPage, router]);

  // Atajo "/": lleva el cursor al buscador de la pantalla (si hay uno)
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      const buscador = document.querySelector<HTMLInputElement>('input[type="search"]');
      if (buscador) {
        e.preventDefault();
        buscador.focus();
        buscador.select();
      }
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, []);

  // Si estamos en la página de login, renderizamos a pantalla completa sin barra de navegación
  if (isLoginPage) {
    return <main className="min-h-dvh w-full">{children}</main>;
  }

  // Spinner mientras valida la sesión inicial. Sin usuario tampoco se renderiza
  // la página: sus consultas a Firestore fallarían por permisos antes de que
  // el efecto de arriba redirija a /login.
  if (loading || !user) {
    return (
      <div className="min-h-dvh w-full flex items-center justify-center bg-canvas">
        <div role="status" className="flex flex-col items-center gap-3">
          <div className="size-8 border-2 border-brand-solid border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-ink-subtle font-medium">Cargando EasyReq...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-ui focus:bg-brand-solid focus:text-on-solid focus:text-sm focus:font-semibold"
      >
        Saltar al contenido
      </a>

      <TopNav />

      <main id="contenido" tabIndex={-1} className="outline-none">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">{children}</div>
      </main>
    </div>
  );
}

export default function AppLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FirebaseAuthProvider>
      <ConfirmProvider>
        <LayoutContent>{children}</LayoutContent>
      </ConfirmProvider>
    </FirebaseAuthProvider>
  );
}
