import type { Proyecto, QuienCreaEquipos } from './database.types';

/** Opciones de "quién puede crear equipos" en un proyecto, con el texto que ve el usuario. */
export const OPCIONES_CREAR_EQUIPOS: Array<{ valor: QuienCreaEquipos; titulo: string; descripcion: string }> = [
  {
    valor: 'creador',
    titulo: 'Solo yo (el creador)',
    descripcion: 'Solo el creador del proyecto puede crear equipos en él.'
  },
  {
    valor: 'seleccionados',
    titulo: 'Usuarios que elija',
    descripcion: 'El creador y los usuarios que elijas pueden crear equipos.'
  },
  {
    valor: 'cualquiera',
    titulo: 'Cualquier usuario',
    descripcion: 'Cualquier persona con sesión iniciada puede crear equipos en el proyecto.'
  }
];

/**
 * ¿Puede este usuario crear equipos en el proyecto? El creador siempre puede;
 * los demás según el permiso que el creador configuró. Es la misma regla que
 * aplica `firestore.rules` (función `puedeCrearEquipoEnProyecto`): si se cambia
 * una, hay que cambiar la otra.
 */
export function puedeCrearEquipos(
  proyecto: Pick<Proyecto, 'id_creador' | 'quien_crea_equipos' | 'ids_creadores_equipos'> | null | undefined,
  uid: string | null | undefined
): boolean {
  if (!proyecto || !uid) return false;
  if (proyecto.id_creador === uid) return true;
  switch (proyecto.quien_crea_equipos ?? 'creador') {
    case 'cualquiera':
      return true;
    case 'seleccionados':
      return (proyecto.ids_creadores_equipos ?? []).includes(uid);
    default:
      return false;
  }
}
