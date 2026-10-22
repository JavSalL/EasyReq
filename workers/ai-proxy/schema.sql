-- Cuota diaria de IA por usuario.
-- Aplicar con:
--   npx wrangler d1 execute easyreq-ai-quota --remote --file schema.sql   (producción)
--   npx wrangler d1 execute easyreq-ai-quota --local  --file schema.sql   (desarrollo)
CREATE TABLE IF NOT EXISTS ai_usage (
  uid   TEXT    NOT NULL,
  day   TEXT    NOT NULL,          -- 'YYYY-MM-DD' (UTC)
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, day)
);

-- Corridas de generación iterativa de requerimientos (KAN-40).
-- Una corrida completa cuenta como 1 uso de ai_usage; aquí se cuentan sus llamadas a Gemini.
-- Es idempotente: se puede volver a ejecutar el archivo completo sobre una base existente.
CREATE TABLE IF NOT EXISTS ai_jobs (
  id         TEXT    PRIMARY KEY,   -- UUID que crea /generation/plan
  uid        TEXT    NOT NULL,      -- dueño del job (uid de Firebase)
  created_at TEXT    NOT NULL,      -- ISO 8601 (UTC)
  llamadas   INTEGER NOT NULL DEFAULT 0,
  con_resultado INTEGER NOT NULL DEFAULT 0   -- 1 cuando un lote de área terminó bien; solo esas cuentan para DAILY_JOB_LIMIT
);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_uid_created ON ai_jobs (uid, created_at);
