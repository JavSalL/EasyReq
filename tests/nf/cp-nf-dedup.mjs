// EASYREQ-PRU-02 · CP-NF-02: rendimiento de la detección de duplicados (eficiencia de desempeño).
// 500 requerimientos sintéticos en el índice y 100 textos nuevos; 5 corridas. Criterio: p95 de la corrida ≤ 1000 ms.
import { IndiceDuplicados, clasificarDuplicado } from '../../lib/dedup-requerimientos.ts';
const verbos = ['registrar', 'consultar', 'exportar', 'aprobar', 'rechazar', 'notificar', 'validar', 'archivar', 'buscar', 'editar'];
const objetos = ['proyecto', 'requerimiento', 'equipo', 'patrón', 'comentario', 'historial', 'invitación', 'módulo', 'reporte', 'usuario'];
const texto = (i) => `Cuando el ${objetos[i % 10]} ${i} cambie, el sistema deberá ${verbos[(i * 7) % 10]} el ${objetos[(i * 3) % 10]} ${i * 13} y avisar al líder ${i % 17}.`;
const corridas = [];
for (let c = 0; c < 5; c++) {
  const ind = new IndiceDuplicados();
  for (let i = 0; i < 500; i++) ind.agregar(texto(i), `REQ-${i}`);
  const t0 = performance.now();
  for (let j = 0; j < 100; j++) clasificarDuplicado(ind, texto(1000 + j));
  corridas.push(Math.round(performance.now() - t0));
}
const ord = [...corridas].sort((a, b) => a - b);
const p95 = ord[Math.ceil(0.95 * ord.length) - 1];
console.log(JSON.stringify({ caso: 'CP-NF-02', corridas_ms: corridas, p95_ms: p95, criterio: '≤ 1000 ms', cumple: p95 <= 1000 }));
process.exit(p95 <= 1000 ? 0 : 1);
