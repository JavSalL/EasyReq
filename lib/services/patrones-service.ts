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
import { getModelos } from './catalogos-service';

// ==========================================
// PATRONES DE IA
// ==========================================
export async function getPatrones(): Promise<Patron[]> {
  try {
    const snap = await getDocs(collection(db, 'patron'));
    const modelos = await getModelos();
    const modelMap = new Map(modelos.map(m => [m.id, m]));

    return snap.docs.map(d => {
      const data = d.data();
      return {
        patron_id: d.id,
        nombre: data.nombre,
        promt: data.promt || '',
        id_modelo: data.id_modelo || null,
        modelo: data.id_modelo ? modelMap.get(data.id_modelo) || null : null,
        created_at: data.created_at || new Date().toISOString()
      };
    });
  } catch (e) {
    console.error('Error fetching patrones:', e);
    return [];
  }
}

export async function createPatron(data: { nombre: string; promt: string; id_modelo: string | null }): Promise<Patron> {
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

export async function updatePatron(id: string, data: { nombre: string; promt: string; id_modelo: string | null }): Promise<void> {
  await updateDoc(doc(db, 'patron', id), data);
}

export async function deletePatron(id: string): Promise<void> {
  await deleteDoc(doc(db, 'patron', id));
}
