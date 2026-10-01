'use client';

import { useCallback, useState } from 'react';
import { useConfirm } from '@/components/ui/ConfirmProvider';

/**
 * Evita perder lo escrito en un formulario modal por un clic o una tecla
 * accidental. Recuerda los valores del formulario al abrirse y, si al cerrar
 * hay diferencias, pide confirmación antes de descartar.
 *
 * Uso:
 *   const { hayCambios, intentarCerrar } = useCierreSeguro(isOpen, formData, () => setIsOpen(false));
 *   <Modal onClose={intentarCerrar} cerrarConFondo={!hayCambios} ...>
 *
 * Los valores deben estar listos en el mismo render en que `abierto` pasa a
 * true (se cargan en el mismo manejador que abre el modal).
 */
export function useCierreSeguro<T>(abierto: boolean, valores: T, cerrar: () => void) {
  const confirmar = useConfirm();
  const [abiertoPrevio, setAbiertoPrevio] = useState(false);
  const [inicial, setInicial] = useState('');
  const actual = JSON.stringify(valores);

  // Ajuste de estado durante el render: la foto inicial se toma al abrir
  if (abierto !== abiertoPrevio) {
    setAbiertoPrevio(abierto);
    if (abierto) setInicial(actual);
  }

  const hayCambios = abierto && actual !== inicial;

  const intentarCerrar = useCallback(async () => {
    if (!hayCambios) {
      cerrar();
      return;
    }
    const descartar = await confirmar({
      titulo: '¿Descartar los cambios?',
      mensaje: 'Lo que escribiste todavía no se ha guardado.',
      textoConfirmar: 'Descartar',
      peligro: true
    });
    if (descartar) cerrar();
  }, [hayCambios, cerrar, confirmar]);

  return { hayCambios, intentarCerrar };
}
