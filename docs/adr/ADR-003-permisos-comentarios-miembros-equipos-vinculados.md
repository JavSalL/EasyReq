# ADR-003: Permisos de comentarios para miembros de equipos vinculados

## Estado
Aceptada

## Fecha
2025-10-20

## Contexto
KAN-27 añade comentarios a requerimientos. El modelo de permisos existente verifica la membresía únicamente con `proyecto.id_creador` o `proyecto.ids_miembros`. Los miembros que pertenecen a algún equipo vinculado al proyecto no aparecen en esa lista, por lo que tanto la UI (cliente) como Firestore Rules denegaban su acceso para leer/escribir comentarios.

## Decisión
Se adopta la Opción 2: sincronizar las membresías de `miembros_equipo` hacia `proyecto.ids_miembros` cada vez que cambia la pertenencia a un equipo (creación de equipo, creación de equipo en proyecto, aceptación de invitación de equipo y baja de miembro).

Además, para mantener la coherencia entre cliente y reglas y facilitar las comprobaciones en Firestore Rules, se añade el campo `ids_equipos_vinculados` al documento `proyecto`, manteniéndolo actualizado cuando se vinculan o desvinculan equipos.

Como mitigación transitoria (y para no romper la UX mientras se completa la sincronización de datos existentes), se añade un fallback en cliente (`esMiembroPorEquipoVinculado`) que detecta la membresía a través de equipos vinculados. También se amplía `esMiembroDelProyecto` en `firestore.rules` para reconocer esa membresía.

## Alternativas consideradas
**Opción 1: Expandir las comprobaciones para recorrer equipos vinculados.** Consistiría en que cliente y reglas buscaran vínculos en `proyecto_equipos` y verificaran membresías en `miembros_equipo`. Se descartó por las limitaciones de Firestore Rules: no permite listados arbitrarios ni bucles, dificulta expresar la pertenencia de forma eficiente y segura, y aumenta la complejidad y fragilidad de las reglas.

## Consecuencias
- **Simplicidad y coherencia:** las reglas siguen comprobando únicamente `id_creador` e `ids_miembros`, manteniendo el modelo existente y evitando recorridos complejos en reglas.
- **Rendimiento predecible:** las lecturas de permisos son directas sobre el documento `proyecto`.
- **Mantenimiento sincronizado:** el servicio de equipos es el único responsable de propagar los cambios de membresía hacia el proyecto.
- **Compatibilidad con datos existentes:** requiere un backfill puntual para proyectos con equipos vinculados previos a este cambio (resuelto con script temporal).
- **Esquema ampliado:** se añade `ids_equipos_vinculados` a `Proyecto` (opcional) y se mantiene actualizado en los flujos de vinculación/desvinculación.

## Referencias
- KAN-27: Comentarios en requerimientos
- `lib/services/equipos-service.ts`: sincronización de membresías
- `firestore.rules`: helper `esMiembroPorEquipoVinculado`
- `app/requerimientos/page.tsx`: fallback de membresía en cliente
