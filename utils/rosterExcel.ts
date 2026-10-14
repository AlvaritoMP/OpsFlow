import * as ExcelJS from 'exceljs';
import { Resource } from '../types';
import {
  formatShiftTimeRange,
  isRosterWorkShift,
  isVacationWithCoverage,
  resolveShiftWindow,
  ROSTER_HOURS,
  shiftCoversHour,
  workTypeFromAssignedShift,
} from './rosterHours';
import {
  countRosterShiftsForDate,
  getRosterShiftGroup,
  isProgrammedWorkShift,
  rosterShiftGroupsMatch,
  rosterShiftShortLabel,
  RosterDayShiftCounts,
  RosterShiftGroupKey,
  toLocalDateStr,
  workerCountLabel,
} from './rosterGroups';

const createWorkbook = (): ExcelJS.Workbook => {
  const runtime = ExcelJS as typeof ExcelJS & { default?: typeof ExcelJS };
  const api = typeof runtime.Workbook === 'function' ? runtime : runtime.default;
  if (!api?.Workbook) throw new Error('No se pudo cargar ExcelJS');
  return new api.Workbook();
};

export type RosterExcelWorker = Pick<
  Resource,
  'id' | 'name' | 'assignedShift' | 'puesto' | 'entryTime' | 'exitTime' | 'workSchedule'
>;

export interface RosterExcelInput {
  unitName: string;
  dates: Date[];
  weekCount: number;
  groupByShift: boolean;
  selectedDate: string;
  workers: RosterExcelWorker[];
  hasUnsavedChanges?: boolean;
}

const FONT = 'Calibri';

const INK = 'FF1E293B';
const MUTED = 'FF64748B';
const SOFT = 'FF94A3B8';
const LINE = 'FFE2E8F0';
const WEEK_LINE = 'FFCBD5E1';
const WHITE = 'FFFFFFFF';
const BLUE = 'FF3B82F6';
const AMBER = 'FFF59E0B';
const INDIGO = 'FF4F46E5';
const ORANGE = 'FFF97316';
const ORANGE_SOFT = 'FFFDBA74';
const OFF = 'FFE2E8F0';
const OFF_TEXT = 'FF64748B';
const SLATE_50 = 'FFF8FAFC';
const SLATE_100 = 'FFF1F5F9';
const SELECTED = 'FFEFF6FF';
const SELECTED_TEXT = 'FF1D4ED8';
const TODAY = 'FFF0F7FF';
const BLUE_COUNT = 'FF2563EB';
const AMBER_COUNT = 'FFD97706';

const GROUP_FILL: Record<RosterShiftGroupKey, string> = {
  supervision: 'FFF5F3FF',
  day: 'FFEFF6FF',
  afternoon: 'FFFFFBEB',
  night: 'FFEEF2FF',
  other: 'FFF1F5F9',
  none: 'FFF8FAFC',
};

const GROUP_TEXT: Record<RosterShiftGroupKey, string> = {
  supervision: 'FF5B21B6',
  day: 'FF1E40AF',
  afternoon: 'FF78350F',
  night: 'FF3730A3',
  other: 'FF334155',
  none: 'FF64748B',
};

const thin = (color = LINE): Partial<ExcelJS.Borders> => ({
  top: { style: 'thin', color: { argb: color } },
  left: { style: 'thin', color: { argb: color } },
  bottom: { style: 'thin', color: { argb: color } },
  right: { style: 'thin', color: { argb: color } },
});

const solid = (argb: string): ExcelJS.Fill => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});

const textFont = (size: number, argb: string, bold = false): Partial<ExcelJS.Font> => ({
  name: FONT,
  size,
  bold,
  color: { argb },
});

const rich = (runs: Array<{ text: string; size: number; color: string; bold?: boolean }>): ExcelJS.CellRichTextValue => ({
  richText: runs.map((run) => ({
    text: run.text,
    font: textFont(run.size, run.color, run.bold),
  })),
});

const formatHours = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
};

const gapColor = (dateStr: string, selectedDate: string) => (dateStr === selectedDate ? SELECTED : WHITE);

interface ShiftPaint {
  lines: Array<{ text: string; size: number; bold: boolean }>;
  fill: string;
  color: string;
}

const paintForShift = (worker: RosterExcelWorker, dateStr: string): ShiftPaint => {
  const shift = worker.workSchedule?.find((item) => item.date === dateStr);
  const type = shift?.type || 'OFF';
  const covered = isVacationWithCoverage(shift);
  const window = resolveShiftWindow(shift, worker);
  const lines: ShiftPaint['lines'] = [{ text: rosterShiftShortLabel(type), size: 11, bold: true }];
  if (type === 'Vacation') lines.push({ text: covered ? 'Cob' : 'S/cob', size: 8, bold: true });
  if (window) {
    lines.push({ text: formatShiftTimeRange(window.startTime, window.endTime), size: 8, bold: true });
    lines.push({ text: `${formatHours(window.hours)}h`, size: 8, bold: false });
  }

  if (type === 'Day') return { lines, fill: BLUE, color: WHITE };
  if (type === 'Afternoon') return { lines, fill: AMBER, color: WHITE };
  if (type === 'Night') return { lines, fill: INDIGO, color: WHITE };
  if (type === 'Vacation') return { lines, fill: covered ? ORANGE : ORANGE_SOFT, color: WHITE };
  if (type === 'OFF') return { lines, fill: OFF, color: OFF_TEXT };
  return { lines, fill: SLATE_100, color: SOFT };
};

const shiftLineCount = (worker: RosterExcelWorker, dateStr: string) => paintForShift(worker, dateStr).lines.length;

const weekHoursForWorker = (worker: RosterExcelWorker, weekDates: Date[]) =>
  weekDates.reduce((acc, date) => {
    const dateStr = toLocalDateStr(date);
    const shift = worker.workSchedule?.find((item) => item.date === dateStr);
    const window = resolveShiftWindow(shift, worker);
    return acc + (window?.hours || shift?.hours || 0);
  }, 0);

const weekHoursForGroup = (workers: RosterExcelWorker[], weekDates: Date[]) =>
  workers.reduce(
    (acc, worker) =>
      acc +
      weekDates.reduce((weekAcc, date) => {
        const shift = worker.workSchedule?.find((item) => item.date === toLocalDateStr(date));
        const window = resolveShiftWindow(shift, worker);
        return weekAcc + (window?.hours || 0);
      }, 0),
    0
  );

const dayColumn = (weekIdx: number, dayIdx: number) => 2 + weekIdx * 8 + dayIdx;
const hoursColumn = (weekIdx: number) => 2 + weekIdx * 8 + 7;

const setWrap = (
  cell: ExcelJS.Cell,
  horizontal: 'left' | 'center' | 'right' = 'center',
  vertical: 'middle' | 'top' = 'middle'
) => {
  cell.alignment = { horizontal, vertical, wrapText: true };
};

const applyWeekDivider = (cell: ExcelJS.Cell) => {
  cell.border = {
    ...(cell.border || {}),
    right: { style: 'medium', color: { argb: WEEK_LINE } },
  };
};

const paintChip = (cell: ExcelJS.Cell, paint: ShiftPaint, dateStr: string, selectedDate: string) => {
  cell.value = rich(
    paint.lines.map((line, index) => ({
      text: index < paint.lines.length - 1 ? `${line.text}\n` : line.text,
      size: line.size,
      color: paint.color,
      bold: line.bold,
    }))
  );
  cell.fill = solid(paint.fill);
  setWrap(cell);
  const gap = gapColor(dateStr, selectedDate);
  cell.border = {
    top: { style: 'medium', color: { argb: gap } },
    left: { style: 'medium', color: { argb: gap } },
    bottom: { style: 'medium', color: { argb: gap } },
    right: { style: 'medium', color: { argb: gap } },
  };
};

const paintCountCell = (
  cell: ExcelJS.Cell,
  counts: RosterDayShiftCounts,
  fill: string,
  primary: string,
  dateStr: string,
  selectedDate: string
) => {
  cell.value = rich([
    { text: `${counts.programmed}\n`, size: 12, color: primary, bold: true },
    { text: `${counts.day}D`, size: 8, color: BLUE_COUNT, bold: true },
    { text: ' ', size: 8, color: primary },
    { text: `${counts.afternoon}T`, size: 8, color: AMBER_COUNT, bold: true },
    { text: ' ', size: 8, color: primary },
    { text: `${counts.night}N`, size: 8, color: INDIGO, bold: true },
  ]);
  cell.fill = solid(dateStr === selectedDate ? 'FFDBEAFE' : fill);
  setWrap(cell);
  cell.border = thin(dateStr === selectedDate ? 'FF93C5FD' : LINE);
};

const paintHoursValue = (cell: ExcelJS.Cell, hours: number, fill: string, primary: string, muted: string) => {
  cell.value = rich([
    { text: formatHours(hours), size: 12, color: primary, bold: true },
    { text: ' h', size: 9, color: muted },
  ]);
  cell.fill = solid(fill);
  setWrap(cell);
  cell.border = thin();
  applyWeekDivider(cell);
};

const legendItem = (
  cell: ExcelJS.Cell,
  label: string,
  fill: string,
  color: string
) => {
  cell.value = label;
  cell.font = textFont(8, color, true);
  cell.fill = solid(fill);
  setWrap(cell);
  cell.border = {
    top: { style: 'medium', color: { argb: WHITE } },
    left: { style: 'medium', color: { argb: WHITE } },
    bottom: { style: 'medium', color: { argb: WHITE } },
    right: { style: 'medium', color: { argb: WHITE } },
  };
};

const groupWorkersAt = (workers: RosterExcelWorker[], index: number) => {
  const shiftGroup = getRosterShiftGroup(workers[index]);
  let start = index;
  while (start > 0 && rosterShiftGroupsMatch(getRosterShiftGroup(workers[start - 1]), shiftGroup)) start -= 1;
  let end = index;
  while (end < workers.length - 1 && rosterShiftGroupsMatch(getRosterShiftGroup(workers[end + 1]), shiftGroup)) end += 1;
  return workers.slice(start, end + 1);
};

function buildTurnosSheet(workbook: ExcelJS.Workbook, input: RosterExcelInput) {
  const weeks: Date[][] = [];
  for (let week = 0; week < input.weekCount; week += 1) {
    weeks.push(input.dates.slice(week * 7, week * 7 + 7));
  }
  const lastCol = 1 + Math.max(input.weekCount, 1) * 8;
  const dayHeaderRow = input.weekCount > 1 ? 6 : 5;

  const sheet = workbook.addWorksheet('Turnos', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: dayHeaderRow, showGridLines: false, zoomScale: 110 }],
    properties: { defaultRowHeight: 18, tabColor: { argb: BLUE } },
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.45, bottom: 0.4, header: 0.2, footer: 0.25 },
      printTitlesRow: `1:${dayHeaderRow}`,
    },
  });

  sheet.getColumn(1).width = 34;
  for (let column = 2; column <= lastCol; column += 1) {
    const isHours = (column - 2) % 8 === 7;
    sheet.getColumn(column).width = isHours ? 13 : 15.5;
  }

  sheet.mergeCells(1, 1, 1, lastCol);
  const title = sheet.getCell(1, 1);
  title.value = `${input.unitName || 'Unidad'} — Programación de turnos`;
  title.font = textFont(14, INK, true);
  title.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(1).height = 24;

  const start = input.dates[0];
  const end = input.dates[input.dates.length - 1];
  const range = start && end
    ? `${start.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })} a ${end.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`
    : '';
  sheet.mergeCells(2, 1, 2, lastCol);
  const subtitle = sheet.getCell(2, 1);
  const subtitleRuns: Array<{ text: string; size: number; color: string; bold?: boolean }> = [
    {
      text: `${range} · ${input.weekCount} semana${input.weekCount > 1 ? 's' : ''}`,
      size: 10,
      color: MUTED,
    },
  ];
  if (input.hasUnsavedChanges) {
    subtitleRuns.push({ text: '   ·   Cambios sin guardar', size: 10, color: AMBER_COUNT, bold: true });
  }
  subtitle.value = rich(subtitleRuns);
  subtitle.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(2).height = 18;

  const legend = sheet.getCell(3, 1);
  legend.value = 'Leyenda';
  legend.font = textFont(8, MUTED, true);
  legend.alignment = { horizontal: 'left', vertical: 'middle' };
  legendItem(sheet.getCell(3, 2), 'Día', BLUE, WHITE);
  legendItem(sheet.getCell(3, 3), 'Tarde', AMBER, WHITE);
  legendItem(sheet.getCell(3, 4), 'Noche', INDIGO, WHITE);
  legendItem(sheet.getCell(3, 5), 'Vac cob.', ORANGE, WHITE);
  legendItem(sheet.getCell(3, 6), 'Vac s/cob.', ORANGE_SOFT, WHITE);
  legendItem(sheet.getCell(3, 7), 'OFF', OFF, OFF_TEXT);
  sheet.getRow(3).height = 20;
  sheet.mergeCells(4, 1, 4, lastCol);
  const legendNote = sheet.getCell(4, 1);
  legendNote.value = 'Vac. con cobertura muestra horas de reemplazo';
  legendNote.font = textFont(9, MUTED);
  legendNote.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(4).height = 16;

  if (input.weekCount > 1) {
    const weekRow = sheet.getRow(5);
    weekRow.height = 18;
    const name = sheet.getCell(5, 1);
    name.fill = solid(WHITE);
    name.border = { ...thin(), right: { style: 'medium', color: { argb: WEEK_LINE } } };
    weeks.forEach((weekDates, weekIdx) => {
      const startCol = dayColumn(weekIdx, 0);
      const endCol = hoursColumn(weekIdx);
      for (let column = startCol; column <= endCol; column += 1) {
        const cell = sheet.getCell(5, column);
        cell.fill = solid(weekIdx % 2 === 0 ? SLATE_50 : WHITE);
        cell.border = thin();
        cell.font = textFont(9, 'FF475569', true);
        setWrap(cell);
      }
      sheet.mergeCells(5, startCol, 5, endCol);
      const first = weekDates[0];
      const last = weekDates[weekDates.length - 1];
      const weekLabel = first && last
        ? `Semana ${weekIdx + 1}  ·  ${first.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}`
        : `Semana ${weekIdx + 1}`;
      sheet.getCell(5, startCol).value = weekLabel.toLocaleUpperCase('es-PE');
      applyWeekDivider(sheet.getCell(5, endCol));
    });
  }

  const header = sheet.getRow(dayHeaderRow);
  header.height = 32;
  const nameHeader = sheet.getCell(dayHeaderRow, 1);
  nameHeader.value = 'COLABORADOR';
  nameHeader.font = textFont(9, MUTED, true);
  nameHeader.fill = solid(WHITE);
  setWrap(nameHeader, 'left');
  nameHeader.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  nameHeader.border = {
    bottom: { style: 'medium', color: { argb: WEEK_LINE } },
    right: { style: 'medium', color: { argb: WEEK_LINE } },
  };

  const todayStr = toLocalDateStr(new Date());
  weeks.forEach((weekDates, weekIdx) => {
    weekDates.forEach((date, dayIdx) => {
      const dateStr = toLocalDateStr(date);
      const selected = dateStr === input.selectedDate;
      const today = dateStr === todayStr;
      const cell = sheet.getCell(dayHeaderRow, dayColumn(weekIdx, dayIdx));
      const color = selected || today ? SELECTED_TEXT : MUTED;
      cell.value = rich([
        { text: `${date.toLocaleDateString('es-PE', { weekday: 'short' }).toLocaleUpperCase('es-PE')}\n`, size: 9, color, bold: true },
        { text: String(date.getDate()), size: 9, color: selected || today ? 'FF3B82F6' : SOFT, bold: true },
      ]);
      cell.fill = solid(selected ? SELECTED : today ? TODAY : WHITE);
      setWrap(cell);
      cell.border = {
        bottom: { style: 'medium', color: { argb: selected ? 'FF93C5FD' : WEEK_LINE } },
        left: { style: 'thin', color: { argb: WHITE } },
        right: { style: 'thin', color: { argb: WHITE } },
        top: { style: 'thin', color: { argb: WHITE } },
      };
    });
    const hours = sheet.getCell(dayHeaderRow, hoursColumn(weekIdx));
    hours.value = 'HRS';
    hours.font = textFont(8, MUTED, true);
    hours.fill = solid(SLATE_50);
    setWrap(hours);
    hours.border = {
      bottom: { style: 'medium', color: { argb: WEEK_LINE } },
      right: { style: 'medium', color: { argb: WEEK_LINE } },
    };
  });

  let row = dayHeaderRow + 1;
  if (input.workers.length === 0) {
    sheet.mergeCells(row, 1, row, lastCol);
    const empty = sheet.getCell(row, 1);
    empty.value = 'No hay colaboradores activos para programar turnos.';
    empty.font = { ...textFont(11, SOFT), italic: true };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(row).height = 28;
    row += 1;
  }

  input.workers.forEach((worker, index) => {
    const shiftGroup = getRosterShiftGroup(worker);
    const prevGroup = index > 0 ? getRosterShiftGroup(input.workers[index - 1]) : null;
    const nextGroup = index < input.workers.length - 1 ? getRosterShiftGroup(input.workers[index + 1]) : null;
    const showGroupHeader = input.groupByShift && (!prevGroup || !rosterShiftGroupsMatch(prevGroup, shiftGroup));
    const showGroupSubtotal = input.groupByShift && (!nextGroup || !rosterShiftGroupsMatch(nextGroup, shiftGroup));
    const members = showGroupHeader || showGroupSubtotal ? groupWorkersAt(input.workers, index) : [];

    if (showGroupHeader) {
      const fill = GROUP_FILL[shiftGroup.key];
      const color = GROUP_TEXT[shiftGroup.key];
      for (let column = 1; column <= lastCol; column += 1) {
        const cell = sheet.getCell(row, column);
        cell.fill = solid(fill);
        cell.border = {
          top: { style: 'thin', color: { argb: fill } },
          left: { style: 'thin', color: { argb: fill } },
          bottom: { style: 'thin', color: { argb: fill } },
          right: { style: 'thin', color: { argb: fill } },
        };
      }
      const label = sheet.getCell(row, 1);
      label.value = rich([
        { text: `${shiftGroup.label.toLocaleUpperCase('es-PE')}\n`, size: 8, color, bold: true },
        { text: workerCountLabel(members.length), size: 8, color, bold: true },
      ]);
      setWrap(label, 'left');
      label.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
      label.border = {
        ...(label.border || {}),
        right: { style: 'medium', color: { argb: WEEK_LINE } },
      };
      weeks.forEach((_, weekIdx) => applyWeekDivider(sheet.getCell(row, hoursColumn(weekIdx))));
      sheet.getRow(row).height = 28;
      row += 1;
    }

    const lineCount = Math.max(
      1,
      ...input.dates.map((date) => shiftLineCount(worker, toLocalDateStr(date)))
    );
    const nameLines = Math.max(1, Math.ceil((worker.name || '').length / 28));
    sheet.getRow(row).height = Math.max(24, 12 + lineCount * 12, 16 + nameLines * 14);

    const nameCell = sheet.getCell(row, 1);
    nameCell.value = rich([
      { text: `${worker.name || 'Sin nombre'}\n`, size: 11, color: 'FF0F172A', bold: true },
      { text: worker.assignedShift || 'N/A', size: 8, color: SOFT },
    ]);
    nameCell.fill = solid(WHITE);
    setWrap(nameCell, 'left');
    nameCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
    nameCell.border = {
      ...thin(),
      right: { style: 'medium', color: { argb: WEEK_LINE } },
    };

    weeks.forEach((weekDates, weekIdx) => {
      weekDates.forEach((date, dayIdx) => {
        const dateStr = toLocalDateStr(date);
        paintChip(
          sheet.getCell(row, dayColumn(weekIdx, dayIdx)),
          paintForShift(worker, dateStr),
          dateStr,
          input.selectedDate
        );
      });
      paintHoursValue(
        sheet.getCell(row, hoursColumn(weekIdx)),
        weekHoursForWorker(worker, weekDates),
        'FFF8FAFC',
        'FF334155',
        SOFT
      );
    });
    row += 1;

    if (showGroupSubtotal) {
      const fill = GROUP_FILL[shiftGroup.key];
      const color = GROUP_TEXT[shiftGroup.key];
      const subtotalName = sheet.getCell(row, 1);
      subtotalName.value = rich([
        { text: `SUBTOTAL ${shiftGroup.label.toLocaleUpperCase('es-PE')}\n`, size: 8, color, bold: true },
        { text: workerCountLabel(members.length), size: 12, color, bold: true },
      ]);
      subtotalName.fill = solid(fill);
      setWrap(subtotalName, 'left');
      subtotalName.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
      subtotalName.border = {
        top: { style: 'medium', color: { argb: WEEK_LINE } },
        right: { style: 'medium', color: { argb: WEEK_LINE } },
        bottom: { style: 'thin', color: { argb: LINE } },
        left: { style: 'thin', color: { argb: LINE } },
      };
      weeks.forEach((weekDates, weekIdx) => {
        weekDates.forEach((date, dayIdx) => {
          const dateStr = toLocalDateStr(date);
          paintCountCell(
            sheet.getCell(row, dayColumn(weekIdx, dayIdx)),
            countRosterShiftsForDate(members, dateStr),
            fill,
            color,
            dateStr,
            input.selectedDate
          );
        });
        const hoursCell = sheet.getCell(row, hoursColumn(weekIdx));
        paintHoursValue(hoursCell, weekHoursForGroup(members, weekDates), fill, color, color);
        hoursCell.border = {
          ...(hoursCell.border || {}),
          top: { style: 'medium', color: { argb: WEEK_LINE } },
          right: { style: 'medium', color: { argb: WEEK_LINE } },
        };
      });
      sheet.getRow(row).height = 34;
      row += 1;
    }
  });

  const footer = sheet.getRow(row);
  footer.height = 34;
  const footerName = sheet.getCell(row, 1);
  footerName.value = rich([
    { text: 'PROGRAMADOS\n', size: 9, color: 'FF334155', bold: true },
    { text: 'Dia / Tarde / Noche', size: 8, color: SOFT },
  ]);
  footerName.fill = solid(SLATE_50);
  setWrap(footerName, 'left');
  footerName.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
  footerName.border = {
    top: { style: 'medium', color: { argb: 'FF94A3B8' } },
    right: { style: 'medium', color: { argb: WEEK_LINE } },
    bottom: { style: 'thin', color: { argb: LINE } },
    left: { style: 'thin', color: { argb: LINE } },
  };

  weeks.forEach((weekDates, weekIdx) => {
    const dateStrs = weekDates.map(toLocalDateStr);
    const programmedIds = new Set<string>();
    input.workers.forEach((worker) => {
      const hasShift = dateStrs.some((dateStr) =>
        isProgrammedWorkShift(worker.workSchedule?.find((shift) => shift.date === dateStr)?.type)
      );
      if (hasShift) programmedIds.add(worker.id);
    });
    const programmedShifts = dateStrs.reduce(
      (acc, dateStr) => acc + countRosterShiftsForDate(input.workers, dateStr).programmed,
      0
    );
    weekDates.forEach((date, dayIdx) => {
      const dateStr = toLocalDateStr(date);
      const cell = sheet.getCell(row, dayColumn(weekIdx, dayIdx));
      paintCountCell(
        cell,
        countRosterShiftsForDate(input.workers, dateStr),
        SLATE_50,
        INK,
        dateStr,
        input.selectedDate
      );
      cell.border = {
        ...(cell.border || {}),
        top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      };
    });
    const summary = sheet.getCell(row, hoursColumn(weekIdx));
    summary.value = rich([
      { text: `${programmedIds.size}\n`, size: 12, color: INK, bold: true },
      { text: `trab. / ${programmedShifts} turnos`, size: 8, color: MUTED },
    ]);
    summary.fill = solid(SLATE_100);
    setWrap(summary);
    summary.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      right: { style: 'medium', color: { argb: WEEK_LINE } },
      bottom: { style: 'thin', color: { argb: LINE } },
      left: { style: 'thin', color: { argb: LINE } },
    };
  });

  sheet.headerFooter.oddFooter = '&LOpsFlow&CProgramación de turnos&RPágina &P';
  sheet.pageSetup.printTitlesRow = `1:${dayHeaderRow}`;
  return sheet;
}

const coverageFill = (type: string) => {
  if (type === 'Day') return BLUE;
  if (type === 'Afternoon') return AMBER;
  if (type === 'Night') return INDIGO;
  if (type === 'Vacation') return ORANGE;
  return SLATE_100;
};

const coverageCaption = (worker: RosterExcelWorker, dateStr: string) => {
  const shift = worker.workSchedule?.find((item) => item.date === dateStr);
  const window = resolveShiftWindow(shift, worker);
  const type = shift?.type || 'OFF';
  if (type === 'OFF') return { primary: 'Descanso', strong: true };
  if (window) {
    const prefix = isVacationWithCoverage(shift) ? 'Vac cob. · ' : '';
    return { primary: `${prefix}${formatShiftTimeRange(window.startTime, window.endTime)} · ${formatHours(window.hours)}h`, strong: false };
  }
  if (type === 'Vacation') return { primary: 'Vac s/cob', strong: false };
  return { primary: rosterShiftShortLabel(type), strong: false };
};

function buildCoverageSheet(workbook: ExcelJS.Workbook, input: RosterExcelInput) {
  const lastCol = 25;
  const [year, month, day] = input.selectedDate.split('-').map(Number);
  const selected = new Date(year || 1970, (month || 1) - 1, day || 1);
  const dateLabel = Number.isFinite(selected.getTime())
    ? selected.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    : input.selectedDate;
  const today = new Date();
  const isToday = toLocalDateStr(today) === input.selectedDate;
  const todayHour = today.getHours();
  const headerRow = 4;

  const sheet = workbook.addWorksheet('Cobertura por hora', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: headerRow, showGridLines: false, zoomScale: 120 }],
    properties: { defaultRowHeight: 18, tabColor: { argb: INDIGO } },
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.45, bottom: 0.4, header: 0.2, footer: 0.25 },
      printTitlesRow: `1:${headerRow}`,
    },
  });

  sheet.getColumn(1).width = 36;
  for (let column = 2; column <= lastCol; column += 1) sheet.getColumn(column).width = 4.4;

  sheet.mergeCells(1, 1, 1, 12);
  const title = sheet.getCell(1, 1);
  title.value = 'Cobertura por hora';
  title.font = textFont(14, INK, true);
  title.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.mergeCells(1, 13, 1, lastCol);
  const dateCell = sheet.getCell(1, 13);
  dateCell.value = dateLabel;
  dateCell.font = textFont(11, 'FF334155', true);
  dateCell.alignment = { horizontal: 'right', vertical: 'middle' };
  sheet.getRow(1).height = 24;

  sheet.mergeCells(2, 1, 2, lastCol);
  const note = sheet.getCell(2, 1);
  note.value = 'Cada bloque cubre las horas reales del trabajador. Vacaciones con cobertura se muestran cubiertas por el reemplazo.';
  note.font = textFont(9, MUTED);
  note.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  sheet.getRow(2).height = 18;
  sheet.getRow(3).height = 8;

  const nameHeader = sheet.getCell(headerRow, 1);
  nameHeader.value = 'COLABORADOR';
  nameHeader.font = textFont(8, MUTED, true);
  nameHeader.fill = solid(WHITE);
  nameHeader.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  nameHeader.border = {
    bottom: { style: 'medium', color: { argb: WEEK_LINE } },
    right: { style: 'medium', color: { argb: WEEK_LINE } },
  };
  ROSTER_HOURS.forEach((hour) => {
    const cell = sheet.getCell(headerRow, hour + 2);
    const current = isToday && hour === todayHour;
    cell.value = String(hour).padStart(2, '0');
    cell.font = textFont(8, current ? SELECTED_TEXT : MUTED, true);
    cell.fill = solid(current ? SELECTED : WHITE);
    setWrap(cell);
    cell.border = { bottom: { style: 'medium', color: { argb: current ? 'FF93C5FD' : WEEK_LINE } } };
  });
  sheet.getRow(headerRow).height = 20;

  let row = headerRow + 1;
  if (input.workers.length === 0) {
    sheet.mergeCells(row, 1, row, lastCol);
    const empty = sheet.getCell(row, 1);
    empty.value = 'No hay colaboradores para mostrar cobertura.';
    empty.font = { ...textFont(11, SOFT), italic: true };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(row).height = 28;
    row += 1;
  }

  const counts = ROSTER_HOURS.map((hour) =>
    input.workers.reduce((total, worker) => {
      const shift = worker.workSchedule?.find((item) => item.date === input.selectedDate);
      const window = resolveShiftWindow(shift, worker);
      if (!window || !shift) return total;
      if (!isRosterWorkShift(shift.type) && !isVacationWithCoverage(shift)) return total;
      return total + (shiftCoversHour(window.startTime, window.endTime, hour) ? 1 : 0);
    }, 0)
  );

  input.workers.forEach((worker) => {
    const shift = worker.workSchedule?.find((item) => item.date === input.selectedDate);
    const window = resolveShiftWindow(shift, worker);
    const type = shift?.type || 'OFF';
    const isOff = type === 'OFF';
    const vacationCovered = isVacationWithCoverage(shift);
    const fillType = isRosterWorkShift(type)
      ? type
      : vacationCovered
        ? workTypeFromAssignedShift(worker.assignedShift)
        : type;
    const showsHours = !!(window && (isRosterWorkShift(type) || vacationCovered));
    const caption = coverageCaption(worker, input.selectedDate);

    const nameCell = sheet.getCell(row, 1);
    nameCell.value = rich([
      { text: `${worker.name || 'Sin nombre'}\n`, size: 10, color: 'FF1E293B', bold: true },
      { text: caption.primary, size: 8, color: caption.strong ? MUTED : SOFT, bold: caption.strong },
    ]);
    nameCell.fill = solid(isOff ? SLATE_50 : WHITE);
    setWrap(nameCell, 'left');
    nameCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
    nameCell.border = {
      ...thin(),
      right: { style: 'medium', color: { argb: WEEK_LINE } },
    };
    sheet.getRow(row).height = 30;

    if (isOff) {
      for (let column = 2; column <= lastCol; column += 1) {
        const cell = sheet.getCell(row, column);
        cell.fill = {
          type: 'pattern',
          pattern: 'lightDown',
          fgColor: { argb: 'FFCBD5E1' },
          bgColor: { argb: 'FFF8FAFC' },
        };
        cell.border = thin(WHITE);
      }
      sheet.mergeCells(row, 2, row, lastCol);
      const rest = sheet.getCell(row, 2);
      rest.value = 'DESCANSO';
      rest.font = textFont(8, 'FF475569', true);
      setWrap(rest);
    } else {
      ROSTER_HOURS.forEach((hour) => {
        const covered = !!(window && showsHours && shiftCoversHour(window.startTime, window.endTime, hour));
        const current = isToday && hour === todayHour;
        const cell = sheet.getCell(row, hour + 2);
        cell.fill = solid(covered ? coverageFill(fillType) : current ? 'FFDBEAFE' : SLATE_100);
        cell.border = {
          top: { style: 'thin', color: { argb: WHITE } },
          left: { style: 'thin', color: { argb: WHITE } },
          bottom: { style: 'thin', color: { argb: WHITE } },
          right: { style: 'thin', color: { argb: WHITE } },
        };
      });
    }
    row += 1;
  });

  const totalName = sheet.getCell(row, 1);
  totalName.value = 'EN TURNO';
  totalName.font = textFont(9, 'FF334155', true);
  totalName.fill = solid(SLATE_50);
  totalName.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  totalName.border = {
    top: { style: 'medium', color: { argb: 'FF94A3B8' } },
    right: { style: 'medium', color: { argb: WEEK_LINE } },
  };
  counts.forEach((count, hour) => {
    const current = isToday && hour === todayHour;
    const cell = sheet.getCell(row, hour + 2);
    cell.value = count;
    cell.font = textFont(9, current ? SELECTED_TEXT : 'FF334155', true);
    cell.fill = solid(current ? SELECTED : SLATE_50);
    setWrap(cell);
    cell.border = { top: { style: 'medium', color: { argb: 'FF94A3B8' } } };
  });
  sheet.getRow(row).height = 22;
  sheet.headerFooter.oddFooter = '&LOpsFlow&CCobertura por hora&RPágina &P';
}

export function rosterExcelFilename(unitName: string, dates: Date[]): string {
  const start = dates[0] ? toLocalDateStr(dates[0]) : '';
  const end = dates.length ? toLocalDateStr(dates[dates.length - 1]) : '';
  const unitSlug = (unitName || 'unidad').replace(/[^\wáéíóúñÁÉÍÓÚÑ]+/gi, '_').replace(/^_|_$/g, '');
  return `programacion_${unitSlug}_${start}_${end}.xlsx`;
}

export function buildRosterWorkbook(input: RosterExcelInput): ExcelJS.Workbook {
  const workbook = createWorkbook();
  workbook.creator = 'OpsFlow';
  workbook.created = new Date();
  workbook.title = `${input.unitName || 'Unidad'} — Programación de turnos`;
  buildTurnosSheet(workbook, input);
  buildCoverageSheet(workbook, input);
  return workbook;
}

export async function downloadRosterExcel(input: RosterExcelInput): Promise<void> {
  const workbook = buildRosterWorkbook(input);
  const raw = await workbook.xlsx.writeBuffer();
  const blob = new Blob([raw as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = rosterExcelFilename(input.unitName, input.dates);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
