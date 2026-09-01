
export enum ResourceType {
  PERSONNEL = 'Personal',
  EQUIPMENT = 'Equipos/Maquinaria',
  MATERIAL = 'Materiales/Insumos',
}

export enum UnitStatus {
  ACTIVE = 'Activo',
  PENDING = 'Pendiente',
  ISSUE = 'Con Incidencias',
  DEACTIVATED = 'Desactivado',
}

/** Clase de unidad: operaciones de campo vs servicios BPO (payroll, contabilidad, etc.) */
export type UnitClass = 'STANDARD' | 'BPO';

export enum StaffStatus {
  ACTIVE = 'Activo',
  ON_LEAVE = 'De Licencia',
  REPLACED = 'Reemplazo Temporal',
}

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'OPERATIONS' | 'OPERATIONS_SUPERVISOR' | 'CLIENT';
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
  | 'CLIENT_REQUESTS'
  | 'HEADCOUNT'
  | 'POSITIONS_MANAGEMENT'
  | 'NIGHT_SUPERVISION'
  | 'SUPERVISION_PLANNING'
  | 'RETENES'
  | 'VACATIONS'
  | 'ASSETS_CATALOG'
  | 'INVENTORY'
  | 'DOCUMENTS'
  | 'ARCHIVE'
  | 'SETTINGS'
  | 'ATS_RECEPTION'
  | 'HR_OPALOSIS';

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

export type StaffStatus = 'activo' | 'cesado' | 'archivado';

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
  title?: string; // Título del requerimiento
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
  phoneNumber?: string; // Número telefónico cuando aplica (ej: celular corporativo)
  notes?: string;
  constancyCode?: string; // Código correlativo de constancia
  constancyGeneratedAt?: string; // Fecha de generación de constancia
  standardAssetId?: string; // ID del activo estándar del catálogo (opcional)
}

export interface StandardAsset {
  id: string;
  name: string; // Nombre estándar del activo
  type: 'EPP' | 'Uniforme' | 'Tecnologia' | 'Herramienta' | 'Otro';
  description?: string;
  defaultSerialNumberPrefix?: string; // Prefijo para números de serie
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface DeliveryConstancy {
  id: string;
  code: string; // Código correlativo único
  type: 'ASSET' | 'EQUIPMENT'; // Tipo de constancia: activo asignado o maquinaria
  workerId?: string; // ID del trabajador (para activos)
  workerName: string;
  workerDni: string;
  unitId: string;
  unitName: string;
  items: ConstancyItem[]; // Items entregados
  date: string; // Fecha de entrega
  generatedAt: string; // Fecha de generación de la constancia
  generatedBy?: string; // Usuario que generó la constancia
}

export interface ConstancyItem {
  name: string;
  type: string; // Tipo de item (EPP, Uniforme, Tecnologia, Herramienta, Equipo, Maquinaria, etc.)
  serialNumber?: string;
  quantity?: number;
  condition?: string; // Estado del item al momento de entrega
  dateAssigned?: string; // Fecha de entrega del ítem (yyyy-MM-dd), la que colocó el usuario
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
export type ShiftType = 'Day' | 'Afternoon' | 'Night' | 'OFF' | 'Vacation' | 'Sick';

export interface DailyShift {
    date: string; // YYYY-MM-DD
    type: ShiftType;
    hours: number;
    /** Hora de entrada HH:mm (dentro de la franja Día/Tarde/Noche) */
    startTime?: string;
    /** Hora de salida HH:mm; puede ser al día siguiente (turno que cruza medianoche) */
    endTime?: string;
    /**
     * Vacaciones: true = hay operador de reemplazo (las horas se muestran cubiertas).
     * false/omitido = sin reemplazo (horas vacías). Se persiste con hours + start/end.
     */
    hasCoverage?: boolean;
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
  /** Snapshot ATS + trazabilidad al registrar desde Recepción ATS */
  inboundSourceData?: ResourceInboundSourceData;
  
  // Personnel-specific fields (only for type = PERSONNEL)
  dni?: string; // DNI, CE o pasaporte (puede incluir letras)
  /** Lugar de residencia o localidad de referencia del trabajador (ej. distrito, ciudad) */
  localidad?: string;
  /** Teléfono de contacto del trabajador */
  phone?: string;
  /** Correo electrónico de contacto del trabajador */
  email?: string;
  puesto?: string; // Puesto o cargo del trabajador
  birthDate?: string; // Fecha de nacimiento (YYYY-MM-DD)
  startDate?: string; // Fecha de inicio de la relación laboral (YYYY-MM-DD): primer contrato; no se actualiza en renovaciones
  endDate?: string; // Fecha de fin del último contrato (YYYY-MM-DD); referencial para monitoreo, NO archiva automáticamente
  personnelStatus?: 'activo' | 'cesado' | 'archivado'; // Estado: activo, cesado (despido) o archivado (fin de contrato)
  archived?: boolean; // Si está archivado (no se muestra en vista normal)
  contractHistory?: ContractHistory[]; // Historial de contratos y renovaciones
  inTraining?: boolean; // Si está en periodo de capacitación
  trainingStartDate?: string; // Fecha de inicio de capacitación (YYYY-MM-DD)
  contractGenerated?: boolean; // Si ya se generó el contrato de trabajo (resuelve la alerta)
  isShared?: boolean; // Si el trabajador es compartido entre múltiples unidades (true) o único (false). Por defecto false (único)
  monthlySalary?: number; // Salario bruto mensual del trabajador
  workConditionAmount?: number; // Monto adicional por condición de trabajo
  /** Días habituales de trabajo (Lunes…Domingo) definidos al ingreso / presentación */
  workDays?: string[];
  /** Hora de entrada habitual HH:mm */
  entryTime?: string;
  /** Hora de salida habitual HH:mm */
  exitTime?: string;
  /** Full Time | Part Time | 12 horas */
  jornadaType?: string;
  /** General | Pyme | Mype */
  laborRegime?: string;
  /** Bono de movilidad (S/) */
  mobilityBonus?: number;
  /** Si corresponde asignación familiar */
  familyAllowance?: boolean;
  salaryIncrements?: SalaryIncrement[]; // Historial de incrementos salariales
  /** Unidad actual del recurso (FK resources.unit_id) */
  unitId?: string;
}

export interface SalaryIncrement {
  id: string;
  resourceId: string;
  previousSalary: number;
  newSalary: number;
  incrementDate: string; // Fecha en que se registró el incremento (YYYY-MM-DD)
  effectiveDate: string; // Fecha de aplicación del incremento (YYYY-MM-DD)
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VariableCompensation {
  id: string;
  unitId: string;
  resourceId: string;
  periodMonth: string; // YYYY-MM
  amount: number;
  concept: string;
  paymentDate?: string; // YYYY-MM-DD
  notes?: string;
  source: 'manual' | 'import';
  createdAt: string;
  updatedAt: string;
}

export interface ContractHistory {
  id: string;
  resourceId: string;
  contractNumber: number; // 1 = contrato inicial, 2+ = renovaciones
  startDate: string; // Fecha de inicio del contrato (YYYY-MM-DD)
  endDate: string; // Fecha de fin del contrato (YYYY-MM-DD)
  status: 'activo' | 'finalizado' | 'renovado'; // Estado del contrato
  notes?: string;
  monthlySalary?: number; // Salario bruto mensual vigente en este contrato
  workConditionAmount?: number; // Condición de trabajo vigente en este contrato
  createdAt: string;
  updatedAt: string;
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

export interface UnitDocument {
  id: string;
  name: string; // Nombre del documento
  description?: string; // Descripción opcional
  fileUrl: string; // URL del archivo en Supabase Storage
  fileName: string; // Nombre original del archivo
  fileSize: number; // Tamaño del archivo en bytes
  mimeType: string; // Tipo MIME del archivo
  uploadedAt: string; // Fecha de carga
  uploadedBy?: string; // ID del usuario que subió el documento
}

// ============================================
// POSICIONES/PUESTOS PREDEFINIDOS
// ============================================

export interface Position {
  id: string;
  name: string; // Nombre del puesto (ej: "Supervisor", "Operario de Limpieza", "Seguridad")
  description?: string; // Descripción opcional del puesto
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface RequiredPosition {
  positionId: string; // ID del puesto predefinido
  positionName?: string; // Nombre del puesto (cached para evitar joins)
  quantity: number; // Cantidad requerida
  shift?: string; // Turno requerido: 'Day', 'Afternoon', 'Night', o undefined para cualquier turno
}

/** Metadatos de Headcount por puesto (preventivo FDM, observaciones, etc.) — criterio operativo del usuario */
export interface HeadcountPositionMeta {
  positionId: string;
  preventivo?: {
    Day?: number;
    Afternoon?: number;
    Night?: number;
  };
  observaciones?: string;
}

export interface Unit {
  id: string;
  name: string;
  clientName: string;
  address: string;
  status: UnitStatus;
  /** STANDARD = unidades operativas de campo; BPO = servicios administrativos (payroll, contabilidad, etc.) */
  unitClass?: UnitClass;
  description?: string; // Brief description of operations
  images: string[]; // Array of image URLs. Index 0 is cover.
  zones: Zone[];
  blueprintLayers?: BlueprintLayer[]; // Multi-page support
  resources: Resource[];
  logs: OperationalLog[];
  requests: ClientRequest[]; // New field for Client Requests
  complianceHistory: { month: string; score: number }[];
  
  // Location coordinates
  latitude?: number; // Latitud de la ubicación de la unidad
  longitude?: number; // Longitud de la ubicación de la unidad
  
  // Management Team
  coordinator?: UnitContact;
  rovingSupervisor?: UnitContact; // Supervisor de Ronda
  residentSupervisor?: UnitContact; // Supervisor Residente
  assignedStaff?: string[]; // Array de IDs de management staff asignados a esta unidad
  
  // Documents
  documents?: UnitDocument[]; // Documentos relacionados al servicio
  
  // Required Positions
  requiredPositions?: RequiredPosition[]; // Puestos requeridos en la unidad

  /** Metadatos de Headcount por cargo (preventivo FDM editable, observaciones) */
  headcountMeta?: HeadcountPositionMeta[];
}

// ============================================
// BPO: CONTACTOS Y BANCOS
// ============================================

export type BpoContactCategory = 'client' | 'provider' | 'support' | 'other';

export interface BpoUnitContact {
  id: string;
  unitId: string;
  category: BpoContactCategory;
  name: string;
  phone?: string;
  email?: string;
  organization?: string;
  roleTitle?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type BpoBankAccountType = 'own' | 'provider' | 'detraction';
export type BpoCurrency = 'PEN' | 'USD' | 'EUR' | 'OTHER';

export interface BpoBankAccount {
  id: string;
  unitId: string;
  accountType: BpoBankAccountType;
  bankName: string;
  accountHolderName?: string;
  accountNumber?: string;
  interbankAccount?: string;
  currency: BpoCurrency;
  currencyOther?: string;
  swiftCode?: string;
  providerName?: string;
  executiveName?: string;
  executivePhone?: string;
  executiveEmail?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BpoBankStatement {
  id: string;
  unitId: string;
  bankAccountId: string;
  label: string;
  periodMonth?: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  uploadedAt: string;
  uploadedBy?: string;
}

// ============================================
// BPO: EXPEDIENTE AMPLIADO DE PERSONAL
// ============================================

export type BpoMaritalStatus =
  | 'soltero'
  | 'casado'
  | 'conviviente'
  | 'divorciado'
  | 'viudo'
  | 'otro';

export type BpoEducationLevel =
  | 'sin_estudios'
  | 'primaria'
  | 'secundaria'
  | 'tecnico'
  | 'universitario_incompleto'
  | 'universitario_completo'
  | 'postgrado'
  | 'otro';

export type BpoDependentRelationship =
  | 'conyuge'
  | 'hijo'
  | 'hija'
  | 'padre'
  | 'madre'
  | 'hermano'
  | 'hermana'
  | 'otro';

export type BpoPersonnelDocumentCategory =
  | 'dni_trabajador'
  | 'dni_familiar'
  | 'constancia'
  | 'afp'
  | 'educacion'
  | 'otro';

export interface BpoPersonnelProfile {
  resourceId: string;
  unitId: string;
  nationality?: string;
  address?: string;
  maritalStatus?: BpoMaritalStatus;
  gender?: string;
  afpName?: string;
  afpAffiliationDate?: string;
  afpEmail?: string;
  afpCuspp?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  educationLevel?: BpoEducationLevel;
  educationInstitution?: string;
  educationCareer?: string;
  educationCompletionYear?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BpoPersonnelDependent {
  id: string;
  resourceId: string;
  unitId: string;
  relationship: BpoDependentRelationship;
  fullName: string;
  documentType?: string;
  documentNumber?: string;
  birthDate?: string;
  isDependent: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BpoPersonnelDocument {
  id: string;
  resourceId: string;
  unitId: string;
  dependentId?: string;
  category: BpoPersonnelDocumentCategory;
  name: string;
  description?: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  uploadedAt: string;
  uploadedBy?: string;
}

// ============================================
// RETENES (Trabajadores de cobertura)
// ============================================

export interface Reten {
  id: string;
  name: string;
  dni: string;
  phone: string;
  email?: string;
  photo?: string; // URL de la foto del retén
  status: 'disponible' | 'asignado' | 'no_disponible';
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface RetenAssignment {
  id: string;
  reten_id: string;
  reten_name?: string;
  reten_phone?: string;
  unit_id: string;
  unit_name: string;
  assignment_date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  assignment_type: 'planificada' | 'inmediata';
  reason?: string;
  status: 'programada' | 'en_curso' | 'completada' | 'cancelada';
  constancy_code?: string;
  constancy_generated_at?: string;
  whatsapp_sent: boolean;
  whatsapp_sent_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

// ============================================
// SUPERVISIÓN NOCTURNA
// ============================================

export interface NightSupervisionShift {
  id: string;
  date: string; // YYYY-MM-DD
  unit_id: string;
  unit_name: string;
  supervisor_id: string; // ID del supervisor que realiza la supervisión
  supervisor_name: string;
  shift_start: string; // HH:mm
  shift_end: string; // HH:mm
  status: 'en_curso' | 'completada' | 'incompleta' | 'cancelada';
  completion_percentage: number; // 0-100
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface NightSupervisionCall {
  id: string;
  shift_id: string;
  worker_id: string; // ID del trabajador (resource de tipo PERSONNEL)
  worker_name: string;
  worker_phone: string;
  call_number: 1 | 2 | 3; // Primera, segunda o tercera llamada
  scheduled_time: string; // HH:mm - hora programada de la llamada
  actual_time?: string; // HH:mm - hora real en que se hizo la llamada
  answered: boolean; // Si el trabajador contestó
  photo_received: boolean; // Si se recibió la foto del trabajador
  photo_url?: string; // URL de la foto recibida
  photo_timestamp?: string; // Fecha y hora de la foto (extraída de la foto)
  on_rest?: boolean; // Si el trabajador está en descanso ese día
  notes?: string; // Novedades o observaciones del supervisor
  non_conformity?: boolean; // Si hay alguna no conformidad
  non_conformity_description?: string; // Descripción de la no conformidad
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface NightSupervisionCameraReview {
  id: string;
  shift_id: string;
  unit_id: string;
  unit_name: string;
  review_number: 1 | 2 | 3; // Primera, segunda o tercera revisión
  scheduled_time: string; // HH:mm - hora programada de la revisión
  actual_time?: string; // HH:mm - hora real en que se hizo la revisión
  screenshot_url: string; // URL del screenshot de las cámaras
  screenshot_timestamp?: string; // Fecha y hora que muestra el screenshot
  cameras_reviewed: string[]; // IDs o nombres de las cámaras revisadas
  notes?: string; // Observaciones del supervisor
  non_conformity?: boolean; // Si hay alguna no conformidad
  non_conformity_description?: string; // Descripción de la no conformidad
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface NightSupervisionAlert {
  id: string;
  shift_id: string;
  type: 'missing_call' | 'missing_photo' | 'missing_camera_review' | 'non_conformity' | 'critical_event';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  related_entity_type: 'call' | 'camera_review' | 'shift';
  related_entity_id?: string;
  resolved: boolean;
  resolved_at?: string;
  resolved_by?: string;
  created_at: string;
  updated_at: string;
}

export interface NightSupervisionReport {
  shift_id: string;
  date: string;
  unit_name: string;
  supervisor_name: string;
  total_workers: number;
  total_calls_required: number;
  total_calls_completed: number;
  total_calls_answered: number;
  total_photos_received: number;
  total_camera_reviews_required: number;
  total_camera_reviews_completed: number;
  non_conformities_count: number;
  critical_events_count: number;
  completion_percentage: number;
  calls: NightSupervisionCall[];
  camera_reviews: NightSupervisionCameraReview[];
  alerts: NightSupervisionAlert[];
}

// ============================================
// SUPERVISIÓN DE CAMPO (rutas y cronograma)
// ============================================

export type SupervisionCategory = 'ALTA' | 'MEDIA' | 'BAJA';

export type SupervisionFrequency =
  | 'SEMANAL'
  | 'QUINCENAL'
  | 'MENSUAL'
  | 'PERMANENTE'
  | 'PREVIA_COORDINACION'
  | 'CUANDO_SE_REQUIERA'
  | 'SEGUN_RUTA'
  | 'POR_CONFIRMAR'
  | 'NINGUNO';

export type SupervisionVisitStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'cancelled';

export type SupervisionWeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type SupervisionVisitDays = Record<SupervisionWeekdayKey, boolean>;

export interface SupervisionAssignment {
  id: string;
  unitId: string;
  unitName?: string;
  unitAddress?: string;
  unitClientName?: string;
  supervisorStaffId?: string;
  supervisorName?: string;
  coordinatorStaffId?: string;
  coordinatorName?: string;
  category: SupervisionCategory;
  frequency: SupervisionFrequency;
  visitDays: SupervisionVisitDays;
  restWeekday: number; // 1=lunes ... 7=domingo
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupervisionRouteStop {
  id: string;
  routeId: string;
  unitId: string;
  unitName?: string;
  unitAddress?: string;
  latitude?: number;
  longitude?: number;
  stopOrder: number;
}

export interface SupervisionRoute {
  id: string;
  supervisorStaffId: string;
  supervisorName?: string;
  weekday: number; // 1=lunes ... 7=domingo
  name: string;
  isOptimized: boolean;
  estimatedDistanceKm?: number;
  stops: SupervisionRouteStop[];
  createdAt: string;
  updatedAt: string;
}

export interface SupervisionVisit {
  id: string;
  assignmentId?: string;
  routeId?: string;
  unitId: string;
  unitName?: string;
  unitAddress?: string;
  unitClientName?: string;
  latitude?: number;
  longitude?: number;
  supervisorStaffId: string;
  supervisorName?: string;
  coordinatorStaffId?: string;
  coordinatorName?: string;
  visitDate: string; // YYYY-MM-DD
  weekday: number;
  stopOrder?: number;
  plannedStart?: string;
  status: SupervisionVisitStatus;
  category?: SupervisionCategory;
  checkInAt?: string;
  checkOutAt?: string;
  checkInLat?: number;
  checkInLng?: number;
  checkOutLat?: number;
  checkOutLng?: number;
  notes?: string;
  skipReason?: string;
  evidenceUrls?: string[];
  createdAt: string;
  updatedAt: string;
}

// --- INBOUND WORKER HANDOFF (Opalo ATS → OpsFlow) ---

export type InboundHandoffPackageStatus =
  | 'received'
  | 'processing'
  | 'completed'
  | 'rejected'
  | 'partially_completed';

/** Hire/legacy: pending|accepted|rejected|assigned. Presentation: pending_interview|in_review|approved|rejected|assigned|archived_no_hire. */
export type InboundHandoffItemStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'assigned'
  | 'pending_interview'
  | 'in_review'
  | 'approved'
  | 'archived_no_hire';

export type InboundHandoffPurpose = 'presentation';

export type ComplementaryStatus = 'complete' | 'incomplete' | 'missing';

export interface WorkerSnapshotIdentity {
  fullName?: string;
  /** Nombres de pila (sin apellidos). */
  nombres?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  dni?: string;
  email?: string;
  phone?: string;
  phone2?: string;
}

export interface WorkerSnapshotFamiliar {
  nombres?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  parentesco?: string;
  edad?: string | number;
  telefono?: string;
}

export interface WorkerSnapshotEducacion {
  nivel?: string;
  institucion?: string;
  lugar?: string;
  periodo?: string;
  grado?: string;
}

export interface WorkerSnapshotExperiencia {
  empresa?: string;
  puesto?: string;
  fechaIngreso?: string;
  fechaCese?: string;
  motivoCese?: string;
}

export interface WorkerSnapshotAntecedenteSalud {
  tipoEnfermedad?: string;
  edad?: string | number;
  diagnostico?: string;
  secuela?: string;
}

/** Ficha complementaria (snapshotVersion >= 3 / purpose presentation). */
export interface WorkerSnapshotComplementary {
  version?: number;
  nombres?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  fechaNacimiento?: string;
  tipoDocumento?: string;
  nroDocumento?: string;
  nacionalidad?: string;
  edad?: string | number;
  sexo?: string;
  estadoCivil?: string;
  email?: string;
  telefono?: string;
  tallaCamisa?: string;
  tallaPantalon?: string;
  tallaCalzado?: string;
  emergenciaTelefono?: string;
  emergenciaParentesco?: string;
  direccion?: string;
  distrito?: string;
  provincia?: string;
  departamento?: string;
  familiares?: WorkerSnapshotFamiliar[];
  parienteEnOpalo?: boolean | null;
  nombreFamiliarOpalo?: string;
  educacion?: WorkerSnapshotEducacion[];
  experienciaLaboral?: WorkerSnapshotExperiencia[];
  antecedentesSalud?: WorkerSnapshotAntecedenteSalud[];
  unidadDestaque?: string;
  puestoContrato?: string;
  bancoSueldo?: string;
  bancoCts?: string;
  sistemaPensionesAnterior?: string;
  sistemaPensionesDeseado?: string;
  /** ¿Cómo se enteró del empleo? (ATS: Fuente / source) */
  comoSeEnteroEmpleo?: string;
  declaracionAceptada?: boolean;
  submittedAt?: string;
  [key: string]: unknown;
}

export interface WorkerSnapshotMeta {
  sourceCandidateId?: string;
  sourceProcessId?: string;
  sourceApp?: string;
  snapshotVersion?: number;
  /** presentation = entrevista; omitido/null = hire/legacy */
  purpose?: 'presentation' | string;
  complementaryStatus?: ComplementaryStatus;
  complementaryFilledAt?: string;
  complementaryMissingFields?: string[];
  includedFieldKeys?: string[];
  fieldLabels?: Record<string, string>;
  capturedAt?: string;
}

export interface WorkerSnapshot {
  identity?: WorkerSnapshotIdentity;
  fields?: Record<string, string | number | boolean | null>;
  complementary?: WorkerSnapshotComplementary;
  meta?: WorkerSnapshotMeta;
}

export interface InboundHandoffPackage {
  id: string;
  sourceApp: string;
  sourcePackageId: string;
  status: InboundHandoffPackageStatus;
  /** presentation | undefined (hire/legacy) */
  purpose?: InboundHandoffPurpose | null;
  workerCount: number;
  senderNote?: string;
  sourceCreatedByName?: string;
  sourceSentAt: string;
  payloadVersion: number;
  receivedAt: string;
  processingStartedAt?: string;
  completedAt?: string;
  receiverNote?: string;
  createdAt: string;
  updatedAt: string;
  /** Candidatos pending o accepted (sin registrar) en este paquete */
  unresolvedCandidateCount?: number;
}

export interface InboundHandoffItem {
  id: string;
  packageId: string;
  sourceCandidateId?: string;
  sourceProcessId?: string;
  workerName: string;
  workerSnapshot: WorkerSnapshot;
  itemStatus: InboundHandoffItemStatus;
  purpose?: InboundHandoffPurpose | null;
  snapshotVersion?: number;
  complementary?: WorkerSnapshotComplementary | null;
  complementaryStatus?: ComplementaryStatus | null;
  complementaryFilledAt?: string;
  complementaryMissingFields?: string[];
  /** Datos internos OpsFlow (salario, días, horario, turno) antes de asignar unidad */
  opsflowIntake?: PresentationOpsflowIntake | null;
  decisionReason?: string;
  decidedAt?: string;
  decidedByName?: string;
  assignedWorkUnitId?: string;
  assignedAt?: string;
  createdResourceId?: string;
  /** Fecha de inicio del recurso creado al registrar (YYYY-MM-DD), joined al listar */
  resourceStartDate?: string;
  createdAt: string;
  updatedAt?: string;
  /** Joined from package when listing presentations */
  sourcePackageId?: string;
  sourceApp?: string;
  packageReceivedAt?: string;
}

/** Campos que llena OpsFlow antes de registrar al candidato en una unidad. */
export interface PresentationOpsflowIntake {
  monthlySalary?: number | null;
  /** Ej. Lunes, Martes, … */
  workDays?: string[];
  /** HH:mm */
  entryTime?: string;
  /** HH:mm */
  exitTime?: string;
  /** Diurno | Tarde | Nocturno */
  shift?: string;
  /** Full Time | Part Time | 12 horas */
  jornadaType?: string;
  /** General | Pyme | Mype */
  laborRegime?: string;
  /** Bono de movilidad (S/); 0 permitido si se especifica */
  mobilityBonus?: number | null;
  /** true/false cuando el usuario ya marcó si corresponde asignación familiar */
  familyAllowance?: boolean | null;
  updatedAt?: string;
  updatedByName?: string;
}

export interface InboundHandoffDecisionOutbox {
  id: string;
  handoffItemId: string;
  sourcePackageId: string;
  opsflowPackageId: string;
  sourceCandidateId?: string;
  sourceProcessId?: string;
  status: 'approved' | 'rejected';
  decidedAt: string;
  decidedByName?: string;
  reason?: string;
  deliveryStatus: 'pending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  lastError?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface InboundHandoffPackageWithItems extends InboundHandoffPackage {
  items: InboundHandoffItem[];
}

/** Datos ATS (+ intake OpsFlow) persistidos en resources.inbound_source_data al registrar colaborador */
export interface ResourceInboundSourceData {
  sourceApp: string;
  sourcePackageId?: string;
  sourceCandidateId?: string;
  sourceProcessId?: string;
  handoffItemId?: string;
  capturedAt?: string;
  workerSnapshot: WorkerSnapshot;
  opsflowIntake?: PresentationOpsflowIntake;
}

// --- HR OPALOSIS INTEGRATION (OpsFlow → Opalosis RRHH) ---

export type HrOutboundQueueStatus = 'pendiente_envio' | 'incluido_paquete' | 'excluido';

export type HrOutboundPackageStatus =
  | 'pendiente'
  | 'enviado'
  | 'simulado'
  | 'error'
  | 'procesado'
  | 'observado'
  | 'rechazado'
  | 'parcialmente_procesado';

export type HrOutboundItemStatus = 'pendiente' | 'procesado' | 'observado' | 'rechazado' | 'recibido';

/** Campos de solicitud de ingreso alineados a RegistroIngresoDTO (Opalosis). */
export interface HrOpalosisIngresoFields {
  tipoDocumentoId: number;
  documento: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombres: string;
  sexo: string;
  fechaIngreso: string;
  fechaNacimiento?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  correoPersonal?: string | null;
  tieneAsignacionFamiliar?: boolean;
  tieneHijos?: boolean;
  empleadoCargoId?: number | null;
  lugarTrabajoId?: number | null;
  opaloId?: number | null;
  modeloContratoId?: number | null;
  regimenLaboralId?: number | null;
  mesesContrato?: number | null;
  jornadaLaboral?: string | null;
  turno?: string | null;
  sueldo?: number | null;
  movilidad?: number | null;
  sistemaPension?: string | null;
  /** ID catálogo Opalosis fondo-pension (FondoPensionId) */
  fondoPensionId?: number | null;
  bancoPreferencia?: string | null;
  /** ID catálogo Opalosis banco (BancoId) */
  bancoId?: number | null;
  numeroCuentaTrabajador?: string | null;
  urlDocumentoAdjunto?: string | null;
  tallaPoloCamisa?: string | null;
  tallaCasaca?: string | null;
  tallaPantalon?: string | null;
  tallaZapatos?: number | null;
  paisId?: number | null;
  ubigeoId?: number | null;
  departamentoId?: number | null;
  provinciaId?: number | null;
  supervisorId?: number | null;
  centroCostoId?: number | null;
  estadoCivilId?: number | null;
  observacion?: string | null;
  usuarioProcesoId?: number | null;
  usuarioOf?: string | null;
  payloadJson?: string | null;
  /** Referencia interna OpsFlow (también puede ir en Observacion). */
  refOperaciones?: string;
  /** Etiquetas de catálogo para UI (no se envían a Opalosis). */
  labels?: {
    tipoDocumento?: string;
    empleadoCargo?: string;
    lugarTrabajo?: string;
    opalo?: string;
    modeloContrato?: string;
    regimenLaboral?: string;
    estadoCivil?: string;
    departamento?: string;
    provincia?: string;
    distrito?: string;
    banco?: string;
    supervisor?: string;
    centroCosto?: string;
    fondoPension?: string;
  };
}

export type OpalosisCatalogName =
  | 'tipo-documento'
  | 'estado-civil'
  | 'paises'
  | 'departamentos'
  | 'provincias'
  | 'distritos'
  | 'empleado-cargo'
  | 'lugar-trabajo'
  | 'opalos'
  | 'regimen-laboral'
  | 'modelo-contrato'
  | 'fondo-pension'
  | 'banco'
  | 'supervisores'
  | 'centro-costo';

export interface OpalosisCatalogItem {
  id: number;
  label: string;
  raw?: Record<string, unknown>;
}

export interface OpalosisSolicitudIngreso {
  ingresoId: number;
  ingresoCod: string;
  documento: string;
  nombresCompletos: string;
  lugarTrabajo: string;
  fechaProcesada?: string | null;
  estado: string;
  etapa: string;
}

/** Campo con etiqueta del camino ATS/OpsFlow (para retiquetado en Opalosis). */
export interface HrWorkerFieldInventoryItem {
  source: 'ats' | 'opsflow' | 'operator';
  /** Clave original en el sistema de origen (inmutable). */
  key: string;
  /** Etiqueta tal como se conoce en ATS/OpsFlow (no la de Opalosis). */
  label: string;
  value: string | number | boolean;
  /** Aviso opcional; Opalosis decide si usa el dato y con qué etiqueta propia. */
  note?: string;
  /** Siempre true: RRHH debe clasificar o descartar el dato en Opalosis. */
  classificationRequired?: boolean;
}

/** Snapshot completo enviado a Opalosis (todo lo disponible). */
export interface HrOutboundWorkerSnapshot {
  capturedAt: string;
  opsflow: {
    resourceId: string;
    unitId: string;
    unitName: string;
    clientName: string;
    name: string;
    dni?: string;
    puesto?: string;
    localidad?: string;
    phone?: string;
    birthDate?: string;
    startDate?: string;
    endDate?: string;
    assignedShift?: string;
    assignedZones?: string[];
    monthlySalary?: number;
    personnelStatus?: string;
    externalId?: string;
    jornadaType?: string;
    laborRegime?: string;
    mobilityBonus?: number;
    familyAllowance?: boolean;
    workDays?: string[];
    entryTime?: string;
    exitTime?: string;
  };
  ats: {
    sourceApp: string;
    sourcePackageId?: string;
    sourceCandidateId?: string;
    sourceProcessId?: string;
    handoffItemId?: string;
    workerName: string;
    identity?: WorkerSnapshotIdentity;
    fields?: Record<string, string | number | boolean | null>;
    complementary?: WorkerSnapshotComplementary;
    meta?: WorkerSnapshotMeta;
  };
}

export interface HrOutboundIngresoQueueItem {
  id: string;
  resourceId: string;
  inboundHandoffItemId?: string;
  opsflowUnitId: string;
  workerName: string;
  assignedAt: string;
  reportDate: string;
  workerSnapshot: HrOutboundWorkerSnapshot;
  hrFields?: HrOpalosisIngresoFields;
  refOperaciones: string;
  queueStatus: HrOutboundQueueStatus;
  packageId?: string;
  exclusionNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HrOutboundIngresoPackage {
  id: string;
  sourcePackageId: string;
  reportDate: string;
  workerCount: number;
  status: HrOutboundPackageStatus;
  senderNote?: string;
  sentByName?: string;
  sentAt?: string;
  fechaRecepcion?: string;
  opalosisResponse?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface HrOutboundIngresoPackageItem {
  id: string;
  packageId: string;
  queueItemId?: string;
  refOperaciones: string;
  resourceId: string;
  workerName: string;
  workerSnapshot: HrOutboundWorkerSnapshot;
  hrFields?: HrOpalosisIngresoFields;
  itemStatus: HrOutboundItemStatus;
  mensaje?: string;
  empleadoIdRrhh?: number;
  ingresoCod?: string;
  opalosisEstado?: string;
  opalosisEtapa?: string;
  createdAt: string;
}

export interface HrOutboundIngresoPackageWithItems extends HrOutboundIngresoPackage {
  items: HrOutboundIngresoPackageItem[];
}

export interface HrUnitCacheEntry {
  opalosisUnidadId: number;
  nombre: string;
  activo: boolean;
  fetchedAt: string;
}

export interface HrUnitMapping {
  id: string;
  opsflowUnitId: string;
  opalosisUnidadId: number;
  opalosisUnidadNombre?: string;
  empresaCodigo?: number;
  activo: boolean;
}

// ============================================
// VACACIONES (Régimen General Perú - 30 días/año)
// ============================================

export interface VacationBalance {
  id: string;
  resourceId: string;
  historicalTakenDays: number;
  annualEntitlement: number;
  notes?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type VacationDayEntryStatus = 'pending_batch' | 'batched' | 'cancelled';

export interface VacationDayEntry {
  id: string;
  resourceId: string;
  unitId: string;
  vacationDate: string;
  /** 1 = día completo, 0.5 = medio día */
  daysCount?: number;
  status: VacationDayEntryStatus;
  papeletaId?: string;
  notes?: string;
  createdAt?: string;
  createdBy?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export type VacationPapeletaSource = 'direct' | 'accumulated';
export type VacationPapeletaStatus = 'draft' | 'issued' | 'cancelled';

export interface VacationPapeleta {
  id: string;
  resourceId: string;
  unitId: string;
  code: string;
  workerName: string;
  workerDni?: string;
  unitName: string;
  startDate: string;
  endDate: string;
  returnDate: string;
  calendarDays: number;
  sourceType: VacationPapeletaSource;
  status: VacationPapeletaStatus;
  /** True si se emitió antes de que el trabajador hubiera ganado 30 días */
  isAdvance?: boolean;
  notes?: string;
  issuedAt?: string;
  issuedBy?: string;
  authorizedBy?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  accumulatedDays?: VacationDayEntry[];
}

/** Bloque 15+15 de un periodo vacacional (año de servicios) */
export interface VacationPeriodBlock {
  /** Índice del periodo (1 = primer año de servicios, etc.) */
  periodIndex: number;
  periodStart: string;
  periodEnd: string;
  /** Días ganados en el periodo (máx. 30) */
  accruedInPeriod: number;
  /** Primeros 15 ganados (fraccionables libremente / desde 0.5) */
  firstBlockEarned: number;
  /** Segundos 15 ganados (goce en múltiplos de 7) */
  secondBlockEarned: number;
  firstBlockUsed: number;
  secondBlockUsed: number;
  firstBlockAvailable: number;
  secondBlockAvailable: number;
}

export type VacationFractionationBucket = 'first15' | 'second15' | 'mixed';

export interface VacationBalanceSummary {
  resourceId: string;
  workerName: string;
  workerDni?: string;
  unitId: string;
  unitName: string;
  startDate?: string;
  puesto?: string;
  accruedDays: number;
  historicalTakenDays: number;
  papeletaDays: number;
  pendingIndividualDays: number;
  totalUsedDays: number;
  availableDays: number;
  fullYears: number;
  monthsInCurrentPeriod: number;
  /** Días calendario de servicio acumulados desde ingreso */
  serviceDays: number;
  /** Días de servicio en el periodo anual actual (desde último aniversario) */
  daysInCurrentPeriod: number;
  /** True si tiene saldo y puede emitir según reglas 15+15 */
  canIssuePapeleta: boolean;
  pendingDayDates: string[];
  /** Desglose primeros/segundos 15 por año de trabajo */
  periodBlocks: VacationPeriodBlock[];
  first15Available: number;
  second15Available: number;
  /** Día semanal de descanso (0=domingo … 6=sábado), inferido o por defecto */
  weeklyRestDay: number;
  weeklyRestDayLabel: string;
}

// --- Módulo de Inventario (Appinventario → OpsFlow) ---
export type InvWarehouseKind = 'CENTRAL' | 'UNIT';

export interface InvWarehouse {
  id: string;
  name: string;
  location: string;
  kind: InvWarehouseKind;
  unitId?: string;
  unitName?: string;
}

export interface InvUnitOption {
  id: string;
  name: string;
  workers: { id: string; name: string; dni?: string }[];
}

export type InvConsumptionReason = 'ENTREGA_PERSONAL' | 'USO_INTERNO' | 'MERMA' | 'BAJA';

export const INV_CONSUMPTION_REASON_LABELS: Record<InvConsumptionReason, string> = {
  ENTREGA_PERSONAL: 'Entrega a personal',
  USO_INTERNO: 'Uso interno / consumo en servicio',
  MERMA: 'Merma / pérdida',
  BAJA: 'Baja / descarte',
};

export interface InvProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  lowStockThreshold: number;
  description: string;
  images: string[];
}

export interface InvStockItem {
  productId: string;
  warehouseId: string;
  quantity: number;
}

export type InvLogType = 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'CREACIÓN' | 'CONSUMO' | 'ENTREGA';

export interface InvLogEntry {
  id: string;
  timestamp: string;
  productName: string;
  sku: string;
  warehouseName: string;
  type: InvLogType;
  quantityChange: number;
  newQuantityInWarehouse: number;
  details: string;
  user: string;
  transactionId?: string;
  recipient?: string;
  consumptionReason?: InvConsumptionReason;
}

export interface InvWarehouseAccess {
  userId: string;
  warehouseId: string;
}

export interface InvColorSettings {
  inStock: string;
  lowStock: string;
  outOfStock: string;
}

export interface InvAppSettings {
  colors: InvColorSettings;
  alerts: { defaultLowStockThreshold: number };
  purchaseOrderSettings: { prefix: string; nextNumber: number };
}

export type InvCompanyInfoDetails = { label: string; value: string }[];

export interface InvCompany {
  id: string;
  profileName: string;
  details: InvCompanyInfoDetails;
}

export type InvPurchaseOrderStatus = 'BORRADOR' | 'EMITIDA' | 'RECIBIDA' | 'CANCELADA';

export interface InvSupplier {
  id: string;
  name: string;
  ruc: string;
  address: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
}

export interface InvPurchaseOrderItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  price: number;
}

export interface InvPurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  issuingCompanyId: string;
  destinationWarehouseId: string;
  issueDate: string;
  deliveryDate: string;
  status: InvPurchaseOrderStatus;
  items: InvPurchaseOrderItem[];
  solicitante: string;
  total: number;
}

export interface InvScheduledPurchaseItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
}

export interface InvScheduledPurchase {
  id: string;
  date: string;
  title: string;
  supplierId?: string;
  notes: string;
  items: InvScheduledPurchaseItem[];
  createdBy: string;
}

export type InventorySectionView =
  | 'dashboard'
  | 'products'
  | 'warehouses'
  | 'consumption'
  | 'log'
  | 'access'
  | 'settings'
  | 'suppliers'
  | 'purchaseOrders'
  | 'purchaseCalendar';

export interface VacationCalendarEvent {
  date: string;
  unitId: string;
  unitName: string;
  resourceId: string;
  workerName: string;
  eventType: 'papeleta' | 'day_entry';
  code?: string;
}

export type VacationAuthRequestType = 'create_papeleta' | 'cancel_papeleta' | 'cancel_day_entry';
export type VacationAuthRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface VacationAuthorizationRequest {
  id: string;
  status: VacationAuthRequestStatus;
  requestType: VacationAuthRequestType;
  requesterId: string;
  requesterName?: string;
  assignedAuthorizerId: string;
  assignedAuthorizerName?: string;
  resourceId?: string;
  unitId?: string;
  payload: Record<string, unknown>;
  justification?: string;
  rejectionReason?: string;
  summary: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedByName?: string;
}