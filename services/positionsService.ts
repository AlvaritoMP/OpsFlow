import { supabase, handleSupabaseError } from './supabase';
import { Position } from '../types';

// ============================================
// SERVICIO DE POSICIONES/PUESTOS PREDEFINIDOS
// ============================================

export const positionsService = {
  // Obtener todas las posiciones
  async getAll(includeInactive: boolean = false): Promise<Position[]> {
    try {
      console.log('🔍 positionsService.getAll - Iniciando consulta...', { includeInactive });
      
      // Verificar sesión de Supabase Auth primero
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.warn('⚠️ positionsService.getAll - No hay sesión de Supabase Auth activa');
        console.warn('⚠️ Esto puede causar problemas con RLS. Intentando consulta de todas formas...');
      } else {
        console.log('✅ positionsService.getAll - Sesión de Supabase Auth activa:', session.user.id);
      }
      
      let query = supabase
        .from('positions')
        .select('*')
        .order('name', { ascending: true });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ positionsService.getAll - Error de Supabase:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          hasSession: !!session
        });
        
        // Si es un error de RLS o permisos, dar un mensaje más claro
        if (error.code === '42501' || 
            error.message?.includes('permission denied') || 
            error.message?.includes('row-level security') ||
            error.message?.includes('new row violates row-level security')) {
          console.error('⚠️ Error de permisos RLS en tabla positions.');
          console.error('⚠️ Verifica que:');
          console.error('   1. Tengas una sesión de Supabase Auth activa (cierra sesión y vuelve a iniciar)');
          console.error('   2. Las políticas RLS estén configuradas correctamente');
          console.error('   3. Se haya ejecutado el script fix_positions_rls_policies_safe.sql');
          
          // Intentar una consulta más simple como fallback
          console.log('🔄 Intentando consulta alternativa...');
          try {
            const { data: fallbackData, error: fallbackError } = await supabase
              .from('positions')
              .select('id, name, is_active')
              .eq('is_active', true)
              .order('name', { ascending: true })
              .limit(100);
            
            if (!fallbackError && fallbackData) {
              console.log(`✅ Consulta alternativa exitosa: ${fallbackData.length} puestos encontrados`);
              const transformed = fallbackData.map((p: any) => ({
                id: p.id,
                name: p.name,
                description: undefined,
                isActive: p.is_active ?? true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }));
              return transformed;
            }
          } catch (fallbackErr) {
            console.error('❌ Consulta alternativa también falló:', fallbackErr);
          }
        }
        
        throw error;
      }

      console.log(`✅ positionsService.getAll - ${data?.length || 0} puestos encontrados`);
      const transformed = (data || []).map(transformPositionFromDB);
      console.log('📋 Puestos transformados:', transformed.length);
      
      if (transformed.length === 0) {
        console.warn('⚠️ positionsService.getAll - No se encontraron puestos. Verifica:');
        console.warn('   1. Que existan puestos en la base de datos');
        console.warn('   2. Que las políticas RLS permitan el acceso');
        console.warn('   3. Que tengas una sesión de Supabase Auth activa');
      }
      
      return transformed;
    } catch (error: any) {
      console.error('❌ positionsService.getAll - Error completo:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        stack: error.stack
      });
      
      // No lanzar el error, solo retornar array vacío para que la app no se rompa
      // El componente mostrará un mensaje si no hay puestos
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

