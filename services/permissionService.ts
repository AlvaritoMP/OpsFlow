
import { AppFeature, PermissionConfig, UserRole } from "../types";

const PERMISSION_STORAGE_KEY = 'OPSFLOW_PERMISSIONS';

const DEFAULT_PERMISSIONS: PermissionConfig = {
  ADMIN: {
    DASHBOARD: { view: true, edit: true },
    UNIT_OVERVIEW: { view: true, edit: true },
    PERSONNEL: { view: true, edit: true },
    LOGISTICS: { view: true, edit: true },
    LOGS: { view: true, edit: true },
    BLUEPRINT: { view: true, edit: true },
    CONTROL_CENTER: { view: true, edit: true },
    SETTINGS: { view: true, edit: true },
  },
  OPERATIONS: {
    DASHBOARD: { view: true, edit: false },
    UNIT_OVERVIEW: { view: true, edit: true },
    PERSONNEL: { view: true, edit: true },
    LOGISTICS: { view: true, edit: true },
    LOGS: { view: true, edit: true },
    BLUEPRINT: { view: true, edit: true },
    CONTROL_CENTER: { view: true, edit: true },
    SETTINGS: { view: false, edit: false },
  },
  CLIENT: {
    DASHBOARD: { view: true, edit: false },
    UNIT_OVERVIEW: { view: true, edit: false },
    PERSONNEL: { view: true, edit: false },
    LOGISTICS: { view: true, edit: false },
    LOGS: { view: true, edit: false }, // Can see logs but not edit
    BLUEPRINT: { view: true, edit: false },
    CONTROL_CENTER: { view: false, edit: false },
    SETTINGS: { view: false, edit: false },
  }
};

export const getPermissions = (): PermissionConfig => {
  try {
    const stored = localStorage.getItem(PERMISSION_STORAGE_KEY);
    if (stored) {
      // Merge with default to ensure new features are covered
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_PERMISSIONS, ...parsed };
    }
  } catch (e) {
    console.error("Error loading permissions", e);
  }
  return DEFAULT_PERMISSIONS;
};

export const savePermissions = (config: PermissionConfig) => {
  localStorage.setItem(PERMISSION_STORAGE_KEY, JSON.stringify(config));
};

export const checkPermission = (role: UserRole, feature: AppFeature, action: 'view' | 'edit'): boolean => {
  const config = getPermissions();
  const roleConfig = config[role];
  if (!roleConfig) return false;
  
  const featureConfig = roleConfig[feature];
  if (!featureConfig) return false;

  return featureConfig[action];
};

export const FEATURE_LABELS: Record<AppFeature, string> = {
  DASHBOARD: 'Dashboard Principal',
  UNIT_OVERVIEW: 'Detalle Unidad (General)',
  PERSONNEL: 'Gestión de Personal',
  LOGISTICS: 'Logística (Equipos/Mat)',
  LOGS: 'Bitácora y Eventos',
  BLUEPRINT: 'Planos y Mapas',
  CONTROL_CENTER: 'Centro de Control',
  SETTINGS: 'Configuración Sistema'
};
