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
      console.log('🔍 Consultando tabla users...');
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) {
        console.error('❌ Error al obtener usuarios:', usersError);
        console.error('Código de error:', usersError.code);
        console.error('Mensaje:', usersError.message);
        console.error('Detalles:', usersError.details);
        console.error('Hint:', usersError.hint);
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
      const rpc = await (supabase as any).rpc('delete_opsflow_user', { p_user_id: id });
      if (!rpc.error) {
        return;
      }

      const rpcMissing =
        rpc.error?.code === 'PGRST202' ||
        String(rpc.error?.message || '').toLowerCase().includes('could not find the function');
      if (!rpcMissing) {
        console.warn('RPC delete_opsflow_user falló, intentando limpieza en cliente:', rpc.error);
      }

      await detachUserReferences(id);

      for (let attempt = 0; attempt < 4; attempt++) {
        const result = await deleteUserRow(id);
        if (result.status === 'deleted') return;

        if (result.status === 'missing') {
          throw new Error(
            'No se pudo eliminar el usuario. Es posible que ya no exista o que no tengas permisos.'
          );
        }

        await detachUserReferences(id, { forceDeleteRestricted: attempt > 0 });
        if (result.table) {
          await detachBlockingTable(result.table, id, attempt > 0);
        }
      }

      throw new Error(formatUserDeleteError({ message: 'foreign key constraint' }));
    } catch (error: any) {
      try {
        handleSupabaseError(error);
      } catch (wrapped: any) {
        if (wrapped?.name === 'NetworkError' || wrapped?.name === 'TimeoutError') {
          throw wrapped;
        }
        throw new Error(formatUserDeleteError(wrapped || error));
      }
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

// ============================================
// ELIMINACIÓN: desvincular FKs antes de borrar
// ============================================

const USER_OWNED_ROWS: Array<{ table: string; column: string }> = [
  { table: 'user_client_links', column: 'user_id' },
  { table: 'user_visible_units', column: 'user_id' },
  { table: 'inv_warehouse_access', column: 'user_id' },
];

const USER_NULLABLE_FKS: Array<{ table: string; column: string }> = [
  { table: 'night_supervision_shifts', column: 'created_by' },
  { table: 'night_supervision_shifts', column: 'updated_by' },
  { table: 'night_supervision_calls', column: 'created_by' },
  { table: 'night_supervision_calls', column: 'updated_by' },
  { table: 'night_supervision_camera_reviews', column: 'created_by' },
  { table: 'night_supervision_camera_reviews', column: 'updated_by' },
  { table: 'night_supervision_alerts', column: 'resolved_by' },
  { table: 'vacation_balances', column: 'updated_by' },
  { table: 'vacation_day_entries', column: 'created_by' },
  { table: 'vacation_day_entries', column: 'cancelled_by' },
  { table: 'vacation_day_entries', column: 'updated_by' },
  { table: 'vacation_papeletas', column: 'issued_by' },
  { table: 'vacation_papeletas', column: 'authorized_by' },
  { table: 'vacation_papeletas', column: 'cancelled_by' },
  { table: 'vacation_papeletas', column: 'updated_by' },
  { table: 'vacation_authorization_requests', column: 'resolved_by' },
  { table: 'unit_documents', column: 'uploaded_by' },
  { table: 'unit_bpo_bank_statements', column: 'uploaded_by' },
  { table: 'resource_bpo_personnel_documents', column: 'uploaded_by' },
  { table: 'positions', column: 'created_by' },
  { table: 'positions', column: 'updated_by' },
  { table: 'inventory_products', column: 'created_by' },
  { table: 'inventory_products', column: 'updated_by' },
  { table: 'attendance_report_imports', column: 'uploaded_by' },
  { table: 'audit_logs', column: 'user_id' },
];

function isIgnorableSchemaError(error: any): boolean {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the') ||
    msg.includes('schema cache')
  );
}

function isNotNullViolation(error: any): boolean {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return code === '23502' || msg.includes('null value') || msg.includes('not-null');
}

function isForeignKeyError(error: any): boolean {
  const code = String(error?.code || '');
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return code === '23503' || text.includes('foreign key') || text.includes('still referenced');
}

function parseReferencedTable(error: any): string | undefined {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  const match =
    text.match(/from table ["']([^"']+)["']/i) ||
    text.match(/on table ["']([^"']+)["']/i) ||
    text.match(/table ["']([^"']+)["']/i);
  return match?.[1];
}

function formatUserDeleteError(error: any): string {
  const message = String(error?.message || error || '');
  if (isForeignKeyError(error) || message.toLowerCase().includes('foreign key')) {
    return 'No se pudo eliminar el usuario porque todavía tiene registros asociados (por ejemplo supervisión nocturna o vacaciones). Inténtalo de nuevo.';
  }
  return message || 'Error al eliminar el usuario. Por favor, intente nuevamente.';
}

async function runCleanup(
  action: () => Promise<{ error: any } | { error: any | null }>
): Promise<void> {
  const { error } = await action();
  if (error && !isIgnorableSchemaError(error)) {
    console.warn('Limpieza al eliminar usuario:', error);
  }
}

async function detachUserReferences(
  userId: string,
  options: { forceDeleteRestricted?: boolean } = {}
): Promise<void> {
  for (const { table, column } of USER_OWNED_ROWS) {
    await runCleanup(() => supabase.from(table as any).delete().eq(column, userId));
  }

  for (const { table, column } of USER_NULLABLE_FKS) {
    await runCleanup(() =>
      supabase.from(table as any).update({ [column]: null }).eq(column, userId)
    );
  }

  // Solicitudes de vacaciones: el usuario es dueño o autorizador (columnas NOT NULL)
  await runCleanup(() =>
    supabase.from('vacation_authorization_requests').delete().eq('requester_id', userId)
  );
  await runCleanup(() =>
    supabase
      .from('vacation_authorization_requests')
      .delete()
      .eq('assigned_authorizer_id', userId)
  );

  const { error: supervisorNullError } = await supabase
    .from('night_supervision_shifts')
    .update({ supervisor_id: null })
    .eq('supervisor_id', userId);

  if (supervisorNullError && !isIgnorableSchemaError(supervisorNullError)) {
    if (options.forceDeleteRestricted && isNotNullViolation(supervisorNullError)) {
      await runCleanup(() =>
        supabase.from('night_supervision_shifts').delete().eq('supervisor_id', userId)
      );
    } else if (!isNotNullViolation(supervisorNullError)) {
      console.warn('No se pudo desvincular supervisión nocturna:', supervisorNullError);
    }
  }
}

async function detachBlockingTable(
  table: string,
  userId: string,
  forceDelete: boolean
): Promise<void> {
  if (table === 'night_supervision_shifts') {
    if (forceDelete) {
      await runCleanup(() =>
        supabase.from('night_supervision_shifts').delete().eq('supervisor_id', userId)
      );
    }
    return;
  }

  if (table === 'vacation_authorization_requests') {
    await runCleanup(() =>
      supabase.from('vacation_authorization_requests').delete().eq('requester_id', userId)
    );
    await runCleanup(() =>
      supabase
        .from('vacation_authorization_requests')
        .delete()
        .eq('assigned_authorizer_id', userId)
    );
    return;
  }

  const columns = [
    'user_id',
    'supervisor_id',
    'requester_id',
    'assigned_authorizer_id',
    'created_by',
    'updated_by',
    'uploaded_by',
    'issued_by',
    'authorized_by',
    'cancelled_by',
    'resolved_by',
  ];
  for (const column of columns) {
    await runCleanup(() =>
      supabase.from(table as any).update({ [column]: null }).eq(column, userId)
    );
  }
}

async function deleteUserRow(
  id: string
): Promise<{ status: 'deleted' | 'missing' | 'fk'; table?: string }> {
  const { data, error } = await supabase.from('users').delete().eq('id', id).select('id');
  if (error) {
    if (isForeignKeyError(error)) {
      return { status: 'fk', table: parseReferencedTable(error) };
    }
    throw error;
  }
  return { status: data && data.length > 0 ? 'deleted' : 'missing' };
}

