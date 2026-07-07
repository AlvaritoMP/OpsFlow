import React, { useCallback, useEffect, useState } from 'react';
import {
  User,
  Landmark,
  Phone,
  GraduationCap,
  Users,
  FileText,
  Save,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  X,
  Upload,
  Download,
  ChevronDown,
  ChevronUp,
  FolderOpen,
} from 'lucide-react';
import {
  BpoPersonnelProfile,
  BpoPersonnelDependent,
  BpoPersonnelDocument,
  BpoMaritalStatus,
  BpoEducationLevel,
  BpoDependentRelationship,
  BpoPersonnelDocumentCategory,
} from '../types';
import { bpoPersonnelService } from '../services/bpoPersonnelService';

interface BpoPersonnelProfilePanelProps {
  resourceId: string;
  unitId: string;
  workerName: string;
  canEdit: boolean;
}

const MARITAL_LABELS: Record<BpoMaritalStatus, string> = {
  soltero: 'Soltero/a',
  casado: 'Casado/a',
  conviviente: 'Conviviente',
  divorciado: 'Divorciado/a',
  viudo: 'Viudo/a',
  otro: 'Otro',
};

const EDUCATION_LABELS: Record<BpoEducationLevel, string> = {
  sin_estudios: 'Sin estudios',
  primaria: 'Primaria',
  secundaria: 'Secundaria',
  tecnico: 'Técnico',
  universitario_incompleto: 'Universitario incompleto',
  universitario_completo: 'Universitario completo',
  postgrado: 'Postgrado',
  otro: 'Otro',
};

const RELATIONSHIP_LABELS: Record<BpoDependentRelationship, string> = {
  conyuge: 'Cónyuge',
  hijo: 'Hijo',
  hija: 'Hija',
  padre: 'Padre',
  madre: 'Madre',
  hermano: 'Hermano',
  hermana: 'Hermana',
  otro: 'Otro',
};

const DOC_CATEGORY_LABELS: Record<BpoPersonnelDocumentCategory, string> = {
  dni_trabajador: 'DNI trabajador',
  dni_familiar: 'DNI familiar',
  constancia: 'Constancia',
  afp: 'AFP',
  educacion: 'Educación',
  otro: 'Otro',
};

const AFP_OPTIONS = ['Integra', 'Prima', 'Profuturo', 'Habitat', 'ONP', 'Otro'];

const EMPTY_PROFILE: Partial<BpoPersonnelProfile> = {
  nationality: '',
  address: '',
  maritalStatus: undefined,
  gender: '',
  afpName: '',
  afpAffiliationDate: '',
  afpEmail: '',
  afpCuspp: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  emergencyContactRelationship: '',
  educationLevel: undefined,
  educationInstitution: '',
  educationCareer: '',
  educationCompletionYear: undefined,
  notes: '',
};

const EMPTY_DEPENDENT = {
  relationship: 'hijo' as BpoDependentRelationship,
  fullName: '',
  documentType: 'DNI',
  documentNumber: '',
  birthDate: '',
  isDependent: true,
  notes: '',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message?: string }).message;
    if (msg) return msg;
  }
  return fallback;
}

function profileForForm(
  prof: BpoPersonnelProfile | null,
  resourceId: string,
  unitId: string
): Partial<BpoPersonnelProfile> {
  if (!prof) {
    return { ...EMPTY_PROFILE, resourceId, unitId };
  }
  return {
    ...prof,
    nationality: prof.nationality ?? '',
    address: prof.address ?? '',
    gender: prof.gender ?? '',
    afpName: prof.afpName ?? '',
    afpAffiliationDate: prof.afpAffiliationDate ?? '',
    afpEmail: prof.afpEmail ?? '',
    afpCuspp: prof.afpCuspp ?? '',
    emergencyContactName: prof.emergencyContactName ?? '',
    emergencyContactPhone: prof.emergencyContactPhone ?? '',
    emergencyContactRelationship: prof.emergencyContactRelationship ?? '',
    educationInstitution: prof.educationInstitution ?? '',
    educationCareer: prof.educationCareer ?? '',
    notes: prof.notes ?? '',
  };
}

function Section({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-violet-100 rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-violet-50/80 hover:bg-violet-50 text-left"
      >
        <span className="text-xs font-bold text-violet-800 uppercase tracking-wide flex items-center gap-2">
          {icon} {title}
        </span>
        {open ? <ChevronUp size={16} className="text-violet-400" /> : <ChevronDown size={16} className="text-violet-400" />}
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

export const BpoPersonnelProfilePanel: React.FC<BpoPersonnelProfilePanelProps> = ({
  resourceId,
  unitId,
  workerName,
  canEdit,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Partial<BpoPersonnelProfile>>(EMPTY_PROFILE);
  const [dependents, setDependents] = useState<BpoPersonnelDependent[]>([]);
  const [documents, setDocuments] = useState<BpoPersonnelDocument[]>([]);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [showDependentModal, setShowDependentModal] = useState(false);
  const [editingDependent, setEditingDependent] = useState<BpoPersonnelDependent | null>(null);
  const [dependentForm, setDependentForm] = useState(EMPTY_DEPENDENT);

  const [showDocModal, setShowDocModal] = useState(false);
  const [docForm, setDocForm] = useState({
    name: '',
    category: 'otro' as BpoPersonnelDocumentCategory,
    description: '',
    dependentId: '',
  });
  const [docFile, setDocFile] = useState<File | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [prof, deps, docs] = await Promise.all([
        bpoPersonnelService.getProfile(resourceId),
        bpoPersonnelService.getDependents(resourceId),
        bpoPersonnelService.getDocuments(resourceId),
      ]);
      setProfile(profileForForm(prof, resourceId, unitId));
      setDependents(deps);
      setDocuments(docs);
    } catch (error) {
      setMessage({
        type: 'err',
        text: getErrorMessage(error, 'Error al cargar expediente BPO. Verifique que ejecutó el script SQL y las políticas RLS.'),
      });
    } finally {
      setLoading(false);
    }
  }, [resourceId, unitId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await bpoPersonnelService.upsertProfile(resourceId, unitId, profile);
      setProfile(profileForForm(saved, resourceId, unitId));
      setMessage({ type: 'ok', text: 'Expediente guardado. Puede completar los demás campos cuando los tenga.' });
    } catch (error) {
      setMessage({
        type: 'err',
        text: getErrorMessage(
          error,
          'No se pudo guardar el expediente. Si el error menciona RLS, ejecute database/bpo_rls_policies.sql en Supabase.'
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const openAddDependent = () => {
    setEditingDependent(null);
    setDependentForm(EMPTY_DEPENDENT);
    setShowDependentModal(true);
  };

  const openEditDependent = (dep: BpoPersonnelDependent) => {
    setEditingDependent(dep);
    setDependentForm({
      relationship: dep.relationship,
      fullName: dep.fullName,
      documentType: dep.documentType || 'DNI',
      documentNumber: dep.documentNumber || '',
      birthDate: dep.birthDate || '',
      isDependent: dep.isDependent,
      notes: dep.notes || '',
    });
    setShowDependentModal(true);
  };

  const handleSaveDependent = async () => {
    if (!dependentForm.fullName.trim()) {
      setMessage({ type: 'err', text: 'El nombre del familiar es obligatorio.' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        relationship: dependentForm.relationship,
        fullName: dependentForm.fullName.trim(),
        documentType: dependentForm.documentType,
        documentNumber: dependentForm.documentNumber.trim() || undefined,
        birthDate: dependentForm.birthDate || undefined,
        isDependent: dependentForm.isDependent,
        notes: dependentForm.notes.trim() || undefined,
      };
      if (editingDependent) {
        await bpoPersonnelService.updateDependent(editingDependent.id, payload);
      } else {
        await bpoPersonnelService.createDependent(resourceId, unitId, payload);
      }
      setShowDependentModal(false);
      await loadAll();
      setMessage({ type: 'ok', text: editingDependent ? 'Familiar actualizado.' : 'Familiar registrado.' });
    } catch {
      setMessage({ type: 'err', text: 'Error al guardar familiar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDependent = async (dep: BpoPersonnelDependent) => {
    if (!window.confirm(`¿Eliminar a ${dep.fullName}?`)) return;
    try {
      await bpoPersonnelService.deleteDependent(dep.id);
      await loadAll();
      setMessage({ type: 'ok', text: 'Familiar eliminado.' });
    } catch {
      setMessage({ type: 'err', text: 'No se pudo eliminar.' });
    }
  };

  const handleUploadDocument = async () => {
    if (!docFile || !docForm.name.trim()) {
      setMessage({ type: 'err', text: 'Indique nombre y archivo.' });
      return;
    }
    setSaving(true);
    try {
      await bpoPersonnelService.uploadDocument(resourceId, unitId, docFile, {
        name: docForm.name.trim(),
        category: docForm.category,
        description: docForm.description.trim() || undefined,
        dependentId: docForm.dependentId || undefined,
      });
      setShowDocModal(false);
      setDocFile(null);
      await loadAll();
      setMessage({ type: 'ok', text: 'Documento subido.' });
    } catch {
      setMessage({ type: 'err', text: 'Error al subir documento.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDocument = async (doc: BpoPersonnelDocument) => {
    if (!window.confirm(`¿Eliminar "${doc.name}"?`)) return;
    try {
      await bpoPersonnelService.deleteDocument(doc.id);
      await loadAll();
      setMessage({ type: 'ok', text: 'Documento eliminado.' });
    } catch {
      setMessage({ type: 'err', text: 'No se pudo eliminar.' });
    }
  };

  const field = (
    label: string,
    key: keyof BpoPersonnelProfile,
    type: 'text' | 'date' | 'number' | 'select' = 'text',
    options?: { value: string; label: string }[]
  ) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {type === 'select' && options ? (
        <select
          className="w-full border border-slate-200 rounded-lg p-2 text-sm disabled:bg-slate-50"
          value={(profile[key] as string) || ''}
          disabled={!canEdit}
          onChange={(e) => setProfile({ ...profile, [key]: e.target.value || undefined })}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          className="w-full border border-slate-200 rounded-lg p-2 text-sm disabled:bg-slate-50"
          value={
            type === 'number'
              ? profile[key] !== undefined && profile[key] !== null
                ? String(profile[key])
                : ''
              : (profile[key] as string) || ''
          }
          disabled={!canEdit}
          onChange={(e) =>
            setProfile({
              ...profile,
              [key]:
                type === 'number'
                  ? e.target.value.trim()
                    ? Number(e.target.value)
                    : undefined
                  : e.target.value,
            })
          }
        />
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando expediente BPO…
      </div>
    );
  }

  return (
    <div className="bg-violet-50/40 border border-violet-200 rounded-xl p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h5 className="text-sm font-bold text-violet-900 flex items-center gap-2">
            <FolderOpen size={16} /> Expediente BPO — {workerName}
          </h5>
          <p className="text-xs text-violet-600 mt-0.5">
            Puede guardar con los campos que tenga disponibles y completar el resto después.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadAll}
            className="p-2 text-violet-600 hover:bg-violet-100 rounded-lg"
            title="Actualizar"
          >
            <RefreshCw size={16} />
          </button>
          {canEdit && (
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Guardando…' : 'Guardar expediente'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`px-3 py-2 rounded-lg text-xs ${
            message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Sociodemográfico" icon={<User size={14} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('Nacionalidad', 'nationality')}
            {field('Estado civil', 'maritalStatus', 'select', Object.entries(MARITAL_LABELS).map(([v, l]) => ({ value: v, label: l })))}
            {field('Género', 'gender')}
            <div className="sm:col-span-2">{field('Dirección', 'address')}</div>
          </div>
        </Section>

        <Section title="AFP / Pensión" icon={<Landmark size={14} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">AFP / Régimen</label>
              <input
                list="afp-options"
                className="w-full border border-slate-200 rounded-lg p-2 text-sm disabled:bg-slate-50"
                value={profile.afpName || ''}
                disabled={!canEdit}
                onChange={(e) => setProfile({ ...profile, afpName: e.target.value })}
                placeholder="Integra, Prima, ONP…"
              />
              <datalist id="afp-options">
                {AFP_OPTIONS.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
            {field('Fecha de afiliación', 'afpAffiliationDate', 'date')}
            {field('CUSPP', 'afpCuspp')}
            {field('Correo AFP', 'afpEmail')}
          </div>
        </Section>

        <Section title="Contacto de emergencia" icon={<Phone size={14} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('Nombre del contacto', 'emergencyContactName')}
            {field('Teléfono', 'emergencyContactPhone')}
            <div className="sm:col-span-2">
              {field('Parentesco / relación', 'emergencyContactRelationship')}
            </div>
          </div>
        </Section>

        <Section title="Instrucción y educación" icon={<GraduationCap size={14} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field(
              'Nivel educativo',
              'educationLevel',
              'select',
              Object.entries(EDUCATION_LABELS).map(([v, l]) => ({ value: v, label: l }))
            )}
            {field('Institución', 'educationInstitution')}
            {field('Carrera / especialidad', 'educationCareer')}
            {field('Año de culminación', 'educationCompletionYear', 'number')}
          </div>
        </Section>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Notas del expediente</label>
        <textarea
          className="w-full border border-slate-200 rounded-lg p-2 text-sm min-h-[60px] disabled:bg-slate-50"
          value={profile.notes || ''}
          disabled={!canEdit}
          onChange={(e) => setProfile({ ...profile, notes: e.target.value })}
        />
      </div>

      <Section title="Familiares y dependientes" icon={<Users size={14} />} defaultOpen>
        <div className="flex justify-end mb-3">
          {canEdit && (
            <button
              onClick={openAddDependent}
              className="text-xs text-violet-600 font-medium hover:underline flex items-center gap-1"
            >
              <Plus size={14} /> Agregar familiar
            </button>
          )}
        </div>
        {dependents.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center py-4">Sin familiares registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="pb-2 pr-3">Nombre</th>
                  <th className="pb-2 pr-3">Parentesco</th>
                  <th className="pb-2 pr-3">Documento</th>
                  <th className="pb-2 pr-3">Nacimiento</th>
                  <th className="pb-2 pr-3">Dependiente</th>
                  {canEdit && <th className="pb-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {dependents.map((dep) => (
                  <tr key={dep.id}>
                    <td className="py-2 pr-3 font-medium text-slate-700">{dep.fullName}</td>
                    <td className="py-2 pr-3 text-slate-600">{RELATIONSHIP_LABELS[dep.relationship]}</td>
                    <td className="py-2 pr-3 text-slate-600 font-mono text-xs">
                      {dep.documentNumber ? `${dep.documentType || 'DNI'}: ${dep.documentNumber}` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{dep.birthDate || '—'}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${dep.isDependent ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}
                      >
                        {dep.isDependent ? 'Sí' : 'No'}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="py-2">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openEditDependent(dep)} className="p-1 text-slate-400 hover:text-blue-600">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDeleteDependent(dep)} className="p-1 text-slate-400 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Documentos y constancias" icon={<FileText size={14} />} defaultOpen>
        <div className="flex justify-end mb-3">
          {canEdit && (
            <button
              onClick={() => {
                setDocForm({ name: '', category: 'otro', description: '', dependentId: '' });
                setDocFile(null);
                setShowDocModal(true);
              }}
              className="text-xs text-violet-600 font-medium hover:underline flex items-center gap-1"
            >
              <Upload size={14} /> Subir documento
            </button>
          )}
        </div>
        {documents.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center py-4">
            Sin archivos. Puede adjuntar DNI, constancias, documentos AFP, etc.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {documents.map((doc) => {
              const linkedDep = doc.dependentId
                ? dependents.find((d) => d.id === doc.dependentId)
                : null;
              return (
                <div key={doc.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg bg-slate-50/50">
                  <FileText size={20} className="text-violet-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 truncate">{doc.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {DOC_CATEGORY_LABELS[doc.category]}
                      {linkedDep && ` · ${linkedDep.fullName}`}
                      {' · '}
                      {formatFileSize(doc.fileSize)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <a
                      href={doc.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <Download size={14} />
                    </a>
                    {canEdit && (
                      <button onClick={() => handleDeleteDocument(doc)} className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {showDependentModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-slate-800">{editingDependent ? 'Editar familiar' : 'Nuevo familiar'}</h3>
              <button onClick={() => setShowDependentModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Parentesco</label>
                <select
                  className="w-full border rounded-lg p-2 text-sm"
                  value={dependentForm.relationship}
                  onChange={(e) => setDependentForm({ ...dependentForm, relationship: e.target.value as BpoDependentRelationship })}
                >
                  {Object.entries(RELATIONSHIP_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre completo *</label>
                <input
                  className="w-full border rounded-lg p-2 text-sm"
                  value={dependentForm.fullName}
                  onChange={(e) => setDependentForm({ ...dependentForm, fullName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tipo doc.</label>
                  <input
                    className="w-full border rounded-lg p-2 text-sm"
                    value={dependentForm.documentType}
                    onChange={(e) => setDependentForm({ ...dependentForm, documentType: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">N° documento</label>
                  <input
                    className="w-full border rounded-lg p-2 text-sm font-mono"
                    value={dependentForm.documentNumber}
                    onChange={(e) => setDependentForm({ ...dependentForm, documentNumber: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fecha de nacimiento</label>
                <input
                  type="date"
                  className="w-full border rounded-lg p-2 text-sm"
                  value={dependentForm.birthDate}
                  onChange={(e) => setDependentForm({ ...dependentForm, birthDate: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={dependentForm.isDependent}
                  onChange={(e) => setDependentForm({ ...dependentForm, isDependent: e.target.checked })}
                />
                Es dependiente (para beneficios / planilla)
              </label>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
                <textarea
                  className="w-full border rounded-lg p-2 text-sm min-h-[60px]"
                  value={dependentForm.notes}
                  onChange={(e) => setDependentForm({ ...dependentForm, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setShowDependentModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button onClick={handleSaveDependent} disabled={saving} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDocModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-slate-800">Subir documento</h3>
              <button onClick={() => setShowDocModal(false)}><X size={20} className="text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre / descripción *</label>
                <input
                  className="w-full border rounded-lg p-2 text-sm"
                  value={docForm.name}
                  onChange={(e) => setDocForm({ ...docForm, name: e.target.value })}
                  placeholder="Ej. DNI cónyuge, Constancia de estudios"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Categoría</label>
                <select
                  className="w-full border rounded-lg p-2 text-sm"
                  value={docForm.category}
                  onChange={(e) => setDocForm({ ...docForm, category: e.target.value as BpoPersonnelDocumentCategory })}
                >
                  {Object.entries(DOC_CATEGORY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              {dependents.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Vincular a familiar (opcional)</label>
                  <select
                    className="w-full border rounded-lg p-2 text-sm"
                    value={docForm.dependentId}
                    onChange={(e) => setDocForm({ ...docForm, dependentId: e.target.value })}
                  >
                    <option value="">— Trabajador / general —</option>
                    {dependents.map((d) => (
                      <option key={d.id} value={d.id}>{d.fullName} ({RELATIONSHIP_LABELS[d.relationship]})</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Archivo *</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,image/*"
                  className="w-full text-sm"
                  onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setShowDocModal(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button onClick={handleUploadDocument} disabled={saving || !docFile} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? 'Subiendo…' : 'Subir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
