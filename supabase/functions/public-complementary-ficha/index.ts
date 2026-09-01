import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version, x-region, prefer, accept',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const MAX_COMPLEMENTARY_BYTES = 100_000;
const SESSION_HOURS = 12;

type JsonRecord = Record<string, unknown>;

interface FichaRow {
  id: string;
  dni: string;
  complementary: JsonRecord;
  open_count: number;
  max_opens: number;
  last_opened_at: string | null;
  last_saved_at: string | null;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function asTrimmedString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeDni(value: unknown): string | null {
  const normalized = asTrimmedString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 15);
  if (normalized.length < 5) return null;
  return normalized;
}

function inferDocumentType(doc: string): string {
  if (/[A-Z]/.test(doc)) return 'Pasaporte';
  if (/^\d{8}$/.test(doc)) return 'DNI';
  if (/^\d{9}$/.test(doc)) return 'CE';
  return 'DNI';
}

function documentsMatch(a: unknown, b: unknown): boolean {
  const left = asTrimmedString(a).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const right = asTrimmedString(b).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return Boolean(left && right && left === right);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function pickText(...values: unknown[]): string {
  for (const value of values) {
    const text = asTrimmedString(value);
    if (text) return text;
  }
  return '';
}

function hydrateComplementary(
  stored: JsonRecord,
  snapshot: JsonRecord,
  resource?: { name?: string; dni?: string; phone?: string; email?: string; birth_date?: string },
): JsonRecord {
  const complementary = { ...asRecord(snapshot.complementary), ...stored };
  const identity = asRecord(snapshot.identity);
  const fields = asRecord(snapshot.fields);

  const fill = (key: string, ...candidates: unknown[]) => {
    if (asTrimmedString(complementary[key])) return;
    const value = pickText(...candidates);
    if (value) complementary[key] = value;
  };

  fill('nombres', identity.nombres, fields.nombres, fields.firstName);
  fill(
    'apellidoPaterno',
    identity.apellidoPaterno,
    fields.apellidoPaterno,
    fields.apPaterno,
  );
  fill(
    'apellidoMaterno',
    identity.apellidoMaterno,
    fields.apellidoMaterno,
    fields.apMaterno,
  );
  fill('nroDocumento', identity.dni, fields.dni, fields.nroDocumento, resource?.dni);
  fill(
    'fechaNacimiento',
    fields.fechaNacimiento,
    fields.birthDate,
    resource?.birth_date,
  );
  fill('email', identity.email, fields.email, resource?.email);
  fill('telefono', identity.phone, fields.phone, fields.telefono, resource?.phone);
  fill('direccion', fields.direccion, fields.address);
  fill('distrito', fields.distrito, fields.district);
  fill('provincia', fields.provincia, fields.province);
  fill('departamento', fields.departamento, fields.department);
  fill('sexo', fields.sexo, fields.sex);
  fill('estadoCivil', fields.estadoCivil);
  fill('nacionalidad', fields.nacionalidad);
  fill('puestoContrato', fields.puestoContrato);
  fill('unidadDestaque', fields.unidadDestaque);

  if (!asTrimmedString(complementary.tipoDocumento) && asTrimmedString(complementary.nroDocumento)) {
    complementary.tipoDocumento = inferDocumentType(asTrimmedString(complementary.nroDocumento));
  }

  if (!asTrimmedString(complementary.nombres) && resource?.name) {
    complementary.nombres = resource.name;
  }

  return complementary;
}

function complementaryStatus(complementary: JsonRecord): 'complete' | 'incomplete' | 'missing' {
  const keys = [
    'nombres',
    'apellidoPaterno',
    'apellidoMaterno',
    'nroDocumento',
    'fechaNacimiento',
    'sexo',
    'email',
    'telefono',
    'direccion',
    'distrito',
    'provincia',
  ];
  const filled = keys.filter((key) => asTrimmedString(complementary[key])).length;
  if (filled === 0) return 'missing';
  if (filled < Math.ceil(keys.length * 0.6)) return 'incomplete';
  return 'complete';
}

function remainingOpens(openCount: number, maxOpens: number, canEdit: boolean): number {
  if (!canEdit) return 0;
  return Math.max(0, maxOpens - openCount);
}

function complementaryNeedsHydration(complementary: JsonRecord): boolean {
  const keys = Object.keys(complementary).filter((key) => asTrimmedString(complementary[key]));
  if (keys.length === 0) return true;
  return keys.every(
    (key) => key === 'tipoDocumento' || key === 'nroDocumento' || key === 'submittedAt',
  );
}

async function findExistingSnapshot(
  admin: SupabaseClient,
  dni: string,
): Promise<{ complementary: JsonRecord; snapshot: JsonRecord; resource?: JsonRecord }> {
  const { data: exactRows } = await admin
    .from('resources')
    .select('id, name, dni, phone, email, birth_date, inbound_source_data')
    .ilike('dni', dni)
    .eq('type', 'Personal')
    .limit(1);
  let resource = exactRows?.[0];

  if (!resource) {
    const { data: looseRows } = await admin
      .from('resources')
      .select('id, name, dni, phone, email, birth_date, inbound_source_data')
      .eq('type', 'Personal')
      .ilike('dni', `%${dni}%`)
      .limit(20);
    resource = (looseRows ?? []).find((row) => documentsMatch(row.dni, dni));
  }

  if (resource) {
    const inbound = asRecord(resource.inbound_source_data);
    const snapshot = asRecord(inbound.workerSnapshot);
    const stored = asRecord(snapshot.complementary);
    return {
      complementary: hydrateComplementary(stored, snapshot, {
        name: asTrimmedString(resource.name),
        dni,
        phone: asTrimmedString(resource.phone),
        email: asTrimmedString(resource.email),
        birth_date: asTrimmedString(resource.birth_date),
      }),
      snapshot,
      resource: asRecord(resource),
    };
  }

  const { data: items } = await admin
    .from('inbound_worker_handoff_items')
    .select('id, worker_snapshot, complementary, purpose, item_status, created_at')
    .or(
      `worker_snapshot->identity->>dni.eq.${dni},complementary->>nroDocumento.eq.${dni},worker_snapshot->complementary->>nroDocumento.eq.${dni}`,
    )
    .order('created_at', { ascending: false })
    .limit(5);

  const item = (items ?? []).find((row) => {
    const snapshot = asRecord(row.worker_snapshot);
    const identity = asRecord(snapshot.identity);
    const stored = asRecord(row.complementary);
    const nested = asRecord(snapshot.complementary);
    const found = pickText(identity.dni, stored.nroDocumento, nested.nroDocumento);
    return documentsMatch(found, dni);
  });

  if (item) {
    const snapshot = asRecord(item.worker_snapshot);
    return {
      complementary: hydrateComplementary(asRecord(item.complementary), snapshot),
      snapshot,
    };
  }

  return { complementary: { tipoDocumento: inferDocumentType(dni), nroDocumento: dni }, snapshot: {} };
}

function overlayComplementaryOnHrFields(hr: JsonRecord, complementary: JsonRecord): JsonRecord {
  const next = { ...hr };
  const setIf = (key: string, value: unknown) => {
    const text = asTrimmedString(value);
    if (text) next[key] = text;
  };
  setIf('nombres', complementary.nombres);
  setIf('apellidoPaterno', complementary.apellidoPaterno);
  setIf('apellidoMaterno', complementary.apellidoMaterno);
  setIf('documento', complementary.nroDocumento);
  setIf('fechaNacimiento', complementary.fechaNacimiento);
  setIf('direccion', complementary.direccion);
  setIf('telefono', complementary.telefono);
  setIf('correoPersonal', complementary.email);
  setIf('tallaPoloCamisa', complementary.tallaCamisa);
  setIf('tallaPantalon', complementary.tallaPantalon);
  setIf('bancoPreferencia', complementary.bancoSueldo);
  setIf(
    'sistemaPension',
    complementary.sistemaPensionesDeseado || complementary.sistemaPensionesAnterior,
  );
  const sexo = asTrimmedString(complementary.sexo);
  if (sexo) next.sexo = sexo.slice(0, 1).toUpperCase();
  const shoe = Number(asTrimmedString(complementary.tallaCalzado).replace(',', '.'));
  if (Number.isFinite(shoe) && shoe > 0) next.tallaZapatos = shoe;

  const labels = asRecord(next.labels);
  const setLabel = (key: string, value: unknown) => {
    const text = asTrimmedString(value);
    if (text) labels[key] = text;
  };
  setLabel('departamento', complementary.departamento);
  setLabel('provincia', complementary.provincia);
  setLabel('distrito', complementary.distrito);
  setLabel('banco', complementary.bancoSueldo);
  setLabel(
    'fondoPension',
    complementary.sistemaPensionesDeseado || complementary.sistemaPensionesAnterior,
  );
  setLabel('estadoCivil', complementary.estadoCivil);
  next.labels = labels;
  return next;
}

async function syncComplementary(
  admin: SupabaseClient,
  dni: string,
  complementary: JsonRecord,
): Promise<void> {
  const now = new Date().toISOString();
  const status = complementaryStatus(complementary);

  const { data: exactResources } = await admin
    .from('resources')
    .select('id, dni, phone, email, birth_date, inbound_source_data')
    .ilike('dni', dni)
    .eq('type', 'Personal');
  let matchedResources = exactResources ?? [];
  if (matchedResources.length === 0) {
    const { data: looseResources } = await admin
      .from('resources')
      .select('id, dni, phone, email, birth_date, inbound_source_data')
      .eq('type', 'Personal')
      .ilike('dni', `%${dni}%`)
      .limit(20);
    matchedResources = (looseResources ?? []).filter((row) => documentsMatch(row.dni, dni));
  }

  const resourceIds: string[] = [];
  for (const resource of matchedResources) {
    resourceIds.push(resource.id as string);
    const inbound = asRecord(resource.inbound_source_data);
    const snapshot = asRecord(inbound.workerSnapshot);
    const nextInbound = {
      ...inbound,
      sourceApp: inbound.sourceApp || 'OpsFlow',
      workerSnapshot: {
        ...snapshot,
        complementary,
        meta: {
          ...asRecord(snapshot.meta),
          complementaryStatus: status,
          complementaryFilledAt: now,
        },
      },
    };
    const patch: JsonRecord = { inbound_source_data: nextInbound };
    if (!asTrimmedString(resource.phone) && asTrimmedString(complementary.telefono)) {
      patch.phone = asTrimmedString(complementary.telefono);
    }
    if (!asTrimmedString(resource.email) && asTrimmedString(complementary.email)) {
      patch.email = asTrimmedString(complementary.email);
    }
    if (!asTrimmedString(resource.birth_date) && asTrimmedString(complementary.fechaNacimiento)) {
      patch.birth_date = asTrimmedString(complementary.fechaNacimiento);
    }
    await admin.from('resources').update(patch).eq('id', resource.id);
  }

  if (resourceIds.length > 0) {
    const { data: queueRows } = await admin
      .from('hr_outbound_ingreso_queue')
      .select('id, worker_snapshot, hr_fields, worker_name')
      .in('resource_id', resourceIds)
      .eq('queue_status', 'pendiente_envio');

    for (const queue of queueRows ?? []) {
      const snapshot = asRecord(queue.worker_snapshot);
      const ats = asRecord(snapshot.ats);
      const identity = asRecord(ats.identity);
      const hr = overlayComplementaryOnHrFields(asRecord(queue.hr_fields), complementary);
      const workerName =
        [hr.apellidoPaterno, hr.apellidoMaterno, hr.nombres]
          .map((part) => asTrimmedString(part))
          .filter(Boolean)
          .join(' ') || asTrimmedString(queue.worker_name);
      await admin
        .from('hr_outbound_ingreso_queue')
        .update({
          hr_fields: hr,
          worker_name: workerName,
          worker_snapshot: {
            ...snapshot,
            ats: {
              ...ats,
              complementary,
              identity: {
                ...identity,
                dni: complementary.nroDocumento || identity.dni,
                nombres: complementary.nombres || identity.nombres,
                apellidoPaterno: complementary.apellidoPaterno || identity.apellidoPaterno,
                apellidoMaterno: complementary.apellidoMaterno || identity.apellidoMaterno,
                email: complementary.email || identity.email,
                phone: complementary.telefono || identity.phone,
              },
            },
          },
        })
        .eq('id', queue.id);
    }
  }

  const { data: items } = await admin
    .from('inbound_worker_handoff_items')
    .select('id, worker_snapshot, complementary, item_status, purpose')
    .or(
      `worker_snapshot->identity->>dni.eq.${dni},complementary->>nroDocumento.eq.${dni},worker_snapshot->complementary->>nroDocumento.eq.${dni}`,
    )
    .limit(20);

  for (const item of items ?? []) {
    if (item.item_status === 'rejected' || item.item_status === 'archived_no_hire') continue;
    const snapshot = asRecord(item.worker_snapshot);
    const identity = asRecord(snapshot.identity);
    const stored = asRecord(item.complementary);
    const nested = asRecord(snapshot.complementary);
    const found = pickText(identity.dni, stored.nroDocumento, nested.nroDocumento);
    if (!documentsMatch(found, dni)) continue;

    const nextSnapshot = {
      ...snapshot,
      complementary,
      meta: {
        ...asRecord(snapshot.meta),
        complementaryStatus: status,
        complementaryFilledAt: now,
      },
    };

    await admin
      .from('inbound_worker_handoff_items')
      .update({
        complementary,
        complementary_status: status,
        complementary_filled_at: now,
        worker_snapshot: nextSnapshot,
      })
      .eq('id', item.id);
  }
}

async function getValidSession(
  admin: SupabaseClient,
  dni: string,
  sessionToken: string | undefined,
): Promise<{ ficha: FichaRow; sessionToken: string } | null> {
  const token = asTrimmedString(sessionToken);
  if (!token) return null;

  const { data } = await admin
    .from('public_complementary_ficha_sessions')
    .select('session_token, expires_at, ficha:public_complementary_fichas(*)')
    .eq('session_token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  const ficha = data?.ficha as FichaRow | FichaRow[] | null;
  const row = Array.isArray(ficha) ? ficha[0] : ficha;
  if (!row || !documentsMatch(row.dni, dni)) return null;
  return { ficha: row, sessionToken: token };
}

async function createSession(admin: SupabaseClient, fichaId: string): Promise<string> {
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from('public_complementary_ficha_sessions').insert({
    ficha_id: fichaId,
    session_token: sessionToken,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return sessionToken;
}

function payloadFromFicha(
  ficha: FichaRow,
  canEdit: boolean,
  sessionToken: string | null,
) {
  const maxOpens = ficha.max_opens || 3;
  return {
    dni: ficha.dni,
    complementary: ficha.complementary ?? {},
    openCount: ficha.open_count,
    maxOpens,
    remainingOpens: remainingOpens(ficha.open_count, maxOpens, canEdit),
    canEdit,
    locked: !canEdit,
    sessionToken,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    let body: JsonRecord;
    try {
      body = asRecord(await req.json());
    } catch {
      return jsonResponse({ error: 'JSON inválido' }, 400);
    }

    const action = asTrimmedString(body.action);
    const dni = normalizeDni(body.dni);
    if (!dni) {
      return jsonResponse({ error: 'Ingresa un documento válido (DNI, CE o pasaporte)' }, 400);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (action === 'open') {
      const existingSession = await getValidSession(admin, dni, asTrimmedString(body.sessionToken));
      if (existingSession) {
        return jsonResponse(
          payloadFromFicha(existingSession.ficha, true, existingSession.sessionToken),
          200,
        );
      }

      const { data: opened, error: openError } = await admin.rpc(
        'try_open_public_complementary_ficha',
        { p_dni: dni },
      );
      if (openError) {
        console.error('try_open_public_complementary_ficha', openError);
        return jsonResponse({ error: 'No se pudo abrir la ficha' }, 500);
      }

      let ficha = (Array.isArray(opened) ? opened[0] : opened) as FichaRow | null;
      if (ficha && !ficha.id) ficha = null;

      if (!ficha) {
        const { data: lockedRow, error: lockedError } = await admin
          .from('public_complementary_fichas')
          .select('*')
          .ilike('dni', dni)
          .maybeSingle();
        if (lockedError || !lockedRow) {
          return jsonResponse({ error: 'No se pudo abrir la ficha' }, 500);
        }
        ficha = lockedRow as FichaRow;
      }

      let complementary = asRecord(ficha.complementary);
      if (complementaryNeedsHydration(complementary)) {
        const found = await findExistingSnapshot(admin, dni);
        complementary = {
          ...found.complementary,
          tipoDocumento:
            asTrimmedString(found.complementary.tipoDocumento) || inferDocumentType(dni),
          nroDocumento: dni,
        };
        await admin
          .from('public_complementary_fichas')
          .update({ complementary })
          .eq('id', ficha.id);
      } else {
        complementary = {
          ...complementary,
          tipoDocumento: asTrimmedString(complementary.tipoDocumento) || inferDocumentType(dni),
          nroDocumento: dni,
        };
      }

      const sessionToken = await createSession(admin, ficha.id);

      return jsonResponse(
        payloadFromFicha({ ...ficha, complementary }, true, sessionToken),
        200,
      );
    }

    if (action === 'save') {
      const existingSession = await getValidSession(admin, dni, asTrimmedString(body.sessionToken));
      if (!existingSession) {
        return jsonResponse(
          { error: 'Sesión vencida o sin cupos. Vuelve a ingresar tu documento.' },
          403,
        );
      }

      const complementary = asRecord(body.complementary);
      const serialized = JSON.stringify(complementary);
      if (serialized.length > MAX_COMPLEMENTARY_BYTES) {
        return jsonResponse({ error: 'La ficha es demasiado grande' }, 400);
      }

      complementary.tipoDocumento =
        asTrimmedString(complementary.tipoDocumento) || inferDocumentType(dni);
      complementary.nroDocumento = dni;
      complementary.submittedAt = new Date().toISOString();

      const { data: updated, error: updateError } = await admin
        .from('public_complementary_fichas')
        .update({
          complementary,
          last_saved_at: new Date().toISOString(),
        })
        .eq('id', existingSession.ficha.id)
        .select('*')
        .single();

      if (updateError || !updated) {
        console.error('save public ficha', updateError);
        return jsonResponse({ error: 'No se pudo guardar la ficha' }, 500);
      }

      try {
        await syncComplementary(admin, dni, complementary);
      } catch (syncError) {
        console.error('sync complementary', syncError);
      }

      return jsonResponse(
        payloadFromFicha(updated as FichaRow, true, existingSession.sessionToken),
        200,
      );
    }

    return jsonResponse({ error: 'Acción no válida' }, 400);
  } catch (error) {
    console.error('public-complementary-ficha', error);
    return jsonResponse({ error: 'Error interno' }, 500);
  }
});
