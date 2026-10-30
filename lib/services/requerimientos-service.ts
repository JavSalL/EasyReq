import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc,
  query, 
  where,
  runTransaction,
  writeBatch,
  type WriteBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { codigoRequerimiento } from '../requerimientos';
import {
  borrarComentariosDeRequerimiento,
  listarComentariosDeRequerimiento
} from './comentarios-service';
import { Requerimiento, LogRequerimiento } from '../database.types';
import { 
  getTiposRequerimientos, 
  getEstados, 
  getModalidades, 
  getModelos,
  idCatalogoPorNombre,
  ESTADO_PENDIENTE_APROBACION,
  ESTADO_APROBADO,
  ESTADO_RECHAZADO
} from './catalogos-service';
import { getAllUsers } from './usuarios-service';
import { getPatrones } from './patrones-service';

// ==========================================
// REQUERIMIENTOS
// ==========================================
export async function getRequerimientos(id_proyecto?: string): Promise<Requerimiento[]> {
  try {
    const q = id_proyecto 
      ? query(collection(db, 'requerimiento'), where('id_proyecto', '==', id_proyecto))
      : collection(db, 'requerimiento');
    const snap = await getDocs(q);
    
    const [tipos, estados, modalidades, modelos, usuarios, patrones] = await Promise.all([
      getTiposRequerimientos(),
      getEstados(),
      getModalidades(),
      getModelos(),
      getAllUsers(),
      getPatrones()
    ]);

    const tipoMap = new Map(tipos.map(t => [t.tipo_req, t]));
    const estadoMap = new Map(estados.map(e => [e.id, e]));
    const modMap = new Map(modalidades.map(m => [m.id, m]));
    const modelMap = new Map(modelos.map(m => [m.id, m]));
    const userMap = new Map(usuarios.map(u => [u.id, u]));
    const patronMap = new Map(patrones.map(p => [p.patron_id, p]));

    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        enunciado: data.enunciado || '',
        id_tipo_requerimiento: data.id_tipo_requerimiento || null,
        id_proyecto: data.id_proyecto,
        id_autor: data.id_autor || null,
        id_aprobador: data.id_aprobador || null,
        // KAN-18: sin esto, `id_equipo` llegaba siempre `undefined` y toda la
        // aprobación se apagaba en silencio. Es el getter el que decide qué campos
        // existen para la interfaz, así que añadir un campo al tipo no basta: si no
        // se copia aquí, el documento sí lo tiene y la pantalla no lo ve. Por eso
        // `tests/lib/requerimientos-aprobacion.test.ts` lee de este getter y no del
        // documento crudo.
        id_equipo: data.id_equipo || null,
        id_modalidad: data.id_modalidad || null,
        id_estado: data.id_estado || null,
        id_modelo: data.id_modelo || null,
        // KAN-28: patrón usado al redactar. Los documentos anteriores no lo
        // guardaban y se normaliza a null (el documento muestra "—").
        id_patron: (data.id_patron as string | null | undefined) ?? null,
        numero: typeof data.numero === 'number' ? data.numero : null,
        codigo: typeof data.codigo === 'string' ? data.codigo : null,
        // KAN-27: contador de comentarios. Igual que `id_equipo`, es un campo que
        // existe en el documento pero que la interfaz no ve si no se copia aquí:
        // el getter decide qué campos salen para la pantalla. Los documentos
        // anteriores a KAN-27 no lo traen y equivalen a cero.
        total_comentarios:
          typeof data.total_comentarios === 'number' ? data.total_comentarios : 0,
        // KAN-40: módulo, origen y prioridad de la generación con IA. Solo se aceptan los
        // valores que admiten las reglas; lo demás (o su ausencia) queda en null.
        modulo: typeof data.modulo === 'string' && data.modulo.trim() ? data.modulo : null,
        origen_ia: data.origen_ia === 'explicito' || data.origen_ia === 'inferido' ? data.origen_ia : null,
        prioridad: ['Must', 'Should', 'Could', 'Wont'].includes(data.prioridad) ? data.prioridad : null,
        reenviado_at: data.reenviado_at || null,
        created_at: data.created_at || new Date().toISOString(),

        tipo_requerimiento: data.id_tipo_requerimiento ? tipoMap.get(data.id_tipo_requerimiento) || null : null,
        estado: data.id_estado ? estadoMap.get(data.id_estado) || null : null,
        modalidad: data.id_modalidad ? modMap.get(data.id_modalidad) || null : null,
        modelo: data.id_modelo ? modelMap.get(data.id_modelo) || null : null,
        patron: data.id_patron ? patronMap.get(data.id_patron) || null : null,
        autor: data.id_autor ? userMap.get(data.id_autor) || null : null,
        aprobador: data.id_aprobador ? userMap.get(data.id_aprobador) || null : null
      };
    });
  } catch (e) {
    console.error('Error fetching requerimientos:', e);
    return [];
  }
}

// Campo del documento `proyecto` con la cantidad de requerimientos numerados.
const CONTADOR_REQUERIMIENTOS = 'contador_requerimientos';

/**
 * Los campos que el sistema impone al dar de alta un requerimiento (KAN-18).
 *
 * El autor es quien tiene la sesión y el estado inicial es "Pendiente de
 * aprobación": ninguno de los dos se le pregunta al formulario. Se resuelve en un
 * solo sitio y lo usan los dos caminos de alta, para que no puedan divergir.
 *
 * Los valores que traiga `data` en esos campos se descartan a propósito. La
 * interfaz ya no los ofrece, pero esto es la segunda línea: un cliente modificado
 * que los mandara escribiría algo distinto de lo que dice el documento.
 *
 * Si el catálogo no tiene el estado pendiente se lanza un error que lo explica. Las
 * reglas lo comparan por su texto, así que sin él la escritura sería denegada y el
 * usuario vería un `permission-denied` sin causa aparente.
 */
async function datosDeAlta(data: Partial<Requerimiento>, uid: string): Promise<Partial<Requerimiento>> {
  const idEstado = await idCatalogoPorNombre('estados', 'nombre_estado', ESTADO_PENDIENTE_APROBACION);
  if (!idEstado) {
    throw new Error(
      `Falta el estado "${ESTADO_PENDIENTE_APROBACION}" en el catálogo de estados. ` +
      'Pídeselo a quien administre el proyecto: sin él no se puede registrar ningún requerimiento.'
    );
  }
  return { ...data, id_autor: uid, id_estado: idEstado, id_aprobador: null };
}

/**
 * Crea el requerimiento con el siguiente número consecutivo de su proyecto. El
 * contador y el requerimiento se escriben en una sola transacción, así dos
 * personas que guardan a la vez nunca obtienen el mismo número.
 *
 * KAN-18: `uid` es el autor y el requerimiento nace pendiente de aprobación. Ninguno
 * de los dos se toma de `data`.
 */
export async function createRequerimiento(
  data: Partial<Requerimiento>,
  uid: string
): Promise<Requerimiento> {
  const alta = await datosDeAlta(data, uid);
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
      ...alta,
      ...(siguiente !== null ? { numero: siguiente, codigo: codigoRequerimiento(siguiente) } : {}),
      created_at
    });
    return siguiente;
  });

  return {
    ...(alta as Requerimiento),
    id: reqRef.id,
    numero,
    codigo: numero !== null ? codigoRequerimiento(numero) : null,
    created_at
  };
}

// Tope de requerimientos que se pueden renumerar en una sola transacción (Firestore admite 500 escrituras).
const MAX_RENUMERADOS = 450;

// Alta en lote (KAN-40): tamaño máximo de cada writeBatch (Firestore admite 500 escrituras).
const MAX_POR_LOTE = 450;
// Los logs se escriben en lotes más chicos: la regla de cada log lee su requerimiento, y un lote
// admite 20 lecturas de reglas en total.
const LOGS_POR_LOTE = 15;

/**
 * Escribe `ops` en writeBatch de hasta `tamano` operaciones, en orden. Si las reglas rechazan un
 * lote (`permission-denied`), se reintenta partido a la mitad: un lote grande puede pasarse del
 * límite de lecturas que las reglas admiten por petición aunque cada documento sea válido. Si ni
 * de uno en uno pasa, el error es real y se lanza. Devuelve cuántas operaciones se escribieron
 * antes de fallar (o todas).
 */
async function escribirEnLotes(
  ops: Array<(batch: WriteBatch) => void>,
  tamano: number,
  onProgreso?: (hechas: number) => void
): Promise<{ hechas: number; error?: unknown }> {
  let hechas = 0;
  let actual = tamano;
  while (hechas < ops.length) {
    const lote = ops.slice(hechas, hechas + actual);
    const batch = writeBatch(db);
    lote.forEach(op => op(batch));
    try {
      await batch.commit();
      hechas += lote.length;
      onProgreso?.(hechas);
    } catch (error) {
      if ((error as { code?: string })?.code === 'permission-denied' && actual > 1) {
        actual = Math.max(1, Math.floor(actual / 2));
        continue;
      }
      return { hechas, error };
    }
  }
  return { hechas };
}

/**
 * Registra varios requerimientos de una vez (generación con IA, KAN-40).
 *
 * Los números se reservan en UNA transacción sobre `contador_requerimientos` (el contador sube N
 * de golpe, así nadie más puede tomar esos números) y después los documentos se escriben en
 * writeBatch con su número ya asignado, cada uno con su log de creación. Si una parte falla, se
 * devuelven los que sí se guardaron y, si nadie tocó el contador entretanto, se liberan los
 * números que quedaron sin usar para no dejar huecos.
 *
 * KAN-18: igual que `createRequerimiento`, el autor es `uid` y todos nacen pendientes de aprobación.
 */
export async function crearRequerimientosEnLote(
  id_proyecto: string,
  items: Array<Partial<Requerimiento>>,
  uid: string,
  detallesLog: NonNullable<LogRequerimiento['detalles']>,
  onProgreso?: (hechos: number, total: number) => void
): Promise<{ creados: Requerimiento[]; error?: unknown; logsFallidos: number }> {
  if (items.length === 0) return { creados: [], logsFallidos: 0 };
  // El estado inicial se busca una sola vez para todo el lote.
  const comunes = await datosDeAlta({}, uid);
  const proyectoRef = doc(db, 'proyecto', id_proyecto);

  const base = await runTransaction(db, async transaction => {
    const proyecto = await transaction.get(proyectoRef);
    if (!proyecto.exists()) throw new Error('El proyecto ya no existe. Recarga la página.');
    const contador = (proyecto.data()[CONTADOR_REQUERIMIENTOS] as number | undefined) ?? 0;
    transaction.update(proyectoRef, { [CONTADOR_REQUERIMIENTOS]: contador + items.length });
    return contador;
  });

  const created_at = new Date().toISOString();
  const nuevos = items.map((item, i) => {
    const numero = base + i + 1;
    return {
      ref: doc(collection(db, 'requerimiento')),
      datos: {
        // Firestore no admite campos `undefined`: los opcionales sin valor no se escriben.
        ...Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined)),
        ...comunes,
        id_proyecto,
        numero,
        codigo: codigoRequerimiento(numero),
        created_at
      } as Omit<Requerimiento, 'id'>
    };
  });

  const { hechas, error } = await escribirEnLotes(
    nuevos.map(n => batch => batch.set(n.ref, n.datos)),
    MAX_POR_LOTE,
    hechas => onProgreso?.(hechas, items.length)
  );

  if (hechas < items.length) {
    // Libera los números que no se usaron, solo si el contador sigue donde se dejó.
    await runTransaction(db, async transaction => {
      const proyecto = await transaction.get(proyectoRef);
      if (proyecto.exists() && proyecto.data()[CONTADOR_REQUERIMIENTOS] === base + items.length) {
        transaction.update(proyectoRef, { [CONTADOR_REQUERIMIENTOS]: base + hechas });
      }
    }).catch(e => console.error('No se pudieron liberar los números reservados:', e));
  }

  const creados = nuevos.slice(0, hechas).map(n => ({ ...n.datos, id: n.ref.id }) as Requerimiento);
  const fecha_hora = new Date().toISOString();
  const logs = await escribirEnLotes(
    creados.map(r => batch => batch.set(doc(collection(db, 'logs_requerimientos')), {
      id_requerimiento: r.id,
      accion: 'Creación de requerimiento',
      id_autor: uid,
      fecha_hora,
      detalles: { ...detallesLog, enunciado_nuevo: r.enunciado }
    })),
    LOGS_POR_LOTE
  );
  if (logs.error) console.error('Error recording bulk creation logs:', logs.error);

  return { creados, error, logsFallidos: creados.length - logs.hechas };
}

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
  autor: string
): Promise<{ requerimiento: Requerimiento; renumerados: number }> {
  const MENSAJE_CONFLICTO = 'Otra persona cambió los requerimientos mientras guardabas. Recarga la página e inténtalo de nuevo.';
  // KAN-18: mismo tratamiento que `createRequerimiento`. Insertar en medio es otro
  // camino de alta y si se dejara sin forzar, quien lo usara podría crearse un
  // requerimiento ya aprobado saltándose la fila de la tabla.
  const alta = await datosDeAlta(data, autor);
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
    transaction.set(reqRef, { ...alta, numero: nuevoNumero, codigo: codigoRequerimiento(nuevoNumero), created_at });
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
            id_autor: autor,
            detalles: {
              de: codigoRequerimiento(s.numero),
              a: codigoRequerimiento(s.numero + 1),
              motivo: `Se insertó ${codigoRequerimiento(nuevoNumero)}`
            }
          })
        )
      );
    }
  })().catch(error => {
    console.error('Error recording requirement renumbering logs:', error);
  });

  return {
    requerimiento: {
      ...alta,
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

/**
 * Guarda una edición y su auditoría juntas. Así una modificación del enunciado
 * nunca queda sin los textos anterior y nuevo en el historial.
 */
export async function actualizarRequerimientoConHistorial(
  id: string,
  data: Partial<Requerimiento>,
  id_autor: string,
  campos: string[],
  cambiosClasificacion?: NonNullable<LogRequerimiento['detalles']>['cambios_clasificacion']
): Promise<void> {
  const requerimientoRef = doc(db, 'requerimiento', id);
  const logRef = doc(collection(db, 'logs_requerimientos'));
  const fecha_hora = new Date().toISOString();

  await runTransaction(db, async transaction => {
    const requerimiento = await transaction.get(requerimientoRef);
    if (!requerimiento.exists()) {
      throw new Error('No se encontró el requerimiento que intentas editar.');
    }

    const enunciadoAnterior = requerimiento.data().enunciado;
    const detalles: NonNullable<LogRequerimiento['detalles']> = { campos };
    if (cambiosClasificacion?.length) {
      detalles.cambios_clasificacion = cambiosClasificacion;
    }
    if (
      typeof data.enunciado === 'string' &&
      typeof enunciadoAnterior === 'string' &&
      data.enunciado !== enunciadoAnterior
    ) {
      detalles.enunciado_anterior = enunciadoAnterior;
      detalles.enunciado_nuevo = data.enunciado;
    }

    transaction.update(requerimientoRef, data);
    transaction.set(logRef, {
      id_requerimiento: id,
      accion: 'Edición de requerimiento',
      id_autor,
      fecha_hora,
      detalles
    });
  });
}

/**
 * Restaura el enunciado y registra la transición en una sola transacción.
 * Devuelve false si el requerimiento ya contiene ese texto.
 */
export async function restaurarVersionRequerimiento(
  id: string,
  log: LogRequerimiento,
  id_autor: string
): Promise<boolean> {
  const requerimientoRef = doc(db, 'requerimiento', id);
  const logRef = doc(collection(db, 'logs_requerimientos'));
  const fecha_hora = new Date().toISOString();
  const camposClasificacion: Record<string, keyof Pick<
    Requerimiento,
    'id_tipo_requerimiento' | 'id_modalidad' | 'id_modelo' | 'id_patron'
  >> = {
    tipo: 'id_tipo_requerimiento',
    modalidad: 'id_modalidad',
    modelo: 'id_modelo',
    patrón: 'id_patron'
  };

  return runTransaction(db, async transaction => {
    const requerimiento = await transaction.get(requerimientoRef);
    if (!requerimiento.exists()) {
      throw new Error('No se encontró el requerimiento que intentas restaurar.');
    }

    const actual = requerimiento.data() as Requerimiento;
    const actualizacion: Partial<Requerimiento> = {};
    const camposRestaurados: string[] = [];
    const cambiosClasificacion: NonNullable<LogRequerimiento['detalles']>['cambios_clasificacion'] = [];
    const enunciadoRestaurado = log.detalles?.enunciado_anterior;

    if (typeof enunciadoRestaurado === 'string' && actual.enunciado !== enunciadoRestaurado) {
      actualizacion.enunciado = enunciadoRestaurado;
      camposRestaurados.push('enunciado');
    }

    const cambiosOriginales = Array.isArray(log.detalles?.cambios_clasificacion)
      ? log.detalles.cambios_clasificacion
      : [];
    for (const cambio of cambiosOriginales) {
      const campoReq = camposClasificacion[cambio.campo];
      const tieneValorAnterior = typeof cambio.anteriorId === 'string' || cambio.anteriorId === null;
      if (!campoReq || !tieneValorAnterior || typeof cambio.anterior !== 'string') continue;

      const valorActual = actual[campoReq] ?? null;
      const valorRestaurado = cambio.anteriorId;
      if (valorActual === valorRestaurado) continue;

      actualizacion[campoReq] = valorRestaurado;
      camposRestaurados.push(cambio.campo);
      cambiosClasificacion.push({
        campo: cambio.campo,
        anterior: valorActual === cambio.nuevoId
          ? cambio.nuevo
          : valorActual || `Valor no disponible (${cambio.campo})`,
        nuevo: cambio.anterior,
        anteriorId: valorActual,
        nuevoId: valorRestaurado
      });
    }

    if (camposRestaurados.length === 0) return false;

    transaction.update(requerimientoRef, actualizacion);
    const detalles: NonNullable<LogRequerimiento['detalles']> = {
      campos: camposRestaurados,
      restauracion: true
    };
    if (typeof enunciadoRestaurado === 'string' && typeof actual.enunciado === 'string' &&
        actual.enunciado !== enunciadoRestaurado) {
      detalles.enunciado_anterior = actual.enunciado;
      detalles.enunciado_nuevo = enunciadoRestaurado;
    }
    if (cambiosClasificacion.length > 0) {
      detalles.cambios_clasificacion = cambiosClasificacion;
    }
    transaction.set(logRef, {
      id_requerimiento: id,
      accion: 'Restauración de versión',
      id_autor,
      fecha_hora,
      detalles
    });
    return true;
  });
}

/**
 * Devuelve un requerimiento rechazado al ciclo de aprobación (KAN-18).
 *
 * Lo llama su autor después de corregirlo. El estado vuelve a "Pendiente de
 * aprobación" y se sella `reenviado_at`, que la tarjeta usa para distinguir un
 * reenvío de un alta. No toca autor ni aprobador: son de otras reglas.
 */
export async function reenviarRequerimientoAprobacion(id: string): Promise<void> {
  const idEstado = await idCatalogoPorNombre('estados', 'nombre_estado', ESTADO_PENDIENTE_APROBACION);
  if (!idEstado) {
    throw new Error(
      `Falta el estado "${ESTADO_PENDIENTE_APROBACION}" en el catálogo de estados. ` +
      'Pídeselo a quien administre el proyecto.'
    );
  }
  await updateDoc(doc(db, 'requerimiento', id), {
    id_estado: idEstado,
    reenviado_at: new Date().toISOString()
  });
}

/**
 * Aprueba o rechaza un requerimiento pendiente (KAN-18).
 *
 * `aprobar` deja el líder como aprobador; `rechazar` lo deja en `null` y así se
 * escribe a propósito: quien rechaza no aprobó, y un rechazo con nombre de
 * aprobador se mostraría como "Aprobado por" en la tarjeta.
 *
 * No se comprueba aquí si quien llama es líder del equipo: eso lo decide
 * `esDecisionDelAprobador` en `firestore.rules`, que es donde manda. Esta función
 * solo compone la escritura; si el permiso falta, el backend deniega.
 */
export async function decidirAprobacionRequerimiento(
  id: string,
  decision: 'aprobar' | 'rechazar',
  uid: string
): Promise<void> {
  const nombreEstado = decision === 'aprobar' ? ESTADO_APROBADO : ESTADO_RECHAZADO;
  const idEstado = await idCatalogoPorNombre('estados', 'nombre_estado', nombreEstado);
  if (!idEstado) {
    throw new Error(`Falta el estado "${nombreEstado}" en el catálogo de estados. Pídeselo a quien administre el proyecto.`);
  }
  await updateDoc(doc(db, 'requerimiento', id), {
    id_estado: idEstado,
    id_aprobador: decision === 'aprobar' ? uid : null
  });
}

export async function deleteRequerimiento(id: string, id_autor: string): Promise<number> {
  const requerimientoRef = doc(db, 'requerimiento', id);
  const requerimiento = await getDoc(requerimientoRef);
  if (!requerimiento.exists()) return 0;

  const id_proyecto = requerimiento.data().id_proyecto;
  if (typeof id_proyecto !== 'string') {
    throw new Error('No se pudo determinar el proyecto del requerimiento que intentas eliminar.');
  }

  // El hilo se lista ANTES de borrar el requerimiento. La regla de lectura de
  // comentarios resuelve la membresía con el requerimiento del path: una vez
  // borrado, la consulta se deniega y no habría forma de enumerar qué borrar.
  const comentarios = await listarComentariosDeRequerimiento(id);

  const proyectoRef = doc(db, 'proyecto', id_proyecto);
  const proyectoInicial = await getDoc(proyectoRef);
  const contadorInicial = proyectoInicial.exists()
    ? proyectoInicial.data()[CONTADOR_REQUERIMIENTOS] ?? null
    : null;
  const requerimientos = await getDocs(
    query(collection(db, 'requerimiento'), where('id_proyecto', '==', id_proyecto))
  );
  const objetivoIncluido = requerimientos.docs.some(snapshot => snapshot.id === id);
  if (!objetivoIncluido) {
    throw new Error('Los requerimientos cambiaron mientras eliminabas. Recarga la página e inténtalo de nuevo.');
  }

  const restantes = requerimientos.docs
    .filter(snapshot => snapshot.id !== id)
    .map(snapshot => ({
      ref: snapshot.ref,
      id: snapshot.id,
      numero: snapshot.data().numero,
      codigo: snapshot.data().codigo,
      created_at: snapshot.data().created_at
    }))
    .sort((a, b) => {
      const numeroA = typeof a.numero === 'number' ? a.numero : Number.POSITIVE_INFINITY;
      const numeroB = typeof b.numero === 'number' ? b.numero : Number.POSITIVE_INFINITY;
      return numeroA - numeroB ||
        String(a.created_at || '').localeCompare(String(b.created_at || '')) ||
        a.id.localeCompare(b.id);
    });
  const cambios = restantes.flatMap((req, index) => {
    const numero = index + 1;
    const codigo = codigoRequerimiento(numero);
    if (req.numero === numero && req.codigo === codigo) return [];
    return [{ ...req, nuevoNumero: numero, nuevoCodigo: codigo }];
  });

  if (cambios.length > MAX_RENUMERADOS) {
    throw new Error(
      `No se puede compactar la numeración: hay ${cambios.length} requerimientos por renumerar ` +
      `y el límite por operación es ${MAX_RENUMERADOS}.`
    );
  }

  const renumerados = await runTransaction(db, async transaction => {
    const [proyectoActual, requerimientoActual, ...documentosPorRenumerar] = await Promise.all([
      transaction.get(proyectoRef),
      transaction.get(requerimientoRef),
      ...cambios.map(req => transaction.get(req.ref))
    ]);
    const contadorActual = proyectoActual.exists()
      ? proyectoActual.data()[CONTADOR_REQUERIMIENTOS] ?? null
      : null;
    if (
      !requerimientoActual.exists() ||
      !Object.is(contadorActual, contadorInicial) ||
      documentosPorRenumerar.some((snapshot, index) =>
        !snapshot.exists() ||
        snapshot.data().numero !== cambios[index].numero ||
        snapshot.data().codigo !== cambios[index].codigo
      )
    ) {
      throw new Error('Los requerimientos cambiaron mientras eliminabas. Recarga la página e inténtalo de nuevo.');
    }

    cambios.forEach(req => {
      transaction.update(req.ref, { numero: req.nuevoNumero, codigo: req.nuevoCodigo });
    });
    transaction.delete(requerimientoRef);
    if (proyectoActual.exists()) {
      transaction.update(proyectoRef, { [CONTADOR_REQUERIMIENTOS]: restantes.length });
    }

    return cambios.map(req => ({
      id: req.id,
      de: typeof req.codigo === 'string' ? req.codigo : codigoRequerimiento(req.numero),
      a: req.nuevoCodigo
    }));
  });

  // El requerimiento ya no existe (la transacción lo borró), así que los
  // comentarios listados al principio se pueden borrar por la rama huérfana de las
  // reglas. El orden no es casual: ver `listarComentariosDeRequerimiento`.
  //
  // Se espera, no se dispara a ciegas, porque el criterio del ticket es que al
  // borrar el requerimiento se borren sus comentarios. Si esto falla, el
  // requerimiento ya se habrá ido y el hilo quedará huérfano, pero todavía borrable
  // por cualquiera, así que no queda nada irrecuperable.
  await borrarComentariosDeRequerimiento(comentarios);

  if (renumerados.length > 0) {
    void Promise.all(
      renumerados.map(req =>
        addLogRequerimiento({
          id_requerimiento: req.id,
          accion: 'Renumeración',
          id_autor,
          detalles: { de: req.de, a: req.a, motivo: 'Se eliminó un requerimiento anterior' }
        })
      )
    ).catch(error => {
      console.error('Error recording requirement renumbering logs after deletion:', error);
    });
  }

  return renumerados.length;
}

// ==========================================
// LOGS DE REQUERIMIENTOS
// ==========================================
export async function addLogRequerimiento(data: {
  id_requerimiento: string;
  accion: string;
  id_autor: string | null;
  detalles?: LogRequerimiento['detalles'];
}): Promise<void> {
  await addDoc(collection(db, 'logs_requerimientos'), {
    ...data,
    fecha_hora: new Date().toISOString()
  });
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
        fecha_hora: typeof data.fecha_hora === 'string' ? data.fecha_hora : '',
        detalles: data.detalles,
        autor: data.id_autor ? userMap.get(data.id_autor) || null : null
      };
    });

    return logs.sort((a, b) =>
      (Date.parse(b.fecha_hora) || 0) - (Date.parse(a.fecha_hora) || 0)
    );
  } catch (e) {
    console.error('Error fetching logs:', e);
    throw e;
  }
}
