'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FolderGit2, Users, BookOpen, HelpCircle, LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase-client';
import { toast } from 'react-hot-toast';

interface UserState {
  email?: string;
  name?: string;
  profession?: string;
}

const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserState | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Consultar perfil de usuario
          const { data: profile } = await supabase
            .from('perfil_usuario')
            .select('nombre, correo')
            .eq('id', user.id)
            .single();

          // Consultar profesión asignada
          const { data: profData } = await supabase
            .from('usuario_profesion')
            .select(`
              profesiones:profesiones(nombre)
            `)
            .eq('id_usuario', user.id)
            .maybeSingle();

          const profesionNombre = (profData as any)?.profesiones?.nombre || null;

          setCurrentUser({
            email: user.email,
            name: profile?.nombre || user.email?.split('@')[0] || 'Usuario',
            profession: profesionNombre || 'Sin profesión registrada'
          });
        }
      } catch (e) {
        // Manejo silencioso
      }
    }
    loadUser();
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast.success('Sesión finalizada');
      window.location.href = '/login';
    } catch (err: any) {
      toast.error('Error al cerrar sesión');
    }
  };

  const menuItems = [
    { name: 'Proyectos', href: '/', icon: FolderGit2 },
    { name: 'Equipos', href: '/equipos-global', icon: Users },
    { name: 'Patrones & Modelos', href: '/patrones', icon: BookOpen },
    { name: 'Ayuda', href: '#', icon: HelpCircle },
  ];

  return (
    <aside className="fixed left-0 top-0 h-screen w-[260px] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex flex-col z-50 transition-all duration-300">
      <div className="p-6">
        <div className="flex items-center space-x-3 mb-8">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/20">
            R
          </div>
          <span className="font-bold text-xl tracking-tight dark:text-white">EasyReq</span>
        </div>

        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium'
                    : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon size={20} className={isActive ? 'text-blue-600' : 'text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200'} />
                  <span>{item.name}</span>
                </div>
                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400 shadow-[0_0_8px_rgba(37,99,235,0.6)]" />}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-4 border-t border-zinc-100 dark:border-zinc-900">
        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-semibold uppercase">
              {currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : '?'}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold dark:text-white leading-tight truncate">
                {currentUser?.name || 'Usuario'}
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {currentUser?.profession || currentUser?.email || 'Puesto desconocido'}
              </span>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            title="Cerrar sesión"
            className="p-1.5 shrink-0 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

