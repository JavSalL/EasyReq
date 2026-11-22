'use client';

import toast from 'react-hot-toast';

/** Segundos que se ofrece «Deshacer» antes de hacer la acción de verdad. */
export const SEGUNDOS_DESHACER = 6;

interface AccionPendiente {
  ejecutar: () => void;
}

// Acciones esperando su plazo. Si la pestaña se cierra antes, se ejecutan ya:
// quien pulsó «Eliminar» espera que se elimine aunque no espere los segundos.
const pendientes = new Set<AccionPendiente>();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const p of Array.from(pendientes)) p.ejecutar();
  });
}

/**
 * Hace una acción después de unos segundos y mientras tanto ofrece «Deshacer»
 * en un aviso. Sustituye a la ventana de «¿Seguro?» en acciones pequeñas y
 * frecuentes: quien se equivoca lo arregla con un clic y quien no, no espera.
 *
 * `alAplicar` corre al instante (p. ej. ocultar la fila), `alConfirmar` al
 * vencer el plazo (la escritura real) y `alDeshacer` si la persona se arrepiente.
 */
export function accionConDeshacer({
  mensaje,
  alAplicar,
  alConfirmar,
  alDeshacer,
}: {
  mensaje: string;
  alAplicar?: () => void;
  alConfirmar: () => void | Promise<void>;
  alDeshacer?: () => void;
}) {
  let terminado = false;
  let idAviso = '';

  const accion: AccionPendiente = {
    ejecutar: () => {
      if (terminado) return;
      terminado = true;
      window.clearTimeout(temporizador);
      pendientes.delete(accion);
      toast.dismiss(idAviso);
      void alConfirmar();
    },
  };

  const deshacer = () => {
    if (terminado) return;
    terminado = true;
    window.clearTimeout(temporizador);
    pendientes.delete(accion);
    toast.dismiss(idAviso);
    alDeshacer?.();
  };

  alAplicar?.();
  pendientes.add(accion);
  const temporizador = window.setTimeout(accion.ejecutar, SEGUNDOS_DESHACER * 1000);

  idAviso = toast(
    () => (
      <span className="flex items-center gap-4">
        <span role="status">{mensaje}</span>
        <button
          type="button"
          onClick={deshacer}
          className="shrink-0 -my-1 px-2.5 min-h-8 rounded-ui text-sm font-semibold text-brand-text hover:bg-brand-subtle transition-colors cursor-pointer"
        >
          Deshacer
        </button>
      </span>
    ),
    // Abajo al centro: cerca del pulgar y sin tapar la barra superior
    { duration: SEGUNDOS_DESHACER * 1000, position: 'bottom-center' }
  );
}
