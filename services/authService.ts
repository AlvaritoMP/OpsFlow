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

function isTransientDbError(error: any): boolean {
  const message = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    message.includes('timeout') ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('fetch') ||
    code === 'ETIMEDOUT' ||
    code === '57014' ||
    code === 'PGRST301'
  );
}

async function syncSupabaseAuthSession(dbUser: User, password: string): Promise<void> {
  const email = dbUser.email.toLowerCase();
  try {
    const authResult = await supabase.auth.signInWithPassword({ email, password });
    if (!authResult.error) {
      console.log('✅ Sesión de Supabase Auth creada correctamente');
      return;
    }

    const isInvalidCredentials = authResult.error.message?.includes('Invalid login credentials') ||
      authResult.error.message?.includes('Email not confirmed') ||
      authResult.status === 400;

    let userExistsInAuth = false;
    try {
      const adminAuth = supabase.auth.admin as { getUserByEmail?: (value: string) => Promise<{ data: { user: unknown } }> };
      if (!adminAuth?.getUserByEmail) throw new Error('admin lookup unavailable');
      const { data: { user } } = await adminAuth.getUserByEmail(email);
      userExistsInAuth = !!user;
    } catch {
      userExistsInAuth = isInvalidCredentials;
    }

    if (userExistsInAuth && isInvalidCredentials) {
      console.warn('⚠️ Usuario existe en Supabase Auth pero la contraseña no coincide. La sesión local sigue activa.');
      return;
    }

    if (!(authResult.error.message?.includes('User not found') || !userExistsInAuth)) {
      console.warn('⚠️ Error al autenticar con Supabase Auth:', authResult.error.message);
      return;
    }

    const signUpResult = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: dbUser.name, role: dbUser.role },
        emailRedirectTo: undefined,
      },
    });

    if (signUpResult.error) {
      console.warn('⚠️ No se pudo crear cuenta en Supabase Auth:', signUpResult.error.message);
      return;
    }

    if (signUpResult.data?.user) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const signInResult = await supabase.auth.signInWithPassword({ email, password });
      if (signInResult.error) {
        console.warn('⚠️ No se pudo hacer sign in después de crear cuenta:', signInResult.error.message);
      }
    }
  } catch (authErr: any) {
    console.warn('⚠️ No se pudo crear sesión de Supabase Auth:', authErr?.message || authErr);
  }
}

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
      // Reintentar si la base está despertando: un fallo transitorio no debe
      // devolver al login a quien ya tiene sesión.
      let dbUser: User | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        dbUser = await usersService.getById(session.userId);
        if (dbUser) break;
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
        }
      }
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
    const normalizedEmail = email.toLowerCase().trim();
    console.log('🔐 Intentando iniciar sesión para:', normalizedEmail);
    
    try {
      // PRIMERO: Intentar buscar usuario en la tabla users y verificar password_hash
      // Esto es para usuarios creados directamente en la BD sin Supabase Auth
      try {
        console.log('🔍 Buscando usuario en tabla users...');
        let dbUsers: any[] | null = null;
        let dbError: any = null;
        for (let attempt = 1; attempt <= 4; attempt++) {
          const result = await supabase
            .from('users')
            .select('*')
            .eq('email', normalizedEmail)
            .limit(1);
          dbUsers = result.data;
          dbError = result.error;
          if (!dbError) break;
          const transient = isTransientDbError(dbError);
          console.error(`❌ Error al buscar usuario en BD (intento ${attempt}):`, dbError);
          if (!transient || attempt === 4) break;
          await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
        }

        if (dbError) {
          throw new Error('No se pudo conectar con el servidor para verificar sus credenciales. Espere un momento e intente de nuevo.');
        }

        if (!dbError && dbUsers && dbUsers.length > 0) {
          const dbUser = dbUsers[0];
          console.log('✅ Usuario encontrado en BD:', {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            role: dbUser.role,
            hasPasswordHash: !!dbUser.password_hash,
          });
          
          // Verificar contraseña si existe password_hash
          if (dbUser.password_hash) {
            console.log('🔐 Verificando contraseña con password_hash...');
            
            // Limpiar el hash de espacios y caracteres extra (por si acaso)
            const cleanHash = dbUser.password_hash.trim();
            if (cleanHash !== dbUser.password_hash) {
              console.warn('⚠️ El hash en BD tiene espacios extra, limpiando...');
            }
            
            const isValidPassword = await verifyPassword(password, cleanHash);
            console.log('🔐 Resultado de verificación:', isValidPassword ? '✅ Válida' : '❌ Inválida');
            
            // Si falla con el hash limpio, intentar con el original también
            if (!isValidPassword && cleanHash !== dbUser.password_hash) {
              console.log('🔐 Intentando con hash original (sin limpiar)...');
              const isValidOriginal = await verifyPassword(password, dbUser.password_hash);
              if (isValidOriginal) {
                console.warn('⚠️ El hash original funciona, pero tiene espacios. Se recomienda limpiarlo en la BD.');
                // Actualizar el hash en la BD para limpiarlo
                try {
                  await supabase
                    .from('users')
                    .update({ password_hash: cleanHash })
                    .eq('id', dbUser.id);
                  console.log('✅ Hash limpiado en la base de datos');
                } catch (cleanErr) {
                  console.warn('⚠️ No se pudo limpiar el hash:', cleanErr);
                }
              }
            }
            
            if (isValidPassword) {
              // Contraseña válida, crear sesión
              const session: Session = {
                userId: dbUser.id,
                email: dbUser.email,
                timestamp: Date.now(),
              };
              localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));

              // Auth de Supabase solo hace falta para Storage. No debe bloquear el ingreso:
              // si el proyecto está frío, esas llamadas tardaban y el login parecía fallar.
              void syncSupabaseAuthSession(dbUser, password);

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
            } else {
              console.error('❌ Contraseña inválida para usuario:', normalizedEmail);
              throw new Error('Contraseña incorrecta. Por favor, verifique sus credenciales.');
            }
          } else {
            console.warn('⚠️ Usuario encontrado pero no tiene password_hash. Intentando Supabase Auth...');
            // Si el usuario no tiene password_hash, continuar al flujo de Supabase Auth
          }
        } else {
          console.warn('⚠️ Usuario no encontrado en tabla users. Intentando Supabase Auth...');
        }
      } catch (dbErr: any) {
        const message = String(dbErr?.message || '');
        if (
          message.includes('Contraseña incorrecta') ||
          message.includes('No se pudo conectar')
        ) {
          throw dbErr;
        }
        console.error('❌ Error al buscar usuario en BD:', dbErr);
      }

      // SEGUNDO: Intentar Supabase Auth (para usuarios existentes en Auth)
      console.log('🔍 Intentando autenticación con Supabase Auth...');
      let authData: any = null;
      let authError: any = null;
      
      try {
        const authResult = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: password,
        });
        authData = authResult.data;
        authError = authResult.error;
        
        if (authError) {
          console.error('❌ Supabase Auth falló:', {
            message: authError.message,
            status: authError.status,
          });
        } else {
          console.log('✅ Supabase Auth exitoso');
        }
      } catch (err) {
        authError = err;
        console.error('❌ Error en Supabase Auth:', err);
      }

      // Si Supabase Auth funciona, usar ese usuario
      if (!authError && authData?.user) {
        console.log('✅ Usuario autenticado con Supabase Auth:', authData.user.id);
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

      // Si Supabase Auth no funciona, lanzar error con más detalles
      console.error('❌ Autenticación falló completamente');
      console.error('Supabase Auth error:', authError);
      
      // Proporcionar un mensaje de error más útil
      let errorMessage = 'Credenciales inválidas';
      if (authError?.message) {
        if (authError.message.includes('Invalid login credentials')) {
          errorMessage = 'Email o contraseña incorrectos. Por favor, verifique sus credenciales.';
        } else if (authError.message.includes('Email not confirmed')) {
          errorMessage = 'Su email no ha sido confirmado. Por favor, revise su correo electrónico.';
        } else {
          errorMessage = `Error de autenticación: ${authError.message}`;
        }
      }
      
      throw new Error(errorMessage);
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
        canDeleteAttendanceIncidents: userData.canDeleteAttendanceIncidents === true,
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

      // Intentar actualizar también en Supabase Auth si el usuario existe allí
      // Esto es importante para que Storage funcione correctamente
      try {
        // Si es el propio usuario cambiando su contraseña y tiene sesión de Auth activa
        if (isOwnPassword) {
          const { data: { session: authSession } } = await supabase.auth.getSession();
          if (authSession && authSession.user) {
            // Actualizar contraseña en Supabase Auth
            const { error: authUpdateError } = await supabase.auth.updateUser({
              password: newPassword
            });
            
            if (authUpdateError) {
              console.warn('⚠️ No se pudo actualizar contraseña en Supabase Auth:', authUpdateError.message);
              console.warn('⚠️ La contraseña se actualizó en la tabla users, pero puede que necesites cerrar sesión y volver a iniciar para que Supabase Auth se sincronice.');
            } else {
              console.log('✅ Contraseña actualizada también en Supabase Auth');
            }
          } else {
            console.log('ℹ️ No hay sesión de Supabase Auth activa. La contraseña se actualizó en la tabla users.');
            // Intentar crear sesión de Auth con la nueva contraseña
            try {
              const { data: { user: targetUser } } = await usersService.getById(userId);
              if (targetUser) {
                const signInResult = await supabase.auth.signInWithPassword({
                  email: targetUser.email,
                  password: newPassword,
                });
                
                if (signInResult.error) {
                  console.warn('⚠️ No se pudo crear sesión de Supabase Auth automáticamente:', signInResult.error.message);
                  console.warn('⚠️ Esto significa que la contraseña en Supabase Auth no coincide con la nueva contraseña.');
                  console.warn('⚠️ SOLUCIÓN: Debes actualizar la contraseña en Supabase Auth manualmente:');
                  console.warn('   1. Ve a Supabase Dashboard → Authentication → Users');
                  console.warn('   2. Busca tu usuario y cambia la contraseña para que coincida con la nueva');
                  console.warn('   3. O usa el script reset_password.js con tu SERVICE_ROLE_KEY');
                  console.warn('⚠️ La contraseña se actualizó correctamente en la tabla users.');
                  // No lanzar error - solo advertir. La contraseña se actualizó correctamente en users.
                  // El usuario puede seguir usando la app, solo no podrá subir imágenes hasta que sincronice Auth.
                  console.warn('⚠️ IMPORTANTE: La contraseña se actualizó en la tabla users.');
                  console.warn('⚠️ Para subir imágenes, necesitas actualizar la contraseña en Supabase Auth también.');
                  console.warn('⚠️ Ve a Supabase Dashboard → Authentication → Users y cambia la contraseña manualmente.');
                  // No lanzar error - permitir que el cambio de contraseña se complete exitosamente
                  // El usuario verá el mensaje en la consola y puede actualizar Auth manualmente
                } else {
                  console.log('✅ Sesión de Supabase Auth creada automáticamente con la nueva contraseña');
                }
              }
            } catch (autoAuthError: any) {
              console.warn('⚠️ No se pudo crear sesión de Auth automáticamente:', autoAuthError.message);
              console.warn('⚠️ La contraseña se actualizó correctamente. Cierra sesión y vuelve a iniciar.');
            }
          }
        } else {
          // Si un admin está cambiando la contraseña de otro usuario
          // Intentar actualizar en Supabase Auth usando la sesión del admin
          // Nota: Esto solo funcionará si el admin tiene sesión de Auth activa
          const { data: { session: adminSession } } = await supabase.auth.getSession();
          if (adminSession && adminSession.user) {
            // Buscar el usuario en Auth por email
            try {
              // Nota: No podemos actualizar directamente la contraseña de otro usuario desde el cliente
              // sin service_role key. Pero podemos intentar hacer signIn con las nuevas credenciales
              // para verificar que funcionan, o simplemente informar al usuario.
              console.log('ℹ️ Un administrador cambió la contraseña. El usuario deberá usar la nueva contraseña en su próximo login.');
              console.log('ℹ️ Si el usuario existe en Supabase Auth, necesitará restablecer su contraseña desde el Dashboard o usar "Olvidé mi contraseña".');
            } catch (e) {
              // Ignorar errores - no es crítico
            }
          }
        }
      } catch (authSyncError: any) {
        // No bloquear si falla la sincronización con Auth
        console.warn('⚠️ No se pudo sincronizar contraseña con Supabase Auth:', authSyncError.message);
        console.warn('⚠️ La contraseña se actualizó correctamente en la tabla users.');
      }

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
