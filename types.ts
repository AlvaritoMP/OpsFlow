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

export type UserRole = 'ADMIN' | 'OPERATIONS' | 'CLIENT';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

export interface OperationalLog {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'Supervision' | 'Capacitacion' | 'Incidencia' | 'Visita Cliente' | 'Coordinacion' | 'Mantenimiento';
  description: string;
  author: string;
  images?: string[]; // Evidence photos
}

export interface Training {
  id: string;
  topic: string;
  date: string;
  status: 'Completado' | 'Programado' | 'Vencido';
  score?: number; // Optional evaluation score
  certificateUrl?: string;
}

export interface Resource {
  id: string;
  name: string;
  type: ResourceType;
  quantity: number; // For materials
  unitOfMeasure?: string; // e.g., "Litros", "Cajas", "Unidad"
  status?: StaffStatus | string; // Specific to personnel or machine condition
  assignedZone?: string; // Which specific zone inside the unit
  assignedShift?: string; // Morning, Afternoon, Night
  compliancePercentage?: number; // Daily/Monthly compliance
  lastRestock?: string; // For materials
  nextMaintenance?: string; // For machines
  trainings?: Training[]; // Specific for personnel
  image?: string; // Photo of the resource (equipment/material/person)
}

export interface Zone {
  id: string;
  name: string; // e.g., "Lobby", "Piso 1", "Exteriores"
  shifts: string[]; // e.g., ["Turno Mañana", "Turno Tarde"]
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
  resources: Resource[];
  logs: OperationalLog[];
  complianceHistory: { month: string; score: number }[];
}