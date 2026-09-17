import type { Resource, WorkerSnapshotExperiencia } from '../types';
import { hydrateComplementaryFromSnapshot } from './complementaryHydrate';

export function formatAgeFromBirthDate(birthDate?: string | null): string {
  if (!birthDate) return '';
  const match = String(birthDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return '';

  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) age -= 1;
  if (age < 0 || age > 120) return '';
  return `${age} años`;
}

export function formatOpaloTenure(startDate?: string | null): string {
  if (!startDate) return '';
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return '';

  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;

  if (months < 1) return 'Recién incorporado';
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return rem === 1 ? '1 mes' : `${rem} meses`;
  if (rem === 0) return years === 1 ? '1 año' : `${years} años`;
  const yearLabel = years === 1 ? '1 año' : `${years} años`;
  const monthLabel = rem === 1 ? '1 mes' : `${rem} meses`;
  return `${yearLabel} y ${monthLabel}`;
}

function formatExperienceEntry(entry: WorkerSnapshotExperiencia): string {
  const role = (entry.puesto || '').trim();
  const company = (entry.empresa || '').trim();
  const start = (entry.fechaIngreso || '').trim();
  const end = (entry.fechaCese || '').trim();
  const head = [role, company].filter(Boolean).join(' en ');
  const dates = [start, end].filter(Boolean).join(' – ');
  if (head && dates) return `${head} (${dates})`;
  return head || dates;
}

export function formatExperienceFromResource(resource: Resource): string {
  const snapshot = resource.inboundSourceData?.workerSnapshot;
  const complementary = hydrateComplementaryFromSnapshot(snapshot, snapshot?.complementary ?? null);
  const list = complementary.experienciaLaboral || [];
  return list.map(formatExperienceEntry).filter(Boolean).join('\n');
}

export function formatZones(resource: Resource): string {
  const zones = (resource.assignedZones || []).map((z) => z.trim()).filter(Boolean);
  return zones.join(', ');
}

export function newCustomSectionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function safeUnitBookFilename(unitName: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const part = (unitName || 'unidad')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
  return `UnitBook_${part || 'unidad'}_${stamp}.pdf`;
}
