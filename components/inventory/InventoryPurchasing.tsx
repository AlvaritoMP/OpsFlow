import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useInventory } from './InventoryContext';
import { InvButton, InvCard, InvInput, InvModal, InvSelect } from './InventoryUi';
import { InventoryPurchaseOrderDocumentModal } from './InventoryPurchaseOrderDocumentModal';
import type { InvProduct, InvPurchaseOrder, InvPurchaseOrderItem, InvPurchaseOrderStatus, InvScheduledPurchase, InvScheduledPurchaseItem } from '../../types';

export const InventoryPurchaseOrdersView = ({
  prefillItems,
  onPrefillConsumed,
}: {
  prefillItems: InvProduct[] | null;
  onPrefillConsumed: () => void;
}) => {
  const { purchaseOrders, suppliers, canEdit, actions } = useInventory();
  const [modal, setModal] = useState<'add' | 'view' | null>(null);
  const [selected, setSelected] = useState<InvPurchaseOrder | null>(null);

  useEffect(() => {
    if (prefillItems && prefillItems.length > 0) setModal('add');
  }, [prefillItems]);

  const close = () => {
    setModal(null);
    setSelected(null);
    if (prefillItems) onPrefillConsumed();
  };

  const chip = (status: InvPurchaseOrderStatus) => {
    const styles: Record<InvPurchaseOrderStatus, string> = {
      BORRADOR: 'bg-slate-100 text-slate-600',
      EMITIDA: 'bg-blue-50 text-blue-700',
      RECIBIDA: 'bg-green-50 text-green-700',
      CANCELADA: 'bg-red-50 text-red-700',
    };
    return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status]}`}>{status}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">Órdenes de compra</h1>
        {canEdit && <InvButton onClick={() => setModal('add')}><Plus size={16} /> Crear OC</InvButton>}
      </div>
      <InvCard>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr><th className="p-3">N° Orden</th><th className="p-3">Proveedor</th><th className="p-3">Emisión</th><th className="p-3 text-right">Total</th><th className="p-3">Estado</th><th className="p-3">Acciones</th></tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => {
                const supplier = suppliers.find((s) => s.id === po.supplierId);
                return (
                  <tr key={po.id} className="border-b border-slate-100">
                    <td className="p-3 font-mono">{po.orderNumber}</td>
                    <td className="p-3">{supplier?.name || 'N/A'}</td>
                    <td className="p-3">{po.issueDate ? new Date(po.issueDate).toLocaleDateString() : '—'}</td>
                    <td className="p-3 text-right font-semibold">S/ {po.total.toFixed(2)}</td>
                    <td className="p-3">{chip(po.status)}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <InvButton className="bg-slate-100 text-slate-700" onClick={() => { setSelected(po); setModal('view'); }}>Ver</InvButton>
                        {canEdit && po.status === 'BORRADOR' && <InvButton className="bg-green-600 hover:bg-green-700 text-white" onClick={() => actions.updatePurchaseOrderStatus(po.id, 'EMITIDA')}>Emitir</InvButton>}
                        {canEdit && po.status === 'EMITIDA' && (
                          <InvButton
                            className="bg-teal-600 hover:bg-teal-700 text-white"
                            onClick={() => {
                              if (window.confirm(`¿Confirma la recepción de la orden #${po.orderNumber}? Se actualizará el inventario.`)) {
                                void actions.updatePurchaseOrderStatus(po.id, 'RECIBIDA');
                              }
                            }}
                          >
                            Recibir
                          </InvButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {purchaseOrders.length === 0 && <p className="text-center text-slate-500 py-8">No hay órdenes de compra.</p>}
        </div>
      </InvCard>
      {modal === 'add' && <PurchaseOrderFormModal onClose={close} prefillItems={prefillItems || undefined} />}
      {modal === 'view' && selected && <InventoryPurchaseOrderDocumentModal po={selected} onClose={close} />}
    </div>
  );
};

const PurchaseOrderFormModal = ({ onClose, prefillItems }: { onClose: () => void; prefillItems?: InvProduct[] }) => {
  const { suppliers, products, myCompanies, warehouses, actions } = useInventory();
  const [supplierId, setSupplierId] = useState('');
  const [issuingCompanyId, setIssuingCompanyId] = useState(myCompanies[0]?.id || '');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [items, setItems] = useState<InvPurchaseOrderItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (prefillItems?.length) {
      setItems(prefillItems.map((p) => ({ productId: p.id, productName: p.name, sku: p.sku, quantity: 1, price: p.price })));
    }
  }, [prefillItems]);

  const available = products.filter((p) => !items.some((i) => i.productId === p.id));
  const results = searchTerm
    ? available.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 5)
    : [];
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.price, 0);

  return (
    <InvModal isOpen onClose={onClose} title="Crear orden de compra" maxWidth="max-w-4xl">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        if (!supplierId || !issuingCompanyId || !destinationWarehouseId || items.length === 0) {
          alert('Complete empresa, proveedor, almacén y al menos un producto.');
          return;
        }
        await actions.addPurchaseOrder({
          supplierId, issuingCompanyId, destinationWarehouseId,
          issueDate: new Date().toISOString(),
          deliveryDate: deliveryDate || new Date().toISOString(),
          items,
        });
        onClose();
      }}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <InvSelect label="Empresa emisora" value={issuingCompanyId} onChange={(e) => setIssuingCompanyId(e.target.value)} required>
            <option value="">Seleccione...</option>
            {myCompanies.map((c) => <option key={c.id} value={c.id}>{c.profileName}</option>)}
          </InvSelect>
          <InvSelect label="Proveedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            <option value="">Seleccione...</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </InvSelect>
          <InvSelect label="Almacén destino" value={destinationWarehouseId} onChange={(e) => setDestinationWarehouseId(e.target.value)} required>
            <option value="">Seleccione...</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </InvSelect>
          <InvInput label="Fecha de entrega" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </div>
        <div className="relative">
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar producto..." className="w-full border border-slate-300 rounded-lg px-3 py-2" />
          {results.length > 0 && (
            <ul className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-lg">
              {results.map((p) => (
                <li key={p.id} className="px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm" onClick={() => { setItems([...items, { productId: p.id, productName: p.name, sku: p.sku, quantity: 1, price: p.price }]); setSearchTerm(''); }}>
                  {p.name} <span className="font-mono text-slate-500">({p.sku})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {items.map((item) => (
          <div key={item.productId} className="grid grid-cols-12 gap-2 items-center border-b border-slate-100 py-2">
            <div className="col-span-5"><p className="font-medium text-sm">{item.productName}</p><p className="text-xs font-mono text-slate-500">{item.sku}</p></div>
            <input className="col-span-3 border rounded px-2 py-1 text-right" type="number" min={1} value={item.quantity} onChange={(e) => setItems(items.map((i) => i.productId === item.productId ? { ...i, quantity: parseInt(e.target.value, 10) || 0 } : i))} />
            <input className="col-span-3 border rounded px-2 py-1 text-right" type="number" step="0.01" value={item.price} onChange={(e) => setItems(items.map((i) => i.productId === item.productId ? { ...i, price: parseFloat(e.target.value) || 0 } : i))} />
            <button type="button" className="col-span-1 text-red-600" onClick={() => setItems(items.filter((i) => i.productId !== item.productId))}>×</button>
          </div>
        ))}
        <p className="text-right text-2xl font-bold">S/ {subtotal.toFixed(2)}</p>
        <div className="flex justify-end gap-2"><InvButton type="button" className="bg-slate-100 text-slate-700" onClick={onClose}>Cancelar</InvButton><InvButton type="submit">Guardar</InvButton></div>
      </form>
    </InvModal>
  );
};

export const InventoryPurchaseCalendarView = () => {
  const { scheduledPurchases, canEdit } = useInventory();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [form, setForm] = useState<{ date: string; purchase: InvScheduledPurchase | null } | null>(null);
  const [poFrom, setPoFrom] = useState<InvScheduledPurchase | null>(null);

  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const days = useMemo(() => {
    const list: { day: number | null; date: Date | null }[] = [];
    for (let i = 0; i < firstDay.getDay(); i++) list.push({ day: null, date: null });
    for (let i = 1; i <= lastDay.getDate(); i++) list.push({ day: i, date: new Date(currentDate.getFullYear(), currentDate.getMonth(), i) });
    return list;
  }, [currentDate]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, InvScheduledPurchase[]>();
    scheduledPurchases.forEach((p) => {
      if (!map.has(p.date)) map.set(p.date, []);
      map.get(p.date)!.push(p);
    });
    return map;
  }, [scheduledPurchases]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Calendario de compras</h1>
      <InvCard>
        <div className="flex justify-between items-center mb-4">
          <InvButton className="bg-slate-100 text-slate-700" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))}>‹</InvButton>
          <h2 className="text-lg font-bold capitalize">{currentDate.toLocaleString('es-PE', { month: 'long', year: 'numeric' })}</h2>
          <InvButton className="bg-slate-100 text-slate-700" onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))}>›</InvButton>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 mb-1">{['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((d) => <div key={d} className="py-2 font-semibold">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((info, index) => {
            const dateString = info.date?.toISOString().split('T')[0];
            const events = dateString ? eventsByDate.get(dateString) || [] : [];
            return (
              <div
                key={index}
                className={`min-h-[7rem] rounded-lg border p-1.5 ${info.day ? 'bg-slate-50 hover:bg-slate-100 cursor-pointer border-slate-200' : 'border-transparent'}`}
                onClick={() => info.date && canEdit && setForm({ date: info.date.toISOString().split('T')[0], purchase: null })}
              >
                {info.day && (
                  <>
                    <span className="font-bold text-sm">{info.day}</span>
                    <div className="mt-1 space-y-1">
                      {events.map((ev) => (
                        <button key={ev.id} className="w-full text-left bg-blue-100 text-blue-800 p-1 rounded text-[11px]" onClick={(e) => { e.stopPropagation(); setForm({ date: ev.date, purchase: ev }); }}>
                          {ev.title}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </InvCard>
      {form && (
        <ScheduledForm
          date={form.date}
          purchase={form.purchase}
          onClose={() => setForm(null)}
          onGeneratePO={(s) => { setPoFrom(s); setForm(null); }}
        />
      )}
      {poFrom && (
        <InvModal isOpen onClose={() => setPoFrom(null)} title="Generar OC" maxWidth="max-w-md">
          <GeneratePOFromSchedule schedule={poFrom} onClose={() => setPoFrom(null)} />
        </InvModal>
      )}
    </div>
  );
};

const ScheduledForm = ({
  date, purchase, onClose, onGeneratePO,
}: {
  date: string;
  purchase: InvScheduledPurchase | null;
  onClose: () => void;
  onGeneratePO: (s: InvScheduledPurchase) => void;
}) => {
  const { suppliers, products, currentUser, actions } = useInventory();
  const [title, setTitle] = useState(purchase?.title || '');
  const [supplierId, setSupplierId] = useState(purchase?.supplierId || '');
  const [notes, setNotes] = useState(purchase?.notes || '');
  const [items, setItems] = useState<InvScheduledPurchaseItem[]>(purchase?.items || []);
  const [searchTerm, setSearchTerm] = useState('');
  const results = searchTerm
    ? products.filter((p) => !items.some((i) => i.productId === p.id) && (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase()))).slice(0, 5)
    : [];

  return (
    <InvModal isOpen onClose={onClose} title={purchase ? 'Editar compra agendada' : 'Agendar compra'} maxWidth="max-w-2xl">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const payload = { date, title, supplierId: supplierId || undefined, notes, items, createdBy: currentUser.name };
        if (purchase) await actions.updateScheduledPurchase({ ...purchase, ...payload });
        else await actions.addScheduledPurchase(payload);
        onClose();
      }}>
        <p className="font-semibold">{new Date(date + 'T00:00:00').toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <InvInput label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <InvSelect label="Proveedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Ninguno</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </InvSelect>
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Añadir producto..." className="w-full border rounded-lg px-3 py-2" />
        {results.map((p) => (
          <button key={p.id} type="button" className="block w-full text-left text-sm px-2 py-1 hover:bg-slate-50" onClick={() => { setItems([...items, { productId: p.id, productName: p.name, sku: p.sku, quantity: 1 }]); setSearchTerm(''); }}>{p.name}</button>
        ))}
        {items.map((item) => (
          <div key={item.productId} className="flex items-center gap-2">
            <span className="flex-1 text-sm">{item.productName}</span>
            <input type="number" min={1} className="w-20 border rounded px-2 py-1" value={item.quantity} onChange={(e) => setItems(items.map((i) => i.productId === item.productId ? { ...i, quantity: parseInt(e.target.value, 10) || 1 } : i))} />
            <button type="button" className="text-red-600" onClick={() => setItems(items.filter((i) => i.productId !== item.productId))}>×</button>
          </div>
        ))}
        <textarea className="w-full border rounded-lg px-3 py-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas" />
        <div className="flex justify-between">
          <div>
            {purchase && <InvButton type="button" className="bg-red-600 text-white" onClick={async () => { if (window.confirm('¿Eliminar?')) { await actions.deleteScheduledPurchase(purchase.id); onClose(); } }}>Eliminar</InvButton>}
          </div>
          <div className="flex gap-2">
            {purchase && <InvButton type="button" className="bg-green-600 text-white" disabled={!purchase.supplierId || purchase.items.length === 0} onClick={() => onGeneratePO(purchase)}>Generar OC</InvButton>}
            <InvButton type="button" className="bg-slate-100 text-slate-700" onClick={onClose}>Cancelar</InvButton>
            <InvButton type="submit">Guardar</InvButton>
          </div>
        </div>
      </form>
    </InvModal>
  );
};

const GeneratePOFromSchedule = ({ schedule, onClose }: { schedule: InvScheduledPurchase; onClose: () => void }) => {
  const { warehouses, myCompanies, actions } = useInventory();
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [issuingCompanyId, setIssuingCompanyId] = useState(myCompanies[0]?.id || '');
  return (
    <div className="space-y-3">
      <p>Se generará una OC para <strong>{schedule.title}</strong>.</p>
      <InvSelect label="Empresa" value={issuingCompanyId} onChange={(e) => setIssuingCompanyId(e.target.value)}>
        {myCompanies.map((c) => <option key={c.id} value={c.id}>{c.profileName}</option>)}
      </InvSelect>
      <InvSelect label="Almacén" value={destinationWarehouseId} onChange={(e) => setDestinationWarehouseId(e.target.value)}>
        <option value="">Seleccione...</option>
        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </InvSelect>
      <div className="flex justify-end gap-2">
        <InvButton className="bg-slate-100 text-slate-700" onClick={onClose}>Cancelar</InvButton>
        <InvButton disabled={!destinationWarehouseId || !issuingCompanyId || !schedule.supplierId} onClick={async () => {
          await actions.addPurchaseOrder({
            supplierId: schedule.supplierId!,
            issuingCompanyId,
            destinationWarehouseId,
            issueDate: new Date().toISOString(),
            deliveryDate: schedule.date,
            items: schedule.items.map((i) => ({ ...i, price: 0 })),
          });
          await actions.deleteScheduledPurchase(schedule.id);
          onClose();
        }}>Generar</InvButton>
      </div>
    </div>
  );
};
