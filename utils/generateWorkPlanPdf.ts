import type { Unit, UnitWorkPlan, WorkPlanActivity, WorkPlanShift } from '../types';
import { formatDateDisplay } from './dateFormat';
import {
  WEEKDAY_OPTIONS,
  appliesOnDay,
  audienceLabel,
  formatPlanStamp,
  formatActivityZones,
  formatTimeRange,
  frequencyMeta,
  planStatusLabel,
  weekdayShort,
} from './workPlan';

const NAVY: [number, number, number] = [22, 48, 92];
const RED: [number, number, number] = [185, 28, 28];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [203, 213, 225];
const HEAD: [number, number, number] = [241, 245, 249];
const WHITE: [number, number, number] = [255, 255, 255];
const AMBER: [number, number, number] = [180, 83, 9];

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 10;
const CONTENT_W = PAGE_W - MARGIN * 2;

function safeFilename(unitName: string, title: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const part = `${unitName || 'unidad'}_${title || 'plan'}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 70);
  return `Plan_de_trabajo_${part || 'unidad'}_${stamp}.pdf`;
}

function frequencyLine(activity: WorkPlanActivity): string {
  const label = frequencyMeta(activity.frequency).label;
  if (activity.frequency === 'semanal') {
    const days = weekdayShort(activity.weekdays);
    return days ? `${label} · ${days}` : `${label} · sin días`;
  }
  return label;
}

function activityBlock(activity: WorkPlanActivity, who?: string): string {
  const zones = formatActivityZones(activity.zones);
  const zone = zones ? ` · ${zones}` : '';
  const owner = who ? `${who}: ` : '';
  return `${owner}${activity.text}\n${frequencyLine(activity)}${zone}`;
}

type PdfDoc = import('jspdf').jsPDF;

function paintHeader(doc: PdfDoc, title: string, subtitle: string): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(subtitle, CONTENT_W).slice(0, 2);
  const height = 12 + lines.length * 4;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, height, 'F');
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, MARGIN, 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(lines, MARGIN, 14);
  return height + 6;
}

function paintFooter(doc: PdfDoc, unitName: string) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Opalo · Plan de trabajo · ${unitName}`, MARGIN, PAGE_H - 5);
    doc.text(`${page} / ${pages}`, PAGE_W - MARGIN, PAGE_H - 5, { align: 'right' });
  }
}

function wrapped(doc: PdfDoc, text: string, width: number): string[] {
  if (!text) return [''];
  const lines = doc.splitTextToSize(text, Math.max(8, width - 2));
  return lines.length ? lines : [''];
}

function ensure(doc: PdfDoc, y: number, needed: number, continuation: string): number {
  if (y + needed <= PAGE_H - 12) return y;
  doc.addPage();
  return paintHeader(doc, 'PLAN DE TRABAJO', continuation);
}

function drawRow(
  doc: PdfDoc,
  y: number,
  cells: { text: string; width: number; bold?: boolean }[],
  fill?: [number, number, number],
): number {
  doc.setFontSize(8);
  const blocks = cells.map((cell) => {
    doc.setFont('helvetica', cell.bold ? 'bold' : 'normal');
    return wrapped(doc, cell.text, cell.width);
  });
  const lineH = 3.5;
  const height = Math.max(...blocks.map((lines) => lines.length)) * lineH + 3;
  let x = MARGIN;
  if (fill) {
    doc.setFillColor(...fill);
    doc.rect(MARGIN, y, CONTENT_W, height, 'F');
  }
  blocks.forEach((lines, index) => {
    const cell = cells[index];
    doc.setDrawColor(...LINE);
    doc.rect(x, y, cell.width, height);
    doc.setFont('helvetica', cell.bold ? 'bold' : 'normal');
    doc.setTextColor(...INK);
    doc.text(lines, x + 1.2, y + 3.6);
    x += cell.width;
  });
  return y + height;
}

function personColumns(shift: WorkPlanShift): { label: string; width: number; personId?: string; shared?: boolean }[] {
  const people = shift.people;
  const horario = 40;
  const turno = 48;
  const personW = (CONTENT_W - horario - turno) / people.length;
  return [
    { label: 'HORARIO', width: horario },
    ...people.map((person) => ({ label: person.name, width: personW, personId: person.id })),
    { label: 'TURNO', width: turno, shared: true },
  ];
}

function assignedIds(shift: WorkPlanShift, activity: WorkPlanActivity): string[] {
  return activity.personIds.filter((id) => shift.people.some((person) => person.id === id));
}

function cellText(shift: WorkPlanShift, activities: WorkPlanActivity[], column: { personId?: string; shared?: boolean }): string {
  const mine = activities.filter((activity) => {
    const ids = assignedIds(shift, activity);
    if (column.personId) return ids.includes(column.personId);
    return ids.length === 0;
  });
  if (column.shared) {
    const shiftName = shift.name.trim() || 'Turno';
    if (mine.length === 0) return shiftName;
    return [shiftName, ...mine.map((activity) => activityBlock(activity, audienceLabel(activity, shift.people)))].join('\n\n');
  }
  if (mine.length === 0) return '—';
  return mine.map((activity) => activityBlock(activity)).join('\n\n');
}

function drawMeasuredRow(
  doc: PdfDoc,
  y: number,
  cells: { text: string; width: number; bold?: boolean }[],
  continuation: string,
  fill?: [number, number, number],
): number {
  doc.setFontSize(8);
  const estimate = Math.max(...cells.map((cell) => wrapped(doc, cell.text, cell.width).length)) * 3.5 + 4;
  const nextY = ensure(doc, y, estimate, continuation);
  return drawRow(doc, nextY, cells, fill);
}

function drawPersonGrid(doc: PdfDoc, shift: WorkPlanShift, y: number, continuation: string): number {
  const columns = personColumns(shift);
  y = drawMeasuredRow(
    doc,
    y,
    columns.map((column) => ({ text: column.label, width: column.width, bold: true })),
    continuation,
    HEAD,
  );
  for (const slot of shift.slots) {
    const cells = columns.map((column, index) => (
      index === 0
        ? { text: formatTimeRange(slot.startTime, slot.endTime), width: column.width, bold: true }
        : { text: cellText(shift, slot.activities, column), width: column.width }
    ));
    y = drawMeasuredRow(doc, y, cells, continuation);
  }
  return y;
}

function drawActivityList(doc: PdfDoc, shift: WorkPlanShift, y: number, continuation: string): number {
  const widths = [42, 46, CONTENT_W - 42 - 46 - 34 - 28, 34, 28];
  const labels = ['HORARIO', 'QUIÉN', 'ACTIVIDAD', 'FRECUENCIA', 'ZONA'];
  y = drawMeasuredRow(
    doc,
    y,
    labels.map((label, index) => ({ text: label, width: widths[index], bold: true })),
    continuation,
    HEAD,
  );
  for (const slot of shift.slots) {
    const visible = slot.activities.filter((activity) => activity.text.trim());
    const rows = visible.length ? visible : [null];
    rows.forEach((activity) => {
      const cells = [
        { text: formatTimeRange(slot.startTime, slot.endTime), width: widths[0], bold: true },
        { text: activity ? audienceLabel(activity, shift.people) : '—', width: widths[1] },
        { text: activity?.text || '—', width: widths[2] },
        { text: activity ? frequencyLine(activity) : '—', width: widths[3] },
        { text: activity ? (formatActivityZones(activity.zones) || '—') : '—', width: widths[4] },
      ];
      y = drawMeasuredRow(doc, y, cells, continuation);
    });
  }
  return y;
}

function drawShiftTable(doc: PdfDoc, shift: WorkPlanShift, y: number, continuation: string): number {
  if (shift.slots.length === 0) {
    return drawMeasuredRow(
      doc,
      y,
      [{ text: 'Sin horarios en este turno', width: CONTENT_W }],
      continuation,
    );
  }
  const useGrid = shift.people.length > 0 && shift.people.length <= 4;
  return useGrid ? drawPersonGrid(doc, shift, y, continuation) : drawActivityList(doc, shift, y, continuation);
}

function drawCronograma(doc: PdfDoc, plan: UnitWorkPlan, continuation: string) {
  doc.addPage();
  let y = paintHeader(doc, 'CRONOGRAMA SEMANAL', continuation);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const note = 'Diaria y rutinaria salen todos los días. Semanal, solo los días marcados. De la semana, mientras este plan esté vigente.';
  const noteLines = doc.splitTextToSize(note, CONTENT_W);
  doc.text(noteLines, MARGIN, y);
  y += noteLines.length * 3.6 + 3;

  const dayW = 8;
  const daysW = dayW * 7;
  const turnoW = 32;
  const horarioW = 42;
  const quienW = 36;
  const actividadW = CONTENT_W - turnoW - horarioW - quienW - daysW;
  const widths = [turnoW, horarioW, actividadW, quienW, ...WEEKDAY_OPTIONS.map(() => dayW)];

  const headerCells = [
    { text: 'TURNO', width: widths[0], bold: true },
    { text: 'HORARIO', width: widths[1], bold: true },
    { text: 'ACTIVIDAD', width: widths[2], bold: true },
    { text: 'QUIÉN', width: widths[3], bold: true },
    ...WEEKDAY_OPTIONS.map((day, index) => ({ text: day.short, width: widths[4 + index], bold: true })),
  ];
  y = ensure(doc, y, 14, continuation);
  y = drawRow(doc, y, headerCells, HEAD);

  let any = false;
  for (const shift of plan.shifts) {
    for (const slot of shift.slots) {
      for (const activity of slot.activities) {
        if (!activity.text.trim()) continue;
        any = true;
        const cells = [
          { text: shift.name, width: widths[0] },
          { text: formatTimeRange(slot.startTime, slot.endTime), width: widths[1] },
          { text: `${activity.text}${formatActivityZones(activity.zones) ? `\n${formatActivityZones(activity.zones)}` : ''}`, width: widths[2] },
          { text: `${audienceLabel(activity, shift.people)}\n${frequencyLine(activity)}`, width: widths[3] },
          ...WEEKDAY_OPTIONS.map((_, index) => ({ text: '', width: widths[4 + index] })),
        ];
        doc.setFontSize(8);
        const estimate = Math.max(...cells.map((cell) => wrapped(doc, cell.text, cell.width).length)) * 3.5 + 4;
        y = ensure(doc, y, estimate, continuation);
        const before = y;
        y = drawRow(doc, y, cells);
        WEEKDAY_OPTIONS.forEach((day, index) => {
          if (!appliesOnDay(activity, day.value)) return;
          const color = activity.frequency === 'semana' ? RED : activity.frequency === 'semanal' ? AMBER : NAVY;
          const x = MARGIN + widths.slice(0, 4 + index).reduce((sum, width) => sum + width, 0) + dayW / 2;
          doc.setFillColor(...color);
          doc.circle(x, before + (y - before) / 2, 1.1, 'F');
        });
      }
    }
  }
  if (!any) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text('Este plan todavía no tiene actividades.', MARGIN, y + 6);
  }
}

export async function generateWorkPlanPdf(opts: { unit: Unit; plan: UnitWorkPlan }): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { unit, plan } = opts;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const unitName = unit.name || 'Unidad';
  const vigencia = plan.validFrom || plan.validUntil
    ? `${formatDateDisplay(plan.validFrom) || '…'} – ${formatDateDisplay(plan.validUntil) || '…'}`
    : 'Sin fechas de vigencia';
  const status = planStatusLabel(plan.status);
  const authors = [
    plan.createdByName ? `Creado por ${plan.createdByName}${plan.createdAt ? ` (${formatPlanStamp(plan.createdAt)})` : ''}` : '',
    plan.updatedByName ? `Último ajuste por ${plan.updatedByName}${plan.updatedAt ? ` (${formatPlanStamp(plan.updatedAt)})` : ''}` : '',
  ].filter(Boolean).join('  ·  ');
  const subtitle = [unitName, unit.clientName || '', plan.title, vigencia, status, authors].filter(Boolean).join('  ·  ');

  let y = paintHeader(doc, 'PLAN DE TRABAJO', subtitle);
  if (unit.address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    const address = doc.splitTextToSize(unit.address, CONTENT_W);
    doc.text(address, MARGIN, y);
    y += address.length * 3.4 + 1;
  }
  if (plan.notes?.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text('Observaciones', MARGIN, y + 3);
    doc.setFont('helvetica', 'normal');
    const notes = doc.splitTextToSize(plan.notes.trim(), CONTENT_W);
    doc.text(notes, MARGIN, y + 7);
    y += notes.length * 3.5 + 8;
  }

  const continuation = `${unitName} · ${plan.title}`;
  if (plan.shifts.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text('Este plan todavía no tiene turnos.', MARGIN, y + 8);
  }

  plan.shifts.forEach((shift, index) => {
    if (index > 0) {
      doc.addPage();
      y = paintHeader(doc, 'PLAN DE TRABAJO', `${unitName}  ·  ${plan.title}`);
    }
    y = ensure(doc, y, 18, continuation);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...NAVY);
    doc.text(shift.name || 'Turno', MARGIN, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...RED);
    const people = shift.people.length
      ? shift.people.map((person) => (person.role ? `${person.name} (${person.role})` : person.name)).join('   ·   ')
      : 'Sin personas asignadas';
    const peopleLines = doc.splitTextToSize(people, CONTENT_W);
    doc.text(peopleLines, MARGIN, y + 10);
    y += 12 + peopleLines.length * 4;
    y = drawShiftTable(doc, shift, y, continuation);
  });

  drawCronograma(doc, plan, continuation);
  paintFooter(doc, unitName);
  doc.save(safeFilename(unitName, plan.title));
}
