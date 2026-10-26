# ADR-004: Selección masiva de propuestas y alcance de los filtros

## Estado
Aceptada

## Fecha
2026-10-25

## Contexto
KAN-40 añadió la revisión de propuestas generadas por IA, pero la selección era todo o nada por
vista: el botón «Elegir las visibles» marcaba solo lo que dejaban los filtros y la casilla de un
área también operaba sobre las filas visibles. KAN-50 necesita combinar selección individual, por
área y global, mantener la selección mientras se navega entre áreas y filtros, y registrar solo lo
marcado.

La interfaz ya guardaba la selección en `PropuestaRevisable.elegida`, una bandera por propuesta.
El problema no era el almacenamiento, sino el alcance de cada acción y la falta de un contador y
una confirmación explícitos.

## Decisión
1. **`elegida` sigue siendo la única fuente de verdad.** No se crea un `Set` paralelo de claves. Así
   la selección sobrevive a los filtros, a los cambios de agrupación y a la llegada de propuestas
   nuevas sin sincronizar dos estructuras.
2. **«Aprobar todos» marca todas las propuestas seleccionables.** No registra nada: el registro se
   confirma con el botón inferior. Incluye las que los filtros ocultan, y la interfaz lo dice.
3. **«Quitar selección» desmarca todas**, incluidas las ocultas.
4. **La casilla de un área marca o desmarca todo el área, no solo las filas visibles.** Su estado es
   vacío, completo o mixto (`indeterminate` + `aria-checked="mixed"`). El encabezado muestra
   `seleccionadas/total` y cuántas propuestas oculta el filtro. Seleccionar un área nunca toca otra.
5. **«Seleccionar filtrados» marca solo lo visible.** Aparece únicamente cuando hay filtros activos
   y el contador indica cuántos elementos visibles seleccionaría. Es la acción explícita para el
   alcance reducido; el área y «Aprobar todos» mantienen el alcance completo.
6. **Los filtros solo cambian la vista.** Nunca modifican `elegida`. El contador global se calcula
   sobre todas las propuestas, no sobre `visibles`.
7. **Una propuesta sin texto no es seleccionable.** Si el usuario borra el enunciado de una
   propuesta marcada, se desmarca sola. `prepararRegistro()` vuelve a filtrar seleccionadas, texto
   no vacío y claves repetidas antes de enviar.
8. **El registro es explícito y protegido.** La página pide confirmación con la cantidad, valida
   permisos y equipo, deshabilita el botón mientras procesa y usa una guarda por referencia contra
   el doble clic o el Enter repetido. Solo las propuestas creadas salen de la revisión; las no
   seleccionadas y las que fallaron permanecen.

## Alternativas consideradas
**Un `Set<string>` separado con las claves seleccionadas.** Se descartó porque habría que mantenerlo
sincronizado con la lista de propuestas en cada regeneración, edición y filtro. Una bandera por
propuesta ya existía desde KAN-40 y no puede quedar desincronizada.

**Que la casilla del área seleccione solo las filas visibles.** Se descartó porque hace ambigua la
diferencia entre «seleccionar el área» y «seleccionar los resultados filtrados». Con la decisión
actual, el área representa el módulo completo y la acción de filtros representa lo visible; la
interfaz muestra las ocultas para que el alcance no sea sorpresivo.

**Que «Aprobar todos» registre inmediatamente.** Se descartó por seguridad: un clic accidental
crearía decenas de requerimientos. La acción solo selecciona y el registro siempre pasa por una
confirmación con la cantidad exacta.

**Limpiar la selección al cambiar de filtro.** Se descartó porque el requisito pide conservarla y
porque obligaría al usuario a repetir su trabajo cada vez que ajusta la vista.

## Consecuencias
- El contador global y el del área incluyen propuestas que los filtros ocultan; el encabezado del
  área muestra cuántas oculta el filtro para evitar sorpresas.
- Una propuesta con el enunciado vacío no se puede marcar y no bloquea el registro; si se borra
  después de marcarla, se desmarca automáticamente.
- No hay cambios de esquema, de reglas de Firestore ni de la generación con IA. La selección solo
  alterna `elegida` y conserva `prioridad`, `posibleDuplicado` y los demás campos de KAN-40, de modo
  que una integración posterior de KAN-49 no pierde datos.
- El registro sigue creando requerimientos en «Pendiente de aprobación»; KAN-50 no altera el flujo
  de aprobación de KAN-18.

## Referencias
- KAN-50: selección y registro de propuestas de IA
- KAN-40: generación completa e iterativa
- `components/requerimientos/GeneracionIterativa.tsx`: panel, filtros y casillas
- `lib/seleccion-propuestas.ts`: `esSeleccionable`, `estadoSeleccion`, `aplicarSeleccion` y
  `prepararRegistro`
- `app/requerimientos/page.tsx`: confirmación, guarda de doble envío y registro por lotes
- `tests/components/GeneracionIterativa.test.tsx` y `tests/lib/seleccion-propuestas.test.ts`
