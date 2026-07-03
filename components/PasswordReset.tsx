import React, { useState, useEffect } from 'react';
import { Lock, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';
import { supabase } from '../services/supabase';
import { authService } from '../services/authService';

interface PasswordResetProps {
  accessToken: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const PasswordReset: React.FC<PasswordResetProps> = ({ accessToken, onSuccess, onCancel }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    // Obtener información del usuario desde el token
    const getUserFromToken = async () => {
      try {
        console.log('🔑 Validando token de recuperación...');
        
        // Primero, intentar obtener el usuario directamente del token
        // Esto no requiere establecer una sesión completa
        const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
        
        if (user && !userError) {
          console.log('✅ Token válido, usuario:', user.email);
          setUserEmail(user.email || null);
        } else {
          console.error('❌ Error al validar token:', userError);
          if (userError?.message?.includes('expired') || userError?.message?.includes('invalid')) {
            setError('El enlace de recuperación ha expirado. Por favor, solicita un nuevo enlace desde Supabase Dashboard.');
          } else {
            setError('Token de recuperación inválido. Por favor, solicita un nuevo enlace.');
          }
        }
      } catch (err: any) {
        console.error('❌ Error al obtener usuario del token:', err);
        setError(err.message || 'Error al validar el token de recuperación. Por favor, solicita un nuevo enlace.');
      }
    };

    getUserFromToken();
  }, [accessToken]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newPassword || newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);

    try {
      console.log('🔑 Intentando actualizar contraseña con token de recuperación...');
      
      // Método 1: Intentar establecer sesión primero
      let session = null;
      try {
        const { data: { session: newSession }, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: '' // Los tokens de recuperación no tienen refresh_token
        });
        
        if (!sessionError && newSession) {
          session = newSession;
          console.log('✅ Sesión establecida con token de recuperación');
        } else {
          console.warn('⚠️ No se pudo establecer sesión completa:', sessionError?.message);
          // Continuar con método alternativo
        }
      } catch (sessionErr: any) {
        console.warn('⚠️ Error al establecer sesión:', sessionErr.message);
        // Continuar con método alternativo
      }

      // Método 2: Si no hay sesión, usar la API REST directamente con el token
      if (!session) {
        console.log('🔄 Usando método alternativo: API REST directa...');
        
        // Verificar que el token es válido
        const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
        
        if (userError || !user) {
          throw new Error('Token de recuperación inválido o expirado. Por favor, solicita un nuevo enlace de recuperación.');
        }
        
        console.log('✅ Token válido, usuario:', user.email);
        
        // Usar la API REST de Supabase para actualizar la contraseña
        // Esto funciona con tokens de recuperación sin necesidad de sesión completa
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rlnfehtgspnkyeevduli.supabase.co';
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsbmZlaHRnc3Bua3llZXZkdWxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NzQ5MzUsImV4cCI6MjA4MDQ1MDkzNX0.8VJfcSBgGylmXrpyVR6wVTMq94P8jlRkfkZgUlvRDtY';
        
        console.log('🔄 Llamando a API REST de Supabase para actualizar contraseña...');
        const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey
          },
          body: JSON.stringify({
            password: newPassword
          })
        });

        const result = await response.json();

        if (!response.ok) {
          console.error('❌ Error en API REST:', result);
          const errorMsg = result.message || result.error_description || result.error || 'No se pudo actualizar la contraseña';
          
          if (errorMsg.includes('expired') || errorMsg.includes('invalid') || errorMsg.includes('stale')) {
            throw new Error('El enlace de recuperación ha expirado. Por favor, solicita un nuevo enlace desde Supabase Dashboard.');
          }
          
          throw new Error(errorMsg);
        }

        console.log('✅ Contraseña actualizada exitosamente usando API REST');
        
        // Actualizar también en tabla users
        try {
          const currentUser = await authService.getCurrentUser();
          if (currentUser && currentUser.email === user.email) {
            await authService.updatePassword(currentUser.id, newPassword);
            console.log('✅ Contraseña sincronizada con tabla users');
          }
        } catch (usersError) {
          console.warn('⚠️ No se pudo actualizar contraseña en tabla users:', usersError);
        }
        
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 2000);
        return;
      }

      // Si tenemos sesión, usar el método normal
      console.log('✅ Sesión establecida, usuario:', session.user.email);
      console.log('🔐 Actualizando contraseña...');
      
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        console.error('❌ Error al actualizar contraseña:', updateError);
        throw new Error(updateError.message || 'Error al actualizar la contraseña');
      }

      console.log('✅ Contraseña actualizada exitosamente en Supabase Auth');

      // También actualizar en la tabla users para mantener sincronización
      if (session?.user?.email) {
        try {
          console.log('🔄 Sincronizando contraseña con tabla users...');
          const currentUser = await authService.getCurrentUser();
          if (currentUser && currentUser.email === session.user.email) {
            // Actualizar también en la tabla users
            await authService.updatePassword(currentUser.id, newPassword);
            console.log('✅ Contraseña sincronizada con tabla users');
          } else {
            console.warn('⚠️ No se encontró usuario en tabla users para sincronizar');
          }
        } catch (usersError) {
          console.warn('⚠️ No se pudo actualizar contraseña en tabla users:', usersError);
          // No es crítico, la contraseña ya se actualizó en Auth
        }
      }

      setSuccess(true);
      console.log('✅ Proceso de recuperación de contraseña completado exitosamente');
      
      // Esperar un momento y luego cerrar
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: any) {
      console.error('Error al restablecer contraseña:', err);
      setError(err.message || 'Error al restablecer la contraseña. Por favor, intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 text-center">
          <CheckCircle2 className="mx-auto mb-4 text-green-600" size={48} />
          <h3 className="text-xl font-bold text-slate-800 mb-2">¡Contraseña Actualizada!</h3>
          <p className="text-slate-600 mb-4">
            Tu contraseña se ha actualizado correctamente en Supabase Auth.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Ahora puedes cerrar sesión y volver a iniciar para que se sincronice completamente.
          </p>
          <button
            onClick={onSuccess}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Continuar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
          <h3 className="font-bold text-lg flex items-center">
            <Lock className="mr-2" size={20} /> Restablecer Contraseña
          </h3>
          <button onClick={onCancel} className="text-white/80 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleResetPassword} className="p-6 space-y-4">
          {userEmail && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <strong>Usuario:</strong> {userEmail}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start text-red-700 text-sm">
              <AlertCircle size={16} className="mr-2 flex-shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nueva Contraseña <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Confirmar Contraseña <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
              required
              disabled={loading}
            />
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 animate-spin" size={16} />
                  Actualizando...
                </>
              ) : (
                'Actualizar Contraseña'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
