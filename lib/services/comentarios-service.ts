// ==========================================
// COMENTARIOS DE REQUERIMIENTOS (KAN-27)
// ==========================================
// Los comentarios cuelgan de `requerimiento/{id}/comentario/{id}`. Esa elección
// es de seguridad y no de comodidad, y está explicada en `firestore.rules`: las
// reglas no pueden leer el contenido de los documentos cuando la operación es una
// consulta, así que el ID del requerimiento tiene que estar en el path para que la
// comprobación de membresía sea una lectura de clave conocida y la consulta del
// hilo funcione.
//
// El contador `total_comentarios` que muestra la lista vive en el propio
// requerimiento y lo mueve la misma transacción que crea o borra un comentario.
//
// Regla de orden que no se debe romper: el requerimiento se borra ANTES que sus
// comentarios. Ver `borrarComentariosDeRequerimiento`.
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Comentario } from '../database.types';
import { getAllUsers } from './usuarios-service';

/** Límite de caracteres del texto de un comentario. El mismo que fijan las reglas. */
const COMENTARIO_MAXIMO = 4000;

/**
 * Limpia y valida el texto antes de mandarlo a Firestore.
 *
 * Se comprueba aquí, y no solo en las reglas, porque un rechazo del backend
 * llegaría como `permission-denied`, que se lee como "no tienes permiso" cuando
 * la causa real es que el comentario quedó vacío o se pasó de largo.
 */
function textoValidoDeComentario(texto: string): string {
  const limpio = texto.trim();
  if (!limpio) {
    throw new Error('El comentario no puede quedar vacío.');
  }
  if (limpio.length > COMENTARIO_MAXIMO) {
    throw new Error(`El comentario no puede superar ${COMENTARIO_MAXIMO} caracteres.`);
  }
  return limpio;
}

/**
 * Lee el contador guardado en el propio requerimiento.
 *
 * Ausente en los documentos anteriores a KAN-27, que equivalen a cero. Se lee con
 * este cuidado en vez de `data.total_comentarios` porque el valor también llega de
 * lecturas de transacción, donde el campo puede no existir.
 */
function contadorDe(data: unknown): number {
  if (typeof data !== 'object' || data === null) return 0;
  const valor = (data as { total_comentarios?: unknown }).total_comentarios;
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

/**
 * Hilo de comentarios de un requerimiento, en orden cronológico y con el autor ya
 * resuelto desde `perfil_usuario`.
 *
 * Los errores se vuelcan y se reenvían en vez de devolver `[]`: un hilo que sale
 * vacío porque las reglas denegaron la consulta es indistinguible de un hilo sin
 * comentarios, y es justo el fallo silencioso que ya costó encontrar en
 * `getRequerimientos`. La página traduce el error con `mensajeError`.
 */
export async function getComentariosRequerimiento(
  id_requerimiento: string
): Promise<Comentario[]> {
  try {
    const q = query(
      collection(db, 'requerimiento', id_requerimiento, 'comentario'),
      orderBy('created_at', 'asc')
    );
    const snap = await getDocs(q);
    const usuarios = await getAllUsers();
    const userMap = new Map(usuarios.map(u => [u.id, u]));

    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        id_requerimiento,
        id_autor: typeof data.id_autor === 'string' ? data.id_autor : '',
        texto: typeof data.texto === 'string' ? data.texto : '',
        created_at: typeof data.created_at === 'string' ? data.created_at : '',
        updated_at: typeof data.updated_at === 'string' ? data.updated_at : null,
        autor: typeof data.id_autor === 'string' ? userMap.get(data.id_autor) || null : null
      };
    });
  } catch (e) {
    console.error('Error fetching requirement comments:', e);
    throw e;
  }
}

/**
 * Publica un comentario en el hilo y sube el contador del requerimiento, todo en
 * una sola transacción: si uno de los dos escritos no se puede hacer, no se hace
 * ninguno, y así el indicador no se queda por detrás del hilo real.
 *
 * El autor lo pone el sistema a partir de `uid`, nunca del formulario, y las
 * reglas lo exigen igual al de la sesión.
 */
export async function crearComentario(
  id_requerimiento: string,
  texto: string,
  uid: string
): Promise<void> {
  const limpio = textoValidoDeComentario(texto);
  const requerimientoRef = doc(db, 'requerimiento', id_requerimiento);
  const comentariosRef = collection(
    db,
    'requerimiento',
    id_requerimiento,
    'comentario'
  );

  await runTransaction(db, async transaction => {
    // La lectura no es solo para el contador: si el requerimiento ya no existe,
    // decirlo aquí da un mensaje que se entiende, en vez del `permission-denied`
    // que devolverían las reglas al no poder resolver a qué proyecto cuelga.
    const requerimiento = await transaction.get(requerimientoRef);
    if (!requerimiento.exists()) {
      throw new Error(
        'Este requerimiento ya no existe: pudo haberse borrado mientras escribías.'
      );
    }

    const nuevoRef = doc(comentariosRef);
    transaction.set(nuevoRef, {
      id_requerimiento,
      id_autor: uid,
      texto: limpio,
      created_at: new Date().toISOString()
    });
    // Se calcula desde la lectura de la transacción y no con `increment`, para que
    // dos comentarios simultáneos no acaben ambos escribiendo el mismo número.
    transaction.update(requerimientoRef, {
      total_comentarios: contadorDe(requerimiento.data()) + 1
    });
  });
}

/**
 * Corrige el texto de un comentario propio y marca cuándo se corrigió.
 *
 * Sin transacción: es un solo documento y no mueve el contador. Quién puede hacerlo
 * lo decide la regla, que además impide tocar cualquier otra clave del documento.
 */
export async function editarComentario(
  id_requerimiento: string,
  id_comentario: string,
  texto: string
): Promise<void> {
  const limpio = textoValidoDeComentario(texto);
  await updateDoc(
    doc(db, 'requerimiento', id_requerimiento, 'comentario', id_comentario),
    {
      texto: limpio,
      updated_at: new Date().toISOString()
    }
  );
}

/**
 * Borra un comentario y baja el contador del requerimiento en la misma
 * transacción, por la misma razón que `crearComentario`.
 */
export async function borrarComentario(
  id_requerimiento: string,
  id_comentario: string
): Promise<void> {
  const requerimientoRef = doc(db, 'requerimiento', id_requerimiento);
  const comentarioRef = doc(
    db,
    'requerimiento',
    id_requerimiento,
    'comentario',
    id_comentario
  );

  await runTransaction(db, async transaction => {
    const requerimiento = await transaction.get(requerimientoRef);
    transaction.delete(comentarioRef);
    // Si el requerimiento ya no existe no hay contador que ajustar: el documento
    // que lo lleva se está borrando.
    if (!requerimiento.exists()) return;
    const restantes = contadorDe(requerimiento.data());
    // El `> 0` evita dejar el contador en negativo si un documento antiguo trae un
    // valor por debajo de lo que dicen sus comentarios.
    if (restantes > 0) {
      transaction.update(requerimientoRef, { total_comentarios: restantes - 1 });
    }
  });
}

/**
 * Borra el hilo de comentarios de un requerimiento, sin tocar el contador.
 *
 * Hay que llamarlo DESPUÉS de que el propio requerimiento se haya borrado, y esa
 * no es una preferencia de estilo: es la única forma de que las reglas lo permitan.
 * Una vez que el requerimiento desaparece, la membresía que autoriza el `delete` ya
 * no puede resolverse, así que las reglas admiten el borrado por la rama huérfana.
 * El mismo orden siguen `deleteRequerimiento` y `deleteProyecto`; el comentario que
 * lo explica está en `firestore.rules`.
 *
 * Firestore no hace cascada: borrar el documento no se lleva su subcolección, y un
 * hilo huérfano quedaría ahí para siempre.
 */
export async function borrarComentariosDeRequerimiento(
  id_requerimiento: string
): Promise<void> {
  const snap = await getDocs(
    collection(db, 'requerimiento', id_requerimiento, 'comentario')
  );
  for (const d of snap.docs) {
    await deleteDoc(d.ref);
  }
}
