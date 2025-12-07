import React, { useState } from 'react';
import { LogIn, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { authService } from '../services/authService';
import { User } from '../types';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { dbUser } = await authService.signIn(email, password);
      
      if (dbUser) {
        onLoginSuccess(dbUser);
      } else {
        throw new Error('Error al obtener datos del usuario después del login');
      }
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión. Verifica tus credenciales.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo y Título */}
        <div className="text-center mb-6 md:mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 md:w-16 md:h-16 bg-blue-600 rounded-2xl mb-3 md:mb-4 shadow-lg">
            <svg viewBox="0 0 24 24" className="w-8 h-8 md:w-10 md:h-10 text-white" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">OpsFlow</h1>
          <p className="text-sm md:text-base text-slate-300">Gestión Operativa</p>
        </div>

        {/* Card de Login */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 mb-4 md:mb-6 flex items-center">
            <LogIn className="mr-2" size={20} />
            Iniciar Sesión
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start text-red-700 text-xs md:text-sm">
              <AlertCircle size={16} className="mr-2 flex-shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 md:pl-10 pr-4 py-2.5 md:py-2 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="tu@email.com"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 md:pl-10 pr-4 py-2.5 md:py-2 text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="••••••••"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 md:py-2.5 rounded-lg text-base md:text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-sm min-h-[44px]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 animate-spin" size={18} />
                  <span>Iniciando sesión...</span>
                </>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-400 text-xs md:text-sm mt-4 md:mt-6">
          © 2024 OpsFlow. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
};

