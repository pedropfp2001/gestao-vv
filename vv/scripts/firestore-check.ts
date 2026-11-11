// Teste rápido de conexão com o Firestore real: npm run firestore:check
// Grava, lê e apaga um documento de teste (coleção "_check"). Não mexe nos seus pedidos.
import 'dotenv/config';
import { FirestoreStore } from '../server/store';

async function main() {
  const store = await FirestoreStore.create();
  const id = 'teste-' + Date.now();
  await store.set('_check', id, { ok: true, em: new Date().toISOString() });
  const lido = await store.get('_check', id);
  if (!lido?.ok) throw new Error('Gravou mas não conseguiu ler de volta.');
  await store.delete('_check', id);
  console.log('✔ Firestore OK: gravar, ler e apagar funcionaram.');
  process.exit(0);
}
main().catch((e) => { console.error('✖ Falhou:', e.message || e); process.exit(1); });
