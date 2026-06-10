import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: 'send-package' | 'fetch-unidades' | 'check-package-status';
  queueItemIds?: string[];
  reportDate?: string;
  senderNote?: string | null;
  sentByName?: string | null;
  packageId?: string;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isMockMode(): boolean {
  const explicit = Deno.env.get('OPALOSIS_USE_MOCK');
  if (explicit === 'false') return false;
  if (explicit === 'true') return true;
  const baseUrl = Deno.env.get('OPALOSIS_API_BASE_URL')?.trim();
  const apiKey = Deno.env.get('OPALOSIS_API_KEY')?.trim();
  return !baseUrl || !apiKey;
}

function getOpalosisConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = Deno.env.get('OPALOSIS_API_BASE_URL')?.trim();
  const apiKey = Deno.env.get('OPALOSIS_API_KEY')?.trim();
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey };
}

async function callOpalosis(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const config = getOpalosisConfig();
  if (!config) throw new Error('Opalosis no configurado');

  const url = `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': config.apiKey,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { ok: response.ok, status: response.status, data };
}

function mapPackageStatus(estado: string): string {
  const n = estado.toUpperCase();
  if (n === 'PROCESADO') return 'procesado';
  if (n === 'OBSERVADO') return 'observado';
  if (n === 'RECHAZADO') return 'rechazado';
  if (n === 'PARCIALMENTE_PROCESADO') return 'parcialmente_procesado';
  if (n === 'PENDIENTE') return 'enviado';
  return 'enviado';
}

function simulatePackageResponse(sourcePackageId: string, workerCount: number) {
  return {
    sourcePackageId,
    estado: 'PENDIENTE',
    mensaje: 'Paquete recibido correctamente (modo simulación — Opalosis no configurado).',
    fecha_recepcion: new Date().toISOString(),
    itemsReceived: workerCount,
  };
}

function simulateUnidades() {
  return [
    { id: 12, nombre: 'Planta Lima Norte (simulado)', activo: true },
    { id: 13, nombre: 'Oficina Central (simulado)', activo: true },
    { id: 14, nombre: 'Almacén Callao (simulado)', activo: false },
  ];
}

function buildOutboundPackagePayload(
  sourcePackageId: string,
  reportDate: string,
  senderNote: string | null,
  sentByName: string | null,
  queueRows: Array<Record<string, unknown>>,
) {
  return {
    sourceApp: 'OpsFlow',
    sourcePackageId,
    payloadVersion: 1,
    sentAt: new Date().toISOString(),
    reportDate,
    workerCount: queueRows.length,
    senderNote: senderNote?.trim() || null,
    createdByName: sentByName?.trim() || null,
    items: queueRows.map((row) => ({
      refOperaciones: row.ref_operaciones,
      resourceId: row.resource_id,
      opsflowUnitId: row.opsflow_unit_id,
      workerName: row.worker_name,
      workerSnapshot: row.worker_snapshot,
      hrFields: row.hr_fields,
    })),
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

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const mock = isMockMode();

    if (body.action === 'send-package') {
      const queueItemIds = body.queueItemIds ?? [];
      const reportDate = body.reportDate?.trim();

      if (!reportDate) {
        return jsonResponse({ error: 'reportDate is required' }, 400);
      }
      if (queueItemIds.length === 0) {
        return jsonResponse({ error: 'queueItemIds must not be empty' }, 400);
      }

      const { data: queueRows, error: queueError } = await supabaseAdmin
        .from('hr_outbound_ingreso_queue')
        .select('*')
        .in('id', queueItemIds)
        .eq('queue_status', 'pendiente_envio');

      if (queueError) {
        return jsonResponse({ error: 'Database error loading queue' }, 500);
      }
      if (!queueRows || queueRows.length !== queueItemIds.length) {
        return jsonResponse({
          error: 'Algunos trabajadores ya no están pendientes de envío o no existen',
        }, 400);
      }

      const sourcePackageId = crypto.randomUUID();
      const outboundPayload = buildOutboundPackagePayload(
        sourcePackageId,
        reportDate,
        body.senderNote ?? null,
        body.sentByName ?? null,
        queueRows as Array<Record<string, unknown>>,
      );

      const { data: insertedPackage, error: packageError } = await supabaseAdmin
        .from('hr_outbound_ingreso_packages')
        .insert({
          source_package_id: sourcePackageId,
          report_date: reportDate,
          worker_count: queueRows.length,
          status: 'pendiente',
          sender_note: body.senderNote?.trim() || null,
          sent_by_name: body.sentByName?.trim() || null,
        })
        .select('*')
        .single();

      if (packageError || !insertedPackage) {
        console.error('Package insert error:', packageError);
        return jsonResponse({ error: 'Failed to create package' }, 500);
      }

      const packageItems = queueRows.map((row) => ({
        package_id: insertedPackage.id,
        queue_item_id: row.id,
        ref_operaciones: row.ref_operaciones,
        resource_id: row.resource_id,
        worker_name: row.worker_name,
        worker_snapshot: row.worker_snapshot,
        hr_fields: row.hr_fields,
        item_status: 'pendiente',
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('hr_outbound_ingreso_package_items')
        .insert(packageItems);

      if (itemsError) {
        await supabaseAdmin.from('hr_outbound_ingreso_packages').delete().eq('id', insertedPackage.id);
        return jsonResponse({ error: 'Failed to create package items' }, 500);
      }

      let opalosisResponse: Record<string, unknown>;
      let packageStatus: string;
      let fechaRecepcion: string | null = null;

      if (mock) {
        opalosisResponse = simulatePackageResponse(sourcePackageId, queueRows.length);
        packageStatus = 'simulado';
        fechaRecepcion = opalosisResponse.fecha_recepcion as string;
      } else {
        const result = await callOpalosis('/api/ingresos/paquetes', {
          method: 'POST',
          body: outboundPayload,
        });

        opalosisResponse = (result.data ?? {}) as Record<string, unknown>;

        if (!result.ok) {
          await supabaseAdmin
            .from('hr_outbound_ingreso_packages')
            .update({
              status: 'error',
              sent_at: new Date().toISOString(),
              opalosis_response: opalosisResponse,
            })
            .eq('id', insertedPackage.id);

          return jsonResponse({
            error: `Opalosis respondió HTTP ${result.status}`,
            package: insertedPackage,
            details: opalosisResponse,
          }, 502);
        }

        packageStatus = mapPackageStatus(String(opalosisResponse.estado ?? 'PENDIENTE'));
        fechaRecepcion = (opalosisResponse.fecha_recepcion as string) ?? new Date().toISOString();
      }

      const sentAt = new Date().toISOString();

      await supabaseAdmin
        .from('hr_outbound_ingreso_packages')
        .update({
          status: packageStatus,
          sent_at: sentAt,
          fecha_recepcion: fechaRecepcion,
          opalosis_response: opalosisResponse,
        })
        .eq('id', insertedPackage.id);

      await supabaseAdmin
        .from('hr_outbound_ingreso_queue')
        .update({
          queue_status: 'incluido_paquete',
          package_id: insertedPackage.id,
        })
        .in('id', queueItemIds);

      const { data: finalPackage } = await supabaseAdmin
        .from('hr_outbound_ingreso_packages')
        .select('*')
        .eq('id', insertedPackage.id)
        .single();

      return jsonResponse({
        package: finalPackage,
        simulated: mock,
        opalosisResponse,
      }, 201);
    }

    if (body.action === 'fetch-unidades') {
      let units: Array<{ id: number; nombre: string; activo: boolean }>;
      const fetchedAt = new Date().toISOString();

      if (mock) {
        units = simulateUnidades();
      } else {
        const result = await callOpalosis('/api/unidades');
        if (!result.ok) {
          return jsonResponse({ error: `Opalosis respondió HTTP ${result.status}`, details: result.data }, 502);
        }
        if (!Array.isArray(result.data)) {
          return jsonResponse({ error: 'Respuesta inesperada de /api/unidades' }, 502);
        }
        units = result.data as Array<{ id: number; nombre: string; activo: boolean }>;
      }

      const cacheRows = units.map((u) => ({
        opalosis_unidad_id: u.id,
        nombre: u.nombre,
        activo: u.activo ?? true,
        fetched_at: fetchedAt,
      }));

      if (cacheRows.length > 0) {
        await supabaseAdmin.from('hr_units_cache').upsert(cacheRows, { onConflict: 'opalosis_unidad_id' });
      }

      const { data: cached } = await supabaseAdmin
        .from('hr_units_cache')
        .select('*')
        .order('nombre', { ascending: true });

      return jsonResponse({
        units: (cached ?? []).map((row) => ({
          opalosisUnidadId: row.opalosis_unidad_id,
          nombre: row.nombre,
          activo: row.activo,
          fetchedAt: row.fetched_at,
        })),
        simulated: mock,
        fetchedAt,
      });
    }

    if (body.action === 'check-package-status') {
      const packageId = body.packageId?.trim();
      if (!packageId) {
        return jsonResponse({ error: 'packageId is required' }, 400);
      }

      const { data: pkg, error: pkgError } = await supabaseAdmin
        .from('hr_outbound_ingreso_packages')
        .select('*')
        .eq('id', packageId)
        .maybeSingle();

      if (pkgError) return jsonResponse({ error: 'Database error' }, 500);
      if (!pkg) return jsonResponse({ error: 'Paquete no encontrado' }, 404);

      if (mock) {
        return jsonResponse({
          packageId,
          status: pkg.status,
          simulated: true,
          mensaje: 'Modo simulación — configure Opalosis para consultar estado real.',
        });
      }

      const result = await callOpalosis(
        `/api/ingresos/paquetes/${encodeURIComponent(pkg.source_package_id)}`,
      );

      if (!result.ok) {
        return jsonResponse({ error: `Opalosis respondió HTTP ${result.status}`, details: result.data }, 502);
      }

      const estadoData = result.data as Record<string, unknown>;
      const newStatus = mapPackageStatus(String(estadoData.estado ?? 'PENDIENTE'));

      await supabaseAdmin
        .from('hr_outbound_ingreso_packages')
        .update({
          status: newStatus,
          opalosis_response: estadoData,
          fecha_recepcion: (estadoData.fecha_recepcion as string) ?? pkg.fecha_recepcion,
        })
        .eq('id', packageId);

      return jsonResponse({
        packageId,
        status: newStatus,
        simulated: false,
        opalosisResponse: estadoData,
      });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error('Edge Function Error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500,
    );
  }
});
