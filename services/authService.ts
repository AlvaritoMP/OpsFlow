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
    if (!session) {
      console.warn('⚠️ No hay sesión activa en getCurrentUser()');
      return null;
    }
    
    console.log('🔍 getCurrentUser() - Sesión encontrada:', {
      userId: session.userId,
      email: session.email,
      timestamp: new Date(session.timestamp).toISOString(),
    });
    
    try {
      // Intentar obtener de la BD
      const dbUser = await usersService.getById(session.userId);
      if (dbUser) {
        console.log('✅ getCurrentUser() - Usuario obtenido de BD:', {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          role: dbUser.role,
        });
        return dbUser;
      }
      
      console.warn('⚠️ getCurrentUser() - Usuario no encontrado en BD con ID:', session.userId);
      
      // Si no existe en BD, intentar obtener de Supabase Auth como fallback
      // Esto puede pasar si el usuario se autenticó pero no se creó en BD
      try {
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        if (!authError && authUser && authUser.id === session.userId) {
          // Crear usuario desde Auth
          const fallbackUser: User = {
            id: authUser.id,
            email: authUser.email || session.email,
            name: authUser.user_metadata?.name || session.email.split('@')[0],
            role: (authUser.user_metadata?.role as UserRole) || 'OPERATIONS',
          };
          
          // Intentar crear/actualizar en BD (sin password_hash por ahora)
          try {
            await supabase
              .from('users')
              .upsert({
                id: fallbackUser.id,
                email: fallbackUser.email,
                name: fallbackUser.name,
                role: fallbackUser.role,
              }, { onConflict: 'id' });
            
            // Intentar obtener de nuevo después del upsert
            await new Promise(resolve => setTimeout(resolve, 300));
            const updatedUser = await usersService.getById(session.userId);
            if (updatedUser) {
              return updatedUser;
            }
          } catch (upsertErr) {
            console.warn('No se pudo crear/actualizar usuario en BD:', upsertErr);
          }
          
          return fallbackUser;
        }
      } catch (authErr) {
        console.warn('No se pudo obtener usuario de Auth:', authErr);
      }
      
      // Si todo falla, retornar null (se desautenticará)
      console.warn('No se pudo obtener usuario de BD ni de Auth');
      return null;
    } catch (error) {
      console.error('Error al obtener usuario actual:', error);
      return null;
    }
  },

  // Iniciar sesión con email y contraseña
  async signIn(email: string, password: string) {
    try {
      // PRIMERO: Intentar buscar usuario en la tabla users y verificar password_hash
      // Esto es para usuarios creados directamente en la BD sin Supabase Auth
      try {
        const { data: dbUsers, error: dbError } = await supabase
          .from('users')
          .select('*')
          .eq('email', email.toLowerCase())
          .limit(1);

        if (!dbError && dbUsers && dbUsers.length > 0) {
          const dbUser = dbUsers[0];
          
          // Verificar contraseña si existe password_hash
          if (dbUser.password_hash) {
            const isValidPassword = await verifyPassword(password, dbUser.password_hash);
            
            if (isValidPassword) {
              // Contraseña válida, crear sesión
              const session: Session = {
                userId: dbUser.id,
                email: dbUser.email,
                timestamp: Date.now(),
              };
              localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

              // Intentar crear sesión de Supabase Auth para compatibilidad con Storage
              // Esto es necesario para que Storage funcione
              try {
                const authResult = await supabase.auth.signInWithPassword({
                  email: email.toLowerCase(),
                  password: password,
                });
                
                if (authResult.error) {
                  // Si el usuario no existe en Auth, intentar crearlo
                  if (authResult.error.message?.includes('Invalid login credentials') || 
                      authResult.error.message?.includes('Email not confirmed')) {
                    console.log('ℹ️ Usuario existe en Auth pero credenciales no coinciden o email no confirmado');
                    // Intentar sign up (puede fallar si ya existe, pero lo intentamos)
                    try {
                      const signUpResult = await supabase.auth.signUp({
                        email: email.toLowerCase(),
                        password: password,
                        options: {
                          data: {
                            name: dbUser.name,
                            role: dbUser.role,
                          }
                        }
                      });
                      
                      if (signUpResult.error && !signUpResult.error.message?.includes('already registered')) {
                        console.warn('⚠️ No se pudo crear cuenta en Supabase Auth:', signUpResult.error.message);
                      } else if (signUpResult.data?.user) {
                        console.log('✅ Cuenta creada en Supabase Auth, intentando sign in...');
                        // Esperar un momento y luego intentar sign in
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await supabase.auth.signInWithPassword({
                          email: email.toLowerCase(),
                          password: password,
                        });
                      }
                    } catch (signUpErr) {
                      console.warn('⚠️ Error al crear cuenta en Supabase Auth:', signUpErr);
                    }
                  } else {
                    console.warn('⚠️ Error al autenticar con Supabase Auth:', authResult.error.message);
                  }
                } else {
                  console.log('✅ Sesión de Supabase Auth creada correctamente');
                }
              } catch (authErr: any) {
                // Si falla, la sesión local ya está activa, pero Storage no funcionará
                console.warn('⚠️ No se pudo crear sesión de Supabase Auth:', authErr?.message || authErr);
                console.warn('⚠️ La sesión local está activa, pero Storage requerirá re-autenticación');
              }

              // Registrar login en auditoría
              try {
                await auditService.log({
                  actionType: 'LOGIN',
                  entityType: 'USER',
                  entityId: dbUser.id,
                  entityName: dbUser.name,
                  description: `Usuario "${dbUser.name}" inició sesión`,
                });
              } catch (auditErr) {
                console.warn('No se pudo registrar en auditoría:', auditErr);
              }

              return { user: dbUser, dbUser };
            }
          }
        }
      } catch (dbErr) {
        console.warn('Error al buscar usuario en BD:', dbErr);
      }

      // SEGUNDO: Intentar Supabase Auth (para usuarios existentes en Auth)
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
        const hashedPassword = await hashPassword(password);
        
        // Actualizar o crear usuario en la tabla users
        // Con RLS deshabilitado, esto debería funcionar sin problemas
        const userData = {
          id: authUserId,
          email: email.toLowerCase(),
          name: authData.user.user_metadata?.name || email.split('@')[0],
          role: authData.user.user_metadata?.role || 'OPERATIONS',
          password_hash: hashedPassword,
        };

        // Intentar upsert (insert o update)
        const { error: upsertError } = await supabase
          .from('users')
          .upsert(userData, { onConflict: 'id' });

        if (upsertError) {
          console.error('Error al hacer upsert de usuario:', upsertError);
          // Si upsert falla, intentar solo update (el usuario ya existe)
          const { error: updateError } = await supabase
            .from('users')
            .update({ password_hash: hashedPassword })
            .eq('id', authUserId);
          
          if (updateError) {
            console.error('Error al actualizar password_hash:', updateError);
          }
        }

        // Esperar un momento para asegurar que el upsert se completó
        await new Promise(resolve => setTimeout(resolve, 500));

        // Obtener usuario completo de la BD
        let dbUser: User | null = null;
        try {
          dbUser = await usersService.getById(authUserId);
        } catch (err) {
          console.warn('No se pudo obtener usuario de BD, intentando crear:', err);
        }

        // Si no existe en BD, crearlo explícitamente
        if (!dbUser) {
          const newUserData = {
            id: authUserId,
            email: email.toLowerCase(),
            name: authData.user.user_metadata?.name || email.split('@')[0],
            role: authData.user.user_metadata?.role || 'OPERATIONS',
            password_hash: hashedPassword,
          };
          
          try {
            const { data: createdUser, error: createError } = await supabase
              .from('users')
              .insert(newUserData)
              .select()
              .single();
            
            if (!createError && createdUser) {
              // Esperar un momento y obtener el usuario creado
              await new Promise(resolve => setTimeout(resolve, 300));
              dbUser = await usersService.getById(authUserId);
            }
          } catch (createErr) {
            console.error('Error al crear usuario en BD:', createErr);
          }
        }

        // Si aún no existe, crear objeto User desde Auth (fallback)
        if (!dbUser) {
          dbUser = {
            id: authUserId,
            email: email.toLowerCase(),
            name: authData.user.user_metadata?.name || email.split('@')[0],
            role: (authData.user.user_metadata?.role as UserRole) || 'OPERATIONS',
          };
        }

        // Crear sesión local usando datos del usuario
        const session: Session = {
          userId: dbUser.id,
          email: dbUser.email,
          timestamp: Date.now(),
        };
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

        // NO cerrar sesión de Supabase Auth - la necesitamos para Storage
        // await supabase.auth.signOut(); // COMENTADO: Storage necesita la sesión activa

        // Registrar login en auditoría (solo si podemos)
        try {
          await auditService.log({
            actionType: 'LOGIN',
            entityType: 'USER',
            entityId: dbUser.id,
            entityName: dbUser.name,
            description: `Usuario "${dbUser.name}" inició sesión`,
          });
        } catch (auditErr) {
          console.warn('No se pudo registrar en auditoría:', auditErr);
        }

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
      // Cerrar sesión de Supabase Auth primero (para Storage)
      await supabase.auth.signOut();
      
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
      // Verificar que el usuario actual es administrador o super administrador
      const currentUser = await this.getCurrentUser();
      if (!currentUser || (currentUser.role !== 'ADMIN' && currentUser.role !== 'SUPER_ADMIN')) {
        throw new Error('Solo los administradores pueden crear nuevos usuarios');
      }
      
      // Verificar permisos para crear usuarios con roles específicos
      if (userData.role === 'SUPER_ADMIN' && currentUser.role !== 'SUPER_ADMIN') {
        throw new Error('Solo los superadministradores pueden crear usuarios con rol SUPER_ADMIN');
      }
      
      if (userData.role === 'ADMIN' && currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'ADMIN') {
        throw new Error('Solo los administradores pueden crear usuarios con rol ADMIN');
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

      // NOTA: No podemos crear usuarios en Supabase Auth desde el cliente
      // porque requiere service_role key. El usuario se creará solo en la tabla users.
      // Cuando el usuario intente hacer login, se verificará el password_hash.
      // Si en el futuro se necesita Supabase Auth, se debe crear una Edge Function.
      const finalUserId = userId;

      // Crear el usuario en la tabla users
      const createdDbUser = await usersService.create({
        id: finalUserId,
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

      // Verificar permisos: super_admin puede cambiar cualquier contraseña (incluyendo admin)
      // admin puede cambiar contraseñas excepto de otros admins y super_admins
      // usuario solo puede cambiar su propia contraseña
      const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';
      const isAdmin = currentUser.role === 'ADMIN';
      const isOwnPassword = currentUser.id === userId;

      // Obtener el usuario objetivo para verificar su rol
      const targetUser = await usersService.getById(userId);
      if (!targetUser) {
        throw new Error('Usuario no encontrado');
      }

      const targetIsAdmin = targetUser.role === 'ADMIN';
      const targetIsSuperAdmin = targetUser.role === 'SUPER_ADMIN';

      // Super admin puede cambiar cualquier contraseña
      if (isSuperAdmin) {
        // Permitir
      }
      // Admin puede cambiar contraseñas excepto de otros admins y super_admins
      else if (isAdmin) {
        if (targetIsAdmin || targetIsSuperAdmin) {
          throw new Error('Los administradores no pueden cambiar contraseñas de otros administradores o superadministradores');
        }
      }
      // Usuario normal solo puede cambiar su propia contraseña
      else if (!isOwnPassword) {
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

      // NOTA: No podemos actualizar la contraseña en Supabase Auth desde el cliente
      // porque requiere service_role key. Si el usuario existe en Auth, necesitará
      // usar "Olvidé mi contraseña" o se debe crear una Edge Function para sincronizar.

      // Registrar en auditoría
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
