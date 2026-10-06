import { collection, getDocs, addDoc, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Profesion, 
  TipoSistema, 
  Rol, 
  Estado, 
  Modalidad, 
  TipoRequerimiento, 
  Modelo 
} from '../database.types';

// ==========================================
// ESTADOS Y MODALIDADES DE LA APROBACIÓN (KAN-18)
// ==========================================
// Estos dos textos no son etiquetas: `firestore.rules` los compara literalmente
// (`esEstadoPendienteAprobacion`) y el servicio los busca por nombre. Si cambia
// uno, hay que cambiarlo en tres sitios: aquí, en las reglas y en la lista blanca
// de `match /estados`. Están juntos y comentados para que el trío no se rompa en
// silencio.

/** Estado en el que nace un requerimiento y al que vuelve tras un rechazo. */
export const ESTADO_PENDIENTE_APROBACION = 'Pendiente de aprobación';
/** Estado al que pasa cuando el líder del equipo lo aprueba. */
export const ESTADO_APROBADO = 'Aprobado';
/** Estado al que pasa cuando el líder lo rechaza. */
export const ESTADO_RECHAZADO = 'Devuelto';
/** Modalidad que el botón de generar con IA marca solo. */
export const MODALIDAD_GENERADO_IA = 'Generado con IA';

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
      'Implementado',
      // KAN-18: estado de espera. Nace aquí todo requerimiento nuevo y solo avanza
      // cuando el líder del equipo lo aprueba. `firestore.rules` compara este texto
      // literalmente, así que también tiene que estar en la lista blanca de
      // `match /estados`.
      ESTADO_PENDIENTE_APROBACION
    ];
    for (const nombre_estado of defaultEstados) {
      await addDoc(collection(db, 'estados'), { nombre_estado });
    }

    const defaultModalidades = [
      'Presencial',
      'Remoto',
      'Híbrido',
      'Obligatorio',
      'Opcional',
      // KAN-18: la marca que el botón "Generar req con IA" pone sola. Mismo
      // cuidado que el estado: el servicio la busca por este texto.
      MODALIDAD_GENERADO_IA
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

/**
 * ID del documento de un catálogo cuyo campo de nombre vale `nombre`, o `null` si
 * no existe (KAN-18).
 *
 * Existe porque el flujo de aprobación necesita IDs de catálogo, y los IDs los
 * asigna Firestore: no hay constantes a las que referirse. Se busca por nombre en
 * lugar de suponerlo, para que el servicio y las reglas partan de la misma fuente:
 * el texto del documento.
 */
export async function idCatalogoPorNombre(
  coleccion: 'estados' | 'modalidades',
  campo: 'nombre_estado' | 'nombre_modalidad',
  nombre: string
): Promise<string | null> {
  try {
    const q = query(collection(db, coleccion), where(campo, '==', nombre), limit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0].id;
  } catch (e) {
    console.error(`Error buscando "${nombre}" en ${coleccion}:`, e);
    return null;
  }
}

/**
 * Añade los valores de catálogo que KAN-18 necesita, y solo si faltan.
 *
 * `seedCatalogsIfEmpty()` es todo o nada: si una sola colección ya tiene algo, no
 * siembra ninguna. Así que un entorno sembrado antes de este ticket se quedaría sin
 * 'Pendiente de aprobación' ni 'Generado con IA', y la creación de requerimientos
 * fallaría con un error de permisos que no explica la causa. Esta función cubre ese
 * caso sin tocar lo que ya existe.
 *
 * Es idempotente: preguntar por nombre antes de escribir evita duplicados si se
 * llama en cada carga, que es lo que hace quien la invoca.
 */
export async function asegurarCatalogosAprobacion(): Promise<void> {
  const pendientes: Array<['estados' | 'modalidades', 'nombre_estado' | 'nombre_modalidad', string]> = [
    ['estados', 'nombre_estado', ESTADO_PENDIENTE_APROBACION],
    ['modalidades', 'nombre_modalidad', MODALIDAD_GENERADO_IA]
  ];

  for (const [coleccion, campo, nombre] of pendientes) {
    try {
      const id = await idCatalogoPorNombre(coleccion, campo, nombre);
      if (!id) {
        await addDoc(collection(db, coleccion), { [campo]: nombre });
        console.log(`Catálogo ${coleccion}: añadido "${nombre}".`);
      }
    } catch (error) {
      // Que falle un catálogo no debe impedir entrar en la app: se avisa por
      // consola, y el error real saltará al crear un requerimiento, que sí puede
      // explicarle al usuario qué hacer.
      console.error(`No se pudo añadir "${nombre}" a ${coleccion}:`, error);
    }
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
