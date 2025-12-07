import { supabase } from './supabase';
import { User, UserRole } from '../types';
import { usersService } from './usersService';
import { auditService } from './auditService';
import { hashPassword, verifyPassword } from '../utils/passwordHash';

// ============================================
// SERVICIO DE AUTENTICACIÓN SIMPLE
// (Sin Supabase Auth - basado en tabla users)
// ============================================

const SESSION_STORAGE_KEY = 'OPSFLOW_SESSION';

export interface Session {
  userId: string;
  email: string;
  timestamp: number;
}

export const authService = {
  // Obtener sesión actual desde localStorage
  getSession(): Session | null {
    try {
      const sessionStr = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!sessionStr) return null;
      
      const session = JSON.parse(sessionStr) as Session;
      // Verificar que la sesión no sea muy antigua (opcional: 30 días)
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 días
      if (Date.now() - session.timestamp > maxAge) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        return null;
      }
      
      return session;
    } catch (error) {
      console.error('Error al obtener sesión:', error);
      return null;
    }
  },

  // Obtener usuario actual desde la sesión
  async getCurrentUser(): Promise<User | null> {
    const session = this.getSession();
    if (!session) return null;
    
    try {
      return await usersService.getById(session.userId);
    } catch (error) {
      console.error('Error al obtener usuario actual:', error);
      return null;
    }
  },

  // Iniciar sesión con email y contraseña
  async signIn(email: string, password: string) {
    try {
      // Primero intentar Supabase Auth (para usuarios existentes, especialmente ADMIN)
      // Esto evita problemas con RLS cuando el usuario aún no está autenticado
      let authData: any = null;
      let authError: any = null;
      
      try {
        const authResult = await supabase.auth.signInWithPassword({
          email: email.toLowerCase(),
          password: password,
        });
        authData = authResult.data;
        authError = authResult.error;
      } catch (err) {
        authError = err;
      }

      // Si Supabase Auth funciona, usar ese usuario
      if (!authError && authData?.user) {
        const authUserId = authData.user.id;
        
        // Buscar o crear usuario en la tabla users
        let usersData: any = null;
        const { data: existingUser } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUserId)
          .single();

        if (existingUser) {
          usersData = existingUser;
        } else {
          // Si no existe en users, crearlo
          const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert({
              id: authUserId,
              email: email.toLowerCase(),
              name: authData.user.user_metadata?.name || email.split('@')[0],
              role: authData.user.user_metadata?.role || 'OPERATIONS',
            })
            .select()
            .single();
          
          if (createError) {
            console.error('Error al crear usuario en tabla:', createError);
            // Continuar de todas formas con el usuario de Auth
            usersData = {
              id: authUserId,
              email: email.toLowerCase(),
              name: authData.user.user_metadata?.name || email.split('@')[0],
              role: authData.user.user_metadata?.role || 'OPERATIONS',
            };
          } else {
            usersData = newUser;
          }
        }

        // Migrar contraseña a password_hash si no existe
        if (!usersData.password_hash) {
          const hashedPassword = await hashPassword(password);
          await supabase
            .from('users')
            .update({ password_hash: hashedPassword })
            .eq('id', authUserId);
        }

        // Cerrar sesión de Supabase Auth
        await supabase.auth.signOut();

        // Crear sesión local
        const session: Session = {
          userId: usersData.id,
          email: usersData.email,
          timestamp: Date.now(),
        };
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

        // Obtener usuario completo
        const dbUser = await usersService.getById(usersData.id);
        if (!dbUser) {
          throw new Error('Error al obtener datos del usuario');
        }

        // Registrar login en auditoría
        await auditService.log({
          actionType: 'LOGIN',
          entityType: 'USER',
          entityId: dbUser.id,
          entityName: dbUser.name,
          description: `Usuario "${dbUser.name}" inició sesión`,
        });

        return { user: dbUser, dbUser };
      }

      // Si Supabase Auth no funciona, lanzar error
      // No intentar buscar en users sin autenticación (RLS bloqueará con 406)
      console.error('Supabase Auth falló:', authError);
      throw new Error('Credenciales inválidas');
    } catch (error: any) {
      console.error('Error al iniciar sesión:', error);
      throw new Error(error.message || 'Error al iniciar sesión');
    }
  },

  // Cerrar sesión
  async signOut() {
    try {
      const session = this.getSession();
      let dbUser = null;
      
      if (session) {
        try {
          dbUser = await usersService.getById(session.userId);
        } catch (e) {
          // Ignorar error si no se puede obtener el usuario
        }
      }
      
      // Eliminar sesión
      localStorage.removeItem(SESSION_STORAGE_KEY);
      
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
      // Asegurar que la sesión se elimine incluso si hay error
      localStorage.removeItem(SESSION_STORAGE_KEY);
      throw error;
    }
  },

  // Registrar nuevo usuario (solo para administradores)
  async signUp(email: string, password: string, userData: Partial<User>) {
    try {
      // Verificar que el usuario actual es administrador
      const currentUser = await this.getCurrentUser();
      if (!currentUser || currentUser.role !== 'ADMIN') {
        throw new Error('Solo los administradores pueden crear nuevos usuarios');
      }

      // Verificar que el email no esté en uso
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email.toLowerCase())
        .single();

      if (existingUser) {
        throw new Error('El email ya está registrado');
      }

      // Hashear la contraseña
      const passwordHash = await hashPassword(password);

      // Generar ID único
      const userId = crypto.randomUUID();

      // Crear el usuario en la tabla users
      const createdDbUser = await usersService.create({
        id: userId,
        name: userData.name || email,
        email: email.toLowerCase(),
        role: userData.role || 'OPERATIONS',
        avatar: userData.avatar || userData.name?.substring(0, 2).toUpperCase(),
        linkedClientNames: userData.linkedClientNames,
        password_hash: passwordHash, // Guardar el hash
      });

      return { user: createdDbUser, dbUser: createdDbUser };
    } catch (error: any) {
      console.error('Error al registrar usuario:', error);
      throw new Error(error.message || 'Error al registrar usuario');
    }
  },

  // Cambiar contraseña de un usuario (solo para administradores o el propio usuario)
  async updatePassword(userId: string, newPassword: string) {
    try {
      // Verificar que el usuario actual esté autenticado
      const currentUser = await this.getCurrentUser();
      if (!currentUser) {
        throw new Error('No hay usuario autenticado');
      }

      // Verificar permisos: admin puede cambiar cualquier contraseña, usuario solo la suya
      const isAdmin = currentUser.role === 'ADMIN';
      const isOwnPassword = currentUser.id === userId;

      if (!isAdmin && !isOwnPassword) {
        throw new Error('Solo puedes cambiar tu propia contraseña');
      }

      // Hashear la nueva contraseña
      const passwordHash = await hashPassword(newPassword);

      // Actualizar directamente en la tabla users
      const { error: updateError } = await supabase
        .from('users')
        .update({ password_hash: passwordHash })
        .eq('id', userId);

      if (updateError) {
        throw new Error(`Error al actualizar contraseña: ${updateError.message}`);
      }

      // Registrar en auditoría
      const targetUser = await usersService.getById(userId);
      if (targetUser) {
        await auditService.log({
          actionType: 'UPDATE',
          entityType: 'USER',
          entityId: userId,
          entityName: targetUser.name,
          description: isOwnPassword 
            ? `Contraseña actualizada por el propio usuario`
            : `Contraseña actualizada por administrador`,
        });
      }
    } catch (error: any) {
      console.error('Error al cambiar contraseña:', error);
      throw new Error(error.message || 'Error al cambiar la contraseña');
    }
  },

  // Cambiar la propia contraseña del usuario actual
  async changeOwnPassword(newPassword: string) {
    const currentUser = await this.getCurrentUser();
    if (!currentUser) {
      throw new Error('No hay usuario autenticado');
    }
    return this.updatePassword(currentUser.id, newPassword);
  },

  // Verificar si hay un usuario autenticado
  isAuthenticated(): boolean {
    return this.getSession() !== null;
  },
};
