# Validación de la generación iterativa (KAN-47)

Mediciones del 17 de noviembre de 2026 con `gemini-3.5-flash-lite` y la key de desarrollo (nivel gratuito).

## Qué se corrió y qué no

| Prueba | Cómo | Resultado |
|---|---|---|
| Corrida completa de un sistema real | `scripts/medir-generacion.mts`: EasyReq como sistema, estrictez 2, con el texto de la página de Ayuda como contexto (12 561 caracteres, `contexto-easyreq.txt`) | `easyreq-sistema-e2.json` |
| Casos de generación (4 niveles de estrictez, 5 tipos de pedido) | `scripts/probar-ia.mts --generacion` | 6/6 correctos, `probar-ia-generacion-2026-11-17.txt` |
| Alta en lote con cientos de requerimientos | `scripts/probar-registro-lote.mts` en el emulador de Firestore y Auth con las reglas del repo | 300 y 900 creados, números consecutivos, 0 logs perdidos |

**No se hizo** la corrida con el Worker y las reglas desplegados ni el registro desde la app con sesión iniciada: no se desplegó nada. La corrida medida repite el recorrido del cliente (mismos prompts, intérpretes, filtros y topes) llamando a Gemini directamente y espaciando las llamadas 6 s, como el límite de 10 por minuto del Worker.

## Corrida completa (EasyReq, estrictez 2)

- **Áreas:** 13 (5 funcionales y las 8 transversales de calidad).
- **Llamadas del job:** 25 de 60 (plan, 22 lotes, 1 cobertura, 1 de embeddings). Ningún lote necesitó repetirse por títulos.
- **Duración:** 146 s con el ritmo de 10 por minuto. El lote tardó 6,4 s de mediana (máximo 11,3 s), así que el límite por minuto, no Gemini, marca la duración: unos 6 s por llamada.
- **Tokens (generateContent):** 121 809 de entrada y 45 524 de salida. Por lote, unos 4 700 de entrada y 2 000 de salida; el plan, 3 889 y 865; la cobertura, 13 785 y 11 (no encontró nada que faltara).
- **Propuestas:** 307, de ellas 126 inferidas y 0 con cifras sin respaldo. Se descartaron 5 por repetir otra propuesta (similitud léxica ≥ 0,85).
- **Por área:** todas terminaron porque la IA las dio por completas, en 1 o 2 lotes. Nunca se llegó a los 8 lotes por área ni a las 400 propuestas.

## Topes

- **60 llamadas por corrida:** se usaron 25 para 13 áreas (como mucho 2 lotes por área). Con 20 áreas a ese ritmo serían unas 45 a 55, todavía por debajo. **Se mantiene.**
- **8 lotes por área:** ninguna área pasó de 2. No hay datos para bajarlo; **se mantiene** como freno.
- **400 propuestas:** 307 con 13 áreas. Con 20 áreas se podría alcanzar; **se mantiene** porque es el límite de lo que se puede revisar a mano.

## Umbrales de duplicados

**Léxico (trigramas):** se revisaron a mano los 41 pares marcados.
- Entre 0,80 y 0,85 hay duplicados reales ("editar requerimientos aprobados", 0,847) mezclados con requerimientos distintos ("marcar todas" frente a "desmarcar todas", 0,844; "activar o desactivar un integrante" frente a "modificar sus roles", 0,845). Bajar el descarte automático de 0,85 tiraría requerimientos válidos. **Se mantiene 0,85.**
- Entre 0,60 y 0,70 aproximadamente uno de cada cuatro es un duplicado real (p. ej. "reintentar la conexión con Firestore", 0,622). Como solo es una marca para revisar, **se mantiene 0,60.**

**Semántico (embeddings):** 0,90 no sirve con `gemini-embedding-001`. Casi todos los enunciados de un mismo sistema pasan de 0,80:

| Coseno ≥ | Propuestas marcadas (de 307) |
|---|---|
| 0,85 | 284 |
| 0,90 | 130 |
| 0,92 | 69 |
| 0,95 | 28 |

Desde 0,95 casi todos los pares son el mismo requerimiento redactado de otra forma: revisados a mano, 3 de los 28 son requerimientos distintos (p. ej. el historial de "cambios de rol" frente al de "altas", 0,974). Entre 0,90 y 0,95 abundan los distintos. **Se sube a 0,95.**

## Embeddings en el nivel gratuito

Con la key de desarrollo, la llamada de embeddings de la corrida falló con 429 (`EmbedContentRequestsPerMinutePerUserPerProjectPerModel-FreeTier`): cada texto cuenta como una petición por minuto y 307 textos no caben en un minuto. Repitiendo cada tanda de 100 tras el `retryDelay` que indica Google (de 4 a 23 s) sí se completó. El Worker ahora hace eso mismo, hasta 75 s de espera en total. Con más de unos 300 textos (propuestas y existentes juntos) en el nivel gratuito, la revisión por significado puede seguir fallando; entonces quedan solo las marcas léxicas, como antes.

## Alta en lote

- 300 requerimientos: un `writeBatch` de 300. 900: dos de 450. Todos con número consecutivo y el contador del proyecto al día.
- **Logs:** con las reglas actuales, un lote de 7 o más logs se rechaza por el límite de lecturas de las reglas y uno de 6 pasa. El tope era 15, así que cada alta gastaba un lote rechazado antes de partirlo a la mitad. **Se baja a 5.**

## Calidad de los lotes tardíos

- Los segundos lotes no se repiten: 3 de 113 tienen un par con coseno ≥ 0,95, frente a 25 de 194 en los primeros.
- Sí se vuelven más especulativos: 75 % inferidas (frente a 21 % en el primero) y 21 % con "(por definir)" (frente a 12 %). Aparecen funciones que el contexto no menciona (un "administrador", bloqueo de edición concurrente, respaldos configurables). Con estrictez 3 o 4 esto no debería pasar, pero no se midió una corrida completa con esos niveles.
- Pendiente: decidir si en estrictez 2 los lotes a partir del segundo deben limitar la inferencia. Necesita otra corrida para comparar.

## Cómo repetirlo

```bash
node --experimental-strip-types scripts/medir-generacion.mts <id> "<pedido>" [estrictez] [archivo de contexto]
node --experimental-strip-types scripts/probar-ia.mts --generacion
workers/ai-proxy/node_modules/.bin/esbuild scripts/probar-registro-lote.mts --bundle --platform=node --format=esm --loader:.mts=ts --outfile=scripts/.registro-lote.mjs --external:firebase --external:@firebase/*
firebase emulators:exec --config firebase.emuladores.json --project demo-easyreq "node scripts/.registro-lote.mjs 300"
```
