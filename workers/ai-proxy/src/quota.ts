/**
 * Cuota diaria por usuario, guardada en D1 (SQLite de Cloudflare).
 * El incremento es atómico: si dos peticiones llegan a la vez, cada una
 * recibe un contador distinto.
 */
export async function consumeDailyQuota(
  db: D1Database,
  uid: string,
  dailyLimit: number
): Promise<{ allowed: boolean; used: number }> {
  const day = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD' en UTC

  const row = await db
    .prepare(
      `INSERT INTO ai_usage (uid, day, count) VALUES (?1, ?2, 1)
       ON CONFLICT(uid, day) DO UPDATE SET count = count + 1
       RETURNING count`
    )
    .bind(uid, day)
    .first<{ count: number }>();

  const used = row?.count ?? 1;
  return { allowed: used <= dailyLimit, used };
}

// ---------------------------------------------------------------------------
// Corridas de generación iterativa (KAN-40)
// ---------------------------------------------------------------------------
// Una corrida completa (plan + lotes por área + cobertura) cuenta como UN uso de la cuota
// diaria. El plan crea el job y consume ese uso; los pasos siguientes presentan el id del job,
// no consumen cuota, pero cuentan llamadas a Gemini con un tope por job.

/** Un job deja de valer pasado este tiempo: una corrida real dura minutos, no horas. */
const VIGENCIA_JOB_MS = 6 * 60 * 60 * 1000;

/**
 * La tabla de corridas se crea sola la primera vez que hace falta (una vez por instancia del
 * Worker). Así desplegar no exige permisos de administración de D1 para aplicar la migración; las
 * sentencias son idempotentes y coinciden con migrations/kan-40-ai-jobs.sql.
 */
let tablaJobs: Promise<void> | null = null;
function asegurarTablaJobs(db: D1Database): Promise<void> {
  tablaJobs ??= db
    .batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS ai_jobs (
           id TEXT PRIMARY KEY,
           uid TEXT NOT NULL,
           created_at TEXT NOT NULL,
           llamadas INTEGER NOT NULL DEFAULT 0,
           con_resultado INTEGER NOT NULL DEFAULT 0
         )`
      ),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_jobs_uid_created ON ai_jobs (uid, created_at)'),
    ])
    .then(() => undefined)
    .catch((err) => {
      // Si falla, la próxima petición lo vuelve a intentar.
      tablaJobs = null;
      throw err;
    });
  return tablaJobs;
}

const inicioDelDia = () => `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;

/**
 * Crea un job si el usuario no superó `jobsDiarios` hoy. Solo cuentan las corridas que llegaron a
 * generar algo (`con_resultado`): abrir el mapa y cancelarlo, o una corrida que falló, no gasta
 * una de las del día (el uso de la cuota diaria general sí se consumió al planear). La cuenta y el
 * alta van en una sola sentencia, así dos peticiones a la vez no pueden colarse por el mismo hueco.
 * El plan cuenta como la primera llamada del job.
 */
export async function crearJob(db: D1Database, uid: string, jobsDiarios: number): Promise<string | null> {
  await asegurarTablaJobs(db);
  const id = crypto.randomUUID();
  const ahora = new Date().toISOString();
  const resultado = await db
    .prepare(
      `INSERT INTO ai_jobs (id, uid, created_at, llamadas)
       SELECT ?1, ?2, ?3, 1
       WHERE (SELECT COUNT(*) FROM ai_jobs WHERE uid = ?2 AND created_at >= ?4 AND con_resultado = 1) < ?5`
    )
    .bind(id, uid, ahora, inicioDelDia(), jobsDiarios)
    .run();

  // Limpieza de jobs viejos (no hace falta esperar a que termine para responder).
  if (resultado.meta.changes > 0) {
    const limite = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('DELETE FROM ai_jobs WHERE created_at < ?1').bind(limite).run().catch(() => {});
  }
  return resultado.meta.changes > 0 ? id : null;
}

/** Marca que la corrida ya generó requerimientos: a partir de aquí cuenta para el tope diario. */
export async function marcarJobConResultado(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE ai_jobs SET con_resultado = 1 WHERE id = ?1 AND con_resultado = 0').bind(id).run();
}

/** Borra un job que no llegó a usarse (p. ej. el plan no era válido). */
export async function borrarJob(db: D1Database, id: string, uid: string): Promise<void> {
  await db.prepare('DELETE FROM ai_jobs WHERE id = ?1 AND uid = ?2').bind(id, uid).run();
}

export type ResultadoJob =
  | { ok: true; llamadas: number }
  | { ok: false; motivo: 'INVALIDO' | 'AGOTADO' };

/**
 * Cuenta una llamada más en el job. Solo vale el job del mismo usuario, vigente y por debajo del
 * tope; el incremento y la comprobación son la misma sentencia, como en `consumeDailyQuota`.
 */
export async function consumirLlamadaJob(db: D1Database, id: string, uid: string, maxLlamadas: number): Promise<ResultadoJob> {
  await asegurarTablaJobs(db);
  const vigenteDesde = new Date(Date.now() - VIGENCIA_JOB_MS).toISOString();
  const fila = await db
    .prepare(
      `UPDATE ai_jobs SET llamadas = llamadas + 1
       WHERE id = ?1 AND uid = ?2 AND created_at >= ?3 AND llamadas < ?4
       RETURNING llamadas`
    )
    .bind(id, uid, vigenteDesde, maxLlamadas)
    .first<{ llamadas: number }>();
  if (fila) return { ok: true, llamadas: fila.llamadas };

  // No se actualizó: o el job no es suyo / caducó, o ya gastó todas sus llamadas.
  const existe = await db
    .prepare('SELECT llamadas FROM ai_jobs WHERE id = ?1 AND uid = ?2 AND created_at >= ?3')
    .bind(id, uid, vigenteDesde)
    .first<{ llamadas: number }>();
  return { ok: false, motivo: existe ? 'AGOTADO' : 'INVALIDO' };
}
