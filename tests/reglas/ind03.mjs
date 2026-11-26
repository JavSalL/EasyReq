// EASYREQ-PRU-01 · IND-03: lecturas no autorizadas entre equipos (SC-001, acción preventiva AP-03).
// Uso: npm run test:reglas   (levanta el emulador de Firestore con firebase.emuladores.json)
// Datos sintéticos. Termina con código 1 si alguna lectura indebida se permite o algún control se niega.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const run = process.argv[2] ?? '1';
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8185').split(':');
const env = await initializeTestEnvironment({
  projectId: 'demo-easyreq',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
});
await env.clearFirestore();
// Datos sintéticos: equipo A (usuario userA) y equipo B (usuario userB), cada uno con su proyecto.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const t of ['A', 'B']) {
    await setDoc(doc(db, 'proyecto', `p${t}`), { nombre: `Proyecto ${t}`, id_creador: `user${t}`, ids_miembros: [`user${t}`] });
    await setDoc(doc(db, 'equipo', `e${t}`), { nombre: `Equipo ${t}`, id_creador: `user${t}`, id_proyecto: `p${t}` });
    await setDoc(doc(db, 'miembros_equipo', `e${t}_user${t}`), { id_equipo: `e${t}`, id_usuario: `user${t}`, id_rol: null });
    await setDoc(doc(db, 'requerimiento', `r${t}`), { id_proyecto: `p${t}`, descripcion: `Req ${t}` });
    await setDoc(doc(db, 'logs_requerimientos', `l${t}`), { id_requerimiento: `r${t}`, accion: 'crear', id_autor: `user${t}`, fecha_hora: '2026-10-23T00:00:00Z' });
  }
});

const anon = env.unauthenticatedContext().firestore();
const noVerif = env.authenticatedContext('userU', { email: 'u@test.dev', email_verified: false }).firestore();
const userA = env.authenticatedContext('userA', { email: 'a@test.dev', email_verified: true }).firestore();

// Por colección: documento de B, consulta de lista que apunta a los datos de B, y documento propio de A (control).
const cols = [
  ['proyecto', 'pB', ['id_creador', 'userB'], 'pA'],
  ['equipo', 'eB', ['id_proyecto', 'pB'], 'eA'],
  ['miembros_equipo', 'eB_userB', ['id_equipo', 'eB'], 'eA_userA'],
  ['requerimiento', 'rB', ['id_proyecto', 'pB'], 'rA'],
  ['logs_requerimientos', 'lB', ['id_requerimiento', 'rB'], 'lA'],
];

async function attempt(fn) {
  try { const r = await fn(); return { permitido: true, detalle: r }; }
  catch (e) { return { permitido: false, detalle: e.code || e.message }; }
}

const rows = [];
for (const [col, idB, [f, v], idA] of cols) {
  const cases = [
    ['sin sesión, get doc de B', 'negar', () => getDoc(doc(anon, col, idB)).then(s => s.exists() ? 'doc leído' : 'no existe')],
    ['correo no verificado, get doc de B', 'negar', () => getDoc(doc(noVerif, col, idB)).then(s => s.exists() ? 'doc leído' : 'no existe')],
    ['miembro de A, get doc de B', 'negar', () => getDoc(doc(userA, col, idB)).then(s => s.exists() ? 'doc leído' : 'no existe')],
    ['miembro de A, lista de B', 'negar', () => getDocs(query(collection(userA, col), where(f, '==', v))).then(q => `${q.size} doc(s)`)],
    ['miembro de A, get doc propio (control)', 'permitir', () => getDoc(doc(userA, col, idA)).then(s => s.exists() ? 'doc leído' : 'no existe')],
  ];
  for (const [caso, esperado, fn] of cases) {
    const r = await attempt(fn);
    const ok = esperado === 'negar' ? !r.permitido : r.permitido;
    rows.push({ coleccion: col, caso, esperado, resultado: r.permitido ? 'permitida' : 'denegada', detalle: r.detalle, cumple: ok });
  }
}
await env.cleanup();
const neg = rows.filter(r => r.esperado === 'negar');
const ctl = rows.filter(r => r.esperado === 'permitir');
const summary = { corrida: run, fecha_hora: new Date().toISOString(), denegadas: neg.filter(r => r.cumple).length, de: neg.length, controles_ok: ctl.filter(r => r.cumple).length, controles: ctl.length };
mkdirSync('tests/reglas/resultados', { recursive: true });
writeFileSync(`tests/reglas/resultados/corrida${run}.json`, JSON.stringify({ summary, rows }, null, 2));
console.table(rows.map(({ detalle, ...r }) => ({ ...r, detalle: String(detalle).slice(0, 30) })));
console.log(JSON.stringify(summary));
process.exit(rows.every(r => r.cumple) ? 0 : 1);
