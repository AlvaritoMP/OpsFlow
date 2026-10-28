import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_BASE = 'https://apiopalosis.opaloperu.com';

interface RegisterBody {
  action?: string;
  billingId?: string;
  pesCode?: string;
  osStartDate?: string;
  osEndDate?: string;
  serviceMonth?: string;
  documentoMaker?: string;
  documentKind?: string;
  workGroup?: string;
  businessLine?: string;
  opaloCompany?: string;
  positionLabel?: string;
  signedTotal?: number;
  unitName?: string;
  periodMonth?: string;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(asRecord).filter((item): item is Record<string, unknown> => !!item);
  const one = asRecord(value);
  return one ? [one] : [];
}

function readField(record: Record<string, unknown> | null, key: string): unknown {
  if (!record) return undefined;
  if (key in record) return record[key];
  const found = Object.keys(record).find((item) => item.toLowerCase() === key.toLowerCase());
  return found ? record[found] : undefined;
}

function pickNumber(record: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = Number(readField(record, key));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function pickText(record: Record<string, unknown> | null, ...keys: string[]): string {
  if (!record) return '';
  for (const key of keys) {
    const value = readField(record, key);
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return '';
}

function newCalculoId(): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return (bytes[0] % 2147483646) + 1;
}

function osInstant(date: string): string {
  return `${date.slice(0, 10)}T00:00:00-05:00`;
}

function getOsConfig(): { baseUrl: string; apiKey: string; proxyUrl: string; proxySecret: string } | { error: string } {
  const apiKey = (Deno.env.get('OPALOSIS_OS_API_KEY') || Deno.env.get('OPALOSIS_API_KEY') || '').trim();
  const baseUrl = (Deno.env.get('OPALOSIS_OS_API_BASE_URL') || DEFAULT_BASE).replace(/\/$/, '');
  const proxyUrl = (Deno.env.get('OPALOSIS_OS_PROXY_URL') || '').replace(/\/$/, '');
  const proxySecret = (Deno.env.get('OPALOSIS_PROXY_SECRET') || '').trim();
  if (!apiKey && !proxyUrl) {
    return {
      error:
        'Falta la clave de la API de órdenes. En Supabase defina OPALOSIS_OS_API_KEY (o reutilice OPALOSIS_API_KEY) para https://apiopalosis.opaloperu.com.',
    };
  }
  if (proxyUrl && !proxySecret) {
    return { error: 'El proxy de órdenes está configurado sin OPALOSIS_PROXY_SECRET.' };
  }
  return { baseUrl, apiKey, proxyUrl, proxySecret };
}

async function osFetch(
  config: { baseUrl: string; apiKey: string; proxyUrl: string; proxySecret: string },
  path: string,
  options: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; data: unknown; raw: string }> {
  const method = options.method || 'GET';
  const relative = path.replace(/^\/api\/ordenes-servicio\/?/, '');
  const url = config.proxyUrl
    ? new URL(`${config.proxyUrl}/${relative}`)
    : new URL(`${config.baseUrl}/api/ordenes-servicio/${relative}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value) url.searchParams.set(key, value);
    }
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (config.proxyUrl) headers['X-OpsFlow-Proxy-Secret'] = config.proxySecret;
  else headers['X-API-Key'] = config.apiKey;

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const raw = await response.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = { raw };
  }
  return { ok: response.ok, status: response.status, data, raw };
}

function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return jsonResponse({ ok: false, error: message, ...extra }, status);
}

/** Nombres de OpsFlow que en el catálogo de OpaloSis se escriben distinto. */
const CATALOG_ALIASES: Record<string, string[]> = {
  'opalo intermediacion': ['opinter'],
  'opalo peru': ['opalo peru sac'],
  'opalo tercerizacion': ['opalo tercerizacion'],
};

function matchCatalog(rows: Record<string, unknown>[], wanted: string, label: string): number {
  const target = normalize(wanted);
  const aliases = [target, ...(CATALOG_ALIASES[target] || [])];
  const items = rows.filter((row) => pickNumber(row, 'id'));
  const exact = items.find((row) => aliases.includes(normalize(pickText(row, 'value'))));
  const partial = items.find((row) => {
    const value = normalize(pickText(row, 'value'));
    return value && aliases.some((alias) => value.includes(alias) || alias.includes(value));
  });
  const found = exact || partial;
  const id = pickNumber(found || null, 'id');
  if (!id) {
    const sample = items.map((row) => pickText(row, 'value')).filter(Boolean).slice(0, 12).join(', ');
    throw new Error(`OpaloSis no tiene ${label} «${wanted}». Devolvió: ${sample || 'una lista vacía'}.`);
  }
  return id;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Use POST.', 405);

  let body: RegisterBody;
  try {
    body = await req.json();
  } catch {
    return fail('El cuerpo no es JSON.');
  }
  if (body.action !== 'register-os') return fail('Acción no reconocida.');

  const config = getOsConfig();
  if ('error' in config) return fail(config.error, 503);

  const pesCode = String(body.pesCode || '').trim();
  const documento = String(body.documentoMaker || '').trim();
  const start = String(body.osStartDate || '').slice(0, 10);
  const end = String(body.osEndDate || '').slice(0, 10);
  const serviceMonth = String(body.serviceMonth || '').slice(0, 7);
  const signed = Number(body.signedTotal);
  if (!pesCode || !documento || !start || !end || !/^\d{4}-\d{2}$/.test(serviceMonth) || !Number.isFinite(signed)) {
    return fail('Faltan el PES, el DNI, las fechas, el mes de servicio o el total de la orden.');
  }

  try {
    const proposals = await osFetch(config, '/api/ordenes-servicio/propuestas-economicas', {
      query: { Buscar: pesCode },
    });
    if (!proposals.ok) {
      return fail(`No se pudo buscar el PES. OpaloSis respondió HTTP ${proposals.status}.`, 502, { detail: proposals.raw.slice(0, 500) });
    }
    const proposalRows = asList(proposals.data);
    const wantedPes = normalize(pesCode);
    const proposal =
      proposalRows.find((row) => normalize(pickText(row, 'propuestaEconomicaCod')) === wantedPes) ||
      proposalRows.find((row) => normalize(pickText(row, 'propuestaEconomicaCod')).includes(wantedPes));
    const propuestaEconomicaId = pickNumber(proposal || null, 'propuestaEconomicaId');
    const requerimientoId = pickNumber(proposal || null, 'requerimientoId');
    if (!proposal || !propuestaEconomicaId || !requerimientoId) {
      const sample = proposalRows.map((row) => pickText(row, 'propuestaEconomicaCod')).filter(Boolean).slice(0, 8).join(', ');
      return fail(`No encontré el PES «${pesCode}». OpaloSis devolvió: ${sample || 'ninguna propuesta'}.`);
    }

    const packages = await osFetch(config, `/api/ordenes-servicio/propuestas-economicas/${requerimientoId}/servicios-paquetes`);
    if (!packages.ok) return fail(`No se pudieron leer los paquetes del PES. HTTP ${packages.status}.`, 502);
    const packageRow = asList(packages.data).find((row) => pickNumber(row, 'requerimientoDetalleId'));
    const requerimientoDetalleId = pickNumber(packageRow || null, 'requerimientoDetalleId');
    if (!packageRow || !requerimientoDetalleId) {
      return fail('El PES no tiene un detalle de paquete. OpaloSis exige al menos una línea para recibir el total.');
    }

    const applicants = await osFetch(config, `/api/ordenes-servicio/propuestas-economicas/${requerimientoId}/cliente-solicitante`);
    if (!applicants.ok) return fail(`No se pudo leer el cliente solicitante. HTTP ${applicants.status}.`, 502);
    const clienteSolicitanteId = pickNumber(asList(applicants.data)[0] || null, 'clienteSolicitanteId');
    if (!clienteSolicitanteId) return fail('El PES no devolvió un cliente solicitante.');

    const [groups, lines, companies, positions] = await Promise.all([
      osFetch(config, '/api/ordenes-servicio/propuestas-economicas/catalogo-grupotrabajo'),
      osFetch(config, '/api/ordenes-servicio/propuestas-economicas/catalogo-lineanegocio'),
      osFetch(config, '/api/ordenes-servicio/propuestas-economicas/empresa-factura'),
      osFetch(config, `/api/ordenes-servicio/propuestas-economicas/${encodeURIComponent(body.positionLabel || 'Diversos')}/catalogo-puesto`),
    ]);
    for (const catalog of [groups, lines, companies, positions]) {
      if (!catalog.ok) return fail(`Un catálogo de OpaloSis respondió HTTP ${catalog.status}.`, 502, { detail: catalog.raw.slice(0, 400) });
    }

    const grupoTrabajoId = matchCatalog(asList(groups.data), String(body.workGroup || ''), 'el grupo de trabajo');
    const lineaNegocioId = matchCatalog(asList(lines.data), String(body.businessLine || ''), 'la línea de negocio');
    const empresaOpaloId = matchCatalog(asList(companies.data), String(body.opaloCompany || ''), 'la empresa que factura');
    const puestoId = matchCatalog(asList(positions.data), String(body.positionLabel || 'Diversos'), 'el puesto');

    const opsflowCalculoId = newCalculoId();

    const kindLabel = body.documentKind === 'credit' ? 'Nota de crédito' : body.documentKind === 'debit' ? 'Nota de débito' : 'Liquidación';
    const payload = {
      propuestaEconomicaId,
      fechaInicio: osInstant(start),
      fechaEntrega: osInstant(end),
      documentoMaker: documento,
      clienteSolicitanteId,
      observacion: `${kindLabel} ${body.unitName || ''} ${body.periodMonth || ''}`.trim(),
      direccionIpMac: '',
      lineaNegocioId,
      grupoTrabajoId,
      puestoId,
      isoMoneda: 'PEN',
      tipoCambio: 1,
      empresaOpaloId,
      opsflowCalculoId,
      // DateOnly: OpaloSis rechaza un instante con hora (2026-10-01T00:00:00-05:00).
      fechaMesServicio: `${serviceMonth}-01`,
      listaOrdenServicioDetalle: [
        {
          requerimientoId,
          requerimientoDetalleId,
          nombreServicio: pickText(packageRow, 'nombreServicio'),
          nombrePaquete: pickText(packageRow, 'nombrePaquete'),
          puestoEnServicio: pickText(packageRow, 'puestoEnServicio'),
          puestoEnPaquete: pickText(packageRow, 'puestoEnPaquete'),
          cantidad: 1,
          tarifaPaquete: 0,
          sueldo: 0,
          precioUnitario: Math.round(signed * 100) / 100,
        },
      ],
    };

    const created = await osFetch(config, '/api/ordenes-servicio/orden-servicio/registro-os', {
      method: 'POST',
      body: payload,
    });
    const createdRecord = asRecord(created.data);
    const resultado = readField(createdRecord, 'resultado') === true;
    const mensaje = pickText(createdRecord, 'mensaje', 'Mensaje');
    const mensajeError = pickText(createdRecord, 'mensajeError', 'MensajeError');
    if (!created.ok || !resultado) {
      return fail(mensaje || mensajeError || `OpaloSis no registró la orden (HTTP ${created.status}).`, 502, {
        detail: created.raw.slice(0, 800),
        sent: payload,
      });
    }

    const ordenServicioId = pickNumber(createdRecord, 'ordenServicioId', 'ordenServicioID', 'OrdenServicioID');
    const numeroOrdenServicio = pickText(createdRecord, 'numeroOrdenServicio', 'NumeroOrdenServicio');
    if (!ordenServicioId || !numeroOrdenServicio) {
      return fail('OpaloSis respondió sin número de orden.', 502, { detail: created.raw.slice(0, 800) });
    }

    return jsonResponse({
      ok: true,
      registration: {
        opsflowCalculoId,
        ordenServicioId,
        numeroOrdenServicio,
        mensaje: mensaje || 'Se registró correctamente',
        signedAmount: payload.listaOrdenServicioDetalle[0].precioUnitario,
        sentAt: new Date().toISOString(),
        alreadyExisted: /ya existe/i.test(`${mensaje} ${mensajeError}`),
      },
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo registrar la orden en OpaloSis.';
    const status = /no tiene|no encontr|devolvió/i.test(message) ? 400 : 502;
    return fail(message, status);
  }
});
