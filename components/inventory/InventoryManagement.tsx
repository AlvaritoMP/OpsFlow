import React, { useState } from 'react';
import {
  Boxes, CalendarDays, ClipboardList, LayoutDashboard, MinusCircle, Package, Settings, Truck, Users, Warehouse,
} from 'lucide-react';
import { InventoryProvider, useInventory } from './InventoryContext';
import {
  InventoryAccessView,
  InventoryDashboardView,
  InventoryLogView,
  InventoryProductsView,
  InventoryWarehousesView,
} from './InventoryCoreViews';
import { InventorySuppliersView } from './InventoryBulkTransferModal';
import { InventoryPurchaseCalendarView, InventoryPurchaseOrdersView } from './InventoryPurchasing';
import { InventorySettingsView } from './InventorySettingsView';
import { InventoryConsumptionView } from './InventoryConsumptionView';
import type { InventorySectionView, InvProduct, InvUnitOption, User } from '../../types';

interface InventoryManagementProps {
  currentUser: User;
  users: User[];
  units: InvUnitOption[];
  canEdit: boolean;
}

export const InventoryManagement: React.FC<InventoryManagementProps> = ({ currentUser, users, units, canEdit }) => (
  <InventoryProvider currentUser={currentUser} opsflowUsers={users} units={units} canEdit={canEdit}>
    <InventoryShell />
  </InventoryProvider>
);

const InventoryShell = () => {
  const { loading, error, actions, isAdmin, canEdit } = useInventory();
  const [view, setView] = useState<InventorySectionView>('dashboard');
  const [prefillPO, setPrefillPO] = useState<InvProduct[] | null>(null);

  const nav = [
    { id: 'dashboard' as const, label: 'Resumen', icon: LayoutDashboard, show: true },
    { id: 'products' as const, label: 'Productos', icon: Package, show: true },
    { id: 'suppliers' as const, label: 'Proveedores', icon: Truck, show: canEdit },
    { id: 'purchaseOrders' as const, label: 'Órdenes de compra', icon: ClipboardList, show: canEdit },
    { id: 'purchaseCalendar' as const, label: 'Calendario', icon: CalendarDays, show: canEdit },
    { id: 'warehouses' as const, label: 'Almacenes', icon: Warehouse, show: true },
    { id: 'consumption' as const, label: 'Consumo / entregas', icon: MinusCircle, show: canEdit },
    { id: 'log' as const, label: 'Movimientos', icon: Boxes, show: true },
    { id: 'access' as const, label: 'Accesos', icon: Users, show: isAdmin },
    { id: 'settings' as const, label: 'Ajustes', icon: Settings, show: isAdmin || canEdit },
  ].filter((item) => item.show);

  const render = () => {
    switch (view) {
      case 'dashboard':
        return (
          <InventoryDashboardView
            onGenerateSuggestedPO={(products) => {
              setPrefillPO(products);
              setView('purchaseOrders');
            }}
          />
        );
      case 'products':
        return <InventoryProductsView />;
      case 'suppliers':
        return <InventorySuppliersView />;
      case 'purchaseOrders':
        return <InventoryPurchaseOrdersView prefillItems={prefillPO} onPrefillConsumed={() => setPrefillPO(null)} />;
      case 'purchaseCalendar':
        return <InventoryPurchaseCalendarView />;
      case 'warehouses':
        return <InventoryWarehousesView />;
      case 'consumption':
        return <InventoryConsumptionView />;
      case 'log':
        return <InventoryLogView />;
      case 'access':
        return <InventoryAccessView />;
      case 'settings':
        return <InventorySettingsView />;
      default:
        return <InventoryDashboardView onGenerateSuggestedPO={() => undefined} />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Inventario</h1>
          <p className="text-xs text-slate-500">Productos, almacenes, compras y movimientos</p>
        </div>
        <button onClick={() => void actions.reload()} className="text-sm text-blue-600 hover:underline">Actualizar</button>
      </div>
      <div className="flex flex-1 min-h-0">
        <nav className="w-48 shrink-0 border-r border-slate-200 bg-white p-2 overflow-y-auto">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 ${active ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Icon size={16} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {loading && <p className="text-slate-500">Cargando inventario...</p>}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
              {error}. Ejecute en Supabase <code>migrations/MIGRATION_INVENTORY.sql</code> y luego <code>migrations/MIGRATION_INVENTORY_CONSUMPTION.sql</code> si las tablas aún no existen.
            </div>
          )}
          {!loading && render()}
        </div>
      </div>
    </div>
  );
};
