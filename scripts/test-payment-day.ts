import '../src/load-env';
import assert from 'node:assert/strict';

import { effectiveCardDate, applyEffectiveDates, getExpenses, getDashboardStats, createExpense, deleteExpense } from '../src/lib/expense-service';
import { getCardPaymentDay, setCardPaymentDay, deleteSetting, CARD_PAYMENT_DAY_KEY } from '../src/lib/settings-service';
import { isSupabaseConfigured } from '../src/lib/supabase';

// --- Unit: effectiveCardDate ---
function testEffectiveCardDate() {
  console.log('🧪 Probando effectiveCardDate...\n');

  // Compra en mes P → día de pago de P+1
  assert.equal(effectiveCardDate('2026-09-20', 15), '2026-10-15');
  assert.equal(effectiveCardDate('2026-09-01', 1), '2026-10-01');
  assert.equal(effectiveCardDate('2026-09-30', 31), '2026-10-31');

  // Clamp a fin de mes
  assert.equal(effectiveCardDate('2026-01-10', 31), '2026-02-28'); // 2026 no es bisiesto
  assert.equal(effectiveCardDate('2024-01-10', 31), '2024-02-29'); // bisiesto
  assert.equal(effectiveCardDate('2026-04-05', 31), '2026-05-31');
  assert.equal(effectiveCardDate('2026-05-05', 31), '2026-06-30');

  // Cruce de año
  assert.equal(effectiveCardDate('2026-12-20', 15), '2027-01-15');
  assert.equal(effectiveCardDate('2026-12-20', 31), '2027-01-31');
  assert.equal(effectiveCardDate('2026-11-30', 31), '2026-12-31');

  console.log('✅ effectiveCardDate (normal, clamp, año nuevo)');
}

// --- Unit: applyEffectiveDates ---
function testApplyEffectiveDates() {
  console.log('\n🧪 Probando applyEffectiveDates...\n');

  const rows = [
    { date: '2026-09-10', payment_method: 'Efectivo', id: 'a' },
    { date: '2026-09-15', payment_method: 'Tarjeta Crédito', id: 'b' },
    { date: '2026-08-20', payment_method: 'Tarjeta Crédito', id: 'c' },
    { date: '2026-08-05', payment_method: 'Efectivo', id: 'd' },
    { date: '2026-07-30', payment_method: 'Tarjeta Crédito', id: 'e' },
    { date: '2026-09-01', payment_method: 'Cuenta DNI', id: 'f' },
  ];

  // Sin día de pago → legacy: solo filas de septiembre, sin effective_date
  const legacy = applyEffectiveDates(rows, '2026-09', null);
  assert.deepEqual(legacy.map((r) => r.id).sort(), ['a', 'b', 'f']);
  assert.ok(legacy.every((r) => !r.effective_date), 'legacy sin effective_date');
  console.log('✅1 legacy (paymentDay=null): solo mes propio');

  // Con día de pago=15:
  // - no-tarjeta de sep (a, f) se queda
  // - tarjeta de sep (b) NO se muestra (pasa a oct)
  // - tarjeta de ago (c) figura el 2026-09-15
  // - no-tarjeta de ago (d) no pertenece
  // - tarjeta de jul (e) tampoco
  const withDay = applyEffectiveDates(rows, '2026-09', 15);
  const ids = withDay.map((r) => r.id).sort();
  assert.deepEqual(ids, ['a', 'c', 'f'], `got ${ids}`);

  const cardPrev = withDay.find((r) => r.id === 'c')!;
  assert.equal(cardPrev.effective_date, '2026-09-15', 'tarjeta de ago → 15 sep');
  assert.equal(cardPrev.date, '2026-08-20', 'fecha original preservada');

  const cash = withDay.find((r) => r.id === 'a')!;
  assert.ok(!cash.effective_date, 'efectivo sin effective_date');
  console.log('✅2 con día de pago: tarjeta M-1 con effective_date, tarjeta M excluida');

  // Orden: por fecha visible desc → a (2026-09-10), c eff (2026-09-15), f (2026-09-01)
  // c eff=09-15 > a=09-10 > f=09-01
  const order = withDay.map((r) => r.id);
  assert.deepEqual(order, ['c', 'a', 'f'], `orden por fecha visible desc, got ${order}`);
  console.log('✅3 orden por fecha visible desc');

  // Día 31 en mes de 30 días (sep): clamp
  const clampRows = [{ date: '2026-08-15', payment_method: 'Tarjeta Crédito', id: 'x' }];
  const clamped = applyEffectiveDates(clampRows, '2026-09', 31);
  assert.equal(clamped[0].effective_date, '2026-09-30', 'clamp sep=30');
  console.log('✅4 clamp día 31 → fin de mes');

  // Año nuevo: dic → ene
  const yearRows = [{ date: '2026-12-10', payment_method: 'Tarjeta Crédito', id: 'y' }];
  const newYear = applyEffectiveDates(yearRows, '2027-01', 20);
  assert.equal(newYear[0]?.effective_date, '2027-01-20', 'dic → ene del año siguiente');
  console.log('✅5 cruce de año dic→ene');
}

// --- Integration con BD (requiere migración 06) ---
async function testIntegration() {
  console.log('\n🧪 Probando integración con BD (getExpenses/getDashboardStats)...\n');

  if (!isSupabaseConfigured) {
    console.log('⏭️ Supabase no configurado — integración omitida.');
    return;
  }

  const savedDay = await getCardPaymentDay();
  const created: string[] = [];

  // Probar que la migración 06 existe antes de tocar settings
  try {
    await setCardPaymentDay(savedDay ?? 15);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/06_settings|migración|settings.*schema cache|could not find the table.*settings/i.test(msg)) {
      console.log('⏭️ Migración 06_settings.sql no ejecutada — integración omitida.');
      console.log('   Correla en Supabase SQL Editor y re-ejecutá: npm run test:payment-day');
      return;
    }
    throw err;
  }

  try {
    // Sembrar: tarjeta en ago, efectivo en sep, tarjeta en sep
    const [cardAug] = await createExpense({
      amount: 10000,
      currency: 'ARS',
      description: 'TEST PD tarjeta ago',
      category: 'Otros',
      payment_method: 'Tarjeta Crédito',
      date: '2026-08-20',
      source: 'dashboard_manual',
    });
    created.push(cardAug.id);

    const [cashSep] = await createExpense({
      amount: 5000,
      currency: 'ARS',
      description: 'TEST PD efectivo sep',
      category: 'Otros',
      payment_method: 'Efectivo',
      date: '2026-09-10',
      source: 'dashboard_manual',
    });
    created.push(cashSep.id);

    const [cardSep] = await createExpense({
      amount: 7000,
      currency: 'ARS',
      description: 'TEST PD tarjeta sep',
      category: 'Otros',
      payment_method: 'Tarjeta Crédito',
      date: '2026-09-15',
      source: 'dashboard_manual',
    });
    created.push(cardSep.id);

    // Con día de pago=15, mes visible=2026-09
    await setCardPaymentDay(15);
    const sepView = await getExpenses({ month: '2026-09' });
    const sepIds = sepView.map((e) => e.id);

    assert.ok(sepIds.includes(cashSep.id), 'efectivo sep visible');
    assert.ok(sepIds.includes(cardAug.id), 'tarjeta ago visible en sep');
    assert.ok(!sepIds.includes(cardSep.id), 'tarjeta sep NO visible en sep');

    const shownCard = sepView.find((e) => e.id === cardAug.id)!;
    assert.equal(shownCard.effective_date, '2026-09-15', 'tarjeta ago figura el 15 sep');
    assert.equal(shownCard.date, '2026-08-20', 'fecha compra preservada');
    console.log('✅6 getExpenses(2026-09): tarjeta M-1 incluida con effective_date, tarjeta M excluida');

    // Mes anterior (ago): tarjeta sep no debe verse, tarjeta ago tampoco (pasa a sep)
    const augView = await getExpenses({ month: '2026-08' });
    const augIds = augView.map((e) => e.id);
    assert.ok(!augIds.includes(cardSep.id), 'tarjeta sep no en ago');
    assert.ok(!augIds.includes(cardAug.id), 'tarjeta ago sale de ago (va a sep)');
    console.log('✅7 getExpenses(2026-08): tarjetas reasignadas al mes de pago');

    // Stats: total de sep debe incluir efectivo sep + tarjeta ago, no tarjeta sep
    const stats = await getDashboardStats('2026-09');
    assert.ok(stats.totalSpentArs >= 15000, `total sep >= 15000 (got ${stats.totalSpentArs})`);
    console.log(`✅8 getDashboardStats(2026-09).totalSpentArs = ${stats.totalSpentArs}`);

    // Apagar día de pago → legacy
    await deleteSetting(CARD_PAYMENT_DAY_KEY);
    const legacySep = await getExpenses({ month: '2026-09' });
    const legacyIds = legacySep.map((e) => e.id);
    assert.ok(legacyIds.includes(cardSep.id), 'tarjeta sep visible sin día de pago');
    assert.ok(!legacyIds.includes(cardAug.id), 'tarjeta ago no en sep sin día de pago');
    assert.ok(legacySep.every((e) => !e.effective_date), 'sin effective_date en legacy');
    console.log('✅9 sin día de pago: comportamiento legacy');
  } finally {
    // Restaurar configuración previa
    if (savedDay !== null) {
      await setCardPaymentDay(savedDay);
    } else {
      await deleteSetting(CARD_PAYMENT_DAY_KEY);
    }
    for (const id of created) {
      await deleteExpense(id);
    }
    // Fallback: filas TEST PD residuales
    for (const m of ['2026-08', '2026-09']) {
      for (const e of await getExpenses({ month: m })) {
        if (e.description.startsWith('TEST PD')) await deleteExpense(e.id);
      }
    }
    console.log('🧹 Limpieza OK.');
  }
}

async function run() {
  testEffectiveCardDate();
  testApplyEffectiveDates();
  await testIntegration();
  console.log('\n🎉 Todos los tests de payment-day pasaron.');
}

run().catch((err) => {
  console.error('❌ Falló test de payment-day:', err);
  process.exit(1);
});
