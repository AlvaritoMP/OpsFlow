import React, { useState, useEffect } from 'react';
import { Position } from '../types';
import { positionsService } from '../services/positionsService';
import { Plus, Edit2, Trash2, X, Briefcase, Save } from 'lucide-react';

interface PositionsManagementSectionProps {
  currentUserRole?: string;
}

export const PositionsManagementSection: React.FC<PositionsManagementSectionProps> = ({ currentUserRole }) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isActive: true,
  });
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const isAdmin = currentUserRole === 'ADMIN' || currentUserRole === 'SUPER_ADMIN';

  useEffect(() => {
    loadPositions();
  }, [showInactive]);

  const loadPositions = async () => {
    try {
      setLoading(true);
      const data = await positionsService.getAll(showInactive);
      console.log(`✅ PositionsManagement - ${data.length} puestos cargados`);
      setPositions(data);
      
      if (data.length === 0) {
        console.warn('⚠️ No se encontraron puestos. Verifica que existan en la base de datos y que tengas permisos para verlos.');
      }
    } catch (error: any) {
      console.error('❌ Error al cargar puestos:', error);
      console.error('❌ Detalles:', {
        message: error.message,
        code: error.code,
        details: error.details
      });
      
      let errorMessage = 'Error al cargar puestos';
      if (error.message?.includes('permission denied') || error.message?.includes('row-level security') || error.code === '42501') {
        errorMessage = 'Error de permisos al cargar puestos. Verifica que tengas una sesión de Supabase Auth activa. Si el problema persiste, cierra sesión y vuelve a iniciar sesión.';
      } else if (error.message) {
        errorMessage = `Error al cargar puestos: ${error.message}`;
      }
      
      setNotification({ type: 'error', message: errorMessage });
      setTimeout(() => setNotification(null), 8000);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (position?: Position) => {
    if (position) {
      setEditingPosition(position);
      setFormData({
        name: position.name,
        description: position.description || '',
        isActive: position.isActive,
      });
    } else {
      setEditingPosition(null);
      setFormData({
        name: '',
        description: '',
        isActive: true,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPosition(null);
    setFormData({
      name: '',
      description: '',
      isActive: true,
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setNotification({ type: 'error', message: 'El nombre del puesto es requerido' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    try {
      if (editingPosition) {
        await positionsService.update(editingPosition.id, formData);
        setNotification({ type: 'success', message: 'Puesto actualizado correctamente' });
      } else {
        await positionsService.create(formData);
        setNotification({ type: 'success', message: 'Puesto creado correctamente' });
      }
      handleCloseModal();
      await loadPositions();
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('Error al guardar puesto:', error);
      setNotification({ type: 'error', message: 'Error al guardar el puesto' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este puesto? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      await positionsService.deletePermanent(id);
      setNotification({ type: 'success', message: 'Puesto eliminado correctamente' });
      await loadPositions();
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('Error al eliminar puesto:', error);
      setNotification({ type: 'error', message: 'Error al eliminar el puesto' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
        <h3 className="font-bold text-slate-700 flex items-center">
          <Briefcase className="mr-2" size={18} /> Gestión de Puestos Predefinidos
        </h3>
        {isAdmin && (
          <button
            onClick={() => handleOpenModal()}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-blue-700 transition-colors flex items-center"
          >
            <Plus size={14} className="mr-1.5" /> Nuevo Puesto
          </button>
        )}
      </div>

      {notification && (
        <div className={`px-6 py-3 ${
          notification.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {notification.message}
        </div>
      )}

      <div className="p-6">
        <p className="text-sm text-slate-600 mb-4">
          Defina los tipos de puestos que se utilizarán en las unidades. Estos puestos se usarán para asignar trabajadores y realizar conciliaciones de personal.
        </p>

        <div className="mb-4 flex items-center justify-between">
          <label className="flex items-center space-x-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Mostrar puestos inactivos</span>
          </label>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2">Cargando puestos...</p>
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-8">
            <Briefcase size={48} className="mx-auto mb-4 opacity-20 text-slate-400" />
            <p className="text-slate-600 font-medium mb-2">No se encontraron puestos</p>
            <div className="text-sm text-slate-500 space-y-2 max-w-md mx-auto">
              <p>Esto puede deberse a:</p>
              <ul className="list-disc list-inside text-left space-y-1">
                <li>No hay puestos creados en la base de datos</li>
                <li>Problemas de permisos RLS (verifica tu sesión de Supabase Auth)</li>
                <li>Problemas de conexión con el servidor</li>
              </ul>
              <p className="mt-4 text-amber-600">
                Si sabes que existen puestos en la base de datos, verifica la consola del navegador (F12) para ver los errores detallados.
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={() => handleOpenModal()}
                className="mt-6 text-blue-600 hover:text-blue-700 text-sm font-medium px-4 py-2 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
              >
                Crear el primer puesto
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Descripción</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
                  {isAdmin && (
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {positions.map((position) => (
                  <tr key={position.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                      {position.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {position.description || <span className="text-slate-300 italic">Sin descripción</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        position.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {position.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleOpenModal(position)}
                            className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(position.id)}
                            className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal para crear/editar puesto */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center">
                {editingPosition ? (
                  <>
                    <Edit2 className="mr-2" size={20} /> Editar Puesto
                  </>
                ) : (
                  <>
                    <Plus className="mr-2" size={20} /> Nuevo Puesto
                  </>
                )}
              </h3>
              <button onClick={handleCloseModal} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre del Puesto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej: Supervisor, Operario de Limpieza, Seguridad"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Descripción
                </label>
                <textarea
                  className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción opcional del puesto"
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label className="text-sm text-slate-700">Puesto activo</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end space-x-3">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
              >
                <Save size={16} className="mr-2" /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

