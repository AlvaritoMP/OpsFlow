import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Camera,
  ChevronDown,
  ChevronUp,
  Download,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
  User,
  Users,
} from 'lucide-react';
import { Resource, ResourceType, Unit, UnitBook, UnitBookCustomSection, UnitBookMember, UnitBookPhoto } from '../types';
import { unitBookService } from '../services/unitBookService';
import { SafeImage } from './SafeImage';
import {
  formatExperienceFromResource,
  formatOpaloTenure,
  formatZones,
  newCustomSectionId,
} from '../utils/unitBookHelpers';
import { buildPdfMembers, generateUnitBookPdf } from '../utils/generateUnitBookPdf';

interface UnitBookTabProps {
  unit: Unit;
  canEdit: boolean;
  currentUserId?: string;
}

type MemberDraft = {
  functions: string;
  experience: string;
  workZone: string;
  colleagueMessage: string;
  includeInBook: boolean;
};

function isActivePersonnel(resource: Resource): boolean {
  if (resource.type !== ResourceType.PERSONNEL) return false;
  if (resource.archived) return false;
  const status = (resource.personnelStatus || '').toLowerCase();
  if (status === 'cesado' || status === 'archivado') return false;
  return true;
}

function draftFrom(resource: Resource, profile?: UnitBookMember): MemberDraft {
  return {
    functions: profile?.functions || '',
    experience: profile?.experience || formatExperienceFromResource(resource),
    workZone: profile?.workZone || formatZones(resource),
    colleagueMessage: profile?.colleagueMessage || '',
    includeInBook: profile ? profile.includeInBook : true,
  };
}

export const UnitBookTab: React.FC<UnitBookTabProps> = ({ unit, canEdit, currentUserId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [book, setBook] = useState<UnitBook | null>(null);
  const [photos, setPhotos] = useState<UnitBookPhoto[]>([]);
  const [members, setMembers] = useState<UnitBookMember[]>([]);

  const [serviceObjective, setServiceObjective] = useState('');
  const [floorCount, setFloorCount] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [workSchedule, setWorkSchedule] = useState('');
  const [dressCode, setDressCode] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [importantNotes, setImportantNotes] = useState('');
  const [customSections, setCustomSections] = useState<UnitBookCustomSection[]>([]);

  const [drafts, setDrafts] = useState<Record<string, MemberDraft>>({});
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const personnel = useMemo(
    () =>
      (unit.resources || [])
        .filter(isActivePersonnel)
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [unit.resources],
  );

  const applyBook = (next: UnitBook) => {
    setBook(next);
    setServiceObjective(next.serviceObjective || unit.description || '');
    setFloorCount(next.floorCount != null ? String(next.floorCount) : '');
    setWelcomeMessage(next.welcomeMessage || '');
    setWorkSchedule(next.workSchedule || '');
    setDressCode(next.dressCode || '');
    setAccessInstructions(next.accessInstructions || '');
    setImportantNotes(next.importantNotes || '');
    setCustomSections(next.customSections?.length ? next.customSections : []);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [nextBook, nextPhotos, nextMembers] = await Promise.all([
        unitBookService.getOrCreate(unit.id),
        unitBookService.getPhotos(unit.id),
        unitBookService.getMembers(unit.id),
      ]);
      applyBook(nextBook);
      setPhotos(nextPhotos);
      setMembers(nextMembers);

      const byId = new Map(nextMembers.map((m) => [m.resourceId, m]));
      const nextDrafts: Record<string, MemberDraft> = {};
      personnel.forEach((resource) => {
        nextDrafts[resource.id] = draftFrom(resource, byId.get(resource.id));
      });
      setDrafts(nextDrafts);
    } catch {
      setMessage({ type: 'err', text: 'No se pudo cargar el Unit Book. Verifique que la migración esté aplicada.' });
    } finally {
      setLoading(false);
    }
    // personnel is derived from unit; we re-seed drafts after load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      const memberById = new Map<string, UnitBookMember>(members.map((m) => [m.resourceId, m]));
      personnel.forEach((resource) => {
        if (!next[resource.id]) next[resource.id] = draftFrom(resource, memberById.get(resource.id));
      });
      return next;
    });
  }, [personnel, members]);

  const includedCount = personnel.filter((p) => drafts[p.id]?.includeInBook !== false).length;

  const completeness = useMemo(() => {
    const items = [
      { ok: Boolean(serviceObjective.trim()), label: 'Objetivo' },
      { ok: Boolean(floorCount.trim()), label: 'Pisos' },
      { ok: photos.length > 0, label: 'Fotos' },
      { ok: includedCount > 0, label: 'Equipo' },
      { ok: personnel.some((p) => Boolean(drafts[p.id]?.functions?.trim())), label: 'Funciones' },
    ];
    return items;
  }, [serviceObjective, floorCount, photos.length, includedCount, personnel, drafts]);

  const flash = (type: 'ok' | 'err', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4500);
  };

  const handleSaveBook = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const parsedFloors = floorCount.trim() === '' ? null : Number(floorCount);
      const saved = await unitBookService.saveBook(
        unit.id,
        {
          serviceObjective,
          floorCount: parsedFloors != null && Number.isFinite(parsedFloors) ? parsedFloors : null,
          welcomeMessage,
          workSchedule,
          dressCode,
          accessInstructions,
          importantNotes,
          customSections,
        },
        currentUserId,
      );
      setBook(saved);
      flash('ok', 'Contenido del Unit Book guardado.');
    } catch (error) {
      flash('err', error instanceof Error ? error.message : 'No se pudo guardar el Unit Book.');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || !canEdit) return;
    setUploadingPhoto(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        await unitBookService.addPhoto(unit.id, file);
      }
      setPhotos(await unitBookService.getPhotos(unit.id));
      flash('ok', 'Fotos agregadas al Unit Book.');
    } catch (error) {
      flash('err', error instanceof Error ? error.message : 'No se pudieron subir las fotos.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleImportUnitPhotos = async () => {
    if (!canEdit) return;
    const existing = new Set(photos.map((p) => p.imageUrl));
    const toImport = (unit.images || []).filter((url) => url && !existing.has(url));
    if (!toImport.length) {
      flash('ok', 'No hay fotos nuevas en la galería de la unidad.');
      return;
    }
    try {
      const startOrder = photos.length === 0 ? 0 : Math.max(...photos.map((p) => p.displayOrder)) + 1;
      for (let i = 0; i < toImport.length; i++) {
        await unitBookService.addPhotoFromUrl(unit.id, toImport[i], '', startOrder + i);
      }
      setPhotos(await unitBookService.getPhotos(unit.id));
      flash('ok', `Se importaron ${toImport.length} foto(s) de la unidad.`);
    } catch {
      flash('err', 'No se pudieron importar las fotos de la unidad.');
    }
  };

  const handleCaptionBlur = async (photo: UnitBookPhoto, caption: string) => {
    if (!canEdit) return;
    if ((photo.caption || '') === caption.trim()) return;
    try {
      const updated = await unitBookService.updatePhoto(photo.id, { caption });
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? updated : p)));
    } catch {
      flash('err', 'No se pudo actualizar el pie de foto.');
    }
  };

  const movePhoto = async (index: number, dir: -1 | 1) => {
    if (!canEdit) return;
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= photos.length) return;
    const copy = [...photos];
    const [item] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, item);
    setPhotos(copy);
    try {
      await Promise.all(copy.map((p, i) => unitBookService.updatePhoto(p.id, { displayOrder: i })));
    } catch {
      flash('err', 'No se pudo reordenar las fotos.');
    }
  };

  const handleDeletePhoto = async (photo: UnitBookPhoto) => {
    if (!canEdit) return;
    if (!window.confirm('¿Quitar esta foto del Unit Book?')) return;
    try {
      await unitBookService.deletePhoto(photo);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch {
      flash('err', 'No se pudo eliminar la foto.');
    }
  };

  const updateDraft = (resourceId: string, patch: Partial<MemberDraft>) => {
    setDrafts((prev) => {
      const resource = personnel.find((p) => p.id === resourceId);
      const fallback = prev[resourceId] || (resource ? draftFrom(resource) : {
        functions: '',
        experience: '',
        workZone: '',
        colleagueMessage: '',
        includeInBook: true,
      });
      return { ...prev, [resourceId]: { ...fallback, ...patch } };
    });
  };

  const handleSaveMember = async (resource: Resource) => {
    if (!canEdit) return;
    const draft = drafts[resource.id];
    if (!draft) return;
    setSavingMemberId(resource.id);
    try {
      const saved = await unitBookService.upsertMember(unit.id, resource.id, draft);
      setMembers((prev) => {
        const rest = prev.filter((m) => m.resourceId !== resource.id);
        return [...rest, saved];
      });
      flash('ok', `Perfil de ${resource.name} guardado.`);
    } catch (error) {
      flash('err', error instanceof Error ? error.message : 'No se pudo guardar el perfil.');
    } finally {
      setSavingMemberId(null);
    }
  };

  const handleToggleInclude = async (resource: Resource, include: boolean) => {
    const current = drafts[resource.id] || draftFrom(resource);
    const next = { ...current, includeInBook: include };
    updateDraft(resource.id, { includeInBook: include });
    if (!canEdit) return;
    try {
      const saved = await unitBookService.upsertMember(unit.id, resource.id, next);
      setMembers((prev) => {
        const rest = prev.filter((m) => m.resourceId !== resource.id);
        return [...rest, saved];
      });
    } catch {
      flash('err', 'No se pudo actualizar la inclusión en el folleto.');
    }
  };

  const addCustomSection = () => {
    setCustomSections((prev) => [...prev, { id: newCustomSectionId(), title: '', body: '' }]);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (canEdit) {
        await unitBookService.saveBook(
          unit.id,
          {
            serviceObjective,
            floorCount: floorCount.trim() === '' ? null : Number(floorCount),
            welcomeMessage,
            workSchedule,
            dressCode,
            accessInstructions,
            importantNotes,
            customSections,
          },
          currentUserId,
        );
        await Promise.all(
          personnel.map((resource) => {
            const draft = drafts[resource.id];
            if (!draft) return Promise.resolve();
            return unitBookService.upsertMember(unit.id, resource.id, draft);
          }),
        );
        setMembers(await unitBookService.getMembers(unit.id));
      }
      const pdfMembers = buildPdfMembers(personnel, members, drafts);
      await generateUnitBookPdf({
        unit,
        book: {
          ...(book || {
            id: '',
            unitId: unit.id,
            customSections: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          serviceObjective,
          floorCount: floorCount.trim() === '' ? null : Number(floorCount),
          welcomeMessage,
          workSchedule,
          dressCode,
          accessInstructions,
          importantNotes,
          customSections,
        },
        photos,
        members: pdfMembers,
      });
    } catch (error) {
      flash('err', error instanceof Error ? error.message : 'No se pudo generar el PDF.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Cargando Unit Book…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
              <BookOpen className="w-5 h-5 mr-2 text-indigo-600" /> Unit Book
            </h3>
            <p className="text-slate-500 text-sm mt-1 max-w-2xl">
              Folleto de incorporación para candidatos y nuevos ingresos: contexto de la unidad, fotos, objetivo del
              servicio y el equipo con el que trabajarán.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {completeness.map((item) => (
                <span
                  key={item.label}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    item.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {item.ok ? '✓' : '○'} {item.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {canEdit && (
              <button
                onClick={handleSaveBook}
                disabled={saving}
                className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-900 transition-colors flex items-center disabled:opacity-60"
              >
                {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
                Guardar contenido
              </button>
            )}
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center disabled:opacity-60 shadow-sm"
            >
              {downloading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Download size={16} className="mr-2" />}
              Descargar folleto PDF
            </button>
          </div>
        </div>

        {message && (
          <div
            className={`mx-6 mt-4 px-4 py-2.5 rounded-lg text-sm ${
              message.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Field label="Mensaje de bienvenida" hint="Lo verán en la portada del folleto.">
              <textarea
                className={inputClass(canEdit)}
                rows={3}
                disabled={!canEdit}
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="Bienvenido al equipo de esta unidad. Estamos para acompañarte en tu incorporación…"
              />
            </Field>
            <Field label="Objetivo del servicio">
              <textarea
                className={inputClass(canEdit)}
                rows={4}
                disabled={!canEdit}
                value={serviceObjective}
                onChange={(e) => setServiceObjective(e.target.value)}
                placeholder="Qué se presta en esta unidad, para quién y con qué estándar."
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cantidad de pisos" hint={unit.blueprintLayers?.length ? `El plano tiene ${unit.blueprintLayers.length} capa(s).` : undefined}>
                <input
                  type="number"
                  min={0}
                  className={inputClass(canEdit)}
                  disabled={!canEdit}
                  value={floorCount}
                  onChange={(e) => setFloorCount(e.target.value)}
                  placeholder="Ej. 8"
                />
              </Field>
              <Field label="Zonas registradas">
                <p className="text-sm text-slate-600 pt-2">
                  {unit.zones?.length
                    ? unit.zones.map((z) => z.name).join(', ')
                    : 'Sin zonas definidas en el plano.'}
                </p>
              </Field>
            </div>
            <Field label="Horarios y jornada">
              <textarea
                className={inputClass(canEdit)}
                rows={3}
                disabled={!canEdit}
                value={workSchedule}
                onChange={(e) => setWorkSchedule(e.target.value)}
                placeholder="Turnos, horarios de ingreso, días de trabajo, puntos de encuentro."
              />
            </Field>
            <Field label="Código de vestimenta">
              <textarea
                className={inputClass(canEdit)}
                rows={2}
                disabled={!canEdit}
                value={dressCode}
                onChange={(e) => setDressCode(e.target.value)}
                placeholder="Uniforme, EPP, presentación personal."
              />
            </Field>
            <Field label="Acceso e indicaciones">
              <textarea
                className={inputClass(canEdit)}
                rows={3}
                disabled={!canEdit}
                value={accessInstructions}
                onChange={(e) => setAccessInstructions(e.target.value)}
                placeholder="Cómo llegar, ingreso, credenciales, contactos de portería."
              />
            </Field>
            <Field label="Notas importantes">
              <textarea
                className={inputClass(canEdit)}
                rows={3}
                disabled={!canEdit}
                value={importantNotes}
                onChange={(e) => setImportantNotes(e.target.value)}
                placeholder="Normas del cliente, zonas restringidas, particularidades del servicio."
              />
            </Field>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-800 flex items-center">
                <Camera className="w-4 h-4 mr-2 text-slate-500" /> Fotos de la unidad
              </h4>
              {canEdit && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleImportUnitPhotos}
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    Importar galería
                  </button>
                  <label className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer flex items-center">
                    {uploadingPhoto ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Upload size={12} className="mr-1" />}
                    Subir fotos
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(e.target.files)}
                    />
                  </label>
                </div>
              )}
            </div>
            {photos.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
                <ImageIcon size={36} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Aún no hay fotos en el Unit Book.</p>
                {canEdit && <p className="text-xs mt-1">Súbalas o impórtelas desde la pestaña General.</p>}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {photos.map((photo, index) => (
                  <div key={photo.id} className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                    <SafeImage
                      src={photo.imageUrl}
                      alt={photo.caption || 'Foto de la unidad'}
                      className="w-full h-32 object-cover"
                      bucket="unit-images"
                    />
                    <div className="p-2 space-y-1.5">
                      <input
                        className="w-full text-xs border border-slate-200 rounded px-2 py-1 disabled:bg-transparent"
                        disabled={!canEdit}
                        defaultValue={photo.caption || ''}
                        placeholder="Pie de foto (opcional)"
                        onBlur={(e) => handleCaptionBlur(photo, e.target.value)}
                      />
                      {canEdit && (
                        <div className="flex justify-between text-slate-500">
                          <div className="flex gap-1">
                            <button type="button" onClick={() => movePhoto(index, -1)} disabled={index === 0} className="p-1 hover:text-slate-800 disabled:opacity-30">
                              <ChevronUp size={14} />
                            </button>
                            <button type="button" onClick={() => movePhoto(index, 1)} disabled={index === photos.length - 1} className="p-1 hover:text-slate-800 disabled:opacity-30">
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          <button type="button" onClick={() => handleDeletePhoto(photo)} className="p-1 text-red-500 hover:text-red-700">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-800">Secciones adicionales</h4>
                {canEdit && (
                  <button
                    type="button"
                    onClick={addCustomSection}
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center"
                  >
                    <Plus size={12} className="mr-1" /> Agregar sección
                  </button>
                )}
              </div>
              {customSections.length === 0 ? (
                <p className="text-xs text-slate-400">Puede añadir bloques libres (protocolos, puntos de encuentro, etc.).</p>
              ) : (
                <div className="space-y-3">
                  {customSections.map((section, idx) => (
                    <div key={section.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          className={inputClass(canEdit)}
                          disabled={!canEdit}
                          value={section.title}
                          placeholder="Título de la sección"
                          onChange={(e) =>
                            setCustomSections((prev) => prev.map((s, i) => (i === idx ? { ...s, title: e.target.value } : s)))
                          }
                        />
                        {canEdit && (
                          <button
                            type="button"
                            className="text-red-500 hover:text-red-700 px-2"
                            onClick={() => setCustomSections((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <textarea
                        className={inputClass(canEdit)}
                        rows={3}
                        disabled={!canEdit}
                        value={section.body}
                        placeholder="Contenido…"
                        onChange={(e) =>
                          setCustomSections((prev) => prev.map((s, i) => (i === idx ? { ...s, body: e.target.value } : s)))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800 flex items-center">
              <Users className="w-5 h-5 mr-2 text-slate-500" /> Equipo en el folleto
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              {includedCount} de {personnel.length} colaboradores activos se incluirán en el PDF. Edite funciones,
              experiencia, zona y un mensaje para los nuevos.
            </p>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {personnel.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <User size={40} className="mx-auto mb-3 opacity-30" />
              <p>No hay personal activo en esta unidad.</p>
            </div>
          ) : (
            personnel.map((resource) => {
              const draft = drafts[resource.id] || draftFrom(resource);
              const open = openMemberId === resource.id;
              const tenure = formatOpaloTenure(resource.startDate);
              return (
                <div key={resource.id} className={draft.includeInBook ? 'bg-white' : 'bg-slate-50'}>
                  <div className="px-4 py-3 flex items-center gap-3">
                    <label className="flex items-center shrink-0">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-indigo-600"
                        checked={draft.includeInBook}
                        disabled={!canEdit}
                        onChange={(e) => handleToggleInclude(resource, e.target.checked)}
                      />
                    </label>
                    {resource.image ? (
                      <SafeImage
                        src={resource.image}
                        alt={resource.name}
                        className="w-11 h-11 rounded-full object-cover"
                        bucket="unit-images"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-sm font-semibold">
                        {resource.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <button
                      type="button"
                      className="flex-1 text-left min-w-0"
                      onClick={() => setOpenMemberId(open ? null : resource.id)}
                    >
                      <p className="font-medium text-slate-800 truncate">{resource.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {resource.puesto || 'Sin puesto'}
                        {draft.workZone ? ` · ${draft.workZone}` : ''}
                        {tenure ? ` · ${tenure} en Opalo` : ''}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenMemberId(open ? null : resource.id)}
                      className="p-2 text-slate-400 hover:text-slate-700"
                    >
                      {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                  {open && (
                    <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="Puesto">
                        <p className="text-sm text-slate-700 pt-1">{resource.puesto || '—'}</p>
                      </Field>
                      <Field label="Tiempo en Opalo">
                        <p className="text-sm text-slate-700 pt-1">{tenure || (resource.startDate ? resource.startDate : 'Sin fecha de ingreso')}</p>
                      </Field>
                      <Field label="Zona de trabajo">
                        <input
                          className={inputClass(canEdit)}
                          disabled={!canEdit}
                          value={draft.workZone}
                          onChange={(e) => updateDraft(resource.id, { workZone: e.target.value })}
                          placeholder="Ej. Lobby, Piso 3, Exteriores"
                        />
                      </Field>
                      <Field label="Turno">
                        <p className="text-sm text-slate-700 pt-1">{resource.assignedShift || '—'}</p>
                      </Field>
                      <div className="md:col-span-2">
                        <Field label="Funciones">
                          <textarea
                            className={inputClass(canEdit)}
                            rows={3}
                            disabled={!canEdit}
                            value={draft.functions}
                            onChange={(e) => updateDraft(resource.id, { functions: e.target.value })}
                            placeholder="Qué hace día a día en la unidad."
                          />
                        </Field>
                      </div>
                      <div className="md:col-span-2">
                        <Field label="Experiencia">
                          <textarea
                            className={inputClass(canEdit)}
                            rows={3}
                            disabled={!canEdit}
                            value={draft.experience}
                            onChange={(e) => updateDraft(resource.id, { experience: e.target.value })}
                            placeholder="Se precarga desde la ficha si existe; puede editarla para el folleto."
                          />
                        </Field>
                      </div>
                      <div className="md:col-span-2">
                        <Field label="Mensaje a sus colegas">
                          <textarea
                            className={inputClass(canEdit)}
                            rows={2}
                            disabled={!canEdit}
                            value={draft.colleagueMessage}
                            onChange={(e) => updateDraft(resource.id, { colleagueMessage: e.target.value })}
                            placeholder="Una bienvenida o consejo para quien se incorpora."
                          />
                        </Field>
                      </div>
                      {canEdit && (
                        <div className="md:col-span-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleSaveMember(resource)}
                            disabled={savingMemberId === resource.id}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center disabled:opacity-60"
                          >
                            {savingMemberId === resource.id ? (
                              <Loader2 size={14} className="mr-2 animate-spin" />
                            ) : (
                              <Save size={14} className="mr-2" />
                            )}
                            Guardar perfil
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      {hint && <span className="block text-xs text-slate-400 mb-1">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function inputClass(canEdit: boolean): string {
  return `w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
    canEdit ? 'bg-white' : 'bg-slate-50 text-slate-600'
  }`;
}
