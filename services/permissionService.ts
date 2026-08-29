
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
    HEADCOUNT: { view: true, edit: true },
    POSITIONS_MANAGEMENT: { view: true, edit: true },
    NIGHT_SUPERVISION: { view: true, edit: true },
    SUPERVISION_PLANNING: { view: true, edit: true },
    RETENES: { view: true, edit: true },
    VACATIONS: { view: true, edit: true },
    ASSETS_CATALOG: { view: true, edit: true },
    INVENTORY: { view: true, edit: true },
    DOCUMENTS: { view: true, edit: true },
    ARCHIVE: { view: true, edit: true },
    SETTINGS: { view: true, edit: true },
    ATS_RECEPTION: { view: true, edit: true },
    HR_OPALOSIS: { view: true, edit: true },
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
    CLIENT_REQUESTS: { view: true, edit: true },
    HEADCOUNT: { view: true, edit: true },
    POSITIONS_MANAGEMENT: { view: true, edit: true },
    NIGHT_SUPERVISION: { view: true, edit: true },
    SUPERVISION_PLANNING: { view: true, edit: true },
    RETENES: { view: true, edit: true },
    VACATIONS: { view: true, edit: true },
    ASSETS_CATALOG: { view: true, edit: true },
    INVENTORY: { view: true, edit: true },
    DOCUMENTS: { view: true, edit: true },
    ARCHIVE: { view: true, edit: true },
    SETTINGS: { view: true, edit: true },
    ATS_RECEPTION: { view: true, edit: true },
    HR_OPALOSIS: { view: true, edit: true },
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
    CLIENT_REQUESTS: { view: true, edit: true },
    HEADCOUNT: { view: true, edit: false },
    POSITIONS_MANAGEMENT: { view: false, edit: false },
    NIGHT_SUPERVISION: { view: true, edit: true },
    SUPERVISION_PLANNING: { view: true, edit: true },
    RETENES: { view: true, edit: true },
    VACATIONS: { view: true, edit: true },
    ASSETS_CATALOG: { view: true, edit: true },
    INVENTORY: { view: true, edit: true },
    DOCUMENTS: { view: true, edit: true },
    ARCHIVE: { view: true, edit: true },
    SETTINGS: { view: false, edit: false },
    ATS_RECEPTION: { view: true, edit: true },
    HR_OPALOSIS: { view: true, edit: true },
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
    HEADCOUNT: { view: true, edit: false },
    POSITIONS_MANAGEMENT: { view: false, edit: false },
    NIGHT_SUPERVISION: { view: true, edit: true },
    SUPERVISION_PLANNING: { view: true, edit: true },
    RETENES: { view: true, edit: true },
    VACATIONS: { view: true, edit: true },
    ASSETS_CATALOG: { view: true, edit: true },
    INVENTORY: { view: true, edit: true },
    DOCUMENTS: { view: true, edit: true },
    ARCHIVE: { view: true, edit: true },
    SETTINGS: { view: false, edit: false },
    ATS_RECEPTION: { view: true, edit: true },
    HR_OPALOSIS: { view: true, edit: true },
  },
  CLIENT: {
    DASHBOARD: { view: true, edit: false },
    UNIT_OVERVIEW: { view: true, edit: false },
    PERSONNEL: { view: true, edit: false },
    LOGISTICS: { view: true, edit: false },
    LOGS: { view: true, edit: false }, 
    BLUEPRINT: { view: true, edit: false },
    CONTROL_CENTER: { view: true, edit: false },
    REPORTS: { view: true, edit: false }, 
    CLIENT_REQUESTS: { view: true, edit: true },
    HEADCOUNT: { view: true, edit: false },
    POSITIONS_MANAGEMENT: { view: false, edit: false },
    NIGHT_SUPERVISION: { view: false, edit: false },
    SUPERVISION_PLANNING: { view: false, edit: false },
    RETENES: { view: false, edit: false },
    VACATIONS: { view: false, edit: false },
    ASSETS_CATALOG: { view: false, edit: false },
    INVENTORY: { view: false, edit: false },
    DOCUMENTS: { view: true, edit: false },
    ARCHIVE: { view: false, edit: false },
    SETTINGS: { view: false, edit: false },
    ATS_RECEPTION: { view: false, edit: false },
    HR_OPALOSIS: { view: false, edit: false },
  }
};

export const getPermissions = (): PermissionConfig => {
  try {
    const stored = localStorage.getItem(PERMISSION_STORAGE_KEY);
    if (stored) {
      // Merge with default to ensure new features are covered
      const parsed = JSON.parse(stored);
      // Deep merge: for each role, merge default permissions with stored permissions
      // IMPORTANT: Default permissions take precedence to ensure updates are applied
      const merged: PermissionConfig = {} as PermissionConfig;
      
      // First, copy all default roles (defaults take precedence)
      Object.keys(DEFAULT_PERMISSIONS).forEach(role => {
        const roleKey = role as UserRole;
        merged[roleKey] = { ...DEFAULT_PERMISSIONS[roleKey] };
        
        // Then merge stored permissions for this role if they exist
        // But only for features that don't exist in defaults (new features)
        if (parsed[roleKey]) {
          Object.keys(parsed[roleKey]).forEach(feature => {
            const featureKey = feature as AppFeature;
            // Only use stored permission if feature doesn't exist in defaults
            // This ensures default updates always apply
            if (!merged[roleKey][featureKey]) {
              merged[roleKey][featureKey] = parsed[roleKey][featureKey];
            }
          });
        }
      });
      
      // Also include any roles that exist in stored but not in defaults
      Object.keys(parsed).forEach(role => {
        const roleKey = role as UserRole;
        if (!merged[roleKey]) {
          merged[roleKey] = parsed[roleKey];
        }
      });
      
      return merged;
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
  CLIENT_REQUESTS: 'Requerimientos Cliente',
  HEADCOUNT: 'Headcount (Puestos)',
  POSITIONS_MANAGEMENT: 'Gestión de Puestos',
  NIGHT_SUPERVISION: 'Supervisión Nocturna',
  SUPERVISION_PLANNING: 'Supervisión de campo',
  RETENES: 'Retenes',
  VACATIONS: 'Control de Vacaciones',
  ASSETS_CATALOG: 'Catálogo de Activos',
  INVENTORY: 'Inventario',
  DOCUMENTS: 'Documentos',
  ARCHIVE: 'Archivo de Personal',
  SETTINGS: 'Configuración Sistema',
  ATS_RECEPTION: 'Recepción ATS',
  HR_OPALOSIS: 'Envío Opalosis (RRHH)'
};