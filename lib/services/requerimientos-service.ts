import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  runTransaction 
} from 'firebase/firestore';
import { db } from '../firebase';
import { codigoRequerimiento } from '../requerimientos';
import { Requerimiento, LogRequerimiento } from '../database.types';
import { 
  getTiposRequerimientos, 
  getEstados, 
  getModalidades, 
  getModelos 
} from './catalogos-service';
import { getAllUsers } from './usuarios-service';

// ==========================================
// REQUERIMIENTOS
// ==========================================
export async function getRequerimientos(id_proyecto?: string): Promise<Requerimiento[]> {
  try {
    const q = id_proyecto 
      ? query(collection(db, 'requerimiento'), where('id_proyecto', '==', id_proyecto))
      : collection(db, 'requerimiento');
    const snap = await getDocs(q);
    
    const [tipos, estados, modalidades, modelos, usuarios] = await Promise.all([
      getTiposRequerimientos(),
      getEstados(),
      getModalidades(),
      getModelos(),
      getAllUsers()
    ]);

    const tipoMap = new Map(tipos.map(t => [t.tipo_req, t]));
    const estadoMap = new Map(estados.map(e => [e.id, e]));
    const modMap = new Map(modalidades.map(m => [m.id, m]));
    const modelMap = new Map(modelos.map(m => [m.id, m]));
    const userMap = new Map(usuarios.map(u => [u.id, u]));

    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        enunciado: data.enunciado || '',
        id_tipo_requerimiento: data.id_tipo_requerimiento || null,
        id_proyecto: data.id_proyecto,
        id_autor: data.id_autor || null,
        id_aprobador: data.id_aprobador || null,
        id_modalidad: data.id_modalidad || null,
        id_estado: data.id_estado || null,
        id_modelo: data.id_modelo || null,
        numero: typeof data.numero === 'number' ? data.numero : null,
        codigo: typeof data.codigo === 'string' ? data.codigo : null,
        created_at: data.created_at || new Date().toISOString(),

        tipo_requerimiento: data.id_tipo_requerimiento ? tipoMap.get(data.id_tipo_requerimiento) || null : null,
        estado: data.id_estado ? estadoMap.get(data.id_estado) || null : null,
        modalidad: data.id_modalidad ? modMap.get(data.id_modalidad) || null : null,
        modelo: data.id_modelo ? modelMap.get(data.id_modelo) || null : null,
        autor: data.id_autor ? userMap.get(data.id_autor) || null : null,
        aprobador: data.id_aprobador ? userMap.get(data.id_aprobador) || null : null
      };
    });
  } catch (e) {
    console.error('Error fetching requerimientos:', e);
    return [];
  }
}

// Campo del documento `proyecto` con el último número de requerimiento asignado.
// Solo crece: el número de un requerimiento borrado no se reutiliza.
const CONTADOR_REQUERIMIENTOS = 'contador_requerimientos';

/**
 * Crea el requerimiento con el siguiente número consecutivo de su proyecto. El
 * contador y el requerimiento se escriben en una sola transacción, así dos
 * personas que guardan a la vez nunca obtienen el mismo número.
 */
export async function createRequerimiento(data: Partial<Requerimiento>): Promise<Requerimiento> {
  const created_at = new Date().toISOString();
  const reqRef = doc(collection(db, 'requerimiento'));
  const proyectoRef = data.id_proyecto ? doc(db, 'proyecto', data.id_proyecto) : null;

  const numero = await runTransaction(db, async transaction => {
    let siguiente: number | null = null;
    if (proyectoRef) {
      const proyecto = await transaction.get(proyectoRef);
      if (proyecto.exists()) {
        siguiente = ((proyecto.data()[CONTADOR_REQUERIMIENTOS] as number | undefined) ?? 0) + 1;
        transaction.update(proyectoRef, { [CONTADOR_REQUERIMIENTOS]: siguiente });
      }
    }
    transaction.set(reqRef, {
      ...data,
      ...(siguiente !== null ? { numero: siguiente, codigo: codigoRequerimiento(siguiente) } : {}),
      created_at
    });
    return siguiente;
  });

  return {
    id: reqRef.id,
    ...(data as any),
    numero,
    codigo: numero !== null ? codigoRequerimiento(numero) : null,
    created_at
  };
}

// Tope de requerimientos que se pueden renumerar en una sola transacción (Firestore admite 500 escrituras).
const MAX_RENUMERADOS = 450;

/**
 * Inserta un requerimiento justo después del número `despuesDeNumero` y sube un
 * número a todos los que venían después (REQ-004 pasa a REQ-005, etc.). Todo
 * ocurre en una sola transacción: el requerimiento nuevo, los renumerados y el
 * contador del proyecto cambian juntos o no cambia nada.
 */
export async function insertarRequerimientoDespuesDe(
  id_proyecto: string,
  despuesDeNumero: number,
  data: Partial<Requerimiento>,
  id_autor: string | null
): Promise<{ requerimiento: Requerimiento; renumerados: number }> {
  const MENSAJE_CONFLICTO = 'Otra persona cambió los requerimientos mientras guardabas. Recarga la página e inténtalo de nuevo.';
  const proyectoRef = doc(db, 'proyecto', id_proyecto);

  // El contador se lee ANTES que la lista: una alta posterior moverá el contador y se detectará
  const proyectoSnap = await getDoc(proyectoRef);
  if (!proyectoSnap.exists()) throw new Error('El proyecto ya no existe. Recarga la página.');
  const contador = (proyectoSnap.data()[CONTADOR_REQUERIMIENTOS] as number | undefined) ?? 0;

  const lista = await getDocs(query(collection(db, 'requerimiento'), where('id_proyecto', '==', id_proyecto)));
  const existentes = lista.docs.map(d => ({ ref: d.ref, numero: d.data().numero as unknown }));
  if (existentes.some(e => typeof e.numero !== 'number')) {
    throw new Error('Los requerimientos del proyecto todavía se están numerando. Espera unos segundos e inténtalo de nuevo.');
  }

  const siguientes = existentes
    .map(e => ({ ref: e.ref, numero: e.numero as number }))
    .filter(e => e.numero > despuesDeNumero);
  if (siguientes.length > MAX_RENUMERADOS) {
    throw new Error(
      `Hay ${siguientes.length} requerimientos después de ${codigoRequerimiento(despuesDeNumero)}; ` +
      `no se pueden renumerar más de ${MAX_RENUMERADOS} a la vez.`
    );
  }

  const nuevoNumero = despuesDeNumero + 1;
  const reqRef = doc(collection(db, 'requerimiento'));
  const created_at = new Date().toISOString();

  await runTransaction(db, async transaction => {
    const actual = await transaction.get(proyectoRef);
    if (!actual.exists() || ((actual.data()[CONTADOR_REQUERIMIENTOS] as number | undefined) ?? 0) !== contador) {
      throw new Error(MENSAJE_CONFLICTO);
    }
    const snaps = await Promise.all(siguientes.map(s => transaction.get(s.ref)));
    snaps.forEach((snap, i) => {
      if (!snap.exists() || snap.data().numero !== siguientes[i].numero) throw new Error(MENSAJE_CONFLICTO);
    });

    siguientes.forEach(s => {
      transaction.update(s.ref, { numero: s.numero + 1, codigo: codigoRequerimiento(s.numero + 1) });
    });
    transaction.set(reqRef, { ...data, numero: nuevoNumero, codigo: codigoRequerimiento(nuevoNumero), created_at });
    transaction.update(proyectoRef, { [CONTADOR_REQUERIMIENTOS]: contador + 1 });
  });

  // Auditoría de los renumerados (sin esperar: si falla alguno, el cambio ya quedó guardado)
  void (async () => {
    for (let i = 0; i < siguientes.length; i += 25) {
      await Promise.all(
        siguientes.slice(i, i + 25).map(s =>
          addLogRequerimiento({
            id_requerimiento: s.ref.id,
            accion: 'Renumeración',
            id_autor,
            detalles: {
              de: codigoRequerimiento(s.numero),
              a: codigoRequerimiento(s.numero + 1),
              motivo: `Se insertó ${codigoRequerimiento(nuevoNumero)}`
            }
          })
        )
      );
    }
  })();

  return {
    requerimiento: {
      ...data,
      id: reqRef.id,
      numero: nuevoNumero,
      codigo: codigoRequerimiento(nuevoNumero),
      created_at
    } as Requerimiento,
    renumerados: siguientes.length
  };
}

/**
 * Completa el identificador de los requerimientos que no lo tienen guardado.
 */
export async function asignarNumerosRequerimientos(
  id_proyecto: string,
  pendientes: Array<{ id: string; created_at?: string }>
): Promise<void> {
  const ordenados = [...pendientes].sort(
    (a, b) => (a.created_at || '').localeCompare(b.created_at || '') || a.id.localeCompare(b.id)
  );
  const proyectoRef = doc(db, 'proyecto', id_proyecto);

  for (let i = 0; i < ordenados.length; i += 100) {
    const lote = ordenados.slice(i, i + 100);
    await runTransaction(db, async transaction => {
      const proyecto = await transaction.get(proyectoRef);
      if (!proyecto.exists()) return;
      const refs = lote.map(r => doc(db, 'requerimiento', r.id));
      const snaps = await Promise.all(refs.map(ref => transaction.get(ref)));

      let contador = (proyecto.data()[CONTADOR_REQUERIMIENTOS] as number | undefined) ?? 0;
      snaps.forEach((snap, idx) => {
        if (!snap.exists()) return;
        const actual = snap.data();
        if (typeof actual.numero === 'number') {
          if (typeof actual.codigo !== 'string') {
            transaction.update(refs[idx], { codigo: codigoRequerimiento(actual.numero) });
          }
          return;
        }
        contador += 1;
        transaction.update(refs[idx], { numero: contador, codigo: codigoRequerimiento(contador) });
      });
      transaction.update(proyectoRef, { [CONTADOR_REQUERIMIENTOS]: contador });
    });
  }
}

export async function updateRequerimiento(id: string, data: Partial<Requerimiento>): Promise<void> {
  await updateDoc(doc(db, 'requerimiento', id), data);
}

export async function deleteRequerimiento(id: string): Promise<void> {
  await deleteDoc(doc(db, 'requerimiento', id));
}

// ==========================================
// LOGS DE REQUERIMIENTOS
// ==========================================
export async function addLogRequerimiento(data: {
  id_requerimiento: string;
  accion: string;
  id_autor: string | null;
  detalles?: any;
}): Promise<void> {
  try {
    await addDoc(collection(db, 'logs_requerimientos'), {
      ...data,
      fecha_hora: new Date().toISOString()
    });
  } catch (e) {
    console.error('Error creating requirement log:', e);
  }
}

export async function getLogsRequerimientos(id_requerimiento: string): Promise<LogRequerimiento[]> {
  try {
    const q = query(
      collection(db, 'logs_requerimientos'), 
      where('id_requerimiento', '==', id_requerimiento)
    );
    const snap = await getDocs(q);
    const users = await getAllUsers();
    const userMap = new Map(users.map(u => [u.id, u]));

    const logs = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        id_requerimiento: data.id_requerimiento,
        accion: data.accion,
        id_autor: data.id_autor || null,
        id_lider_en_momento: data.id_lider_en_momento || null,
        fecha_hora: data.fecha_hora || new Date().toISOString(),
        detalles: data.detalles,
        autor: data.id_autor ? userMap.get(data.id_autor) || null : null
      };
    });

    return logs.sort((a, b) => new Date(b.fecha_hora).getTime() - new Date(a.fecha_hora).getTime());
  } catch (e) {
    console.error('Error fetching logs:', e);
    return [];
  }
}
