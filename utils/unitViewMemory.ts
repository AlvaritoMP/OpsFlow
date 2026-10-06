import type { UnitDetailTab } from './unitClassConfig';

const TABS: UnitDetailTab[] = [
  'personnel',
  'logistics',
  'management',
  'overview',
  'blueprint',
  'requests',
  'documents',
  'compensation',
  'attendance',
  'vacations',
  'contacts',
  'banks',
  'unitbook',
];

export interface UnitViewMemory {
  openUnitId: string | null;
  lastUnitId: string | null;
  tab: UnitDetailTab;
  personnelView: 'list' | 'roster';
  detailScroll: number;
  listScroll: number;
}

const emptyMemory = (): UnitViewMemory => ({
  openUnitId: null,
  lastUnitId: null,
  tab: 'overview',
  personnelView: 'list',
  detailScroll: 0,
  listScroll: 0,
});

function storageKey(userId: string): string {
  return `opsflow.unitView.v1:${userId}`;
}

function isTab(value: unknown): value is UnitDetailTab {
  return typeof value === 'string' && (TABS as string[]).includes(value);
}

export function readUnitView(userId: string): UnitViewMemory | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UnitViewMemory>;
    return {
      openUnitId: typeof parsed.openUnitId === 'string' ? parsed.openUnitId : null,
      lastUnitId: typeof parsed.lastUnitId === 'string' ? parsed.lastUnitId : null,
      tab: isTab(parsed.tab) ? parsed.tab : 'overview',
      personnelView: parsed.personnelView === 'roster' ? 'roster' : 'list',
      detailScroll: Number.isFinite(parsed.detailScroll) ? Number(parsed.detailScroll) : 0,
      listScroll: Number.isFinite(parsed.listScroll) ? Number(parsed.listScroll) : 0,
    };
  } catch {
    return null;
  }
}

export function patchUnitView(userId: string, patch: Partial<UnitViewMemory>): UnitViewMemory {
  const next: UnitViewMemory = { ...(readUnitView(userId) ?? emptyMemory()), ...patch };
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    /* el navegador puede bloquear el almacenamiento; la sesión igual conserva el estado en memoria */
  }
  return next;
}
