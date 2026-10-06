'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  sendPasswordResetEmail,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getProfesiones, saveUserProfile } from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';
import { toast } from 'react-hot-toast';
import { Lock, Mail, User, ArrowRight, CheckCircle2, Check, Eye, EyeOff } from 'lucide-react';
import { Profesion } from '@/lib/database.types';
import ThemeToggle from '@/components/ThemeToggle';
import Logo from '@/components/Logo';
import SelectorProfesiones from '@/components/SelectorProfesiones';
import { btnIcono } from '@/components/ui/estilos';

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
  const [idsProfesiones, setIdsProfesiones] = useState<string[]>([]);

  // Password validation rules
  const passMinLength = password.length >= 8;
  const passHasUpper = /[A-Z]/.test(password);
  const passHasNumber = /[0-9]/.test(password);
  const passHasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  useEffect(() => {
    // Si ya hay sesión activa, ir al dashboard (si falta el registro, la app lo pide al entrar)
    if (!authLoading && authUser) {
      router.replace('/');
    }
  }, [authUser, authLoading, router]);

  useEffect(() => {
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
  }, []);

  const [enviandoReset, setEnviandoReset] = useState(false);
  const handleResetPassword = async () => {
    const correo = email.trim();
    if (!correo) {
      toast.error('Escribe tu correo arriba para enviarte el enlace de recuperación');
      return;
    }
    setEnviandoReset(true);
    try {
      await sendPasswordResetEmail(auth, correo);
      toast.success('Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña.');
    } catch (err: unknown) {
      const code = getFirebaseErrorCode(err);
      if (code === 'auth/invalid-email') {
        toast.error('El formato del correo no es válido (ej. usuario@correo.com).');
      } else if (code === 'auth/too-many-requests') {
        toast.error('Límite de solicitudes superado. Por favor espera unos minutos.');
      } else {
        // No se revela si el correo existe o no
        toast.success('Si existe una cuenta con ese correo, te enviamos un enlace para restablecer la contraseña.');
      }
    } finally {
      setEnviandoReset(false);
    }
  };

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

        if (idsProfesiones.length === 0) {
          toast.error('Por favor selecciona al menos una profesión');
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

        // 2. Crear perfil en Firestore con una o más profesiones
        const profesionesSeleccionadas = profesiones.filter((p) => idsProfesiones.includes(p.id));
        await saveUserProfile(credential.user.uid, {
          nombre: nombre.trim(),
          correo: email.trim(),
          ids_profesiones: profesionesSeleccionadas.map((p) => p.id),
          profesiones_nombres: profesionesSeleccionadas.map((p) => p.nombre),
          profesiones: profesionesSeleccionadas,
          // Compat legacy: primera profesión como campo singular
          id_profesion: profesionesSeleccionadas[0]?.id,
          profesion_nombre: profesionesSeleccionadas[0]?.nombre || undefined,
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
      await signInWithPopup(auth, new GoogleAuthProvider());
      // Una cuenta nueva (o sin profesiones) pasa por el paso de registro al entrar a la app,
      // con los mismos datos que el registro normal.
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
    <div className="relative min-h-dvh w-full flex items-center justify-center bg-canvas p-4 sm:p-6 lg:p-8">
      <ThemeToggle className={`absolute top-4 right-4 ${btnIcono}`} />
      <div className="w-full max-w-md">
        {/* Logo y Encabezado */}
        <div className="text-center mb-8">
          <h1 className="flex justify-center">
            <span className="sr-only">EasyReq</span>
            <Logo variante="completo" className="h-36 w-auto text-ink" />
          </h1>
          <p className="text-sm text-ink-subtle mt-4">
            Gestión inteligente de requerimientos y equipos de software
          </p>
        </div>

        {/* Tarjeta de Autenticación */}
        <div className="bg-surface border border-line rounded-ui p-6 sm:p-8 shadow-sm">
              {/* Tabs Selector */}
              <div className="flex p-1 bg-sunken rounded-ui mb-6">
                <button
                  type="button"
                  onClick={() => setIsLogin(true)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-ui transition-all duration-200 ${
                    isLogin
                      ? 'bg-surface text-brand-text'
                      : 'text-ink-subtle hover:text-ink'
                  }`}
                >
                  Iniciar Sesión
                </button>
                <button
                  type="button"
                  onClick={() => setIsLogin(false)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-ui transition-all duration-200 ${
                    !isLogin
                      ? 'bg-surface text-brand-text'
                      : 'text-ink-subtle hover:text-ink'
                  }`}
                >
                  Registrarse
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Campo Nombre (Solo en Registro) */}
                {!isLogin && (
                  <div>
                    <label htmlFor="login-nombre" className="block text-sm font-medium text-ink mb-2">
                      Nombre Completo
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-ink-subtle">
                        <User size={18} />
                      </div>
                      <input
                        id="login-nombre"
                        type="text"
                        autoComplete="name"
                        required={!isLogin}
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Ej. Ana María Gómez"
                        className="block w-full pl-10 pr-4 py-2.5 bg-surface border border-line-strong rounded-ui text-base text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-text transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* Campo Profesiones (solo en registro) */}
                {!isLogin && (
                  <SelectorProfesiones
                    id="login-profesiones"
                    profesiones={profesiones}
                    valor={idsProfesiones}
                    onChange={setIdsProfesiones}
                  />
                )}

                {/* Campo Correo Electrónico */}
                <div>
                  <label htmlFor="login-correo" className="block text-sm font-medium text-ink mb-2">
                    Correo Electrónico
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-ink-subtle">
                      <Mail size={18} />
                    </div>
                    <input
                      id="login-correo"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      className="block w-full pl-10 pr-4 py-2.5 bg-surface border border-line-strong rounded-ui text-base text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-text transition-all"
                    />
                  </div>
                </div>

                {/* Campo Contraseña */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="login-contrasena" className="block text-sm font-medium text-ink">
                      Contraseña
                    </label>
                    {isLogin && (
                      <button
                        type="button"
                        onClick={handleResetPassword}
                        disabled={enviandoReset}
                        className="text-xs font-semibold text-brand-text hover:underline cursor-pointer disabled:opacity-50"
                      >
                        {enviandoReset ? 'Enviando...' : '¿Olvidaste tu contraseña?'}
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-ink-subtle">
                      <Lock size={18} />
                    </div>
                    <input
                      id="login-contrasena"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={isLogin ? 'current-password' : 'new-password'}
                      required
                      minLength={isLogin ? 1 : 8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="block w-full pl-10 pr-10 py-2.5 bg-surface border border-line-strong rounded-ui text-base text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-brand-text transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-ink-subtle hover:text-ink-muted cursor-pointer"
                      tabIndex={-1}
                      title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {/* Checklist visual de requisitos de contraseña (Solo en Registro) */}
                  {!isLogin && (
                    <div className="mt-3 p-3 bg-sunken border border-line rounded-ui space-y-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                            passMinLength
                              ? 'bg-success text-canvas'
                              : 'bg-sunken-strong text-ink-subtle'
                          }`}
                        >
                          <Check size={11} strokeWidth={3} />
                        </div>
                        <span
                          className={
                            passMinLength
                              ? 'text-success font-medium'
                              : 'text-ink-subtle'
                          }
                        >
                          Mínimo 8 caracteres
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                            passHasUpper
                              ? 'bg-success text-canvas'
                              : 'bg-sunken-strong text-ink-subtle'
                          }`}
                        >
                          <Check size={11} strokeWidth={3} />
                        </div>
                        <span
                          className={
                            passHasUpper
                              ? 'text-success font-medium'
                              : 'text-ink-subtle'
                          }
                        >
                          Al menos una letra mayúscula (A-Z)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                            passHasNumber
                              ? 'bg-success text-canvas'
                              : 'bg-sunken-strong text-ink-subtle'
                          }`}
                        >
                          <Check size={11} strokeWidth={3} />
                        </div>
                        <span
                          className={
                            passHasNumber
                              ? 'text-success font-medium'
                              : 'text-ink-subtle'
                          }
                        >
                          Al menos un número (0-9)
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div
                          className={`w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
                            passHasSpecial
                              ? 'bg-success text-canvas'
                              : 'bg-sunken-strong text-ink-subtle'
                          }`}
                        >
                          <Check size={11} strokeWidth={3} />
                        </div>
                        <span
                          className={
                            passHasSpecial
                              ? 'text-success font-medium'
                              : 'text-ink-subtle'
                          }
                        >
                          Carácter especial <span className="text-xs text-ink-subtle">(opcional)</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Botón Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 px-4 bg-brand-solid hover:bg-brand-solid-hover disabled:opacity-50 text-on-solid rounded-ui font-semibold text-sm transition-all flex items-center justify-center gap-2 group cursor-pointer"
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
                <div className="border-t border-line w-full" />
                <span className="absolute bg-surface px-3 text-sm text-ink-subtle">
                  O continúa con
                </span>
              </div>

              {/* Google Login */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full mt-5 py-2.5 px-4 bg-surface hover:bg-sunken border border-line rounded-ui text-xs font-semibold text-ink-muted flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
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
              <div className="mt-6 pt-6 border-t border-line text-center">
                <p className="text-xs text-ink-subtle">
                  {isLogin ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}{' '}
                  <button
                    type="button"
                    onClick={() => setIsLogin(!isLogin)}
                    className="font-semibold text-brand-text hover:underline cursor-pointer"
                  >
                    {isLogin ? 'Regístrate aquí' : 'Inicia sesión'}
                  </button>
                </p>
              </div>
        </div>

        {/* Info extra */}
        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-ink-subtle">
          <CheckCircle2 size={14} className="text-success" />
          <span>Acceso seguro con autenticación encriptada</span>
        </div>
      </div>
    </div>
  );
}
