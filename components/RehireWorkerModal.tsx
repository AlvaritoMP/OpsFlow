import React, { useState } from 'react';
import { Resource, Unit } from '../types';
import { Building, CheckCircle, UserPlus, X } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { DateInput } from './DateInput';
import { filterOperationalUnits } from '../utils/unitStatus';
import { formatDateDisplay } from '../utils/dateFormat';
import {
  REGIME_OPTIONS,
  SHIFT_OPTIONS,
  WORK_DAY_OPTIONS,
  jornadaOptionList,
} from './OpsflowIntakeForm';
import {
  REHIRE_REASON_PRESETS,
  RehirePersonnelInput,
  WorkerRehireBadge,
  buildRehireReason,
} from '../services/workerRehireService';

interface RehireWorkerModalProps {
  personnel: Resource & { originalUnitId: string; originalUnitName: string };
  units: Unit[];
  successor: WorkerRehireBadge | null;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (input: RehirePersonnelInput) => void;
}

interface RehireFormState {
  puesto: string;
  startDate: string;
  endDate: string;
  monthlySalary: string;
  workConditionAmount: string;
  mobilityBonus: string;
  jornadaType: string;
  laborRegime: string;
  familyAllowance: '' | 'yes' | 'no';
  workDays: string[];
  entryTime: string;
  exitTime: string;
  assignedShift: string;
  isShared: boolean;
}

function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseAmount(raw: string): number | undefined | 'invalid' {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return 'invalid';
  return value;
}

function familyValue(value: boolean | undefined): '' | 'yes' | 'no' {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return '';
}

export const RehireWorkerModal: React.FC<RehireWorkerModalProps> = ({
  personnel,
  units,
  successor,
  submitting,
  onClose,
  onConfirm,
}) => {
  const [unitId, setUnitId] = useState('');
  const [reasonPreset, setReasonPreset] = useState('');
  const [reasonOther, setReasonOther] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<RehireFormState>({
    puesto: personnel.puesto || '',
    startDate: todayIsoDate(),
    endDate: '',
    monthlySalary: personnel.monthlySalary != null ? String(personnel.monthlySalary) : '',
    workConditionAmount:
      personnel.workConditionAmount != null ? String(personnel.workConditionAmount) : '',
    mobilityBonus: personnel.mobilityBonus != null ? String(personnel.mobilityBonus) : '',
    jornadaType: personnel.jornadaType || '',
    laborRegime: personnel.laborRegime || '',
    familyAllowance: familyValue(personnel.familyAllowance),
    workDays: personnel.workDays ? [...personnel.workDays] : [],
    entryTime: personnel.entryTime || '',
    exitTime: personnel.exitTime || '',
    assignedShift: personnel.assignedShift || '',
    isShared: personnel.isShared || false,
  });

  const sameUnit = unitId !== '' && unitId === personnel.originalUnitId;
  const regimeOptions = [...REGIME_OPTIONS] as string[];
  if (form.laborRegime && !regimeOptions.includes(form.laborRegime)) {
    regimeOptions.push(form.laborRegime);
  }
  const shiftOptions = [...SHIFT_OPTIONS] as string[];
  if (form.assignedShift && !shiftOptions.includes(form.assignedShift)) {
    shiftOptions.push(form.assignedShift);
  }

  const handleConfirm = () => {
    if (successor?.successorActive) return;
    if (!unitId) {
      setFormError('Seleccione la unidad de la nueva relación laboral.');
      return;
    }
    if (!reasonPreset) {
      setFormError('Indique el motivo de la recontratación.');
      return;
    }
    if (reasonPreset === 'Otro' && !reasonOther.trim()) {
      setFormError('Describa el motivo de la recontratación.');
      return;
    }
    if (!form.startDate) {
      setFormError('Indique la fecha de inicio de la nueva contratación.');
      return;
    }
    if (form.endDate && form.endDate < form.startDate) {
      setFormError('La fecha de fin no puede ser anterior al inicio.');
      return;
    }

    const monthlySalary = parseAmount(form.monthlySalary);
    const workConditionAmount = parseAmount(form.workConditionAmount);
    const mobilityBonus = parseAmount(form.mobilityBonus);
    if (monthlySalary === 'invalid' || workConditionAmount === 'invalid' || mobilityBonus === 'invalid') {
      setFormError('Revise los montos: deben ser números iguales o mayores a cero.');
      return;
    }

    setFormError('');
    onConfirm({
      targetUnitId: unitId,
      rehireReason: buildRehireReason(reasonPreset, reasonOther),
      puesto: form.puesto.trim() || undefined,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      monthlySalary,
      workConditionAmount,
      mobilityBonus,
      familyAllowance:
        form.familyAllowance === 'yes' ? true : form.familyAllowance === 'no' ? false : undefined,
      jornadaType: form.jornadaType.trim() || undefined,
      laborRegime: form.laborRegime.trim() || undefined,
      workDays: form.workDays.length ? form.workDays : undefined,
      entryTime: form.entryTime.trim() || undefined,
      exitTime: form.exitTime.trim() || undefined,
      assignedShift: form.assignedShift.trim() || undefined,
      isShared: form.isShared,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[92vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800 flex items-center">
              <UserPlus className="mr-2" size={24} />
              Recontratar trabajador
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600" disabled={submitting}>
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            Se abre una relación laboral distinta. El cese o archivo de esta ficha no se borra.
            La nueva ficha entra a Envío Opalosis para que generen otro contrato. Recuperar, en cambio,
            solo devuelve esta misma ficha como estaba antes del cese.
          </div>

          {successor?.successorActive && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Ya hay una recontratación activa de {personnel.name}. El cese de esta ficha se conserva.
              Cese esa relación nueva antes de recontratar otra vez.
            </div>
          )}

          <div className="flex items-center">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-100 flex-shrink-0 mr-4">
              <SafeImage
                src={personnel.image}
                alt={personnel.name}
                className="w-full h-full object-cover"
                bucket="unit-images"
                fallback={
                  <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 text-lg">
                    {personnel.name.charAt(0).toUpperCase()}
                  </div>
                }
              />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">{personnel.name}</h3>
              <p className="text-sm text-slate-600">
                {personnel.dni ? <span className="font-mono">{personnel.dni}</span> : 'Sin documento'}
                {personnel.puesto ? ` · ${personnel.puesto}` : ''}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                <Building className="inline mr-1" size={12} />
                Relación anterior: {personnel.originalUnitName}
                {personnel.endDate ? ` · cese ${formatDateDisplay(personnel.endDate)}` : ''}
                {personnel.personnelStatus === 'cesado' ? ' · Cesado' : ' · Archivado'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-slate-50 rounded-lg p-4">
            <div>
              <span className="text-slate-500">Contacto que se copia:</span>{' '}
              <span className="font-medium">{personnel.phone || personnel.email || 'Sin teléfono ni correo'}</span>
            </div>
            <div>
              <span className="text-slate-500">Localidad:</span>{' '}
              <span className="font-medium">{personnel.localidad || 'Sin localidad'}</span>
            </div>
            <div className="sm:col-span-2 text-xs text-slate-500">
              También se copian nacimiento, foto, ficha y capacitaciones. Activos, tareo y el historial de este cese se quedan en la relación anterior.
            </div>
            {personnel.terminationReason && (
              <div className="sm:col-span-2">
                <span className="text-slate-500">Motivo del cese que permanece:</span>{' '}
                <span className="font-medium">{personnel.terminationReason}</span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Unidad de la nueva relación *</label>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Seleccione una unidad...</option>
              {filterOperationalUnits<Unit>(units).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                  {unit.id === personnel.originalUnitId ? ' (misma unidad del cese)' : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-2">
              {sameUnit
                ? 'Misma unidad: sirve para un cambio de régimen o de condiciones. El cese anterior sigue en el archivo y esta alta es otro contrato.'
                : 'Puede ser otra unidad o la misma, si lo que cambia es el régimen o las condiciones laborales.'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Motivo de la recontratación *</label>
            <select
              value={reasonPreset}
              onChange={(e) => {
                setReasonPreset(e.target.value);
                if (e.target.value !== 'Otro') setReasonOther('');
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Seleccione un motivo...</option>
              {REHIRE_REASON_PRESETS.map((preset) => (
                <option key={preset} value={preset}>{preset}</option>
              ))}
              <option value="Otro">Otro</option>
            </select>
            {reasonPreset === 'Otro' && (
              <textarea
                value={reasonOther}
                onChange={(e) => setReasonOther(e.target.value)}
                placeholder="Describa el motivo..."
                rows={2}
                className="mt-2 w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            )}
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-sm font-semibold text-slate-800 mb-1">Contratación, beneficios y condiciones</h4>
            <p className="text-xs text-slate-500 mb-3">
              Vienen precargados de la relación anterior para que los ajuste antes del nuevo contrato.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Puesto</label>
                <input
                  value={form.puesto}
                  onChange={(e) => setForm({ ...form, puesto: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Turno</label>
                <select
                  value={form.assignedShift}
                  onChange={(e) => setForm({ ...form, assignedShift: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Sin turno</option>
                  {shiftOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Inicio de la nueva relación *</label>
                <DateInput
                  value={form.startDate}
                  onChange={(startDate) => setForm({ ...form, startDate })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fin de contrato (referencial)</label>
                <DateInput
                  value={form.endDate}
                  onChange={(endDate) => setForm({ ...form, endDate })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Salario bruto mensual</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.monthlySalary}
                  onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Condición de trabajo (movilidad)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.workConditionAmount}
                  onChange={(e) => setForm({ ...form, workConditionAmount: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Bono</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.mobilityBonus}
                  onChange={(e) => setForm({ ...form, mobilityBonus: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jornada</label>
                <select
                  value={form.jornadaType}
                  onChange={(e) => setForm({ ...form, jornadaType: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Seleccionar...</option>
                  {jornadaOptionList(form.jornadaType).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Régimen</label>
                <select
                  value={form.laborRegime}
                  onChange={(e) => setForm({ ...form, laborRegime: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Seleccionar...</option>
                  {regimeOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Asignación familiar</label>
                <select
                  value={form.familyAllowance}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      familyAllowance: e.target.value === 'yes' || e.target.value === 'no' ? e.target.value : '',
                    })
                  }
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Seleccionar...</option>
                  <option value="yes">Sí corresponde</option>
                  <option value="no">No corresponde</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hora de entrada</label>
                <input
                  type="time"
                  value={form.entryTime}
                  onChange={(e) => setForm({ ...form, entryTime: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Hora de salida</label>
                <input
                  type="time"
                  value={form.exitTime}
                  onChange={(e) => setForm({ ...form, exitTime: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">Días de trabajo</label>
                <div className="flex flex-wrap gap-2">
                  {WORK_DAY_OPTIONS.map((day) => {
                    const selected = form.workDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          const next = selected
                            ? form.workDays.filter((item) => item !== day)
                            : [...form.workDays, day];
                          setForm({
                            ...form,
                            workDays: WORK_DAY_OPTIONS.filter((item) => next.includes(item)),
                          });
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                          selected
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-300'
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isShared}
                  onChange={(e) => setForm({ ...form, isShared: e.target.checked })}
                />
                Trabajador compartido entre unidades
              </label>
            </div>
          </div>

          {formError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || Boolean(successor?.successorActive)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Recontratando...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2" size={18} />
                  Recontratar y enviar a Opalosis
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
