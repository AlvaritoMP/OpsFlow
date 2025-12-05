import { supabase, handleSupabaseError } from './supabase';
import { Zone } from '../types';

// ============================================
// CRUD PARA ZONES
// ============================================

export const zonesService = {
  // Obtener todas las zonas de una unidad
  async getByUnitId(unitId: string): Promise<Zone[]> {
    try {
      const { data, error } = await supabase
        .from('zones')
        .select('*, zone_shifts(shift_name)')
        .eq('unit_id', unitId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(transformZoneFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener una zona por ID
  async getById(id: string): Promise<Zone | null> {
    try {
      const { data, error } = await supabase
        .from('zones')
        .select('*, zone_shifts(shift_name)')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data ? transformZoneFromDB(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Crear una zona
  async create(zone: Partial<Zone>, unitId: string): Promise<Zone> {
    try {
      const zoneData = transformZoneToDB(zone, unitId);

      const { data, error } = await supabase
        .from('zones')
        .insert(zoneData)
        .select()
        .single();

      if (error) throw error;

      // Insertar turnos si existen
      if (zone.shifts && zone.shifts.length > 0) {
        await supabase.from('zone_shifts').insert(
          zone.shifts.map(shiftName => ({
            zone_id: data.id,
            shift_name: shiftName,
          }))
        );
      }

      return await this.getById(data.id) || zone as Zone;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar una zona
  async update(id: string, zone: Partial<Zone>): Promise<Zone> {
    try {
      const zoneData = transformZoneToDB(zone);

      const { error } = await supabase
        .from('zones')
        .update(zoneData)
        .eq('id', id);

      if (error) throw error;

      // Actualizar turnos si se proporcionan
      if (zone.shifts !== undefined) {
        await supabase.from('zone_shifts').delete().eq('zone_id', id);
        if (zone.shifts.length > 0) {
          await supabase.from('zone_shifts').insert(
            zone.shifts.map(shiftName => ({
              zone_id: id,
              shift_name: shiftName,
            }))
          );
        }
      }

      return await this.getById(id) || zone as Zone;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar una zona
  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('zones')
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
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function transformZoneFromDB(data: any): Zone {
  return {
    id: data.id,
    name: data.name,
    shifts: data.zone_shifts?.map((s: any) => s.shift_name) || [],
    area: data.area ? Number(data.area) : undefined,
    layout: data.layout_x ? {
      x: data.layout_x,
      y: data.layout_y,
      w: data.layout_w,
      h: data.layout_h,
      color: data.layout_color,
      layerId: data.layout_layer_id,
    } : undefined,
  };
}

function transformZoneToDB(zone: Partial<Zone>, unitId?: string): any {
  return {
    unit_id: unitId,
    name: zone.name,
    area: zone.area,
    layout_x: zone.layout?.x,
    layout_y: zone.layout?.y,
    layout_w: zone.layout?.w,
    layout_h: zone.layout?.h,
    layout_color: zone.layout?.color,
    layout_layer_id: zone.layout?.layerId,
  };
}

