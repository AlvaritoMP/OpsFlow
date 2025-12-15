import { supabase, handleSupabaseError } from './supabase';
import { ManagementStaff, ManagementRole } from '../types';

// ============================================
// CRUD PARA MANAGEMENT_STAFF
// ============================================

export const managementStaffService = {
  // Obtener todo el personal de gestión (excluyendo archivados por defecto)
  async getAll(includeArchived: boolean = false): Promise<ManagementStaff[]> {
    try {
      let query = supabase
        .from('management_staff')
        .select('*');
      
      // Si no se incluyen archivados, filtrarlos
      if (!includeArchived) {
        query = query.eq('archived', false);
      }
      
      const { data, error } = await query
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map(transformStaffFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener solo personal archivado
  async getArchived(): Promise<ManagementStaff[]> {
    try {
      const { data, error } = await supabase
        .from('management_staff')
        .select('*')
        .eq('archived', true)
        .order('end_date', { ascending: false });

      if (error) throw error;

      return data.map(transformStaffFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener un miembro del staff por ID
  async getById(id: string): Promise<ManagementStaff | null> {
    try {
      const { data, error } = await supabase
        .from('management_staff')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data ? transformStaffFromDB(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Crear un miembro del staff
  async create(staff: Partial<ManagementStaff>): Promise<ManagementStaff> {
    try {
      const staffData = transformStaffToDB(staff);

      const { data, error } = await supabase
        .from('management_staff')
        .insert(staffData)
        .select()
        .single();

      if (error) throw error;

      return await this.getById(data.id) || staff as ManagementStaff;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar un miembro del staff
  async update(id: string, staff: Partial<ManagementStaff>): Promise<ManagementStaff> {
    try {
      const staffData = transformStaffToDB(staff);

      const { error } = await supabase
        .from('management_staff')
        .update(staffData)
        .eq('id', id);

      if (error) throw error;

      return await this.getById(id) || staff as ManagementStaff;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Archivar un miembro del staff
  async archive(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('management_staff')
        .update({ archived: true })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Desarchivar un miembro del staff
  async unarchive(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('management_staff')
        .update({ archived: false })
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar un miembro del staff
  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('management_staff')
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

function transformStaffFromDB(data: any): ManagementStaff {
  return {
    id: data.id,
    name: data.name,
    role: data.role as ManagementRole,
    email: data.email,
    phone: data.phone,
    photo: data.photo,
    dni: data.dni,
    startDate: data.start_date,
    endDate: data.end_date,
    status: data.status as 'activo' | 'cesado' || 'activo',
    archived: data.archived || false,
  };
}

function transformStaffToDB(staff: Partial<ManagementStaff>): any {
  const result: any = {
    name: staff.name,
    role: staff.role,
    email: staff.email,
    phone: staff.phone,
    photo: staff.photo,
  };

  // Incluir nuevos campos si están presentes
  if (staff.dni !== undefined) result.dni = staff.dni || null;
  
  // Convertir cadenas vacías a null para campos de fecha
  if (staff.startDate !== undefined) {
    result.start_date = (staff.startDate && staff.startDate.trim() !== '') ? staff.startDate : null;
  }
  if (staff.endDate !== undefined) {
    result.end_date = (staff.endDate && staff.endDate.trim() !== '') ? staff.endDate : null;
  }
  
  if (staff.status !== undefined) result.status = staff.status;
  if (staff.archived !== undefined) result.archived = staff.archived;

  return result;
}

