import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, FileDown, FileUp, Filter, Package, Plus, RefreshCw, Search, SlidersHorizontal, Warehouse as WarehouseIcon, XCircle } from 'lucide-react';
import { useInventory } from './InventoryContext';
import { InvButton, InvCard, InvInput, InvModal, InvSelect, InvTextarea, exportToCsv } from './InventoryUi';
import { InventoryBulkTransferModal } from './InventoryBulkTransferModal';
import { InventoryMovementDocumentModal } from './InventoryMovementDocumentModal';
import { INV_CONSUMPTION_REASON_LABELS, type InvConsumptionReason, type InvLogEntry, type InvLogType, type InvProduct, type InvWarehouse, type User } from '../../types';

export const InventoryDashboardView = ({ onGenerateSuggestedPO }: { onGenerateSuggestedPO: (products: InvProduct[]) => void }) => {
  const { products, inventory, warehouses, logs, isAdmin } = useInventory();
  const productTotals = useMemo(
    () =>
      products.map((p) => ({
        ...p,
        totalQuantity: inventory.filter((i) => i.productId === p.id).reduce((sum, i) => sum + i.quantity, 0),
      })),
    [products, inventory]
  );
  const lowStockItems = productTotals.filter((p) => p.totalQuantity > 0 && p.totalQuantity <= p.lowStockThreshold);
  const outOfStockItems = productTotals.filter((p) => p.totalQuantity === 0);
  const consumedThisMonth = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return logs
      .filter((l) => (l.type === 'CONSUMO' || l.type === 'ENTREGA') && new Date(l.timestamp) >= start)
      .reduce((sum, l) => sum + Math.abs(l.quantityChange), 0);
  }, [logs]);
  const stockByWarehouse = warehouses.map((w) => ({
    ...w,
    total: inventory.filter((i) => i.warehouseId === w.id).reduce((sum, i) => sum + i.quantity, 0),
  }));

  const handleGenerateGeneralReport = () => {
    const totals = new Map(productTotals.map((p) => [p.id, p.totalQuantity]));
    const headers = [
      'SKU', 'Producto', 'Categoría', 'Descripción', 'Precio', 'Umbral', 'Stock Total', 'Almacén', 'Ubicación', 'Cantidad',
    ];
    const data = inventory
      .map((item) => {
        const product = products.find((p) => p.id === item.productId);
        const warehouse = warehouses.find((w) => w.id === item.warehouseId);
        if (!product || !warehouse) return null;
        return [
          product.sku, product.name, product.category, product.description, product.price,
          product.lowStockThreshold, totals.get(product.id) || 0, warehouse.name, warehouse.location, item.quantity,
        ];
      })
      .filter(Boolean) as (string | number)[][];
    exportToCsv('reporte_general_inventario.csv', headers, data);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard de Inventario</h1>
          <p className="text-slate-500 text-sm">Stock, alertas y almacenes</p>
        </div>
        {isAdmin && (
          <InvButton onClick={handleGenerateGeneralReport} className="bg-violet-600 hover:bg-violet-700 text-white">
            <FileDown size={16} /> Reporte general
          </InvButton>
        )}
      </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Productos', value: products.length, icon: <Package size={20} />, tone: 'text-blue-600 bg-blue-50' },
          { label: 'Almacenes', value: warehouses.length, icon: <WarehouseIcon size={20} />, tone: 'text-emerald-600 bg-emerald-50' },
          { label: 'Stock bajo', value: lowStockItems.length, icon: <AlertTriangle size={20} />, tone: 'text-amber-600 bg-amber-50' },
          { label: 'Agotados', value: outOfStockItems.length, icon: <XCircle size={20} />, tone: 'text-red-600 bg-red-50' },
          { label: 'Descargados este mes', value: consumedThisMonth, icon: <XCircle size={20} />, tone: 'text-orange-600 bg-orange-50' },
        ].map((card) => (
          <InvCard key={card.label} className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${card.tone}`}>{card.icon}</div>
            <div>
              <p className="text-slate-500 text-sm">{card.label}</p>
              <p className="text-2xl font-bold text-slate-800">{card.value}</p>
            </div>
          </InvCard>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <InvCard className="lg:col-span-1">
          <h3 className="font-semibold text-slate-800 mb-3">Stock por almacén</h3>
          <ul className="space-y-2">
            {stockByWarehouse.map((w) => (
              <li key={w.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                <div>
                  <p className="font-medium text-slate-800">{w.name}</p>
                  <p className="text-xs text-slate-500">{w.kind === 'UNIT' ? `Unidad${w.unitName ? `: ${w.unitName}` : ''}` : 'Central'} · {w.location}</p>
                </div>
                <span className="font-bold text-slate-800">{w.total.toLocaleString()}</span>
              </li>
            ))}
            {stockByWarehouse.length === 0 && <p className="text-slate-500 text-sm">No hay almacenes.</p>}
          </ul>
        </InvCard>
        <InvCard className="lg:col-span-2">
          <h3 className="font-semibold text-slate-800 mb-3">Alertas</h3>
          {lowStockItems.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-amber-700 mb-2">Stock bajo</h4>
              <ul className="space-y-2">
                {lowStockItems.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex justify-between bg-amber-50 p-3 rounded-lg">
                    <span className="text-slate-700">{p.name} <span className="text-xs text-slate-500">({p.sku})</span></span>
                    <span className="font-bold text-amber-700">{p.totalQuantity}</span>
                  </li>
                ))}
              </ul>
              <InvButton onClick={() => onGenerateSuggestedPO(lowStockItems)} className="w-full mt-3 bg-amber-600 hover:bg-amber-700 text-white">
                Generar OC sugerida
              </InvButton>
            </div>
          )}
          {outOfStockItems.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-red-700 mb-2">Agotados</h4>
              <ul className="space-y-2">
                {outOfStockItems.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex justify-between bg-red-50 p-3 rounded-lg">
                    <span className="text-slate-700">{p.name} <span className="text-xs text-slate-500">({p.sku})</span></span>
                    <span className="font-bold text-red-700">0</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lowStockItems.length === 0 && outOfStockItems.length === 0 && <p className="text-slate-500">No hay alertas de inventario.</p>}
        </InvCard>
      </div>
    </div>
  );
};

const ProductFormModal = ({
  product,
  onClose,
  onSave,
}: {
  product?: InvProduct;
  onClose: () => void;
  onSave: (p: Omit<InvProduct, 'id'>) => void;
}) => {
  const { settings } = useInventory();
  const [formData, setFormData] = useState({
    name: product?.name || '',
    sku: product?.sku || '',
    category: product?.category || '',
    price: product?.price || 0,
    lowStockThreshold: product?.lowStockThreshold || settings.alerts.defaultLowStockThreshold || 0,
    description: product?.description || '',
  });
  const [images, setImages] = useState<string[]>(product?.images || []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, 4 - images.length);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) setImages((prev) => [...prev, String(event.target.result)]);
      };
      reader.readAsDataURL(file as File);
    });
  };

  return (
    <InvModal isOpen onClose={onClose} title={product ? 'Editar producto' : 'Añadir producto'}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...formData, images });
        }}
      >
        <InvInput label="Nombre" name="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
        <InvInput label="SKU" name="sku" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} required />
        <InvInput label="Categoría" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} />
        <InvInput label="Precio" type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })} />
        <InvInput label="Umbral de stock bajo" type="number" value={formData.lowStockThreshold} onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseInt(e.target.value, 10) || 0 })} />
        <InvTextarea label="Descripción" rows={3} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
        <div>
          <p className="text-sm font-medium text-slate-600 mb-2">Imágenes (hasta 4)</p>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {images.map((src, index) => (
              <div key={index} className="relative">
                <img src={src} alt="" className="w-full h-20 object-cover rounded-lg bg-slate-100" />
                <button type="button" onClick={() => setImages(images.filter((_, i) => i !== index))} className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 text-xs">×</button>
              </div>
            ))}
          </div>
          {images.length < 4 && (
            <>
              <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
              <InvButton type="button" onClick={() => fileInputRef.current?.click()} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700">
                Subir imágenes
              </InvButton>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <InvButton onClick={onClose} className="bg-slate-100 hover:bg-slate-200 text-slate-700">Cancelar</InvButton>
          <InvButton type="submit">{product ? 'Guardar' : 'Añadir'}</InvButton>
        </div>
      </form>
    </InvModal>
  );
};

export const InventoryProductsView = () => {
  const { products, inventory, settings, permittedWarehouses, canEdit, actions } = useInventory();
  const [modal, setModal] = useState<'add' | 'edit' | 'detail' | 'adjust' | 'transfer' | 'bulk-transfer' | 'consume' | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<InvProduct | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ category: '', stockStatus: '' });
  const [showFilters, setShowFilters] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const productTotals = useMemo(
    () =>
      products.map((p) => ({
        ...p,
        totalQuantity: inventory.filter((i) => i.productId === p.id).reduce((sum, i) => sum + i.quantity, 0),
      })),
    [products, inventory]
  );

  const filteredProducts = productTotals.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filters.category ? p.category === filters.category : true;
    const matchesStock =
      !filters.stockStatus ||
      (filters.stockStatus === 'inStock' && p.totalQuantity > p.lowStockThreshold) ||
      (filters.stockStatus === 'lowStock' && p.totalQuantity > 0 && p.totalQuantity <= p.lowStockThreshold) ||
      (filters.stockStatus === 'outOfStock' && p.totalQuantity === 0);
    return matchesSearch && matchesCategory && matchesStock;
  });

  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];

  const getStockStatus = (product: InvProduct & { totalQuantity: number }) => {
    if (product.totalQuantity === 0) return { text: 'Agotado', className: settings.colors.outOfStock };
    if (product.totalQuantity <= product.lowStockThreshold) return { text: 'Stock bajo', className: settings.colors.lowStock };
    return { text: 'En stock', className: settings.colors.inStock };
  };

  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const lines = String(e.target?.result || '').split('\n').slice(1);
      const newProducts: Omit<InvProduct, 'id'>[] = [];
      lines.forEach((line) => {
        if (!line.trim()) return;
        const [name, sku, category, priceStr, lowStockThresholdStr, description] = line.split(',');
        const price = parseFloat(priceStr);
        const lowStockThreshold = parseInt(lowStockThresholdStr, 10);
        if (name && sku && !isNaN(price) && !isNaN(lowStockThreshold)) {
          newProducts.push({
            name: name.trim(), sku: sku.trim(), category: (category || '').trim(),
            price, lowStockThreshold, description: description ? description.trim() : '', images: [],
          });
        }
      });
      if (newProducts.length > 0) {
        await actions.bulkAddProducts(newProducts);
        alert(`${newProducts.length} productos importados.`);
      } else {
        alert('No se pudieron importar productos. Revise el CSV (nombre, sku, categoría, precio, umbral, descripción).');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Productos</h1>
          <p className="text-slate-500 text-sm">Catálogo, stock y transferencias</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <InvButton onClick={() => setModal('add')}><Plus size={16} /> Añadir</InvButton>
            <InvButton onClick={() => setModal('bulk-transfer')} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white">
              <ArrowLeftRight size={16} /> Transferencia múltiple
            </InvButton>
          </div>
        )}
      </div>
      <InvCard>
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre o SKU..."
              className="w-full pl-9 bg-white border border-slate-300 rounded-lg px-3 py-2"
            />
          </div>
          <div className="flex gap-2">
            <InvButton onClick={() => setShowFilters(!showFilters)} className="bg-slate-100 hover:bg-slate-200 text-slate-700">
              <Filter size={16} /> Filtros
            </InvButton>
            {canEdit && (
              <>
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
                <InvButton onClick={() => fileInputRef.current?.click()} className="bg-slate-100 hover:bg-slate-200 text-slate-700">
                  <FileUp size={16} /> Importar
                </InvButton>
              </>
            )}
            <InvButton
              onClick={() =>
                exportToCsv(
                  'productos.csv',
                  ['SKU', 'Nombre', 'Categoría', 'Precio', 'Umbral', 'Stock', 'Descripción'],
                  filteredProducts.map((p) => [p.sku, p.name, p.category, p.price, p.lowStockThreshold, p.totalQuantity, p.description])
                )
              }
              className="bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              <FileDown size={16} /> Exportar
            </InvButton>
          </div>
        </div>
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 p-3 bg-slate-50 rounded-lg">
            <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} className="border border-slate-300 rounded-lg px-3 py-2">
              <option value="">Todas las categorías</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filters.stockStatus} onChange={(e) => setFilters((f) => ({ ...f, stockStatus: e.target.value }))} className="border border-slate-300 rounded-lg px-3 py-2">
              <option value="">Todo el stock</option>
              <option value="inStock">En stock</option>
              <option value="lowStock">Stock bajo</option>
              <option value="outOfStock">Agotado</option>
            </select>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="p-3">Producto</th>
                <th className="p-3">Categoría</th>
                <th className="p-3 text-right">Precio</th>
                <th className="p-3 text-center">Stock</th>
                <th className="p-3 text-center">Estado</th>
                {canEdit && <th className="p-3 text-center">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => {
                const status = getStockStatus(p);
                return (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-slate-100 overflow-hidden flex items-center justify-center text-slate-500 font-bold">
                          {p.images?.[0] ? <img src={p.images[0]} alt="" className="w-full h-full object-cover" /> : p.name.charAt(0)}
                        </div>
                        <div>
                          <button className="font-semibold text-slate-800 text-left" onClick={() => { setSelectedProduct(p); setModal('detail'); }}>{p.name}</button>
                          <p className="text-xs text-slate-500 font-mono">{p.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-slate-600">{p.category}</td>
                    <td className="p-3 text-right font-medium">S/ {p.price.toFixed(2)}</td>
                    <td className="p-3 text-center font-bold">{p.totalQuantity}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${status.className}`}>{status.text}</span>
                    </td>
                    {canEdit && (
                      <td className="p-3">
                        <div className="flex justify-center gap-1">
                          <InvButton title="Editar" onClick={() => { setSelectedProduct(p); setModal('edit'); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2"><SlidersHorizontal size={14} /></InvButton>
                          <InvButton title="Ajustar stock" onClick={() => { setSelectedProduct(p); setModal('adjust'); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2"><RefreshCw size={14} /></InvButton>
                          <InvButton title="Transferir" onClick={() => { setSelectedProduct(p); setModal('transfer'); }} className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-2"><ArrowLeftRight size={14} /></InvButton>
                          <InvButton title="Descargar / entregar" onClick={() => { setSelectedProduct(p); setModal('consume'); }} className="bg-orange-50 hover:bg-orange-100 text-orange-700 p-2">↓</InvButton>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredProducts.length === 0 && <p className="text-center text-slate-500 py-8">No hay productos.</p>}
        </div>
      </InvCard>
      {modal === 'add' && <ProductFormModal onClose={() => setModal(null)} onSave={async (p) => { await actions.addProduct(p); setModal(null); }} />}
      {modal === 'edit' && selectedProduct && <ProductFormModal product={selectedProduct} onClose={() => setModal(null)} onSave={async (p) => { await actions.updateProduct({ ...selectedProduct, ...p }); setModal(null); }} />}
      {modal === 'detail' && selectedProduct && <ProductDetailModal product={selectedProduct} onClose={() => setModal(null)} />}
      {modal === 'adjust' && selectedProduct && (
        <StockAdjustModal product={selectedProduct} warehouses={permittedWarehouses} onClose={() => setModal(null)} />
      )}
      {modal === 'transfer' && selectedProduct && (
        <StockTransferModal product={selectedProduct} warehouses={permittedWarehouses} onClose={() => setModal(null)} />
      )}
      {modal === 'bulk-transfer' && <InventoryBulkTransferModal onClose={() => setModal(null)} />}
      {modal === 'consume' && selectedProduct && (
        <StockConsumeModal product={selectedProduct} warehouses={permittedWarehouses} onClose={() => { setModal(null); setSelectedProduct(null); }} />
      )}
    </div>
  );
};

const ProductDetailModal = ({ product, onClose }: { product: InvProduct; onClose: () => void }) => {
  const { inventory, warehouses } = useInventory();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const stockByWarehouse = warehouses
    .map((w) => ({ warehouseName: w.name, quantity: inventory.find((i) => i.productId === product.id && i.warehouseId === w.id)?.quantity || 0 }))
    .filter((item) => item.quantity > 0);
  return (
    <InvModal isOpen onClose={onClose} title={product.name}>
      {product.images?.[0] && (
        <div className="mb-4">
          <img src={product.images[selectedImageIndex]} alt="" className="w-full h-48 object-cover rounded-lg bg-slate-100" />
          {product.images.length > 1 && (
            <div className="flex gap-2 mt-2 justify-center">
              {product.images.map((src, i) => (
                <img key={i} src={src} alt="" onClick={() => setSelectedImageIndex(i)} className={`w-14 h-14 object-cover rounded cursor-pointer border-2 ${selectedImageIndex === i ? 'border-blue-500' : 'border-transparent'}`} />
              ))}
            </div>
          )}
        </div>
      )}
      <p className="text-slate-600 mb-4">{product.description || 'Sin descripción.'}</p>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-slate-500">SKU</p><p className="font-mono">{product.sku}</p></div>
        <div><p className="text-slate-500">Categoría</p><p>{product.category || '—'}</p></div>
        <div><p className="text-slate-500">Precio</p><p className="font-bold text-emerald-700">S/ {product.price.toFixed(2)}</p></div>
        <div><p className="text-slate-500">Umbral</p><p>{product.lowStockThreshold}</p></div>
      </div>
      <h4 className="font-semibold mt-4 pt-4 border-t border-slate-200">Stock por almacén</h4>
      {stockByWarehouse.length === 0 ? <p className="text-slate-500 text-sm mt-2">Sin stock.</p> : (
        <ul className="mt-2 space-y-1">{stockByWarehouse.map((item) => (
          <li key={item.warehouseName} className="flex justify-between text-sm"><span>{item.warehouseName}</span><span className="font-bold">{item.quantity}</span></li>
        ))}</ul>
      )}
    </InvModal>
  );
};

const StockAdjustModal = ({ product, warehouses, onClose }: { product: InvProduct; warehouses: InvWarehouse[]; onClose: () => void }) => {
  const { inventory, actions } = useInventory();
  const [warehouseId, setWarehouseId] = useState('');
  const [quantityChange, setQuantityChange] = useState(0);
  const [type, setType] = useState<InvLogType>('AJUSTE');
  const [details, setDetails] = useState('');
  const currentStock = inventory.find((i) => i.productId === product.id && i.warehouseId === warehouseId)?.quantity || 0;
  return (
    <InvModal isOpen onClose={onClose} title={`Ajustar stock: ${product.name}`}>
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await actions.adjustStock({ productId: product.id, warehouseId, quantityChange, type, details }); onClose(); }}>
        <InvSelect label="Almacén" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
          <option value="">Seleccione...</option>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </InvSelect>
        {warehouseId && <p className="text-xs text-slate-500">Stock actual: <strong>{currentStock}</strong></p>}
        <InvSelect label="Tipo" value={type} onChange={(e) => setType(e.target.value as InvLogType)}>
          <option value="AJUSTE">Ajuste manual</option>
          <option value="ENTRADA">Entrada</option>
          <option value="SALIDA">Salida</option>
        </InvSelect>
        <InvInput label="Cantidad (+/-)" type="number" value={quantityChange} onChange={(e) => setQuantityChange(parseInt(e.target.value, 10) || 0)} required />
        <InvTextarea label="Detalle" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} required />
        {warehouseId && <div className="p-3 bg-slate-50 rounded-lg text-center"><p className="text-xs text-slate-500">Nuevo stock</p><p className="text-2xl font-bold">{Math.max(0, currentStock + quantityChange)}</p></div>}
        <div className="flex justify-end gap-2"><InvButton onClick={onClose} className="bg-slate-100 text-slate-700">Cancelar</InvButton><InvButton type="submit">Confirmar</InvButton></div>
      </form>
    </InvModal>
  );
};

const StockTransferModal = ({ product, warehouses, onClose }: { product: InvProduct; warehouses: InvWarehouse[]; onClose: () => void }) => {
  const { inventory, actions } = useInventory();
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [details, setDetails] = useState('');
  const maxQuantity = inventory.find((i) => i.productId === product.id && i.warehouseId === fromWarehouseId)?.quantity || 0;
  return (
    <InvModal isOpen onClose={onClose} title={`Transferir: ${product.name}`}>
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await actions.transferStock({ productId: product.id, fromWarehouseId, toWarehouseId, quantity, details }); onClose(); }}>
        <InvSelect label="Origen" value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)} required>
          <option value="">Seleccione...</option>
          {warehouses.filter((w) => w.kind !== 'UNIT').length > 0 && (
            <optgroup label="Centrales">
              {warehouses.filter((w) => w.kind !== 'UNIT').map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </optgroup>
          )}
          {warehouses.filter((w) => w.kind === 'UNIT').length > 0 && (
            <optgroup label="Unidades">
              {warehouses.filter((w) => w.kind === 'UNIT').map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </optgroup>
          )}
        </InvSelect>
        {fromWarehouseId && <p className="text-xs text-slate-500">Disponible: <strong>{maxQuantity}</strong></p>}
        <InvSelect label="Destino" value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)} required disabled={!fromWarehouseId}>
          <option value="">Seleccione...</option>
          {warehouses.filter((w) => w.id !== fromWarehouseId && w.kind !== 'UNIT').length > 0 && (
            <optgroup label="Centrales">
              {warehouses.filter((w) => w.id !== fromWarehouseId && w.kind !== 'UNIT').map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </optgroup>
          )}
          {warehouses.filter((w) => w.id !== fromWarehouseId && w.kind === 'UNIT').length > 0 && (
            <optgroup label="Unidades">
              {warehouses.filter((w) => w.id !== fromWarehouseId && w.kind === 'UNIT').map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </optgroup>
          )}
        </InvSelect>
        <InvInput label="Cantidad" type="number" min={1} max={maxQuantity} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(maxQuantity, parseInt(e.target.value, 10) || 1)))} />
        <InvTextarea label="Detalle" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} />
        <div className="flex justify-end gap-2"><InvButton onClick={onClose} className="bg-slate-100 text-slate-700">Cancelar</InvButton><InvButton type="submit" disabled={!fromWarehouseId || !toWarehouseId || quantity > maxQuantity}>Confirmar</InvButton></div>
      </form>
    </InvModal>
  );
};

const StockConsumeModal = ({ product, warehouses, onClose }: { product: InvProduct; warehouses: InvWarehouse[]; onClose: () => void }) => {
  const { inventory, units, actions } = useInventory();
  const [warehouseId, setWarehouseId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<InvConsumptionReason>('ENTREGA_PERSONAL');
  const [recipient, setRecipient] = useState('');
  const [details, setDetails] = useState('');
  const maxQuantity = inventory.find((i) => i.productId === product.id && i.warehouseId === warehouseId)?.quantity || 0;
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);
  const workers = units.find((u) => u.id === selectedWarehouse?.unitId)?.workers || [];

  return (
    <InvModal isOpen onClose={onClose} title={`Descargar: ${product.name}`}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        if (reason === 'ENTREGA_PERSONAL' && !recipient.trim()) {
          alert('Indique a quién se entrega.');
          return;
        }
        await actions.consumeStock({
          warehouseId,
          items: [{ productId: product.id, quantity }],
          reason,
          recipient: recipient.trim() || undefined,
          details,
        });
        onClose();
      }}>
        <p className="text-sm text-slate-500">Esta acción saca el producto del inventario (entrega, consumo, merma o baja). No es un traslado.</p>
        <InvSelect label="Almacén desde el que se descarga" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
          <option value="">Seleccione...</option>
          {warehouses.filter((w) => w.kind === 'UNIT').length > 0 && (
            <optgroup label="Unidades">
              {warehouses.filter((w) => w.kind === 'UNIT').map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </optgroup>
          )}
          {warehouses.filter((w) => w.kind !== 'UNIT').length > 0 && (
            <optgroup label="Centrales">
              {warehouses.filter((w) => w.kind !== 'UNIT').map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </optgroup>
          )}
        </InvSelect>
        {warehouseId && <p className="text-xs text-slate-500">Disponible: <strong>{maxQuantity}</strong></p>}
        <InvSelect label="Motivo" value={reason} onChange={(e) => setReason(e.target.value as InvConsumptionReason)}>
          {(Object.keys(INV_CONSUMPTION_REASON_LABELS) as InvConsumptionReason[]).map((key) => (
            <option key={key} value={key}>{INV_CONSUMPTION_REASON_LABELS[key]}</option>
          ))}
        </InvSelect>
        {reason === 'ENTREGA_PERSONAL' && (
          <>
            <InvInput label="Entregado a" value={recipient} onChange={(e) => setRecipient(e.target.value)} list="inv-product-workers" required />
            {workers.length > 0 && (
              <datalist id="inv-product-workers">
                {workers.map((w) => <option key={w.id} value={w.name} />)}
              </datalist>
            )}
          </>
        )}
        <InvInput label="Cantidad" type="number" min={1} max={maxQuantity} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.min(maxQuantity, parseInt(e.target.value, 10) || 1)))} />
        <InvTextarea label="Observaciones" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} />
        <div className="flex justify-end gap-2">
          <InvButton onClick={onClose} className="bg-slate-100 text-slate-700">Cancelar</InvButton>
          <InvButton type="submit" disabled={!warehouseId || quantity > maxQuantity || maxQuantity <= 0} className="bg-orange-600 hover:bg-orange-700 text-white">Descargar</InvButton>
        </div>
      </form>
    </InvModal>
  );
};

export const InventoryWarehousesView = () => {
  const { warehouses, units, canEdit, actions } = useInventory();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [kind, setKind] = useState<'CENTRAL' | 'UNIT'>('CENTRAL');
  const [unitId, setUnitId] = useState('');
  const [creatingMissing, setCreatingMissing] = useState(false);

  const unitsWithoutWarehouse = units.filter((u) => !warehouses.some((w) => w.kind === 'UNIT' && w.unitId === u.id));

  const createMissingUnitWarehouses = async () => {
    setCreatingMissing(true);
    try {
      for (const unit of unitsWithoutWarehouse) {
        await actions.addWarehouse({
          name: `Unidad: ${unit.name}`,
          location: unit.name,
          kind: 'UNIT',
          unitId: unit.id,
          unitName: unit.name,
        });
      }
    } finally {
      setCreatingMissing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Almacenes</h1>
          <p className="text-slate-500 text-sm">Central para stock propio; de unidad para stock ya enviado a campo, listo para entregar o consumir.</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {unitsWithoutWarehouse.length > 0 && (
              <InvButton className="bg-slate-700 hover:bg-slate-800 text-white" onClick={() => void createMissingUnitWarehouses()} disabled={creatingMissing}>
                Crear almacenes de {unitsWithoutWarehouse.length} unidad{unitsWithoutWarehouse.length === 1 ? '' : 'es'}
              </InvButton>
            )}
            <InvButton onClick={() => setOpen(true)}><Plus size={16} /> Añadir almacén</InvButton>
          </div>
        )}
      </div>
      <InvCard>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="p-3">Nombre</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Unidad OpsFlow</th>
              <th className="p-3">Ubicación</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.map((w) => (
              <tr key={w.id} className="border-b border-slate-100">
                <td className="p-3 font-semibold">{w.name}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${w.kind === 'UNIT' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                    {w.kind === 'UNIT' ? 'Unidad (virtual)' : 'Central'}
                  </span>
                </td>
                <td className="p-3 text-slate-600">{w.kind === 'UNIT' ? (w.unitName || '—') : '—'}</td>
                <td className="p-3 text-slate-600">{w.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {warehouses.length === 0 && <p className="text-center text-slate-500 py-8">No hay almacenes.</p>}
      </InvCard>
      {open && (
        <InvModal isOpen onClose={() => setOpen(false)} title="Nuevo almacén">
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const unit = units.find((u) => u.id === unitId);
            await actions.addWarehouse({
              name,
              location: location || (unit ? unit.name : ''),
              kind,
              unitId: kind === 'UNIT' ? unitId || undefined : undefined,
              unitName: kind === 'UNIT' ? unit?.name : undefined,
            });
            setOpen(false);
            setName('');
            setLocation('');
            setKind('CENTRAL');
            setUnitId('');
          }}>
            <InvSelect label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as 'CENTRAL' | 'UNIT')}>
              <option value="CENTRAL">Almacén central</option>
              <option value="UNIT">Almacén de unidad (virtual)</option>
            </InvSelect>
            {kind === 'UNIT' && (
              <InvSelect label="Unidad OpsFlow" value={unitId} onChange={(e) => {
                const next = e.target.value;
                setUnitId(next);
                const unit = units.find((u) => u.id === next);
                if (unit && !name) setName(`Unidad: ${unit.name}`);
                if (unit && !location) setLocation(unit.name);
              }} required>
                <option value="">Seleccione la unidad...</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </InvSelect>
            )}
            <InvInput label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
            <InvInput label="Ubicación" value={location} onChange={(e) => setLocation(e.target.value)} required={kind === 'CENTRAL'} />
            <div className="flex justify-end gap-2">
              <InvButton onClick={() => setOpen(false)} className="bg-slate-100 text-slate-700">Cancelar</InvButton>
              <InvButton type="submit">Guardar</InvButton>
            </div>
          </form>
        </InvModal>
      )}
    </div>
  );
};

export const InventoryLogView = () => {
  const { logs } = useInventory();
  const [documentToView, setDocumentToView] = useState<{ logEntries: InvLogEntry[]; type: 'CONSTANCIA' | 'GUIA_DESPACHO' | 'GUIA_REMISION' } | null>(null);
  const groupedLogs = useMemo(() => {
    const groups: Record<string, InvLogEntry[]> = {};
    logs.forEach((log) => {
      if (log.transactionId) {
        if (!groups[log.transactionId]) groups[log.transactionId] = [];
        groups[log.transactionId].push(log);
      }
    });
    return groups;
  }, [logs]);
  const rendered = new Set<string>();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Registro de movimientos</h1>
      <InvCard>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="p-3">Fecha</th><th className="p-3">Producto</th><th className="p-3">Almacén</th>
                <th className="p-3">Tipo</th><th className="p-3 text-center">Cambio</th><th className="p-3 text-center">Stock</th>
                <th className="p-3">Detalle</th><th className="p-3">Usuario</th><th className="p-3">Docs</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                if (rendered.has(log.id)) return null;
                if (log.transactionId && groupedLogs[log.transactionId]) {
                  const txn = groupedLogs[log.transactionId];
                  txn.forEach((l) => rendered.add(l.id));
                  const fromW = txn.find((l) => l.type === 'SALIDA')?.warehouseName || 'N/A';
                  const toW = txn.find((l) => l.type === 'ENTRADA')?.warehouseName || 'N/A';
                  const isDischarge = txn.some((l) => l.type === 'CONSUMO' || l.type === 'ENTREGA');
                  return (
                    <React.Fragment key={log.transactionId}>
                      <tr className="bg-slate-50 font-semibold border-b border-slate-200">
                        <td className="p-3 whitespace-nowrap">{new Date(txn[0].timestamp).toLocaleString()}</td>
                        <td className="p-3" colSpan={3}>
                          {isDischarge ? 'Descarga múltiple' : 'Transferencia múltiple'}
                          <span className="block text-xs font-normal text-slate-500">
                            {isDischarge
                              ? `${txn[0].type} · ${txn[0].warehouseName}${txn[0].recipient ? ` · A: ${txn[0].recipient}` : ''}`
                              : `${fromW} → ${toW}`}
                          </span>
                        </td>
                        <td className="p-3 text-center" colSpan={2}>{isDischarge ? txn.length : txn.length / 2} productos</td>
                        <td className="p-3 font-normal">{txn[0].details}</td>
                        <td className="p-3">{txn[0].user}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <InvButton className="p-1.5 bg-slate-200 text-slate-700" onClick={() => setDocumentToView({ logEntries: txn, type: 'CONSTANCIA' })}>C</InvButton>
                            {!isDischarge && (
                              <>
                                <InvButton className="p-1.5 bg-teal-600 text-white" onClick={() => setDocumentToView({ logEntries: txn, type: 'GUIA_DESPACHO' })}>D</InvButton>
                                <InvButton className="p-1.5 bg-violet-600 text-white" onClick={() => setDocumentToView({ logEntries: txn, type: 'GUIA_REMISION' })}>G</InvButton>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                }
                rendered.add(log.id);
                return (
                  <tr key={log.id} className="border-b border-slate-100">
                    <td className="p-3 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-3"><p className="font-medium">{log.productName}</p><p className="text-xs font-mono text-slate-500">{log.sku}</p></td>
                    <td className="p-3">{log.warehouseName}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 text-xs rounded-full ${
                      log.type === 'SALIDA' || log.type === 'CONSUMO' || log.type === 'ENTREGA' ? 'bg-red-50 text-red-700'
                      : log.type === 'ENTRADA' || log.type === 'CREACIÓN' ? 'bg-green-50 text-green-700'
                      : 'bg-blue-50 text-blue-700'
                    }`}>{log.type}</span></td>
                    <td className={`p-3 text-center font-bold ${log.quantityChange > 0 ? 'text-green-600' : log.quantityChange < 0 ? 'text-red-600' : ''}`}>{log.quantityChange > 0 ? `+${log.quantityChange}` : log.quantityChange || '—'}</td>
                    <td className="p-3 text-center font-bold">{log.newQuantityInWarehouse}</td>
                    <td className="p-3 text-slate-500 italic">
                      {log.details}
                      {log.recipient ? <span className="block text-slate-700 not-italic">A: {log.recipient}</span> : null}
                    </td>
                    <td className="p-3">{log.user}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <InvButton className="p-1.5 bg-slate-200 text-slate-700" onClick={() => setDocumentToView({ logEntries: [log], type: 'CONSTANCIA' })}>C</InvButton>
                        {(log.type === 'SALIDA' || log.type === 'AJUSTE') && (
                          <>
                            <InvButton className="p-1.5 bg-teal-600 text-white" onClick={() => setDocumentToView({ logEntries: [log], type: 'GUIA_DESPACHO' })}>D</InvButton>
                            <InvButton className="p-1.5 bg-violet-600 text-white" onClick={() => setDocumentToView({ logEntries: [log], type: 'GUIA_REMISION' })}>G</InvButton>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {logs.length === 0 && <p className="text-center text-slate-500 py-8">Sin movimientos.</p>}
        </div>
      </InvCard>
      {documentToView && <InventoryMovementDocumentModal logEntries={documentToView.logEntries} docType={documentToView.type} onClose={() => setDocumentToView(null)} />}
    </div>
  );
};

export const InventoryAccessView = () => {
  const { opsflowUsers, warehouses, warehouseAccess, isAdmin, actions } = useInventory();
  const [editing, setEditing] = useState<User | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const staff = opsflowUsers.filter((u) => u.role !== 'CLIENT');
  if (!isAdmin) return <p className="p-6 text-slate-500">Solo administradores pueden asignar almacenes.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Acceso a almacenes</h1>
        <p className="text-slate-500 text-sm">Los administradores ven todos los almacenes. Al resto se les asignan almacenes concretos; si no tienen ninguno, ven todos.</p>
      </div>
      <InvCard>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500"><tr><th className="p-3">Usuario</th><th className="p-3">Rol</th><th className="p-3">Almacenes</th><th className="p-3">Acciones</th></tr></thead>
          <tbody>
            {staff.map((user) => {
              const assigned = warehouseAccess.filter((a) => a.userId === user.id).map((a) => warehouses.find((w) => w.id === a.warehouseId)?.name).filter(Boolean);
              const admin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
              return (
                <tr key={user.id} className="border-b border-slate-100">
                  <td className="p-3"><p className="font-medium">{user.name}</p><p className="text-xs text-slate-500">{user.email}</p></td>
                  <td className="p-3">{user.role}</td>
                  <td className="p-3">{admin ? 'Todos' : assigned.length ? assigned.join(', ') : 'Todos (sin restricción)'}</td>
                  <td className="p-3">
                    {!admin && (
                      <InvButton className="bg-slate-100 text-slate-700" onClick={() => {
                        setEditing(user);
                        setSelected(warehouseAccess.filter((a) => a.userId === user.id).map((a) => a.warehouseId));
                      }}>Editar</InvButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </InvCard>
      {editing && (
        <InvModal isOpen onClose={() => setEditing(null)} title={`Almacenes de ${editing.name}`}>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {warehouses.map((w) => (
              <label key={w.id} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50">
                <input type="checkbox" checked={selected.includes(w.id)} onChange={() => setSelected((prev) => prev.includes(w.id) ? prev.filter((id) => id !== w.id) : [...prev, w.id])} />
                <span>{w.name}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <InvButton className="bg-slate-100 text-slate-700" onClick={() => setEditing(null)}>Cancelar</InvButton>
            <InvButton onClick={async () => { await actions.setUserWarehouseAccess(editing.id, selected); setEditing(null); }}>Guardar</InvButton>
          </div>
        </InvModal>
      )}
    </div>
  );
};
