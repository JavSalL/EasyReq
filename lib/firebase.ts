import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Configuración Firebase (sin secrets en este archivo).
// Notas de operación:
// - Las vars NEXT_PUBLIC_FIREBASE_* se congelan en tiempo de build (export
//   estático a `out/`). Tras editar `.env.local` hay que reiniciar
//   `npm run dev`; para el sitio desplegado hay que reconstruir con
//   `npm run build` y redesplegar.
// - Si Auth falla con `auth/api-key-not-valid`, revisar en Firebase Console
//   (proyecto `easy-req`): que la key sea la de ese proyecto y que sus
//   restricciones (HTTP referrers) permitan el origen usado (p. ej.
//   localhost en desarrollo).
// - Nombres de vars esperadas: ver `GEMINI.md` (bloque NEXT_PUBLIC_FIREBASE_*).
// - Nunca imprimir valores de keys en logs: solo presencia/ausencia.

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

if (!apiKey) {
  console.error(
    "[EasyReq] Falta NEXT_PUBLIC_FIREBASE_API_KEY. Verifica .env.local " +
      "(nombre de clave exacto, sin comillas ni espacios en blanco), " +
      "reinicia `npm run dev` y, para el export en `out/`, reconstruye con `npm run build`."
  );
  throw new Error(
    "Configuración Firebase inválida: falta NEXT_PUBLIC_FIREBASE_API_KEY."
  );
}

const firebaseConfig = {
  apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase (prevent re-initializing during Next.js hot reload)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
