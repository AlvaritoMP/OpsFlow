import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardPlus,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  RefreshCw,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  PAYROLL_COVERAGE_LABELS,
  PAYROLL_INCIDENT_REASON_LABELS,
  PAYROLL_INCIDENT_STATUS_LABELS,
  PAYROLL_INCIDENT_TYPE_LABELS,
  attendanceIncidentService,
} from '../services/attendanceIncidentService';
import type { PayrollAttendanceIncident, PayrollAttendanceIncidentStatus } from '../types';
import { SafeImage } from './SafeImage';
import { DateInput } from './DateInput';

interface MattermostIncidentsProps {
  canEdit?: boolean;
  canDelete?: boolean;
  onSelectUnit?: (unitId: string) => void;
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
  if (!y || !mo || !d) return iso || '';
  return `${d}/${mo}/${y}`;
}

function formatDateTime(iso: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function createdDateIso(iso: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function isImage(mime?: string | null, name?: string): boolean {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp)$/i.test(name || '');
}

function norm(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export const MattermostIncidents: React.FC<MattermostIncidentsProps> = ({
  canEdit = false,
  canDelete = false,
  onSelectUnit,
}) => {
  const [rows, setRows] = useState<PayrollAttendanceIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [workerQuery, setWorkerQuery] = useState('');
  const [dateQuery, setDateQuery] = useState('');
  const [reporterQuery, setReporterQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await attendanceIncidentService.listAll();
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los reportes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const worker = norm(workerQuery);
    const reporter = norm(reporterQuery);
    return rows.filter((row) => {
      if (worker) {
        const hay = `${norm(row.employeeName)} ${norm(row.employeeDni)}`;
        if (!hay.includes(worker)) return false;
      }
      if (dateQuery) {
        const hitIncident = row.incidentDate === dateQuery;
        const hitCreated = createdDateIso(row.createdAt) === dateQuery;
        if (!hitIncident && !hitCreated) return false;
      }
      if (reporter) {
        if (!norm(row.reportedBy).includes(reporter)) return false;
      }
      return true;
    });
  }, [rows, workerQuery, dateQuery, reporterQuery]);

  const hasFilters = Boolean(workerQuery || dateQuery || reporterQuery);

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

  const onDelete = async (row: PayrollAttendanceIncident) => {
    const who = row.employeeName || 'este trabajador';
    const ok = window.confirm(
      `¿Eliminar el expediente de falta de ${who} (${formatDay(row.incidentDate)}) en OpsFlow?\n\nÚsalo para pruebas o registros erróneos. El mensaje en Mattermost no se borra. Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    setSavingId(row.id);
    setError(null);
    try {
      await attendanceIncidentService.deleteById(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el expediente');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <MessageCircle size={22} className="text-teal-700" />
            Mattermost
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Todos los <code className="bg-slate-100 px-1 rounded">/falta</code> reportados por
            supervisores, en orden de registro. Las fotos y CITT se adjuntan en el hilo de Mattermost.
            {canDelete
              ? ' Puedes borrar un expediente de prueba o erróneo; el mensaje en Mattermost no se elimina.'
              : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-teal-700 self-start"
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase mb-3">
          <Search size={14} /> Buscar reportes
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Trabajador (nombre o DNI)</span>
            <input
              type="search"
              value={workerQuery}
              onChange={(e) => setWorkerQuery(e.target.value)}
              placeholder="Ej. Pérez o 12345678"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Fecha (incidencia o reporte)</span>
            <DateInput value={dateQuery} onChange={setDateQuery} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-600 mb-1">Usuario que reportó</span>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={reporterQuery}
                onChange={(e) => setReporterQuery(e.target.value)}
                placeholder="Usuario Mattermost"
                className="w-full border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm"
              />
            </div>
          </label>
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setWorkerQuery('');
              setDateQuery('');
              setReporterQuery('');
            }}
            className="mt-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            <X size={12} /> Limpiar filtros
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[280px]">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm">
            <ClipboardPlus size={16} className="text-teal-700" />
            Reportes
          </h3>
          <span className="text-xs text-slate-500">
            {loading ? 'Cargando…' : `${filtered.length} de ${rows.length}`}
          </span>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-slate-400">Cargando reportes de /falta…</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {rows.length === 0
              ? 'Aún no hay reportes. Cuando un supervisor use /falta en Mattermost, aparecerán aquí.'
              : 'Ningún reporte coincide con la búsqueda.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((row) => (
              <li key={row.id} className="p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500 font-medium">
                      Reportado {formatDateTime(row.createdAt)}
                      {row.reportedBy ? ` · ${row.reportedBy}` : ''}
                    </div>
                    <div className="font-semibold text-slate-800 mt-0.5">
                      {row.employeeName || 'Trabajador'}
                      {row.employeeDni ? (
                        <span className="text-slate-500 font-normal"> · DNI {row.employeeDni}</span>
                      ) : null}
                    </div>
                    <div className="text-sm text-slate-600 mt-0.5">
                      {onSelectUnit ? (
                        <button
                          type="button"
                          className="text-teal-700 hover:underline font-medium"
                          onClick={() => onSelectUnit(row.unitId)}
                        >
                          {row.unitName || 'Unidad'}
                        </button>
                      ) : (
                        <span>{row.unitName || 'Unidad'}</span>
                      )}
                      <span className="text-slate-400"> · </span>
                      Incidencia {formatDay(row.incidentDate)}
                      <span className="text-slate-400"> · </span>
                      {PAYROLL_INCIDENT_TYPE_LABELS[row.incidentType]}
                      <span className="text-slate-400"> · </span>
                      {PAYROLL_INCIDENT_REASON_LABELS[row.incidentReason]}
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
                    {canDelete ? (
                      <button
                        type="button"
                        title="Eliminar expediente de prueba o erróneo"
                        disabled={savingId === row.id}
                        onClick={() => void onDelete(row)}
                        className="inline-flex items-center gap-1 text-xs text-red-700 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                        Borrar
                      </button>
                    ) : null}
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
    </div>
  );
};
