/** Catálogos fijos del modal /falta — solo opciones predefinidas. */

export const DIALOG_CALLBACK_ID = 'falta_attendance_v1';
export const UNIT_PICKER_ACTION = 'open_falta_dialog';
export const UNIT_CONTINUE_ACTION = 'continue_falta_dialog';
export const SELECT_OPTIONS_MAX = 100;
export const ATTACHMENTS_BUCKET = 'attendance-incident-attachments';

export const INCIDENT_TYPES = [
  { value: 'INASISTENCIA', text: 'Inasistencia a turno' },
  { value: 'TARDANZA', text: 'Tardanza' },
  { value: 'DESCANSO_MEDICO_INICIAL', text: 'Avisó descanso médico / emergencia' },
  { value: 'PERMISO_LICENCIA', text: 'Solicitud de permiso/licencia' },
];

export const INCIDENT_REASONS = [
  { value: 'SALUD_EMERGENCIA', text: 'Salud / Emergencia Médica' },
  { value: 'PROBLEMA_PERSONAL', text: 'Problema Personal / Familiar' },
  { value: 'TRAMITE_DOCUMENTARIO', text: 'Trámite Documentario / Cita Externa' },
  { value: 'SIN_COMUNICACION', text: 'Sin comunicación / Abandono de puesto' },
  { value: 'OPERATIVO_TRASLADO', text: 'Operativo / Traslado' },
];

export const COVERAGE_OPTIONS = [
  { value: 'CON_COBERTURA', text: 'Se asignó reemplazo / retén' },
  { value: 'SIN_COBERTURA', text: 'Puesto queda descubierto' },
  { value: 'NO_APLICA', text: 'No aplica' },
];

export const INCIDENT_STATUSES = [
  { value: 'PENDING_JUSTIFICATION', text: 'Pendiente de justificación' },
  { value: 'MEDICAL_REST', text: 'Descanso médico' },
  { value: 'LEAVE_OR_PERMIT', text: 'Licencia / permiso' },
  { value: 'UNJUSTIFIED_ABSENCE', text: 'Inasistencia injustificada' },
];

const TYPE_SET = new Set(INCIDENT_TYPES.map((o) => o.value));
const REASON_SET = new Set(INCIDENT_REASONS.map((o) => o.value));
const COVERAGE_SET = new Set(COVERAGE_OPTIONS.map((o) => o.value));
const STATUS_SET = new Set(INCIDENT_STATUSES.map((o) => o.value));

export function labelOf(options, value, fallback = value) {
  const found = options.find((o) => o.value === value);
  return found ? found.text : fallback || value || '';
}

export function coverageBadge(value) {
  if (value === 'CON_COBERTURA') return { emoji: '🟢', text: 'Cubierto', color: '#16a34a' };
  if (value === 'SIN_COBERTURA') return { emoji: '🔴', text: 'Sin Cobertura', color: '#dc2626' };
  return { emoji: '⚪', text: 'No aplica', color: '#64748b' };
}

function asText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function validateSubmission(submission) {
  const errors = {};
  const unitId = asText(submission?.unit_id);
  const employeeId = asText(submission?.employee_id);
  const incidentType = asText(submission?.incident_type);
  const incidentReason = asText(submission?.incident_reason);
  const hasCoverage = asText(submission?.has_coverage);
  const observations = asText(submission?.observations);

  if (!unitId) errors.unit_id = 'Seleccione la unidad / sede operativa.';
  if (!employeeId) errors.employee_id = 'Seleccione el trabajador.';
  if (!TYPE_SET.has(incidentType)) errors.incident_type = 'Seleccione un tipo de incidencia válido.';
  if (!REASON_SET.has(incidentReason)) errors.incident_reason = 'Seleccione un motivo de la lista.';
  if (!COVERAGE_SET.has(hasCoverage)) errors.has_coverage = 'Seleccione la cobertura de puesto.';
  if (observations.length > 2000) errors.observations = 'Las observaciones no pueden superar 2000 caracteres.';

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    values: {
      unitId,
      employeeId,
      incidentType,
      incidentReason,
      hasCoverage,
      observations: observations || null,
    },
  };
}

export function isValidStatus(value) {
  return STATUS_SET.has(asText(value));
}

export function limaTodayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function formatWorkerLabel(row) {
  const dni = asText(row?.dni) || 'S/DNI';
  const formatted = formatApellidosNombres(row);
  let text = `[${dni}] - ${formatted}`;
  if (text.length > 100) text = `${text.slice(0, 97)}…`;
  return text;
}

export function formatApellidosNombres(row) {
  const snap =
    row?.inbound_source_data?.workerSnapshot?.identity ||
    row?.inbound_source_data?.identity ||
    {};
  const nombres = asText(snap.nombres);
  const apellidos = [snap.apellidoPaterno, snap.apellidoMaterno].map(asText).filter(Boolean).join(' ');
  if (apellidos && nombres) return `${apellidos}, ${nombres}`;
  const name = asText(row?.name);
  if (name.includes(',')) return name;
  return name || 'Sin nombre';
}

export function isActivePersonnelRow(row) {
  if (asText(row?.type) !== 'Personal') return false;
  if (row?.archived === true) return false;
  const status = asText(row?.personnel_status).toLowerCase();
  if (status === 'cesado' || status === 'archivado') return false;
  return true;
}

export function isOperationalUnit(row) {
  return asText(row?.status) !== 'Desactivado';
}

export function toSelectOptions(rows, mapFn) {
  return rows.map(mapFn).filter((o) => o && o.value && o.text);
}
