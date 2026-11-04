import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, Download, Plus, Search, Trash2, X, Save, BookOpen } from 'lucide-react';
import {
  Position,
  TrainingCertificate,
  TrainingDocumentType,
  TrainingTopic,
  Unit,
  User,
  WorkerTrainingRecordChange,
  ResourceType,
} from '../types';
import { trainingService } from '../services/trainingService';
import { positionsService } from '../services/positionsService';
import { downloadTrainingCertificatePdf } from '../utils/generateTrainingCertificatePdf';
import { DateInput } from './DateInput';
import { formatDateDisplay } from '../utils/dateFormat';

interface TrainingsProps {
  units: Unit[];
  currentUser: User;
  canEdit: boolean;
  /** Cambia al volver a abrir la sección, para releer el récord. */
  refreshToken?: number;
  onWorkerRecordChange?: (change: WorkerTrainingRecordChange) => void;
}

type Tab = 'records' | 'topics';

interface IssueForm {
  documentType: TrainingDocumentType;
  unitId: string;
  workerIds: string[];
  topicId: string;
  customTopic: string;
  description: string;
  hours: string;
  date: string;
  instructor: string;
  score: string;
  status: 'Completado' | 'Programado';
  notes: string;
  workerQuery: string;
}

interface TopicForm {
  id?: string;
  name: string;
  description: string;
  hours: string;
  isActive: boolean;
  positionIds: string[];
}

function todayIso(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function emptyIssue(unitId = ''): IssueForm {
  return {
    documentType: 'certificado',
    unitId,
    workerIds: [],
    topicId: '',
    customTopic: '',
    description: '',
    hours: '',
    date: todayIso(),
    instructor: '',
    score: '',
    status: 'Completado',
    notes: '',
    workerQuery: '',
  };
}

function emptyTopic(): TopicForm {
  return { name: '', description: '', hours: '', isActive: true, positionIds: [] };
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

export const Trainings: React.FC<TrainingsProps> = ({
  units,
  currentUser,
  canEdit,
  refreshToken = 0,
  onWorkerRecordChange,
}) => {
  const [tab, setTab] = useState<Tab>('records');
  const [topics, setTopics] = useState<TrainingTopic[]>([]);
  const [certificates, setCertificates] = useState<TrainingCertificate[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [unitFilter, setUnitFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | TrainingDocumentType>('');
  const [showIssue, setShowIssue] = useState(false);
  const [issueForm, setIssueForm] = useState<IssueForm>(emptyIssue());
  const [showTopic, setShowTopic] = useState(false);
  const [topicForm, setTopicForm] = useState<TopicForm>(emptyTopic());

  const scopeKey = useMemo(() => {
    const unitPart = units.map((unit) => unit.id).join(',');
    const resourcePart = units.flatMap((unit) => (unit.resources || []).map((resource) => resource.id)).join(',');
    return `${unitPart}|${resourcePart}`;
  }, [units]);

  const load = useCallback(async () => {
    const [unitPart, resourcePart] = scopeKey.split('|');
    const scopedUnitIds = unitPart ? unitPart.split(',') : [];
    const scopedResourceIds = resourcePart ? resourcePart.split(',') : [];
    setLoading(true);
    try {
      const [topicRows, certificateRows, positionRows] = await Promise.all([
        trainingService.listTopics(),
        trainingService.listCertificates(scopedUnitIds, scopedResourceIds),
        positionsService.getAll(true),
      ]);
      setTopics(topicRows);
      setCertificates(certificateRows);
      setPositions(positionRows);
      setNotice(null);
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'No se pudieron cargar las capacitaciones.' });
    } finally {
      setLoading(false);
    }
  }, [scopeKey]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const positionName = useCallback(
    (id: string) => positions.find((position) => position.id === id)?.name || 'Puesto',
    [positions]
  );

  const activeTopics = useMemo(() => topics.filter((topic) => topic.isActive), [topics]);

  const filteredCertificates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return certificates.filter((item) => {
      if (unitFilter && item.unitId !== unitFilter) return false;
      if (typeFilter && item.documentType !== typeFilter) return false;
      if (!query) return true;
      const haystack = [
        item.code,
        item.topicName,
        item.workerName,
        item.workerDni,
        item.positionName,
        item.unitName,
        item.clientName,
        item.instructor,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [certificates, search, unitFilter, typeFilter]);

  const selectedUnit = units.find((unit) => unit.id === issueForm.unitId);
  const unitWorkers = useMemo(() => {
    if (!selectedUnit) return [];
    return (selectedUnit.resources || [])
      .filter(
        (resource) =>
          resource.type === ResourceType.PERSONNEL &&
          resource.personnelStatus !== 'cesado' &&
          resource.personnelStatus !== 'archivado' &&
          !resource.archived
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [selectedUnit]);

  const visibleWorkers = useMemo(() => {
    const query = issueForm.workerQuery.trim().toLowerCase();
    if (!query) return unitWorkers;
    return unitWorkers.filter((worker) =>
      `${worker.name} ${worker.dni || ''} ${worker.puesto || ''}`.toLowerCase().includes(query)
    );
  }, [unitWorkers, issueForm.workerQuery]);

  const selectedTopic = activeTopics.find((topic) => topic.id === issueForm.topicId);

  const openIssue = () => {
    setIssueForm(emptyIssue(units[0]?.id || ''));
    setShowIssue(true);
  };

  const applyTopic = (topicId: string) => {
    const topic = activeTopics.find((item) => item.id === topicId);
    setIssueForm((prev) => ({
      ...prev,
      topicId,
      customTopic: '',
      description: topic?.description || '',
      hours: topic?.hours != null ? String(topic.hours) : prev.hours,
    }));
  };

  const toggleWorker = (id: string) => {
    setIssueForm((prev) => ({
      ...prev,
      workerIds: prev.workerIds.includes(id)
        ? prev.workerIds.filter((workerId) => workerId !== id)
        : [...prev.workerIds, id],
    }));
  };

  const handleIssue = async () => {
    if (!canEdit || !selectedUnit) return;
    const workers = unitWorkers.filter((worker) => issueForm.workerIds.includes(worker.id));
    if (workers.length === 0) {
      setNotice({ type: 'error', text: 'Selecciona al menos un trabajador de la unidad.' });
      return;
    }
    const topicName = issueForm.topicId ? selectedTopic?.name || '' : issueForm.customTopic.trim();
    if (!topicName) {
      setNotice({ type: 'error', text: 'Elige un tema del catálogo o escribe uno.' });
      return;
    }
    const hours = parseOptionalNumber(issueForm.hours);
    if (issueForm.hours.trim() && (hours == null || hours < 0)) {
      setNotice({ type: 'error', text: 'Las horas no son válidas.' });
      return;
    }
    const score = parseOptionalNumber(issueForm.score);
    if (issueForm.score.trim() && (score == null || score < 0 || score > 20)) {
      setNotice({ type: 'error', text: 'La calificación debe estar entre 0 y 20.' });
      return;
    }

    setSaving(true);
    try {
      const result = await trainingService.issue({
        documentType: issueForm.documentType,
        topicId: issueForm.topicId || undefined,
        topicName,
        description: issueForm.description,
        hours,
        trainingDate: issueForm.date,
        status: issueForm.status,
        score,
        instructor: issueForm.instructor,
        notes: issueForm.notes,
        createdBy: currentUser.name,
        workers: workers.map((worker) => ({
          resourceId: worker.id,
          workerName: worker.name,
          workerDni: worker.dni,
          positionName: worker.puesto,
          unitId: selectedUnit.id,
          unitName: selectedUnit.name,
          clientName: selectedUnit.clientName,
        })),
      });
      result.trainings.forEach((item) => {
        onWorkerRecordChange?.({
          unitId: selectedUnit.id,
          resourceId: item.resourceId,
          action: 'add',
          training: item.training,
        });
      });
      setCertificates((prev) =>
        [...result.certificates, ...prev].sort((a, b) => b.trainingDate.localeCompare(a.trainingDate))
      );
      setShowIssue(false);
      setNotice({
        type: 'ok',
        text:
          result.certificates.length === 1
            ? `${result.certificates[0].code} quedó en el récord de ${result.certificates[0].workerName}.`
            : `Se registraron ${result.certificates.length} capacitaciones en el récord de los trabajadores.`,
      });
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'No se pudo registrar la capacitación.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (certificate: TrainingCertificate) => {
    try {
      await downloadTrainingCertificatePdf(certificate);
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'No se pudo generar el PDF.' });
    }
  };

  const handleDeleteCertificate = async (certificate: TrainingCertificate) => {
    if (!canEdit) return;
    if (!window.confirm(`¿Eliminar ${certificate.code} del récord de ${certificate.workerName}?`)) return;
    try {
      const removed = await trainingService.deleteCertificate(certificate.id);
      setCertificates((prev) => prev.filter((item) => item.id !== certificate.id));
      if (removed) {
        onWorkerRecordChange?.({
          unitId: removed.unitId,
          resourceId: removed.resourceId,
          action: 'remove',
          training: {
            id: removed.id,
            topic: removed.topicName,
            date: removed.trainingDate,
            status: removed.status,
            certificateUrl: removed.code,
          },
        });
      }
      setNotice({ type: 'ok', text: `${certificate.code} se eliminó del récord.` });
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'No se pudo eliminar el registro.' });
    }
  };

  const openTopic = (topic?: TrainingTopic) => {
    setTopicForm(
      topic
        ? {
            id: topic.id,
            name: topic.name,
            description: topic.description || '',
            hours: topic.hours != null ? String(topic.hours) : '',
            isActive: topic.isActive,
            positionIds: topic.positionIds,
          }
        : emptyTopic()
    );
    setShowTopic(true);
  };

  const handleSaveTopic = async () => {
    if (!canEdit) return;
    if (!topicForm.name.trim()) {
      setNotice({ type: 'error', text: 'El tema necesita un nombre.' });
      return;
    }
    const hours = parseOptionalNumber(topicForm.hours);
    if (topicForm.hours.trim() && (hours == null || hours < 0)) {
      setNotice({ type: 'error', text: 'Las horas del tema no son válidas.' });
      return;
    }
    setSaving(true);
    try {
      await trainingService.saveTopic({
        id: topicForm.id,
        name: topicForm.name,
        description: topicForm.description,
        hours,
        isActive: topicForm.isActive,
        positionIds: topicForm.positionIds,
      });
      setShowTopic(false);
      await load();
      setNotice({ type: 'ok', text: topicForm.id ? 'Tema actualizado.' : 'Tema creado.' });
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'No se pudo guardar el tema.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTopic = async (topic: TrainingTopic) => {
    if (!canEdit) return;
    if (!window.confirm(`¿Eliminar el tema "${topic.name}"? Los certificados ya emitidos conservan el nombre.`)) return;
    try {
      await trainingService.deleteTopic(topic.id);
      setTopics((prev) => prev.filter((item) => item.id !== topic.id));
      setNotice({ type: 'ok', text: 'Tema eliminado.' });
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'No se pudo eliminar el tema.' });
    }
  };

  const mismatchedWorkers = useMemo(() => {
    if (!selectedTopic || selectedTopic.positionIds.length === 0) return [];
    const allowed = new Set(
      selectedTopic.positionIds.map((id) => positionName(id).trim().toLowerCase())
    );
    return unitWorkers.filter((worker) => {
      if (!issueForm.workerIds.includes(worker.id)) return false;
      const puesto = (worker.puesto || '').trim().toLowerCase();
      return !puesto || !allowed.has(puesto);
    });
  }, [selectedTopic, unitWorkers, issueForm.workerIds, positionName]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Award className="text-blue-600" size={24} />
            Capacitaciones
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {canEdit
              ? 'Arma temas por puesto, emite el certificado o el acta y súmalo al récord del trabajador.'
              : 'Consulta las capacitaciones de tus unidades y descarga el certificado o el acta en PDF.'}
          </p>
        </div>
        {canEdit && tab === 'records' && (
          <button
            type="button"
            onClick={openIssue}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 text-sm"
          >
            <Plus size={16} /> Nueva capacitación
          </button>
        )}
        {canEdit && tab === 'topics' && (
          <button
            type="button"
            onClick={() => openTopic()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 text-sm"
          >
            <Plus size={16} /> Nuevo tema
          </button>
        )}
      </div>

      {canEdit && (
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setTab('records')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'records' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            Certificados y actas
          </button>
          <button
            type="button"
            onClick={() => setTab('topics')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'topics' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
          >
            Temas y puestos
          </button>
        </div>
      )}

      {notice && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${notice.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
        >
          {notice.text}
        </div>
      )}

      {tab === 'records' && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-3 mb-4 flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por trabajador, DNI, tema, código o unidad"
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm outline-none"
              />
            </div>
            <select
              value={unitFilter}
              onChange={(event) => setUnitFilter(event.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none"
            >
              <option value="">Todas las unidades</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as '' | TrainingDocumentType)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none"
            >
              <option value="">Certificado y acta</option>
              <option value="certificado">Certificado</option>
              <option value="acta">Acta</option>
            </select>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <p className="p-8 text-center text-sm text-slate-500">Cargando capacitaciones...</p>
            ) : filteredCertificates.length === 0 ? (
              <div className="p-10 text-center">
                <BookOpen className="mx-auto text-slate-300 mb-2" size={28} />
                <p className="text-sm text-slate-500">No hay capacitaciones para mostrar.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Documento</th>
                      <th className="px-4 py-3 font-semibold">Trabajador</th>
                      <th className="px-4 py-3 font-semibold">Tema</th>
                      <th className="px-4 py-3 font-semibold">Unidad</th>
                      <th className="px-4 py-3 font-semibold">Fecha</th>
                      <th className="px-4 py-3 font-semibold text-right">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCertificates.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 align-top">
                          <p className="font-semibold text-slate-800">{item.code}</p>
                          <p className="text-xs text-slate-500 capitalize">{item.documentType}</p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="font-medium text-slate-800">{item.workerName}</p>
                          <p className="text-xs text-slate-500">
                            {[item.workerDni, item.positionName].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="text-slate-800">{item.topicName}</p>
                          <p className="text-xs text-slate-500">
                            {item.status}
                            {item.hours != null ? ` · ${item.hours} h` : ''}
                            {item.score != null ? ` · Nota ${item.score}` : ''}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700">
                          <p>{item.unitName}</p>
                          {item.clientName && <p className="text-xs text-slate-500">{item.clientName}</p>}
                        </td>
                        <td className="px-4 py-3 align-top text-slate-700 whitespace-nowrap">
                          {formatDateDisplay(item.trainingDate)}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => void handleDownload(item)}
                              className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
                              title="Descargar PDF"
                            >
                              <Download size={16} />
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteCertificate(item)}
                                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                                title="Eliminar"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'topics' && canEdit && (
        <div className="grid gap-3">
          {loading ? (
            <p className="text-sm text-slate-500">Cargando temas...</p>
          ) : topics.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              Todavía no hay temas. Crea el primero y asígnalo a los puestos que corresponda.
            </div>
          ) : (
            topics.map((topic) => (
              <div key={topic.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-slate-800">{topic.name}</h2>
                    {!topic.isActive && (
                      <span className="text-[11px] uppercase tracking-wide bg-slate-100 text-slate-500 px-2 py-0.5 rounded">Inactivo</span>
                    )}
                  </div>
                  {topic.description && <p className="text-sm text-slate-600 mt-1">{topic.description}</p>}
                  <p className="text-xs text-slate-500 mt-2">
                    {topic.hours != null ? `${topic.hours} h · ` : ''}
                    {topic.positionIds.length > 0
                      ? topic.positionIds.map(positionName).join(', ')
                      : 'Todos los puestos'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => openTopic(topic)} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                    Editar
                  </button>
                  <button type="button" onClick={() => void handleDeleteTopic(topic)} className="px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50">
                    Eliminar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showIssue && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-xl shadow-xl flex flex-col">
            <div className="bg-blue-600 text-white px-4 py-3 md:rounded-t-xl flex items-center justify-between">
              <h2 className="font-bold">Registrar capacitación</h2>
              <button type="button" onClick={() => setShowIssue(false)} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                {(['certificado', 'acta'] as TrainingDocumentType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setIssueForm((prev) => ({ ...prev, documentType: type }))}
                    className={`rounded-lg border px-3 py-2 text-sm capitalize ${issueForm.documentType === type ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold' : 'border-slate-300 text-slate-600'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Unidad</span>
                <select
                  value={issueForm.unitId}
                  onChange={(event) =>
                    setIssueForm((prev) => ({ ...prev, unitId: event.target.value, workerIds: [] }))
                  }
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 outline-none"
                >
                  <option value="">Selecciona una unidad</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                      {unit.clientName ? ` — ${unit.clientName}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700">Trabajadores</span>
                  <span className="text-xs text-slate-500">{issueForm.workerIds.length} seleccionados</span>
                </div>
                <input
                  value={issueForm.workerQuery}
                  onChange={(event) => setIssueForm((prev) => ({ ...prev, workerQuery: event.target.value }))}
                  placeholder="Buscar por nombre, DNI o puesto"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none mb-2"
                />
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {visibleWorkers.length === 0 ? (
                    <p className="p-3 text-sm text-slate-400">No hay trabajadores activos en esta unidad.</p>
                  ) : (
                    visibleWorkers.map((worker) => (
                      <label key={worker.id} className="flex items-start gap-2 p-2 text-sm cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={issueForm.workerIds.includes(worker.id)}
                          onChange={() => toggleWorker(worker.id)}
                          className="mt-1"
                        />
                        <span>
                          <span className="font-medium text-slate-800">{worker.name}</span>
                          <span className="block text-xs text-slate-500">
                            {[worker.dni, worker.puesto || 'Sin puesto'].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {mismatchedWorkers.length > 0 && (
                  <p className="text-xs text-amber-700 mt-2">
                    El tema no está asociado al puesto de {mismatchedWorkers.map((worker) => worker.name).join(', ')}. Puedes emitirlo igual.
                  </p>
                )}
              </div>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Tema</span>
                <select
                  value={issueForm.topicId}
                  onChange={(event) => applyTopic(event.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 outline-none"
                >
                  <option value="">Otro tema</option>
                  {activeTopics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                      {topic.positionIds.length > 0 ? ` (${topic.positionIds.map(positionName).join(', ')})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {!issueForm.topicId && (
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Nombre del tema</span>
                  <input
                    value={issueForm.customTopic}
                    onChange={(event) => setIssueForm((prev) => ({ ...prev, customTopic: event.target.value }))}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 outline-none"
                  />
                </label>
              )}
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Contenido</span>
                <textarea
                  value={issueForm.description}
                  onChange={(event) => setIssueForm((prev) => ({ ...prev, description: event.target.value }))}
                  rows={3}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 outline-none"
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Fecha</span>
                  <DateInput
                    value={issueForm.date}
                    onChange={(date) => setIssueForm((prev) => ({ ...prev, date }))}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 outline-none"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Horas</span>
                  <input
                    value={issueForm.hours}
                    onChange={(event) => setIssueForm((prev) => ({ ...prev, hours: event.target.value }))}
                    inputMode="decimal"
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 outline-none"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Instructor</span>
                  <input
                    value={issueForm.instructor}
                    onChange={(event) => setIssueForm((prev) => ({ ...prev, instructor: event.target.value }))}
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 outline-none"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Calificación (0–20)</span>
                  <input
                    value={issueForm.score}
                    onChange={(event) => setIssueForm((prev) => ({ ...prev, score: event.target.value }))}
                    inputMode="decimal"
                    className="mt-1 w-full border border-slate-300 rounded-lg p-2 outline-none"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Estado</span>
                <select
                  value={issueForm.status}
                  onChange={(event) =>
                    setIssueForm((prev) => ({ ...prev, status: event.target.value as IssueForm['status'] }))
                  }
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 outline-none"
                >
                  <option value="Completado">Completado</option>
                  <option value="Programado">Programado</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Observaciones</span>
                <textarea
                  value={issueForm.notes}
                  onChange={(event) => setIssueForm((prev) => ({ ...prev, notes: event.target.value }))}
                  rows={2}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 outline-none"
                />
              </label>
              <p className="text-xs text-slate-500">
                Cada trabajador recibe su propio código. El puesto que figura en el PDF es el puesto actual de su ficha, y el registro se suma a sus capacitaciones.
              </p>
              <button
                type="button"
                onClick={() => void handleIssue()}
                disabled={saving}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save size={16} />
                {saving ? 'Guardando...' : 'Guardar en el récord'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTopic && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-0 md:p-4">
          <div className="bg-white w-full h-full md:h-auto md:max-h-[90vh] md:max-w-lg md:rounded-xl shadow-xl flex flex-col">
            <div className="bg-slate-800 text-white px-4 py-3 md:rounded-t-xl flex items-center justify-between">
              <h2 className="font-bold">{topicForm.id ? 'Editar tema' : 'Nuevo tema'}</h2>
              <button type="button" onClick={() => setShowTopic(false)} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Nombre</span>
                <input
                  value={topicForm.name}
                  onChange={(event) => setTopicForm((prev) => ({ ...prev, name: event.target.value }))}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Descripción</span>
                <textarea
                  value={topicForm.description}
                  onChange={(event) => setTopicForm((prev) => ({ ...prev, description: event.target.value }))}
                  rows={3}
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Horas</span>
                <input
                  value={topicForm.hours}
                  onChange={(event) => setTopicForm((prev) => ({ ...prev, hours: event.target.value }))}
                  inputMode="decimal"
                  className="mt-1 w-full border border-slate-300 rounded-lg p-2 outline-none"
                />
              </label>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-1">Puestos</p>
                <p className="text-xs text-slate-500 mb-2">Si no marcas ninguno, el tema queda disponible para cualquier puesto.</p>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {positions.filter((position) => position.isActive || topicForm.positionIds.includes(position.id)).length === 0 ? (
                    <p className="p-3 text-sm text-slate-400">No hay puestos cargados.</p>
                  ) : (
                    positions
                      .filter((position) => position.isActive || topicForm.positionIds.includes(position.id))
                      .map((position) => (
                        <label key={position.id} className="flex items-center gap-2 p-2 text-sm cursor-pointer hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={topicForm.positionIds.includes(position.id)}
                            onChange={() =>
                              setTopicForm((prev) => ({
                                ...prev,
                                positionIds: prev.positionIds.includes(position.id)
                                  ? prev.positionIds.filter((id) => id !== position.id)
                                  : [...prev.positionIds, position.id],
                              }))
                            }
                          />
                          {position.name}
                        </label>
                      ))
                  )}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={topicForm.isActive}
                  onChange={(event) => setTopicForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                Tema activo
              </label>
              <button
                type="button"
                onClick={() => void handleSaveTopic()}
                disabled={saving}
                className="w-full bg-slate-800 text-white py-2.5 rounded-lg font-medium hover:bg-slate-900 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar tema'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
