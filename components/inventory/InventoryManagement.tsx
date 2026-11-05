import React, { useState } from 'react';
import {
  Boxes, CalendarDays, ClipboardList, LayoutDashboard, MinusCircle, Package, Settings, Truck, UserRound, Users, Warehouse,
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
import { InventoryRequisitionsView } from './InventoryRequisitionsView';
import { InventoryReconciliationView } from './InventoryReconciliationView';
import { WorkerAssignmentsPanel } from './WorkerAssignmentsPanel';
import type { InventorySectionView, InvProduct, InvUnitOption, User } from '../../types';

interface InventoryManagementProps {
  currentUser: User;
  users: User[];
  units: InvUnitOption[];
  canEdit: boolean;
}

export const InventoryManagement: React.FC<InventoryManagementProps> = React.memo(({ currentUser, users, units, canEdit }) => (
  <InventoryProvider currentUser={currentUser} opsflowUsers={users} units={units} canEdit={canEdit}>
    <InventoryShell />
  </InventoryProvider>
));

const InventoryAssignmentsView = () => {
  const { products, requisitions, workerAssignments, assignmentsReady, units, canEdit, currentUser, actions } = useInventory();
  const [unitId, setUnitId] = useState('');
  const workers = units.find((unit) => unit.id === unitId)?.workers || [];
  return (
    <div className="space-y-3">
      <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
        <option value="">Todas las unidades</option>
        {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
      </select>
      <WorkerAssignmentsPanel
        unitId={unitId || undefined}
        workers={workers}
        products={products}
        requisitions={requisitions}
        assignments={workerAssignments}
        assignmentsReady={assignmentsReady}
        canEdit={canEdit}
        userName={currentUser.name}
        onChanged={() => actions.reload()}
      />
    </div>
  );
};

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
    { id: 'requisitions' as const, label: 'Pedidos', icon: ClipboardList, show: true },
    { id: 'assignments' as const, label: 'Asignaciones', icon: UserRound, show: true },
    { id: 'consumption' as const, label: 'Consumo / entregas', icon: MinusCircle, show: canEdit },
    { id: 'reconciliation' as const, label: 'Cuadre empresas', icon: Boxes, show: true },
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
      case 'requisitions':
        return <InventoryRequisitionsView />;
      case 'assignments':
        return <InventoryAssignmentsView />;
      case 'reconciliation':
        return <InventoryReconciliationView />;
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
            <div className="mb-4 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm whitespace-pre-line">
              {error}
              {/relation|does not exist|schema cache|PGRST205|42P01/i.test(error) && (
                <>
                  {' '}Ejecute en Supabase <code>migrations/MIGRATION_INVENTORY.sql</code>, luego <code>migrations/MIGRATION_INVENTORY_CONSUMPTION.sql</code>, <code>migrations/MIGRATION_INVENTORY_LOGISTICS.sql</code> y <code>migrations/MIGRATION_INVENTORY_ASSIGNMENTS.sql</code> si las tablas aún no existen.
                </>
              )}
            </div>
          )}
          {!loading && render()}
        </div>
      </div>
    </div>
  );
};
