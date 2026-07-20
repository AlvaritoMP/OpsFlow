import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  ClipboardList,
  Settings2,
  Download,
  Wand2,
  X,
} from 'lucide-react';
import { Unit } from '../types';
import {
  attendanceTareoService,
  AttendanceTareoKey,
  AttendanceTareoNovedad,
  activePersonnelSorted,
  eachDateInRange,
} from '../services/attendanceTareoService';
import { SafeImage } from './SafeImage';
import { AttendanceTareoKeysEditor, TareoKeyBadge } from './AttendanceTareoKeysEditor';

interface AttendanceTareoViewProps {
  unit: Unit;
  importsKey: string;
  canEdit?: boolean;
}

export const AttendanceTareoView: React.FC<AttendanceTareoViewProps> = ({
  unit,
  importsKey,
  canEdit = false,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [keys, setKeys] = useState<AttendanceTareoKey[]>([]);
  const [novedades, setNovedades] = useState<AttendanceTareoNovedad[]>([]);
  const [keysOpen, setKeysOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [tipoTareo, setTipoTareo] = useState('MENSUAL');
  const [editorCell, setEditorCell] = useState<{ resourceId: string; day: string } | null>(null);
  const [pickKeyId, setPickKeyId] = useState('');
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
          ? e.message
          : 'Error al cargar tareo. ¿Ejecutaste la migración create_attendance_tareo_tables.sql?'
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
  const novedadMap = useMemo(() => {
    const m = new Map<string, AttendanceTareoNovedad[]>();
    for (const n of novedades) {
      const k = `${n.resourceId}|${n.day}`;
      const list = m.get(k) || [];
      list.push(n);
      m.set(k, list);
    }
    return m;
  }, [novedades]);
  const keyById = useMemo(() => new Map(keys.map((k) => [k.id, k])), [keys]);

  const primaryNovedad = (list: AttendanceTareoNovedad[] | undefined): AttendanceTareoNovedad | undefined => {
    if (!list?.length) return undefined;
    const dayLike = list.find((n) => {
      const k = keyById.get(n.keyId) || n.key;
      return k && k.valueKind !== 'hours';
    });
    return dayLike || list[0];
  };

  const headerLabel = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    return `${m[3]}/${m[2]}`;
  };

  const openCell = (resourceId: string, day: string) => {
    if (!canEdit) return;
    const existing = primaryNovedad(novedadMap.get(`${resourceId}|${day}`));
    setEditorCell({ resourceId, day });
    setPickKeyId(existing?.keyId || keys.find((k) => k.valueKind === 'day')?.id || keys[0]?.id || '');
    setPickHours(existing?.hoursValue != null ? String(existing.hoursValue) : '');
    setPickComment(existing?.comment || '');
  };

  const selectedKey = pickKeyId ? keyById.get(pickKeyId) : undefined;

  const saveCell = async () => {
    if (!editorCell || !pickKeyId) return;
    setSavingCell(true);
    setError(null);
    try {
      const { authService } = await import('../services/authService');
      const u = await authService.getCurrentUser();
      const hours =
        selectedKey?.valueKind === 'hours'
          ? pickHours.trim() === ''
            ? 0
            : Number(pickHours)
          : null;
      if (selectedKey?.valueKind === 'hours' && (hours == null || Number.isNaN(hours) || hours < 0)) {
        throw new Error('Indica horas válidas (≥ 0) para esta clave');
      }
      await attendanceTareoService.upsertNovedad({
        unitId: unit.id,
        resourceId: editorCell.resourceId,
        day: editorCell.day,
        keyId: pickKeyId,
        hoursValue: hours,
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
          ? `Se autocompletaron ${n} día(s) con marcación completa (clave OK según turno).`
          : 'No había días nuevos para sugerir (ya tienen novedad o no hay marcación completa).'
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
      setMessage('Excel de tareo para nóminas descargado.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  const workerName = (id: string) => workers.find((w) => w.id === id)?.name || id;

  return (
    <div className="space-y-4 p-4 md:p-6 border-t border-slate-100 bg-slate-50/50">
      <div className="flex flex-col gap-1">
        <h4 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
          <ClipboardList size={22} className="text-teal-700" />
          Tareo / Novedades
        </h4>
        <p className="text-sm text-slate-600 max-w-3xl">
          Misma relación de personal activo. Por cada día puedes asignar una <strong>clave</strong> (asistencia OK por
          turno, vacaciones, falta, licencias, etc.). Usa el consolidado como base con «Autocompletar» y luego corrige
          novedades. El export genera el Excel de una fila por trabajador para nóminas.
        </p>
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
          Claves
        </button>
        {canEdit && (
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
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={exporting || loading || workers.length === 0}
          className="inline-flex items-center gap-2 text-sm font-medium text-white px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50"
        >
          <Download size={16} />
          {exporting ? 'Exportando…' : 'Exportar tareo nómina'}
        </button>
      </div>

      {keys.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center text-xs text-slate-600">
          <span className="font-semibold uppercase tracking-wide text-slate-400">Leyenda:</span>
          {keys.map((k) => (
            <span key={k.id}>
              <TareoKeyBadge keyDef={k} />
            </span>
          ))}
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
        <p className="text-sm text-slate-500 py-10 text-center">Cargando tareo…</p>
      ) : workers.length === 0 ? (
        <p className="text-sm text-slate-500 py-6">No hay personal activo en esta unidad.</p>
      ) : dates.length === 0 ? (
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
                      const list = novedadMap.get(`${w.id}|${iso}`);
                      const n = primaryNovedad(list);
                      const keyDef = n ? keyById.get(n.keyId) || n.key : undefined;
                      const extraHours = (list || []).filter((x) => {
                        const k = keyById.get(x.keyId) || x.key;
                        return k?.valueKind === 'hours';
                      }).length;
                      return (
                        <td key={iso} className="px-0.5 py-1 text-center align-middle">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => openCell(w.id, iso)}
                            className={`mx-auto block rounded-md transition ${
                              canEdit ? 'hover:ring-2 hover:ring-teal-300 cursor-pointer' : 'cursor-default'
                            }`}
                            title={
                              keyDef
                                ? `${keyDef.name}${extraHours ? ` (+${extraHours} clave(s) de horas)` : ''}${
                                    n?.comment ? `\n${n.comment}` : ''
                                  }`
                                : canEdit
                                  ? 'Asignar clave'
                                  : 'Sin novedad'
                            }
                          >
                            {keyDef ? (
                              <span className="relative inline-flex">
                                <TareoKeyBadge keyDef={keyDef} hoursValue={n?.hoursValue} compact />
                                {extraHours > 0 && (
                                  <span className="absolute -top-1 -right-1 h-3.5 min-w-[0.875rem] rounded-full bg-amber-500 text-[9px] text-white font-bold px-0.5">
                                    +{extraHours}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center min-w-[2rem] h-8 px-1.5 rounded-md text-xs text-slate-300 border border-dashed border-slate-200">
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
      )}

      {editorCell && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div>
                <h5 className="font-bold text-slate-800">Clave del día</h5>
                <p className="text-xs text-slate-500">
                  {workerName(editorCell.resourceId)} · {headerLabel(editorCell.day)} ({editorCell.day})
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">Clave</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  value={pickKeyId}
                  onChange={(e) => setPickKeyId(e.target.value)}
                >
                  {keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.code} — {k.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedKey?.valueKind === 'hours' && (
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
              )}
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
                    disabled={savingCell || !pickKeyId}
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
