import React, { useCallback, useEffect, useState } from 'react';
import { stockInventoryService } from '../../services/stockInventoryService';
import { InventoryMonthlyOrders } from './InventoryMonthlyOrders';
import type { InvMonthlyOrder, InvProduct, InvRequisition } from '../../types';

interface WarehouseRequestsDeskProps {
  units: { id: string; name: string }[];
  userName: string;
  canEdit: boolean;
}

export const WarehouseRequestsDesk: React.FC<WarehouseRequestsDeskProps> = ({ units, userName, canEdit }) => {
  const [products, setProducts] = useState<InvProduct[]>([]);
  const [requisitions, setRequisitions] = useState<InvRequisition[]>([]);
  const [monthlyOrders, setMonthlyOrders] = useState<InvMonthlyOrder[]>([]);
  const [plansReady, setPlansReady] = useState(true);
  const [logisticsReady, setLogisticsReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await stockInventoryService.loadAll();
    const allowed = new Set(units.map((unit) => unit.id));
    const mine = data.requisitions.filter((row) => allowed.has(row.unitId));
    const mineIds = new Set(mine.map((row) => row.id));
    setProducts(data.products);
    setRequisitions(mine);
    setMonthlyOrders(data.monthlyOrders.filter((order) => {
      if (order.sourceRequisitionIds.length === 0) {
        return order.extras.every((line) => !line.unitId || allowed.has(line.unitId));
      }
      return order.sourceRequisitionIds.every((id) => mineIds.has(id));
    }));
    setPlansReady(data.plansReady);
    setLogisticsReady(data.logisticsReady);
  }, [units]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reload()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar los pedidos');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pedidos al almacén</h1>
          <p className="text-sm text-slate-500 mt-1">
            Aquí operaciones arma el pedido general del mes: junta los pedidos ya hechos por cada unidad y, si hace falta, agrega ítems puntuales. El almacén lo recibe y lo despacha desde Inventario.
          </p>
        </div>
        {loading && <p className="text-slate-500">Cargando pedidos...</p>}
        {error && <p className="text-sm text-amber-800">{error}</p>}
        {!loading && !logisticsReady && (
          <p className="text-sm text-amber-800">Falta aplicar la migración de pedidos en Supabase.</p>
        )}
        {!loading && logisticsReady && (
          <InventoryMonthlyOrders
            products={products}
            requisitions={requisitions}
            units={units}
            userName={userName}
            canEdit={canEdit}
            plansReady={plansReady}
            monthlyOrders={monthlyOrders}
            startOpen
            onChanged={reload}
          />
        )}
      </div>
    </div>
  );
};
