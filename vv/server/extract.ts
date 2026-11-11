// Leitura opcional de pedidos por IA (Gemini). Só roda no servidor; a chave nunca vai para o navegador.
// Sem GEMINI_API_KEY o sistema continua funcionando 100% no modo manual.
import { VALID_SELLERS } from './helpers';

export interface Extracted { marca: string; data: string; valor: number; vendedor?: string }
export type Extractor = (imageDataUrl: string, knownBrands: string[]) => Promise<Extracted>;

export class ExtractError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];

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

export function makeGeminiExtractor(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Extractor | null {
  const key = env.GEMINI_API_KEY;
  if (!key) return null;
  const models = (env.GEMINI_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const list = models.length ? models : DEFAULT_MODELS;

  return async (imageDataUrl, brands) => {
    const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(imageDataUrl);
    if (!m) throw new ExtractError('Imagem inválida.', 400);
    const body = {
      systemInstruction: { parts: [{ text: systemText(brands) }] },
      contents: [{ parts: [{ inlineData: { mimeType: m[1], data: m[2] } }, { text: 'Extraia marca, data (YYYY-MM-DD), valor e vendedor deste pedido.' }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { marca: { type: 'STRING' }, data: { type: 'STRING' }, valor: { type: 'NUMBER' }, vendedor: { type: 'STRING' } },
          required: ['marca', 'data', 'valor'],
        },
      },
    };
    let lastStatus = 502; let lastMsg = 'A IA não respondeu.';
    for (const model of list) {
      try {
        const r = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(40_000),
        });
        if (!r.ok) {
          const detail = (await r.text().catch(() => '')).slice(0, 300);
          console.error(`[IA] modelo ${model} respondeu ${r.status}: ${detail}`);
          lastStatus = r.status === 429 ? 429 : 502;
          lastMsg = r.status === 429
            ? 'Limite de uso da IA atingido. Aguarde um pouco ou preencha manualmente.'
            : r.status === 400 || r.status === 403
              ? `A IA recusou a chave ou o pedido (erro ${r.status}). Confira a GEMINI_API_KEY no Render.`
              : r.status === 404
                ? `Modelo ${model} indisponível (erro 404).`
                : `A IA recusou a leitura (erro ${r.status}).`;
          continue; // tenta o próximo modelo
        }
        const j: any = await r.json();
        const text = j?.candidates?.[0]?.content?.parts?.map((x: any) => x?.text || '').join('') || '';
        if (!text) {
          console.error(`[IA] modelo ${model} sem texto na resposta:`, JSON.stringify(j).slice(0, 300));
          lastMsg = `A IA não devolveu texto (${j?.promptFeedback?.blockReason || j?.candidates?.[0]?.finishReason || 'sem motivo'}).`;
          continue;
        }
        const p = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
        const valor = Number(p.valor);
        if (!p.marca || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.data)) || !isFinite(valor)) { lastMsg = 'A IA não conseguiu ler todos os campos.'; continue; }
        const vend = (VALID_SELLERS as readonly string[]).find((s) => s.toLowerCase() === String(p.vendedor || '').trim().toLowerCase());
        return { marca: String(p.marca), data: String(p.data), valor, vendedor: vend };
      } catch (e: any) {
        console.error(`[IA] modelo ${model} falhou:`, e?.name, e?.message, e?.cause?.message || '');
        lastMsg = `Falha ao falar com a IA (${String(e?.cause?.code || e?.name || 'erro')}: ${String(e?.message || '').slice(0, 80)}).`;
        lastStatus = 502;
      }
    }
    throw new ExtractError(lastMsg, lastStatus);
  };
}
