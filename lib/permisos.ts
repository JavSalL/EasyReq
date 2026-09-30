// Autorización del cliente. NO es una frontera de seguridad: la real está en
// `firestore.rules`, que es lo único que un usuario no puede esquivar llamando al
// API a mano. Aquí solo se decide qué botones se muestran y qué operaciones se
// cortan antes de gastar una ida al servidor.
//
// Existe como módulo aparte para que el sistema de roles que viene en un ticket
// posterior tenga un único sitio donde enchufarse, en lugar de condiciones
// repartidas por las páginas.

import { MENSAJE_SIN_PERMISOS } from './errores';

export { MENSAJE_SIN_PERMISOS };

/**
 * ¿Puede este usuario editar o eliminar elementos de los catálogos `patron` y
 * `modelo`?
 *
 * KAN-17: hoy la respuesta es siempre `false`. Los catálogos están congelados:
 * cualquier usuario autenticado puede verlos y copiarlos, pero nadie los edita ni
 * los borra. Es lo que pide el ticket, y es coherente con lo que ya hace
 * `match /roles` en `firestore.rules`, donde `update` y `delete` están negados.
 *
 * Para devolver esos permisos a un rol concreto basta con cambiar el cuerpo de
 * esta función. Las páginas que la consultan recuperan solas los botones de
 * editar y eliminar, porque nunca se borraron del JSX: siguen montados detrás de
 * esta comprobación.
 *
 * Ojo al cambiarlo: esto NO basta para reabrir permisos. Hay que cambiar también
 * el helper `puedeEditarCatalogos` de `firestore.rules`, que es el que manda. Si
 * solo se cambia este, la interfaz ofrecería una acción que el backend seguiría
 * denegando.
 *
 * Cuando exista el sistema de roles, el perfil del usuario es lo que tendrá que
 * decidir aquí, y habrá que pasar el perfil en los dos sitios que llaman a esta
 * función: la página de patrones y `updatePatron` / `deletePatron` del servicio.
 */
export function puedeEditarCatalogos(): boolean {
  return false;
}
