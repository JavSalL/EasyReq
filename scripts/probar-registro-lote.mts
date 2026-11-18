/**
 * KAN-47: comprueba que el alta en lote de la generación iterativa (`crearRequerimientosEnLote`)
 * funciona con cientos de requerimientos contra las reglas reales (`firestore.rules`), en el
 * emulador de Firestore y Auth. No toca el proyecto real.
 *
 * Uso (necesita Java y firebase-tools):
 *   workers/ai-proxy/node_modules/.bin/esbuild scripts/probar-registro-lote.mts --bundle --platform=node \
 *     --format=esm --loader:.mts=ts --outfile=scripts/.registro-lote.mjs --external:firebase --external:@firebase/*
 *   firebase emulators:exec --config firebase.emuladores.json --project demo-easyreq "node scripts/.registro-lote.mjs 300"
 */
process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??= 'demo-key';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= 'demo-easyreq';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??= 'demo-easyreq.firebaseapp.com';

const { db, auth } = await import('../lib/firebase');
const { connectFirestoreEmulator, collection, getDocs, query, where, doc, getDoc } = await import('firebase/firestore');
const { connectAuthEmulator, createUserWithEmailAndPassword } = await import('firebase/auth');
const { crearRequerimientosEnLote } = await import('../lib/services/requerimientos-service');

const HOST_FS = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const HOST_AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const PROYECTO_FB = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
const [hostFs, puertoFs] = HOST_FS.split(':');
connectFirestoreEmulator(db, hostFs, Number(puertoFs));
connectAuthEmulator(auth, `http://${HOST_AUTH}`, { disableWarnings: true });

const total = Number(process.argv[2]) || 300;

// Datos de partida escritos sin reglas (cabecera "Bearer owner" del emulador).
async function sembrar(ruta: string, campos: Record<string, string | number | null>) {
  const fields = Object.fromEntries(
    Object.entries(campos).map(([k, v]) => [k, v === null ? { nullValue: null } : typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v }])
  );
  const res = await fetch(`http://${HOST_FS}/v1/projects/${PROYECTO_FB}/databases/(default)/documents/${ruta}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  if (!res.ok) throw new Error(`No se pudo sembrar ${ruta}: ${res.status} ${await res.text()}`);
}

const cred = await createUserWithEmailAndPassword(auth, `prueba-${Date.now()}@example.com`, `clave-${Math.random().toString(36).slice(2)}`);
const uid = cred.user.uid;
// Las reglas piden el correo verificado: se marca en el emulador y se renueva el token.
const verificado = await fetch(`http://${HOST_AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROYECTO_FB}/accounts:update`, {
  method: 'POST',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ localId: uid, emailVerified: true })
});
if (!verificado.ok) throw new Error(`No se pudo verificar el correo de prueba: ${verificado.status}`);
await cred.user.getIdToken(true);
await sembrar('estados/pendiente', { nombre_estado: 'Pendiente de aprobación' });
await sembrar('proyecto/p1', { nombre: 'Proyecto de prueba', id_creador: uid, contador_requerimientos: 0 });
await sembrar('equipo/e1', { nombre: 'Equipo de prueba', id_proyecto: 'p1' });

const items = Array.from({ length: total }, (_, i) => ({
  enunciado: `El sistema debe permitir registrar el elemento de prueba número ${i + 1} con sus datos obligatorios.`,
  id_proyecto: 'p1',
  id_equipo: 'e1',
  modulo: i % 2 ? 'Pagos' : 'Catálogo',
  origen_ia: i % 3 ? 'explicito' : 'inferido',
  prioridad: 'Must'
})) as Array<Record<string, unknown>>;

const inicio = Date.now();
let avances = 0;
const r = await crearRequerimientosEnLote('p1', items, uid, { origen: 'prueba KAN-47' } as never, () => avances++);
const ms = Date.now() - inicio;

const guardados = await getDocs(query(collection(db, 'requerimiento'), where('id_proyecto', '==', 'p1')));
const proyecto = await getDoc(doc(db, 'proyecto', 'p1'));
const numeros = guardados.docs.map(d => d.data().numero as number).sort((a, b) => a - b);
const consecutivos = numeros.every((n, i) => n === i + 1);
console.log(JSON.stringify({
  pedidos: total,
  creados: r.creados.length,
  enFirestore: guardados.size,
  logsFallidos: r.logsFallidos,
  error: r.error ? String((r.error as { code?: string }).code ?? r.error) : null,
  contador: proyecto.data()?.contador_requerimientos,
  numerosConsecutivos: consecutivos,
  lotesConfirmados: avances,
  milisegundos: ms
}, null, 2));
process.exit(r.creados.length === total && !r.error && r.logsFallidos === 0 && consecutivos ? 0 : 1);
