import { 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Patron } from '../database.types';
import { getMapaModelosCanonicos } from './catalogos-service';
import { MENSAJE_SIN_PERMISOS, puedeEditarCatalogos } from '../permisos';

// ==========================================
// PATRONES DE IA
// ==========================================
export async function getPatrones(): Promise<Patron[]> {
  try {
    const [snap, modelMap] = await Promise.all([
      getDocs(collection(db, 'patron')),
      getMapaModelosCanonicos()
    ]);

    const vistos = new Set<string>();
    const unicos: Patron[] = [];

    for (const d of snap.docs) {
      const data = d.data();
      const canonicalModel = data.id_modelo ? modelMap.get(data.id_modelo) || null : null;
      const canonicalModelId = canonicalModel ? canonicalModel.id : (data.id_modelo || null);

      const nombre = (data.nombre || '').trim().toLowerCase();
      const promt = (data.promt || '').trim();
      const clave = `${canonicalModelId || 'sin_modelo'}|${nombre}|${promt}`;

      if (vistos.has(clave)) continue;
      vistos.add(clave);

      unicos.push({
        patron_id: d.id,
        nombre: data.nombre,
        promt: data.promt || '',
        id_modelo: canonicalModelId,
        modelo: canonicalModel,
        created_at: data.created_at || new Date().toISOString()
      });
    }

    return unicos;
  } catch (e) {
    console.error('Error fetching patrones:', e);
    return [];
  }
}

export async function createPatron(data: { nombre: string; promt: string; id_modelo: string | null }): Promise<Patron> {
  if (!puedeEditarCatalogos()) {
    throw new Error(MENSAJE_SIN_PERMISOS);
  }

  const docRef = await addDoc(collection(db, 'patron'), {
    ...data,
    created_at: new Date().toISOString()
  });
  return {
    patron_id: docRef.id,
    nombre: data.nombre,
    promt: data.promt,
    id_modelo: data.id_modelo,
    created_at: new Date().toISOString()
  };
}

// KAN-17: `patron` y `modelo` son catálogos congelados. Estas dos operaciones
// siguen exportadas para que el sistema de roles pueda rehabilitarlas, pero ahora
// cortan antes de escribir. La denegación que de verdad manda es la de
// `puedeEditarCatalogos()` en `firestore.rules`; este corte existe para no gastar
// la escritura y para devolver un mensaje claro en lugar de un error opaco.
//
// Para devolver el permiso a un rol hay que cambiar `lib/permisos.ts` Y el helper
// del mismo nombre en `firestore.rules`. Cambiar solo uno deja la UI y el backend
// discrepando.
export async function updatePatron(
  id: string,
  data: { nombre: string; promt: string; id_modelo: string | null }
): Promise<void> {
  if (!puedeEditarCatalogos()) {
    throw new Error(MENSAJE_SIN_PERMISOS);
  }
  await updateDoc(doc(db, 'patron', id), data);
}

export async function deletePatron(id: string): Promise<void> {
  if (!puedeEditarCatalogos()) {
    throw new Error(MENSAJE_SIN_PERMISOS);
  }
  await deleteDoc(doc(db, 'patron', id));
}
