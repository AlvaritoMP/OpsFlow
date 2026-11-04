import React, { useMemo, useState } from 'react';
import { useInventory } from './InventoryContext';
import { InvCard } from './InventoryUi';
import { companyLabel, unassignedQuantity } from '../../utils/inventoryLots';

export const InventoryReconciliationView = () => {
  const { products, warehouses, inventory, companyStock, myCompanies, logisticsReady } = useInventory();
  const [companyId, setCompanyId] = useState('');

  const rows = useMemo(() => {
    const named = companyStock
      .filter((row) => row.quantity > 0)
      .map((row) => {
        const product = products.find((p) => p.id === row.productId);
        const warehouse = warehouses.find((w) => w.id === row.warehouseId);
        return {
          key: `${row.companyId}-${row.productId}-${row.warehouseId}`,
          companyId: row.companyId,
          companyName: companyLabel(myCompanies, row.companyId),
          productName: product?.name || 'Producto',
          sku: product?.sku || '',
          warehouseName: warehouse?.name || 'Almacén',
          quantity: row.quantity,
          value: row.quantity * (product?.price || 0),
        };
      });
    const loose = inventory.flatMap((row) => {
      const tagged = companyStock
        .filter((lot) => lot.productId === row.productId && lot.warehouseId === row.warehouseId)
        .reduce((sum, lot) => sum + lot.quantity, 0);
      const quantity = unassignedQuantity(row.quantity, [{ quantity: tagged }]);
      if (quantity <= 0) return [];
      const product = products.find((p) => p.id === row.productId);
      const warehouse = warehouses.find((w) => w.id === row.warehouseId);
      return [{
        key: `none-${row.productId}-${row.warehouseId}`,
        companyId: '',
        companyName: 'Sin empresa (stock anterior)',
        productName: product?.name || 'Producto',
        sku: product?.sku || '',
        warehouseName: warehouse?.name || 'Almacén',
        quantity,
        value: quantity * (product?.price || 0),
      }];
    });
    return [...named, ...loose].sort((a, b) => a.companyName.localeCompare(b.companyName) || a.productName.localeCompare(b.productName));
  }, [companyStock, inventory, products, warehouses, myCompanies]);

  const filtered = companyId === ''
    ? rows
    : rows.filter((row) => (companyId === '__none__' ? row.companyId === '' : row.companyId === companyId));
  const totals = new Map<string, { name: string; quantity: number; value: number }>();
  filtered.forEach((row) => {
    const current = totals.get(row.companyId) || { name: row.companyName, quantity: 0, value: 0 };
    current.quantity += row.quantity;
    current.value += row.value;
    totals.set(row.companyId, current);
  });

  if (!logisticsReady) {
    return (
      <InvCard>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Cuadre por empresa</h1>
        <p className="text-sm text-amber-800">
          Ejecute en Supabase <code>migrations/MIGRATION_INVENTORY_LOGISTICS.sql</code> para separar el stock por empresa adquiriente.
        </p>
      </InvCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cuadre por empresa adquiriente</h1>
          <p className="text-slate-500 text-sm">
            Cada ingreso queda a nombre de la empresa que compró el bien. Traslados y descargos arrastran esa empresa.
          </p>
        </div>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Todas las empresas</option>
          {myCompanies.map((company) => <option key={company.id} value={company.id}>{company.profileName}</option>)}
          <option value="__none__">Sin empresa (stock anterior)</option>
        </select>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {Array.from(totals.entries()).map(([id, total]) => (
          <InvCard key={id || 'none'}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{total.name}</p>
            <p className="text-2xl font-bold text-slate-800">{total.quantity}</p>
            <p className="text-sm text-emerald-700">S/ {total.value.toFixed(2)}</p>
          </InvCard>
        ))}
        {totals.size === 0 && <InvCard><p className="text-slate-500 text-sm">Aún no hay stock para cuadrar.</p></InvCard>}
      </div>
      <InvCard>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3">Empresa</th>
              <th className="p-3">Producto</th>
              <th className="p-3">Almacén</th>
              <th className="p-3 text-right">Cantidad</th>
              <th className="p-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.key} className="border-b border-slate-100">
                <td className="p-3">{row.companyName}</td>
                <td className="p-3">
                  <p className="font-medium">{row.productName}</p>
                  <p className="text-xs font-mono text-slate-500">{row.sku}</p>
                </td>
                <td className="p-3">{row.warehouseName}</td>
                <td className="p-3 text-right font-bold">{row.quantity}</td>
                <td className="p-3 text-right">S/ {row.value.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center text-slate-500 py-8">Sin existencias para este filtro.</p>}
      </InvCard>
    </div>
  );
};
