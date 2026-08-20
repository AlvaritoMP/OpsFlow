import React, { useEffect, useState } from 'react';
import { useInventory } from './InventoryContext';
import { InvButton, InvCard, InvInput, InvModal } from './InventoryUi';
import type { InvAppSettings, InvColorSettings, InvCompany, InvCompanyInfoDetails } from '../../types';

const colorPalettes: { name: string; settings: InvColorSettings }[] = [
  {
    name: 'Clásico',
    settings: {
      inStock: 'bg-green-50 text-green-700 border-green-200',
      lowStock: 'bg-amber-50 text-amber-700 border-amber-200',
      outOfStock: 'bg-red-50 text-red-700 border-red-200',
    },
  },
  {
    name: 'Vibrante',
    settings: {
      inStock: 'bg-teal-50 text-teal-700 border-teal-200',
      lowStock: 'bg-orange-50 text-orange-700 border-orange-200',
      outOfStock: 'bg-pink-50 text-pink-700 border-pink-200',
    },
  },
  {
    name: 'Moderno',
    settings: {
      inStock: 'bg-sky-50 text-sky-700 border-sky-200',
      lowStock: 'bg-amber-50 text-amber-800 border-amber-200',
      outOfStock: 'bg-slate-100 text-slate-600 border-slate-300',
    },
  },
];

export const InventorySettingsView = () => {
  const { settings, myCompanies, canEdit, actions } = useInventory();
  const [local, setLocal] = useState<InvAppSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [companyModal, setCompanyModal] = useState<InvCompany | null | 'new'>(null);

  useEffect(() => setLocal(settings), [settings]);

  if (!canEdit) return <p className="p-6 text-slate-500">Solo usuarios con permiso de edición pueden cambiar la configuración.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Configuración de inventario</h1>
      <InvCard className="space-y-8">
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-slate-800">Perfiles de empresa</h3>
            <InvButton onClick={() => setCompanyModal('new')}>Añadir perfil</InvButton>
          </div>
          <div className="space-y-3">
            {myCompanies.map((c) => (
              <div key={c.id} className="flex justify-between bg-slate-50 p-3 rounded-lg">
                <div>
                  <p className="font-bold">{c.profileName}</p>
                  <p className="text-sm text-slate-500">{c.details.find((d) => d.label === 'Razón Social')?.value}</p>
                </div>
                <div className="flex gap-2">
                  <InvButton className="bg-slate-200 text-slate-700" onClick={() => setCompanyModal(c)}>Editar</InvButton>
                  <InvButton className="bg-red-600 text-white" disabled={myCompanies.length <= 1} onClick={() => actions.deleteCompany(c.id)}>Eliminar</InvButton>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-slate-200 pt-6">
          <h3 className="font-semibold mb-3">Numeración de OC</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <InvInput label="Prefijo" value={local.purchaseOrderSettings.prefix} onChange={(e) => setLocal({ ...local, purchaseOrderSettings: { ...local.purchaseOrderSettings, prefix: e.target.value } })} />
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Siguiente número</label>
              <div className="flex gap-2">
                <input readOnly className="flex-1 border rounded-lg px-3 py-2 bg-slate-50" value={String(local.purchaseOrderSettings.nextNumber).padStart(6, '0')} />
                <InvButton className="bg-amber-600 text-white" onClick={() => { if (window.confirm('¿Reiniciar a 1?')) setLocal({ ...local, purchaseOrderSettings: { ...local.purchaseOrderSettings, nextNumber: 1 } }); }}>Reiniciar</InvButton>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 pt-6">
          <h3 className="font-semibold mb-3">Colores de alerta</h3>
          <div className="grid md:grid-cols-3 gap-3">
            {colorPalettes.map((palette) => (
              <button
                key={palette.name}
                type="button"
                onClick={() => setLocal({ ...local, colors: palette.settings })}
                className={`p-4 rounded-lg border-2 text-left ${JSON.stringify(local.colors) === JSON.stringify(palette.settings) ? 'border-blue-500' : 'border-slate-200'}`}
              >
                <p className="font-semibold mb-2 text-center">{palette.name}</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>En stock</span><span className={`px-2 py-0.5 rounded-full border ${palette.settings.inStock}`}>100</span></div>
                  <div className="flex justify-between"><span>Bajo</span><span className={`px-2 py-0.5 rounded-full border ${palette.settings.lowStock}`}>5</span></div>
                  <div className="flex justify-between"><span>Agotado</span><span className={`px-2 py-0.5 rounded-full border ${palette.settings.outOfStock}`}>0</span></div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-slate-200 pt-6">
          <InvInput
            label="Umbral de stock bajo por defecto"
            type="number"
            value={local.alerts.defaultLowStockThreshold}
            onChange={(e) => setLocal({ ...local, alerts: { defaultLowStockThreshold: parseInt(e.target.value, 10) || 0 } })}
          />
        </div>
        <div className="flex justify-end gap-3">
          {saved && <span className="text-green-600 text-sm self-center">Guardado</span>}
          <InvButton onClick={async () => { await actions.updateSettings(local); setSaved(true); setTimeout(() => setSaved(false), 2500); }}>Guardar configuración</InvButton>
        </div>
      </InvCard>
      {companyModal !== null && (
        <CompanyForm
          company={companyModal === 'new' ? null : companyModal}
          onClose={() => setCompanyModal(null)}
        />
      )}
    </div>
  );
};

const CompanyForm = ({ company, onClose }: { company: InvCompany | null; onClose: () => void }) => {
  const { actions } = useInventory();
  const [profileName, setProfileName] = useState(company?.profileName || '');
  const [details, setDetails] = useState<InvCompanyInfoDetails>(company?.details || [
    { label: 'Nombre Comercial', value: '' },
    { label: 'Razón Social', value: '' },
    { label: 'RUC', value: '' },
    { label: 'Dirección Fiscal', value: '' },
  ]);
  return (
    <InvModal isOpen onClose={onClose} title={company ? 'Editar empresa' : 'Nueva empresa'} maxWidth="max-w-2xl">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        if (company) await actions.updateCompany({ ...company, profileName, details });
        else await actions.addCompany({ profileName, details });
        onClose();
      }}>
        <InvInput label="Nombre del perfil" value={profileName} onChange={(e) => setProfileName(e.target.value)} required />
        {details.map((field, index) => (
          <div key={index} className="flex gap-2">
            <input className="w-1/3 border rounded-lg px-3 py-2" value={field.label} onChange={(e) => { const next = [...details]; next[index] = { ...field, label: e.target.value }; setDetails(next); }} />
            <input className="flex-1 border rounded-lg px-3 py-2" value={field.value} onChange={(e) => { const next = [...details]; next[index] = { ...field, value: e.target.value }; setDetails(next); }} />
            <InvButton type="button" className="bg-red-600 text-white" onClick={() => setDetails(details.filter((_, i) => i !== index))}>×</InvButton>
          </div>
        ))}
        <InvButton type="button" className="bg-slate-100 text-slate-700" onClick={() => setDetails([...details, { label: 'Nuevo campo', value: '' }])}>Añadir campo</InvButton>
        <div className="flex justify-end gap-2"><InvButton type="button" className="bg-slate-100 text-slate-700" onClick={onClose}>Cancelar</InvButton><InvButton type="submit">Guardar</InvButton></div>
      </form>
    </InvModal>
  );
};
