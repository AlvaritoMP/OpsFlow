import React from 'react';
import { Resource } from '../types';

export type PersonnelEconomicSource = Pick<
  Resource,
  | 'monthlySalary'
  | 'workConditionAmount'
  | 'mobilityBonus'
  | 'familyAllowance'
  | 'assignedShift'
  | 'jornadaType'
  | 'laborRegime'
  | 'workDays'
  | 'entryTime'
  | 'exitTime'
>;

function formatClock(value?: string | null): string {
  if (!value?.trim()) return '';
  const match = value.trim().match(/^(\d{2}:\d{2})/);
  return match ? match[1] : value.trim();
}

export function formatPenAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'No registrado';
  return `S/ ${Number(value).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function familyAllowanceLabel(value: boolean | null | undefined): string {
  if (value === true) return 'Sí corresponde';
  if (value === false) return 'No corresponde';
  return 'No registrado';
}

/** Salario + condición de trabajo + bono. La asignación familiar y el turno se muestran aparte. */
export function registeredFixedIncomeTotal(person: PersonnelEconomicSource): number | null {
  const amounts = [person.monthlySalary, person.workConditionAmount, person.mobilityBonus]
    .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  if (amounts.length === 0) return null;
  return amounts.reduce((sum, value) => sum + value, 0);
}

export function economicExportFields(person: PersonnelEconomicSource): Record<string, string> {
  const schedule = [formatClock(person.entryTime), formatClock(person.exitTime)].filter(Boolean).join(' - ');
  const total = registeredFixedIncomeTotal(person);
  return {
    Turno: person.assignedShift?.trim() || '',
    Jornada: person.jornadaType?.trim() || '',
    'Régimen laboral': person.laborRegime?.trim() || '',
    'Salario bruto (S/)': person.monthlySalary != null ? formatPenAmount(person.monthlySalary) : '',
    'Condición de trabajo (S/)': person.workConditionAmount != null ? formatPenAmount(person.workConditionAmount) : '',
    'Bono (S/)': person.mobilityBonus != null ? formatPenAmount(person.mobilityBonus) : '',
    'Asignación familiar': person.familyAllowance == null ? '' : familyAllowanceLabel(person.familyAllowance),
    'Días de trabajo': person.workDays?.filter(Boolean).join(', ') || '',
    Horario: schedule,
    'Total montos fijos (S/)': total == null ? '' : formatPenAmount(total),
  };
}

interface PersonnelEconomicSummaryProps {
  person: PersonnelEconomicSource;
  title?: string;
  tone?: 'archive' | 'terminated' | 'neutral';
}

const TONE_CLASS = {
  archive: 'border-amber-200 bg-amber-50/70',
  terminated: 'border-red-200 bg-red-50/60',
  neutral: 'border-slate-200 bg-slate-50',
} as const;

export const PersonnelEconomicSummary: React.FC<PersonnelEconomicSummaryProps> = ({
  person,
  title = 'Condiciones económicas antes del cese',
  tone = 'neutral',
}) => {
  const total = registeredFixedIncomeTotal(person);
  const entry = formatClock(person.entryTime);
  const exit = formatClock(person.exitTime);
  const schedule = entry || exit ? `${entry || '—'} – ${exit || '—'}` : 'No registrado';
  const days = person.workDays?.filter(Boolean).join(', ') || 'No registrado';

  const items: Array<{ label: string; value: string }> = [
    { label: 'Salario bruto mensual', value: formatPenAmount(person.monthlySalary) },
    { label: 'Condición de trabajo (movilidad)', value: formatPenAmount(person.workConditionAmount) },
    { label: 'Bono', value: formatPenAmount(person.mobilityBonus) },
    { label: 'Asignación familiar', value: familyAllowanceLabel(person.familyAllowance) },
    { label: 'Turno (diurno, tarde o nocturno)', value: person.assignedShift?.trim() || 'No registrado' },
    { label: 'Jornada', value: person.jornadaType?.trim() || 'No registrado' },
    { label: 'Régimen laboral', value: person.laborRegime?.trim() || 'No registrado' },
    { label: 'Días de trabajo', value: days },
    { label: 'Horario', value: schedule },
  ];

  return (
    <div className={`rounded-lg border px-3 py-3 ${TONE_CLASS[tone]}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{title}</p>
          <p className="mt-1 text-xs text-slate-500">
            Conceptos que formaban parte del ingreso al momento del cese o archivo.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total de montos fijos</p>
          <p className="text-sm font-semibold text-slate-900">
            {total == null ? 'No registrado' : formatPenAmount(total)}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-[11px] font-medium text-slate-500">{item.label}</dt>
            <dd className="text-sm font-semibold text-slate-800 break-words">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        El total suma salario bruto, condición de trabajo y bono. La asignación familiar y el turno diurno o nocturno
        también afectan el ingreso, y se muestran como estaban registrados antes del cese.
      </p>
    </div>
  );
};
