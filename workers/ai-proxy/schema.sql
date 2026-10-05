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
