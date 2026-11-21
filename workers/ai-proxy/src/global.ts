// ---------------------------------------------------------------------------
// Límite global de la plataforma y registro de tokens (KAN-43)
// ---------------------------------------------------------------------------
// La cuota de Gemini es por proyecto de Google y la comparten todos los usuarios; los límites de
// index.ts (10 por minuto y DAILY_LIMIT al día) son por usuario. Aquí se lleva un contador común a
// todos, por minuto y por día, en D1 (la misma base que la cuota diaria), con topes configurables
// por debajo de los del proyecto en AI Studio. También se guarda el gasto diario de tokens por
// usuario y tipo de llamada, para medir antes de ajustar los topes.

/** Ventanas del contador: una fila por minuto ("m:2026-11-17T23:54") y otra por día ("d:2026-11-17"). */
const claveMinuto = (ahora: Date) => `m:${ahora.toISOString().slice(0, 16)}`;
const claveDia = (ahora: Date) => `d:${ahora.toISOString().slice(0, 10)}`;

/**
 * Prioridad de una llamada. Las individuales (generar uno, evaluar, extraer texto) pueden usar todo
 * el tope; las de una corrida masiva (plan, lotes, cobertura, duplicados) se detienen antes, para
 * dejar sitio a las individuales cuando la plataforma está cargada.
 */
export type Prioridad = 'individual' | 'lote';

export interface TopesGlobales {
  /** Llamadas a Gemini por minuto de toda la plataforma (0 = sin tope). */
  rpm: number;
  /** Tokens por minuto (0 = sin tope). Se comparan los ya gastados en el minuto en curso. */
  tpm: number;
  /** Llamadas por día (0 = sin tope). */
  rpd: number;
  /** Fracción de cada tope que se reserva para las llamadas individuales (0 a 0,9). */
  reservaIndividual: number;
}

const entero = (valor: string | undefined) => {
  const n = Number.parseInt(valor ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Lee los topes de las variables del Worker. Una variable vacía o ausente deja ese tope sin aplicar. */
export function topesDe(env: { GLOBAL_RPM?: string; GLOBAL_TPM?: string; GLOBAL_RPD?: string; GLOBAL_RESERVA_INDIVIDUAL?: string }): TopesGlobales {
  const reserva = Number.parseFloat(env.GLOBAL_RESERVA_INDIVIDUAL ?? '');
  return {
    rpm: entero(env.GLOBAL_RPM),
    tpm: entero(env.GLOBAL_TPM),
    rpd: entero(env.GLOBAL_RPD),
    reservaIndividual: Number.isFinite(reserva) ? Math.min(0.9, Math.max(0, reserva)) : 0.2,
  };
}

/** Tope efectivo según la prioridad: las de lote se quedan con lo que no está reservado. */
export function topeEfectivo(tope: number, prioridad: Prioridad, reservaIndividual: number): number {
  if (tope <= 0) return Number.MAX_SAFE_INTEGER;
  if (prioridad === 'individual') return tope;
  return Math.max(1, Math.floor(tope * (1 - reservaIndividual)));
}

/** Segundos hasta el siguiente minuto (más uno de margen). */
export const segundosHastaSiguienteMinuto = (ahora: Date) => 61 - ahora.getUTCSeconds();

/** Segundos hasta la medianoche UTC, cuando se reinicia el contador diario. */
export function segundosHastaManana(ahora: Date): number {
  const manana = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 1);
  return Math.max(1, Math.ceil((manana - ahora.getTime()) / 1000));
}

let tablas: Promise<void> | null = null;
/** Crea las tablas la primera vez (idempotente, igual que migrations/kan-43-limite-global.sql). */
function asegurarTablas(db: D1Database): Promise<void> {
  tablas ??= db
    .batch([
      db.prepare(
        `CREATE TABLE IF NOT EXISTS ai_global (
           ventana  TEXT PRIMARY KEY,
           llamadas INTEGER NOT NULL DEFAULT 0,
           tokens   INTEGER NOT NULL DEFAULT 0
         )`
      ),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS ai_uso_tokens (
           day            TEXT NOT NULL,
           uid            TEXT NOT NULL,
           tipo           TEXT NOT NULL,
           llamadas       INTEGER NOT NULL DEFAULT 0,
           tokens_entrada INTEGER NOT NULL DEFAULT 0,
           tokens_salida  INTEGER NOT NULL DEFAULT 0,
           PRIMARY KEY (day, uid, tipo)
         )`
      ),
    ])
    .then(() => undefined)
    .catch((err) => {
      tablas = null;
      throw err;
    });
  return tablas;
}

export type ResultadoReserva =
  | { ok: true }
  | { ok: false; motivo: 'MINUTO' | 'DIA'; retryAfter: number };

/**
 * Reserva `llamadas` en el contador global si caben bajo los topes de su prioridad. La comprobación
 * y el incremento son una sola sentencia por ventana (`ON CONFLICT ... WHERE`), así dos peticiones a
 * la vez no se cuelan por el mismo hueco. Si el día cabe pero el minuto no, se devuelve lo del día.
 */
export async function reservarGlobal(
  db: D1Database,
  topes: TopesGlobales,
  prioridad: Prioridad,
  llamadas = 1,
  ahora = new Date()
): Promise<ResultadoReserva> {
  if (!topes.rpm && !topes.tpm && !topes.rpd) return { ok: true };
  await asegurarTablas(db);
  const dia = claveDia(ahora);
  const minuto = claveMinuto(ahora);
  const rpd = topeEfectivo(topes.rpd, prioridad, topes.reservaIndividual);
  const rpm = topeEfectivo(topes.rpm, prioridad, topes.reservaIndividual);
  const tpm = topeEfectivo(topes.tpm, prioridad, topes.reservaIndividual);

  // La fila se inserta con las llamadas pedidas solo si caben; si ya existe, se suma con la condición.
  const sumar = (ventana: string, tope: number, topeTokens: number) =>
    db
      .prepare(
        `INSERT INTO ai_global (ventana, llamadas, tokens)
         SELECT ?1, ?2, 0 WHERE ?2 <= ?3
         ON CONFLICT(ventana) DO UPDATE SET llamadas = llamadas + ?2
         WHERE llamadas + ?2 <= ?3 AND tokens < ?4
         RETURNING llamadas`
      )
      .bind(ventana, llamadas, tope, topeTokens)
      .first<{ llamadas: number }>();

  const enDia = await sumar(dia, rpd, Number.MAX_SAFE_INTEGER);
  if (!enDia) return { ok: false, motivo: 'DIA', retryAfter: segundosHastaManana(ahora) };
  const enMinuto = await sumar(minuto, rpm, tpm);
  if (!enMinuto) {
    await db.prepare('UPDATE ai_global SET llamadas = MAX(0, llamadas - ?2) WHERE ventana = ?1').bind(dia, llamadas).run();
    return { ok: false, motivo: 'MINUTO', retryAfter: segundosHastaSiguienteMinuto(ahora) };
  }

  // Limpieza de minutos viejos (no hace falta esperar a que termine).
  if (enMinuto.llamadas === llamadas) {
    const limite = claveMinuto(new Date(ahora.getTime() - 10 * 60 * 1000));
    db.prepare("DELETE FROM ai_global WHERE ventana LIKE 'm:%' AND ventana < ?1").bind(limite).run().catch(() => {});
  }
  return { ok: true };
}

/**
 * Suma llamadas adicionales sin comprobar el tope: los reintentos y las pasadas extra dentro de una
 * petición que ya se admitió (cortarla a medias desperdiciaría lo ya gastado).
 */
export async function sumarLlamadasGlobal(db: D1Database, llamadas: number, ahora = new Date()): Promise<void> {
  if (llamadas <= 0) return;
  await asegurarTablas(db);
  await db.batch(
    [claveDia(ahora), claveMinuto(ahora)].map((v) =>
      db
        .prepare(
          `INSERT INTO ai_global (ventana, llamadas, tokens) VALUES (?1, ?2, 0)
           ON CONFLICT(ventana) DO UPDATE SET llamadas = llamadas + ?2`
        )
        .bind(v, llamadas)
    )
  );
}

/** Registra los tokens de una llamada: en el minuto global (para el tope TPM) y en el diario por usuario y tipo. */
export async function registrarTokens(
  db: D1Database,
  uid: string,
  tipo: string,
  uso: { entrada: number; salida: number; total: number },
  ahora = new Date()
): Promise<void> {
  await asegurarTablas(db);
  await db.batch([
    db
      .prepare(
        `INSERT INTO ai_global (ventana, llamadas, tokens) VALUES (?1, 0, ?2)
         ON CONFLICT(ventana) DO UPDATE SET tokens = tokens + ?2`
      )
      .bind(claveMinuto(ahora), uso.total),
    db
      .prepare(
        `INSERT INTO ai_global (ventana, llamadas, tokens) VALUES (?1, 0, ?2)
         ON CONFLICT(ventana) DO UPDATE SET tokens = tokens + ?2`
      )
      .bind(claveDia(ahora), uso.total),
    db
      .prepare(
        `INSERT INTO ai_uso_tokens (day, uid, tipo, llamadas, tokens_entrada, tokens_salida) VALUES (?1, ?2, ?3, 1, ?4, ?5)
         ON CONFLICT(day, uid, tipo) DO UPDATE SET
           llamadas = llamadas + 1,
           tokens_entrada = tokens_entrada + ?4,
           tokens_salida = tokens_salida + ?5`
      )
      .bind(claveDia(ahora).slice(2), uid, tipo, uso.entrada, uso.salida),
  ]);
}
