import { jsPDF } from 'jspdf';

/**
 * COMPARTILHAMENTO SOMENTE DE ARQUIVO.
 * Nunca enviamos texto, título ou link junto: apenas a imagem/PDF.
 * Sem suporte a compartilhar arquivos (ex.: computador), baixamos o arquivo
 * e abrimos o WhatsApp SEM mensagem pré-preenchida.
 */
const WHATSAPP_URL = 'https://api.whatsapp.com/send';

export function sanitizePdfFileName(name: string, fallback: string = 'documento.pdf'): string {
  if (!name || typeof name !== 'string') return fallback;
  let clean = name.replace(/[/\\?%*:|"<>#]/g, '_').trim();
  clean = clean.normalize('NFD').replace(/[̀-ͯ]/g, '');
  clean = clean.replace(/\s+/g, '_').replace(/_+/g, '_');
  if (!clean.toLowerCase().endsWith('.pdf')) clean = `${clean}.pdf`;
  return clean || fallback;
}

function triggerDownload(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
}

/** Tenta o compartilhamento nativo SOMENTE com arquivos. Retorna true se resolvido (enviado ou cancelado). */
async function nativeShareFiles(files: File[]): Promise<boolean> {
  try {
    if (navigator.share && navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files }); // sem text, title ou url
      return true;
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return true;
    console.warn('[SHARE] Compartilhamento nativo falhou, usando alternativa:', err);
  }
  return false;
}

async function fetchFileBlob(url: string): Promise<Blob> {
  const fullUrl = url.startsWith('/') ? `${window.location.origin}${url}` : url;
  const res = await fetch(fullUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Erro ${res.status} ao carregar o arquivo`);
  return res.blob();
}

export async function shareImageFile(imageUrl: string, filename: string) {
  if (!imageUrl) {
    window.open(WHATSAPP_URL, '_blank');
    return;
  }
  try {
    const blob = await fetchFileBlob(imageUrl);
    const mimeType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    let base = filename.replace(/\.[a-zA-Z0-9]+$/, '').replace(/[/\\?%*:|"<>#]/g, '_').trim();
    base = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_');
    const name = `${base || 'comprovante'}.${ext}`;
    const file = new File([blob], name, { type: mimeType, lastModified: Date.now() });
    if (await nativeShareFiles([file])) return;
    triggerDownload(blob, name);
    window.open(WHATSAPP_URL, '_blank');
  } catch (err) {
    console.warn('[SHARE] Erro ao preparar imagem:', err);
    window.open(WHATSAPP_URL, '_blank');
  }
}

export async function sharePDFDoc(doc: jsPDF, filename: string) {
  const name = sanitizePdfFileName(filename, 'Relatorio.pdf');
  try {
    const blob = doc.output('blob');
    const file = new File([blob], name, { type: 'application/pdf', lastModified: Date.now() });
    if (await nativeShareFiles([file])) return;
  } catch (err) {
    console.warn('[SHARE] Erro ao preparar PDF:', err);
  }
  doc.save(name);
  window.open(WHATSAPP_URL, '_blank');
}

async function fetchPdf(url: string, filename: string) {
  const blob = await fetchFileBlob(url);
  if (blob.size < 64 || blob.type.includes('json') || blob.type.includes('html')) {
    throw new Error('O arquivo obtido não é um PDF válido.');
  }
  const pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
  return { blob: pdfBlob, name: sanitizePdfFileName(filename, 'documento.pdf') };
}

/** O 3º parâmetro é ignorado de propósito: nenhum texto é enviado. */
export async function shareRemotePdfFile(pdfUrl: string, filename: string, _ignoredText?: string) {
  if (!pdfUrl) {
    window.open(WHATSAPP_URL, '_blank');
    return;
  }
  try {
    const { blob, name } = await fetchPdf(pdfUrl, filename);
    const file = new File([blob], name, { type: 'application/pdf', lastModified: Date.now() });
    if (await nativeShareFiles([file])) return;
    triggerDownload(blob, name);
    window.open(WHATSAPP_URL, '_blank');
  } catch (err: any) {
    console.error('[SHARE] Erro ao compartilhar PDF:', err);
    alert(`Não foi possível carregar o PDF para compartilhar: ${err?.message || 'arquivo indisponível'}.`);
  }
}

export async function shareMultiplePdfFiles(
  filesData: Array<{ url: string; filename: string }>,
  _ignoredText?: string
) {
  const valid = filesData.filter((f) => !!f.url);
  if (valid.length === 0) {
    window.open(WHATSAPP_URL, '_blank');
    return;
  }
  try {
    const got: Array<{ blob: Blob; name: string }> = [];
    for (const item of valid) {
      try {
        const { blob, name } = await fetchPdf(item.url, item.filename);
        got.push({ blob, name });
      } catch (err) {
        console.warn(`[SHARE] Falha ao baixar anexo: ${item.filename}`, err);
      }
    }
    if (got.length === 0) throw new Error('Nenhum anexo pôde ser lido como PDF válido.');
    const files = got.map((g) => new File([g.blob], g.name, { type: 'application/pdf', lastModified: Date.now() }));
    if (await nativeShareFiles(files)) return;
    got.forEach((g) => triggerDownload(g.blob, g.name));
    window.open(WHATSAPP_URL, '_blank');
  } catch (err: any) {
    console.error('[SHARE] Erro no compartilhamento múltiplo:', err);
    alert(`Erro ao preparar os documentos: ${err?.message || 'falha ao processar arquivos'}.`);
  }
}
