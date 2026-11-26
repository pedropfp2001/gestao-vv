// Leitura opcional de pedidos por IA (Gemini). Só roda no servidor; a chave nunca vai para o navegador.
// Sem GEMINI_API_KEY o sistema continua funcionando 100% no modo manual.
import { VALID_SELLERS } from './helpers';

export interface Extracted { marca: string; data: string; valor: number; vendedor?: string }
export type Extractor = (imageDataUrl: string, knownBrands: string[]) => Promise<Extracted>;

export interface ItemPedido { codigo?: string; mercadoria: string; un?: string; quantidade: number; preco: number; total: number }
export interface ExtractedItems { bilhete?: string; vencimento?: string; itens: ItemPedido[] }
/** De onde veio a chamada à IA (para o gráfico de uso). */
export type OrigemIA = 'lancamento' | 'ao_lancar' | 'preleitura' | 'relatorio';
export type ItemsExtractor = (imageDataUrl: string, origem?: OrigemIA) => Promise<ExtractedItems>;
/** Cada resposta do Gemini (boa ou ruim) é avisada aqui: serve só para medir o uso. status 0 = sem resposta (rede/tempo). */
export interface UsoIA { origem: OrigemIA; model: string; status: number; tokensIn: number; tokensOut: number }
export type UsoSink = (u: UsoIA) => void;

export class ExtractError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

const DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest'];

const systemText = (brands: string[]) => `Você é um OCR de altíssima precisão especializado em ler comprovantes de venda e talões de pedido.
PRIORIDADE MÁXIMA: identificar o CLIENTE / MARCA.

Exemplo típico:
MARCA:VV - VANDINHO
CLIENTE:A VISTA
EMISSAO:04/08/26
VENDEDOR:0000003 - RICARDO
VALOR TOTAL. . . : 5.730,00

Regras:
1. "marca": só o nome do cliente/marca (após "VV -" ou no campo MARCA/CLIENTE). Nunca inclua "MARCA:", "CLIENTE:" ou "VV -". Marcas conhecidas: ${brands.slice(0, 60).join(', ') || 'BSM, VANDINHO'}.
2. "data": data de emissão em YYYY-MM-DD. Sem ano, use o ano corrente.
3. "valor": valor total como número (5.730,00 -> 5730.00).
4. "vendedor": Pedro, Daniel, Igor, Ricardo ou Wanderley, se aparecer; senão vazio.`;

/** Chama o Gemini com imagem, tentando cada modelo da lista e devolvendo o JSON validado por `parse`. */
function makeGeminiCaller(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch, keyVars: string[] = ['GEMINI_API_KEY'], sink?: UsoSink) {
  const key = keyVars.map((k) => env[k]).find(Boolean);
  if (!key) return null;
  const models = (env.GEMINI_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = models.length ? models : DEFAULT_MODELS;

  return async function call<T>(
    imageDataUrl: string, system: string, userText: string, schema: any, parse: (p: any) => T | null, origem: OrigemIA = 'lancamento'
  ): Promise<T> {
    const medir = (model: string, status: number, j?: any) => {
      try { sink?.({ origem, model, status, tokensIn: Number(j?.usageMetadata?.promptTokenCount) || 0, tokensOut: (Number(j?.usageMetadata?.candidatesTokenCount) || 0) + (Number(j?.usageMetadata?.thoughtsTokenCount) || 0) }); } catch { /* medir nunca atrapalha a leitura */ }
    };
    const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(imageDataUrl);
    if (!m) throw new ExtractError('Imagem inválida.', 400);
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ inlineData: { mimeType: m[1], data: m[2] } }, { text: userText }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
    };
    // 2.5: desliga o "raciocínio" extra (só atrasa a leitura de um papel); outros modelos ficam como estão
    const bodyFor = (model: string) => /gemini-2\.5/.test(model)
      ? { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: { thinkingBudget: 0 } } }
      : body;
    let lastStatus = 502; let lastMsg = 'A IA não respondeu.';
    for (const model of list) {
      try {
        const doCall = () => fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(bodyFor(model)),
          signal: AbortSignal.timeout(40_000),
        });
        let r = await doCall();
        if (r.status === 503) { medir(model, 503); await new Promise((x) => setTimeout(x, env.NODE_ENV === 'test' ? 0 : 2000)); r = await doCall(); } // sobrecarga temporária: tenta de novo
        if (!r.ok) {
          medir(model, r.status);
          const detail = (await r.text().catch(() => '')).slice(0, 300);
          console.error(`[IA] modelo ${model} respondeu ${r.status}: ${detail}`);
          lastStatus = r.status === 429 ? 429 : 502;
          lastMsg = r.status === 503
            ? 'A IA do Google está sobrecarregada agora. Tente de novo em instantes ou preencha manualmente.'
            : r.status === 429
            ? 'Limite de uso da IA atingido. Aguarde um pouco ou preencha manualmente.'
            : r.status === 400 || r.status === 403
              ? `A IA recusou a chave ou o pedido (erro ${r.status}). Confira a GEMINI_API_KEY no Render.`
              : r.status === 404
                ? `Modelo ${model} indisponível (erro 404).`
                : `A IA recusou a leitura (erro ${r.status}).`;
          continue; // tenta o próximo modelo
        }
        const j: any = await r.json();
        medir(model, 200, j);
        const text = j?.candidates?.[0]?.content?.parts?.map((x: any) => x?.text || '').join('') || '';
        if (!text) {
          console.error(`[IA] modelo ${model} sem texto na resposta:`, JSON.stringify(j).slice(0, 300));
          lastMsg = `A IA não devolveu texto (${j?.promptFeedback?.blockReason || j?.candidates?.[0]?.finishReason || 'sem motivo'}).`;
          continue;
        }
        const parsed = parse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')));
        if (parsed === null) { lastMsg = 'A IA não conseguiu ler todos os campos.'; continue; }
        return parsed;
      } catch (e: any) {
        console.error(`[IA] modelo ${model} falhou:`, e?.name, e?.message, e?.cause?.message || '');
        lastMsg = e?.name === 'TimeoutError'
          ? 'A IA do Google demorou demais para responder. Tente de novo em instantes ou preencha manualmente.'
          : `Falha ao falar com a IA (${String(e?.cause?.code || e?.name || 'erro')}: ${String(e?.message || '').slice(0, 80)}).`;
        lastStatus = 502;
        medir(model, 0);
      }
    }
    throw new ExtractError(lastMsg, lastStatus);
  };
}

export function makeGeminiExtractor(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch, sink?: UsoSink): Extractor | null {
  const call = makeGeminiCaller(env, fetchImpl, ['GEMINI_API_KEY'], sink);
  if (!call) return null;
  const schema = {
    type: 'OBJECT',
    properties: { marca: { type: 'STRING' }, data: { type: 'STRING' }, valor: { type: 'NUMBER' }, vendedor: { type: 'STRING' } },
    required: ['marca', 'data', 'valor'],
  };
  return (imageDataUrl, brands) => call<Extracted>(
    imageDataUrl, systemText(brands), 'Extraia marca, data (YYYY-MM-DD), valor e vendedor deste pedido.', schema,
    (p) => {
      const valor = Number(p.valor);
      if (!p.marca || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.data)) || !isFinite(valor)) return null;
      const vend = (VALID_SELLERS as readonly string[]).find((s) => s.toLowerCase() === String(p.vendedor || '').trim().toLowerCase());
      return { marca: String(p.marca), data: String(p.data), valor, vendedor: vend };
    }
  );
}

const itemsSystem = `Você é um OCR de altíssima precisão para extratos/talões de pedido de uma distribuidora de frutas.
Leia a TABELA DE ITENS do papel. Cada linha tem: código, mercadoria (produto), unidade (ex.: CX), quantidade, preço unitário e total.
Exemplo de linha: "0000001  LARANJA PERA  CX  20,00  35,00  700,00".

Regras:
1. Devolva todas as linhas de itens, na ordem do papel. Não invente nem some linhas; se uma linha estiver ilegível, ignore-a.
2. "codigo": o código do produto como impresso (mantenha zeros à esquerda). "mercadoria": nome do produto em maiúsculas. "un": unidade (CX, KG, UN...). Se não houver, deixe vazio.
3. "quantidade", "preco" e "total": números (35,00 -> 35.00; 1.060,00 -> 1060.00). Se "total" não estiver impresso, use quantidade x preço.
4. "bilhete": o número do bilhete/pedido impresso no papel (ex.: 930957A), só se estiver visível; senão vazio.
5. "vencimento": a data de vencimento impressa (YYYY-MM-DD), só se estiver visível; senão vazio. Nunca deduza.`;

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

export function makeGeminiItemsExtractor(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch, sink?: UsoSink): ItemsExtractor | null {
  const call = makeGeminiCaller(env, fetchImpl, ['GEMINI_ITEMS_API_KEY', 'GEMINI_API_KEY'], sink); // chave própria para os itens (relatórios/pré-leitura); se não houver, usa a principal
  if (!call) return null;
  const schema = {
    type: 'OBJECT',
    properties: {
      bilhete: { type: 'STRING' }, vencimento: { type: 'STRING' },
      itens: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { codigo: { type: 'STRING' }, mercadoria: { type: 'STRING' }, un: { type: 'STRING' }, quantidade: { type: 'NUMBER' }, preco: { type: 'NUMBER' }, total: { type: 'NUMBER' } },
          required: ['mercadoria', 'quantidade', 'preco'],
        },
      },
    },
    required: ['itens'],
  };
  return (imageDataUrl, origem = 'relatorio') => call<ExtractedItems>(
    imageDataUrl, itemsSystem, 'Extraia os itens (código, mercadoria, un, quantidade, preço, total) deste pedido.', schema,
    (p) => {
      const itens: ItemPedido[] = (Array.isArray(p?.itens) ? p.itens : [])
        .map((i: any) => {
          const quantidade = num(i.quantidade); const preco = num(i.preco);
          const total = Number.isFinite(num(i.total)) ? num(i.total) : Math.round(quantidade * preco * 100) / 100;
          return { codigo: String(i.codigo ?? '').trim() || undefined, mercadoria: String(i.mercadoria ?? '').trim().toUpperCase(), un: String(i.un ?? '').trim().toUpperCase() || undefined, quantidade, preco, total };
        })
        .filter((i: ItemPedido) => i.mercadoria && Number.isFinite(i.quantidade) && Number.isFinite(i.preco) && Number.isFinite(i.total));
      if (!itens.length) return null;
      const venc = String(p.vencimento || '').trim();
      return { itens, bilhete: String(p.bilhete || '').trim() || undefined, vencimento: /^\d{4}-\d{2}-\d{2}$/.test(venc) ? venc : undefined };
    },
    origem
  );
}
