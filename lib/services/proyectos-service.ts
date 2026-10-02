import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Proyecto, UUID, MiembroEquipo, QuienCreaEquipos } from '../database.types';
import { getTiposSistema } from './catalogos-service';
import { getProyectoEquipos, getMiembrosEquipo } from './equipos-service';

// ==========================================
// PROYECTOS
// ==========================================
export async function getProyectos(): Promise<Proyecto[]> {
  try {
    const snap = await getDocs(collection(db, 'proyecto'));
    const proyectos: Proyecto[] = [];
    const tipos = await getTiposSistema();
    const tiposMap = new Map(tipos.map(t => [t.id, t]));

    for (const d of snap.docs) {
      const data = d.data();
      proyectos.push({
        proyecto_id: d.id,
        nombre: data.nombre,
        descripcion: data.descripcion || '',
        id_tipo_sistema: data.id_tipo_sistema || null,
        tipos_sistema: data.id_tipo_sistema ? tiposMap.get(data.id_tipo_sistema) || null : null,
        // Documentos legacy pueden no tener `id_creador`: se normaliza a null
        // y se tratan como hoy (solo miembros vinculados editan).
        id_creador: (data.id_creador as string | null | undefined) ?? null,
        quien_crea_equipos: (data.quien_crea_equipos as QuienCreaEquipos | undefined) ?? 'creador',
        ids_creadores_equipos: Array.isArray(data.ids_creadores_equipos) ? data.ids_creadores_equipos : [],
        created_at: data.created_at || new Date().toISOString()
      });
    }
    return proyectos;
  } catch (e) {
    console.error('Error fetching proyectos:', e);
    return [];
  }
}

export async function getProyectoById(id: string): Promise<Proyecto | null> {
  try {
    const snap = await getDoc(doc(db, 'proyecto', id));
    if (!snap.exists()) return null;
    const data = snap.data();
    const tipos = data.id_tipo_sistema ? await getTiposSistema() : [];
    const tipo = tipos.find(t => t.id === data.id_tipo_sistema) || null;
    return {
      proyecto_id: snap.id,
      nombre: data.nombre,
      descripcion: data.descripcion || '',
      id_tipo_sistema: data.id_tipo_sistema || null,
      tipos_sistema: tipo,
      // Documentos legacy sin `id_creador` se normalizan a null.
      id_creador: (data.id_creador as string | null | undefined) ?? null,
      quien_crea_equipos: (data.quien_crea_equipos as QuienCreaEquipos | undefined) ?? 'creador',
      ids_creadores_equipos: Array.isArray(data.ids_creadores_equipos) ? data.ids_creadores_equipos : [],
      created_at: data.created_at || new Date().toISOString()
    };
  } catch (e) {
    console.error('Error fetching proyecto by id:', e);
    return null;
  }
}

export async function createProyecto(data: {
  nombre: string;
  descripcion?: string;
  id_tipo_sistema?: string | null;
  id_creador?: UUID | null;
  quien_crea_equipos?: QuienCreaEquipos;
  ids_creadores_equipos?: UUID[];
}): Promise<Proyecto> {
  const created_at = new Date().toISOString();
  const quien_crea_equipos = data.quien_crea_equipos ?? 'creador';
  const ids_creadores_equipos = quien_crea_equipos === 'seleccionados' ? data.ids_creadores_equipos ?? [] : [];
  const docRef = await addDoc(collection(db, 'proyecto'), {
    nombre: data.nombre,
    descripcion: data.descripcion || '',
    id_tipo_sistema: data.id_tipo_sistema || null,
    // UID del creador (política: cualquier autenticado puede crear; el
    // creador siempre puede editar/eliminar). Null si no se provee.
    id_creador: data.id_creador ?? null,
    quien_crea_equipos,
    ids_creadores_equipos,
    created_at
  });
  return {
    proyecto_id: docRef.id,
    nombre: data.nombre,
    descripcion: data.descripcion || '',
    id_tipo_sistema: data.id_tipo_sistema || null,
    id_creador: data.id_creador ?? null,
    quien_crea_equipos,
    ids_creadores_equipos,
    created_at
  };
}

export async function updateProyecto(
  id: string,
  data: {
    nombre: string;
    descripcion?: string;
    id_tipo_sistema?: string | null;
    // Solo los envía el creador del proyecto: las reglas impiden que otros cambien el permiso
    quien_crea_equipos?: QuienCreaEquipos;
    ids_creadores_equipos?: UUID[];
  }
): Promise<void> {
  const docRef = doc(db, 'proyecto', id);
  const cambios: Record<string, unknown> = { ...data };
  if (data.quien_crea_equipos !== undefined) {
    cambios.ids_creadores_equipos = data.quien_crea_equipos === 'seleccionados' ? data.ids_creadores_equipos ?? [] : [];
  }
  await updateDoc(docRef, cambios);
}

export async function deleteProyecto(id: string): Promise<void> {
  await deleteDoc(doc(db, 'proyecto', id));
  // Los equipos pertenecen al proyecto: se eliminan con él (las reglas lo permiten
  // una vez que el proyecto ya no existe), junto con sus miembros e invitaciones.
  const equiposSnap = await getDocs(query(collection(db, 'equipo'), where('id_proyecto', '==', id)));
  for (const equipo of equiposSnap.docs) {
    await deleteDoc(equipo.ref);
    const miembros = await getDocs(query(collection(db, 'miembros_equipo'), where('id_equipo', '==', equipo.id)));
    for (const d of miembros.docs) await deleteDoc(d.ref);
    const invitaciones = await getDocs(query(collection(db, 'invitaciones_equipo'), where('id_equipo', '==', equipo.id)));
    for (const d of invitaciones.docs) await deleteDoc(d.ref);
  }
  const peSnap = await getDocs(query(collection(db, 'proyecto_equipos'), where('id_proyecto', '==', id)));
  for (const d of peSnap.docs) {
    await deleteDoc(d.ref);
  }
  const requestsSnap = await getDocs(query(
    collection(db, 'solicitudes_proyecto_equipo'),
    where('id_proyecto', '==', id)
  ));
  for (const d of requestsSnap.docs) {
    await deleteDoc(d.ref);
  }
  const reqSnap = await getDocs(query(collection(db, 'requerimiento'), where('id_proyecto', '==', id)));
  for (const d of reqSnap.docs) {
    await deleteDoc(d.ref);
  }
}

// ==========================================
// CONTROL DE ACCESO (proyectos)
// ==========================================

/**
 * IDs de proyectos relacionados al usuario: proyectos que creó
 * (`proyecto.id_creador == userId`) más aquellos donde es miembro de un
 * equipo vinculado vía `proyecto_equipos`. Sin N+1: 3 lecturas en
 * paralelo (vínculos + membresías con joins + creados propios).
 */
export async function getProyectosRelacionados(userId: string): Promise<UUID[]> {
  if (!userId) return [];
  const [vinculos, membresias, creadosSnap] = await Promise.all([
    getProyectoEquipos(),
    getMiembrosEquipo(),
    getDocs(query(collection(db, 'proyecto'), where('id_creador', '==', userId)))
  ]);
  const equiposDelUsuario = new Set(
    membresias
      .filter((m: MiembroEquipo) => m.id_usuario === userId)
      .map((m: MiembroEquipo) => m.id_equipo)
  );
  const proyectos = new Set<UUID>();
  for (const d of creadosSnap.docs) {
    proyectos.add(d.id);
  }
  for (const pe of vinculos) {
    if (pe.id_proyecto && equiposDelUsuario.has(pe.id_equipo)) {
      proyectos.add(pe.id_proyecto);
    }
  }
  return [...proyectos];
}

/**
 * Indica si el usuario puede editar/eliminar el proyecto: true si es su
 * creador (`id_creador == userId`) o miembro de un equipo vinculado.
 */
export async function isUsuarioRelacionadoAProyecto(
  userId: string,
  proyectoId: string
): Promise<boolean> {
  if (!userId || !proyectoId) return false;
  // Chequeo barato primero: creador del proyecto (1 lectura directa).
  try {
    const snap = await getDoc(doc(db, 'proyecto', proyectoId));
    if (snap.exists() && snap.data().id_creador === userId) return true;
  } catch (e) {
    console.error('Error verificando creador del proyecto:', e);
  }
  const relacionados = await getProyectosRelacionados(userId);
  return relacionados.includes(proyectoId);
}
