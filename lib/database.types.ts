// ==========================================================
// TIPOS TYPESCRIPT PARA EL NUEVO ESQUEMA DE SUPABASE
// ==========================================================

export type UUID = string;

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
  id: UUID; // Coincide con auth.users(id)
  nombre: string;
  correo: string;
  created_at?: string;
  profesiones?: Profesion[];
}

export interface Equipo {
  equipo_id: UUID;
  nombre: string;
  descripcion?: string;
  created_at?: string;
}

export interface Proyecto {
  proyecto_id: UUID;
  nombre: string;
  descripcion?: string;
  id_tipo_sistema: UUID | null;
  tipos_sistema?: TipoSistema | null;
  created_at?: string;
}

export interface Patron {
  patron_id: UUID;
  nombre: string;
  promt: string;
  id_modelo: UUID | null;
  modelo?: Modelo | null;
  created_at?: string;
}

export interface Requerimiento {
  id: UUID;
  enunciado: string;
  id_tipo_requerimiento: UUID | null;
  id_proyecto: UUID;
  id_autor: UUID | null;
  id_aprobador: UUID | null;
  id_modalidad: UUID | null;
  id_estado: UUID | null;
  id_modelo: UUID | null;
  created_at?: string;

  // Joins relacionales
  tipo_requerimiento?: TipoRequerimiento | null;
  estado?: Estado | null;
  modalidad?: Modalidad | null;
  autor?: PerfilUsuario | null;
  aprobador?: PerfilUsuario | null;
  modelo?: Modelo | null;
}

// 3. Tablas Intermedias
export interface ProyectoEquipo {
  id_proyecto: UUID;
  id_equipo: UUID;
  equipo?: Equipo;
  proyecto?: Proyecto;
}

export interface MiembroEquipo {
  id_equipo: UUID;
  id_usuario: UUID;
  id_rol: UUID | null;
  usuario?: PerfilUsuario;
  rol?: Rol | null;
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
  detalles?: any;
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
