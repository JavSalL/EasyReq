import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from './firebase';
import { 
  PerfilUsuario, 
  Proyecto, 
  Equipo, 
  Requerimiento, 
  Patron, 
  TipoSistema, 
  Profesion, 
  Rol, 
  Estado, 
  Modalidad, 
  TipoRequerimiento, 
  Modelo, 
  ProyectoEquipo, 
  MiembroEquipo, 
  LogRequerimiento,
  UUID
} from './database.types';

// ==========================================
// SEEDING DE CATÁLOGOS BASE
// (Replica el contenido original de supabase_migration_v3.sql)
// ==========================================
export async function seedCatalogsIfEmpty() {
  try {
    const profSnap = await getDocs(query(collection(db, 'profesiones'), limit(1)));
    if (!profSnap.empty) return;

    console.log('Sembrando catálogos iniciales en Firestore...');

    const defaultProfesiones = [
      'Ingeniero de Software',
      'Analista de Requerimientos',
      'Diseñador UX/UI',
      'Especialista QA / Testing',
      'Scrum Master / Agile Coach',
      'DevOps Engineer'
    ];
    for (const nombre of defaultProfesiones) {
      await addDoc(collection(db, 'profesiones'), { nombre });
    }

    const defaultTiposSistema = [
      'Sistema Web',
      'Aplicación Móvil',
      'Sistema Embebido / IoT',
      'Software de Escritorio',
      'Microservicios / API'
    ];
    for (const nombre of defaultTiposSistema) {
      await addDoc(collection(db, 'tipos_sistema'), { nombre });
    }

    const defaultRoles = [
      'Líder de Equipo',
      'Analista de Requisitos',
      'Desarrollador',
      'Tester QA',
      'Product Owner'
    ];
    for (const nombre_rol of defaultRoles) {
      await addDoc(collection(db, 'roles'), { nombre_rol });
    }

    const defaultEstados = [
      'Borrador',
      'En Revisión',
      'Aprobado',
      'Rechazado',
      'Implementado'
    ];
    for (const nombre_estado of defaultEstados) {
      await addDoc(collection(db, 'estados'), { nombre_estado });
    }

    const defaultModalidades = [
      'Presencial',
      'Remoto',
      'Híbrido',
      'Obligatorio',
      'Opcional'
    ];
    for (const nombre_modalidad of defaultModalidades) {
      await addDoc(collection(db, 'modalidades'), { nombre_modalidad });
    }

    const defaultTiposReq = [
      'Funcional',
      'Usabilidad',
      'Confiabilidad',
      'Rendimiento',
      'Soporte / Mantenibilidad'
    ];
    for (const nombre of defaultTiposReq) {
      await addDoc(collection(db, 'tipos_requerimientos'), { nombre });
    }

    const defaultModelos = [
      {
        nombre: 'EARS (Easy Approach to Requirements Syntax)',
        descripcion: 'Sintaxis estructurada basada en palabras clave para reducir la ambigüedad en especificaciones de requisitos.'
      },
      {
        nombre: 'Sistemas Embebidos y Programables',
        descripcion: 'Orientado a hardware, determinismo temporal, interfaces físicas, tolerancia a fallos y restricciones de recursos.'
      },
      {
        nombre: 'Modelo Dr. Reyes',
        descripcion: 'Enfoque de lenguaje natural estructurado: Actor + Acción + Objeto de Acción + Datos de entrada + Resultado esperado.'
      }
    ];
    const modeloIds: Record<string, string> = {};
    for (const m of defaultModelos) {
      const ref = await addDoc(collection(db, 'modelo'), m);
      modeloIds[m.nombre] = ref.id;
    }

    // Patrones asociados a cada Modelo
    const earsId = modeloIds['EARS (Easy Approach to Requirements Syntax)'];
    const embebidosId = modeloIds['Sistemas Embebidos y Programables'];
    const reyesId = modeloIds['Modelo Dr. Reyes'];

    const earsPatrones: [string, string][] = [
      ['Ubiquitous', 'The <system name> shall <system response>.'],
      ['Event-Driven', 'When <trigger>, the <system name> shall <system response>.'],
      ['State-Driven', 'While <state>, the <system name> shall <system response>.'],
      ['Unwanted Behavior', 'If <undesired condition>, then the <system name> shall <system response>.'],
      ['Optional Feature', 'Where <feature is included>, the <system name> shall <system response>.'],
      ['Complex: State + Event', 'While <state>, when <trigger>, the <system name> shall <system response>.'],
      ['Complex: Optional + State + Event', 'Where <feature>, while <state>, when <trigger>, the <system name> shall <system response>.']
    ];
    for (const [nombre, promt] of earsPatrones) {
      await addDoc(collection(db, 'patron'), { nombre, promt, id_modelo: earsId });
    }

    const embebidosPatrones: [string, string][] = [
      ['Event-Response', 'When <event>, the <system/component> shall <response>.'],
      ['State-Based', 'While <state/mode>, the <system> shall <behavior>.'],
      ['State + Event', 'While <state>, when <event>, the <system> shall <response>.'],
      ['Timing Constraint', 'When <event>, the <system> shall <response> within <time constraint>.'],
      ['Periodic Behavior', 'Every <time interval>, the <system> shall <behavior>.'],
      ['Fault Handling', 'If <fault condition>, the <system> shall <safe response>.'],
      ['Interface', 'The <system/component> shall <interface behavior>.'],
      ['Resource Constraint', 'The <system/component> shall not exceed <resource limit>.'],
      ['Startup / Initialization', 'Upon <startup condition>, the <system> shall <initialization behavior>.'],
      ['Safety Integrity', 'The <system> shall transition to <safe state> when <hazard condition>.']
    ];
    for (const [nombre, promt] of embebidosPatrones) {
      await addDoc(collection(db, 'patron'), { nombre, promt, id_modelo: embebidosId });
    }

    await addDoc(collection(db, 'patron'), {
      nombre: 'Lenguaje Natural Estructurado',
      promt: '[Actor] + [Acción] + [Objeto de Acción] + [Datos de entrada] + [Resultado esperado].',
      id_modelo: reyesId
    });

    console.log('Catálogos sembrados exitosamente.');
  } catch (error) {
    console.error('Error al inicializar catálogos en Firestore:', error);
  }
}

// ==========================================
// CATÁLOGOS (GETTERS)
// ==========================================
export async function getProfesiones(): Promise<Profesion[]> {
  try {
    const snap = await getDocs(collection(db, 'profesiones'));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) {
    console.error('Error fetching profesiones:', e);
    return [];
  }
}

export async function getTiposSistema(): Promise<TipoSistema[]> {
  try {
    const snap = await getDocs(collection(db, 'tipos_sistema'));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) {
    console.error('Error fetching tipos_sistema:', e);
    return [];
  }
}

export async function getRoles(): Promise<Rol[]> {
  try {
    const snap = await getDocs(collection(db, 'roles'));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) {
    console.error('Error fetching roles:', e);
    return [];
  }
}

export async function getEstados(): Promise<Estado[]> {
  try {
    const snap = await getDocs(collection(db, 'estados'));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) {
    console.error('Error fetching estados:', e);
    return [];
  }
}

export async function getModalidades(): Promise<Modalidad[]> {
  try {
    const snap = await getDocs(collection(db, 'modalidades'));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) {
    console.error('Error fetching modalidades:', e);
    return [];
  }
}

export async function getTiposRequerimientos(): Promise<TipoRequerimiento[]> {
  try {
    const snap = await getDocs(collection(db, 'tipos_requerimientos'));
    return snap.docs.map(d => ({ tipo_req: d.id, ...(d.data() as any) }));
  } catch (e) {
    console.error('Error fetching tipos_requerimientos:', e);
    return [];
  }
}

export async function getModelos(): Promise<Modelo[]> {
  try {
    const snap = await getDocs(collection(db, 'modelo'));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  } catch (e) {
    console.error('Error fetching modelos:', e);
    return [];
  }
}

// ==========================================
// USUARIOS Y PERFILES
// Modelo multi-profesión: `perfil_usuario` guarda
// `ids_profesiones: string[]` + `profesiones_nombres: string[]`
// desnormalizados. Los campos legacy `id_profesion` /
// `profesion_nombre` (una sola profesión) se siguen escribiendo
// con el primer elemento por compatibilidad y se normalizan
// al leer.
// ==========================================
function normalizePerfilProfesiones(data: Record<string, unknown>): Pick<PerfilUsuario, 'ids_profesiones' | 'profesiones_nombres' | 'profesiones' | 'id_profesion' | 'profesion_nombre'> {
  const rawIds = data.ids_profesiones;
  const rawNombres = data.profesiones_nombres;
  const rawProfesiones = data.profesiones;
  const rawId = data.id_profesion;
  const rawNombre = data.profesion_nombre;
  const ids: UUID[] = Array.isArray(rawIds)
    ? rawIds.filter((v: unknown): v is UUID => typeof v === 'string' && v.length > 0)
    : typeof rawId === 'string' && rawId
      ? [rawId]
      : [];
  const nombres: string[] = Array.isArray(rawNombres)
    ? rawNombres.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0)
    : Array.isArray(rawProfesiones)
      ? (rawProfesiones as Profesion[]).map((p) => p.nombre).filter((n) => typeof n === 'string' && n.length > 0)
      : typeof rawNombre === 'string' && rawNombre
        ? [rawNombre]
        : [];
  const profesiones: Profesion[] = Array.isArray(rawProfesiones)
    ? (rawProfesiones as Profesion[])
    : ids.map((id, i) => ({ id, nombre: nombres[i] ?? '' })).filter((p) => p.id && p.nombre);
  return {
    ids_profesiones: ids,
    profesiones_nombres: nombres,
    profesiones,
    id_profesion: ids[0] ?? (typeof rawId === 'string' ? rawId : null),
    profesion_nombre: nombres[0] ?? (typeof rawNombre === 'string' ? rawNombre : null),
  };
}

/** Texto para mostrar las profesiones de un perfil ("A, B" o fallback). */
export function getProfesionesLabel(profile: PerfilUsuario | null | undefined, fallback = ''): string {
  if (!profile) return fallback;
  const nombres = Array.isArray(profile.profesiones_nombres) && profile.profesiones_nombres.length > 0
    ? profile.profesiones_nombres
    : Array.isArray(profile.profesiones) && profile.profesiones.length > 0
      ? profile.profesiones.map((p) => p.nombre)
      : profile.profesion_nombre
        ? [profile.profesion_nombre]
        : [];
  return nombres.length > 0 ? nombres.join(', ') : fallback;
}

export async function getUserProfile(userId: string): Promise<PerfilUsuario | null> {
  try {
    const docRef = doc(db, 'perfil_usuario', userId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    return { id: snap.id, ...(data as unknown as Omit<PerfilUsuario, 'id'>), ...normalizePerfilProfesiones(data) };
  } catch (e) {
    console.error('Error fetching user profile:', e);
    return null;
  }
}

export async function saveUserProfile(
  userId: string,
  data: {
    nombre: string;
    correo: string;
    id_profesion?: string;
    profesion_nombre?: string;
    ids_profesiones?: string[];
    profesiones_nombres?: string[];
    profesiones?: Profesion[];
  }
): Promise<void> {
  // Normaliza entrada: acepta formato nuevo (arrays) o legacy (uno solo).
  const normalized = normalizePerfilProfesiones({
    ids_profesiones: data.ids_profesiones,
    profesiones_nombres: data.profesiones_nombres,
    profesiones: data.profesiones,
    id_profesion: data.id_profesion,
    profesion_nombre: data.profesion_nombre,
  });
  const docRef = doc(db, 'perfil_usuario', userId);
  await setDoc(docRef, {
    ...data,
    ids_profesiones: normalized.ids_profesiones ?? [],
    profesiones_nombres: normalized.profesiones_nombres ?? [],
    profesiones: normalized.profesiones ?? [],
    // Compat: primer elemento como campo singular.
    id_profesion: normalized.id_profesion ?? null,
    profesion_nombre: normalized.profesion_nombre ?? null,
    updated_at: new Date().toISOString()
  }, { merge: true });
}

export async function getAllUsers(): Promise<PerfilUsuario[]> {
  try {
    const snap = await getDocs(collection(db, 'perfil_usuario'));
    return snap.docs.map(d => {
      const data = d.data() as Record<string, unknown>;
      return { id: d.id, ...(data as unknown as Omit<PerfilUsuario, 'id'>), ...normalizePerfilProfesiones(data) };
    });
  } catch (e) {
    console.error('Error fetching all users:', e);
    return [];
  }
}

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
      created_at: data.created_at || new Date().toISOString()
    };
  } catch (e) {
    console.error('Error fetching proyecto by id:', e);
    return null;
  }
}

export async function createProyecto(data: { nombre: string; descripcion?: string; id_tipo_sistema?: string | null; id_creador?: UUID | null }): Promise<Proyecto> {
  const created_at = new Date().toISOString();
  const docRef = await addDoc(collection(db, 'proyecto'), {
    nombre: data.nombre,
    descripcion: data.descripcion || '',
    id_tipo_sistema: data.id_tipo_sistema || null,
    // UID del creador (política: cualquier autenticado puede crear; el
    // creador siempre puede editar/eliminar). Null si no se provee.
    id_creador: data.id_creador ?? null,
    created_at
  });
  return {
    proyecto_id: docRef.id,
    nombre: data.nombre,
    descripcion: data.descripcion || '',
    id_tipo_sistema: data.id_tipo_sistema || null,
    id_creador: data.id_creador ?? null,
    created_at
  };
}

export async function updateProyecto(id: string, data: { nombre: string; descripcion?: string; id_tipo_sistema?: string | null }): Promise<void> {
  const docRef = doc(db, 'proyecto', id);
  await updateDoc(docRef, data);
}

export async function deleteProyecto(id: string): Promise<void> {
  await deleteDoc(doc(db, 'proyecto', id));
  const peSnap = await getDocs(query(collection(db, 'proyecto_equipos'), where('id_proyecto', '==', id)));
  for (const d of peSnap.docs) {
    await deleteDoc(d.ref);
  }
  const reqSnap = await getDocs(query(collection(db, 'requerimiento'), where('id_proyecto', '==', id)));
  for (const d of reqSnap.docs) {
    await deleteDoc(d.ref);
  }
}

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
      created_at: d.data().created_at || new Date().toISOString()
    }));
  } catch (e) {
    console.error('Error fetching equipos:', e);
    return [];
  }
}

export async function createEquipo(data: { nombre: string; descripcion?: string }): Promise<Equipo> {
  const docRef = await addDoc(collection(db, 'equipo'), {
    ...data,
    created_at: new Date().toISOString()
  });
  return {
    equipo_id: docRef.id,
    nombre: data.nombre,
    descripcion: data.descripcion || '',
    created_at: new Date().toISOString()
  };
}

export async function updateEquipo(id: string, data: { nombre: string; descripcion?: string }): Promise<void> {
  await updateDoc(doc(db, 'equipo', id), data);
}

export async function deleteEquipo(id: string): Promise<void> {
  await deleteDoc(doc(db, 'equipo', id));
  const peSnap = await getDocs(query(collection(db, 'proyecto_equipos'), where('id_equipo', '==', id)));
  for (const d of peSnap.docs) {
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

export async function linkEquipoToProyecto(id_proyecto: string, id_equipo: string): Promise<void> {
  const docId = `${id_proyecto}_${id_equipo}`;
  await setDoc(doc(db, 'proyecto_equipos', docId), {
    id_proyecto,
    id_equipo
  });
}

export async function unlinkEquipoFromProyecto(id_proyecto: string, id_equipo: string): Promise<void> {
  const docId = `${id_proyecto}_${id_equipo}`;
  await deleteDoc(doc(db, 'proyecto_equipos', docId));
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
      return {
        id_equipo: data.id_equipo,
        id_usuario: data.id_usuario,
        id_rol: data.id_rol || null,
        usuario: userMap.get(data.id_usuario),
        rol: data.id_rol ? roleMap.get(data.id_rol) || null : null
      };
    });
  } catch (e) {
    console.error('Error fetching miembros_equipo:', e);
    return [];
  }
}

export async function addMiembroEquipo(id_equipo: string, id_usuario: string, id_rol: string | null): Promise<void> {
  const docId = `${id_equipo}_${id_usuario}`;
  await setDoc(doc(db, 'miembros_equipo', docId), {
    id_equipo,
    id_usuario,
    id_rol: id_rol || null
  });
}

export async function removeMiembroEquipo(id_equipo: string, id_usuario: string): Promise<void> {
  const docId = `${id_equipo}_${id_usuario}`;
  await deleteDoc(doc(db, 'miembros_equipo', docId));
}

// ==========================================
// CONTROL DE ACCESO (proyectos)
// Política: cualquier usuario autenticado puede CREAR proyectos y todo
// proyecto es VISIBLE para todos los autenticados. Solo relacionados
// pueden EDITAR/ELIMINAR: el creador (`proyecto.id_creador == uid`) más
// los miembros de equipos vinculados vía `proyecto_equipos` +
// `miembros_equipo`. Enforcement en cliente+servicio (ver firestore.rules:
// TODO backend para enforcement real en servidor).
// Proyectos legacy sin `id_creador` se tratan como hoy: solo miembros
// vinculados editan. No hay migración destructiva.
// Un usuario es "líder" de un equipo si su `roles.nombre_rol`
// contiene "líder"/"lider" (insensible a acentos y mayúsculas).
// ==========================================

/** Normaliza un nombre de rol y detecta si corresponde a líder de equipo. */
export function esRolLider(nombreRol: string | null | undefined): boolean {
  const normalizado = (nombreRol ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return normalizado.includes('lider');
}

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

/** Indica si el usuario tiene rol de líder en el equipo dado. */
export async function isLiderDeEquipo(
  userId: string,
  equipoId: string
): Promise<boolean> {
  if (!userId || !equipoId) return false;
  const miembros = await getMiembrosEquipo(equipoId);
  const propio = miembros.find((m: MiembroEquipo) => m.id_usuario === userId);
  return esRolLider(propio?.rol?.nombre_rol);
}

/** IDs de equipos donde el usuario tiene rol de líder. Una lectura con joins. */
export async function getEquiposLideradosPor(userId: string): Promise<UUID[]> {
  if (!userId) return [];
  const membresias = await getMiembrosEquipo();
  return membresias
    .filter((m: MiembroEquipo) => m.id_usuario === userId && esRolLider(m.rol?.nombre_rol))
    .map((m: MiembroEquipo) => m.id_equipo);
}

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

export async function createRequerimiento(data: Partial<Requerimiento>): Promise<Requerimiento> {
  const docRef = await addDoc(collection(db, 'requerimiento'), {
    ...data,
    created_at: new Date().toISOString()
  });
  return {
    id: docRef.id,
    ...(data as any),
    created_at: new Date().toISOString()
  };
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
