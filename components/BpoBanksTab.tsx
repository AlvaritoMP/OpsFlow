import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Landmark,
  Plus,
  Edit2,
  Trash2,
  X,
  RefreshCw,
  Upload,
  Download,
  Phone,
  Mail,
  User,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  BpoBankAccount,
  BpoBankAccountType,
  BpoBankStatement,
  BpoCurrency,
} from '../types';
import { bpoBanksService } from '../services/bpoBanksService';

interface BpoBanksTabProps {
  unitId: string;
  canEdit: boolean;
}

const ACCOUNT_TYPE_LABELS: Record<BpoBankAccountType, string> = {
  own: 'Cuentas propias',
  provider: 'Proveedores',
  detraction: 'Detracciones',
};

const CURRENCY_LABELS: Record<BpoCurrency, string> = {
  PEN: 'Soles (PEN)',
  USD: 'Dólares (USD)',
  EUR: 'Euros (EUR)',
  OTHER: 'Otra moneda',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EMPTY_ACCOUNT = {
  accountType: 'own' as BpoBankAccountType,
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  interbankAccount: '',
  currency: 'PEN' as BpoCurrency,
  currencyOther: '',
  swiftCode: '',
  providerName: '',
  executiveName: '',
  executivePhone: '',
  executiveEmail: '',
  notes: '',
  isActive: true,
};

export const BpoBanksTab: React.FC<BpoBanksTabProps> = ({ unitId, canEdit }) => {
  const [accounts, setAccounts] = useState<BpoBankAccount[]>([]);
  const [statements, setStatements] = useState<BpoBankStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<BpoBankAccountType>('own');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BpoBankAccount | null>(null);
  const [statementAccountId, setStatementAccountId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState(EMPTY_ACCOUNT);
  const [statementForm, setStatementForm] = useState({ label: '', periodMonth: '' });
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [acc, stm] = await Promise.all([
        bpoBanksService.getAccountsByUnitId(unitId),
        bpoBanksService.getStatementsByUnitId(unitId),
      ]);
      setAccounts(acc);
      setStatements(stm);
    } catch {
      setMessage({ type: 'err', text: 'No se pudieron cargar los datos bancarios.' });
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sectionAccounts = useMemo(
    () => accounts.filter((a) => a.accountType === section),
    [accounts, section]
  );

  const statementsByAccount = useMemo(() => {
    const map: Record<string, BpoBankStatement[]> = {};
    statements.forEach((s) => {
      if (!map[s.bankAccountId]) map[s.bankAccountId] = [];
      map[s.bankAccountId].push(s);
    });
    return map;
  }, [statements]);

  const openCreateAccount = () => {
    setEditingAccount(null);
    setAccountForm({ ...EMPTY_ACCOUNT, accountType: section });
    setShowAccountModal(true);
  };

  const openEditAccount = (account: BpoBankAccount) => {
    setEditingAccount(account);
    setAccountForm({
      accountType: account.accountType,
      bankName: account.bankName,
      accountHolderName: account.accountHolderName || '',
      accountNumber: account.accountNumber || '',
      interbankAccount: account.interbankAccount || '',
      currency: account.currency,
      currencyOther: account.currencyOther || '',
      swiftCode: account.swiftCode || '',
      providerName: account.providerName || '',
      executiveName: account.executiveName || '',
      executivePhone: account.executivePhone || '',
      executiveEmail: account.executiveEmail || '',
      notes: account.notes || '',
      isActive: account.isActive,
    });
    setShowAccountModal(true);
  };

  const handleSaveAccount = async () => {
    if (!accountForm.bankName.trim()) {
      setMessage({ type: 'err', text: 'El nombre del banco es obligatorio.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        accountType: accountForm.accountType,
        bankName: accountForm.bankName.trim(),
        accountHolderName: accountForm.accountHolderName.trim() || undefined,
        accountNumber: accountForm.accountNumber.trim() || undefined,
        interbankAccount: accountForm.interbankAccount.trim() || undefined,
        currency: accountForm.currency,
        currencyOther: accountForm.currency === 'OTHER' ? accountForm.currencyOther.trim() || undefined : undefined,
        swiftCode: accountForm.swiftCode.trim() || undefined,
        providerName: accountForm.providerName.trim() || undefined,
        executiveName: accountForm.executiveName.trim() || undefined,
        executivePhone: accountForm.executivePhone.trim() || undefined,
        executiveEmail: accountForm.executiveEmail.trim() || undefined,
        notes: accountForm.notes.trim() || undefined,
        isActive: accountForm.isActive,
      };
      if (editingAccount) {
        await bpoBanksService.updateAccount(editingAccount.id, payload);
      } else {
        await bpoBanksService.createAccount(unitId, payload);
      }
      setShowAccountModal(false);
      await loadData();
      setMessage({ type: 'ok', text: editingAccount ? 'Cuenta actualizada.' : 'Cuenta registrada.' });
    } catch {
      setMessage({ type: 'err', text: 'Error al guardar la cuenta.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async (account: BpoBankAccount) => {
    if (!window.confirm(`¿Eliminar la cuenta en ${account.bankName}? Se eliminarán también sus estados de cuenta.`)) return;
    try {
      await bpoBanksService.deleteAccount(account.id);
      await loadData();
      setMessage({ type: 'ok', text: 'Cuenta eliminada.' });
    } catch {
      setMessage({ type: 'err', text: 'No se pudo eliminar la cuenta.' });
    }
  };

  const openUploadStatement = (accountId: string) => {
    setStatementAccountId(accountId);
    const now = new Date();
    setStatementForm({
      label: `Estado de cuenta ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      periodMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    });
    setStatementFile(null);
    setShowStatementModal(true);
  };

  const handleUploadStatement = async () => {
    if (!statementAccountId || !statementFile) {
      setMessage({ type: 'err', text: 'Seleccione un archivo.' });
      return;
    }
    if (!statementForm.label.trim()) {
      setMessage({ type: 'err', text: 'Indique una etiqueta para el estado de cuenta.' });
      return;
    }
    setSaving(true);
    try {
      await bpoBanksService.uploadStatement(unitId, statementAccountId, statementFile, {
        label: statementForm.label.trim(),
        periodMonth: statementForm.periodMonth || undefined,
      });
      setShowStatementModal(false);
      await loadData();
      setExpandedId(statementAccountId);
      setMessage({ type: 'ok', text: 'Estado de cuenta guardado.' });
    } catch {
      setMessage({ type: 'err', text: 'Error al subir el estado de cuenta.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStatement = async (statement: BpoBankStatement) => {
    if (!window.confirm(`¿Eliminar "${statement.label}"?`)) return;
    try {
      await bpoBanksService.deleteStatement(statement.id);
      await loadData();
      setMessage({ type: 'ok', text: 'Estado de cuenta eliminado.' });
    } catch {
      setMessage({ type: 'err', text: 'No se pudo eliminar.' });
    }
  };

  const displayCurrency = (account: BpoBankAccount) =>
    account.currency === 'OTHER' ? account.currencyOther || 'Otra' : account.currency;

  const renderAccountCard = (account: BpoBankAccount) => {
    const accountStatements = statementsByAccount[account.id] || [];
    const isExpanded = expandedId === account.id;

    return (
      <div
        key={account.id}
        className={`border rounded-xl overflow-hidden bg-white ${account.isActive ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Landmark size={18} className="text-emerald-600 shrink-0" />
                <h4 className="font-bold text-slate-800">{account.bankName}</h4>
                {!account.isActive && (
                  <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">Inactiva</span>
                )}
              </div>
              {account.accountType === 'provider' && account.providerName && (
                <p className="text-sm text-amber-700 font-medium">{account.providerName}</p>
              )}
              {account.accountHolderName && (
                <p className="text-sm text-slate-600 mt-1">Titular: {account.accountHolderName}</p>
              )}
            </div>
            {canEdit && (
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => openEditAccount(account)}
                  className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                >
                  <Edit2 size={15} />
                </button>
                <button
                  onClick={() => handleDeleteAccount(account)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-4 text-sm">
            {account.accountNumber && (
              <div>
                <span className="text-slate-400 text-xs">N° cuenta</span>
                <p className="font-mono text-slate-700">{account.accountNumber}</p>
              </div>
            )}
            {account.interbankAccount && (
              <div>
                <span className="text-slate-400 text-xs">CCI</span>
                <p className="font-mono text-slate-700">{account.interbankAccount}</p>
              </div>
            )}
            <div>
              <span className="text-slate-400 text-xs">Moneda</span>
              <p className="text-slate-700">{displayCurrency(account)}</p>
            </div>
            {account.swiftCode && (
              <div>
                <span className="text-slate-400 text-xs">SWIFT</span>
                <p className="font-mono text-slate-700">{account.swiftCode}</p>
              </div>
            )}
          </div>

          {(account.executiveName || account.executivePhone || account.executiveEmail) && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Ejecutivo de cuenta</p>
              <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                {account.executiveName && (
                  <span className="flex items-center gap-1.5">
                    <User size={14} className="text-slate-400" /> {account.executiveName}
                  </span>
                )}
                {account.executivePhone && (
                  <a href={`tel:${account.executivePhone}`} className="flex items-center gap-1.5 hover:text-blue-600">
                    <Phone size={14} className="text-slate-400" /> {account.executivePhone}
                  </a>
                )}
                {account.executiveEmail && (
                  <a href={`mailto:${account.executiveEmail}`} className="flex items-center gap-1.5 hover:text-blue-600">
                    <Mail size={14} className="text-slate-400" /> {account.executiveEmail}
                  </a>
                )}
              </div>
            </div>
          )}

          {account.notes && <p className="text-xs text-slate-500 mt-3 border-t border-slate-100 pt-3">{account.notes}</p>}
        </div>

        <div className="border-t border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={() => setExpandedId(isExpanded ? null : account.id)}
            className="w-full px-5 py-3 flex items-center justify-between text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <span className="flex items-center gap-2">
              <FileText size={16} />
              Estados de cuenta ({accountStatements.length})
            </span>
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {isExpanded && (
            <div className="px-5 pb-4 space-y-2">
              {canEdit && (
                <button
                  onClick={() => openUploadStatement(account.id)}
                  className="w-full py-2 border border-dashed border-emerald-300 rounded-lg text-emerald-700 text-sm font-medium hover:bg-emerald-50 flex items-center justify-center gap-2"
                >
                  <Upload size={16} /> Subir estado de cuenta
                </button>
              )}
              {accountStatements.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-3">Sin estados de cuenta archivados.</p>
              ) : (
                accountStatements.map((st) => (
                  <div
                    key={st.id}
                    className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{st.label}</p>
                      <p className="text-xs text-slate-400">
                        {st.periodMonth && <span>{st.periodMonth} · </span>}
                        {formatFileSize(st.fileSize)} · {new Date(st.uploadedAt).toLocaleDateString('es-PE')}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <a
                        href={st.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Descargar"
                      >
                        <Download size={15} />
                      </a>
                      {canEdit && (
                        <button
                          onClick={() => handleDeleteStatement(st)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Landmark className="w-5 h-5 text-emerald-600" /> Bancos
          </h3>
          <p className="text-slate-500 text-sm mt-1">
            Cuentas bancarias, ejecutivos de cuenta, cuentas de proveedores y detracciones con sus estados de cuenta.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          {canEdit && (
            <button
              onClick={openCreateAccount}
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 flex items-center gap-2 shadow-sm"
            >
              <Plus size={16} /> Nueva cuenta
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`px-4 py-3 rounded-lg text-sm ${
            message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(['own', 'provider', 'detraction'] as BpoBankAccountType[]).map((type) => {
          const count = accounts.filter((a) => a.accountType === type).length;
          return (
            <button
              key={type}
              onClick={() => setSection(type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                section === type ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {ACCOUNT_TYPE_LABELS[type]} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
          Cargando cuentas…
        </div>
      ) : sectionAccounts.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sectionAccounts.map(renderAccountCard)}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-200">
          <Landmark className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No hay cuentas en {ACCOUNT_TYPE_LABELS[section].toLowerCase()}.</p>
          {canEdit && (
            <button onClick={openCreateAccount} className="mt-4 text-emerald-600 text-sm font-medium hover:underline">
              Registrar cuenta
            </button>
          )}
        </div>
      )}

      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">{editingAccount ? 'Editar cuenta' : 'Nueva cuenta bancaria'}</h3>
              <button onClick={() => setShowAccountModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de cuenta</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2"
                    value={accountForm.accountType}
                    onChange={(e) => setAccountForm({ ...accountForm, accountType: e.target.value as BpoBankAccountType })}
                  >
                    {(Object.keys(ACCOUNT_TYPE_LABELS) as BpoBankAccountType[]).map((t) => (
                      <option key={t} value={t}>
                        {ACCOUNT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Banco *</label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-2"
                    value={accountForm.bankName}
                    onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })}
                  />
                </div>
              </div>

              {accountForm.accountType === 'provider' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del proveedor</label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-2"
                    value={accountForm.providerName}
                    onChange={(e) => setAccountForm({ ...accountForm, providerName: e.target.value })}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Titular de la cuenta</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-2"
                  value={accountForm.accountHolderName}
                  onChange={(e) => setAccountForm({ ...accountForm, accountHolderName: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">N° de cuenta</label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                    value={accountForm.accountNumber}
                    onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cuenta interbancaria (CCI)</label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono"
                    value={accountForm.interbankAccount}
                    onChange={(e) => setAccountForm({ ...accountForm, interbankAccount: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Moneda</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg p-2"
                    value={accountForm.currency}
                    onChange={(e) => setAccountForm({ ...accountForm, currency: e.target.value as BpoCurrency })}
                  >
                    {(Object.keys(CURRENCY_LABELS) as BpoCurrency[]).map((c) => (
                      <option key={c} value={c}>
                        {CURRENCY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
                {accountForm.currency === 'OTHER' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Especificar moneda</label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 rounded-lg p-2"
                      value={accountForm.currencyOther}
                      onChange={(e) => setAccountForm({ ...accountForm, currencyOther: e.target.value })}
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Código SWIFT</label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-2 font-mono uppercase"
                    value={accountForm.swiftCode}
                    onChange={(e) => setAccountForm({ ...accountForm, swiftCode: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100">
                <p className="text-sm font-semibold text-slate-700 mb-3">Ejecutivo de cuenta</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Nombre</label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                      value={accountForm.executiveName}
                      onChange={(e) => setAccountForm({ ...accountForm, executiveName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Teléfono</label>
                    <input
                      type="tel"
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                      value={accountForm.executivePhone}
                      onChange={(e) => setAccountForm({ ...accountForm, executivePhone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Correo</label>
                    <input
                      type="email"
                      className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                      value={accountForm.executiveEmail}
                      onChange={(e) => setAccountForm({ ...accountForm, executiveEmail: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                <textarea
                  className="w-full border border-slate-300 rounded-lg p-2 min-h-[60px]"
                  value={accountForm.notes}
                  onChange={(e) => setAccountForm({ ...accountForm, notes: e.target.value })}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={accountForm.isActive}
                  onChange={(e) => setAccountForm({ ...accountForm, isActive: e.target.checked })}
                />
                Cuenta activa
              </label>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setShowAccountModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm">
                Cancelar
              </button>
              <button
                onClick={handleSaveAccount}
                disabled={saving}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showStatementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">Subir estado de cuenta</h3>
              <button onClick={() => setShowStatementModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Etiqueta *</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-2"
                  value={statementForm.label}
                  onChange={(e) => setStatementForm({ ...statementForm, label: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Periodo (mes)</label>
                <input
                  type="month"
                  className="w-full border border-slate-300 rounded-lg p-2"
                  value={statementForm.periodMonth}
                  onChange={(e) => setStatementForm({ ...statementForm, periodMonth: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Archivo *</label>
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv,image/*"
                  className="w-full text-sm"
                  onChange={(e) => setStatementFile(e.target.files?.[0] || null)}
                />
                {statementFile && (
                  <p className="text-xs text-slate-500 mt-1">
                    {statementFile.name} ({formatFileSize(statementFile.size)})
                  </p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setShowStatementModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm">
                Cancelar
              </button>
              <button
                onClick={handleUploadStatement}
                disabled={saving || !statementFile}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Subiendo…' : 'Subir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
