import React from 'react';
import type { PresentationOpsflowIntake } from '../types';

export const WORK_DAY_OPTIONS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

export const SHIFT_OPTIONS = ['Diurno', 'Tarde', 'Nocturno'] as const;

export const JORNADA_OPTIONS = ['8 horas', '12 horas'] as const;

export function jornadaOptionList(current?: string | null): string[] {
  const options: string[] = [...JORNADA_OPTIONS];
  const value = current?.trim();
  if (value && !options.includes(value)) options.push(value);
  return options;
}

export const REGIME_OPTIONS = ['General', 'Pyme', 'Mype'] as const;

function hasSpecifiedAmount(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0;
}

function hasFamilyAllowanceChoice(value: unknown): boolean {
  return value === true || value === false;
}

export function isOpsflowIntakeComplete(intake?: PresentationOpsflowIntake | null): boolean {
  if (!intake) return false;
  const salary = Number(intake.monthlySalary);
  return (
    Number.isFinite(salary) &&
    salary > 0 &&
    Array.isArray(intake.workDays) &&
    intake.workDays.length > 0 &&
    Boolean(intake.entryTime?.trim()) &&
    Boolean(intake.exitTime?.trim()) &&
    Boolean(intake.shift?.trim()) &&
    Boolean(intake.jornadaType?.trim()) &&
    Boolean(intake.laborRegime?.trim()) &&
    hasSpecifiedAmount(intake.mobilityBonus) &&
    hasFamilyAllowanceChoice(intake.familyAllowance)
  );
}

export function opsflowIntakeMissingLabels(
  intake?: PresentationOpsflowIntake | null,
): string[] {
  const missing: string[] = [];
  const salary = Number(intake?.monthlySalary);
  if (!Number.isFinite(salary) || salary <= 0) missing.push('Salario');
  if (!intake?.workDays?.length) missing.push('Días de trabajo');
  if (!intake?.entryTime?.trim()) missing.push('Hora de entrada');
  if (!intake?.exitTime?.trim()) missing.push('Hora de salida');
  if (!intake?.shift?.trim()) missing.push('Turno');
  if (!intake?.jornadaType?.trim()) missing.push('Tipo de jornada');
  if (!intake?.laborRegime?.trim()) missing.push('Régimen');
  if (!hasSpecifiedAmount(intake?.mobilityBonus)) missing.push('Bono de movilidad');
  if (!hasFamilyAllowanceChoice(intake?.familyAllowance)) missing.push('Asignación familiar');
  return missing;
}

const inputClassName =
  'w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500';

interface OpsflowIntakeFormProps {
  value: PresentationOpsflowIntake;
  disabled?: boolean;
  onChange: (next: PresentationOpsflowIntake) => void;
}

export const OpsflowIntakeForm: React.FC<OpsflowIntakeFormProps> = ({
  value,
  disabled = false,
  onChange,
}) => {
  const selectedDays = new Set(value.workDays ?? []);

  const toggleDay = (day: string) => {
    const next = new Set(selectedDays);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    onChange({
      ...value,
      workDays: WORK_DAY_OPTIONS.filter((d) => next.has(d)),
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">
            Salario mensual (S/)
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={disabled}
            value={value.monthlySalary ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                monthlySalary: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            className={inputClassName}
            placeholder="Ej. 1500"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">
            Bono de movilidad (S/)
          </span>
          <input
            type="number"
            min={0}
            step="0.01"
            disabled={disabled}
            value={value.mobilityBonus ?? ''}
            onChange={(e) =>
              onChange({
                ...value,
                mobilityBonus: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            className={inputClassName}
            placeholder="Ej. 100 (0 si no aplica)"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Jornada (8 o 12 horas)</span>
          <select
            disabled={disabled}
            value={value.jornadaType ?? ''}
            onChange={(e) => onChange({ ...value, jornadaType: e.target.value })}
            className={inputClassName}
          >
            <option value="">Seleccionar…</option>
            {jornadaOptionList(value.jornadaType).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Régimen</span>
          <select
            disabled={disabled}
            value={value.laborRegime ?? ''}
            onChange={(e) => onChange({ ...value, laborRegime: e.target.value })}
            className={inputClassName}
          >
            <option value="">Seleccionar…</option>
            {REGIME_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            {value.laborRegime &&
              !(REGIME_OPTIONS as readonly string[]).includes(value.laborRegime) && (
                <option value={value.laborRegime}>{value.laborRegime}</option>
              )}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">
            Asignación familiar
          </span>
          <select
            disabled={disabled}
            value={
              value.familyAllowance === true
                ? 'yes'
                : value.familyAllowance === false
                  ? 'no'
                  : ''
            }
            onChange={(e) => {
              const raw = e.target.value;
              onChange({
                ...value,
                familyAllowance: raw === 'yes' ? true : raw === 'no' ? false : null,
              });
            }}
            className={inputClassName}
          >
            <option value="">Seleccionar…</option>
            <option value="yes">Sí corresponde</option>
            <option value="no">No corresponde</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Hora de entrada</span>
          <input
            type="time"
            disabled={disabled}
            value={value.entryTime ?? ''}
            onChange={(e) => onChange({ ...value, entryTime: e.target.value })}
            className={inputClassName}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Hora de salida</span>
          <input
            type="time"
            disabled={disabled}
            value={value.exitTime ?? ''}
            onChange={(e) => onChange({ ...value, exitTime: e.target.value })}
            className={inputClassName}
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-xs font-medium text-slate-600">Turno</span>
          <select
            disabled={disabled}
            value={value.shift ?? ''}
            onChange={(e) => onChange({ ...value, shift: e.target.value })}
            className={inputClassName}
          >
            <option value="">Seleccionar…</option>
            {SHIFT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
            {value.shift &&
              !(SHIFT_OPTIONS as readonly string[]).includes(value.shift) && (
                <option value={value.shift}>{value.shift}</option>
              )}
          </select>
        </label>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-slate-600">Días de trabajo</p>
        <div className="flex flex-wrap gap-2">
          {WORK_DAY_OPTIONS.map((day) => {
            const active = selectedDays.has(day);
            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                onClick={() => toggleDay(day)}
                className={`min-h-[40px] rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {day.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
