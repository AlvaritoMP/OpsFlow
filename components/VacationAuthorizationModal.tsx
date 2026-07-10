import React, { useMemo, useState } from 'react';
import { Send, X, AlertCircle } from 'lucide-react';
import { User } from '../types';
import { canActAsVacationAuthorizer } from '../services/vacationAuthService';

interface VacationAuthorizationModalProps {
  open: boolean;
  title: string;
  message: string;
  currentUser: User;
  users: User[];
  /** Justificación del solicitante (visible para el autorizador al revisar) */
  justification?: string;
  onSubmit: (assignedAuthorizerId: string) => Promise<void>;
  onClose: () => void;
}

export const VacationAuthorizationModal: React.FC<VacationAuthorizationModalProps> = ({
  open,
  title,
  message,
  currentUser,
  users,
  justification,
  onSubmit,
  onClose,
}) => {
  const [authorizerId, setAuthorizerId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const authorizerOptions = useMemo(
    () =>
      users.filter(
        u => u.id !== currentUser.id && canActAsVacationAuthorizer(u.role)
      ),
    [users, currentUser.id]
  );

  if (!open) return null;

  const handleSubmit = async () => {
    if (!authorizerId) {
      setError('Debe seleccionar un usuario autorizador');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onSubmit(authorizerId);
      setAuthorizerId('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'No se pudo enviar la solicitud');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="bg-indigo-700 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
          <span className="font-bold flex items-center gap-2">
            <Send size={18} /> {title}
          </span>
          <button type="button" onClick={onClose} disabled={submitting}>
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">{message}</p>
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
            Solicitante: <strong>{currentUser.name}</strong>. Seleccione quién debe autorizar esta acción.
            El usuario designado recibirá una alerta y deberá ingresar a Vacaciones para aprobar o rechazar.
          </p>

          {justification?.trim() && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-900 mb-1">Justificación registrada</p>
              <p className="text-sm text-amber-950 whitespace-pre-wrap">{justification}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Usuario autorizador</label>
            <select
              className="w-full border rounded-lg p-2 text-sm"
              value={authorizerId}
              onChange={e => setAuthorizerId(e.target.value)}
            >
              <option value="">Seleccionar usuario...</option>
              {authorizerOptions.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.role}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle size={14} /> {error}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !authorizerId}
              className="flex-1 py-2.5 rounded-lg bg-indigo-700 text-white text-sm font-medium hover:bg-indigo-800 disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Enviar solicitud'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
