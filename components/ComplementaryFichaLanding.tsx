import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, Loader2, Lock, Save, User } from 'lucide-react';
import { ComplementaryFichaForm } from './ComplementaryFichaForm';
import {
  publicComplementaryFichaService,
  type PublicComplementaryFichaPayload,
} from '../services/publicComplementaryFichaService';
import type { WorkerSnapshotComplementary } from '../types';

function emptyComplementary(dni: string): WorkerSnapshotComplementary {
  return {
    tipoDocumento: 'DNI',
    nroDocumento: dni,
  };
}

export const ComplementaryFichaLanding: React.FC = () => {
  const [dniInput, setDniInput] = useState('');
  const [session, setSession] = useState<PublicComplementaryFichaPayload | null>(null);
  const [draft, setDraft] = useState<WorkerSnapshotComplementary>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const dni = publicComplementaryFichaService.normalizeDni(dniInput);
  const dniValid = dni.length === 8;

  const handleDraftChange = (next: WorkerSnapshotComplementary) => {
    setDraft({
      ...next,
      tipoDocumento: 'DNI',
      nroDocumento: session?.dni ?? dni,
    });
    setDirty(true);
    setSavedMsg(null);
  };

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dniValid || loading) return;
    setLoading(true);
    setError(null);
    setSavedMsg(null);
    try {
      const payload = await publicComplementaryFichaService.open(dni);
      setSession(payload);
      setDraft({
        ...emptyComplementary(payload.dni),
        ...payload.complementary,
        tipoDocumento: 'DNI',
        nroDocumento: payload.dni,
      });
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo abrir la ficha');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!session?.canEdit || saving) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const payload = await publicComplementaryFichaService.save(session.dni, draft);
      setSession(payload);
      setDraft({
        ...payload.complementary,
        tipoDocumento: 'DNI',
        nroDocumento: payload.dni,
      });
      setDirty(false);
      setSavedMsg('Ficha guardada correctamente');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la ficha');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeDni = () => {
    setSession(null);
    setDraft({});
    setDirty(false);
    setError(null);
    setSavedMsg(null);
  };

  const attemptsLabel = useMemo(() => {
    if (!session) return '';
    if (session.locked) {
      return 'Ya usaste las 3 aperturas de esta ficha. La información quedó bloqueada.';
    }
    if (session.openCount >= session.maxOpens) {
      return `Esta es tu última apertura (${session.openCount} de ${session.maxOpens}). Al salir ya no podrás editar.`;
    }
    return `Apertura ${session.openCount} de ${session.maxOpens}. Te quedan ${session.remainingOpens} después de esta.`;
  }, [session]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 px-4 py-8">
      <div className={`mx-auto w-full ${session ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="mb-6 text-center md:mb-8">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 shadow-lg md:mb-4 md:h-16 md:w-16">
            <ClipboardList className="h-8 w-8 text-white md:h-10 md:w-10" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-white md:text-3xl">Ficha complementaria</h1>
          <p className="text-sm text-slate-300 md:text-base">
            Completa tus datos para tu ingreso. No necesitas iniciar sesión.
          </p>
        </div>

        {!session ? (
          <div className="rounded-2xl bg-white p-6 shadow-2xl md:p-8">
            <h2 className="mb-2 flex items-center text-xl font-bold text-slate-800 md:text-2xl">
              <User className="mr-2" size={20} />
              Ingresa tu DNI
            </h2>
            <p className="mb-5 text-sm text-slate-500">
              Puedes abrir esta ficha hasta 3 veces. Cuando se acaben las oportunidades, ya no se
              podrá editar.
            </p>

            {error && (
              <div className="mb-4 flex items-start rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={16} className="mr-2 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleOpen} className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">DNI</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={8}
                  value={dniInput}
                  onChange={(e) => setDniInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base outline-none focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  placeholder="12345678"
                  disabled={loading}
                />
              </label>
              <button
                type="submit"
                disabled={!dniValid || loading}
                className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-blue-600 py-3 text-base font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 animate-spin" size={18} />
                    Abriendo ficha...
                  </>
                ) : (
                  'Continuar'
                )}
              </button>
            </form>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-5 py-4 md:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    DNI {session.dni}
                  </p>
                  <h2 className="text-lg font-bold text-slate-900">Tus datos personales</h2>
                </div>
                <button
                  type="button"
                  onClick={handleChangeDni}
                  className="text-sm text-slate-500 hover:text-slate-800"
                >
                  Usar otro DNI
                </button>
              </div>
              <p
                className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                  session.locked
                    ? 'bg-slate-100 text-slate-700'
                    : session.openCount >= session.maxOpens
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-blue-50 text-blue-800'
                }`}
              >
                {attemptsLabel}
              </p>
            </div>

            <div className="space-y-4 px-5 py-5 md:px-6">
              {error && (
                <div className="flex items-start rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle size={16} className="mr-2 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {savedMsg && (
                <div className="flex items-start rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  <CheckCircle2 size={16} className="mr-2 mt-0.5 shrink-0" />
                  <span>{savedMsg}</span>
                </div>
              )}
              {session.locked && (
                <div className="flex items-start rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  <Lock size={16} className="mr-2 mt-0.5 shrink-0" />
                  <span>La ficha está en solo lectura. Si hay un error, contacta a operaciones.</span>
                </div>
              )}

              <ComplementaryFichaForm
                value={draft}
                disabled={!session.canEdit}
                onChange={handleDraftChange}
              />
            </div>

            {session.canEdit && (
              <div className="sticky bottom-0 border-t border-slate-100 bg-white px-5 py-4 md:px-6">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!dirty || saving}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-lg bg-blue-600 py-3 text-base font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 animate-spin" size={18} />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2" size={18} />
                      Guardar ficha
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-400 md:text-sm">
          OpsFlow · Ficha de personal
        </p>
      </div>
    </div>
  );
};
