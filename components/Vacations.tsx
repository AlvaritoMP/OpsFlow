import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Palmtree, Users, FileText, Calendar, Plus, X, Save, Download,
  Search, Filter, AlertCircle, CheckCircle, Clock, Building, Info
} from 'lucide-react';
import { Unit, ResourceType, VacationBalanceSummary, VacationPapeleta, VacationDayEntry, User } from '../types';
import {
  vacationService,
  DAYS_PER_YEAR,
  MIN_PAPELETA_DAYS,
} from '../services/vacationService';
import { vacationPdfService } from '../services/vacationPdfService';

interface VacationsProps {
  units: Unit[];
  currentUser: User;
}

type ActiveView = 'balances' | 'monitoring' | 'papeletas' | 'day-entries';

export const Vacations: React.FC<VacationsProps> = ({ units, currentUser }) => {
  const [activeView, setActiveView] = useState<ActiveView>('balances');
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<VacationBalanceSummary[]>([]);
  const [papeletas, setPapeletas] = useState<VacationPapeleta[]>([]);
  const [dayEntries, setDayEntries] = useState<VacationDayEntry[]>([]);
  const [onVacation, setOnVacation] = useState<Awaited<ReturnType<typeof vacationService.getWorkersOnVacation>>>([]);

  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Modales
  const [showHistoricalModal, setShowHistoricalModal] = useState(false);
  const [historicalForm, setHistoricalForm] = useState({ resourceId: '', days: 0, notes: '' });

  const [showDayModal, setShowDayModal] = useState(false);
  const [dayForm, setDayForm] = useState({ resourceId: '', unitId: '', date: '', notes: '' });

  const [showPapeletaModal, setShowPapeletaModal] = useState(false);
  const [papeletaMode, setPapeletaMode] = useState<'direct' | 'accumulated'>('direct');
  const [papeletaForm, setPapeletaForm] = useState({
    resourceId: '',
    unitId: '',
    startDate: '',
    endDate: '',
    returnDate: '',
    notes: '',
    selectedDayIds: [] as string[],
  });

  const [detailPapeleta, setDetailPapeleta] = useState<VacationPapeleta | null>(null);

  const filteredUnits = useMemo(() => {
    if (selectedUnitIds.length === 0) return units;
    return units.filter(u => selectedUnitIds.includes(u.id));
  }, [units, selectedUnitIds]);

  const allPersonnel = useMemo(() => {
    const list: { resourceId: string; name: string; dni?: string; unitId: string; unitName: string; startDate?: string }[] = [];
    filteredUnits.forEach(unit => {
      (unit.resources || [])
        .filter(r => r.type === ResourceType.PERSONNEL && r.personnelStatus !== 'cesado' && !r.archived)
        .forEach(r => {
          list.push({
            resourceId: r.id,
            name: r.name,
            dni: r.dni,
            unitId: unit.id,
            unitName: unit.name,
            startDate: r.startDate,
          });
        });
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredUnits]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const in30 = new Date();
      in30.setDate(in30.getDate() + 30);
      const toDate = in30.toISOString().split('T')[0];

      const [sums, paps, days, onVac] = await Promise.all([
        vacationService.getUnitSummaries(filteredUnits),
        Promise.all(filteredUnits.map(u => vacationService.getPapeletas(undefined, u.id))).then(r => r.flat()),
        Promise.all(filteredUnits.map(u => vacationService.getDayEntries(undefined, u.id))).then(r => r.flat()),
        vacationService.getWorkersOnVacation(filteredUnits, today, toDate),
      ]);

      setSummaries(sums);
      setPapeletas(paps);
      setDayEntries(days);
      setOnVacation(onVac);
    } catch (err) {
      console.error('Error cargando vacaciones:', err);
    } finally {
      setLoading(false);
    }
  }, [filteredUnits]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredSummaries = useMemo(() => {
    if (!searchTerm.trim()) return summaries;
    const q = searchTerm.toLowerCase();
    return summaries.filter(s =>
      s.workerName.toLowerCase().includes(q) ||
      s.unitName.toLowerCase().includes(q) ||
      s.workerDni?.includes(q)
    );
  }, [summaries, searchTerm]);

  const filteredPapeletas = useMemo(() => {
    let list = papeletas.filter(p => p.status !== 'cancelled');
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(p =>
        p.workerName.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.unitName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [papeletas, searchTerm]);

  const handleSaveHistorical = async () => {
    if (!historicalForm.resourceId) return;
    try {
      await vacationService.upsertBalance(
        historicalForm.resourceId,
        historicalForm.days,
        historicalForm.notes,
        currentUser.id
      );
      setShowHistoricalModal(false);
      setHistoricalForm({ resourceId: '', days: 0, notes: '' });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error al guardar saldo histórico');
    }
  };

  const handleAddDay = async () => {
    if (!dayForm.resourceId || !dayForm.unitId || !dayForm.date) return;
    try {
      await vacationService.addDayEntry(
        dayForm.resourceId,
        dayForm.unitId,
        dayForm.date,
        dayForm.notes,
        currentUser.id
      );
      setShowDayModal(false);
      setDayForm({ resourceId: '', unitId: '', date: '', notes: '' });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error al registrar día');
    }
  };

  const handleCreatePapeleta = async () => {
    const worker = allPersonnel.find(p => p.resourceId === papeletaForm.resourceId);
    if (!worker) return;

    try {
      let result: VacationPapeleta;
      if (papeletaMode === 'direct') {
        result = await vacationService.createDirectPapeleta({
          resourceId: papeletaForm.resourceId,
          unitId: worker.unitId,
          unitName: worker.unitName,
          workerName: worker.name,
          workerDni: worker.dni,
          startDate: papeletaForm.startDate,
          endDate: papeletaForm.endDate,
          returnDate: papeletaForm.returnDate,
          notes: papeletaForm.notes,
          issuedBy: currentUser.id,
        });
      } else {
        result = await vacationService.createPapeletaFromAccumulated({
          resourceId: papeletaForm.resourceId,
          unitId: worker.unitId,
          unitName: worker.unitName,
          workerName: worker.name,
          workerDni: worker.dni,
          startDate: papeletaForm.startDate,
          endDate: papeletaForm.endDate,
          returnDate: papeletaForm.returnDate,
          dayEntryIds: papeletaForm.selectedDayIds,
          notes: papeletaForm.notes,
          issuedBy: currentUser.id,
        });
      }

      setShowPapeletaModal(false);
      setPapeletaForm({ resourceId: '', unitId: '', startDate: '', endDate: '', returnDate: '', notes: '', selectedDayIds: [] });
      await loadData();

      const full = await vacationService.getPapeletaWithDays(result.id);
      if (full) {
        await vacationPdfService.downloadPapeletaPDF(full);
      }
    } catch (err: any) {
      alert(err.message || 'Error al crear papeleta');
    }
  };

  const openPapeletaForWorker = (resourceId: string, mode: 'direct' | 'accumulated') => {
    const worker = allPersonnel.find(p => p.resourceId === resourceId);
    const summary = summaries.find(s => s.resourceId === resourceId);
    const pending = dayEntries.filter(d => d.resourceId === resourceId && d.status === 'pending_batch');

    setPapeletaMode(mode);
    setPapeletaForm({
      resourceId,
      unitId: worker?.unitId || '',
      startDate: '',
      endDate: '',
      returnDate: '',
      notes: '',
      selectedDayIds: mode === 'accumulated' ? pending.map(d => d.id) : [],
    });
    setShowPapeletaModal(true);

    if (mode === 'accumulated' && summary && !summary.canIssuePapeleta) {
      alert(`Se requieren al menos ${MIN_PAPELETA_DAYS} días acumulados. Actualmente: ${summary.pendingIndividualDays}`);
    }
  };

  const toggleDaySelection = (id: string) => {
    setPapeletaForm(prev => ({
      ...prev,
      selectedDayIds: prev.selectedDayIds.includes(id)
        ? prev.selectedDayIds.filter(x => x !== id)
        : [...prev.selectedDayIds, id],
    }));
  };

  const calcReturnDate = (endDate: string) => {
    if (!endDate) return '';
    const [y, m, d] = endDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d + 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

  const tabs: { id: ActiveView; label: string; icon: React.ReactNode }[] = [
    { id: 'balances', label: 'Saldos y Control', icon: <Users size={16} /> },
    { id: 'monitoring', label: 'Monitoreo', icon: <Calendar size={16} /> },
    { id: 'papeletas', label: 'Papeletas', icon: <FileText size={16} /> },
    { id: 'day-entries', label: 'Días a Cuenta', icon: <Clock size={16} /> },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Palmtree className="text-emerald-600" size={28} />
            Control de Vacaciones
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Régimen general Perú — {DAYS_PER_YEAR} días calendario/año · Mínimo {MIN_PAPELETA_DAYS} días por papeleta
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setDayForm({ resourceId: '', unitId: '', date: new Date().toISOString().split('T')[0], notes: '' }); setShowDayModal(true); }}
            className="bg-amber-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-amber-600 text-sm"
          >
            <Plus size={16} /> Día a cuenta
          </button>
          <button
            onClick={() => { setPapeletaMode('direct'); setPapeletaForm({ resourceId: '', unitId: '', startDate: '', endDate: '', returnDate: '', notes: '', selectedDayIds: [] }); setShowPapeletaModal(true); }}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-700 text-sm"
          >
            <FileText size={16} /> Nueva Papeleta
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3 text-sm text-blue-800">
        <Info size={18} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Normativa aplicada</p>
          <p className="text-blue-700 mt-1">
            Cada trabajador acumula 2.5 días por mes trabajado (30 días/año). Puede registrar días gozados individualmente
            que se acumulan hasta alcanzar el mínimo de 7 días para emitir una papeleta. También puede ingresar días
            gozados antes de implementar el sistema como saldo histórico.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Buscar trabajador, DNI o unidad..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <select
            className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm min-w-[180px]"
            value={selectedUnitIds.length === 1 ? selectedUnitIds[0] : ''}
            onChange={e => setSelectedUnitIds(e.target.value ? [e.target.value] : [])}
          >
            <option value="">Todas las unidades</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeView === tab.id
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
        </div>
      ) : (
        <>
          {/* TAB: Saldos */}
          {activeView === 'balances' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                    <tr>
                      <th className="text-left p-3">Trabajador</th>
                      <th className="text-left p-3">Unidad</th>
                      <th className="text-left p-3">Ingreso</th>
                      <th className="text-center p-3">Ganados</th>
                      <th className="text-center p-3">Histórico</th>
                      <th className="text-center p-3">Papeletas</th>
                      <th className="text-center p-3">A cuenta</th>
                      <th className="text-center p-3">Saldo</th>
                      <th className="text-center p-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSummaries.map(s => (
                      <tr key={s.resourceId} className="hover:bg-slate-50">
                        <td className="p-3">
                          <div className="font-medium text-slate-800">{s.workerName}</div>
                          {s.workerDni && <div className="text-xs text-slate-400">DNI: {s.workerDni}</div>}
                          {s.puesto && <div className="text-xs text-slate-400">{s.puesto}</div>}
                        </td>
                        <td className="p-3 text-slate-600">{s.unitName}</td>
                        <td className="p-3 text-slate-600">{s.startDate || '—'}</td>
                        <td className="p-3 text-center font-medium text-blue-600">{s.accruedDays}</td>
                        <td className="p-3 text-center text-slate-600">{s.historicalTakenDays}</td>
                        <td className="p-3 text-center text-slate-600">{s.papeletaDays}</td>
                        <td className="p-3 text-center">
                          <span className={s.pendingIndividualDays > 0 ? 'text-amber-600 font-medium' : 'text-slate-400'}>
                            {s.pendingIndividualDays}
                            {s.canIssuePapeleta && (
                              <CheckCircle size={14} className="inline ml-1 text-emerald-500" title="Puede emitir papeleta" />
                            )}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`font-bold ${s.availableDays < 0 ? 'text-red-600' : s.availableDays < 7 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {s.availableDays}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-center flex-wrap">
                            <button
                              onClick={() => { setHistoricalForm({ resourceId: s.resourceId, days: s.historicalTakenDays, notes: '' }); setShowHistoricalModal(true); }}
                              className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700"
                              title="Saldo histórico pre-sistema"
                            >
                              Histórico
                            </button>
                            {s.canIssuePapeleta && (
                              <button
                                onClick={() => openPapeletaForWorker(s.resourceId, 'accumulated')}
                                className="text-xs px-2 py-1 bg-emerald-100 hover:bg-emerald-200 rounded text-emerald-700"
                              >
                                Papeleta
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredSummaries.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-slate-400">
                          No hay trabajadores con fecha de ingreso registrada. Configure la fecha de ingreso en el personal de cada unidad.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: Monitoreo */}
          {activeView === 'monitoring' && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {onVacation.length === 0 ? (
                <div className="col-span-full p-12 text-center text-slate-400 bg-white rounded-xl border border-dashed">
                  <Palmtree size={48} className="mx-auto mb-3 opacity-30" />
                  <p>Nadie en vacaciones en los próximos 30 días</p>
                </div>
              ) : (
                onVacation.map((v, i) => (
                  <div key={`${v.resourceId}-${v.startDate}-${i}`} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-800">{v.workerName}</h3>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <Building size={12} /> {v.unitName}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${v.type === 'papeleta' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {v.type === 'papeleta' ? 'Papeleta' : 'Día a cuenta'}
                      </span>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">
                      <div className="flex justify-between">
                        <span>Desde:</span>
                        <span className="font-medium">{v.startDate}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span>Hasta:</span>
                        <span className="font-medium">{v.endDate}</span>
                      </div>
                      {v.code && (
                        <div className="flex justify-between mt-1">
                          <span>Código:</span>
                          <span className="font-mono text-xs">{v.code}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: Papeletas */}
          {activeView === 'papeletas' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                  <tr>
                    <th className="text-left p-3">Código</th>
                    <th className="text-left p-3">Trabajador</th>
                    <th className="text-left p-3">Unidad</th>
                    <th className="text-left p-3">Salida</th>
                    <th className="text-left p-3">Término</th>
                    <th className="text-left p-3">Retorno</th>
                    <th className="text-center p-3">Días</th>
                    <th className="text-center p-3">Tipo</th>
                    <th className="text-center p-3">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPapeletas.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono text-xs">{p.code}</td>
                      <td className="p-3 font-medium">{p.workerName}</td>
                      <td className="p-3 text-slate-600">{p.unitName}</td>
                      <td className="p-3">{p.startDate}</td>
                      <td className="p-3">{p.endDate}</td>
                      <td className="p-3">{p.returnDate}</td>
                      <td className="p-3 text-center">{p.calendarDays}</td>
                      <td className="p-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.sourceType === 'accumulated' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                          {p.sourceType === 'accumulated' ? 'Acumulada' : 'Directa'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={async () => {
                            const full = await vacationService.getPapeletaWithDays(p.id);
                            if (full) await vacationPdfService.downloadPapeletaPDF(full);
                          }}
                          className="text-emerald-600 hover:text-emerald-800"
                          title="Descargar PDF"
                        >
                          <Download size={16} />
                        </button>
                        {p.sourceType === 'accumulated' && (
                          <button
                            onClick={async () => {
                              const full = await vacationService.getPapeletaWithDays(p.id);
                              setDetailPapeleta(full);
                            }}
                            className="ml-2 text-blue-600 hover:text-blue-800 text-xs"
                          >
                            Ver días
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredPapeletas.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400">No hay papeletas emitidas</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: Días a cuenta */}
          {activeView === 'day-entries' && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                  <tr>
                    <th className="text-left p-3">Trabajador</th>
                    <th className="text-left p-3">Unidad</th>
                    <th className="text-left p-3">Fecha</th>
                    <th className="text-center p-3">Estado</th>
                    <th className="text-center p-3">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dayEntries
                    .filter(d => d.status !== 'cancelled')
                    .filter(d => !searchTerm || allPersonnel.find(p => p.resourceId === d.resourceId)?.name.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(d => {
                      const worker = allPersonnel.find(p => p.resourceId === d.resourceId);
                      return (
                        <tr key={d.id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium">{worker?.name || '—'}</td>
                          <td className="p-3 text-slate-600">{worker?.unitName}</td>
                          <td className="p-3">{d.vacationDate}</td>
                          <td className="p-3 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              d.status === 'pending_batch' ? 'bg-amber-100 text-amber-700' :
                              d.status === 'batched' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {d.status === 'pending_batch' ? 'Pendiente' : d.status === 'batched' ? 'En papeleta' : d.status}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {d.status === 'pending_batch' && (
                              <button
                                onClick={async () => {
                                  if (confirm('¿Cancelar este día de vacaciones?')) {
                                    await vacationService.cancelDayEntry(d.id, d.resourceId);
                                    await loadData();
                                  }
                                }}
                                className="text-red-500 hover:text-red-700 text-xs"
                              >
                                Cancelar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal: Saldo histórico */}
      {showHistoricalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="bg-slate-800 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
              <span className="font-bold">Saldo histórico (pre-sistema)</span>
              <button onClick={() => setShowHistoricalModal(false)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Ingrese los días de vacaciones ya gozados antes de implementar OpsFlow. Estos se descontarán del saldo acumulado.
              </p>
              <div>
                <label className="block text-sm font-medium mb-1">Días gozados (histórico)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  className="w-full border rounded-lg p-2"
                  value={historicalForm.days}
                  onChange={e => setHistoricalForm({ ...historicalForm, days: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notas (opcional)</label>
                <textarea
                  className="w-full border rounded-lg p-2 text-sm"
                  rows={2}
                  value={historicalForm.notes}
                  onChange={e => setHistoricalForm({ ...historicalForm, notes: e.target.value })}
                />
              </div>
              <button
                onClick={handleSaveHistorical}
                className="w-full bg-emerald-600 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-emerald-700"
              >
                <Save size={16} /> Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Día a cuenta */}
      {showDayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="bg-amber-500 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
              <span className="font-bold">Registrar día de vacaciones a cuenta</span>
              <button onClick={() => setShowDayModal(false)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Trabajador</label>
                <select
                  className="w-full border rounded-lg p-2"
                  value={dayForm.resourceId}
                  onChange={e => {
                    const w = allPersonnel.find(p => p.resourceId === e.target.value);
                    setDayForm({ ...dayForm, resourceId: e.target.value, unitId: w?.unitId || '' });
                  }}
                >
                  <option value="">Seleccionar...</option>
                  {allPersonnel.map(p => (
                    <option key={p.resourceId} value={p.resourceId}>{p.name} — {p.unitName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fecha del día gozado</label>
                <input
                  type="date"
                  className="w-full border rounded-lg p-2"
                  value={dayForm.date}
                  onChange={e => setDayForm({ ...dayForm, date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notas (opcional)</label>
                <input
                  className="w-full border rounded-lg p-2 text-sm"
                  value={dayForm.notes}
                  onChange={e => setDayForm({ ...dayForm, notes: e.target.value })}
                />
              </div>
              <button
                onClick={handleAddDay}
                disabled={!dayForm.resourceId || !dayForm.date}
                className="w-full bg-amber-500 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-amber-600 disabled:opacity-50"
              >
                <Plus size={16} /> Registrar día
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Papeleta */}
      {showPapeletaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="bg-emerald-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center sticky top-0">
              <span className="font-bold">Emitir Papeleta de Vacaciones</span>
              <button onClick={() => setShowPapeletaModal(false)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setPapeletaMode('direct')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${papeletaMode === 'direct' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  Vacaciones continuas
                </button>
                <button
                  onClick={() => setPapeletaMode('accumulated')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${papeletaMode === 'accumulated' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  Desde días acumulados
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Trabajador</label>
                <select
                  className="w-full border rounded-lg p-2"
                  value={papeletaForm.resourceId}
                  onChange={e => {
                    const pending = dayEntries.filter(d => d.resourceId === e.target.value && d.status === 'pending_batch');
                    setPapeletaForm({
                      ...papeletaForm,
                      resourceId: e.target.value,
                      selectedDayIds: papeletaMode === 'accumulated' ? pending.map(d => d.id) : [],
                    });
                  }}
                >
                  <option value="">Seleccionar...</option>
                  {allPersonnel.map(p => (
                    <option key={p.resourceId} value={p.resourceId}>{p.name} — {p.unitName}</option>
                  ))}
                </select>
              </div>

              {papeletaMode === 'accumulated' && papeletaForm.resourceId && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-amber-800 mb-2">
                    Seleccione los días acumulados (mín. {MIN_PAPELETA_DAYS}):
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {dayEntries
                      .filter(d => d.resourceId === papeletaForm.resourceId && d.status === 'pending_batch')
                      .map(d => (
                        <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={papeletaForm.selectedDayIds.includes(d.id)}
                            onChange={() => toggleDaySelection(d.id)}
                          />
                          {d.vacationDate}
                        </label>
                      ))}
                  </div>
                  <p className="text-xs text-amber-700 mt-2">
                    Seleccionados: {papeletaForm.selectedDayIds.length} día(s)
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Fecha salida</label>
                  <input
                    type="date"
                    className="w-full border rounded-lg p-2"
                    value={papeletaForm.startDate}
                    onChange={e => setPapeletaForm({ ...papeletaForm, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Fecha término</label>
                  <input
                    type="date"
                    className="w-full border rounded-lg p-2"
                    value={papeletaForm.endDate}
                    onChange={e => {
                      const end = e.target.value;
                      setPapeletaForm({
                        ...papeletaForm,
                        endDate: end,
                        returnDate: calcReturnDate(end),
                      });
                    }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Fecha retorno (reincorporación)</label>
                <input
                  type="date"
                  className="w-full border rounded-lg p-2"
                  value={papeletaForm.returnDate}
                  onChange={e => setPapeletaForm({ ...papeletaForm, returnDate: e.target.value })}
                />
              </div>
              {papeletaMode === 'direct' && papeletaForm.startDate && papeletaForm.endDate && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <AlertCircle size={12} />
                  Días calendario: {Math.max(0, Math.round((parseDate(papeletaForm.endDate).getTime() - parseDate(papeletaForm.startDate).getTime()) / 86400000) + 1)}
                  {Math.max(0, Math.round((parseDate(papeletaForm.endDate).getTime() - parseDate(papeletaForm.startDate).getTime()) / 86400000) + 1) < MIN_PAPELETA_DAYS && (
                    <span className="text-red-500"> — Mínimo {MIN_PAPELETA_DAYS} días requeridos</span>
                  )}
                </p>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Observaciones</label>
                <textarea
                  className="w-full border rounded-lg p-2 text-sm"
                  rows={2}
                  value={papeletaForm.notes}
                  onChange={e => setPapeletaForm({ ...papeletaForm, notes: e.target.value })}
                />
              </div>
              <button
                onClick={handleCreatePapeleta}
                disabled={
                  !papeletaForm.resourceId || !papeletaForm.startDate || !papeletaForm.endDate || !papeletaForm.returnDate ||
                  (papeletaMode === 'accumulated' && papeletaForm.selectedDayIds.length < MIN_PAPELETA_DAYS)
                }
                className="w-full bg-emerald-600 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:opacity-50"
              >
                <FileText size={16} /> Emitir y descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalle días acumulados en papeleta */}
      {detailPapeleta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
              <span className="font-bold">Días acumulados — {detailPapeleta.code}</span>
              <button onClick={() => setDetailPapeleta(null)}><X size={20} /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-3">
                Papeleta formal: {detailPapeleta.startDate} al {detailPapeleta.endDate} (retorno: {detailPapeleta.returnDate})
              </p>
              <p className="text-sm font-medium mb-2">Días individuales que se acumularon:</p>
              <ul className="space-y-1">
                {detailPapeleta.accumulatedDays?.map(d => (
                  <li key={d.id} className="text-sm bg-slate-50 px-3 py-2 rounded flex justify-between">
                    <span>{d.vacationDate}</span>
                    <span className="text-slate-400 text-xs">Gozado a cuenta</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
