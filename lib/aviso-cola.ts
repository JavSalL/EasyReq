import toast from 'react-hot-toast';
import type { AvisoEspera } from './ai-actions';

/**
 * Aviso de la cola de la IA (KAN-43) para las llamadas sueltas: cuando la plataforma está ocupada,
 * muestra "En cola, continúa en N s" con la cuenta atrás y lo quita al seguir.
 */
export function avisoColaToast(id = 'cola-ia'): AvisoEspera {
  return segundos => {
    if (segundos === undefined) toast.dismiss(id);
    else toast.loading(`En cola, continúa en ${segundos} s`, { id });
  };
}
