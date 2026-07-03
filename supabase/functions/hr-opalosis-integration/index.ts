import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REGISTRO_INGRESO_PATH = '/api/opsflow/registro-ingreso';

const TIPO_DOCUMENTO_ID: Record<string, number> = {
  DNI: 1,
  PASAPORTE: 2,
  CE: 3,
  PTP: 4,
};

interface RequestBody {
  action: 'send-package' | 'fetch-unidades' | 'check-package-status' | 'test-registro-ingreso';
  queueItemIds?: string[];
  reportDate?: string;
  senderNote?: string | null;
  sentByName?: string | null;
  packageId?: string;
  /** Payload directo para prueba de conectividad (opcional). */
  testPayload?: Record<string, unknown>;
}

interface OpalosisRegistroIngresoPayload {
  TipoDocumentoId: number;
  Documento: string;
  ApellidoPaterno: string;
  ApellidoMaterno: string;
  Nombres: string;
  Sexo: string;
  FechaIngreso: string;
  FechaNacimiento?: string | null;
  Cargo?: string | null;
  CorreoPersonal?: string | null;
  Telefono?: string | null;
  Direccion?: string | null;
  EstadoCivil?: string | null;
  EmpresaCodigo?: number | null;
  UnidadId?: number | null;
  RefOperaciones?: string | null;
  Pais?: string | null;
}

interface RegistroIngresoResult {
  queueItemId?: string;
  refOperaciones: string;
  workerName: string;
  ok: boolean;
  itemStatus: 'procesado' | 'rechazado' | 'observado';
  ingresoId?: number;
  ingresoCod?: string;
  mensaje: string;
  response: Record<string, unknown>;
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

function mapHrFieldsToRegistroPayload(
  hrFields: Record<string, unknown>,
): OpalosisRegistroIngresoPayload {
  const tipoDoc = String(hrFields.tipo_documento ?? 'DNI').toUpperCase();
  const payload: OpalosisRegistroIngresoPayload = {
    TipoDocumentoId: TIPO_DOCUMENTO_ID[tipoDoc] ?? TIPO_DOCUMENTO_ID.DNI,
    Documento: String(hrFields.documento ?? ''),
    ApellidoPaterno: String(hrFields.apellido_paterno ?? ''),
    ApellidoMaterno: String(hrFields.apellido_materno ?? ''),
    Nombres: String(hrFields.nombres ?? ''),
    Sexo: String(hrFields.sexo ?? 'M').slice(0, 1).toUpperCase(),
    FechaIngreso: String(
      hrFields.fecha_ingreso ?? new Date().toISOString().slice(0, 10),
    ),
  };

  const optionalStringFields: Array<[keyof OpalosisRegistroIngresoPayload, string]> = [
    ['FechaNacimiento', 'fecha_nacimiento'],
    ['Cargo', 'cargo'],
    ['CorreoPersonal', 'correo_personal'],
    ['Telefono', 'telefono'],
    ['Direccion', 'direccion'],
    ['EstadoCivil', 'estado_civil'],
    ['RefOperaciones', 'ref_operaciones'],
    ['Pais', 'pais'],
  ];

  for (const [target, source] of optionalStringFields) {
    const value = hrFields[source];
    if (value !== null && value !== undefined && String(value).trim()) {
      payload[target] = String(value).trim();
    }
  }

  if (hrFields.empresa_codigo) {
    payload.EmpresaCodigo = Number(hrFields.empresa_codigo);
  }
  if (hrFields.unidad_id && Number(hrFields.unidad_id) > 0) {
    payload.UnidadId = Number(hrFields.unidad_id);
  }

  return payload;
}

function parseRegistroResponse(data: unknown): {
  resultado: boolean;
  mensaje: string;
  mensajeError: string;
  ingresoId?: number;
  ingresoCod?: string;
  fechaRegistro?: string;
} {
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    resultado: Boolean(row.Resultado),
    mensaje: String(row.Mensaje ?? ''),
    mensajeError: String(row.MensajeError ?? ''),
    ingresoId: row.IngresoId !== undefined ? Number(row.IngresoId) : undefined,
    ingresoCod: row.IngresoCod !== undefined ? String(row.IngresoCod) : undefined,
    fechaRegistro: row.FechaRegistro !== undefined ? String(row.FechaRegistro) : undefined,
  };
}

function simulateRegistroResponse(documento: string): Record<string, unknown> {
  const suffix = documento.replace(/\D/g, '').slice(-4) || '0000';
  return {
    Resultado: true,
    Mensaje: 'Se registro ingreso.',
    MensajeError: 'sin errores',
    IngresoId: Math.floor(Math.random() * 900) + 100,
    IngresoCod: `ING-SIM-${suffix}`,
    FechaRegistro: new Date().toISOString(),
  };
}

function defaultTestPayload(): OpalosisRegistroIngresoPayload {
  return {
    TipoDocumentoId: 1,
    Documento: '12345678',
    ApellidoPaterno: 'Perez',
    ApellidoMaterno: 'Gomez',
    Nombres: 'Juan Carlos',
    Sexo: 'M',
    FechaIngreso: new Date().toISOString().slice(0, 10),
  };
}

async function registerWorkerInOpalosis(
  row: Record<string, unknown>,
  mock: boolean,
): Promise<RegistroIngresoResult> {
  const hrFields = (row.hr_fields ?? {}) as Record<string, unknown>;
  const payload = mapHrFieldsToRegistroPayload(hrFields);
  const refOperaciones = String(row.ref_operaciones ?? '');
  const workerName = String(row.worker_name ?? '');

  if (!payload.Documento) {
    return {
      queueItemId: row.id as string | undefined,
      refOperaciones,
      workerName,
      ok: false,
      itemStatus: 'rechazado',
      mensaje: 'Sin documento — no se puede registrar en Opalosis',
      response: { Resultado: false, MensajeError: 'Documento requerido' },
    };
  }

  let responseData: Record<string, unknown>;
  let httpOk = true;

  if (mock) {
    responseData = simulateRegistroResponse(payload.Documento);
  } else {
    const result = await callOpalosis(REGISTRO_INGRESO_PATH, {
      method: 'POST',
      body: payload,
    });
    httpOk = result.ok;
    responseData = (result.data ?? {}) as Record<string, unknown>;
    if (!result.ok) {
      return {
        queueItemId: row.id as string | undefined,
        refOperaciones,
        workerName,
        ok: false,
        itemStatus: 'rechazado',
        mensaje: `HTTP ${result.status}: ${JSON.stringify(responseData)}`,
        response: responseData,
      };
    }
  }

  const parsed = parseRegistroResponse(responseData);
  const ok = httpOk && parsed.resultado;

  return {
    queueItemId: row.id as string | undefined,
    refOperaciones,
    workerName,
    ok,
    itemStatus: ok ? 'procesado' : 'rechazado',
    ingresoId: parsed.ingresoId,
    ingresoCod: parsed.ingresoCod,
    mensaje: ok
      ? `${parsed.ingresoCod ?? parsed.mensaje}`.trim()
      : parsed.mensajeError || parsed.mensaje || 'Error al registrar ingreso',
    response: responseData,
  };
}

function derivePackageStatus(results: RegistroIngresoResult[], mock: boolean): string {
  const successCount = results.filter((r) => r.ok).length;
  if (successCount === 0) return 'error';
  if (successCount < results.length) return 'parcialmente_procesado';
  return mock ? 'simulado' : 'enviado';
}

function simulateUnidades() {
  return [
    { id: 12, nombre: 'Planta Lima Norte (simulado)', activo: true },
    { id: 13, nombre: 'Oficina Central (simulado)', activo: true },
    { id: 14, nombre: 'Almacén Callao (simulado)', activo: false },
  ];
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

    if (body.action === 'test-registro-ingreso') {
      const payload = (body.testPayload ?? defaultTestPayload()) as OpalosisRegistroIngresoPayload;

      if (mock) {
        return jsonResponse({
          simulated: true,
          endpoint: REGISTRO_INGRESO_PATH,
          request: payload,
          response: simulateRegistroResponse(String(payload.Documento ?? '12345678')),
        });
      }

      const result = await callOpalosis(REGISTRO_INGRESO_PATH, {
        method: 'POST',
        body: payload,
      });

      return jsonResponse({
        simulated: false,
        endpoint: REGISTRO_INGRESO_PATH,
        request: payload,
        httpStatus: result.status,
        ok: result.ok,
        response: result.data,
      }, result.ok ? 200 : 502);
    }

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

      const { data: insertedItems, error: itemsError } = await supabaseAdmin
        .from('hr_outbound_ingreso_package_items')
        .insert(packageItems)
        .select('id, queue_item_id, ref_operaciones');

      if (itemsError || !insertedItems) {
        await supabaseAdmin.from('hr_outbound_ingreso_packages').delete().eq('id', insertedPackage.id);
        return jsonResponse({ error: 'Failed to create package items' }, 500);
      }

      const itemIdByQueueId = new Map(
        insertedItems.map((item) => [item.queue_item_id as string, item.id as string]),
      );

      const registrationResults: RegistroIngresoResult[] = [];
      for (const row of queueRows as Array<Record<string, unknown>>) {
        const result = await registerWorkerInOpalosis(row, mock);
        registrationResults.push(result);

        const packageItemId = itemIdByQueueId.get(row.id as string);
        if (packageItemId) {
          await supabaseAdmin
            .from('hr_outbound_ingreso_package_items')
            .update({
              item_status: result.itemStatus,
              mensaje: result.mensaje,
              empleado_id_rrhh: result.ingresoId ?? null,
            })
            .eq('id', packageItemId);
        }
      }

      const packageStatus = derivePackageStatus(registrationResults, mock);
      const sentAt = new Date().toISOString();
      const fechaRecepcion = registrationResults.find((r) => r.ok)?.response.FechaRegistro as
        | string
        | undefined;

      const opalosisResponse = {
        endpoint: REGISTRO_INGRESO_PATH,
        sourcePackageId,
        workerCount: queueRows.length,
        successCount: registrationResults.filter((r) => r.ok).length,
        results: registrationResults.map((r) => ({
          refOperaciones: r.refOperaciones,
          workerName: r.workerName,
          ok: r.ok,
          ingresoId: r.ingresoId,
          ingresoCod: r.ingresoCod,
          mensaje: r.mensaje,
        })),
      };

      await supabaseAdmin
        .from('hr_outbound_ingreso_packages')
        .update({
          status: packageStatus,
          sent_at: sentAt,
          fecha_recepcion: fechaRecepcion ?? sentAt,
          opalosis_response: opalosisResponse,
        })
        .eq('id', insertedPackage.id);

      if (packageStatus === 'error') {
        return jsonResponse({
          error: 'Ningún trabajador pudo registrarse en Opalosis',
          package: insertedPackage,
          details: opalosisResponse,
        }, 502);
      }

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
        partial: packageStatus === 'parcialmente_procesado',
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
          return jsonResponse({
            error: `Opalosis respondió HTTP ${result.status}`,
            details: result.data,
            hint: 'El catálogo de unidades aún no está disponible en el entorno de pruebas.',
          }, 502);
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

      const { data: items } = await supabaseAdmin
        .from('hr_outbound_ingreso_package_items')
        .select('id, worker_name, ref_operaciones, item_status, mensaje, empleado_id_rrhh')
        .eq('package_id', packageId)
        .order('created_at', { ascending: true });

      return jsonResponse({
        packageId,
        status: pkg.status,
        simulated: mock,
        mensaje:
          'El estado por trabajador se registra al enviar. Opalosis aún no expone consulta de paquete en el API de pruebas.',
        opalosisResponse: pkg.opalosis_response,
        items: items ?? [],
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
