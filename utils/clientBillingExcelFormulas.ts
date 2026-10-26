import type * as ExcelJS from 'exceljs';
import {
  BILLING_FORMULA_DEFS,
  BILLING_FORMULA_IDS,
  FORMULA_GROUP_LABELS,
  WORKER_FORMULA_IDS,
  BillingFormulaSet,
  defaultBillingFormulas,
  describeFormula,
  evaluateFormulas,
  formulaLabel,
  formulaToExcel,
  normalizeBillingFormulas,
  validateBillingFormulas,
} from './billingFormulas';
import {
  BILLING_RATE_IDS,
  BillingComputation,
  BillingRateId,
  BillingWorkerInput,
  ClientBillingModel,
  WORKER_INPUT_IDS,
  WorkerInputId,
  billingRateValues,
  formatPeriodLabel,
  workerInputValues,
} from './clientBillingCalc';

export const CALC_SHEET = 'Cálculo';
export const PARAM_SHEET = 'Parámetros';

const FONT = 'Calibri';
const NAVY = 'FF1F4E79';
const INK = 'FF1F2933';
const MUTED = 'FF5B6770';
const LINE = 'FFBFCBD9';
const INPUT_FILL = 'FFDEEAF6';
const FORMULA_FILL = 'FFFFF4D6';
const MONEY = '#,##0.00';

const INPUT_GROUP_FILL = 'FFE8EEF4';
const HOURS_GROUP_FILL = 'FFD6E3F0';
const ADJUST_GROUP_FILL = 'FFFDE9D9';
const RESULT_GROUP_FILL = 'FFE3EEDC';

type RateKind = 'int' | 'percent' | 'factor' | 'money' | 'flag';

const RATE_META: Record<BillingRateId, { kind: RateKind; group: string }> = {
  diasMes: { kind: 'int', group: 'Remuneración' },
  horasDia: { kind: 'int', group: 'Remuneración' },
  factorHe25: { kind: 'factor', group: 'Remuneración' },
  factorHe35: { kind: 'factor', group: 'Remuneración' },
  recargoNocturno: { kind: 'percent', group: 'Remuneración' },
  heDiaConAsignacion: { kind: 'flag', group: 'Remuneración' },
  heNocheConAsignacion: { kind: 'flag', group: 'Remuneración' },
  heNocheConRecargo: { kind: 'flag', group: 'Remuneración' },
  bonoConAsignacion: { kind: 'flag', group: 'Remuneración' },
  tasaVacaciones: { kind: 'percent', group: 'Cargas' },
  tasaGratificacion: { kind: 'percent', group: 'Cargas' },
  factorBonificacion: { kind: 'factor', group: 'Cargas' },
  tasaCts: { kind: 'percent', group: 'Cargas' },
  tasaFeriado: { kind: 'percent', group: 'Cargas' },
  aplicaFeriado: { kind: 'flag', group: 'Cargas' },
  tasaEssalud: { kind: 'percent', group: 'Cargas' },
  essaludFijo: { kind: 'flag', group: 'Cargas' },
  montoEssalud: { kind: 'money', group: 'Cargas' },
  rmv: { kind: 'money', group: 'Cargas' },
  tasaVidaLey: { kind: 'percent', group: 'Cargas' },
  aplicaVidaLey: { kind: 'flag', group: 'Cargas' },
  tasaSctr: { kind: 'percent', group: 'Cargas' },
  aplicaSctr: { kind: 'flag', group: 'Cargas' },
  tasaFinanciera: { kind: 'percent', group: 'Liquidación' },
  diasFinanciados: { kind: 'int', group: 'Liquidación' },
  utilidadSoloLaboral: { kind: 'flag', group: 'Liquidación' },
  margenSobrePrecio: { kind: 'flag', group: 'Liquidación' },
  tasaUtilidad: { kind: 'percent', group: 'Liquidación' },
  tasaIgv: { kind: 'percent', group: 'Liquidación' },
};

const INPUT_HEADER: Record<WorkerInputId, string> = {
  sueldo: 'Sueldo',
  dias: 'Días',
  diasVacaciones: 'Días de vacaciones',
  asignacion: 'Asignación familiar',
  condicionTrabajo: 'Condición de trabajo',
  bonos: 'Bonos',
  factor: 'Factor',
  he25Horas: 'Horas HE día 25%',
  he25Manual: 'Monto manual HE día 25%',
  he25ManualActivo: 'HE día 25% a mano (1=sí)',
  he35Horas: 'Horas HE día 35%',
  he35Manual: 'Monto manual HE día 35%',
  he35ManualActivo: 'HE día 35% a mano (1=sí)',
  heNoche25Horas: 'Horas HE noche 25%',
  heNoche25Manual: 'Monto manual HE noche 25%',
  heNoche25ManualActivo: 'HE noche 25% a mano (1=sí)',
  heNoche35Horas: 'Horas HE noche 35%',
  heNoche35Manual: 'Monto manual HE noche 35%',
  heNoche35ManualActivo: 'HE noche 35% a mano (1=sí)',
  bonoHoras: 'Horas de bono nocturno',
  bonoManual: 'Monto manual del bono',
  bonoManualActivo: 'Bono a mano (1=sí)',
  ajusteBasico: 'Ajuste remuneración básica',
  ajusteHe25: 'Ajuste HE día 25%',
  ajusteHe35: 'Ajuste HE día 35%',
  ajusteHeNoche25: 'Ajuste HE noche 25%',
  ajusteHeNoche35: 'Ajuste HE noche 35%',
  ajusteBono: 'Ajuste bono nocturno',
  ajusteVacaciones: 'Ajuste vacaciones',
  ajusteGratificacion: 'Ajuste gratificación',
  ajusteCts: 'Ajuste CTS',
  ajusteFeriado: 'Ajuste feriado',
  ajusteEssalud: 'Ajuste EsSalud',
  ajusteVidaLey: 'Ajuste Vida Ley',
  ajusteSctr: 'Ajuste SCTR',
};

const SETTLEMENT_NAMES = new Set<string>([
  'costoLaboral',
  'costoOperativo',
  'costoAdministrativo',
  'baseUtilidad',
  'utilidad',
  'financiero',
  'igv',
]);

const RATE_NAMES = new Set<string>(BILLING_RATE_IDS);
const INPUT_NAMES = new Set<string>(WORKER_INPUT_IDS);
const FORMULA_NAMES = new Set<string>(WORKER_FORMULA_IDS);

export interface FormulaSheetSource {
  unitName: string;
  periodMonth: string;
  model: ClientBillingModel;
  computed: BillingComputation;
}

export interface FormulaBook {
  displayFormula(workerId: string, header: string, rollOvertime: boolean): string | null;
  writeSettlement(refs: { labor: string; operational: string; administrative: string }): {
    utilidad: string;
    financiero: string;
    igv: string;
  };
}

interface CalcColumn {
  id: string;
  header: string;
  width: number;
  group: string;
  fill: string;
  kind: 'text' | 'input' | 'formula';
  format: string;
  note: string;
}

export function attachBillingFormulaSheets(
  workbook: ExcelJS.Workbook,
  source: FormulaSheetSource,
  workers: BillingWorkerInput[]
): FormulaBook {
  const formulas = chooseFormulas(source.model.formulas);
  const templates = compileWorkerTemplates(formulas);
  const rates = billingRateValues(source.model.rates);
  const columns = calcColumns(formulas);
  const columnOf = new Map<string, number>();
  columns.forEach((column, index) => {
    if (column.kind !== 'text') columnOf.set(column.id, index + 1);
  });

  const calc = workbook.addWorksheet(CALC_SHEET, {
    views: [{ showGridLines: false, zoomScale: 90 }],
    properties: { defaultRowHeight: 16, tabColor: { argb: 'FF2F6F4E' } },
  });
  writeParameterSheet(workbook, source, rates);
  const headerRow = writeCalcIntro(calc, source, columns);
  const rowOf = new Map<string, number>();
  let row = headerRow + 1;
  workers.forEach((worker, index) => {
    writeCalcWorker(calc, row, columns, columnOf, worker, formulas, templates, rates, index % 2 === 1);
    rowOf.set(worker.id, row);
    row += 1;
  });
  if (!workers.length) {
    calc.getRow(row).getCell(1).value = 'Ningún trabajador está incluido en esta facturación.';
    calc.getRow(row).getCell(1).font = { name: FONT, size: 9, italic: true, color: { argb: MUTED } };
    row += 1;
  }
  const settlementRow = row + 1;

  return {
    displayFormula(workerId, header, rollOvertime) {
      const workerRow = rowOf.get(workerId);
      if (!workerRow) return null;
      const ref = (id: string) => absSheet(CALC_SHEET, requiredColumn(columnOf, id), workerRow);
      return presentationFormula(header, rollOvertime, ref);
    },
    writeSettlement(refs) {
      addDefinedName(workbook, 'costoLaboral', refs.labor);
      addDefinedName(workbook, 'costoOperativo', refs.operational);
      addDefinedName(workbook, 'costoAdministrativo', refs.administrative);
      const placed = writeSettlementBlock(calc, settlementRow, formulas, source.computed);
      addDefinedName(workbook, 'baseUtilidad', placed.baseUtilidad);
      addDefinedName(workbook, 'utilidad', placed.utilidad);
      addDefinedName(workbook, 'financiero', placed.financiero);
      addDefinedName(workbook, 'igv', placed.igv);
      return placed;
    },
  };
}

function chooseFormulas(formulas?: BillingFormulaSet): BillingFormulaSet {
  if (validateBillingFormulas(formulas).length) return defaultBillingFormulas();
  return normalizeBillingFormulas(formulas);
}

function compileWorkerTemplates(formulas: BillingFormulaSet): Map<string, string> {
  const templates = new Map<string, string>();
  WORKER_FORMULA_IDS.forEach((id) => {
    templates.set(
      id,
      formulaToExcel(formulas[id] || '', (name) => {
        if (RATE_NAMES.has(name)) return name;
        if (INPUT_NAMES.has(name) || FORMULA_NAMES.has(name)) return `__${name}__`;
        throw new Error(`La fórmula de ${formulaLabel(id)} usa «${name}», que no está en el Excel.`);
      })
    );
  });
  return templates;
}

function calcColumns(formulas: BillingFormulaSet): CalcColumn[] {
  const columns: CalcColumn[] = [
    { id: 'nombre', header: 'Trabajador', width: 24, group: 'Personal', fill: INPUT_GROUP_FILL, kind: 'text', format: '@', note: '' },
    { id: 'puesto', header: 'Puesto', width: 16, group: 'Personal', fill: INPUT_GROUP_FILL, kind: 'text', format: '@', note: '' },
  ];
  WORKER_INPUT_IDS.forEach((id) => {
    const group = inputGroup(id);
    columns.push({
      id,
      header: INPUT_HEADER[id],
      width: id.endsWith('Activo') ? 14 : 15,
      group: group.title,
      fill: group.fill,
      kind: 'input',
      format: inputFormat(id),
      note: `${formulaLabel(id)}. En las fórmulas se llama ${id}.`,
    });
  });
  WORKER_FORMULA_IDS.forEach((id) => {
    const definition = BILLING_FORMULA_DEFS.find((item) => item.id === id);
    const group = definition ? FORMULA_GROUP_LABELS[definition.group] : 'Resultado';
    const expression = formulas[id] || '';
    const sentence = describeFormula(id, formulas);
    columns.push({
      id,
      header: sentenceCase(formulaLabel(id)),
      width: 15,
      group,
      fill: RESULT_GROUP_FILL,
      kind: 'formula',
      format: MONEY,
      note: [id, expression, sentence].filter(Boolean).join('\n'),
    });
  });
  return columns;
}

function writeParameterSheet(
  workbook: ExcelJS.Workbook,
  source: FormulaSheetSource,
  rates: Record<BillingRateId, number>
) {
  const sheet = workbook.addWorksheet(PARAM_SHEET, {
    views: [{ showGridLines: false, zoomScale: 110, state: 'frozen', ySplit: 3, activeCell: 'A1' }],
    properties: { defaultRowHeight: 18, tabColor: { argb: 'FF7A5B2E' } },
  });
  sheet.getColumn(1).width = 42;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 28;
  const title = sheet.getRow(1);
  title.height = 22;
  title.getCell(1).value = `Parámetros · ${source.unitName} · ${formatPeriodLabel(source.periodMonth)}`;
  title.getCell(1).font = { name: FONT, size: 14, bold: true, color: { argb: INK } };
  sheet.mergeCells(1, 1, 1, 3);
  const note = sheet.getRow(2);
  note.height = 32;
  note.getCell(1).value =
    'Estos valores entran en las fórmulas de la hoja Cálculo. 1 es sí y 0 es no. Las tasas se muestran como porcentaje. Si cambia un valor, Excel recalcula la liquidación.';
  note.getCell(1).font = { name: FONT, size: 9, color: { argb: MUTED } };
  note.getCell(1).alignment = { vertical: 'middle', wrapText: true };
  sheet.mergeCells(2, 1, 2, 3);
  writeHeaderRow(sheet, 3, ['Parámetro', 'Valor', 'Nombre en la fórmula']);

  let row = 4;
  let group = '';
  BILLING_RATE_IDS.forEach((id) => {
    const meta = RATE_META[id];
    if (meta.group !== group) {
      group = meta.group;
      const section = sheet.getRow(row);
      section.height = 18;
      for (let col = 1; col <= 3; col += 1) {
        const cell = section.getCell(col);
        cell.value = col === 1 ? group : null;
        cell.font = { name: FONT, size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = solid(NAVY);
        cell.alignment = { vertical: 'middle' };
      }
      sheet.mergeCells(row, 1, row, 3);
      row += 1;
    }
    const line = sheet.getRow(row);
    line.height = 18;
    const label = line.getCell(1);
    label.value = sentenceCase(formulaLabel(id));
    label.font = { name: FONT, size: 9, color: { argb: INK } };
    label.alignment = { vertical: 'middle' };
    label.border = thinBorder();
    const value = line.getCell(2);
    value.value = rates[id];
    value.font = { name: FONT, size: 9, bold: true, color: { argb: INK } };
    value.numFmt = rateFormat(meta.kind);
    value.fill = solid(INPUT_FILL);
    value.alignment = { vertical: 'middle', horizontal: 'right' };
    value.border = thinBorder();
    const token = line.getCell(3);
    token.value = id;
    token.font = { name: FONT, size: 9, color: { argb: MUTED } };
    token.alignment = { vertical: 'middle' };
    token.border = thinBorder();
    addDefinedName(workbook, id, absSheet(PARAM_SHEET, 2, row));
    row += 1;
  });
}

function writeCalcIntro(sheet: ExcelJS.Worksheet, source: FormulaSheetSource, columns: CalcColumn[]): number {
  columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });
  const lastCol = columns.length;
  const title = sheet.getRow(1);
  title.height = 22;
  title.getCell(1).value = `Cálculo · ${source.unitName} · ${formatPeriodLabel(source.periodMonth)}`;
  title.getCell(1).font = { name: FONT, size: 14, bold: true, color: { argb: INK } };
  if (lastCol > 1) sheet.mergeCells(1, 1, 1, Math.min(lastCol, 8));
  const legend = sheet.getRow(2);
  legend.height = 32;
  legend.getCell(1).value =
    'Las celdas azules son datos y las amarillas son fórmulas. Los nombres como diasMes o tasaVacaciones están en Parámetros. Cambie un dato y Excel recalcula la hoja Facturación.';
  legend.getCell(1).font = { name: FONT, size: 9, color: { argb: MUTED } };
  legend.getCell(1).alignment = { vertical: 'middle', wrapText: true };
  if (lastCol > 1) sheet.mergeCells(2, 1, 2, Math.min(lastCol, 8));

  const groupRow = 4;
  const headerRow = 5;
  writeCalcGroups(sheet, groupRow, columns);
  const headers = sheet.getRow(headerRow);
  headers.height = 36;
  columns.forEach((column, index) => {
    const cell = headers.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: FONT, size: 8, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solid(NAVY);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
    if (column.note) cell.note = { texts: [{ font: { size: 9, name: FONT }, text: column.note }] };
  });
  sheet.views = [
    {
      state: 'frozen',
      xSplit: 1,
      ySplit: headerRow,
      showGridLines: false,
      zoomScale: 90,
      activeCell: 'A1',
    },
  ];
  sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: lastCol } };
  return headerRow;
}

function writeCalcGroups(sheet: ExcelJS.Worksheet, rowNumber: number, columns: CalcColumn[]) {
  const row = sheet.getRow(rowNumber);
  row.height = 16;
  let spanStart = 0;
  for (let index = 0; index <= columns.length; index += 1) {
    if (index === columns.length || columns[index].group !== columns[spanStart].group) {
      const group = columns[spanStart];
      for (let col = spanStart + 1; col <= index; col += 1) {
        const cell = row.getCell(col);
        cell.value = col === spanStart + 1 ? group.group : null;
        cell.font = { name: FONT, size: 8, bold: true, color: { argb: NAVY } };
        cell.fill = solid(group.fill);
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = thinBorder();
      }
      if (index > spanStart + 1) sheet.mergeCells(rowNumber, spanStart + 1, rowNumber, index);
      spanStart = index;
    }
  }
}

function writeCalcWorker(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  columns: CalcColumn[],
  columnOf: Map<string, number>,
  worker: BillingWorkerInput,
  formulas: BillingFormulaSet,
  templates: Map<string, string>,
  rates: Record<BillingRateId, number>,
  zebra: boolean
) {
  const inputs = workerInputValues(worker);
  const values = evaluateFormulas(formulas, { ...inputs, ...rates }, WORKER_FORMULA_IDS);
  const row = sheet.getRow(rowNumber);
  row.height = 18;
  columns.forEach((column, index) => {
    const cell = row.getCell(index + 1);
    cell.font = { name: FONT, size: 8, color: { argb: INK }, bold: column.id === 'costoTotal' };
    cell.alignment = { vertical: 'middle', horizontal: column.kind === 'text' ? 'left' : 'right' };
    cell.border = thinBorder();
    if (column.kind === 'text') {
      cell.value = column.id === 'puesto' ? worker.position.trim() : worker.name.trim() || 'Sin nombre';
      if (zebra) cell.fill = solid('FFF4F7FB');
      return;
    }
    if (column.kind === 'input') {
      cell.value = inputs[column.id as WorkerInputId];
      cell.numFmt = column.format;
      cell.fill = solid(INPUT_FILL);
      return;
    }
    const template = templates.get(column.id) || '0';
    cell.value = { formula: applyRow(template, rowNumber, columnOf), result: values[column.id] || 0 };
    cell.numFmt = column.format;
    cell.fill = solid(FORMULA_FILL);
  });
}

function writeSettlementBlock(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  formulas: BillingFormulaSet,
  computed: BillingComputation
): { baseUtilidad: string; utilidad: string; financiero: string; igv: string } {
  let row = startRow;
  const section = sheet.getRow(row);
  section.height = 18;
  for (let col = 1; col <= 6; col += 1) {
    const cell = section.getCell(col);
    cell.value = col === 1 ? 'Totales de la liquidación' : null;
    cell.font = { name: FONT, size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solid(NAVY);
  }
  sheet.mergeCells(row, 1, row, 6);
  row += 1;

  const links: { label: string; name: string; result: number; detail: string }[] = [
    { label: 'Costo laboral', name: 'costoLaboral', result: computed.laborTotal, detail: 'Subtotal de personal en la hoja Facturación.' },
    { label: 'Costo operativo', name: 'costoOperativo', result: computed.operationalTotal, detail: 'Subtotal operativo en la hoja Facturación.' },
    {
      label: 'Costo administrativo',
      name: 'costoAdministrativo',
      result: computed.adminTotal,
      detail: 'Subtotal administrativo en la hoja Facturación. Incluye el costo financiero cuando esa línea usa la fórmula.',
    },
  ];
  links.forEach((item) => {
    writeSettlementRow(sheet, row, item.label, item.name, item.result, item.detail, false);
    row += 1;
  });

  const compiled = (id: string) =>
    formulaToExcel(formulas[id] || '', (name) => {
      if (id === 'financiero' && name === 'costoAdministrativo') return '0';
      if (SETTLEMENT_NAMES.has(name) || RATE_NAMES.has(name)) return name;
      throw new Error(`La fórmula de ${formulaLabel(id)} usa «${name}», que no está en el Excel.`);
    });

  const results: Record<string, number> = {
    baseUtilidad: computed.profitBaseAmount,
    utilidad: computed.profitAmount,
    financiero: computed.financialAmount,
    igv: computed.igvAmount,
  };
  const placed: Record<string, string> = {};
  (['baseUtilidad', 'utilidad', 'financiero', 'igv'] as const).forEach((id) => {
    const expression = formulas[id] || '';
    const sentence = describeFormula(id, formulas);
    let detail = [expression, sentence].filter(Boolean).join('\n');
    if (id === 'financiero' && expression.includes('costoAdministrativo')) {
      detail += '\nEn este paso el gasto administrativo vale 0: el financiero se calcula antes de cerrar ese subtotal.';
    }
    writeSettlementRow(sheet, row, sentenceCase(formulaLabel(id)), compiled(id), results[id] || 0, detail, true);
    placed[id] = absSheet(CALC_SHEET, 2, row);
    row += 1;
  });
  return {
    baseUtilidad: placed.baseUtilidad,
    utilidad: placed.utilidad,
    financiero: placed.financiero,
    igv: placed.igv,
  };
}

function writeSettlementRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  label: string,
  formula: string,
  result: number,
  detail: string,
  calculated: boolean
) {
  const row = sheet.getRow(rowNumber);
  row.height = calculated ? 32 : 18;
  const labelCell = row.getCell(1);
  labelCell.value = label;
  labelCell.font = { name: FONT, size: 9, bold: true, color: { argb: NAVY } };
  labelCell.alignment = { vertical: 'middle', wrapText: true };
  labelCell.border = thinBorder();
  const amount = row.getCell(2);
  amount.value = { formula, result };
  amount.numFmt = MONEY;
  amount.font = { name: FONT, size: 9, bold: true, color: { argb: INK } };
  amount.fill = solid(calculated ? FORMULA_FILL : 'FFF4F7FB');
  amount.alignment = { vertical: 'middle', horizontal: 'right' };
  amount.border = thinBorder();
  const note = row.getCell(3);
  note.value = detail;
  note.font = { name: FONT, size: 8, color: { argb: MUTED } };
  note.alignment = { vertical: 'middle', wrapText: true };
  note.border = thinBorder();
  if (sheet.columnCount >= 6) sheet.mergeCells(rowNumber, 3, rowNumber, 6);
}

function presentationFormula(header: string, rollOvertime: boolean, ref: (id: string) => string): string | null {
  const plus = (id: string, adjustment: string) => `${ref(id)}+${ref(adjustment)}`;
  switch (header) {
    case 'Días':
      return ref('dias');
    case 'Días vac.':
      return ref('diasVacaciones');
    case 'Rem. básica':
      return plus('basico', 'ajusteBasico');
    case 'Asig. fam.':
      return ref('asignacion');
    case 'HE día 25%':
      return plus('he25', 'ajusteHe25');
    case 'HE día 35%':
      return plus('he35', 'ajusteHe35');
    case 'HE noche 25%':
      return plus('heNoche25', 'ajusteHeNoche25');
    case 'HE noche 35%':
      return plus('heNoche35', 'ajusteHeNoche35');
    case 'Bono nocturno':
    case 'Bono noct.': {
      const night = plus('bonoNocturno', 'ajusteBono');
      if (!rollOvertime) return night;
      return [
        plus('he25', 'ajusteHe25'),
        plus('he35', 'ajusteHe35'),
        plus('heNoche25', 'ajusteHeNoche25'),
        plus('heNoche35', 'ajusteHeNoche35'),
        night,
      ].join('+');
    }
    case 'Rem. cargas':
      return ref('remCargas');
    case 'Cond. trab.':
      return ref('condicionTrabajo');
    case 'Bonos':
      return ref('bonos');
    case 'Rem. total':
      return ref('remTotal');
    case 'Vacaciones':
      return plus('vacaciones', 'ajusteVacaciones');
    case 'Gratific.':
      return plus('gratificacion', 'ajusteGratificacion');
    case 'CTS':
      return plus('cts', 'ajusteCts');
    case 'Feriado':
      return plus('feriado', 'ajusteFeriado');
    case 'EsSalud':
    case 'EsSalud fijo':
      return plus('essalud', 'ajusteEssalud');
    case 'Vida Ley':
      return plus('vidaLey', 'ajusteVidaLey');
    case 'SCTR':
      return plus('sctr', 'ajusteSctr');
    case 'Costo mes':
      return ref('costoMes');
    case 'Factor':
      return ref('factor');
    case 'Costo total':
      return ref('costoTotal');
    default:
      return null;
  }
}

function applyRow(template: string, rowNumber: number, columnOf: Map<string, number>): string {
  let text = template;
  const names = [...columnOf.keys()].sort((left, right) => right.length - left.length);
  names.forEach((name) => {
    text = text.split(`__${name}__`).join(cellRef(requiredColumn(columnOf, name), rowNumber));
  });
  if (/__[A-Za-z0-9_]+__/.test(text)) throw new Error('Quedó una referencia sin columna en el Excel.');
  return text;
}

function inputGroup(id: WorkerInputId): { title: string; fill: string } {
  if (id.startsWith('ajuste')) return { title: 'Ajustes', fill: ADJUST_GROUP_FILL };
  if (id.includes('Horas') || id.includes('Manual') || id.startsWith('he')) {
    return { title: 'Horas extra y bono nocturno', fill: HOURS_GROUP_FILL };
  }
  return { title: 'Datos', fill: INPUT_GROUP_FILL };
}

function inputFormat(id: WorkerInputId): string {
  if (id.endsWith('Activo')) return '0';
  if (id.endsWith('Horas') || id === 'dias' || id === 'diasVacaciones' || id === 'factor') return '0.00';
  return MONEY;
}

function rateFormat(kind: RateKind): string {
  if (kind === 'percent') return '0.00%';
  if (kind === 'money') return MONEY;
  if (kind === 'flag' || kind === 'int') return '0';
  return '0.00';
}

function writeHeaderRow(sheet: ExcelJS.Worksheet, rowNumber: number, headers: string[]) {
  const row = sheet.getRow(rowNumber);
  row.height = 18;
  headers.forEach((header, index) => {
    const cell = row.getCell(index + 1);
    cell.value = header;
    cell.font = { name: FONT, size: 8, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solid(NAVY);
    cell.alignment = { vertical: 'middle' };
    cell.border = thinBorder();
  });
}

function requiredColumn(columnOf: Map<string, number>, id: string): number {
  const column = columnOf.get(id);
  if (!column) throw new Error(`Falta la columna ${id}.`);
  return column;
}

function addDefinedName(workbook: ExcelJS.Workbook, name: string, ref: string) {
  workbook.definedNames.add(ref, name);
}

function sentenceCase(text: string): string {
  if (!text) return text;
  return text.charAt(0).toLocaleUpperCase('es-PE') + text.slice(1);
}

function solid(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const edge = { style: 'thin' as const, color: { argb: LINE } };
  return { top: edge, left: edge, bottom: edge, right: edge };
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

function absSheet(sheet: string, col: number, row: number): string {
  return `'${sheet.replace(/'/g, "''")}'!$${columnLetter(col)}$${row}`;
}
