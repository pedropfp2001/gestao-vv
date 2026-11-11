import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';
import { createApp } from './app';
import { FirestoreStore, MemoryStore, Store } from './store';

process.on('uncaughtException', (e) => console.error('[PROCESSO] Erro não tratado (servidor segue ativo):', e));
process.on('unhandledRejection', (e) => console.error('[PROCESSO] Promise rejeitada (servidor segue ativo):', e));

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';
let secret = process.env.SESSION_SECRET || '';
if (!secret) {
  if (isProd) console.error('[ATENÇÃO] SESSION_SECRET não definido: sessões serão invalidadas a cada reinício. Defina a variável.');
  secret = crypto.randomBytes(32).toString('hex');
}

async function main() {
  let store: Store;
  const useMemory = process.env.STORE === 'memory';
  if (useMemory) {
    console.warn('[STORE] Modo MEMÓRIA (apenas desenvolvimento): nada é salvo.');
    store = new MemoryStore();
  } else {
    store = await FirestoreStore.create();
  }
  const { app, state } = createApp(store, {
    sessionSecret: secret,
    secureCookies: isProd,
    staticDir: path.join(process.cwd(), 'dist'),
  });
  app.listen(PORT, '0.0.0.0', () => console.log(`[SERVER] Escutando na porta ${PORT}`));

  // Carrega do Firestore em segundo plano; se falhar, tenta de novo sem derrubar o servidor.
  const boot = async (attempt = 1): Promise<void> => {
    try {
      await state.load();
      console.log(`[SERVER] Dados carregados: ${state.orders.size} pedidos, ${state.boletos.size} boletos.`);
    } catch (e: any) {
      console.error(`[SERVER] Falha ao carregar dados (tentativa ${attempt}):`, e?.message || e);
      setTimeout(() => boot(attempt + 1), Math.min(60000, 5000 * attempt));
    }
  };
  void boot();
}

main().catch((e) => {
  console.error('[SERVER] Não foi possível iniciar:', e?.message || e);
  process.exit(1);
});
