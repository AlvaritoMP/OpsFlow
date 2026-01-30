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
        // Establecer la sesión temporal con el token de recuperación
        const { data: { user }, error: sessionError } = await supabase.auth.getUser(accessToken);
        
        if (user && !sessionError) {
          setUserEmail(user.email || null);
        }
      } catch (err) {
        console.error('Error al obtener usuario del token:', err);
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
      // Establecer la sesión con el token de recuperación
      const { data: { session }, error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: '' // No tenemos refresh token en recovery
      });

      if (sessionError || !session) {
        throw new Error('Token de recuperación inválido o expirado. Por favor, solicita un nuevo enlace de recuperación.');
      }

      // Actualizar la contraseña usando la sesión de recuperación
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        throw new Error(updateError.message || 'Error al actualizar la contraseña');
      }

      // También actualizar en la tabla users para mantener sincronización
      if (session.user?.email) {
        try {
          const currentUser = await authService.getCurrentUser();
          if (currentUser && currentUser.email === session.user.email) {
            // Actualizar también en la tabla users
            await authService.updatePassword(currentUser.id, newPassword);
          }
        } catch (usersError) {
          console.warn('No se pudo actualizar contraseña en tabla users:', usersError);
          // No es crítico, la contraseña ya se actualizó en Auth
        }
      }

      setSuccess(true);
      
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
