import React, { useMemo, useState } from 'react';
import { MinusCircle } from 'lucide-react';
import { useInventory } from './InventoryContext';
import { InvButton, InvCard, InvInput, InvSelect, InvTextarea } from './InventoryUi';
import { INV_CONSUMPTION_REASON_LABELS, type InvConsumptionReason, type InvProduct } from '../../types';

export const InventoryConsumptionView = () => {
  const { products, inventory, permittedWarehouses, units, canEdit, actions } = useInventory();
  const [warehouseId, setWarehouseId] = useState('');
  const [reason, setReason] = useState<InvConsumptionReason>('ENTREGA_PERSONAL');
  const [recipient, setRecipient] = useState('');
  const [details, setDetails] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [items, setItems] = useState<{ product: InvProduct; quantity: number; maxQuantity: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedWarehouse = permittedWarehouses.find((w) => w.id === warehouseId);
  const unitWorkers = units.find((u) => u.id === selectedWarehouse?.unitId)?.workers || [];

  const stockInWarehouse = useMemo(() => {
    if (!warehouseId) return [];
    return products
      .map((p) => {
        const qty = inventory.find((i) => i.productId === p.id && i.warehouseId === warehouseId)?.quantity || 0;
        return { product: p, quantity: qty };
      })
      .filter((row) => row.quantity > 0);
  }, [warehouseId, products, inventory]);

  const results = searchTerm
    ? stockInWarehouse
        .filter(
          (row) =>
            !items.some((i) => i.product.id === row.product.id) &&
            (row.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              row.product.sku.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        .slice(0, 6)
    : [];

  const unitWarehouses = permittedWarehouses.filter((w) => w.kind === 'UNIT');
  const centralWarehouses = permittedWarehouses.filter((w) => w.kind !== 'UNIT');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId || items.length === 0) {
      setMessage('Seleccione un almacén y al menos un producto.');
      return;
    }
    if (reason === 'ENTREGA_PERSONAL' && !recipient.trim()) {
      setMessage('Indique a quién se entrega (trabajador o destinatario).');
      return;
    }
    try {
      setSaving(true);
      setMessage(null);
      await actions.consumeStock({
        warehouseId,
        items: items.filter((i) => i.quantity > 0).map((i) => ({ productId: i.product.id, quantity: i.quantity })),
        reason,
        recipient: recipient.trim() || undefined,
        details,
      });
      setItems([]);
      setRecipient('');
      setDetails('');
      setSearchTerm('');
      setMessage('Descarga registrada. El stock del almacén se actualizó.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo registrar la descarga');
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    return <p className="text-slate-500">No tiene permiso para descargar stock.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Consumo y entregas</h1>
        <p className="text-slate-500 text-sm">
          Descargue stock que ya no permanece en almacén: entrega de uniformes a personal, consumo en servicio, merma o baja.
          El flujo típico es central → almacén de unidad → descarga aquí.
        </p>
      </div>
      <InvCard>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InvSelect label="Almacén de origen (de donde se descarga)" value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setItems([]); setRecipient(''); }} required>
              <option value="">Seleccione...</option>
              {unitWarehouses.length > 0 && (
                <optgroup label="Almacenes de unidad">
                  {unitWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}{w.unitName ? ` · ${w.unitName}` : ''}</option>
                  ))}
                </optgroup>
              )}
              {centralWarehouses.length > 0 && (
                <optgroup label="Almacenes centrales">
                  {centralWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </optgroup>
              )}
            </InvSelect>
            <InvSelect label="Motivo de descarga" value={reason} onChange={(e) => setReason(e.target.value as InvConsumptionReason)}>
              {(Object.keys(INV_CONSUMPTION_REASON_LABELS) as InvConsumptionReason[]).map((key) => (
                <option key={key} value={key}>{INV_CONSUMPTION_REASON_LABELS[key]}</option>
              ))}
            </InvSelect>
          </div>

          {reason === 'ENTREGA_PERSONAL' && (
            <div>
              <InvInput
                label="Entregado a (trabajador o destinatario)"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                list="inv-workers"
                placeholder="Nombre del trabajador"
                required
              />
              {unitWorkers.length > 0 && (
                <datalist id="inv-workers">
                  {unitWorkers.map((worker) => (
                    <option key={worker.id} value={worker.name}>{worker.dni ? `DNI ${worker.dni}` : ''}</option>
                  ))}
                </datalist>
              )}
              {selectedWarehouse?.kind === 'UNIT' && unitWorkers.length === 0 && (
                <p className="text-xs text-slate-500 mt-1">No hay personal cargado en esa unidad; puede escribir el nombre.</p>
              )}
            </div>
          )}

          {warehouseId && (
            <div className="relative">
              <label className="block text-sm font-medium text-slate-600 mb-1">Productos con stock en este almacén</label>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre o SKU..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              />
              {results.length > 0 && (
                <ul className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg mt-1 shadow-lg max-h-48 overflow-y-auto">
                  {results.map((row) => (
                    <li
                      key={row.product.id}
                      className="px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm flex justify-between"
                      onClick={() => {
                        setItems((prev) => [...prev, { product: row.product, quantity: 1, maxQuantity: row.quantity }]);
                        setSearchTerm('');
                      }}
                    >
                      <span>{row.product.name} <span className="font-mono text-slate-500">({row.product.sku})</span></span>
                      <span className="text-slate-500">{row.quantity} disp.</span>
                    </li>
                  ))}
                </ul>
              )}
              {stockInWarehouse.length === 0 && (
                <p className="text-xs text-amber-700 mt-2">Este almacén no tiene stock. Transfiera primero desde el almacén central.</p>
              )}
            </div>
          )}

          {items.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-slate-500 border-b">
                <tr>
                  <th className="text-left py-2">Producto</th>
                  <th className="text-right py-2 w-40">Cantidad a descargar</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.product.id} className="border-b border-slate-100">
                    <td className="py-2">
                      <p className="font-medium">{item.product.name}</p>
                      <p className="text-xs font-mono text-slate-500">{item.product.sku}</p>
                    </td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={1}
                        max={item.maxQuantity}
                        value={item.quantity}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((i) =>
                              i.product.id === item.product.id
                                ? { ...i, quantity: Math.max(1, Math.min(item.maxQuantity, parseInt(e.target.value, 10) || 1)) }
                                : i
                            )
                          )
                        }
                        className="w-24 border rounded px-2 py-1 text-right"
                      />
                      <span className="text-xs text-slate-500 ml-2">/ {item.maxQuantity}</span>
                    </td>
                    <td>
                      <button type="button" className="text-red-600" onClick={() => setItems((prev) => prev.filter((i) => i.product.id !== item.product.id))}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <InvTextarea label="Observaciones" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Ej. entrega de uniforme de verano, talla M" />

          {message && (
            <p className={`text-sm ${message.includes('registrada') ? 'text-green-700' : 'text-amber-800'}`}>{message}</p>
          )}

          <div className="flex justify-end">
            <InvButton type="submit" disabled={saving || !warehouseId || items.length === 0} className="bg-orange-600 hover:bg-orange-700 text-white">
              <MinusCircle size={16} /> {saving ? 'Registrando...' : 'Descargar stock'}
            </InvButton>
          </div>
        </form>
      </InvCard>
    </div>
  );
};
