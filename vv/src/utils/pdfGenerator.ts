import { savePdf } from './reportPreview';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Order, CustomerSummary, OverdueBoleto, ItemPedido } from '../types';
import { sharePDFDoc } from './shareUtils';
import {
  formatCurrency,
  formatDateBR,
  computeOrderDiasAtraso,
  computeBoletoDiasAtraso,
  isBoletoOpen,
  parseBoletoDateToTimestamp,
  sortBoletosByOldestOverdue,
} from './dateUtils';

export {
  formatCurrency,
  formatDateBR,
  computeOrderDiasAtraso,
  computeBoletoDiasAtraso,
  isBoletoOpen,
  parseBoletoDateToTimestamp,
  sortBoletosByOldestOverdue,
};

/** Usuário que aparece no cabeçalho "Gerado por ..." dos PDFs. */
let reportUser = 'Sistema';
export function setReportUser(name: string) {
  reportUser = name || 'Sistema';
}

/** Busca os boletos mais recentes direto do servidor (única fonte de verdade). */
export async function getFreshestBoletos(providedBoletos?: OverdueBoleto[]): Promise<OverdueBoleto[]> {
  try {
    const res = await fetch('/api/boletos?t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.warn('[PDF] Não foi possível buscar boletos no servidor, usando a lista da tela:', err);
  }
  return providedBoletos || [];
}

/* ------------------------------------------------------------------ */
/* Utilidades de imagem: reduz foto para 800px / JPEG 0.6 (relatórios) */
/* ------------------------------------------------------------------ */
async function loadReducedImage(url: string, maxSide = 800, quality = 0.6): Promise<{ dataUrl: string; w: number; h: number } | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), w, h });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/* ------------------------------------------------------------------ */
/* Peças comuns do layout dos relatórios (modelo Traviu)               */
/* ------------------------------------------------------------------ */
const RED_DARK: [number, number, number] = [127, 29, 29];
const RED_HEAD: [number, number, number] = [155, 44, 44];
const ROW_PINK: [number, number, number] = [255, 241, 241];
const LINE_PINK: [number, number, number] = [240, 184, 184];
const NAVY: [number, number, number] = [30, 41, 59];
const GRAY: [number, number, number] = [148, 163, 184];
const PAGE_W = 210;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

function stamp(): string {
  const d = new Date();
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}
function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const diasLabel = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
const saldo = (o: Order) => Math.max(0, (o.valor || 0) - (o.valorPago || 0));
const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'SEM-MARCA';
const brandOf = (o: { marca?: string }) => (o.marca || 'SEM MARCA').trim() || 'SEM MARCA';
const sellerOf = (o: { vendedor?: string }) => (o.vendedor || '').toUpperCase();

function headerBand(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(...RED_DARK);
  doc.rect(0, 0, PAGE_W, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, MARGIN, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(subtitle, MARGIN, 23);
  doc.text(`Gerado por ${reportUser} em ${stamp()}`, PAGE_W - MARGIN, 23, { align: 'right' });
}

function footers(doc: jsPDF) {
  const total = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(`Distribuidora de Frutas Traviu - Página ${i} de ${total}`, PAGE_W / 2, 290, { align: 'center' });
  }
}

function totalBar(doc: jsPDF, y: number, left: string, right: string) {
  if (y + 14 > 280) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(...NAVY);
  doc.roundedRect(MARGIN, y, CONTENT_W, 11, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(left, MARGIN + 4, y + 7);
  doc.setTextColor(252, 165, 165);
  doc.text(right, PAGE_W - MARGIN - 4, y + 7, { align: 'right' });
}

function emptyReport(doc: jsPDF) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(100, 116, 139);
  doc.text('Nenhum registro encontrado.', PAGE_W / 2, 70, { align: 'center' });
}

async function finish(doc: jsPDF, filename: string, action: 'download' | 'share') {
  footers(doc);
  if (action === 'share') await sharePDFDoc(doc, filename);
  else savePdf(doc, filename);
}

const tableBase = {
  theme: 'grid' as const,
  margin: { left: MARGIN, right: MARGIN, bottom: 18 },
  styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.2, lineColor: LINE_PINK, lineWidth: 0.2, textColor: [15, 23, 42] as [number, number, number], valign: 'middle' as const },
  headStyles: { fillColor: RED_HEAD, textColor: [255, 255, 255] as [number, number, number], fontStyle: 'bold' as const, halign: 'center' as const },
  alternateRowStyles: { fillColor: [255, 255, 255] as [number, number, number] },
  bodyStyles: { fillColor: ROW_PINK },
};

/* ------------------------------------------------------------------ */
/* Relatório 1 e 2: pedidos em aberto por marca                       */
/* ------------------------------------------------------------------ */
export async function generateOpenOrdersGridPDF(
  orders: Order[],
  action: 'download' | 'share' = 'download',
  minOrdersFilter: string | number = '2+'
) {
  const open = orders.filter((o) => o.status === 'em_aberto');
  const groups = new Map<string, Order[]>();
  [...open]
    .sort((a, b) => brandOf(a).localeCompare(brandOf(b), 'pt-BR') || (a.data || '').localeCompare(b.data || ''))
    .forEach((o) => {
      const k = brandOf(o);
      groups.set(k, [...(groups.get(k) || []), o]);
    });

  const f = String(minOrdersFilter);
  let keep: (n: number) => boolean;
  let subtitle: string;
  let fileKind: string;
  if (f === '1_only' || f === '1') {
    keep = (n) => n === 1; subtitle = 'Distribuidora Traviu - Marcas com SOMENTE 1 pedido em aberto'; fileKind = 'Marcas_1_Pedido';
  } else if (f === '3+' || f === '3') {
    keep = (n) => n >= 3; subtitle = 'Distribuidora Traviu - Marcas com 3+ pedidos em aberto'; fileKind = 'Marcas_3_ou_Mais_Pedidos';
  } else if (f === 'all') {
    keep = (n) => n >= 1; subtitle = 'Distribuidora Traviu - Todas as marcas com pedidos em aberto'; fileKind = 'Marcas_Todas';
  } else {
    keep = (n) => n >= 2; subtitle = 'Distribuidora Traviu - Marcas com 2+ pedidos em aberto'; fileKind = 'Marcas_2_ou_Mais_Pedidos';
  }
  const brands = [...groups.entries()].filter(([, l]) => keep(l.length));
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  headerBand(doc, 'RELATÓRIO DE PEDIDOS EM ABERTO POR MARCA', subtitle);
  const filename = `Relatorio_${fileKind}_${todayIso()}.pdf`;

  if (brands.length === 0) {
    emptyReport(doc);
    return finish(doc, filename, action);
  }

  const totalPedidos = brands.reduce((s, [, l]) => s + l.length, 0);
  const totalValor = brands.reduce((s, [, l]) => s + l.reduce((a, o) => a + saldo(o), 0), 0);

  if (f === '1_only' || f === '1') {
    // Lista única, uma linha por marca (código sequencial #MARCA-0001)
    const rows = brands.map(([marca, l], i) => {
      const o = l[0];
      return [`#${slug(marca)}-${String(i + 1).padStart(4, '0')}`, marca, formatDateBR(o.data), diasLabel(computeOrderDiasAtraso(o.data)), formatCurrency(saldo(o)), sellerOf(o)];
    });
    const media = Math.round(brands.reduce((s, [, l]) => s + computeOrderDiasAtraso(l[0].data), 0) / brands.length);
    autoTable(doc, {
      ...tableBase,
      startY: 42,
      head: [['Código', 'Marca / Cliente', 'Data Pedido', 'Dias em Atraso', 'Valor em Aberto (R$)', 'Vendedor']],
      body: rows,
      foot: [['TOTAL GERAL', `${brands.length} marcas`, '', `Média: ${media}d`, formatCurrency(totalValor), '']],
      showFoot: 'lastPage',
      footStyles: { fillColor: ROW_PINK, textColor: [155, 28, 28], fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { halign: 'center', textColor: [100, 116, 139], fontStyle: 'bold', cellWidth: 36 },
        1: { fontStyle: 'bold' },
        2: { halign: 'center', cellWidth: 24 },
        3: { halign: 'center', textColor: [185, 28, 28], fontStyle: 'bold', cellWidth: 24 },
        4: { halign: 'right', fontStyle: 'bold', cellWidth: 36 },
        5: { halign: 'center', fontStyle: 'bold', cellWidth: 26 },
      },
      didParseCell: (d) => {
        if (d.section === 'body' && d.row.index % 2 === 1) d.cell.styles.fillColor = [255, 255, 255];
      },
    });
    const y = ((doc as any).lastAutoTable?.finalY || 60) + 10;
    totalBar(doc, y, `TOTAL GERAL DE PEDIDOS EM ABERTO: ${totalPedidos}`, `VALOR TOTAL CONSOLIDADO: ${formatCurrency(totalValor)}`);
  } else {
    // Blocos por marca, com subtotal
    let y = 42;
    for (const [marca, list] of brands) {
      const blockH = 9 + 8 + list.length * 8 + 8;
      if (y + Math.min(blockH, 120) > 278) {
        doc.addPage();
        y = 16;
      }
      const sub = list.reduce((s, o) => s + saldo(o), 0);
      doc.setFillColor(...RED_DARK);
      doc.roundedRect(MARGIN, y, CONTENT_W, 8, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`MARCA: ${marca}`, MARGIN + 4, y + 5.4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(`(${list.length} pedidos em aberto)`, MARGIN + 78, y + 5.4);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(`SUBTOTAL: ${formatCurrency(sub)}`, PAGE_W - MARGIN - 4, y + 5.4, { align: 'right' });
      autoTable(doc, {
        ...tableBase,
        startY: y + 8,
        head: [['Código', 'Data do Pedido', 'Dias em Atraso', 'Valor em Aberto (R$)', 'Vendedor']],
        body: list.map((o, i) => [`#${slug(marca)}-${String(i + 1).padStart(4, '0')}`, formatDateBR(o.data), diasLabel(computeOrderDiasAtraso(o.data)), formatCurrency(saldo(o)), sellerOf(o)]),
        columnStyles: {
          0: { halign: 'center', textColor: [100, 116, 139], fontStyle: 'bold', cellWidth: 38 },
          1: { halign: 'center', fontStyle: 'bold', cellWidth: 32 },
          2: { halign: 'center', textColor: [185, 28, 28], fontStyle: 'bold', cellWidth: 32 },
          3: { halign: 'right', fontStyle: 'bold' },
          4: { halign: 'center', fontStyle: 'bold', cellWidth: 36 },
        },
        didParseCell: (d) => {
          if (d.section === 'body' && d.row.index % 2 === 1) d.cell.styles.fillColor = [255, 255, 255];
        },
      });
      y = ((doc as any).lastAutoTable?.finalY || y + 30) + 8;
    }
    totalBar(doc, y, `TOTAL GERAL DE PEDIDOS EM ABERTO: ${totalPedidos}`, `VALOR TOTAL CONSOLIDADO: ${formatCurrency(totalValor)}`);
  }
  await finish(doc, filename, action);
}

/* ------------------------------------------------------------------ */
/* Relatório 3: boletos em atraso, agrupado por marca                  */
/* ------------------------------------------------------------------ */
export async function generateOverdueBoletosGridPDF(
  boletos: OverdueBoleto[],
  action: 'download' | 'share' = 'download'
) {
  const open = boletos.filter(isBoletoOpen);
  const dias = (b: OverdueBoleto) => computeBoletoDiasAtraso(b.data, b.situacao, b.dataBaixa);
  const groups = new Map<string, OverdueBoleto[]>();
  open.forEach((b) => {
    const k = brandOf(b);
    groups.set(k, [...(groups.get(k) || []), b]);
  });
  // marcas mais atrasadas primeiro; dentro da marca, vencimento mais antigo primeiro
  const brands = [...groups.entries()]
    .map(([marca, list]) => ({ marca, list: [...list].sort((a, b) => parseBoletoDateToTimestamp(a.data) - parseBoletoDateToTimestamp(b.data)) }))
    .sort((a, b) => Math.max(...b.list.map(dias)) - Math.max(...a.list.map(dias)) || a.marca.localeCompare(b.marca, 'pt-BR'));

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  headerBand(doc, 'RELATÓRIO DE BOLETOS EM ATRASO', 'Distribuidora de Frutas Traviu - Gestão de Inadimplência por Marca');
  const filename = `Relatorio_Boletos_Atraso_${todayIso()}.pdf`;
  if (open.length === 0) {
    emptyReport(doc);
    return finish(doc, filename, action);
  }

  const total = open.reduce((s, b) => s + (b.valor || 0), 0);
  const media = Math.round(open.reduce((s, b) => s + dias(b), 0) / open.length);
  doc.setFillColor(...ROW_PINK);
  doc.setDrawColor(...LINE_PINK);
  doc.roundedRect(MARGIN, 40, CONTENT_W, 22, 2, 2, 'FD');
  const stats: Array<[string, string, number]> = [
    ['TOTAL EM ATRASO', formatCurrency(total), MARGIN + 6],
    ['TOTAL DE TÍTULOS', String(open.length), MARGIN + 66],
    ['TOTAL DE MARCAS', String(brands.length), MARGIN + 110],
    ['MÉDIA DE DIAS', `${media} ${media === 1 ? 'dia' : 'dias'}`, MARGIN + 150],
  ];
  stats.forEach(([label, value, x]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...NAVY);
    doc.text(label, x, 48);
    doc.setFontSize(10);
    doc.setTextColor(155, 28, 28);
    doc.text(value, x, 56);
  });

  let y = 70;
  for (const { marca, list } of brands) {
    if (y + 40 > 278) {
      doc.addPage();
      y = 16;
    }
    const sub = list.reduce((s, b) => s + (b.valor || 0), 0);
    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [['#', 'Marca', 'Valor (R$)', 'Data', 'Dias em atraso', 'Situação', 'Vendedor']],
      body: list.map((b) => [String(b.indexNum ?? ''), marca, formatCurrency(b.valor || 0), formatDateBR(b.data), String(dias(b)), b.situacao || 'EM ABERTO', sellerOf(b)]),
      // um único total por marca, no fim (sem repetir a cada página)
      foot: [[
        { content: `TOTAL ${marca}`, colSpan: 2, styles: { halign: 'left' } },
        { content: formatCurrency(sub), styles: { halign: 'right' } },
        { content: `${list.length} título(s)`, colSpan: 4, styles: { halign: 'left' } },
      ]],
      showFoot: 'lastPage',
      footStyles: { fillColor: [254, 226, 226], textColor: [155, 28, 28], fontStyle: 'bold' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { fontStyle: 'bold' },
        2: { halign: 'right', fontStyle: 'bold', cellWidth: 28 },
        3: { halign: 'center', cellWidth: 24 },
        4: { halign: 'center', textColor: [185, 28, 28], cellWidth: 24 },
        5: { halign: 'center', fontStyle: 'bold', cellWidth: 26 },
        6: { halign: 'center', cellWidth: 26 },
      },
      didParseCell: (d) => {
        if (d.section === 'body' && d.row.index % 2 === 1) d.cell.styles.fillColor = [255, 255, 255];
      },
    });
    y = ((doc as any).lastAutoTable?.finalY || y + 20) + 8;
  }
  totalBar(doc, y, `TOTAL GERAL DE TÍTULOS EM ATRASO: ${open.length}`, `VALOR TOTAL CONSOLIDADO: ${formatCurrency(total)}`);
  await finish(doc, filename, action);
}

/* ------------------------------------------------------------------ */
/* Relatório das marcas ESCOLHIDAS (mesmo layout de "Marcas com 1 pedido") */
/* ------------------------------------------------------------------ */
export async function generateSelectedBrandsPDF(
  orders: Order[],
  selectedBrands: string[],
  action: 'download' | 'share' = 'download',
  includeSingles = false
) {
  const wanted = new Set(selectedBrands.map((b) => b.trim().toUpperCase()));
  if (includeSingles) {
    // soma as marcas que, hoje, têm exatamente 1 pedido em aberto
    const cont = new Map<string, number>();
    orders
      .filter((o) => o.status === 'em_aberto' && saldo(o) > 0)
      .forEach((o) => cont.set(brandOf(o).toUpperCase(), (cont.get(brandOf(o).toUpperCase()) || 0) + 1));
    cont.forEach((n, k) => { if (n === 1) wanted.add(k); });
  }
  const list = orders
    .filter((o) => o.status === 'em_aberto' && saldo(o) > 0 && wanted.has(brandOf(o).toUpperCase()))
    .sort((a, b) => brandOf(a).localeCompare(brandOf(b), 'pt-BR') || (a.data || '').localeCompare(b.data || ''));
  const marcas = new Set(list.map((o) => brandOf(o).toUpperCase()));

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  headerBand(doc, 'RELATÓRIO DE PEDIDOS EM ABERTO POR MARCA', `Distribuidora Traviu - Marcas selecionadas (${marcas.size})`);
  const filename = `Relatorio_Marcas_Selecionadas_${todayIso()}.pdf`;
  if (list.length === 0) {
    emptyReport(doc);
    return finish(doc, filename, action);
  }

  const totalValor = list.reduce((s, o) => s + saldo(o), 0);
  const media = Math.round(list.reduce((s, o) => s + computeOrderDiasAtraso(o.data), 0) / list.length);
  // uma linha por pedido em aberto (código sequencial #MARCA-0001), igual ao relatório de 1 pedido
  const rows = list.map((o, i) => [
    `#${slug(brandOf(o))}-${String(i + 1).padStart(4, '0')}`,
    brandOf(o),
    formatDateBR(o.data),
    diasLabel(computeOrderDiasAtraso(o.data)),
    formatCurrency(saldo(o)),
    sellerOf(o),
  ]);
  autoTable(doc, {
    ...tableBase,
    startY: 42,
    head: [['Código', 'Marca / Cliente', 'Data Pedido', 'Dias em Atraso', 'Valor em Aberto (R$)', 'Vendedor']],
    body: rows,
    foot: [['TOTAL GERAL', `${marcas.size} ${marcas.size === 1 ? 'marca' : 'marcas'}`, '', `Média: ${media}d`, formatCurrency(totalValor), '']],
    showFoot: 'lastPage',
    footStyles: { fillColor: ROW_PINK, textColor: [155, 28, 28], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { halign: 'center', textColor: [100, 116, 139], fontStyle: 'bold', cellWidth: 36 },
      1: { fontStyle: 'bold' },
      2: { halign: 'center', cellWidth: 24 },
      3: { halign: 'center', textColor: [185, 28, 28], fontStyle: 'bold', cellWidth: 24 },
      4: { halign: 'right', fontStyle: 'bold', cellWidth: 36 },
      5: { halign: 'center', fontStyle: 'bold', cellWidth: 26 },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index % 2 === 1) d.cell.styles.fillColor = [255, 255, 255];
    },
  });
  const y = ((doc as any).lastAutoTable?.finalY || 60) + 10;
  totalBar(doc, y, `TOTAL GERAL DE PEDIDOS EM ABERTO: ${list.length}`, `VALOR TOTAL CONSOLIDADO: ${formatCurrency(totalValor)}`);
  return finish(doc, filename, action);
}

/* ------------------------------------------------------------------ */
/* Extrato por marca (padrão "Emissão / Atraso / Bilhete / Mercadoria") */
/* Um PDF por marca, só quem tem N ou mais pedidos em aberto.          */
/* ------------------------------------------------------------------ */
function parseIsoDate(s: string): Date {
  const [y, m, d] = String(s || '').slice(0, 10).split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}
const dmy2 = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
};

export interface ExtratoResultado { clientes: number; itensLidos: number; semItens: number; motivo?: string }

/** Lê (uma por vez, pela IA do servidor) os itens dos pedidos que ainda não têm; guarda no pedido para não reler. */
export async function carregarItens(
  orders: Order[],
  onProgress?: (done: number, total: number) => void
): Promise<{ itens: Map<string, { itens: ItemPedido[]; bilhete?: string; vencimento?: string }>; lidos: number; falhas: number; motivo?: string }> {
  const out = new Map<string, { itens: ItemPedido[]; bilhete?: string; vencimento?: string }>();
  let lidos = 0, falhas = 0; let motivo: string | undefined;
  const pendentes: Order[] = [];
  orders.forEach((o) => {
    if (Array.isArray(o.itens) && o.itens.length) out.set(o.id, { itens: o.itens, bilhete: o.bilhete, vencimento: o.vencimento });
    else if (o.imageUrl) pendentes.push(o);
  });
  if (!pendentes.length) return { itens: out, lidos, falhas, motivo };
  let enabled = false;
  try { enabled = !!(await (await fetch('/api/extract-items/status')).json())?.enabled; } catch { /* sem IA */ }
  if (!enabled) return { itens: out, lidos, falhas: pendentes.length, motivo: 'A leitura por IA não está ativada (falta a chave GEMINI_API_KEY).' };
  // 3 fotos ao mesmo tempo (bem mais rápido que uma por vez, sem passar do limite gratuito da IA)
  const PARALELO = 3;
  let proximo = 0, concluidos = 0, limite = false;
  const trabalhador = async () => {
    while (!limite) {
      const i = proximo++;
      if (i >= pendentes.length) return;
      const o = pendentes[i];
      try {
        const r = await fetch(`/api/orders/${encodeURIComponent(o.id)}/itens`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const d = await r.json().catch(() => ({}));
        if (r.ok && Array.isArray(d.itens) && d.itens.length) {
          out.set(o.id, { itens: d.itens, bilhete: d.bilhete, vencimento: d.vencimento });
          lidos++;
        } else {
          falhas++; motivo = motivo || d?.error;
          if (r.status === 429) limite = true; // limite da IA: não adianta insistir
        }
      } catch {
        falhas++; motivo = motivo || 'Sem conexão com o servidor.';
      }
      concluidos++;
      onProgress?.(concluidos, pendentes.length);
    }
  };
  onProgress?.(0, pendentes.length);
  await Promise.all(Array.from({ length: Math.min(PARALELO, pendentes.length) }, trabalhador));
  if (limite) falhas += Math.max(0, pendentes.length - concluidos); // o que ficou sem ler por causa do limite
  onProgress?.(pendentes.length, pendentes.length);
  return { itens: out, lidos, falhas, motivo };
}

export async function generateExtratoClientesPDF(
  orders: Order[],
  action: 'download' | 'share' = 'download',
  /** lista de marcas escolhidas (qualquer quantidade de pedidos) ou um número = mínimo de pedidos em aberto */
  selecao: string[] | number = 3,
  onProgress?: (done: number, total: number) => void,
  /** itens já lidos e conferidos (se vier, não lê de novo) */
  itensPre?: Map<string, { itens: ItemPedido[]; bilhete?: string; vencimento?: string }>
): Promise<ExtratoResultado> {
  const minOrders = typeof selecao === 'number' ? selecao : 1;
  const wanted = Array.isArray(selecao) ? new Set(selecao.map((b) => b.trim().toUpperCase())) : null;
  const open = orders.filter((o) => o.status === 'em_aberto' && saldo(o) > 0);
  const byBrand = new Map<string, Order[]>();
  open.forEach((o) => byBrand.set(brandOf(o), [...(byBrand.get(brandOf(o)) || []), o]));
  const clients = [...byBrand.entries()]
    .filter(([marca, list]) => (wanted ? wanted.has(marca.toUpperCase()) : list.length >= minOrders))
    .map(([marca, list]) => ({ marca, list: [...list].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id)) }))
    .sort((a, b) => a.marca.localeCompare(b.marca, 'pt-BR'));

  const filename = `Relatorio_Extrato_${todayIso()}.pdf`;
  if (clients.length === 0) {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    headerBand(doc, 'EXTRATO POR CLIENTE', 'Distribuidora de Frutas Traviu');
    emptyReport(doc);
    await finish(doc, filename, action);
    return { clientes: 0, itensLidos: 0, semItens: 0 };
  }

  // só os pedidos dos clientes que entram no relatório precisam ter os itens lidos
  const { itens: itensMap, lidos, falhas, motivo } = itensPre
    ? { itens: itensPre, lidos: 0, falhas: 0, motivo: undefined as string | undefined }
    : await carregarItens(clients.flatMap((c) => c.list), onProgress);

  const PW = 297, M = 8;
  const hoje = parseIsoDate(todayIso());
  const DAY = 86400000;
  const GRAYBAND: [number, number, number] = [236, 236, 236];
  let semItens = 0;

  /** Monta o PDF (paisagem) de UMA marca. */
  const buildClientDoc = (marca: string, list: Order[]): jsPDF => {
    const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(`${marca} - ${marca}`, M, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`Gerado por ${reportUser} em ${stamp()}`, PW - M, 12, { align: 'right' });

    const body: any[][] = [];
    const kinds: string[] = [];
    const blank = () => ['', '', '', '', '', '', '', '', '', ''];
    let acumulado = 0, volumes = 0;

    list.forEach((o, gi) => {
      if (gi > 0) { body.push(blank()); kinds.push('gap'); }
      const extra = itensMap.get(o.id);
      const emissao = parseIsoDate(o.data);
      // sem vencimento: o atraso conta os dias desde o dia em que o pedido foi lançado
      const atraso = Math.max(0, Math.round((hoje.getTime() - emissao.getTime()) / DAY));
      const bilhete = extra?.bilhete || o.id;
      const base = [dmy2(emissao), atraso > 0 ? String(atraso) : '', bilhete];
      const valor = o.valor || 0;
      acumulado += valor;
      if (extra?.itens?.length) {
        extra.itens.forEach((it, k) => {
          volumes += it.quantidade || 0;
          body.push([...base, it.mercadoria, it.un || '', formatNumber(it.quantidade), formatNumber(it.preco), formatNumber(it.total), k === extra.itens.length - 1 ? formatNumber(valor) : '', '']);
          kinds.push('row');
        });
      } else {
        semItens++;
        body.push([...base, '(itens não lidos)', '', '', '', formatNumber(valor), formatNumber(valor), '']);
        kinds.push('row');
      }
      body.push([{ content: `Total EMISSÃO   ${dmy2(emissao)}`, colSpan: 8, styles: { halign: 'right' } }, formatNumber(valor), formatNumber(acumulado)]);
      kinds.push('sub');
    });
    body.push(blank()); kinds.push('gap');
    const vendido = list.reduce((s, o) => s + (o.valor || 0), 0);
    const parciais = list.reduce((s, o) => s + (o.valorPago || 0), 0);
    const receber = list.reduce((s, o) => s + saldo(o), 0);
    const resumo: Array<[string, string]> = [
      ['Total de Pedidos', String(list.length)],
      ...(volumes > 0 ? [['Total de Volumes', formatNumber(volumes)] as [string, string]] : []),
      ['Total Vendido', formatNumber(vendido)],
      ['Pagamentos Parciais', formatNumber(parciais)],
      ['Total a Receber', formatNumber(receber)],
    ];
    resumo.forEach(([label, v]) => {
      body.push([{ content: label, colSpan: 8, styles: { halign: 'right' } }, v, '']);
      kinds.push('resumo');
    });

    autoTable(doc, {
      startY: 16,
      margin: { left: M, right: M, bottom: 16 },
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1.3, bottom: 1.3, left: 1.6, right: 1.6 }, textColor: [0, 0, 0], valign: 'middle', overflow: 'ellipsize' },
      head: [['Emissão', 'Atraso', 'Bilhete', 'Mercadoria', 'Un', 'Quantidade', 'Preço', 'Total', 'Bilhete', 'Acumulado']],
      headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: { bottom: 0.3 }, lineColor: [0, 0, 0] },
      body,
      columnStyles: {
        0: { cellWidth: 20 }, 1: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 26 }, 3: {}, 4: { cellWidth: 11 },
        5: { halign: 'right', cellWidth: 24 }, 6: { halign: 'right', cellWidth: 24 }, 7: { halign: 'right', cellWidth: 26 },
        8: { halign: 'right', cellWidth: 26 }, 9: { halign: 'right', cellWidth: 26 },
      },
      didParseCell: (d) => {
        if (d.section === 'head') { d.cell.styles.halign = d.column.index >= 5 ? 'right' : d.column.index === 1 ? 'center' : 'left'; return; }
        if (d.section !== 'body') return;
        const k = kinds[d.row.index];
        if (k === 'row' && d.column.index === 1 && d.cell.raw) d.cell.styles.textColor = [185, 28, 28];
        if (k === 'sub' || k === 'resumo') { d.cell.styles.fillColor = GRAYBAND; d.cell.styles.fontStyle = 'bold'; }
        if (k === 'gap') d.cell.styles.minCellHeight = 2.5;
        if (k === 'resumo' && String((d.cell.raw as any)?.content || '').startsWith('Total a Receber')) d.cell.styles.textColor = [155, 28, 28];
      },
    });
    const total = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...GRAY);
      doc.text(`Distribuidora de Frutas Traviu - Página ${i} de ${total}`, PW / 2, 204, { align: 'center' });
    }
    return doc;
  };

  // um PDF por marca
  const used = new Set<string>();
  const nomeArquivo = (marca: string) => {
    // só o nome da marca (tira apenas o que o sistema de arquivos não aceita)
    const base = marca.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'SEM MARCA';
    let nome = `${base}.pdf`;
    for (let n = 2; used.has(nome.toLowerCase()); n++) nome = `${base} (${n}).pdf`;
    used.add(nome.toLowerCase());
    return nome;
  };
  const files = clients.map(({ marca, list }) => ({ nome: nomeArquivo(marca), doc: buildClientDoc(marca, list) }));
  // um PDF separado por marca, baixados um após o outro (sem .zip)
  for (let i = 0; i < files.length; i++) {
    savePdf(files[i].doc, files[i].nome);
    if (i < files.length - 1) await new Promise((r) => setTimeout(r, 600));
  }
  return { clientes: clients.length, itensLidos: lidos, semItens, motivo: falhas > 0 ? motivo : undefined };
}

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ------------------------------------------------------------------ */
/* Relatório individual do cliente, com fotos reduzidas (A4)           */
/* ------------------------------------------------------------------ */
export async function generateCustomerOrderPDF(marca: string, orders: Order[], action: 'download' | 'share' = 'download') {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const list = orders
    .filter((o) => o.status === 'em_aberto')
    .sort((a, b) => (a.data || '').localeCompare(b.data || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
  const totalDevido = list.reduce((s, o) => s + saldo(o), 0);

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('RELATÓRIO DE PEDIDOS PENDENTES', MARGIN, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(`Cliente / Marca: ${marca}`, MARGIN, 26);
  doc.text(`Gerado por ${reportUser} em ${stamp()}`, PAGE_W - MARGIN, 26, { align: 'right' });

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(MARGIN, 42, CONTENT_W, 20, 3, 3, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`TOTAL DE PEDIDOS: ${list.length}`, MARGIN + 6, 54);
  doc.setTextColor(220, 38, 38);
  doc.setFontSize(11);
  doc.text(`VALOR TOTAL DEVIDO: ${formatCurrency(totalDevido)}`, PAGE_W - MARGIN - 6, 54, { align: 'right' });

  let y = 70;
  const maxImgW = 62;
  const maxImgH = 62;
  for (const o of list) {
    const img = o.imageUrl ? await loadReducedImage(o.imageUrl) : null;
    const blockH = 12 + (img ? maxImgH : 12) + 8;
    if (y + blockH > 280) {
      doc.addPage();
      y = 16;
    }
    doc.setFillColor(226, 232, 240);
    doc.rect(MARGIN, y, CONTENT_W, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`Pedido #${o.id}  |  Data: ${formatDateBR(o.data)}  |  Vendedor: ${o.vendedor}`, MARGIN + 3, y + 5.5);
    doc.setTextColor(220, 38, 38);
    doc.text(`Devido: ${formatCurrency(saldo(o))}`, PAGE_W - MARGIN - 3, y + 5.5, { align: 'right' });
    y += 12;
    if (img) {
      const r = Math.min(maxImgW / img.w, maxImgH / img.h);
      const w = img.w * r;
      const h = img.h * r;
      try {
        doc.addImage(img.dataUrl, 'JPEG', MARGIN + 2, y, w, h, undefined, 'FAST');
      } catch {}
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      const tx = MARGIN + w + 10;
      doc.text(`Valor do pedido: ${formatCurrency(o.valor)}`, tx, y + 8);
      if ((o.valorPago || 0) > 0) {
        doc.text(`Já abatido: ${formatCurrency(o.valorPago || 0)}`, tx, y + 15);
        doc.text(`Saldo a pagar: ${formatCurrency(saldo(o))}`, tx, y + 22);
      }
      y += h + 8;
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text('Sem foto anexada para este pedido.', MARGIN + 3, y + 6);
      y += 16;
    }
  }
  if (list.length === 0) emptyReport(doc);
  const filename = `Relatorio_Pedidos_${marca.replace(/\s+/g, '_')}_${todayIso()}.pdf`;
  await finish(doc, filename, action);
}

/**
 * PDF 2: Relatório de Gestão Financeira (Relatório Geral)
 * Tabela com Marca, Data do Pedido Mais Antigo, Valor Total Pendente por cliente
 */
export async function generateFinancialSummaryPDF(summaries: CustomerSummary[], action: 'download' | 'share' = 'download') {
  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
  });

  const parseOrderDate = (dStr: string) => {
    if (!dStr) return 0;
    if (dStr.includes('/')) {
      const parts = dStr.split('/');
      if (parts.length === 3) {
        return new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`).getTime() || 0;
      }
    }
    return new Date(dStr).getTime() || 0;
  };

  const sortedSummaries = [...summaries].sort((a, b) => {
    const diff = parseOrderDate(a.dataMaisAntiga) - parseOrderDate(b.dataMaisAntiga);
    if (diff !== 0) return diff;
    return a.marca.localeCompare(b.marca);
  });

  const totalGeralPendente = sortedSummaries.reduce((sum, c) => sum + c.totalPendente, 0);
  const totalPedidosAbertos = sortedSummaries.reduce((sum, c) => sum + c.qtdPedidos, 0);
  const now = new Date().toLocaleDateString('pt-BR') + ' às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 210, 36, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO GERAL - GESTÃO FINANCEIRA', 14, 16);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Resumo analítico de valores pendentes e idade dos pedidos', 14, 25);
  doc.text(`Emissão: ${now}`, 125, 25);

  // Summary Metrics Bar
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 42, 182, 24, 3, 3, 'FD');

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(9);
  doc.text('TOTAL DE CLIENTES DEVEDORES', 20, 50);
  doc.text('TOTAL DE PEDIDOS EM ABERTO', 80, 50);
  doc.text('TOTAL PENDENTE GERAL', 140, 50);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`${sortedSummaries.length}`, 20, 59);
  doc.text(`${totalPedidosAbertos}`, 80, 59);

  doc.setTextColor(220, 38, 38); // red-600
  doc.text(`${formatCurrency(totalGeralPendente)}`, 140, 59);

  // AutoTable for Customer Financial Details
  const tableData = sortedSummaries.map((s) => [
    s.marca,
    formatDateBR(s.dataMaisAntiga),
    s.qtdPedidos.toString(),
    formatCurrency(s.totalPendente),
  ]);

  autoTable(doc, {
    startY: 74,
    head: [['Marca / Cliente', 'Data Pedido Mais Antigo', 'Qtd. Pedidos', 'Valor Total Pendente']],
    body: tableData,
    foot: [['TOTAL GERAL', '-', totalPedidosAbertos.toString(), formatCurrency(totalGeralPendente)]],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      halign: 'left',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [220, 38, 38],
      fontStyle: 'bold',
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 45, halign: 'center' },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 42, halign: 'right' },
    },
    styles: {
      fontSize: 9,
      cellPadding: 4,
    },
  });

  // Footer page numbering
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Distribuidora de Frutas Traviu - Página ${i} de ${pageCount}`, 105, 290, { align: 'center' });
  }

  const filename = 'Relatorio_Geral_Financeiro.pdf';
  if (action === 'share') {
    await sharePDFDoc(doc, filename);
  } else {
    savePdf(doc, filename);
  }
}

/** Gera e baixa os 3 relatórios: 1 pedido, 2+ pedidos e boletos em atraso. */
// Lista de marcas salva no sistema (definida pelo App); quando existe, o 1º PDF dos 3 relatórios passa a ser "1 pedido + selecionadas".
let savedBrandsForAll: string[] = [];
export function setSavedBrandsForReports(brands: string[]) { savedBrandsForAll = Array.isArray(brands) ? brands : []; }

export async function generateAllReports(
  orders: Order[],
  boletos?: OverdueBoleto[],
  action: 'download' | 'share' = 'download',
  onProgress?: (msg: string) => void
) {
  const temLista = savedBrandsForAll.length > 0;
  if (temLista) {
    // 1º relatório = marcas com 1 pedido + marcas da lista salva (substitui o de "1 pedido" puro)
    onProgress?.('Gerando relatório (1/3): Marcas com 1 Pedido + selecionadas...');
    await generateSelectedBrandsPDF(orders, savedBrandsForAll, action, true);
  } else {
    onProgress?.('Gerando relatório (1/3): Marcas com 1 Pedido...');
    await generateOpenOrdersGridPDF(orders, action, '1_only');
  }
  await new Promise((r) => setTimeout(r, 800));
  onProgress?.('Gerando relatório (2/3): Marcas com 2 ou mais Pedidos...');
  await generateOpenOrdersGridPDF(orders, action, '2+');
  await new Promise((r) => setTimeout(r, 800));
  onProgress?.('Gerando relatório (3/3): Boletos em Atraso...');
  const fresh = await getFreshestBoletos(boletos);
  await generateOverdueBoletosGridPDF(fresh, action);
  onProgress?.('3 relatórios gerados com sucesso.');
}

export async function generateBothOpenOrdersReports(
  orders: Order[],
  action: 'download' | 'share' = 'download',
  onProgress?: (msg: string) => void,
  boletos?: OverdueBoleto[]
) {
  return generateAllReports(orders, boletos, action, onProgress);
}
