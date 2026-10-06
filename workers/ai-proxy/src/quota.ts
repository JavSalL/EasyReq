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
