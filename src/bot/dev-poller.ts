import dotenv from 'dotenv';
import path from 'path';

// Load .env.local first, then .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { bot } from './bot';

async function startDevBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN no está definido en .env.local');
    process.exit(1);
  }

  console.log('🤖 Iniciando Jarvis Bot en modo desarrollo (Long Polling)...');
  
  // Drop pending updates to avoid backlog
  await bot.init();
  console.log(`✅ Bot conectado como @${bot.botInfo.username}`);
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
