# Gestão VV — Pedidos e Boletos (sem IA, pronto para hospedar grátis)

Sistema de controle de pedidos em aberto, baixas, boletos e relatórios PDF.
Lançamento de pedidos: várias fotos de uma vez; a **IA (Gemini) é opcional** e preenche marca, data e valor para você conferir; sem a chave, o lançamento é manual.
Os dados ficam no **Firestore** (Google); o servidor Node só guarda sessões assinadas — nada em disco.

## Usuários e senhas iniciais
Pedro, Daniel, Igor = `3220` · Ricardo, Wanderley = `1234`.
**Troque as senhas no primeiro acesso** (link "Alterar minha senha"). Só o Pedro pode restaurar a senha padrão de alguém.
Pedro, Daniel e Igor têm Gestão Total. Ricardo e Wanderley só veem os próprios pedidos/boletos e geram relatórios.

## Passo a passo

### 1. Criar o projeto Firebase (grátis)
1. https://console.firebase.google.com → **Adicionar projeto** (pode desligar o Analytics).
2. **Build → Firestore Database → Criar banco de dados** (modo produção, região `southamerica-east1`).
3. **Configurações do projeto → Contas de serviço → Gerar nova chave privada** → baixa um `.json`.
4. Converta o JSON em base64 (será a variável `FIREBASE_SERVICE_ACCOUNT_B64`):
   - Linux/Mac: `base64 -w0 chave.json`
   - Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("chave.json"))`
5. Em **Firestore → Regras**, cole o conteúdo de `firestore.rules` (bloqueia tudo; só o servidor acessa) e publique.

### 2. Publicar no Render (plano grátis)
1. Envie esta pasta para um repositório no GitHub (o `.env` e `node_modules` já estão no `.gitignore`).
2. https://render.com → **New → Blueprint** (ele lê o `render.yaml`) ou **New → Web Service** com:
   - Build: `npm ci --include=dev && npm run build`
   - Start: `npm start`
3. Em **Environment** defina `FIREBASE_SERVICE_ACCOUNT_B64` (passo 4 acima) e `SESSION_SECRET` (texto longo e aleatório; o blueprint gera sozinho).
4. Abra a URL do Render e entre. O plano grátis "dorme" após ~15 min sem uso e leva ~30 s para acordar; os dados não se perdem.

Alternativa: o `Dockerfile` funciona em Fly.io, Railway, Google Cloud Run etc. (mesmas variáveis).

### 2b. Ativar a leitura por IA (opcional)
1. Gere uma chave grátis em https://aistudio.google.com/apikey.
2. No Render → **Environment**, crie `GEMINI_API_KEY` com a chave e salve (o site reinicia).
3. Em **Lançar Pedidos** aparece "Ler com IA ao adicionar" e um botão **IA** em cada foto. A IA só preenche os campos; você confere e clica em **Lançar**.
A chave fica só no servidor. O plano grátis tem limite por minuto/dia: as fotos são lidas uma por vez, e se o limite estourar aparece um aviso e você preenche à mão.

### 3. Testar a conexão (opcional, no seu computador)
```
cp .env.example .env   # preencha FIREBASE_SERVICE_ACCOUNT_B64
npm install
npm run firestore:check
```

### 4. Trazer seus dados
Entre como Pedro → **Backup → Importar** → escolha o backup (completo ou "só em aberto"). Há uma prévia antes de gravar.
Fotos: os backups não levam fotos; use **Editar pedido → Inserir foto** ou **Adicionar foto** no cartão do pedido.

## Desenvolvimento local
```
npm install
npm run dev     # servidor em memória (nada é salvo) + site em http://localhost:5173
npm test        # testes da API
```

## Observações
- Fotos ficam no Firestore (≤300 KB cada) e são apagadas quando o pedido é baixado.
- Boletos: PDFs são enviados manualmente e apagados na baixa.
- Se a cota gratuita do Firestore acabar, aparece um aviso vermelho e nenhuma gravação é perdida em silêncio.
