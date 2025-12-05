import { supabase, supabaseAdmin } from './supabase';
import { User, UserRole } from '../types';
import { usersService } from './usersService';
import { auditService } from './auditService';

// ============================================
// SERVICIO DE AUTENTICACIÓN
// ============================================

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: {
    name?: string;
    role?: string;
  };
}

export const authService = {
  // Obtener sesión actual
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    return session;
  },

  // Obtener usuario actual
  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  },

  // Iniciar sesión con email y contraseña
  async signIn(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Obtener el usuario de la tabla users
      if (data.user) {
        const dbUser = await usersService.getById(data.user.id);
        if (dbUser) {
          // Actualizar el JWT con el rol del usuario para RLS
          await this.updateUserRole(data.user.id, dbUser.role);
          
          // Registrar login en auditoría
          await auditService.log({
            actionType: 'LOGIN',
            entityType: 'USER',
            entityId: dbUser.id,
            entityName: dbUser.name,
            description: `Usuario "${dbUser.name}" inició sesión`,
          });
          
          return { user: data.user, dbUser };
        }
      }

      return { user: data.user, dbUser: null };
    } catch (error: any) {
      console.error('Error al iniciar sesión:', error);
      throw new Error(error.message || 'Error al iniciar sesión');
    }
  },

  // Cerrar sesión
  async signOut() {
    try {
      // Obtener usuario antes de cerrar sesión para el log
      const { data: { user } } = await supabase.auth.getUser();
      let dbUser = null;
      
      if (user) {
        try {
          dbUser = await usersService.getById(user.id);
        } catch (e) {
          // Ignorar error si no se puede obtener el usuario
        }
      }
      
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Registrar logout en auditoría
      if (dbUser) {
        await auditService.log({
          actionType: 'LOGOUT',
          entityType: 'USER',
          entityId: dbUser.id,
          entityName: dbUser.name,
          description: `Usuario "${dbUser.name}" cerró sesión`,
        });
      }
    } catch (error) {
      throw error;
    }
  },

  // Registrar nuevo usuario (solo para administradores)
  async signUp(email: string, password: string, userData: Partial<User>) {
    try {
      // Verificar que tenemos acceso a supabaseAdmin
      if (!supabaseAdmin) {
        throw new Error('No se puede crear usuario. Service role key no disponible.');
      }

      let createdOrUpdatedUser;

      // Intentar crear el usuario primero (más rápido que listar todos)
      const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Confirmar email automáticamente
        user_metadata: {
          name: userData.name,
          role: userData.role,
        },
      });

      if (createErr) {
        // Si el error es que el usuario ya existe, actualizarlo
        if (createErr.message?.includes('already been registered') || createErr.message?.includes('already registered')) {
          // Buscar el usuario existente por email (necesitamos listUsers para esto)
          const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = usersData?.users?.find(u => u.email === email);
          
          if (existingUser) {
            // Actualizar usuario existente
            const { data: updateData, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
              existingUser.id,
              {
                password: password, // Actualizar contraseña
                email_confirm: true, // Confirmar email
                user_metadata: {
                  name: userData.name,
                  role: userData.role,
                },
              }
            );

            if (updateErr) throw updateErr;
            createdOrUpdatedUser = updateData.user;
          } else {
            throw new Error('El usuario existe pero no se pudo encontrar para actualizar.');
          }
        } else {
          throw createErr;
        }
      } else {
        // Usuario creado exitosamente
        createdOrUpdatedUser = createData.user;
      }

      // Crear o actualizar el usuario en la tabla users
      if (createdOrUpdatedUser) {
        // Verificar si ya existe en la tabla users
        const existingDbUser = await usersService.getById(createdOrUpdatedUser.id);
        
        let dbUser;
        if (existingDbUser) {
          // Actualizar usuario existente
          dbUser = await usersService.update(createdOrUpdatedUser.id, {
            name: userData.name || email,
            email: email,
            role: userData.role || 'OPERATIONS',
            avatar: userData.avatar || userData.name?.substring(0, 2).toUpperCase(),
            linkedClientNames: userData.linkedClientNames,
          });
        } else {
          // Crear nuevo usuario en la tabla con contraseña temporal
          dbUser = await usersService.create({
            id: createdOrUpdatedUser.id,
            name: userData.name || email,
            email: email,
            role: userData.role || 'OPERATIONS',
            avatar: userData.avatar || userData.name?.substring(0, 2).toUpperCase(),
            linkedClientNames: userData.linkedClientNames,
            temporaryPassword: password, // Guardar contraseña temporalmente
          });
        }

        // Actualizar el rol en Auth después de crear/actualizar el usuario
        if (dbUser) {
          await this.updateUserRole(dbUser.id, dbUser.role);
        }

        return { user: createdOrUpdatedUser, dbUser };
      }

      return { user: createdOrUpdatedUser, dbUser: null };
    } catch (error: any) {
      console.error('Error al registrar usuario:', error);
      throw new Error(error.message || 'Error al registrar usuario');
    }
  },

  // Actualizar el rol del usuario en el JWT (para RLS)
  async updateUserRole(userId: string, role: UserRole) {
    try {
      // Actualizar los metadatos del usuario en Supabase Auth
      // Esto actualiza raw_user_meta_data que es usado por get_current_user_role()
      const { data, error } = await supabase.auth.updateUser({
        data: {
          role: role,
        },
      });

      if (error) {
        console.error('Error al actualizar rol en Auth:', error);
        throw error;
      }

      // Esperar un momento para que el cambio se propague
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Verificar que se actualizó correctamente
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.user_metadata?.role !== role) {
        console.warn('El rol no se actualizó correctamente en los metadatos');
      }
    } catch (error) {
      console.error('Error al actualizar rol del usuario:', error);
      throw error;
    }
  },

  // Cambiar contraseña de un usuario (solo para administradores)
  async updatePassword(userId: string, newPassword: string) {
    try {
      // Verificar que el usuario actual es admin
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        throw new Error('No hay usuario autenticado');
      }

      const dbUser = await usersService.getById(currentUser.id);
      if (!dbUser || dbUser.role !== 'ADMIN') {
        throw new Error('Solo los administradores pueden cambiar contraseñas');
      }

      // Si es el mismo usuario, puede cambiar su propia contraseña directamente
      if (currentUser.id === userId) {
        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (error) throw error;
        
        // Registrar en auditoría
        await auditService.log({
          actionType: 'UPDATE',
          entityType: 'USER',
          entityId: userId,
          entityName: dbUser.name,
          description: `Contraseña actualizada por el propio usuario`,
        });
        return;
      }

      // Para otros usuarios, usar directamente supabaseAdmin (service_role)
      // NOTA: La Edge Function está dando 404, así que usamos esta solución temporal
      // En producción, deberías usar una Edge Function que funcione correctamente
      
      if (!supabaseAdmin) {
        throw new Error('No se puede cambiar la contraseña. Service role key no disponible.');
      }

      // Verificar que el usuario existe en Supabase Auth antes de cambiar la contraseña
      const { data: authUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
      
      if (getUserError || !authUser) {
        throw new Error(`El usuario no existe en Supabase Auth. Este usuario probablemente fue creado directamente en la base de datos sin una cuenta de autenticación. Para cambiar la contraseña, el usuario debe tener una cuenta creada a través del sistema de registro.`);
      }

      // Cambiar la contraseña usando el cliente admin (sin enviar email)
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        { 
          password: newPassword,
          email_confirm: true // Evita enviar email de confirmación
        }
      );

      if (updateError) {
        throw new Error(updateError.message || 'Error al cambiar la contraseña');
      }

      // Registrar en auditoría
      const targetUser = await usersService.getById(userId);
      if (targetUser) {
        await auditService.log({
          actionType: 'UPDATE',
          entityType: 'USER',
          entityId: userId,
          entityName: targetUser.name,
          description: `Contraseña actualizada por administrador`,
        });
      }
    } catch (error: any) {
      console.error('Error al cambiar contraseña:', error);
      throw new Error(error.message || 'Error al cambiar la contraseña');
    }
  },

  // Cambiar la propia contraseña del usuario actual
  async changeOwnPassword(newPassword: string) {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Error al cambiar contraseña:', error);
      throw new Error(error.message || 'Error al cambiar la contraseña');
    }
  },

  // Enviar email de reset de contraseña
  async sendPasswordResetEmail(email: string) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Error al enviar email de reset:', error);
      throw new Error(error.message || 'Error al enviar email de reset');
    }
  },

  // Escuchar cambios en la autenticación
  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  },
};

