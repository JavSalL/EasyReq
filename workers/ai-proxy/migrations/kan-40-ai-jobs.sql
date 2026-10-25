-- Migración de KAN-40: tabla de corridas de generación iterativa.
-- Es lo mismo que se añadió al final de schema.sql, por si se prefiere aplicar solo esta parte:
--   npx wrangler d1 execute easyreq-ai-quota --remote --file migrations/kan-40-ai-jobs.sql   (producción)
--   npx wrangler d1 execute easyreq-ai-quota --local  --file migrations/kan-40-ai-jobs.sql   (desarrollo)
CREATE TABLE IF NOT EXISTS ai_jobs (
  id         TEXT    PRIMARY KEY,
  uid        TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  llamadas   INTEGER NOT NULL DEFAULT 0,
  con_resultado INTEGER NOT NULL DEFAULT 0   -- 1 cuando un lote de área terminó bien; solo esas cuentan para DAILY_JOB_LIMIT
);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_uid_created ON ai_jobs (uid, created_at);
