// Convierte errores de Firebase en mensajes que expliquen la causa al usuario.

function codigoError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code: unknown = (err as { code?: unknown }).code;
    return typeof code === 'string' ? code : '';
  }
  return '';
}

/**
 * Mensaje para mostrar en un toast. `fallback` describe qué se intentaba hacer
 * (p. ej. "No se pudo guardar el proyecto") y se usa si la causa es desconocida.
 */
export function mensajeError(err: unknown, fallback: string): string {
  switch (codigoError(err)) {
    case 'permission-denied':
      return 'No tienes permiso para realizar esta acción.';
    case 'unauthenticated':
      return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
    case 'not-found':
      return 'El elemento ya no existe. Recarga la página.';
    case 'resource-exhausted':
      return 'Se alcanzó el límite de uso del servidor. Inténtalo más tarde.';
    case '':
      // Errores propios del servicio (`throw new Error('...')`) ya traen un
      // mensaje en español pensado para el usuario
      if (err instanceof Error && err.message) return err.message;
      return `${fallback}. Inténtalo de nuevo.`;
    default:
      return `${fallback}. Inténtalo de nuevo.`;
  }
}
