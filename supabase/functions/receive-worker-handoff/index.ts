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
  const nombres = pickFirst(identity.nombres, fields.nombres, fields.firstName, fields.givenName);
  const apellidoPaterno = pickFirst(
    identity.apellidoPaterno,
    fields.apellidoPaterno,
    fields.apellido_paterno,
    fields.paternalSurname,
  );
  const apellidoMaterno = pickFirst(
    identity.apellidoMaterno,
    fields.apellidoMaterno,
    fields.apellido_materno,
    fields.maternalSurname,
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

  if (fullName) return fullName;
  if (dni) return dni;
  return null;
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
      .select('id, source_package_id, status')
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
          duplicate: true,
        },
        200,
      );
    }

    const packageRow = {
      source_app: payload.sourceApp?.trim() || 'Opalo ATS',
      source_package_id: payload.sourcePackageId,
      status: 'received',
      worker_count: payload.workerCount,
      sender_note: payload.senderNote?.trim() || null,
      source_created_by_name: payload.createdByName?.trim() || null,
      source_sent_at: payload.sentAt,
      payload_version: payload.payloadVersion ?? 1,
    };

    const { data: insertedPackage, error: packageError } = await supabaseAdmin
      .from('inbound_worker_handoff_packages')
      .insert(packageRow)
      .select('id, source_package_id, status')
      .single();

    if (packageError || !insertedPackage) {
      if (packageError?.code === '23505') {
        const { data: raced } = await supabaseAdmin
          .from('inbound_worker_handoff_packages')
          .select('id, source_package_id, status')
          .eq('source_package_id', payload.sourcePackageId)
          .single();

        if (raced) {
          return jsonResponse(
            {
              id: raced.id,
              sourcePackageId: raced.source_package_id,
              status: raced.status,
              duplicate: true,
            },
            200,
          );
        }
      }

      console.error('Error inserting package:', packageError);
      return jsonResponse({ error: 'Failed to create package' }, 500);
    }

    const itemRows = payload.items.map((item) => ({
      package_id: insertedPackage.id,
      source_candidate_id: item.sourceCandidateId ?? null,
      source_process_id: item.sourceProcessId ?? null,
      worker_name: resolveWorkerName(item)!,
      worker_snapshot: item.workerSnapshot,
      item_status: 'pending',
    }));

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
      },
      201,
    );
  } catch (error) {
    console.error('Edge Function Error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
