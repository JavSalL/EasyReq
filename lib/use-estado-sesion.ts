'use client';

import { useEffect, useState } from 'react';

function leer<T>(clave: string | null, inicial: T): T {
  if (!clave || typeof window === 'undefined') return inicial;
  try {
    const guardado = window.sessionStorage.getItem(clave);
    return guardado === null ? inicial : (JSON.parse(guardado) as T);
  } catch {
    return inicial;
  }
}

/**
 * `useState` que recuerda su valor mientras dure la sesión del navegador
 * (sessionStorage). Sirve para búsquedas y filtros: al entrar a un proyecto y
 * volver, la lista sigue como estaba. Si `clave` es null (todavía no se conoce)
 * se usa el valor inicial, y cuando la clave cambia se carga el valor de esa clave.
 */
export function useEstadoSesion<T>(clave: string | null, inicial: T) {
  const [claveActual, setClaveActual] = useState(clave);
  const [valor, setValor] = useState<T>(() => leer(clave, inicial));

  // Ajuste de estado durante el render cuando la clave cambia
  if (clave !== claveActual) {
    setClaveActual(clave);
    setValor(leer(clave, inicial));
  }

  useEffect(() => {
    if (!clave) return;
    try {
      window.sessionStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      // Sin almacenamiento disponible: el valor solo dura mientras la página esté abierta
    }
  }, [clave, valor]);

  return [valor, setValor] as const;
}
