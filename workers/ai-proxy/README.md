# Migración de IA al Backend (Cloudflare Workers)

## Problema
Anteriormente, la API Key de Gemini estaba expuesta en el código del cliente (a través de la variable `NEXT_PUBLIC_GEMINI_API_KEY`). Esto significaba que cualquier usuario o visitante de la web podía inspeccionar el código y robar la llave, generando un riesgo de seguridad y posibles costos inesperados.

## Solución
Se implementó un **Proxy Backend** serverless usando **Cloudflare Workers**. Ahora:
1. El frontend ya no tiene acceso a la API Key de Gemini.
2. El frontend envía las peticiones de IA al Worker, adjuntando el token de sesión de Firebase del usuario.
3. El Worker verifica que el usuario esté autenticado.
4. El Worker valida que el usuario no haya excedido sus límites de uso (Rate Limiting y Cuota Diaria).
5. Si todo es correcto, el Worker construye el prompt y hace la petición real a Gemini usando la API Key que ahora vive como un secreto encriptado en Cloudflare.

---

## Cómo funciona el nuevo flujo

1. **Frontend (`lib/ai-actions.ts`)**: En lugar de usar el SDK de `@google/generative-ai`, ahora obtiene el token JWT del usuario logueado en Firebase y hace un `fetch` directo a nuestro Worker en Cloudflare (`NEXT_PUBLIC_AI_API_URL`).
2. **Worker (`workers/ai-proxy`)**:
   - **Autenticación**: Descarga las llaves públicas de Google (JWKS) y verifica la firma del token JWT usando la librería `jose`.
   - **Rate Limiter**: Cloudflare valida que el usuario no haga spam (ej. máximo 10 peticiones por minuto).
   - **Cuota Diaria (Cloudflare D1)**: Consulta una base de datos SQLite serverless (D1) para asegurar que el usuario no sobrepase su límite diario de peticiones (ej. 50 al día).
   - **Ejecución**: Junta los datos del usuario con las instrucciones maestras (Prompts) y hace la petición HTTP directa a la API REST de Gemini. Retorna el resultado al frontend.

---

## Archivos Nuevos y sus Propósitos

Todo el backend de IA está dentro del nuevo directorio `workers/ai-proxy/`.

### Código Fuente (`src/`)
- `src/index.ts`
  **Punto de entrada principal.** Maneja los CORS, recibe la petición HTTP (POST), orquesta la validación del token, descuenta la cuota y devuelve la respuesta.
- `src/auth.ts`
  **Seguridad.** Contiene la lógica para desencriptar y validar los tokens JWT de Firebase Auth sin depender del SDK de `firebase-admin` (el cual no es compatible con el entorno de Cloudflare Workers). Utiliza la librería ligera `jose`.
- `src/quota.ts`
  **Base de datos.** Contiene la lógica para interactuar con la base de datos D1. Revisa cuántas peticiones ha hecho el usuario hoy y actualiza el contador.
- `src/prompts.ts`
  **Ingeniería de Prompts.** Todos los textos y system prompts (ej. formato EARS, historias de usuario) se movieron del frontend hacia aquí. Esto evita que los usuarios manipulen las instrucciones que se envían a la IA.
- `src/gemini.ts`
  **Cliente AI.** Realiza el llamado `fetch` nativo hacia la API de Google Gemini enviando los mensajes y consumiendo el secreto `GEMINI_API_KEY`.

### Configuración e Infraestructura
- `wrangler.jsonc`
  **Configuración de Cloudflare.** Define variables de entorno, los límites de peticiones (Rate Limiter) y el enlace a la base de datos D1 (`binding: "DB"`).
- `schema.sql`
  **Estructura de la BD.** Script SQL que crea la tabla `user_daily_usage` donde se guarda el registro de peticiones por usuario y día.
- `package.json` & `tsconfig.json`
  **Dependencias y Tipado.** Define que es un proyecto independiente de Next.js, incluye los tipos específicos de Cloudflare (`@cloudflare/workers-types`) y la librería de encriptación (`jose`).

## Despliegue y Variables
Para que esto funcione, en el frontend (`.env.local` y Firebase Hosting) se eliminó `NEXT_PUBLIC_GEMINI_API_KEY` y se agregó:
```env
NEXT_PUBLIC_AI_API_URL=https://easyreq-ai.easy-req.workers.dev
```

Para desplegar actualizaciones del worker en el futuro, solo se debe entrar a la carpeta y ejecutar:
```bash
cd workers/ai-proxy
npx wrangler deploy
```

---

## Generación iterativa de requerimientos (KAN-40)

El cliente (`runIterativeGeneration` en `lib/ai-actions.ts`) encadena estos pasos; cada uno es **una** llamada a Gemini:

| Ruta | Qué hace | Cuota |
|------|----------|-------|
| `POST /generation/plan` | Mapa de áreas (`alcance`: `sistema`, `modulo` o `auto`). En sistema, hasta 20 áreas e incluye las transversales de calidad (seguridad, rendimiento, disponibilidad, usabilidad, accesibilidad, mantenibilidad, legal/privacidad, integraciones) salvo en estrictez máxima. | Crea un job y consume **1** uso diario. Máx. `DAILY_JOB_LIMIT` corridas por día (3 por defecto); solo cuentan las que llegaron a generar un lote, no las canceladas en el mapa ni las que fallaron. |
| `POST /generation/area` | Lote de 15-25 requerimientos de un área; devuelve `{ requerimientos, completo, pendiente }`. | Exige `job_id` del mismo usuario; no consume uso diario, cuenta 1 llamada del job. |
| `POST /generation/cobertura` | Revisa lo generado y lo existente; devuelve solo lo que falta (o `[]`). | Igual que `/generation/area`. |
| `POST /generation/embed` | Posibles duplicados por significado (embeddings de Gemini, coseno ≥ 0,90). | Igual que `/generation/area`. |

Cada job admite 60 llamadas (el plan cuenta como la primera) y caduca a las 6 horas. El límite de 10 peticiones por minuto sigue aplicando: el cliente espera lo que indique `Retry-After` y reintenta solo. `/generate-bulk` (una sola pasada) sigue disponible.

Antes de desplegar, crea la tabla `ai_jobs` (es idempotente):
```bash
npx wrangler d1 execute easyreq-ai-quota --remote --file migrations/kan-40-ai-jobs.sql
```
