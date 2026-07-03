import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Grid3x3,
  CheckCircle,
  AlertTriangle,
  Minus,
  HelpCircle,
  UserX,
  MessageSquare,
  X,
} from 'lucide-react';
import { Unit, ResourceType, Resource } from '../types';
import {
  attendanceReportService,
  AttendanceRowWithImportMeta,
  effectiveAttendanceDate,
  filterRowsMatchedActivePersonnel,
  classifyAttendanceStatus,
  AttendanceClassification,
} from '../services/attendanceReportService';
import { SafeImage } from './SafeImage';
import { AttendanceMarkCommentBlock } from './AttendanceMarkCommentBlock';

interface AttendanceConsolidatedViewProps {
  unit: Unit;
  /** Cambia cuando se suben o eliminan importaciones (p. ej. ids de imports unidos). */
  importsKey: string;
  /** Permite añadir o editar comentario en la celda (mismo criterio que subir Excel). */
  canComment?: boolean;
}

function activePersonnelSorted(unit: Unit): Resource[] {
  return (unit.resources || [])
    .filter((r) => r.type === ResourceType.PERSONNEL)
    .filter((r) => {
      if (r.archived === true) return false;
      if (r.personnelStatus === 'cesado' || r.personnelStatus === 'archivado') return false;
      return true;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
}

type CellVisual = {
  classification: AttendanceClassification;
  labelShort: string;
  title: string;
  row?: AttendanceRowWithImportMeta;
};

function cellVisual(row: AttendanceRowWithImportMeta | undefined): CellVisual {
  if (!row) {
    return {
      classification: 'other',
      labelShort: '—',
      title: 'Sin reporte importado para este día',
    };
  }
  const c = classifyAttendanceStatus(row.attendance_status);
  const status = row.attendance_status || '—';
  const file = row.source_filename || 'archivo';
  const uploaded = row.uploaded_at ? new Date(row.uploaded_at).toLocaleString('es-PE') : '';
  const uc = row.userComment?.trim();
  const title = [
    status,
    uc ? `Comentario OpsFlow: ${uc}` : '',
    `Archivo: ${file}`,
    uploaded ? `Carga: ${uploaded}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (c === 'complete') {
    return { classification: c, labelShort: 'C', title, row };
  }
  if (c === 'partial') {
    return { classification: c, labelShort: 'I', title, row };
  }
  if (c === 'none') {
    return { classification: c, labelShort: '∅', title, row };
  }
  return { classification: 'other', labelShort: '·', title, row };
}

function cellClass(v: CellVisual): string {
  const base =
    'inline-flex items-center justify-center min-w-[2rem] h-8 px-1.5 rounded-md text-xs font-bold border tabular-nums';
  switch (v.classification) {
    case 'complete':
      return `${base} bg-emerald-50 text-emerald-900 border-emerald-200`;
    case 'partial':
      return `${base} bg-amber-50 text-amber-900 border-amber-200`;
    case 'none':
      return `${base} bg-slate-100 text-slate-700 border-slate-200`;
    default:
      if (v.labelShort === '—') return `${base} bg-white text-slate-300 border-slate-100 border-dashed`;
      return `${base} bg-blue-50 text-blue-900 border-blue-100`;
  }
}

export const AttendanceConsolidatedView: React.FC<AttendanceConsolidatedViewProps> = ({
  unit,
  importsKey,
  canComment = false,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AttendanceRowWithImportMeta[]>([]);
  const [commentRow, setCommentRow] = useState<AttendanceRowWithImportMeta | null>(null);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 45);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await attendanceReportService.getUnitAttendanceRowsWithMeta(unit.id);
      setHistory(rows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [unit.id]);

  useEffect(() => {
    void load();
  }, [load, importsKey]);

  const matchedRows = useMemo(
    () => filterRowsMatchedActivePersonnel(unit, history) as AttendanceRowWithImportMeta[],
    [unit, history]
  );

  const rowsInRange = useMemo(() => {
    return matchedRows.filter((r) => {
      const d = effectiveAttendanceDate(r, r.import_report_date);
      return d >= dateFrom && d <= dateTo;
    });
  }, [matchedRows, dateFrom, dateTo]);

  /** Por trabajador + día: conserva la fila de la importación más reciente (misma lógica que “última verdad”). */
  const latestByWorkerDay = useMemo(() => {
    const map = new Map<string, AttendanceRowWithImportMeta>();
    for (const r of rowsInRange) {
      if (!r.matched_resource_id) continue;
      const d = effectiveAttendanceDate(r, r.import_report_date);
      const key = `${r.matched_resource_id}|${d}`;
      const prev = map.get(key);
      if (!prev || (r.uploaded_at || '').localeCompare(prev.uploaded_at || '') > 0) {
        map.set(key, r);
      }
    }
    return map;
  }, [rowsInRange]);

  const dates = useMemo(() => {
    const set = new Set<string>();
    for (const r of rowsInRange) {
      set.add(effectiveAttendanceDate(r, r.import_report_date));
    }
    return [...set].sort();
  }, [rowsInRange]);

  const workers = useMemo(() => activePersonnelSorted(unit), [unit]);

  const headerLabel = (iso: string) => {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    return `${m[3]}/${m[2]}`;
  };

  return (
    <div className="space-y-4 p-4 md:p-6 border-t border-slate-100 bg-slate-50/50">
      <div className="flex flex-col gap-1">
        <h4 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
          <Grid3x3 size={22} className="text-indigo-600" />
          Consolidado por trabajador y día
        </h4>
        <p className="text-sm text-slate-600 max-w-3xl">
          Matriz de todos los trabajadores activos de la unidad (con cruce por documento en al menos un Excel).
          Cada columna es un día con datos importados en el rango; la celda resume si la marcación fue{' '}
          <strong>completa</strong> o <strong>incompleta</strong> (u otros estados del archivo). Los días sin archivo
          no generan columna. Si subes nuevos reportes, usa <em>Actualizar</em> o vuelve a abrir esta vista.
          {canComment
            ? ' Puedes pulsar una celda con dato para añadir o revisar el comentario de esa marca.'
            : ' Pulsa una celda con dato para ver el detalle y comentarios guardados.'}
        </p>
      </div>

      <div className="flex flex-wrap gap-4 items-end bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Desde</label>
          <input
            type="date"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Hasta</label>
          <input
            type="date"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            value={dateTo}
            min={dateFrom}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-900 px-3 py-2 rounded-lg border border-indigo-200 bg-indigo-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar datos
        </button>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-900 border border-red-200">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 py-10 text-center">Cargando todas las importaciones…</p>
      ) : workers.length === 0 ? (
        <p className="text-sm text-slate-500 py-6">No hay personal activo en esta unidad.</p>
      ) : dates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500 text-sm">
          No hay registros emparejados en el rango de fechas. Amplia el rango o importa más archivos.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="text-sm w-full border-collapse min-w-max">
                <thead>
                  <tr className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                    <th className="sticky left-0 z-20 bg-slate-50 text-left px-3 py-2 border-r border-slate-200 min-w-[200px] shadow-[2px_0_0_0_rgb(226,232,240)]">
                      Trabajador
                    </th>
                    {dates.map((iso) => (
                      <th
                        key={iso}
                        className="px-2 py-2 text-center font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200 bg-slate-50"
                        title={iso}
                      >
                        <span className="font-mono">{headerLabel(iso)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workers.map((w) => (
                    <tr key={w.id} className="group hover:bg-slate-50/80">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-3 py-2 border-r border-slate-100 min-w-[200px] max-w-[260px] shadow-[2px_0_0_0_rgb(241,245,249)]">
                        <div className="flex items-center gap-2 min-w-0">
                          {w.image ? (
                            <SafeImage
                              src={w.image}
                              alt={w.name}
                              className="h-9 w-9 rounded-full object-cover border border-slate-200 shrink-0"
                              bucket={undefined}
                              fallback={
                                <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                  {(w.name || '?')
                                    .split(/\s+/)
                                    .slice(0, 2)
                                    .map((x) => x[0]?.toUpperCase())
                                    .join('')}
                                </div>
                              }
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                              {(w.name || '?')
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((x) => x[0]?.toUpperCase())
                                .join('')}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 truncate" title={w.name}>
                              {w.name}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 truncate">{w.dni || '—'}</div>
                          </div>
                        </div>
                      </td>
                      {dates.map((iso) => {
                        const cell = latestByWorkerDay.get(`${w.id}|${iso}`);
                        const v = cellVisual(cell);
                        const extendedTitle = v.title;
                        return (
                          <td key={iso} className="px-1 py-1.5 text-center align-middle">
                            {cell ? (
                              <button
                                type="button"
                                onClick={() => setCommentRow(cell)}
                                className="relative inline-flex flex-col items-center gap-0.5 mx-auto max-w-[4rem] group/cell"
                                title={extendedTitle}
                              >
                                <span className={cellClass(v)}>{v.labelShort}</span>
                                <MessageSquare
                                  size={11}
                                  className={
                                    cell.userComment?.trim()
                                      ? 'text-blue-600'
                                      : canComment
                                        ? 'text-slate-300 group-hover/cell:text-slate-500'
                                        : 'text-slate-200'
                                  }
                                  aria-hidden
                                />
                              </button>
                            ) : (
                              <span className={cellClass(v)} title={v.title}>
                                {v.labelShort}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-slate-600 bg-white rounded-lg border border-slate-200 px-4 py-3">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <CheckCircle size={14} className="text-emerald-600" />{' '}
              <span className="font-mono font-bold text-emerald-800 border border-emerald-200 bg-emerald-50 rounded px-1">C</span>{' '}
              Marcación completa
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <AlertTriangle size={14} className="text-amber-600" />{' '}
              <span className="font-mono font-bold text-amber-900 border border-amber-200 bg-amber-50 rounded px-1">I</span>{' '}
              Marcación incompleta
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <UserX size={14} className="text-slate-500" />{' '}
              <span className="font-mono font-bold text-slate-700 border border-slate-200 bg-slate-100 rounded px-1">∅</span>{' '}
              Sin marcas / ausencia
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <HelpCircle size={14} className="text-blue-600" />{' '}
              <span className="font-mono font-bold text-blue-900 border border-blue-100 bg-blue-50 rounded px-1">·</span>{' '}
              Otro estado (ver tooltip)
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Minus size={14} className="text-slate-300" />{' '}
              <span className="font-mono text-slate-300 border border-dashed border-slate-200 rounded px-1">—</span>{' '}
              Sin reporte ese día (no apareció en Excel o sin cruce)
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              <MessageSquare size={14} className="text-blue-600" /> Icono: comentario OpsFlow (azul si hay texto).
              Celda con dato: clic para ver o editar.
            </span>
          </div>
        </>
      )}
      {commentRow && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setCommentRow(null)}
        >
          <div
            className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl border border-slate-200 p-4 md:p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-2 mb-3">
              <div>
                <h5 className="font-bold text-slate-900">Detalle de la marca</h5>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {effectiveAttendanceDate(commentRow, commentRow.import_report_date)} · {commentRow.source_filename}
                </p>
                <p className="text-xs font-medium text-slate-700 mt-1">{commentRow.attendance_status || '—'}</p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
                onClick={() => setCommentRow(null)}
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <AttendanceMarkCommentBlock
              rowId={commentRow.id}
              fileNotes={commentRow.notes}
              userComment={commentRow.userComment}
              canEdit={canComment}
              attendanceStatus={commentRow.attendance_status}
              onSaved={() => {
                void load();
                setCommentRow(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
