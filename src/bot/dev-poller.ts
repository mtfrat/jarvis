import '../load-env';
import { bot, syncBotCommands } from './bot';

async function startDevBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN no está definido en .env.local');
    process.exit(1);
  }

  console.log('🤖 Iniciando Jarvis Bot en modo desarrollo (Long Polling)...');
  
  // Drop pending updates to avoid backlog
  await bot.init();
  console.log(`✅ Bot conectado como @${bot.botInfo.username}`);

  try {
    await syncBotCommands();
    console.log('✅ Comandos registrados (se ven al escribir "/" en el chat)');
  } catch (err) {
    console.warn('⚠️ No pude registrar los comandos:', err instanceof Error ? err.message : err);
  }

  console.log('📡 Escuchando mensajes de texto, audios y fotos de tickets...');

  bot.start({
    drop_pending_updates: true,
    onStart: (info) => {
      console.log(`🚀 Poller activo para @${info.username}. ¡Podés escribirle en Telegram!`);
    },
  });
}

startDevBot().catch((err) => {
  console.error('❌ Error al iniciar el bot:', err);
});
