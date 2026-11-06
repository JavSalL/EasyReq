import {
  collection,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  addDoc,
  query,
  where,
  documentId,
  writeBatch,
  runTransaction,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  Equipo,
  ProyectoEquipo,
  EstadoEquipoProyecto,
  MiembroEquipo,
  MiembroProyectoEquipo,
  EstadoMiembroProyecto,
  InvitacionEquipo,
  SolicitudProyectoEquipo,
  LogIntegrante,
  AccionLogIntegrante,
  DetallesLogIntegrante,
  Rol,
  Proyecto,
  UUID,
} from '../database.types';
import { getAllUsers } from './usuarios-service';
import { getRoles } from './catalogos-service';

/** Tope de valores en una consulta `in` de Firestore. */
const MAX_EN_UNA_IN = 30;

export function getProyectoEquipoDocId(id_proyecto: string, id_equipo: string): string {
  return `${id_proyecto}_${id_equipo}`;
}

export function getMiembroEquipoDocId(id_equipo: string, id_usuario: string): string {
  return `${id_equipo}_${id_usuario}`;
}

export function getMiembroProyectoEquipoDocId(
  id_proyecto: string,
  id_equipo: string,
  id_usuario: string
): string {
  return `${id_proyecto}_${id_equipo}_${id_usuario}`;
}

/** Determina si un documento `proyecto_equipos` está activo (retrocompatible con documentos sin `estado`). */
export function esVinculoEquipoActivo(
  data: Record<string, unknown> | ProyectoEquipo | null | undefined
): boolean {
  if (!data) return false;
  const estado = (data as { estado?: string }).estado;
  return (estado ?? 'activo') === 'activo';
}

// ==========================================
// EQUIPOS GLOBALES
// ==========================================
export async function getEquipos(): Promise<Equipo[]> {
  try {
    const snap = await getDocs(collection(db, 'equipo'));
    return snap.docs.map(d => ({
      equipo_id: d.id,
      nombre: d.data().nombre,
      descripcion: d.data().descripcion || '',
      id_creador: d.data().id_creador || null,
      id_proyecto: (d.data().id_proyecto as string | undefined) ?? null,
      created_at: d.data().created_at || new Date().toISOString(),
    }));
  } catch (e) {
    console.error('Error fetching equipos:', e);
    return [];
  }
}

export async function createEquipo(data: {
  nombre: string;
  descripcion?: string;
  id_creador: string;
  id_rol_lider: string;
}): Promise<Equipo> {
  if (!data.id_creador || !data.id_rol_lider) {
    throw new Error('Se requiere un creador y un rol de líder para crear el equipo');
  }

  const docRef = doc(collection(db, 'equipo'));
  const memberRef = doc(db, 'miembros_equipo', getMiembroEquipoDocId(docRef.id, data.id_creador));
  const logRef = doc(collection(db, 'logs_integrantes'));
  const createdAt = new Date().toISOString();
  const batch = writeBatch(db);

  batch.set(docRef, {
    nombre: data.nombre,
    // Firestore rechaza campos con valor `undefined`
    descripcion: data.descripcion ?? '',
    id_creador: data.id_creador,
    created_at: createdAt,
  });
  batch.set(memberRef, {
    id_equipo: docRef.id,
    id_usuario: data.id_creador,
    id_rol: data.id_rol_lider,
    id_roles: [data.id_rol_lider],
    joined_at: createdAt,
  });
  batch.set(logRef, {
    id_equipo: docRef.id,
    id_proyecto: null,
    id_usuario_afectado: data.id_creador,
    accion: 'alta' satisfies AccionLogIntegrante,
    id_autor: data.id_creador,
    id_lider_en_momento: data.id_creador,
    fecha_hora: createdAt,
    detalles: {
      roles_nuevos: [data.id_rol_lider],
      nota: 'Creación del equipo global y asignación de líder fundador',
    },
  });
  await batch.commit();

  return {
    equipo_id: docRef.id,
    nombre: data.nombre,
    descripcion: data.descripcion || '',
    id_creador: data.id_creador,
    created_at: createdAt,
  };
}

/**
 * Crea un equipo global y lo vincula inmediatamente en estado `'activo'` al proyecto dado,
 * inicializando también la ficha local del líder en `miembros_proyecto_equipo`.
 */
export async function createEquipoEnProyecto(data: {
  nombre: string;
  descripcion?: string;
  id_proyecto: string;
  id_creador: string;
  id_rol_lider: string;
}): Promise<Equipo> {
  if (!data.id_proyecto || !data.id_creador || !data.id_rol_lider) {
    throw new Error('Se requiere un proyecto, un creador y un rol de líder para crear el equipo');
  }

  const docRef = doc(collection(db, 'equipo'));
  const memberRef = doc(db, 'miembros_equipo', getMiembroEquipoDocId(docRef.id, data.id_creador));
  const vinculoRef = doc(db, 'proyecto_equipos', getProyectoEquipoDocId(data.id_proyecto, docRef.id));
  const miembroLocalRef = doc(
    db,
    'miembros_proyecto_equipo',
    getMiembroProyectoEquipoDocId(data.id_proyecto, docRef.id, data.id_creador)
  );
  const logGlobalRef = doc(collection(db, 'logs_integrantes'));
  const logLocalRef = doc(collection(db, 'logs_integrantes'));
  const createdAt = new Date().toISOString();
  const batch = writeBatch(db);

  batch.set(docRef, {
    nombre: data.nombre,
    descripcion: data.descripcion ?? '',
    id_creador: data.id_creador,
    created_at: createdAt,
  });
  batch.set(memberRef, {
    id_equipo: docRef.id,
    id_usuario: data.id_creador,
    id_rol: data.id_rol_lider,
    id_roles: [data.id_rol_lider],
    joined_at: createdAt,
  });
  batch.set(vinculoRef, {
    id_proyecto: data.id_proyecto,
    id_equipo: docRef.id,
    estado: 'activo' satisfies EstadoEquipoProyecto,
    vinculado_at: createdAt,
  });
  batch.set(miembroLocalRef, {
    id_proyecto: data.id_proyecto,
    id_equipo: docRef.id,
    id_usuario: data.id_creador,
    id_rol: data.id_rol_lider,
    id_roles: [data.id_rol_lider],
    estado: 'activo' satisfies EstadoMiembroProyecto,
    es_local: false,
    updated_at: createdAt,
  });
  batch.set(logGlobalRef, {
    id_equipo: docRef.id,
    id_proyecto: null,
    id_usuario_afectado: data.id_creador,
    accion: 'alta' satisfies AccionLogIntegrante,
    id_autor: data.id_creador,
    id_lider_en_momento: data.id_creador,
    fecha_hora: createdAt,
    detalles: {
      roles_nuevos: [data.id_rol_lider],
      nota: 'Creación del equipo global',
    },
  });
  batch.set(logLocalRef, {
    id_equipo: docRef.id,
    id_proyecto: data.id_proyecto,
    id_usuario_afectado: data.id_creador,
    accion: 'clonado_proyecto' satisfies AccionLogIntegrante,
    id_autor: data.id_creador,
    id_lider_en_momento: data.id_creador,
    fecha_hora: createdAt,
    detalles: {
      roles_nuevos: [data.id_rol_lider],
      estado_nuevo: 'activo',
      es_local: false,
    },
  });
  await batch.commit();

  return {
    equipo_id: docRef.id,
    nombre: data.nombre,
    descripcion: data.descripcion || '',
    id_creador: data.id_creador,
    created_at: createdAt,
  };
}

export async function updateEquipo(id: string, data: { nombre: string; descripcion?: string }): Promise<void> {
  await updateDoc(doc(db, 'equipo', id), {
    nombre: data.nombre,
    descripcion: data.descripcion ?? '',
  });
}

export async function deleteEquipo(id: string): Promise<void> {
  await deleteDoc(doc(db, 'equipo', id));
  const [peSnap, mpeSnap, requestsSnap, invitationsSnap, mbSnap, logsSnap] = await Promise.all([
    getDocs(query(collection(db, 'proyecto_equipos'), where('id_equipo', '==', id))),
    getDocs(query(collection(db, 'miembros_proyecto_equipo'), where('id_equipo', '==', id))),
    getDocs(query(collection(db, 'solicitudes_proyecto_equipo'), where('id_equipo', '==', id))),
    getDocs(query(collection(db, 'invitaciones_equipo'), where('id_equipo', '==', id))),
    getDocs(query(collection(db, 'miembros_equipo'), where('id_equipo', '==', id))),
    getDocs(query(collection(db, 'logs_integrantes'), where('id_equipo', '==', id))),
  ]);
  for (const d of peSnap.docs) await deleteDoc(d.ref);
  for (const d of mpeSnap.docs) await deleteDoc(d.ref);
  for (const d of requestsSnap.docs) await deleteDoc(d.ref);
  for (const d of invitationsSnap.docs) await deleteDoc(d.ref);
  for (const d of mbSnap.docs) await deleteDoc(d.ref);
  for (const d of logsSnap.docs) await deleteDoc(d.ref);
}

// ==========================================
// RELACIONES PROYECTO <-> EQUIPO (CON ESTADO)
// ==========================================
export async function getProyectoEquipos(soloActivos = true): Promise<ProyectoEquipo[]> {
  try {
    const snap = await getDocs(collection(db, 'proyecto_equipos'));
    const lista = snap.docs.map(d => {
      const data = d.data();
      return {
        id_proyecto: data.id_proyecto,
        id_equipo: data.id_equipo,
        estado: ((data.estado as EstadoEquipoProyecto | undefined) ?? 'activo'),
        id_solicitud: (data.id_solicitud as string | null | undefined) ?? null,
        vinculado_at: data.vinculado_at as string | undefined,
        desvinculado_at: (data.desvinculado_at as string | null | undefined) ?? null,
      } satisfies ProyectoEquipo;
    });
    return soloActivos ? lista.filter(pe => pe.estado === 'activo') : lista;
  } catch (e) {
    console.error('Error fetching proyecto_equipos:', e);
    return [];
  }
}

/**
 * Devuelve los vínculos `proyecto_equipos` de un proyecto con su `estado` (`'activo' | 'desvinculado'`)
 * y el objeto `Equipo` hidratado.
 */
export async function getVinculosEquiposDeProyecto(
  id_proyecto: string,
  incluirDesvinculados = true
): Promise<ProyectoEquipo[]> {
  if (!id_proyecto) return [];
  try {
    const vinculosSnap = await getDocs(
      query(collection(db, 'proyecto_equipos'), where('id_proyecto', '==', id_proyecto))
    );
    const vinculos: ProyectoEquipo[] = vinculosSnap.docs
      .map(d => {
        const data = d.data();
        return {
          id_proyecto: data.id_proyecto as string,
          id_equipo: data.id_equipo as string,
          estado: ((data.estado as EstadoEquipoProyecto | undefined) ?? 'activo'),
          id_solicitud: (data.id_solicitud as string | null | undefined) ?? null,
          vinculado_at: data.vinculado_at as string | undefined,
          desvinculado_at: (data.desvinculado_at as string | null | undefined) ?? null,
        };
      })
      .filter(v => Boolean(v.id_equipo) && (incluirDesvinculados || v.estado === 'activo'));

    const idsEquipos = [...new Set(vinculos.map(v => v.id_equipo))];
    const equiposMap = new Map<string, Equipo>();
    for (let i = 0; i < idsEquipos.length; i += MAX_EN_UNA_IN) {
      const lote = idsEquipos.slice(i, i + MAX_EN_UNA_IN);
      const snap = await getDocs(
        query(collection(db, 'equipo'), where(documentId(), 'in', lote))
      );
      for (const d of snap.docs) {
        equiposMap.set(d.id, { ...(d.data() as Omit<Equipo, 'equipo_id'>), equipo_id: d.id });
      }
    }

    return vinculos
      .map(v => ({
        ...v,
        equipo: equiposMap.get(v.id_equipo),
      }))
      .filter(v => Boolean(v.equipo));
  } catch (e) {
    console.error('Error fetching vínculos de equipos del proyecto:', e);
    return [];
  }
}

/**
 * Equipos activos (o todos si `incluirDesvinculados` es `true`) que pertenecen a un proyecto.
 * Soporta tanto el vínculo estándar en `proyecto_equipos` (con `estado === 'activo'`) como
 * documentos legacy que aún tuvieran `equipo.id_proyecto`.
 */
export async function getEquiposDelProyecto(
  id_proyecto: string,
  incluirDesvinculados = false
): Promise<Equipo[]> {
  if (!id_proyecto) return [];
  try {
    const [directos, vinculos] = await Promise.all([
      getDocs(query(collection(db, 'equipo'), where('id_proyecto', '==', id_proyecto))),
      getDocs(query(collection(db, 'proyecto_equipos'), where('id_proyecto', '==', id_proyecto))),
    ]);

    const desvinculados = new Set<string>();
    const idsActivosPorVinculo: string[] = [];
    for (const vinculo of vinculos.docs) {
      const data = vinculo.data();
      const idEquipo = data.id_equipo as UUID | undefined;
      if (!idEquipo) continue;
      if (!incluirDesvinculados && !esVinculoEquipoActivo(data)) {
        desvinculados.add(idEquipo);
        continue;
      }
      if (!idsActivosPorVinculo.includes(idEquipo)) {
        idsActivosPorVinculo.push(idEquipo);
      }
    }

    const docsDirectos = directos.docs.filter(d => !desvinculados.has(d.id));
    const yaTraidos = new Set(docsDirectos.map(d => d.id));
    const faltan = idsActivosPorVinculo.filter(id => !yaTraidos.has(id));

    const porVinculo: Array<{ id: string; data: () => Record<string, unknown> }> = [];
    for (let i = 0; i < faltan.length; i += MAX_EN_UNA_IN) {
      const lote = faltan.slice(i, i + MAX_EN_UNA_IN);
      const snap = await getDocs(query(collection(db, 'equipo'), where(documentId(), 'in', lote)));
      porVinculo.push(...snap.docs);
    }

    return [...docsDirectos, ...porVinculo].map(d => ({ ...d.data(), equipo_id: d.id } as Equipo));
  } catch (e) {
    console.error('Error fetching los equipos del proyecto:', e);
    return [];
  }
}

/**
 * Clona o sincroniza la plantilla global de `miembros_equipo` hacia `miembros_proyecto_equipo`
 * para el proyecto dado, preservando las fichas locales que ya existieran si `respetarExistentes` es `true`.
 */
export async function sincronizarPlantillaEquipoEnProyecto(
  id_proyecto: string,
  id_equipo: string,
  id_autor?: string | null,
  respetarExistentes = true
): Promise<MiembroProyectoEquipo[]> {
  if (!id_proyecto || !id_equipo) return [];
  const [plantillaSnap, localesSnap] = await Promise.all([
    getDocs(query(collection(db, 'miembros_equipo'), where('id_equipo', '==', id_equipo))),
    getDocs(
      query(
        collection(db, 'miembros_proyecto_equipo'),
        where('id_proyecto', '==', id_proyecto),
        where('id_equipo', '==', id_equipo)
      )
    ),
  ]);

  const existentesMap = new Map<string, Record<string, unknown>>();
  for (const d of localesSnap.docs) {
    existentesMap.set(d.id, d.data());
  }

  const ahora = new Date().toISOString();
  const autor = id_autor ?? auth.currentUser?.uid ?? null;
  const batch = writeBatch(db);
  let huboEscrituras = false;

  // Identificar al líder actual del equipo global para el registro de auditoría
  let idLiderGlobal: string | null = null;
  const roles = await getRoles();
  const esLiderId = (idRol: string | null | undefined) =>
    Boolean(idRol && esRolLider(roles.find(r => r.id === idRol)?.nombre_rol));

  for (const d of plantillaSnap.docs) {
    const data = d.data();
    const idRoles: string[] = Array.isArray(data.id_roles)
      ? data.id_roles
      : data.id_rol
        ? [data.id_rol]
        : [];
    if (!idLiderGlobal && idRoles.some(r => esLiderId(r))) {
      idLiderGlobal = data.id_usuario;
    }
  }

  for (const d of plantillaSnap.docs) {
    const data = d.data();
    const idUsuario = data.id_usuario as string;
    if (!idUsuario) continue;
    const docId = getMiembroProyectoEquipoDocId(id_proyecto, id_equipo, idUsuario);
    if (respetarExistentes && existentesMap.has(docId)) continue;

    const idRoles: string[] = Array.isArray(data.id_roles)
      ? data.id_roles
      : data.id_rol
        ? [data.id_rol]
        : [];
    const ordenados = await ordenarRolesLiderPrimero(idRoles);

    batch.set(doc(db, 'miembros_proyecto_equipo', docId), {
      id_proyecto,
      id_equipo,
      id_usuario: idUsuario,
      id_rol: ordenados[0] ?? null,
      id_roles: ordenados,
      estado: 'activo' satisfies EstadoMiembroProyecto,
      es_local: false,
      updated_at: ahora,
    });
    batch.set(doc(collection(db, 'logs_integrantes')), {
      id_equipo,
      id_proyecto,
      id_usuario_afectado: idUsuario,
      accion: 'clonado_proyecto' satisfies AccionLogIntegrante,
      id_autor: autor ?? idUsuario,
      id_lider_en_momento: idLiderGlobal,
      fecha_hora: ahora,
      detalles: {
        roles_nuevos: ordenados,
        estado_nuevo: 'activo',
        es_local: false,
      },
    });
    huboEscrituras = true;
  }

  if (huboEscrituras) {
    await batch.commit();
  }

  return getMiembrosProyectoEquipo(id_proyecto, id_equipo, true);
}

/**
 * Asigna un equipo global a un proyecto:
 * - Si `userId` (creador del proyecto) es además líder del equipo global, lo vincula o reactiva
 *   de forma inmediata (`estado: 'activo'`) y clona su plantilla en `miembros_proyecto_equipo`.
 * - Si el equipo está liderado por otro usuario, envía una solicitud en `solicitudes_proyecto_equipo`.
 */
export async function asignarEquipoAProyecto(
  id_proyecto: string,
  id_equipo: string,
  userId: string
): Promise<{ modo: 'directo' | 'solicitud' }> {
  if (!id_proyecto || !id_equipo || !userId) {
    throw new Error('Faltan datos para asignar el equipo al proyecto');
  }

  const [projectSnap, teamSnap, vinculoSnap, esLider] = await Promise.all([
    getDoc(doc(db, 'proyecto', id_proyecto)),
    getDoc(doc(db, 'equipo', id_equipo)),
    getDoc(doc(db, 'proyecto_equipos', getProyectoEquipoDocId(id_proyecto, id_equipo))),
    isLiderDeEquipo(userId, id_equipo),
  ]);

  if (!projectSnap.exists() || !teamSnap.exists()) {
    throw new Error('El proyecto o el equipo ya no existe');
  }
  const project = projectSnap.data() as Proyecto;
  if (project.id_creador !== userId) {
    throw new Error('Solo el creador del proyecto puede asignar equipos al proyecto');
  }
  if (vinculoSnap.exists() && esVinculoEquipoActivo(vinculoSnap.data())) {
    throw new Error('El equipo ya se encuentra activo en este proyecto');
  }

  if (esLider) {
    const ahora = new Date().toISOString();
    const vinculoRef = doc(db, 'proyecto_equipos', getProyectoEquipoDocId(id_proyecto, id_equipo));
    const batch = writeBatch(db);
    batch.set(vinculoRef, {
      id_proyecto,
      id_equipo,
      estado: 'activo' satisfies EstadoEquipoProyecto,
      vinculado_at: ahora,
      desvinculado_at: null,
    });
    await batch.commit();
    await sincronizarPlantillaEquipoEnProyecto(id_proyecto, id_equipo, userId, true);
    return { modo: 'directo' };
  }

  await crearSolicitudProyectoEquipo(id_proyecto, id_equipo, userId, 'vincular');
  return { modo: 'solicitud' };
}

/**
 * Cambia el estado de un equipo dentro de un proyecto (`'activo'` o `'desvinculado'`).
 * Si quien lo ejecuta es al mismo tiempo creador del proyecto y líder del equipo, el cambio
 * se aplica directamente; si solo es una de las dos partes y pide desvincular, inicia la solicitud.
 */
export async function cambiarEstadoEquipoEnProyecto(
  id_proyecto: string,
  id_equipo: string,
  nuevoEstado: EstadoEquipoProyecto,
  userId: string
): Promise<{ modo: 'directo' | 'solicitud' }> {
  if (!id_proyecto || !id_equipo || !userId) {
    throw new Error('Faltan datos para actualizar el estado del equipo en el proyecto');
  }

  if (nuevoEstado === 'activo') {
    return asignarEquipoAProyecto(id_proyecto, id_equipo, userId);
  }

  const [projectSnap, vinculoSnap, esLiderGlobal, esLiderLocal] = await Promise.all([
    getDoc(doc(db, 'proyecto', id_proyecto)),
    getDoc(doc(db, 'proyecto_equipos', getProyectoEquipoDocId(id_proyecto, id_equipo))),
    isLiderDeEquipo(userId, id_equipo),
    isLiderDeEquipoEnProyecto(userId, id_proyecto, id_equipo),
  ]);

  if (!projectSnap.exists()) {
    throw new Error('El proyecto ya no existe');
  }
  if (!vinculoSnap.exists() || !esVinculoEquipoActivo(vinculoSnap.data())) {
    throw new Error('El equipo ya se encuentra desvinculado de este proyecto');
  }

  const esCreador = projectSnap.data().id_creador === userId;
  const esLider = esLiderGlobal || esLiderLocal;

  if (esCreador && esLider) {
    await updateDoc(doc(db, 'proyecto_equipos', getProyectoEquipoDocId(id_proyecto, id_equipo)), {
      estado: 'desvinculado' satisfies EstadoEquipoProyecto,
      desvinculado_at: new Date().toISOString(),
    });
    return { modo: 'directo' };
  }

  await crearSolicitudProyectoEquipo(id_proyecto, id_equipo, userId, 'desvincular');
  return { modo: 'solicitud' };
}

// ==========================================
// MIEMBROS DE EQUIPO (PLANTILLA GLOBAL)
// ==========================================
export async function getMiembrosEquipo(id_equipo?: string): Promise<MiembroEquipo[]> {
  try {
    const q = id_equipo
      ? query(collection(db, 'miembros_equipo'), where('id_equipo', '==', id_equipo))
      : collection(db, 'miembros_equipo');
    const snap = await getDocs(q);
    const [users, roles] = await Promise.all([getAllUsers(), getRoles()]);
    const userMap = new Map(users.map(u => [u.id, u]));
    const roleMap = new Map(roles.map(r => [r.id, r]));

    return snap.docs.map(d => {
      const data = d.data();
      // Compatibilidad: documentos anteriores guardaban un solo `id_rol`
      const id_roles: string[] = Array.isArray(data.id_roles)
        ? data.id_roles
        : data.id_rol
          ? [data.id_rol]
          : [];
      return {
        id_equipo: data.id_equipo,
        id_usuario: data.id_usuario,
        id_rol: (data.id_rol as string | null | undefined) ?? id_roles[0] ?? null,
        id_roles,
        joined_at: data.joined_at as string | undefined,
        usuario: userMap.get(data.id_usuario),
        roles: id_roles.map(id => roleMap.get(id)).filter((r): r is Rol => Boolean(r)),
      };
    });
  } catch (e) {
    console.error('Error fetching miembros_equipo:', e);
    return [];
  }
}

/**
 * Normaliza un nombre de rol y detecta si corresponde a líder de equipo.
 */
export function esRolLider(nombreRol: string | null | undefined): boolean {
  const normalizado = (nombreRol ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return normalizado.includes('lider');
}

/**
 * Ordena los roles con el de líder primero: `id_rol` (el primero) es el que
 * leen las reglas de Firestore y el código previo a KAN-13 para saber quién
 * es líder.
 */
async function ordenarRolesLiderPrimero(id_roles: string[]): Promise<string[]> {
  if (id_roles.length < 2) return id_roles;
  const roles = await getRoles();
  const esLider = (id: string) => esRolLider(roles.find(r => r.id === id)?.nombre_rol);
  return [...id_roles].sort((a, b) => Number(esLider(b)) - Number(esLider(a)));
}

/** Obtiene el ID del líder actual de un equipo (en ámbito global o de proyecto). */
async function obtenerIdLiderActual(
  id_equipo: string,
  id_proyecto?: string | null
): Promise<string | null> {
  if (id_proyecto) {
    const locales = await getMiembrosProyectoEquipo(id_proyecto, id_equipo, false);
    const liderLocal = locales.find(m => (m.roles ?? []).some(r => esRolLider(r.nombre_rol)));
    if (liderLocal) return liderLocal.id_usuario;
  }
  const globales = await getMiembrosEquipo(id_equipo);
  const liderGlobal = globales.find(m => (m.roles ?? []).some(r => esRolLider(r.nombre_rol)));
  return liderGlobal?.id_usuario ?? null;
}

/** Cambia los roles de un miembro en la plantilla global del equipo y lo registra en `logs_integrantes`. */
export async function actualizarRolesMiembro(
  id_equipo: string,
  id_usuario: string,
  id_roles: string[]
): Promise<void> {
  const docId = getMiembroEquipoDocId(id_equipo, id_usuario);
  const memberRef = doc(db, 'miembros_equipo', docId);
  const [prevSnap, ordenados, idLider] = await Promise.all([
    getDoc(memberRef),
    ordenarRolesLiderPrimero(id_roles),
    obtenerIdLiderActual(id_equipo, null),
  ]);
  const rolesAnteriores: string[] = prevSnap.exists()
    ? Array.isArray(prevSnap.data().id_roles)
      ? prevSnap.data().id_roles
      : prevSnap.data().id_rol
        ? [prevSnap.data().id_rol]
        : []
    : [];

  await updateDoc(memberRef, {
    id_roles: ordenados,
    // Compatibilidad: reglas y código previo a KAN-13 solo leen `id_rol`
    id_rol: ordenados[0] ?? null,
  });

  const idAutor = auth.currentUser?.uid;
  if (idAutor) {
    await registrarLogIntegrante({
      id_equipo,
      id_proyecto: null,
      id_usuario_afectado: id_usuario,
      accion: 'cambio_roles',
      id_autor: idAutor,
      id_lider_en_momento: idLider,
      detalles: {
        roles_anteriores: rolesAnteriores,
        roles_nuevos: ordenados,
      },
    });
  }
}

export async function removeMiembroEquipo(id_equipo: string, id_usuario: string): Promise<void> {
  const docId = getMiembroEquipoDocId(id_equipo, id_usuario);
  const memberRef = doc(db, 'miembros_equipo', docId);
  const [prevSnap, idLider] = await Promise.all([
    getDoc(memberRef),
    obtenerIdLiderActual(id_equipo, null),
  ]);
  const rolesAnteriores: string[] = prevSnap.exists()
    ? Array.isArray(prevSnap.data().id_roles)
      ? prevSnap.data().id_roles
      : prevSnap.data().id_rol
        ? [prevSnap.data().id_rol]
        : []
    : [];

  await deleteDoc(memberRef);

  const idAutor = auth.currentUser?.uid;
  if (idAutor) {
    await registrarLogIntegrante({
      id_equipo,
      id_proyecto: null,
      id_usuario_afectado: id_usuario,
      accion: 'baja',
      id_autor: idAutor,
      id_lider_en_momento: idLider,
      detalles: {
        roles_anteriores: rolesAnteriores,
      },
    });
  }
}

// ==========================================
// MIEMBROS LOCALES POR PROYECTO (`miembros_proyecto_equipo`)
// ==========================================

/**
 * Obtiene los miembros de un equipo (o de todos los equipos activos) dentro de un proyecto.
 * Si un equipo vinculado aún no tiene registros en `miembros_proyecto_equipo` (documentos previos),
 * proyecta su plantilla global como activa para mantener compatibilidad inmediata.
 */
export async function getMiembrosProyectoEquipo(
  id_proyecto: string,
  id_equipo?: string,
  incluirInactivos = false
): Promise<MiembroProyectoEquipo[]> {
  if (!id_proyecto) return [];
  try {
    const q = id_equipo
      ? query(
          collection(db, 'miembros_proyecto_equipo'),
          where('id_proyecto', '==', id_proyecto),
          where('id_equipo', '==', id_equipo)
        )
      : query(collection(db, 'miembros_proyecto_equipo'), where('id_proyecto', '==', id_proyecto));

    const [snap, users, roles] = await Promise.all([
      getDocs(q),
      getAllUsers(),
      getRoles(),
    ]);
    const userMap = new Map(users.map(u => [u.id, u]));
    const roleMap = new Map(roles.map(r => [r.id, r]));

    const resultado: MiembroProyectoEquipo[] = snap.docs.map(d => {
      const data = d.data();
      const id_roles: string[] = Array.isArray(data.id_roles)
        ? data.id_roles
        : data.id_rol
          ? [data.id_rol]
          : [];
      const estado = ((data.estado as EstadoMiembroProyecto | undefined) ?? 'activo');
      return {
        id: d.id,
        id_proyecto: data.id_proyecto,
        id_equipo: data.id_equipo,
        id_usuario: data.id_usuario,
        id_rol: (data.id_rol as string | null | undefined) ?? id_roles[0] ?? null,
        id_roles,
        estado,
        es_local: Boolean(data.es_local),
        updated_at: (data.updated_at as string | undefined) ?? new Date().toISOString(),
        usuario: userMap.get(data.id_usuario),
        roles: id_roles.map(id => roleMap.get(id)).filter((r): r is Rol => Boolean(r)),
      };
    });

    // Fallback para equipos vinculados antes de existir `miembros_proyecto_equipo`
    if (id_equipo && resultado.length === 0) {
      const globales = await getMiembrosEquipo(id_equipo);
      return globales.map(m => ({
        id: getMiembroProyectoEquipoDocId(id_proyecto, id_equipo, m.id_usuario),
        id_proyecto,
        id_equipo,
        id_usuario: m.id_usuario,
        id_rol: m.id_rol ?? m.id_roles[0] ?? null,
        id_roles: m.id_roles,
        estado: 'activo',
        es_local: false,
        updated_at: m.joined_at ?? new Date().toISOString(),
        usuario: m.usuario,
        roles: m.roles,
      }));
    }

    return incluirInactivos ? resultado : resultado.filter(m => m.estado === 'activo');
  } catch (e) {
    console.error('Error fetching miembros_proyecto_equipo:', e);
    return [];
  }
}

/**
 * Agrega (o reactiva) un miembro dentro del equipo de un proyecto específico (`miembros_proyecto_equipo`),
 * registrando la acción en `logs_integrantes`.
 */
export async function agregarMiembroLocalProyectoEquipo(data: {
  id_proyecto: string;
  id_equipo: string;
  id_usuario: string;
  id_roles: string[];
  id_autor: string;
}): Promise<void> {
  if (!data.id_proyecto || !data.id_equipo || !data.id_usuario || !data.id_autor) {
    throw new Error('Faltan datos para agregar al miembro en el proyecto');
  }
  await sincronizarPlantillaEquipoEnProyecto(data.id_proyecto, data.id_equipo, data.id_autor, true);

  const [ordenados, globalSnap, idLider] = await Promise.all([
    ordenarRolesLiderPrimero(data.id_roles),
    getDoc(doc(db, 'miembros_equipo', getMiembroEquipoDocId(data.id_equipo, data.id_usuario))),
    obtenerIdLiderActual(data.id_equipo, data.id_proyecto),
  ]);

  const docId = getMiembroProyectoEquipoDocId(data.id_proyecto, data.id_equipo, data.id_usuario);
  const localRef = doc(db, 'miembros_proyecto_equipo', docId);
  const localSnap = await getDoc(localRef);
  if (localSnap.exists() && localSnap.data().estado === 'activo') {
    throw new Error('Este usuario ya está activo en el equipo dentro de este proyecto');
  }

  const esLocal = !globalSnap.exists();
  const ahora = new Date().toISOString();
  const batch = writeBatch(db);

  batch.set(localRef, {
    id_proyecto: data.id_proyecto,
    id_equipo: data.id_equipo,
    id_usuario: data.id_usuario,
    id_rol: ordenados[0] ?? null,
    id_roles: ordenados,
    estado: 'activo' satisfies EstadoMiembroProyecto,
    es_local: esLocal,
    updated_at: ahora,
  });
  batch.set(doc(collection(db, 'logs_integrantes')), {
    id_equipo: data.id_equipo,
    id_proyecto: data.id_proyecto,
    id_usuario_afectado: data.id_usuario,
    accion: 'alta' satisfies AccionLogIntegrante,
    id_autor: data.id_autor,
    id_lider_en_momento: idLider,
    fecha_hora: ahora,
    detalles: {
      roles_nuevos: ordenados,
      estado_nuevo: 'activo',
      es_local: esLocal,
    },
  });
  await batch.commit();
}

/**
 * Modifica localmente los roles de un integrante dentro de un proyecto concreto sin alterar
 * sus roles en el equipo global ni en otros proyectos.
 */
export async function actualizarRolesMiembroLocal(data: {
  id_proyecto: string;
  id_equipo: string;
  id_usuario: string;
  id_roles: string[];
  id_autor: string;
}): Promise<void> {
  if (!data.id_proyecto || !data.id_equipo || !data.id_usuario || !data.id_autor) {
    throw new Error('Faltan datos para actualizar los roles locales del miembro');
  }
  await sincronizarPlantillaEquipoEnProyecto(data.id_proyecto, data.id_equipo, data.id_autor, true);

  const docId = getMiembroProyectoEquipoDocId(data.id_proyecto, data.id_equipo, data.id_usuario);
  const localRef = doc(db, 'miembros_proyecto_equipo', docId);
  const [localSnap, ordenados, idLider] = await Promise.all([
    getDoc(localRef),
    ordenarRolesLiderPrimero(data.id_roles),
    obtenerIdLiderActual(data.id_equipo, data.id_proyecto),
  ]);

  if (!localSnap.exists()) {
    throw new Error('El integrante no existe en la configuración local de este proyecto');
  }

  const prevData = localSnap.data();
  const rolesAnteriores: string[] = Array.isArray(prevData.id_roles)
    ? prevData.id_roles
    : prevData.id_rol
      ? [prevData.id_rol]
      : [];
  const ahora = new Date().toISOString();

  await updateDoc(localRef, {
    id_rol: ordenados[0] ?? null,
    id_roles: ordenados,
    updated_at: ahora,
  });

  await registrarLogIntegrante({
    id_equipo: data.id_equipo,
    id_proyecto: data.id_proyecto,
    id_usuario_afectado: data.id_usuario,
    accion: 'cambio_roles',
    id_autor: data.id_autor,
    id_lider_en_momento: idLider,
    detalles: {
      roles_anteriores: rolesAnteriores,
      roles_nuevos: ordenados,
      es_local: Boolean(prevData.es_local),
    },
  });
}

/**
 * Activa o desactiva la participación local de un miembro de equipo dentro de un proyecto.
 * Impide dejar al equipo sin al menos un líder activo en el proyecto.
 */
export async function cambiarEstadoMiembroLocal(data: {
  id_proyecto: string;
  id_equipo: string;
  id_usuario: string;
  estado: EstadoMiembroProyecto;
  id_autor: string;
}): Promise<void> {
  if (!data.id_proyecto || !data.id_equipo || !data.id_usuario || !data.id_autor) {
    throw new Error('Faltan datos para cambiar el estado local del miembro');
  }
  await sincronizarPlantillaEquipoEnProyecto(data.id_proyecto, data.id_equipo, data.id_autor, true);

  const docId = getMiembroProyectoEquipoDocId(data.id_proyecto, data.id_equipo, data.id_usuario);
  const localRef = doc(db, 'miembros_proyecto_equipo', docId);
  const [localSnap, miembrosActivos, idLider] = await Promise.all([
    getDoc(localRef),
    getMiembrosProyectoEquipo(data.id_proyecto, data.id_equipo, false),
    obtenerIdLiderActual(data.id_equipo, data.id_proyecto),
  ]);

  if (!localSnap.exists()) {
    throw new Error('El integrante no pertenece al equipo en este proyecto');
  }

  if (data.estado === 'inactivo') {
    const lideresActivos = miembrosActivos.filter(m =>
      (m.roles ?? []).some(r => esRolLider(r.nombre_rol))
    );
    if (lideresActivos.length === 1 && lideresActivos[0].id_usuario === data.id_usuario) {
      throw new Error('No puedes desactivar al único líder activo del equipo en este proyecto');
    }
  }

  const prevData = localSnap.data();
  const estadoAnterior = ((prevData.estado as EstadoMiembroProyecto | undefined) ?? 'activo');
  if (estadoAnterior === data.estado) return;

  const ahora = new Date().toISOString();
  await updateDoc(localRef, {
    estado: data.estado,
    updated_at: ahora,
  });

  await registrarLogIntegrante({
    id_equipo: data.id_equipo,
    id_proyecto: data.id_proyecto,
    id_usuario_afectado: data.id_usuario,
    accion: data.estado === 'inactivo' ? 'baja' : 'cambio_estado',
    id_autor: data.id_autor,
    id_lider_en_momento: idLider,
    detalles: {
      estado_anterior: estadoAnterior,
      estado_nuevo: data.estado,
      es_local: Boolean(prevData.es_local),
    },
  });
}

// ==========================================
// HISTORIAL DE MIEMBROS (`logs_integrantes`)
// ==========================================

export async function registrarLogIntegrante(data: {
  id_equipo: string;
  id_proyecto?: string | null;
  id_usuario_afectado: string | null;
  accion: AccionLogIntegrante;
  id_autor: string;
  id_lider_en_momento?: string | null;
  detalles?: DetallesLogIntegrante;
}): Promise<void> {
  try {
    await addDoc(collection(db, 'logs_integrantes'), {
      id_equipo: data.id_equipo,
      id_proyecto: data.id_proyecto ?? null,
      id_usuario_afectado: data.id_usuario_afectado,
      accion: data.accion,
      id_autor: data.id_autor,
      id_lider_en_momento: data.id_lider_en_momento ?? null,
      fecha_hora: new Date().toISOString(),
      detalles: data.detalles ?? {},
    });
  } catch (e) {
    console.error('Error registrando log de integrante:', e);
  }
}

/**
 * Obtiene el historial cronológico (más reciente primero) de altas, bajas y cambios de roles/estado
 * de un equipo. Si se pasa `id_proyecto`, filtra por los movimientos ocurridos en ese proyecto
 * (o globales si `id_proyecto === null`).
 */
export async function getHistorialMiembrosEquipo(
  id_equipo: string,
  id_proyecto?: string | null
): Promise<LogIntegrante[]> {
  if (!id_equipo) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'logs_integrantes'), where('id_equipo', '==', id_equipo))
    );
    const [users, roles] = await Promise.all([getAllUsers(), getRoles()]);
    const userMap = new Map(users.map(u => [u.id, u]));
    const roleMap = new Map(roles.map(r => [r.id, r.nombre_rol]));

    const logs: LogIntegrante[] = snap.docs
      .map(d => {
        const data = d.data();
        const detallesRaw = (data.detalles as DetallesLogIntegrante | undefined) ?? {};
        const rolesAnt = Array.isArray(detallesRaw.roles_anteriores) ? detallesRaw.roles_anteriores : undefined;
        const rolesNue = Array.isArray(detallesRaw.roles_nuevos) ? detallesRaw.roles_nuevos : undefined;
        const detalles: DetallesLogIntegrante = {
          ...detallesRaw,
          ...(rolesAnt
            ? { nombres_roles_anteriores: rolesAnt.map(id => roleMap.get(id) ?? id) }
            : {}),
          ...(rolesNue
            ? { nombres_roles_nuevos: rolesNue.map(id => roleMap.get(id) ?? id) }
            : {}),
        };
        const idUsuarioAfectado = (data.id_usuario_afectado as string | null | undefined) ?? null;
        const idAutor = (data.id_autor as string | null | undefined) ?? null;
        const idLider = (data.id_lider_en_momento as string | null | undefined) ?? null;
        return {
          id: d.id,
          id_equipo: data.id_equipo as string,
          id_proyecto: (data.id_proyecto as string | null | undefined) ?? null,
          id_usuario_afectado: idUsuarioAfectado,
          accion: data.accion as AccionLogIntegrante,
          id_autor: idAutor,
          id_lider_en_momento: idLider,
          fecha_hora: (data.fecha_hora as string | undefined) ?? '',
          detalles,
          usuario_afectado: idUsuarioAfectado ? userMap.get(idUsuarioAfectado) ?? null : null,
          autor: idAutor ? userMap.get(idAutor) ?? null : null,
          lider: idLider ? userMap.get(idLider) ?? null : null,
        };
      })
      .filter(log => {
        if (id_proyecto === undefined) return true;
        return (log.id_proyecto ?? null) === id_proyecto;
      });

    return logs.sort((a, b) => b.fecha_hora.localeCompare(a.fecha_hora));
  } catch (e) {
    console.error('Error fetching historial de miembros:', e);
    return [];
  }
}

// ==========================================
// COMPROBACIONES DE MEMBRESÍA Y LIDERAZGO EN PROYECTO
// ==========================================

/**
 * Devuelve el ID de un equipo activo en el proyecto del que el usuario es miembro activo
 * (ya sea en `miembros_proyecto_equipo` o en la plantilla `miembros_equipo`), o `null` si no hay ninguno.
 */
export async function equipoVinculadoDelUsuario(
  proyectoId: string,
  uid: string
): Promise<string | null> {
  if (!proyectoId || !uid) return null;
  try {
    const [vinculosSnap, misLocalesSnap, misGlobalesSnap] = await Promise.all([
      getDocs(query(collection(db, 'proyecto_equipos'), where('id_proyecto', '==', proyectoId))),
      getDocs(
        query(
          collection(db, 'miembros_proyecto_equipo'),
          where('id_proyecto', '==', proyectoId),
          where('id_usuario', '==', uid)
        )
      ),
      getDocs(query(collection(db, 'miembros_equipo'), where('id_usuario', '==', uid))),
    ]);
    if (vinculosSnap.empty) return null;

    const equipoIdsVinculados = new Set<string>();
    vinculosSnap.forEach(v => {
      const dataV = v.data() as { id_equipo?: string; estado?: string };
      if (
        dataV.id_equipo &&
        v.id === getProyectoEquipoDocId(proyectoId, dataV.id_equipo) &&
        esVinculoEquipoActivo(dataV)
      ) {
        equipoIdsVinculados.add(dataV.id_equipo);
      }
    });
    if (equipoIdsVinculados.size === 0) return null;

    const inactivosEnProyecto = new Set<string>();
    for (const m of misLocalesSnap.docs) {
      const dataM = m.data() as { id_equipo?: string; estado?: string };
      const idEquipo = dataM.id_equipo;
      if (!idEquipo || m.id !== getMiembroProyectoEquipoDocId(proyectoId, idEquipo, uid)) continue;
      if ((dataM.estado ?? 'activo') === 'activo' && equipoIdsVinculados.has(idEquipo)) {
        return idEquipo;
      }
      if (dataM.estado === 'inactivo') {
        inactivosEnProyecto.add(idEquipo);
      }
    }

    for (const m of misGlobalesSnap.docs) {
      const dataM = m.data() as { id_equipo?: string };
      const idEquipo = dataM.id_equipo;
      if (
        idEquipo &&
        m.id === getMiembroEquipoDocId(idEquipo, uid) &&
        equipoIdsVinculados.has(idEquipo) &&
        !inactivosEnProyecto.has(idEquipo)
      ) {
        return idEquipo;
      }
    }
    return null;
  } catch (e) {
    console.error('Error comprobando membresía por equipo vinculado:', e);
    return null;
  }
}

/** ¿Es el usuario miembro activo de algún equipo activo vinculado al proyecto? */
export async function esMiembroPorEquipoVinculado(
  proyectoId: string,
  uid: string
): Promise<boolean> {
  return (await equipoVinculadoDelUsuario(proyectoId, uid)) !== null;
}

/**
 * Comprueba un equipo concreto: el equipo debe estar activo en `proyecto_equipos` y el usuario
 * debe ser miembro activo de ese equipo en el proyecto (en `miembros_proyecto_equipo`, o en
 * `miembros_equipo` si no tiene ficha local).
 */
export async function esMiembroDeEquipoVinculadoAProyecto(
  proyectoId: string,
  equipoId: string,
  uid: string
): Promise<boolean> {
  if (!proyectoId || !equipoId || !uid) return false;
  try {
    const [localSnap, globalSnap, vinculoSnap] = await Promise.all([
      getDoc(
        doc(db, 'miembros_proyecto_equipo', getMiembroProyectoEquipoDocId(proyectoId, equipoId, uid))
      ),
      getDoc(doc(db, 'miembros_equipo', getMiembroEquipoDocId(equipoId, uid))),
      getDoc(doc(db, 'proyecto_equipos', getProyectoEquipoDocId(proyectoId, equipoId))),
    ]);
    if (!vinculoSnap.exists() || !esVinculoEquipoActivo(vinculoSnap.data())) {
      return false;
    }
    if (localSnap.exists()) {
      return (localSnap.data().estado ?? 'activo') === 'activo';
    }
    return globalSnap.exists();
  } catch (e) {
    console.error('Error comprobando el vínculo del equipo con el proyecto:', e);
    return false;
  }
}

// ==========================================
// INVITACIONES DE EQUIPO GLOBAL
// ==========================================
export async function getInvitacionesRecibidas(userId: string): Promise<InvitacionEquipo[]> {
  if (!userId) return [];

  const snap = await getDocs(
    query(collection(db, 'invitaciones_equipo'), where('id_invitado', '==', userId))
  );

  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as InvitacionEquipo)
    .filter(invitation => invitation.estado === 'pendiente');
}

export async function crearInvitacionEquipo(
  id_equipo: string,
  id_invitador: string,
  id_invitado: string,
  id_roles: string[]
): Promise<void> {
  if (!id_equipo || !id_invitador || !id_invitado) {
    throw new Error('Faltan datos para crear la invitación');
  }
  if (id_invitador === id_invitado) {
    throw new Error('No puedes invitarte a tu propio equipo');
  }

  const equiposLiderados = await getEquiposLideradosPor(id_invitador);
  if (!equiposLiderados.includes(id_equipo)) {
    throw new Error('Solo el líder del equipo puede invitar miembros');
  }

  const invitadoSnap = await getDoc(doc(db, 'perfil_usuario', id_invitado));
  if (!invitadoSnap.exists()) {
    throw new Error('El usuario seleccionado no está registrado');
  }

  const rolesOrdenados = await ordenarRolesLiderPrimero(id_roles);
  const invitationId = getMiembroEquipoDocId(id_equipo, id_invitado);
  const invitationRef = doc(db, 'invitaciones_equipo', invitationId);
  const memberRef = doc(db, 'miembros_equipo', invitationId);
  const teamRef = doc(db, 'equipo', id_equipo);

  await runTransaction(db, async transaction => {
    const [teamSnap, memberSnap, invitationSnap] = await Promise.all([
      transaction.get(teamRef),
      transaction.get(memberRef),
      transaction.get(invitationRef),
    ]);

    if (!teamSnap.exists()) {
      throw new Error('El equipo ya no existe');
    }
    if (memberSnap.exists()) {
      throw new Error('Este usuario ya forma parte del equipo');
    }
    if (invitationSnap.exists() && invitationSnap.data().estado === 'pendiente') {
      throw new Error('Ya existe una invitación pendiente para este usuario');
    }

    transaction.set(invitationRef, {
      id_equipo,
      id_invitador,
      id_invitado,
      id_roles: rolesOrdenados,
      id_rol: rolesOrdenados[0] ?? null,
      estado: 'pendiente',
      created_at: new Date().toISOString(),
    });
  });
}

export async function aceptarInvitacionEquipo(invitationId: string, userId: string): Promise<void> {
  const invitationRef = doc(db, 'invitaciones_equipo', invitationId);

  let idEquipoAceptado: string | null = null;
  let idInvitador: string | null = null;
  let rolesAsignados: string[] = [];

  await runTransaction(db, async transaction => {
    const invitationSnap = await transaction.get(invitationRef);
    if (!invitationSnap.exists()) {
      throw new Error('La invitación ya no está disponible');
    }

    const invitation = invitationSnap.data() as Omit<InvitacionEquipo, 'id'>;
    if (invitation.id_invitado !== userId || invitation.estado !== 'pendiente') {
      throw new Error('La invitación ya fue respondida o no te pertenece');
    }

    const teamRef = doc(db, 'equipo', invitation.id_equipo);
    const memberRef = doc(db, 'miembros_equipo', getMiembroEquipoDocId(invitation.id_equipo, userId));
    const [teamSnap, memberSnap] = await Promise.all([
      transaction.get(teamRef),
      transaction.get(memberRef),
    ]);
    if (!teamSnap.exists()) {
      throw new Error('El equipo de esta invitación ya no existe');
    }

    idEquipoAceptado = invitation.id_equipo;
    idInvitador = invitation.id_invitador;
    rolesAsignados = Array.isArray(invitation.id_roles)
      ? invitation.id_roles
      : invitation.id_rol
        ? [invitation.id_rol]
        : [];

    if (!memberSnap.exists()) {
      transaction.set(memberRef, {
        id_equipo: invitation.id_equipo,
        id_usuario: userId,
        // `id_rol` debe coincidir con el de la invitación (lo validan las reglas)
        id_rol: invitation.id_rol || null,
        id_roles: rolesAsignados,
        joined_at: new Date().toISOString(),
      });
    }
    transaction.update(invitationRef, { estado: 'aceptada' });
  });

  if (idEquipoAceptado) {
    await registrarLogIntegrante({
      id_equipo: idEquipoAceptado,
      id_proyecto: null,
      id_usuario_afectado: userId,
      accion: 'alta',
      id_autor: userId,
      id_lider_en_momento: idInvitador,
      detalles: {
        roles_nuevos: rolesAsignados,
        nota: 'Ingreso por invitación aceptada',
      },
    });
  }
}

export async function rechazarInvitacionEquipo(invitationId: string, userId: string): Promise<void> {
  const invitationRef = doc(db, 'invitaciones_equipo', invitationId);

  await runTransaction(db, async transaction => {
    const invitationSnap = await transaction.get(invitationRef);
    if (!invitationSnap.exists()) {
      throw new Error('La invitación ya no está disponible');
    }

    const invitation = invitationSnap.data();
    if (invitation.id_invitado !== userId || invitation.estado !== 'pendiente') {
      throw new Error('La invitación ya fue respondida o no te pertenece');
    }

    transaction.update(invitationRef, { estado: 'rechazada' });
  });
}

/** Indica si el usuario tiene rol de líder en la plantilla global del equipo dado. */
export async function isLiderDeEquipo(userId: string, equipoId: string): Promise<boolean> {
  if (!userId || !equipoId) return false;
  const miembros = await getMiembrosEquipo(equipoId);
  const propio = miembros.find((m: MiembroEquipo) => m.id_usuario === userId);
  return (propio?.roles ?? []).some(r => esRolLider(r.nombre_rol));
}

/**
 * Indica si el usuario tiene rol de líder activo del equipo dentro de un proyecto específico
 * (evaluando primero `miembros_proyecto_equipo` y luego `miembros_equipo`).
 */
export async function isLiderDeEquipoEnProyecto(
  userId: string,
  proyectoId: string,
  equipoId: string
): Promise<boolean> {
  if (!userId || !proyectoId || !equipoId) return false;
  const locales = await getMiembrosProyectoEquipo(proyectoId, equipoId, true);
  const propioLocal = locales.find(m => m.id_usuario === userId);
  if (propioLocal) {
    return (
      propioLocal.estado === 'activo' &&
      (propioLocal.roles ?? []).some(r => esRolLider(r.nombre_rol))
    );
  }
  return isLiderDeEquipo(userId, equipoId);
}

/** IDs de equipos donde el usuario tiene rol de líder (global o local en algún proyecto). */
export async function getEquiposLideradosPor(
  userId: string,
  proyectoId?: string
): Promise<UUID[]> {
  if (!userId) return [];
  if (proyectoId) {
    const locales = await getMiembrosProyectoEquipo(proyectoId, undefined, false);
    const lideradosLocales = new Set(
      locales
        .filter(m => m.id_usuario === userId && (m.roles ?? []).some(r => esRolLider(r.nombre_rol)))
        .map(m => m.id_equipo)
    );
    const globales = await getMiembrosEquipo();
    for (const m of globales) {
      if (m.id_usuario === userId && (m.roles ?? []).some(r => esRolLider(r.nombre_rol))) {
        lideradosLocales.add(m.id_equipo);
      }
    }
    return [...lideradosLocales];
  }

  const membresias = await getMiembrosEquipo();
  return membresias
    .filter((m: MiembroEquipo) => m.id_usuario === userId && (m.roles ?? []).some(r => esRolLider(r.nombre_rol)))
    .map((m: MiembroEquipo) => m.id_equipo);
}

// ==========================================
// SOLICITUDES PROYECTO <-> EQUIPO
// ==========================================
function getSolicitudProyectoEquipoId(
  tipo: SolicitudProyectoEquipo['tipo'],
  proyectoId: string,
  equipoId: string
) {
  return `${tipo}_${proyectoId}_${equipoId}`;
}

export async function getSolicitudesProyectoEquipoRecibidas(
  userId: string
): Promise<SolicitudProyectoEquipo[]> {
  if (!userId) return [];

  const snap = await getDocs(
    query(collection(db, 'solicitudes_proyecto_equipo'), where('id_destinatario', '==', userId))
  );
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as SolicitudProyectoEquipo)
    .filter(request => request.estado === 'pendiente');
}

export async function getSolicitudesProyectoEquipoEnviadas(
  userId: string,
  proyectoId?: string
): Promise<SolicitudProyectoEquipo[]> {
  if (!userId) return [];

  const snap = await getDocs(
    query(collection(db, 'solicitudes_proyecto_equipo'), where('id_solicitante', '==', userId))
  );
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as SolicitudProyectoEquipo)
    .filter(
      request =>
        (!proyectoId || request.id_proyecto === proyectoId) && request.estado === 'pendiente'
    );
}

export async function crearSolicitudProyectoEquipo(
  proyectoId: string,
  equipoId: string,
  userId: string,
  tipo: SolicitudProyectoEquipo['tipo']
): Promise<void> {
  if (!proyectoId || !equipoId || !userId) {
    throw new Error('Faltan datos para crear la solicitud');
  }

  const [projectSnap, teamSnap, memberships, requesterSnap] = await Promise.all([
    getDoc(doc(db, 'proyecto', proyectoId)),
    getDoc(doc(db, 'equipo', equipoId)),
    getMiembrosEquipo(equipoId),
    getDoc(doc(db, 'perfil_usuario', userId)),
  ]);
  if (!projectSnap.exists() || !teamSnap.exists()) {
    throw new Error('El proyecto o el equipo ya no existe');
  }

  const project = projectSnap.data() as Proyecto;
  const team = teamSnap.data() as Equipo;
  const creatorId = project.id_creador;
  if (!creatorId) {
    throw new Error('Este proyecto no tiene un creador registrado para autorizar solicitudes');
  }

  const leaders = memberships.filter(member =>
    (member.roles ?? []).some(r => esRolLider(r.nombre_rol))
  );
  const leader = leaders.find(member => member.id_usuario === userId) ?? leaders[0];
  if (!leader) {
    throw new Error('El equipo no tiene un líder válido');
  }

  let recipientId: string;
  if (tipo === 'vincular') {
    if (creatorId !== userId) {
      throw new Error('Solo el creador del proyecto puede invitar a un equipo');
    }
    recipientId = leader.id_usuario;
  } else if (creatorId === userId) {
    recipientId = leader.id_usuario;
  } else if (leader.id_usuario === userId) {
    recipientId = creatorId;
  } else {
    throw new Error(
      'Solo el creador del proyecto o el líder del equipo pueden solicitar la desvinculación'
    );
  }
  if (recipientId === userId) {
    throw new Error('No se puede enviar una solicitud a uno mismo');
  }

  const requestId = getSolicitudProyectoEquipoId(tipo, proyectoId, equipoId);
  const requestRef = doc(db, 'solicitudes_proyecto_equipo', requestId);
  const relationRef = doc(db, 'proyecto_equipos', getProyectoEquipoDocId(proyectoId, equipoId));
  const projectRef = doc(db, 'proyecto', proyectoId);
  const teamRef = doc(db, 'equipo', equipoId);
  const requesterName = requesterSnap.exists()
    ? requesterSnap.data().nombre || requesterSnap.data().correo || 'Usuario'
    : 'Usuario';
  const requestData = {
    id_proyecto: proyectoId,
    id_equipo: equipoId,
    id_solicitante: userId,
    id_destinatario: recipientId,
    tipo,
    estado: 'pendiente',
    nombre_proyecto: project.nombre,
    nombre_equipo: team.nombre,
    nombre_solicitante: requesterName,
    created_at: new Date().toISOString(),
  } satisfies Omit<SolicitudProyectoEquipo, 'id'>;

  await runTransaction(db, async transaction => {
    const [currentProject, currentTeam, relationSnap, requestSnap] = await Promise.all([
      transaction.get(projectRef),
      transaction.get(teamRef),
      transaction.get(relationRef),
      transaction.get(requestRef),
    ]);
    if (!currentProject.exists() || !currentTeam.exists()) {
      throw new Error('El proyecto o el equipo ya no existe');
    }
    const vinculoActivo = relationSnap.exists() && esVinculoEquipoActivo(relationSnap.data());
    if (tipo === 'vincular' && vinculoActivo) {
      throw new Error('El equipo ya está vinculado y activo en este proyecto');
    }
    if (tipo === 'desvincular' && !vinculoActivo) {
      throw new Error('El equipo ya no está activo en este proyecto');
    }
    if (requestSnap.exists() && requestSnap.data().estado === 'pendiente') {
      throw new Error('Ya existe una solicitud pendiente para este vínculo');
    }

    transaction.set(requestRef, requestData);
  });
}

export async function responderSolicitudProyectoEquipo(
  requestId: string,
  userId: string,
  aceptar: boolean
): Promise<void> {
  const requestRef = doc(db, 'solicitudes_proyecto_equipo', requestId);
  let proyectoVinculado: { id_proyecto: string; id_equipo: string } | null = null;

  await runTransaction(db, async transaction => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists()) {
      throw new Error('La solicitud ya no está disponible');
    }
    const request = requestSnap.data() as Omit<SolicitudProyectoEquipo, 'id'>;
    if (request.id_destinatario !== userId || request.estado !== 'pendiente') {
      throw new Error('La solicitud ya fue respondida o no te pertenece');
    }

    const relationRef = doc(
      db,
      'proyecto_equipos',
      getProyectoEquipoDocId(request.id_proyecto, request.id_equipo)
    );
    const relationSnap = await transaction.get(relationRef);
    const vinculoActivo = relationSnap.exists() && esVinculoEquipoActivo(relationSnap.data());

    if (aceptar && request.tipo === 'vincular' && vinculoActivo) {
      throw new Error('El equipo ya está vinculado a este proyecto');
    }
    if (aceptar && request.tipo === 'desvincular' && !vinculoActivo) {
      throw new Error('El equipo ya no está activo en este proyecto');
    }

    const ahora = new Date().toISOString();
    if (aceptar && request.tipo === 'vincular') {
      transaction.set(relationRef, {
        id_proyecto: request.id_proyecto,
        id_equipo: request.id_equipo,
        id_solicitud: requestId,
        estado: 'activo' satisfies EstadoEquipoProyecto,
        vinculado_at: ahora,
        desvinculado_at: null,
      });
      proyectoVinculado = { id_proyecto: request.id_proyecto, id_equipo: request.id_equipo };
    } else if (aceptar && request.tipo === 'desvincular') {
      transaction.update(relationRef, {
        estado: 'desvinculado' satisfies EstadoEquipoProyecto,
        desvinculado_at: ahora,
      });
    }
    transaction.update(requestRef, {
      estado: aceptar ? 'aceptada' : 'rechazada',
    });
  });

  if (proyectoVinculado) {
    const { id_proyecto, id_equipo } = proyectoVinculado;
    await sincronizarPlantillaEquipoEnProyecto(id_proyecto, id_equipo, userId, true);
  }
}
