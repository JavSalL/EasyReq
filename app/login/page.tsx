'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase-client';
import { toast } from 'react-hot-toast';
import { Lock, Mail, User, Briefcase, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { Profesion } from '@/lib/database.types';

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [profesiones, setProfesiones] = useState<Profesion[]>([]);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [idProfesion, setIdProfesion] = useState('');

  useEffect(() => {
    // Si ya hay sesión activa, redirigir al dashboard
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/');
      }
    }
    checkSession();

    // Cargar catálogo de profesiones
    async function fetchProfesiones() {
      const { data, error } = await supabase
        .from('profesiones')
        .select('id, nombre')
        .order('nombre');

      if (!error && data) {
        setProfesiones(data);
      }
    }
    fetchProfesiones();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        // ------------------ INICIAR SESIÓN ------------------
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        toast.success('¡Bienvenido de nuevo!');
        window.location.href = '/';
      } else {
        // ------------------ REGISTRO ------------------
        if (!nombre.trim()) {
          toast.error('Por favor ingresa tu nombre completo');
          setLoading(false);
          return;
        }

        if (!idProfesion) {
          toast.error('Por favor selecciona tu profesión');
          setLoading(false);
          return;
        }

        // 1. Registro en Supabase Auth pasando nombre en metadata para el trigger
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              nombre: nombre.trim(),
            },
          },
        });

        if (authError) throw authError;

        const userId = authData.user?.id;

        if (userId) {
          // 2. Asegurar inserción/actualización en perfil_usuario
          await supabase
            .from('perfil_usuario')
            .upsert({
              id: userId,
              nombre: nombre.trim(),
              correo: email.trim(),
            });

          // 3. Vincular profesión seleccionada en la tabla usuario_profesion
          const { error: profError } = await supabase
            .from('usuario_profesion')
            .upsert({
              id_usuario: userId,
              id_profesion: idProfesion,
            });

          if (profError) {
            console.error('Error al asociar profesión:', profError);
          }
        }

        toast.success('¡Cuenta creada exitosamente!');
        window.location.href = '/';
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Ocurrió un error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-zinc-50 via-blue-50/30 to-zinc-100 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md">
        {/* Logo y Encabezado */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white font-bold text-2xl shadow-xl shadow-blue-500/25 mb-4">
            R
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            EasyReq
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
            Gestión inteligente de requerimientos y equipos de software
          </p>
        </div>

        {/* Tarjeta de Autenticación */}
        <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-zinc-900/5">
          {/* Tabs Selector */}
          <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-2xl mb-6">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all duration-200 ${
                isLogin
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all duration-200 ${
                !isLogin
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              Registrarse
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Campo Nombre (Solo en Registro) */}
            {!isLogin && (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Nombre Completo
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                    <User size={18} />
                  </div>
                  <input
                    type="text"
                    required={!isLogin}
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej. Ana María Gómez"
                    className="block w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>
            )}

            {/* Campo Profesión (Solo en Registro) */}
            {!isLogin && (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  Profesión / Especialidad
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                    <Briefcase size={18} />
                  </div>
                  <select
                    required={!isLogin}
                    value={idProfesion}
                    onChange={(e) => setIdProfesion(e.target.value)}
                    className="block w-full pl-10 pr-10 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  >
                    <option value="">Seleccionar profesión...</option>
                    {profesiones.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Campo Correo Electrónico */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <Mail size={18} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="block w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Campo Contraseña */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
                  <Lock size={18} />
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              {!isLogin && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                  Mínimo 6 caracteres
                </p>
              )}
            </div>

            {/* Botón Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 group cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isLogin ? 'Acceder al Sistema' : 'Crear Cuenta'}</span>
                  <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Footer de la tarjeta */}
          <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800 text-center">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {isLogin ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}{' '}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                {isLogin ? 'Regístrate aquí' : 'Inicia sesión'}
              </button>
            </p>
          </div>
        </div>

        {/* Info extra */}
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-zinc-400">
          <CheckCircle2 size={14} className="text-emerald-500" />
          <span>Acceso seguro con autenticación encriptada</span>
        </div>
      </div>
    </div>
  );
}
