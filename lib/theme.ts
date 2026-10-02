// Tema claro/oscuro. El valor vive en `data-theme` de <html> (lo aplica el
// script de app/layout.tsx antes de pintar) y se recuerda en localStorage.
// El tema por defecto es el claro.

export type Tema = 'light' | 'dark';

export const CLAVE_TEMA = 'easyreq-theme';

/** Se inyecta en <head> para evitar el parpadeo del tema al cargar. */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem('${CLAVE_TEMA}');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}`;

export function leerTema(): Tema {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function temaServidor(): Tema {
  return 'light';
}

export function suscribirTema(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

export function fijarTema(tema: Tema): void {
  document.documentElement.dataset.theme = tema;
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Sin almacenamiento (modo privado): el tema solo dura la sesión
  }
}
