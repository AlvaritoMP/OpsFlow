import React, { useMemo, useState } from 'react';
import { stockInventoryService } from '../../services/stockInventoryService';
import { InvButton, InvCard, InvInput, InvSelect, InvTextarea } from './InventoryUi';
import type { InvMonthlyExtra, InvMonthlyOrder, InvProduct, InvRequisition } from '../../types';

interface DraftExtra {
  key: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitId: string;
  unitName: string;
}

const currentPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const InventoryMonthlyOrders = ({
  products,
  requisitions,
  units,
  userName,
  canEdit,
  plansReady,
  monthlyOrders,
  startOpen,
  onChanged,
}: {
  products: InvProduct[];
  requisitions: InvRequisition[];
  units: { id: string; name: string }[];
  userName: string;
  canEdit: boolean;
  plansReady: boolean;
  monthlyOrders: InvMonthlyOrder[];
  startOpen?: boolean;
  onChanged: () => Promise<void> | void;
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [period, setPeriod] = useState(currentPeriod());
  const [title, setTitle] = useState(startOpen ? `Pedido general ${currentPeriod()}` : '');
  const [notes, setNotes] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [extras, setExtras] = useState<DraftExtra[]>([]);
  const [onlyThisMonth, setOnlyThisMonth] = useState(true);
  const [search, setSearch] = useState('');
  const [extraQty, setExtraQty] = useState(1);
  const [extraUnitId, setExtraUnitId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(Boolean(startOpen));

  const usableOrders = requisitions.filter((row) => row.status !== 'CANCELADO' && row.status !== 'RECHAZADO');
  const visibleOrders = usableOrders.filter((row) => !onlyThisMonth || row.createdAt.slice(0, 7) === period);
  const byUnit = new Map<string, InvRequisition[]>();
  visibleOrders.forEach((row) => {
    const list = byUnit.get(row.unitId) || [];
    list.push(row);
    byUnit.set(row.unitId, list);
  });

  const productMatches = search
    ? products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : [];

  const aggregate = useMemo(() => {
    const map = new Map<string, { sku: string; name: string; quantity: number; parts: string[] }>();
    const add = (productId: string, sku: string, name: string, quantity: number, part: string) => {
      if (quantity <= 0) return;
      const current = map.get(productId || sku) || { sku, name, quantity: 0, parts: [] };
      current.quantity += quantity;
      current.parts.push(part);
      map.set(productId || sku, current);
    };
    selectedIds.forEach((id) => {
      const order = requisitions.find((row) => row.id === id);
      if (!order) return;
      order.items.forEach((item) => {
        add(item.productId, item.sku, item.productName, item.quantityRequested, `${order.unitName} · ${order.code}`);
      });
    });
    extras.forEach((line) => {
      const where = line.unitName ? `${line.unitName} · puntual` : 'General';
      add(line.productId, line.sku, line.productName, line.quantity, where);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedIds, extras, requisitions]);

  const loadOrder = (order: InvMonthlyOrder) => {
    setEditingId(order.id);
    setPeriod(order.period);
    setTitle(order.title);
    setNotes(order.notes);
    setSelectedIds(order.sourceRequisitionIds);
    setExtras(order.extras.map((line) => ({
      key: line.id,
      productId: line.productId,
      sku: line.sku,
      productName: line.productName,
      quantity: line.quantity,
      unitId: line.unitId || '',
      unitName: line.unitName || '',
    })));
    setOnlyThisMonth(false);
    setOpen(true);
    setMessage(null);
  };

  const startNew = () => {
    setEditingId(null);
    setPeriod(currentPeriod());
    setTitle(`Pedido general ${currentPeriod()}`);
    setNotes('');
    setSelectedIds([]);
    setExtras([]);
    setOnlyThisMonth(true);
    setOpen(true);
    setMessage(null);
  };

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id]));
  };

  const toggleUnit = (unitId: string) => {
    const ids = (byUnit.get(unitId) || []).map((row) => row.id);
    const allOn = ids.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => (allOn ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))));
  };

  const save = async (status: 'BORRADOR' | 'CONFIRMADO') => {
    try {
      setSaving(true);
      setMessage(null);
      const sourceIds = [...selectedIds];
      const general: Omit<InvMonthlyExtra, 'id'>[] = [];
      const punctual = new Map<string, { unitName: string; items: { product: InvProduct; quantity: number }[] }>();
      for (const line of extras) {
        const product = products.find((row) => row.id === line.productId);
        if (!product) continue;
        if (line.unitId) {
          const group = punctual.get(line.unitId) || { unitName: line.unitName, items: [] };
          const existing = group.items.find((item) => item.product.id === product.id);
          if (existing) existing.quantity += line.quantity;
          else group.items.push({ product, quantity: line.quantity });
          punctual.set(line.unitId, group);
        } else {
          general.push({
            productId: product.id,
            sku: product.sku,
            productName: product.name,
            quantity: line.quantity,
            notes: '',
          });
        }
      }
      for (const [unitId, group] of punctual) {
        const created = await stockInventoryService.createRequisition({
          unitId,
          unitName: group.unitName,
          notes: `Pedido puntual del consolidado ${period}. ${notes}`.trim(),
          requestedBy: userName,
          items: group.items,
        });
        sourceIds.push(created.id);
      }
      setSelectedIds(sourceIds);
      setExtras(general.map((line) => ({
        key: `${line.productId}-general`,
        productId: line.productId,
        sku: line.sku,
        productName: line.productName,
        quantity: line.quantity,
        unitId: '',
        unitName: '',
      })));
      const savedId = await stockInventoryService.saveMonthlyOrder({
        id: editingId || undefined,
        period,
        title: title || `Pedido general ${period}`,
        notes,
        status,
        createdBy: userName,
        sourceRequisitionIds: sourceIds,
        extras: general,
      });
      setEditingId(savedId);
      setMessage(status === 'CONFIRMADO' ? 'Pedido del mes confirmado.' : 'Borrador guardado.');
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el pedido del mes');
    } finally {
      setSaving(false);
    }
  };

  if (!plansReady) {
    return (
      <InvCard>
        <h2 className="text-lg font-bold text-slate-800 mb-2">Pedido del mes</h2>
        <p className="text-sm text-amber-800">
          Ejecute <code>migrations/MIGRATION_INVENTORY_ORDER_PLANS.sql</code> en Supabase para consolidar los pedidos del mes.
        </p>
      </InvCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Pedido general del mes</h2>
          <p className="text-sm text-slate-500">
            Elija los pedidos que cada unidad ya hizo, súmelos en uno solo y, si falta algo, agregue ítems puntuales. Ese consolidado es el que recibe el almacén.
          </p>
        </div>
        {canEdit && <InvButton onClick={startNew}>Nuevo consolidado</InvButton>}
      </div>

      {monthlyOrders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {monthlyOrders.map((order) => (
            <button key={order.id} type="button" onClick={() => loadOrder(order)} className="text-left border border-slate-200 rounded-lg p-3 hover:bg-slate-50">
              <div className="flex justify-between gap-2">
                <p className="font-semibold text-slate-800">{order.title}</p>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${order.status === 'CONFIRMADO' ? 'bg-green-50 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                  {order.status === 'CONFIRMADO' ? 'Confirmado' : 'Borrador'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{order.code} · {order.period} · {order.sourceRequisitionIds.length} pedidos · {order.extras.length} extras</p>
            </button>
          ))}
        </div>
      )}

      {open && (
        <InvCard>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <InvInput label="Mes" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
            <div className="md:col-span-2">
              <InvInput label="Título" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Abastecimiento noviembre" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 mb-3">
            <input type="checkbox" checked={onlyThisMonth} onChange={(e) => setOnlyThisMonth(e.target.checked)} />
            Mostrar solo pedidos de este mes
          </label>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
              {Array.from(byUnit.entries()).map(([unitId, rows]) => (
                <div key={unitId} className="border border-slate-200 rounded-lg p-3">
                  <label className="flex items-center gap-2 font-semibold text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={rows.every((row) => selectedIds.includes(row.id))}
                      onChange={() => toggleUnit(unitId)}
                    />
                    {rows[0]?.unitName || 'Unidad'}
                  </label>
                  <div className="mt-2 space-y-2">
                    {rows.map((row) => (
                      <label key={row.id} className="flex gap-2 text-sm">
                        <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggle(row.id)} className="mt-1" />
                        <span>
                          <span className="font-mono text-xs">{row.code}</span>
                          <span className="text-slate-500"> · {new Date(row.createdAt).toLocaleDateString()} · {row.items.length} ítems</span>
                          <span className="block text-xs text-slate-600">
                            {row.items.map((item) => `${item.productName} (${item.quantityRequested})`).join(', ')}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {byUnit.size === 0 && <p className="text-sm text-slate-400">No hay pedidos de unidades para este filtro.</p>}
              {selectedIds.some((id) => !visibleOrders.some((row) => row.id === id)) && (
                <p className="text-xs text-slate-500">Hay pedidos seleccionados fuera de este filtro. Siguen sumando en el total.</p>
              )}
            </div>

            <div className="space-y-3">
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Agregar ítem puntual</p>
                <div className="relative mb-2">
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Producto o SKU" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  {productMatches.length > 0 && (
                    <ul className="absolute z-10 w-full bg-white border rounded-lg shadow mt-1">
                      {productMatches.map((product) => (
                        <li key={product.id}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                            onClick={() => {
                              const unit = units.find((row) => row.id === extraUnitId);
                              setExtras((prev) => [...prev, {
                                key: `${product.id}-${Date.now()}`,
                                productId: product.id,
                                sku: product.sku,
                                productName: product.name,
                                quantity: extraQty,
                                unitId: extraUnitId,
                                unitName: unit?.name || '',
                              }]);
                              setSearch('');
                            }}
                          >
                            {product.name} <span className="font-mono text-slate-500">{product.sku}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <InvInput label="Cantidad" type="number" min={1} value={extraQty} onChange={(e) => setExtraQty(Math.max(1, parseInt(e.target.value, 10) || 1))} />
                  <InvSelect label="Para la unidad" value={extraUnitId} onChange={(e) => setExtraUnitId(e.target.value)}>
                    <option value="">General (sin unidad)</option>
                    {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                  </InvSelect>
                </div>
                <p className="text-xs text-slate-500 mt-2">Si elige una unidad, al guardar se crea un pedido real de esa unidad y entra en este consolidado.</p>
                {extras.map((line) => (
                  <div key={line.key} className="flex items-center gap-2 text-sm mt-2">
                    <div className="flex-1">
                      <p>{line.productName} <span className="font-mono text-xs text-slate-500">{line.sku}</span></p>
                      <p className="text-xs text-slate-500">{line.unitName || 'General'} · {line.quantity}</p>
                    </div>
                    <button type="button" className="text-red-600 text-xs" onClick={() => setExtras((prev) => prev.filter((row) => row.key !== line.key))}>Quitar</button>
                  </div>
                ))}
              </div>

              <div className="border border-slate-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-slate-800 mb-2">Total consolidado</p>
                {aggregate.length === 0 && <p className="text-sm text-slate-400">Seleccione pedidos o agregue un ítem.</p>}
                {aggregate.map((row) => (
                  <div key={`${row.sku}-${row.name}`} className="py-2 border-b border-slate-100 text-sm">
                    <div className="flex justify-between gap-2">
                      <p className="font-medium">{row.name} <span className="font-mono text-xs text-slate-500">{row.sku}</span></p>
                      <p className="font-bold">{row.quantity}</p>
                    </div>
                    <p className="text-xs text-slate-500">{row.parts.join(' · ')}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <InvTextarea label="Notas del mes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          {message && <p className={`text-sm mt-2 ${message.includes('guardado') || message.includes('confirmado') ? 'text-green-700' : 'text-amber-800'}`}>{message}</p>}
          {canEdit && (
            <div className="flex justify-end gap-2 mt-3">
              <InvButton className="bg-slate-100 text-slate-700" disabled={saving} onClick={() => void save('BORRADOR')}>{saving ? 'Guardando...' : 'Guardar borrador'}</InvButton>
              <InvButton disabled={saving || (selectedIds.length === 0 && extras.length === 0)} onClick={() => void save('CONFIRMADO')}>Confirmar pedido del mes</InvButton>
            </div>
          )}
        </InvCard>
      )}
    </div>
  );
};
