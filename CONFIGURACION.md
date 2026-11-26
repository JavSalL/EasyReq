# Administración de la configuración — EasyReq

Este archivo describe cómo está organizado el repositorio y qué partes de él son
elementos de configuración (EC). El plan completo es el componente 8 del SQAP
(EASYREQ-SQAP-01). El SQAP, los planes de evaluación, las matrices y el registro
del estado de la configuración **no se suben a este repositorio**, porque es
público y esos documentos son confidenciales: aquí solo se citan por su código.

## Estructura del repositorio

| Ruta | Contenido | EC |
|---|---|---|
| `app/`, `components/`, `lib/`, `public/` | Código de la aplicación web (Next.js) | EASYREQ-COD-01 |
| `workers/ai-proxy/` | Worker de Cloudflare que llama a la IA (código, esquema y migraciones) | EASYREQ-COD-02 |
| `firestore.rules` | Reglas de seguridad de Cloud Firestore | EASYREQ-CFG-01 |
| `*.sql`, `supasql.txt`, `workers/ai-proxy/schema.sql`, `workers/ai-proxy/migrations/` | Scripts de base de datos (Supabase y D1) | EASYREQ-BD-01 |
| `.env.example`, `workers/ai-proxy/.dev.vars.example`, `firebase*.json`, `.firebaserc`, `next.config.ts`, `package*.json`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs` | Configuración del entorno y de la compilación | EASYREQ-CFG-02 |
| `tests/reglas/` | Pruebas automatizadas de `firestore.rules` (IND-03) | EASYREQ-PRU-01 |
| `CONTRIBUTING.md`, `CONFIGURACION.md`, `DESIGN.md` | Modo de trabajo, este archivo y guía de diseño de la interfaz | EASYREQ-DOC-01 |
| `scripts/` | Scripts de medición de la IA; `scripts/resultados/` guarda salidas (registros, no EC) | — |
| `GEMINI.md`, `.claude/`, `design/`, `README.md` | Apoyo para asistentes de IA, fuentes del logo y README de plantilla | — |

## Convenciones

- **Código de un EC:** `EASYREQ-<tipo>-<nn>`, con tipo REQ, DIS, COD, BD, CFG, PRU, PLN o DOC.
- **Software:** versionado semántico `vMAYOR.MENOR.PARCHE` en etiquetas (`v0.13.1`).
  Parche = corrección compatible; menor = función nueva compatible; mayor = cambio incompatible.
- **Documentos:** `X.Y`. Y cambia con correcciones que no alteran lo aprobado;
  X cambia con cada nueva versión aprobada de su línea base. Borradores: `1.2-borrador`.
- **Scripts de base de datos:** una migración aplicada no se edita; un cambio es una migración nueva.
- **Credenciales:** nunca en el repositorio. Solo `.env.example` y `.dev.vars.example` con valores de ejemplo.

## Líneas base

Una línea base se marca con una etiqueta anotada que **no se mueve ni se borra**:

| Etiqueta | Contenido | Aprueba |
|---|---|---|
| `LB-REQ-n` | Especificación de requerimientos aprobada (pendiente) | Cliente |
| `LB-PROD-n` | Código, reglas, scripts de BD, configuración y pruebas | Líder del proyecto |
| `LB-ENT-n` | Lo que se entrega al cliente | Cliente |

Para reconstruir una línea base: `git checkout LB-PROD-1`, `npm ci`, copiar
`.env.example` a `.env.local` con valores reales y `npm run build`.

## Cambios

Un cambio a algo que ya está en una línea base entra por una solicitud de cambio
`SC-nnn` (registrada en el registro del estado) y un Pull Request que cita ese
identificador en su título. El procedimiento y el comité están en el componente 8 del SQAP.
