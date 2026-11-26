// EASYREQ-PRU-02 · Casos de integración contra firestore.rules (plan de pruebas, componente 7 del SQAP).
// Uso: npm run test:plan   (emulador de Firestore con firebase.emuladores.json, proyecto demo-easyreq)
// Solo datos sintéticos. Nunca apuntar a producción: el projectId "demo-" impide usar un proyecto real.
// Cada caso compara contra el resultado esperado escrito en tests/CASOS-DE-PRUEBA.md ANTES de ejecutar.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8185').split(':');
const env = await initializeTestEnvironment({
  projectId: 'demo-easyreq',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
});
const version = execSync('git describe --tags --always').toString().trim();
const commit = execSync('git rev-parse --short HEAD').toString().trim();

// ---------- Datos sintéticos ----------
// Proyecto P (creador: creador), equipo E vinculado y activo. lider (rol Líder), autor (rol Integrante).
// ajeno: usuario verificado sin relación con P. noverif: correo sin verificar.
async function sembrar() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'estados', 'pend'), { nombre_estado: 'Pendiente de aprobación' });
    await setDoc(doc(db, 'estados', 'apr'), { nombre_estado: 'Aprobado' });
    await setDoc(doc(db, 'estados', 'rech'), { nombre_estado: 'Rechazado' });
    await setDoc(doc(db, 'roles', 'rLider'), { nombre_rol: 'Líder' });
    await setDoc(doc(db, 'roles', 'rInt'), { nombre_rol: 'Integrante' });
    await setDoc(doc(db, 'proyecto', 'P'), { nombre: 'Proyecto sintético', id_creador: 'creador', ids_miembros: ['creador'] });
    await setDoc(doc(db, 'equipo', 'E'), { nombre: 'Equipo sintético', id_creador: 'creador', id_proyecto: 'P' });
    await setDoc(doc(db, 'proyecto_equipos', 'P_E'), { id_proyecto: 'P', id_equipo: 'E', estado: 'activo' });
    await setDoc(doc(db, 'miembros_equipo', 'E_lider'), { id_equipo: 'E', id_usuario: 'lider', id_rol: 'rLider' });
    await setDoc(doc(db, 'miembros_equipo', 'E_autor'), { id_equipo: 'E', id_usuario: 'autor', id_rol: 'rInt' });
    const base = { id_proyecto: 'P', id_equipo: 'E', id_autor: 'autor', id_aprobador: null, enunciado: 'El sistema registrará la fecha de cada cambio.', numero: 1, codigo: 'REQ-001' };
    await setDoc(doc(db, 'requerimiento', 'rPend'), { ...base, id_estado: 'pend' });
    await setDoc(doc(db, 'requerimiento', 'rApr'), { ...base, numero: 2, codigo: 'REQ-002', id_estado: 'apr', id_aprobador: 'lider' });
    await setDoc(doc(db, 'requerimiento', 'rRech'), { ...base, numero: 3, codigo: 'REQ-003', id_estado: 'rech' });
    await setDoc(doc(db, 'logs_requerimientos', 'L1'), { id_requerimiento: 'rPend', accion: 'crear', id_autor: 'autor', fecha_hora: '2026-11-20T00:00:00Z' });
  });
}
const ctx = (uid, verif = true) => env.authenticatedContext(uid, { email: `${uid}@test.dev`, email_verified: verif }).firestore();

async function intento(fn) {
  try { await fn(); return 'permitida'; } catch (e) { return e.code === 'permission-denied' ? 'denegada' : `error: ${e.code || e.message}`; }
}

const filas = [];
async function paso(caso, descripcion, esperado, fn, { resembrar = true } = {}) {
  if (resembrar) await sembrar();
  const t0 = performance.now();
  const obtenido = await intento(fn);
  const ms = Math.round(performance.now() - t0);
  filas.push({ caso, descripcion, esperado, obtenido, cumple: obtenido === esperado, ms });
}

const nuevoReq = (extra = {}) => ({
  enunciado: 'Cuando el usuario guarde un requerimiento, el sistema mostrará un mensaje de confirmación.',
  id_proyecto: 'P', id_equipo: 'E', id_autor: 'autor', id_aprobador: null, id_estado: 'pend', ...extra,
});

// CP-RQ21-01 · Partición de equivalencia: alta válida (clase válida) y clases inválidas.
await paso('CP-RQ21-01', 'Alta válida por integrante del equipo', 'permitida', () => setDoc(doc(ctx('autor'), 'requerimiento', 'n1'), nuevoReq()));
await paso('CP-RQ21-01', 'Alta con id_autor de otra persona', 'denegada', () => setDoc(doc(ctx('autor'), 'requerimiento', 'n2'), nuevoReq({ id_autor: 'lider' })));
await paso('CP-RQ21-01', 'Alta ya aprobada (estado inicial distinto de Pendiente)', 'denegada', () => setDoc(doc(ctx('autor'), 'requerimiento', 'n3'), nuevoReq({ id_estado: 'apr' })));
await paso('CP-RQ21-01', 'Alta por usuario ajeno al proyecto', 'denegada', () => setDoc(doc(ctx('ajeno'), 'requerimiento', 'n4'), nuevoReq({ id_autor: 'ajeno' })));
await paso('CP-RQ21-01', 'Alta con campo no permitido (id_lider)', 'denegada', () => setDoc(doc(ctx('autor'), 'requerimiento', 'n5'), nuevoReq({ id_lider: 'x' })));

// CP-RQ21-02 · Valores límite del enunciado (1..5000 caracteres).
for (const [n, esp] of [[0, 'denegada'], [1, 'permitida'], [5000, 'permitida'], [5001, 'denegada']]) {
  await paso('CP-RQ21-02', `Enunciado de ${n} caracteres`, esp, () => setDoc(doc(ctx('autor'), 'requerimiento', `l${n}`), nuevoReq({ enunciado: 'a'.repeat(n) })));
}

// CP-RQ21-03 · Campos de IA: límite de 12 elementos de sintaxis y dominio de prioridad.
const el = (k) => Array.from({ length: k }, (_, i) => ({ elemento: `e${i}`, fragmento: `fragmento ${i}` }));
await paso('CP-RQ21-03', '12 elementos de sintaxis (límite)', 'permitida', () => setDoc(doc(ctx('autor'), 'requerimiento', 's12'), nuevoReq({ elementos_sintaxis: el(12) })));
await paso('CP-RQ21-03', '13 elementos de sintaxis (límite + 1)', 'denegada', () => setDoc(doc(ctx('autor'), 'requerimiento', 's13'), nuevoReq({ elementos_sintaxis: el(13) })));
await paso('CP-RQ21-03', 'Prioridad "Must" (dominio válido)', 'permitida', () => setDoc(doc(ctx('autor'), 'requerimiento', 'pm'), nuevoReq({ prioridad: 'Must' })));
await paso('CP-RQ21-03', 'Prioridad "Alta" (fuera del dominio)', 'denegada', () => setDoc(doc(ctx('autor'), 'requerimiento', 'pa'), nuevoReq({ prioridad: 'Alta' })));

// CP-RQ05-01 · Transición de estados del ciclo de aprobación.
await paso('CP-RQ05-01', 'Pendiente → Aprobado por el líder', 'permitida', () => updateDoc(doc(ctx('lider'), 'requerimiento', 'rPend'), { id_estado: 'apr', id_aprobador: 'lider' }));
await paso('CP-RQ05-01', 'Pendiente → Rechazado por el líder', 'permitida', () => updateDoc(doc(ctx('lider'), 'requerimiento', 'rPend'), { id_estado: 'rech', id_aprobador: null }));
await paso('CP-RQ05-01', 'Pendiente → Aprobado por el autor (no líder)', 'denegada', () => updateDoc(doc(ctx('autor'), 'requerimiento', 'rPend'), { id_estado: 'apr', id_aprobador: 'autor' }));
await paso('CP-RQ05-01', 'Rechazado → Pendiente por el autor (reenvío)', 'permitida', () => updateDoc(doc(ctx('autor'), 'requerimiento', 'rRech'), { id_estado: 'pend', enunciado: 'Texto corregido por el autor.' }));
await paso('CP-RQ05-01', 'Rechazado → Aprobado por el líder (sin pasar por Pendiente)', 'denegada', () => updateDoc(doc(ctx('lider'), 'requerimiento', 'rRech'), { id_estado: 'apr', id_aprobador: 'lider' }));
await paso('CP-RQ05-01', 'Aprobado → Rechazado por el líder', 'denegada', () => updateDoc(doc(ctx('lider'), 'requerimiento', 'rApr'), { id_estado: 'rech', id_aprobador: null }));
await paso('CP-RQ05-01', 'Pendiente → Aprobado por el líder con otro como aprobador', 'denegada', () => updateDoc(doc(ctx('lider'), 'requerimiento', 'rPend'), { id_estado: 'apr', id_aprobador: 'autor' }));

// CP-RQ15-01 · Tabla de decisión: quién puede eliminar un requerimiento.
await paso('CP-RQ15-01', 'R1 autor del requerimiento elimina', 'permitida', () => deleteDoc(doc(ctx('autor'), 'requerimiento', 'rPend')));
await paso('CP-RQ15-01', 'R2 creador del proyecto elimina', 'permitida', () => deleteDoc(doc(ctx('creador'), 'requerimiento', 'rPend')));
await paso('CP-RQ15-01', 'R3 usuario verificado ajeno al proyecto elimina', 'denegada', () => deleteDoc(doc(ctx('ajeno'), 'requerimiento', 'rPend')));
await paso('CP-RQ15-01', 'R4 usuario con correo sin verificar elimina', 'denegada', () => deleteDoc(doc(ctx('noverif', false), 'requerimiento', 'rPend')));
await paso('CP-RQ15-01', 'R5 sin sesión elimina', 'denegada', () => deleteDoc(doc(env.unauthenticatedContext().firestore(), 'requerimiento', 'rPend')));

// CP-RQ02-01 · Proyecto ajeno: modificar el creador o eliminar (regresión de DEF-05).
await paso('CP-RQ02-01', 'Creador modifica descripción', 'permitida', () => updateDoc(doc(ctx('creador'), 'proyecto', 'P'), { descripcion: 'Nueva descripción' }));
await paso('CP-RQ02-01', 'Ajeno cambia id_creador a sí mismo', 'denegada', () => updateDoc(doc(ctx('ajeno'), 'proyecto', 'P'), { id_creador: 'ajeno' }));
await paso('CP-RQ02-01', 'Ajeno elimina el proyecto', 'denegada', () => deleteDoc(doc(ctx('ajeno'), 'proyecto', 'P')));
await paso('CP-RQ02-01', 'Integrante (no creador) elimina el proyecto', 'denegada', () => deleteDoc(doc(ctx('autor'), 'proyecto', 'P')));

// CP-RQ10-01 · Integridad del historial (log inmutable y con autor verdadero).
const log = (extra = {}) => ({ id_requerimiento: 'rPend', accion: 'editar', id_autor: 'autor', fecha_hora: '2026-11-26T00:00:00Z', ...extra });
await paso('CP-RQ10-01', 'Miembro registra su propia edición', 'permitida', () => setDoc(doc(ctx('autor'), 'logs_requerimientos', 'L2'), log()));
await paso('CP-RQ10-01', 'Miembro registra edición a nombre de otro', 'denegada', () => setDoc(doc(ctx('autor'), 'logs_requerimientos', 'L3'), log({ id_autor: 'lider' })));
await paso('CP-RQ10-01', 'Ajeno registra en el historial', 'denegada', () => setDoc(doc(ctx('ajeno'), 'logs_requerimientos', 'L4'), log({ id_autor: 'ajeno' })));
await paso('CP-RQ10-01', 'Autor modifica una entrada existente', 'denegada', () => updateDoc(doc(ctx('autor'), 'logs_requerimientos', 'L1'), { accion: 'borrar' }));
await paso('CP-RQ10-01', 'Creador del proyecto borra una entrada', 'denegada', () => deleteDoc(doc(ctx('creador'), 'logs_requerimientos', 'L1')));

// CP-NF-01 · Desempeño y concurrencia de reglas: 20 altas simultáneas.
await sembrar();
const tiempos = [];
const t0 = performance.now();
const res = await Promise.all(Array.from({ length: 20 }, (_, i) => (async () => {
  const s = performance.now();
  const r = await intento(() => setDoc(doc(ctx('autor'), 'requerimiento', `c${i}`), nuevoReq({ enunciado: `Requerimiento concurrente ${i}` })));
  tiempos.push(performance.now() - s);
  return r;
})()));
const total = Math.round(performance.now() - t0);
tiempos.sort((a, b) => a - b);
const p95 = Math.round(tiempos[Math.ceil(0.95 * tiempos.length) - 1]);
const ok = res.filter(r => r === 'permitida').length;
filas.push({ caso: 'CP-NF-01', descripcion: `20 altas concurrentes: ${ok}/20 aceptadas, p95 ${p95} ms, total ${total} ms`, esperado: '20/20, p95 ≤ 500 ms, total ≤ 3000 ms', obtenido: `${ok}/20, p95 ${p95} ms, total ${total} ms`, cumple: ok === 20 && p95 <= 500 && total <= 3000, ms: total });

await env.cleanup();
const resumen = {};
for (const f of filas) { const r = (resumen[f.caso] ??= { pasos: 0, cumplen: 0 }); r.pasos++; if (f.cumple) r.cumplen++; }
const salida = { version, commit, fecha_hora: new Date().toISOString(), resumen, filas };
mkdirSync('tests/resultados', { recursive: true });
writeFileSync('tests/resultados/integracion.json', JSON.stringify(salida, null, 2));
console.log(`Versión probada: ${version} (${commit})`);
console.table(filas.map(({ caso, descripcion, esperado, obtenido, cumple }) => ({ caso, descripcion: descripcion.slice(0, 52), esperado, obtenido, cumple })));
console.table(Object.entries(resumen).map(([caso, r]) => ({ caso, ...r, estado: r.cumplen === r.pasos ? 'Pasó' : 'Falló' })));
process.exit(filas.every(f => f.cumple) ? 0 : 1);
