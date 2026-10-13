import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { Resource, Unit, UnitWorkPlan, WorkPlanActivity, WorkPlanFrequency, WorkPlanPerson, WorkPlanShift } from '../types';
import { ResourceType } from '../types';
import { DateInput } from './DateInput';
import { unitWorkPlanService } from '../services/unitWorkPlanService';
import { generateWorkPlanPdf } from '../utils/generateWorkPlanPdf';
import { formatDateDisplay } from '../utils/dateFormat';
import {
  FREQUENCY_OPTIONS,
  SHIFT_PRESETS,
  WEEKDAY_OPTIONS,
  addMinutes,
  audienceLabel,
  countActivities,
  cronogramaRows,
  duplicatePlan,
  emptyActivity,
  emptyPlan,
  exampleShifts,
  formatPlanStamp,
  formatTimeRange,
  frequencyMeta,
  makeShift,
  makeSlot,
  newWorkPlanId,
  planStatusLabel,
  sanitizePlan,
  semanalMissingDays,
  uniqueShiftName,
  validatePlan,
} from '../utils/workPlan';

interface UnitWorkPlanTabProps {
  unit: Unit;
  canEdit: boolean;
  currentUserId?: string;
  currentUserName?: string;
}

type Notice = { type: 'ok' | 'err'; text: string };

function isActivePersonnel(resource: Resource): boolean {
  if (resource.type !== ResourceType.PERSONNEL) return false;
  if (resource.archived) return false;
  const status = (resource.personnelStatus || '').toLowerCase();
  return status !== 'cesado' && status !== 'archivado';
}

function errorText(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'No se pudo completar la acción.';
  if (/created_by|updated_by_name/i.test(raw)) {
    return 'Falta actualizar la tabla del plan de trabajo. Vuelva a ejecutar migrations/MIGRATION_UNIT_WORK_PLANS.sql en Supabase.';
  }
  if (/unit_work_plans|schema cache|PGRST205|42P01/i.test(raw)) {
    return 'Falta crear la tabla del plan de trabajo. Ejecute migrations/MIGRATION_UNIT_WORK_PLANS.sql en Supabase y vuelva a abrir esta pestaña.';
  }
  return raw || 'No se pudo completar la acción.';
}

function NoticeBanner({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <div className={`rounded-xl px-3 py-2 text-sm ${notice.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
      {notice.text}
    </div>
  );
}

function PlanTrail({ plan }: { plan: UnitWorkPlan }) {
  if (!plan.id) {
    return (
      <p className="text-sm text-slate-500">
        Al guardar el avance queda registrado quién lo crea. Cada ajuste posterior indica quién fue el último en modificarlo.
      </p>
    );
  }
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 space-y-1">
      <p><span className="font-medium text-slate-900">Creado por</span> {plan.createdByName || 'sin registro'} · {formatPlanStamp(plan.createdAt)}</p>
      <p><span className="font-medium text-slate-900">Último ajuste por</span> {plan.updatedByName || 'sin registro'} · {formatPlanStamp(plan.updatedAt)}</p>
    </div>
  );
}

export const UnitWorkPlanTab: React.FC<UnitWorkPlanTabProps> = ({ unit, canEdit, currentUserId, currentUserName }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [plans, setPlans] = useState<UnitWorkPlan[]>([]);
  const [draft, setDraft] = useState<UnitWorkPlan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<'edit' | 'cronograma'>('edit');
  const [openShiftId, setOpenShiftId] = useState<string | null>(null);
  const [pickerShiftId, setPickerShiftId] = useState<string | null>(null);
  const [cronogramaDay, setCronogramaDay] = useState(1);

  const personnel = useMemo(
    () => (unit.resources || []).filter(isActivePersonnel).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [unit.resources],
  );
  const zoneNames = useMemo(
    () => (unit.zones || []).map((zone) => zone.name.trim()).filter(Boolean),
    [unit.zones],
  );

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      setPlans(await unitWorkPlanService.listByUnit(unit.id));
    } catch (error) {
      setNotice({ type: 'err', text: errorText(error) });
    } finally {
      setLoading(false);
    }
  }, [unit.id]);

  useEffect(() => {
    setDraft(null);
    setDirty(false);
    loadPlans();
  }, [loadPlans]);

  const updateDraft = (fn: (plan: UnitWorkPlan) => UnitWorkPlan) => {
    setDraft((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
  };

  const openPlan = (plan: UnitWorkPlan) => {
    setDraft(JSON.parse(JSON.stringify(plan)) as UnitWorkPlan);
    setDirty(false);
    setMode('edit');
    setOpenShiftId(plan.shifts[0]?.id || null);
    setNotice(null);
  };

  const leaveEditor = () => {
    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Salir de este plan?')) return;
    setDraft(null);
    setDirty(false);
    setPickerShiftId(null);
    setNotice(null);
  };

  const persist = async (plan: UnitWorkPlan): Promise<UnitWorkPlan | null> => {
    const problem = validatePlan(plan);
    if (problem) {
      setNotice({ type: 'err', text: problem });
      return null;
    }
    setSaving(true);
    try {
      const saved = await unitWorkPlanService.save(sanitizePlan({ ...plan, unitId: unit.id }), {
        id: currentUserId,
        name: currentUserName,
      });
      setDraft(saved);
      setDirty(false);
      setPlans(await unitWorkPlanService.listByUnit(unit.id));
      const wasSaved = Boolean(plan.id);
      setNotice({
        type: 'ok',
        text: saved.status === 'active'
          ? (wasSaved ? 'Versión final actualizada.' : 'Versión final guardada.')
          : 'Avance guardado. Puede seguir editándolo hasta dejar la versión final.',
      });
      return saved;
    } catch (error) {
      setNotice({ type: 'err', text: errorText(error) });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const download = async (plan: UnitWorkPlan, fromEditor = false) => {
    let source = plan;
    if (fromEditor && canEdit && (dirty || !plan.id)) {
      const saved = await persist(plan);
      if (!saved) return;
      source = saved;
    }
    setDownloadingId(source.id || 'nuevo');
    try {
      await generateWorkPlanPdf({ unit, plan: sanitizePlan(source) });
    } catch {
      setNotice({ type: 'err', text: 'No se pudo generar el PDF.' });
    } finally {
      setDownloadingId(null);
    }
  };

  const removePlan = async (plan: UnitWorkPlan) => {
    const final = plan.status === 'active';
    const question = final
      ? `¿Eliminar la versión final "${plan.title}"? Esta acción no se puede deshacer.`
      : `¿Eliminar "${plan.title}"? Esta acción no se puede deshacer.`;
    if (!window.confirm(question)) return;
    if (!plan.id) {
      setDraft(null);
      setDirty(false);
      return;
    }
    setSaving(true);
    try {
      await unitWorkPlanService.remove(plan.id);
      if (draft?.id === plan.id) {
        setDraft(null);
        setDirty(false);
      }
      setPlans(await unitWorkPlanService.listByUnit(unit.id));
      setNotice({ type: 'ok', text: 'Plan eliminado.' });
    } catch (error) {
      setNotice({ type: 'err', text: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  const copyPlan = async (plan: UnitWorkPlan) => {
    setSaving(true);
    try {
      const saved = await unitWorkPlanService.save(sanitizePlan(duplicatePlan({ ...plan, unitId: unit.id })), {
        id: currentUserId,
        name: currentUserName,
      });
      setPlans(await unitWorkPlanService.listByUnit(unit.id));
      openPlan(saved);
      setNotice({ type: 'ok', text: 'Se creó una copia en borrador.' });
    } catch (error) {
      setNotice({ type: 'err', text: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  const addPreset = (name: string, ranges: [string, string][]) => {
    if (!draft) return;
    const shift = makeShift(uniqueShiftName(draft.shifts.map((item) => item.name), name), ranges);
    updateDraft((plan) => ({ ...plan, shifts: [...plan.shifts, shift] }));
    setOpenShiftId(shift.id);
  };

  const loadExample = () => {
    if (!draft) return;
    if (draft.shifts.length > 0 && !window.confirm('Se agregarán turnos de ejemplo junto a los que ya tiene. Los horarios se pueden cambiar.')) return;
    const sample = exampleShifts(unit.unitClass).map((shift) => ({
      ...shift,
      name: uniqueShiftName(draft.shifts.map((item) => item.name), shift.name),
    }));
    // unique names must consider shifts added in the same batch
    const batch: WorkPlanShift[] = [];
    sample.forEach((shift) => {
      const name = uniqueShiftName([...draft.shifts, ...batch].map((item) => item.name), shift.name);
      batch.push({ ...shift, name });
    });
    updateDraft((plan) => ({ ...plan, shifts: [...plan.shifts, ...batch] }));
    setOpenShiftId(batch[0]?.id || null);
  };

  const pickerShift = draft?.shifts.find((shift) => shift.id === pickerShiftId) || null;

  if (loading && !draft) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-10">
        <Loader2 className="animate-spin" size={18} /> Cargando planes de trabajo...
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Plan de trabajo</h2>
          <p className="text-sm text-slate-600 mt-1">
            Arme los turnos, horarios y actividades de esta unidad. El formato del PDF es el mismo para todas; los turnos los define usted, porque no todas las unidades trabajan igual.
          </p>
        </div>
        <NoticeBanner notice={notice} />
        {canEdit && (
          <button
            type="button"
            onClick={() => openPlan(emptyPlan(unit.id, unit.name))}
            className="w-full h-12 rounded-xl bg-blue-600 text-white font-semibold flex items-center justify-center gap-2"
          >
            <Plus size={18} /> Crear plan
          </button>
        )}
        {plans.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
            Esta unidad todavía no tiene un plan de trabajo.
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <article key={plan.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <button type="button" onClick={() => openPlan(plan)} className="w-full text-left p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{plan.title}</p>
                      <p className="text-sm text-slate-500 mt-1">
                        {plan.shifts.length} {plan.shifts.length === 1 ? 'turno' : 'turnos'}
                        {' · '}
                        {countActivities(plan)} {countActivities(plan) === 1 ? 'actividad' : 'actividades'}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${plan.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                      {planStatusLabel(plan.status)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {plan.validFrom || plan.validUntil
                      ? `${formatDateDisplay(plan.validFrom) || '…'} – ${formatDateDisplay(plan.validUntil) || '…'}`
                      : 'Sin vigencia'}
                    {plan.shifts.length ? ` · ${plan.shifts.map((shift) => shift.name).join(', ')}` : ''}
                  </p>
                  <p className="text-xs text-slate-600 mt-2">Creado por {plan.createdByName || 'sin registro'}{plan.createdAt ? ` · ${formatPlanStamp(plan.createdAt)}` : ''}</p>
                  <p className="text-xs text-slate-600">Último ajuste por {plan.updatedByName || 'sin registro'}{plan.updatedAt ? ` · ${formatPlanStamp(plan.updatedAt)}` : ''}</p>
                </button>
                <div className={`grid border-t border-slate-100 ${canEdit ? 'grid-cols-3' : 'grid-cols-1'}`}>
                  <button type="button" onClick={() => download(plan)} disabled={downloadingId === plan.id} className="h-11 text-sm font-medium text-slate-700 flex items-center justify-center gap-1.5">
                    {downloadingId === plan.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} PDF
                  </button>
                  {canEdit && (
                    <button type="button" onClick={() => copyPlan(plan)} disabled={saving} className="h-11 text-sm font-medium text-slate-700 flex items-center justify-center gap-1.5 border-l border-slate-100">
                      <Copy size={15} /> Copiar
                    </button>
                  )}
                  {canEdit && (
                    <button type="button" onClick={() => removePlan(plan)} disabled={saving} className="h-11 text-sm font-medium text-red-600 flex items-center justify-center gap-1.5 border-l border-slate-100">
                      <Trash2 size={15} /> Eliminar
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  const missingDays = semanalMissingDays(draft);

  return (
    <div className="max-w-3xl">
      <div className="sticky top-0 z-20 -mx-6 md:-mx-8 px-6 md:px-8 py-3 bg-white/95 backdrop-blur border-b border-slate-100">
        <div className="flex items-center gap-2">
          <button type="button" onClick={leaveEditor} className="h-10 w-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-700 shrink-0" aria-label="Volver a los planes">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 truncate">{draft.title || 'Plan de trabajo'}</p>
            <p className="text-xs text-slate-500">{dirty ? 'Cambios sin guardar' : planStatusLabel(draft.status)}</p>
          </div>
          {canEdit && draft.id && (
            <button type="button" onClick={() => removePlan(draft)} disabled={saving} className="h-10 w-10 rounded-full border border-red-200 text-red-600 flex items-center justify-center shrink-0" aria-label="Eliminar plan">
              <Trash2 size={16} />
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 bg-slate-100 p-1 rounded-xl">
          <button type="button" onClick={() => setMode('edit')} className={`h-10 rounded-lg text-sm font-semibold ${mode === 'edit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
            Armar
          </button>
          <button type="button" onClick={() => setMode('cronograma')} className={`h-10 rounded-lg text-sm font-semibold ${mode === 'cronograma' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
            Cronograma
          </button>
        </div>
      </div>

      <div className="space-y-4 pt-4 pb-24">
        <NoticeBanner notice={notice} />
        <PlanTrail plan={draft} />

        {mode === 'cronograma' ? (
          <CronogramaView plan={draft} day={cronogramaDay} onDay={setCronogramaDay} missing={missingDays} />
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Nombre del plan</span>
                <input
                  value={draft.title}
                  disabled={!canEdit}
                  onChange={(event) => updateDraft((plan) => ({ ...plan, title: event.target.value }))}
                  className="mt-1 w-full h-12 rounded-xl border border-slate-300 px-3 text-base"
                />
              </label>
              <div>
                <span className="text-sm font-medium text-slate-700">Estado</span>
                <div className="mt-1 grid grid-cols-2 bg-slate-100 p-1 rounded-xl">
                  <button type="button" disabled={!canEdit} onClick={() => updateDraft((plan) => ({ ...plan, status: 'draft' }))} className={`h-10 rounded-lg text-sm font-semibold ${draft.status === 'draft' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                    En avance
                  </button>
                  <button type="button" disabled={!canEdit} onClick={() => updateDraft((plan) => ({ ...plan, status: 'active' }))} className={`h-10 rounded-lg text-sm font-semibold ${draft.status === 'active' ? 'bg-white shadow-sm text-emerald-800' : 'text-slate-500'}`}>
                    Versión final
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {draft.status === 'active'
                    ? 'Puede seguir actualizando la versión final. Cada guardado registra quién hizo el ajuste. Las otras versiones de la unidad pasan a avance.'
                    : 'Guarde el avance las veces que necesite. Cuando esté listo, márquelo como versión final.'}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-sm font-medium text-slate-700">Desde</span>
                  <DateInput value={draft.validFrom || ''} disabled={!canEdit} onChange={(iso) => updateDraft((plan) => ({ ...plan, validFrom: iso || null }))} className="mt-1 w-full h-12 rounded-xl border border-slate-300 px-3 text-base" />
                </div>
                <div>
                  <span className="text-sm font-medium text-slate-700">Hasta</span>
                  <DateInput value={draft.validUntil || ''} disabled={!canEdit} onChange={(iso) => updateDraft((plan) => ({ ...plan, validUntil: iso || null }))} className="mt-1 w-full h-12 rounded-xl border border-slate-300 px-3 text-base" />
                </div>
              </div>
              <p className="text-xs text-slate-500">Las fechas son opcionales. Úselas si el plan es de una semana o un mes.</p>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Observaciones</span>
                <textarea
                  value={draft.notes || ''}
                  disabled={!canEdit}
                  rows={2}
                  placeholder="Indicaciones para el equipo, si hacen falta."
                  onChange={(event) => updateDraft((plan) => ({ ...plan, notes: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-base"
                />
              </label>
            </section>

            {draft.shifts.length === 0 && (
              <section className="rounded-2xl border border-dashed border-slate-300 p-4 space-y-3">
                <p className="text-sm text-slate-600">
                  {unit.unitClass === 'BPO'
                    ? 'Puede empezar con una jornada de oficina y cambiar las horas, o crear el turno que esta unidad usa.'
                    : 'Puede empezar con mañana, tarde y noche y cambiar las horas, o crear solo los turnos que esta unidad usa.'}
                </p>
                {canEdit && (
                  <button type="button" onClick={loadExample} className="w-full h-11 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 font-semibold text-sm">
                    {unit.unitClass === 'BPO' ? 'Cargar una jornada de ejemplo' : 'Cargar turnos de ejemplo'}
                  </button>
                )}
              </section>
            )}

            {draft.shifts.map((shift, index) => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                open={openShiftId === shift.id}
                canEdit={canEdit}
                zones={zoneNames}
                onToggle={() => setOpenShiftId((current) => (current === shift.id ? null : shift.id))}
                onChange={(next) => updateDraft((plan) => ({
                  ...plan,
                  shifts: plan.shifts.map((item) => (item.id === shift.id ? next : item)),
                }))}
                onRemove={() => {
                  if (shift.slots.some((slot) => slot.activities.length) && !window.confirm(`¿Quitar el turno ${shift.name || ''}?`)) return;
                  updateDraft((plan) => ({ ...plan, shifts: plan.shifts.filter((item) => item.id !== shift.id) }));
                }}
                onMove={(direction) => updateDraft((plan) => {
                  const shifts = [...plan.shifts];
                  const target = index + direction;
                  if (target < 0 || target >= shifts.length) return plan;
                  const [item] = shifts.splice(index, 1);
                  shifts.splice(target, 0, item);
                  return { ...plan, shifts };
                })}
                canMoveUp={index > 0}
                canMoveDown={index < draft.shifts.length - 1}
                onAddPerson={() => setPickerShiftId(shift.id)}
              />
            ))}

            {canEdit && (
              <section className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Agregar turno</p>
                <div className="flex flex-wrap gap-2">
                  {SHIFT_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => addPreset(preset.name, preset.ranges)}
                      className="h-11 px-3 rounded-full border border-slate-300 bg-white text-sm font-medium text-slate-800"
                    >
                      {preset.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => addPreset('Turno', [['08:00', '12:00']])}
                    className="h-11 px-3 rounded-full border border-slate-300 bg-white text-sm font-medium text-slate-800 inline-flex items-center gap-1"
                  >
                    <Plus size={15} /> Otro
                  </button>
                </div>
                {draft.shifts.length > 0 && (
                  <button type="button" onClick={loadExample} className="text-sm text-blue-700 font-medium">
                    Agregar también el ejemplo de turnos
                  </button>
                )}
              </section>
            )}

            {canEdit && draft.id && (
              <button type="button" onClick={() => removePlan(draft)} className="text-sm font-medium text-red-600">
                Eliminar este plan
              </button>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-0 z-30 mt-4 -mx-6 md:-mx-8 px-6 md:px-8 py-3 bg-white/95 backdrop-blur border-t border-slate-200 flex gap-2">
        {canEdit && (
          <button type="button" onClick={() => draft && persist(draft)} disabled={saving} className="flex-1 h-12 rounded-xl bg-blue-600 text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} {draft.status === 'active' ? 'Actualizar' : 'Guardar avance'}
          </button>
        )}
        <button type="button" onClick={() => download(draft, true)} disabled={saving || downloadingId !== null} className="flex-1 h-12 rounded-xl border border-slate-300 bg-white text-slate-800 font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {downloadingId ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} PDF
        </button>
      </div>

      {pickerShift && (
        <PersonPicker
          shift={pickerShift}
          personnel={personnel}
          onClose={() => setPickerShiftId(null)}
          onAdd={(person) => {
            updateDraft((plan) => ({
              ...plan,
              shifts: plan.shifts.map((shift) => (
                shift.id === pickerShift.id ? { ...shift, people: [...shift.people, person] } : shift
              )),
            }));
          }}
        />
      )}
    </div>
  );
};

const ShiftCard: React.FC<{
  shift: WorkPlanShift;
  open: boolean;
  canEdit: boolean;
  zones: string[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onChange: (shift: WorkPlanShift) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  onAddPerson: () => void;
}> = ({
  shift,
  open,
  canEdit,
  zones,
  canMoveUp,
  canMoveDown,
  onToggle,
  onChange,
  onRemove,
  onMove,
  onAddPerson,
}) => {
  const patch = (partial: Partial<WorkPlanShift>) => onChange({ ...shift, ...partial });

  const removePerson = (person: WorkPlanPerson) => {
    const used = shift.slots.some((slot) => slot.activities.some((activity) => activity.personIds.includes(person.id)));
    if (used && !window.confirm(`¿Quitar a ${person.name}? Si una actividad solo la tenía esta persona, queda para todo el turno.`)) return;
    onChange({
      ...shift,
      people: shift.people.filter((item) => item.id !== person.id),
      slots: shift.slots.map((slot) => ({
        ...slot,
        activities: slot.activities.map((activity) => ({
          ...activity,
          personIds: activity.personIds.filter((id) => id !== person.id),
        })),
      })),
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-stretch">
        <button type="button" onClick={onToggle} className="flex-1 min-w-0 text-left px-4 py-3 flex items-center gap-2">
          <CalendarClock size={18} className="text-blue-700 shrink-0" />
          <span className="min-w-0">
            <span className="block font-semibold text-slate-900 truncate">{shift.name || 'Turno'}</span>
            <span className="block text-xs text-slate-500">{shift.slots.length} horarios · {shift.people.length} personas</span>
          </span>
          {open ? <ChevronUp size={18} className="ml-auto text-slate-400 shrink-0" /> : <ChevronDown size={18} className="ml-auto text-slate-400 shrink-0" />}
        </button>
        {canEdit && (
          <div className="flex items-center pr-2 gap-1">
            <button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} className="h-10 w-10 rounded-full text-slate-500 disabled:opacity-30" aria-label="Subir turno"><ChevronUp size={16} /></button>
            <button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} className="h-10 w-10 rounded-full text-slate-500 disabled:opacity-30" aria-label="Bajar turno"><ChevronDown size={16} /></button>
          </div>
        )}
      </div>
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Nombre del turno</span>
            <input
              value={shift.name}
              disabled={!canEdit}
              onChange={(event) => patch({ name: event.target.value })}
              className="mt-1 w-full h-12 rounded-xl border border-slate-300 px-3 text-base"
            />
          </label>

          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-slate-700">Personas</span>
              {canEdit && (
                <button type="button" onClick={onAddPerson} className="h-9 px-3 rounded-full bg-slate-900 text-white text-sm font-medium inline-flex items-center gap-1">
                  <Plus size={14} /> Agregar
                </button>
              )}
            </div>
            {shift.people.length === 0 ? (
              <p className="text-sm text-slate-500 mt-2">Todavía no hay nadie en este turno. Puede agregar personal de la unidad o un puesto sin nombre fijo.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-2">
                {shift.people.map((person) => (
                  <span key={person.id} className="inline-flex items-center gap-1 max-w-full rounded-full bg-slate-100 pl-3 pr-1 py-1 text-sm text-slate-800">
                    <span className="truncate">{person.role ? `${person.name} · ${person.role}` : person.name}</span>
                    {canEdit && (
                      <button type="button" onClick={() => removePerson(person)} className="h-8 w-8 rounded-full inline-flex items-center justify-center text-slate-500" aria-label={`Quitar a ${person.name}`}>
                        <X size={14} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {shift.slots.map((slot, index) => (
              <div key={slot.id} className="rounded-xl border border-slate-200 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{formatTimeRange(slot.startTime, slot.endTime)}</p>
                  {canEdit && (
                    <div className="flex items-center">
                      <button type="button" disabled={index === 0} onClick={() => {
                        const slots = [...shift.slots];
                        const [item] = slots.splice(index, 1);
                        slots.splice(index - 1, 0, item);
                        patch({ slots });
                      }} className="h-9 w-9 text-slate-500 disabled:opacity-30" aria-label="Subir horario"><ChevronUp size={16} /></button>
                      <button type="button" disabled={index === shift.slots.length - 1} onClick={() => {
                        const slots = [...shift.slots];
                        const [item] = slots.splice(index, 1);
                        slots.splice(index + 1, 0, item);
                        patch({ slots });
                      }} className="h-9 w-9 text-slate-500 disabled:opacity-30" aria-label="Bajar horario"><ChevronDown size={16} /></button>
                      <button type="button" onClick={() => {
                        if (slot.activities.length && !window.confirm('¿Quitar este horario y sus actividades?')) return;
                        patch({ slots: shift.slots.filter((item) => item.id !== slot.id) });
                      }} className="h-9 w-9 text-red-600" aria-label="Quitar horario"><Trash2 size={16} /></button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">Desde</span>
                    <input type="time" disabled={!canEdit} value={slot.startTime} onChange={(event) => patch({
                      slots: shift.slots.map((item) => (item.id === slot.id ? { ...item, startTime: event.target.value } : item)),
                    })} className="mt-1 w-full h-12 rounded-xl border border-slate-300 px-2 text-base" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">Hasta</span>
                    <input type="time" disabled={!canEdit} value={slot.endTime} onChange={(event) => patch({
                      slots: shift.slots.map((item) => (item.id === slot.id ? { ...item, endTime: event.target.value } : item)),
                    })} className="mt-1 w-full h-12 rounded-xl border border-slate-300 px-2 text-base" />
                  </label>
                </div>
                {slot.endTime < slot.startTime && (
                  <p className="text-xs text-amber-700">Este horario cruza la medianoche.</p>
                )}
                {slot.activities.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    people={shift.people}
                    zones={zones}
                    canEdit={canEdit}
                    onChange={(next) => patch({
                      slots: shift.slots.map((item) => (
                        item.id === slot.id
                          ? { ...item, activities: item.activities.map((current) => (current.id === activity.id ? next : current)) }
                          : item
                      )),
                    })}
                    onRemove={() => patch({
                      slots: shift.slots.map((item) => (
                        item.id === slot.id
                          ? { ...item, activities: item.activities.filter((current) => current.id !== activity.id) }
                          : item
                      )),
                    })}
                  />
                ))}
                {canEdit && (
                  <button type="button" onClick={() => patch({
                    slots: shift.slots.map((item) => (
                      item.id === slot.id ? { ...item, activities: [...item.activities, emptyActivity()] } : item
                    )),
                  })} className="w-full h-11 rounded-xl border border-dashed border-slate-300 text-sm font-medium text-slate-700 inline-flex items-center justify-center gap-1">
                    <Plus size={15} /> Agregar actividad
                  </button>
                )}
              </div>
            ))}
            {canEdit && (
              <button type="button" onClick={() => {
                const last = shift.slots[shift.slots.length - 1];
                const start = last?.endTime || '08:00';
                let end = addMinutes(start, 180);
                if (end === start) end = addMinutes(start, 60);
                patch({ slots: [...shift.slots, makeSlot(start, end)] });
              }} className="w-full h-11 rounded-xl bg-slate-900 text-white text-sm font-semibold">
                Agregar horario
              </button>
            )}
          </div>

          {canEdit && (
            <button type="button" onClick={onRemove} className="text-sm font-medium text-red-600">
              Quitar turno
            </button>
          )}
        </div>
      )}
    </section>
  );
};

const ActivityCard: React.FC<{
  activity: WorkPlanActivity;
  people: WorkPlanPerson[];
  zones: string[];
  canEdit: boolean;
  onChange: (activity: WorkPlanActivity) => void;
  onRemove: () => void;
}> = ({
  activity,
  people,
  zones,
  canEdit,
  onChange,
  onRemove,
}) => {
  const meta = frequencyMeta(activity.frequency);
  const setFrequency = (frequency: WorkPlanFrequency) => {
    onChange({ ...activity, frequency, weekdays: frequency === 'semanal' ? activity.weekdays : [] });
  };
  const togglePerson = (personId: string) => {
    const has = activity.personIds.includes(personId);
    onChange({
      ...activity,
      personIds: has ? activity.personIds.filter((id) => id !== personId) : [...activity.personIds, personId],
    });
  };

  return (
    <div className="rounded-xl bg-slate-50 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <textarea
          value={activity.text}
          disabled={!canEdit}
          rows={2}
          placeholder="Qué se hace en este horario"
          onChange={(event) => onChange({ ...activity, text: event.target.value })}
          className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-base"
        />
        {canEdit && (
          <button type="button" onClick={onRemove} className="h-11 w-11 rounded-xl border border-slate-200 bg-white text-red-600 shrink-0 inline-flex items-center justify-center" aria-label="Quitar actividad">
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {FREQUENCY_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={!canEdit}
            onClick={() => setFrequency(option.value)}
            className={`h-11 rounded-xl border text-sm font-semibold ${activity.frequency === option.value ? option.chip : 'bg-white border-slate-200 text-slate-600'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{meta.hint}</p>
      {activity.frequency === 'semanal' && (
        <div className="flex gap-1">
          {WEEKDAY_OPTIONS.map((day) => {
            const selected = activity.weekdays.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                disabled={!canEdit}
                onClick={() => onChange({
                  ...activity,
                  weekdays: selected
                    ? activity.weekdays.filter((value) => value !== day.value)
                    : [...activity.weekdays, day.value],
                })}
                className={`flex-1 h-11 rounded-lg text-sm font-semibold ${selected ? 'bg-amber-500 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                aria-pressed={selected}
              >
                {day.short}
              </button>
            );
          })}
        </div>
      )}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-1">Quién lo hace</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onChange({ ...activity, personIds: [] })}
            className={`h-10 px-3 rounded-full text-sm font-medium border ${activity.personIds.length === 0 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700'}`}
          >
            Todo el turno
          </button>
          {people.map((person) => {
            const selected = activity.personIds.includes(person.id);
            return (
              <button
                key={person.id}
                type="button"
                disabled={!canEdit}
                onClick={() => togglePerson(person.id)}
                className={`h-10 px-3 rounded-full text-sm font-medium border max-w-full truncate ${selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-200 text-slate-700'}`}
              >
                {person.name}
              </button>
            );
          })}
        </div>
      </div>
      {zones.length > 0 && (
        <label className="block">
          <span className="text-xs font-medium text-slate-500">Zona</span>
          <select
            value={activity.zone || ''}
            disabled={!canEdit}
            onChange={(event) => onChange({ ...activity, zone: event.target.value || undefined })}
            className="mt-1 w-full h-12 rounded-xl border border-slate-300 px-3 text-base bg-white"
          >
            <option value="">Sin zona</option>
            {activity.zone && !zones.includes(activity.zone) && <option value={activity.zone}>{activity.zone}</option>}
            {zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
          </select>
        </label>
      )}
    </div>
  );
};

function PersonPicker({
  shift,
  personnel,
  onClose,
  onAdd,
}: {
  shift: WorkPlanShift;
  personnel: Resource[];
  onClose: () => void;
  onAdd: (person: WorkPlanPerson) => void;
}) {
  const [query, setQuery] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualRole, setManualRole] = useState('');
  const taken = new Set(shift.people.map((person) => person.resourceId).filter(Boolean));
  const filtered = personnel.filter((person) => {
    const haystack = `${person.name} ${person.puesto || ''}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const addManual = () => {
    const name = manualName.trim();
    if (!name) return;
    onAdd({ id: newWorkPlanId(), name, role: manualRole.trim() || undefined });
    setManualName('');
    setManualRole('');
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[88vh] flex flex-col" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Agregar persona al turno">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Agregar a {shift.name || 'el turno'}</h3>
          <button type="button" onClick={onClose} className="h-10 w-10 rounded-full inline-flex items-center justify-center" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="p-4 overflow-y-auto space-y-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en el personal"
            className="w-full h-12 rounded-xl border border-slate-300 px-3 text-base"
          />
          <div className="space-y-2">
            {filtered.length === 0 && <p className="text-sm text-slate-500">No hay personal con ese nombre en la unidad.</p>}
            {filtered.map((person) => {
              const already = taken.has(person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  disabled={already}
                  onClick={() => onAdd({
                    id: newWorkPlanId(),
                    resourceId: person.id,
                    name: person.name,
                    role: person.puesto || undefined,
                  })}
                  className="w-full text-left rounded-xl border border-slate-200 px-3 py-3 disabled:opacity-50"
                >
                  <span className="block font-medium text-slate-900">{person.name}</span>
                  <span className="block text-sm text-slate-500">{already ? 'Ya está en el turno' : person.puesto || 'Sin puesto'}</span>
                </button>
              );
            })}
          </div>
          <div className="rounded-xl bg-slate-50 p-3 space-y-2">
            <p className="text-sm font-medium text-slate-700">O escriba un nombre o puesto</p>
            <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Nombre o puesto" className="w-full h-12 rounded-xl border border-slate-300 px-3 text-base" />
            <input value={manualRole} onChange={(event) => setManualRole(event.target.value)} placeholder="Puesto (opcional)" className="w-full h-12 rounded-xl border border-slate-300 px-3 text-base" />
            <button type="button" onClick={addManual} disabled={!manualName.trim()} className="w-full h-11 rounded-xl bg-slate-900 text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
              <Check size={16} /> Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CronogramaView({
  plan,
  day,
  onDay,
  missing,
}: {
  plan: UnitWorkPlan;
  day: number;
  onDay: (day: number) => void;
  missing: { shiftName: string; text: string }[];
}) {
  const rows = cronogramaRows(plan, day);
  const dayLabel = WEEKDAY_OPTIONS.find((item) => item.value === day)?.label || '';
  let lastShift = '';

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Lo que corresponde cada día, según la frecuencia de cada actividad.</p>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_OPTIONS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onDay(item.value)}
            className={`h-11 rounded-lg text-sm font-semibold ${day === item.value ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            {item.short}
          </button>
        ))}
      </div>
      <h3 className="font-semibold text-slate-900">{dayLabel}</h3>
      {missing.length > 0 && (
        <div className="rounded-xl bg-amber-50 text-amber-900 text-sm px-3 py-2">
          Hay actividades semanales sin días: {missing.map((item) => item.text).join(', ')}.
        </div>
      )}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
          No hay actividades para {dayLabel.toLowerCase()}.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const showShift = row.shiftName !== lastShift;
            lastShift = row.shiftName;
            const meta = frequencyMeta(row.activity.frequency);
            return (
              <div key={row.activity.id}>
                {showShift && <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mt-2">{row.shiftName}</p>}
                <article className="rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-medium text-slate-500">{row.range}</p>
                  <p className="font-semibold text-slate-900 mt-1">{row.activity.text}</p>
                  <p className="text-sm text-slate-600 mt-1">{row.who}{row.activity.zone ? ` · ${row.activity.zone}` : ''}</p>
                  <span className={`inline-flex mt-2 text-xs font-semibold px-2 py-1 rounded-full border ${meta.chip}`}>{meta.label}</span>
                </article>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
