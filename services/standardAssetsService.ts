import { supabase, handleSupabaseError } from './supabase';
import { StandardAsset } from '../types';

// ============================================
// SERVICIO DE ACTIVOS ESTÁNDAR
// ============================================

export const standardAssetsService = {
  // Obtener todos los activos estándar
  async getAll(includeInactive: boolean = false): Promise<StandardAsset[]> {
    try {
      let query = supabase
        .from('standard_assets')
        .select('*')
        .order('type', { ascending: true })
        .order('name', { ascending: true });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(transformStandardAssetFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener activos por tipo
  async getByType(type: StandardAsset['type'], includeInactive: boolean = false): Promise<StandardAsset[]> {
    try {
      let query = supabase
        .from('standard_assets')
        .select('*')
        .eq('type', type)
        .order('name', { ascending: true });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(transformStandardAssetFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener un activo por ID
  async getById(id: string): Promise<StandardAsset | null> {
    try {
      const { data, error } = await supabase
        .from('standard_assets')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data ? transformStandardAssetFromDB(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Crear un nuevo activo estándar
  async create(asset: Omit<StandardAsset, 'id' | 'createdAt' | 'updatedAt'>): Promise<StandardAsset> {
    try {
      const { data, error } = await supabase
        .from('standard_assets')
        .insert(transformStandardAssetToDB(asset))
        .select()
        .single();

      if (error) throw error;

      return transformStandardAssetFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar un activo estándar
  async update(id: string, asset: Partial<Omit<StandardAsset, 'id' | 'createdAt' | 'updatedAt'>>): Promise<StandardAsset> {
    try {
      const updateData: any = {};
      if (asset.name !== undefined) updateData.name = asset.name;
      if (asset.type !== undefined) updateData.type = asset.type;
      if (asset.description !== undefined) updateData.description = asset.description;
      if (asset.defaultSerialNumberPrefix !== undefined) updateData.default_serial_number_prefix = asset.defaultSerialNumberPrefix;
      if (asset.isActive !== undefined) updateData.is_active = asset.isActive;
      if (asset.updatedBy !== undefined) updateData.updated_by = asset.updatedBy;

      const { data, error } = await supabase
        .from('standard_assets')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return transformStandardAssetFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar (desactivar) un activo estándar
  async delete(id: string): Promise<void> {
    try {
      // Soft delete: solo desactivar
      const { error } = await supabase
        .from('standard_assets')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Reactivar un activo estándar
  async reactivate(id: string): Promise<StandardAsset> {
    try {
      const { data, error } = await supabase
        .from('standard_assets')
        .update({ is_active: true })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return transformStandardAssetFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function transformStandardAssetToDB(asset: Omit<StandardAsset, 'id' | 'createdAt' | 'updatedAt'>): any {
  return {
    name: asset.name,
    type: asset.type,
    description: asset.description || null,
    default_serial_number_prefix: asset.defaultSerialNumberPrefix || null,
    is_active: asset.isActive !== undefined ? asset.isActive : true,
    created_by: asset.createdBy || null,
    updated_by: asset.updatedBy || null,
  };
}

function transformStandardAssetFromDB(data: any): StandardAsset {
  return {
    id: data.id,
    name: data.name,
    type: data.type,
    description: data.description || undefined,
    defaultSerialNumberPrefix: data.default_serial_number_prefix || undefined,
    isActive: data.is_active !== undefined ? data.is_active : true,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    createdBy: data.created_by || undefined,
    updatedBy: data.updated_by || undefined,
  };
}

