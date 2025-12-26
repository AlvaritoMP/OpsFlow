import { supabase, handleSupabaseError } from './supabase';
import { Position } from '../types';

// ============================================
// SERVICIO DE POSICIONES/PUESTOS PREDEFINIDOS
// ============================================

export const positionsService = {
  // Obtener todas las posiciones
  async getAll(includeInactive: boolean = false): Promise<Position[]> {
    try {
      let query = supabase
        .from('positions')
        .select('*')
        .order('name', { ascending: true });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(transformPositionFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener una posición por ID
  async getById(id: string): Promise<Position | null> {
    try {
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data ? transformPositionFromDB(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Crear una nueva posición
  async create(position: Omit<Position, 'id' | 'createdAt' | 'updatedAt'>): Promise<Position> {
    try {
      const { data, error } = await supabase
        .from('positions')
        .insert(transformPositionToDB(position))
        .select()
        .single();

      if (error) throw error;

      return transformPositionFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar una posición
  async update(id: string, position: Partial<Omit<Position, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Position> {
    try {
      const updateData: any = {};
      if (position.name !== undefined) updateData.name = position.name;
      if (position.description !== undefined) updateData.description = position.description;
      if (position.isActive !== undefined) updateData.is_active = position.isActive;
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('positions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return transformPositionFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar una posición (soft delete marcándola como inactiva)
  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('positions')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar permanentemente una posición
  async deletePermanent(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('positions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};

// ============================================
// TRANSFORMACIONES DB <-> TYPES
// ============================================

function transformPositionFromDB(data: any): Position {
  return {
    id: data.id,
    name: data.name,
    description: data.description || undefined,
    isActive: data.is_active ?? true,
    createdAt: data.created_at || new Date().toISOString(),
    updatedAt: data.updated_at || new Date().toISOString(),
    createdBy: data.created_by || undefined,
    updatedBy: data.updated_by || undefined,
  };
}

function transformPositionToDB(position: Omit<Position, 'id' | 'createdAt' | 'updatedAt'>): any {
  return {
    name: position.name,
    description: position.description || null,
    is_active: position.isActive ?? true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

