import { URLSearchParams } from 'node:url';
import {
  COVERAGE_OPTIONS,
  DIALOG_CALLBACK_ID,
  EDIT_DIALOG_CALLBACK_ID,
  FORM_ACTIONS,
  INCIDENT_REASONS,
  INCIDENT_TYPES,
  SELECT_OPTIONS_MAX,
  UNIT_CONTINUE_ACTION,
  UNIT_PICKER_ACTION,
  coverageBadge,
  formatWorkerLabel,
  isFinalIncidentStatus,
  labelOf,
  limaTodayIso,
  validateIncidentDate,
  validateSubmission,
} from './catalogs.js';
import {
  configStatus,
  isAllowedIncidentsChannel,
  loadConfig,
  mattermostActionUrl,
  mattermostDialogEditSubmitUrl,
  mattermostDialogSubmitUrl,
  mattermostIncidentActionUrl,
  safeEqual,
  signState,
  verifyState,
} from './config.js';
import { syncIncidentToAttendance } from './attendanceSync.js';
import {
  attachmentExists,
  createIncident,
  findIncidentByPostId,
  getIncidentById,
  getUnitById,
  getWorkerById,
  listActiveUnits,
  listActiveWorkers,
  listWorkersForUnitSelect,
  listOpenIncidentsForPolling,
  saveAttachment,
  updateIncidentDetails,
  updateIncidentPost,
  workerCardName,
  workerSelectOptions,
} from './incidents.js';
import {
  buildPermalink,
  createEphemeralPost,
  createPost,
  downloadFile,
  getFileInfo,
  getChannel,
  getPost,
  getPostThread,
  getTeam,
  isTransientMattermostError,
  mattermostFetch,
  getTeamMember,
  getUser,
  openDialog,
  updatePost,
} from './mattermostApi.js';

function sendJson(res, status, body) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(payload);
}

function sendEmpty(res, status = 200) {
  res.writeHead(status, { 'Content-Length': '0' });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parsePayload(req, raw) {
  const text = raw.toString('utf8');
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (!text) return {};
  if (ct.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }
  const params = new URLSearchParams(text);
  const obj = Object.fromEntries(params.entries());
  if (obj.payload) {
    try {
      obj.payloadJson = JSON.parse(obj.payload);
    } catch {
      obj.payloadJson = null;
    }
  }
  return obj;
}

function interactivePayload(body) {
  let payload = null;
  if (body?.payloadJson && typeof body.payloadJson === 'object') payload = body.payloadJson;
  else if (body && typeof body === 'object' && (body.context || body.type === 'select' || body.type === 'button')) {
    payload = body;
  }
  if (!payload) return null;
  if (typeof payload.context === 'string') {
    try {
      payload = { ...payload, context: JSON.parse(payload.context) };
    } catch {
      payload = { ...payload, context: {} };
    }
  }
  return payload;
}

function isInteractiveAction(body) {
  const p = interactivePayload(body);
  if (!p) return false;
  const action = p.context?.action || p.context?.Action;
  if (action === UNIT_PICKER_ACTION || action === UNIT_CONTINUE_ACTION) return true;
  if (Object.values(FORM_ACTIONS).includes(action)) return true;
  if (p.type === 'select' || p.type === 'button') return true;
  return false;
}

function optionValue(value) {
  if (value && typeof value === 'object') {
    return String(value.value || value.id || '').trim();
  }
  return String(value || '').trim();
}

function selectedUnitFromAction(payload) {
  const ctx = payload?.context || {};
  return (
    optionValue(payload?.selected_option) ||
    optionValue(ctx.selected_option) ||
    optionValue(ctx.selectedOption) ||
    optionValue(payload?.data?.selected_option) ||
    optionValue(payload?.data?.value) ||
    optionValue(payload?.option) ||
    optionValue(payload?.value)
  );
}

function interactiveActionUrl() {
  const url = mattermostActionUrl();
  if (!/^https?:\/\//i.test(url) || /localhost|127\.0\.0\.1/i.test(url)) {
    return 'https://opalo-opsflow.bouasv.easypanel.host/api/webhooks/mattermost/action';
  }
  return url;
}

function extractFileIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  const text = String(value).trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      /* fall through */
    }
  }
  return text
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokenFromIncoming(body, headers) {
  return (
    body.token ||
    body.payloadJson?.token ||
    headers['x-mattermost-token'] ||
    headers['authorization']?.replace(/^Bearer\s+/i, '') ||
    ''
  );
}

function isSlashTokenValid(body, headers) {
  const cfg = loadConfig();
  if (!cfg.slashToken) return false;
  const incoming = String(tokenFromIncoming(body, headers) || '');
  return safeEqual(incoming, cfg.slashToken);
}

function isOutgoingTokenValid(body, headers) {
  const cfg = loadConfig();
  const incoming = String(tokenFromIncoming(body, headers) || '');
  if (cfg.outgoingToken) return safeEqual(incoming, cfg.outgoingToken);
  if (incoming && cfg.slashToken) return safeEqual(incoming, cfg.slashToken);
  return Boolean(cfg.botToken);
}

function filterWorkers(workers, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return workers;
  return workers.filter((w) => {
    const dni = String(w.dni || '').toLowerCase();
    const name = String(w.name || '').toLowerCase();
    return dni.includes(q) || name.includes(q);
  });
}

function matchUnitByText(units, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return null;
  const exact = units.find((u) => String(u.name || '').toLowerCase() === q);
  if (exact) return exact;
  const partial = units.filter((u) => String(u.name || '').toLowerCase().includes(q));
  return partial.length === 1 ? partial[0] : null;
}

function emptyFormValues() {
  return {
    unit_id: '',
    employee_id: '',
    incident_type: '',
    incident_reason: '',
    has_coverage: '',
    date: limaTodayIso(),
  };
}

function cleanSelectId(value) {
  const text = optionValue(value);
  if (!text || text === 'pending') return '';
  return text;
}

function formValuesFromContext(ctx = {}) {
  return {
    unit_id: cleanSelectId(ctx.unit_id),
    employee_id: cleanSelectId(ctx.employee_id),
    incident_type: optionValue(ctx.incident_type),
    incident_reason: optionValue(ctx.incident_reason),
    has_coverage: optionValue(ctx.has_coverage),
    date: isoDate(optionValue(ctx.date) || optionValue(ctx.incident_date)) || limaTodayIso(),
  };
}

/** Solo strings: Mattermost rechaza el botón si el context no es JSON plano. */
function formContext(state, values, action) {
  return {
    action: String(action || ''),
    state: String(state || ''),
    unit_id: String(values.unit_id || ''),
    employee_id: String(values.employee_id || ''),
    incident_type: String(values.incident_type || ''),
    incident_reason: String(values.incident_reason || ''),
    has_coverage: String(values.has_coverage || ''),
    date: String(values.date || limaTodayIso()),
  };
}

function submissionFromValues(values) {
  const date = isoDate(values?.date) || limaTodayIso();
  return {
    unit_id: cleanSelectId(values?.unit_id),
    employee_id: cleanSelectId(values?.employee_id),
    incident_type: optionValue(values?.incident_type),
    incident_reason: optionValue(values?.incident_reason),
    has_coverage: optionValue(values?.has_coverage),
    date,
    incident_date: date,
  };
}

const faltaDrafts = new Map();
const FALTA_DRAFT_TTL_MS = 15 * 60 * 1000;

function faltaDraftKey(userId, channelId) {
  return `${userId || ''}:${channelId || ''}`;
}

function rememberFaltaDraft(userId, channelId, values) {
  if (!userId) return;
  faltaDrafts.set(faltaDraftKey(userId, channelId), {
    at: Date.now(),
    values: formContext('', values, ''),
  });
}

function recallFaltaDraft(userId, channelId) {
  const key = faltaDraftKey(userId, channelId);
  const row = faltaDrafts.get(key);
  if (!row) return null;
  if (Date.now() - row.at > FALTA_DRAFT_TTL_MS) {
    faltaDrafts.delete(key);
    return null;
  }
  return formValuesFromContext(row.values);
}

function forgetFaltaDraft(userId, channelId) {
  faltaDrafts.delete(faltaDraftKey(userId, channelId));
}

function mergeFormValues(primary, fallback) {
  const pick = (key) => {
    const current = optionValue(primary?.[key]);
    if (current && current !== 'pending') return current;
    const previous = optionValue(fallback?.[key]);
    if (previous && previous !== 'pending') return previous;
    return '';
  };
  return formValuesFromContext({
    unit_id: pick('unit_id'),
    employee_id: pick('employee_id'),
    incident_type: pick('incident_type'),
    incident_reason: pick('incident_reason'),
    has_coverage: pick('has_coverage'),
    date: pick('date') || limaTodayIso(),
  });
}

function summaryLine(values, units, workers) {
  const unitName = units.find((u) => u.id === values.unit_id)?.name || (values.unit_id ? 'Unidad elegida' : '—');
  const worker = workers.find((w) => w.id === values.employee_id);
  const workerName = worker ? workerCardName(worker) : values.employee_id ? 'Operario elegido' : '—';
  return [
    `Unidad: **${unitName}**`,
    `Operario: **${workerName}**`,
    `Tipo: **${labelOf(INCIDENT_TYPES, values.incident_type, '—')}**`,
    `Motivo: **${labelOf(INCIDENT_REASONS, values.incident_reason, '—')}**`,
    `Cobertura: **${labelOf(COVERAGE_OPTIONS, values.has_coverage, '—')}**`,
  ].join(' · ');
}

function selectAction({ id, name, actionUrl, state, values, action, options, defaultOption }) {
  const menu = {
    id,
    name,
    type: 'select',
    integration: {
      url: actionUrl,
      context: formContext(state, values, action),
    },
    options,
  };
  if (defaultOption && options.some((option) => option.value === defaultOption)) {
    menu.default_option = defaultOption;
  }
  return menu;
}

const FALTA_UNIT_CAP = 400;
const FALTA_WORKER_CAP = 100;
const FALTA_POST_MAX_BYTES = 48_000;
const faltaRegisterLocks = new Set();

function workerActionId(unitId) {
  const compact = String(unitId || '').replace(/[^a-zA-Z0-9]/g, '');
  return compact ? `w${compact}` : 'setworker';
}

function clipOptionText(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '—';
  return value.length > 48 ? `${value.slice(0, 47)}…` : value;
}

function menuOptions(options, selectedValue, max = FALTA_UNIT_CAP) {
  const clean = (options || []).filter((option) => option && option.value && option.text);
  const selected = selectedValue ? clean.find((option) => option.value === selectedValue) : null;
  const rest = clean.filter((option) => option.value !== selectedValue);
  return [...(selected ? [selected] : []), ...rest].slice(0, max);
}

function registrarButton({ actionUrl, state, values }) {
  return {
    id: 'registrar',
    name: 'Registrar',
    type: 'button',
    style: 'primary',
    integration: {
      url: actionUrl,
      context: formContext(state, values, FORM_ACTIONS.register),
    },
  };
}

function workerOptionsForForm(workers, unitId, selectedId) {
  if (!unitId) {
    return [{ text: 'Elija la unidad', value: 'pending' }];
  }
  const options = workerSelectOptions(workers).map((option) => ({
    text: clipOptionText(option.text),
    value: option.value,
  }));
  if (!options.length) {
    return [{ text: 'Sin operarios en esta unidad', value: 'pending' }];
  }
  return options;
}

function ephemeralFaltaForm({ actionUrl, state, units, workers, values, hint, unitQuery, unitMax = FALTA_UNIT_CAP, workerMax = FALTA_WORKER_CAP }) {
  const query = String(unitQuery || '').trim().toLowerCase();
  let unitRows = units;
  if (query) {
    const matched = units.filter((unit) => String(unit.name || '').toLowerCase().includes(query));
    if (matched.length) unitRows = matched;
  }
  const unitOptions = menuOptions(
    unitRows.map((unit) => ({
      text: clipOptionText(unit.name || 'Unidad'),
      value: unit.id,
    })),
    values.unit_id,
    unitMax,
  );
  const truncatedUnits = unitRows.length > unitOptions.length;
  const truncatedWorkers = Boolean(values.unit_id) && workers.length > workerMax;
  const intro =
    hint ||
    'Complete los desplegables y pulse **Registrar**. Las fotos o CITT se adjuntan después, respondiendo al hilo.';
  const extra = [
    truncatedUnits ? `Hay más unidades. Use /falta seguido de parte del nombre.` : '',
    truncatedWorkers ? `Hay más operarios. Use /falta seguido del DNI.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    response_type: 'ephemeral',
    text: `${intro}${extra ? ` ${extra}` : ''}\n\n${summaryLine(values, units, workers)}`,
    attachments: [
      {
        fallback: 'Unidad, operario y tipo',
        color: '#0f766e',
        actions: [
          selectAction({
            id: 'setunit',
            name: 'Unidad',
            actionUrl,
            state,
            values,
            action: FORM_ACTIONS.unit,
            options: unitOptions,
            defaultOption: values.unit_id,
          }),
          selectAction({
            id: workerActionId(values.unit_id),
            name: 'Trabajador',
            actionUrl,
            state,
            values,
            action: FORM_ACTIONS.worker,
            options: menuOptions(
              workerOptionsForForm(workers, values.unit_id, values.employee_id),
              values.employee_id,
              workerMax,
            ),
            defaultOption: values.employee_id,
          }),
          selectAction({
            id: 'settype',
            name: 'Tipo',
            actionUrl,
            state,
            values,
            action: FORM_ACTIONS.type,
            options: INCIDENT_TYPES,
            defaultOption: values.incident_type,
          }),
        ],
      },
      {
        fallback: 'Motivo, cobertura y registro',
        color: '#0f766e',
        actions: [
          selectAction({
            id: 'setreason',
            name: 'Motivo',
            actionUrl,
            state,
            values,
            action: FORM_ACTIONS.reason,
            options: INCIDENT_REASONS,
            defaultOption: values.incident_reason,
          }),
          selectAction({
            id: 'setcoverage',
            name: 'Cobertura',
            actionUrl,
            state,
            values,
            action: FORM_ACTIONS.coverage,
            options: COVERAGE_OPTIONS,
            defaultOption: values.has_coverage,
          }),
          registrarButton({ actionUrl, state, values }),
        ],
      },
    ],
  };
}

let unitsCache = { at: 0, rows: null };
const UNITS_CACHE_MS = 5 * 60_000;

async function cachedActiveUnits() {
  const now = Date.now();
  if (unitsCache.rows && now - unitsCache.at < UNITS_CACHE_MS) return unitsCache.rows;
  const rows = await listActiveUnits();
  unitsCache = { at: now, rows };
  return rows;
}

function buildFaltaForm(args) {
  let unitMax = FALTA_UNIT_CAP;
  let workerMax = FALTA_WORKER_CAP;
  let form = ephemeralFaltaForm({ ...args, unitMax, workerMax });
  while (
    Buffer.byteLength(JSON.stringify(form)) > FALTA_POST_MAX_BYTES &&
    (unitMax > 25 || workerMax > 10)
  ) {
    if (workerMax > 10) workerMax = Math.max(10, workerMax - 10);
    else unitMax = Math.max(25, unitMax - 25);
    form = ephemeralFaltaForm({ ...args, unitMax, workerMax });
  }
  return { form, unitMax, workerMax };
}

function sendFaltaResponse(res, body, label) {
  const bytes = Buffer.byteLength(JSON.stringify(body));
  console.log(`📦 /falta ${label}: ${bytes} bytes`);
  sendJson(res, 200, body);
}

async function workersForForm(unitId, workerQuery) {
  if (unitId) {
    if (!workerQuery) return listWorkersForUnitSelect(unitId, FALTA_WORKER_CAP + 1);
    const workers = await listActiveWorkers(unitId);
    return filterWorkers(workers, workerQuery).slice(0, FALTA_WORKER_CAP + 1);
  }
  if (workerQuery) return filterWorkers(await listActiveWorkers(), workerQuery);
  return [];
}

function formUpdateResponse(form, { postId, channelId, extraText } = {}) {
  const message = extraText ? `${form.text}\n\n${extraText}` : form.text;
  const update = {
    message,
    props: {
      attachments: form.attachments,
    },
  };
  if (postId) update.id = String(postId);
  if (channelId) update.channel_id = String(channelId);
  return {
    response_type: 'ephemeral',
    skip_slack_parsing: true,
    update,
  };
}

function clearedEphemeralResponse({ postId, channelId, message } = {}) {
  const update = {
    message: message || 'Registrando la falta…',
    props: {
      attachments: [],
    },
  };
  if (postId) update.id = String(postId);
  if (channelId) update.channel_id = String(channelId);
  return {
    response_type: 'ephemeral',
    skip_slack_parsing: true,
    update,
  };
}

function cardFields({ unit, worker, values, incidentDate }) {
  const badge = coverageBadge(values.hasCoverage);
  return [
    { title: 'Unidad', value: unit?.name || values.unitId, short: true },
    { title: 'Operario', value: workerCardName(worker), short: true },
    { title: 'Tipo', value: labelOf(INCIDENT_TYPES, values.incidentType), short: true },
    { title: 'Motivo', value: labelOf(INCIDENT_REASONS, values.incidentReason), short: true },
    {
      title: 'Cobertura',
      value: `${badge.emoji} ${badge.text}`,
      short: true,
    },
    {
      title: 'Fecha',
      value: incidentDate || limaTodayIso(),
      short: true,
    },
  ];
}

function incidentEditAction(incidentId) {
  return {
    id: 'modificar',
    name: '✏️ Modificar',
    type: 'button',
    integration: {
      url: mattermostIncidentActionUrl(),
      context: {
        incident_id: String(incidentId),
        action: 'edit',
      },
    },
  };
}

function incidentCardMessage({ incidentType, workerName, modified }) {
  const note = modified ? ' (Modificado)' : '';
  return `📋 Falta de asistencia${note} · ${labelOf(INCIDENT_TYPES, incidentType)} · ${workerName}`;
}

function incidentCardAttachment({ incidentId, unit, worker, values, incidentDate, reporter, modified }) {
  const badge = coverageBadge(values.hasCoverage);
  const fields = cardFields({ unit, worker, values, incidentDate });
  if (values.observations) {
    fields.push({ title: 'Observaciones', value: values.observations, short: false });
  }
  const note = modified ? ' (Modificado)' : '';
  return {
    fallback: `Falta ${values.incidentType} — ${workerCardName(worker)}`,
    color: badge.color,
    title: `Falta de asistencia${note}`,
    text: '📎 Para adjuntar certificados o fotos, responda a este hilo.',
    fields,
    footer: `OpsFlow · ${String(incidentId).slice(0, 8)} · reportó ${reporter || 'supervisor'}${modified ? ' · (Modificado)' : ''}`,
    actions: [incidentEditAction(incidentId)],
  };
}

async function resolveTeamName(teamId, fallbackDomain) {
  const cfg = loadConfig();
  if (cfg.teamName) return cfg.teamName;
  if (fallbackDomain) return fallbackDomain;
  if (!teamId) return '';
  try {
    const team = await getTeam(teamId);
    return team?.name || '';
  } catch (err) {
    console.warn('⚠️  No se pudo resolver team name Mattermost:', err instanceof Error ? err.message : err);
    return '';
  }
}

async function ingestFilesForIncident(incident, { fileIds, postId, username }) {
  if (!incident || !fileIds?.length) return { saved: 0, skipped: 0 };
  let saved = 0;
  let skipped = 0;
  for (const fileId of fileIds) {
    if (await attachmentExists(fileId)) {
      skipped += 1;
      continue;
    }
    const info = await getFileInfo(fileId).catch(() => ({}));
    const downloaded = await downloadFile(fileId);
    await saveAttachment({
      incidentId: incident.id,
      mattermostFileId: fileId,
      mattermostPostId: postId,
      fileName: info.name || `archivo-${fileId}`,
      mimeType: info.mime_type || downloaded.mime,
      buffer: downloaded.buffer,
      uploadedByUsername: username || info.user_id || null,
    });
    saved += 1;
  }
  return { saved, skipped };
}

async function ingestFromPostLike({ postId, rootId, fileIds, userName }) {
  const ids = extractFileIds(fileIds);
  if (!ids.length) return { ignored: true, reason: 'sin_archivos' };
  const threadRoot = rootId || postId;
  if (!threadRoot) return { ignored: true, reason: 'sin_root' };
  const incident = await findIncidentByPostId(threadRoot);
  if (!incident) return { ignored: true, reason: 'hilo_no_rastreado' };
  const result = await ingestFilesForIncident(incident, {
    fileIds: ids,
    postId,
    username: userName,
  });
  return { ignored: false, incidentId: incident.id, ...result };
}

function registerPreviewError(submission) {
  const parsed = validateSubmission(submission || {});
  const incidentDate = isoDate(submission?.date || submission?.incident_date) || limaTodayIso();
  const dateError = validateIncidentDate(incidentDate);
  if (dateError) return dateError;
  if (!parsed.ok) return Object.values(parsed.errors)[0] || 'Complete todos los desplegables.';
  if (!isUuid(parsed.values.unitId)) return 'Seleccione la unidad / sede operativa.';
  if (!parsed.values.employeeId || !isUuid(parsed.values.employeeId)) return 'Seleccione el trabajador.';
  return '';
}

async function notifyRegistrar(userId, channelId, message) {
  if (!userId || !channelId || !message) return;
  try {
    await createEphemeralPost(userId, { channel_id: channelId, message });
  } catch (err) {
    console.warn('⚠️  Ephemeral Mattermost:', err instanceof Error ? err.message : err);
  }
}

async function completeFaltaRegistration({ res, payload, stateCheck, values, actionStarted }) {
  const channelId = payload.channel_id || stateCheck.payload.channel_id;
  const userId = payload.user_id || stateCheck.payload.user_id;
  const teamId = payload.team_id || stateCheck.payload.team_id;
  const userName = payload.user_name || stateCheck.payload.user_name;
  const submission = submissionFromValues(values);
  const lockKey = `${userId || ''}:${payload.post_id || channelId || ''}`;
  if (faltaRegisterLocks.has(lockKey)) {
    sendJson(res, 200, {
      response_type: 'ephemeral',
      ephemeral_text: 'Ya se está registrando. No pulse de nuevo.',
    });
    return;
  }

  const previewError = registerPreviewError(submission);
  if (previewError) {
    sendJson(res, 200, {
      response_type: 'ephemeral',
      ephemeral_text: previewError,
    });
    return;
  }

  faltaRegisterLocks.add(lockKey);
  // El formulario es efímero: Mattermost 11 no lo guarda y UpdatePost falla.
  // Un `update` haría que el clic se vea como error aunque el registro siga.
  sendJson(res, 200, {
    response_type: 'ephemeral',
    skip_slack_parsing: true,
    ephemeral_text: 'Registrando la falta… El resumen se publicará en el canal.',
  });
  console.log(`✅ /falta botón respondido en ${Date.now() - actionStarted}ms`, {
    unit_id: Boolean(submission.unit_id),
    employee_id: Boolean(submission.employee_id),
    incident_type: submission.incident_type || null,
    date: submission.date,
  });

  try {
    const saved = await saveFalta({
      submission,
      channelId,
      userId,
      teamId,
      userName,
    });
    if (!saved.ok) {
      rememberFaltaDraft(userId, channelId, values);
      await notifyRegistrar(userId, channelId, saved.error);
      return;
    }

    forgetFaltaDraft(userId, channelId);
    console.log(`✅ /falta guardada en ${Date.now() - actionStarted}ms`);

    try {
      await publishFaltaCard({
        incident: saved.incident,
        unit: saved.unit,
        worker: saved.worker,
        values: saved.values,
        channelId,
        userId,
        teamId,
        userName,
      });
      console.log(`✅ /falta publicada en el canal en ${Date.now() - actionStarted}ms`);
    } catch (err) {
      console.error('❌ Publicar tarjeta Mattermost:', err);
      await notifyRegistrar(
        userId,
        channelId,
        'La falta se guardó en OpsFlow, pero no se pudo publicar el resumen en el canal. ' +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  } catch (err) {
    console.error('❌ /falta register:', err);
    await notifyRegistrar(
      userId,
      channelId,
      `No se pudo registrar la falta: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    faltaRegisterLocks.delete(lockKey);
  }
}

async function handleInteractiveAction(req, res, body) {
  const actionStarted = Date.now();
  try {
    const cfg = loadConfig();
    const payload = interactivePayload(body) || body;
    const action = payload.context?.action || payload.context?.Action || '';
    const selected = selectedUnitFromAction(payload);
    const stateRaw = payload.context?.state || payload.state || '';
    const stateCheck = verifyState(stateRaw, cfg.stateSecret);

    console.log('📩 Mattermost action', {
      type: payload.type || action || 'unknown',
      action,
      selected: selected || null,
      contextKeys: Object.keys(payload.context || {}),
      postId: payload.post_id || null,
    });

    if (!stateCheck.ok) {
      sendJson(res, 200, {
        response_type: 'ephemeral',
        ephemeral_text: stateCheck.error || 'El formulario expiró. Ejecute /falta de nuevo.',
      });
      return;
    }

    const userId = payload.user_id || stateCheck.payload.user_id;
    const channelId = payload.channel_id || stateCheck.payload.channel_id;
    let values = mergeFormValues(formValuesFromContext(payload.context || {}), recallFaltaDraft(userId, channelId));

    if (action === FORM_ACTIONS.register || action === UNIT_CONTINUE_ACTION) {
      await completeFaltaRegistration({
        res,
        payload,
        stateCheck,
        values,
        actionStarted,
      });
      return;
    }

    const actionUrl = interactiveActionUrl();
    const pickingUnit = action === FORM_ACTIONS.unit || action === UNIT_PICKER_ACTION;
    const prefetchUnitId = pickingUnit ? selected || values.unit_id : values.unit_id;
    const [units, prefetchedWorkers] = await Promise.all([
      cachedActiveUnits(),
      prefetchUnitId ? listWorkersForUnitSelect(prefetchUnitId, FALTA_WORKER_CAP + 1) : Promise.resolve([]),
    ]);

    if (action === FORM_ACTIONS.unit || action === UNIT_PICKER_ACTION) {
      const unit =
        (selected && units.find((u) => u.id === selected)) ||
        matchUnitByText(units, selected);
      if (unit) {
        if (values.unit_id !== unit.id) values.employee_id = '';
        values.unit_id = unit.id;
      }
    } else if (action === FORM_ACTIONS.worker) {
      if (selected && selected !== 'pending') values.employee_id = selected;
    } else if (action === FORM_ACTIONS.type) {
      if (selected) values.incident_type = selected;
    } else if (action === FORM_ACTIONS.reason) {
      if (selected) values.incident_reason = selected;
    } else if (action === FORM_ACTIONS.coverage) {
      if (selected) values.has_coverage = selected;
    } else if (payload.type === 'select' && selected) {
      const unit = units.find((u) => u.id === selected) || matchUnitByText(units, selected);
      if (unit) {
        if (values.unit_id !== unit.id) values.employee_id = '';
        values.unit_id = unit.id;
      }
    }

    values = formValuesFromContext(values);
    rememberFaltaDraft(userId, channelId, values);

    const workers =
      values.unit_id && values.unit_id === prefetchUnitId
        ? prefetchedWorkers
        : await workersForForm(values.unit_id);

    if (pickingUnit && !values.unit_id) {
      console.warn('⚠️  /falta unidad no reconocida', {
        selected: selected || null,
        contextKeys: Object.keys(payload.context || {}),
      });
      sendJson(res, 200, {
        response_type: 'ephemeral',
        ephemeral_text: 'No se reconoció la unidad. Ejecute /falta de nuevo y vuelva a elegirla.',
      });
      return;
    }

    const { form, unitMax, workerMax } = buildFaltaForm({
      actionUrl,
      state: stateRaw,
      units,
      workers,
      values,
    });
    sendFaltaResponse(
      res,
      formUpdateResponse(form, { postId: payload.post_id, channelId }),
      `${action || 'accion'} unidades=${Math.min(units.length, unitMax)} operarios=${Math.min(workers.length, workerMax)}`,
    );
    console.log(
      `✅ /falta ${action || payload.type || 'action'} respondido en ${Date.now() - actionStarted}ms (${workers.length} operarios)`,
    );
  } catch (err) {
    console.error('❌ /falta acción:', err);
    if (!res.headersSent) {
      sendJson(res, 200, {
        response_type: 'ephemeral',
        ephemeral_text: `No se pudo actualizar /falta: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

async function resolveIncidentsChannel(channelId, channelName) {
  if (isAllowedIncidentsChannel(channelId, channelName)) return true;
  if (!channelId) return false;
  try {
    const channel = await getChannel(channelId);
    return isAllowedIncidentsChannel(channel?.id || channelId, channel?.name || channelName, channel?.display_name);
  } catch (err) {
    console.warn(
      '⚠️  No se pudo leer el canal de Mattermost para /falta:',
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

async function handleCommand(req, res, body) {
  if (
    body.type === 'dialog_submission' ||
    body.payloadJson?.type === 'dialog_submission' ||
    (body.submission && typeof body.submission === 'object')
  ) {
    await handleDialogSubmit(req, res, body);
    return;
  }

  if (isInteractiveAction(body)) {
    await handleInteractiveAction(req, res, body);
    return;
  }

  if (!isSlashTokenValid(body, req.headers)) {
    sendJson(res, 401, { error: 'Token de slash command inválido' });
    return;
  }

  const channelId = body.channel_id;
  const channelName = body.channel_name;
  const allowedChannel = await resolveIncidentsChannel(channelId, channelName);
  if (!allowedChannel) {
    console.warn(
      '⚠️  /falta rechazado fuera del canal autorizado',
      JSON.stringify({ channelId: channelId || null, channelName: channelName || null }),
    );
    sendJson(res, 200, {
      response_type: 'ephemeral',
      text: '⚠️ El comando /falta solo puede ejecutarse en el canal autorizado de Novedades.',
    });
    return;
  }

  const userId = body.user_id;
  const teamId = body.team_id;
  const userName = body.user_name;
  const text = String(body.text || '').trim();
  const triggerId = String(body.trigger_id || '').trim();
  const cfg = loadConfig();

  if (!triggerId) {
    sendJson(res, 200, {
      response_type: 'ephemeral',
      text: 'No se pudo abrir el formulario. Ejecute /falta de nuevo.',
    });
    return;
  }

  try {
    const units = await cachedActiveUnits();
    if (!units.length) {
      sendJson(res, 200, {
        response_type: 'ephemeral',
        text: 'No hay unidades operativas activas en OpsFlow.',
      });
      return;
    }

    const values = emptyFormValues();
    const unitFromText = matchUnitByText(units, text);
    const workers = unitFromText ? await listWorkersForUnitSelect(unitFromText.id, FALTA_WORKER_CAP) : [];
    if (unitFromText) values.unit_id = unitFromText.id;

    const state = signState(
      { channel_id: channelId, user_id: userId, team_id: teamId, user_name: userName, ts: Date.now() },
      cfg.stateSecret,
    );
    await openDialog({
      triggerId,
      url: mattermostDialogSubmitUrl(),
      dialog: buildFaltaDialog({ state, units, workers, values }),
    });
    console.log(`🔗 /falta ventana abierta (${units.length} unidades)`);
    sendJson(res, 200, {});
  } catch (err) {
    console.error('❌ /falta formulario:', err);
    sendJson(res, 200, {
      response_type: 'ephemeral',
      text: `No se pudo mostrar el formulario de /falta: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function saveFalta({ submission, channelId, userId, teamId, userName }) {
  const parsed = validateSubmission(submission || {});
  const incidentDate = isoDate(submission?.date || submission?.incident_date) || limaTodayIso();
  const dateError = validateIncidentDate(incidentDate);
  if (dateError) {
    return { ok: false, error: dateError, errors: { date: dateError, incident_date: dateError } };
  }
  if (!parsed.ok) {
    const first = Object.values(parsed.errors)[0] || 'Complete todos los desplegables.';
    return { ok: false, error: first, errors: parsed.errors };
  }
  if (parsed.values.employeeId && !isUuid(parsed.values.employeeId)) {
    return {
      ok: false,
      error: 'Seleccione el trabajador.',
      errors: { employee_id: 'Seleccione el trabajador.' },
    };
  }
  if (!isUuid(parsed.values.unitId)) {
    return {
      ok: false,
      error: 'Seleccione la unidad / sede operativa.',
      errors: { unit_id: 'Seleccione la unidad / sede operativa.' },
    };
  }

  let unit;
  let worker;
  try {
    [unit, worker] = await Promise.all([
      getUnitById(parsed.values.unitId),
      parsed.values.employeeId ? getWorkerById(parsed.values.employeeId) : Promise.resolve(null),
    ]);
  } catch (err) {
    console.error('❌ consultar unidad/operario:', err);
    return {
      ok: false,
      error: `No se pudo consultar OpsFlow: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!worker && parsed.values.employeeQuery) {
    try {
      const candidates = filterWorkers(await listActiveWorkers(parsed.values.unitId), parsed.values.employeeQuery);
      const dniExact = candidates.filter(
        (row) => String(row.dni || '').replace(/\D/g, '') === String(parsed.values.employeeQuery).replace(/\D/g, ''),
      );
      if (dniExact.length === 1) worker = dniExact[0];
      else if (candidates.length === 1) worker = candidates[0];
      else if (candidates.length > 1) {
        return {
          ok: false,
          error: `Hay ${candidates.length} coincidencias. Use el DNI completo.`,
          errors: { employee_query: 'Use el DNI completo.' },
        };
      }
    } catch (err) {
      console.error('❌ buscar operario:', err);
      return {
        ok: false,
        error: `No se pudo consultar el trabajador: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  if (!unit || !isUnitOk(unit)) {
    return {
      ok: false,
      error: 'La unidad no existe o no está operativa.',
      errors: { unit_id: 'La unidad no existe o no está operativa.' },
    };
  }
  if (!worker || worker.type !== 'Personal') {
    return {
      ok: false,
      error: 'El trabajador no existe o no está activo en esa unidad.',
      errors: { employee_id: 'El trabajador no existe o no está activo en esa unidad.' },
    };
  }
  if (worker.archived === true || ['cesado', 'archivado'].includes(String(worker.personnel_status || '').toLowerCase())) {
    return { ok: false, error: 'El trabajador no está activo.', errors: { employee_id: 'El trabajador no está activo.' } };
  }
  if (worker.unit_id !== parsed.values.unitId && worker.is_shared !== true) {
    return {
      ok: false,
      error: 'El trabajador no pertenece a la unidad seleccionada.',
      errors: { employee_id: 'El trabajador no pertenece a la unidad seleccionada.' },
    };
  }

  let incident;
  try {
    incident = await createIncident({
      ...parsed.values,
      employeeId: worker.id,
      incidentDate,
      reportedBy: userName ? `@${String(userName).replace(/^@/, '')}` : userId,
      reportedByUserId: userId,
      channelId,
      teamId,
    });
  } catch (err) {
    console.error('❌ createIncident:', err);
    return {
      ok: false,
      error: `No se pudo guardar la incidencia en OpsFlow: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    ok: true,
    incident,
    unit,
    worker,
    values: { ...parsed.values, incidentDate },
  };
}

async function publishFaltaCard({ incident, unit, worker, values, channelId, teamId, userName }) {
  void syncIncidentToAttendance(incident).catch((err) => {
    console.error('❌ No se reflejó la falta en la asistencia:', err);
  });

  const reporter = userName ? `@${String(userName).replace(/^@/, '')}` : 'supervisor';
  const attachment = incidentCardAttachment({
    incidentId: incident.id,
    unit,
    worker,
    values,
    incidentDate: incident.incident_date || values.incidentDate || limaTodayIso(),
    reporter,
    modified: false,
  });
  const post = await createPost({
    channel_id: channelId,
    message: incidentCardMessage({
      incidentType: values.incidentType,
      workerName: workerCardName(worker),
      modified: false,
    }),
    props: {
      attachments: [attachment],
    },
  });
  const teamName = await resolveTeamName(teamId, null);
  const permalink = buildPermalink(teamName, post.id);
  await updateIncidentPost(incident.id, { postId: post.id, permalink, channelId, teamId });
  const attachHint =
    'Para adjuntar fotos o CITT, responde con la imagen a este hilo' + (permalink ? `: ${permalink}` : '.');
  return { post, permalink, attachHint };
}

async function saveAndPublishFalta({ submission, channelId, userId, teamId, userName }) {
  const saved = await saveFalta({ submission, channelId, userId, teamId, userName });
  if (!saved.ok) return saved;

  try {
    const published = await publishFaltaCard({
      incident: saved.incident,
      unit: saved.unit,
      worker: saved.worker,
      values: saved.values,
      channelId,
      teamId,
      userName,
    });
    return { ok: true, ...saved, ...published };
  } catch (err) {
    console.error('❌ Publicar tarjeta Mattermost:', err);
    return {
      ok: true,
      incident: saved.incident,
      unit: saved.unit,
      worker: saved.worker,
      attachHint:
        'La incidencia se guardó en OpsFlow, pero no se pudo publicar la tarjeta en el canal. ' +
        (err instanceof Error ? err.message : String(err)),
    };
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function isMattermostUserId(value) {
  return /^[a-z0-9]{20,36}$/i.test(String(value || ''));
}

function isoDate(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function pinSelectOptions(options, currentValue, currentText, max = SELECT_OPTIONS_MAX) {
  const cleaned = (options || []).filter((option) => option && option.value && option.text);
  const existing = cleaned.find((option) => option.value === currentValue);
  const rest = cleaned.filter((option) => option.value !== currentValue);
  const head = existing
    ? [existing]
    : currentValue
      ? [{ text: String(currentText || currentValue).slice(0, 100), value: String(currentValue) }]
      : [];
  return [...head, ...rest].slice(0, max);
}

function selectDialogElement({ displayName, name, options, defaultValue, helpText, refresh = false }) {
  const element = {
    display_name: displayName,
    name,
    type: 'select',
    options,
  };
  if (refresh) element.refresh = true;
  if (helpText) element.help_text = String(helpText).slice(0, 150);
  if (defaultValue && options.some((option) => option.value === defaultValue)) {
    element.default = String(defaultValue);
  }
  return element;
}

function buildFaltaDialog({ state, units, workers, values }) {
  const unitId = cleanSelectId(values?.unit_id);
  const unitOptions = menuOptions(
    (units || []).map((unit) => ({
      text: clipOptionText(unit.name || 'Unidad'),
      value: unit.id,
    })),
    unitId,
    FALTA_UNIT_CAP,
  );
  const workerOptions = unitId
    ? menuOptions(
        workerSelectOptions(workers || []).map((option) => ({
          text: clipOptionText(option.text),
          value: option.value,
        })),
        cleanSelectId(values?.employee_id),
        FALTA_WORKER_CAP,
      )
    : [];
  const shownWorkers = workerOptions.filter((option) => option.value !== 'pending');
  const employeeOptions = shownWorkers.length
    ? shownWorkers
    : [{ text: unitId ? 'Sin trabajadores activos en esta unidad' : 'Elija primero la unidad', value: 'pending' }];
  const unitName = (units || []).find((unit) => unit.id === unitId)?.name || '';

  return {
    callback_id: DIALOG_CALLBACK_ID,
    title: 'Registrar falta',
    introduction_text: unitId
      ? shownWorkers.length
        ? `${unitName || 'Unidad'}: ${shownWorkers.length} trabajador${shownWorkers.length === 1 ? '' : 'es'} activo${shownWorkers.length === 1 ? '' : 's'}.`
        : `${unitName || 'Esta unidad'} no tiene trabajadores activos.`
      : 'Elija la unidad. El campo Trabajador mostrará los operarios activos de esa unidad.',
    submit_label: 'Registrar',
    notify_on_cancel: false,
    state,
    source_url: mattermostDialogSubmitUrl(),
    elements: [
      selectDialogElement({
        displayName: 'Unidad',
        name: 'unit_id',
        options: unitOptions,
        defaultValue: unitId,
        refresh: true,
        helpText: 'Al elegir la unidad se cargan sus trabajadores activos.',
      }),
      selectDialogElement({
        displayName: 'Trabajador',
        name: 'employee_id',
        options: employeeOptions,
        defaultValue: cleanSelectId(values?.employee_id),
        helpText: unitId ? 'Operarios activos de la unidad elegida.' : 'Disponible después de elegir la unidad.',
      }),
      selectDialogElement({
        displayName: 'Tipo',
        name: 'incident_type',
        options: INCIDENT_TYPES,
        defaultValue: values?.incident_type,
      }),
      selectDialogElement({
        displayName: 'Motivo',
        name: 'incident_reason',
        options: INCIDENT_REASONS,
        defaultValue: values?.incident_reason,
      }),
      selectDialogElement({
        displayName: 'Cobertura',
        name: 'has_coverage',
        options: COVERAGE_OPTIONS,
        defaultValue: values?.has_coverage,
      }),
    ],
  };
}

function coverageLabel(value) {
  const badge = coverageBadge(value);
  return `${badge.emoji} ${badge.text}`;
}

function displayOrDash(value) {
  const text = String(value || '').trim();
  return text || '—';
}

function canEditIncident(incident, userId, isAdmin) {
  if (!incident) return { ok: false, error: 'No se encontró la novedad.' };
  if (isFinalIncidentStatus(incident.status)) {
    return { ok: false, error: 'Esta novedad ya fue clasificada y no se puede modificar.' };
  }
  const ownerId = String(incident.reported_by_user_id || '');
  if (isAdmin || (ownerId && ownerId === userId)) return { ok: true };
  return { ok: false, error: 'Solo quien registró la novedad o un administrador puede modificarla.' };
}

function rolesInclude(roles, role) {
  return String(roles || '')
    .split(/\s+/)
    .includes(role);
}

async function userIsMattermostAdmin(userId, teamId) {
  const cfg = loadConfig();
  if (cfg.adminUserIds.includes(userId)) return true;
  try {
    const user = await getUser(userId);
    if (rolesInclude(user?.roles, 'system_admin')) return true;
  } catch (err) {
    console.warn('⚠️  Roles Mattermost:', err instanceof Error ? err.message : err);
  }
  if (!teamId) return false;
  try {
    const member = await getTeamMember(teamId, userId);
    return rolesInclude(member?.roles, 'team_admin');
  } catch (err) {
    console.warn('⚠️  Membresía Mattermost:', err instanceof Error ? err.message : err);
    return false;
  }
}

async function buildEditDialog(incident, actor) {
  const cfg = loadConfig();
  const [units, workers, unit, worker] = await Promise.all([
    listActiveUnits(),
    listActiveWorkers(incident.unit_id),
    getUnitById(incident.unit_id),
    getWorkerById(incident.employee_id),
  ]);
  const unitOptions = pinSelectOptions(
    units.map((row) => ({ text: String(row.name || 'Unidad').slice(0, 100), value: row.id })),
    incident.unit_id,
    unit?.name || 'Unidad actual',
  );
  const workerOptions = pinSelectOptions(
    workerSelectOptions(workers),
    incident.employee_id,
    worker ? formatWorkerLabel(worker) : 'Operario actual',
  );
  const incidentDate = isoDate(incident.incident_date) || limaTodayIso();
  const observations = String(incident.observations || '').slice(0, 2000);

  return {
    callback_id: EDIT_DIALOG_CALLBACK_ID,
    title: 'Modificar novedad',
    introduction_text:
      'Los campos muestran los valores actuales. Al guardar, la tarjeta se actualiza y el hilo registra qué cambió.',
    submit_label: 'Guardar',
    notify_on_cancel: false,
    state: signState(
      {
        intent: 'edit',
        incident_id: incident.id,
        user_id: actor.userId,
        user_name: actor.userName || '',
        channel_id: actor.channelId || '',
        team_id: actor.teamId || '',
        ts: Date.now(),
      },
      cfg.stateSecret,
    ),
    elements: [
      selectDialogElement({
        displayName: 'Unidad',
        name: 'unit_id',
        options: unitOptions,
        defaultValue: incident.unit_id,
        helpText: 'Si cambia la unidad, elija un operario de esa unidad.',
      }),
      selectDialogElement({
        displayName: 'Trabajador',
        name: 'employee_id',
        options: workerOptions,
        defaultValue: incident.employee_id,
        helpText:
          workers.length > SELECT_OPTIONS_MAX
            ? `Se muestran ${SELECT_OPTIONS_MAX} operarios de la unidad actual.`
            : 'Operarios de la unidad actual.',
      }),
      selectDialogElement({
        displayName: 'Tipo',
        name: 'incident_type',
        options: INCIDENT_TYPES,
        defaultValue: incident.incident_type,
      }),
      selectDialogElement({
        displayName: 'Motivo',
        name: 'incident_reason',
        options: INCIDENT_REASONS,
        defaultValue: incident.incident_reason,
      }),
      selectDialogElement({
        displayName: 'Cobertura',
        name: 'has_coverage',
        options: COVERAGE_OPTIONS,
        defaultValue: incident.has_coverage,
      }),
      {
        display_name: 'Fecha',
        name: 'incident_date',
        type: 'text',
        default: incidentDate,
        help_text: 'Formato AAAA-MM-DD.',
        placeholder: 'AAAA-MM-DD',
      },
      {
        display_name: 'Observaciones',
        name: 'observations',
        type: 'textarea',
        optional: true,
        ...(observations ? { default: observations } : {}),
        help_text: 'Opcional. Máximo 2000 caracteres.',
      },
    ],
  };
}

async function handleIncidentAction(req, res, body) {
  const payload = interactivePayload(body) || body;
  const triggerId = String(payload.trigger_id || '').trim();
  const userId = String(payload.user_id || '').trim();
  const context = payload.context && typeof payload.context === 'object' ? payload.context : {};
  const action = String(context.action || '');
  const incidentId = String(context.incident_id || '').trim();

  if (!triggerId || triggerId.length > 4096) {
    sendJson(res, 200, { ephemeral_text: 'La acción expiró o no incluye trigger_id. Pulse Modificar de nuevo.' });
    return;
  }
  if (!isMattermostUserId(userId)) {
    sendJson(res, 200, { ephemeral_text: 'No se pudo identificar al usuario de Mattermost.' });
    return;
  }
  if (action !== 'edit' || !isUuid(incidentId)) {
    sendJson(res, 200, { ephemeral_text: 'La acción de la tarjeta no es válida.' });
    return;
  }

  let incident;
  try {
    incident = await getIncidentById(incidentId);
  } catch (err) {
    console.error('❌ getIncidentById:', err);
    sendJson(res, 200, { ephemeral_text: 'No se pudo consultar la novedad en OpsFlow.' });
    return;
  }
  if (!incident) {
    sendJson(res, 200, { ephemeral_text: 'No se encontró la novedad.' });
    return;
  }

  const isOwner = String(incident.reported_by_user_id || '') === userId;
  const isAdmin = isOwner
    ? false
    : await userIsMattermostAdmin(userId, payload.team_id || incident.mattermost_team_id);
  const access = canEditIncident(incident, userId, isAdmin);
  if (!access.ok) {
    sendJson(res, 200, { ephemeral_text: access.error });
    return;
  }

  try {
    const dialog = await buildEditDialog(incident, {
      userId,
      userName: payload.user_name || '',
      channelId: payload.channel_id || incident.mattermost_channel_id || '',
      teamId: payload.team_id || incident.mattermost_team_id || '',
    });
    await openDialog({
      triggerId,
      url: mattermostDialogEditSubmitUrl(),
      dialog,
    });
    sendEmpty(res);
  } catch (err) {
    console.error('❌ Abrir modal de edición:', err);
    sendJson(res, 200, {
      ephemeral_text: `No se pudo abrir el formulario de modificación: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

function dialogPayload(body) {
  const payload = body?.type === 'dialog_submission' ? body : body?.payloadJson || body || {};
  let submission = payload.submission || {};
  if (typeof submission === 'string') {
    try {
      submission = JSON.parse(submission);
    } catch {
      submission = {};
    }
  }
  return { ...payload, submission };
}

async function validateEditTargets(values, incident) {
  const unit = await getUnitById(values.unitId);
  const worker = values.employeeId ? await getWorkerById(values.employeeId) : null;
  const sameEmployee = Boolean(worker && worker.id === incident.employee_id);

  if (!unit || !isUnitOk(unit)) {
    return { ok: false, errors: { unit_id: 'La unidad no existe o no está operativa.' } };
  }
  if (!worker || worker.type !== 'Personal') {
    return {
      ok: false,
      errors: { employee_id: 'El trabajador no existe o no está activo en esa unidad.' },
    };
  }
  const inactive =
    worker.archived === true ||
    ['cesado', 'archivado'].includes(String(worker.personnel_status || '').toLowerCase());
  if (inactive && !sameEmployee) {
    return { ok: false, errors: { employee_id: 'El trabajador no está activo.' } };
  }
  if (worker.unit_id !== values.unitId && worker.is_shared !== true) {
    return { ok: false, errors: { employee_id: 'El trabajador no pertenece a la unidad seleccionada.' } };
  }
  return { ok: true, unit, worker };
}

function changedFieldLines({ before, after, beforeUnit, afterUnit, beforeWorker, afterWorker }) {
  const rows = [
    ['Unidad', beforeUnit?.name || before.unit_id, afterUnit?.name || after.unit_id],
    [
      'Operario',
      beforeWorker ? workerCardName(beforeWorker) : before.employee_id,
      afterWorker ? workerCardName(afterWorker) : after.employee_id,
    ],
    ['Tipo', labelOf(INCIDENT_TYPES, before.incident_type), labelOf(INCIDENT_TYPES, after.incident_type)],
    ['Motivo', labelOf(INCIDENT_REASONS, before.incident_reason), labelOf(INCIDENT_REASONS, after.incident_reason)],
    ['Cobertura', coverageLabel(before.has_coverage), coverageLabel(after.has_coverage)],
    ['Fecha', isoDate(before.incident_date) || '—', isoDate(after.incident_date) || '—'],
    ['Observaciones', displayOrDash(before.observations), displayOrDash(after.observations)],
  ];
  return rows
    .filter(([, prev, next]) => String(prev) !== String(next))
    .map(([label, prev, next]) => `• ${label}: ${prev} → ${next}`);
}

async function replaceIncidentCard(incident, { unit, worker, values, reporter, extraText }) {
  const existing = await getPost(incident.mattermost_post_id);
  const message = incidentCardMessage({
    incidentType: values.incidentType,
    workerName: workerCardName(worker),
    modified: true,
  });
  const attachment = incidentCardAttachment({
    incidentId: incident.id,
    unit,
    worker,
    values,
    incidentDate: isoDate(incident.incident_date) || values.incidentDate,
    reporter,
    modified: true,
  });
  if (extraText) attachment.text = `${attachment.text}\n\n${extraText}`;
  const props = {
    ...(existing.props && typeof existing.props === 'object' ? existing.props : {}),
    attachments: [attachment],
  };
  const post = {
    channel_id: existing.channel_id || incident.mattermost_channel_id,
    message: extraText ? `${message}\n\n${extraText}` : message,
    props,
  };
  if (existing.user_id) post.user_id = existing.user_id;
  if (Array.isArray(existing.file_ids)) post.file_ids = existing.file_ids;
  await updatePost(incident.mattermost_post_id, post);
}

async function handleDialogEditSubmit(req, res, body) {
  const cfg = loadConfig();
  const payload = dialogPayload(body);
  if (payload?.cancelled) {
    sendEmpty(res);
    return;
  }
  if (payload?.callback_id && payload.callback_id !== EDIT_DIALOG_CALLBACK_ID) {
    sendJson(res, 200, { error: 'El formulario de edición no es válido.' });
    return;
  }

  const stateCheck = verifyState(payload?.state, cfg.stateSecret);
  if (!stateCheck.ok) {
    const expired = /expiró/.test(stateCheck.error || '');
    sendJson(res, 200, {
      error: expired ? 'El formulario expiró. Pulse Modificar de nuevo.' : stateCheck.error,
    });
    return;
  }

  const state = stateCheck.payload || {};
  if (state.intent !== 'edit' || !isUuid(state.incident_id)) {
    sendJson(res, 200, { error: 'El formulario de edición no es válido. Pulse Modificar de nuevo.' });
    return;
  }

  const userId = String(payload.user_id || '').trim();
  if (!isMattermostUserId(userId) || userId !== String(state.user_id || '')) {
    sendJson(res, 200, { error: 'El usuario que envía el formulario no coincide con quien lo abrió.' });
    return;
  }

  const parsed = validateSubmission(payload.submission || {});
  const errors = { ...(parsed.errors || {}) };
  delete errors.employee_query;
  const dateError = validateIncidentDate(payload.submission?.incident_date);
  if (dateError) errors.incident_date = dateError;
  if (!parsed.values?.employeeId) {
    errors.employee_id = errors.employee_id || 'Seleccione el trabajador.';
  }
  if (Object.keys(errors).length) {
    sendJson(res, 200, { errors });
    return;
  }

  const values = {
    ...parsed.values,
    incidentDate: isoDate(payload.submission.incident_date),
  };

  let incident;
  try {
    incident = await getIncidentById(state.incident_id);
  } catch (err) {
    console.error('❌ getIncidentById edit:', err);
    sendJson(res, 200, { error: 'No se pudo consultar la novedad en OpsFlow.' });
    return;
  }

  const isOwner = String(incident?.reported_by_user_id || '') === userId;
  const isAdmin = !incident || isOwner
    ? false
    : await userIsMattermostAdmin(userId, payload.team_id || state.team_id || incident.mattermost_team_id);
  const access = canEditIncident(incident, userId, isAdmin);
  if (!access.ok) {
    sendJson(res, 200, { error: access.error });
    return;
  }

  let targets;
  try {
    targets = await validateEditTargets(values, incident);
  } catch (err) {
    console.error('❌ validateEditTargets:', err);
    sendJson(res, 200, { error: 'No se pudo validar la unidad o el operario.' });
    return;
  }
  if (!targets.ok) {
    sendJson(res, 200, { errors: targets.errors });
    return;
  }

  let beforeWorker = targets.worker;
  let beforeUnit = targets.unit;
  try {
    if (incident.employee_id !== targets.worker.id) beforeWorker = await getWorkerById(incident.employee_id);
    if (incident.unit_id !== targets.unit.id) beforeUnit = await getUnitById(incident.unit_id);
  } catch (err) {
    console.error('❌ Nombres previos de la novedad:', err);
    sendJson(res, 200, { error: 'No se pudieron leer los valores actuales de la novedad.' });
    return;
  }

  const afterSnapshot = {
    unit_id: values.unitId,
    employee_id: targets.worker.id,
    incident_type: values.incidentType,
    incident_reason: values.incidentReason,
    has_coverage: values.hasCoverage,
    incident_date: values.incidentDate,
    observations: values.observations,
  };
  const lines = changedFieldLines({
    before: incident,
    after: afterSnapshot,
    beforeUnit,
    afterUnit: targets.unit,
    beforeWorker,
    afterWorker: targets.worker,
  });
  if (!lines.length) {
    sendJson(res, 200, { error: 'No hay cambios para guardar.' });
    return;
  }

  const previous = {
    unitId: incident.unit_id,
    employeeId: incident.employee_id,
    incidentType: incident.incident_type,
    incidentReason: incident.incident_reason,
    hasCoverage: incident.has_coverage,
    incidentDate: isoDate(incident.incident_date) || limaTodayIso(),
    observations: incident.observations || null,
  };

  let updated;
  try {
    updated = await updateIncidentDetails(incident.id, {
      unitId: values.unitId,
      employeeId: targets.worker.id,
      incidentType: values.incidentType,
      incidentReason: values.incidentReason,
      hasCoverage: values.hasCoverage,
      incidentDate: values.incidentDate,
      observations: values.observations,
    });
  } catch (err) {
    console.error('❌ updateIncidentDetails:', err);
    sendJson(res, 200, {
      error: `No se pudo actualizar la novedad: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  const userName = state.user_name || payload.user_name || '';
  const actor = userName ? `@${String(userName).replace(/^@/, '')}` : userId;
  const comment = `✏️ (Modificado) por ${actor}\n${lines.join('\n')}`;
  const reporter = incident.reported_by || actor;

  if (!updated.mattermost_post_id) {
    try {
      await syncIncidentToAttendance(updated);
    } catch (syncErr) {
      console.error('❌ No se reflejó la falta en la asistencia:', syncErr);
    }
    sendJson(res, 200, {
      error: 'La novedad se actualizó en OpsFlow, pero no tiene tarjeta de Mattermost para modificar.',
    });
    return;
  }

  try {
    await syncIncidentToAttendance(updated);
  } catch (syncErr) {
    console.error('❌ No se reflejó la falta en la asistencia:', syncErr);
  }

  try {
    await replaceIncidentCard(updated, {
      unit: targets.unit,
      worker: targets.worker,
      values,
      reporter,
    });
  } catch (err) {
    console.error('❌ Actualizar tarjeta Mattermost:', err);
    try {
      await updateIncidentDetails(incident.id, previous);
      await syncIncidentToAttendance({
        id: incident.id,
        unit_id: previous.unitId,
        employee_id: previous.employeeId,
        incident_type: previous.incidentType,
        incident_reason: previous.incidentReason,
        has_coverage: previous.hasCoverage,
        status: incident.status,
        incident_date: previous.incidentDate,
        observations: previous.observations,
        reported_by: incident.reported_by,
      });
    } catch (revertErr) {
      console.error('❌ Revertir novedad:', revertErr);
    }
    sendJson(res, 200, {
      error: `No se pudo actualizar la tarjeta en Mattermost: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  const channelId = updated.mattermost_channel_id || state.channel_id || payload.channel_id;
  try {
    if (!channelId) throw new Error('La novedad no tiene canal de Mattermost.');
    await createPost({
      channel_id: channelId,
      root_id: updated.mattermost_post_id,
      message: comment,
    });
  } catch (err) {
    console.error('❌ Comentario de trazabilidad:', err);
    try {
      await replaceIncidentCard(updated, {
        unit: targets.unit,
        worker: targets.worker,
        values,
        reporter,
        extraText: comment,
      });
    } catch (cardErr) {
      console.error('❌ No se pudo dejar la traza en la tarjeta:', cardErr);
    }
  }

  sendEmpty(res);
}

async function handleDialogSubmit(req, res, body) {
  const cfg = loadConfig();
  const payload = body.type === 'dialog_submission' ? body : body.payloadJson || body;
  if (payload?.cancelled) {
    sendEmpty(res);
    return;
  }

  const stateCheck = verifyState(payload?.state, cfg.stateSecret);
  if (!stateCheck.ok) {
    sendJson(res, 200, { error: stateCheck.error });
    return;
  }

  if (payload?.type === 'refresh') {
    try {
      const submission = payload.submission || {};
      const units = await cachedActiveUnits();
      const selectedUnit = cleanSelectId(submission.unit_id);
      const unit =
        units.find((row) => row.id === selectedUnit) || matchUnitByText(units, selectedUnit);
      const unitId = unit?.id || '';
      const workers = unitId ? await listWorkersForUnitSelect(unitId, FALTA_WORKER_CAP) : [];
      const employeeStillThere = workers.some((worker) => worker.id === submission.employee_id);
      const dialog = buildFaltaDialog({
        state: payload.state,
        units,
        workers,
        values: {
          unit_id: unitId,
          employee_id: employeeStillThere ? submission.employee_id : '',
          incident_type: submission.incident_type || '',
          incident_reason: submission.incident_reason || '',
          has_coverage: submission.has_coverage || '',
        },
      });
      console.log(
        `✅ /falta unidad en el formulario: ${unit?.name || 'sin unidad'} (${workers.length} trabajadores)`,
      );
      sendJson(res, 200, { type: 'form', form: dialog });
    } catch (err) {
      console.error('❌ /falta refresh:', err);
      sendJson(res, 200, {
        error: `No se pudieron cargar los trabajadores: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return;
  }

  const result = await saveAndPublishFalta({
    submission: payload?.submission || {},
    channelId: payload.channel_id || stateCheck.payload.channel_id,
    userId: payload.user_id || stateCheck.payload.user_id,
    teamId: payload.team_id || stateCheck.payload.team_id,
    userName: stateCheck.payload.user_name || payload.user_name || '',
  });
  if (!result.ok) {
    sendJson(res, 200, result.errors ? { errors: result.errors } : { error: result.error });
    return;
  }
  sendEmpty(res);
}

function isUnitOk(unit) {
  return Boolean(unit) && String(unit.status || '') !== 'Desactivado';
}

function collectPostEvent(body) {
  const payload = body.payloadJson || (body.type || body.event ? body : null);
  const postObj =
    (typeof payload?.data?.post === 'string' ? safeJson(payload.data.post) : payload?.data?.post) ||
    payload?.post ||
    null;

  if (postObj && (postObj.id || postObj.root_id)) {
    return {
      postId: postObj.id,
      rootId: postObj.root_id || postObj.id,
      fileIds: postObj.file_ids || postObj.fileIds,
      userName: payload?.data?.sender_name || payload?.user_name || postObj.user_id,
    };
  }

  if (body.post_id) {
    return {
      postId: body.post_id,
      rootId: body.root_id || body.post_id,
      fileIds: body.file_ids || body.fileIds,
      userName: body.user_name,
    };
  }

  return null;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function handlePostAttachment(req, res, body) {
  if (!isOutgoingTokenValid(body, req.headers)) {
    sendJson(res, 401, { error: 'Token de webhook inválido' });
    return;
  }

  try {
    let event = collectPostEvent(body);

    if (event?.postId && (!event.fileIds || extractFileIds(event.fileIds).length === 0 || !event.rootId)) {
      try {
        const post = await getPost(event.postId);
        event = {
          postId: post.id,
          rootId: post.root_id || post.id,
          fileIds: post.file_ids,
          userName: event.userName,
        };
      } catch (err) {
        console.warn('⚠️  getPost attachment webhook:', err instanceof Error ? err.message : err);
      }
    }

    if (!event) {
      sendJson(res, 200, { ok: true, ignored: true, reason: 'payload_no_reconocido' });
      return;
    }

    const result = await ingestFromPostLike(event);
    sendJson(res, 200, { ok: true, ...result });
  } catch (err) {
    console.error('❌ post-attachment:', err);
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
}

let pollerStarted = false;
let pollerBusy = false;
let pollFailureStreak = 0;

function nextPollDelay(baseMs) {
  if (pollFailureStreak <= 0) return baseMs;
  const factor = 2 ** Math.min(pollFailureStreak - 1, 4);
  return Math.min(baseMs * factor, 5 * 60 * 1000);
}

async function pollOpenThreads() {
  if (pollerBusy) return true;
  const cfg = loadConfig();
  if (!cfg.botToken || !cfg.mattermostUrl) return true;
  pollerBusy = true;
  try {
    await mattermostFetch('/api/v4/users/me');
    const incidents = await listOpenIncidentsForPolling(7);
    for (const incident of incidents) {
      if (!incident.mattermost_post_id) continue;
      let thread;
      try {
        thread = await getPostThread(incident.mattermost_post_id);
      } catch (err) {
        if (isTransientMattermostError(err)) throw err;
        console.warn(
          '⚠️  Thread poll',
          incident.mattermost_post_id,
          err instanceof Error ? err.message : err,
        );
        continue;
      }
      const posts = thread?.posts && typeof thread.posts === 'object' ? Object.values(thread.posts) : [];
      for (const post of posts) {
        const fileIds = extractFileIds(post.file_ids);
        if (!fileIds.length) continue;
        const rootId = post.root_id || post.id;
        if (rootId !== incident.mattermost_post_id && post.id !== incident.mattermost_post_id) continue;
        await ingestFilesForIncident(incident, {
          fileIds,
          postId: post.id,
          username: post.user_id,
        });
      }
    }
    return true;
  } catch (err) {
    console.warn(
      '⚠️  Poller Mattermost en pausa:',
      err instanceof Error ? err.message : err,
    );
    return false;
  } finally {
    pollerBusy = false;
  }
}

export function startMattermostThreadPoller() {
  if (pollerStarted) return;
  const cfg = loadConfig();
  if (!cfg.botToken || !cfg.mattermostUrl) {
    console.log('ℹ️  Poller Mattermost desactivado (faltan MATTERMOST_URL / MATTERMOST_BOT_TOKEN)');
    return;
  }
  pollerStarted = true;
  const baseMs = Math.max(20_000, Number(cfg.pollIntervalMs) || 20_000);

  const arm = () => {
    const wait = nextPollDelay(baseMs);
    if (pollFailureStreak > 0) {
      console.warn(
        `🧵 Mattermost no disponible (${pollFailureStreak}). Siguiente revisión en ${Math.round(wait / 1000)}s, sin consultar Supabase.`,
      );
    }
    setTimeout(() => {
      void pollOpenThreads()
        .then((ok) => {
          pollFailureStreak = ok ? 0 : pollFailureStreak + 1;
        })
        .catch((err) => {
          pollFailureStreak += 1;
          console.error('❌ Poller hilos Mattermost:', err);
        })
        .finally(arm);
    }, wait);
  };

  arm();
  console.log(`🧵 Poller de adjuntos Mattermost cada ${Math.round(baseMs / 1000)}s (pausa después de cada pasada)`);
}

export async function handleMattermostRequest(req, res, urlPath) {
  const path = urlPath.replace(/\/+$/, '') || '/';
  const isActionPath = path.endsWith('/action') || path.endsWith('/actions');

  if (req.method === 'GET' && path.endsWith('/health')) {
    sendJson(res, 200, { ok: true, configured: configStatus() });
    return;
  }

  if (req.method === 'GET' && isActionPath) {
    sendJson(res, 200, {
      ok: true,
      method: 'GET',
      hint: 'Mattermost debe hacer POST a esta URL (integration.url).',
      actionUrl: interactiveActionUrl(),
    });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const raw = await readBody(req);
  const body = parsePayload(req, raw);
  console.log('📥 Mattermost webhook', req.method, path, String(req.headers['content-type'] || ''));

  if (isActionPath) {
    await handleInteractiveAction(req, res, body);
    return;
  }
  if (path.endsWith('/command')) {
    await handleCommand(req, res, body);
    return;
  }
  if (path.endsWith('/incident-action')) {
    await handleIncidentAction(req, res, body);
    return;
  }
  if (path.endsWith('/dialog-edit-submit')) {
    await handleDialogEditSubmit(req, res, body);
    return;
  }
  if (path.endsWith('/dialog-submit')) {
    await handleDialogSubmit(req, res, body);
    return;
  }
  if (path.endsWith('/post-attachment')) {
    await handlePostAttachment(req, res, body);
    return;
  }

  if (isInteractiveAction(body)) {
    await handleInteractiveAction(req, res, body);
    return;
  }

  sendJson(res, 404, { error: 'Webhook Mattermost desconocido', path });
}
