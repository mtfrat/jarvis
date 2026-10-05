import '../src/load-env';
import assert from 'node:assert/strict';

import {
  computeCardStatementDates,
  getCardStatement,
  getDashboardStats,
  createExpense,
  updateExpense,
  deleteExpense,
} from '../src/lib/expense-service';
import { isSupabaseConfigured } from '../src/lib/supabase';

// Todo el cálculo de statement es UTC: leer fechas igual, sea donde sea
const ymd = (d: Date) => {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
};
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const todayStr = ymd(new Date());

const created: string[] = [];

function testDates() {
  console.log('🧪 Probando computeCardStatementDates...');

  // 1. Cierre 5 / vencimiento 25, en pleno "a pagar"
  let s = computeCardStatementDates(utc(2026, 10, 20), 5, 25);
  assert.equal(s.status, 'due', '1 status due');
  assert.equal(ymd(s.periodStart), '2026-09-05', '1 periodStart');
  assert.equal(ymd(s.periodEnd), '2026-10-05', '1 periodEnd');
  assert.equal(ymd(s.dueDate), '2026-10-25', '1 dueDate');
  assert.equal(ymd(s.closingDate), '2026-10-05', '1 closingDate');
  console.log('✅1 cierre→cierre, entre cierre y vencimiento = due');

  // 2. Pasado el vencimiento → período en curso
  s = computeCardStatementDates(utc(2026, 10, 26), 5, 25);
  assert.equal(s.status, 'accumulating', '2 status accumulating');
  assert.equal(ymd(s.periodStart), '2026-10-05', '2 periodStart');
  assert.equal(ymd(s.periodEnd), '2026-11-05', '2 periodEnd');
  assert.equal(ymd(s.closingDate), '2026-11-05', '2 closingDate');
  assert.equal(ymd(s.dueDate), '2026-11-25', '2 dueDate');
  console.log('✅2 después del vencimiento = accumulating (período nuevo)');

  // 3. Justo el día del cierre → cierra hoy, sigue venciendo
  s = computeCardStatementDates(utc(2026, 10, 5), 5, 25);
  assert.equal(s.status, 'due', '3 status due');
  assert.equal(ymd(s.periodEnd), '2026-10-05', '3 cierra hoy');
  assert.equal(ymd(s.periodStart), '2026-09-05', '3 desde el cierre anterior');
  console.log('✅3 día del cierre: el período cierra hoy y queda a pagar');

  // 4. Clamp de mes corto: cierre 31 en febrero → 28 (2026 no es bisiesto)
  s = computeCardStatementDates(utc(2026, 3, 10), 31, 25);
  assert.equal(s.status, 'due', '4 status due');
  assert.equal(ymd(s.periodStart), '2026-01-31', '4 periodStart ene');
  assert.equal(ymd(s.periodEnd), '2026-02-28', '4 periodEnd clamp feb');
  assert.equal(ymd(s.dueDate), '2026-03-25', '4 dueDate');
  console.log('✅4 cierre 31 clampado al fin del mes');

  // 5. Fallback sin cierre: mes calendario, a pagar
  s = computeCardStatementDates(utc(2026, 10, 10), null, 25);
  assert.equal(s.status, 'due', '5 status due');
  assert.equal(ymd(s.periodStart), '2026-09-01', '5 inicio mes anterior');
  assert.equal(ymd(s.periodEnd), '2026-09-30', '5 fin mes anterior');
  assert.equal(ymd(s.dueDate), '2026-10-25', '5 dueDate');
  console.log('✅5 sin cierre: mes anterior vence este mes');

  // 6. Fallback sin cierre, ya pagó → mes en curso
  s = computeCardStatementDates(utc(2026, 10, 26), null, 25);
  assert.equal(s.status, 'accumulating', '6 status accumulating');
  assert.equal(ymd(s.periodStart), '2026-10-01', '6 inicio mes en curso');
  assert.equal(ymd(s.periodEnd), '2026-10-31', '6 fin de mes');
  assert.equal(ymd(s.dueDate), '2026-11-25', '6 dueDate mes que viene');
  console.log('✅6 sin cierre: después de pagar muestra el mes en curso');
}

async function testDb() {
  console.log('\n🧪 Probando reimbursable + statement en BD...');

  // Roundtrip: crear con flag y sacarlo con update
  let roundtrip;
  try {
    roundtrip = await createExpense({
      amount: 70001,
      currency: 'ARS',
      description: 'TEST CARD roundtrip',
      category: 'Otros',
      date: todayStr,
      source: 'dashboard_manual',
      reimbursable: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/reimbursable/i.test(msg)) {
      console.log('⏭️ DB omitido: falta la migración 08_reimbursable.sql');
      return;
    }
    throw err;
  }
  created.push(...roundtrip.map((e) => e.id));
  assert.equal(roundtrip[0].reimbursable, true, '1 crea con reimbursable=true');
  await updateExpense(roundtrip[0].id, { reimbursable: false });
  const { getExpenses } = await import('../src/lib/expense-service');
  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const rows = await getExpenses({ month: monthKey });
  const found = rows.find((r) => r.id === roundtrip[0].id);
  assert.equal(found?.reimbursable, false, '2 updateExpense saca el flag');
  await updateExpense(roundtrip[0].id, { reimbursable: true });
  console.log('✅1 roundtrip reimbursable (create + update)');

  // Stats: el reintegrable no cuenta como gasto (el control sí)
  const before = await getDashboardStats();
  const control = await createExpense({
    amount: 70003,
    currency: 'ARS',
    description: 'TEST CARD control',
    category: 'Otros',
    date: todayStr,
    source: 'dashboard_manual',
  });
  created.push(...control.map((e) => e.id));
  const afterControl = await getDashboardStats();
  const deltaControl = afterControl.totalSpentArs - before.totalSpentArs;
  assert.equal(deltaControl, 70003, '3 gasto normal suma en totalSpent');

  const reimb = await createExpense({
    amount: 70004,
    currency: 'ARS',
    description: 'TEST CARD reintegrable',
    category: 'Otros',
    date: todayStr,
    source: 'dashboard_manual',
    reimbursable: true,
  });
  created.push(...reimb.map((e) => e.id));
  const afterReimb = await getDashboardStats();
  assert.equal(
    afterReimb.totalSpentArs - afterControl.totalSpentArs,
    0,
    '4 reintegrable no suma en totalSpent'
  );
  const catControl = afterControl.categoryBreakdown.find((c) => c.category === 'Otros');
  const catReimb = afterReimb.categoryBreakdown.find((c) => c.category === 'Otros');
  assert.ok(catControl && catReimb, '5 breakdown tiene Otros');
  assert.equal(catReimb.amountArs, catControl.amountArs, '5 reintegrable fuera del breakdown');
  console.log('✅2 stats: reintegrable excluido, control incluido');

  // Statement: incluye reintegrables con tarjeta, excluye los que no son de tarjeta
  const stmtBefore = await getCardStatement();
  if (!stmtBefore) {
    console.log('⏭️ Statement omitido: día de pago no configurado (/config pagotarjeta N)');
    return;
  }
  const testDate =
    stmtBefore.status === 'due' ? stmtBefore.periodEnd : todayStr;
  assert.ok(
    testDate >= stmtBefore.periodStart && testDate <= stmtBefore.periodEnd,
    '6 fecha de prueba dentro del período'
  );

  const cardReimb = await createExpense({
    amount: 70005,
    currency: 'ARS',
    description: 'TEST CARD stmt reintegrable',
    category: 'Otros',
    payment_method: 'Tarjeta Crédito',
    date: testDate,
    source: 'dashboard_manual',
    reimbursable: true,
  });
  created.push(...cardReimb.map((e) => e.id));
  const cardNormal = await createExpense({
    amount: 70006,
    currency: 'ARS',
    description: 'TEST CARD stmt normal',
    category: 'Otros',
    payment_method: 'Tarjeta Crédito',
    date: testDate,
    source: 'dashboard_manual',
  });
  created.push(...cardNormal.map((e) => e.id));
  const noCardReimb = await createExpense({
    amount: 70007,
    currency: 'ARS',
    description: 'TEST CARD stmt efectivo',
    category: 'Otros',
    payment_method: 'Efectivo',
    date: testDate,
    source: 'dashboard_manual',
    reimbursable: true,
  });
  created.push(...noCardReimb.map((e) => e.id));

  const stmtAfter = await getCardStatement();
  assert.ok(stmtAfter, '7 statement sigue disponible');
  assert.equal(
    stmtAfter.totalArs - stmtBefore.totalArs,
    70005 + 70006,
    '8 statement: incluye reintegrable con tarjeta, excluye efectivo'
  );
  console.log('✅3 statement: reintegrable suma en el pago de tarjeta');
}

async function run() {
  testDates();

  if (!isSupabaseConfigured) {
    console.log('⏭️ Supabase no configurado — tests de BD omitidos.');
    return;
  }

  try {
    await testDb();
    console.log('\n🎉 Todos los tests de tarjeta/reintegrables pasaron.');
  } finally {
    for (const id of created) {
      if (id) await deleteExpense(id);
    }
    // Sweep de seguridad: filas TEST CARD residuales
    const now = new Date();
    const months = [
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      '2026-09',
      '2026-10',
      '2026-11',
    ];
    const { getExpenses } = await import('../src/lib/expense-service');
    for (const m of months) {
      for (const e of await getExpenses({ month: m })) {
        if (e.description.startsWith('TEST CARD')) await deleteExpense(e.id);
      }
    }
    console.log('🧹 Limpieza OK.');
  }
}

run().catch((err) => {
  console.error('❌ Falló test de tarjeta:', err);
  process.exit(1);
});
