import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useInventory } from './InventoryContext';
import { InvButton, InvCard, InvInput, InvModal } from './InventoryUi';
import type { InvProduct } from '../../types';

export const InventoryBulkTransferModal = ({ onClose }: { onClose: () => void }) => {
  const { products, warehouses, inventory, actions } = useInventory();
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [details, setDetails] = useState('');
  const [items, setItems] = useState<{ product: InvProduct; quantity: number; maxQuantity: number }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const available = useMemo(() => {
    if (!fromWarehouseId) return [];
    const used = items.map((i) => i.product.id);
    return products.filter((p) => {
      const stock = inventory.find((i) => i.productId === p.id && i.warehouseId === fromWarehouseId);
      return !!stock && stock.quantity > 0 && !used.includes(p.id);
    });
  }, [fromWarehouseId, products, inventory, items]);

  const results = searchTerm
    ? available.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5)
    : [];

  const disabled = items.length === 0 || !fromWarehouseId || !toWarehouseId || fromWarehouseId === toWarehouseId || items.every((i) => i.quantity === 0);

  return (
    <InvModal isOpen onClose={onClose} title="Transferencia múltiple" maxWidth="max-w-3xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Origen</label>
            <select value={fromWarehouseId} onChange={(e) => { setFromWarehouseId(e.target.value); setItems([]); }} className="w-full border border-slate-300 rounded-lg px-3 py-2">
              <option value="">Seleccione...</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Destino</label>
            <select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)} disabled={!fromWarehouseId} className="w-full border border-slate-300 rounded-lg px-3 py-2">
              <option value="">Seleccione...</option>
              {warehouses.filter((w) => w.id !== fromWarehouseId).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        </div>
        {fromWarehouseId && (
          <div className="relative">
            <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar producto..." className="w-full border border-slate-300 rounded-lg px-3 py-2" />
            {results.length > 0 && (
              <ul className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg mt-1 shadow-lg">
                {results.map((p) => (
                  <li
                    key={p.id}
                    className="px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm"
                    onClick={() => {
                      const stock = inventory.find((i) => i.productId === p.id && i.warehouseId === fromWarehouseId);
                      if (!stock) return;
                      setItems((prev) => [...prev, { product: p, quantity: 1, maxQuantity: stock.quantity }]);
                      setSearchTerm('');
                    }}
                  >
                    {p.name} <span className="font-mono text-slate-500">({p.sku})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {items.length > 0 && (
          <table className="w-full text-sm">
            <tbody>
              {items.map((item) => (
                <tr key={item.product.id} className="border-t border-slate-100">
                  <td className="py-2">{item.product.name}<p className="text-xs font-mono text-slate-500">{item.product.sku}</p></td>
                  <td className="py-2">
                    <input type="number" min={0} max={item.maxQuantity} value={item.quantity} onChange={(e) => setItems((prev) => prev.map((i) => i.product.id === item.product.id ? { ...i, quantity: Math.max(0, Math.min(item.maxQuantity, parseInt(e.target.value, 10) || 0)) } : i))} className="w-20 border rounded px-2 py-1 text-right" />
                    <span className="text-xs text-slate-500 ml-2">/ {item.maxQuantity}</span>
                  </td>
                  <td><button className="text-red-600" onClick={() => setItems((prev) => prev.filter((i) => i.product.id !== item.product.id))}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} placeholder="Detalle / razón" className="w-full border border-slate-300 rounded-lg px-3 py-2" />
        <div className="flex justify-end gap-2">
          <InvButton className="bg-slate-100 text-slate-700" onClick={onClose}>Cancelar</InvButton>
          <InvButton
            disabled={disabled}
            onClick={async () => {
              await actions.bulkTransferStock({
                items: items.filter((i) => i.quantity > 0).map((i) => ({ productId: i.product.id, quantity: i.quantity })),
                fromWarehouseId,
                toWarehouseId,
                details: details || `Transferencia de ${items.length} productos.`,
              });
              onClose();
            }}
          >
            Confirmar
          </InvButton>
        </div>
      </div>
    </InvModal>
  );
};

export const InventorySuppliersView = () => {
  const { suppliers, canEdit, actions } = useInventory();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<(typeof suppliers)[0] | null>(null);
  const [form, setForm] = useState({ name: '', ruc: '', address: '', contactPerson: '', contactEmail: '', contactPhone: '' });

  const openForm = (supplier: typeof editing = null) => {
    setEditing(supplier);
    setForm(supplier ? { name: supplier.name, ruc: supplier.ruc, address: supplier.address, contactPerson: supplier.contactPerson, contactEmail: supplier.contactEmail, contactPhone: supplier.contactPhone } : { name: '', ruc: '', address: '', contactPerson: '', contactEmail: '', contactPhone: '' });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">Proveedores</h1>
        {canEdit && <InvButton onClick={() => openForm()}><Plus size={16} /> Añadir</InvButton>}
      </div>
      <InvCard>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500"><tr><th className="p-3">Proveedor</th><th className="p-3">RUC</th><th className="p-3">Contacto</th><th className="p-3">Acciones</th></tr></thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-slate-100">
                <td className="p-3"><p className="font-semibold">{s.name}</p><p className="text-xs text-slate-500">{s.address}</p></td>
                <td className="p-3 font-mono">{s.ruc}</td>
                <td className="p-3"><p>{s.contactPerson}</p><p className="text-xs text-slate-500">{s.contactEmail} · {s.contactPhone}</p></td>
                <td className="p-3">{canEdit && <InvButton className="bg-slate-100 text-slate-700" onClick={() => openForm(s)}>Editar</InvButton>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {suppliers.length === 0 && <p className="text-center text-slate-500 py-8">No hay proveedores.</p>}
      </InvCard>
      {open && (
        <InvModal isOpen onClose={() => setOpen(false)} title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            if (editing) await actions.updateSupplier({ ...editing, ...form });
            else await actions.addSupplier(form);
            setOpen(false);
          }}>
            <InvInput label="Empresa" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <InvInput label="RUC" value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} required />
            <InvInput label="Dirección" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <InvInput label="Contacto" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            <InvInput label="Email" type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
            <InvInput label="Teléfono" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            <div className="flex justify-end gap-2"><InvButton type="button" className="bg-slate-100 text-slate-700" onClick={() => setOpen(false)}>Cancelar</InvButton><InvButton type="submit">Guardar</InvButton></div>
          </form>
        </InvModal>
      )}
    </div>
  );
};
