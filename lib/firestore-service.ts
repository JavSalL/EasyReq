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
  LogRequerimiento 
} from './database.types';

// ==========================================
// SEEDING DE CATÁLOGOS BASE
// ==========================================
export async function seedCatalogsIfEmpty() {
  try {
    const profSnap = await getDocs(query(collection(db, 'profesiones'), limit(1)));
    if (profSnap.empty) {
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
        'Pendiente de Aprobación',
        'Aprobado',
        'Rechazado',
        'En Desarrollo',
        'Completado'
      ];
      for (const nombre_estado of defaultEstados) {
        await addDoc(collection(db, 'estados'), { nombre_estado });
      }

      const defaultModalidades = [
        'Funcional',
        'No Funcional',
        'De Negocio',
        'Técnico'
      ];
      for (const nombre_modalidad of defaultModalidades) {
        await addDoc(collection(db, 'modalidades'), { nombre_modalidad });
      }

      const defaultTiposReq = [
        'Nuevo Requerimiento',
        'Mejora',
        'Corrección de Bug',
        'Cambio de Alcance'
      ];
      for (const nombre of defaultTiposReq) {
        await addDoc(collection(db, 'tipos_requerimientos'), { nombre });
      }

      const defaultModelos = [
        { nombre: 'EARS', descripcion: 'Easy Approach to Requirements Syntax' },
        { nombre: 'Volere', descripcion: 'Plantilla estándar para especificación de requerimientos' },
        { nombre: 'IEEE 830', descripcion: 'Estándar para especificación de requisitos de software (SRS)' },
        { nombre: 'Agile User Story', descripcion: 'Como [rol], quiero [acción], para [beneficio]' }
      ];
      for (const m of defaultModelos) {
        await addDoc(collection(db, 'modelo'), m);
      }
      console.log('Catálogos sembrados exitosamente.');
    }
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
// ==========================================
export async function getUserProfile(userId: string): Promise<PerfilUsuario | null> {
  try {
    const docRef = doc(db, 'perfil_usuario', userId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as any) };
  } catch (e) {
    console.error('Error fetching user profile:', e);
    return null;
  }
}

export async function saveUserProfile(
  userId: string, 
  data: { nombre: string; correo: string; id_profesion?: string; profesion_nombre?: string }
): Promise<void> {
  const docRef = doc(db, 'perfil_usuario', userId);
  await setDoc(docRef, {
    ...data,
    updated_at: new Date().toISOString()
  }, { merge: true });
}

export async function getAllUsers(): Promise<PerfilUsuario[]> {
  try {
    const snap = await getDocs(collection(db, 'perfil_usuario'));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
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
        created_at: data.created_at || new Date().toISOString()
      });
    }
    return proyectos;
  } catch (e) {
    console.error('Error fetching proyectos:', e);
    return [];
  }
}

export async function createProyecto(data: { nombre: string; descripcion?: string; id_tipo_sistema?: string | null }): Promise<Proyecto> {
  const docRef = await addDoc(collection(db, 'proyecto'), {
    ...data,
    created_at: new Date().toISOString()
  });
  return {
    proyecto_id: docRef.id,
    nombre: data.nombre,
    descripcion: data.descripcion || '',
    id_tipo_sistema: data.id_tipo_sistema || null,
    created_at: new Date().toISOString()
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
