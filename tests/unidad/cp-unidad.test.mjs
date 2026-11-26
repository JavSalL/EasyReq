// EASYREQ-PRU-02 · Casos de unidad sobre la lógica pura de lib/ (sin red ni Firebase).
// Uso: npm run test:unidad   (node --test; Node 22.18+ ejecuta TypeScript quitando los tipos)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codigoRequerimiento, codigoDe, numeroDesdeBusqueda } from '../../lib/requerimientos.ts';
import { IndiceDuplicados, clasificarDuplicado, similitud, UMBRAL_DUPLICADO, UMBRAL_POSIBLE_DUPLICADO } from '../../lib/dedup-requerimientos.ts';
import { fechaRelativa, fechaCompleta } from '../../lib/fechas.ts';

// CP-RQ03-01 · Identificador visible (partición de equivalencia y valores límite).
test('CP-RQ03-01 codigoRequerimiento: límites del relleno a 3 dígitos', () => {
  assert.equal(codigoRequerimiento(1), 'REQ-001');
  assert.equal(codigoRequerimiento(9), 'REQ-009');
  assert.equal(codigoRequerimiento(10), 'REQ-010');
  assert.equal(codigoRequerimiento(999), 'REQ-999');
  assert.equal(codigoRequerimiento(1000), 'REQ-1000');
});
test('CP-RQ03-01 codigoDe: código guardado gana; sin número da null', () => {
  assert.equal(codigoDe({ codigo: 'REQ-077', numero: 3 }), 'REQ-077');
  assert.equal(codigoDe({ numero: 14 }), 'REQ-014');
  assert.equal(codigoDe({}), null);
});
test('CP-RQ03-01 numeroDesdeBusqueda: clases válidas e inválidas', () => {
  for (const [t, n] of [['14', 14], ['req14', 14], ['req-14', 14], ['REQ-014', 14], ['  req-7 ', 7]]) assert.equal(numeroDesdeBusqueda(t), n, t);
  for (const t of ['', 'abc', 'req--14', 'REQ-', '-5', '1.5', 'req 14']) assert.equal(numeroDesdeBusqueda(t), null, t);
});

// CP-RQ16-01 · Detección de duplicados (valores límite en los umbrales 0.60 y 0.85).
class IndiceFijo extends IndiceDuplicados {
  constructor(s) { super(); this.s = s; }
  masParecido() { return { etiqueta: 'REQ-001', texto: 'x', similitud: this.s }; }
}
test('CP-RQ16-01 umbrales: 0.5999 nuevo, 0.60 posible, 0.8499 posible, 0.85 duplicado', () => {
  assert.equal(UMBRAL_POSIBLE_DUPLICADO, 0.6);
  assert.equal(UMBRAL_DUPLICADO, 0.85);
  assert.equal(clasificarDuplicado(new IndiceFijo(0.5999), 't').tipo, 'nuevo');
  assert.equal(clasificarDuplicado(new IndiceFijo(0.6), 't').tipo, 'posible');
  assert.equal(clasificarDuplicado(new IndiceFijo(0.8499), 't').tipo, 'posible');
  assert.equal(clasificarDuplicado(new IndiceFijo(0.85), 't').tipo, 'duplicado');
});
test('CP-RQ16-01 textos reales: igual con acentos/mayúsculas es duplicado; distinto es nuevo; índice vacío es nuevo', () => {
  const ind = new IndiceDuplicados();
  ind.agregar('El sistema deberá permitir crear un proyecto con nombre y descripción.', 'REQ-001');
  assert.equal(clasificarDuplicado(ind, 'EL SISTEMA DEBERA PERMITIR CREAR UN PROYECTO CON NOMBRE Y DESCRIPCION').tipo, 'duplicado');
  assert.equal(clasificarDuplicado(ind, 'Exportar el historial de cambios a PDF.').tipo, 'nuevo');
  assert.equal(clasificarDuplicado(new IndiceDuplicados(), 'Cualquier texto').tipo, 'nuevo');
  assert.equal(similitud('', 'algo'), 0);
});

// CP-RQ19-01 · Fechas del historial (valores límite de cada tramo).
const AHORA = Date.parse('2026-11-26T12:00:00Z');
const hace = (ms) => new Date(AHORA - ms).toISOString();
test('CP-RQ19-01 fechaRelativa: límites de minuto, hora, día y 30 días', () => {
  assert.equal(fechaRelativa(hace(59_999), AHORA), 'justo ahora');
  assert.equal(fechaRelativa(hace(60_000), AHORA), 'hace 1 minuto');
  assert.equal(fechaRelativa(hace(3_600_000), AHORA), 'hace 1 hora');
  assert.equal(fechaRelativa(hace(86_400_000), AHORA), 'ayer');
  assert.equal(fechaRelativa(hace(29 * 86_400_000), AHORA), 'hace 29 días');
  assert.match(fechaRelativa(hace(30 * 86_400_000), AHORA), /2026/);
});
test('CP-RQ19-01 fechas inválidas devuelven cadena vacía', () => {
  assert.equal(fechaRelativa('no-es-fecha', AHORA), '');
  assert.equal(fechaCompleta(''), '');
});
