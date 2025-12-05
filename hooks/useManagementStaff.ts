import { useState, useEffect } from 'react';
import { managementStaffService } from '../services/managementStaffService';
import { ManagementStaff } from '../types';

export const useManagementStaff = (isAuthenticated: boolean) => {
  const [staff, setStaff] = useState<ManagementStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStaff = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await managementStaffService.getAll();
      setStaff(data);
    } catch (err: any) {
      // No mostrar error si es por falta de autenticación
      if (err.message?.includes('JWT') || err.message?.includes('auth') || err.message?.includes('session')) {
        setStaff([]);
        setError(null);
      } else {
        setError(err.message || 'Error al cargar personal de gestión');
        console.error('Error loading management staff:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const checkAndLoad = async () => {
    if (isAuthenticated) {
      await loadStaff();
    } else {
      setStaff([]);
      setLoading(false);
      setError(null);
    }
  };

  useEffect(() => {
    checkAndLoad();
  }, [isAuthenticated]);

  const createStaff = async (member: Partial<ManagementStaff>) => {
    try {
      const newMember = await managementStaffService.create(member);
      setStaff([...staff, newMember]);
      return newMember;
    } catch (err: any) {
      setError(err.message || 'Error al crear miembro del staff');
      throw err;
    }
  };

  const updateStaff = async (id: string, member: Partial<ManagementStaff>) => {
    try {
      const updatedMember = await managementStaffService.update(id, member);
      setStaff(staff.map(s => s.id === id ? updatedMember : s));
      return updatedMember;
    } catch (err: any) {
      setError(err.message || 'Error al actualizar miembro del staff');
      throw err;
    }
  };

  const deleteStaff = async (id: string) => {
    try {
      await managementStaffService.delete(id);
      setStaff(staff.filter(s => s.id !== id));
    } catch (err: any) {
      setError(err.message || 'Error al eliminar miembro del staff');
      throw err;
    }
  };

  const archiveStaff = async (id: string) => {
    try {
      await managementStaffService.archive(id);
      setStaff(staff.filter(s => s.id !== id)); // Remover de la vista
      await loadStaff(); // Recargar para asegurar sincronización
    } catch (err: any) {
      setError(err.message || 'Error al archivar miembro del staff');
      throw err;
    }
  };

  const unarchiveStaff = async (id: string) => {
    try {
      await managementStaffService.unarchive(id);
      await loadStaff(); // Recargar para incluir el desarchivado
    } catch (err: any) {
      setError(err.message || 'Error al desarchivar miembro del staff');
      throw err;
    }
  };

  return {
    staff,
    loading,
    error,
    loadStaff,
    createStaff,
    updateStaff,
    deleteStaff,
    archiveStaff,
    unarchiveStaff,
  };
};

