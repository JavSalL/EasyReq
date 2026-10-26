# ADR-003: Permisos de comentarios para miembros de equipos vinculados

## Estado
Aceptada

## Fecha
2026-10-25

## Contexto
KAN-27 añade comentarios a requerimientos. El modelo de permisos existente verifica la membresía
únicamente con `proyecto.id_creador` o `proyecto.ids_miembros`. Los miembros que pertenecen a un
equipo vinculado al proyecto no aparecen en esa lista, por lo que la interfaz y Firestore Rules les
denegaban leer y escribir en el hilo.

La restricción de fondo es de las reglas: una consulta no puede leer `resource.data` de los
resultados, y una regla no puede enumerar documentos para descubrir qué equipos están vinculados.
La membresía tiene que salir del path o de un dato conocido del proyecto.

## Decisión
1. **La membresía del hilo es directa o por equipo vinculado.** `esMiembroDelProyectoConEquipos`
   suma `id_creador`, `ids_miembros` y los miembros de un equipo vinculado.
   `esMiembroDelProyecto` se queda como estaba (directa) para requerimientos, historial e
   invitaciones: ampliarla habría cambiado permisos que KAN-27 no toca.
2. **El puntero es una pista, no una autorización.** El cliente deja
   `proyecto/{id}/acceso_comentarios/{uid}` con un `id_equipo` por el que entra. Las reglas leen ese
   documento y, en cada operación, revalidan que el usuario sigue en
   `miembros_equipo/{equipo}_{uid}` y que el equipo sigue en
   `proyecto_equipos/{proyecto}_{equipo}`. Si lo sacan del equipo o desvinculan el equipo, el
   puntero deja de valer aunque siga escrito. Un usuario solo puede crear o actualizar su propio
   puntero.
3. **Coste fijo, sin tope de equipos.** La comprobación gasta seis accesos fijos (proyecto:
   `exists` + `get`; puntero: `exists` + `get`; membresía y vínculo: dos `exists`) y ocho cuando
   además hay que resolver el requerimiento del path (`exists` + `get`), independientemente de
   cuántos equipos tenga el proyecto. Enumerar los equipos desde el proyecto costaría dos lecturas
   por equipo y agotaría el presupuesto de 10 accesos con más de cuatro, dejando fuera a miembros
   legítimos.
4. **El servicio crea o repara el puntero.** `asegurarAccesoComentariosProyecto()` se ejecuta antes
   de abrir el hilo. Si el puntero no existe, apunta a un equipo del que el usuario ya salió o a un
   equipo desvinculado, lo reemplaza por otro vínculo válido o devuelve `false`. Los miembros
   directos del proyecto no necesitan puntero.
5. **El contador usa la misma membresía.** `esConteoComentarios` permite a un miembro del hilo
   actualizar solo `total_comentarios`, en la misma transacción que crea o borra el comentario.

## Alternativas consideradas
**Sincronizar los miembros de los equipos en `proyecto.ids_miembros`.** Fue la primera opción. Se
descartó porque mezcla dos conceptos distintos (miembro directo y miembro por equipo), deja datos
obsoletos cuando alguien sale de un equipo o el equipo se desvincula, y amplía los permisos de
requerimientos e invitaciones sin que el ticket lo pida.

**Guardar una caché de equipos vinculados en el proyecto y recorrerla en las reglas.** Se implementó
y se descartó: cada equipo cuesta dos lecturas (`miembros_equipo` + `proyecto_equipos`), así que el
presupuesto de 10 accesos solo alcanza para cuatro. Un proyecto con más equipos deja fuera a miembros
legítimos. Además, la caché hay que repararla y puede quedar desactualizada.

**Abrir el hilo a cualquier autenticado.** Rompe el requisito de que un usuario externo no lea ni
escriba. La alternativa contraria, negar toda consulta, también rompe el ticket.

**Ampliar `esMiembroDelProyecto` para todos los flujos.** Habría cambiado el alta y la edición de
requerimientos, el historial y las invitaciones. KAN-27 no debe introducir un sistema de roles ni
alterar permisos existentes.

## Consecuencias
- Los miembros de equipos vinculados pueden leer, comentar y corregir/borrar lo suyo; el creador
  del proyecto puede borrar cualquier comentario.
- Un proyecto puede tener cualquier número de equipos vinculados: la comprobación no crece con el
  proyecto.
- El puntero añade un documento por usuario y proyecto. Es barato, se escribe solo al abrir el hilo
  y no se necesita para miembros directos. Al borrar el proyecto se limpia junto con el resto de la
  cascada.
- Un puntero obsoleto no concede acceso: las reglas revalidan la membresía y el vínculo. El servicio
  lo repara en la siguiente apertura.
- El hilo no cambia el estado del requerimiento ni crea notificaciones: eso queda fuera de KAN-27.

## Referencias
- KAN-27: Comentarios en requerimientos
- `firestore.rules`: `esMiembroDelProyectoConEquipos`,
  `esMiembroPorEquipoVinculadoConPuntero` y `match /requerimiento/{id}/comentario/{id}`
- `lib/services/comentarios-service.ts`: `asegurarAccesoComentariosProyecto()`, hilo, contador y
  cascada
- `lib/services/equipos-service.ts`: `equipoVinculadoDelUsuario()` y
  `esMiembroDeEquipoVinculadoAProyecto()`
- `docs/firestore-rules.md`: presupuesto de lecturas y puntero de acceso
- `docs/data-model.md`: `Comentario`, `total_comentarios` y `acceso_comentarios`
