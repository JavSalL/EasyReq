import type { Proyecto } from './database.types';

type PermisosProyecto = Pick<Proyecto, 'id_creador' | 'ids_miembros'>;

/** ¿Es miembro del proyecto? El creador siempre; los demás, si el proyecto los tiene en su lista de miembros. */
export function esMiembroDelProyecto(proyecto: PermisosProyecto | null | undefined, uid: string | null | undefined): boolean {
  if (!proyecto || !uid) return false;
  return proyecto.id_creador === uid || (proyecto.ids_miembros ?? []).includes(uid);
}

/**
 * ¿Es el creador del proyecto? Espejo de `isProjectCreator` de `firestore.rules`,
 * que desde KAN-27 decide quién puede borrar comentarios ajenos en el hilo de un
 * requerimiento.
 */
export function esCreadorDelProyecto(
  proyecto: PermisosProyecto | null | undefined,
  uid: string | null | undefined
): boolean {
  if (!proyecto || !uid) return false;
  return proyecto.id_creador === uid;
}
