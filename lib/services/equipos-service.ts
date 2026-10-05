import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  updateDoc, 
  query, 
  where, 
  writeBatch, 
  runTransaction 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Equipo, 
  ProyectoEquipo, 
  MiembroEquipo, 
  InvitacionEquipo, 
  SolicitudProyectoEquipo, 
  Rol, 
  Proyecto, 
  UUID 
} from '../database.types';
import { getAllUsers } from './usuarios-service';
import { getRoles } from './catalogos-service';

// ==========================================
// EQUIPOS
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
      created_at: d.data().created_at || new Date().toISOString()
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
  const memberRef = doc(db, 'miembros_equipo', `${docRef.id}_${data.id_creador}`);
  const createdAt = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(docRef, {
    nombre: data.nombre,
    // Firestore rechaza campos con valor `undefined`
    descripcion: data.descripcion ?? '',
    id_creador: data.id_creador,
    created_at: createdAt
  });
  batch.set(memberRef, {
    id_equipo: docRef.id,
    id_usuario: data.id_creador,
    id_rol: data.id_rol_lider,
    id_roles: [data.id_rol_lider]
  });
  await batch.commit();

  return {
    equipo_id: docRef.id,
    nombre: data.nombre,
    descripcion: data.descripcion || '',
    id_creador: data.id_creador,
    created_at: createdAt
  };
}

/**
 * Crea un equipo dentro de un proyecto (KAN-24): el equipo, su líder inicial y el
 * vínculo con el proyecto se escriben en un solo lote, sin la invitación de
 * vinculación que usaban los equipos independientes. Quién puede hacerlo lo
 * decide el permiso del proyecto (`puedeCrearEquipos`), y lo exige `firestore.rules`.
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
  const memberRef = doc(db, 'miembros_equipo', `${docRef.id}_${data.id_creador}`);
  const vinculoRef = doc(db, 'proyecto_equipos', `${data.id_proyecto}_${docRef.id}`);
  const createdAt = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(docRef, {
    nombre: data.nombre,
    descripcion: data.descripcion ?? '',
    id_creador: data.id_creador,
    id_proyecto: data.id_proyecto,
    created_at: createdAt
  });
  batch.set(memberRef, {
    id_equipo: docRef.id,
    id_usuario: data.id_creador,
    id_rol: data.id_rol_lider,
    id_roles: [data.id_rol_lider]
  });
  batch.set(vinculoRef, { id_proyecto: data.id_proyecto, id_equipo: docRef.id });
  await batch.commit();

  return {
    equipo_id: docRef.id,
    nombre: data.nombre,
    descripcion: data.descripcion || '',
    id_creador: data.id_creador,
    id_proyecto: data.id_proyecto,
    created_at: createdAt
  };
}

export async function updateEquipo(id: string, data: { nombre: string; descripcion?: string }): Promise<void> {
  await updateDoc(doc(db, 'equipo', id), {
    nombre: data.nombre,
    descripcion: data.descripcion ?? ''
  });
}

export async function deleteEquipo(id: string): Promise<void> {
  await deleteDoc(doc(db, 'equipo', id));
  const peSnap = await getDocs(query(collection(db, 'proyecto_equipos'), where('id_equipo', '==', id)));
  for (const d of peSnap.docs) {
    await deleteDoc(d.ref);
  }
  const requestsSnap = await getDocs(query(
    collection(db, 'solicitudes_proyecto_equipo'),
    where('id_equipo', '==', id)
  ));
  for (const d of requestsSnap.docs) {
    await deleteDoc(d.ref);
  }
  const invitationsSnap = await getDocs(query(collection(db, 'invitaciones_equipo'), where('id_equipo', '==', id)));
  for (const d of invitationsSnap.docs) {
    await deleteDoc(d.ref);
  }
  const mbSnap = await getDocs(query(collection(db, 'miembros_equipo'), where('id_equipo', '==', id)));
  for (const d of mbSnap.docs) {
    await deleteDoc(d.ref);
  }
}

// ==========================================
// RELACIONES PROYECTO <-> EQUIPO
// ==========================================
export async function getProyectoEquipos(): Promise<ProyectoEquipo[]> {
  try {
    const snap = await getDocs(collection(db, 'proyecto_equipos'));
    return snap.docs.map(d => d.data() as ProyectoEquipo);
  } catch (e) {
    console.error('Error fetching proyecto_equipos:', e);
    return [];
  }
}

// ==========================================
// MIEMBROS DE EQUIPO
// ==========================================
export async function getMiembrosEquipo(id_equipo?: string): Promise<MiembroEquipo[]> {
  try {
    const q = id_equipo 
      ? query(collection(db, 'miembros_equipo'), where('id_equipo', '==', id_equipo))
      : collection(db, 'miembros_equipo');
    const snap = await getDocs(q);
    const users = await getAllUsers();
    const roles = await getRoles();
    const userMap = new Map(users.map(u => [u.id, u]));
    const roleMap = new Map(roles.map(r => [r.id, r]));

    return snap.docs.map(d => {
      const data = d.data();
      // Compatibilidad: documentos anteriores guardaban un solo `id_rol`
      const id_roles: string[] = Array.isArray(data.id_roles)
        ? data.id_roles
        : data.id_rol ? [data.id_rol] : [];
      return {
        id_equipo: data.id_equipo,
        id_usuario: data.id_usuario,
        id_roles,
        usuario: userMap.get(data.id_usuario),
        roles: id_roles.map(id => roleMap.get(id)).filter((r): r is Rol => Boolean(r))
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

/** Cambia los roles de un miembro existente (solo el líder del equipo). */
export async function actualizarRolesMiembro(id_equipo: string, id_usuario: string, id_roles: string[]): Promise<void> {
  const ordenados = await ordenarRolesLiderPrimero(id_roles);
  await updateDoc(doc(db, 'miembros_equipo', `${id_equipo}_${id_usuario}`), {
    id_roles: ordenados,
    // Compatibilidad: reglas y código previo a KAN-13 solo leen `id_rol`
    id_rol: ordenados[0] ?? null
  });
}

export async function removeMiembroEquipo(id_equipo: string, id_usuario: string): Promise<void> {
  const docId = `${id_equipo}_${id_usuario}`;
  await deleteDoc(doc(db, 'miembros_equipo', docId));
}

// ==========================================
// INVITACIONES DE EQUIPO
// ==========================================
export async function getInvitacionesRecibidas(userId: string): Promise<InvitacionEquipo[]> {
  if (!userId) return [];

  const snap = await getDocs(query(
    collection(db, 'invitaciones_equipo'),
    where('id_invitado', '==', userId)
  ));

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
  const invitationId = `${id_equipo}_${id_invitado}`;
  const invitationRef = doc(db, 'invitaciones_equipo', invitationId);
  const memberRef = doc(db, 'miembros_equipo', invitationId);
  const teamRef = doc(db, 'equipo', id_equipo);

  await runTransaction(db, async transaction => {
    const [teamSnap, memberSnap, invitationSnap] = await Promise.all([
      transaction.get(teamRef),
      transaction.get(memberRef),
      transaction.get(invitationRef)
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
      created_at: new Date().toISOString()
    });
  });
}

export async function aceptarInvitacionEquipo(invitationId: string, userId: string): Promise<void> {
  const invitationRef = doc(db, 'invitaciones_equipo', invitationId);

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
    const memberRef = doc(db, 'miembros_equipo', `${invitation.id_equipo}_${userId}`);
    const [teamSnap, memberSnap] = await Promise.all([
      transaction.get(teamRef),
      transaction.get(memberRef)
    ]);
    if (!teamSnap.exists()) {
      throw new Error('El equipo de esta invitación ya no existe');
    }

    if (!memberSnap.exists()) {
      transaction.set(memberRef, {
        id_equipo: invitation.id_equipo,
        id_usuario: userId,
        // `id_rol` debe coincidir con el de la invitación (lo validan las reglas)
        id_rol: invitation.id_rol || null,
        id_roles: Array.isArray(invitation.id_roles)
          ? invitation.id_roles
          : invitation.id_rol ? [invitation.id_rol] : []
      });
    }
    transaction.update(invitationRef, { estado: 'aceptada' });
  });
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

/** Indica si el usuario tiene rol de líder en el equipo dado. */
export async function isLiderDeEquipo(
  userId: string,
  equipoId: string
): Promise<boolean> {
  if (!userId || !equipoId) return false;
  const miembros = await getMiembrosEquipo(equipoId);
  const propio = miembros.find((m: MiembroEquipo) => m.id_usuario === userId);
  return (propio?.roles ?? []).some(r => esRolLider(r.nombre_rol));
}

/** IDs de equipos donde el usuario tiene rol de líder. Una lectura con joins. */
export async function getEquiposLideradosPor(userId: string): Promise<UUID[]> {
  if (!userId) return [];
  const membresias = await getMiembrosEquipo();
  return membresias
    .filter((m: MiembroEquipo) => m.id_usuario === userId && (m.roles ?? []).some(r => esRolLider(r.nombre_rol)))
    .map((m: MiembroEquipo) => m.id_equipo);
}

// ==========================================
// SOLICITUDES PROYECTO <-> EQUIPO
// ==========================================
function getSolicitudProyectoEquipoId(tipo: SolicitudProyectoEquipo['tipo'], proyectoId: string, equipoId: string) {
  return `${tipo}_${proyectoId}_${equipoId}`;
}

export async function getSolicitudesProyectoEquipoRecibidas(userId: string): Promise<SolicitudProyectoEquipo[]> {
  if (!userId) return [];

  const snap = await getDocs(query(
    collection(db, 'solicitudes_proyecto_equipo'),
    where('id_destinatario', '==', userId)
  ));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as SolicitudProyectoEquipo)
    .filter(request => request.estado === 'pendiente');
}

export async function getSolicitudesProyectoEquipoEnviadas(
  userId: string,
  proyectoId?: string
): Promise<SolicitudProyectoEquipo[]> {
  if (!userId) return [];

  const snap = await getDocs(query(
    collection(db, 'solicitudes_proyecto_equipo'),
    where('id_solicitante', '==', userId)
  ));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as SolicitudProyectoEquipo)
    .filter(request =>
      (!proyectoId || request.id_proyecto === proyectoId) &&
      request.estado === 'pendiente'
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
    getDoc(doc(db, 'perfil_usuario', userId))
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

  const leaders = memberships.filter(member => (member.roles ?? []).some(r => esRolLider(r.nombre_rol)));
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
    throw new Error('Solo el creador del proyecto o el líder del equipo pueden solicitar la desvinculación');
  }
  if (recipientId === userId) {
    throw new Error('No se puede enviar una solicitud a uno mismo');
  }

  const requestId = getSolicitudProyectoEquipoId(tipo, proyectoId, equipoId);
  const requestRef = doc(db, 'solicitudes_proyecto_equipo', requestId);
  const relationRef = doc(db, 'proyecto_equipos', `${proyectoId}_${equipoId}`);
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
    created_at: new Date().toISOString()
  } satisfies Omit<SolicitudProyectoEquipo, 'id'>;

  await runTransaction(db, async transaction => {
    const [currentProject, currentTeam, relationSnap, requestSnap] = await Promise.all([
      transaction.get(projectRef),
      transaction.get(teamRef),
      transaction.get(relationRef),
      transaction.get(requestRef)
    ]);
    if (!currentProject.exists() || !currentTeam.exists()) {
      throw new Error('El proyecto o el equipo ya no existe');
    }
    if (tipo === 'vincular' && relationSnap.exists()) {
      throw new Error('El equipo ya está vinculado a este proyecto');
    }
    if (tipo === 'desvincular' && !relationSnap.exists()) {
      throw new Error('El equipo ya no está vinculado a este proyecto');
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
      `${request.id_proyecto}_${request.id_equipo}`
    );
    const relationSnap = await transaction.get(relationRef);
    if (aceptar && request.tipo === 'vincular' && relationSnap.exists()) {
      throw new Error('El equipo ya está vinculado a este proyecto');
    }
    if (aceptar && request.tipo === 'desvincular' && !relationSnap.exists()) {
      throw new Error('El equipo ya no está vinculado a este proyecto');
    }

    if (aceptar && request.tipo === 'vincular') {
      transaction.set(relationRef, {
        id_proyecto: request.id_proyecto,
        id_equipo: request.id_equipo,
        id_solicitud: requestId
      });
    } else if (aceptar && request.tipo === 'desvincular') {
      transaction.delete(relationRef);
    }
    transaction.update(requestRef, {
      estado: aceptar ? 'aceptada' : 'rechazada'
    });
  });
}
