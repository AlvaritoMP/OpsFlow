import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, Search, X } from 'lucide-react';
import { hrOutboundIngresoService } from '../services/hrOutboundIngresoService';
import {
  HR_SHAREPOINT_DOCS_LIBRARY_URL,
  buildWorkerFieldInventory,
  listHrFieldBlockers,
  listHrFieldWarnings,
  mergeHrFieldsWithSnapshot,
} from '../utils/hrOpalosisMapper';
import { DateInput } from './DateInput';
import type {
  HrOpalosisIngresoFields,
  HrOutboundIngresoQueueItem,
  OpalosisCatalogItem,
  OpalosisCatalogName,
} from '../types';

interface Props {
  item: HrOutboundIngresoQueueItem;
  onClose: () => void;
  onSaved: (item: HrOutboundIngresoQueueItem) => void;
}

function CatalogSearch({
  catalog,
  label,
  valueId,
  valueLabel,
  onSelect,
  departamentoId,
  provinciaId,
  minChars = 1,
  loadOnMount = false,
  autoMatchLabel = false,
}: {
  catalog: OpalosisCatalogName;
  label: string;
  valueId?: number | null;
  valueLabel?: string;
  onSelect: (item: OpalosisCatalogItem | null) => void;
  departamentoId?: number | null;
  provinciaId?: number | null;
  minChars?: number;
  loadOnMount?: boolean;
  /** Si hay etiqueta OpsFlow y aún no hay ID, intenta emparejar con el catálogo. */
  autoMatchLabel?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<OpalosisCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchedRef = useRef(false);

  useEffect(() => {
    matchedRef.current = false;
  }, [valueLabel, departamentoId, provinciaId, catalog]);

  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const load = async (buscar?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await hrOutboundIngresoService.fetchCatalog({
        catalog,
        buscar: buscar || undefined,
        departamentoId: departamentoId ?? undefined,
        provinciaId: provinciaId ?? undefined,
      });
      setItems(result.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar catálogo');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Distritos suelen requerir provincia; provincias pueden buscarse solo por nombre
    if (catalog === 'distritos' && !provinciaId && !valueLabel) return;

    if (loadOnMount || (autoMatchLabel && valueLabel && !valueId)) {
      load(autoMatchLabel && valueLabel && !valueId ? valueLabel : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, loadOnMount, departamentoId, provinciaId, autoMatchLabel, valueLabel, valueId]);

  useEffect(() => {
    if (!autoMatchLabel || valueId || !valueLabel || matchedRef.current || items.length === 0) {
      return;
    }
    const target = normalize(valueLabel);
    if (!target) return;
    const exact = items.find((it) => normalize(it.label) === target);
    const partial = items.find(
      (it) =>
        normalize(it.label).includes(target) || target.includes(normalize(it.label)),
    );
    const hit = exact || partial;
    if (hit) {
      matchedRef.current = true;
      onSelect(hit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, autoMatchLabel, valueId, valueLabel]);

  useEffect(() => {
    if (loadOnMount || autoMatchLabel) return;
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim() || query.trim().length < minChars) {
      setItems([]);
      return;
    }
    timer.current = setTimeout(() => load(query.trim()), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, catalog, departamentoId, provinciaId]);

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {valueId ? (
        <div className="mb-1 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <span className="truncate text-emerald-900">
            <span className="font-mono text-xs text-emerald-700">#{valueId}</span> {valueLabel}
          </span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="ml-2 text-xs text-emerald-700 hover:text-emerald-900"
          >
            Cambiar
          </button>
        </div>
      ) : valueLabel ? (
        <div className="mb-1 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <span className="truncate text-emerald-900">{valueLabel}</span>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="ml-2 text-xs text-emerald-700 hover:text-emerald-900"
          >
            Cambiar
          </button>
        </div>
      ) : null}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            if (loadOnMount && items.length === 0) load();
          }}
          placeholder={loadOnMount ? 'Buscar o seleccionar…' : `Escriba al menos ${minChars} carácter(es)…`}
          className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-sm"
        />
        {loading && <Loader2 size={14} className="absolute right-2.5 top-2.5 animate-spin text-slate-400" />}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {open && items.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  onSelect(it);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <span className="font-mono text-xs text-slate-400">#{it.id}</span> {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const HrOpalosisEditQueueItemModal: React.FC<Props> = ({ item, onClose, onSaved }) => {
  const [form, setForm] = useState<HrOpalosisIngresoFields>(() =>
    mergeHrFieldsWithSnapshot(
      item.hrFields,
      item.workerSnapshot,
      item.refOperaciones,
      {
        opalosisUnidadId: item.hrFields?.lugarTrabajoId ?? null,
        empresaCodigo: item.hrFields?.opaloId ?? null,
      },
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState(item.workerSnapshot);

  // Siempre rehidratar complementary desde el snapshot encolado (aunque no haya handoff)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { hydrateComplementaryFromSnapshot } = await import('../utils/complementaryHydrate');
        let complementary = hydrateComplementaryFromSnapshot(
          {
            identity: item.workerSnapshot.ats.identity,
            fields: item.workerSnapshot.ats.fields,
            complementary: item.workerSnapshot.ats.complementary,
            meta: item.workerSnapshot.ats.meta,
          },
          item.workerSnapshot.ats.complementary ?? null,
        );

        const handoffId = item.inboundHandoffItemId;
        if (handoffId) {
          const { inboundWorkerHandoffService } = await import(
            '../services/inboundWorkerHandoffService'
          );
          const handoff = await inboundWorkerHandoffService.getItemById(handoffId);
          if (!cancelled && handoff) {
            complementary = hydrateComplementaryFromSnapshot(
              handoff.workerSnapshot ?? item.workerSnapshot,
              handoff.complementary ?? complementary,
            );
          }
        }

        if (cancelled) return;
        const nextSnapshot = {
          ...item.workerSnapshot,
          ats: {
            ...item.workerSnapshot.ats,
            complementary,
            fields: {
              ...(item.workerSnapshot.ats.fields ?? {}),
            },
          },
        };
        setSnapshot(nextSnapshot);
        setForm(
          mergeHrFieldsWithSnapshot(item.hrFields, nextSnapshot, item.refOperaciones, {
            opalosisUnidadId: item.hrFields?.lugarTrabajoId ?? null,
            empresaCodigo: item.hrFields?.opaloId ?? null,
          }),
        );
      } catch {
        // snapshot encolado
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item]);

  /** Resuelve IDs Opalosis de ubigeo en cascada a partir de etiquetas OpsFlow. */
  useEffect(() => {
    const depLabel = form.labels?.departamento?.trim();
    const provLabel = form.labels?.provincia?.trim();
    const distLabel = form.labels?.distrito?.trim();
    if (!depLabel && !provLabel && !distLabel) return;
    if (form.departamentoId && form.provinciaId && form.ubigeoId) return;

    let cancelled = false;
    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const findBest = (items: OpalosisCatalogItem[], label: string) => {
      const target = normalize(label);
      if (!target || items.length === 0) return null;
      return (
        items.find((it) => normalize(it.label) === target) ||
        items.find(
          (it) =>
            normalize(it.label).includes(target) || target.includes(normalize(it.label)),
        ) ||
        null
      );
    };

    (async () => {
      try {
        let depId = form.departamentoId ?? null;
        let provId = form.provinciaId ?? null;
        let distId = form.ubigeoId ?? null;
        let depName = form.labels?.departamento;
        let provName = form.labels?.provincia;
        let distName = form.labels?.distrito;

        if (depLabel && !depId) {
          const { items } = await hrOutboundIngresoService.fetchCatalog({
            catalog: 'departamentos',
            buscar: depLabel,
          });
          const hit = findBest(items, depLabel);
          if (hit) {
            depId = hit.id;
            depName = hit.label;
          }
        }

        if (provLabel && !provId) {
          const { items } = await hrOutboundIngresoService.fetchCatalog({
            catalog: 'provincias',
            buscar: provLabel,
            departamentoId: depId ?? undefined,
          });
          const hit = findBest(items, provLabel);
          if (hit) {
            provId = hit.id;
            provName = hit.label;
            const rawDep = Number(
              hit.raw?.DepartamentoId ?? hit.raw?.departamentoId ?? 0,
            );
            if (!depId && rawDep) {
              depId = rawDep;
              depName = depName || depLabel || undefined;
            }
          }
        }

        if (distLabel && !distId) {
          const { items } = await hrOutboundIngresoService.fetchCatalog({
            catalog: 'distritos',
            buscar: distLabel,
            departamentoId: depId ?? undefined,
            provinciaId: provId ?? undefined,
          });
          const hit = findBest(items, distLabel);
          if (hit) {
            distId = hit.id;
            distName = hit.label;
            const rawDep = Number(
              hit.raw?.DepartamentoId ?? hit.raw?.departamentoId ?? 0,
            );
            const rawProv = Number(
              hit.raw?.ProvinciaId ?? hit.raw?.provinciaId ?? 0,
            );
            if (!depId && rawDep) depId = rawDep;
            if (!provId && rawProv) provId = rawProv;
          }
        }

        if (cancelled) return;
        setForm((prev) => {
          const same =
            prev.departamentoId === depId &&
            prev.provinciaId === provId &&
            prev.ubigeoId === distId;
          if (same) return prev;
          return {
            ...prev,
            departamentoId: depId,
            provinciaId: provId,
            ubigeoId: distId,
            labels: {
              ...prev.labels,
              departamento: depName || prev.labels?.departamento,
              provincia: provName || prev.labels?.provincia,
              distrito: distName || prev.labels?.distrito,
            },
          };
        });
      } catch {
        // Catálogo no disponible: se dejan etiquetas OpsFlow sin ID
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.labels?.departamento,
    form.labels?.provincia,
    form.labels?.distrito,
    form.departamentoId,
    form.provinciaId,
    form.ubigeoId,
  ]);

  const blockers = useMemo(() => listHrFieldBlockers(form), [form]);
  const warnings = useMemo(() => listHrFieldWarnings(form), [form]);
  const fieldInventory = useMemo(
    () => buildWorkerFieldInventory(snapshot, form),
    [snapshot, form],
  );

  const setField = <K extends keyof HrOpalosisIngresoFields>(key: K, value: HrOpalosisIngresoFields[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setLabel = (key: keyof NonNullable<HrOpalosisIngresoFields['labels']>, value?: string) => {
    setForm((prev) => ({
      ...prev,
      labels: { ...prev.labels, [key]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await hrOutboundIngresoService.updateQueueItemHrFields(item.id, form);
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-4 w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Completar datos para Opalosis</h3>
            <p className="text-sm text-slate-500">
              {item.workerName} · <span className="font-mono text-xs">{item.refOperaciones}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-5 py-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
          )}

          {blockers.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <strong>Obligatorio para enviar:</strong> {blockers.join(', ')}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Opcional / tipificación Opalosis:</strong> {warnings.join(' · ')}. Se puede
              enviar igual; los textos OpsFlow van en el inventario para que RRHH los asocie.
            </div>
          )}

          <section className="space-y-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Todos los datos del camino ATS → OpsFlow
            </h4>
            <p className="text-xs text-slate-500">
              Incluye campos conocidos y dinámicos (ej. un dato &quot;mascotas&quot; nacido en el
              ATS). Se envían a Opalosis con estas etiquetas; allí RRHH decide por cada uno si lo
              usa, lo descarta, y con qué nombre de su BD (ej. mascotas → animales). No hay
              estándar 1:1 entre sistemas.
            </p>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-slate-100 text-left text-slate-600">
                  <tr>
                    <th className="px-2 py-1.5">Origen</th>
                    <th className="px-2 py-1.5">Clave</th>
                    <th className="px-2 py-1.5">Etiqueta (camino)</th>
                    <th className="px-2 py-1.5">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {fieldInventory.map((f) => (
                    <tr key={`${f.source}-${f.key}`} className="border-t border-slate-200">
                      <td className="px-2 py-1 font-mono uppercase text-slate-400">{f.source}</td>
                      <td className="px-2 py-1 font-mono text-slate-500">{f.key}</td>
                      <td className="px-2 py-1 text-slate-700" title={f.note}>
                        {f.label}
                      </td>
                      <td className="max-w-[180px] truncate px-2 py-1 text-slate-800">
                        {String(f.value)}
                      </td>
                    </tr>
                  ))}
                  {fieldInventory.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-2 py-3 text-center text-slate-400">
                        Sin datos adicionales en el snapshot
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Datos personales</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <CatalogSearch
                catalog="tipo-documento"
                label="Tipo de documento"
                valueId={form.tipoDocumentoId}
                valueLabel={form.labels?.tipoDocumento}
                loadOnMount
                onSelect={(it) => {
                  setField('tipoDocumentoId', it?.id ?? 1);
                  setLabel('tipoDocumento', it?.label);
                }}
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Documento *</label>
                <input
                  value={form.documento}
                  onChange={(e) => setField('documento', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Apellido paterno *</label>
                <input
                  value={form.apellidoPaterno}
                  onChange={(e) => setField('apellidoPaterno', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Apellido materno</label>
                <input
                  value={form.apellidoMaterno}
                  onChange={(e) => setField('apellidoMaterno', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Nombres *</label>
                <input
                  value={form.nombres}
                  onChange={(e) => setField('nombres', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Sexo</label>
                <select
                  value={form.sexo}
                  onChange={(e) => setField('sexo', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Fecha nacimiento (dd/mm/yyyy)
                </label>
                <DateInput
                  value={form.fechaNacimiento ?? ''}
                  onChange={(iso) => setField('fechaNacimiento', iso || null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <CatalogSearch
                catalog="estado-civil"
                label="Estado civil"
                valueId={form.estadoCivilId}
                valueLabel={form.labels?.estadoCivil}
                loadOnMount
                autoMatchLabel
                onSelect={(it) => {
                  setField('estadoCivilId', it?.id ?? null);
                  setLabel('estadoCivil', it?.label ?? form.labels?.estadoCivil);
                }}
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Teléfono</label>
                <input
                  value={form.telefono ?? ''}
                  onChange={(e) => setField('telefono', e.target.value || null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Correo personal</label>
                <input
                  value={form.correoPersonal ?? ''}
                  onChange={(e) => setField('correoPersonal', e.target.value || null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Dirección</label>
                <input
                  value={form.direccion ?? ''}
                  onChange={(e) => setField('direccion', e.target.value || null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Ubigeo / país</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <CatalogSearch
                catalog="paises"
                label="País (default Perú = 173)"
                valueId={form.paisId}
                valueLabel={form.paisId === 173 ? 'Perú' : undefined}
                onSelect={(it) => setField('paisId', it?.id ?? 173)}
              />
              <CatalogSearch
                catalog="departamentos"
                label="Departamento"
                valueId={form.departamentoId}
                valueLabel={form.labels?.departamento}
                autoMatchLabel
                onSelect={(it) => {
                  setForm((prev) => ({
                    ...prev,
                    departamentoId: it?.id ?? null,
                    // Solo limpiar IDs hijos; conservar etiquetas OpsFlow para cascada
                    provinciaId: null,
                    ubigeoId: null,
                    labels: {
                      ...prev.labels,
                      departamento: it?.label ?? prev.labels?.departamento,
                    },
                  }));
                }}
              />
              <CatalogSearch
                catalog="provincias"
                label="Provincia"
                valueId={form.provinciaId}
                valueLabel={form.labels?.provincia}
                departamentoId={form.departamentoId}
                autoMatchLabel
                onSelect={(it) => {
                  setForm((prev) => ({
                    ...prev,
                    provinciaId: it?.id ?? null,
                    ubigeoId: null,
                    labels: {
                      ...prev.labels,
                      provincia: it?.label ?? prev.labels?.provincia,
                    },
                  }));
                }}
              />
              <CatalogSearch
                catalog="distritos"
                label="Distrito (UbigeoId)"
                valueId={form.ubigeoId}
                valueLabel={form.labels?.distrito}
                departamentoId={form.departamentoId}
                provinciaId={form.provinciaId}
                autoMatchLabel
                onSelect={(it) => {
                  setForm((prev) => ({
                    ...prev,
                    ubigeoId: it?.id ?? null,
                    labels: {
                      ...prev.labels,
                      distrito: it?.label ?? prev.labels?.distrito,
                    },
                  }));
                }}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Datos laborales</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Fecha ingreso (dd/mm/yyyy)
                </label>
                <DateInput
                  value={form.fechaIngreso}
                  onChange={(iso) => setField('fechaIngreso', iso || form.fechaIngreso)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <CatalogSearch
                catalog="opalos"
                label="Empresa (OpaloId)"
                valueId={form.opaloId}
                valueLabel={form.labels?.opalo}
                loadOnMount
                onSelect={(it) => {
                  setField('opaloId', it?.id ?? 103);
                  setLabel('opalo', it?.label);
                }}
              />
              <CatalogSearch
                catalog="empleado-cargo"
                label="Cargo Opalosis (opcional)"
                valueId={form.empleadoCargoId}
                valueLabel={form.labels?.empleadoCargo}
                autoMatchLabel
                onSelect={(it) => {
                  setField('empleadoCargoId', it?.id ?? null);
                  setLabel('empleadoCargo', it?.label ?? form.labels?.empleadoCargo);
                }}
              />
              <CatalogSearch
                catalog="lugar-trabajo"
                label="Lugar de trabajo Opalosis (opcional)"
                valueId={form.lugarTrabajoId}
                valueLabel={form.labels?.lugarTrabajo}
                autoMatchLabel
                onSelect={(it) => {
                  setField('lugarTrabajoId', it?.id ?? null);
                  setLabel('lugarTrabajo', it?.label ?? form.labels?.lugarTrabajo);
                }}
              />
              <CatalogSearch
                catalog="modelo-contrato"
                label="Modelo de contrato"
                valueId={form.modeloContratoId}
                valueLabel={form.labels?.modeloContrato}
                loadOnMount
                onSelect={(it) => {
                  setField('modeloContratoId', it?.id ?? null);
                  setLabel('modeloContrato', it?.label);
                }}
              />
              <CatalogSearch
                catalog="regimen-laboral"
                label="Régimen laboral"
                valueId={form.regimenLaboralId}
                valueLabel={form.labels?.regimenLaboral}
                loadOnMount
                autoMatchLabel
                onSelect={(it) => {
                  setField('regimenLaboralId', it?.id ?? null);
                  setLabel('regimenLaboral', it?.label ?? form.labels?.regimenLaboral);
                }}
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Meses contrato</label>
                <input
                  type="number"
                  value={form.mesesContrato ?? ''}
                  onChange={(e) => setField('mesesContrato', e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Jornada</label>
                <input
                  value={form.jornadaLaboral ?? ''}
                  onChange={(e) => setField('jornadaLaboral', e.target.value || null)}
                  placeholder="8 Horas"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Turno</label>
                <input
                  value={form.turno ?? ''}
                  onChange={(e) => setField('turno', e.target.value || null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <CatalogSearch
                catalog="supervisores"
                label="Supervisor"
                valueId={form.supervisorId}
                valueLabel={form.labels?.supervisor}
                onSelect={(it) => {
                  setField('supervisorId', it?.id ?? null);
                  setLabel('supervisor', it?.label);
                }}
              />
              <CatalogSearch
                catalog="centro-costo"
                label="Centro de costo"
                valueId={form.centroCostoId}
                valueLabel={form.labels?.centroCosto}
                onSelect={(it) => {
                  setField('centroCostoId', it?.id ?? null);
                  setLabel('centroCosto', it?.label);
                }}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Pago</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Sueldo</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.sueldo ?? ''}
                  onChange={(e) => setField('sueldo', e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Movilidad *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.movilidad ?? 0}
                  onChange={(e) => setField('movilidad', e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <CatalogSearch
                catalog="fondo-pension"
                label="Sistema pensión"
                valueId={undefined}
                valueLabel={form.sistemaPension ?? form.labels?.fondoPension}
                loadOnMount
                autoMatchLabel
                onSelect={(it) => {
                  setField('sistemaPension', it?.label ?? form.sistemaPension ?? null);
                  setLabel('fondoPension', it?.label ?? form.labels?.fondoPension);
                }}
              />
              <CatalogSearch
                catalog="banco"
                label="Banco preferencia (banco sueldo)"
                valueId={undefined}
                valueLabel={form.bancoPreferencia ?? form.labels?.banco}
                loadOnMount
                autoMatchLabel
                onSelect={(it) => {
                  setField('bancoPreferencia', it?.label ?? form.bancoPreferencia ?? null);
                  setLabel('banco', it?.label ?? form.labels?.banco);
                }}
              />
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Nº cuenta trabajador</label>
                <input
                  value={form.numeroCuentaTrabajador ?? ''}
                  onChange={(e) => setField('numeroCuentaTrabajador', e.target.value || null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Adjuntos / otros</h4>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="mb-2">
                Suba los documentos del trabajador a SharePoint (carpeta con el nº de documento) y pegue aquí el vínculo de la carpeta.
              </p>
              <a
                href={HR_SHAREPOINT_DOCS_LIBRARY_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline"
              >
                Abrir biblioteca SharePoint RRHH <ExternalLink size={14} />
              </a>
            </div>
            <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  UrlDocumentoAdjunto (opcional)
                </label>
              <input
                value={form.urlDocumentoAdjunto ?? ''}
                onChange={(e) => setField('urlDocumentoAdjunto', e.target.value || null)}
                placeholder="https://opaloperu1.sharepoint.com/..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Talla polo</label>
                <input
                  value={form.tallaPoloCamisa ?? ''}
                  onChange={(e) => setField('tallaPoloCamisa', e.target.value || null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Talla casaca</label>
                <input
                  value={form.tallaCasaca ?? ''}
                  onChange={(e) => setField('tallaCasaca', e.target.value || null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Talla pantalón</label>
                <input
                  value={form.tallaPantalon ?? ''}
                  onChange={(e) => setField('tallaPantalon', e.target.value || null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Talla zapatos</label>
                <input
                  type="number"
                  value={form.tallaZapatos ?? ''}
                  onChange={(e) => setField('tallaZapatos', e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Observación</label>
              <textarea
                value={form.observacion ?? ''}
                onChange={(e) => setField('observacion', e.target.value || null)}
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            {warnings.length > 0 && (
              <p className="text-xs text-slate-500">Alertas: {warnings.join(' · ')}</p>
            )}
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Guardar datos
          </button>
        </div>
      </div>
    </div>
  );
};
