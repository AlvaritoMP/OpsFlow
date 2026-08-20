import React from 'react';
import { useInventory } from './InventoryContext';
import type { InvPurchaseOrder } from '../../types';

export const InventoryPurchaseOrderDocumentModal = ({ po, onClose }: { po: InvPurchaseOrder; onClose: () => void }) => {
  const { suppliers, myCompanies, currentUser } = useInventory();
  const supplier = suppliers.find((s) => s.id === po.supplierId);
  const company = myCompanies.find((c) => c.id === po.issuingCompanyId);
  const field = (label: string) => company?.details.find((d) => d.label === label)?.value || `[${label}]`;

  return (
    <>
      <style>{`
        @media print {
          .print-container, .print-container > div { position: absolute !important; top: 0; left: 0; width: 100% !important; box-shadow: none !important; }
          body > *:not(.print-container) { display: none !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
      <div className="fixed inset-0 bg-black/60 z-[90] flex justify-center items-center p-4 print-container" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
          <div className="p-4 border-b flex justify-between print:hidden">
            <h3 className="font-bold">Orden de compra #{po.orderNumber}</h3>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">Imprimir</button>
              <button onClick={onClose} className="px-3 py-1.5 text-slate-500">Cerrar</button>
            </div>
          </div>
          <div className="p-6 max-h-[80vh] overflow-y-auto text-sm text-slate-800">
            {!company ? (
              <p className="text-red-600">No se encontró la empresa emisora.</p>
            ) : (
              <>
                <header className="grid grid-cols-2 gap-6 border-b pb-4">
                  <div>
                    <h1 className="text-3xl font-bold">{field('Nombre Comercial')}</h1>
                    <p className="text-xs mt-1">Estado: {po.status}</p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-xl font-semibold">Orden de compra</h2>
                    <p>Núm. {po.orderNumber}</p>
                  </div>
                </header>
                <section className="grid grid-cols-3 gap-4 mt-6 text-xs">
                  <div>
                    <h3 className="font-bold mb-1">Proveedor</h3>
                    <p className="font-semibold">{supplier?.name}</p>
                    <p>{supplier?.ruc}</p>
                    <p>{supplier?.address}</p>
                    <p>{supplier?.contactPhone}</p>
                    <p>{supplier?.contactEmail}</p>
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">Empresa</h3>
                    <p className="font-semibold">{field('Razón Social')}</p>
                    <p>{field('RUC')}</p>
                    <p>{field('Dirección Fiscal')}</p>
                  </div>
                  <div>
                    <h3 className="font-bold mb-1">Solicitante</h3>
                    <p>{po.solicitante}</p>
                    <p>{currentUser.email}</p>
                    <h3 className="font-bold mt-2 mb-1">Entrega</h3>
                    <p>{po.deliveryDate ? new Date(po.deliveryDate).toLocaleDateString() : '—'}</p>
                  </div>
                </section>
                <table className="w-full text-xs mt-6">
                  <thead><tr className="bg-slate-100"><th className="p-2 text-left">Código</th><th className="p-2 text-left">Descripción</th><th className="p-2 text-right">Cant.</th><th className="p-2 text-right">Precio</th><th className="p-2 text-right">Total</th></tr></thead>
                  <tbody>
                    {po.items.map((item) => (
                      <tr key={item.productId} className="border-b">
                        <td className="p-2 font-mono">{item.sku}</td>
                        <td className="p-2">{item.productName}</td>
                        <td className="p-2 text-right">{item.quantity}</td>
                        <td className="p-2 text-right">S/ {item.price.toFixed(2)}</td>
                        <td className="p-2 text-right font-semibold">S/ {(item.quantity * item.price).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end mt-4">
                  <div className="w-64">
                    <div className="flex justify-between p-2"><span>Subtotal</span><span>S/ {po.total.toFixed(2)}</span></div>
                    <div className="flex justify-between p-2 bg-slate-100 font-bold border-t-2"><span>Total</span><span>S/ {po.total.toFixed(2)}</span></div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
