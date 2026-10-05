import '../src/load-env';
import assert from 'node:assert/strict';

import {
  splitCents,
  computeBalances,
  simplifyDebts,
  toCents,
  createSplitMeeting,
  getSplitMeeting,
  listSplitMeetings,
  addSplitExpense,
  deleteSplitMeeting,
  markMemberAddedToJarvis,
} from '../src/lib/split-service';
import { isSupabaseConfigured } from '../src/lib/supabase';

// ---------- Unit: splitCents ----------
function testSplitCents() {
  console.log('🧪 Probando splitCents...');

  // División exacta
  assert.deepEqual(splitCents(1000, 4), [250, 250, 250, 250]);

  // Resto de centavos a los primeros
  assert.deepEqual(splitCents(1001, 4), [251, 250, 250, 250]);
  assert.deepEqual(splitCents(10, 3), [4, 3, 3]);
  assert.deepEqual(splitCents(1, 3), [1, 0, 0]);

  // Invariante: la suma siempre es el total
  for (const [total, n] of [
    [1000, 3],
    [999999, 7],
    [12345, 2],
    [7, 5],
    [100, 1],
  ] as const) {
    const parts = splitCents(total, n);
    assert.equal(
      parts.reduce((a, b) => a + b, 0),
      total,
      `sum(${total}, ${n})`
    );
    assert.equal(parts.length, n);
  }

  // n = 1 → todo de una
  assert.deepEqual(splitCents(5555, 1), [5555]);

  console.log('✅ splitCents (exacto, resto, invariante suma, n=1)');
}

// ---------- Unit: computeBalances ----------
function testComputeBalances() {
  console.log('🧪 Probando computeBalances...');

  const members = [
    { id: 'a', name: 'Ana' },
    { id: 'b', name: 'Ben' },
    { id: 'c', name: 'Cara' },
    { id: 'd', name: 'Dan' },
  ];

  // Ana pagó 100.000, todos iguales → 25.000 c/u
  const balances = computeBalances(members, [{ amount: 100000, paid_by: 'a' }]);
  const byId = new Map(balances.map((b) => [b.member_id, b]));

  assert.equal(byId.get('a')!.paid, 10000000); // centavos
  assert.equal(byId.get('a')!.owed, 2500000);
  assert.equal(byId.get('a')!.net, 7500000);
  assert.equal(byId.get('b')!.net, -2500000);
  assert.equal(byId.get('c')!.net, -2500000);
  assert.equal(byId.get('d')!.net, -2500000);

  // Invariante: suma de nets = 0
  const netSum = balances.reduce((s, b) => s + b.net, 0);
  assert.equal(netSum, 0, 'suma de nets debe ser 0');

  // Varios pagadores: Ana cena 30.000, Ben taxi 9.000 → total 39.000, c/u 13.000
  const multi = computeBalances(
    members.slice(0, 3),
    [
      { amount: 30000, paid_by: 'a' },
      { amount: 9000, paid_by: 'b' },
    ]
  );
  const mById = new Map(multi.map((b) => [b.member_id, b]));
  assert.equal(mById.get('a')!.net, 3000000 - 1300000); // +17.000
  assert.equal(mById.get('b')!.net, 900000 - 1300000); // -4.000
  assert.equal(mById.get('c')!.net, -1300000); // -13.000
  assert.equal(multi.reduce((s, b) => s + b.net, 0), 0);

  // Monto con centavos: 10.000,50 entre 3 → reparto con resto exacto
  const cents = computeBalances(members.slice(0, 3), [{ amount: 10000.5, paid_by: 'c' }]);
  const owedSum = cents.reduce((s, b) => s + b.owed, 0);
  assert.equal(owedSum, toCents(10000.5), 'suma de partes = total en centavos');

  console.log('✅ computeBalances (net, multi-pagador, centavos, nets=0)');
}

// ---------- Unit: simplifyDebts ----------
function testSimplifyDebts() {
  console.log('🧪 Probando simplifyDebts...');

  // Caso simple: Ana +200, Ben -100, Cara -100
  const t1 = simplifyDebts([
    { member_id: 'a', name: 'Ana', paid: 200, owed: 0, net: 200 },
    { member_id: 'b', name: 'Ben', paid: 0, owed: 100, net: -100 },
    { member_id: 'c', name: 'Cara', paid: 0, owed: 100, net: -100 },
  ]);
  assert.equal(t1.length, 2);
  assert.equal(t1.reduce((s, t) => s + t.amount, 0), 200, 'transfers conservan total');
  for (const t of t1) {
    assert.equal(t.from_id !== 'a', true, 'Ana no debe');
    assert.equal(t.to_id, 'a', 'Ana es acreedora');
  }

  // Cascada: A +100, B +50, C -150 → C paga a A 100 y a B 50
  const t2 = simplifyDebts([
    { member_id: 'a', name: 'A', paid: 0, owed: 0, net: 100 },
    { member_id: 'b', name: 'B', paid: 0, owed: 0, net: 50 },
    { member_id: 'c', name: 'C', paid: 0, owed: 0, net: -150 },
  ]);
  assert.equal(t2.length, 2);
  assert.equal(t2.reduce((s, t) => s + t.amount, 0), 150);
  assert.ok(t2.every((t) => t.from_id === 'c'));

  // Todo saldado → sin transfers
  const t3 = simplifyDebts([
    { member_id: 'a', name: 'A', paid: 100, owed: 100, net: 0 },
    { member_id: 'b', name: 'B', paid: 50, owed: 50, net: 0 },
  ]);
  assert.equal(t3.length, 0);

  // Escenario integrado: Ana +17.000, Ben -4.000, Cara -13.000 (centavos)
  const t4 = simplifyDebts([
    { member_id: 'a', name: 'Ana', paid: 3000000, owed: 1300000, net: 1700000 },
    { member_id: 'b', name: 'Ben', paid: 900000, owed: 1300000, net: -400000 },
    { member_id: 'c', name: 'Cara', paid: 0, owed: 1300000, net: -1300000 },
  ]);
  // Deudor mayor primero: Cara → Ana 13.000; Ben → Ana 4.000
  assert.equal(t4.length, 2);
  assert.deepEqual(
    t4.map((t) => [t.from_name, t.to_name, t.amount]),
    [
      ['Cara', 'Ana', 1300000],
      ['Ben', 'Ana', 400000],
    ]
  );
  const totalDeuda = t4.reduce((s, t) => s + t.amount, 0);
  assert.equal(totalDeuda, 1700000, 'transfers = total adeudado');

  console.log('✅ simplifyDebts (par, cascada, saldado, integrado)');
}

// ---------- Integration (requiere migración 07) ----------
async function testIntegration() {
  console.log('\n🧪 Probando integración con BD...');

  if (!isSupabaseConfigured) {
    console.log('⏭️ Supabase no configurado — integración omitida.');
    return;
  }

  // Probar que la migración 07 existe antes de tocar las tablas
  try {
    await listSplitMeetings();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/07_splits|migración|split_meetings.*schema cache|could not find the table.*split/i.test(msg)) {
      console.log('⏭️ Migración 07_splits.sql no ejecutada — integración omitida.');
      console.log('   Correla en Supabase SQL Editor y re-ejecutá: npm run test:splits');
      return;
    }
    throw err;
  }

  let meetingId: string | null = null;
  try {
    // Crear
    const meeting = await createSplitMeeting({
      name: 'TEST PD reunión',
      date: '2026-10-04',
      currency: 'ARS',
      members: ['Ana', 'Ben', 'Cara'],
    });
    meetingId = meeting.id;
    assert.equal(meeting.currency, 'ARS');
    console.log('✅1 createSplitMeeting');

    // Validaciones
    await assert.rejects(
      () => createSplitMeeting({ name: 'x', date: '2026-10-04', members: ['Solo'] }),
      /al menos 2/,
      'rechaza 1 participante'
    );
    await assert.rejects(
      () => createSplitMeeting({ name: 'x', date: '2026-10-04', members: ['Ana', 'ana'] }),
      /únicos/,
      'rechaza nombres duplicados'
    );
    console.log('✅2 validaciones de creación');

    // Gastos: cena Ana 30.000, taxi Ben 9.000
    const initial = await getSplitMeeting(meeting.id);
    const anaId = initial!.members[0].id;
    const benId = initial!.members[1].id;
    await addSplitExpense({
      meeting_id: meeting.id,
      description: 'Cena',
      amount: 30000,
      paid_by: anaId,
    });
    await addSplitExpense({
      meeting_id: meeting.id,
      description: 'Taxi',
      amount: 9000,
      paid_by: benId,
    });
    console.log('✅3 addSplitExpense x2');

    // Detalle + saldos + transfers
    const detail = await getSplitMeeting(meeting.id);
    assert.ok(detail);
    assert.equal(detail!.expenses.length, 2); // e1 + e2 abajo
    const byName = new Map(detail!.balances.map((b) => [b.name, b]));
    assert.equal(byName.get('Ana')!.net, 1700000);
    assert.equal(byName.get('Ben')!.net, -400000);
    assert.equal(byName.get('Cara')!.net, -1300000);
    assert.equal(detail!.total, 3900000);
    assert.equal(detail!.transfers.length, 2);
    assert.equal(detail!.expenses[1].paid_by_name, 'Ben');
    console.log('✅4 getSplitMeeting: balances, transfers, paid_by_name');

    // Listado
    const list = await listSplitMeetings();
    const found = list.find((m) => m.id === meeting.id);
    assert.ok(found, 'reunión en listado');
    assert.equal(found!.total, 3900000);
    assert.equal(found!.member_count, 3);
    assert.equal(found!.expense_count, 2);
    console.log('✅5 listSplitMeetings con totales');

    // Marcar "agregado a Jarvis"
    await markMemberAddedToJarvis(detail!.members[0].id);
    const after = await getSplitMeeting(meeting.id);
    assert.equal(after!.members[0].added_to_jarvis, true);
    console.log('✅6 markMemberAddedToJarvis');

    // Pago por ajeno a la reunión → rechazo (usar id trucado)
    await assert.rejects(
      () =>
        addSplitExpense({
          meeting_id: meeting.id,
          description: 'hack',
          amount: 100,
          paid_by: '00000000-0000-0000-0000-000000000000',
        }),
      /no pertenece/,
      'pagador externo rechazado'
    );
    console.log('✅7 pagador ajeno rechazado');

    console.log('🎉 Integración OK');
  } finally {
    if (meetingId) {
      await deleteSplitMeeting(meetingId);
    }
    // Limpieza fallback: reuniones TEST PD residuales
    for (const m of await listSplitMeetings()) {
      if (m.name.startsWith('TEST PD')) await deleteSplitMeeting(m.id);
    }
    console.log('🧹 Limpieza OK.');
  }
}

async function run() {
  testSplitCents();
  testComputeBalances();
  testSimplifyDebts();
  await testIntegration();
  console.log('\n🎉 Todos los tests de división de cuentas pasaron.');
}

run().catch((err) => {
  console.error('❌ Falló test de división:', err);
  process.exit(1);
});
