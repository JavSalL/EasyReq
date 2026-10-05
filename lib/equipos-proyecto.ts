import type { Proyecto, QuienCreaEquipos, QuienAgregaMiembros } from './database.types';

type PermisosProyecto = Pick<
  Proyecto,
  'id_creador' | 'ids_miembros' | 'quien_crea_equipos' | 'ids_creadores_equipos' | 'ids_gestores_miembros'
>;

/** Opciones de "quién puede crear equipos" en un proyecto, con el texto que ve el usuario. */
export const OPCIONES_CREAR_EQUIPOS: Array<{ valor: QuienCreaEquipos; titulo: string; descripcion: string }> = [
  {
    valor: 'creador',
    titulo: 'Solo yo (el creador)',
    descripcion: 'Solo el creador del proyecto puede crear equipos en él.'
  },
  {
    valor: 'seleccionados',
    titulo: 'Miembros que elija',
    descripcion: 'El creador y los miembros que elijas pueden crear equipos.'
  },
  {
    valor: 'miembros',
    titulo: 'Cualquier miembro del proyecto',
    descripcion: 'Todas las personas que son miembros del proyecto pueden crear equipos.'
  }
];

/** Opciones de "quién puede agregar miembros" al proyecto. */
export const OPCIONES_AGREGAR_MIEMBROS: Array<{ valor: QuienAgregaMiembros; titulo: string; descripcion: string }> = [
  {
    valor: 'creador',
    titulo: 'Solo yo (el creador)',
    descripcion: 'Solo el creador decide quién entra al proyecto.'
  },
  {
    valor: 'seleccionados',
    titulo: 'Miembros que elija',
    descripcion: 'El creador y los miembros que elijas pueden agregar y quitar miembros.'
  }
];

/** ¿Es miembro del proyecto? El creador siempre; los demás, si el proyecto los tiene en su lista de miembros. */
export function esMiembroDelProyecto(proyecto: PermisosProyecto | null | undefined, uid: string | null | undefined): boolean {
  if (!proyecto || !uid) return false;
  return proyecto.id_creador === uid || (proyecto.ids_miembros ?? []).includes(uid);
}

/**
 * ¿Puede este usuario crear equipos en el proyecto? El creador siempre; los demás según el
 * permiso que el creador configuró, y siempre que sean miembros. Es la misma regla que aplica
 * `firestore.rules` (función `puedeCrearEquipoEnProyecto`): si se cambia una, hay que cambiar la otra.
 */
export function puedeCrearEquipos(proyecto: PermisosProyecto | null | undefined, uid: string | null | undefined): boolean {
  if (!proyecto || !uid) return false;
  if (proyecto.id_creador === uid) return true;
  switch (proyecto.quien_crea_equipos ?? 'creador') {
    case 'miembros':
      return esMiembroDelProyecto(proyecto, uid);
    case 'seleccionados':
      return (proyecto.ids_creadores_equipos ?? []).includes(uid);
    default:
      return false;
  }
}

/**
 * ¿Puede agregar o quitar miembros? El creador y los miembros que él autorizó
 * (`puedeGestionarMiembrosProyecto` en `firestore.rules`).
 */
export function puedeAgregarMiembros(proyecto: PermisosProyecto | null | undefined, uid: string | null | undefined): boolean {
  if (!proyecto || !uid) return false;
  if (proyecto.id_creador === uid) return true;
  return (proyecto.ids_gestores_miembros ?? []).includes(uid);
}
