-- Migración de KAN-43: contador global de la plataforma y registro diario de tokens.
-- El Worker crea estas tablas solo la primera vez que las usa; este archivo es por si se prefiere
-- aplicarlas a mano (es idempotente):
--   npx wrangler d1 execute easyreq-ai-quota --remote --file migrations/kan-43-limite-global.sql
CREATE TABLE IF NOT EXISTS ai_global (
  ventana  TEXT    PRIMARY KEY,         -- 'm:YYYY-MM-DDTHH:MM' (minuto) o 'd:YYYY-MM-DD' (día), en UTC
  llamadas INTEGER NOT NULL DEFAULT 0,  -- llamadas a Gemini de toda la plataforma en esa ventana
  tokens   INTEGER NOT NULL DEFAULT 0   -- tokens (entrada + salida) según usageMetadata
);

-- Registro diario de tokens y llamadas por usuario y tipo de llamada (ruta del Worker).
CREATE TABLE IF NOT EXISTS ai_uso_tokens (
  day            TEXT    NOT NULL,      -- 'YYYY-MM-DD' (UTC)
  uid            TEXT    NOT NULL,
  tipo           TEXT    NOT NULL,      -- p. ej. 'generate-single', 'generation/area'
  llamadas       INTEGER NOT NULL DEFAULT 0,
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_salida  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, uid, tipo)
);
