import { supabase, handleSupabaseError } from './supabase';
import type {
  InvAppSettings,
  InvCompany,
  InvLogEntry,
  InvLogType,
  InvProduct,
  InvPurchaseOrder,
  InvPurchaseOrderItem,
  InvPurchaseOrderStatus,
  InvScheduledPurchase,
  InvStockItem,
  InvSupplier,
  InvWarehouse,
  InvWarehouseAccess,
  InvWarehouseKind,
  InvConsumptionReason,
} from '../types';

const db = (table: string) => supabase.from(table as never);

const DEFAULT_SETTINGS: InvAppSettings = {
  colors: {
    inStock: 'bg-green-50 text-green-700 border-green-200',
    lowStock: 'bg-amber-50 text-amber-700 border-amber-200',
    outOfStock: 'bg-red-50 text-red-700 border-red-200',
  },
  alerts: { defaultLowStockThreshold: 10 },
  purchaseOrderSettings: { prefix: 'OC-OPSFLOW-', nextNumber: 1 },
};

const asArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  return [];
};

const mapProduct = (row: Record<string, unknown>): InvProduct => ({
  id: String(row.id),
  name: String(row.name ?? ''),
  sku: String(row.sku ?? ''),
  category: String(row.category ?? ''),
  price: Number(row.price ?? 0),
  lowStockThreshold: Number(row.low_stock_threshold ?? 0),
  description: String(row.description ?? ''),
  images: asArray(row.images),
});

const mapWarehouse = (row: Record<string, unknown>): InvWarehouse => ({
  id: String(row.id),
  name: String(row.name ?? ''),
  location: String(row.location ?? ''),
  kind: ((row.kind as InvWarehouseKind) === 'UNIT' ? 'UNIT' : 'CENTRAL'),
  unitId: row.unit_id ? String(row.unit_id) : undefined,
  unitName: row.unit_name ? String(row.unit_name) : undefined,
});

const mapLog = (row: Record<string, unknown>): InvLogEntry => ({
  id: String(row.id),
  timestamp: String(row.timestamp ?? new Date().toISOString()),
  productName: String(row.product_name ?? ''),
  sku: String(row.sku ?? ''),
  warehouseName: String(row.warehouse_name ?? ''),
  type: (row.type as InvLogType) || 'AJUSTE',
  quantityChange: Number(row.quantity_change ?? 0),
  newQuantityInWarehouse: Number(row.new_quantity_in_warehouse ?? 0),
  details: String(row.details ?? ''),
  user: String(row.user_name ?? ''),
  transactionId: row.transaction_id ? String(row.transaction_id) : undefined,
  recipient: row.recipient ? String(row.recipient) : undefined,
  consumptionReason: row.consumption_reason ? (row.consumption_reason as InvConsumptionReason) : undefined,
});

const mapCompany = (row: Record<string, unknown>): InvCompany => ({
  id: String(row.id),
  profileName: String(row.profile_name ?? ''),
  details: Array.isArray(row.details) ? (row.details as InvCompany['details']) : [],
});

const mapSupplier = (row: Record<string, unknown>): InvSupplier => ({
  id: String(row.id),
  name: String(row.name ?? ''),
  ruc: String(row.ruc ?? ''),
  address: String(row.address ?? ''),
  contactPerson: String(row.contact_person ?? ''),
  contactEmail: String(row.contact_email ?? ''),
  contactPhone: String(row.contact_phone ?? ''),
});

const mapPO = (row: Record<string, unknown>): InvPurchaseOrder => ({
  id: String(row.id),
  orderNumber: String(row.order_number ?? ''),
  supplierId: String(row.supplier_id ?? ''),
  issuingCompanyId: String(row.issuing_company_id ?? ''),
  destinationWarehouseId: String(row.destination_warehouse_id ?? ''),
  issueDate: String(row.issue_date ?? ''),
  deliveryDate: String(row.delivery_date ?? ''),
  status: (row.status as InvPurchaseOrderStatus) || 'BORRADOR',
  items: Array.isArray(row.items) ? (row.items as InvPurchaseOrderItem[]) : [],
  solicitante: String(row.solicitante ?? ''),
  total: Number(row.total ?? 0),
});

const mapScheduled = (row: Record<string, unknown>): InvScheduledPurchase => ({
  id: String(row.id),
  date: String(row.date ?? ''),
  title: String(row.title ?? ''),
  supplierId: row.supplier_id ? String(row.supplier_id) : undefined,
  notes: String(row.notes ?? ''),
  items: Array.isArray(row.items) ? (row.items as InvScheduledPurchase['items']) : [],
  createdBy: String(row.created_by ?? ''),
});

async function insertLog(entry: Omit<InvLogEntry, 'id'>): Promise<void> {
  const { error } = await db('inv_movements').insert({
    timestamp: entry.timestamp,
    product_name: entry.productName,
    sku: entry.sku,
    warehouse_name: entry.warehouseName,
    type: entry.type,
    quantity_change: entry.quantityChange,
    new_quantity_in_warehouse: entry.newQuantityInWarehouse,
    details: entry.details,
    user_name: entry.user,
    transaction_id: entry.transactionId ?? null,
    recipient: entry.recipient ?? null,
    consumption_reason: entry.consumptionReason ?? null,
  });
  if (error) throw error;
}

async function getStockQuantity(productId: string, warehouseId: string): Promise<number> {
  const { data, error } = await db('inv_stock')
    .select('quantity')
    .eq('product_id', productId)
    .eq('warehouse_id', warehouseId)
    .maybeSingle();
  if (error) throw error;
  return data ? Number((data as { quantity: number }).quantity) : 0;
}

async function upsertStock(productId: string, warehouseId: string, quantity: number): Promise<void> {
  const { error } = await db('inv_stock').upsert(
    {
      product_id: productId,
      warehouse_id: warehouseId,
      quantity: Math.max(0, quantity),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'product_id,warehouse_id' }
  );
  if (error) throw error;
}

export const stockInventoryService = {
  async loadAll(): Promise<{
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
  }> {
    try {
      const [
        productsRes,
        warehousesRes,
        stockRes,
        logsRes,
        settingsRes,
        companiesRes,
        suppliersRes,
        poRes,
        scheduledRes,
        accessRes,
      ] = await Promise.all([
        db('inv_products').select('*').order('name'),
        db('inv_warehouses').select('*').order('name'),
        db('inv_stock').select('*'),
        db('inv_movements').select('*').order('timestamp', { ascending: false }).limit(500),
        db('inv_settings').select('*').eq('id', 1).maybeSingle(),
        db('inv_companies').select('*').order('profile_name'),
        db('inv_suppliers').select('*').order('name'),
        db('inv_purchase_orders').select('*').order('created_at', { ascending: false }),
        db('inv_scheduled_purchases').select('*').order('date'),
        db('inv_warehouse_access').select('*'),
      ]);

      const firstError = [
        productsRes, warehousesRes, stockRes, logsRes, settingsRes,
        companiesRes, suppliersRes, poRes, scheduledRes, accessRes,
      ].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      const settingsRow = settingsRes.data as Record<string, unknown> | null;
      const settings: InvAppSettings = settingsRow
        ? {
            colors: { ...DEFAULT_SETTINGS.colors, ...(settingsRow.colors as InvAppSettings['colors']) },
            alerts: { ...DEFAULT_SETTINGS.alerts, ...(settingsRow.alerts as InvAppSettings['alerts']) },
            purchaseOrderSettings: {
              ...DEFAULT_SETTINGS.purchaseOrderSettings,
              ...(settingsRow.purchase_order_settings as InvAppSettings['purchaseOrderSettings']),
            },
          }
        : DEFAULT_SETTINGS;

      return {
        products: ((productsRes.data as Record<string, unknown>[]) || []).map(mapProduct),
        warehouses: ((warehousesRes.data as Record<string, unknown>[]) || []).map(mapWarehouse),
        inventory: ((stockRes.data as { product_id: string; warehouse_id: string; quantity: number }[]) || []).map((row) => ({
          productId: row.product_id,
          warehouseId: row.warehouse_id,
          quantity: Number(row.quantity ?? 0),
        })),
        logs: ((logsRes.data as Record<string, unknown>[]) || []).map(mapLog),
        settings,
        myCompanies: ((companiesRes.data as Record<string, unknown>[]) || []).map(mapCompany),
        suppliers: ((suppliersRes.data as Record<string, unknown>[]) || []).map(mapSupplier),
        purchaseOrders: ((poRes.data as Record<string, unknown>[]) || []).map(mapPO),
        scheduledPurchases: ((scheduledRes.data as Record<string, unknown>[]) || []).map(mapScheduled),
        warehouseAccess: ((accessRes.data as { user_id: string; warehouse_id: string }[]) || []).map((row) => ({
          userId: row.user_id,
          warehouseId: row.warehouse_id,
        })),
      };
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async createProduct(product: Omit<InvProduct, 'id'>, userName: string): Promise<InvProduct> {
    const { data, error } = await db('inv_products')
      .insert({
        name: product.name,
        sku: product.sku,
        category: product.category,
        price: product.price,
        low_stock_threshold: product.lowStockThreshold,
        description: product.description,
        images: product.images || [],
      })
      .select('*')
      .single();
    if (error) throw error;
    const created = mapProduct(data as Record<string, unknown>);
    await insertLog({
      timestamp: new Date().toISOString(),
      productName: created.name,
      sku: created.sku,
      warehouseName: 'N/A',
      type: 'CREACIÓN',
      quantityChange: 0,
      newQuantityInWarehouse: 0,
      details: 'Producto nuevo añadido al sistema.',
      user: userName,
    });
    return created;
  },

  async bulkCreateProducts(products: Omit<InvProduct, 'id'>[], userName: string): Promise<void> {
    for (const product of products) {
      await this.createProduct({ ...product, images: product.images || [] }, userName);
    }
  },

  async updateProduct(product: InvProduct): Promise<void> {
    const { error } = await db('inv_products')
      .update({
        name: product.name,
        sku: product.sku,
        category: product.category,
        price: product.price,
        low_stock_threshold: product.lowStockThreshold,
        description: product.description,
        images: product.images || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', product.id);
    if (error) throw error;
  },

  async deleteProduct(productId: string): Promise<void> {
    const { error } = await db('inv_products').delete().eq('id', productId);
    if (error) throw error;
  },

  async createWarehouse(warehouse: Omit<InvWarehouse, 'id'>): Promise<InvWarehouse> {
    const { data, error } = await db('inv_warehouses')
      .insert({
        name: warehouse.name,
        location: warehouse.location,
        kind: warehouse.kind || 'CENTRAL',
        unit_id: warehouse.unitId || null,
        unit_name: warehouse.unitName || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapWarehouse(data as Record<string, unknown>);
  },

  async updateWarehouse(warehouse: InvWarehouse): Promise<void> {
    const { error } = await db('inv_warehouses')
      .update({
        name: warehouse.name,
        location: warehouse.location,
        kind: warehouse.kind,
        unit_id: warehouse.unitId || null,
        unit_name: warehouse.unitName || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', warehouse.id);
    if (error) throw error;
  },

  async consumeStock(params: {
    items: { product: InvProduct; quantity: number }[];
    warehouse: InvWarehouse;
    reason: InvConsumptionReason;
    recipient?: string;
    details: string;
    userName: string;
  }): Promise<void> {
    if (params.items.length === 0) throw new Error('Agregue al menos un producto');
    const transactionId = params.items.length > 1 ? crypto.randomUUID() : undefined;
    const timestamp = new Date().toISOString();
    const logType: InvLogType = params.reason === 'ENTREGA_PERSONAL' ? 'ENTREGA' : 'CONSUMO';
    const reasonLabel =
      params.reason === 'ENTREGA_PERSONAL' ? 'Entrega a personal'
      : params.reason === 'USO_INTERNO' ? 'Uso interno'
      : params.reason === 'MERMA' ? 'Merma'
      : 'Baja';

    for (const item of params.items) {
      if (item.quantity <= 0) continue;
      const current = await getStockQuantity(item.product.id, params.warehouse.id);
      if (current < item.quantity) {
        throw new Error(`Stock insuficiente de ${item.product.name} en ${params.warehouse.name} (disponible: ${current})`);
      }
      const next = current - item.quantity;
      await upsertStock(item.product.id, params.warehouse.id, next);
      const recipientPart = params.recipient ? ` Destinatario: ${params.recipient}.` : '';
      await insertLog({
        timestamp,
        productName: item.product.name,
        sku: item.product.sku,
        warehouseName: params.warehouse.name,
        type: logType,
        quantityChange: -item.quantity,
        newQuantityInWarehouse: next,
        details: `${reasonLabel} desde ${params.warehouse.name}.${recipientPart} ${params.details}`.trim(),
        user: params.userName,
        transactionId,
        recipient: params.recipient,
        consumptionReason: params.reason,
      });
    }
  },

  async adjustStock(params: {
    product: InvProduct;
    warehouse: InvWarehouse;
    quantityChange: number;
    type: InvLogType;
    details: string;
    userName: string;
  }): Promise<void> {
    const current = await getStockQuantity(params.product.id, params.warehouse.id);
    const next = Math.max(0, current + params.quantityChange);
    await upsertStock(params.product.id, params.warehouse.id, next);
    await insertLog({
      timestamp: new Date().toISOString(),
      productName: params.product.name,
      sku: params.product.sku,
      warehouseName: params.warehouse.name,
      type: params.type,
      quantityChange: params.quantityChange,
      newQuantityInWarehouse: next,
      details: params.details,
      user: params.userName,
    });
  },

  async transferStock(params: {
    product: InvProduct;
    fromWarehouse: InvWarehouse;
    toWarehouse: InvWarehouse;
    quantity: number;
    details: string;
    userName: string;
    transactionId?: string;
  }): Promise<void> {
    const fromQty = await getStockQuantity(params.product.id, params.fromWarehouse.id);
    if (fromQty < params.quantity) {
      throw new Error(`Stock insuficiente de ${params.product.name} en ${params.fromWarehouse.name}`);
    }
    const toQty = await getStockQuantity(params.product.id, params.toWarehouse.id);
    await upsertStock(params.product.id, params.fromWarehouse.id, fromQty - params.quantity);
    await upsertStock(params.product.id, params.toWarehouse.id, toQty + params.quantity);
    const timestamp = new Date().toISOString();
    await insertLog({
      timestamp,
      productName: params.product.name,
      sku: params.product.sku,
      warehouseName: params.fromWarehouse.name,
      type: 'SALIDA',
      quantityChange: -params.quantity,
      newQuantityInWarehouse: fromQty - params.quantity,
      details: `Transferencia a ${params.toWarehouse.name}. ${params.details}`,
      user: params.userName,
      transactionId: params.transactionId,
    });
    await insertLog({
      timestamp,
      productName: params.product.name,
      sku: params.product.sku,
      warehouseName: params.toWarehouse.name,
      type: 'ENTRADA',
      quantityChange: params.quantity,
      newQuantityInWarehouse: toQty + params.quantity,
      details: `Transferencia desde ${params.fromWarehouse.name}. ${params.details}`,
      user: params.userName,
      transactionId: params.transactionId,
    });
  },

  async bulkTransfer(params: {
    items: { product: InvProduct; quantity: number }[];
    fromWarehouse: InvWarehouse;
    toWarehouse: InvWarehouse;
    details: string;
    userName: string;
  }): Promise<void> {
    const transactionId = crypto.randomUUID();
    for (const item of params.items) {
      if (item.quantity <= 0) continue;
      await this.transferStock({
        product: item.product,
        fromWarehouse: params.fromWarehouse,
        toWarehouse: params.toWarehouse,
        quantity: item.quantity,
        details: params.details,
        userName: params.userName,
        transactionId,
      });
    }
  },

  async saveSettings(settings: InvAppSettings): Promise<void> {
    const { error } = await db('inv_settings').upsert({
      id: 1,
      colors: settings.colors,
      alerts: settings.alerts,
      purchase_order_settings: settings.purchaseOrderSettings,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },

  async createCompany(company: Omit<InvCompany, 'id'>): Promise<InvCompany> {
    const { data, error } = await db('inv_companies')
      .insert({ profile_name: company.profileName, details: company.details })
      .select('*')
      .single();
    if (error) throw error;
    return mapCompany(data as Record<string, unknown>);
  },

  async updateCompany(company: InvCompany): Promise<void> {
    const { error } = await db('inv_companies')
      .update({
        profile_name: company.profileName,
        details: company.details,
        updated_at: new Date().toISOString(),
      })
      .eq('id', company.id);
    if (error) throw error;
  },

  async deleteCompany(companyId: string): Promise<void> {
    const { error } = await db('inv_companies').delete().eq('id', companyId);
    if (error) throw error;
  },

  async createSupplier(supplier: Omit<InvSupplier, 'id'>): Promise<InvSupplier> {
    const { data, error } = await db('inv_suppliers')
      .insert({
        name: supplier.name,
        ruc: supplier.ruc,
        address: supplier.address,
        contact_person: supplier.contactPerson,
        contact_email: supplier.contactEmail,
        contact_phone: supplier.contactPhone,
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapSupplier(data as Record<string, unknown>);
  },

  async updateSupplier(supplier: InvSupplier): Promise<void> {
    const { error } = await db('inv_suppliers')
      .update({
        name: supplier.name,
        ruc: supplier.ruc,
        address: supplier.address,
        contact_person: supplier.contactPerson,
        contact_email: supplier.contactEmail,
        contact_phone: supplier.contactPhone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', supplier.id);
    if (error) throw error;
  },

  async createPurchaseOrder(params: {
    purchaseOrderData: Omit<InvPurchaseOrder, 'id' | 'orderNumber' | 'total' | 'status' | 'solicitante'>;
    settings: InvAppSettings;
    solicitante: string;
  }): Promise<InvPurchaseOrder> {
    const { prefix, nextNumber } = params.settings.purchaseOrderSettings;
    const orderNumber = `${prefix}${String(nextNumber).padStart(6, '0')}`;
    const total = params.purchaseOrderData.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const { data, error } = await db('inv_purchase_orders')
      .insert({
        order_number: orderNumber,
        supplier_id: params.purchaseOrderData.supplierId,
        issuing_company_id: params.purchaseOrderData.issuingCompanyId,
        destination_warehouse_id: params.purchaseOrderData.destinationWarehouseId,
        issue_date: params.purchaseOrderData.issueDate,
        delivery_date: params.purchaseOrderData.deliveryDate,
        status: 'BORRADOR',
        items: params.purchaseOrderData.items,
        solicitante: params.solicitante,
        total,
      })
      .select('*')
      .single();
    if (error) throw error;
    await this.saveSettings({
      ...params.settings,
      purchaseOrderSettings: { ...params.settings.purchaseOrderSettings, nextNumber: nextNumber + 1 },
    });
    return mapPO(data as Record<string, unknown>);
  },

  async updatePurchaseOrderStatus(params: {
    purchaseOrder: InvPurchaseOrder;
    status: InvPurchaseOrderStatus;
    products: InvProduct[];
    warehouses: InvWarehouse[];
    userName: string;
  }): Promise<void> {
    if (params.status === 'RECIBIDA') {
      const warehouse = params.warehouses.find((w) => w.id === params.purchaseOrder.destinationWarehouseId);
      if (!warehouse) throw new Error('Almacén de destino no encontrado');
      if (params.purchaseOrder.status !== 'EMITIDA') throw new Error('Solo se puede recibir una orden emitida');
      const timestamp = new Date().toISOString();
      for (const item of params.purchaseOrder.items) {
        const product = params.products.find((p) => p.id === item.productId);
        if (!product) continue;
        const current = await getStockQuantity(item.productId, params.purchaseOrder.destinationWarehouseId);
        const next = current + item.quantity;
        await upsertStock(item.productId, params.purchaseOrder.destinationWarehouseId, next);
        await insertLog({
          timestamp,
          productName: product.name,
          sku: product.sku,
          warehouseName: warehouse.name,
          type: 'ENTRADA',
          quantityChange: item.quantity,
          newQuantityInWarehouse: next,
          details: `Recepción de Orden de Compra #${params.purchaseOrder.orderNumber}`,
          user: params.userName,
        });
      }
    }
    const { error } = await db('inv_purchase_orders')
      .update({ status: params.status, updated_at: new Date().toISOString() })
      .eq('id', params.purchaseOrder.id);
    if (error) throw error;
  },

  async createScheduledPurchase(purchase: Omit<InvScheduledPurchase, 'id'>): Promise<InvScheduledPurchase> {
    const { data, error } = await db('inv_scheduled_purchases')
      .insert({
        date: purchase.date,
        title: purchase.title,
        supplier_id: purchase.supplierId || null,
        notes: purchase.notes,
        items: purchase.items,
        created_by: purchase.createdBy,
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapScheduled(data as Record<string, unknown>);
  },

  async updateScheduledPurchase(purchase: InvScheduledPurchase): Promise<void> {
    const { error } = await db('inv_scheduled_purchases')
      .update({
        date: purchase.date,
        title: purchase.title,
        supplier_id: purchase.supplierId || null,
        notes: purchase.notes,
        items: purchase.items,
        created_by: purchase.createdBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', purchase.id);
    if (error) throw error;
  },

  async deleteScheduledPurchase(purchaseId: string): Promise<void> {
    const { error } = await db('inv_scheduled_purchases').delete().eq('id', purchaseId);
    if (error) throw error;
  },

  async setUserWarehouseAccess(userId: string, warehouseIds: string[]): Promise<void> {
    const { error: delError } = await db('inv_warehouse_access').delete().eq('user_id', userId);
    if (delError) throw delError;
    if (warehouseIds.length === 0) return;
    const { error } = await db('inv_warehouse_access').insert(
      warehouseIds.map((warehouseId) => ({ user_id: userId, warehouse_id: warehouseId }))
    );
    if (error) throw error;
  },
};
