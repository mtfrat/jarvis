import '../src/load-env';
import { sent, installTelegramMock, commandEntities } from './mock-telegram-fetch';
import assert from 'node:assert/strict';
import { bot } from '../src/bot/bot';
import { createExpense, getExpenses, getExpenseByPrefix, deleteExpense, deleteInstallmentGroup } from '../src/lib/expense-service';
import { isSupabaseConfigured } from '../src/lib/supabase';
import type { Update } from 'grammy/types';

installTelegramMock(bot.api);

function lastText(): string {
  const msgs = sent.filter((s) => s.method === 'sendMessage');
  const last = msgs[msgs.length - 1];
  return String(last?.payload?.text ?? '');
}

function makeTextUpdate(text: string, updateId = 1): Update {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 123, type: 'private', first_name: 'Tester' },
      from: { id: Number((process.env.TELEGRAM_ALLOWED_USER_IDS || '0').split(',')[0].trim()), is_bot: false, first_name: 'Tester' },
      text,
      entities: commandEntities(text),
    },
  };
}

function makeCallbackUpdate(data: string, messageId: number, updateId = 100): Update {
  const userId = Number((process.env.TELEGRAM_ALLOWED_USER_IDS || '0').split(',')[0].trim());
  return {
    update_id: updateId,
    callback_query: {
      id: String(updateId),
      from: { id: userId, is_bot: false, first_name: 'Tester' },
      chat_instance: 'ci',
      data,
      message: {
        message_id: messageId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 123, type: 'private', first_name: 'Tester' },
        from: { id: 0, is_bot: true, first_name: 'Jarvis' },
        text: 'confirm',
      },
    },
  };
}

async function handle(update: Update): Promise<void> {
  await bot.handleUpdate(update);
}

async function run() {
  await bot.init();
  if (!isSupabaseConfigured) {
    console.error('❌ Supabase no configurado');
    process.exit(1);
  }

  console.log('🧪 Probando handlers del bot con updates simulados...\n');
  let groupId: string | null = null;
  const expenseIds: string[] = [];

  try {
    // 1. /start shows new help commands
    await handle(makeTextUpdate('/start', 1));
    const startMsg = lastText();
    for (const cmd of ['/gastos', '/editar', '/borrar', '/descuento', '/dashboard']) {
      assert.ok(startMsg.includes(cmd), `/start debe mencionar ${cmd}`);
    }
    console.log('✅1 /start lista los comandos nuevos');

    // 2. /dashboard sends URL button
    sent.length = 0;
    await handle(makeTextUpdate('/dashboard', 2));
    const dash = sent.find((s) => s.method === 'sendMessage');
    assert.ok(dash, 'sendMessage para /dashboard');
    const kb = dash!.payload.reply_markup as any;
    assert.ok(Array.isArray(kb?.inline_keyboard?.[0]), 'inline_keyboard presente');
    const btn = kb.inline_keyboard[0][0];
    assert.ok(String(btn.url || '').includes('jarvis'), `URL del botón: ${btn.url}`);
    assert.ok(String(btn.text || '').includes('Jarvis Finance'), 'texto del botón');
    console.log(`✅2 /dashboard → botón "${btn.text}" → ${btn.url}`);

    // 3. Seed expense + /gastos lists short id
    const [seed] = await createExpense({
      amount: 4321,
      currency: 'ARS',
      description: 'TEST BOT gasto',
      category: 'Salidas y Comida',
      date: '2026-09-20',
      source: 'dashboard_manual',
    });
    expenseIds.push(seed.id);
    const shortId = seed.id.slice(0, 8);

    sent.length = 0;
    await handle(makeTextUpdate('/gastos', 3));
    const gastosMsg = lastText();
    assert.ok(gastosMsg.includes(shortId), `/gastos debe mostrar id ${shortId}`);
    assert.ok(gastosMsg.includes('TEST BOT gasto'), '/gastos muestra descripción');
    assert.ok(gastosMsg.includes('/editar'), 'pie con ayuda');
    console.log(`✅3 /gastos lista id corto ${shortId}`);

    // 4. /editar monto
    sent.length = 0;
    await handle(makeTextUpdate(`/editar ${shortId} monto 5000`, 4));
    const editMsg = lastText();
    assert.match(editMsg, /Actualizado/, `reply edición: ${editMsg}`);
    const afterEdit = await getExpenseByPrefix(shortId);
    assert.equal(afterEdit!.amount, 5000, 'monto persistido');
    assert.equal(afterEdit!.amount_ars, 5000, 'amount_ars persistido');
    console.log('✅4 /editar monto 4321 → 5000');

    // 5. /editar monto con formato argentino "5.500,50"
    sent.length = 0;
    await handle(makeTextUpdate(`/editar ${shortId} monto 5.500,50`, 5));
    const afterFmt = await getExpenseByPrefix(shortId);
    assert.equal(afterFmt!.amount, 5500.5, `monto con formato AR, got ${afterFmt!.amount}`);
    console.log('✅5 /editar acepta formato "5.500,50"');

    // 6. /editar usage + campo inválido
    sent.length = 0;
    await handle(makeTextUpdate('/editar', 6));
    assert.match(lastText(), /Uso:.*editar/s, 'mensaje de uso');
    sent.length = 0;
    await handle(makeTextUpdate(`/editar ${shortId} otracosa 1`, 7));
    assert.match(lastText(), /Campo inválido/, 'campo inválido');
    console.log('✅6 /editar usage y campo inválido');

    // 7. /editar sobre cuotas: monto rechazado
    const inst = await createExpense({
      amount: 30000,
      currency: 'ARS',
      description: 'TEST BOT cuotas',
      category: 'Indumentaria',
      installments_total: 3,
      date: '2026-09-15',
    });
    groupId = inst[0].installment_group_id;
    const instShort = inst[1].id.slice(0, 8);
    sent.length = 0;
    await handle(makeTextUpdate(`/editar ${instShort} monto 100`, 8));
    assert.match(lastText(), /cuotas/, 'debe rechazar monto en cuotas');
    // /editar cat en cuotas sí funciona
    sent.length = 0;
    await handle(makeTextUpdate(`/editar ${instShort} cat Entretenimiento`, 9));
    assert.match(lastText(), /Actualizado/, 'cat en cuotas ok');
    console.log('✅7 /editar en cuotas: monto rechazado, cat aplicado');

    // 8. /descuento
    sent.length = 0;
    await handle(makeTextUpdate(`/descuento ${shortId} 1.500`, 10));
    assert.match(lastText(), /Descuento registrado/, 'reply descuento');
    const withDto = await getExpenseByPrefix(shortId);
    assert.equal(withDto!.discount_amount, 1500, 'discount_amount');
    // /descuento en cuotas rechazado
    sent.length = 0;
    await handle(makeTextUpdate(`/descuento ${instShort} 100`, 11));
    assert.match(lastText(), /cuotas/, 'dto en cuotas rechazado');
    console.log('✅8 /descuento manual OK; en cuotas rechazado');

    // 9. /borrar → confirmación inline → callback sí
    sent.length = 0;
    await handle(makeTextUpdate(`/borrar ${shortId}`, 12));
    const confMsg = lastText();
    assert.match(confMsg, /¿Borrar/, 'pregunta de confirmación');
    const conf = sent.find((s) => s.method === 'sendMessage');
    const confKb = conf!.payload.reply_markup as any;
    const yesBtn = confKb.inline_keyboard[0][0];
    assert.equal(yesBtn.callback_data, `del:${seed.id}`, 'callback_data del sí');
    assert.equal(confKb.inline_keyboard[1][0].callback_data, 'delno', 'callback del no');

    // message_id no viene en el payload de sendMessage (es de la respuesta); usamos ids fijos
    sent.length = 0;
    await handle(makeCallbackUpdate(yesBtn.callback_data, 9001, 200));
    const edits = sent.filter((s) => s.method === 'editMessageText');
    assert.ok(edits.some((e) => String(e.payload.text).includes('Borrado')), 'edit "Borrado."');
    const gone = await getExpenseByPrefix(shortId);
    assert.equal(gone, null, 'gasto borrado de la BD');
    console.log('✅9 /borrar + callback sí → borrado real');

    // 10. /borrar no → cancelado
    const [temp] = await createExpense({
      amount: 100,
      currency: 'ARS',
      description: 'TEST BOT cancel delete',
      category: 'Otros',
      date: '2026-09-22',
    });
    sent.length = 0;
    await handle(makeTextUpdate(`/borrar ${temp.id.slice(0, 8)}`, 13));
    const conf2 = sent.find((s) => s.method === 'sendMessage');
    const noBtn = (conf2!.payload.reply_markup as any).inline_keyboard[1][0];
    sent.length = 0;
    await handle(makeCallbackUpdate(noBtn.callback_data, 9002, 201));
    assert.ok(sent.some((s) => String((s.payload as any).text).includes('No borré')), 'cancel message');
    const still = await getExpenseByPrefix(temp.id.slice(0, 8));
    assert.ok(still, 'sigue existiendo tras cancelar');
    await deleteExpense(temp.id);
    console.log('✅10 /borrar + callback no → cancelado, gasto intacto');

    // 11. /borrar grupo → borra todas las cuotas
    sent.length = 0;
    const instShort2 = inst[0].id.slice(0, 8);
    await handle(makeTextUpdate(`/borrar ${instShort2}`, 14));
    const conf3 = sent.find((s) => s.method === 'sendMessage');
    assert.match(String(conf3!.payload.text), /TODAS sus cuotas/, 'aviso de grupo');
    const yes3 = (conf3!.payload.reply_markup as any).inline_keyboard[0][0];
    sent.length = 0;
    await handle(makeCallbackUpdate(yes3.callback_data, 9003, 202));
    const months = ['2026-09', '2026-10', '2026-11'];
    for (const m of months) {
      const rows = (await getExpenses({ month: m })).filter((e) => e.installment_group_id === groupId);
      assert.equal(rows.length, 0, `sin cuotas en ${m}`);
    }
    groupId = null;
    console.log('✅11 /borrar en grupo elimina las 3 cuotas');

    // 12. /gastos con meses sin gastos TEST — smoke
    sent.length = 0;
    await handle(makeTextUpdate('/gastos', 15));
    assert.ok(lastText().length > 0, '/gastos responde');
    console.log('✅12 /gastos responde siempre');

    // 13. /descuento sin args → usage
    sent.length = 0;
    await handle(makeTextUpdate('/descuento', 16));
    assert.match(lastText(), /Uso:.*descuento/s, 'usage descuento');
    console.log('✅13 /descuento usage');

    // 14. Whitelist: unknown user rejected
    sent.length = 0;
    const rogue: Update = {
      update_id: 999,
      message: {
        message_id: 999,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 999, type: 'private', first_name: 'Rogue' },
        from: { id: 987654321, is_bot: false, first_name: 'Rogue' },
        text: '/start',
        entities: commandEntities('/start'),
      },
    };
    await handle(rogue);
    assert.match(lastText(), /no autorizado/, 'whitelist rechaza');
    console.log('✅14 whitelist sigue activa en comandos nuevos');

    console.log('\n🎉 Todos los tests de bot pasaron.');
  } finally {
    console.log('\n🧹 Limpiando fixtures...');
    if (groupId) await deleteInstallmentGroup(groupId);
    for (const id of expenseIds) await deleteExpense(id);
    // remaining TEST BOT rows
    const sept = await getExpenses({ month: '2026-09' });
    for (const e of sept.filter((x) => x.description.startsWith('TEST BOT'))) {
      if (e.installment_group_id) await deleteInstallmentGroup(e.installment_group_id);
      else await deleteExpense(e.id);
    }
    console.log('🧹 OK.');
  }
}

run().catch((err) => {
  console.error('❌ Falló test de bot:', err);
  process.exit(1);
});
