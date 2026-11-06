import { defaultCommercialTerms, formatRatePercent, fillQuoteTokens, formatQuoteDate, quoteMoney, QuoteProposalPayload, QuoteView } from './quoteProposal';

export interface QuoteDocumentInput {
  code: string;
  clientName: string;
  payload: QuoteProposalPayload;
  view: QuoteView;
  logoUrl?: string;
}

const LETTER = [
  'La presente se relaciona con las coordinaciones sostenidas con nuestro equipo de trabajo, en las que nos manifestaron el interés de contar con los servicios de Opalo.',
  'Al respecto, ponemos a su disposición nuestra propuesta económica. Cada puesto se calculó con el mismo método de una liquidación: remuneración básica, asignación familiar, condición de trabajo, provisiones laborales y aportes y seguros de ley. El resumen añade los gastos operativos, los gastos administrativos y el margen de utilidad.',
];

export function buildQuoteDocument(input: QuoteDocumentInput): string {
  const { payload, view } = input;
  const igv = formatRatePercent(payload.model.rates.igvRate);
  const months = Math.max(1, payload.months || 1);
  const money = quoteMoney;
  const client = input.clientName.trim() || 'Cliente';
  const service = payload.model.serviceLabel.trim() || 'Servicio';
  const title = payload.model.title.trim() || 'PROPUESTA TÉCNICO ECONÓMICA DE SERVICIOS';
  const code = input.code.trim() || 'PES';
  const fill = (text: string) => fillQuoteTokens(text, months, igv);
  const terms = payload.commercialTerms || defaultCommercialTerms();
  const symbol = terms.currencySymbol || 'S/';
  const moneyNote = `Valores expresados en ${terms.currencyName} (${symbol}) sin incluir IGV.`;
  const columns = Math.max(view.positions.length + 2, 2);
  const share = view.positions.length ? (100 - 36) / (view.positions.length + 1) : 32;

  const summaryRows = view.summary
    .filter((row) => row.kind === 'position' || row.kind === 'profit' || Math.abs(row.amount) >= 0.005)
    .map((row) => {
      const prefix = row.kind === 'ops' ? 'Gastos operativos · ' : row.kind === 'admin' ? 'Gastos administrativos · ' : '';
      const description = row.kind === 'profit' ? 'Margen de utilidad' : row.description;
      return `<tr>
        <td class="text-center">${esc(row.item)}</td>
        <td class="text-center">${esc(row.quantity)}</td>
        <td>${prefix ? `<span class="muted">${prefix}</span>` : ''}<strong>${esc(description)}</strong></td>
        <td class="text-right">${esc(symbol)} ${money(row.amount)}</td>
      </tr>`;
    })
    .join('');

  const positionHeads = view.positions
    .map(
      (position) => `<th class="text-right">POSICIÓN ${esc(position.item)}: ${esc(position.name)}<br><span class="th-sub">(${position.vacancies} vacante${position.vacancies === 1 ? '' : 's'}${position.site ? ` · ${esc(position.site)}` : ''})</span></th>`
    )
    .join('');

  const optionalRows = new Set(['he25', 'he35', 'heNight25', 'heNight35', 'night', 'bonus', 'feria', 'vidaLey', 'sctr']);
  let lastGroup = '';
  const conceptRows = view.concepts
    .filter((concept) => !optionalRows.has(concept.key) || concept.amounts.some((amount) => Math.abs(amount) >= 0.005))
    .map((concept) => {
      const header =
        concept.key === 'labor'
          ? ''
          : concept.group !== lastGroup
            ? ((lastGroup = concept.group),
              `<tr class="subhead-row"><td colspan="${columns}">${groupTitle(concept.group)}</td></tr>`)
            : '';
      const cells = concept.amounts.map((amount) => `<td class="text-right">${money(amount)}</td>`).join('');
      const klass = concept.emphasize === 'final' ? 'row-total-final' : concept.emphasize === 'sub' ? 'row-highlight' : '';
      return `${header}<tr class="${klass}"><td>${esc(concept.label)}</td>${cells}<td class="text-right">${money(concept.total)}</td></tr>`;
    })
    .join('');

  const costRows = (title: string, rows: Array<{ description: string; amount: number }>, subtotalLabel: string, subtotal: number) => {
    if (!rows.length) return '';
    const body = rows
      .map(
        (row) =>
          `<tr><td>${esc(row.description || title)}</td><td class="text-right">${esc(symbol)} ${money(row.amount)}</td></tr>`
      )
      .join('');
    return `<h2 class="section-heading">${esc(title)}</h2>
      <table class="data-table">
        <thead>
          <tr><th colspan="2" class="money-head">${esc(moneyNote)}</th></tr>
          <tr><th>Concepto</th><th class="text-right" style="width: 28%;">Total mes</th></tr>
        </thead>
        <tbody>
          ${body}
          <tr class="row-highlight"><td>${esc(subtotalLabel)}</td><td class="text-right">${esc(symbol)} ${money(subtotal)}</td></tr>
        </tbody>
      </table>`;
  };

  const operational = (payload.model.operational || [])
    .map((line, index) => ({
      description: line.description,
      amount: view.computed.operational[index]?.amount || 0,
    }))
    .filter((line) => Math.abs(line.amount) >= 0.005);
  const administrative = (payload.model.administrative || [])
    .map((line, index) => ({
      description: line.description,
      amount: view.computed.administrative[index]?.amount || 0,
    }))
    .filter((line) => Math.abs(line.amount) >= 0.005);
  const clauses = payload.clauses.filter((clause) => clause.title.trim() || clause.text.trim());
  const monthLabel = months === 1 ? 'mes' : 'meses';
  const conditionBlocks = [
    [
      'Modalidad y Plazo',
      `Duración del contrato: ${months} ${monthLabel}. Días estimados para la implementación: ${terms.implementationDays} días calendario luego de la suscripción contractual.`,
    ],
    [
      'Facturación y Pago',
      `Moneda de cotización: ${terms.currencyName} (${symbol}). Condiciones de crédito: ${terms.creditDays} días. Fecha de corte: ${terms.billingCutoff}. Emisión de factura: ${terms.invoiceIssue}.`,
    ],
    [
      'Vigencia de la Oferta',
      `La cotización económica tiene una vigencia de ${terms.offerValidityDays} días calendario.`,
    ],
  ];
  const specificConditions = clauses.length
    ? `<div class="term-block"><strong>Condiciones específicas.</strong>${clauses
        .map((clause) => `<p>${clause.title.trim() ? `<strong>${esc(clause.title.trim())}.</strong> ` : ''}${esc(fill(clause.text))}</p>`)
        .join('')}</div>`
    : '';
  const conditionsHtml = `${conditionBlocks
    .map(([heading, text]) => `<p class="term-block"><strong>${esc(heading)}.</strong> ${esc(text)}</p>`)
    .join('')}${specificConditions}`;
  const notes = payload.notes.map((note) => note.trim()).filter(Boolean);
  const logo = input.logoUrl
    ? `<img src="${esc(input.logoUrl)}" alt="Opalo" class="logo-img">`
    : '<div class="logo-word">OPALO</div>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${esc(code)} · ${esc(client)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    @page anexo { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; color: #111827; background: #e2e8f0; }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto 16px;
      padding: 14mm 16mm 12mm;
      background: #fff;
      display: flex;
      flex-direction: column;
    }
    .page-anexo { page: anexo; width: 297mm; min-height: 210mm; break-before: page; page-break-before: always; }
    .page-content { flex: 1; }
    .page-content > * + * { margin-top: 12px; }
    .page-footer {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px solid #cbd5e1;
      display: flex;
      justify-content: space-between;
      font-size: 8.5pt;
      color: #475569;
    }
    :root { --navy: #142b52; --red: #b3141f; --line: #cbd5e1; }
    .top-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--navy); padding-bottom: 8px; }
    .logo-img { height: 42px; width: auto; display: block; }
    .logo-word { font-size: 18pt; font-weight: 800; letter-spacing: 0.16em; color: var(--navy); }
    .doc-code { font-size: 11pt; font-weight: bold; color: var(--navy); text-align: right; }
    .doc-date { font-size: 9pt; color: #334155; margin-top: 3px; text-align: right; }
    .title-banner { background: var(--navy); color: #fff; padding: 9px 14px; border-left: 5px solid var(--red); }
    .title-banner h1 { margin: 0; font-size: 11.5pt; letter-spacing: 0.4px; text-transform: uppercase; }
    .title-banner .subtext { margin-top: 3px; font-size: 9pt; color: #e2e8f0; }
    .client-card { border: 1px solid var(--line); background: #f8fafc; padding: 9px 12px; }
    .client-grid { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .client-grid td { padding: 2px 4px; vertical-align: top; }
    .lbl { width: 18%; font-weight: bold; color: var(--navy); font-size: 8.5pt; text-transform: uppercase; }
    .letter-salute { font-size: 9.5pt; font-weight: bold; }
    p.letter-body { font-size: 9.2pt; line-height: 1.5; margin: 0 0 8px; text-align: justify; }
    h2.section-heading { font-size: 9.5pt; color: var(--navy); text-transform: uppercase; border-bottom: 1.5px solid var(--navy); padding-bottom: 3px; margin: 12px 0 8px; }
    table.data-table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 8px; }
    table.data-table th { background: var(--navy); color: #fff; text-align: left; padding: 5px 6px; border: 1px solid var(--navy); vertical-align: bottom; }
    table.data-table td { padding: 4px 6px; border: 1px solid #cbd5e1; vertical-align: middle; }
    .th-sub { font-weight: normal; font-size: 7.4pt; }
    .money-head { font-weight: normal; text-transform: none; letter-spacing: 0; font-size: 7.5pt; text-align: left; }
    .subhead-row td { background: #f1f5f9; font-weight: bold; color: var(--navy); text-transform: uppercase; font-size: 7.6pt; }
    .row-highlight td { background: #f8fafc; font-weight: bold; }
    .row-total-final td { background: var(--navy); color: #fff; font-weight: bold; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .muted { color: #64748b; font-weight: normal; }
    ol.terms-list { margin: 0; padding-left: 18px; font-size: 8.8pt; line-height: 1.45; }
    ol.terms-list li { margin-bottom: 5px; text-align: justify; }
    .term-block { margin: 0 0 8px; font-size: 8.8pt; line-height: 1.45; text-align: justify; }
    .term-block > strong { color: var(--navy); }
    .term-block p { margin: 3px 0 0; }
    .anexo-header-box { border-left: 5px solid var(--red); background: #f8fafc; padding: 8px 12px; border-top: 1px solid var(--line); border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    .anexo-title { margin: 0; font-size: 11pt; color: var(--navy); text-transform: uppercase; }
    .anexo-subtitle { font-size: 8.5pt; color: #475569; margin-top: 3px; }
    .notice-note { font-size: 8pt; color: #475569; line-height: 1.45; border-left: 2px solid #94a3b8; padding-left: 8px; }
    .notice-note li { margin: 0 0 3px; }
    @media print {
      body { background: #fff; }
      .page { margin: 0; box-shadow: none; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      thead { display: table-header-group; }
      tr, .notice-note, .client-card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <section class="page">
    <div class="page-content">
      <div class="top-header">
        <div>${logo}</div>
        <div>
          <div class="doc-code">${esc(code)}</div>
          <div class="doc-date">${esc(formatQuoteDate(payload.issueDate))}</div>
        </div>
      </div>
      <div class="title-banner">
        <h1>${esc(title)}</h1>
        <div class="subtext">${esc(service)}</div>
      </div>
      <div class="client-card">
        <table class="client-grid">
          <tr><td class="lbl">Cliente</td><td><strong>${esc(client)}</strong></td></tr>
          <tr><td class="lbl">Dirección</td><td>${esc(payload.address || '—')}</td></tr>
          <tr><td class="lbl">Atención</td><td>${esc(payload.attention || '—')}</td></tr>
        </table>
      </div>
      <div class="letter-salute">De nuestra consideración:</div>
      ${LETTER.map((paragraph) => `<p class="letter-body">${esc(paragraph)}</p>`).join('')}
      <h2 class="section-heading">1. Resumen de la oferta económica</h2>
      <table class="data-table">
        <thead>
          <tr><th colspan="4" class="money-head">${esc(moneyNote)}</th></tr>
          <tr>
            <th style="width: 8%;" class="text-center">Ítem</th>
            <th style="width: 8%;" class="text-center">Cant.</th>
            <th>Descripción</th>
            <th style="width: 24%;" class="text-right">Total mes</th>
          </tr>
        </thead>
        <tbody>
          ${summaryRows || '<tr><td colspan="4">No hay puestos incluidos en esta propuesta.</td></tr>'}
          <tr class="row-highlight"><td colspan="3" class="text-right">Subtotal neto</td><td class="text-right">${esc(symbol)} ${money(view.computed.grandTotal)}</td></tr>
          <tr><td colspan="3" class="text-right">IGV (${esc(igv)}%)</td><td class="text-right">${esc(symbol)} ${money(view.computed.igvAmount)}</td></tr>
          <tr class="row-total-final"><td colspan="3" class="text-right">Monto total facturado</td><td class="text-right">${esc(symbol)} ${money(view.computed.totalWithIgv)}</td></tr>
          <tr class="row-highlight"><td colspan="3" class="text-right">Subtotal neto del periodo (${months} ${monthLabel})</td><td class="text-right">${esc(symbol)} ${money(view.periodNet)}</td></tr>
          <tr><td colspan="3" class="text-right">IGV del periodo (${esc(igv)}%)</td><td class="text-right">${esc(symbol)} ${money(view.periodIgv)}</td></tr>
          <tr class="row-total-final"><td colspan="3" class="text-right">Monto total facturado del periodo</td><td class="text-right">${esc(symbol)} ${money(view.periodWithIgv)}</td></tr>
        </tbody>
      </table>
      <p class="letter-body">El importe de cada puesto es su costo laboral, ya multiplicado por las vacantes. Los gastos operativos, los gastos administrativos y el margen de utilidad se suman sobre la propuesta.</p>
      <h2 class="section-heading">2. Condiciones del servicio</h2>
      ${conditionsHtml}
    </div>
    <footer class="page-footer"><span>Opalo · Propuesta de servicios</span><span>${esc(code)}</span></footer>
  </section>
  <section class="page page-anexo">
    <div class="page-content">
      <div class="top-header">
        <div>${logo}</div>
        <div>
          <div class="doc-code">ANEXO 1</div>
          <div class="doc-date">Ref: ${esc(code)}</div>
        </div>
      </div>
      <div class="anexo-header-box">
        <h2 class="anexo-title">Anexo 1: Desglose y estructura económica de personal</h2>
        <div class="anexo-subtitle">Cliente: <strong>${esc(client)}</strong> · ${esc(moneyNote)} · Los importes de cada columna corresponden a todas las vacantes del puesto</div>
      </div>
      <p class="letter-body">Cada puesto detalla la remuneración básica, la asignación familiar, la condición de trabajo, las provisiones laborales y los aportes y seguros de ley. Debajo se agregan los gastos operativos, los gastos administrativos y el margen de utilidad.</p>
      <table class="data-table">
        <colgroup>
          <col style="width: 36%;">
          ${view.positions.map(() => `<col style="width: ${share}%;">`).join('')}
          <col style="width: ${share}%;">
        </colgroup>
        <thead>
          <tr>
            <th class="money-head" colspan="${columns}">${esc(moneyNote)}</th>
          </tr>
          <tr>
            <th>Concepto</th>
            ${positionHeads}
            <th class="text-right">Total mensual consolidado<br><span class="th-sub">(${esc(terms.currencyName)} ${esc(symbol)})</span></th>
          </tr>
        </thead>
        <tbody>
          ${conceptRows || `<tr><td colspan="${columns}">No hay puestos incluidos.</td></tr>`}
        </tbody>
      </table>
      ${costRows('Gastos operativos', operational, 'Subtotal de gastos operativos', view.computed.operationalTotal)}
      ${costRows('Gastos administrativos', administrative, 'Subtotal de gastos administrativos', view.computed.adminTotal)}
      <table class="data-table">
        <tbody>
          <tr><td>Margen de utilidad</td><td class="text-right" style="width: 28%;">${esc(symbol)} ${money(view.computed.profitAmount)}</td></tr>
          <tr class="row-highlight"><td>Subtotal neto</td><td class="text-right">${esc(symbol)} ${money(view.computed.grandTotal)}</td></tr>
          <tr><td>IGV (${esc(igv)}%)</td><td class="text-right">${esc(symbol)} ${money(view.computed.igvAmount)}</td></tr>
          <tr class="row-total-final"><td>Monto total facturado</td><td class="text-right">${esc(symbol)} ${money(view.computed.totalWithIgv)}</td></tr>
          <tr class="row-highlight"><td>Subtotal neto del periodo (${months} ${monthLabel})</td><td class="text-right">${esc(symbol)} ${money(view.periodNet)}</td></tr>
          <tr><td>IGV del periodo (${esc(igv)}%)</td><td class="text-right">${esc(symbol)} ${money(view.periodIgv)}</td></tr>
          <tr class="row-total-final"><td>Monto total facturado del periodo</td><td class="text-right">${esc(symbol)} ${money(view.periodWithIgv)}</td></tr>
        </tbody>
      </table>
      <div class="notice-note">
        <strong>Notas de cálculo y consideraciones laborales</strong>
        ${
          notes.length
            ? `<ul>${notes.map((note) => `<li>${esc(fill(note))}</li>`).join('')}</ul>`
            : '<p>Esta propuesta no incluye notas adicionales.</p>'
        }
      </div>
    </div>
    <footer class="page-footer"><span>Opalo · Anexo de costos de personal</span><span>${esc(code)}</span></footer>
  </section>
</body>
</html>`;
}

export function printQuoteDocument(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  window.setTimeout(() => {
    win.focus();
    win.print();
  }, 350);
  return true;
}

function groupTitle(group: string): string {
  if (group === 'remuneracion') return 'I. Remuneración';
  if (group === 'provisiones') return 'II. Provisiones laborales';
  return 'III. Aportes y seguros de ley';
}

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
