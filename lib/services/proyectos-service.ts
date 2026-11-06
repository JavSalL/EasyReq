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
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import {
  Proyecto,
  UUID,
  MiembroEquipo,
  QuienCreaEquipos,
  QuienAgregaMiembros,
} from '../database.types';
import {
  getTiposSistema,
  getEstadosProyecto,
  getNaturalezasProyecto,
  idCatalogoPorNombre,
  ESTADO_PROYECTO_EN_PROGRESO,
} from './catalogos-service';
import {
  getProyectoEquipos,
  getMiembrosEquipo,
  getMiembroProyectoEquipoDocId,
} from './equipos-service';
import { getColaboracionProyectoId } from './colaboraciones-service';
import { eliminarContextoDeProyecto } from './contexto-service';
import {
  asegurarAccesoComentariosProyecto,
  borrarAccesosComentariosProyecto,
  borrarComentariosDeRequerimiento,
  listarAccesosComentariosProyecto,
  listarComentariosDeRequerimiento,
} from './comentarios-service';

// ==========================================
// PROYECTOS
// ==========================================
export async function getProyectos(): Promise<Proyecto[]> {
  try {
    const [snap, tipos, estadosProyecto, naturalezasProyecto] = await Promise.all([
      getDocs(collection(db, 'proyecto')),
      getTiposSistema(),
      getEstadosProyecto(),
      getNaturalezasProyecto(),
    ]);
    const proyectos: Proyecto[] = [];
    const tiposMap = new Map(tipos.map(t => [t.id, t]));
    const estadosMap = new Map(estadosProyecto.map(e => [e.id, e]));
    const naturalezasMap = new Map(naturalezasProyecto.map(n => [n.id, n]));

    for (const d of snap.docs) {
      const data = d.data();
      const idEstadoProyecto = (data.id_estado_proyecto as string | null | undefined) ?? null;
      const idNaturalezaProyecto = (data.id_naturaleza_proyecto as string | null | undefined) ?? null;
      proyectos.push({
        proyecto_id: d.id,
        nombre: data.nombre,
        descripcion: data.descripcion || '',
        id_tipo_sistema: data.id_tipo_sistema || null,
        tipos_sistema: data.id_tipo_sistema ? tiposMap.get(data.id_tipo_sistema) || null : null,
        id_estado_proyecto: idEstadoProyecto,
        estado_proyecto: idEstadoProyecto ? estadosMap.get(idEstadoProyecto) || null : null,
        id_naturaleza_proyecto: idNaturalezaProyecto,
        naturaleza_proyecto: idNaturalezaProyecto
          ? naturalezasMap.get(idNaturalezaProyecto) || null
          : null,
        en_colaboracion: Boolean(data.en_colaboracion),
        id_creador: (data.id_creador as string | null | undefined) ?? null,
        ids_miembros: Array.isArray(data.ids_miembros) ? data.ids_miembros : [],
        quien_crea_equipos: (data.quien_crea_equipos as QuienCreaEquipos | undefined) ?? 'creador',
        ids_creadores_equipos: Array.isArray(data.ids_creadores_equipos)
          ? data.ids_creadores_equipos
          : [],
        quien_agrega_miembros:
          (data.quien_agrega_miembros as QuienAgregaMiembros | undefined) ?? 'creador',
        ids_gestores_miembros: Array.isArray(data.ids_gestores_miembros)
          ? data.ids_gestores_miembros
          : [],
        created_at: data.created_at || new Date().toISOString(),
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
    const [tipos, estadosProyecto, naturalezasProyecto] = await Promise.all([
      data.id_tipo_sistema ? getTiposSistema() : Promise.resolve([]),
      data.id_estado_proyecto ? getEstadosProyecto() : Promise.resolve([]),
      data.id_naturaleza_proyecto ? getNaturalezasProyecto() : Promise.resolve([]),
    ]);
    const tipo = tipos.find(t => t.id === data.id_tipo_sistema) || null;
    const idEstadoProyecto = (data.id_estado_proyecto as string | null | undefined) ?? null;
    const idNaturalezaProyecto = (data.id_naturaleza_proyecto as string | null | undefined) ?? null;
    const estadoProyecto = idEstadoProyecto
      ? estadosProyecto.find(e => e.id === idEstadoProyecto) || null
      : null;
    const naturalezaProyecto = idNaturalezaProyecto
      ? naturalezasProyecto.find(n => n.id === idNaturalezaProyecto) || null
      : null;

    return {
      proyecto_id: snap.id,
      nombre: data.nombre,
      descripcion: data.descripcion || '',
      id_tipo_sistema: data.id_tipo_sistema || null,
      tipos_sistema: tipo,
      id_estado_proyecto: idEstadoProyecto,
      estado_proyecto: estadoProyecto,
      id_naturaleza_proyecto: idNaturalezaProyecto,
      naturaleza_proyecto: naturalezaProyecto,
      en_colaboracion: Boolean(data.en_colaboracion),
      id_creador: (data.id_creador as string | null | undefined) ?? null,
      ids_miembros: Array.isArray(data.ids_miembros) ? data.ids_miembros : [],
      quien_crea_equipos: (data.quien_crea_equipos as QuienCreaEquipos | undefined) ?? 'creador',
      ids_creadores_equipos: Array.isArray(data.ids_creadores_equipos)
        ? data.ids_creadores_equipos
        : [],
      quien_agrega_miembros:
        (data.quien_agrega_miembros as QuienAgregaMiembros | undefined) ?? 'creador',
      ids_gestores_miembros: Array.isArray(data.ids_gestores_miembros)
        ? data.ids_gestores_miembros
        : [],
      created_at: data.created_at || new Date().toISOString(),
    };
  } catch (e) {
    console.error('Error fetching proyecto by id:', e);
    return null;
  }
}

export async function createProyecto(data: {
  nombre: string;
  descripcion?: string;
  id_tipo_sistema?: string | null;
  id_estado_proyecto?: UUID | null;
  id_naturaleza_proyecto?: UUID | null;
  en_colaboracion?: boolean;
  ids_colaboraciones?: UUID[];
  id_creador?: UUID | null;
  /** @deprecated Legacy KAN-24 */
  quien_crea_equipos?: QuienCreaEquipos;
  /** @deprecated Legacy KAN-24 */
  ids_creadores_equipos?: UUID[];
  /** @deprecated Legacy KAN-24 */
  quien_agrega_miembros?: QuienAgregaMiembros;
  /** @deprecated Legacy KAN-24 */
  ids_gestores_miembros?: UUID[];
  /** @deprecated Legacy KAN-24 */
  ids_miembros?: UUID[];
}): Promise<Proyecto> {
  const created_at = new Date().toISOString();
  const idEstado =
    data.id_estado_proyecto !== undefined
      ? data.id_estado_proyecto
      : await idCatalogoPorNombre('estado_proyecto', 'nombre_estado', ESTADO_PROYECTO_EN_PROGRESO);
  const idNaturaleza = data.id_naturaleza_proyecto ?? null;
  const idsColaboraciones = [...new Set((data.ids_colaboraciones ?? []).filter(Boolean))];
  const enColaboracion = Boolean(data.en_colaboracion || idsColaboraciones.length > 0);

  const docRef = await addDoc(collection(db, 'proyecto'), {
    nombre: data.nombre,
    descripcion: data.descripcion || '',
    id_tipo_sistema: data.id_tipo_sistema || null,
    id_estado_proyecto: idEstado || null,
    id_naturaleza_proyecto: idNaturaleza,
    en_colaboracion: enColaboracion,
    id_creador: data.id_creador ?? null,
    created_at,
  });

  if (idsColaboraciones.length > 0) {
    const batch = writeBatch(db);
    for (const idColab of idsColaboraciones) {
      const relId = getColaboracionProyectoId(idColab, docRef.id);
      batch.set(doc(db, 'colaboracion_proyecto', relId), {
        id_colaboracion: idColab,
        id_proyecto: docRef.id,
        id_autor: data.id_creador ?? auth.currentUser?.uid ?? null,
        created_at,
      });
    }
    await batch.commit();
  }

  return {
    proyecto_id: docRef.id,
    nombre: data.nombre,
    descripcion: data.descripcion || '',
    id_tipo_sistema: data.id_tipo_sistema || null,
    id_estado_proyecto: idEstado || null,
    id_naturaleza_proyecto: idNaturaleza,
    en_colaboracion: enColaboracion,
    id_creador: data.id_creador ?? null,
    created_at,
  };
}

export async function updateProyecto(
  id: string,
  data: {
    nombre: string;
    descripcion?: string;
    id_tipo_sistema?: string | null;
    id_estado_proyecto?: UUID | null;
    id_naturaleza_proyecto?: UUID | null;
    en_colaboracion?: boolean;
    /** @deprecated Legacy KAN-24 */
    quien_crea_equipos?: QuienCreaEquipos;
    /** @deprecated Legacy KAN-24 */
    ids_creadores_equipos?: UUID[];
    /** @deprecated Legacy KAN-24 */
    quien_agrega_miembros?: QuienAgregaMiembros;
    /** @deprecated Legacy KAN-24 */
    ids_gestores_miembros?: UUID[];
  }
): Promise<void> {
  const docRef = doc(db, 'proyecto', id);
  const cambios: Record<string, unknown> = {
    nombre: data.nombre,
  };
  if (data.descripcion !== undefined) cambios.descripcion = data.descripcion;
  if (data.id_tipo_sistema !== undefined) cambios.id_tipo_sistema = data.id_tipo_sistema;
  if (data.id_estado_proyecto !== undefined) cambios.id_estado_proyecto = data.id_estado_proyecto;
  if (data.id_naturaleza_proyecto !== undefined) {
    cambios.id_naturaleza_proyecto = data.id_naturaleza_proyecto;
  }
  if (data.en_colaboracion !== undefined) cambios.en_colaboracion = data.en_colaboracion;

  await updateDoc(docRef, cambios);
}

/**
 * @deprecated Los proyectos ya no admiten miembros sueltos sin equipo.
 * Usa `agregarMiembroLocalProyectoEquipo` o vincula un equipo global mediante `asignarEquipoAProyecto`.
 */
export async function agregarMiembrosProyecto(
  id_proyecto: string,
  ids_usuarios: UUID[]
): Promise<void> {
  void id_proyecto;
  void ids_usuarios;
  throw new Error(
    'Los miembros deben pertenecer a un equipo asignado al proyecto. Vincula un equipo o agrega al integrante dentro de un equipo del proyecto.'
  );
}

/**
 * @deprecated Los proyectos ya no admiten miembros sueltos sin equipo.
 * Usa `cambiarEstadoMiembroLocal` para desactivar a un integrante dentro de un equipo del proyecto.
 */
export async function quitarMiembroProyecto(
  id_proyecto: string,
  id_usuario: UUID
): Promise<void> {
  void id_proyecto;
  void id_usuario;
  throw new Error(
    'Para dar de baja a un integrante en este proyecto, desactívalo dentro de su equipo en el proyecto.'
  );
}

export async function deleteProyecto(id: string): Promise<void> {
  // El contexto va primero: sus reglas comprueban la membresía leyendo el proyecto, que aún debe existir
  await eliminarContextoDeProyecto(id);

  const uid = auth.currentUser?.uid;
  if (uid) {
    await asegurarAccesoComentariosProyecto(id, uid);
  }

  const reqSnap = await getDocs(
    query(collection(db, 'requerimiento'), where('id_proyecto', '==', id))
  );
  const hilos = await Promise.all(
    reqSnap.docs.map(d => listarComentariosDeRequerimiento(d.id))
  );
  const accesos = await listarAccesosComentariosProyecto(id);

  await deleteDoc(doc(db, 'proyecto', id));

  // Limpiar relaciones locales del proyecto (sin eliminar los equipos globales independientes)
  const [peSnap, mpeSnap, colabSnap, requestsSnap] = await Promise.all([
    getDocs(query(collection(db, 'proyecto_equipos'), where('id_proyecto', '==', id))),
    getDocs(query(collection(db, 'miembros_proyecto_equipo'), where('id_proyecto', '==', id))),
    getDocs(query(collection(db, 'colaboracion_proyecto'), where('id_proyecto', '==', id))),
    getDocs(query(collection(db, 'solicitudes_proyecto_equipo'), where('id_proyecto', '==', id))),
  ]);

  for (const d of peSnap.docs) await deleteDoc(d.ref);
  for (const d of mpeSnap.docs) await deleteDoc(d.ref);
  for (const d of colabSnap.docs) await deleteDoc(d.ref);
  for (const d of requestsSnap.docs) await deleteDoc(d.ref);

  for (const d of reqSnap.docs) {
    await deleteDoc(d.ref);
  }
  for (const hilo of hilos) {
    await borrarComentariosDeRequerimiento(hilo);
  }
  await borrarAccesosComentariosProyecto(accesos);
}

// ==========================================
// CONTROL DE ACCESO (proyectos)
// ==========================================

/**
 * IDs de proyectos relacionados al usuario: proyectos que creó
 * (`proyecto.id_creador == userId`) más aquellos donde es miembro activo de un
 * equipo vinculado y activo en `proyecto_equipos`.
 */
export async function getProyectosRelacionados(userId: string): Promise<UUID[]> {
  if (!userId) return [];
  const [vinculosActivos, membresiasGlobales, membresiasLocalesSnap, creadosSnap] =
    await Promise.all([
      getProyectoEquipos(true),
      getMiembrosEquipo(),
      getDocs(
        query(collection(db, 'miembros_proyecto_equipo'), where('id_usuario', '==', userId))
      ),
      getDocs(query(collection(db, 'proyecto'), where('id_creador', '==', userId))),
    ]);

  const equiposGlobalesDelUsuario = new Set(
    membresiasGlobales
      .filter((m: MiembroEquipo) => m.id_usuario === userId)
      .map((m: MiembroEquipo) => m.id_equipo)
  );

  const activosLocales = new Set<string>();
  const inactivosLocales = new Set<string>();
  for (const d of membresiasLocalesSnap.docs) {
    const data = d.data();
    const idProyecto = data.id_proyecto as string | undefined;
    const idEquipo = data.id_equipo as string | undefined;
    if (!idProyecto || !idEquipo) continue;
    if (d.id !== getMiembroProyectoEquipoDocId(idProyecto, idEquipo, userId)) continue;
    const clave = `${idProyecto}_${idEquipo}`;
    if ((data.estado ?? 'activo') === 'activo') {
      activosLocales.add(clave);
    } else {
      inactivosLocales.add(clave);
    }
  }

  const proyectos = new Set<UUID>();
  for (const d of creadosSnap.docs) {
    proyectos.add(d.id);
  }
  for (const pe of vinculosActivos) {
    if (!pe.id_proyecto || !pe.id_equipo) continue;
    const clave = `${pe.id_proyecto}_${pe.id_equipo}`;
    if (activosLocales.has(clave)) {
      proyectos.add(pe.id_proyecto);
    } else if (!inactivosLocales.has(clave) && equiposGlobalesDelUsuario.has(pe.id_equipo)) {
      proyectos.add(pe.id_proyecto);
    }
  }
  return [...proyectos];
}

/**
 * Indica si el usuario puede editar/operar en el proyecto: true si es su
 * creador (`id_creador == userId`) o miembro activo de un equipo activo vinculado.
 */
export async function isUsuarioRelacionadoAProyecto(
  userId: string,
  proyectoId: string
): Promise<boolean> {
  if (!userId || !proyectoId) return false;
  try {
    const snap = await getDoc(doc(db, 'proyecto', proyectoId));
    if (snap.exists() && snap.data().id_creador === userId) return true;
  } catch (e) {
    console.error('Error verificando creador del proyecto:', e);
  }
  const relacionados = await getProyectosRelacionados(userId);
  return relacionados.includes(proyectoId);
}
