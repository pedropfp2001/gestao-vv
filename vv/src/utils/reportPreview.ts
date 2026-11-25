import type { jsPDF } from 'jspdf';

/**
 * Pré-visualização dos relatórios: quando ligada, em vez de baixar na hora o PDF vai para uma fila
 * e a tela de pré-visualização é aberta para conferir antes de baixar.
 */
export interface PreviewFile { filename: string; blob: Blob }

let enabled = false;
let collecting: PreviewFile[] | null = null;
let listener: (files: PreviewFile[]) => void = () => {};
const pending: PreviewFile[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export const setPreviewEnabled = (v: boolean) => { enabled = v; };
export const isPreviewEnabled = () => enabled;
export const setPreviewListener = (fn: (files: PreviewFile[]) => void) => { listener = fn; };

/** Use no lugar de doc.save(): baixa direto ou, com a pré-visualização ligada, manda para a conferência. */
export function savePdf(doc: jsPDF, filename: string) {
  if (!enabled) { doc.save(filename); return; }
  const file = { filename, blob: doc.output('blob') as Blob };
  if (collecting) { collecting.push(file); return; }
  // quem gerou sem avisar: junta os arquivos que chegam em sequência e abre uma única conferência
  pending.push(file);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; const files = pending.splice(0); if (files.length) listener(files); }, 2500);
}

/** Envolve uma geração de relatório(s): com a pré-visualização ligada, junta todos os PDFs e abre a conferência no fim. */
export async function runReport<T>(fn: () => Promise<T>): Promise<T> {
  if (!enabled || collecting) return fn();
  collecting = [];
  try {
    const r = await fn();
    const files = collecting; collecting = null;
    if (files.length) listener(files);
    return r;
  } catch (e) { collecting = null; throw e; }
}
