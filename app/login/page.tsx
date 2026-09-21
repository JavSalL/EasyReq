'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getProfesiones, saveUserProfile, getUserProfile } from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';
import { toast } from 'react-hot-toast';
import { Lock, Mail, User, Briefcase, ArrowRight, Sparkles, CheckCircle2, Check, Eye, EyeOff } from 'lucide-react';
import { Profesion } from '@/lib/database.types';

// Mensaje para API key inválida. El env NEXT_PUBLIC_* se congela en build,
// por eso tras corregir .env.local hay que reiniciar `npm run dev` y
// reconstruir (`npm run build`) el export en `out/`.
const FIREBASE_API_KEY_ERROR_MSG =
  'Configuración Firebase inválida. Verifica NEXT_PUBLIC_FIREBASE_API_KEY y reinicia npm run dev';

// Extrae `code`/`message` de errores de Firebase sin usar `any`.
function getFirebaseErrorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code: unknown = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : '';
  }
  return '';
}

function getFirebaseErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message: unknown = (err as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
}

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
    // Si ya hay sesión activa, redirigir al dashboard
    if (!authLoading && authUser) {
      router.replace('/');
    }

    // Cargar catálogo de profesiones
    async function fetchProfesiones() {
      const data = await getProfesiones();
      if (data && data.length > 0) {
        setProfesiones(data);
      } else {
        // Fallback: antes de que exista el primer usuario autenticado, las reglas
        // de Firestore bloquean tanto la lectura como la siembra automática del catálogo.
        setProfesiones([
          { id: '1', nombre: 'Ingeniero de Software' },
          { id: '2', nombre: 'Analista de Requerimientos' },
          { id: '3', nombre: 'Diseñador UX/UI' },
          { id: '4', nombre: 'Especialista QA / Testing' },
          { id: '5', nombre: 'Scrum Master / Agile Coach' },
          { id: '6', nombre: 'DevOps Engineer' },
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

        // 1. Registro en Firebase Auth
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: nombre.trim() });

        // 2. Crear perfil en Firestore, incluyendo la profesión seleccionada
        const profesionSeleccionada = profesiones.find((p) => p.id === idProfesion);
        await saveUserProfile(credential.user.uid, {
          nombre: nombre.trim(),
          correo: email.trim(),
          id_profesion: idProfesion,
          profesion_nombre: profesionSeleccionada?.nombre || undefined,
        });

        toast.success('¡Cuenta creada exitosamente!');
        window.location.href = '/';
      }
    } catch (err: unknown) {
      const code = getFirebaseErrorCode(err);
      let msg = 'Ocurrió un error al procesar la solicitud';
      if (code === 'auth/api-key-not-valid' || code === 'auth/invalid-api-key') {
        msg = FIREBASE_API_KEY_ERROR_MSG;
      } else if (code === 'auth/too-many-requests') {
        msg = 'Límite de solicitudes superado. Por favor espera unos minutos.';
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        msg = 'Correo electrónico o contraseña incorrectos.';
      } else if (code === 'auth/email-already-in-use') {
        msg = 'Este correo ya está registrado. Por favor inicia sesión.';
      } else if (code === 'auth/invalid-email') {
        msg = 'El formato del correo no es válido (ej. usuario@correo.com).';
      } else if (code === 'auth/weak-password') {
        msg = 'La contraseña debe tener al menos 6 caracteres.';
      } else {
        const fallback = getFirebaseErrorMessage(err);
        if (fallback) {
          msg = fallback;
        }
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

      const existing = await getUserProfile(user.uid);
      if (!existing) {
        await saveUserProfile(user.uid, {
          nombre: user.displayName || 'Usuario',
          correo: user.email || '',
        });
      }

      toast.success('¡Sesión iniciada con Google!');
      window.location.href = '/';
    } catch (err: unknown) {
      const code = getFirebaseErrorCode(err);
      if (code === 'auth/popup-closed-by-user') {
        // El usuario cerró el popup: no es un error a reportar.
      } else if (code === 'auth/api-key-not-valid' || code === 'auth/invalid-api-key') {
        toast.error(FIREBASE_API_KEY_ERROR_MSG);
      } else {
        toast.error('No se pudo iniciar sesión con Google.');
      }
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
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={isLogin ? 1 : 8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-10 py-2.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                  tabIndex={-1}
                  title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Checklist visual de requisitos de contraseña (Solo en Registro) */}
              {!isLogin && (
                <div className="mt-3 p-3 bg-zinc-50/80 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60 rounded-xl space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                        passMinLength
                          ? 'bg-emerald-500 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400'
                      }`}
                    >
                      <Check size={11} strokeWidth={3} />
                    </div>
                    <span
                      className={
                        passMinLength
                          ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }
                    >
                      Mínimo 8 caracteres
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                        passHasUpper
                          ? 'bg-emerald-500 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400'
                      }`}
                    >
                      <Check size={11} strokeWidth={3} />
                    </div>
                    <span
                      className={
                        passHasUpper
                          ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }
                    >
                      Al menos una letra mayúscula (A-Z)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                        passHasNumber
                          ? 'bg-emerald-500 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400'
                      }`}
                    >
                      <Check size={11} strokeWidth={3} />
                    </div>
                    <span
                      className={
                        passHasNumber
                          ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }
                    >
                      Al menos un número (0-9)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                        passHasSpecial
                          ? 'bg-emerald-500 text-white'
                          : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400'
                      }`}
                    >
                      <Check size={11} strokeWidth={3} />
                    </div>
                    <span
                      className={
                        passHasSpecial
                          ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                          : 'text-zinc-400 dark:text-zinc-500'
                      }
                    >
                      Carácter especial <span className="text-[10px] text-zinc-400">(opcional)</span>
                    </span>
                  </div>
                </div>
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

          {/* Separador */}
          <div className="relative flex items-center justify-center mt-5">
            <div className="border-t border-zinc-200 dark:border-zinc-800 w-full" />
            <span className="absolute bg-white dark:bg-zinc-900 px-3 text-[10px] text-zinc-400 uppercase tracking-widest font-medium">
              O continúa con
            </span>
          </div>

          {/* Google Login */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full mt-5 py-2.5 px-4 bg-white dark:bg-zinc-800/60 hover:bg-zinc-50 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Iniciar sesión con Google</span>
          </button>

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
