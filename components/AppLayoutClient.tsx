'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { FirebaseAuthProvider, useAuth } from '@/lib/firebase-auth-provider';
import Sidebar from './Sidebar';

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

  // Cerrar menú móvil al cambiar de ruta
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Si estamos en la página de login, renderizamos a pantalla completa sin Sidebar
  if (isLoginPage) {
    return <main className="min-h-screen w-full">{children}</main>;
  }

  // Spinner mientras valida la sesión inicial
  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-zinc-500 font-medium tracking-wide">Cargando EasyReq...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Overlay backdrop para menú móvil */}
      {isMobileMenuOpen && (
        <div 
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden animate-in fade-in duration-200"
        />
      )}

      {/* Sidebar (Desktop + Mobile Drawer) */}
      <Sidebar 
        isOpen={isMobileMenuOpen} 
        onClose={() => setIsMobileMenuOpen(false)} 
      />

      {/* Top Header Bar (Solo pantallas pequeñas / móviles) */}
      <header className="lg:hidden sticky top-0 z-30 w-full bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:outline-none"
            aria-label="Abrir menú"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm">
              R
            </div>
            <span className="font-bold text-base tracking-tight">EasyReq</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 lg:ml-64 transition-all duration-300 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {children}
        </div>
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
      <LayoutContent>{children}</LayoutContent>
    </FirebaseAuthProvider>
  );
}
