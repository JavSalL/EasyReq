// Autorización del cliente. NO es una frontera de seguridad: la real está en
// `firestore.rules`, que es lo único que un usuario no puede esquivar llamando al
// API a mano. Aquí solo se decide qué botones se muestran y qué operaciones se
// cortan antes de gastar una ida al servidor.
//
// Existe como módulo aparte para que el sistema de roles que viene en un ticket
// posterior tenga un único sitio donde enchufarse, en lugar de condiciones
// repartidas por las páginas.

import { MENSAJE_SIN_PERMISOS } from './errores';
import {
  ESTADO_PENDIENTE_APROBACION,
  ESTADO_RECHAZADO
} from './services/catalogos-service';

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

// ==========================================
// APROBACIÓN DE REQUERIMIENTOS (KAN-18)
// ==========================================
// Estas cuatro funciones traducen a la interfaz las reglas de aprobación de
// `firestore.rules`. Si una dice `true` y la regla dice `false`, el usuario pulsa un
// botón que el backend le va a denegar; si dice `false` y la regla dice `true`, le
// escondemos algo que sí podría hacer. Cada una cita en un comentario la regla que
// responde.
//
// El liderazgo NO se deduce aquí: ya existe `esRolLider` en
// `equipos-service.ts` y lo usan cuatro sitios. Para saber si alguien lidera un
// equipo concreto están `isLiderDeEquipo` y `getEquiposLideradosPor`; quien llama
// resuelve eso una vez y le pasa el booleano.

/**
 * ¿Está este requerimiento esperando aprobación? Uno recién creado y otro
 * reenviado tras un rechazo se comportan igual.
 */
export function estaPendienteDeAprobacion(estadoNombre: string | null | undefined): boolean {
  return estadoNombre === ESTADO_PENDIENTE_APROBACION;
}

/** ¿Está en "Rechazado", y por tanto se puede corregir y reenviar? */
export function estaRechazado(estadoNombre: string | null | undefined): boolean {
  return estadoNombre === ESTADO_RECHAZADO;
}

/**
 * ¿Puede este usuario aprobar o rechazar este requerimiento? Regla:
 * `esDecisionDelAprobador`.
 *
 * Hace falta ser líder del equipo al que pertenece el requerimiento, y solo
 * mientras esté pendiente. Un requerimiento ya aprobado o ya implementado no se
 * vuelve a decidir, ni siquiera por el líder.
 *
 * `esLider` lo calcula quien llama con `getEquiposLideradosPor`, que devuelve los
 * equipos del usuario de una sola vez; aquí no se vuelven a pedir los roles.
 *
 * Cuando exista el sistema de roles, esta es LA función a cambiar: devolvería
 * `true` para quien tenga un rol con permiso de aprobación, sea o no líder del
 * equipo. Y habría que cambiar a la vez `esAprobador` en `firestore.rules`.
 */
export function puedeAprobarRequerimientos(
  esLider: boolean,
  estadoNombre: string | null | undefined
): boolean {
  return esLider && estaPendienteDeAprobacion(estadoNombre);
}

/**
 * ¿Puede este usuario corregir el contenido de este requerimiento? Reglas:
 * `esReenvioDelAutor` (dentro del ciclo) o `esEdicionEnFlujoNormal` (fuera).
 *
 * Dentro del ciclo de aprobación solo el autor. El líder no edita el texto: decide.
 * Confundir las dos cosas dejaría al líder reescribir el requerimiento que debe
 * juzgar.
 *
 * Fuera del ciclo manda el proyecto, y eso lo comprueba quien llama con
 * `esMiembroDelProyecto`; aquí solo se aísla el caso "es el autor".
 *
 * No se filtra por estado a propósito. Editar un requerimiento en espera no
 * esquiva nada, porque sigue esperando.
 */
export function puedeEditarRequerimiento(esAutor: boolean): boolean {
  return esAutor;
}

/**
 * ¿Puede este autor devolver su requerimiento rechazado al flujo? Regla:
 * `esReenvioDelAutor` avanzando a "Pendiente de aprobación".
 *
 * Es el paso que cierra el ciclo: corregir y reenviar. Solo el autor y solo desde
 * "Rechazado". Reenviar algo que ya está en espera no hace nada, y hacerlo desde
 * "Aprobado" sería intentar deshacer una aprobación sin que el líder la vuelva a ver.
 */
export function puedeReenviarRequerimiento(
  esAutor: boolean,
  estadoNombre: string | null | undefined
): boolean {
  return esAutor && estaRechazado(estadoNombre);
}
