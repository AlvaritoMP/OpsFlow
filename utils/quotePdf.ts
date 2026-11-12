import type { jsPDF } from 'jspdf';
import { defaultCommercialTerms, fillQuoteTokens, formatQuoteDate, formatRatePercent, quoteMoney, QuoteConceptRow } from './quoteProposal';
import { annexNeedsLandscape, QuoteDocumentInput } from './quoteDocument';

type RGB = [number, number, number];

const NAVY: RGB = [20, 43, 82];
const RED: RGB = [179, 20, 31];
const INK: RGB = [17, 24, 39];
const SLATE: RGB = [71, 85, 105];
const LINE: RGB = [203, 213, 225];
const BAND: RGB = [241, 245, 249];
const CARD: RGB = [248, 250, 252];
const WHITE: RGB = [255, 255, 255];

const LETTER = [
  'La presente se relaciona con las coordinaciones sostenidas con nuestro equipo de trabajo, en las que nos manifestaron el interés de contar con los servicios de Opalo.',
  'Al respecto, ponemos a su disposición nuestra propuesta económica. Cada puesto se calculó con el mismo método de una liquidación: remuneración básica, asignación familiar, condición de trabajo, provisiones laborales y aportes y seguros de ley. El resumen añade los gastos operativos, los gastos administrativos y el margen de utilidad.',
];

const OPTIONAL_ROWS = new Set(['he25', 'he35', 'heNight25', 'heNight35', 'night', 'bonus', 'feria', 'vidaLey', 'sctr']);

interface LogoMark {
  dataUrl: string;
  format: 'JPEG' | 'PNG' | 'WEBP';
  aspect: number;
}

class Sheet {
  doc: jsPDF;
  pageW = 210;
  pageH = 297;
  mx = 16;
  y = 14;
  limit = 283;
  landscape = false;
  footerLeft = '';
  footerRight = '';

  constructor(doc: jsPDF) {
    this.doc = doc;
  }

  get width(): number {
    return this.pageW - this.mx * 2;
  }

  gap(mm: number): void {
    this.y += mm;
  }

  ensure(_height: number): void {
    // La vista previa mantiene la carta y el anexo cada uno en una sola hoja,
    // aunque el contenido supere el A4. Aquí no se inserta un salto interno:
    // la hoja crece al cerrar la sección.
  }

  paintFooter(): void {
    const y = this.pageH - 8;
    this.doc.setDrawColor(...LINE);
    this.doc.setLineWidth(0.2);
    this.doc.line(this.mx, y - 3, this.pageW - this.mx, y - 3);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(...SLATE);
    this.doc.text(this.footerLeft, this.mx, y);
    this.doc.text(this.footerRight, this.pageW - this.mx, y, { align: 'right' });
  }

  startAnnex(landscape: boolean, height?: number): void {
    this.landscape = landscape;
    this.pageW = landscape ? 297 : 210;
    this.pageH = height ?? 4000;
    this.limit = this.pageH;
    const orientation = this.pageW >= this.pageH ? 'landscape' : 'portrait';
    this.doc.addPage([this.pageW, this.pageH], orientation);
    this.y = 12;
  }
}

function pdfText(value: string): string {
  return String(value || '')
    .replaceAll('\u2014', ' - ')
    .replaceAll('\u2013', '-')
    .replaceAll('\u2018', "'")
    .replaceAll('\u2019', "'")
    .replaceAll('\u201c', '"')
    .replaceAll('\u201d', '"')
    .replaceAll('\u2026', '...')
    .replaceAll('\u00a0', ' ')
    .replaceAll('—', '-');
}

function imageFormat(url: string): LogoMark['format'] {
  if (url.includes('image/png')) return 'PNG';
  if (url.includes('image/webp')) return 'WEBP';
  return 'JPEG';
}

function groupTitle(group: string): string {
  if (group === 'remuneracion') return 'I. Remuneración';
  if (group === 'provisiones') return 'II. Provisiones laborales';
  return 'III. Aportes y seguros de ley';
}

async function cropLogo(src?: string): Promise<LogoMark | null> {
  if (!src) return null;
  const fallback = { dataUrl: src, aspect: 1054 / 530, format: imageFormat(src) };
  if (typeof document === 'undefined') return fallback;
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch {
    return fallback;
  }
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (!width || !height) return null;
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const sourceCtx = source.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx) return null;
  sourceCtx.drawImage(image, 0, 0);
  let pixels: Uint8ClampedArray;
  try {
    pixels = sourceCtx.getImageData(0, 0, width, height).data;
  } catch {
    return { dataUrl: src, aspect: width / height, format: imageFormat(src) };
  }
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const index = (y * width + x) * 4;
      if (pixels[index] < 248 || pixels[index + 1] < 248 || pixels[index + 2] < 248) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return { dataUrl: src, aspect: width / height, format: imageFormat(src) };
  const cropW = Math.min(width - minX, maxX - minX + 3);
  const cropH = Math.min(height - minY, maxY - minY + 3);
  const outW = 520;
  const outH = Math.max(1, Math.round(outW * (cropH / cropW)));
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const outCtx = out.getContext('2d');
  if (!outCtx) return { dataUrl: src, aspect: cropW / cropH, format: imageFormat(src) };
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, outW, outH);
  outCtx.drawImage(source, minX, minY, cropW, cropH, 0, 0, outW, outH);
  return { dataUrl: out.toDataURL('image/jpeg', 0.86), aspect: cropW / cropH, format: 'JPEG' };
}

function drawHeader(sheet: Sheet, logo: LogoMark | null, title: string, subtitle: string): void {
  const top = sheet.y;
  if (logo) {
    const logoH = Math.min(13.2, 42 / logo.aspect);
    const logoW = logoH * logo.aspect;
    sheet.doc.addImage(logo.dataUrl, logo.format, sheet.mx, top, logoW, logoH, 'opalo-logo');
  } else {
    sheet.doc.setFont('helvetica', 'bold');
    sheet.doc.setFontSize(16);
    sheet.doc.setTextColor(...NAVY);
    sheet.doc.text('Opalo', sheet.mx, top + 8);
  }
  sheet.doc.setFont('helvetica', 'bold');
  sheet.doc.setFontSize(11);
  sheet.doc.setTextColor(...NAVY);
  sheet.doc.text(pdfText(title), sheet.pageW - sheet.mx, top + 4.5, { align: 'right' });
  sheet.doc.setFont('helvetica', 'normal');
  sheet.doc.setFontSize(9);
  sheet.doc.setTextColor(51, 65, 85);
  sheet.doc.text(pdfText(subtitle), sheet.pageW - sheet.mx, top + 9.2, { align: 'right' });
  sheet.y = top + 15;
  sheet.doc.setDrawColor(...NAVY);
  sheet.doc.setLineWidth(0.55);
  sheet.doc.line(sheet.mx, sheet.y, sheet.pageW - sheet.mx, sheet.y);
  sheet.y += 3.5;
}

function drawBanner(sheet: Sheet, title: string, subtitle: string): void {
  sheet.doc.setFont('helvetica', 'bold');
  sheet.doc.setFontSize(11);
  const titleLines = sheet.doc.splitTextToSize(pdfText(title).toUpperCase(), sheet.width - 8);
  sheet.doc.setFont('helvetica', 'normal');
  sheet.doc.setFontSize(9);
  const subLines = subtitle ? sheet.doc.splitTextToSize(pdfText(subtitle), sheet.width - 8) : [];
  const height = 4 + titleLines.length * 4.6 + subLines.length * 3.8;
  sheet.ensure(height);
  const y = sheet.y;
  sheet.doc.setFillColor(...NAVY);
  sheet.doc.rect(sheet.mx, y, sheet.width, height, 'F');
  sheet.doc.setFillColor(...RED);
  sheet.doc.rect(sheet.mx, y, 1.6, height, 'F');
  sheet.doc.setFont('helvetica', 'bold');
  sheet.doc.setFontSize(11);
  sheet.doc.setTextColor(...WHITE);
  sheet.doc.text(titleLines, sheet.mx + 4, y + 5);
  if (subLines.length) {
    sheet.doc.setFont('helvetica', 'normal');
    sheet.doc.setFontSize(9);
    sheet.doc.setTextColor(226, 232, 240);
    sheet.doc.text(subLines, sheet.mx + 4, y + 5 + titleLines.length * 4.6);
  }
  sheet.y += height + 3;
}

function drawParagraph(sheet: Sheet, text: string, options?: { size?: number; bold?: boolean; color?: RGB; gap?: number }): void {
  const size = options?.size ?? 9.2;
  const lineH = size * 0.46;
  sheet.doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
  sheet.doc.setFontSize(size);
  const lines: string[] = sheet.doc.splitTextToSize(pdfText(text), sheet.width);
  sheet.ensure(lines.length * lineH);
  sheet.doc.setTextColor(...(options?.color || INK));
  sheet.doc.text(lines, sheet.mx, sheet.y + size * 0.32);
  sheet.y += lines.length * lineH + (options?.gap ?? 1.6);
}

function drawHeading(sheet: Sheet, text: string): void {
  sheet.ensure(18);
  sheet.doc.setFont('helvetica', 'bold');
  sheet.doc.setFontSize(9.5);
  sheet.doc.setTextColor(...NAVY);
  sheet.doc.text(pdfText(text).toUpperCase(), sheet.mx, sheet.y + 4);
  sheet.y += 5.4;
  sheet.doc.setDrawColor(...NAVY);
  sheet.doc.setLineWidth(0.35);
  sheet.doc.line(sheet.mx, sheet.y, sheet.pageW - sheet.mx, sheet.y);
  sheet.y += 2.2;
}

function drawTerm(sheet: Sheet, title: string, body: string): void {
  const size = 8.8;
  const lineH = 4.05;
  const label = title.trim() ? `${pdfText(title.trim())}.` : '';
  const words = pdfText(body).split(/\s+/).filter(Boolean);
  sheet.doc.setFontSize(size);
  const widthOf = (style: 'bold' | 'normal', value: string) => {
    sheet.doc.setFont('helvetica', style);
    return sheet.doc.getTextWidth(value);
  };
  const first: string[] = [];
  let used = label ? widthOf('bold', `${label} `) : 0;
  let index = 0;
  while (index < words.length) {
    const piece = `${first.length ? ' ' : ''}${words[index]}`;
    if (used + widthOf('normal', piece) > sheet.width && first.length) break;
    first.push(words[index]);
    used += widthOf('normal', piece);
    index += 1;
  }
  const rest: string[][] = [];
  let line: string[] = [];
  for (; index < words.length; index += 1) {
    const trial = [...line, words[index]].join(' ');
    if (widthOf('normal', trial) > sheet.width && line.length) {
      rest.push(line);
      line = [words[index]];
    } else {
      line.push(words[index]);
    }
  }
  if (line.length) rest.push(line);
  const lineCount = 1 + rest.length;
  sheet.ensure(lineCount * lineH);
  let y = sheet.y + 3.15;
  let x = sheet.mx;
  if (label) {
    sheet.doc.setFont('helvetica', 'bold');
    sheet.doc.setTextColor(...NAVY);
    sheet.doc.text(label, x, y);
    x += widthOf('bold', `${label} `);
  }
  sheet.doc.setFont('helvetica', 'normal');
  sheet.doc.setTextColor(...INK);
  sheet.doc.text(first.join(' '), x, y);
  for (const wordsLine of rest) {
    y += lineH;
    sheet.doc.text(wordsLine.join(' '), sheet.mx, y);
  }
  sheet.y += lineCount * lineH + 1.5;
}

interface Cell {
  text: string;
  width: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
}

function drawCells(sheet: Sheet, cells: Cell[], options: { fill: RGB; color: RGB; size: number; minH: number }): void {
  const pad = 1.3;
  sheet.doc.setFontSize(options.size);
  const wrapped = cells.map((cell) => {
    sheet.doc.setFont('helvetica', cell.bold ? 'bold' : 'normal');
    const lines: string[] = sheet.doc.splitTextToSize(pdfText(cell.text), Math.max(4, cell.width - pad * 2));
    return lines.length ? lines : [''];
  });
  const lineH = options.size * 0.3528 * 1.15;
  const height = Math.max(options.minH, Math.max(...wrapped.map((lines) => lines.length * lineH + 1.8)));
  sheet.ensure(height);
  const y = sheet.y;
  let x = sheet.mx;
  cells.forEach((cell, index) => {
    sheet.doc.setFillColor(...options.fill);
    sheet.doc.rect(x, y, cell.width, height, 'F');
    sheet.doc.setDrawColor(...(options.fill === NAVY ? NAVY : LINE));
    sheet.doc.setLineWidth(0.15);
    sheet.doc.rect(x, y, cell.width, height, 'S');
    const lines = wrapped[index];
    const blockH = lines.length * lineH;
    const baseline = y + (height - blockH) / 2 + options.size * 0.3;
    const align = cell.align || 'left';
    const textX = align === 'right' ? x + cell.width - pad : align === 'center' ? x + cell.width / 2 : x + pad;
    sheet.doc.setFont('helvetica', cell.bold ? 'bold' : 'normal');
    sheet.doc.setFontSize(options.size);
    sheet.doc.setTextColor(...options.color);
    sheet.doc.text(lines, textX, baseline, { align, lineHeightFactor: 1.15 });
    x += cell.width;
  });
  sheet.y += height;
}

function money(symbol: string, amount: number): string {
  return `${symbol} ${quoteMoney(amount)}`;
}

function drawSummary(sheet: Sheet, input: QuoteDocumentInput, symbol: string, igv: string, months: number, monthLabel: string): void {
  const service = input.payload.model.serviceLabel.trim() || 'Servicio';
  const vacancies = input.view.positions.reduce((sum, position) => sum + position.vacancies, 0);
  const note = `Valores expresados en ${input.payload.commercialTerms?.currencyName || 'Soles'} (${symbol}) sin incluir IGV.`;
  const amountW = 42;
  const itemW = 14;
  const qtyW = 14;
  const descW = sheet.width - amountW - itemW - qtyW;
  const head = { fill: NAVY, color: WHITE, size: 8, minH: 6 };
  const plain = { fill: WHITE, color: INK, size: 8, minH: 5.6 };
  const soft = { fill: CARD, color: INK, size: 8, minH: 5.6 };
  const total = { fill: NAVY, color: WHITE, size: 8, minH: 6 };
  drawCells(sheet, [{ text: note, width: sheet.width, bold: false }], { ...head, size: 7.4, minH: 5.4 });
  drawCells(
    sheet,
    [
      { text: 'Ítem', width: itemW, align: 'center', bold: true },
      { text: 'Cant.', width: qtyW, align: 'center', bold: true },
      { text: 'Descripción del servicio', width: descW, bold: true },
      { text: 'Total mes', width: amountW, align: 'right', bold: true },
    ],
    head
  );
  drawCells(
    sheet,
    [
      { text: '01', width: itemW, align: 'center' },
      { text: String(vacancies || 1), width: qtyW, align: 'center' },
      { text: service, width: descW, bold: true },
      { text: '', width: amountW, align: 'right' },
    ],
    plain
  );
  const category = (text: string, value: number) =>
    drawCells(
      sheet,
      [
        { text: '', width: itemW },
        { text: '', width: qtyW },
        { text, width: descW },
        { text: money(symbol, value), width: amountW, align: 'right' },
      ],
      plain
    );
  category('Costo laboral', input.view.computed.laborTotal);
  category('Costo operativo', input.view.computed.operationalTotal);
  category('Gastos administrativos', input.view.computed.adminTotal);
  category('Utilidad', input.view.computed.profitAmount);
  const label = (text: string, value: number, kind: 'soft' | 'plain' | 'total') =>
    drawCells(
      sheet,
      [
        { text, width: sheet.width - amountW, align: 'right', bold: kind !== 'plain' },
        { text: money(symbol, value), width: amountW, align: 'right', bold: kind !== 'plain' },
      ],
      kind === 'total' ? total : kind === 'soft' ? soft : plain
    );
  label('Subtotal neto', input.view.computed.grandTotal, 'soft');
  label(`IGV (${igv}%)`, input.view.computed.igvAmount, 'plain');
  label('Monto total facturado', input.view.computed.totalWithIgv, 'total');
  label(`Subtotal neto del periodo (${months} ${monthLabel})`, input.view.periodNet, 'soft');
  label(`IGV del periodo (${igv}%)`, input.view.periodIgv, 'plain');
  label('Monto total facturado del periodo', input.view.periodWithIgv, 'total');
}

function drawClient(sheet: Sheet, client: string, address: string, attention: string): void {
  const rows = [
    ['Cliente', client || 'Cliente'],
    ['Dirección', address || '-'],
    ['Atención', attention || '-'],
  ];
  const labelW = 32;
  const valueW = sheet.width - labelW - 4;
  sheet.doc.setFont('helvetica', 'normal');
  sheet.doc.setFontSize(9);
  const blocks = rows.map(([, value]) => sheet.doc.splitTextToSize(pdfText(value), valueW) as string[]);
  const rowH = blocks.map((lines) => Math.max(4.8, lines.length * 4));
  const height = rowH.reduce((sum, value) => sum + value, 0) + 2.4;
  sheet.ensure(height);
  const y0 = sheet.y;
  sheet.doc.setFillColor(...CARD);
  sheet.doc.setDrawColor(...LINE);
  sheet.doc.setLineWidth(0.2);
  sheet.doc.rect(sheet.mx, y0, sheet.width, height, 'FD');
  let y = y0 + 4;
  rows.forEach(([label], index) => {
    sheet.doc.setFont('helvetica', 'bold');
    sheet.doc.setFontSize(8);
    sheet.doc.setTextColor(...NAVY);
    sheet.doc.text(label.toUpperCase(), sheet.mx + 2, y);
    sheet.doc.setFont('helvetica', index === 0 ? 'bold' : 'normal');
    sheet.doc.setFontSize(9);
    sheet.doc.setTextColor(...INK);
    sheet.doc.text(blocks[index], sheet.mx + labelW, y);
    y += rowH[index];
  });
  sheet.y = y0 + height + 3.2;
}

function annexHeads(input: QuoteDocumentInput, conceptW: number, colW: number): Cell[] {
  const heads: Cell[] = [{ text: 'Concepto', width: conceptW, bold: true }];
  input.view.positions.forEach((position) => {
    const site = position.site ? ` · ${position.site}` : '';
    heads.push({
      text: `POSICIÓN ${position.item}: ${position.name}\n(costo de 1 puesto${site})`,
      width: colW,
      align: 'right',
      bold: true,
    });
  });
  heads.push({
    text: 'Suma de 1 puesto\nLa última línea ya multiplica la cantidad',
    width: colW,
    align: 'right',
    bold: true,
  });
  return heads;
}

function drawAnnexTable(sheet: Sheet, input: QuoteDocumentInput, symbol: string): void {
  const positions = input.view.positions;
  const count = Math.max(positions.length + 1, 1);
  const amountMin = 24;
  const conceptW = Math.min(108, Math.max(64, sheet.width - count * amountMin));
  const colW = (sheet.width - conceptW) / count;
  const size = colW < 22 ? 6.6 : 7.4;
  const note = `Valores expresados en ${input.payload.commercialTerms?.currencyName || 'Soles'} (${symbol}) sin incluir IGV.`;
  const headFill = { fill: NAVY, color: WHITE, size, minH: 8 };
  const paintHeads = () => {
    drawCells(sheet, [{ text: note, width: sheet.width }], { ...headFill, size: 7.2, minH: 5.2 });
    drawCells(sheet, annexHeads(input, conceptW, colW), headFill);
  };
  paintHeads();
  const concepts = input.view.concepts.filter(
    (concept) => !OPTIONAL_ROWS.has(concept.key) || concept.amounts.some((amount) => Math.abs(amount) >= 0.005)
  );
  let lastGroup = '';
  const paintConcept = (concept: QuoteConceptRow) => {
    if (!['laborUnit', 'quantity', 'labor'].includes(concept.key) && concept.group !== lastGroup) {
      lastGroup = concept.group;
      drawCells(
        sheet,
        [{ text: groupTitle(concept.group), width: sheet.width, bold: true }],
        { fill: BAND, color: NAVY, size: 7.2, minH: 5 }
      );
    }
    const finalRow = concept.emphasize === 'final';
    const show = (amount: number) => (concept.format === 'count' ? String(Math.round(amount)) : quoteMoney(amount));
    const cells: Cell[] = [{ text: concept.label, width: conceptW, bold: finalRow }];
    concept.amounts.forEach((amount) => cells.push({ text: show(amount), width: colW, align: 'right', bold: finalRow }));
    cells.push({ text: show(concept.total), width: colW, align: 'right', bold: finalRow });
    drawCells(sheet, cells, finalRow ? { fill: NAVY, color: WHITE, size, minH: 5.2 } : { fill: WHITE, color: INK, size, minH: 4.8 });
  };
  if (!concepts.length) {
    drawCells(sheet, [{ text: 'No hay puestos incluidos.', width: sheet.width }], { fill: WHITE, color: INK, size, minH: 6 });
  } else {
    concepts.forEach(paintConcept);
  }
}

function drawCostTable(sheet: Sheet, title: string, rows: Array<{ description: string; amount: number }>, subtotalLabel: string, subtotal: number, symbol: string, note: string): void {
  if (!rows.length) return;
  drawHeading(sheet, title);
  const amountW = 46;
  const labelW = sheet.width - amountW;
  const head = { fill: NAVY, color: WHITE, size: 7.4, minH: 5.2 };
  drawCells(sheet, [{ text: note, width: sheet.width }], head);
  drawCells(
    sheet,
    [
      { text: 'Concepto', width: labelW, bold: true },
      { text: 'Total mes', width: amountW, align: 'right', bold: true },
    ],
    { ...head, size: 8 }
  );
  rows.forEach((row) => {
    drawCells(
      sheet,
      [
        { text: row.description || title, width: labelW },
        { text: money(symbol, row.amount), width: amountW, align: 'right' },
      ],
      { fill: WHITE, color: INK, size: 8, minH: 5 }
    );
  });
  drawCells(
    sheet,
    [
      { text: subtotalLabel, width: labelW, bold: true },
      { text: money(symbol, subtotal), width: amountW, align: 'right', bold: true },
    ],
    { fill: CARD, color: INK, size: 8, minH: 5.2 }
  );
}

function drawClosing(sheet: Sheet, input: QuoteDocumentInput, symbol: string, igv: string, months: number, monthLabel: string): void {
  const amountW = 52;
  const labelW = sheet.width - amountW;
  const rows: Array<{ text: string; amount: number; kind: 'plain' | 'soft' | 'total' }> = [
    { text: 'Margen de utilidad', amount: input.view.computed.profitAmount, kind: 'plain' },
    { text: 'Subtotal neto', amount: input.view.computed.grandTotal, kind: 'soft' },
    { text: `IGV (${igv}%)`, amount: input.view.computed.igvAmount, kind: 'plain' },
    { text: 'Monto total facturado', amount: input.view.computed.totalWithIgv, kind: 'total' },
    { text: `Subtotal neto del periodo (${months} ${monthLabel})`, amount: input.view.periodNet, kind: 'soft' },
    { text: `IGV del periodo (${igv}%)`, amount: input.view.periodIgv, kind: 'plain' },
    { text: 'Monto total facturado del periodo', amount: input.view.periodWithIgv, kind: 'total' },
  ];
  sheet.gap(2);
  rows.forEach((row) => {
    const kind = row.kind === 'total' ? { fill: NAVY, color: WHITE } : row.kind === 'soft' ? { fill: CARD, color: INK } : { fill: WHITE, color: INK };
    drawCells(
      sheet,
      [
        { text: row.text, width: labelW, bold: row.kind !== 'plain' },
        { text: money(symbol, row.amount), width: amountW, align: 'right', bold: row.kind !== 'plain' },
      ],
      { ...kind, size: 8, minH: 5.2 }
    );
  });
}

function drawNotes(sheet: Sheet, notes: string[]): void {
  sheet.gap(2);
  sheet.ensure(8);
  const y = sheet.y;
  sheet.doc.setDrawColor(148, 163, 184);
  sheet.doc.setLineWidth(0.5);
  sheet.doc.line(sheet.mx, y, sheet.mx, y + 5);
  sheet.doc.setFont('helvetica', 'bold');
  sheet.doc.setFontSize(8);
  sheet.doc.setTextColor(...SLATE);
  sheet.doc.text('Notas de cálculo y consideraciones laborales', sheet.mx + 2.5, y + 3.4);
  sheet.y = y + 6;
  if (!notes.length) {
    drawParagraph(sheet, 'Esta propuesta no incluye notas adicionales.', { size: 8, color: SLATE, gap: 1 });
    return;
  }
  notes.forEach((note) => {
    const size = 8;
    const lineH = 3.6;
    sheet.doc.setFont('helvetica', 'normal');
    sheet.doc.setFontSize(size);
    const lines: string[] = sheet.doc.splitTextToSize(pdfText(note), sheet.width - 6);
    sheet.ensure(lines.length * lineH + 0.8);
    sheet.doc.setTextColor(...SLATE);
    sheet.doc.text('•', sheet.mx + 2.5, sheet.y + 3);
    sheet.doc.text(lines, sheet.mx + 6, sheet.y + 3);
    sheet.y += lines.length * lineH + 0.8;
  });
}

interface QuotePageSize {
  coverH: number;
  annexW: number;
  annexH: number;
}

/** Alto de la hoja: el A4 de la vista previa, o más si el contenido no cabe. */
function fittedHeight(contentY: number, standard: number): number {
  return Math.max(standard, Math.ceil((contentY + 14) * 10) / 10);
}

function compose(doc: jsPDF, input: QuoteDocumentInput, logo: LogoMark | null, fixed?: QuotePageSize): QuotePageSize {
  const sheet = new Sheet(doc);
  if (fixed) {
    sheet.pageH = fixed.coverH;
    sheet.limit = fixed.coverH;
  }
  const payload = input.payload;
  const terms = payload.commercialTerms || defaultCommercialTerms();
  const symbol = terms.currencySymbol || 'S/';
  const months = Math.max(1, payload.months || 1);
  const monthLabel = months === 1 ? 'mes' : 'meses';
  const igv = formatRatePercent(payload.model.rates.igvRate);
  const fill = (text: string) => fillQuoteTokens(text, months, igv);
  const code = input.code.trim() || 'PES';
  const client = input.clientName.trim() || 'Cliente';
  const title = payload.model.title.trim() || 'PROPUESTA TÉCNICO ECONÓMICA DE SERVICIOS';
  const service = payload.model.serviceLabel.trim() || 'Servicio';
  const note = `Valores expresados en ${terms.currencyName} (${symbol}) sin incluir IGV.`;

  sheet.footerLeft = 'Opalo · Propuesta de servicios';
  sheet.footerRight = code;
  drawHeader(sheet, logo, code, formatQuoteDate(payload.issueDate));
  drawBanner(sheet, title, service);
  drawClient(sheet, client, payload.address, payload.attention);
  drawParagraph(sheet, 'De nuestra consideración:', { size: 9.5, bold: true, gap: 1.2 });
  LETTER.forEach((paragraph) => drawParagraph(sheet, paragraph));
  drawHeading(sheet, '1. Alcance del servicio');
  const scope = String(payload.serviceScope || '').trim();
  if (scope) drawParagraph(sheet, fill(scope));
  drawHeading(sheet, '2. Resumen de la oferta económica');
  drawSummary(sheet, input, symbol, igv, months, monthLabel);
  sheet.gap(1.5);
  drawParagraph(sheet, 'El importe del servicio es el total mensual sin IGV. El anexo detalla los puestos, las provisiones, los aportes, los gastos y el margen.', { size: 9 });
  drawHeading(sheet, '3. Condiciones del servicio');
  drawTerm(sheet, 'Modalidad y Plazo', `Duración del contrato: ${months} ${monthLabel}. Días estimados para la implementación: ${terms.implementationDays} días calendario luego de la suscripción contractual.`);
  drawTerm(sheet, 'Facturación y Pago', `Moneda de cotización: ${terms.currencyName} (${symbol}). Condiciones de crédito: ${terms.creditDays} días. Fecha de corte: ${terms.billingCutoff}. Emisión de factura: ${terms.invoiceIssue}.`);
  drawTerm(sheet, 'Vigencia de la Oferta', `La cotización económica tiene una vigencia de ${terms.offerValidityDays} días calendario.`);
  payload.clauses
    .filter((clause) => clause.title.trim() || clause.text.trim())
    .forEach((clause) => drawTerm(sheet, clause.title, fill(clause.text)));

  const landscape = annexNeedsLandscape(input.view.positions.length);
  const coverH = fixed?.coverH ?? fittedHeight(sheet.y, 297);
  if (fixed) sheet.paintFooter();
  sheet.footerLeft = 'Opalo · Anexo de costos de personal';
  sheet.startAnnex(landscape, fixed?.annexH);
  drawHeader(sheet, logo, 'ANEXO 1', `Ref: ${code}`);
  drawBanner(sheet, 'Anexo 1: Desglose y estructura económica de personal', `Cliente: ${client} · ${note} · Cada columna es el costo de 1 puesto. La cantidad se aplica en la línea de costo laboral total`);
  drawParagraph(sheet, 'Cada puesto detalla la remuneración, las provisiones y los aportes de 1 persona. La cantidad indicada multiplica ese costo en la línea de costo laboral total. Debajo se agregan los gastos operativos, los gastos administrativos y el margen de utilidad.', { size: 8.5 });
  drawAnnexTable(sheet, input, symbol);
  const operational = (payload.model.operational || [])
    .map((line, index) => ({ description: line.description, amount: input.view.computed.operational[index]?.amount || 0 }))
    .filter((line) => Math.abs(line.amount) >= 0.005);
  const administrative = (payload.model.administrative || [])
    .map((line, index) => ({ description: line.description, amount: input.view.computed.administrative[index]?.amount || 0 }))
    .filter((line) => Math.abs(line.amount) >= 0.005);
  drawCostTable(sheet, 'Gastos operativos', operational, 'Subtotal de gastos operativos', input.view.computed.operationalTotal, symbol, note);
  drawCostTable(sheet, 'Gastos administrativos', administrative, 'Subtotal de gastos administrativos', input.view.computed.adminTotal, symbol, note);
  drawClosing(sheet, input, symbol, igv, months, monthLabel);
  const notes = payload.notes.map((item) => fill(item).trim()).filter(Boolean);
  drawNotes(sheet, notes);
  const annexH = fixed?.annexH ?? fittedHeight(sheet.y, landscape ? 210 : 297);
  if (fixed) {
    sheet.paintFooter();
    doc.setProperties({
      title: `${code} · ${client}`,
      subject: 'Propuesta técnico económica',
      creator: 'OpsFlow',
    });
  }
  return { coverH, annexW: landscape ? 297 : 210, annexH };
}

export async function buildQuotePdf(input: QuoteDocumentInput): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  const logo = await cropLogo(input.logoUrl);
  const probe = new jsPDF({ unit: 'mm', format: [210, 4000], orientation: 'portrait', compress: true });
  const size = compose(probe, input, logo);
  const doc = new jsPDF({
    unit: 'mm',
    format: [210, size.coverH],
    orientation: size.coverH >= 210 ? 'portrait' : 'landscape',
    compress: true,
  });
  compose(doc, input, logo, size);
  return doc;
}

export async function downloadQuotePdf(input: QuoteDocumentInput, fileName: string): Promise<void> {
  const doc = await buildQuotePdf(input);
  const safeName = fileName.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'propuesta';
  doc.save(safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`);
}
