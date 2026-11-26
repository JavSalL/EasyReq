# EASYREQ-PRU-02 · Casos de prueba (plan de pruebas, componente 7 del SQAP)

Diseño conforme a ISO/IEC/IEEE 29119-3:2021 (documentación) y 29119-4:2021 (técnicas).
**El resultado esperado de cada caso se fija en este archivo antes de ejecutar**; la fecha del commit que
lo introduce es la evidencia. El resultado obtenido se registra después en el SQAP y en los issues.

- Versión a probar: `LB-PROD-1` (commit `7b90bff`), la línea base vigente en `main`.
- Entorno: emulador local de Firestore (`firebase.emuladores.json`, proyecto `demo-easyreq`) y Node.
  Nunca producción; solo datos sintéticos (usuarios `autor`, `lider`, `creador`, `ajeno`, `noverif`).
- Requisitos: la ERS heredada (EASYREQ-REQ-01) numera 21 requerimientos sin identificador; en este plan
  se citan como RQ-01 a RQ-21 según su número en el documento. Riesgos: matriz R1–R7 (Clase 4).

| ID | Requisito / riesgo | Nivel y tipo | Técnica | Prioridad |
|---|---|---|---|---|
| CP-RQ21-01 | RQ-21, RQ-03 / R3 | Integración, funcional (incluye negativos) | Partición de equivalencia | Alta |
| CP-RQ21-02 | RQ-21 | Integración, funcional (negativos) | Valores límite | Media |
| CP-RQ21-03 | RQ-21, RQ-04 | Integración, funcional (negativos) | Valores límite + partición | Media |
| CP-RQ05-01 | RQ-05 / R3 | Integración, funcional (negativos) | Transición de estados | Alta |
| CP-RQ15-01 | RQ-15 / R3 | Integración, seguridad (negativos) | Tabla de decisión | Alta |
| CP-RQ02-01 | RQ-02 / R3 | Integración, seguridad (regresión DEF-05) | Partición de equivalencia | Alta |
| CP-RQ10-01 | RQ-10 / R3 | Integración, integridad (negativos) | Tabla de decisión | Alta |
| CP-R3-01 | RQ-08 / R3 (IND-03) | Integración, seguridad (negativos) | Tabla de decisión | Alta |
| CP-RQ03-01 | RQ-03, RQ-19 | Unidad, funcional | Partición + valores límite | Media |
| CP-RQ16-01 | RQ-16 / R2 | Unidad, funcional | Valores límite | Media |
| CP-RQ19-01 | RQ-19 | Unidad, funcional | Valores límite | Baja |
| CP-NF-01 | RQ-12 | Integración, **no funcional** (desempeño, concurrencia) | Prueba de carga | Media |
| CP-NF-02 | RQ-16, RQ-11 | Unidad, **no funcional** (eficiencia) | Prueba de rendimiento | Media |
| CP-NF-03 | R6 | Sistema, **no funcional** (seguridad de dependencias) | Análisis estático | Media |
| CP-NF-04 | R6 | Sistema, **no funcional** (portabilidad / despliegue) | Prueba negativa de configuración | Alta |
| CP-R4-01 | R4 | Configuración del repositorio | Revisión de configuración | Alta |
| CP-R2-01 | R2 (RQ-01 a RQ-21) | Estática, documentación | Lista de verificación | Alta |
| CP-RQ11-01 | RQ-11 / R7 | Sistema, no funcional | — | Bloqueado |
| CP-RQ04-01 | RQ-04 / R7 (DEF-07) | Sistema, funcional | — | Bloqueado |
| CP-RQ20-01 | RQ-20 | Sistema, usabilidad | — | Bloqueado |

## Casos ejecutables

**CP-RQ21-01 · Alta de requerimiento: clase válida y clases inválidas.**
Precondiciones: proyecto P con equipo E activo; `autor` integrante de E; catálogo de estados sembrado.
Datos: enunciado de 90 caracteres, estado `Pendiente de aprobación`. Pasos: (1) `autor` da de alta un
requerimiento válido; (2) con `id_autor` de otra persona; (3) con estado inicial `Aprobado`; (4) `ajeno` da de
alta en P; (5) con un campo no permitido. **Esperado:** (1) permitida; (2)–(5) denegadas (`permission-denied`).

**CP-RQ21-02 · Longitud del enunciado.** Datos: 0, 1, 5000 y 5001 caracteres. **Esperado:** 0 denegada,
1 permitida, 5000 permitida, 5001 denegada.

**CP-RQ21-03 · Campos de la IA.** Datos: 12 y 13 elementos de sintaxis; prioridad `Must` y `Alta`.
**Esperado:** 12 permitida, 13 denegada; `Must` permitida, `Alta` denegada.

**CP-RQ05-01 · Ciclo de aprobación.** Estados: Pendiente, Aprobado, Rechazado. **Esperado:**
Pendiente→Aprobado por el líder: permitida. Pendiente→Rechazado por el líder: permitida.
Pendiente→Aprobado por el autor: denegada. Rechazado→Pendiente por el autor: permitida.
Rechazado→Aprobado por el líder: denegada. Aprobado→Rechazado por el líder: denegada.
Pendiente→Aprobado por el líder registrando a otro como aprobador: denegada.

**CP-RQ15-01 · Quién elimina un requerimiento.** Reglas de la tabla de decisión:
R1 autor → permitida; R2 creador del proyecto → permitida; R3 verificado ajeno al proyecto → **denegada**;
R4 correo sin verificar → denegada; R5 sin sesión → denegada.

**CP-RQ02-01 · Proyecto ajeno.** **Esperado:** creador cambia la descripción: permitida; ajeno cambia
`id_creador` a sí mismo: denegada; ajeno elimina: denegada; integrante no creador elimina: denegada.

**CP-RQ10-01 · Historial auditable.** **Esperado:** miembro registra su propia edición: permitida; a nombre de
otro: denegada; ajeno registra: denegada; modificar una entrada: denegada; borrar una entrada (aun el
creador): denegada.

**CP-R3-01 · Aislamiento entre equipos (IND-03).** Script `tests/reglas/ind03.mjs` (EASYREQ-PRU-01), 5
colecciones × 4 accesos indebidos + 5 controles. **Esperado:** 20 de 20 lecturas indebidas denegadas y 5 de 5
controles permitidos.

**CP-RQ03-01 · Identificador visible.** **Esperado:** 1→`REQ-001`, 9→`REQ-009`, 10→`REQ-010`, 999→`REQ-999`,
1000→`REQ-1000`; `14`, `req14`, `req-14`, `REQ-014` → 14; `''`, `abc`, `req--14`, `REQ-`, `-5`, `1.5`,
`req 14` → null; código guardado tiene prioridad sobre el número; sin número ni código → null.

**CP-RQ16-01 · Duplicados.** **Esperado:** similitud 0.5999 → nuevo; 0.60 → posible; 0.8499 → posible;
0.85 → duplicado; el mismo texto en mayúsculas y sin acentos → duplicado; texto distinto → nuevo; índice
vacío → nuevo; similitud con texto vacío = 0.

**CP-RQ19-01 · Fechas del historial.** **Esperado:** 59.999 s → "justo ahora"; 60 s → "hace 1 minuto";
1 h → "hace 1 hora"; 24 h → "ayer"; 29 días → "hace 29 días"; 30 días → fecha con año; fecha inválida → "".

**CP-NF-01 · Concurrencia de altas.** 20 altas simultáneas del mismo integrante. **Esperado:** 20/20
aceptadas, p95 por alta ≤ 500 ms y total ≤ 3000 ms en el emulador local.

**CP-NF-02 · Rendimiento de duplicados.** Índice de 500 textos, 100 textos nuevos, 5 corridas.
**Esperado:** p95 de las corridas ≤ 1000 ms.

**CP-NF-03 · Vulnerabilidades en dependencias de producción.** `npm audit --omit=dev`.
**Esperado:** 0 vulnerabilidades altas o críticas.

**CP-NF-04 · Construcción sin variables de entorno.** `npm run build` en un clon limpio sin `.env*`.
**Esperado:** la construcción falla (código ≠ 0) **y** el mensaje nombra la variable que falta
(`NEXT_PUBLIC_FIREBASE_API_KEY`); no debe producir un `out/` aparentemente válido.

**CP-R4-01 · Protección de `main`.** Consulta de la protección de rama. **Esperado:** PR obligatorio con al
menos 1 aprobación, force push y borrado deshabilitados.

**CP-R2-01 · Requisitos verificables.** Lista de verificación sobre los 21 requerimientos de la ERS:
identificador único y criterio de aceptación verificable. **Esperado:** 21 de 21 cumplen.

## Casos bloqueados (declarados antes de ejecutar)

- **CP-RQ11-01** (respuesta de Gemini < 5 s) y **CP-RQ04-01** (falla de la IA sin bloquear la pantalla):
  requieren el Worker y la API real de Gemini; no hay entorno de pruebas separado de producción.
- **CP-RQ20-01** (mensaje de confirmación tras cada acción): requiere la interfaz, y `lib/firebase.ts` no
  puede conectarse al emulador; levantar la app usaría el proyecto real.
