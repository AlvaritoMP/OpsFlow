import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UserPlus,
  Phone,
  Mail,
  Building2,
  Edit2,
  Trash2,
  X,
  RefreshCw,
  Users,
  Headphones,
  Briefcase,
} from 'lucide-react';
import { BpoContactCategory, BpoUnitContact } from '../types';
import { bpoContactsService } from '../services/bpoContactsService';

interface BpoContactsTabProps {
  unitId: string;
  canEdit: boolean;
}

const CATEGORY_LABELS: Record<BpoContactCategory, string> = {
  client: 'Cliente',
  provider: 'Proveedor',
  support: 'Soporte',
  other: 'Otro',
};

const CATEGORY_STYLES: Record<BpoContactCategory, string> = {
  client: 'bg-blue-100 text-blue-800',
  provider: 'bg-amber-100 text-amber-800',
  support: 'bg-emerald-100 text-emerald-800',
  other: 'bg-slate-100 text-slate-700',
};

const CATEGORY_ICONS: Record<BpoContactCategory, React.ReactNode> = {
  client: <Users size={14} />,
  provider: <Briefcase size={14} />,
  support: <Headphones size={14} />,
  other: <Building2 size={14} />,
};

const EMPTY_FORM = {
  category: 'client' as BpoContactCategory,
  name: '',
  phone: '',
  email: '',
  organization: '',
  roleTitle: '',
  notes: '',
};

export const BpoContactsTab: React.FC<BpoContactsTabProps> = ({ unitId, canEdit }) => {
  const [contacts, setContacts] = useState<BpoUnitContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<BpoContactCategory | 'all'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BpoUnitContact | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await bpoContactsService.getByUnitId(unitId);
      setContacts(data);
    } catch {
      setMessage({ type: 'err', text: 'No se pudieron cargar los contactos.' });
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const filtered = useMemo(() => {
    if (filter === 'all') return contacts;
    return contacts.filter((c) => c.category === filter);
  }, [contacts, filter]);

  const grouped = useMemo(() => {
    const groups: Record<BpoContactCategory, BpoUnitContact[]> = {
      client: [],
      provider: [],
      support: [],
      other: [],
    };
    filtered.forEach((c) => groups[c.category].push(c));
    return groups;
  }, [filtered]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, category: filter === 'all' ? 'client' : filter });
    setShowModal(true);
  };

  const openEdit = (contact: BpoUnitContact) => {
    setEditing(contact);
    setForm({
      category: contact.category,
      name: contact.name,
      phone: contact.phone || '',
      email: contact.email || '',
      organization: contact.organization || '',
      roleTitle: contact.roleTitle || '',
      notes: contact.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setMessage({ type: 'err', text: 'El nombre es obligatorio.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        category: form.category,
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        organization: form.organization.trim() || undefined,
        roleTitle: form.roleTitle.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editing) {
        await bpoContactsService.update(editing.id, payload);
      } else {
        await bpoContactsService.create(unitId, payload);
      }
      setShowModal(false);
      await loadContacts();
      setMessage({ type: 'ok', text: editing ? 'Contacto actualizado.' : 'Contacto registrado.' });
    } catch {
      setMessage({ type: 'err', text: 'Error al guardar el contacto.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact: BpoUnitContact) => {
    if (!window.confirm(`¿Eliminar el contacto "${contact.name}"?`)) return;
    try {
      await bpoContactsService.delete(contact.id);
      await loadContacts();
      setMessage({ type: 'ok', text: 'Contacto eliminado.' });
    } catch {
      setMessage({ type: 'err', text: 'No se pudo eliminar el contacto.' });
    }
  };

  const renderContactCard = (contact: BpoUnitContact) => (
    <div
      key={contact.id}
      className="border border-slate-200 rounded-xl p-4 bg-white hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className="font-semibold text-slate-800 truncate">{contact.name}</h4>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${CATEGORY_STYLES[contact.category]}`}
            >
              {CATEGORY_ICONS[contact.category]}
              {CATEGORY_LABELS[contact.category]}
            </span>
          </div>
          {contact.organization && (
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Building2 size={12} /> {contact.organization}
            </p>
          )}
          {contact.roleTitle && <p className="text-xs text-slate-400 mt-0.5">{contact.roleTitle}</p>}
        </div>
        {canEdit && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => openEdit(contact)}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
              title="Editar"
            >
              <Edit2 size={15} />
            </button>
            <button
              onClick={() => handleDelete(contact)}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
              title="Eliminar"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>
      <div className="space-y-1.5 text-sm text-slate-600">
        {contact.phone && (
          <p className="flex items-center gap-2">
            <Phone size={14} className="text-slate-400 shrink-0" />
            <a href={`tel:${contact.phone}`} className="hover:text-blue-600">
              {contact.phone}
            </a>
          </p>
        )}
        {contact.email && (
          <p className="flex items-center gap-2 min-w-0">
            <Mail size={14} className="text-slate-400 shrink-0" />
            <a href={`mailto:${contact.email}`} className="hover:text-blue-600 truncate">
              {contact.email}
            </a>
          </p>
        )}
        {contact.notes && <p className="text-xs text-slate-500 mt-2 border-t border-slate-100 pt-2">{contact.notes}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-violet-600" /> Contactos
          </h3>
          <p className="text-slate-500 text-sm mt-1">
            Personas del cliente, proveedores y soportes relevantes para la gestión de la unidad.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadContacts}
            disabled={loading}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
            title="Actualizar"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          {canEdit && (
            <button
              onClick={openCreate}
              className="bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 flex items-center gap-2 shadow-sm"
            >
              <UserPlus size={16} /> Agregar contacto
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium ${filter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          Todos ({contacts.length})
        </button>
        {(Object.keys(CATEGORY_LABELS) as BpoContactCategory[]).map((cat) => {
          const count = contacts.filter((c) => c.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium inline-flex items-center gap-1 ${
                filter === cat ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
          Cargando contactos…
        </div>
      ) : filter === 'all' ? (
        (['client', 'provider', 'support', 'other'] as BpoContactCategory[]).map((cat) =>
          grouped[cat].length > 0 ? (
            <div key={cat}>
              <h4 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2">
                {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {grouped[cat].map(renderContactCard)}
              </div>
            </div>
          ) : null
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(renderContactCard)}
        </div>
      )}

      {!loading && contacts.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No hay contactos registrados.</p>
          {canEdit && (
            <button onClick={openCreate} className="mt-4 text-violet-600 text-sm font-medium hover:underline">
              Agregar el primer contacto
            </button>
          )}
        </div>
      )}

      {!loading && filter !== 'all' && filtered.length === 0 && contacts.length > 0 && (
        <p className="text-center text-slate-400 py-8">No hay contactos en esta categoría.</p>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">{editing ? 'Editar contacto' : 'Nuevo contacto'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as BpoContactCategory })}
                >
                  {(Object.keys(CATEGORY_LABELS) as BpoContactCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-2"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                  <input
                    type="tel"
                    className="w-full border border-slate-300 rounded-lg p-2"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Correo</label>
                  <input
                    type="email"
                    className="w-full border border-slate-300 rounded-lg p-2"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Empresa / Organización</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-2"
                  value={form.organization}
                  onChange={(e) => setForm({ ...form, organization: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cargo / Rol</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-2"
                  value={form.roleTitle}
                  onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                <textarea
                  className="w-full border border-slate-300 rounded-lg p-2 min-h-[80px]"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
