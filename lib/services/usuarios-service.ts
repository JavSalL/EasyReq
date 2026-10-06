import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PerfilUsuario, Profesion, UUID } from '../database.types';

// ==========================================
// USUARIOS Y PERFILES
// Modelo multi-profesión: `perfil_usuario` guarda
// `ids_profesiones: string[]` + `profesiones_nombres: string[]`
// desnormalizados. Los campos legacy `id_profesion` /
// `profesion_nombre` (una sola profesión) se siguen escribiendo
// con el primer elemento por compatibilidad y se normalizan
// al leer.
// ==========================================
function normalizePerfilProfesiones(data: Record<string, unknown>): Pick<PerfilUsuario, 'ids_profesiones' | 'profesiones_nombres' | 'profesiones' | 'id_profesion' | 'profesion_nombre'> {
  const rawIds = data.ids_profesiones;
  const rawNombres = data.profesiones_nombres;
  const rawProfesiones = data.profesiones;
  const rawId = data.id_profesion;
  const rawNombre = data.profesion_nombre;
  const ids: UUID[] = Array.isArray(rawIds)
    ? rawIds.filter((v: unknown): v is UUID => typeof v === 'string' && v.length > 0)
    : typeof rawId === 'string' && rawId
      ? [rawId]
      : [];
  const nombres: string[] = Array.isArray(rawNombres)
    ? rawNombres.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0)
    : Array.isArray(rawProfesiones)
      ? (rawProfesiones as Profesion[]).map((p) => p.nombre).filter((n) => typeof n === 'string' && n.length > 0)
      : typeof rawNombre === 'string' && rawNombre
        ? [rawNombre]
        : [];
  const profesiones: Profesion[] = Array.isArray(rawProfesiones)
    ? (rawProfesiones as Profesion[])
    : ids.map((id, i) => ({ id, nombre: nombres[i] ?? '' })).filter((p) => p.id && p.nombre);
  return {
    ids_profesiones: ids,
    profesiones_nombres: nombres,
    profesiones,
    id_profesion: ids[0] ?? (typeof rawId === 'string' ? rawId : null),
    profesion_nombre: nombres[0] ?? (typeof rawNombre === 'string' ? rawNombre : null),
  };
}

/** Texto para mostrar las profesiones de un perfil ("A, B" o fallback). */
export function getProfesionesLabel(profile: PerfilUsuario | null | undefined, fallback = ''): string {
  if (!profile) return fallback;
  const nombres = Array.isArray(profile.profesiones_nombres) && profile.profesiones_nombres.length > 0
    ? profile.profesiones_nombres
    : Array.isArray(profile.profesiones) && profile.profesiones.length > 0
      ? profile.profesiones.map((p) => p.nombre)
      : profile.profesion_nombre
        ? [profile.profesion_nombre]
        : [];
  return nombres.length > 0 ? nombres.join(', ') : fallback;
}

export async function getUserProfile(userId: string): Promise<PerfilUsuario | null> {
  try {
    const docRef = doc(db, 'perfil_usuario', userId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    return { id: snap.id, ...(data as unknown as Omit<PerfilUsuario, 'id'>), ...normalizePerfilProfesiones(data) };
  } catch (e) {
    console.error('Error fetching user profile:', e);
    return null;
  }
}

export async function saveUserProfile(
  userId: string,
  data: {
    nombre: string;
    correo: string;
    id_profesion?: string;
    profesion_nombre?: string;
    ids_profesiones?: string[];
    profesiones_nombres?: string[];
    profesiones?: Profesion[];
  }
): Promise<void> {
  // Normaliza entrada: acepta formato nuevo (arrays) o legacy (uno solo).
  const normalized = normalizePerfilProfesiones({
    ids_profesiones: data.ids_profesiones,
    profesiones_nombres: data.profesiones_nombres,
    profesiones: data.profesiones,
    id_profesion: data.id_profesion,
    profesion_nombre: data.profesion_nombre,
  });
  const docRef = doc(db, 'perfil_usuario', userId);
  await setDoc(docRef, {
    ...data,
    ids_profesiones: normalized.ids_profesiones ?? [],
    profesiones_nombres: normalized.profesiones_nombres ?? [],
    profesiones: normalized.profesiones ?? [],
    // Compat: primer elemento como campo singular.
    id_profesion: normalized.id_profesion ?? null,
    profesion_nombre: normalized.profesion_nombre ?? null,
    updated_at: new Date().toISOString()
  }, { merge: true });
}

export async function getAllUsers(): Promise<PerfilUsuario[]> {
  try {
    const snap = await getDocs(collection(db, 'perfil_usuario'));
    return snap.docs.map(d => {
      const data = d.data() as Record<string, unknown>;
      return { id: d.id, ...(data as unknown as Omit<PerfilUsuario, 'id'>), ...normalizePerfilProfesiones(data) };
    });
  } catch (e) {
    console.error('Error fetching all users:', e);
    return [];
  }
}
