import { URLSearchParams } from 'node:url';
import {
  COVERAGE_OPTIONS,
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
  mattermostIncidentActionUrl,
  safeEqual,
  signState,
  verifyState,
} from './config.js';
import {
  attachmentExists,
  createIncident,
  findIncidentByPostId,
  getIncidentById,
  getUnitById,
  getWorkerById,
  listActiveUnits,
  listActiveWorkers,
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
  getTeamMember,
  getUser,
  openDialog,
  patchPost,
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
  };
}

function formValuesFromContext(ctx = {}) {
  return {
    unit_id: optionValue(ctx.unit_id),
    employee_id: optionValue(ctx.employee_id),
    incident_type: optionValue(ctx.incident_type),
    incident_reason: optionValue(ctx.incident_reason),
    has_coverage: optionValue(ctx.has_coverage),
  };
}

function formContext(state, values, action) {
  return {
    action,
    state,
    unit_id: values.unit_id || '',
    employee_id: values.employee_id || '',
    incident_type: values.incident_type || '',
    incident_reason: values.incident_reason || '',
    has_coverage: values.has_coverage || '',
  };
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

function selectAction({ id, name, actionUrl, state, values, action, options }) {
  return {
    id,
    name,
    type: 'select',
    integration: {
      url: actionUrl,
      context: formContext(state, values, action),
    },
    options,
  };
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

function workerOptionsForForm(workers, unitId) {
  if (!unitId) {
    return [{ text: '1) Elija la unidad', value: 'pending' }];
  }
  const options = workerSelectOptions(workers).slice(0, SELECT_OPTIONS_MAX);
  if (!options.length) {
    return [{ text: 'Sin operarios en esta unidad', value: 'pending' }];
  }
  return options;
}

function ephemeralFaltaForm({ actionUrl, state, units, workers, values, hint }) {
  const unitOptions = units.slice(0, SELECT_OPTIONS_MAX).map((u) => ({
    text: String(u.name || 'Unidad').slice(0, 100),
    value: u.id,
  }));
  const truncatedWorkers = Boolean(values.unit_id) && workers.length > SELECT_OPTIONS_MAX;
  const intro =
    hint ||
    'Complete los desplegables (el operario se filtra al elegir la unidad) y pulse **Registrar**. Las fotos o CITT se adjuntan después, respondiendo al hilo.';
  const extra = truncatedWorkers
    ? ` Hay más de ${SELECT_OPTIONS_MAX} operarios; se muestran los primeros. Use /falta + DNI para filtrar.`
    : '';

  return {
    response_type: 'in_channel',
    text: `${intro}${extra}\n\n${summaryLine(values, units, workers)}`,
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
          }),
          selectAction({
            id: values.unit_id ? 'operario' : 'setworker',
            name: 'Trabajador',
            actionUrl,
            state,
            values,
            action: FORM_ACTIONS.worker,
            options: workerOptionsForForm(workers, values.unit_id),
          }),
          selectAction({
            id: 'settype',
            name: 'Tipo',
            actionUrl,
            state,
            values,
            action: FORM_ACTIONS.type,
            options: INCIDENT_TYPES,
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
          }),
          selectAction({
            id: 'setcoverage',
            name: 'Cobertura',
            actionUrl,
            state,
            values,
            action: FORM_ACTIONS.coverage,
            options: COVERAGE_OPTIONS,
          }),
          registrarButton({ actionUrl, state, values }),
        ],
      },
    ],
  };
}

async function workersForForm(unitId, workerQuery) {
  if (unitId) {
    const workers = await listActiveWorkers(unitId);
    return workerQuery ? filterWorkers(workers, workerQuery) : workers;
  }
  if (workerQuery) return filterWorkers(await listActiveWorkers(), workerQuery);
  return [];
}

function formUpdateResponse(form, extraText) {
  const message = extraText ? `${form.text}\n\n${extraText}` : form.text;
  return {
    update: {
      message,
      attachments: form.attachments,
      props: { attachments: form.attachments },
    },
  };
}

async function refreshFormPost(postId, form) {
  if (!postId) return;
  try {
    await patchPost(postId, {
      message: form.text,
      props: { attachments: form.attachments },
    });
  } catch (err) {
    console.warn('⚠️  No se pudo actualizar el mensaje /falta:', err instanceof Error ? err.message : err);
  }
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

async function handleInteractiveAction(req, res, body) {
  const cfg = loadConfig();
  const payload = interactivePayload(body) || body;
  const action = payload.context?.action || payload.context?.Action || '';
  const selected = selectedUnitFromAction(payload);
  const stateRaw = payload.context?.state || payload.state || '';
  const values = formValuesFromContext(payload.context || {});

  console.log('📩 Mattermost action', {
    type: payload.type || action || 'unknown',
    action,
    selected: selected || null,
    contextKeys: Object.keys(payload.context || {}),
    postId: payload.post_id || null,
  });

  const stateCheck = verifyState(stateRaw, cfg.stateSecret);
  if (!stateCheck.ok) {
    sendJson(res, 200, { ephemeral_text: stateCheck.error || 'El formulario expiró. Ejecute /falta de nuevo.' });
    return;
  }

  const actionUrl = interactiveActionUrl();
  const units = await listActiveUnits();

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

  const workers = await workersForForm(values.unit_id);
  const form = ephemeralFaltaForm({
    actionUrl,
    state: stateRaw,
    units,
    workers,
    values,
  });
  await refreshFormPost(payload.post_id || payload.postId, form);

  if (action === FORM_ACTIONS.register || action === UNIT_CONTINUE_ACTION) {
    const result = await saveAndPublishFalta({
      submission: {
        unit_id: values.unit_id,
        employee_id: values.employee_id,
        incident_type: values.incident_type,
        incident_reason: values.incident_reason,
        has_coverage: values.has_coverage,
      },
      channelId: payload.channel_id || stateCheck.payload.channel_id,
      userId: payload.user_id || stateCheck.payload.user_id,
      teamId: payload.team_id || stateCheck.payload.team_id,
      userName: payload.user_name || stateCheck.payload.user_name,
    });
    if (!result.ok) {
      sendJson(res, 200, {
        ...formUpdateResponse(form),
        ephemeral_text: result.error,
      });
      return;
    }
    sendJson(res, 200, {
      update: {
        message: `✅ Falta registrada: **${workerCardName(result.worker)}** en **${result.unit?.name || ''}**. ${result.attachHint}`,
        props: { attachments: [] },
      },
    });
    return;
  }

  sendJson(res, 200, formUpdateResponse(form));
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
  const actionUrl = interactiveActionUrl();
  const cfg = loadConfig();

  try {
    const units = await listActiveUnits();
    if (!units.length) {
      sendJson(res, 200, {
        response_type: 'ephemeral',
        text: 'No hay unidades operativas activas en OpsFlow.',
      });
      return;
    }

    const values = emptyFormValues();
    const unitFromText = matchUnitByText(units, text);
    if (unitFromText) values.unit_id = unitFromText.id;

    let workers = await workersForForm(values.unit_id, unitFromText ? '' : text);
    if (!values.unit_id && workers.length === 1) {
      values.unit_id = workers[0].unit_id || '';
      values.employee_id = workers[0].id;
      workers = await workersForForm(values.unit_id);
    } else if (!values.unit_id && workers.length > 1 && workers.length <= SELECT_OPTIONS_MAX) {
      const sameUnit = workers.every((w) => w.unit_id && w.unit_id === workers[0].unit_id);
      if (sameUnit) values.unit_id = workers[0].unit_id;
    }

    const state = signState(
      { channel_id: channelId, user_id: userId, team_id: teamId, user_name: userName, ts: Date.now() },
      cfg.stateSecret,
    );
    const form = ephemeralFaltaForm({
      actionUrl,
      state,
      units,
      workers,
      values,
    });
    console.log('🔗 /falta formulario inline', actionUrl);
    sendJson(res, 200, {
      ...form,
      response_type: 'in_channel',
    });
  } catch (err) {
    console.error('❌ /falta formulario:', err);
    sendJson(res, 200, {
      response_type: 'ephemeral',
      text: `No se pudo mostrar el formulario de /falta: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function saveAndPublishFalta({ submission, channelId, userId, teamId, userName }) {
  const parsed = validateSubmission(submission || {});
  if (!parsed.ok) {
    const first = Object.values(parsed.errors)[0] || 'Complete todos los desplegables.';
    return { ok: false, error: first, errors: parsed.errors };
  }

  const unit = await getUnitById(parsed.values.unitId);
  let worker = parsed.values.employeeId ? await getWorkerById(parsed.values.employeeId) : null;
  if (!worker && parsed.values.employeeQuery) {
    const candidates = filterWorkers(await listActiveWorkers(parsed.values.unitId), parsed.values.employeeQuery);
    const dniExact = candidates.filter(
      (w) => String(w.dni || '').replace(/\D/g, '') === String(parsed.values.employeeQuery).replace(/\D/g, ''),
    );
    if (dniExact.length === 1) worker = dniExact[0];
    else if (candidates.length === 1) worker = candidates[0];
    else if (candidates.length > 1) {
      return { ok: false, error: `Hay ${candidates.length} coincidencias. Use el DNI completo.`, errors: { employee_query: 'Use el DNI completo.' } };
    }
  }

  if (!unit || !isUnitOk(unit)) return { ok: false, error: 'La unidad no existe o no está operativa.', errors: { unit_id: 'La unidad no existe o no está operativa.' } };
  if (!worker || worker.type !== 'Personal') {
    return { ok: false, error: 'El trabajador no existe o no está activo en esa unidad.', errors: { employee_id: 'El trabajador no existe o no está activo en esa unidad.' } };
  }
  if (worker.archived === true || ['cesado', 'archivado'].includes(String(worker.personnel_status || '').toLowerCase())) {
    return { ok: false, error: 'El trabajador no está activo.', errors: { employee_id: 'El trabajador no está activo.' } };
  }
  if (worker.unit_id !== parsed.values.unitId && worker.is_shared !== true) {
    return { ok: false, error: 'El trabajador no pertenece a la unidad seleccionada.', errors: { employee_id: 'El trabajador no pertenece a la unidad seleccionada.' } };
  }

  let incident;
  try {
    incident = await createIncident({
      ...parsed.values,
      employeeId: worker.id,
      reportedBy: userName ? `@${userName}` : userId,
      reportedByUserId: userId,
      channelId,
      teamId,
    });
  } catch (err) {
    console.error('❌ createIncident:', err);
    return { ok: false, error: `No se pudo guardar la incidencia en OpsFlow: ${err instanceof Error ? err.message : String(err)}` };
  }

  const reporter = userName ? `@${userName}` : 'supervisor';
  const attachment = incidentCardAttachment({
    incidentId: incident.id,
    unit,
    worker,
    values: parsed.values,
    incidentDate: incident.incident_date || limaTodayIso(),
    reporter,
    modified: false,
  });

  let attachHint = 'Para adjuntar fotos o CITT, responde con la imagen al hilo de la tarjeta en el canal.';
  try {
    const post = await createPost({
      channel_id: channelId,
      message: incidentCardMessage({
        incidentType: parsed.values.incidentType,
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
    attachHint =
      'Para adjuntar fotos o CITT, responde con la imagen a este hilo' + (permalink ? `: ${permalink}` : '.');
    try {
      await createEphemeralPost(userId, {
        channel_id: channelId,
        message: `✅ Falta registrada en OpsFlow.\n📎 ${attachHint}`,
      });
    } catch (ephemeralErr) {
      console.warn('⚠️  Ephemeral Mattermost:', ephemeralErr instanceof Error ? ephemeralErr.message : ephemeralErr);
    }
  } catch (err) {
    console.error('❌ Publicar tarjeta Mattermost:', err);
    return {
      ok: true,
      incident,
      unit,
      worker,
      attachHint:
        'La incidencia se guardó en OpsFlow, pero no se pudo publicar la tarjeta en el canal. ' +
        (err instanceof Error ? err.message : String(err)),
    };
  }

  return { ok: true, incident, unit, worker, attachHint };
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

function selectDialogElement({ displayName, name, options, defaultValue, helpText }) {
  const element = {
    display_name: displayName,
    name,
    type: 'select',
    options,
  };
  if (helpText) element.help_text = String(helpText).slice(0, 150);
  if (defaultValue && options.some((option) => option.value === defaultValue)) {
    element.default = String(defaultValue);
  }
  return element;
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
    sendJson(res, 200, {
      error: 'La novedad se actualizó en OpsFlow, pero no tiene tarjeta de Mattermost para modificar.',
    });
    return;
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

async function pollOpenThreads() {
  if (pollerBusy) return;
  const cfg = loadConfig();
  if (!cfg.botToken || !cfg.mattermostUrl) return;
  pollerBusy = true;
  try {
    const incidents = await listOpenIncidentsForPolling(7);
    for (const incident of incidents) {
      if (!incident.mattermost_post_id) continue;
      let thread;
      try {
        thread = await getPostThread(incident.mattermost_post_id);
      } catch (err) {
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
  } catch (err) {
    console.error('❌ Poller hilos Mattermost:', err);
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
  const ms = Math.max(10_000, cfg.pollIntervalMs);
  setInterval(() => {
    void pollOpenThreads();
  }, ms);
  console.log(`🧵 Poller de adjuntos Mattermost cada ${Math.round(ms / 1000)}s`);
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
