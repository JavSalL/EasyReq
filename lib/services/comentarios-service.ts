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
// Regla de orden que no se debe romper: el hilo se LISTA antes de borrar el
// requerimiento y se BORRA después. Ver `listarComentariosDeRequerimiento`.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentReference,
  type Unsubscribe
} from 'firebase/firestore';
import { db } from '../firebase';
import { AccesoComentariosProyecto, Comentario } from '../database.types';
import { getAllUsers } from './usuarios-service';
import {
  equipoVinculadoDelUsuario,
  esMiembroDeEquipoVinculadoAProyecto
} from './equipos-service';

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
 * Normaliza una fecha de Firestore a ISO.
 *
 * Los comentarios nuevos guardan `serverTimestamp()`, que al leer llega como
 * `Timestamp`; los que se escribieron antes de este cambio guardan una cadena ISO.
 * La interfaz y `database.types.ts` trabajan siempre con cadenas, así que la
 * conversión se hace en el borde del servicio.
 */
function fechaISO(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  if (typeof valor !== 'object' || valor === null) return '';
  const posible = valor as { toDate?: () => Date };
  if (typeof posible.toDate !== 'function') return '';
  try {
    const fecha = posible.toDate();
    return Number.isNaN(fecha.getTime()) ? '' : fecha.toISOString();
  } catch {
    return '';
  }
}

/**
 * Deja listo el acceso de un miembro de equipo vinculado al hilo (KAN-27).
 *
 * Las reglas no pueden enumerar los equipos de un proyecto para descubrir si el
 * usuario pertenece a alguno: eso costaría dos lecturas por equipo y agotaría el
 * presupuesto de 10 accesos. En su lugar, este servicio deja un puntero en
 * `proyecto/{id}/acceso_comentarios/{uid}` con **un** equipo por el que el
 * usuario entra. Las reglas no confían en el puntero: en cada operación vuelven
 * a comprobar que el usuario sigue en ese equipo y que el equipo sigue vinculado
 * al proyecto. Si el puntero queda obsoleto, esta función lo repara.
 *
 * Devuelve `false` cuando el usuario no es miembro directo ni de ningún equipo
 * vinculado. No es un error: la página lo usa para no abrir un hilo que las
 * reglas van a denegar.
 */
export async function asegurarAccesoComentariosProyecto(
  id_proyecto: string,
  uid: string
): Promise<boolean> {
  if (!id_proyecto || !uid) return false;

  const proyectoSnap = await getDoc(doc(db, 'proyecto', id_proyecto));
  if (!proyectoSnap.exists()) return false;
  const datos = proyectoSnap.data();
  const esMiembroDirecto =
    datos.id_creador === uid ||
    (Array.isArray(datos.ids_miembros) && datos.ids_miembros.includes(uid));
  if (esMiembroDirecto) return true;

  const accesoRef = doc(db, 'proyecto', id_proyecto, 'acceso_comentarios', uid);
  const accesoSnap = await getDoc(accesoRef);
  if (accesoSnap.exists()) {
    const idEquipo = accesoSnap.data().id_equipo;
    if (
      typeof idEquipo === 'string' &&
      await esMiembroDeEquipoVinculadoAProyecto(id_proyecto, idEquipo, uid)
    ) {
      return true;
    }
  }

  const idEquipo = await equipoVinculadoDelUsuario(id_proyecto, uid);
  if (!idEquipo) return false;

  const acceso: AccesoComentariosProyecto = { id_equipo: idEquipo };
  await setDoc(accesoRef, acceso);
  return true;
}

type AutorComentario = NonNullable<Comentario['autor']>;

/** Convierte un documento de Firestore al tipo que consume la interfaz. */
function mapearComentario(
  id: string,
  data: Record<string, unknown>,
  id_requerimiento: string,
  autores: Map<string, AutorComentario>
): Comentario {
  const idAutor = typeof data.id_autor === 'string' ? data.id_autor : '';
  const updatedAt = typeof data.updated_at === 'undefined' || data.updated_at === null
    ? null
    : fechaISO(data.updated_at) || null;
  return {
    id,
    id_requerimiento,
    id_proyecto: typeof data.id_proyecto === 'string' ? data.id_proyecto : '',
    id_autor: idAutor,
    texto: typeof data.texto === 'string' ? data.texto : '',
    created_at: fechaISO(data.created_at),
    updated_at: updatedAt,
    autor: idAutor ? autores.get(idAutor) || null : null
  };
}

/**
 * Autores del hilo, resueltos una sola vez por consulta o suscripción.
 *
 * `getAllUsers()` devuelve `[]` si la lectura falla, así que un fallo de perfiles
 * no tumba el hilo: los comentarios se muestran con «Usuario no disponible» en vez
 * de desaparecer.
 */
async function mapaDeAutores(): Promise<Map<string, AutorComentario>> {
  const usuarios = await getAllUsers();
  return new Map(usuarios.map(u => [u.id, u]));
}

/**
 * Ordena el hilo de más antiguo a más nuevo.
 *
 * No se delega en `orderBy('created_at')` porque conviven dos representaciones de
 * la misma fecha: `Timestamp` en los comentarios nuevos y cadena ISO en los que se
 * escribieron antes de este cambio. Firestore ordena por tipo antes que por valor,
 * así que una consulta ordenada dejaría todos los `Timestamp` antes que todas las
 * cadenas. Se normaliza en `mapearComentario` y se ordena aquí sobre el ISO.
 *
 * El desempate por `id` mantiene estable el orden de dos comentarios escritos en el
 * mismo milisegundo.
 */
function ordenarComentarios(comentarios: Comentario[]): Comentario[] {
  return [...comentarios].sort((a, b) => {
    const fechaA = Date.parse(a.created_at);
    const fechaB = Date.parse(b.created_at);
    if (Number.isNaN(fechaA) && Number.isNaN(fechaB)) return a.id.localeCompare(b.id);
    if (Number.isNaN(fechaA)) return 1;
    if (Number.isNaN(fechaB)) return -1;
    return fechaA - fechaB || a.id.localeCompare(b.id);
  });
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
    const snap = await getDocs(
      collection(db, 'requerimiento', id_requerimiento, 'comentario')
    );
    const autores = await mapaDeAutores();
    return ordenarComentarios(
      snap.docs.map(d =>
        mapearComentario(
          d.id,
          d.data() as Record<string, unknown>,
          id_requerimiento,
          autores
        )
      )
    );
  } catch (e) {
    console.error('Error fetching requirement comments:', e);
    throw e;
  }
}

/**
 * Suscripción en vivo al hilo mientras el modal está abierto (KAN-27).
 *
 * Sirve para que dos personas del proyecto no se pisen: si alguien publica, corrige
 * o borra mientras el otro tiene el hilo abierto, la lista se actualiza sin cerrar
 * y volver a abrir el modal. El contador de la tarjeta lo ajusta la página con la
 * longitud de cada emisión.
 *
 * `serverTimestamps: 'estimate'` es necesario porque un comentario recién escrito
 * llega primero como escritura local con `created_at` pendiente; sin la opción, el
 * campo valdría `null` hasta que el servidor confirmara y el comentario se colaría
 * al principio del hilo. Se pasa a `data()`, que es donde Firestore acepta esa
 * opción; `onSnapshot` solo admite `includeMetadataChanges`.
 *
 * Devuelve la función para cancelar la escucha; el llamador DEBE invocarla al
 * cerrar el modal y al desmontar la página.
 */
export function suscribirComentariosRequerimiento(
  id_requerimiento: string,
  onCambios: (comentarios: Comentario[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let cancelada = false;
  let version = 0;
  const autores = mapaDeAutores();

  const cancelar = onSnapshot(
    collection(db, 'requerimiento', id_requerimiento, 'comentario'),
    snapshot => {
      const actual = ++version;
      const documentos = snapshot.docs.map(d => ({
        id: d.id,
        data: d.data({ serverTimestamps: 'estimate' }) as Record<string, unknown>
      }));
      autores
        .then(mapa => {
          if (cancelada || actual !== version) return;
          onCambios(
            ordenarComentarios(
              documentos.map(d =>
                mapearComentario(d.id, d.data, id_requerimiento, mapa)
              )
            )
          );
        })
        .catch(e => {
          if (cancelada) return;
          onError?.(e instanceof Error ? e : new Error(String(e)));
        });
    },
    error => {
      if (!cancelada) onError?.(error);
    }
  );

  return () => {
    cancelada = true;
    cancelar();
  };
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
  if (!uid) {
    throw new Error('No hay una sesión activa: vuelve a iniciar sesión para comentar.');
  }
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

    const datos = requerimiento.data();
    const idProyecto = typeof datos?.id_proyecto === 'string' ? datos.id_proyecto : '';
    if (!idProyecto) {
      throw new Error(
        'El requerimiento no tiene proyecto asociado; no se puede publicar el comentario.'
      );
    }

    const nuevoRef = doc(comentariosRef);
    transaction.set(nuevoRef, {
      // Las reglas exigen que coincida con el proyecto del requerimiento del path:
      // así un comentario no se puede colgar de un proyecto ajeno cambiando el campo.
      id_proyecto: idProyecto,
      id_requerimiento,
      id_autor: uid,
      texto: limpio,
      // La fecha la pone el servidor. Con `new Date()` la del navegador podría ir
      // adelantada y desordenar el hilo; las reglas exigen `request.time`.
      created_at: serverTimestamp()
    });
    // Se calcula desde la lectura de la transacción y no con `increment`, para que
    // dos comentarios simultáneos no acaben ambos escribiendo el mismo número.
    transaction.update(requerimientoRef, {
      total_comentarios: contadorDe(datos) + 1
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
      // Igual que en el alta: la marca de corrección la pone el servidor y las
      // reglas la exigen igual a `request.time`.
      updated_at: serverTimestamp()
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
 * Referencias de los comentarios de un requerimiento, para poder borrarlos
 * después de que el requerimiento desaparezca.
 *
 * Esta lectura tiene que ocurrir ANTES de borrar el requerimiento o el proyecto.
 * La regla de `read` resuelve la membresía leyendo el requerimiento del path; si ya
 * no existe, la consulta se deniega y el servicio se quedaría sin saber qué
 * comentarios borrar. Una vez listadas, el borrado por ID sí funciona con el
 * requerimiento fuera, por la rama huérfana de `allow delete`.
 *
 * Firestore no hace cascada: borrar el documento no se lleva su subcolección, y un
 * hilo huérfano quedaría ahí para siempre.
 */
export async function listarComentariosDeRequerimiento(
  id_requerimiento: string
): Promise<DocumentReference[]> {
  const snap = await getDocs(
    collection(db, 'requerimiento', id_requerimiento, 'comentario')
  );
  return snap.docs.map(d => d.ref);
}

/**
 * Borra los comentarios ya listados, sin tocar el contador.
 *
 * Hay que llamarlo DESPUÉS de que el propio requerimiento se haya borrado, y esa
 * no es una preferencia de estilo: es la única forma de que las reglas lo permitan.
 * Una vez que el requerimiento desaparece, la membresía que autoriza el `delete` ya
 * no puede resolverse, así que las reglas admiten el borrado por la rama huérfana.
 * El mismo orden siguen `deleteRequerimiento` y `deleteProyecto`; el comentario que
 * lo explica está en `firestore.rules`.
 */
export async function borrarComentariosDeRequerimiento(
  comentarios: DocumentReference[]
): Promise<void> {
  for (const comentario of comentarios) {
    await deleteDoc(comentario);
  }
}

/**
 * Referencias de los punteros de acceso al hilo de un proyecto.
 *
 * Se listan antes de borrar el proyecto por la misma razón que los comentarios:
 * el `read` del puntero es libre para autenticados, pero el `delete` posterior
 * se apoya en la rama huérfana (`!exists(proyecto)`). Así el creador del
 * proyecto no necesita permiso especial sobre punteros ajenos para limpiarlos.
 */
export async function listarAccesosComentariosProyecto(
  id_proyecto: string
): Promise<DocumentReference[]> {
  const snap = await getDocs(
    collection(db, 'proyecto', id_proyecto, 'acceso_comentarios')
  );
  return snap.docs.map(d => d.ref);
}

/** Borra los punteros ya listados, después de que el proyecto desaparezca. */
export async function borrarAccesosComentariosProyecto(
  accesos: DocumentReference[]
): Promise<void> {
  for (const acceso of accesos) {
    await deleteDoc(acceso);
  }
}
