import { supabase, handleSupabaseError } from './supabase';
import { SalaryIncrement } from '../types';

// ============================================
// CRUD PARA SALARY INCREMENTS
// ============================================

export const salaryIncrementsService = {
  // Obtener todos los incrementos de un trabajador
  async getByResourceId(resourceId: string): Promise<SalaryIncrement[]> {
    try {
      const { data, error } = await supabase
        .from('salary_increments')
        .select('*')
        .eq('resource_id', resourceId)
        .order('effective_date', { ascending: false });

      if (error) throw error;

      return data.map(transformFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Crear un nuevo incremento salarial
  async create(increment: {
    resourceId: string;
    previousSalary: number;
    newSalary: number;
    incrementDate: string;
    effectiveDate: string;
    notes?: string;
  }): Promise<SalaryIncrement> {
    try {
      const { data, error } = await supabase
        .from('salary_increments')
        .insert({
          resource_id: increment.resourceId,
          previous_salary: increment.previousSalary,
          new_salary: increment.newSalary,
          increment_date: increment.incrementDate,
          effective_date: increment.effectiveDate,
          notes: increment.notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Actualizar el salario actual del trabajador
      const { error: updateError } = await supabase
        .from('resources')
        .update({ monthly_salary: increment.newSalary })
        .eq('id', increment.resourceId);

      if (updateError) {
        console.error('Error al actualizar salario del trabajador:', updateError);
        // No lanzamos error aquí para no revertir el incremento ya creado
      }

      return transformFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Obtener un incremento por ID
  async getById(id: string): Promise<SalaryIncrement | null> {
    try {
      const { data, error } = await supabase
        .from('salary_increments')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return transformFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Actualizar un incremento
  async update(id: string, updates: {
    previousSalary?: number;
    newSalary?: number;
    incrementDate?: string;
    effectiveDate?: string;
    notes?: string;
  }): Promise<SalaryIncrement> {
    try {
      const updateData: any = {};
      if (updates.previousSalary !== undefined) updateData.previous_salary = updates.previousSalary;
      if (updates.newSalary !== undefined) updateData.new_salary = updates.newSalary;
      if (updates.incrementDate !== undefined) updateData.increment_date = updates.incrementDate;
      if (updates.effectiveDate !== undefined) updateData.effective_date = updates.effectiveDate;
      if (updates.notes !== undefined) updateData.notes = updates.notes || null;

      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('salary_increments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Si se actualizó el nuevo salario, actualizar también el salario del trabajador
      if (updates.newSalary !== undefined) {
        const increment = await this.getById(id);
        if (increment) {
          const { error: updateError } = await supabase
            .from('resources')
            .update({ monthly_salary: updates.newSalary })
            .eq('id', increment.resourceId);

          if (updateError) {
            console.error('Error al actualizar salario del trabajador:', updateError);
          }
        }
      }

      return transformFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar un incremento
  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('salary_increments')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};

// Transformar datos de la base de datos al formato de la aplicación
function transformFromDB(data: any): SalaryIncrement {
  return {
    id: data.id,
    resourceId: data.resource_id,
    previousSalary: parseFloat(data.previous_salary) || 0,
    newSalary: parseFloat(data.new_salary) || 0,
    incrementDate: data.increment_date,
    effectiveDate: data.effective_date,
    notes: data.notes || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
