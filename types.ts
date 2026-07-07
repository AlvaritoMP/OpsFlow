
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
  | 'RETENES'
  | 'VACATIONS'
  | 'ASSETS_CATALOG'
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
  dni?: string; // Documento Nacional de Identidad
  /** Lugar de residencia o localidad de referencia del trabajador (ej. distrito, ciudad) */
  localidad?: string;
  /** Teléfono de contacto del trabajador */
  phone?: string;
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
  salaryIncrements?: SalaryIncrement[]; // Historial de incrementos salariales
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

// --- INBOUND WORKER HANDOFF (Opalo ATS → OpsFlow) ---

export type InboundHandoffPackageStatus =
  | 'received'
  | 'processing'
  | 'completed'
  | 'rejected'
  | 'partially_completed';

export type InboundHandoffItemStatus = 'pending' | 'accepted' | 'rejected' | 'assigned';

export interface WorkerSnapshotIdentity {
  fullName?: string;
  dni?: string;
  email?: string;
  phone?: string;
  phone2?: string;
}

export interface WorkerSnapshotMeta {
  sourceCandidateId?: string;
  sourceProcessId?: string;
  sourceApp?: string;
  snapshotVersion?: number;
  includedFieldKeys?: string[];
  capturedAt?: string;
}

export interface WorkerSnapshot {
  identity?: WorkerSnapshotIdentity;
  fields?: Record<string, string | number | boolean | null>;
  meta?: WorkerSnapshotMeta;
}

export interface InboundHandoffPackage {
  id: string;
  sourceApp: string;
  sourcePackageId: string;
  status: InboundHandoffPackageStatus;
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
}

export interface InboundHandoffItem {
  id: string;
  packageId: string;
  sourceCandidateId?: string;
  sourceProcessId?: string;
  workerName: string;
  workerSnapshot: WorkerSnapshot;
  itemStatus: InboundHandoffItemStatus;
  assignedWorkUnitId?: string;
  assignedAt?: string;
  createdResourceId?: string;
  createdAt: string;
}

export interface InboundHandoffPackageWithItems extends InboundHandoffPackage {
  items: InboundHandoffItem[];
}

/** Datos ATS persistidos en resources.inbound_source_data al registrar colaborador */
export interface ResourceInboundSourceData {
  sourceApp: string;
  sourcePackageId?: string;
  sourceCandidateId?: string;
  sourceProcessId?: string;
  handoffItemId?: string;
  capturedAt?: string;
  workerSnapshot: WorkerSnapshot;
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

export type HrOutboundItemStatus = 'pendiente' | 'procesado' | 'observado' | 'rechazado';

/** Campos mapeados al contrato Opalosis POST /api/empleados (referencial). */
export interface HrOpalosisIngresoFields {
  tipo: 'ingreso';
  empresa_codigo: number;
  tipo_documento: string;
  documento: string;
  apellido_paterno: string;
  apellido_materno: string;
  nombres: string;
  sexo: string;
  cargo: string;
  unidad_id: number;
  fecha_ingreso: string;
  fecha_nacimiento: string;
  estado_civil: string;
  correo_personal: string;
  telefono?: string;
  direccion?: string;
  pais?: string;
  asignacion_familiar?: boolean;
  ref_operaciones: string;
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
  status: VacationDayEntryStatus;
  papeletaId?: string;
  notes?: string;
  createdAt?: string;
  createdBy?: string;
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
  notes?: string;
  issuedAt?: string;
  issuedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  accumulatedDays?: VacationDayEntry[];
}

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
  canIssuePapeleta: boolean;
  pendingDayDates: string[];
}

export interface VacationCalendarEvent {
  date: string;
  unitId: string;
  unitName: string;
  resourceId: string;
  workerName: string;
  eventType: 'papeleta' | 'day_entry';
  code?: string;
}