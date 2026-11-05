import React, { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { stockInventoryService } from '../../services/stockInventoryService';
import { WorkerAssignmentsPanel } from './WorkerAssignmentsPanel';
import {
  INV_REQUISITION_STATUS_LABELS,
  type InvOrderTemplate,
  type InvProduct,
  type InvRequisition,
  type InvRequisitionStatus,
  type InvWorkerAssignment,
} from '../../types';

const STATUS_CLASS: Record<InvRequisitionStatus, string> = {
  SOLICITADO: 'bg-amber-50 text-amber-800',
  DESPACHADO: 'bg-green-50 text-green-800',
  PARCIAL: 'bg-blue-50 text-blue-800',
  RECHAZADO: 'bg-red-50 text-red-800',
  CANCELADO: 'bg-slate-100 text-slate-600',
};

interface Line {
  product: InvProduct;
  quantity: number;
}

interface UnitWarehouseOrdersProps {
  unitId: string;
  unitName: string;
  requestedBy: string;
  requestedByUserId: string;
  canRequest: boolean;
  workers: { id: string; name: string; dni?: string }[];
}

function mergeLines(current: Line[], incoming: Line[]): Line[] {
  const next = current.map((line) => ({ ...line }));
  incoming.forEach((line) => {
    const found = next.find((row) => row.product.id === line.product.id);
    if (found) found.quantity += line.quantity;
    else next.push(line);
  });
  return next;
}

export const UnitWarehouseOrders: React.FC<UnitWarehouseOrdersProps> = ({
  unitId,
  unitName,
  requestedBy,
  requestedByUserId,
  canRequest,
  workers,
}) => {
  const [products, setProducts] = useState<InvProduct[]>([]);
  const [orders, setOrders] = useState<InvRequisition[]>([]);
  const [templates, setTemplates] = useState<InvOrderTemplate[]>([]);
  const [plansReady, setPlansReady] = useState(true);
  const [assignments, setAssignments] = useState<InvWorkerAssignment[]>([]);
  const [assignmentsReady, setAssignmentsReady] = useState(true);
  const [ready, setReady] = useState(true);
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const data = await stockInventoryService.loadAll();
    setProducts(data.products);
    setOrders(data.requisitions.filter((row) => row.unitId === unitId));
    setTemplates(data.orderTemplates.filter((row) => row.unitId === unitId));
    setPlansReady(data.plansReady);
    setAssignments(data.workerAssignments.filter((row) => row.unitId === unitId));
    setAssignmentsReady(data.assignmentsReady);
    setReady(data.logisticsReady);
  };

  useEffect(() => {
    void reload().catch((error) => {
      setMessage(error instanceof Error ? error.message : 'No se pudieron cargar los pedidos');
    });
  }, [unitId]);

  const matches = search
    ? products.filter((product) => !lines.some((line) => line.product.id === product.id) && `${product.name} ${product.sku}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  const linesFromItems = (items: { productId: string; sku: string; productName: string; quantity: number }[]) => {
    const incoming: Line[] = [];
    const missing: string[] = [];
    items.forEach((item) => {
      const product = products.find((row) => row.id === item.productId) || products.find((row) => row.sku === item.sku);
      if (!product) {
        missing.push(item.productName || item.sku);
        return;
      }
      incoming.push({ product, quantity: item.quantity });
    });
    return { incoming, missing };
  };

  const applyItems = (items: { productId: string; sku: string; productName: string; quantity: number }[], label: string) => {
    const { incoming, missing } = linesFromItems(items);
    if (incoming.length === 0) {
      setMessage('No se pudo reutilizar: esos productos ya no están en el catálogo.');
      return;
    }
    setLines((prev) => mergeLines(prev, incoming));
    setMessage(missing.length
      ? `Se cargó ${label}. No se encontró: ${missing.join(', ')}.`
      : `Se cargó ${label}. Revise cantidades y envíe un pedido nuevo.`);
  };

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
          Agregue varios productos a un mismo pedido de esta unidad. El pedido general del mes, juntando varias unidades, se arma en el menú Pedidos al almacén, sin entrar a Inventario.
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
              setMessage('Pedido enviado al almacén. Quedó guardado y puede repetirlo cuando lo necesite.');
              await reload();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'No se pudo enviar el pedido');
            } finally {
              setSaving(false);
            }
          }}
        >
          {plansReady && templates.length > 0 && (
            <label className="block text-sm text-slate-600">
              Usar plantilla
              <select
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                value=""
                onChange={(e) => {
                  const template = templates.find((row) => row.id === e.target.value);
                  if (template) applyItems(template.items, `la plantilla «${template.name}»`);
                }}
              >
                <option value="">Elegir una plantilla guardada...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name} · {template.items.length} ítems</option>
                ))}
              </select>
            </label>
          )}

          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar y agregar varios productos o SKU..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            {matches.length > 0 && (
              <ul className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg mt-1 shadow-lg max-h-52 overflow-y-auto">
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

          {lines.length > 0 && (
            <p className="text-xs font-semibold text-slate-600">Este pedido lleva {lines.length} producto{lines.length === 1 ? '' : 's'}</p>
          )}
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
          <div className="flex flex-col md:flex-row md:items-end gap-2">
            <label className="flex-1 text-xs text-slate-600">
              Nombre de plantilla
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Ej. Dotación mensual de limpieza"
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </label>
            <button
              type="button"
              disabled={lines.length === 0 || !templateName.trim() || saving}
              className="text-sm font-semibold px-3 py-2 rounded-lg border border-slate-300 text-slate-700 disabled:opacity-50"
              onClick={async () => {
                try {
                  setSaving(true);
                  setMessage(null);
                  await stockInventoryService.saveOrderTemplate({
                    unitId,
                    unitName,
                    name: templateName,
                    notes,
                    createdBy: requestedBy,
                    items: lines,
                  });
                  setTemplateName('');
                  setMessage('Plantilla guardada. Puede usarla en el próximo pedido.');
                  await reload();
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : 'No se pudo guardar la plantilla');
                } finally {
                  setSaving(false);
                }
              }}
            >
              Guardar plantilla
            </button>
          </div>
          <div className="flex justify-between gap-2">
            <button type="button" className="text-xs text-slate-500" onClick={() => setLines([])} disabled={lines.length === 0}>Vaciar lista</button>
            <button type="submit" disabled={saving || lines.length === 0} className="bg-blue-600 text-white text-sm font-semibold px-3 py-2 rounded-lg disabled:opacity-50">
              {saving ? 'Enviando...' : `Enviar pedido (${lines.length} ítem${lines.length === 1 ? '' : 's'})`}
            </button>
          </div>
        </form>
      )}

      {message && <p className={`text-sm ${/enviado|guardada|cargó/i.test(message) ? 'text-green-700' : 'text-amber-800'}`}>{message}</p>}

      {canRequest && plansReady && templates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="text-[11px] text-slate-400 hover:text-red-600"
              onClick={async () => {
                try {
                  await stockInventoryService.deleteOrderTemplate(template.id);
                  await reload();
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : 'No se pudo borrar la plantilla');
                }
              }}
            >
              Borrar plantilla «{template.name}»
            </button>
          ))}
        </div>
      )}

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
            <div className="flex gap-3 mt-2">
              {canRequest && (
                <button
                  type="button"
                  className="text-xs text-blue-700 hover:underline"
                  onClick={() => applyItems(order.items.map((item) => ({
                    productId: item.productId,
                    sku: item.sku,
                    productName: item.productName,
                    quantity: item.quantityRequested,
                  })), `el pedido ${order.code}`)}
                >
                  Repetir este pedido
                </button>
              )}
              {order.status === 'SOLICITADO' && order.requestedByUserId === requestedByUserId && (
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-red-600"
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
            </div>
            {(order.status === 'DESPACHADO' || order.status === 'PARCIAL') && (
              <p className="text-xs text-indigo-700 mt-2">
                Ya está en el almacén de la unidad.
                {order.items.some((item) => products.find((product) => product.id === item.productId)?.assignToWorker)
                  ? ' Los equipos asignables se entregan a un trabajador más abajo.'
                  : ' El consumo se descarga en Inventario → Consumo / entregas.'}
              </p>
            )}
          </div>
        ))}
      </div>

      <WorkerAssignmentsPanel
        unitId={unitId}
        workers={workers}
        products={products}
        requisitions={orders}
        assignments={assignments}
        assignmentsReady={assignmentsReady}
        canEdit={canRequest}
        userName={requestedBy}
        onChanged={reload}
      />
    </div>
  );
};
