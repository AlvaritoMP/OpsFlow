import React, { useMemo, useState } from 'react';
import { Building2, Loader2, Sparkles, UserPlus, X } from 'lucide-react';
import { inboundWorkerHandoffService } from '../services/inboundWorkerHandoffService';
import { hrOutboundIngresoService } from '../services/hrOutboundIngresoService';
import { resourcesService } from '../services/resourcesService';
import {
  InboundHandoffItem,
  ResourceType,
  StaffStatus,
  Unit,
} from '../types';
import {
  HandoffWorkerPrefill,
  buildResourceInboundSourceData,
  countStoredAtsFields,
  mapHandoffItemToWorkerPrefill,
} from '../utils/workerSnapshotMapper';
import {
  extractHandoffNameParts,
  hasStructuredNameParts,
  resolveHandoffDisplayName,
} from '../utils/handoffNameParts';
import { getUnitRequiredPositionOptions } from '../utils/unitPositionOptions';

interface RegisterHandoffWorkerModalProps {
  item: InboundHandoffItem;
  units: Unit[];
  sourcePackageId?: string;
  sourceApp?: string;
  onClose: () => void;
  onSuccess: () => void;
}

function PrefillBadge() {
  return (
    <span className="ml-2 inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
      <Sparkles size={10} className="mr-0.5" />
      ATS
    </span>
  );
}

export const RegisterHandoffWorkerModal: React.FC<RegisterHandoffWorkerModalProps> = ({
  item,
  units,
  sourcePackageId,
  sourceApp,
  onClose,
  onSuccess,
}) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unitId, setUnitId] = useState(item.assignedWorkUnitId ?? '');
  const [selectedPositionKey, setSelectedPositionKey] = useState('');
  const [form, setForm] = useState<HandoffWorkerPrefill>(() =>
    mapHandoffItemToWorkerPrefill(item),
  );
  const [zones, setZones] = useState<string[]>([]);

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === unitId) ?? null,
    [units, unitId],
  );

  const unitPositionOptions = useMemo(
    () => getUnitRequiredPositionOptions(selectedUnit),
    [selectedUnit],
  );

  const nameParts = useMemo(
    () => extractHandoffNameParts(item.workerSnapshot),
    [item.workerSnapshot],
  );
  const nameFromAtsParts = hasStructuredNameParts(nameParts);

  const toggleZone = (zoneName: string) => {
    setZones((prev) =>
      prev.includes(zoneName) ? prev.filter((z) => z !== zoneName) : [...prev, zoneName],
    );
  };

  const handleUnitChange = (nextUnitId: string) => {
    setUnitId(nextUnitId);
    setZones([]);
    setSelectedPositionKey('');
    setForm((current) => ({ ...current, puesto: '', shift: '' }));
  };

  const handlePositionChange = (positionKey: string) => {
    setSelectedPositionKey(positionKey);
    const option = unitPositionOptions.find((entry) => entry.key === positionKey);
    setForm((current) => ({
      ...current,
      puesto: option?.positionName ?? '',
      shift: option?.suggestedShift ?? current.shift,
    }));
  };

  const isPrefilled = (field: string) => form.prefilledFields.includes(field);
  const storedAtsFieldCount = countStoredAtsFields(item.workerSnapshot);
  const displayName = resolveHandoffDisplayName({
    snapshot: item.workerSnapshot,
    workerName: item.workerName,
  });
  const atsProcessTitle =
    typeof item.workerSnapshot.fields?.processTitle === 'string'
      ? item.workerSnapshot.fields.processTitle.trim()
      : '';

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (!unitId) {
      setError('Selecciona la unidad de destino.');
      return;
    }
    if (!form.puesto.trim()) {
      setError('Selecciona un puesto requerido de la unidad.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const resource = await resourcesService.create(
        {
          name: form.name.trim(),
          type: ResourceType.PERSONNEL,
          quantity: 1,
          status: StaffStatus.ACTIVE,
          assignedZones: zones,
          assignedShift: form.shift || undefined,
          compliancePercentage: 100,
          dni: form.dni.trim() || undefined,
          phone: form.phone.trim() || undefined,
          puesto: form.puesto.trim() || undefined,
          localidad: form.localidad.trim() || undefined,
          birthDate: form.birthDate || undefined,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          isShared: false,
          personnelStatus: 'activo',
          archived: false,
          monthlySalary: form.monthlySalary,
          externalId: form.externalId,
          inboundSourceData: buildResourceInboundSourceData(item, {
            sourcePackageId,
            sourceApp,
          }),
          trainings: [],
          assignedAssets: [],
        },
        unitId,
      );

      await inboundWorkerHandoffService.registerItemAsResource(item.id, unitId, resource.id);

      onSuccess();
      onClose();

      const unit = units.find((u) => u.id === unitId);
      if (unit) {
        void hrOutboundIngresoService
          .enqueueFromAssignment({
            resource,
            unit,
            handoffItem: item,
            sourcePackageId,
            sourceApp,
          })
          .catch((err) => {
            console.error('No se pudo encolar ingreso HR tras registrar colaborador:', err);
          });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el colaborador.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between bg-blue-600 px-5 py-4 text-white">
          <div className="flex min-w-0 items-center gap-2">
            <UserPlus size={20} className="shrink-0" />
            <div className="min-w-0">
              <h3 className="truncate font-bold">Registrar colaborador</h3>
              <p className="truncate text-sm text-blue-100">{displayName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto p-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {storedAtsFieldCount > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <span className="font-medium">Datos ATS archivados:</span> {storedAtsFieldCount}{' '}
              campo(s) del paquete se guardarán en el expediente del colaborador.
            </div>
          )}

          <div>
            <label className="mb-1 flex items-center text-sm font-medium text-slate-700">
              <Building2 size={14} className="mr-1" />
              Unidad de destino *
            </label>
            <select
              value={unitId}
              onChange={(e) => handleUnitChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="">Seleccionar unidad...</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} — {unit.clientName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Puesto en la unidad *
            </label>
            <select
              value={selectedPositionKey}
              onChange={(e) => handlePositionChange(e.target.value)}
              disabled={!unitId}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
            >
              <option value="">
                {unitId ? 'Seleccionar puesto requerido...' : 'Primero elige la unidad'}
              </option>
              {unitPositionOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            {unitId && unitPositionOptions.length === 0 && (
              <p className="mt-1 text-xs text-amber-700">
                Esta unidad no tiene puestos requeridos configurados.
              </p>
            )}
            {atsProcessTitle && (
              <p className="mt-1 text-xs text-slate-500">
                Referencia ATS: <span className="font-medium">{atsProcessTitle}</span>
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Nombre completo *{isPrefilled('name') && <PrefillBadge />}
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-blue-500"
                required
              />
              {nameFromAtsParts ? (
                <p className="mt-1 text-xs text-emerald-700">
                  Armado desde ATS:{' '}
                  {[
                    nameParts.nombres && `Nombre “${nameParts.nombres}”`,
                    nameParts.apellidoPaterno && `Apellido paterno “${nameParts.apellidoPaterno}”`,
                    nameParts.apellidoMaterno && `Apellido materno “${nameParts.apellidoMaterno}”`,
                  ]
                    .filter(Boolean)
                    .join(' + ')}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  Si ATS envía Nombre, Apellido paterno y Apellido materno, aquí se agrupan
                  automáticamente.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                DNI{isPrefilled('dni') && <PrefillBadge />}
              </label>
              <input
                type="text"
                value={form.dni}
                onChange={(e) => setForm({ ...form, dni: e.target.value })}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Teléfono{isPrefilled('phone') && <PrefillBadge />}
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Localidad</label>
              <input
                type="text"
                value={form.localidad}
                onChange={(e) => setForm({ ...form, localidad: e.target.value })}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Fecha de nacimiento{isPrefilled('birthDate') && <PrefillBadge />}
              </label>
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Fecha de ingreso{isPrefilled('startDate') && <PrefillBadge />}
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Salario mensual{isPrefilled('monthlySalary') && <PrefillBadge />}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monthlySalary ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    monthlySalary: e.target.value ? parseFloat(e.target.value) : undefined,
                  })
                }
                className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Turno</label>
              <select
                value={form.shift}
                onChange={(e) => setForm({ ...form, shift: e.target.value })}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="">Seleccionar...</option>
                <option value="Diurno">Diurno</option>
                <option value="Tarde">Tarde</option>
                <option value="Nocturno">Nocturno</option>
                <option value="Mixto">Mixto</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Fecha fin contrato (opcional)
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {selectedUnit && selectedUnit.zones.length > 0 && (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Zona(s) en {selectedUnit.name}
              </label>
              <div className="flex flex-wrap gap-2">
                {selectedUnit.zones.map((zone) => (
                  <label
                    key={zone.id}
                    className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1 text-sm ${
                      zones.includes(zone.name)
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={zones.includes(zone.name)}
                      onChange={() => toggleZone(zone.name)}
                    />
                    {zone.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !unitId || unitPositionOptions.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            Crear colaborador en unidad
          </button>
        </div>
      </div>
    </div>
  );
};
