// La pantalla de un proyecto tiene tres vistas (requerimientos, equipos y miembros) y, dentro de la de
// equipos, puede abrirse un equipo. Se reflejan en la URL (?id=…&vista=equipos&equipo=…) para que
// el botón "atrás" del navegador y los enlaces funcionen. Con `output: 'export'` no hay servidor que
// resuelva searchParams, así que se lee la URL real del navegador (como hace el resto de la pantalla).

export type VistaProyecto = 'requerimientos' | 'equipos' | 'miembros';

export const EVENTO_NAVEGACION = 'easyreq:navegacion';
export const EVENTO_EQUIPOS_CAMBIARON = 'easyreq:equipos-cambiaron';

export function leerNavegacion(): { vista: VistaProyecto; equipoId: string | null } {
  const params = new URLSearchParams(window.location.search);
  const pedida = params.get('vista');
  const vista: VistaProyecto = pedida === 'equipos' || pedida === 'miembros' ? pedida : 'requerimientos';
  return { vista, equipoId: vista === 'equipos' ? params.get('equipo') : null };
}

/** Cambia de vista (y de equipo abierto) sin recargar, dejando la URL lista para "atrás" y para compartir. */
export function irA(proyectoId: string, vista: VistaProyecto, equipoId: string | null = null): void {
  const params = new URLSearchParams();
  params.set('id', proyectoId);
  if (vista !== 'requerimientos') params.set('vista', vista);
  if (vista === 'equipos' && equipoId) params.set('equipo', equipoId);
  window.history.pushState(null, '', `?${params.toString()}`);
  window.dispatchEvent(new Event(EVENTO_NAVEGACION));
}

export function suscribirNavegacion(alCambiar: () => void): () => void {
  window.addEventListener('popstate', alCambiar);
  window.addEventListener(EVENTO_NAVEGACION, alCambiar);
  return () => {
    window.removeEventListener('popstate', alCambiar);
    window.removeEventListener(EVENTO_NAVEGACION, alCambiar);
  };
}
