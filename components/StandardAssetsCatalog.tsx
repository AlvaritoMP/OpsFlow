import React, { useState, useEffect } from 'react';
import { StandardAsset } from '../types';
import { standardAssetsService } from '../services/standardAssetsService';
import { Plus, Edit2, Trash2, X, Check, AlertCircle } from 'lucide-react';

interface StandardAssetsCatalogProps {
  currentUserRole?: string;
}

export const StandardAssetsCatalog: React.FC<StandardAssetsCatalogProps> = ({ currentUserRole }) => {
  const [assets, setAssets] = useState<StandardAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<StandardAsset | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'EPP' as StandardAsset['type'],
    description: '',
    defaultSerialNumberPrefix: '',
    isActive: true,
  });
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [filterType, setFilterType] = useState<StandardAsset['type'] | 'ALL'>('ALL');
  const [showInactive, setShowInactive] = useState(false);

  const isAdmin = currentUserRole === 'ADMIN';

  useEffect(() => {
    loadAssets();
  }, [showInactive]);

  const loadAssets = async () => {
    try {
      setLoading(true);
      const data = await standardAssetsService.getAll(showInactive);
      setAssets(data);
    } catch (error) {
      console.error('Error al cargar activos estándar:', error);
      setNotification({ type: 'error', message: 'Error al cargar activos estándar' });
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (asset?: StandardAsset) => {
    if (asset) {
      setEditingAsset(asset);
      setFormData({
        name: asset.name,
        type: asset.type,
        description: asset.description || '',
        defaultSerialNumberPrefix: asset.defaultSerialNumberPrefix || '',
        isActive: asset.isActive,
      });
    } else {
      setEditingAsset(null);
      setFormData({
        name: '',
        type: 'EPP',
        description: '',
        defaultSerialNumberPrefix: '',
        isActive: true,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingAsset(null);
    setFormData({
      name: '',
      type: 'EPP',
      description: '',
      defaultSerialNumberPrefix: '',
      isActive: true,
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setNotification({ type: 'error', message: 'El nombre es requerido' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    try {
      if (editingAsset) {
        await standardAssetsService.update(editingAsset.id, formData);
        setNotification({ type: 'success', message: 'Activo actualizado correctamente' });
      } else {
        await standardAssetsService.create(formData);
        setNotification({ type: 'success', message: 'Activo creado correctamente' });
      }
      handleCloseModal();
      await loadAssets();
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('Error al guardar activo:', error);
      setNotification({ type: 'error', message: 'Error al guardar activo' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas desactivar este activo?')) return;

    try {
      await standardAssetsService.delete(id);
      setNotification({ type: 'success', message: 'Activo desactivado correctamente' });
      await loadAssets();
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('Error al eliminar activo:', error);
      setNotification({ type: 'error', message: 'Error al eliminar activo' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await standardAssetsService.reactivate(id);
      setNotification({ type: 'success', message: 'Activo reactivado correctamente' });
      await loadAssets();
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('Error al reactivar activo:', error);
      setNotification({ type: 'error', message: 'Error al reactivar activo' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const filteredAssets = filterType === 'ALL' 
    ? assets 
    : assets.filter(a => a.type === filterType);

  const typeLabels: Record<StandardAsset['type'], string> = {
    'EPP': 'EPP',
    'Uniforme': 'Uniforme',
    'Tecnologia': 'Tecnología',
    'Herramienta': 'Herramienta',
    'Otro': 'Otro',
  };

  const typeColors: Record<StandardAsset['type'], string> = {
    'EPP': 'bg-blue-100 text-blue-800',
    'Uniforme': 'bg-purple-100 text-purple-800',
    'Tecnologia': 'bg-green-100 text-green-800',
    'Herramienta': 'bg-orange-100 text-orange-800',
    'Otro': 'bg-gray-100 text-gray-800',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Cargando catálogo de activos...</div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Catálogo de Activos Estándar</h2>
          <p className="text-sm text-slate-600 mt-1">
            Gestiona el catálogo de EPPs y activos para estandarizar la nomenclatura al asignar
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2"
          >
            <Plus size={20} />
            Agregar Activo
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">Filtrar por tipo:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as StandardAsset['type'] | 'ALL')}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="ALL">Todos</option>
            <option value="EPP">EPP</option>
            <option value="Uniforme">Uniforme</option>
            <option value="Tecnologia">Tecnología</option>
            <option value="Herramienta">Herramienta</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded"
          />
          Mostrar inactivos
        </label>
      </div>

      {/* Notificación */}
      {notification && (
        <div
          className={`p-4 rounded-lg flex items-center gap-2 ${
            notification.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {notification.type === 'success' ? (
            <Check size={20} />
          ) : (
            <AlertCircle size={20} />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Tabla de activos */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Descripción
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Prefijo Serie
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Estado
                </th>
                {isAdmin && (
                  <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-slate-500">
                    No hay activos estándar registrados
                  </td>
                </tr>
              ) : (
                filteredAssets.map((asset) => (
                  <tr key={asset.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">{asset.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${typeColors[asset.type]}`}>
                        {typeLabels[asset.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {asset.description || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                      {asset.defaultSerialNumberPrefix || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {asset.isActive ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          Activo
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                          Inactivo
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenModal(asset)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          {asset.isActive ? (
                            <button
                              onClick={() => handleDelete(asset.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Desactivar"
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleReactivate(asset.id)}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                              title="Reactivar"
                            >
                              <Check size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de edición/creación */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-orange-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
              <h3 className="text-lg font-bold">
                {editingAsset ? 'Editar Activo Estándar' : 'Nuevo Activo Estándar'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="p-1 hover:bg-orange-700 rounded transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ej: Botas de Seguridad"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tipo <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as StandardAsset['type'] })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="EPP">EPP</option>
                  <option value="Uniforme">Uniforme</option>
                  <option value="Tecnologia">Tecnología</option>
                  <option value="Herramienta">Herramienta</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Descripción
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-orange-500"
                  rows={3}
                  placeholder="Descripción opcional del activo"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Prefijo para N° Serie
                </label>
                <input
                  type="text"
                  value={formData.defaultSerialNumberPrefix}
                  onChange={(e) => setFormData({ ...formData, defaultSerialNumberPrefix: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Ej: BS-, CAS-"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Prefijo sugerido para números de serie (opcional)
                </p>
              </div>
              {editingAsset && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="isActive" className="text-sm text-slate-700">
                    Activo
                  </label>
                </div>
              )}
            </div>
            <div className="p-6 bg-slate-50 rounded-b-xl flex justify-end space-x-3">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                {editingAsset ? 'Guardar Cambios' : 'Crear Activo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

