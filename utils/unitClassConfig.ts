import { UnitClass } from '../types';

export type UnitDetailTab =
  | 'personnel'
  | 'logistics'
  | 'management'
  | 'overview'
  | 'blueprint'
  | 'requests'
  | 'documents'
  | 'compensation'
  | 'attendance'
  | 'vacations'
  | 'contacts'
  | 'banks';

const BPO_ONLY_TABS: UnitDetailTab[] = ['contacts', 'banks'];

export const UNIT_CLASS_LABELS: Record<UnitClass, string> = {
  STANDARD: 'Operaciones',
  BPO: 'BPO',
};

export const UNIT_CLASS_DESCRIPTIONS: Record<UnitClass, string> = {
  STANDARD: 'Servicios operativos de campo: seguridad, limpieza, mantenimiento, etc.',
  BPO: 'Servicios administrativos: planilla, contabilidad, bienestar social y otros.',
};

const HIDDEN_TABS_BY_CLASS: Record<UnitClass, UnitDetailTab[]> = {
  STANDARD: [],
  BPO: ['logistics', 'blueprint'],
};

const TAB_LABELS_BY_CLASS: Partial<Record<UnitClass, Partial<Record<UnitDetailTab, string>>>> = {
  BPO: {
    management: 'Actividades y Seguimiento',
  },
};

const MANAGEMENT_SECTION_LABELS: Record<UnitClass, { title: string; subtitle: string }> = {
  STANDARD: {
    title: 'Supervisión y Bitácora',
    subtitle: 'Registro de eventos, incidencias y visitas.',
  },
  BPO: {
    title: 'Actividades y Seguimiento',
    subtitle: 'Registro de actividades, incidencias y seguimiento de servicios.',
  },
};

export function resolveUnitClass(unitClass?: UnitClass): UnitClass {
  return unitClass === 'BPO' ? 'BPO' : 'STANDARD';
}

export function isTabVisibleForUnitClass(tab: UnitDetailTab, unitClass?: UnitClass): boolean {
  const resolved = resolveUnitClass(unitClass);
  if (BPO_ONLY_TABS.includes(tab)) {
    return resolved === 'BPO';
  }
  return !HIDDEN_TABS_BY_CLASS[resolved].includes(tab);
}

export function getTabLabelForUnitClass(tab: UnitDetailTab, unitClass?: UnitClass): string {
  const resolved = resolveUnitClass(unitClass);
  const override = TAB_LABELS_BY_CLASS[resolved]?.[tab];
  if (override) return override;

  const defaults: Record<UnitDetailTab, string> = {
    overview: 'General',
    personnel: 'Personal',
    attendance: 'Asistencia',
    vacations: 'Vacaciones',
    compensation: 'Variables',
    logistics: 'Logística',
    management: 'Supervisión',
    blueprint: 'Plano',
    requests: 'Requerimientos',
    documents: 'Documentos',
    contacts: 'Contactos',
    banks: 'Bancos',
  };

  return defaults[tab];
}

export function getManagementSectionLabels(unitClass?: UnitClass) {
  return MANAGEMENT_SECTION_LABELS[resolveUnitClass(unitClass)];
}

export function isNightSupervisionVisibleForUnitClass(unitClass?: UnitClass): boolean {
  return resolveUnitClass(unitClass) === 'STANDARD';
}

export function getDefaultUnitDescription(unitClass?: UnitClass): string {
  return resolveUnitClass(unitClass) === 'BPO'
    ? 'Unidad BPO. Configure el personal y los servicios administrativos a monitorear.'
    : 'Nueva unidad registrada. Configure zonas y recursos.';
}
