import React, { useMemo, useState } from 'react';
import { useInventory } from './InventoryContext';
import { InvButton, InvCard, InvInput, InvModal, InvSelect, InvTextarea } from './InventoryUi';
import { INV_REQUISITION_STATUS_LABELS, type InvRequisition, type InvRequisitionStatus } from '../../types';
import { companyLabel, lotsInWarehouse, unassignedQuantity } from '../../utils/inventoryLots';

const STATUS_CLASS: Record<InvRequisitionStatus, string> = {
  SOLICITADO: 'bg-amber-50 text-amber-800',
  DESPACHADO: 'bg-green-50 text-green-800',
  PARCIAL: 'bg-blue-50 text-blue-800',
  RECHAZADO: 'bg-red-50 text-red-800',
  CANCELADO: 'bg-slate-100 text-slate-600',
};

export const InventoryRequisitionsView = () => {
  const {
    requisitions, products, warehouses, inventory, companyStock, myCompanies,
    units, logisticsReady, canEdit, canFulfillRequisitions, actions,
  } = useInventory();
  const [statusFilter, setStatusFilter] = useState<InvRequisitionStatus | ''>('SOLICITADO');
  const [creating, setCreating] = useState(false);
  const [fulfilling, setFulfilling] = useState<InvRequisition | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const visible = requisitions.filter((row) => !statusFilter || row.status === statusFilter);
  const central = warehouses.filter((w) => w.kind !== 'UNIT');

  if (!logisticsReady) {
    return (
      <InvCard>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Pedidos de unidades</h1>
        <p className="text-sm text-amber-800">
          Ejecute en Supabase <code>migrations/MIGRATION_INVENTORY_LOGISTICS.sql</code> para habilitar los pedidos de las unidades al almacén.
        </p>
      </InvCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pedidos de unidades</h1>
          <p className="text-slate-500 text-sm">
            La unidad pide. El almacén autoriza y despacha al almacén de esa unidad. Después la unidad descarga el consumo.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InvRequisitionStatus | '')}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {(Object.keys(INV_REQUISITION_STATUS_LABELS) as InvRequisitionStatus[]).map((status) => (
              <option key={status} value={status}>{INV_REQUISITION_STATUS_LABELS[status]}</option>
            ))}
          </select>
          {canEdit && <InvButton onClick={() => setCreating(true)}>Nuevo pedido</InvButton>}
        </div>
      </div>
      {message && <p className="text-sm text-amber-800">{message}</p>}
      <InvCard>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="p-3">Pedido</th>
                <th className="p-3">Unidad</th>
                <th className="p-3">Ítems</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 align-top">
                  <td className="p-3">
                    <p className="font-mono font-semibold">{row.code}</p>
                    <p className="text-xs text-slate-500">{new Date(row.createdAt).toLocaleString()} · {row.requestedBy}</p>
                    {row.notes && <p className="text-xs text-slate-600 mt-1">{row.notes}</p>}
                  </td>
                  <td className="p-3">{row.unitName}</td>
                  <td className="p-3">
                    {row.items.map((item) => (
                      <p key={item.id || item.sku} className="text-xs">
                        {item.productName} <span className="font-mono text-slate-500">{item.sku}</span> · pedido {item.quantityRequested}
                        {item.quantityApproved > 0 ? ` · despachado ${item.quantityApproved}` : ''}
                        {item.companyName ? ` · ${item.companyName}` : ''}
                      </p>
                    ))}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_CLASS[row.status]}`}>
                      {INV_REQUISITION_STATUS_LABELS[row.status]}
                    </span>
                    {row.decisionNote && <p className="text-xs text-slate-500 mt-1">{row.decisionNote}</p>}
                  </td>
                  <td className="p-3">
                    {row.status === 'SOLICITADO' && (
                      <div className="flex flex-col gap-1">
                        {canFulfillRequisitions && (
                          <InvButton onClick={() => setFulfilling(row)}>Autorizar y despachar</InvButton>
                        )}
                        <InvButton
                          className="bg-slate-100 text-slate-700"
                          onClick={async () => {
                            try {
                              setMessage(null);
                              await actions.cancelRequisition(row.id);
                            } catch (error) {
                              setMessage(error instanceof Error ? error.message : 'No se pudo cancelar');
                            }
                          }}
                        >
                          Cancelar
                        </InvButton>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p className="text-center text-slate-500 py-8">No hay pedidos en este estado.</p>}
        </div>
      </InvCard>
      {creating && <NewRequisitionModal units={units} products={products} onClose={() => setCreating(false)} />}
      {fulfilling && (
        <FulfillModal
          requisition={fulfilling}
          central={central}
          inventory={inventory}
          companyStock={companyStock}
          companies={myCompanies}
          onClose={() => setFulfilling(null)}
        />
      )}
    </div>
  );
};

const NewRequisitionModal = ({
  units,
  products,
  onClose,
}: {
  units: { id: string; name: string }[];
  products: { id: string; name: string; sku: string }[];
  onClose: () => void;
}) => {
  const { actions } = useInventory();
  const [unitId, setUnitId] = useState(units[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<{ productId: string; name: string; sku: string; quantity: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const matches = search
    ? products.filter((p) => !lines.some((l) => l.productId === p.id) && (`${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase()))).slice(0, 6)
    : [];

  return (
    <InvModal isOpen onClose={onClose} title="Pedido al almacén" maxWidth="max-w-xl">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const unit = units.find((u) => u.id === unitId);
          if (!unit) return;
          try {
            setSaving(true);
            setError(null);
            await actions.createRequisition({
              unitId: unit.id,
              unitName: unit.name,
              notes,
              items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
            });
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo crear el pedido');
          } finally {
            setSaving(false);
          }
        }}
      >
        <InvSelect label="Unidad que pide" value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
          <option value="">Seleccione...</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
        </InvSelect>
        <div className="relative">
          <InvInput label="Agregar producto del catálogo" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre o SKU" />
          {matches.length > 0 && (
            <ul className="absolute z-10 w-full bg-white border rounded-lg shadow mt-1">
              {matches.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={() => {
                      setLines((prev) => [...prev, { productId: product.id, name: product.name, sku: product.sku, quantity: 1 }]);
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
        {lines.map((line) => (
          <div key={line.productId} className="flex items-center gap-2 text-sm">
            <div className="flex-1">
              <p className="font-medium">{line.name}</p>
              <p className="text-xs font-mono text-slate-500">{line.sku}</p>
            </div>
            <input
              type="number"
              min={1}
              value={line.quantity}
              onChange={(e) => setLines((prev) => prev.map((row) => row.productId === line.productId ? { ...row, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } : row))}
              className="w-20 border rounded px-2 py-1 text-right"
            />
            <button type="button" className="text-red-600" onClick={() => setLines((prev) => prev.filter((row) => row.productId !== line.productId))}>Quitar</button>
          </div>
        ))}
        <InvTextarea label="Notas para el almacén" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <InvButton type="button" className="bg-slate-100 text-slate-700" onClick={onClose}>Cancelar</InvButton>
          <InvButton type="submit" disabled={saving || lines.length === 0 || !unitId}>{saving ? 'Enviando...' : 'Enviar pedido'}</InvButton>
        </div>
      </form>
    </InvModal>
  );
};

const FulfillModal = ({
  requisition,
  central,
  inventory,
  companyStock,
  companies,
  onClose,
}: {
  requisition: InvRequisition;
  central: { id: string; name: string }[];
  inventory: { productId: string; warehouseId: string; quantity: number }[];
  companyStock: { productId: string; warehouseId: string; companyId: string; quantity: number }[];
  companies: { id: string; profileName: string }[];
  onClose: () => void;
}) => {
  const { actions } = useInventory();
  const [warehouseId, setWarehouseId] = useState(central[0]?.id || '');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState(requisition.items.map((item) => ({
    itemId: item.id,
    productId: item.productId,
    name: item.productName,
    sku: item.sku,
    requested: item.quantityRequested,
    quantity: item.quantityRequested,
    companyId: '',
  })));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const optionsFor = (productId: string) => {
    const total = inventory.find((row) => row.productId === productId && row.warehouseId === warehouseId)?.quantity || 0;
    const lots = lotsInWarehouse(companyStock, productId, warehouseId);
    const loose = unassignedQuantity(total, lots);
    return { total, lots, loose };
  };

  const summary = useMemo(() => lines.map((line) => ({ ...line, ...optionsFor(line.productId) })), [lines, warehouseId, inventory, companyStock]);

  return (
    <InvModal isOpen onClose={onClose} title={`Despachar ${requisition.code}`} maxWidth="max-w-2xl">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setSaving(true);
            setError(null);
            await actions.fulfillRequisition({
              requisitionId: requisition.id,
              sourceWarehouseId: warehouseId,
              note,
              lines: lines.map((line) => ({
                itemId: line.itemId,
                quantity: line.quantity,
                companyId: line.companyId || undefined,
              })),
            });
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo despachar');
          } finally {
            setSaving(false);
          }
        }}
      >
        <p className="text-sm text-slate-600">
          Unidad: <strong>{requisition.unitName}</strong>. El despacho mueve el stock del almacén elegido al almacén de la unidad y conserva la empresa que lo adquirió.
        </p>
        <InvSelect label="Almacén de origen" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
          {central.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
        </InvSelect>
        {summary.map((line) => (
          <div key={line.itemId} className="border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex justify-between gap-2 text-sm">
              <div>
                <p className="font-medium">{line.name}</p>
                <p className="text-xs font-mono text-slate-500">{line.sku} · pedido {line.requested} · en origen {line.total}</p>
              </div>
              <input
                type="number"
                min={0}
                max={line.requested}
                value={line.quantity}
                onChange={(e) => setLines((prev) => prev.map((row) => row.itemId === line.itemId ? { ...row, quantity: Math.max(0, Math.min(line.requested, parseInt(e.target.value, 10) || 0)) } : row))}
                className="w-20 border rounded px-2 py-1 text-right"
              />
            </div>
            <select
              value={line.companyId}
              onChange={(e) => setLines((prev) => prev.map((row) => row.itemId === line.itemId ? { ...row, companyId: e.target.value } : row))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">{line.loose > 0 ? `Sin empresa (stock antiguo: ${line.loose})` : 'Elija empresa adquiriente'}</option>
              {line.lots.map((lot) => (
                <option key={lot.companyId} value={lot.companyId}>
                  {companyLabel(companies as { id: string; profileName: string }[], lot.companyId)} · {lot.quantity} disp.
                </option>
              ))}
            </select>
          </div>
        ))}
        <InvTextarea label="Nota de autorización" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-between gap-2">
          <InvButton
            type="button"
            className="bg-red-50 text-red-700"
            disabled={saving}
            onClick={async () => {
              const reason = note.trim() || window.prompt('Motivo del rechazo') || '';
              if (!reason.trim()) return;
              try {
                setSaving(true);
                await actions.rejectRequisition(requisition.id, reason.trim());
                onClose();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'No se pudo rechazar');
                setSaving(false);
              }
            }}
          >
            Rechazar
          </InvButton>
          <div className="flex gap-2">
            <InvButton type="button" className="bg-slate-100 text-slate-700" onClick={onClose}>Cerrar</InvButton>
            <InvButton type="submit" disabled={saving || !warehouseId}>{saving ? 'Despachando...' : 'Autorizar y despachar'}</InvButton>
          </div>
        </div>
      </form>
    </InvModal>
  );
};
