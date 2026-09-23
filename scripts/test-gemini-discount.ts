import '../src/load-env';
import assert from 'node:assert/strict';
import { parseExpenseFromText } from '../src/lib/gemini';

async function run() {
  console.log('🧪 Probando Gemini: detección de descuentos...\n');

  const cases = [
    {
      label: 'descuento explícito en texto',
      input: 'Remeras de moda: precio lista 15000, cupón de 3000, pagué 12000 en efectivo',
      expectDiscount: true,
    },
    {
      label: 'sin descuento',
      input: 'Café con leche 2500 pesos en efectivo',
      expectDiscount: false,
    },
    {
      label: 'oferta "2x1" / promo',
      input: 'Librería: libreta con 20% de descuento, precio original 10000, pagué 8000 por transferencia',
      expectDiscount: true,
    },
  ];

  for (const c of cases) {
    const parsed = await parseExpenseFromText(c.input);
    console.log(`\n— ${c.label}`);
    console.log(`  input: ${c.input}`);
    console.log(`  amount=${parsed.amount} currency=${parsed.currency} desc="${parsed.description}"`);
    console.log(`  original_amount=${parsed.original_amount ?? '(omitido)'}`);

    assert.ok(Number.isFinite(parsed.amount) && parsed.amount > 0, `${c.label}: amount válido`);
    assert.ok(parsed.description?.trim(), `${c.label}: description presente`);

    if (c.expectDiscount) {
      assert.ok(
        typeof parsed.original_amount === 'number' && parsed.original_amount > parsed.amount,
        `${c.label}: esperaba original_amount > amount, got ${parsed.original_amount}`
      );
      const discount = Math.round((parsed.original_amount! - parsed.amount) * 100) / 100;
      console.log(`  ✅ descuento calculado = ${discount}`);
    } else {
      const noDiscount =
        parsed.original_amount === undefined ||
        parsed.original_amount === null ||
        !(parsed.original_amount > parsed.amount);
      assert.ok(noDiscount, `${c.label}: no debía haber descuento, original=${parsed.original_amount}`);
      console.log('  ✅ sin descuento (correcto)');
    }
  }

  console.log('\n🎉 Gemini: reglas de descuento OK.');
}

run().catch((err) => {
  console.error('❌ Falló el test de Gemini:', err);
  process.exit(1);
});
