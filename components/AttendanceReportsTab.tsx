import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Upload,
  Trash2,
  RefreshCw,
  Table2,
  Calendar,
  Users,
  AlertTriangle,
  CheckCircle,
  LayoutGrid,
  Clock,
  UserX,
  Link2,
  TrendingUp,
  Grid3x3,
  ClipboardList,
} from 'lucide-react';
import { Unit, ResourceType, Resource } from '../types';
import {
  attendanceReportService,
  AttendanceReportImportDTO,
  AttendanceReportRowDTO,
  filterRowsMatchedActivePersonnel,
} from '../services/attendanceReportService';
import { punchDisplay } from '../services/attendanceReportExcelParser';
import { SafeImage } from './SafeImage';
import { AttendanceEvolutionView } from './AttendanceEvolutionView';
import { AttendanceConsolidatedView } from './AttendanceConsolidatedView';
import { AttendanceTareoView } from './AttendanceTareoView';
import { AttendanceMarkCommentBlock } from './AttendanceMarkCommentBlock';
import { DateInput } from './DateInput';

interface AttendanceReportsTabProps {
  unit: Unit;
  canUpload: boolean;
}

type ViewMode = 'cards' | 'table';
type ScreenMode = 'byImport' | 'evolution' | 'consolidated' | 'tareo';

function punchChipClasses(label: string): string {
  if (label === 'Sin marca' || label === 'No marco')
    return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-emerald-50 text-emerald-900 border-emerald-200 font-mono tracking-tight';
}

function statusBadgeClass(status: string | null): string {
  const s = (status || '').toLowerCase();
  if (s.includes('completa') && !s.includes('incompleta'))
    return 'bg-emerald-100 text-emerald-900 border-emerald-200';
  if (s.includes('incompleta')) return 'bg-amber-50 text-amber-900 border-amber-200';
  if (s.includes('sin marcas')) return 'bg-slate-100 text-slate-700 border-slate-200';
  if (/ausenc|inasist/i.test(s)) return 'bg-red-50 text-red-800 border-red-100';
  if (/tardan|retraso/i.test(s)) return 'bg-orange-50 text-orange-900 border-orange-100';
  return 'bg-blue-50 text-blue-900 border-blue-100';
}

function resourceForRow(unit: Unit, row: AttendanceReportRowDTO): Resource | undefined {
  if (!row.matched_resource_id || !unit.resources?.length) return undefined;
  return unit.resources.find((r) => r.id === row.matched_resource_id);
}

export const AttendanceReportsTab: React.FC<AttendanceReportsTabProps> = ({ unit, canUpload }) => {
  const [imports, setImports] = useState<AttendanceReportImportDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<AttendanceReportRowDTO[]>([]);
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [screenMode, setScreenMode] = useState<ScreenMode>('byImport');

  const loadImports = useCallback(async () => {
    setLoading(true);
    try {
      const list = await attendanceReportService.listImports(unit.id);
      setImports(list);
      setSelectedId((prev) => {
        if (prev && list.some((i) => i.id === prev)) return prev;
        return list.length ? list[0].id : null;
      });
    } catch (e: any) {
      setMessage({ type: 'err', text: e?.message || 'No se pudieron cargar los reportes' });
    } finally {
      setLoading(false);
    }
  }, [unit.id]);

  useEffect(() => {
    void loadImports();
  }, [loadImports]);

  useEffect(() => {
    if (!selectedId) {
      setRows([]);
      return;
    }
    let cancel = false;
    setRowsLoading(true);
    attendanceReportService
      .getRows(selectedId)
      .then((r) => {
        if (!cancel) setRows(r);
      })
      .catch((e: any) => {
        if (!cancel) setMessage({ type: 'err', text: e?.message || 'Error al cargar filas' });
      })
      .finally(() => {
        if (!cancel) setRowsLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [selectedId]);

  const reloadSelectedRows = useCallback(async () => {
    if (!selectedId) return;
    setRowsLoading(true);
    try {
      const r = await attendanceReportService.getRows(selectedId);
      setRows(r);
    } catch (e: any) {
      setMessage({ type: 'err', text: e?.message || 'Error al cargar filas' });
    } finally {
      setRowsLoading(false);
    }
  }, [selectedId]);

  const visibleRows = useMemo(() => filterRowsMatchedActivePersonnel(unit, rows), [unit, rows]);
  const hiddenRowCount = rows.length - visibleRows.length;

  const summary = attendanceReportService.summarize(visibleRows);
  const selectedImport = imports.find((i) => i.id === selectedId);

  const sortedRows = useMemo(() => {
    return [...visibleRows].sort((a, b) => {
      const ra = resourceForRow(unit, a);
      const rb = resourceForRow(unit, b);
      const na = (ra?.name || a.worker_name || '').toLocaleLowerCase('es');
      const nb = (rb?.name || b.worker_name || '').toLocaleLowerCase('es');
      return na.localeCompare(nb, 'es');
    });
  }, [visibleRows, unit]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canUpload) return;
    setUploading(true);
    setMessage(null);
    try {
      const { authService } = await import('../services/authService');
      const u = await authService.getCurrentUser();
      const { importId, rowCount } = await attendanceReportService.uploadAndSave(
        unit,
        file,
        reportDate,
        u?.id || null
      );
      setMessage({ type: 'ok', text: `Importación guardada (${rowCount} filas).` });
      await loadImports();
      setSelectedId(importId);
    } catch (err: any) {
      setMessage({ type: 'err', text: err?.message || 'Error al importar el archivo' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este reporte de asistencia y todas sus filas?')) return;
    try {
      await attendanceReportService.deleteImport(id);
      if (selectedId === id) setSelectedId(null);
      await loadImports();
      setMessage({ type: 'ok', text: 'Reporte eliminado.' });
    } catch (e: any) {
      setMessage({ type: 'err', text: e?.message || 'No se pudo eliminar' });
    }
  };

  const formatDayIso = (iso: string | null, fallbackIso: string) => {
    if (!iso) return fallbackIso;
    const [y, mo, d] = iso.split('-');
    if (!y || !mo || !d) return iso;
    return `${d}/${mo}/${y}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-10">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
            <Table2 size={22} /> Asistencia ({unit.name})
          </h3>
          {canUpload && (
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
              Los datos provienen <strong>solo</strong> de Excel subidos para esta unidad: no se rellenan días sin archivo.
              Tras cada importación <strong>solo se muestran trabajadores activos en Personal</strong> (no archivados ni
              cesados) cuyo documento coincide con el personal de la unidad; el resto de filas del Excel no se listan.
            </p>
          )}
        </div>
      </div>

      {canUpload && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-4 shadow-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha del reporte (si el archivo no lleva día claro)</label>
            <DateInput
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              value={reportDate}
              onChange={setReportDate}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 invisible md:sr-only">Archivo</label>
            <label className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 disabled:opacity-50">
              <Upload size={16} />
              {uploading ? 'Importando…' : 'Subir Excel'}
              <input type="file" accept=".xlsx,.xls" className="hidden" disabled={uploading} onChange={handleFile} />
            </label>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 text-slate-600 text-sm hover:text-blue-700"
            onClick={() => void loadImports()}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar lista
          </button>
        </div>
      )}

      {!canUpload && imports.length === 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-600 flex items-start gap-2">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-slate-500" />
          <span>No hay reportes cargados para esta unidad todavía. Sin importación no se muestra asistencia.</span>
        </div>
      )}

      {!canUpload && imports.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-900">
          Solo puede visualizar datos ya importados por quien tiene permiso de carga en la unidad.
        </div>
      )}

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm flex items-start gap-2 ${
            message.type === 'ok'
              ? 'bg-green-50 text-green-900 border border-green-200'
              : 'bg-red-50 text-red-900 border border-red-200'
          }`}
        >
          {message.type === 'ok' ? (
            <CheckCircle size={18} className="shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="flex flex-wrap rounded-lg border border-slate-200 bg-slate-100 p-1 w-full md:w-fit gap-1">
        <button
          type="button"
          onClick={() => setScreenMode('byImport')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${
            screenMode === 'byImport' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <LayoutGrid size={16} /> Detalle por importación
        </button>
        <button
          type="button"
          onClick={() => setScreenMode('evolution')}
          disabled={!imports.length}
          title={!imports.length ? 'Sube primero un reporte Excel' : undefined}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-45 disabled:cursor-not-allowed ${
            screenMode === 'evolution' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <TrendingUp size={16} /> Evolución por trabajador
        </button>
        <button
          type="button"
          onClick={() => setScreenMode('consolidated')}
          disabled={!imports.length}
          title={!imports.length ? 'Sube primero un reporte Excel' : undefined}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-45 disabled:cursor-not-allowed ${
            screenMode === 'consolidated' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <Grid3x3 size={16} /> Consolidado
        </button>
        <button
          type="button"
          onClick={() => setScreenMode('tareo')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${
            screenMode === 'tareo' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-800'
          }`}
        >
          <ClipboardList size={16} /> Tareo / Novedades
        </button>
      </div>

      {screenMode === 'byImport' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
            <CheckCircle size={14} /> Marcación OK
          </div>
          <div className="text-2xl font-bold text-emerald-800">{summary.present}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
            <Clock size={14} /> Incompleta
          </div>
          <div className="text-2xl font-bold text-amber-700">{summary.partial}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
            <UserX size={14} /> Sin marcas
          </div>
          <div className="text-2xl font-bold text-slate-700">{summary.absent}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
            <AlertTriangle size={14} /> Tardanza
          </div>
          <div className="text-2xl font-bold text-orange-700">{summary.late}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">Otros</div>
          <div className="text-2xl font-bold text-slate-700">{summary.other}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
          <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
            <Users size={14} /> Activos en planilla
          </div>
          <div className="text-2xl font-bold text-blue-700">{summary.total}</div>
          {hiddenRowCount > 0 ? (
            <div className="text-[11px] text-slate-500 mt-1">
              Sin mostrar del archivo: {hiddenRowCount} (sin cruce o no activos)
            </div>
          ) : null}
        </div>
      </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-72 shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-3 border-b border-slate-100 bg-slate-50 text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
            <Calendar size={14} /> Importaciones ({unit.name})
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-slate-400">Cargando…</p>
            ) : imports.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                Aún no se ha subido un Excel para esta unidad. Solo tendrás asistencia en pantalla después de cargar un archivo aquí.
              </p>
            ) : (
              imports.map((imp) => (
                <div
                  key={imp.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-50 text-sm ${
                    selectedId === imp.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                  }`}
                >
                  <button type="button" className="flex-1 text-left truncate" onClick={() => setSelectedId(imp.id)}>
                    <span className="font-medium block truncate">{imp.report_date}</span>
                    <span className="text-xs text-slate-500 truncate block">{imp.source_filename}</span>
                  </button>
                  {canUpload && (
                    <button
                      type="button"
                      title="Eliminar"
                      className="text-slate-400 hover:text-red-600 p-1"
                      onClick={() => void handleDelete(imp.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[320px]">
          {screenMode === 'tareo' ? (
            <AttendanceTareoView
              unit={unit}
              importsKey={imports.map((i) => `${i.id}:${i.uploaded_at}`).join('|')}
              canEdit={canUpload}
            />
          ) : screenMode === 'consolidated' ? (
            imports.length ? (
              <AttendanceConsolidatedView
                unit={unit}
                importsKey={imports.map((i) => `${i.id}:${i.uploaded_at}`).join('|')}
                canComment={canUpload}
              />
            ) : (
              <div className="p-10 text-center text-slate-500 text-sm">
                Sube al menos un Excel para ver el consolidado.
              </div>
            )
          ) : screenMode === 'evolution' ? (
            imports.length ? (
              <AttendanceEvolutionView unit={unit} canComment={canUpload} />
            ) : (
              <div className="p-10 text-center text-slate-500 text-sm">
                Sube al menos un Excel para usar la evolución por trabajador.
              </div>
            )
          ) : !selectedImport ? (
            <div className="p-10 text-center text-slate-500 text-sm space-y-2">
              <p>Elegí un reporte importado para ver marcaciones por trabajador.</p>
              {!imports.length && canUpload ? (
                <p className="text-xs text-slate-400">Sube el Excel tipo OPALO (Documento + Dia + Llegada + SalidaAlmuerzo…).</p>
              ) : null}
            </div>
          ) : rowsLoading ? (
            <p className="p-8 text-center text-slate-400 text-sm">Cargando marcaciones…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <div className="text-sm">
                  <span className="font-semibold text-slate-800">{selectedImport.source_filename}</span>
                  <span className="text-slate-500"> · fecha reporte guardada </span>
                  <span className="font-mono text-slate-700">{selectedImport.report_date}</span>
                </div>
                <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium shadow-sm">
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md ${
                      viewMode === 'cards' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <LayoutGrid size={14} /> Por trabajador
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md ${
                      viewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Table2 size={14} /> Tabla
                  </button>
                </div>
              </div>

              {viewMode === 'cards' ? (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[min(70vh,980px)] overflow-y-auto">
                  {sortedRows.length === 0 ? (
                    <div className="col-span-full p-12 text-center text-slate-500 text-sm border border-dashed border-slate-200 rounded-xl bg-slate-50/80">
                      {rows.length > 0
                        ? 'Ningún trabajador activo de la unidad con documento coincidente en este archivo. Las demás filas no se muestran.'
                        : 'Sin filas en este reporte.'}
                    </div>
                  ) : null}
                  {sortedRows.map((r) => {
                    const res = resourceForRow(unit, r);
                    const dispName = res?.type === ResourceType.PERSONNEL ? res.name : r.worker_name || 'Sin nombre';
                    const dia = formatDayIso(r.mark_date, selectedImport.report_date);
                    const llegada = punchDisplay(r.punch_arrival);
                    const salA = punchDisplay(r.punch_lunch_out);
                    const regA = punchDisplay(r.punch_lunch_in);
                    const salida = punchDisplay(r.punch_departure);

                    const initials =
                      dispName
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase())
                        .join('') || '?';

                    return (
                      <div
                        key={r.id}
                        className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex flex-col gap-3 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {res?.type === ResourceType.PERSONNEL && res.image ? (
                            <SafeImage
                              src={res.image}
                              alt={dispName}
                              className="h-14 w-14 rounded-full object-cover shrink-0 border border-slate-200"
                              bucket={undefined}
                              fallback={
                                <div className="h-14 w-14 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">
                                  {initials}
                                </div>
                              }
                            />
                          ) : (
                            <div className="h-14 w-14 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600 shrink-0">
                              {initials}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-900 leading-snug truncate" title={dispName}>
                              {dispName}
                            </p>
                            <p className="text-xs font-mono text-slate-600 truncate">Doc. {r.dni ?? '—'}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusBadgeClass(
                                  r.attendance_status
                                )}`}
                              >
                                {r.attendance_status ?? '—'}
                              </span>
                              {r.matched_resource_id ? (
                                <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                  <Link2 size={10} /> Personal unidad
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                  <AlertTriangle size={10} /> Sin cruce por documento
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-2 border-t border-slate-100 pt-2">
                          <Calendar size={12} /> Día de marca: <span className="font-mono text-slate-800 lowercase">{dia}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {[
                            { k: 'Llegada', v: llegada },
                            { k: 'Salida almuerzo', v: salA },
                            { k: 'Regreso almuerzo', v: regA },
                            { k: 'Salida', v: salida },
                          ].map(({ k, v }) => (
                            <div key={k} className="rounded-lg border bg-slate-50/80 border-slate-100 p-2">
                              <div className="text-[10px] font-bold text-slate-500 uppercase">{k}</div>
                              <div className={`mt-1 inline-block px-2 py-1 rounded-md border text-[13px] ${punchChipClasses(v)}`}>
                                {v}
                              </div>
                            </div>
                          ))}
                        </div>

                        <AttendanceMarkCommentBlock
                          rowId={r.id}
                          fileNotes={r.notes}
                          userComment={r.userComment}
                          canEdit={canUpload}
                          attendanceStatus={r.attendance_status}
                          onSaved={() => void reloadSelectedRows()}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-3 py-2">Trabajador</th>
                        <th className="text-left px-3 py-2">Documento</th>
                        <th className="text-left px-3 py-2">Día</th>
                        <th className="text-left px-3 py-2">Llegada</th>
                        <th className="text-left px-3 py-2">S. almuerzo</th>
                        <th className="text-left px-3 py-2">R. almuerzo</th>
                        <th className="text-left px-3 py-2">Salida</th>
                        <th className="text-left px-3 py-2">Estado</th>
                        <th className="text-left px-3 py-2 min-w-[200px]">Comentario</th>
                        <th className="text-center px-3 py-2">Planilla</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-4 py-12 text-center text-slate-500 text-sm">
                            {rows.length > 0
                              ? 'Ningún trabajador activo con cruce por documento en este archivo.'
                              : 'Sin filas.'}
                          </td>
                        </tr>
                      ) : null}
                      {sortedRows.map((r) => {
                        const res = resourceForRow(unit, r);
                        const dispName =
                          res?.type === ResourceType.PERSONNEL ? res.name : r.worker_name || '—';
                        return (
                          <tr key={r.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium max-w-[180px] truncate" title={dispName}>
                              {dispName}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">{r.dni || '—'}</td>
                            <td className="px-3 py-2 font-mono text-xs">{formatDayIso(r.mark_date, selectedImport.report_date)}</td>
                            <td className="px-3 py-2 font-mono text-xs">{punchDisplay(r.punch_arrival)}</td>
                            <td className="px-3 py-2 font-mono text-xs">{punchDisplay(r.punch_lunch_out)}</td>
                            <td className="px-3 py-2 font-mono text-xs">{punchDisplay(r.punch_lunch_in)}</td>
                            <td className="px-3 py-2 font-mono text-xs">{punchDisplay(r.punch_departure)}</td>
                            <td className="px-3 py-2 text-xs align-top">{r.attendance_status || '—'}</td>
                            <td className="px-2 py-2 align-top max-w-[260px]">
                              <div className="max-h-44 overflow-y-auto">
                                <AttendanceMarkCommentBlock
                                  rowId={r.id}
                                  fileNotes={r.notes}
                                  userComment={r.userComment}
                                  canEdit={canUpload}
                                  attendanceStatus={r.attendance_status}
                                  onSaved={() => void reloadSelectedRows()}
                                />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center">✓</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedImport.column_mapping && Object.keys(selectedImport.column_mapping).length > 0 && (
                <details className="border-t border-slate-100 p-3 bg-slate-50 text-xs">
                  <summary className="cursor-pointer font-semibold text-slate-600">Mapeo de columnas reconocidas</summary>
                  <pre className="mt-2 text-slate-700 whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(selectedImport.column_mapping, null, 2)}
                  </pre>
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
