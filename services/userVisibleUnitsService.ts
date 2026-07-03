import { supabase, handleSupabaseError } from './supabase';

// ============================================
// SERVICIO PARA GESTIONAR UNIDADES VISIBLES POR USUARIO CLIENT
// ============================================

export const userVisibleUnitsService = {
  // Obtener todas las unidades visibles para un usuario CLIENT
  async getVisibleUnitsByUserId(userId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('user_visible_units')
        .select('unit_id')
        .eq('user_id', userId);

      if (error) throw error;

      return data?.map(row => row.unit_id) || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener todos los usuarios CLIENT que pueden ver una unidad específica
  async getUsersByUnitId(unitId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('user_visible_units')
        .select('user_id')
        .eq('unit_id', unitId);

      if (error) throw error;

      return data?.map(row => row.user_id) || [];
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Establecer las unidades visibles para un usuario CLIENT (reemplaza las existentes)
  async setVisibleUnitsForUser(userId: string, unitIds: string[]): Promise<void> {
    try {
      // Eliminar relaciones existentes
      const { error: deleteError } = await supabase
        .from('user_visible_units')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // Insertar nuevas relaciones si hay unidades
      if (unitIds.length > 0) {
        const records = unitIds.map(unitId => ({
          user_id: userId,
          unit_id: unitId,
        }));

        const { error: insertError } = await supabase
          .from('user_visible_units')
          .insert(records);

        if (insertError) throw insertError;
      }
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Agregar una unidad visible para un usuario CLIENT
  async addVisibleUnit(userId: string, unitId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_visible_units')
        .insert({
          user_id: userId,
          unit_id: unitId,
        });

      if (error) {
        // Si el error es por duplicado, ignorarlo
        if (error.code !== '23505') {
          throw error;
        }
      }
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar una unidad visible para un usuario CLIENT
  async removeVisibleUnit(userId: string, unitId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_visible_units')
        .delete()
        .eq('user_id', userId)
        .eq('unit_id', unitId);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Verificar si un usuario CLIENT tiene restricciones de unidades (tiene registros en la tabla)
  async hasRestrictions(userId: string): Promise<boolean> {
    try {
      // La tabla user_visible_units no tiene columna 'id', solo user_id y unit_id
      // Usamos SELECT 1 o user_id para verificar existencia
      const { data, error } = await supabase
        .from('user_visible_units')
        .select('user_id')
        .eq('user_id', userId)
        .limit(1);

      if (error) {
        console.error('❌ Error al verificar restricciones:', error);
        throw error;
      }

      const hasRestrictions = (data?.length || 0) > 0;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 hasRestrictions para usuario ${userId}: ${hasRestrictions} (${data?.length || 0} registros encontrados)`);
      }

      return hasRestrictions;
    } catch (error) {
      console.error('❌ Error en hasRestrictions:', error);
      handleSupabaseError(error);
      return false;
    }
  },
};
