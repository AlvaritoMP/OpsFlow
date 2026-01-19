import React, { useState } from 'react';
import { Shield, Lock, Mail, AlertCircle, CheckCircle2, Loader2, Key } from 'lucide-react';
import { supabase } from '../services/supabase';
import { hashPassword } from '../utils/passwordHash';

interface SuperAdminPasswordResetProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

// Email del superadmin - HARDCODED para seguridad
const SUPER_ADMIN_EMAIL = 'aminano@opaloperu.com';

export const SuperAdminPasswordReset: React.FC<SuperAdminPasswordResetProps> = ({ 
  onSuccess, 
  onCancel 
}) => {
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<'email' | 'verify' | 'reset' | 'success'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Código de verificación hardcodeado (puedes cambiarlo)
  // En producción, esto debería estar en una variable de entorno o en la BD
  const VERIFICATION_CODE = 'OPSFLOW-SUPERADMIN-2024-RESET';

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const normalizedEmail = email.toLowerCase().trim();
    
    // Verificar que sea el email del superadmin
    if (normalizedEmail !== SUPER_ADMIN_EMAIL) {
      setError('Este sistema de recuperación solo está disponible para el Super Administrador.');
      return;
    }
    
    // Verificar que el usuario existe y es SUPER_ADMIN
    setLoading(true);
    try {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, name, role')
        .eq('email', normalizedEmail)
        .single();
      
      if (userError || !user) {
        setError('Usuario no encontrado en el sistema.');
        setLoading(false);
        return;
      }
      
      if (user.role !== 'SUPER_ADMIN') {
        setError('Este usuario no tiene permisos de Super Administrador.');
        setLoading(false);
        return;
      }
      
      // Email verificado, pasar al siguiente paso
      setStep('verify');
    } catch (err: any) {
      setError('Error al verificar el usuario: ' + (err.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Verificar código
    if (verificationCode.trim() !== VERIFICATION_CODE) {
      setError('Código de verificación incorrecto.');
      return;
    }
    
    // Código correcto, pasar al paso de reset
    setStep('reset');
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validaciones
    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    
    setLoading(true);
    
    try {
      const normalizedEmail = email.toLowerCase().trim();
      
      // Verificar nuevamente que es el superadmin
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, name, role')
        .eq('email', normalizedEmail)
        .eq('role', 'SUPER_ADMIN')
        .single();
      
      if (userError || !user) {
        setError('Usuario no encontrado o no tiene permisos de Super Administrador.');
        setLoading(false);
        return;
      }
      
      // Generar nuevo hash
      const passwordHash = await hashPassword(newPassword);
      
      // Actualizar contraseña
      const { error: updateError } = await supabase
        .from('users')
        .update({
          password_hash: passwordHash.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .eq('email', normalizedEmail)
        .eq('role', 'SUPER_ADMIN');
      
      if (updateError) {
        setError('Error al actualizar la contraseña: ' + updateError.message);
        setLoading(false);
        return;
      }
      
      // Éxito
      setSuccess(true);
      setStep('success');
      
      // Registrar en auditoría si es posible (sin autenticación, puede fallar)
      try {
        await supabase.from('audit_logs').insert({
          action_type: 'PASSWORD_RESET',
          entity_type: 'USER',
          entity_id: user.id,
          entity_name: user.name,
          description: `Contraseña del Super Administrador reseteada mediante sistema de recuperación de emergencia`,
          user_id: user.id,
          user_name: user.name,
        });
      } catch (auditErr) {
        // Ignorar error de auditoría si falla
        console.warn('No se pudo registrar en auditoría:', auditErr);
      }
      
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (err: any) {
      setError('Error al resetear la contraseña: ' + (err.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo y Título */}
        <div className="text-center mb-6 md:mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 md:w-16 md:h-16 bg-red-600 rounded-2xl mb-3 md:mb-4 shadow-lg">
            <Shield className="w-8 h-8 md:w-10 md:h-10 text-white" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Recuperación de Super Admin</h1>
          <p className="text-sm md:text-base text-slate-300">Sistema de emergencia</p>
        </div>

        {/* Card de Recuperación */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8">
          {step === 'email' && (
            <>
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-xs">
                <AlertCircle size={16} className="inline mr-2" />
                <strong>Solo para Super Administrador:</strong> Este sistema solo funciona para el usuario superadmin del sistema.
              </div>
              
              <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-4 md:mb-6 flex items-center">
                <Mail className="mr-2" size={20} />
                Paso 1: Verificar Email
              </h2>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start text-red-700 text-xs md:text-sm">
                  <AlertCircle size={16} className="mr-2 flex-shrink-0 mt-0.5" />
                  <span className="flex-1">{error}</span>
                </div>
              )}

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">
                    Email del Super Administrador
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 md:pl-10 pr-4 py-2.5 md:py-2 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                      placeholder="superadmin@ejemplo.com"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-red-600 text-white py-3 md:py-2.5 rounded-lg text-base md:text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-sm min-h-[44px]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 animate-spin" size={18} />
                      <span>Verificando...</span>
                    </>
                  ) : (
                    'Verificar Email'
                  )}
                </button>
              </form>
            </>
          )}

          {step === 'verify' && (
            <>
              <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-4 md:mb-6 flex items-center">
                <Key className="mr-2" size={20} />
                Paso 2: Código de Verificación
              </h2>

              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs">
                <strong>Email verificado:</strong> {email}
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start text-red-700 text-xs md:text-sm">
                  <AlertCircle size={16} className="mr-2 flex-shrink-0 mt-0.5" />
                  <span className="flex-1">{error}</span>
                </div>
              )}

              <form onSubmit={handleVerificationSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">
                    Código de Verificación
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      className="w-full pl-9 md:pl-10 pr-4 py-2.5 md:py-2 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none font-mono"
                      placeholder="Ingrese el código de verificación"
                      required
                      disabled={loading}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Ingrese el código de verificación del Super Administrador
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setError(null);
                      setVerificationCode('');
                    }}
                    className="flex-1 bg-slate-200 text-slate-700 py-2.5 rounded-lg font-medium hover:bg-slate-300 transition-colors"
                  >
                    Atrás
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : (
                      'Verificar'
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 'reset' && (
            <>
              <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-4 md:mb-6 flex items-center">
                <Lock className="mr-2" size={20} />
                Paso 3: Nueva Contraseña
              </h2>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start text-red-700 text-xs md:text-sm">
                  <AlertCircle size={16} className="mr-2 flex-shrink-0 mt-0.5" />
                  <span className="flex-1">{error}</span>
                </div>
              )}

              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">
                    Nueva Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-9 md:pl-10 pr-4 py-2.5 md:py-2 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                      placeholder="Mínimo 8 caracteres"
                      required
                      minLength={8}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">
                    Confirmar Contraseña
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-9 md:pl-10 pr-4 py-2.5 md:py-2 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                      placeholder="Repita la contraseña"
                      required
                      minLength={8}
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('verify');
                      setError(null);
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    className="flex-1 bg-slate-200 text-slate-700 py-2.5 rounded-lg font-medium hover:bg-slate-300 transition-colors"
                  >
                    Atrás
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-red-600 text-white py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 animate-spin" size={18} />
                        <span>Reseteando...</span>
                      </>
                    ) : (
                      'Resetear Contraseña'
                    )}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 'success' && (
            <>
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-2">
                  ¡Contraseña Reseteada!
                </h2>
                <p className="text-sm text-slate-600 mb-6">
                  Tu contraseña ha sido actualizada correctamente. Ahora puedes iniciar sesión con tu nueva contraseña.
                </p>
                <button
                  onClick={() => {
                    if (onSuccess) onSuccess();
                  }}
                  className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  Ir a Iniciar Sesión
                </button>
              </div>
            </>
          )}

          {onCancel && step !== 'success' && (
            <button
              onClick={onCancel}
              className="w-full mt-4 text-sm text-slate-500 hover:text-slate-700"
            >
              Volver al login
            </button>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-400 text-xs md:text-sm mt-4 md:mt-6">
          Sistema de recuperación de emergencia - Solo Super Administrador
        </p>
      </div>
    </div>
  );
};
