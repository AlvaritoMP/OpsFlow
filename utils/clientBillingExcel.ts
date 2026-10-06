import * as ExcelJS from 'exceljs';
import {
  BillingComputation,
  BillingCostLine,
  BillingRates,
  BillingWorkerInput,
  ClientBillingModel,
  ComputedWorker,
  formatAttendanceRange,
  formatPeriodLabel,
  inclusiveDayCount,
  resolveAttendanceWindow,
} from './clientBillingCalc';

export interface ClientBillingExcelInput {
  clientName: string;
  unitName: string;
  periodMonth: string;
  model: ClientBillingModel;
  computed: BillingComputation;
}

const FONT = 'Calibri';
const NAVY = 'FF1F4E79';
const INK = 'FF1F2933';
const MUTED = 'FF5B6770';
const LINE = 'FFBFCBD9';
const ZEBRAS = 'FFF4F7FB';
const SUBTOTAL = 'FFE7EEF5';
const MONEY = '#,##0.00';

const KIND_LABELS: Record<string, string> = {
  materiales: 'Materiales',
  equipos: 'Equipos',
  maquinaria: 'Maquinaria',
  otros: 'Otros',
  financiero: 'Costo financiero',
  gestion_rrhh: 'Gestión de recurso humano',
  estructura: 'Estructura',
};

type GroupId = 'personal' | 'sueldo' | 'cargas' | 'costo';

interface WorkerRow {
  name: string;
  position: string;
  days: number;
  absences: number;
  basic: number;
  family: number;
  he25: number;
  he35: number;
  night: number;
  remLlss: number;
  condition: number;
  bonus: number;
  remTotal: number;
  vacation: number;
  gratification: number;
  cts: number;
  feria: number;
  essalud: number;
  vidaLey: number;
  sctr: number;
  monthly: number;
  factor: number;
  total: number;
}

interface SheetColumn {
  header: string;
  width: number;
  group: GroupId;
  kind: 'text' | 'int' | 'money' | 'factor';
  pick: (row: WorkerRow) => string | number;
}

const GROUP_TITLE: Record<GroupId, string> = {
  personal: 'Personal',
  sueldo: 'Estructura de sueldo',
  cargas: 'Cargas sociales',
  costo: 'Costo',
};

const GROUP_FILL: Record<GroupId, string> = {
  personal: 'FFE8EEF4',
  sueldo: 'FFD6E3F0',
  cargas: 'FFE3EEDC',
  costo: 'FFFDE9D9',
};

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: LINE } },
  left: { style: 'thin', color: { argb: LINE } },
  bottom: { style: 'thin', color: { argb: LINE } },
  right: { style: 'thin', color: { argb: LINE } },
};

export function clientBillingExcelFilename(unitName: string, periodMonth: string): string {
  const safeName = `${unitName}-${periodMonth}`.replace(/[^\w\-]+/g, '_');
  return `Facturacion_${safeName}.xlsx`;
}

export async function downloadClientBillingExcel(input: ClientBillingExcelInput): Promise<void> {
  const workbook = await buildClientBillingWorkbook(input);
  const raw = await workbook.xlsx.writeBuffer();
  const blob = new Blob([raw as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = clientBillingExcelFilename(input.unitName, input.periodMonth);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function buildClientBillingWorkbook(input: ClientBillingExcelInput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OpsFlow';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.title = input.model.title || `Facturación ${input.clientName}`;

  const sheet = workbook.addWorksheet('Facturación', {
    views: [{ showGridLines: false, zoomScale: 90 }],
    properties: { defaultRowHeight: 15, tabColor: { argb: NAVY } },
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      verticalCentered: false,
      margins: { left: 0.4, right: 0.4, top: 0.48, bottom: 0.42, header: 0.18, footer: 0.2 },
    },
  });

  const columns = sheetColumns(input.model.rates);
  const lastCol = columns.length;
  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });

  const attendance = resolveAttendanceWindow(input.periodMonth, input.model.attendanceFrom, input.model.attendanceTo);
  const corteDays = inclusiveDayCount(attendance.from, attendance.to);
  let row = 1;
  writeBanner(sheet, row, lastCol, input.clientName || input.model.title || 'Facturación', 16, true, 24);
  row += 1;
  const title = input.model.title.trim();
  const client = input.clientName.trim();
  const subtitle = [
    title && title.toLocaleLowerCase() !== client.toLocaleLowerCase() ? title : '',
    input.unitName,
    formatPeriodLabel(input.periodMonth),
    `Corte ${formatAttendanceRange(attendance.from, attendance.to)} (${corteDays} días)`,
  ]
    .filter(Boolean)
    .join('  ·  ');
  writeBanner(sheet, row, lastCol, subtitle, 10, false, 18);
  row += 1;
  writeBanner(sheet, row, lastCol, input.model.serviceLabel || 'Servicio facturado', 10, false, 16, true);
  row += 1;
  writeBanner(sheet, row, lastCol, methodNote(input.model.rates), 8, false, 18, false, MUTED);
  row += 1;

  const workers = workerRows(input.model.workers, input.computed);
  const excluded = input.model.workers.filter((worker) => !worker.included).length;

  row = writeSection(sheet, row, lastCol, 'I. Costo de personal');
  const groupRow = row;
  row += 1;
  const headerRow = row;
  row += 1;
  writeGroupHeaders(sheet, groupRow, columns);
  writeColumnHeaders(sheet, headerRow, columns);

  const firstWorkerRow = row;
  workers.forEach((worker, index) => {
    writeWorker(sheet, row, columns, worker, index % 2 === 1);
    row += 1;
  });
  if (workers.length === 0) {
    writeBanner(sheet, row, lastCol, 'Ningún trabajador está incluido en esta facturación.', 8, false, 16, true, MUTED);
    row += 1;
  }
  const lastWorkerRow = workers.length ? row - 1 : firstWorkerRow - 1;
  const laborRow = row;
  writeLaborSubtotal(sheet, row, columns, firstWorkerRow, lastWorkerRow, workers);
  row += 1;
  if (excluded > 0) {
    writeBanner(
      sheet,
      row,
      lastCol,
      `Fuera de esta facturación: ${excluded} trabajador${excluded === 1 ? '' : 'es'}.`,
      8,
      false,
      14,
      true,
      MUTED
    );
    row += 1;
  }

  row += 1;
  const operationalRows = writeCostBlock(sheet, row, lastCol, 'II. Costo operativo', 'Subtotal operativo', input.model.operational, input.computed.operational);
  row = operationalRows.nextRow;
  row += 1;
  const adminRows = writeCostBlock(sheet, row, lastCol, 'III. Costo administrativo', 'Subtotal administrativo', input.model.administrative, input.computed.administrative);
  row = adminRows.nextRow;

  row += 1;
  const profitRow = row;
  writeAmountRow(sheet, row, lastCol, profitCaption(input.model.rates), input.computed.profitAmount, false);
  row += 1;

  const grandRow = row;
  writeFormulaRow(
    sheet,
    row,
    lastCol,
    'TOTAL MENSUAL',
    `${cellRef(lastCol, laborRow)}+${cellRef(lastCol, operationalRows.subtotalRow)}+${cellRef(lastCol, adminRows.subtotalRow)}+${cellRef(lastCol, profitRow)}`,
    input.computed.grandTotal,
    true
  );
  row += 1;

  return finalize(workbook, sheet, input, lastCol, groupRow, headerRow, grandRow, row);
}

async function finalize(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  input: ClientBillingExcelInput,
  lastCol: number,
  groupRow: number,
  headerRow: number,
  grandRow: number,
  rowAfterGrand: number
): Promise<ExcelJS.Workbook> {
  let row = rowAfterGrand;
  const igvRate = Number(input.model.rates.igvRate.toFixed(6));
  const igvRow = row;
  writeFormulaRow(
    sheet,
    row,
    lastCol,
    `IGV (${percent(input.model.rates.igvRate)})`,
    `${cellRef(lastCol, grandRow)}*${igvRate}`,
    input.computed.igvAmount,
    false
  );
  row += 1;
  const withIgvRow = row;
  writeFormulaRow(
    sheet,
    row,
    lastCol,
    'TOTAL CON IGV',
    `${cellRef(lastCol, grandRow)}+${cellRef(lastCol, igvRow)}`,
    input.computed.totalWithIgv,
    true
  );
  styleTotal(sheet, grandRow, lastCol, false);
  styleTotal(sheet, withIgvRow, lastCol, true);
  row += 2;

  if (input.model.comment.trim()) {
    writeBanner(sheet, row, lastCol, `Comentario: ${input.model.comment.trim()}`, 8, false, 16, true, MUTED);
    row += 1;
  }
  const notes = input.model.considerations
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (notes.length) {
    writeBanner(sheet, row, lastCol, 'Consideraciones', 8, true, 15, false, NAVY);
    row += 1;
    notes.forEach((line) => {
      writeBanner(sheet, row, lastCol, line, 8, false, 14, false, MUTED);
      row += 1;
    });
  }

  const lastRow = row - 1;
  const area = `A1:${columnLetter(lastCol)}${lastRow}`;
  sheet.pageSetup.printArea = area;
  sheet.pageSetup.printTitlesRow = `${groupRow}:${headerRow}`;
  sheet.pageSetup.orientation = 'landscape';
  sheet.pageSetup.paperSize = 9;
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 1;
  sheet.pageSetup.horizontalCentered = true;
  delete (sheet.pageSetup as { scale?: number }).scale;
  sheet.headerFooter.oddFooter = '&L&8OpsFlow · Facturación&C&8Página &P de &N&R&8&D';
  sheet.headerFooter.oddHeader = `&L&8${input.clientName}&C&8${formatPeriodLabel(input.periodMonth)}&R&8${input.unitName}`;
  sheet.views = [
    {
      state: 'frozen',
      xSplit: 2,
      ySplit: headerRow,
      showGridLines: false,
      zoomScale: 90,
      activeCell: 'A1',
    },
  ];
  return workbook;
}

interface CostBlockRows {
  subtotalRow: number;
  nextRow: number;
}

function sheetColumns(rates: BillingRates): SheetColumn[] {
  const money = (header: string, width: number, group: GroupId, pick: SheetColumn['pick']): SheetColumn => ({
    header,
    width,
    group,
    kind: 'money',
    pick,
  });
  const columns: SheetColumn[] = [
    { header: 'Trabajador', width: 18, group: 'personal', kind: 'text', pick: (row) => row.name },
    { header: 'Puesto', width: 14, group: 'personal', kind: 'text', pick: (row) => row.position },
    { header: 'Días', width: 5.5, group: 'personal', kind: 'int', pick: (row) => row.days },
    { header: 'Faltas', width: 6, group: 'personal', kind: 'int', pick: (row) => row.absences },
    money('Rem. básica', 9, 'sueldo', (row) => row.basic),
    money('Asig. fam.', 8.5, 'sueldo', (row) => row.family),
    money('HE 25%', 8.5, 'sueldo', (row) => row.he25),
    money('HE 35%', 8.5, 'sueldo', (row) => row.he35),
    money('Bono noct.', 8.5, 'sueldo', (row) => row.night),
    money('Rem. cargas', 9.5, 'sueldo', (row) => row.remLlss),
    money('Cond. trab.', 8.5, 'sueldo', (row) => row.condition),
    money('Bonos', 8.5, 'sueldo', (row) => row.bonus),
    money('Rem. total', 9.5, 'sueldo', (row) => row.remTotal),
    money('Vacaciones', 9, 'cargas', (row) => row.vacation),
    money('Gratific.', 9, 'cargas', (row) => row.gratification),
    money('CTS', 8.5, 'cargas', (row) => row.cts),
  ];
  if (rates.applyFeria) columns.push(money('Feria', 8.5, 'cargas', (row) => row.feria));
  columns.push(money('EsSalud', 8.5, 'cargas', (row) => row.essalud));
  if (rates.applyVidaLey) columns.push(money('Vida Ley', 8.5, 'cargas', (row) => row.vidaLey));
  if (rates.applySctr) columns.push(money('SCTR', 8, 'cargas', (row) => row.sctr));
  columns.push(
    money('Costo mes', 10, 'costo', (row) => row.monthly),
    { header: 'Factor', width: 6.5, group: 'costo', kind: 'factor', pick: (row) => row.factor },
    money('Costo total', 11, 'costo', (row) => row.total)
  );
  return columns;
}

function workerRows(workers: BillingWorkerInput[], computed: BillingComputation): WorkerRow[] {
  const lines = new Map(computed.workers.map((line) => [line.id, line]));
  return workers
    .filter((worker) => worker.included)
    .map((worker) => {
      const line = lines.get(worker.id);
      return toWorkerRow(worker, line);
    });
}

function toWorkerRow(worker: BillingWorkerInput, line: ComputedWorker | undefined): WorkerRow {
  const amount = (value: number | undefined) => (Number.isFinite(value) ? (value as number) : 0);
  return {
    name: worker.name.trim() || 'Sin nombre',
    position: worker.position.trim(),
    days: amount(worker.daysWorked),
    absences: amount(worker.absenceDays),
    basic: amount(line?.basic),
    family: amount(worker.familyAllowance),
    he25: amount(line?.he25),
    he35: amount(line?.he35),
    night: amount(line?.night),
    remLlss: amount(line?.remLlss),
    condition: amount(worker.workCondition),
    bonus: amount(worker.bonus),
    remTotal: amount(line?.remTotal),
    vacation: amount(line?.vacation),
    gratification: amount(line?.gratification),
    cts: amount(line?.cts),
    feria: amount(line?.feria),
    essalud: amount(line?.essalud),
    vidaLey: amount(line?.vidaLey),
    sctr: amount(line?.sctr),
    monthly: amount(line?.monthlyCost),
    factor: amount(worker.factor),
    total: amount(line?.totalCost),
  };
}

function writeBanner(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  lastCol: number,
  text: string,
  size: number,
  bold: boolean,
  height: number,
  italic = false,
  color = INK
) {
  const row = sheet.getRow(rowNumber);
  row.height = height;
  for (let col = 1; col <= lastCol; col += 1) {
    const cell = row.getCell(col);
    cell.value = col === 1 ? text : null;
    cell.font = { name: FONT, size, bold, italic, color: { argb: color } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: size < 16 };
  }
  if (lastCol > 1) sheet.mergeCells(rowNumber, 1, rowNumber, lastCol);
}

function writeSection(sheet: ExcelJS.Worksheet, rowNumber: number, lastCol: number, title: string): number {
  const row = sheet.getRow(rowNumber);
  row.height = 18;
  for (let col = 1; col <= lastCol; col += 1) {
    const cell = row.getCell(col);
    cell.value = col === 1 ? title : null;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solid(NAVY);
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  }
  if (lastCol > 1) sheet.mergeCells(rowNumber, 1, rowNumber, lastCol);
  return rowNumber + 1;
}

function writeGroupHeaders(sheet: ExcelJS.Worksheet, rowNumber: number, columns: SheetColumn[]) {
  const row = sheet.getRow(rowNumber);
  row.height = 16;
  let spanStart = 0;
  for (let index = 0; index <= columns.length; index += 1) {
    if (index === columns.length || columns[index].group !== columns[spanStart].group) {
      const group = columns[spanStart].group;
      for (let col = spanStart + 1; col <= index; col += 1) {
        const cell = row.getCell(col);
        cell.value = col === spanStart + 1 ? GROUP_TITLE[group] : null;
        cell.font = { name: FONT, size: 8, bold: true, color: { argb: NAVY } };
        cell.fill = solid(GROUP_FILL[group]);
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = thinBorder;
      }
      if (index > spanStart + 1) sheet.mergeCells(rowNumber, spanStart + 1, rowNumber, index);
      spanStart = index;
    }
  }
}

function writeColumnHeaders(sheet: ExcelJS.Worksheet, rowNumber: number, columns: SheetColumn[]) {
  const row = sheet.getRow(rowNumber);
  row.height = 28;
  columns.forEach((column, index) => {
    const cell = row.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: FONT, size: 8, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solid(NAVY);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  });
}

function writeWorker(sheet: ExcelJS.Worksheet, rowNumber: number, columns: SheetColumn[], worker: WorkerRow, zebra: boolean) {
  const row = sheet.getRow(rowNumber);
  row.height = 16;
  columns.forEach((column, index) => {
    const cell = row.getCell(index + 1);
    const value = column.pick(worker);
    cell.value = value;
    cell.font = {
      name: FONT,
      size: 8,
      color: { argb: column.header === 'Faltas' && Number(value) > 0 ? 'FF9A3412' : INK },
      bold: column.header === 'Costo total' || (column.header === 'Faltas' && Number(value) > 0),
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: column.kind === 'text' ? 'left' : 'right',
      shrinkToFit: true,
    };
    cell.border = thinBorder;
    if (zebra) cell.fill = solid(ZEBRAS);
    if (column.kind === 'money') cell.numFmt = MONEY;
    if (column.kind === 'int') cell.numFmt = '#,##0';
    if (column.kind === 'factor') cell.numFmt = '0.00';
  });
}

function writeLaborSubtotal(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  columns: SheetColumn[],
  firstRow: number,
  lastRow: number,
  workers: WorkerRow[]
) {
  const row = sheet.getRow(rowNumber);
  row.height = 18;
  columns.forEach((column, index) => {
    const cell = row.getCell(index + 1);
    cell.fill = solid(SUBTOTAL);
    cell.border = thinBorder;
    cell.font = { name: FONT, size: 8, bold: true, color: { argb: NAVY } };
    cell.alignment = { vertical: 'middle', horizontal: index === 0 ? 'left' : 'right' };
    if (index === 0) {
      cell.value = 'Subtotal personal';
      return;
    }
    if (firstRow > lastRow) {
      if (column.header === 'Costo total') {
        cell.value = 0;
        cell.numFmt = MONEY;
      }
      return;
    }
    if (column.kind === 'text' || column.kind === 'factor') return;
    const result = workers.reduce((sum, worker) => sum + Number(column.pick(worker) || 0), 0);
    cell.value = { formula: `SUM(${cellRef(index + 1, firstRow)}:${cellRef(index + 1, lastRow)})`, result };
    cell.numFmt = column.kind === 'int' ? '#,##0' : MONEY;
  });
}

function writeCostBlock(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  lastCol: number,
  title: string,
  subtotalLabel: string,
  lines: BillingCostLine[],
  computed: { id: string; amount: number }[]
): CostBlockRows {
  let row = writeSection(sheet, rowNumber, lastCol, title);
  const amounts = new Map(computed.map((line) => [line.id, line.amount]));
  const items = lines.length ? lines : [{ id: 'empty', kind: 'otros', description: 'Sin ítems', amount: 0 }];
  const firstItem = row;
  items.forEach((line) => {
    const amount = line.id === 'empty' ? 0 : amounts.get(line.id) ?? line.amount ?? 0;
    const label = line.description?.trim() || KIND_LABELS[line.kind] || line.kind || 'Ítem';
    writeAmountRow(sheet, row, lastCol, label, amount, false);
    row += 1;
  });
  const lastItem = row - 1;
  const subtotal = items.reduce((sum, line) => sum + (line.id === 'empty' ? 0 : amounts.get(line.id) ?? line.amount ?? 0), 0);
  writeFormulaRow(
    sheet,
    row,
    lastCol,
    subtotalLabel,
    `SUM(${cellRef(lastCol, firstItem)}:${cellRef(lastCol, lastItem)})`,
    subtotal,
    false
  );
  const subtotalRow = row;
  return { subtotalRow, nextRow: row + 1 };
}

function writeAmountRow(sheet: ExcelJS.Worksheet, rowNumber: number, lastCol: number, label: string, amount: number, strong: boolean) {
  const row = sheet.getRow(rowNumber);
  row.height = strong ? 20 : 16;
  for (let col = 1; col <= lastCol; col += 1) {
    const cell = row.getCell(col);
    cell.font = { name: FONT, size: 8, bold: strong, color: { argb: strong ? 'FFFFFFFF' : INK } };
    cell.alignment = { vertical: 'middle', horizontal: col === lastCol ? 'right' : 'left', shrinkToFit: true };
    cell.border = thinBorder;
    if (strong) cell.fill = solid(NAVY);
    if (col === 1) cell.value = label;
    if (col === lastCol) {
      cell.value = amount;
      cell.numFmt = MONEY;
    }
  }
  if (lastCol > 2) sheet.mergeCells(rowNumber, 1, rowNumber, lastCol - 1);
}

function writeFormulaRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  lastCol: number,
  label: string,
  formula: string,
  result: number,
  strong: boolean
) {
  writeAmountRow(sheet, rowNumber, lastCol, label, result, strong);
  const cell = sheet.getCell(rowNumber, lastCol);
  cell.value = { formula, result };
  cell.numFmt = MONEY;
}

function styleTotal(sheet: ExcelJS.Worksheet, rowNumber: number, lastCol: number, withIgv: boolean) {
  const row = sheet.getRow(rowNumber);
  row.height = withIgv ? 22 : 20;
  for (let col = 1; col <= lastCol; col += 1) {
    const cell = row.getCell(col);
    cell.font = { name: FONT, size: withIgv ? 12 : 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solid(withIgv ? 'FF16365C' : NAVY);
    cell.alignment = { vertical: 'middle', horizontal: col === lastCol ? 'right' : 'left' };
    cell.border = thinBorder;
  }
}

function methodNote(rates: BillingRates): string {
  const parts = [
    'En soles (S/). El total mensual no incluye IGV.',
    `Vacaciones ${percent(rates.vacationRate)}`,
    `Gratificación ${percent(rates.gratiRate)} × ${formatFactor(rates.gratiBonusFactor)}`,
    `CTS ${percent(rates.ctsRate)}`,
    `EsSalud ${percent(rates.essaludRate)}`,
  ];
  if (rates.applyVidaLey) parts.push(`Vida Ley ${percent(rates.vidaLeyRate, 3)}`);
  if (rates.applySctr) parts.push(`SCTR ${percent(rates.sctrRate, 3)}`);
  if (rates.applyFeria) parts.push(`Feriados ${percent(rates.feriaRate, 3)}`);
  return parts.join(' · ');
}

function profitCaption(rates: BillingRates): string {
  const mode = rates.profitMode === 'margin_on_price' ? 'margen sobre el precio' : 'recargo sobre el costo';
  const base = rates.profitBase === 'labor' ? 'base costo laboral' : 'base costo laboral, operativo y administrativo';
  return `IV. Utilidad (${percent(rates.profitRate)} ${mode}; ${base})`;
}

function percent(rate: number, digits = 2): string {
  return `${(rate * 100).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: digits })}%`;
}

function formatFactor(factor: number): string {
  return factor.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function solid(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function columnLetter(col: number): string {
  let value = col;
  let letters = '';
  while (value > 0) {
    const mod = (value - 1) % 26;
    letters = String.fromCharCode(65 + mod) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

function cellRef(col: number, row: number): string {
  return `${columnLetter(col)}${row}`;
}
