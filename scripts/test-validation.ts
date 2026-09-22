import '../src/load-env';
import assert from 'node:assert/strict';

import { createExpense } from '../src/lib/expense-service';
import { supabaseAdmin, isSupabaseConfigured } from '../src/lib/supabase';
import { Expense } from '../src/lib/types';

async function expectThrow(fn: () => Promise<unknown>, pattern: RegExp, label: string) {
  try {
    await fn();
    assert.fail(`${label}: debió tirar error`);
  } catch (err) {
    if (err instanceof assert.AssertionError) throw err;
    assert.match(err instanceof Error ? err.message : String(err), pattern, label);
  }
}

async function runCheck() {
  console.log('🧪 Verificando validación de createExpense...');

  const base = { currency: 'ARS' as const, description: 'Test validación', category: 'Otros' };

  await expectThrow(() => createExpense({ ...base, amount: 0 }), /Invalid amount/, 'amount=0');
  await expectThrow(() => createExpense({ ...base, amount: -5 }), /Invalid amount/, 'amount negativo');
  await expectThrow(() => createExpense({ ...base, amount: NaN }), /Invalid amount/, 'amount=NaN');
  await expectThrow(
    () => createExpense({ ...base, amount: 100, currency: 'EUR' as 'ARS' }),
    /Invalid currency/,
    'moneda fuera de enum'
  );
  await expectThrow(
    () => createExpense({ ...base, amount: 100, description: '   ' }),
    /Missing description/,
    'descripción vacía'
  );
  await expectThrow(
    () => createExpense({ ...base, amount: 100, date: 'no-es-fecha' }),
    /Invalid date/,
    'fecha garbage'
  );
  await expectThrow(
    () => createExpense({ ...base, amount: 100, date: '2026-99-99' }),
    /Invalid date/,
    'fecha imposible'
  );

  console.log('✅ Casos de rechazo pasaron (sin tocar la BD).');

  if (!isSupabaseConfigured) {
    console.log('⏭️ Supabase no configurado — test de clamp de cuotas omitido.');
    return;
  }

  // Clamp: installments_total=500 must insert exactly 60 rows (and clean up)
  let groupId: string | null = null;
  try {
    const records: Expense[] = await createExpense({
      ...base,
      amount: 6000,
      installments_total: 500,
      date: '2026-09-15',
    });
    groupId = records[0]?.installment_group_id ?? null;
    assert.equal(records.length, 60, 'installments_total=500 debe clamparse a60 cuotas');
    assert.equal(records[59].installment_number, 60, 'última cuota numerada60');
    assert.equal(records[0].installments_total, 60, 'installments_total persistido debe ser60');
    console.log('✅ Clamp de cuotas (máx60) verificado.');
  } finally {
    if (groupId) {
      const { error } = await supabaseAdmin
        .from('expenses')
        .delete()
        .eq('installment_group_id', groupId);
      if (error) console.warn('🧹 No se pudo limpiar el registro de prueba:', error.message);
      else console.log('🧹 Registro de prueba eliminado de la BD.');
    }
  }
}

runCheck().catch((err) => {
  console.error('❌ Falló la verificación:', err);
  process.exit(1);
});
