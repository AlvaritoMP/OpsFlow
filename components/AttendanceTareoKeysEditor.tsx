import React, { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Save, Trash2, X, Settings2 } from 'lucide-react';
import {
  attendanceTareoService,
  AttendanceTareoKey,
  TareoPayrollField,
  TareoValueKind,
  TAREO_PAYROLL_FIELD_OPTIONS,
} from '../services/attendanceTareoService';

const ICON_OPTIONS = [
  'dot',
  'circle',
  'palm',
  'cross',
  'x',
  'file',
  'file-off',
  'baby',
  'heart',
  'clock',
  'moon',
  'zap',
  'calendar-clock',
] as const;

interface AttendanceTareoKeysEditorProps {
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  onKeysChanged: () => void;
}

function KeyGlyph({ icon, color }: { icon: string; color: string }) {
  if (icon === 'dot' || icon === 'circle') {
    return (
      <span
        className="inline-block h-3.5 w-3.5 rounded-full border border-black/10"
        style={{ backgroundColor: color }}
        title={icon}
      />
    );
  }
  return (
    <span
      className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded px-1 text-[10px] font-bold uppercase text-white"
      style={{ backgroundColor: color }}
      title={icon}
    >
      {icon === 'x' ? 'X' : icon.slice(0, 2)}
    </span>
  );
}

export const AttendanceTareoKeysEditor: React.FC<AttendanceTareoKeysEditorProps> = ({
  open,
  onClose,
  canEdit,
  onKeysChanged,
}) => {
  const [keys, setKeys] = useState<AttendanceTareoKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    code: '',
    name: '',
    icon: 'dot',
    color: '#64748b',
    valueKind: 'day' as TareoValueKind,
    countsAsPresentismo: false,
    payrollField: 'none' as TareoPayrollField,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setKeys(await attendanceTareoService.listKeys(true));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las claves');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  const saveKey = async (key: AttendanceTareoKey) => {
    if (!canEdit) return;
    setSavingId(key.id);
    setError(null);
    try {
      await attendanceTareoService.updateKey(key.id, {
        name: key.name,
        icon: key.icon,
        color: key.color,
        valueKind: key.valueKind,
        countsAsPresentismo: key.countsAsPresentismo,
        payrollField: key.payrollField,
        sortOrder: key.sortOrder,
        isActive: key.isActive,
      });
      setMessage('Clave actualizada');
      onKeysChanged();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSavingId(null);
    }
  };

  const createKey = async () => {
    if (!canEdit) return;
    if (!draft.code.trim() || !draft.name.trim()) {
      setError('Código y nombre son obligatorios');
      return;
    }
    setError(null);
    try {
      await attendanceTareoService.createKey(draft);
      setDraft({
        code: '',
        name: '',
        icon: 'dot',
        color: '#64748b',
        valueKind: 'day',
        countsAsPresentismo: false,
        payrollField: 'none',
      });
      setMessage('Clave creada');
      onKeysChanged();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al crear');
    }
  };

  const removeKey = async (key: AttendanceTareoKey) => {
    if (!canEdit || key.isSystem) return;
    if (!confirm(`¿Eliminar la clave ${key.code}?`)) return;
    try {
      await attendanceTareoService.deleteKey(key.id);
      onKeysChanged();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
  };

  const patchLocal = (id: string, patch: Partial<AttendanceTareoKey>) => {
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Settings2 size={18} /> Editor de claves de tareo
          </h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <p className="text-sm text-slate-600">
            Cada clave tiene icono/color, si cuenta como día de presentismo y a qué columna del Excel de nóminas suma
            (días u horas).
          </p>

          {message && (
            <div className="text-sm rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 px-3 py-2">
              {message}
            </div>
          )}
          {error && (
            <div className="text-sm rounded-lg bg-red-50 text-red-900 border border-red-200 px-3 py-2">{error}</div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-700"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Recargar
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-left">Vista</th>
                  <th className="px-2 py-2 text-left">Código</th>
                  <th className="px-2 py-2 text-left">Nombre</th>
                  <th className="px-2 py-2 text-left">Icono</th>
                  <th className="px-2 py-2 text-left">Color</th>
                  <th className="px-2 py-2 text-left">Tipo</th>
                  <th className="px-2 py-2 text-center">Presentismo</th>
                  <th className="px-2 py-2 text-left">Columna nómina</th>
                  <th className="px-2 py-2 text-center">Activa</th>
                  <th className="px-2 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {keys.map((k) => (
                  <tr key={k.id} className={!k.isActive ? 'opacity-50' : ''}>
                    <td className="px-2 py-2">
                      <KeyGlyph icon={k.icon} color={k.color} />
                    </td>
                    <td className="px-2 py-2 font-mono text-xs font-semibold">{k.code}</td>
                    <td className="px-2 py-2">
                      <input
                        className="border border-slate-200 rounded px-2 py-1 w-full min-w-[140px]"
                        value={k.name}
                        disabled={!canEdit}
                        onChange={(e) => patchLocal(k.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="border border-slate-200 rounded px-1 py-1"
                        value={k.icon}
                        disabled={!canEdit}
                        onChange={(e) => patchLocal(k.id, { icon: e.target.value })}
                      >
                        {ICON_OPTIONS.map((i) => (
                          <option key={i} value={i}>
                            {i}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="color"
                        value={k.color}
                        disabled={!canEdit}
                        onChange={(e) => patchLocal(k.id, { color: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="border border-slate-200 rounded px-1 py-1"
                        value={k.valueKind}
                        disabled={!canEdit}
                        onChange={(e) => patchLocal(k.id, { valueKind: e.target.value as TareoValueKind })}
                      >
                        <option value="day">Día</option>
                        <option value="hours">Horas</option>
                        <option value="none">Marca</option>
                      </select>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={k.countsAsPresentismo}
                        disabled={!canEdit}
                        onChange={(e) => patchLocal(k.id, { countsAsPresentismo: e.target.checked })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="border border-slate-200 rounded px-1 py-1 max-w-[180px]"
                        value={k.payrollField}
                        disabled={!canEdit}
                        onChange={(e) => patchLocal(k.id, { payrollField: e.target.value as TareoPayrollField })}
                      >
                        {TAREO_PAYROLL_FIELD_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={k.isActive}
                        disabled={!canEdit}
                        onChange={(e) => patchLocal(k.id, { isActive: e.target.checked })}
                      />
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            disabled={savingId === k.id}
                            onClick={() => void saveKey(k)}
                            className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-900 text-xs font-medium mr-2"
                          >
                            <Save size={14} /> Guardar
                          </button>
                          {!k.isSystem && (
                            <button
                              type="button"
                              onClick={() => void removeKey(k)}
                              className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 text-xs"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {canEdit && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 space-y-3">
              <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Plus size={16} /> Nueva clave
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Código</label>
                  <input
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full font-mono"
                    value={draft.code}
                    onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
                    placeholder="EJ_OK"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre</label>
                  <input
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Columna nómina</label>
                  <select
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                    value={draft.payrollField}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, payrollField: e.target.value as TareoPayrollField }))
                    }
                  >
                    {TAREO_PAYROLL_FIELD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
                  <select
                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                    value={draft.valueKind}
                    onChange={(e) => setDraft((d) => ({ ...d, valueKind: e.target.value as TareoValueKind }))}
                  >
                    <option value="day">Día</option>
                    <option value="hours">Horas</option>
                    <option value="none">Marca</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Icono / color</label>
                  <div className="flex gap-2 items-center">
                    <select
                      className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
                      value={draft.icon}
                      onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
                    >
                      {ICON_OPTIONS.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                    <input
                      type="color"
                      value={draft.color}
                      onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                    />
                    <KeyGlyph icon={draft.icon} color={draft.color} />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 pb-2">
                    <input
                      type="checkbox"
                      checked={draft.countsAsPresentismo}
                      onChange={(e) => setDraft((d) => ({ ...d, countsAsPresentismo: e.target.checked }))}
                    />
                    Cuenta presentismo
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void createKey()}
                className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                <Plus size={16} /> Crear clave
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export function TareoKeyBadge({
  keyDef,
  hoursValue,
  compact,
}: {
  keyDef: AttendanceTareoKey;
  hoursValue?: number | null;
  compact?: boolean;
}) {
  const label =
    keyDef.valueKind === 'hours' && hoursValue != null
      ? `${keyDef.code} ${hoursValue}h`
      : keyDef.code;
  return (
    <span
      className={`inline-flex items-center justify-center gap-1 rounded-md border font-bold tabular-nums ${
        compact ? 'min-w-[2rem] h-8 px-1.5 text-[10px]' : 'px-2 py-1 text-xs'
      }`}
      style={{
        backgroundColor: `${keyDef.color}22`,
        borderColor: `${keyDef.color}66`,
        color: keyDef.color,
      }}
      title={keyDef.name}
    >
      {(keyDef.icon === 'dot' || keyDef.icon === 'circle') && (
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: keyDef.color }} />
      )}
      {label}
    </span>
  );
}
