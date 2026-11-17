import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import {
  createQuoteField,
  deleteQuoteField,
  nextCategoryColor,
  QUOTE_CATEGORY_COLORS,
  QuoteField,
  QuoteFieldKind,
  QuoteFieldOption,
  QuoteTracking,
  reorderQuoteFields,
  updateQuoteField,
} from '../services/quoteProposalService';

const FIXED_EXCEL_HEADERS = [
  'Código',
  'Cliente',
  'Servicio',
  'Estado',
  'Laboral',
  'Operativo',
  'Administrativo',
  'Utilidad',
  'Total',
  'Fecha de emisión',
  'Emitida por',
];

export function categoryStyle(color: string | undefined): { backgroundColor: string; color: string } {
  const background = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#e2e8f0';
  return { backgroundColor: background, color: textOn(background) };
}

function textOn(hex: string): string {
  const raw = hex.replace('#', '');
  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  if (![red, green, blue].every((channel) => Number.isFinite(channel))) return '#0f172a';
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? '#0f172a' : '#ffffff';
}

export function quoteFieldKindLabel(kind: QuoteFieldKind): string {
  return kind === 'number' ? 'Número' : kind === 'category' ? 'Categoría' : 'Texto';
}

export function trackingSearchText(tracking: QuoteTracking | undefined, fields: QuoteField[]): string {
  return fields
    .map((field) => {
      const value = tracking?.[field.id];
      return value == null || value === '' ? '' : String(value);
    })
    .filter(Boolean)
    .join(' ');
}

export function trackingExcelHeaders(fields: QuoteField[]): Array<{ field: QuoteField; header: string }> {
  const used = new Set(FIXED_EXCEL_HEADERS);
  return fields.map((field) => {
    const base = field.label.trim() || 'Columna';
    let header = used.has(base) ? `${base} (seguimiento)` : base;
    let n = 2;
    while (used.has(header)) {
      header = `${base} (seguimiento ${n})`;
      n += 1;
    }
    used.add(header);
    return { field, header };
  });
}

export function formatTrackingNumber(value: number): string {
  return value.toLocaleString('es-PE', { maximumFractionDigits: 4 });
}

export function parseTrackingNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 10000) / 10000;
}

export function TrackingCell(props: {
  field: QuoteField;
  value: string | number | null | undefined;
  disabled?: boolean;
  onCommit: (value: string | number | null) => void;
}) {
  if (props.field.kind === 'category') return <CategoryCell {...props} />;
  if (props.field.kind === 'number') return <NumberCell {...props} />;
  return <TextCell {...props} />;
}

function TextCell(props: {
  field: QuoteField;
  value: string | number | null | undefined;
  disabled?: boolean;
  onCommit: (value: string | number | null) => void;
}) {
  const text = props.value == null ? '' : String(props.value);
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  if (props.disabled) {
    return (
      <span className="block max-w-[14rem] truncate text-slate-700" title={text || undefined}>
        {text || '—'}
      </span>
    );
  }
  return (
    <input
      className="w-full min-w-[8.5rem] rounded border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800"
      value={draft}
      maxLength={500}
      aria-label={props.field.label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next === text) return;
        props.onCommit(next || null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

function NumberCell(props: {
  field: QuoteField;
  value: string | number | null | undefined;
  disabled?: boolean;
  onCommit: (value: string | number | null) => void;
}) {
  const numeric = typeof props.value === 'number' ? props.value : props.value == null || props.value === '' ? null : Number(props.value);
  const shown = numeric == null || !Number.isFinite(numeric) ? '' : String(numeric);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  if (props.disabled) {
    return <span className="tabular-nums text-slate-700">{numeric == null || !Number.isFinite(numeric) ? '—' : formatTrackingNumber(numeric)}</span>;
  }
  return (
    <input
      className="w-full min-w-[5.5rem] rounded border border-slate-200 bg-white px-2 py-1 text-right text-sm tabular-nums text-slate-800"
      inputMode="decimal"
      aria-label={props.field.label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = parseTrackingNumber(draft);
        if (draft.trim() && next == null) {
          setDraft(shown);
          return;
        }
        if (next === numeric) return;
        props.onCommit(next);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

function CategoryCell(props: {
  field: QuoteField;
  value: string | number | null | undefined;
  disabled?: boolean;
  onCommit: (value: string | number | null) => void;
}) {
  const current = typeof props.value === 'string' ? props.value : '';
  const known = props.field.options.find((option) => option.label === current);
  const options = !current || known ? props.field.options : [...props.field.options, { label: current, color: '#e2e8f0' }];
  const tone = known ? categoryStyle(known.color) : current ? categoryStyle('#e2e8f0') : undefined;
  if (props.disabled) {
    return current ? (
      <span className="inline-flex text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style={tone}>{current}</span>
    ) : (
      <span className="text-slate-400">—</span>
    );
  }
  return (
    <select
      className={`max-w-[12rem] rounded-full border px-2 py-1 text-xs ${current ? 'border-transparent' : 'bg-white border-slate-200 text-slate-500'}`}
      style={tone}
      aria-label={props.field.label}
      value={current}
      onChange={(event) => props.onCommit(event.target.value || null)}
    >
      <option value="">—</option>
      {options.map((option) => (
        <option key={option.label} value={option.label} style={categoryStyle(option.color)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function QuoteTrackingPanel(props: {
  fields: QuoteField[];
  tracking: QuoteTracking;
  canEdit: boolean;
  saved: boolean;
  onCommit: (fieldId: string, value: string | number | null) => void;
}) {
  if (props.fields.length === 0) return null;
  return (
    <section className="shrink-0 bg-white border border-slate-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-900">Seguimiento</h2>
      <p className="text-xs text-slate-500 mt-0.5">
        {props.saved
          ? 'Estas notas son del equipo. No entran en el PDF y se pueden cambiar con la propuesta emitida.'
          : 'Guarde la propuesta para anotar el seguimiento. Esas notas no entran en el PDF.'}
      </p>
      <div className="mt-3 grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {props.fields.map((field) => (
          <label key={field.id} className="block text-xs text-slate-500">
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-700">{field.label}</span>
              <span className="text-[10px] uppercase tracking-wide text-slate-400">{quoteFieldKindLabel(field.kind)}</span>
            </span>
            <div className="mt-1">
              <TrackingCell
                field={field}
                value={props.tracking[field.id]}
                disabled={!props.canEdit || !props.saved}
                onCommit={(value) => props.onCommit(field.id, value)}
              />
            </div>
          </label>
        ))}
      </div>
    </section>
  );
}

export function QuoteFieldManager(props: {
  fields: QuoteField[];
  onChange: (fields: QuoteField[]) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<QuoteFieldKind>('text');
  const [options, setOptions] = useState<QuoteFieldOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.onClose]);

  const fail = (cause: unknown) => {
    setError(cause instanceof Error ? cause.message : 'No se pudo guardar la columna.');
  };

  const create = async () => {
    const name = label.trim();
    if (!name) {
      setError('Indique el nombre de la columna.');
      return;
    }
    if (props.fields.some((field) => field.label.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
      setError('Ya hay una columna con ese nombre.');
      return;
    }
    if (props.fields.length >= 24) {
      setError('El seguimiento admite hasta 24 columnas.');
      return;
    }
    if (kind === 'category' && options.length === 0) {
      setError('Agregue al menos una opción. Por ejemplo: Enviada, En negociación, Ganada.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const position = props.fields.reduce((max, field) => Math.max(max, field.position), -1) + 1;
      const saved = await createQuoteField({ label: name, kind, options, position });
      props.onChange([...props.fields, saved]);
      setLabel('');
      setOptions([]);
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const rename = async (field: QuoteField, nextLabel: string) => {
    const name = nextLabel.trim();
    if (!name || name === field.label) return;
    if (props.fields.some((other) => other.id !== field.id && other.label.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
      const cause = new Error('Ya hay una columna con ese nombre.');
      setError(cause.message);
      throw cause;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await updateQuoteField(field.id, { label: name, options: field.options });
      props.onChange(props.fields.map((item) => (item.id === field.id ? saved : item)));
    } catch (cause) {
      fail(cause);
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const changeOptions = async (field: QuoteField, nextOptions: QuoteFieldOption[]) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await updateQuoteField(field.id, { label: field.label, options: nextOptions });
      props.onChange(props.fields.map((item) => (item.id === field.id ? saved : item)));
    } catch (cause) {
      fail(cause);
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (field: QuoteField) => {
    if (!window.confirm(`Quitar la columna ${field.label}? Los datos ya anotados dejan de mostrarse.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteQuoteField(field.id);
      props.onChange(props.fields.filter((item) => item.id !== field.id));
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= props.fields.length) return;
    const next = props.fields.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    const previous = props.fields;
    props.onChange(next);
    setBusy(true);
    setError(null);
    try {
      await reorderQuoteFields(next.map((field) => field.id));
    } catch (cause) {
      props.onChange(previous);
      fail(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-start justify-center p-4" onMouseDown={props.onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-fields-title"
        className="bg-white rounded-xl shadow-xl w-full max-w-lg mt-10 max-h-[calc(100vh-5rem)] flex flex-col"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="quote-fields-title" className="text-lg font-semibold text-slate-900">Columnas de seguimiento</h2>
              <p className="text-sm text-slate-600 mt-1">
                Quedan al extremo derecho de la tabla. Arrastre el encabezado para cambiarlas de lugar. En una categoría, el círculo de cada opción elige su color.
              </p>
            </div>
            <button type="button" onClick={props.onClose} className="text-slate-400 hover:text-slate-700" aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
          {error && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{error}</p>}
        </div>
        <div className="px-5 overflow-y-auto">
          {props.fields.length === 0 ? (
            <p className="text-sm text-slate-500 pb-3">Todavía no hay columnas. Agregue la etapa, el responsable o la probabilidad.</p>
          ) : (
            <ul className="space-y-2 pb-3">
              {props.fields.map((field, index) => (
                <li key={field.id} className="rounded-lg border border-slate-200 p-3">
                  <FieldRow
                    field={field}
                    index={index}
                    total={props.fields.length}
                    disabled={busy}
                    onRename={(next) => rename(field, next)}
                    onOptions={(next) => changeOptions(field, next)}
                    onMove={(delta) => void move(index, delta)}
                    onDelete={() => void remove(field)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <form
          className="border-t border-slate-100 px-5 py-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Nueva columna</div>
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              Nombre
              <input
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
                value={label}
                maxLength={48}
                placeholder="Etapa, responsable, probabilidad"
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-500">
              Tipo
              <select
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800"
                value={kind}
                onChange={(event) => setKind(event.target.value as QuoteFieldKind)}
              >
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="category">Categoría</option>
              </select>
            </label>
          </div>
          {kind === 'category' && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Opciones</div>
              <OptionEditor options={options} onChange={setOptions} />
            </div>
          )}
          <div className="flex justify-end">
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-60">
              <Plus size={16} /> Agregar columna
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldRow(props: {
  field: QuoteField;
  index: number;
  total: number;
  disabled: boolean;
  onRename: (label: string) => Promise<void>;
  onOptions: (options: QuoteFieldOption[]) => Promise<void>;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(props.field.label);
  useEffect(() => setLabel(props.field.label), [props.field.label]);
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="flex flex-col">
          <button type="button" className="text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Mover a la izquierda" title="Queda más a la izquierda en la tabla" disabled={props.disabled || props.index === 0} onClick={() => props.onMove(-1)}>
            <ChevronUp size={16} />
          </button>
          <button type="button" className="text-slate-400 hover:text-slate-700 disabled:opacity-30" aria-label="Mover a la derecha" title="Queda más a la derecha en la tabla" disabled={props.disabled || props.index === props.total - 1} onClick={() => props.onMove(1)}>
            <ChevronDown size={16} />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <input
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
            value={label}
            maxLength={48}
            disabled={props.disabled}
            aria-label={`Nombre de ${props.field.label}`}
            onChange={(event) => setLabel(event.target.value)}
            onBlur={() => {
              const next = label.trim();
              if (!next || next === props.field.label) {
                setLabel(props.field.label);
                return;
              }
              void props.onRename(label).catch(() => setLabel(props.field.label));
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
          <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400" title="El tipo queda fijo. Para usar otro, cree una columna nueva.">
            {quoteFieldKindLabel(props.field.kind)}
          </p>
        </div>
        <button type="button" className="text-red-600 hover:text-red-800 disabled:opacity-40 p-1" aria-label={`Quitar ${props.field.label}`} disabled={props.disabled} onClick={props.onDelete}>
          <Trash2 size={16} />
        </button>
      </div>
      {props.field.kind === 'category' && (
        <div className="mt-2 pl-6">
          <OptionEditor options={props.field.options} disabled={props.disabled} onChange={(next) => props.onOptions(next)} />
        </div>
      )}
    </>
  );
}

function OptionEditor(props: {
  options: QuoteFieldOption[];
  disabled?: boolean;
  onChange: (options: QuoteFieldOption[]) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [draftColor, setDraftColor] = useState(nextCategoryColor(0));
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apply = async (next: QuoteFieldOption[]) => {
    setError(null);
    try {
      await props.onChange(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la opción.');
      throw cause;
    }
  };
  const add = async () => {
    const label = draft.trim();
    if (!label) return;
    if (props.options.some((option) => option.label.toLocaleLowerCase('es') === label.toLocaleLowerCase('es'))) {
      setError('Esa opción ya está.');
      return;
    }
    if (props.options.length >= 40) {
      setError('Una categoría admite hasta 40 opciones.');
      return;
    }
    try {
      await apply([...props.options, { label, color: draftColor }]);
      setDraft('');
      setDraftColor(nextCategoryColor(props.options.length + 1));
      setOpenLabel(null);
    } catch {
      /* El mensaje queda en el editor. */
    }
  };
  return (
    <div>
      {props.options.length > 0 && (
        <div className="space-y-2">
          {props.options.map((option) => (
            <div key={option.label}>
              <span className="inline-flex items-center gap-1 rounded-full pl-1 pr-2 py-0.5 text-xs" style={categoryStyle(option.color)}>
                {!props.disabled && (
                  <button
                    type="button"
                    className="h-4 w-4 rounded-full border border-white/80"
                    style={{ backgroundColor: option.color }}
                    aria-label={`Color de ${option.label}`}
                    title="Elegir color"
                    onClick={() => setOpenLabel((current) => (current === option.label ? null : option.label))}
                  />
                )}
                {option.label}
                {!props.disabled && (
                  <button
                    type="button"
                    className="hover:opacity-70"
                    aria-label={`Quitar ${option.label}`}
                    onClick={() => {
                      void apply(props.options.filter((item) => item.label !== option.label)).catch(() => undefined);
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
              {openLabel === option.label && !props.disabled && (
                <div className="mt-1">
                  <ColorChoices
                    value={option.color}
                    onPick={(color) => {
                      void apply(props.options.map((item) => (item.label === option.label ? { ...item, color } : item))).catch(() => undefined);
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!props.disabled && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              placeholder="Nueva opción"
              value={draft}
              maxLength={40}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void add();
                }
              }}
            />
            <button type="button" onClick={() => void add()} className="px-2 py-1.5 rounded-md border border-slate-200 text-sm text-slate-700">
              Agregar
            </button>
          </div>
          <ColorChoices value={draftColor} onPick={setDraftColor} />
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ColorChoices(props: { value: string; onPick: (color: string) => void }) {
  const selected = props.value.toLowerCase();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {QUOTE_CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={`h-5 w-5 rounded-full border ${selected === color ? 'ring-2 ring-slate-900 ring-offset-1' : 'border-slate-200'}`}
          style={{ backgroundColor: color }}
          aria-label={`Color ${color}`}
          onClick={() => props.onPick(color)}
        />
      ))}
      <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
        Otro
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(selected) ? selected : '#e2e8f0'}
          aria-label="Otro color"
          className="h-5 w-7 cursor-pointer border-0 bg-transparent p-0"
          onChange={(event) => props.onPick(event.target.value)}
        />
      </label>
    </div>
  );
}
