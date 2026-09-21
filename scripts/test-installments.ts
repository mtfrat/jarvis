import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createExpense } from '../src/lib/expense-service';

async function runCheck() {
  console.log('🧪 Verificando lógica de cuotas y normalización...');

  // Test: 60000 ARS in 3 installments
  const records = await createExpense({
    amount: 60000,
    currency: 'ARS',
    description: 'Zapatillas Running',
    category: 'Indumentaria',
    payment_method: 'Tarjeta Crédito',
    installments_total: 3,
    date: '2026-09-15',
    source: 'dashboard_manual',
  });

  assert.equal(records.length, 3, 'Debe generar exactamente 3 cuotas');
  
  // Check installment 1
  assert.equal(records[0].amount, 20000, 'Cuota 1 debe ser de $20.000');
  assert.equal(records[0].installment_number, 1);
  assert.equal(records[0].installments_total, 3);
  assert.equal(records[0].date, '2026-09-15');
  assert.match(records[0].description, /Cuota 1\/3/);

  // Check installment 2
  assert.equal(records[1].amount, 20000, 'Cuota 2 debe ser de $20.000');
  assert.equal(records[1].installment_number, 2);
  assert.equal(records[1].date, '2026-10-15', 'Cuota 2 debe proyectarse al mes siguiente');
  assert.match(records[1].description, /Cuota 2\/3/);

  // Check installment 3
  assert.equal(records[2].amount, 20000, 'Cuota 3 debe ser de $20.000');
  assert.equal(records[2].installment_number, 3);
  assert.equal(records[2].date, '2026-11-15', 'Cuota 3 debe proyectarse a dos meses');
  assert.match(records[2].description, /Cuota 3\/3/);

  // Check shared installment_group_id
  assert.ok(records[0].installment_group_id, 'Debe tener installment_group_id');
  assert.equal(records[0].installment_group_id, records[1].installment_group_id);
  assert.equal(records[1].installment_group_id, records[2].installment_group_id);

  console.log('✅ Todas las aserciones de cuotas pasaron exitosamente.');
}

runCheck().catch((err) => {
  console.error('❌ Falló la verificación:', err);
  process.exit(1);
});
