import { supabase, handleSupabaseError } from './supabase';
import { User, UserRole } from '../types';

// ============================================
// CRUD PARA USERS
// ============================================

export const usersService = {
  // Obtener todos los usuarios
  async getAll(): Promise<User[]> {
    try {
      console.log('🔍 Obteniendo usuarios de la base de datos...');
      
      // Obtener usuarios primero
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) {
        console.error('❌ Error al obtener usuarios:', usersError);
        console.error('Código de error:', usersError.code);
        console.error('Mensaje:', usersError.message);
        throw usersError;
      }

      console.log(`📊 Usuarios encontrados en BD: ${usersData?.length || 0}`);

      if (!usersData || usersData.length === 0) {
        console.warn('⚠️ No se encontraron usuarios en la base de datos');
        return [];
      }

      // Obtener todos los vínculos de clientes en una sola consulta
      const userIds = usersData.map(u => u.id);
      const { data: linksData, error: linksError } = await supabase
        .from('user_client_links')
        .select('user_id, client_name')
        .in('user_id', userIds);

      if (linksError) {
        console.warn('⚠️ Error al obtener vínculos de clientes:', linksError);
      }

      // Agrupar links por user_id
      const linksByUserId = (linksData || []).reduce((acc: any, link: any) => {
        if (!acc[link.user_id]) acc[link.user_id] = [];
        acc[link.user_id].push({ client_name: link.client_name });
        return acc;
      }, {});

      // Combinar datos
      const transformedUsers = usersData.map(user => transformUserFromDB({
        ...user,
        user_client_links: linksByUserId[user.id] || []
      }));

      console.log(`✅ Usuarios transformados: ${transformedUsers.length}`);
      return transformedUsers;
    } catch (error: any) {
      console.error('❌ Error en getAll:', error);
      console.error('Tipo de error:', error?.constructor?.name);
      console.error('Stack:', error?.stack);
      // No retornar array vacío si hay un error crítico, lanzar el error
      if (error?.code === 'PGRST301' || error?.message?.includes('permission') || error?.message?.includes('policy')) {
        console.error('⚠️ Error de permisos RLS. Verifica las políticas de seguridad en Supabase.');
      }
      throw error; // Lanzar el error para que el hook pueda manejarlo
    }
  },

  // Obtener un usuario por ID
  // NOTA: Esta operación respeta las políticas RLS de Supabase.
  // Asegúrate de que las políticas RLS permitan a los usuarios leer su propia información.
  async getById(id: string): Promise<User | null> {
    try {
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (userError) {
        // Si es "no encontrado" (PGRST116) o cualquier error que indique que no existe
        if (userError.code === 'PGRST116' || 
            userError.code === 'PGRST301' || 
            userError.message?.includes('406') ||
            userError.message?.includes('Not Acceptable')) {
          console.log('getById: Usuario no encontrado en la tabla users (código:', userError.code, 'mensaje:', userError.message, ')');
          return null;
        }
        
        // Para otros errores, retornar null en lugar de lanzar
        console.error('getById: Error al obtener usuario:', userError);
        return null;
      }

      if (!userData) return null;

      // Obtener los clientes vinculados por separado
      const { data: linksData } = await supabase
        .from('user_client_links')
        .select('client_name')
        .eq('user_id', id);

      return transformUserFromDB({
        ...userData,
        user_client_links: linksData || []
      });
    } catch (error) {
      console.error('Error en getById:', error);
      // No lanzar error, solo retornar null para que la app pueda continuar
      return null;
    }
  },

  // Crear un usuario
  async create(user: Partial<User>): Promise<User> {
    try {
      if (!user.id) {
        throw new Error('El ID del usuario es requerido');
      }
      
      // Preparar datos del usuario
      const userData = transformUserToDB({
        ...user,
        id: user.id,
      });

      console.log('Creando usuario con ID:', userData.id);

      // Insertar usuario en la tabla
      const { data, error } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();

      if (error) {
        console.error('Error al insertar usuario:', error);
        throw error;
      }

      // Insertar vínculos con clientes si existen
      if (user.linkedClientNames && user.linkedClientNames.length > 0) {
        await supabase.from('user_client_links').insert(
          user.linkedClientNames.map(clientName => ({
            user_id: data.id,
            client_name: clientName,
          }))
        );
      }

      return await this.getById(data.id) || user as User;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar un usuario
  async update(id: string, user: Partial<User>): Promise<User> {
    try {
      const userData = transformUserToDB(user);

      const { error } = await supabase
        .from('users')
        .update(userData)
        .eq('id', id);

      if (error) throw error;

      // Actualizar vínculos con clientes
      if (user.linkedClientNames !== undefined) {
        // Eliminar vínculos existentes
        await supabase.from('user_client_links').delete().eq('user_id', id);
        
        // Insertar nuevos vínculos
        if (user.linkedClientNames.length > 0) {
          await supabase.from('user_client_links').insert(
            user.linkedClientNames.map(clientName => ({
              user_id: id,
              client_name: clientName,
            }))
          );
        }
      }

      return await this.getById(id) || user as User;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar un usuario
  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('users')
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

function transformUserFromDB(data: any): User {
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    role: data.role as UserRole,
    avatar: data.avatar,
    linkedClientNames: data.user_client_links?.map((link: any) => link.client_name) || [],
    // NO incluir password_hash en el objeto User retornado por seguridad
  };
}

function transformUserToDB(user: Partial<User>): any {
  const result: any = {
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar,
  };
  
  // Incluir id si se proporciona (necesario para crear usuarios)
  if (user.id) {
    result.id = user.id;
  }
  
  // Incluir password_hash si se proporciona password (se hasheará antes de guardar)
  // O incluir password_hash directamente si se proporciona
  if (user.password_hash !== undefined) {
    result.password_hash = user.password_hash;
  }
  // Si se proporciona password pero no password_hash, se debe hashear antes de llamar a esta función
  
  return result;
}

