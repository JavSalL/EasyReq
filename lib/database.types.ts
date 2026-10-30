// ==========================================================
// TIPOS TYPESCRIPT PARA EL ESQUEMA DE FIRESTORE
// ==========================================================

export type UUID = string; // ID de documento de Firestore

// 1. Catálogos Base
export interface TipoSistema {
  id: UUID;
  nombre: string;
}

export interface Profesion {
  id: UUID;
  nombre: string;
}

export interface Rol {
  id: UUID;
  nombre_rol: string;
}

export interface Estado {
  id: UUID;
  nombre_estado: string;
}

export interface Modalidad {
  id: UUID;
  nombre_modalidad: string;
}

export interface TipoRequerimiento {
  tipo_req: UUID;
  nombre: string;
}

export interface Modelo {
  id: UUID;
  nombre: string;
  descripcion?: string;
}

// 2. Entidades Principales
export interface PerfilUsuario {
  id: UUID; // Coincide con el uid de Firebase Auth
  nombre: string;
  correo: string;
  /** País del usuario: código ISO 3166-1 alfa-2 (p. ej. "MX"). Opcional en perfiles anteriores. */
  pais?: string | null;
  /** Nombre del país en español, desnormalizado para mostrarlo sin catálogo. */
  pais_nombre?: string | null;
  created_at?: string;
  // Multi-profesión (modelo actual). Se guarda desnormalizado en
  // `perfil_usuario` para evitar joins en Firestore.
  ids_profesiones?: UUID[];
  profesiones_nombres?: string[];
  profesiones?: Profesion[];
  // Legacy single-profesión: se mantiene por compatibilidad con
  // documentos antiguos. No usar en código nuevo.
  id_profesion?: UUID | null;
  profesion_nombre?: string | null;
}

export interface Equipo {
  equipo_id: UUID;
  nombre: string;
  descripcion?: string;
  id_creador?: UUID | null;
  // Proyecto al que pertenece el equipo (KAN-24). Null en equipos anteriores,
  // que se relacionan con proyectos por los vínculos de `proyecto_equipos`.
  id_proyecto?: UUID | null;
  created_at?: string;
}

/** Quién puede crear equipos dentro de un proyecto. */
export type QuienCreaEquipos = 'creador' | 'seleccionados' | 'miembros';

/** Quién puede agregar y quitar miembros de un proyecto. */
export type QuienAgregaMiembros = 'creador' | 'seleccionados';

export interface Proyecto {
  proyecto_id: UUID;
  nombre: string;
  descripcion?: string;
  id_tipo_sistema: UUID | null;
  tipos_sistema?: TipoSistema | null;
  // UID de Firebase Auth del usuario que creó el proyecto. Opcional (null
  // en documentos legacy creados antes de este campo): esos se tratan como
  // hoy, solo miembros de equipos vinculados pueden editarlos.
  id_creador?: UUID | null;
  // Miembros del proyecto (KAN-24), además del creador, que siempre lo es. Se agregan directamente.
  ids_miembros?: UUID[];
  // Permiso para crear equipos en el proyecto. Por defecto, solo el creador.
  quien_crea_equipos?: QuienCreaEquipos;
  // Miembros autorizados cuando `quien_crea_equipos` es 'seleccionados'.
  ids_creadores_equipos?: UUID[];
  // Miembros autorizados (además del creador) para agregar y quitar miembros.
  quien_agrega_miembros?: QuienAgregaMiembros;
  ids_gestores_miembros?: UUID[];
  created_at?: string;
}

/**
 * Puntero de acceso al hilo de comentarios de un proyecto (KAN-27).
 *
 * Vive en `proyecto/{id_proyecto}/acceso_comentarios/{uid}` y guarda el equipo
 * vinculado por el que entra un miembro que no está en `ids_miembros`. No es una
 * fuente de autorización: las reglas revalidan en cada operación que el usuario
 * sigue perteneciendo a ese equipo y que el equipo sigue vinculado al proyecto.
 */
export interface AccesoComentariosProyecto {
  id_equipo: UUID;
}

export interface Patron {
  patron_id: UUID;
  nombre: string;
  promt: string;
  id_modelo: UUID | null;
  modelo?: Modelo | null;
  created_at?: string;
}

export type OrigenIA = 'explicito' | 'inferido';
export type PrioridadMoSCoW = 'Must' | 'Should' | 'Could' | 'Wont';

export interface Requerimiento {
  id: UUID;
  enunciado: string;
  id_tipo_requerimiento: UUID | null;
  id_proyecto: UUID;
  /**
   * Equipo al que pertenece el requerimiento (KAN-18). De él depende qué líder
   * aprueba, y las reglas no pueden deducirlo: un proyecto puede tener varios
   * equipos y los vínculos de `proyecto_equipos` tienen ID compuesto
   * (`proyecto_equipo`), que no se puede enumerar desde una regla.
   *
   * Nulo en los requerimientos creados antes de KAN-18. No son migrables a mano:
   * el texto guardado no dice a qué equipo pertenecían.
   */
  id_equipo?: UUID | null;
  /** Quién lo redactó. Lo pone el sistema al crear; nunca el formulario. */
  id_autor: UUID | null;
  /**
   * Quién lo aprobó (KAN-18). Lo escribe el líder al aprobar y queda en `null` al
   * rechazar: quien rechaza no aprobó, y dejarlo puesto haría que un rechazo se
   * leyera como "Aprobado por" en la tarjeta.
   */
  id_aprobador: UUID | null;
  /** Momento del último reenvío a aprobación tras un rechazo (KAN-18). */
  reenviado_at?: string;
  id_modalidad: UUID | null;
  id_estado: UUID | null;
  id_modelo: UUID | null;
  // Patrón (plantilla) elegido al redactar (KAN-28). Opcional porque los
  // documentos anteriores solo guardaban el modelo.
  id_patron?: UUID | null;
  /** Número consecutivo dentro del proyecto (REQ-001...). Null en requerimientos que aún no se numeran. */
  numero?: number | null;
  /** Identificador guardado en la base de datos ("REQ-014"), único dentro del proyecto. */
  codigo?: string | null;
  /**
   * Cantidad de comentarios del hilo (KAN-27). Lo mueve la transacción que crea o
   * borra un comentario, nunca el formulario, y solo cambia esta clave.
   *
   * Denormalizado a propósito: la lista de requerimientos no tiene paginación, así
   * que sin este campo habría que hacer una consulta de conteo por requerimiento en
   * cada carga. Ausente en los documentos anteriores a KAN-27, que equivalen a 0.
   *
   * Es información de presentación, no de autorización: un cliente podría escribir
   * un número falso, pero no con eso gana ningún permiso.
   */
  total_comentarios?: number;
  // Generación iterativa con IA (KAN-40). Opcionales: los requerimientos redactados a mano
  // o anteriores no los traen.
  /** Módulo o área del sistema al que pertenece (máx. 120 caracteres). */
  modulo?: string | null;
  /** Si la IA lo sacó del texto o contexto ('explicito') o lo dedujo ('inferido'). */
  origen_ia?: OrigenIA | null;
  /** Prioridad MoSCoW propuesta. */
  prioridad?: PrioridadMoSCoW | null;
  created_at?: string;

  // Joins relacionales
  tipo_requerimiento?: TipoRequerimiento | null;
  estado?: Estado | null;
  modalidad?: Modalidad | null;
  autor?: PerfilUsuario | null;
  aprobador?: PerfilUsuario | null;
  modelo?: Modelo | null;
  patron?: Patron | null;
}

/**
 * Comentario de un requerimiento (KAN-27).
 *
 * Vive en la subcolección `requerimiento/{id_requerimiento}/comentario/{id}`, no en
 * una colección de nivel superior, y esa elección es de seguridad y no de
 * comodidad: las reglas de Firestore no pueden inspeccionar el contenido de los
 * documentos cuando la operación es una lista (una consulta), así que todo lo que
 * una regla de lectura necesita debe salir del propio path. Con el ID del
 * requerimiento en el path, la comprobación de membresía es una lectura de clave
 * conocida y las consultas siguen funcionando; con una colección plana habría que
 * negar la consulta entera para no dejar leer comentarios de otros proyectos.
 */
export interface Comentario {
  /** Subcoleccionado: el ID es el del documento dentro de `requerimiento/{id}/comentario`. */
  id: UUID;
  id_requerimiento: UUID;
  /**
   * Proyecto del requerimiento. Lo copia el servicio al crear y las reglas exigen
   * que coincida con el `id_proyecto` del requerimiento del path: así un comentario
   * no se puede colgar de un proyecto ajeno cambiando el campo.
   */
  id_proyecto: UUID;
  /** Quién escribió el comentario. Lo pone el sistema; las reglas lo exigen igual al auth. */
  id_autor: UUID;
  texto: string;
  created_at: string;
  /** Solo cuando el autor ha corregido su comentario después. */
  updated_at?: string | null;
  /** Join con `perfil_usuario` que hace `getComentariosRequerimiento()`, no un campo guardado. */
  autor?: PerfilUsuario | null;
}

export type FormatoContexto = 'pdf' | 'md' | 'txt';

/** Archivo o carpeta de la pestaña Contexto de un proyecto (alimenta a la IA). */
export interface ArchivoContexto {
  id: UUID;
  id_proyecto: UUID;
  tipo: 'archivo' | 'carpeta';
  nombre: string;
  /** Carpeta que lo contiene; null = raíz (contexto global, entra siempre). */
  id_carpeta: UUID | null;
  formato?: FormatoContexto;
  /** Tamaño del archivo original en bytes. */
  tamano: number;
  /** Texto que lee la IA (extraído del PDF o el propio contenido de txt/md). */
  texto: string;
  /** El texto se recortó por su longitud. */
  texto_truncado: boolean;
  /** Fragmentos en `contexto_fragmentos` que guardan el archivo original. */
  num_fragmentos: number;
  id_autor: UUID | null;
  created_at: string;
  updated_at: string;
}

// 3. Tablas Intermedias
export interface ProyectoEquipo {
  id_proyecto: UUID;
  id_equipo: UUID;
  id_solicitud?: UUID;
  equipo?: Equipo;
  proyecto?: Proyecto;
}

export interface MiembroEquipo {
  id_equipo: UUID;
  id_usuario: UUID;
  id_roles: UUID[];
  usuario?: PerfilUsuario;
  roles?: Rol[];
}

export type EstadoInvitacionEquipo = 'pendiente' | 'aceptada' | 'rechazada';

export interface InvitacionEquipo {
  id: UUID;
  id_equipo: UUID;
  id_invitador: UUID;
  id_invitado: UUID;
  // Rol principal (el de líder, si lo hay); lo validan las reglas de Firestore
  id_rol: UUID | null;
  // Todos los roles propuestos (KAN-13); las invitaciones antiguas no lo tienen
  id_roles?: UUID[];
  estado: EstadoInvitacionEquipo;
  created_at: string;
}

export type TipoSolicitudProyectoEquipo = 'vincular' | 'desvincular';
export type EstadoSolicitudProyectoEquipo = 'pendiente' | 'aceptada' | 'rechazada';

export interface SolicitudProyectoEquipo {
  id: UUID;
  id_proyecto: UUID;
  id_equipo: UUID;
  id_solicitante: UUID;
  id_destinatario: UUID;
  tipo: TipoSolicitudProyectoEquipo;
  estado: EstadoSolicitudProyectoEquipo;
  nombre_proyecto: string;
  nombre_equipo: string;
  nombre_solicitante: string;
  created_at: string;
}

export interface UsuarioProfesion {
  id_usuario: UUID;
  id_profesion: UUID;
}

// 4. Logs e Historial
export interface HistorialLider {
  id: UUID;
  id_equipo: UUID;
  id_usuario: UUID;
  es_actual: boolean;
  fecha_inicio: string;
  fecha_fin?: string | null;
  usuario?: PerfilUsuario;
}

export interface LogRequerimiento {
  id: UUID;
  id_requerimiento: UUID;
  accion: string;
  id_autor: UUID | null;
  id_lider_en_momento: UUID | null;
  fecha_hora: string;
  detalles?: {
    campos?: string[];
    enunciado_anterior?: string;
    enunciado_nuevo?: string;
    estado_anterior?: string | null;
    estado_nuevo?: string | null;
    cambios_clasificacion?: Array<{
      campo: string;
      anterior: string;
      nuevo: string;
      anteriorId?: UUID | null;
      nuevoId?: UUID | null;
    }>;
    restauracion?: boolean;
    [key: string]: unknown;
  };
  autor?: PerfilUsuario | null;
  lider?: PerfilUsuario | null;
}

export interface LogIntegrante {
  id: UUID;
  id_equipo: UUID;
  id_usuario_afectado: UUID | null;
  accion: string;
  id_autor: UUID | null;
  id_lider_en_momento: UUID | null;
  fecha_hora: string;
  detalles?: any;
  usuario_afectado?: PerfilUsuario | null;
  autor?: PerfilUsuario | null;
  lider?: PerfilUsuario | null;
}
