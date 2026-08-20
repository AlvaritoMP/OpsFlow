import React, { useEffect, useRef, useState } from 'react';
import { useInventory } from './InventoryContext';
import { generateGRE_API, GREResponse } from '../../services/sunatGreService';
import type { InvLogEntry } from '../../types';

declare global {
  interface Window {
    QRious?: new (opts: { element: HTMLCanvasElement; value: string; size: number; padding: number }) => unknown;
  }
}

const ModalShell = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="fixed inset-0 bg-black/60 z-[90] flex justify-center items-center p-4 print-container">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl">
      <div className="p-4 border-b flex justify-between items-center print:hidden">
        <h3 className="font-bold text-slate-800">{title}</h3>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">Imprimir</button>
          <button onClick={onClose} className="px-3 py-1.5 text-slate-500">Cerrar</button>
        </div>
      </div>
      <div className="p-1 bg-white max-h-[80vh] overflow-y-auto">{children}</div>
    </div>
  </div>
);

export const InventoryMovementDocumentModal = ({
  logEntries,
  docType,
  onClose,
}: {
  logEntries: InvLogEntry[];
  docType: 'CONSTANCIA' | 'GUIA_DESPACHO' | 'GUIA_REMISION';
  onClose: () => void;
}) => {
  const mainLog = logEntries[0];
  const title =
    docType === 'CONSTANCIA'
      ? `Constancia: ${mainLog.transactionId || mainLog.id}`
      : docType === 'GUIA_DESPACHO'
        ? `Guía de despacho: ${mainLog.transactionId || mainLog.id}`
        : `Guía de remisión: ${mainLog.transactionId || mainLog.id}`;

  return (
    <>
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-container, .print-container > div { position: absolute !important; top: 0; left: 0; width: 100% !important; box-shadow: none !important; border: none !important; }
          body > *:not(.print-container) { display: none !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
      <ModalShell title={title} onClose={onClose}>
        <div className="bg-white text-slate-800 p-6">
          {docType === 'CONSTANCIA' && <Constancia logEntries={logEntries} />}
          {docType === 'GUIA_DESPACHO' && <GuiaDespacho logEntries={logEntries} />}
          {docType === 'GUIA_REMISION' && <GuiaRemision logEntries={logEntries} />}
        </div>
      </ModalShell>
    </>
  );
};

const Header = ({ title, id }: { title: string; id: string }) => (
  <div className="flex justify-between border-b-2 pb-3 mb-4">
    <div><h1 className="text-2xl font-bold">OpsFlow Inventario</h1><p className="text-slate-500 text-sm">Gestión operativa</p></div>
    <div className="text-right"><h2 className="text-xl font-semibold">{title}</h2><p className="text-xs font-mono">{id}</p></div>
  </div>
);

const Constancia = ({ logEntries }: { logEntries: InvLogEntry[] }) => {
  const main = logEntries[0];
  const isBulk = logEntries.length > 1;
  const products = logEntries.filter((l) => l.type === 'SALIDA' || !isBulk).map((l) => ({ sku: l.sku, name: l.productName, quantity: l.quantityChange }));
  return (
    <>
      <Header title="Constancia de movimiento" id={main.transactionId || main.id} />
      <p className="text-sm mb-2"><strong>Fecha:</strong> {new Date(main.timestamp).toLocaleString()}</p>
      <p className="text-sm mb-2"><strong>Tipo:</strong> {isBulk ? 'TRANSFERENCIA MÚLTIPLE' : main.type}</p>
      <p className="text-sm mb-4"><strong>Usuario:</strong> {main.user}</p>
      {isBulk ? (
        <table className="w-full text-sm"><thead><tr className="bg-slate-100"><th className="p-2 text-left">SKU</th><th className="p-2 text-left">Producto</th><th className="p-2 text-right">Cant.</th></tr></thead>
          <tbody>{products.map((p) => <tr key={p.sku}><td className="p-2 font-mono">{p.sku}</td><td className="p-2">{p.name}</td><td className="p-2 text-right">{Math.abs(p.quantity)}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="text-sm space-y-1">
          <p><strong>Producto:</strong> {main.productName} ({main.sku})</p>
          <p><strong>Cambio:</strong> {main.quantityChange > 0 ? `+${main.quantityChange}` : main.quantityChange}</p>
          <p><strong>Stock final:</strong> {main.newQuantityInWarehouse}</p>
          <p><strong>Almacén:</strong> {main.warehouseName}</p>
        </div>
      )}
      <p className="mt-4 italic text-sm">{main.details}</p>
    </>
  );
};

const GuiaDespacho = ({ logEntries }: { logEntries: InvLogEntry[] }) => {
  const salidas = logEntries.filter((l) => l.type === 'SALIDA');
  const main = salidas[0];
  if (!main) return <p>No hay salidas para esta guía.</p>;
  return (
    <>
      <Header title="Guía de despacho" id={main.transactionId || main.id} />
      <p className="text-sm"><strong>Origen:</strong> {main.warehouseName}</p>
      <p className="text-sm mb-4"><strong>Destino:</strong> {logEntries.find((l) => l.type === 'ENTRADA')?.warehouseName || 'Externo'}</p>
      <table className="w-full text-sm mb-12"><thead><tr className="bg-slate-100"><th className="p-2 text-left">SKU</th><th className="p-2 text-left">Producto</th><th className="p-2 text-right">Cant.</th></tr></thead>
        <tbody>{salidas.map((l) => <tr key={l.id}><td className="p-2 font-mono">{l.sku}</td><td className="p-2">{l.productName}</td><td className="p-2 text-right">{Math.abs(l.quantityChange)}</td></tr>)}</tbody>
      </table>
      <div className="grid grid-cols-2 gap-8 text-center text-sm">
        <div><div className="border-b border-dotted mb-2 h-8" /><p>Firma despacho</p><p className="text-xs">{main.user}</p></div>
        <div><div className="border-b border-dotted mb-2 h-8" /><p>Firma recepción</p></div>
      </div>
    </>
  );
};

const GuiaRemision = ({ logEntries }: { logEntries: InvLogEntry[] }) => {
  const { myCompanies, warehouses } = useInventory();
  const qrRef = useRef<HTMLCanvasElement>(null);
  const company = myCompanies[0];
  const getField = (label: string) => company?.details.find((d) => d.label === label)?.value || `[${label}]`;
  const [transportista, setTransportista] = useState({ placa: '', dni: '', peso: '100' });
  const [obs, setObs] = useState('');
  const [apiStatus, setApiStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [apiResponse, setApiResponse] = useState<GREResponse | null>(null);
  const salidas = logEntries.filter((l) => l.type === 'SALIDA');
  const main = salidas[0];
  const ruc = getField('RUC');

  useEffect(() => {
    if (qrRef.current && ruc && window.QRious) {
      new window.QRious({ element: qrRef.current, value: `RUC: ${ruc} | GRE OpsFlow`, size: 120, padding: 0 });
    }
  }, [ruc]);

  if (!main || !company) return <p>Falta empresa emisora o registro de salida.</p>;

  return (
    <div className="text-xs">
      <div className="flex justify-between border-b pb-2 mb-2">
        <div>
          <p className="font-bold">{getField('Razón Social')}</p>
          <p>{getField('Nombre Comercial')}</p>
          <p>{getField('Dirección Fiscal')}</p>
        </div>
        <div className="border-2 p-2 text-center">
          <p className="font-bold">R.U.C. {ruc}</p>
          <p className="font-bold">GUÍA DE REMISIÓN ELECTRÓNICA</p>
        </div>
      </div>
      <p><strong>Fecha:</strong> {new Date(main.timestamp).toLocaleDateString()}</p>
      <p><strong>Partida:</strong> {warehouses.find((w) => w.name === main.warehouseName)?.location || main.warehouseName}</p>
      <p><strong>Llegada:</strong> {warehouses.find((w) => w.name === logEntries.find((l) => l.type === 'ENTRADA')?.warehouseName)?.location || '—'}</p>
      <table className="w-full border mt-2 mb-2">
        <thead><tr className="bg-slate-100"><th className="p-1">Código</th><th className="p-1">Descripción</th><th className="p-1">Cant.</th></tr></thead>
        <tbody>{salidas.map((l) => <tr key={l.id}><td className="p-1 font-mono">{l.sku}</td><td className="p-1">{l.productName}</td><td className="p-1 text-center">{Math.abs(l.quantityChange)}</td></tr>)}</tbody>
      </table>
      <div className="print:hidden border p-2 mb-2 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="Placa" value={transportista.placa} onChange={(e) => setTransportista({ ...transportista, placa: e.target.value })} />
          <input className="border p-1" placeholder="DNI conductor" value={transportista.dni} onChange={(e) => setTransportista({ ...transportista, dni: e.target.value })} />
          <input className="border p-1" placeholder="Peso kg" value={transportista.peso} onChange={(e) => setTransportista({ ...transportista, peso: e.target.value })} />
        </div>
        <textarea className="w-full border p-1" rows={2} placeholder="Observaciones" value={obs} onChange={(e) => setObs(e.target.value)} />
        <button
          className="bg-violet-600 text-white px-3 py-1 rounded"
          disabled={apiStatus === 'loading'}
          onClick={async () => {
            setApiStatus('loading');
            const response = await generateGRE_API({
              companyInfo: { ruc },
              destinatario: { nombre: 'Destinatario', ruc: '' },
              puntos: { partida: main.warehouseName, llegada: logEntries.find((l) => l.type === 'ENTRADA')?.warehouseName || '' },
              transportista: { placa: transportista.placa, dniConductor: transportista.dni, modalidad: 'TRANSPORTE PRIVADO', pesoTotalKg: parseFloat(transportista.peso) || 0 },
              motivoTraslado: 'Traslado',
              fechaInicioTraslado: new Date(main.timestamp).toISOString().split('T')[0],
              items: salidas.map((l) => ({ codigo: l.sku, descripcion: l.productName, cantidad: Math.abs(l.quantityChange), unidad: 'UND' })),
              documentoReferencia: obs,
            });
            setApiResponse(response);
            setApiStatus(response.success ? 'success' : 'error');
          }}
        >
          {apiStatus === 'loading' ? 'Emitiendo...' : 'Emitir GRE a SUNAT (simulación)'}
        </button>
        {apiStatus === 'success' && <p className="text-green-700 font-bold">CDR: {apiResponse?.cdr}</p>}
        {apiStatus === 'error' && <p className="text-red-700">{apiResponse?.errors?.[0]}</p>}
      </div>
      <p><strong>Placa:</strong> {transportista.placa} · <strong>DNI:</strong> {transportista.dni} · <strong>Peso:</strong> {transportista.peso} kg</p>
      <canvas ref={qrRef} className="mt-2" />
    </div>
  );
};
