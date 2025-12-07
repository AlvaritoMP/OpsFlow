
export enum ResourceType {
  PERSONNEL = 'Personal',
  EQUIPMENT = 'Equipos/Maquinaria',
  MATERIAL = 'Materiales/Insumos',
}

export enum UnitStatus {
  ACTIVE = 'Activo',
  PENDING = 'Pendiente',
  ISSUE = 'Con Incidencias',
}

export enum StaffStatus {
  ACTIVE = 'Activo',
  ON_LEAVE = 'De Licencia',
  REPLACED = 'Reemplazo Temporal',
}

export type UserRole = 'ADMIN' | 'OPERATIONS' | 'OPERATIONS_SUPERVISOR' | 'CLIENT';
export type ManagementRole = 'COORDINATOR' | 'RESIDENT_SUPERVISOR' | 'ROVING_SUPERVISOR';

// --- PERMISSIONS SYSTEM ---
export type AppFeature = 
  | 'DASHBOARD' 
  | 'UNIT_OVERVIEW' 
  | 'PERSONNEL' 
  | 'LOGISTICS' 
  | 'LOGS' 
  | 'BLUEPRINT' 
  | 'CONTROL_CENTER' 
  | 'REPORTS' 
  | 'CLIENT_REQUESTS' // New Feature
  | 'SETTINGS';

export interface PermissionRule {
  view: boolean;
  edit: boolean;
}

export type RolePermissions = {
  [key in AppFeature]: PermissionRule;
};

export type PermissionConfig = {
  [role in UserRole]: RolePermissions;
};
// --------------------------

export interface InventoryApiConfig {
  baseUrl: string;
  apiKey: string;
  useMock: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  linkedClientNames?: string[]; // Changed to array: Links user to specific Client Companies (client names)
  linkedClientIds?: string[]; // Array of client IDs for more precise linking
  password?: string; // Contraseña (solo para crear/actualizar, nunca se retorna)
  password_hash?: string; // Hash de la contraseña (solo para comparación interna)
}

export type StaffStatus = 'activo' | 'cesado';

export interface ManagementStaff {
  id: string;
  name: string;
  role: ManagementRole;
  email?: string;
  phone?: string;
  photo?: string;
  dni?: string; // Documento Nacional de Identidad
  startDate?: string; // Fecha de inicio de labores (YYYY-MM-DD)
  endDate?: string; // Fecha de fin de labores (YYYY-MM-DD)
  status?: StaffStatus; // Estado: activo o cesado
  archived?: boolean; // Si está archivado (no se muestra en vista normal)
}

export interface OperationalLog {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'Supervision' | 'Capacitacion' | 'Incidencia' | 'Visita Cliente' | 'Coordinacion' | 'Mantenimiento';
  description: string;
  author: string;
  images?: string[]; // Evidence photos
  responsibleIds?: string[]; // IDs of Personnel or ManagementStaff responsible for this event
}

export interface RequestComment {
  id: string;
  author: string; // Name of user
  role: UserRole;
  date: string; // ISO String
  text: string;
}

export interface ClientRequest {
  id: string;
  date: string;
  category: 'PERSONNEL' | 'LOGISTICS' | 'GENERAL';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED';
  description: string;
  author: string; // User name (Client)
  attachments?: string[]; // Photos uploaded by client upon creation
  relatedResourceId?: string; // Optional: ID of specific worker or equipment involved
  
  // Resolution & Thread
  response?: string; // Admin main response/solution summary
  responseAttachments?: string[]; // Admin response evidence (photos, docs)
  resolvedDate?: string;
  
  comments?: RequestComment[]; // Discussion thread
}

export interface Training {
  id: string;
  topic: string;
  date: string;
  status: 'Completado' | 'Programado' | 'Vencido';
  score?: number; // Optional evaluation score
  certificateUrl?: string;
}

export interface AssignedAsset {
  id: string;
  name: string; // e.g., "Laptop Dell", "Botas Seguridad", "Uniforme Verano"
  type: 'EPP' | 'Uniforme' | 'Tecnologia' | 'Herramienta' | 'Otro';
  dateAssigned: string;
  serialNumber?: string;
  notes?: string;
}

export interface MaintenanceRecord {
  id: string;
  date: string;
  type: 'Preventivo' | 'Correctivo' | 'Supervision' | 'Calibracion';
  description: string;
  technician: string; // Quien realizo el trabajo
  cost?: number;
  status: 'Realizado' | 'Programado';
  nextScheduledDate?: string; // Optional update for the main resource
  responsibleIds?: string[]; // IDs of Personnel or ManagementStaff involved
  images?: string[]; // Evidence photos for maintenance
}

// --- ROSTERING TYPES ---
export type ShiftType = 'Day' | 'Night' | 'OFF' | 'Vacation' | 'Sick';

export interface DailyShift {
    date: string; // YYYY-MM-DD
    type: ShiftType;
    hours: number;
}
// -----------------------

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  quantity: number; // For materials
  unitOfMeasure?: string; // e.g., "Litros", "Cajas", "Unidad"
  status?: StaffStatus | string; // Specific to personnel or machine condition
  assignedZones?: string[]; // Changed to array: Which specific zones inside the unit
  assignedShift?: string; // Morning, Afternoon, Night
  compliancePercentage?: number; // Daily/Monthly compliance
  lastRestock?: string; // For materials
  nextMaintenance?: string; // For machines
  trainings?: Training[]; // Specific for personnel
  assignedAssets?: AssignedAsset[]; // Inventory assigned to this worker
  workSchedule?: DailyShift[]; // ROSTERING DATA
  maintenanceHistory?: MaintenanceRecord[]; // Specific for Equipment history
  image?: string; // Photo of the resource (equipment/material/person)
  
  // Integration Fields
  externalId?: string; // SKU or External ID from Inventory App
  lastSync?: string; // Timestamp of last sync
  
  // Personnel-specific fields (only for type = PERSONNEL)
  dni?: string; // Documento Nacional de Identidad
  startDate?: string; // Fecha de inicio de labores (YYYY-MM-DD)
  endDate?: string; // Fecha de fin de labores (YYYY-MM-DD)
  personnelStatus?: 'activo' | 'cesado'; // Estado: activo o cesado (solo para personal)
  archived?: boolean; // Si está archivado (no se muestra en vista normal)
}

export interface ZoneLayout {
  x: number; // Grid column start (1-12)
  y: number; // Grid row start (1-12)
  w: number; // Width (cols span)
  h: number; // Height (rows span)
  color: string; // Hex or tailwind class
  layerId?: string; // ID of the blueprint layer/page
}

export interface Zone {
  id: string;
  name: string; // e.g., "Lobby", "Piso 1", "Exteriores"
  shifts: string[]; // e.g., ["Turno Mañana", "Turno Tarde"]
  area?: number; // Square meters
  layout?: ZoneLayout; // Visual map representation
}

export interface BlueprintLayer {
  id: string;
  name: string; // e.g. "Piso 1", "Sótano", "Exteriores"
}

export interface ClientRepresentative {
  name: string;
  phone: string;
  email: string;
}

export interface Client {
  id: string;
  name: string; // Nombre del cliente/empresa
  ruc: string; // RUC del cliente
  representatives: ClientRepresentative[]; // Array de representantes con teléfono y email
  created_at?: string;
  updated_at?: string;
}

export interface UnitContact {
  id?: string; // Link to ManagementStaff id
  name: string;
  photo?: string;
  phone?: string;
  email?: string;
}

export interface Unit {
  id: string;
  name: string;
  clientName: string;
  address: string;
  status: UnitStatus;
  description?: string; // Brief description of operations
  images: string[]; // Array of image URLs. Index 0 is cover.
  zones: Zone[];
  blueprintLayers?: BlueprintLayer[]; // Multi-page support
  resources: Resource[];
  logs: OperationalLog[];
  requests: ClientRequest[]; // New field for Client Requests
  complianceHistory: { month: string; score: number }[];
  
  // Management Team
  coordinator?: UnitContact;
  rovingSupervisor?: UnitContact; // Supervisor de Ronda
  residentSupervisor?: UnitContact; // Supervisor Residente
}
