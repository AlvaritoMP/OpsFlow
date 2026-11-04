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
  InvCompanyStock,
  InvRequisition,
  InvRequisitionItem,
  InvRequisitionStatus,
} from '../types';

const db = (table: string) => supabase.from(table as never);

const PRODUCT_LIST_COLUMNS = 'id,name,sku,category,price,low_stock_threshold,description';

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
  companyId: row.company_id ? String(row.company_id) : undefined,
  companyName: row.company_name ? String(row.company_name) : undefined,
});

export function formatInventoryError(error: unknown, fallback = 'No se pudo completar la operación'): string {
  const err = error as { code?: string; message?: string; details?: string };
  const message = [err?.message, err?.details].filter(Boolean).join(' ');
  if (err?.code === '23505' || /duplicate key/i.test(message)) {
    if (/sku|inv_products/i.test(message)) {
      return 'Ya existe un producto con ese SKU. El código debe ser único: use otro o edite el producto que ya está en el catálogo.';
    }
    return 'Ya existe un registro con esos datos.';
  }
  if (error instanceof Error && error.message) return error.message;
  return message || fallback;
}

function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = `${error.message || ''} ${error.code || ''}`;
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache|Could not find the table/i.test(msg);
}

function isMissingColumn(error: { message?: string; code?: string } | null, column: string): boolean {
  if (!error) return false;
  const msg = error.message || '';
  return error.code === 'PGRST204' || error.code === '42703' || msg.includes(column) || /schema cache/i.test(msg);
}

const LOGISTICS_MIGRATION_HINT =
  'Falta aplicar migrations/MIGRATION_INVENTORY_LOGISTICS.sql en Supabase (empresa adquiriente, stock por empresa y pedidos).';

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
  const base = {
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
  };
  const withCompany = {
    ...base,
    company_id: entry.companyId ?? null,
    company_name: entry.companyName ?? null,
  };
  const { error } = await db('inv_movements').insert(withCompany);
  if (!error) return;
  if (isMissingColumn(error, 'company_id') || isMissingColumn(error, 'company_name')) {
    if (entry.companyId) throw new Error(LOGISTICS_MIGRATION_HINT);
    const retry = await db('inv_movements').insert(base);
    if (retry.error) throw retry.error;
    return;
  }
  throw error;
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

async function listCompanyLots(productId: string, warehouseId: string): Promise<InvCompanyStock[]> {
  const { data, error } = await db('inv_company_stock')
    .select('product_id,warehouse_id,company_id,quantity')
    .eq('product_id', productId)
    .eq('warehouse_id', warehouseId);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return ((data as { product_id: string; warehouse_id: string; company_id: string; quantity: number }[]) || []).map((row) => ({
    productId: row.product_id,
    warehouseId: row.warehouse_id,
    companyId: row.company_id,
    quantity: Number(row.quantity ?? 0),
  }));
}

async function changeCompanyStock(productId: string, warehouseId: string, companyId: string, delta: number): Promise<void> {
  const lots = await listCompanyLots(productId, warehouseId);
  const current = lots.find((lot) => lot.companyId === companyId)?.quantity || 0;
  const next = current + delta;
  if (next < -0.0001) {
    throw new Error('La empresa adquiriente no tiene stock suficiente en ese almacén.');
  }
  if (next <= 0.0001) {
    const { error } = await db('inv_company_stock')
      .delete()
      .eq('product_id', productId)
      .eq('warehouse_id', warehouseId)
      .eq('company_id', companyId);
    if (error) {
      if (isMissingRelation(error)) throw new Error(LOGISTICS_MIGRATION_HINT);
      throw error;
    }
    return;
  }
  const { error } = await db('inv_company_stock').upsert(
    {
      product_id: productId,
      warehouse_id: warehouseId,
      company_id: companyId,
      quantity: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'product_id,warehouse_id,company_id' }
  );
  if (error) {
    if (isMissingRelation(error)) throw new Error(LOGISTICS_MIGRATION_HINT);
    throw error;
  }
}

async function assertExitCovered(
  productId: string,
  warehouseId: string,
  companyId: string | undefined,
  quantity: number,
  warehouseTotal: number
): Promise<void> {
  const lots = await listCompanyLots(productId, warehouseId);
  const tagged = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  if (!companyId) {
    const unassigned = warehouseTotal - tagged;
    if (tagged > 0.0001 && quantity > unassigned + 0.0001) {
      throw new Error('Este stock está asociado a una empresa adquiriente. Indique de qué empresa sale.');
    }
    return;
  }
  const lot = lots.find((row) => row.companyId === companyId)?.quantity || 0;
  if (lot + 0.0001 < quantity) {
    throw new Error(`Stock insuficiente de esa empresa (disponible: ${lot}).`);
  }
}

async function applyStockDelta(params: {
  product: InvProduct;
  warehouse: InvWarehouse;
  delta: number;
  companyId?: string;
  companyName?: string;
  type: InvLogType;
  details: string;
  userName: string;
  transactionId?: string;
  recipient?: string;
  consumptionReason?: InvConsumptionReason;
  inboundRequiresCompany?: boolean;
}): Promise<void> {
  if (params.delta === 0) return;
  if (params.delta > 0 && params.inboundRequiresCompany && !params.companyId) {
    const { count, error } = await db('inv_companies').select('id', { count: 'exact', head: true });
    if (!error && (count || 0) > 0) {
      throw new Error('Indique la empresa que adquirió este ingreso.');
    }
  }
  const current = await getStockQuantity(params.product.id, params.warehouse.id);
  if (current + params.delta < -0.0001) {
    throw new Error(`Stock insuficiente de ${params.product.name} en ${params.warehouse.name} (disponible: ${current})`);
  }
  if (params.delta < 0) {
    await assertExitCovered(params.product.id, params.warehouse.id, params.companyId, Math.abs(params.delta), current);
  }
  const next = Math.max(0, current + params.delta);
  await upsertStock(params.product.id, params.warehouse.id, next);
  if (params.companyId) {
    await changeCompanyStock(params.product.id, params.warehouse.id, params.companyId, params.delta);
  }
  const companyLabel = params.companyName ? ` Empresa adquiriente: ${params.companyName}.` : '';
  await insertLog({
    timestamp: new Date().toISOString(),
    productName: params.product.name,
    sku: params.product.sku,
    warehouseName: params.warehouse.name,
    type: params.type,
    quantityChange: params.delta,
    newQuantityInWarehouse: next,
    details: `${params.details}${companyLabel}`.trim(),
    user: params.userName,
    transactionId: params.transactionId,
    recipient: params.recipient,
    consumptionReason: params.consumptionReason,
    companyId: params.companyId,
    companyName: params.companyName,
  });
}

function mapRequisitionItem(row: Record<string, unknown>): InvRequisitionItem {
  return {
    id: String(row.id),
    productId: row.product_id ? String(row.product_id) : '',
    sku: String(row.sku ?? ''),
    productName: String(row.product_name ?? ''),
    quantityRequested: Number(row.quantity_requested ?? 0),
    quantityApproved: Number(row.quantity_approved ?? 0),
    companyId: row.company_id ? String(row.company_id) : undefined,
    companyName: row.company_name ? String(row.company_name) : undefined,
  };
}

function mapRequisition(row: Record<string, unknown>, items: InvRequisitionItem[]): InvRequisition {
  return {
    id: String(row.id),
    code: String(row.code ?? ''),
    unitId: String(row.unit_id ?? ''),
    unitName: String(row.unit_name ?? ''),
    status: (row.status as InvRequisitionStatus) || 'SOLICITADO',
    notes: String(row.notes ?? ''),
    requestedBy: String(row.requested_by ?? ''),
    requestedByUserId: row.requested_by_user_id ? String(row.requested_by_user_id) : undefined,
    decidedBy: row.decided_by ? String(row.decided_by) : undefined,
    decisionNote: String(row.decision_note ?? ''),
    sourceWarehouseId: row.source_warehouse_id ? String(row.source_warehouse_id) : undefined,
    destinationWarehouseId: row.destination_warehouse_id ? String(row.destination_warehouse_id) : undefined,
    createdAt: String(row.created_at ?? ''),
    decidedAt: row.decided_at ? String(row.decided_at) : undefined,
    items,
  };
}

async function loadLogisticsExtras(): Promise<{
  companyStock: InvCompanyStock[];
  requisitions: InvRequisition[];
  logisticsReady: boolean;
}> {
  const [stockRes, reqRes, itemRes] = await Promise.all([
    db('inv_company_stock').select('*'),
    db('inv_requisitions').select('*').order('created_at', { ascending: false }),
    db('inv_requisition_items').select('*'),
  ]);
  const errors = [stockRes.error, reqRes.error, itemRes.error].filter(Boolean);
  if (errors.some((error) => isMissingRelation(error))) {
    return { companyStock: [], requisitions: [], logisticsReady: false };
  }
  const hard = errors[0];
  if (hard) throw hard;
  const items = ((itemRes.data as Record<string, unknown>[]) || []).map(mapRequisitionItem);
  const byReq = new Map<string, InvRequisitionItem[]>();
  ((itemRes.data as { requisition_id?: string }[]) || []).forEach((row, index) => {
    const key = String(row.requisition_id || '');
    const list = byReq.get(key) || [];
    list.push(items[index]);
    byReq.set(key, list);
  });
  return {
    logisticsReady: true,
    companyStock: ((stockRes.data as { product_id: string; warehouse_id: string; company_id: string; quantity: number }[]) || []).map((row) => ({
      productId: row.product_id,
      warehouseId: row.warehouse_id,
      companyId: row.company_id,
      quantity: Number(row.quantity ?? 0),
    })),
    requisitions: ((reqRes.data as Record<string, unknown>[]) || []).map((row) => mapRequisition(row, byReq.get(String(row.id)) || [])),
  };
}

async function assertUniqueSku(sku: string, exceptId?: string): Promise<string> {
  const normalized = sku.trim();
  if (!normalized) throw new Error('El SKU es obligatorio.');
  const pattern = normalized.replace(/\\/g, '\\\\').replace(/[%_]/g, (char) => `\\${char}`);
  const { data, error } = await db('inv_products').select('id,sku').ilike('sku', pattern).limit(5);
  if (error) throw error;
  const clash = ((data as { id: string; sku: string }[]) || []).find((row) => row.id !== exceptId);
  if (clash) {
    throw new Error(`Ya existe un producto con el SKU "${clash.sku}". Use otro código o edite ese producto.`);
  }
  return normalized;
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
    companyStock: InvCompanyStock[];
    requisitions: InvRequisition[];
    logisticsReady: boolean;
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
        db('inv_products').select(PRODUCT_LIST_COLUMNS).order('name'),
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
        ...(await loadLogisticsExtras()),
      };
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async getProductImages(productId: string): Promise<string[]> {
    const { data, error } = await db('inv_products')
      .select('images')
      .eq('id', productId)
      .maybeSingle();
    if (error) {
      handleSupabaseError(error);
      throw error;
    }
    return asArray((data as { images?: unknown } | null)?.images);
  },

  async createProduct(product: Omit<InvProduct, 'id'>, userName: string): Promise<InvProduct> {
    const name = product.name.trim();
    if (!name) throw new Error('El nombre del producto es obligatorio.');
    const sku = await assertUniqueSku(product.sku);
    const { data, error } = await db('inv_products')
      .insert({
        name,
        sku,
        category: product.category.trim(),
        price: product.price,
        low_stock_threshold: product.lowStockThreshold,
        description: product.description,
        images: product.images || [],
      })
      .select('*')
      .single();
    if (error) throw new Error(formatInventoryError(error, 'No se pudo crear el producto'));
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
    const sku = await assertUniqueSku(product.sku, product.id);
    const { error } = await db('inv_products')
      .update({
        name: product.name.trim(),
        sku,
        category: product.category,
        price: product.price,
        low_stock_threshold: product.lowStockThreshold,
        description: product.description,
        images: product.images || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', product.id);
    if (error) throw new Error(formatInventoryError(error, 'No se pudo actualizar el producto'));
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
    items: { product: InvProduct; quantity: number; companyId?: string; companyName?: string }[];
    warehouse: InvWarehouse;
    reason: InvConsumptionReason;
    recipient?: string;
    details: string;
    userName: string;
  }): Promise<void> {
    if (params.items.length === 0) throw new Error('Agregue al menos un producto');
    const transactionId = params.items.length > 1 ? crypto.randomUUID() : undefined;
    const logType: InvLogType = params.reason === 'ENTREGA_PERSONAL' ? 'ENTREGA' : 'CONSUMO';
    const reasonLabel =
      params.reason === 'ENTREGA_PERSONAL' ? 'Entrega a personal'
      : params.reason === 'USO_INTERNO' ? 'Uso interno'
      : params.reason === 'MERMA' ? 'Merma'
      : 'Baja';

    for (const item of params.items) {
      if (item.quantity <= 0) continue;
      const recipientPart = params.recipient ? ` Destinatario: ${params.recipient}.` : '';
      await applyStockDelta({
        product: item.product,
        warehouse: params.warehouse,
        delta: -item.quantity,
        companyId: item.companyId,
        companyName: item.companyName,
        type: logType,
        details: `${reasonLabel} desde ${params.warehouse.name}.${recipientPart} ${params.details}`.trim(),
        userName: params.userName,
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
    companyId?: string;
    companyName?: string;
  }): Promise<void> {
    await applyStockDelta({
      product: params.product,
      warehouse: params.warehouse,
      delta: params.quantityChange,
      companyId: params.companyId,
      companyName: params.companyName,
      type: params.type,
      details: params.details,
      userName: params.userName,
      inboundRequiresCompany: params.quantityChange > 0,
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
    companyId?: string;
    companyName?: string;
  }): Promise<void> {
    if (params.quantity <= 0) throw new Error('La cantidad debe ser mayor a cero');
    const transactionId = params.transactionId || crypto.randomUUID();
    await applyStockDelta({
      product: params.product,
      warehouse: params.fromWarehouse,
      delta: -params.quantity,
      companyId: params.companyId,
      companyName: params.companyName,
      type: 'SALIDA',
      details: `Transferencia a ${params.toWarehouse.name}. ${params.details}`.trim(),
      userName: params.userName,
      transactionId,
    });
    await applyStockDelta({
      product: params.product,
      warehouse: params.toWarehouse,
      delta: params.quantity,
      companyId: params.companyId,
      companyName: params.companyName,
      type: 'ENTRADA',
      details: `Transferencia desde ${params.fromWarehouse.name}. ${params.details}`.trim(),
      userName: params.userName,
      transactionId,
    });
  },

  async bulkTransfer(params: {
    items: { product: InvProduct; quantity: number; companyId?: string; companyName?: string }[];
    fromWarehouse: InvWarehouse;
    toWarehouse: InvWarehouse;
    details: string;
    userName: string;
    companyId?: string;
    companyName?: string;
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
        companyId: item.companyId || params.companyId,
        companyName: item.companyName || params.companyName,
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
      let companyName = '';
      if (params.purchaseOrder.issuingCompanyId) {
        const { data } = await db('inv_companies')
          .select('profile_name')
          .eq('id', params.purchaseOrder.issuingCompanyId)
          .maybeSingle();
        companyName = String((data as { profile_name?: string } | null)?.profile_name || '');
      } else {
        const { count } = await db('inv_companies').select('id', { count: 'exact', head: true });
        if ((count || 0) > 0) {
          throw new Error('La orden no tiene empresa adquiriente. Asígnela antes de recibir el stock.');
        }
      }
      for (const item of params.purchaseOrder.items) {
        const product = params.products.find((p) => p.id === item.productId);
        if (!product || item.quantity <= 0) continue;
        await applyStockDelta({
          product,
          warehouse,
          delta: item.quantity,
          companyId: params.purchaseOrder.issuingCompanyId || undefined,
          companyName: companyName || undefined,
          type: 'ENTRADA',
          details: `Recepción de Orden de Compra #${params.purchaseOrder.orderNumber}`,
          userName: params.userName,
          inboundRequiresCompany: true,
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

  async ensureUnitWarehouse(unitId: string, unitName: string): Promise<InvWarehouse> {
    const { data, error } = await db('inv_warehouses')
      .select('*')
      .eq('kind', 'UNIT')
      .eq('unit_id', unitId)
      .limit(1);
    if (error) throw error;
    const existing = ((data as Record<string, unknown>[]) || [])[0];
    if (existing) return mapWarehouse(existing);
    return this.createWarehouse({
      name: `Unidad: ${unitName}`,
      location: unitName,
      kind: 'UNIT',
      unitId,
      unitName,
    });
  },

  async createRequisition(params: {
    unitId: string;
    unitName: string;
    notes: string;
    requestedBy: string;
    requestedByUserId?: string;
    items: { product: InvProduct; quantity: number }[];
  }): Promise<InvRequisition> {
    const lines = params.items.filter((item) => item.quantity > 0);
    if (lines.length === 0) throw new Error('Agregue al menos un producto al pedido.');
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const now = new Date();
      const code = `PED-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const { data, error } = await db('inv_requisitions')
        .insert({
          code,
          unit_id: params.unitId,
          unit_name: params.unitName,
          status: 'SOLICITADO',
          notes: params.notes.trim(),
          requested_by: params.requestedBy,
          requested_by_user_id: params.requestedByUserId || null,
        })
        .select('*')
        .single();
      if (error) {
        if (isMissingRelation(error)) throw new Error(LOGISTICS_MIGRATION_HINT);
        if ((error as { code?: string }).code === '23505') {
          lastError = error;
          continue;
        }
        throw error;
      }
      const created = data as Record<string, unknown>;
      const { error: itemError } = await db('inv_requisition_items').insert(
        lines.map((line) => ({
          requisition_id: created.id,
          product_id: line.product.id,
          sku: line.product.sku,
          product_name: line.product.name,
          quantity_requested: line.quantity,
          quantity_approved: 0,
        }))
      );
      if (itemError) throw itemError;
      return mapRequisition(
        created,
        lines.map((line) => ({
          id: '',
          productId: line.product.id,
          sku: line.product.sku,
          productName: line.product.name,
          quantityRequested: line.quantity,
          quantityApproved: 0,
        }))
      );
    }
    throw new Error(formatInventoryError(lastError, 'No se pudo crear el pedido'));
  },

  async setRequisitionStatus(params: {
    requisitionId: string;
    status: InvRequisitionStatus;
    decidedBy: string;
    note: string;
  }): Promise<void> {
    const { data: current, error: readError } = await db('inv_requisitions')
      .select('status')
      .eq('id', params.requisitionId)
      .maybeSingle();
    if (readError) {
      if (isMissingRelation(readError)) throw new Error(LOGISTICS_MIGRATION_HINT);
      throw readError;
    }
    if (!current) throw new Error('Pedido no encontrado');
    if (String((current as { status: string }).status) !== 'SOLICITADO') {
      throw new Error('Este pedido ya fue resuelto.');
    }
    const { error } = await db('inv_requisitions')
      .update({
        status: params.status,
        decided_by: params.decidedBy,
        decision_note: params.note.trim(),
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.requisitionId);
    if (error) throw error;
  },

  async fulfillRequisition(params: {
    requisition: InvRequisition;
    sourceWarehouse: InvWarehouse;
    lines: { itemId: string; product: InvProduct; quantity: number; companyId?: string; companyName?: string }[];
    userName: string;
    note: string;
  }): Promise<void> {
    if (params.requisition.status !== 'SOLICITADO') throw new Error('Este pedido ya fue resuelto.');
    const approved = params.lines.filter((line) => line.quantity > 0);
    if (approved.length === 0) throw new Error('Indique al menos una cantidad a despachar, o rechace el pedido.');
    const destination = await this.ensureUnitWarehouse(params.requisition.unitId, params.requisition.unitName);
    if (destination.id === params.sourceWarehouse.id) {
      throw new Error('El almacén de origen no puede ser el de la misma unidad.');
    }
    const details = `Pedido ${params.requisition.code} · ${params.requisition.unitName}. ${params.note}`.trim();
    for (const line of approved) {
      await this.transferStock({
        product: line.product,
        fromWarehouse: params.sourceWarehouse,
        toWarehouse: destination,
        quantity: line.quantity,
        details,
        userName: params.userName,
        companyId: line.companyId,
        companyName: line.companyName,
      });
      if (line.itemId) {
        const { error: lineError } = await db('inv_requisition_items')
          .update({
            quantity_approved: line.quantity,
            company_id: line.companyId || null,
            company_name: line.companyName || '',
          })
          .eq('id', line.itemId);
        if (lineError) throw lineError;
      }
    }
    const requestedById = new Map(params.requisition.items.map((item) => [item.id, item.quantityRequested]));
    const partial = approved.some((line) => line.quantity + 0.0001 < (requestedById.get(line.itemId) || line.quantity))
      || approved.length < params.requisition.items.length;
    const { error } = await db('inv_requisitions')
      .update({
        status: partial ? 'PARCIAL' : 'DESPACHADO',
        decided_by: params.userName,
        decision_note: params.note.trim(),
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_warehouse_id: params.sourceWarehouse.id,
        destination_warehouse_id: destination.id,
      })
      .eq('id', params.requisition.id)
      .eq('status', 'SOLICITADO');
    if (error) throw error;
  },
};
