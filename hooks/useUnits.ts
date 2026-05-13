import { useState, useEffect, useRef } from 'react';
import { unitsService } from '../services/unitsService';
import { Unit, User } from '../types';

export const useUnits = (isAuthenticated: boolean, currentUser?: User | null) => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUnits = async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      // Log reducido - solo en desarrollo
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 useUnits: Iniciando carga de unidades...', {
          isAuthenticated,
          currentUser: currentUser ? {
            id: currentUser.id,
            name: currentUser.name,
            role: currentUser.role,
            linkedClientIds: currentUser.linkedClientIds
          } : null
        });
      }
      
      // Cargar todas las unidades primero
      let data = await unitsService.getAll();
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`📊 useUnits: Cargadas ${data.length} unidades antes del filtrado`);
      }
      
      // Filtrar unidades según permisos del usuario CLIENT
      // Esto se hace DESPUÉS de cargar para evitar problemas de inicialización
      if (currentUser && currentUser.role === 'CLIENT') {
        try {
          // Import dinámico solo cuando sea necesario para evitar dependencias circulares
          const { userVisibleUnitsService } = await import('../services/userVisibleUnitsService');
          
          const allowedUnitIds = new Set<string>();
          
          // Verificar si el usuario tiene restricciones explícitas de unidades
          // Esto verifica si hay registros en user_visible_units para este usuario
          const hasRestrictions = await userVisibleUnitsService.hasRestrictions(currentUser.id);
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`🔍 useUnits: Usuario CLIENT ${currentUser.name} (ID: ${currentUser.id}) - hasRestrictions: ${hasRestrictions}`);
          }
          
          if (hasRestrictions) {
            // Si tiene restricciones explícitas, solo mostrar las unidades permitidas
            const visibleUnitIds = await userVisibleUnitsService.getVisibleUnitsByUserId(currentUser.id);
            if (process.env.NODE_ENV === 'development') {
              console.log(`🔒 Usuario CLIENT tiene restricciones: ${visibleUnitIds.length} unidades visibles permitidas`, visibleUnitIds);
            }
            visibleUnitIds.forEach(unitId => allowedUnitIds.add(unitId));
            
            // Filtrar estrictamente por las unidades permitidas
            if (allowedUnitIds.size > 0) {
              data = data.filter(unit => allowedUnitIds.has(unit.id));
              if (process.env.NODE_ENV === 'development') {
                console.log(`✅ Filtrado estricto aplicado: ${data.length} unidades visibles de ${visibleUnitIds.length} permitidas`);
              }
            } else {
              // Si hay restricciones pero no hay unidades permitidas, mostrar nada
              data = [];
              if (process.env.NODE_ENV === 'development') {
                console.log(`⚠️ Usuario CLIENT tiene restricciones pero no hay unidades permitidas, mostrando 0 unidades`);
              }
            }
          } else if (currentUser.linkedClientIds && Array.isArray(currentUser.linkedClientIds) && currentUser.linkedClientIds.length > 0) {
            // Si NO tiene restricciones explícitas, mostrar todas las unidades de los clientes vinculados
            const { supabase } = await import('../services/supabase');
            
            if (process.env.NODE_ENV === 'development') {
              console.log(`🔓 Usuario CLIENT NO tiene restricciones, mostrando todas las unidades de clientes vinculados`);
            }
            
            for (const clientId of currentUser.linkedClientIds) {
              if (!clientId) continue;
              
              try {
                // Obtener el nombre del cliente
                const { data: clientData } = await supabase
                  .from('clients')
                  .select('name')
                  .eq('id', clientId)
                  .single();
                
                if (clientData?.name) {
                  // Agregar todas las unidades que pertenecen a este cliente
                  data.forEach(unit => {
                    if (unit.clientName === clientData.name) {
                      allowedUnitIds.add(unit.id);
                    }
                  });
                }
              } catch (err) {
                console.warn(`⚠️ Error al procesar cliente ${clientId}:`, err);
              }
            }
            
            // Filtrar por las unidades de los clientes vinculados
            if (allowedUnitIds.size > 0) {
              data = data.filter(unit => allowedUnitIds.has(unit.id));
              if (process.env.NODE_ENV === 'development') {
                console.log(`✅ Filtrado por clientes vinculados: ${data.length} unidades visibles`);
              }
            } else {
              // Si no hay clientes vinculados o no hay unidades, retornar array vacío
              data = [];
              if (process.env.NODE_ENV === 'development') {
                console.log(`⚠️ Usuario CLIENT no tiene unidades de clientes vinculados`);
              }
            }
          } else {
            // Si no tiene restricciones ni clientes vinculados, no mostrar nada
            data = [];
            if (process.env.NODE_ENV === 'development') {
              console.log(`⚠️ Usuario CLIENT no tiene restricciones ni clientes vinculados, mostrando 0 unidades`);
            }
          }
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`🔒 Filtrado de unidades para usuario CLIENT "${currentUser.name}": ${data.length} unidades visibles`);
          }
        } catch (filterError) {
          console.error('❌ Error al filtrar unidades por usuario CLIENT:', filterError);
          // En caso de error en el filtrado, retornar todas las unidades para evitar un bloqueo total
          // Esto es más seguro que bloquear al usuario completamente
        }
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ useUnits: ${data.length} unidades cargadas`);
      }
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
      } else if (!silent) {
        setError(err.message || 'Error al cargar unidades');
        console.error('Error loading units:', err);
      } else {
        console.warn('useUnits: refresco en segundo plano falló; se mantienen los datos actuales.', err);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadUnitsRef = useRef(loadUnits);
  loadUnitsRef.current = loadUnits;

  // Al volver a la pestaña, refrescar datos desde Supabase (otros usuarios / otras pestañas).
  // silent: no activa el spinner global de carga.
  useEffect(() => {
    if (!isAuthenticated) return;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        void loadUnitsRef.current({ silent: true });
      }, 500);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [isAuthenticated]);

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
  }, [isAuthenticated, currentUser?.id, currentUser?.linkedClientIds?.join(','), currentUser?.role]);

  const createUnit = async (unit: Partial<Unit>) => {
    try {
      const newUnit = await unitsService.create(unit);
      setUnits((prev) => [...prev, newUnit]);
      return newUnit;
    } catch (err: any) {
      setError(err.message || 'Error al crear unidad');
      throw err;
    }
  };

  const updateUnit = async (id: string, unit: Partial<Unit>) => {
    try {
      const updatedUnit = await unitsService.update(id, unit);
      setUnits((prev) => prev.map((u) => (u.id === id ? updatedUnit : u)));
      return updatedUnit;
    } catch (err: any) {
      setError(err.message || 'Error al actualizar unidad');
      throw err;
    }
  };

  const deleteUnit = async (id: string) => {
    try {
      await unitsService.delete(id);
      setUnits((prev) => prev.filter((u) => u.id !== id));
    } catch (err: any) {
      setError(err.message || 'Error al eliminar unidad');
      throw err;
    }
  };

  const releaseManagementStaffFromUnits = (staffId: string) => {
    setUnits(currentUnits => currentUnits.map(unit => ({
      ...unit,
      coordinator: unit.coordinator?.id === staffId ? undefined : unit.coordinator,
      rovingSupervisor: unit.rovingSupervisor?.id === staffId ? undefined : unit.rovingSupervisor,
      residentSupervisor: unit.residentSupervisor?.id === staffId ? undefined : unit.residentSupervisor,
      assignedStaff: unit.assignedStaff?.filter(id => id !== staffId) || [],
    })));
  };

  return {
    units,
    loading,
    error,
    loadUnits,
    createUnit,
    updateUnit,
    deleteUnit,
    releaseManagementStaffFromUnits,
  };
};

