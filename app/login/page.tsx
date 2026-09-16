'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getProfesiones, saveUserProfile, getUserProfile } from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';
import { toast } from 'react-hot-toast';
import { Lock, Mail, User, Briefcase, ArrowRight, Sparkles, CheckCircle2, Check, Eye, EyeOff } from 'lucide-react';
import { Profesion } from '@/lib/database.types';

export default function LoginPage() {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [profesiones, setProfesiones] = useState<Profesion[]>([]);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [idProfesion, setIdProfesion] = useState('');

  // Password validation rules
  const passMinLength = password.length >= 8;
  const passHasUpper = /[A-Z]/.test(password);
  const passHasNumber = /[0-9]/.test(password);
  const passHasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  const isPasswordValid = passMinLength && passHasUpper && passHasNumber;

  useEffect(() => {
    if (!authLoading && authUser) {
      router.replace('/');
    }

    async function fetchProfesiones() {
      const data = await getProfesiones();
      if (data && data.length > 0) {
        setProfesiones(data);
      } else {
        // Fallback inmediato si aún no han sincronizado
        setProfesiones([
          { id: '1', nombre: 'Ingeniero de Software' },
          { id: '2', nombre: 'Analista de Requerimientos' },
          { id: '3', nombre: 'Diseñador UX/UI' },
          { id: '4', nombre: 'Especialista QA / Testing' },
          { id: '5', nombre: 'Scrum Master / Agile Coach' },
          { id: '6', nombre: 'DevOps Engineer' }
        ]);
      }
    }
    fetchProfesiones();
  }, [authUser, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        // ------------------ INICIAR SESIÓN ------------------
        await signInWithEmailAndPassword(auth, email.trim(), password);
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

        // Validación estricta de contraseña en registro
        if (!passMinLength) {
          toast.error('La contraseña debe tener al menos 8 caracteres');
          setLoading(false);
          return;
        }

        if (!passHasUpper) {
          toast.error('La contraseña debe incluir al menos una letra mayúscula');
          setLoading(false);
          return;
        }

        if (!passHasNumber) {
          toast.error('La contraseña debe incluir al menos un número');
          setLoading(false);
          return;
        }

        // 1. Crear usuario en Firebase Auth
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        
        // 2. Actualizar displayName en Firebase Auth
        await updateProfile(cred.user, {
          displayName: nombre.trim()
        });

        // 3. Obtener nombre de la profesión
        const selectedProf = profesiones.find(p => p.id === idProfesion);

        // 4. Guardar documento de perfil en Firestore
        await saveUserProfile(cred.user.uid, {
          nombre: nombre.trim(),
          correo: email.trim(),
          id_profesion: idProfesion,
          profesion_nombre: selectedProf?.nombre || 'Ingeniero de Software'
        });

        toast.success('¡Cuenta creada exitosamente!');
        window.location.href = '/';
      }
    } catch (err: any) {
      let msg = err.message || 'Ocurrió un error al procesar la solicitud';
      const code = err.code || '';

      if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        msg = 'Correo electrónico o contraseña incorrectos.';
      } else if (code === 'auth/email-already-in-use') {
        msg = 'Este correo ya está registrado. Por favor inicia sesión.';
      } else if (code === 'auth/invalid-email') {
        msg = 'El formato del correo no es válido (ej. usuario@correo.com).';
      } else if (code === 'auth/weak-password') {
        msg = 'La contraseña debe tener al menos 6 caracteres.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'Demasiados intentos fallidos. Por favor espera unos momentos.';
      }

      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, provider);
      const user = res.user;

      // Verificar si ya tiene perfil en Firestore
      const existing = await getUserProfile(user.uid);
      if (!existing) {
        await saveUserProfile(user.uid, {
          nombre: user.displayName || 'Usuario',
          correo: user.email || '',
          profesion_nombre: 'Miembro'
        });
      }

      toast.success('¡Sesión iniciada con Google!');
      window.location.href = '/';
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        toast.error('No se pudo iniciar sesión con Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-zinc-950 text-zinc-100 selection:bg-blue-600 selection:text-white font-sans">
      {/* Columna Izquierda: Visual / Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 bg-linear-to-br from-zinc-900 via-zinc-950 to-zinc-900 border-r border-zinc-800/80 overflow-hidden">
        {/* Efectos de fondo sutiles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-24 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Logo / Header */}
        <div className="relative z-10 flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-blue-600/20">
            ER
          </div>
          <span className="font-bold text-xl tracking-tight text-white">EasyReq</span>
        </div>

        {/* Mensaje Principal */}
        <div className="relative z-10 space-y-6 max-w-lg">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
            <Sparkles size={14} />
            <span>Sistema Integral de Gestión de Requisitos</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white leading-tight">
            Centraliza proyectos, equipos y especificaciones de software en un solo lugar.
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Plataforma colaborativa para el levantamiento estructurado de requerimientos, soporte a modelos EARS e IEEE 830, y trazabilidad total con Firebase.
          </p>

          <div className="pt-4 grid grid-cols-2 gap-4 text-xs text-zinc-400">
            <div className="flex items-center space-x-2">
              <CheckCircle2 size={16} className="text-blue-500" />
              <span>Plantillas automáticas EARS</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle2 size={16} className="text-blue-500" />
              <span>Control de aprobaciones y logs</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle2 size={16} className="text-blue-500" />
              <span>Soporte para múltiples roles</span>
            </div>
            <div className="flex items-center space-x-2">
              <CheckCircle2 size={16} className="text-blue-500" />
              <span>Alta disponibilidad con Firebase</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-xs text-zinc-600 font-mono">
          EasyReq © {new Date().getFullYear()} — Plataforma Profesional de Requerimientos
        </div>
      </div>

      {/* Columna Derecha: Formulario */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          {/* Cabecera del form */}
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              {isLogin ? 'Iniciar Sesión' : 'Crear Cuenta en EasyReq'}
            </h2>
            <p className="text-xs text-zinc-400">
              {isLogin
                ? 'Ingresa tus credenciales para acceder a la plataforma'
                : 'Completa los datos para darte de alta y unirte a tus equipos'}
            </p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                {/* Nombre Completo */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Nombre completo <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <User size={16} />
                    </div>
                    <input
                      type="text"
                      required={!isLogin}
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Ej. Juan Pérez García"
                      className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>

                {/* Profesión */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Profesión / Especialidad <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                      <Briefcase size={16} />
                    </div>
                    <select
                      required={!isLogin}
                      value={idProfesion}
                      onChange={(e) => setIdProfesion(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all appearance-none cursor-pointer"
                    >
                      <option value="" disabled className="bg-zinc-900 text-zinc-500">
                        Selecciona tu profesión
                      </option>
                      {profesiones.map((prof) => (
                        <option key={prof.id} value={prof.id} className="bg-zinc-900 text-white">
                          {prof.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Correo Electrónico */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">
                Correo electrónico <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@organizacion.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            {/* Contraseña */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">
                  Contraseña <span className="text-rose-500">*</span>
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
                  <Lock size={16} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Reglas de contraseña (solo en registro) */}
              {!isLogin && password.length > 0 && (
                <div className="pt-2 space-y-1.5 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/60 text-[11px]">
                  <span className="text-zinc-400 font-medium block mb-1">Requisitos de contraseña:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className={`flex items-center space-x-1.5 ${passMinLength ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      <Check size={12} className={passMinLength ? 'stroke-[3]' : 'opacity-40'} />
                      <span>8+ caracteres</span>
                    </div>
                    <div className={`flex items-center space-x-1.5 ${passHasUpper ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      <Check size={12} className={passHasUpper ? 'stroke-[3]' : 'opacity-40'} />
                      <span>Una mayúscula</span>
                    </div>
                    <div className={`flex items-center space-x-1.5 ${passHasNumber ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      <Check size={12} className={passHasNumber ? 'stroke-[3]' : 'opacity-40'} />
                      <span>Un número</span>
                    </div>
                    <div className={`flex items-center space-x-1.5 ${passHasSpecial ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      <Check size={12} className={passHasSpecial ? 'stroke-[3]' : 'opacity-40'} />
                      <span>Símbolo especial</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Botón Submit */}
            <button
              type="submit"
              disabled={loading || (!isLogin && !isPasswordValid)}
              className="w-full mt-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isLogin ? 'Ingresar a la plataforma' : 'Crear mi cuenta'}</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>

          {/* Separador */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-zinc-800 w-full" />
            <span className="bg-zinc-950 px-3 text-[11px] text-zinc-500 uppercase tracking-widest font-mono">
              O continúa con
            </span>
            <div className="border-t border-zinc-800 w-full" />
          </div>

          {/* Google Login */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-xs font-medium text-white flex items-center justify-center space-x-3 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Iniciar con Google</span>
          </button>

          {/* Toggle Login / Registro */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setPassword('');
              }}
              className="text-xs text-zinc-400 hover:text-white transition-colors"
            >
              {isLogin ? (
                <>
                  ¿No tienes cuenta?{' '}
                  <span className="text-blue-400 font-semibold underline underline-offset-4">
                    Regístrate aquí
                  </span>
                </>
              ) : (
                <>
                  ¿Ya tienes cuenta?{' '}
                  <span className="text-blue-400 font-semibold underline underline-offset-4">
                    Inicia sesión
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
