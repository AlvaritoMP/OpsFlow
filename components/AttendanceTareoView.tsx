import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  ClipboardList,
  Settings2,
  Download,
  Wand2,
  X,
  Table2,
  ChevronRight,
  ChevronDown,
  BookOpen,
} from 'lucide-react';
import { Unit } from '../types';
import {
  attendanceTareoService,
  AttendanceTareoKey,
  AttendanceTareoNovedad,
  TareoWorkerTotals,
  activePersonnelSorted,
  eachDateInRange,
  totalsToExportRow,
  TAREO_EXPORT_HEADERS,
} from '../services/attendanceTareoService';
import { SafeImage } from './SafeImage';
import { AttendanceTareoKeysEditor, KeyGlyph } from './AttendanceTareoKeysEditor';

interface AttendanceTareoViewProps {
  unit: Unit;
  importsKey: string;
  canEdit?: boolean;
}

type Step = 'novedades' | 'tareo';

const TAREO_NUMERIC_COLS = TAREO_EXPORT_HEADERS.filter(
  (h) =>
    ![
      'EMPRESA',
      'UNIDAD',
      'TIPO DE TAREO',
      'FECHA INGRESO',
      'FECHA DE CESE',
      'TIPO DOC.',
      'NRO DOC.',
      'APELLIDOS Y NOMBRES',
    ].includes(h)
);

export const AttendanceTareoView: React.FC<AttendanceTareoViewProps> = ({
  unit,
  importsKey,
  canEdit = false,
}) => {
  const [step, setStep] = useState<Step>('novedades');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [keys, setKeys] = useState<AttendanceTareoKey[]>([]);
  const [novedades, setNovedades] = useState<AttendanceTareoNovedad[]>([]);
  const [keysOpen, setKeysOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [tipoTareo, setTipoTareo] = useState('MENSUAL');
  const [editorCell, setEditorCell] = useState<{ resourceId: string; day: string } | null>(null);
  const [pickDayKeyId, setPickDayKeyId] = useState('');
  const [pickHoursKeyId, setPickHoursKeyId] = useState('');
  const [pickHours, setPickHours] = useState('');
  const [pickComment, setPickComment] = useState('');
  const [savingCell, setSavingCell] = useState(false);

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return last.toISOString().slice(0, 10);
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [k, n] = await Promise.all([
        attendanceTareoService.listKeys(false),
        attendanceTareoService.listNovedades(unit.id, dateFrom, dateTo),
      ]);
      setKeys(k);
      setNovedades(n);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? `${e.message} Si acabas de migrar, ejecuta también alter_attendance_tareo_two_keys_and_value.sql`
          : 'Error al cargar. ¿Ejecutaste las migraciones de tareo?'
      );
      setKeys([]);
      setNovedades([]);
    } finally {
      setLoading(false);
    }
  }, [unit.id, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load, importsKey]);

  const workers = useMemo(() => activePersonnelSorted(unit), [unit]);
  const dates = useMemo(() => eachDateInRange(dateFrom, dateTo), [dateFrom, dateTo]);
  const dayKeys = useMemo(() => keys.filter((k) => k.valueKind !== 'hours'), [keys]);
  const hoursKeys = useMemo(() => keys.filter((k) => k.valueKind === 'hours'), [keys]);
  const keyById = useMemo(() => new Map(keys.map((k) => [k.id, k])), [keys]);

  const novedadMap = useMemo(() => {
    const m = new Map<string, AttendanceTareoNovedad>();
    for (const n of novedades) m.set(`${n.resourceId}|${n.day}`, n);
    return m;
  }, [novedades]);

  const totalsMap = useMemo(
    () => attendanceTareoService.aggregateTotals(workers, novedades, keys),
    [workers, novedades, keys]
  );

  const headerLabel = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    return `${m[3]}/${m[2]}`;
  };

  const openCell = (resourceId: string, day: string) => {
    if (!canEdit) return;
    const existing = novedadMap.get(`${resourceId}|${day}`);
    setEditorCell({ resourceId, day });
    setPickDayKeyId(existing?.dayKeyId || '');
    setPickHoursKeyId(existing?.hoursKeyId || '');
    setPickHours(existing?.hoursValue != null ? String(existing.hoursValue) : '');
    setPickComment(existing?.comment || '');
  };

  const saveCell = async () => {
    if (!editorCell) return;
    setSavingCell(true);
    setError(null);
    try {
      const { authService } = await import('../services/authService');
      const u = await authService.getCurrentUser();
      const hoursKeyId = pickHoursKeyId || null;
      let hoursValue: number | null = null;
      if (hoursKeyId) {
        hoursValue = pickHours.trim() === '' ? 0 : Number(pickHours);
        if (Number.isNaN(hoursValue) || hoursValue < 0) {
          throw new Error('Indica horas válidas (≥ 0) para la 2.ª clave');
        }
      }
      await attendanceTareoService.upsertNovedad({
        unitId: unit.id,
        resourceId: editorCell.resourceId,
        day: editorCell.day,
        dayKeyId: pickDayKeyId || null,
        hoursKeyId,
        hoursValue,
        comment: pickComment,
        source: 'manual',
        updatedBy: u?.id || null,
      });
      setEditorCell(null);
      setMessage('Novedad guardada');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSavingCell(false);
    }
  };

  const clearCell = async () => {
    if (!editorCell) return;
    setSavingCell(true);
    try {
      await attendanceTareoService.clearNovedad(unit.id, editorCell.resourceId, editorCell.day);
      setEditorCell(null);
      setMessage('Novedad eliminada');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar');
    } finally {
      setSavingCell(false);
    }
  };

  const handleSuggest = async () => {
    if (!canEdit) return;
    setSuggesting(true);
    setError(null);
    try {
      const { authService } = await import('../services/authService');
      const u = await authService.getCurrentUser();
      const n = await attendanceTareoService.suggestFromConsolidated(
        unit,
        dateFrom,
        dateTo,
        u?.id || null
      );
      setMessage(
        n > 0
          ? `Se autocompletaron ${n} día(s): vacaciones otorgadas y/o asistencia (ingreso o marcación completa → clave OK del turno).`
          : 'No había días nuevos para sugerir.'
      );
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al autocompletar');
    } finally {
      setSuggesting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await attendanceTareoService.exportNominaTareo({
        unit,
        dateFrom,
        dateTo,
        tipoTareo,
      });
      setMessage('Excel de Tareo para nóminas descargado.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  const workerName = (id: string) => workers.find((w) => w.id === id)?.name || id;

  const exportPreviewRows = useMemo(() => {
    const empresa = unit.clientName || '';
    return workers.map((w) => {
      const t = totalsMap.get(w.id) as TareoWorkerTotals;
      return totalsToExportRow(w, t, { empresa, unidad: unit.name, tipoTareo });
    });
  }, [workers, totalsMap, unit.clientName, unit.name, tipoTareo]);

  return (
    <div className="space-y-4 p-4 md:p-6 border-t border-slate-100 bg-slate-50/50">
      <div className="flex flex-col gap-1">
        <h4 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
          <ClipboardList size={22} className="text-teal-700" />
          Tareo
        </h4>
        <p className="text-sm text-slate-600 max-w-3xl">
          <strong>Paso 1 — Novedades:</strong> marca cada día con hasta 2 iconos/claves (días + horas).{' '}
          <strong>Paso 2 — Tareo:</strong> suma los valores de esas claves en las columnas de nóminas.
        </p>
      </div>

      <div className="flex flex-wrap rounded-lg border border-slate-200 bg-white p-1 w-full md:w-fit gap-1 shadow-sm">
        <button
          type="button"
          onClick={() => setStep('novedades')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${
            step === 'novedades' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          1. Novedades
        </button>
        <ChevronRight size={16} className="self-center text-slate-300 hidden sm:block" />
        <button
          type="button"
          onClick={() => setStep('tareo')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${
            step === 'tareo' ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Table2 size={16} /> 2. Tareo
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-end bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Desde</label>
          <input
            type="date"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Hasta</label>
          <input
            type="date"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de tareo</label>
          <input
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-36"
            value={tipoTareo}
            onChange={(e) => setTipoTareo(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm font-medium text-teal-800 hover:text-teal-950 px-3 py-2 rounded-lg border border-teal-200 bg-teal-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
        <button
          type="button"
          onClick={() => setKeysOpen(true)}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-2 rounded-lg border border-slate-200 bg-white"
        >
          <Settings2 size={16} />
          Editor de claves
        </button>
        {step === 'novedades' && keys.length > 0 && (
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            className={`inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border ${
              legendOpen
                ? 'border-teal-300 bg-teal-50 text-teal-900'
                : 'border-slate-200 bg-white text-slate-700 hover:text-slate-900'
            }`}
          >
            <BookOpen size={16} />
            Leyenda
            <ChevronDown size={14} className={`transition ${legendOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
        {step === 'novedades' && canEdit && (
          <button
            type="button"
            onClick={() => void handleSuggest()}
            disabled={suggesting || loading}
            className="inline-flex items-center gap-2 text-sm font-medium text-indigo-800 hover:text-indigo-950 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 disabled:opacity-50"
          >
            <Wand2 size={16} />
            {suggesting ? 'Autocompletando…' : 'Autocompletar desde consolidado'}
          </button>
        )}
        {step === 'tareo' && (
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || loading || workers.length === 0}
            className="inline-flex items-center gap-2 text-sm font-medium text-white px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50"
          >
            <Download size={16} />
            {exporting ? 'Exportando…' : 'Exportar Excel nómina'}
          </button>
        )}
      </div>

      {legendOpen && keys.length > 0 && step === 'novedades' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h5 className="text-sm font-bold text-slate-700">Leyenda de claves</h5>
            <button
              type="button"
              onClick={() => setLegendOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Ocultar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2 text-sm"
              >
                <KeyGlyph icon={k.icon} size="lg" title={k.name} />
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold text-slate-700">{k.code}</div>
                  <div className="text-xs text-slate-500 truncate">{k.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {message && (
        <div className="rounded-lg px-4 py-3 text-sm bg-emerald-50 text-emerald-900 border border-emerald-200">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-900 border border-red-200">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 py-10 text-center">Cargando…</p>
      ) : workers.length === 0 ? (
        <p className="text-sm text-slate-500 py-6">No hay personal activo en esta unidad.</p>
      ) : step === 'novedades' ? (
        dates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500 text-sm">
            Elige un rango de fechas válido.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-sm w-full border-collapse min-w-max">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                    <th className="sticky left-0 z-20 bg-slate-50 text-left px-3 py-2 border-r border-slate-200 min-w-[200px] shadow-[2px_0_0_0_rgb(226,232,240)]">
                      Trabajador
                    </th>
                    {dates.map((iso) => (
                      <th
                        key={iso}
                        className="px-1.5 py-2 text-center font-semibold text-slate-600 whitespace-nowrap"
                        title={iso}
                      >
                        <span className="font-mono text-[11px]">{headerLabel(iso)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workers.map((w) => (
                    <tr key={w.id} className="group hover:bg-slate-50/80">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-3 py-2 border-r border-slate-100 min-w-[200px] max-w-[260px] shadow-[2px_0_0_0_rgb(241,245,249)]">
                        <div className="flex items-center gap-2 min-w-0">
                          {w.image ? (
                            <SafeImage
                              src={w.image}
                              alt={w.name}
                              className="h-8 w-8 rounded-full object-cover border border-slate-200 shrink-0"
                              bucket={undefined}
                              fallback={
                                <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                  {(w.name || '?')
                                    .split(/\s+/)
                                    .slice(0, 2)
                                    .map((x) => x[0]?.toUpperCase())
                                    .join('')}
                                </div>
                              }
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                              {(w.name || '?')
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((x) => x[0]?.toUpperCase())
                                .join('')}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-slate-800 truncate">{w.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono truncate">{w.dni || '—'}</div>
                          </div>
                        </div>
                      </td>
                      {dates.map((iso) => {
                        const n = novedadMap.get(`${w.id}|${iso}`);
                        const dayKey = n?.dayKeyId ? keyById.get(n.dayKeyId) || n.dayKey : undefined;
                        const hoursKey = n?.hoursKeyId
                          ? keyById.get(n.hoursKeyId) || n.hoursKey
                          : undefined;
                        return (
                          <td key={iso} className="px-0.5 py-1 text-center align-middle">
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => openCell(w.id, iso)}
                              className={`mx-auto flex flex-col items-center gap-0.5 rounded-md px-0.5 py-0.5 transition ${
                                canEdit ? 'hover:ring-2 hover:ring-teal-300 cursor-pointer' : 'cursor-default'
                              }`}
                              title={
                                dayKey || hoursKey
                                  ? [
                                      dayKey ? `${dayKey.name} (${dayKey.valueAmount} d)` : null,
                                      hoursKey ? `${hoursKey.name} (${n?.hoursValue ?? 0} h)` : null,
                                    ]
                                      .filter(Boolean)
                                      .join('\n')
                                  : canEdit
                                    ? 'Asignar hasta 2 claves'
                                    : 'Sin novedad'
                              }
                            >
                              {dayKey || hoursKey ? (
                                <>
                                  {dayKey ? (
                                    <KeyGlyph icon={dayKey.icon} size="md" title={dayKey.name} />
                                  ) : (
                                    <span className="h-4 w-4" />
                                  )}
                                  {hoursKey ? (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums text-slate-600">
                                      <KeyGlyph icon={hoursKey.icon} size="sm" title={hoursKey.name} />
                                      {n?.hoursValue ?? 0}h
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <span className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1 rounded-md text-xs text-slate-300 border border-dashed border-slate-200">
                                  —
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 text-sm text-slate-600">
            Tareo consolidado: cada columna suma los <strong>valores de las claves</strong> de las novedades del
            período (no son las claves mismas).
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse min-w-max">
              <thead>
                <tr className="bg-emerald-50 text-[10px] uppercase text-emerald-900 border-b border-emerald-100">
                  <th className="sticky left-0 z-20 bg-emerald-50 text-left px-3 py-2 border-r border-emerald-100 min-w-[160px]">
                    Trabajador
                  </th>
                  <th className="px-2 py-2 text-left whitespace-nowrap">NRO DOC.</th>
                  {TAREO_NUMERIC_COLS.map((h) => (
                    <th key={h} className="px-2 py-2 text-center whitespace-nowrap max-w-[7rem]" title={h}>
                      <span className="line-clamp-3 leading-tight">{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exportPreviewRows.map((row, idx) => {
                  const w = workers[idx];
                  return (
                    <tr key={w.id} className="hover:bg-slate-50/80">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-slate-100 font-medium text-slate-800 max-w-[200px] truncate">
                        {String(row['APELLIDOS Y NOMBRES'] || w.name)}
                      </td>
                      <td className="px-2 py-2 font-mono text-slate-600 whitespace-nowrap">
                        {String(row['NRO DOC.'] || '')}
                      </td>
                      {TAREO_NUMERIC_COLS.map((h) => (
                        <td key={h} className="px-2 py-2 text-center tabular-nums text-slate-800">
                          {Number(row[h] || 0)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editorCell && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div>
                <h5 className="font-bold text-slate-800">Novedad del día</h5>
                <p className="text-xs text-slate-500">
                  {workerName(editorCell.resourceId)} · {headerLabel(editorCell.day)} — hasta 2 claves
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditorCell(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  1.ª clave — días (asistencia, descanso, vacaciones, falta…)
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={pickDayKeyId}
                  onChange={(e) => setPickDayKeyId(e.target.value)}
                >
                  <option value="">— Sin clave de días —</option>
                  {dayKeys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.code} — {k.name} (valor {k.valueAmount})
                    </option>
                  ))}
                </select>
                {dayKeys.length === 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    No hay claves de tipo Días activas. En el editor, crea o cambia una clave a tipo «Días» (p. ej.
                    Descanso semanal).
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  2.ª clave — horas (opcional)
                </label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={pickHoursKeyId}
                  onChange={(e) => setPickHoursKeyId(e.target.value)}
                >
                  <option value="">— Sin clave de horas —</option>
                  {hoursKeys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.code} — {k.name}
                    </option>
                  ))}
                </select>
              </div>
              {pickHoursKeyId ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Horas</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    value={pickHours}
                    onChange={(e) => setPickHours(e.target.value)}
                  />
                </div>
              ) : null}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Comentario (opcional)</label>
                <textarea
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[70px]"
                  value={pickComment}
                  onChange={(e) => setPickComment(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2 justify-between pt-1">
                <button
                  type="button"
                  onClick={() => void clearCell()}
                  disabled={savingCell}
                  className="text-sm text-red-700 hover:text-red-900 disabled:opacity-50"
                >
                  Quitar novedad
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditorCell(null)}
                    className="px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveCell()}
                    disabled={savingCell || (!pickDayKeyId && !pickHoursKeyId)}
                    className="px-3 py-2 text-sm rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50"
                  >
                    {savingCell ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <AttendanceTareoKeysEditor
        open={keysOpen}
        onClose={() => setKeysOpen(false)}
        canEdit={canEdit}
        onKeysChanged={() => void load()}
      />
    </div>
  );
};
