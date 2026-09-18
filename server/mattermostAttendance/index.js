import { URLSearchParams } from 'node:url';
import {
  COVERAGE_OPTIONS,
  DIALOG_CALLBACK_ID,
  INCIDENT_REASONS,
  INCIDENT_TYPES,
  SELECT_OPTIONS_MAX,
  UNIT_CONTINUE_ACTION,
  UNIT_PICKER_ACTION,
  coverageBadge,
  labelOf,
  limaTodayIso,
  validateSubmission,
} from './catalogs.js';
import {
  configStatus,
  loadConfig,
  publicBaseFromRequest,
  safeEqual,
  signState,
  verifyState,
} from './config.js';
import {
  attachmentExists,
  createIncident,
  findIncidentByPostId,
  getUnitById,
  getWorkerById,
  listActiveUnits,
  listActiveWorkers,
  listOpenIncidentsForPolling,
  saveAttachment,
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
  getPost,
  getPostThread,
  getTeam,
  openDialog,
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
  if (body?.payloadJson && typeof body.payloadJson === 'object') return body.payloadJson;
  if (body && typeof body === 'object' && (body.context || body.type === 'select' || body.type === 'button')) {
    return body;
  }
  return null;
}

function isInteractiveAction(body) {
  const p = interactivePayload(body);
  if (!p) return false;
  const action = p.context?.action || p.context?.Action;
  if (action === UNIT_PICKER_ACTION || action === UNIT_CONTINUE_ACTION) return true;
  if (p.type === 'select' || p.type === 'button') return true;
  return false;
}

function selectedUnitFromAction(payload) {
  const ctx = payload?.context || {};
  return String(
    ctx.selected_option ||
      ctx.selectedOption ||
      ctx.unit_id ||
      ctx.unitId ||
      payload?.selected_option ||
      payload?.data?.value ||
      '',
  ).trim();
}

function webhookRoot(req) {
  return `${publicBaseFromRequest(req)}/api/webhooks/mattermost`;
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

function buildDialog({ submitUrl, state, units, workers, defaultUnitId, truncatedWorkers }) {
  const unitOptions = units.slice(0, SELECT_OPTIONS_MAX).map((u) => ({
    text: String(u.name || 'Unidad').slice(0, 100),
    value: u.id,
  }));
  const workerOptions = workerSelectOptions(workers).slice(0, SELECT_OPTIONS_MAX);
  const introParts = [
    'Seleccione únicamente opciones predefinidas. Las fotos o CITT se adjuntan después, respondiendo al hilo de la tarjeta.',
  ];
  if (truncatedWorkers) {
    introParts.push(
      `Hay más de ${SELECT_OPTIONS_MAX} operarios en esta lista; se muestran los primeros ${SELECT_OPTIONS_MAX} (A-Z). Use /falta + DNI o nombre para filtrar.`,
    );
  }

  const unitElement = {
    display_name: 'Unidad / Sede Operativa',
    name: 'unit_id',
    type: 'select',
    optional: false,
    options: unitOptions,
  };
  if (defaultUnitId && unitOptions.some((o) => o.value === defaultUnitId)) {
    unitElement.default = defaultUnitId;
  }

  return {
    callback_id: DIALOG_CALLBACK_ID,
    title: 'Falta de asistencia',
    introduction_text: introParts.join(' '),
    submit_label: 'Registrar falta',
    notify_on_cancel: false,
    state,
    elements: [
      unitElement,
      {
        display_name: 'Trabajador (DNI-Nombre)',
        name: 'employee_id',
        type: 'select',
        optional: false,
        options: workerOptions,
      },
      {
        display_name: 'Tipo de Incidencia',
        name: 'incident_type',
        type: 'select',
        optional: false,
        options: INCIDENT_TYPES,
      },
      {
        display_name: 'Motivo Específico',
        name: 'incident_reason',
        type: 'select',
        optional: false,
        options: INCIDENT_REASONS,
      },
      {
        display_name: 'Cobertura de Puesto',
        name: 'has_coverage',
        type: 'select',
        optional: false,
        options: COVERAGE_OPTIONS,
      },
      {
        display_name: 'Observaciones',
        name: 'observations',
        type: 'textarea',
        optional: true,
        min_length: 0,
        max_length: 2000,
        placeholder: 'Opcional. Adjunte fotos o CITT respondiendo al hilo.',
      },
    ],
  };
}

async function openFaltaDialog({ triggerId, submitUrl, statePayload, unitId, workerQuery }) {
  const cfg = loadConfig();
  if (!triggerId) {
    throw new Error('Mattermost no envió trigger_id; no se puede abrir el modal.');
  }

  let units = [];
  let scopedUnitId = unitId || null;
  let workers;

  if (scopedUnitId) {
    const [unit, unitWorkers] = await Promise.all([
      getUnitById(scopedUnitId),
      listActiveWorkers(scopedUnitId),
    ]);
    if (!unit || !isUnitOk(unit)) {
      throw new Error('La unidad no existe o no está operativa.');
    }
    units = [unit];
    workers = unitWorkers;
  } else {
    units = await listActiveUnits();
    if (!units.length) {
      throw new Error('No hay unidades operativas activas en OpsFlow.');
    }
    workers = await listActiveWorkers();
    if (workerQuery) {
      const unitMatch = matchUnitByText(units, workerQuery);
      if (unitMatch) {
        scopedUnitId = unitMatch.id;
        units = [unitMatch];
        workers = await listActiveWorkers(scopedUnitId);
      } else {
        workers = filterWorkers(workers, workerQuery);
      }
    }
  }

  if (!workers.length) {
    throw new Error(
      scopedUnitId || workerQuery
        ? 'No hay operarios activos para ese filtro. Pruebe /falta o /falta + DNI.'
        : 'No hay operarios activos en OpsFlow.',
    );
  }

  const truncated = workers.length > SELECT_OPTIONS_MAX;
  const dialogUnits = scopedUnitId ? units.filter((u) => u.id === scopedUnitId) : units;
  const state = signState({ ...statePayload, unit_id: scopedUnitId || null, ts: Date.now() }, cfg.stateSecret);

  await openDialog({
    triggerId,
    url: submitUrl,
    dialog: buildDialog({
      submitUrl,
      state,
      units: dialogUnits.length ? dialogUnits : units,
      workers: workers.slice(0, SELECT_OPTIONS_MAX),
      defaultUnitId: scopedUnitId || undefined,
      truncatedWorkers: truncated,
    }),
  });

  return { opened: true, workerCount: workers.length, truncated, unitName: units[0]?.name || '' };
}

function unitSelectAction({ actionUrl, state }) {
  return {
    id: 'falta_unit_select',
    name: 'Seleccionar unidad',
    type: 'select',
    integration: {
      url: actionUrl,
      context: {
        action: UNIT_PICKER_ACTION,
        state,
      },
    },
  };
}

function continueButtonAction({ actionUrl, state, unitId }) {
  return {
    id: 'falta_unit_continue',
    name: 'Continuar',
    type: 'button',
    style: 'primary',
    integration: {
      url: actionUrl,
      context: {
        action: UNIT_CONTINUE_ACTION,
        unit_id: unitId || '',
        state,
      },
    },
  };
}

function ephemeralUnitPicker({ actionUrl, units, channelId, userId, teamId, userName }) {
  const cfg = loadConfig();
  const state = signState(
    { channel_id: channelId, user_id: userId, team_id: teamId, user_name: userName, ts: Date.now() },
    cfg.stateSecret,
  );
  const select = unitSelectAction({ actionUrl, state });
  select.options = units.slice(0, SELECT_OPTIONS_MAX).map((u) => ({
    text: String(u.name || 'Unidad').slice(0, 100),
    value: u.id,
  }));
  return {
    response_type: 'ephemeral',
    text: `Hay más de ${SELECT_OPTIONS_MAX} operarios activos. 1) Elija la **unidad**. 2) Pulse **Continuar** para abrir el formulario (si el modal no aparece al elegir la unidad).`,
    attachments: [
      {
        fallback: 'Seleccione una unidad y pulse Continuar',
        color: '#0f766e',
        actions: [select, continueButtonAction({ actionUrl, state, unitId: '' })],
      },
    ],
  };
}

function continueAttachment({ actionUrl, state, unitId, unitName }) {
  return {
    fallback: 'Pulse Continuar para abrir el formulario',
    color: '#0f766e',
    title: unitName ? `Unidad: ${unitName}` : 'Unidad seleccionada',
    text: 'Pulse **Continuar** si el formulario no se abrió.',
    actions: [continueButtonAction({ actionUrl, state, unitId })],
  };
}

function cardFields({ unit, worker, values }) {
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
      value: limaTodayIso(),
      short: true,
    },
  ];
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
  const triggerId = payload.trigger_id || payload.triggerId || '';
  const selected = selectedUnitFromAction(payload);
  const stateRaw = payload.context?.state || payload.state || '';

  console.log('📩 Mattermost action', {
    type: payload.type || action || 'unknown',
    action,
    hasTrigger: Boolean(triggerId),
    hasUnit: Boolean(selected),
  });

  const stateCheck = verifyState(stateRaw, cfg.stateSecret);
  if (!stateCheck.ok) {
    sendJson(res, 200, { ephemeral_text: stateCheck.error || 'El formulario expiró. Ejecute /falta de nuevo.' });
    return;
  }

  if (!selected) {
    sendJson(res, 200, {
      ephemeral_text: 'Primero seleccione la unidad en el menú y luego pulse Continuar.',
    });
    return;
  }

  if (!triggerId) {
    sendJson(res, 200, {
      ephemeral_text: 'Mattermost no envió trigger_id. Pulse Continuar de nuevo o ejecute /falta.',
    });
    return;
  }

  const root = webhookRoot(req);
  const actionUrl = `${root}/action`;
  let unitName = '';
  try {
    const opened = await openFaltaDialog({
      triggerId,
      submitUrl: `${root}/dialog-submit`,
      statePayload: {
        channel_id: payload.channel_id || stateCheck.payload.channel_id,
        user_id: payload.user_id || stateCheck.payload.user_id,
        team_id: payload.team_id || stateCheck.payload.team_id,
        user_name: payload.user_name || stateCheck.payload.user_name,
      },
      unitId: selected,
    });
    unitName = opened.unitName || '';
    sendJson(res, 200, {
      update: {
        message: `Unidad **${unitName || 'seleccionada'}**. Si el formulario no apareció, pulse Continuar.`,
        props: {
          attachments: [
            continueAttachment({
              actionUrl,
              state: stateRaw,
              unitId: selected,
              unitName,
            }),
          ],
        },
      },
      ephemeral_text: 'Formulario abierto. Si no lo ve, pulse Continuar.',
    });
  } catch (err) {
    console.error('❌ Mattermost action → dialog.open:', err);
    sendJson(res, 200, {
      update: {
        message: `Unidad **${unitName || selected}**. Pulse Continuar para abrir el formulario.`,
        props: {
          attachments: [
            continueAttachment({
              actionUrl,
              state: stateRaw,
              unitId: selected,
              unitName,
            }),
          ],
        },
      },
      ephemeral_text: `No se pudo abrir el formulario: ${err instanceof Error ? err.message : String(err)}. Pulse Continuar.`,
    });
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

  const triggerId = body.trigger_id;
  const channelId = body.channel_id;
  const userId = body.user_id;
  const teamId = body.team_id;
  const userName = body.user_name;
  const text = String(body.text || '').trim();

  if (!triggerId) {
    sendJson(res, 200, {
      response_type: 'ephemeral',
      text: 'Mattermost no envió trigger_id. Verifique que el comando /falta esté configurado como slash command con diálogo.',
    });
    return;
  }

  const base = publicBaseFromRequest(req);
  if (!base) {
    sendJson(res, 200, {
      response_type: 'ephemeral',
      text: 'OpsFlow no tiene OPS_FLOW_PUBLIC_URL configurada; no se puede abrir el modal.',
    });
    return;
  }

  const root = `${base}/api/webhooks/mattermost`;

  try {
    const units = await listActiveUnits();
    const workers = text ? filterWorkers(await listActiveWorkers(), text) : await listActiveWorkers();
    const unitFromText = matchUnitByText(units, text);

    if (!text && workers.length > SELECT_OPTIONS_MAX) {
      sendJson(
        res,
        200,
        ephemeralUnitPicker({
          actionUrl: `${root}/action`,
          units,
          channelId,
          userId,
          teamId,
          userName,
        }),
      );
      return;
    }

    await openFaltaDialog({
      triggerId,
      submitUrl: `${root}/dialog-submit`,
      statePayload: { channel_id: channelId, user_id: userId, team_id: teamId, user_name: userName },
      unitId: unitFromText?.id || null,
      workerQuery: unitFromText ? '' : text,
    });
    sendEmpty(res);
  } catch (err) {
    console.error('❌ /falta open dialog:', err);
    sendJson(res, 200, {
      response_type: 'ephemeral',
      text: `No se pudo abrir el formulario de /falta: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
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

  const parsed = validateSubmission(payload?.submission || {});
  if (!parsed.ok) {
    sendJson(res, 200, { errors: parsed.errors });
    return;
  }

  const [unit, worker] = await Promise.all([
    getUnitById(parsed.values.unitId),
    getWorkerById(parsed.values.employeeId),
  ]);

  const errors = {};
  if (!unit || !isUnitOk(unit)) errors.unit_id = 'La unidad no existe o no está operativa.';
  if (!worker || worker.type !== 'Personal') errors.employee_id = 'El trabajador no existe o no está activo.';
  else if (worker.archived === true || ['cesado', 'archivado'].includes(String(worker.personnel_status || '').toLowerCase())) {
    errors.employee_id = 'El trabajador no está activo.';
  } else if (worker.unit_id !== parsed.values.unitId && worker.is_shared !== true) {
    errors.employee_id = 'El trabajador no pertenece a la unidad seleccionada.';
  }
  if (Object.keys(errors).length) {
    sendJson(res, 200, { errors });
    return;
  }

  const channelId = payload.channel_id || stateCheck.payload.channel_id;
  const userId = payload.user_id || stateCheck.payload.user_id;
  const teamId = payload.team_id || stateCheck.payload.team_id;
  const userName = stateCheck.payload.user_name || payload.user_name || '';

  let incident;
  try {
    incident = await createIncident({
      ...parsed.values,
      reportedBy: userName ? `@${userName}` : userId,
      reportedByUserId: userId,
      channelId,
      teamId,
    });
  } catch (err) {
    console.error('❌ createIncident:', err);
    sendJson(res, 200, {
      error: `No se pudo guardar la incidencia en OpsFlow: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  const badge = coverageBadge(parsed.values.hasCoverage);
  const fields = cardFields({ unit, worker, values: parsed.values });
  if (parsed.values.observations) {
    fields.push({ title: 'Observaciones', value: parsed.values.observations, short: false });
  }

  try {
    const post = await createPost({
      channel_id: channelId,
      message: `📋 Falta de asistencia · ${labelOf(INCIDENT_TYPES, parsed.values.incidentType)} · ${workerCardName(worker)}`,
      props: {
        attachments: [
          {
            fallback: `Falta ${parsed.values.incidentType} — ${workerCardName(worker)}`,
            color: badge.color,
            title: 'Falta de asistencia',
            text: '📎 Para adjuntar certificados o fotos, responda a este hilo.',
            fields,
            footer: `OpsFlow · ${incident.id.slice(0, 8)} · reportó ${userName ? `@${userName}` : 'supervisor'}`,
          },
        ],
      },
    });

    const teamName = await resolveTeamName(teamId, null);
    const permalink = buildPermalink(teamName, post.id);
    await updateIncidentPost(incident.id, {
      postId: post.id,
      permalink,
      channelId,
      teamId,
    });

    const attachHint =
      'Para adjuntar fotos o CITT, responde directamente con la imagen a este hilo' +
      (permalink ? `: ${permalink}` : '.');

    try {
      await createEphemeralPost(userId, {
        channel_id: channelId,
        message: `✅ Falta registrada en OpsFlow.\n📎 ${attachHint}`,
      });
    } catch (ephemeralErr) {
      console.warn('⚠️  Ephemeral Mattermost:', ephemeralErr instanceof Error ? ephemeralErr.message : ephemeralErr);
      try {
        await createPost({
          channel_id: channelId,
          root_id: post.id,
          message: `📎 ${attachHint}`,
        });
      } catch (threadErr) {
        console.warn('⚠️  Thread hint Mattermost:', threadErr instanceof Error ? threadErr.message : threadErr);
      }
    }
  } catch (err) {
    console.error('❌ Publicar tarjeta Mattermost:', err);
    sendJson(res, 200, {
      error:
        'La incidencia se guardó en OpsFlow, pero no se pudo publicar la tarjeta en Mattermost. ' +
        (err instanceof Error ? err.message : String(err)),
    });
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

  if (req.method === 'GET' && path.endsWith('/health')) {
    sendJson(res, 200, { ok: true, configured: configStatus() });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const raw = await readBody(req);
  const body = parsePayload(req, raw);
  console.log('📥 Mattermost webhook', req.method, path, String(req.headers['content-type'] || ''));

  if (path.endsWith('/action') || path.endsWith('/actions')) {
    await handleInteractiveAction(req, res, body);
    return;
  }
  if (path.endsWith('/command')) {
    await handleCommand(req, res, body);
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
