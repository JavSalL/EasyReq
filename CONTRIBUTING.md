# Modo de trabajo — EasyReq

Guía rápida para todo el equipo sobre cómo organizamos el trabajo y cómo se integra el código al repositorio.

## Tickets (Jira)

- Usamos **Jira** para llevar el registro de todo el trabajo: bugs, funciones nuevas, mejoras, etc.
- **Cualquiera puede crear un ticket** para una función o cambio nuevo, aunque no vaya a ser quien lo implemente. La idea es dejar planeado lo que hace falta, aunque lo trabaje otra persona después.
- Antes de empezar a trabajar en algo, revisa el tablero:
  - Si el ticket **no tiene a nadie asignado**, puedes asignártelo tú mismo y empezar.
  - Si el ticket **ya tiene a alguien asignado**, no lo tomes — coordina con esa persona si crees que hace falta ayuda.
- Si vas a trabajar en algo que no tiene ticket todavía, créalo primero (aunque sea breve) antes de ponerte a codear.

## Ramas y commits

- No se trabaja directo sobre `main`. Crea una rama a partir de `main` para tu ticket, y el nombre **debe incluir el ID del ticket de Jira**, por ejemplo:
  ```
  feature/EASY-123-nombre-corto-de-la-funcion
  fix/EASY-124-nombre-corto-del-bug
  ```
  Esto permite identificar rápido a qué ticket corresponde cada rama (y Jira puede enlazarlas automáticamente si está integrado con GitHub).
- Haz commits pequeños y descriptivos según avances. No hace falta esperar a terminar todo para hacer commit.

## Pull Requests

- Todo cambio llega a `main` **a través de un Pull Request**, nunca con push directo.
- Los PRs **no deben ser pequeños o fragmentados**. Cada PR debe representar una funcionalidad completa y funcional (por ejemplo, una pantalla nueva completa, no solo "el formulario" en un PR y "la lista" en otro). Evita abrir PRs a medias que dejen la app en un estado roto o incompleto.
- Antes de abrir el PR, asegúrate de que:
  - El proyecto compila (`npm run build`) sin errores.
  - Probaste la funcionalidad manualmente en el navegador.
- Al abrir el PR, describe brevemente qué hace el cambio y, si aplica, enlaza el ticket de Jira correspondiente.
- **Ningún PR se mergea sin al menos una review aprobada de otra persona del equipo.** Aunque el cambio parezca simple o urgente, espera la revisión.
- Si el revisor deja comentarios, atiéndelos (o discútelos) antes de mergear.
- Quien abre el PR es responsable de resolver conflictos con `main` si los hay.

## Resumen del flujo

1. Reviso el tablero de Jira → tomo un ticket sin asignar (o creo uno nuevo si hace falta).
2. Me asigno el ticket y creo una rama desde `main` con el ID del ticket en el nombre.
3. Trabajo, hago commits, y pruebo que todo funcione.
4. Abro un Pull Request describiendo el cambio.
5. Espero a que alguien del equipo lo revise y apruebe.
6. Se mergea a `main`.

Cualquier duda sobre este flujo, pregúntale a Javier.
