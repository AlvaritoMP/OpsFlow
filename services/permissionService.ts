
import { AppFeature, PermissionConfig, UserRole } from "../types";

const PERMISSION_STORAGE_KEY = 'OPSFLOW_PERMISSIONS';

const DEFAULT_PERMISSIONS: PermissionConfig = {
  SUPER_ADMIN: {
    DASHBOARD: { view: true, edit: true },
    UNIT_OVERVIEW: { view: true, edit: true },
    PERSONNEL: { view: true, edit: true },
    LOGISTICS: { view: true, edit: true },
    LOGS: { view: true, edit: true },
    BLUEPRINT: { view: true, edit: true },
    CONTROL_CENTER: { view: true, edit: true },
    REPORTS: { view: true, edit: true },
    CLIENT_REQUESTS: { view: true, edit: true },
    SETTINGS: { view: true, edit: true },
  },
  ADMIN: {
    DASHBOARD: { view: true, edit: true },
    UNIT_OVERVIEW: { view: true, edit: true },
    PERSONNEL: { view: true, edit: true },
    LOGISTICS: { view: true, edit: true },
    LOGS: { view: true, edit: true },
    BLUEPRINT: { view: true, edit: true },
    CONTROL_CENTER: { view: true, edit: true },
    REPORTS: { view: true, edit: true },
    CLIENT_REQUESTS: { view: true, edit: true }, // Admin can view and edit (resolve)
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
    REPORTS: { view: true, edit: true },
    CLIENT_REQUESTS: { view: true, edit: true }, // Ops can view and edit (resolve)
    SETTINGS: { view: false, edit: false },
  },
  OPERATIONS_SUPERVISOR: {
    DASHBOARD: { view: true, edit: false },
    UNIT_OVERVIEW: { view: true, edit: true },
    PERSONNEL: { view: true, edit: true },
    LOGISTICS: { view: true, edit: true },
    LOGS: { view: true, edit: true },
    BLUEPRINT: { view: true, edit: true },
    CONTROL_CENTER: { view: true, edit: true },
    REPORTS: { view: true, edit: true },
    CLIENT_REQUESTS: { view: true, edit: true },
    SETTINGS: { view: false, edit: false },
  },
  CLIENT: {
    DASHBOARD: { view: true, edit: false },
    UNIT_OVERVIEW: { view: true, edit: false },
    PERSONNEL: { view: true, edit: false },
    LOGISTICS: { view: true, edit: false },
    LOGS: { view: true, edit: false }, 
    BLUEPRINT: { view: true, edit: false },
    CONTROL_CENTER: { view: false, edit: false },
    REPORTS: { view: true, edit: false }, 
    CLIENT_REQUESTS: { view: true, edit: true }, // Client can View and Edit (Create)
    SETTINGS: { view: false, edit: false },
  }
};

export const getPermissions = (): PermissionConfig => {
  try {
    const stored = localStorage.getItem(PERMISSION_STORAGE_KEY);
    if (stored) {
      // Merge with default to ensure new features are covered
      const parsed = JSON.parse(stored);
      // Ensure new roles are merged if they didn't exist in storage
      return { ...DEFAULT_PERMISSIONS, ...parsed };
    }
  } catch (e) {
    console.error("Error loading permissions", e);
  }
  return DEFAULT_PERMISSIONS;
};

export const savePermissions = (config: PermissionConfig) => {
  try {
    // Validar que el config sea un objeto válido
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid permission config: config must be an object');
    }

    // Serializar y validar
    const serialized = JSON.stringify(config);
    if (!serialized || serialized === '{}') {
      throw new Error('Failed to serialize permission config');
    }

    // Guardar en localStorage
    localStorage.setItem(PERMISSION_STORAGE_KEY, serialized);
  } catch (error) {
    console.error('Error saving permissions:', error);
    throw error; // Re-lanzar para que el componente pueda manejarlo
  }
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
  REPORTS: 'Informes y Analítica',
  CLIENT_REQUESTS: 'Requerimientos Cliente', // New Label
  SETTINGS: 'Configuración Sistema'
};