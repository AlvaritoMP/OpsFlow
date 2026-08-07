import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HandoffItemPayload {
  sourceCandidateId?: string;
  sourceProcessId?: string;
  workerName?: string;
  workerSnapshot?: {
    identity?: {
      fullName?: string;
      nombres?: string;
      apellidoPaterno?: string;
      apellidoMaterno?: string;
      dni?: string;
      email?: string;
      phone?: string;
      phone2?: string;
    };
    fields?: Record<string, unknown>;
    complementary?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  };
}

interface HandoffPayload {
  sourcePackageId: string;
  sourceApp?: string;
  payloadVersion?: number;
  sentAt: string;
  workerCount: number;
  senderNote?: string;
  createdByName?: string;
  items: HandoffItemPayload[];
}

type ComplementaryStatus = 'complete' | 'incomplete' | 'missing';

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function asTrimmedString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function pickFirst(...values: unknown[]): string {
  for (const value of values) {
    const text = asTrimmedString(value);
    if (text) return text;
  }
  return '';
}

function composeNameFromParts(item: HandoffItemPayload): string {
  const identity = item.workerSnapshot?.identity ?? {};
  const fields = item.workerSnapshot?.fields ?? {};
  const complementary = item.workerSnapshot?.complementary ?? {};
  const nombres = pickFirst(
    identity.nombres,
    fields.nombres,
    fields.firstName,
    fields.givenName,
    complementary.nombres,
  );
  const apellidoPaterno = pickFirst(
    identity.apellidoPaterno,
    fields.apellidoPaterno,
    fields.apellido_paterno,
    fields.paternalSurname,
    complementary.apellidoPaterno,
  );
  const apellidoMaterno = pickFirst(
    identity.apellidoMaterno,
    fields.apellidoMaterno,
    fields.apellido_materno,
    fields.maternalSurname,
    complementary.apellidoMaterno,
  );
  return [nombres, apellidoPaterno, apellidoMaterno].filter(Boolean).join(' ');
}

function resolveWorkerName(item: HandoffItemPayload): string | null {
  const composed = composeNameFromParts(item);
  if (composed) return composed;

  const fromField = item.workerName?.trim();
  if (fromField) return fromField;

  const identity = item.workerSnapshot?.identity;
  const fullName = identity?.fullName?.trim();
  const dni = identity?.dni?.trim();
  const complementaryName = asTrimmedString(item.workerSnapshot?.complementary?.fullName);

  if (fullName) return fullName;
  if (complementaryName) return complementaryName;
  if (dni) return dni;
  return null;
}

/**
 * Presentaciones ATS es el flujo activo.
 * Legacy/hire solo si meta.purpose es hire|legacy|contratacion (Recepción ATS archivo).
 * Cualquier otro caso (presentation, null, snapshotVersion >= 2, etc.) → presentation.
 */
function resolveItemPurpose(snapshot: HandoffItemPayload['workerSnapshot']): 'presentation' | null {
  const meta = snapshot?.meta ?? {};
  const purpose = asTrimmedString(meta.purpose).toLowerCase();
  if (purpose === 'hire' || purpose === 'legacy' || purpose === 'contratacion') {
    return null;
  }
  if (purpose === 'presentation') return 'presentation';

  const versionRaw = meta.snapshotVersion;
  const version = typeof versionRaw === 'number' ? versionRaw : Number(versionRaw);
  // v1 sin purpose = hire histórico; v2+ y el resto van a Presentaciones
  if (!Number.isNaN(version) && version >= 2) return 'presentation';
  if (!purpose) return 'presentation';

  return 'presentation';
}

function resolveSnapshotVersion(snapshot: HandoffItemPayload['workerSnapshot']): number {
  const versionRaw = snapshot?.meta?.snapshotVersion;
  const version = typeof versionRaw === 'number' ? versionRaw : Number(versionRaw);
  if (!Number.isNaN(version) && version > 0) return version;
  return 1;
}

function resolveComplementaryStatus(
  snapshot: HandoffItemPayload['workerSnapshot'],
): ComplementaryStatus | null {
  const raw = asTrimmedString(snapshot?.meta?.complementaryStatus).toLowerCase();
  if (raw === 'complete' || raw === 'incomplete' || raw === 'missing') {
    return raw;
  }
  if (snapshot?.complementary && typeof snapshot.complementary === 'object') {
    return 'complete';
  }
  return null;
}

function resolveComplementaryFilledAt(
  snapshot: HandoffItemPayload['workerSnapshot'],
): string | null {
  const fromMeta = asTrimmedString(snapshot?.meta?.complementaryFilledAt);
  if (fromMeta && !Number.isNaN(Date.parse(fromMeta))) return fromMeta;

  const submittedAt = asTrimmedString(snapshot?.complementary?.submittedAt);
  if (submittedAt && !Number.isNaN(Date.parse(submittedAt))) return submittedAt;

  return null;
}

function resolveComplementaryMissingFields(
  snapshot: HandoffItemPayload['workerSnapshot'],
): string[] {
  const raw = snapshot?.meta?.complementaryMissingFields;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => asTrimmedString(entry)).filter(Boolean);
}

/** Completa complementary parcial con identity + fields (ATS a veces manda ficha casi vacía). */
function hydrateComplementary(
  snapshot: HandoffItemPayload['workerSnapshot'],
): Record<string, unknown> | null {
  const base =
    snapshot?.complementary && typeof snapshot.complementary === 'object'
      ? { ...snapshot.complementary }
      : {};
  const identity = snapshot?.identity ?? {};
  const fields = snapshot?.fields ?? {};

  const fill = (key: string, ...candidates: unknown[]) => {
    if (asTrimmedString(base[key])) return;
    const value = pickFirst(...candidates);
    if (value) base[key] = value;
  };

  fill('nombres', identity.nombres, fields.nombres, fields.firstName);
  fill(
    'apellidoPaterno',
    identity.apellidoPaterno,
    fields.apellidoPaterno,
    fields.apPaterno,
    fields.apellido_paterno,
  );
  fill(
    'apellidoMaterno',
    identity.apellidoMaterno,
    fields.apellidoMaterno,
    fields.apMaterno,
    fields.apellido_materno,
  );
  fill('nroDocumento', identity.dni, fields.dni, fields.nroDocumento);
  fill('fechaNacimiento', fields.fechaNacimiento, fields.fNac, fields.birthDate);
  fill('edad', fields.edad, fields.age);
  fill('sexo', fields.sexo, fields.sex, fields.gender);
  fill('email', identity.email, fields.email);
  fill('telefono', identity.phone, identity.phone2, fields.phone, fields.telefono);
  fill('direccion', fields.direccion, fields.address);
  fill('distrito', fields.distrito, fields.district);
  fill('provincia', fields.provincia, fields.province);
  fill('departamento', fields.departamento, fields.department);
  fill('puestoContrato', fields.puestoContrato, fields.processTitle);
  fill('unidadDestaque', fields.unidadDestaque, fields.unidad);
  fill('bancoSueldo', fields.bancoSueldo, fields.banco);
  fill('bancoCts', fields.bancoCts);
  fill('estadoCivil', fields.estadoCivil);
  fill('nacionalidad', fields.nacionalidad);

  if (!asTrimmedString(base.tipoDocumento) && asTrimmedString(base.nroDocumento || identity.dni)) {
    base.tipoDocumento = 'DNI';
  }

  return Object.keys(base).length > 0 ? base : null;
}

function validatePayload(payload: HandoffPayload): string | null {
  if (!payload.sourcePackageId || !isValidUuid(payload.sourcePackageId)) {
    return 'sourcePackageId is required and must be a valid UUID';
  }
  if (!payload.sentAt) {
    return 'sentAt is required';
  }
  if (Number.isNaN(Date.parse(payload.sentAt))) {
    return 'sentAt must be a valid ISO date';
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    return 'At least one item is required';
  }
  if (typeof payload.workerCount !== 'number' || payload.workerCount < 1) {
    return 'workerCount must be a positive integer';
  }
  if (payload.workerCount !== payload.items.length) {
    return 'workerCount must match the number of items';
  }

  for (let i = 0; i < payload.items.length; i++) {
    const item = payload.items[i];
    const workerName = resolveWorkerName(item);
    if (!workerName) {
      return `Item ${i + 1}: workerName or workerSnapshot.identity.fullName/dni is required`;
    }
    if (!item.workerSnapshot || typeof item.workerSnapshot !== 'object') {
      return `Item ${i + 1}: workerSnapshot is required`;
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const ingestSecret = Deno.env.get('OPSFLOW_HANDOFF_INGEST_SECRET') ?? '';
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!ingestSecret || !supabaseUrl || !supabaseServiceKey) {
      console.error('Missing required environment variables');
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    const token = extractBearerToken(req.headers.get('Authorization'));
    if (!token || token !== ingestSecret) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    let payload: HandoffPayload;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const validationError = validatePayload(payload);
    if (validationError) {
      return jsonResponse({ error: validationError }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('inbound_worker_handoff_packages')
      .select('id, source_package_id, status, purpose')
      .eq('source_package_id', payload.sourcePackageId)
      .maybeSingle();

    if (existingError) {
      console.error('Error checking existing package:', existingError);
      return jsonResponse({ error: 'Database error' }, 500);
    }

    if (existing) {
      return jsonResponse(
        {
          id: existing.id,
          sourcePackageId: existing.source_package_id,
          status: existing.status,
          purpose: existing.purpose ?? null,
          duplicate: true,
        },
        200,
      );
    }

    const itemPurposes = payload.items.map((item) => resolveItemPurpose(item.workerSnapshot));
    const packagePurpose = itemPurposes.some((p) => p === 'presentation') ? 'presentation' : null;

    const packageRow = {
      source_app: payload.sourceApp?.trim() || 'Opalo ATS',
      source_package_id: payload.sourcePackageId,
      status: 'received',
      worker_count: payload.workerCount,
      sender_note: payload.senderNote?.trim() || null,
      source_created_by_name: payload.createdByName?.trim() || null,
      source_sent_at: payload.sentAt,
      payload_version: payload.payloadVersion ?? 1,
      purpose: packagePurpose,
    };

    const { data: insertedPackage, error: packageError } = await supabaseAdmin
      .from('inbound_worker_handoff_packages')
      .insert(packageRow)
      .select('id, source_package_id, status, purpose')
      .single();

    if (packageError || !insertedPackage) {
      if (packageError?.code === '23505') {
        const { data: raced } = await supabaseAdmin
          .from('inbound_worker_handoff_packages')
          .select('id, source_package_id, status, purpose')
          .eq('source_package_id', payload.sourcePackageId)
          .single();

        if (raced) {
          return jsonResponse(
            {
              id: raced.id,
              sourcePackageId: raced.source_package_id,
              status: raced.status,
              purpose: raced.purpose ?? null,
              duplicate: true,
            },
            200,
          );
        }
      }

      console.error('Error inserting package:', packageError);
      return jsonResponse({ error: 'Failed to create package' }, 500);
    }

    const itemRows = payload.items.map((item) => {
      const snapshot = item.workerSnapshot!;
      const purpose = resolveItemPurpose(snapshot);
      const complementary = hydrateComplementary(snapshot);
      const snapshotWithComplementary = complementary
        ? { ...snapshot, complementary }
        : snapshot;
      const complementaryStatus =
        purpose === 'presentation'
          ? resolveComplementaryStatus(snapshotWithComplementary) ??
            (complementary ? 'incomplete' : 'missing')
          : resolveComplementaryStatus(snapshotWithComplementary);

      return {
        package_id: insertedPackage.id,
        source_candidate_id: item.sourceCandidateId ?? null,
        source_process_id: item.sourceProcessId ?? null,
        worker_name: resolveWorkerName(item)!,
        worker_snapshot: snapshotWithComplementary,
        item_status: purpose === 'presentation' ? 'pending_interview' : 'pending',
        purpose,
        snapshot_version: resolveSnapshotVersion(snapshot),
        complementary,
        complementary_status: complementaryStatus,
        complementary_filled_at: resolveComplementaryFilledAt(snapshotWithComplementary),
        complementary_missing_fields: resolveComplementaryMissingFields(snapshot),
      };
    });

    const { error: itemsError } = await supabaseAdmin
      .from('inbound_worker_handoff_items')
      .insert(itemRows);

    if (itemsError) {
      console.error('Error inserting items, rolling back package:', itemsError);
      await supabaseAdmin
        .from('inbound_worker_handoff_packages')
        .delete()
        .eq('id', insertedPackage.id);

      return jsonResponse({ error: 'Failed to create package items' }, 500);
    }

    return jsonResponse(
      {
        id: insertedPackage.id,
        sourcePackageId: insertedPackage.source_package_id,
        status: insertedPackage.status,
        purpose: insertedPackage.purpose ?? null,
      },
      201,
    );
  } catch (error) {
    console.error('Edge Function Error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
