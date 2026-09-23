import '../src/load-env';
import assert from 'node:assert/strict';

import {
  createExpense,
  getExpenses,
  getExpenseByPrefix,
  updateExpense,
  setExpenseDiscount,
  deleteExpense,
  deleteInstallmentGroup,
  getDashboardStats,
} from '../src/lib/expense-service';
import { isSupabaseConfigured } from '../src/lib/supabase';

function fmt(ars: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(ars);
}

async function expectThrow(fn: () => Promise<unknown>, pattern: RegExp, label: string) {
  try {
    await fn();
    assert.fail(`${label}: debió tirar error`);
  } catch (err) {
    if (err instanceof assert.AssertionError) throw err;
    assert.match(err instanceof Error ? err.message : String(err), pattern, label);
  }
}

async function cleanup(ids: { groupId?: string | null; expenseIds?: string[] }) {
  if (ids.groupId) {
    await deleteInstallmentGroup(ids.groupId);
  }
  for (const id of ids.expenseIds || []) {
    await deleteExpense(id);
  }
}

async function run() {
  if (!isSupabaseConfigured) {
    console.error('❌ Supabase no configurado');
    process.exit(1);
  }

  console.log('🧪 Probando features nuevas (descuentos, update, lookup)...\n');
  const cleanupTargets: { groupId?: string | null; expenseIds?: string[] } = { expenseIds: [] };

  try {
    // ---1. createExpense con descuento ---
    const [single] = await createExpense({
      amount: 8000,
      currency: 'ARS',
      description: 'TEST Jarra con descuento',
      category: 'Hogar',
      discount_amount: 2000,
      date: '2026-09-20',
      source: 'dashboard_manual',
    });
    cleanupTargets.expenseIds!.push(single.id);

    assert.equal(single.amount, 8000, 'amount final');
    assert.equal(single.discount_amount, 2000, 'discount_amount');
    assert.equal(single.discount_ars, 2000, 'discount_ars ARS');
    console.log('✅1 createExpense con descuento (fila única)');

    // ---2. descuento dividido entre cuotas ---
    const installments = await createExpense({
      amount: 60000,
      currency: 'ARS',
      description: 'TEST Cuotas con dto',
      category: 'Indumentaria',
      installments_total: 3,
      discount_amount: 3000,
      date: '2026-09-15',
      source: 'dashboard_manual',
    });
    cleanupTargets.groupId = installments[0].installment_group_id;
    assert.equal(installments.length, 3);
    assert.equal(installments[0].discount_amount, 1000, 'dto cuota1');
    assert.equal(installments[1].discount_amount, 1000, 'dto cuota2');
    assert.equal(installments[2].discount_amount, 1000, 'dto cuota3');
    const sumDto = installments.reduce((s, r) => s + r.discount_amount, 0);
    assert.equal(Math.round(sumDto * 100) / 100, 3000, 'suma de descuentos = total');
    console.log('✅2 descuento repartido entre cuotas');

    // ---3. getExpenseByPrefix con8 chars ---
    const shortId = single.id.slice(0, 8);
    const found = await getExpenseByPrefix(shortId);
    assert.ok(found, 'debe encontrar por prefijo corto');
    assert.equal(found!.id, single.id, 'mismo id');
    const foundFull = await getExpenseByPrefix(single.id);
    assert.equal(foundFull!.id, single.id, 'id completo también funciona');
    const notFound = await getExpenseByPrefix('zzzzzzzz');
    assert.equal(notFound, null, 'prefijo inexistente → null');
    console.log('✅3 getExpenseByPrefix (corto, completo, inexistente)');

    // ---4. updateExpense: monto, desc, cat, pago, fecha ---
    const u1 = await updateExpense(single.id, { amount: 9500 });
    assert.equal(u1.amount, 9500, 'monto actualizado');
    assert.equal(u1.amount_ars, 9500, 'amount_ars ARS');

    const u2 = await updateExpense(single.id, { description: 'TEST Jarra editada' });
    assert.equal(u2.description, 'TEST Jarra editada', 'desc actualizada');

    const u3 = await updateExpense(single.id, { category: 'Entretenimiento' });
    assert.equal(u3.category, 'Entretenimiento', 'cat actualizada');

    const u4 = await updateExpense(single.id, { payment_method: 'Mercado Pago' });
    assert.equal(u4.payment_method, 'Mercado Pago', 'pago actualizado');

    const u5 = await updateExpense(single.id, { date: '2026-09-21' });
    assert.equal(u5.date, '2026-09-21', 'fecha actualizada');
    console.log('✅4 updateExpense: monto/desc/cat/pago/fecha');

    // ---5. updateExpense rechazos ---
    await expectThrow(() => updateExpense(single.id, { amount: -1 }), /Monto inválido/, 'monto negativo');
    await expectThrow(() => updateExpense(single.id, { date: 'ayer' }), /Fecha inválida/, 'fecha garbage');
    await expectThrow(
      () => updateExpense(single.id, { category: 'NoExiste' }),
      /Categoría inválida/,
      'categoría inválida'
    );
    await expectThrow(
      () => updateExpense(single.id, { payment_method: 'Bitcoin' }),
      /Método de pago inválido/,
      'pago inválido'
    );

    const groupRowId = installments[1].id;
    await expectThrow(
      () => updateExpense(groupRowId, { amount: 100 }),
      /monto de un gasto en cuotas/,
      'monto en cuotas rechazado'
    );
    await expectThrow(
      () => updateExpense(groupRowId, { date: '2026-10-01' }),
      /fecha de un gasto en cuotas/,
      'fecha en cuotas rechazada'
    );
    console.log('✅5 updateExpense rechazos (validaciones + cuotas)');

    // ---6. updateExpense en grupo: desc/cat/pago aplican a todas las cuotas ---
    const g = await updateExpense(groupRowId, { category: 'Indumentaria', payment_method: 'Tarjeta Crédito', description: 'TEST Cuotas Renombrado' });
    assert.equal(g.description, 'TEST Cuotas Renombrado (Cuota 2/3)', 'desc grupo conserva sufijo cuota');
    const groupNow = await getExpenses({ month: '2026-09' });
    const groupRows = groupNow.filter((e) => e.installment_group_id === cleanupTargets.groupId);
    const octRows = await getExpenses({ month: '2026-10' });
    const octGroup = octRows.filter((e) => e.installment_group_id === cleanupTargets.groupId);
    const novRows = await getExpenses({ month: '2026-11' });
    const novGroup = novRows.filter((e) => e.installment_group_id === cleanupTargets.groupId);
    const allGroup = [...groupRows, ...octGroup, ...novGroup];
    assert.equal(allGroup.length, 3, 'sigue habiendo3 cuotas');
    for (const row of allGroup) {
      assert.match(row.description, /TEST Cuotas Renombrado \(Cuota \d\/3\)/, 'todas las cuotas renombradas');
      assert.equal(row.category, 'Indumentaria', 'cat grupo');
      assert.equal(row.payment_method, 'Tarjeta Crédito', 'pago grupo');
    }
    console.log('✅6 updateExpense en grupo: desc con sufijo + cat/pago a todas las cuotas');

    // ---7. setExpenseDiscount manual ---
    const d1 = await setExpenseDiscount(single.id, 1500);
    assert.equal(d1.discount_amount, 1500, 'dto manual');
    assert.equal(d1.discount_ars, 1500, 'dto ars manual');
    await expectThrow(() => setExpenseDiscount(single.id, -5), /Descuento inválido/, 'dto negativo');
    await expectThrow(
      () => setExpenseDiscount(groupRowId, 100),
      /descuento manual en un gasto en cuotas/,
      'dto manual en cuotas rechazado'
    );
    console.log('✅7 setExpenseDiscount (ok + rechazos)');

    // ---8. getDashboardStats.totalDiscountArs ---
    const stats = await getDashboardStats();
    assert.equal(typeof stats.totalDiscountArs, 'number', 'totalDiscountArs es number');
    assert.ok(stats.totalDiscountArs > 0, `debería sumar descuentos del mes (got ${stats.totalDiscountArs})`);
    console.log(`✅8 stats.totalDiscountArs = ${fmt(stats.totalDiscountArs)}`);

    // ---9. /gastos: los IDs de8 chars resuelven ---
    const monthExpenses = await getExpenses({ month: '2026-09' });
    const testOnes = monthExpenses.filter((e) => e.description.startsWith('TEST '));
    assert.ok(testOnes.length >= 2, 'hay gastos TEST en septiembre');
    for (const e of testOnes) {
      const resolved = await getExpenseByPrefix(e.id.slice(0, 8));
      assert.ok(resolved, `prefijo de ${e.description} debe resolver`);
      assert.equal(resolved!.id, e.id);
    }
    console.log('✅9 IDs cortos de /gastos resuelven todos los TEST');

    // ---10. deleteExpense puntual ---
    const [temp] = await createExpense({
      amount: 100,
      currency: 'ARS',
      description: 'TEST a borrar',
      category: 'Otros',
      date: '2026-09-22',
    });
    const delOk = await deleteExpense(temp.id);
    assert.equal(delOk, true, 'borrado puntual ok');
    const afterDel = await getExpenseByPrefix(temp.id.slice(0, 8));
    assert.equal(afterDel, null, 'ya no existe tras borrar');
    console.log('✅10 deleteExpense + lookup posterior null');

    console.log('\n🎉 Todas las pruebas de features pasaron.');
  } finally {
    console.log('\n🧹 Limpiando fixtures de prueba...');
    await cleanup(cleanupTargets);
    console.log('🧹 Limpieza OK.');
  }
}

run().catch((err) => {
  console.error('❌ Falló la verificación:', err);
  process.exit(1);
});
