import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Save, Trash2, X, Settings2 } from 'lucide-react';
import {
  attendanceTareoService,
  AttendanceTareoKey,
  TareoPayrollField,
  TareoValueKind,
  TAREO_PAYROLL_FIELD_OPTIONS,
} from '../services/attendanceTareoService';

/** Emoticones sugeridos para claves de novedades. */
export const EMOJI_OPTIONS = [
  '✅',
  '☀️',
  '🌤️',
  '🌙',
  '💤',
  '📅',
  '🏖️',
  '🏥',
  '❌',
  '📄',
  '📭',
  '👶',
  '🖤',
  '⏰',
  '🌃',
  '⚡',
  '💥',
  '🔦',
  '✨',
  '🕐',
  '🟢',
  '🔵',
  '🟣',
  '🟡',
  '🟠',
  '🔴',
  '⚪',
  '🌴',
  '🤒',
  '📝',
  '🚫',
  '👨‍👩‍👧',
  '🕊️',
  '💼',
  '🏠',
] as const;

/** Compatibilidad con claves sembradas antes con nombres tipo "dot"/"palm". */
const LEGACY_ICON_TO_EMOJI: Record<string, string> = {
  dot: '✅',
  circle: '⚪',
  palm: '🏖️',
  cross: '🏥',
  x: '❌',
  file: '📄',
  'file-off': '📭',
  baby: '👶',
  heart: '🖤',
  clock: '⏰',
  moon: '🌙',
  zap: '⚡',
  'calendar-clock': '📅',
};

export function resolveKeyEmoji(icon: string | null | undefined): string {
  const raw = (icon || '').trim();
  if (!raw) return '⬜';
  if (LEGACY_ICON_TO_EMOJI[raw]) return LEGACY_ICON_TO_EMOJI[raw];
  return raw;
}

interface AttendanceTareoKeysEditorProps {
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  onKeysChanged: () => void;
}

export function KeyGlyph({
  icon,
  size = 'md',
  title,
}: {
  icon: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  title?: string;
}) {
  const emoji = resolveKeyEmoji(icon);
  const textSize = size === 'lg' ? 'text-xl' : size === 'sm' ? 'text-base leading-none' : 'text-lg leading-none';
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${textSize}`}
      title={title || emoji}
      role="img"
      aria-label={title || emoji}
    >
      {emoji}
    </span>
  );
}

function EmojiPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (emoji: string) => void;
}) {
  const current = resolveKeyEmoji(value);
  const options = EMOJI_OPTIONS.includes(current as (typeof EMOJI_OPTIONS)[number])
    ? [...EMOJI_OPTIONS]
    : [current, ...EMOJI_OPTIONS];

  return (
    <div className="flex flex-wrap gap-1 max-w-[220px]">
      {options.map((emoji) => (
        <button
          key={emoji}
          type="button"
          disabled={disabled}
          onClick={() => onChange(emoji)}
          className={`h-8 w-8 rounded-md text-lg leading-none border transition ${
            current === emoji
              ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-300'
              : 'border-slate-200 bg-white hover:bg-slate-50'
          } disabled:opacity-50`}
          title={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export const AttendanceTareoKeysEditor: React.FC<AttendanceTareoKeysEditorProps> = ({
  open,
  onClose,
  canEdit,
  onKeysChanged,
}) => {
  const [keys, setKeys] = useState<AttendanceTareoKey[]>([]);
  const [baseline, setBaseline] = useState<AttendanceTareoKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    code: '',
    name: '',
    icon: '✅',
    color: '#64748b',
    valueKind: 'day' as TareoValueKind,
    valueAmount: 1,
    countsAsPresentismo: false,
    payrollField: 'none' as TareoPayrollField,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await attendanceTareoService.listKeys(true);
      setKeys(list);
      setBaseline(list.map((k) => ({ ...k })));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las claves');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const dirtyKeys = useMemo(() => {
    const baseById = new Map<string, AttendanceTareoKey>(baseline.map((k) => [k.id, k]));
    return keys.filter((k) => {
      const b = baseById.get(k.id);
      if (!b) return false;
      return (
        k.name !== b.name ||
        resolveKeyEmoji(k.icon) !== resolveKeyEmoji(b.icon) ||
        k.color !== b.color ||
        k.valueKind !== b.valueKind ||
        Number(k.valueAmount) !== Number(b.valueAmount) ||
        k.countsAsPresentismo !== b.countsAsPresentismo ||
        k.payrollField !== b.payrollField ||
        k.sortOrder !== b.sortOrder ||
        k.isActive !== b.isActive
      );
    });
  }, [keys, baseline]);

  if (!open) return null;

  const saveAllChanges = async () => {
    if (!canEdit || dirtyKeys.length === 0) return;
    setSavingAll(true);
    setError(null);
    try {
      for (const key of dirtyKeys) {
        await attendanceTareoService.updateKey(key.id, {
          name: key.name,
          icon: resolveKeyEmoji(key.icon),
          color: key.color,
          valueKind: key.valueKind,
          valueAmount: key.valueAmount,
          countsAsPresentismo: key.countsAsPresentismo,
          payrollField: key.payrollField,
          sortOrder: key.sortOrder,
          isActive: key.isActive,
        });
      }
      setMessage(
        dirtyKeys.length === 1
          ? 'Cambios guardados'
          : `Se guardaron ${dirtyKeys.length} claves`
      );
      onKeysChanged();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSavingAll(false);
    }
  };

  const createKey = async () => {
    if (!canEdit) return;
    if (!draft.code.trim() || !draft.name.trim()) {
      setError('Código y nombre son obligatorios');
      return;
    }
    if (dirtyKeys.length > 0) {
      const ok = confirm(
        `Hay ${dirtyKeys.length} cambio(s) sin guardar. ¿Guardarlos antes de crear la nueva clave?`
      );
      if (ok) await saveAllChanges();
    }
    setError(null);
    try {
      await attendanceTareoService.createKey({
        ...draft,
        icon: resolveKeyEmoji(draft.icon),
      });
      setDraft({
        code: '',
        name: '',
        icon: '✅',
        color: '#64748b',
        valueKind: 'day',
        valueAmount: 1,
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
    setMessage(null);
  };

  const handleClose = () => {
    if (dirtyKeys.length > 0) {
      const discard = confirm(
        `Hay ${dirtyKeys.length} cambio(s) sin guardar. ¿Cerrar sin guardar?`
      );
      if (!discard) return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col border border-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Settings2 size={18} /> Editor de claves (emoticones)
          </h3>
          <button type="button" onClick={handleClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <p className="text-sm text-slate-600">
            Cada clave usa un <strong>emoticon</strong> fácil de reconocer en la grilla, con un <strong>valor</strong>{' '}
            detrás (en días suele ser 1). Ese valor se suma en el <strong>Tareo</strong> (paso 2) a la columna
            indicada.
            <br />
            Edita lo que necesites y pulsa <strong>Guardar todos los cambios</strong> al final.
          </p>

          {message && (
            <div className="text-sm rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 px-3 py-2">
              {message}
            </div>
          )}
          {error && (
            <div className="text-sm rounded-lg bg-red-50 text-red-900 border border-red-200 px-3 py-2">{error}</div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-700 px-3 py-1.5"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Recargar
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm min-w-[980px]">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2 text-left">Emoji</th>
                  <th className="px-2 py-2 text-left">Código</th>
                  <th className="px-2 py-2 text-left">Nombre</th>
                  <th className="px-2 py-2 text-left">Elegir emoticon</th>
                  <th className="px-2 py-2 text-left">Tipo</th>
                  <th className="px-2 py-2 text-left">Valor</th>
                  <th className="px-2 py-2 text-center">Presentismo</th>
                  <th className="px-2 py-2 text-left">Suma en columna Tareo</th>
                  <th className="px-2 py-2 text-center">Activa</th>
                  <th className="px-2 py-2 text-right"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {keys.map((k) => {
                  const dirty = dirtyKeys.some((d) => d.id === k.id);
                  return (
                  <tr key={k.id} className={`${!k.isActive ? 'opacity-50' : ''} ${dirty ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-2 py-2">
                      <KeyGlyph icon={k.icon} size="lg" title={k.name} />
                    </td>
                    <td className="px-2 py-2 font-mono text-xs font-semibold">
                      {k.code}
                      {dirty ? <span className="ml-1 text-amber-600">•</span> : null}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        className="border border-slate-200 rounded px-2 py-1 w-full min-w-[120px]"
                        value={k.name}
                        disabled={!canEdit}
                        onChange={(e) => patchLocal(k.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <EmojiPicker
                        value={k.icon}
                        disabled={!canEdit}
                        onChange={(emoji) => patchLocal(k.id, { icon: emoji })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="border border-slate-200 rounded px-1 py-1"
                        value={k.valueKind}
                        disabled={!canEdit}
                        onChange={(e) => patchLocal(k.id, { valueKind: e.target.value as TareoValueKind })}
                      >
                        <option value="day">Días</option>
                        <option value="hours">Horas</option>
                        <option value="none">Marca</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        className="border border-slate-200 rounded px-2 py-1 w-20"
                        value={k.valueAmount}
                        disabled={!canEdit || k.valueKind === 'hours'}
                        title={k.valueKind === 'hours' ? 'En horas el monto se captura en la novedad' : 'Valor'}
                        onChange={(e) => patchLocal(k.id, { valueAmount: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={k.countsAsPresentismo}
                        disabled={!canEdit || k.valueKind === 'hours'}
                        onChange={(e) => patchLocal(k.id, { countsAsPresentismo: e.target.checked })}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        className="border border-slate-200 rounded px-1 py-1 max-w-[200px]"
                        value={k.payrollField}
                        disabled={!canEdit}
                        onChange={(e) => patchLocal(k.id, { payrollField: e.target.value as TareoPayrollField })}
                      >
                        {TAREO_PAYROLL_FIELD_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label} ({o.unit})
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
                      {canEdit && !k.isSystem && (
                        <button
                          type="button"
                          onClick={() => void removeKey(k)}
                          className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 text-xs"
                          title="Eliminar clave"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
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
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo / valor</label>
                  <div className="flex gap-2">
                    <select
                      className="border border-slate-300 rounded-lg px-2 py-2 text-sm"
                      value={draft.valueKind}
                      onChange={(e) => setDraft((d) => ({ ...d, valueKind: e.target.value as TareoValueKind }))}
                    >
                      <option value="day">Días</option>
                      <option value="hours">Horas</option>
                      <option value="none">Marca</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="border border-slate-300 rounded-lg px-2 py-2 text-sm w-20"
                      value={draft.valueAmount}
                      disabled={draft.valueKind === 'hours'}
                      onChange={(e) => setDraft((d) => ({ ...d, valueAmount: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Columna Tareo</label>
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
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Emoticon</label>
                  <EmojiPicker
                    value={draft.icon}
                    onChange={(emoji) => setDraft((d) => ({ ...d, icon: emoji }))}
                  />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 pb-2">
                    <input
                      type="checkbox"
                      checked={draft.countsAsPresentismo}
                      disabled={draft.valueKind === 'hours'}
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

        {canEdit && (
          <div className="border-t border-slate-200 px-4 py-3 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-600">
              {dirtyKeys.length === 0
                ? 'Sin cambios pendientes'
                : `${dirtyKeys.length} clave${dirtyKeys.length === 1 ? '' : 's'} con cambios sin guardar`}
            </span>
            <button
              type="button"
              disabled={savingAll || dirtyKeys.length === 0}
              onClick={() => void saveAllChanges()}
              className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-45"
            >
              <Save size={16} />
              {savingAll ? 'Guardando…' : 'Guardar todos los cambios'}
            </button>
          </div>
        )}
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
  const suffix =
    keyDef.valueKind === 'hours' && hoursValue != null
      ? `${hoursValue}h`
      : '';
  return (
    <span
      className={`inline-flex items-center justify-center gap-1 rounded-md border bg-white tabular-nums ${
        compact ? 'min-w-[1.75rem] h-7 px-1 text-[10px]' : 'px-2 py-1 text-xs'
      }`}
      style={{ borderColor: `${keyDef.color}66` }}
      title={`${keyDef.code} — ${keyDef.name}`}
    >
      <KeyGlyph icon={keyDef.icon} size={compact ? 'sm' : 'md'} title={keyDef.name} />
      {suffix ? <span className="font-semibold text-slate-600">{suffix}</span> : null}
    </span>
  );
}
