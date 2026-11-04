import React, { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { stockInventoryService } from '../../services/stockInventoryService';
import { INV_REQUISITION_STATUS_LABELS, type InvProduct, type InvRequisition, type InvRequisitionStatus } from '../../types';

const STATUS_CLASS: Record<InvRequisitionStatus, string> = {
  SOLICITADO: 'bg-amber-50 text-amber-800',
  DESPACHADO: 'bg-green-50 text-green-800',
  PARCIAL: 'bg-blue-50 text-blue-800',
  RECHAZADO: 'bg-red-50 text-red-800',
  CANCELADO: 'bg-slate-100 text-slate-600',
};

interface UnitWarehouseOrdersProps {
  unitId: string;
  unitName: string;
  requestedBy: string;
  requestedByUserId: string;
  canRequest: boolean;
}

export const UnitWarehouseOrders: React.FC<UnitWarehouseOrdersProps> = ({
  unitId,
  unitName,
  requestedBy,
  requestedByUserId,
  canRequest,
}) => {
  const [products, setProducts] = useState<InvProduct[]>([]);
  const [orders, setOrders] = useState<InvRequisition[]>([]);
  const [ready, setReady] = useState(true);
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<{ product: InvProduct; quantity: number }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const data = await stockInventoryService.loadAll();
    setProducts(data.products);
    setOrders(data.requisitions.filter((row) => row.unitId === unitId));
    setReady(data.logisticsReady);
  };

  useEffect(() => {
    void reload().catch((error) => {
      setMessage(error instanceof Error ? error.message : 'No se pudieron cargar los pedidos');
    });
  }, [unitId]);

  const matches = search
    ? products.filter((product) => !lines.some((line) => line.product.id === product.id) && `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
    : [];

  if (!ready) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        Los pedidos al almacén se habilitan al ejecutar <code>migrations/MIGRATION_INVENTORY_LOGISTICS.sql</code> en Supabase.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-4">
      <div>
        <h4 className="font-bold text-slate-800 flex items-center text-sm uppercase tracking-wide">
          <Package size={16} className="mr-2" /> Pedidos al almacén central
        </h4>
        <p className="text-xs text-slate-500 mt-1">
          Pida materiales, equipos o insumos. El administrador de almacén autoriza y los deja en el almacén de esta unidad. Luego se descargan como consumo o entrega.
        </p>
      </div>

      {canRequest && (
        <form
          className="space-y-3 border border-slate-100 rounded-lg p-3 bg-slate-50"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              setSaving(true);
              setMessage(null);
              await stockInventoryService.createRequisition({
                unitId,
                unitName,
                notes,
                requestedBy,
                requestedByUserId,
                items: lines.map((line) => ({ product: line.product, quantity: line.quantity })),
              });
              setLines([]);
              setNotes('');
              setSearch('');
              setMessage('Pedido enviado al almacén.');
              await reload();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'No se pudo enviar el pedido');
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto o SKU del catálogo..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            {matches.length > 0 && (
              <ul className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg mt-1 shadow-lg">
                {matches.map((product) => (
                  <li key={product.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      onClick={() => {
                        setLines((prev) => [...prev, { product, quantity: 1 }]);
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
            <div key={line.product.id} className="flex items-center gap-2 text-sm bg-white rounded-lg px-2 py-1">
              <div className="flex-1">
                <p className="font-medium">{line.product.name}</p>
                <p className="text-xs font-mono text-slate-500">{line.product.sku}</p>
              </div>
              <input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) => setLines((prev) => prev.map((row) => row.product.id === line.product.id ? { ...row, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) } : row))}
                className="w-20 border rounded px-2 py-1 text-right"
              />
              <button type="button" className="text-red-600 text-xs" onClick={() => setLines((prev) => prev.filter((row) => row.product.id !== line.product.id))}>Quitar</button>
            </div>
          ))}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Para qué se necesita (turno, entrega, maquinaria...)"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <div className="flex justify-end">
            <button type="submit" disabled={saving || lines.length === 0} className="bg-blue-600 text-white text-sm font-semibold px-3 py-2 rounded-lg disabled:opacity-50">
              {saving ? 'Enviando...' : 'Enviar pedido'}
            </button>
          </div>
        </form>
      )}

      {message && <p className={`text-sm ${message.includes('enviado') ? 'text-green-700' : 'text-amber-800'}`}>{message}</p>}

      <div className="space-y-2">
        {orders.length === 0 && <p className="text-sm text-slate-400 italic">Esta unidad aún no tiene pedidos al almacén.</p>}
        {orders.map((order) => (
          <div key={order.id} className="border border-slate-200 rounded-lg p-3 text-sm">
            <div className="flex justify-between gap-2">
              <p className="font-mono font-semibold">{order.code}</p>
              <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full ${STATUS_CLASS[order.status]}`}>
                {INV_REQUISITION_STATUS_LABELS[order.status]}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">{new Date(order.createdAt).toLocaleString()} · {order.requestedBy}</p>
            {order.items.map((item) => (
              <p key={item.id || item.sku} className="text-xs text-slate-700 mt-1">
                {item.productName} ({item.sku}) · {item.quantityRequested}
                {item.quantityApproved > 0 ? ` · llegó ${item.quantityApproved}` : ''}
              </p>
            ))}
            {order.status === 'SOLICITADO' && order.requestedByUserId === requestedByUserId && (
              <button
                type="button"
                className="text-xs text-slate-500 mt-2 hover:text-red-600"
                onClick={async () => {
                  try {
                    await stockInventoryService.setRequisitionStatus({
                      requisitionId: order.id,
                      status: 'CANCELADO',
                      decidedBy: requestedBy,
                      note: 'Cancelado por la unidad',
                    });
                    await reload();
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : 'No se pudo cancelar');
                  }
                }}
              >
                Cancelar pedido
              </button>
            )}
            {(order.status === 'DESPACHADO' || order.status === 'PARCIAL') && (
              <p className="text-xs text-indigo-700 mt-2">Ya está en el almacén de la unidad. Descárguelo en Inventario → Consumo / entregas.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
