'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { supabase } from '@/lib/supabase-client';

export default function AppLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    // Comprobar sesión de usuario
    async function verifyAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session && !isLoginPage) {
        router.replace('/login');
      } else if (session && isLoginPage) {
        router.replace('/');
      }
      setLoading(false);
    }

    verifyAuth();

    // Escuchar cambios en la autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session && !isLoginPage) {
        router.replace('/login');
      } else if (session && isLoginPage) {
        router.replace('/');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [pathname, isLoginPage, router]);

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
          <span className="text-sm text-zinc-500 font-medium">Cargando EasyReq...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 ml-[260px] min-h-screen">
        <div className="max-w-7xl mx-auto py-8 px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
