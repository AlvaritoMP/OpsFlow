import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardPlus, ExternalLink, FileText, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { Unit } from '../types';
import {
  PAYROLL_COVERAGE_LABELS,
  PAYROLL_INCIDENT_REASON_LABELS,
  PAYROLL_INCIDENT_STATUS_LABELS,
  PAYROLL_INCIDENT_TYPE_LABELS,
  attendanceIncidentService,
} from '../services/attendanceIncidentService';
import type { PayrollAttendanceIncident, PayrollAttendanceIncidentStatus } from '../types';
import { SafeImage } from './SafeImage';

interface AttendanceIncidentsPanelProps {
  unit: Unit;
  canEdit?: boolean;
}

function coverageClass(value: string): string {
  if (value === 'CON_COBERTURA') return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (value === 'SIN_COBERTURA') return 'bg-red-50 text-red-800 border-red-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

function statusClass(value: string): string {
  if (value === 'PENDING_JUSTIFICATION') return 'bg-amber-50 text-amber-900 border-amber-200';
  if (value === 'UNJUSTIFIED_ABSENCE') return 'bg-red-50 text-red-800 border-red-100';
  if (value === 'MEDICAL_REST') return 'bg-orange-50 text-orange-900 border-orange-100';
  return 'bg-sky-50 text-sky-900 border-sky-200';
}

function formatDay(iso: string): string {
  const [y, mo, d] = (iso || '').split('-');
  if (!y || !mo || !d) return iso;
  return `${d}/${mo}/${y}`;
}

function isImage(mime?: string | null, name?: string): boolean {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp)$/i.test(name || '');
}

export const AttendanceIncidentsPanel: React.FC<AttendanceIncidentsPanelProps> = ({
  unit,
  canEdit = false,
}) => {
  const [rows, setRows] = useState<PayrollAttendanceIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await attendanceIncidentService.listByUnit(unit.id);
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las novedades');
    } finally {
      setLoading(false);
    }
  }, [unit.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onStatus = async (id: string, status: PayrollAttendanceIncidentStatus) => {
    setSavingId(id);
    setError(null);
    try {
      await attendanceIncidentService.updateStatus(id, status);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el estado');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[320px]">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-800 flex items-center gap-2">
            <ClipboardPlus size={18} className="text-teal-700" />
            Expedientes /falta
          </h4>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            Incidencias registradas por supervisores en Mattermost. Las fotos y CITT se adjuntan
            respondiendo al hilo de la tarjeta, no desde el modal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-teal-700"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <p className="p-6 text-sm text-slate-400">Cargando expedientes…</p>
      ) : rows.length === 0 ? (
        <p className="p-6 text-sm text-slate-500">
          Aún no hay faltas de Mattermost para esta unidad. El supervisor usa{' '}
          <code className="bg-slate-100 px-1 rounded">/falta</code> en el canal.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-800">
                    {row.employeeName || 'Trabajador'}
                    {row.employeeDni ? (
                      <span className="text-slate-500 font-normal"> · DNI {row.employeeDni}</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {formatDay(row.incidentDate)} · {PAYROLL_INCIDENT_TYPE_LABELS[row.incidentType]} ·{' '}
                    {PAYROLL_INCIDENT_REASON_LABELS[row.incidentReason]}
                    {row.reportedBy ? ` · ${row.reportedBy}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs font-medium border rounded-full px-2 py-0.5 ${coverageClass(row.hasCoverage)}`}
                  >
                    {PAYROLL_COVERAGE_LABELS[row.hasCoverage]}
                  </span>
                  {canEdit ? (
                    <select
                      className="text-xs border border-slate-300 rounded-lg px-2 py-1 bg-white"
                      value={row.status}
                      disabled={savingId === row.id}
                      onChange={(e) =>
                        void onStatus(row.id, e.target.value as PayrollAttendanceIncidentStatus)
                      }
                    >
                      {(Object.keys(PAYROLL_INCIDENT_STATUS_LABELS) as PayrollAttendanceIncidentStatus[]).map(
                        (status) => (
                          <option key={status} value={status}>
                            {PAYROLL_INCIDENT_STATUS_LABELS[status]}
                          </option>
                        )
                      )}
                    </select>
                  ) : (
                    <span className={`text-xs font-medium border rounded-full px-2 py-0.5 ${statusClass(row.status)}`}>
                      {PAYROLL_INCIDENT_STATUS_LABELS[row.status]}
                    </span>
                  )}
                </div>
              </div>

              {row.observations ? (
                <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  {row.observations}
                </p>
              ) : null}

              {row.attachments.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {row.attachments.map((file) =>
                    isImage(file.mime_type, file.file_name) ? (
                      <a
                        key={file.public_url}
                        href={file.public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-50"
                        title={file.file_name}
                      >
                        <SafeImage
                          src={file.public_url}
                          alt={file.file_name}
                          className="w-full h-full object-cover"
                          bucket="attendance-incident-attachments"
                          fallback={
                            <span className="flex items-center justify-center h-full text-slate-400">
                              <ImageIcon size={18} />
                            </span>
                          }
                        />
                      </a>
                    ) : (
                      <a
                        key={file.public_url}
                        href={file.public_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 hover:bg-slate-50"
                      >
                        <FileText size={14} />
                        {file.file_name}
                      </a>
                    )
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Sin sustentos fotográficos todavía.</p>
              )}

              {row.mattermostPermalink ? (
                <a
                  href={row.mattermostPermalink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-teal-700 hover:underline"
                >
                  <ExternalLink size={12} /> Abrir hilo en Mattermost
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
