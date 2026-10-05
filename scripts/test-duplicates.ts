import '../src/load-env';
import assert from 'node:assert/strict';
import { subDays, addDays, format } from 'date-fns';

import {
  findDuplicateCandidates,
  createExpense,
  deleteExpense,
} from '../src/lib/expense-service';
import { isSupabaseConfigured } from '../src/lib/supabase';
import { POST as postExpenseRoute } from '../src/app/api/expenses/route';

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/expenses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-dashboard-secret': process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? '',
    },
    body: JSON.stringify(body),
  });
}

const created: string[] = [];

async function testFindDuplicates() {
  console.log('🧪 Probando findDuplicateCandidates...');

  const base = await createExpense({
    amount: 54321.07,
    currency: 'ARS',
    description: 'TEST DUP base',
    category: 'Otros',
    date: format(new Date(), 'yyyy-MM-dd'),
    source: 'dashboard_manual',
  });
  created.push(...base.map((e) => e.id));

  // Mismo monto + moneda, ventana OK → lo encuentra
  const hits = await findDuplicateCandidates(54321.07, 'ARS');
  assert.ok(
    hits.some((e) => e.id === base[0].id),
    'encuentra el gasto reciente'
  );
  console.log('✅1 mismo monto + moneda dentro de la ventana');

  // Moneda distinta → no matchea
  const usdHits = await findDuplicateCandidates(54321.07, 'USD');
  assert.ok(
    usdHits.every((e) => e.id !== base[0].id),
    'moneda distinta no matchea'
  );
  console.log('✅2 moneda distinta → sin match');

  // Monto distinto (un centavo) → no matchea
  const otherHits = await findDuplicateCandidates(54321.08, 'ARS');
  assert.ok(
    otherHits.every((e) => e.id !== base[0].id),
    'monto distinto no matchea'
  );
  console.log('✅3 monto distinto → sin match');

  // Redondeo a 2 decimales: 54321.070001 → matchea 54321.07
  const rounded = await findDuplicateCandidates(54321.070001, 'ARS');
  assert.ok(
    rounded.some((e) => e.id === base[0].id),
    'redondeo a centavos'
  );
  console.log('✅4 redondeo a 2 decimales');

  // Ventana: gasto de hace 45 días queda fuera por defecto...
  const pastDate = subDays(new Date(), 45);
  const past = await createExpense({
    amount: 99887.76,
    currency: 'ARS',
    description: 'TEST DUP viejo',
    category: 'Otros',
    date: format(pastDate, 'yyyy-MM-dd'),
    source: 'dashboard_manual',
  });
  created.push(...past.map((e) => e.id));

  const defaultHits = await findDuplicateCandidates(99887.76, 'ARS');
  assert.ok(
    defaultHits.every((e) => e.id !== past[0].id),
    'hace 45 días queda fuera de la ventana'
  );
  console.log('✅5 gasto de hace 45 días → fuera de la ventana');

  // ...pero entra si "hoy" está a 10 días de ese gasto
  const nearHits = await findDuplicateCandidates(
    99887.76,
    'ARS',
    addDays(pastDate, 10)
  );
  assert.ok(
    nearHits.some((e) => e.id === past[0].id),
    'a 10 días del gasto sí matchea'
  );
  console.log('✅6 dentro de la ventana (now = fecha+10d)');

  // Y queda fuera si "hoy" está a 40 días (ventana de 30)
  const farHits = await findDuplicateCandidates(
    99887.76,
    'ARS',
    addDays(pastDate, 40)
  );
  assert.ok(
    farHits.every((e) => e.id !== past[0].id),
    'a 40 días queda fuera'
  );
  console.log('✅7 fuera con now = fecha+40d (ventana 30d)');
}

async function testRoute409() {
  console.log('\n🧪 Probando POST /api/expenses (409 + force)...');

  const base = await createExpense({
    amount: 87654.32,
    currency: 'ARS',
    description: 'TEST DUP ruta base',
    category: 'Otros',
    date: format(new Date(), 'yyyy-MM-dd'),
    source: 'dashboard_manual',
  });
  created.push(...base.map((e) => e.id));

  // Sin force + monto duplicado → 409 con lista
  const dupRes = await postExpenseRoute(
    makeRequest({
      amount: 87654.32,
      currency: 'ARS',
      description: 'TEST DUP ruta nuevo',
      category: 'Otros',
      date: format(new Date(), 'yyyy-MM-dd'),
    })
  );
  assert.equal(dupRes.status, 409, '409 ante duplicado');
  const dupBody = await dupRes.json();
  assert.equal(dupBody.error, 'possible_duplicate');
  assert.ok(Array.isArray(dupBody.duplicates), 'viene la lista');
  assert.ok(
    dupBody.duplicates.some((d: { id: string }) => d.id === base[0].id),
    'la lista incluye el gasto existente'
  );
  console.log('✅8 409 + duplicates[]');

  // Con force → 201
  const forceRes = await postExpenseRoute(
    makeRequest({
      amount: 87654.32,
      currency: 'ARS',
      description: 'TEST DUP ruta forzado',
      category: 'Otros',
      date: format(new Date(), 'yyyy-MM-dd'),
      force: true,
    })
  );
  assert.equal(forceRes.status, 201, 'force carga igual');
  const forced = await forceRes.json();
  // createExpense devuelve un array de filas (cuotas)
  created.push(...(Array.isArray(forced) ? forced.map((e: { id: string }) => e.id) : [forced.id]));
  console.log('✅9 force:true → 201');

  // Sin duplicado → 201 directo
  const freshRes = await postExpenseRoute(
    makeRequest({
      amount: 87654.33,
      currency: 'ARS',
      description: 'TEST DUP ruta sin dup',
      category: 'Otros',
      date: format(new Date(), 'yyyy-MM-dd'),
    })
  );
  assert.equal(freshRes.status, 201, 'sin duplicado pasa derecho');
  const fresh = await freshRes.json();
  created.push(...(Array.isArray(fresh) ? fresh.map((e: { id: string }) => e.id) : [fresh.id]));
  console.log('✅10 monto sin duplicado → 201 directo');
}

async function run() {
  if (!isSupabaseConfigured) {
    console.log('⏭️ Supabase no configurado — tests omitidos.');
    return;
  }

  try {
    await testFindDuplicates();
    await testRoute409();
    console.log('\n🎉 Todos los tests de duplicados pasaron.');
  } finally {
    for (const id of created) {
      if (id) await deleteExpense(id);
    }
    // Sweep de seguridad: filas TEST DUP residuales
    const now = new Date();
    const months = [
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      '2026-09',
      '2026-10',
    ];
    const { getExpenses } = await import('../src/lib/expense-service');
    for (const m of months) {
      for (const e of await getExpenses({ month: m })) {
        if (e.description.startsWith('TEST DUP')) await deleteExpense(e.id);
      }
    }
    console.log('🧹 Limpieza OK.');
  }
}

run().catch((err) => {
  console.error('❌ Falló test de duplicados:', err);
  process.exit(1);
});
