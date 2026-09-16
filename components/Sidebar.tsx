'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderGit2, Users, BookOpen, HelpCircle, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/firebase-auth-provider';
import { toast } from 'react-hot-toast';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
  const pathname = usePathname();
  const { user, profile, logout } = useAuth();

  const handleSignOut = async () => {
    try {
      await logout();
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

  const displayName = profile?.nombre || user?.displayName || user?.email?.split('@')[0] || 'Usuario';
  const displaySubtitle = (profile as any)?.profesion_nombre || profile?.correo || user?.email || 'Miembro';
  const initials = displayName.slice(0, 2).toUpperCase();

  const sidebarContent = (
    <aside className={`
      fixed top-0 bottom-0 left-0 z-50 w-64 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border-r border-zinc-200/80 dark:border-zinc-800/80 flex flex-col transition-transform duration-300 ease-in-out
      lg:translate-x-0 ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
    `}>
      {/* Sidebar Header */}
      <div className="p-4 border-b border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center font-bold text-xs tracking-wider shadow-sm">
            ER
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm tracking-tight text-zinc-900 dark:text-zinc-100 leading-none">EasyReq</span>
            <span className="text-[10px] text-zinc-500 font-mono mt-0.5">Gestión v2</span>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            <LogOut size={16} className="rotate-180" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <div className="p-3 flex-1 overflow-y-auto space-y-1">
        <div className="px-2 py-2 text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
          Plataforma
        </div>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const cleanPath = pathname ? (pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname) : '';
          const isActive = cleanPath === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-150 group ${
                isActive
                  ? 'bg-zinc-900/5 dark:bg-zinc-100/10 text-zinc-900 dark:text-zinc-100 font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Icon size={16} className={isActive ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'} />
                <span>{item.name}</span>
              </div>
              {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />}
            </Link>
          );
        })}
      </div>

      {/* User Footer */}
      <div className="p-3 border-t border-zinc-200/60 dark:border-zinc-800/60">
        <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 rounded-xl p-2.5 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-7 h-7 shrink-0 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center text-[11px] font-bold uppercase">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100 leading-tight truncate">
                {displayName}
              </span>
              <span className="text-[10px] text-zinc-500 truncate">
                {displaySubtitle}
              </span>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            title="Cerrar sesión"
            className="p-1.5 shrink-0 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );

  return sidebarContent;
};

export default Sidebar;
