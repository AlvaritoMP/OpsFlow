import { useState, useEffect } from 'react';
import { unitsService } from '../services/unitsService';
import { Unit } from '../types';

export const useUnits = (isAuthenticated: boolean) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUnits = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('🔄 useUnits: Iniciando carga de unidades...');
      const data = await unitsService.getAll();
      console.log(`✅ useUnits: ${data.length} unidades cargadas`);
      setUnits(data);
    } catch (err: any) {
      console.error('❌ useUnits: Error al cargar unidades:', err);
      console.error('Detalles:', {
        message: err.message,
        code: err.code,
        details: err.details,
        hint: err.hint
      });
      // No mostrar error si es por falta de autenticación
      if (err.message?.includes('JWT') || err.message?.includes('auth') || err.message?.includes('session') || err.code === 'PGRST301') {
        setUnits([]);
        setError(null);
      } else {
        setError(err.message || 'Error al cargar unidades');
        console.error('Error loading units:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const checkAndLoad = async () => {
    if (isAuthenticated) {
      await loadUnits();
    } else {
      setUnits([]);
      setLoading(false);
      setError(null);
    }
  };

  useEffect(() => {
    checkAndLoad();
  }, [isAuthenticated]);

  const createUnit = async (unit: Partial<Unit>) => {
    try {
      const newUnit = await unitsService.create(unit);
      setUnits([...units, newUnit]);
      return newUnit;
    } catch (err: any) {
      setError(err.message || 'Error al crear unidad');
      throw err;
    }
  };

  const updateUnit = async (id: string, unit: Partial<Unit>) => {
    try {
      const updatedUnit = await unitsService.update(id, unit);
      setUnits(units.map(u => u.id === id ? updatedUnit : u));
      return updatedUnit;
    } catch (err: any) {
      setError(err.message || 'Error al actualizar unidad');
      throw err;
    }
  };

  const deleteUnit = async (id: string) => {
    try {
      await unitsService.delete(id);
      setUnits(units.filter(u => u.id !== id));
    } catch (err: any) {
      setError(err.message || 'Error al eliminar unidad');
      throw err;
    }
  };

  return {
    units,
    loading,
    error,
    loadUnits,
    createUnit,
    updateUnit,
    deleteUnit,
  };
};

