import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { stockInventoryService } from '../../services/stockInventoryService';
import type {
  InvAppSettings,
  InvCompany,
  InvLogEntry,
  InvLogType,
  InvProduct,
  InvPurchaseOrder,
  InvPurchaseOrderStatus,
  InvScheduledPurchase,
  InvStockItem,
  InvSupplier,
  InvWarehouse,
  InvWarehouseAccess,
  InvUnitOption,
  InvConsumptionReason,
  User,
} from '../../types';

const DEFAULT_SETTINGS: InvAppSettings = {
  colors: {
    inStock: 'bg-green-50 text-green-700 border-green-200',
    lowStock: 'bg-amber-50 text-amber-700 border-amber-200',
    outOfStock: 'bg-red-50 text-red-700 border-red-200',
  },
  alerts: { defaultLowStockThreshold: 10 },
  purchaseOrderSettings: { prefix: 'OC-OPSFLOW-', nextNumber: 1 },
};

interface InventoryState {
  products: InvProduct[];
  warehouses: InvWarehouse[];
  inventory: InvStockItem[];
  logs: InvLogEntry[];
  settings: InvAppSettings;
  myCompanies: InvCompany[];
  suppliers: InvSupplier[];
  purchaseOrders: InvPurchaseOrder[];
  scheduledPurchases: InvScheduledPurchase[];
  warehouseAccess: InvWarehouseAccess[];
  loading: boolean;
  error: string | null;
}

interface InventoryActions {
  reload: () => Promise<void>;
  addProduct: (product: Omit<InvProduct, 'id'>) => Promise<void>;
  bulkAddProducts: (products: Omit<InvProduct, 'id'>[]) => Promise<void>;
  updateProduct: (product: InvProduct) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  addWarehouse: (warehouse: Omit<InvWarehouse, 'id'>) => Promise<void>;
  updateWarehouse: (warehouse: InvWarehouse) => Promise<void>;
  consumeStock: (payload: {
    warehouseId: string;
    items: { productId: string; quantity: number }[];
    reason: InvConsumptionReason;
    recipient?: string;
    details: string;
  }) => Promise<void>;
  adjustStock: (payload: {
    productId: string;
    warehouseId: string;
    quantityChange: number;
    type: InvLogType;
    details: string;
  }) => Promise<void>;
  transferStock: (payload: {
    productId: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    quantity: number;
    details: string;
  }) => Promise<void>;
  bulkTransferStock: (payload: {
    items: { productId: string; quantity: number }[];
    fromWarehouseId: string;
    toWarehouseId: string;
    details: string;
  }) => Promise<void>;
  updateSettings: (settings: InvAppSettings) => Promise<void>;
  addCompany: (company: Omit<InvCompany, 'id'>) => Promise<void>;
  updateCompany: (company: InvCompany) => Promise<void>;
  deleteCompany: (companyId: string) => Promise<void>;
  addSupplier: (supplier: Omit<InvSupplier, 'id'>) => Promise<void>;
  updateSupplier: (supplier: InvSupplier) => Promise<void>;
  addPurchaseOrder: (purchaseOrderData: Omit<InvPurchaseOrder, 'id' | 'orderNumber' | 'total' | 'status' | 'solicitante'>) => Promise<void>;
  updatePurchaseOrderStatus: (purchaseOrderId: string, status: InvPurchaseOrderStatus) => Promise<void>;
  addScheduledPurchase: (purchase: Omit<InvScheduledPurchase, 'id'>) => Promise<void>;
  updateScheduledPurchase: (purchase: InvScheduledPurchase) => Promise<void>;
  deleteScheduledPurchase: (purchaseId: string) => Promise<void>;
  setUserWarehouseAccess: (userId: string, warehouseIds: string[]) => Promise<void>;
}

interface InventoryContextValue extends InventoryState {
  currentUser: User;
  opsflowUsers: User[];
  units: InvUnitOption[];
  canEdit: boolean;
  isAdmin: boolean;
  permittedWarehouses: InvWarehouse[];
  actions: InventoryActions;
}

const InventoryContext = createContext<InventoryContextValue | undefined>(undefined);

export const InventoryProvider: React.FC<{
  children: React.ReactNode;
  currentUser: User;
  opsflowUsers: User[];
  units: InvUnitOption[];
  canEdit: boolean;
}> = ({ children, currentUser, opsflowUsers, units, canEdit }) => {
  const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'ADMIN';
  const [state, setState] = useState<InventoryState>({
    products: [],
    warehouses: [],
    inventory: [],
    logs: [],
    settings: DEFAULT_SETTINGS,
    myCompanies: [],
    suppliers: [],
    purchaseOrders: [],
    scheduledPurchases: [],
    warehouseAccess: [],
    loading: true,
    error: null,
  });

  const reload = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await stockInventoryService.loadAll();
      setState({ ...data, loading: false, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cargar el inventario';
      setState((prev) => ({ ...prev, loading: false, error: message }));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const permittedWarehouses = useMemo(() => {
    if (isAdmin) return state.warehouses;
    const assigned = state.warehouseAccess.filter((a) => a.userId === currentUser.id).map((a) => a.warehouseId);
    if (assigned.length === 0) return state.warehouses;
    return state.warehouses.filter((w) => assigned.includes(w.id));
  }, [isAdmin, state.warehouses, state.warehouseAccess, currentUser.id]);

  const requireEdit = () => {
    if (!canEdit) throw new Error('No tiene permiso para editar el inventario');
  };

  const actions: InventoryActions = {
    reload,
    addProduct: async (product) => {
      requireEdit();
      await stockInventoryService.createProduct(product, currentUser.name);
      await reload();
    },
    bulkAddProducts: async (products) => {
      requireEdit();
      await stockInventoryService.bulkCreateProducts(products, currentUser.name);
      await reload();
    },
    updateProduct: async (product) => {
      requireEdit();
      await stockInventoryService.updateProduct(product);
      await reload();
    },
    deleteProduct: async (productId) => {
      requireEdit();
      await stockInventoryService.deleteProduct(productId);
      await reload();
    },
    addWarehouse: async (warehouse) => {
      requireEdit();
      await stockInventoryService.createWarehouse(warehouse);
      await reload();
    },
    updateWarehouse: async (warehouse) => {
      requireEdit();
      await stockInventoryService.updateWarehouse(warehouse);
      await reload();
    },
    consumeStock: async (payload) => {
      requireEdit();
      const warehouse = state.warehouses.find((w) => w.id === payload.warehouseId);
      if (!warehouse) throw new Error('Almacén no encontrado');
      const items = payload.items
        .map((item) => ({
          product: state.products.find((p) => p.id === item.productId)!,
          quantity: item.quantity,
        }))
        .filter((item) => item.product && item.quantity > 0);
      await stockInventoryService.consumeStock({
        items,
        warehouse,
        reason: payload.reason,
        recipient: payload.recipient,
        details: payload.details,
        userName: currentUser.name,
      });
      await reload();
    },
    adjustStock: async (payload) => {
      requireEdit();
      const product = state.products.find((p) => p.id === payload.productId);
      const warehouse = state.warehouses.find((w) => w.id === payload.warehouseId);
      if (!product || !warehouse) throw new Error('Producto o almacén no encontrado');
      await stockInventoryService.adjustStock({
        product,
        warehouse,
        quantityChange: payload.quantityChange,
        type: payload.type,
        details: payload.details,
        userName: currentUser.name,
      });
      await reload();
    },
    transferStock: async (payload) => {
      requireEdit();
      const product = state.products.find((p) => p.id === payload.productId);
      const fromWarehouse = state.warehouses.find((w) => w.id === payload.fromWarehouseId);
      const toWarehouse = state.warehouses.find((w) => w.id === payload.toWarehouseId);
      if (!product || !fromWarehouse || !toWarehouse) throw new Error('Producto o almacén no encontrado');
      await stockInventoryService.transferStock({
        product,
        fromWarehouse,
        toWarehouse,
        quantity: payload.quantity,
        details: payload.details,
        userName: currentUser.name,
      });
      await reload();
    },
    bulkTransferStock: async (payload) => {
      requireEdit();
      const fromWarehouse = state.warehouses.find((w) => w.id === payload.fromWarehouseId);
      const toWarehouse = state.warehouses.find((w) => w.id === payload.toWarehouseId);
      if (!fromWarehouse || !toWarehouse) throw new Error('Almacén no encontrado');
      const items = payload.items
        .map((item) => ({
          product: state.products.find((p) => p.id === item.productId)!,
          quantity: item.quantity,
        }))
        .filter((item) => item.product);
      await stockInventoryService.bulkTransfer({
        items,
        fromWarehouse,
        toWarehouse,
        details: payload.details,
        userName: currentUser.name,
      });
      await reload();
    },
    updateSettings: async (settings) => {
      requireEdit();
      await stockInventoryService.saveSettings(settings);
      await reload();
    },
    addCompany: async (company) => {
      requireEdit();
      await stockInventoryService.createCompany(company);
      await reload();
    },
    updateCompany: async (company) => {
      requireEdit();
      await stockInventoryService.updateCompany(company);
      await reload();
    },
    deleteCompany: async (companyId) => {
      requireEdit();
      await stockInventoryService.deleteCompany(companyId);
      await reload();
    },
    addSupplier: async (supplier) => {
      requireEdit();
      await stockInventoryService.createSupplier(supplier);
      await reload();
    },
    updateSupplier: async (supplier) => {
      requireEdit();
      await stockInventoryService.updateSupplier(supplier);
      await reload();
    },
    addPurchaseOrder: async (purchaseOrderData) => {
      requireEdit();
      await stockInventoryService.createPurchaseOrder({
        purchaseOrderData,
        settings: state.settings,
        solicitante: currentUser.name,
      });
      await reload();
    },
    updatePurchaseOrderStatus: async (purchaseOrderId, status) => {
      requireEdit();
      const purchaseOrder = state.purchaseOrders.find((p) => p.id === purchaseOrderId);
      if (!purchaseOrder) throw new Error('Orden no encontrada');
      await stockInventoryService.updatePurchaseOrderStatus({
        purchaseOrder,
        status,
        products: state.products,
        warehouses: state.warehouses,
        userName: currentUser.name,
      });
      await reload();
    },
    addScheduledPurchase: async (purchase) => {
      requireEdit();
      await stockInventoryService.createScheduledPurchase(purchase);
      await reload();
    },
    updateScheduledPurchase: async (purchase) => {
      requireEdit();
      await stockInventoryService.updateScheduledPurchase(purchase);
      await reload();
    },
    deleteScheduledPurchase: async (purchaseId) => {
      requireEdit();
      await stockInventoryService.deleteScheduledPurchase(purchaseId);
      await reload();
    },
    setUserWarehouseAccess: async (userId, warehouseIds) => {
      if (!isAdmin) throw new Error('Solo administradores pueden asignar almacenes');
      await stockInventoryService.setUserWarehouseAccess(userId, warehouseIds);
      await reload();
    },
  };

  const value: InventoryContextValue = {
    ...state,
    currentUser,
    opsflowUsers,
    units,
    canEdit,
    isAdmin,
    permittedWarehouses,
    actions,
  };

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
};

export const useInventory = () => {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory debe usarse dentro de InventoryProvider');
  return ctx;
};
