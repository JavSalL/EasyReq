import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  documentId,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Colaboracion, ColaboracionProyecto, UUID } from '../database.types';

const MAX_EN_UNA_IN = 30;

export function getColaboracionProyectoId(id_colaboracion: string, id_proyecto: string): string {
  return `${id_colaboracion}_${id_proyecto}`;
}

function mapearColaboracion(id: string, data: Record<string, unknown>): Colaboracion {
  return {
    id,
    nombre: typeof data.nombre === 'string' ? data.nombre : '',
    descripcion: typeof data.descripcion === 'string' ? data.descripcion : '',
    id_creador: typeof data.id_creador === 'string' ? data.id_creador : null,
    activa: typeof data.activa === 'boolean' ? data.activa : true,
    created_at: typeof data.created_at === 'string' ? data.created_at : new Date().toISOString(),
  };
}

export async function getColaboraciones(): Promise<Colaboracion[]> {
  try {
    const snap = await getDocs(collection(db, 'colaboracion'));
    return snap.docs.map(d => mapearColaboracion(d.id, d.data()));
  } catch (e) {
    console.error('Error fetching colaboraciones:', e);
    return [];
  }
}

export async function getColaboracionById(id: string): Promise<Colaboracion | null> {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'colaboracion', id));
    if (!snap.exists()) return null;
    return mapearColaboracion(snap.id, snap.data());
  } catch (e) {
    console.error('Error fetching colaboracion by id:', e);
    return null;
  }
}

export async function createColaboracion(data: {
  nombre: string;
  descripcion?: string;
  id_creador: UUID;
  activa?: boolean;
  ids_proyectos?: UUID[];
}): Promise<Colaboracion> {
  const nombre = data.nombre.trim();
  if (!nombre) {
    throw new Error('El nombre de la colaboración es obligatorio');
  }
  if (!data.id_creador) {
    throw new Error('Se requiere el usuario creador de la colaboración');
  }

  const created_at = new Date().toISOString();
  const activa = data.activa ?? true;
  const descripcion = data.descripcion?.trim() ?? '';
  const colabRef = doc(collection(db, 'colaboracion'));
  const batch = writeBatch(db);

  batch.set(colabRef, {
    nombre,
    descripcion,
    id_creador: data.id_creador,
    activa,
    created_at,
  });

  const idsProyectos = [...new Set((data.ids_proyectos ?? []).filter(Boolean))];
  for (const idProyecto of idsProyectos) {
    const relId = getColaboracionProyectoId(colabRef.id, idProyecto);
    batch.set(doc(db, 'colaboracion_proyecto', relId), {
      id_colaboracion: colabRef.id,
      id_proyecto: idProyecto,
      id_autor: data.id_creador,
      created_at,
    });
    batch.update(doc(db, 'proyecto', idProyecto), {
      en_colaboracion: true,
    });
  }

  await batch.commit();

  return {
    id: colabRef.id,
    nombre,
    descripcion,
    id_creador: data.id_creador,
    activa,
    created_at,
  };
}

export async function updateColaboracion(
  id: string,
  data: {
    nombre?: string;
    descripcion?: string;
    activa?: boolean;
  }
): Promise<void> {
  if (!id) return;
  const cambios: Record<string, unknown> = {};
  if (data.nombre !== undefined) cambios.nombre = data.nombre.trim();
  if (data.descripcion !== undefined) cambios.descripcion = data.descripcion.trim();
  if (data.activa !== undefined) cambios.activa = data.activa;
  if (Object.keys(cambios).length === 0) return;
  await updateDoc(doc(db, 'colaboracion', id), cambios);
}

/**
 * Recalcula y sincroniza `en_colaboracion` en el documento `proyecto` según si aún
 * tiene al menos un vínculo en `colaboracion_proyecto`.
 */
export async function sincronizarBanderaColaboracionProyecto(id_proyecto: string): Promise<boolean> {
  if (!id_proyecto) return false;
  const relSnap = await getDocs(
    query(collection(db, 'colaboracion_proyecto'), where('id_proyecto', '==', id_proyecto))
  );
  const enColaboracion = !relSnap.empty;
  try {
    const proyRef = doc(db, 'proyecto', id_proyecto);
    const proySnap = await getDoc(proyRef);
    if (proySnap.exists() && proySnap.data().en_colaboracion !== enColaboracion) {
      await updateDoc(proyRef, { en_colaboracion: enColaboracion });
    }
  } catch (e) {
    console.error('Error sincronizando en_colaboracion del proyecto:', e);
  }
  return enColaboracion;
}

export async function deleteColaboracion(id: string): Promise<void> {
  if (!id) return;
  const relSnap = await getDocs(
    query(collection(db, 'colaboracion_proyecto'), where('id_colaboracion', '==', id))
  );
  const proyectosAfectados = new Set<string>();
  for (const d of relSnap.docs) {
    const idProyecto = d.data().id_proyecto;
    if (typeof idProyecto === 'string' && idProyecto) {
      proyectosAfectados.add(idProyecto);
    }
    await deleteDoc(d.ref);
  }
  await deleteDoc(doc(db, 'colaboracion', id));

  for (const idProyecto of proyectosAfectados) {
    await sincronizarBanderaColaboracionProyecto(idProyecto);
  }
}

export async function getColaboracionProyectos(id_colaboracion?: string): Promise<ColaboracionProyecto[]> {
  try {
    const q = id_colaboracion
      ? query(collection(db, 'colaboracion_proyecto'), where('id_colaboracion', '==', id_colaboracion))
      : collection(db, 'colaboracion_proyecto');
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<ColaboracionProyecto, 'id'>),
    }));
  } catch (e) {
    console.error('Error fetching colaboracion_proyecto:', e);
    return [];
  }
}

export async function getColaboracionesDeProyecto(id_proyecto: string): Promise<Colaboracion[]> {
  if (!id_proyecto) return [];
  try {
    const relSnap = await getDocs(
      query(collection(db, 'colaboracion_proyecto'), where('id_proyecto', '==', id_proyecto))
    );
    const ids = [
      ...new Set(
        relSnap.docs
          .map(d => d.data().id_colaboracion as string | undefined)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    if (ids.length === 0) return [];

    const resultado: Colaboracion[] = [];
    for (let i = 0; i < ids.length; i += MAX_EN_UNA_IN) {
      const lote = ids.slice(i, i + MAX_EN_UNA_IN);
      const snap = await getDocs(
        query(collection(db, 'colaboracion'), where(documentId(), 'in', lote))
      );
      resultado.push(...snap.docs.map(d => mapearColaboracion(d.id, d.data())));
    }
    return resultado;
  } catch (e) {
    console.error('Error fetching colaboraciones del proyecto:', e);
    return [];
  }
}

export async function vincularProyectoAColaboracion(
  id_colaboracion: string,
  id_proyecto: string,
  id_autor: string
): Promise<void> {
  if (!id_colaboracion || !id_proyecto || !id_autor) {
    throw new Error('Faltan datos para vincular el proyecto a la colaboración');
  }

  const relId = getColaboracionProyectoId(id_colaboracion, id_proyecto);
  const relRef = doc(db, 'colaboracion_proyecto', relId);
  const colabRef = doc(db, 'colaboracion', id_colaboracion);
  const proyRef = doc(db, 'proyecto', id_proyecto);

  await runTransaction(db, async tx => {
    const [colabSnap, proySnap, relSnap] = await Promise.all([
      tx.get(colabRef),
      tx.get(proyRef),
      tx.get(relRef),
    ]);

    if (!colabSnap.exists()) {
      throw new Error('La colaboración ya no existe');
    }
    if (!proySnap.exists()) {
      throw new Error('El proyecto ya no existe');
    }
    if (relSnap.exists()) {
      return;
    }

    tx.set(relRef, {
      id_colaboracion,
      id_proyecto,
      id_autor,
      created_at: new Date().toISOString(),
    });
    tx.update(proyRef, { en_colaboracion: true });
  });
}

export async function desvincularProyectoDeColaboracion(
  id_colaboracion: string,
  id_proyecto: string
): Promise<void> {
  if (!id_colaboracion || !id_proyecto) return;
  const relId = getColaboracionProyectoId(id_colaboracion, id_proyecto);
  await deleteDoc(doc(db, 'colaboracion_proyecto', relId));
  await sincronizarBanderaColaboracionProyecto(id_proyecto);
}

