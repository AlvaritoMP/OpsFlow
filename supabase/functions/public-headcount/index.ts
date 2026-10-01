import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-api-version, x-region, prefer, accept',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};

const WINDOW_LABEL = '8:00 a.m. – 6:00 p.m.';
const OPEN_MINUTES = 8 * 60;
const CLOSE_MINUTES = 18 * 60;
const SHARE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OPERATIONS', 'OPERATIONS_SUPERVISOR']);
const TOKEN_RE = /^[a-f0-9]{32,128}$/;

type ShiftKey = 'Day' | 'Afternoon' | 'Night';
type JsonRecord = Record<string, unknown>;

interface ShiftCounts {
  Day: number;
  Afternoon: number;
  Night: number;
  unassigned: number;
}

interface PreventivoCounts {
  Day: number;
  Afternoon: number;
  Night: number;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function limaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const hour = Number(pick('hour'));
  const minute = Number(pick('minute'));
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    time: `${pick('hour')}:${pick('minute')}`,
    minutes: hour * 60 + minute,
  };
}

function isOpen(minutes: number) {
  return minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES;
}

function emptyShift(): ShiftCounts {
  return { Day: 0, Afternoon: 0, Night: 0, unassigned: 0 };
}

function emptyPreventivo(): PreventivoCounts {
  return { Day: 0, Afternoon: 0, Night: 0 };
}

function normalizeShift(shift: string): ShiftKey | null {
  const lower = shift.toLowerCase();
  if (lower.includes('day') || lower.includes('mañana') || lower.includes('manana') || lower.includes('diurno') || lower.includes('morning')) {
    return 'Day';
  }
  if (lower.includes('afternoon') || lower.includes('tarde') || lower.includes('vespertino')) {
    return 'Afternoon';
  }
  if (lower.includes('night') || lower.includes('noche') || lower.includes('nocturno')) {
    return 'Night';
  }
  return null;
}

function asArray(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object') as JsonRecord[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
    } catch {
      return [];
    }
  }
  return [];
}

function formatTimeShort(time: unknown): string {
  const text = String(time || '');
  return text ? text.slice(0, 5) : '';
}

function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchAll(
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<JsonRecord[]> {
  const pageSize = 1000;
  const all: JsonRecord[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data || []) as JsonRecord[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
    if (from > 200000) break;
  }
  return all;
}

async function requireShareUser(req: Request, admin: SupabaseClient, anonKey: string, url: string) {
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt || jwt === anonKey) {
    return jsonResponse({ message: 'Debes iniciar sesión en OpsFlow para compartir el headcount.' }, 401);
  }
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(jwt);
  if (authError || !authData.user) {
    return jsonResponse({ message: 'Sesión no válida.' }, 401);
  }
  const { data: row, error } = await admin
    .from('users')
    .select('id, role')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const role = String(row?.role || '');
  if (!SHARE_ROLES.has(role)) {
    return jsonResponse({ message: 'Tu usuario no puede compartir el cuadro de headcount.' }, 403);
  }
  return authData.user.id;
}

async function activeToken(admin: SupabaseClient): Promise<string | null> {
  const { data, error } = await admin
    .from('public_headcount_links')
    .select('token')
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.token ? String(data.token) : null;
}

async function issueToken(admin: SupabaseClient, userId: string, rotate: boolean): Promise<string> {
  if (!rotate) {
    const current = await activeToken(admin);
    if (current) return current;
  } else {
    const { error } = await admin
      .from('public_headcount_links')
      .update({ revoked_at: new Date().toISOString() })
      .is('revoked_at', null);
    if (error) throw new Error(error.message);
  }
  const token = newToken();
  const { error } = await admin.from('public_headcount_links').insert({
    token,
    created_by: userId,
  });
  if (error) {
    const current = await activeToken(admin);
    if (current) return current;
    throw new Error(error.message);
  }
  return token;
}

async function tokenIsActive(admin: SupabaseClient, token: string): Promise<boolean> {
  const { data, error } = await admin
    .from('public_headcount_links')
    .select('id')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data?.id);
}

async function buildBoard(admin: SupabaseClient, limaDate: string) {
  const [units, resources, positions, shifts, assignments] = await Promise.all([
    fetchAll((from, to) =>
      admin
        .from('units')
        .select('id, name, client_name, status, required_positions, headcount_meta')
        .order('name', { ascending: true })
        .range(from, to)
    ),
    fetchAll((from, to) =>
      admin
        .from('resources')
        .select('id, unit_id, type, puesto, assigned_shift, personnel_status, archived, monthly_salary, work_condition_amount')
        .eq('type', 'Personal')
        .range(from, to)
    ),
    fetchAll((from, to) =>
      admin.from('positions').select('id, name').range(from, to)
    ),
    fetchAll((from, to) =>
      admin
        .from('daily_shifts')
        .select('resource_id, date, type')
        .eq('date', limaDate)
        .range(from, to)
    ),
    fetchAll((from, to) =>
      admin
        .from('reten_assignments')
        .select('unit_id, unit_name, assignment_date, start_time, end_time, assignment_type, status, retenes(name)')
        .eq('assignment_date', limaDate)
        .range(from, to)
    ),
  ]);

  const positionNames = new Map<string, string>();
  positions.forEach((position) => {
    if (position.id) positionNames.set(String(position.id), String(position.name || ''));
  });

  const operational = units.filter((unit) => String(unit.status || '') !== 'Desactivado');
  const unitIds = new Set(operational.map((unit) => String(unit.id)));
  const unitsByName = new Map<string, string>();
  operational.forEach((unit) => {
    unitsByName.set(String(unit.name || '').trim().toLowerCase(), String(unit.id));
  });

  const shiftByResource = new Map<string, string>();
  shifts.forEach((shift) => {
    const resourceId = String(shift.resource_id || '');
    const type = String(shift.type || '');
    if (resourceId && type && !shiftByResource.has(resourceId)) {
      shiftByResource.set(resourceId, type);
    }
  });

  const personnel = resources.filter((resource) => {
    if (!unitIds.has(String(resource.unit_id || ''))) return false;
    if (resource.archived === true) return false;
    const status = String(resource.personnel_status || '').toLowerCase();
    return status !== 'cesado';
  });

  const personnelByUnit = new Map<string, JsonRecord[]>();
  personnel.forEach((resource) => {
    const unitId = String(resource.unit_id);
    const list = personnelByUnit.get(unitId) || [];
    list.push(resource);
    personnelByUnit.set(unitId, list);
  });

  const retenByUnit = new Map<string, { details: string[]; names: string[]; count: number }>();
  let retenesHoy = 0;
  assignments.forEach((assignment) => {
    if (String(assignment.status || '') === 'cancelada') return;
    if (String(assignment.assignment_date || '').slice(0, 10) !== limaDate) return;
    let unitId = String(assignment.unit_id || '');
    if (!unitIds.has(unitId)) {
      unitId = unitsByName.get(String(assignment.unit_name || '').trim().toLowerCase()) || '';
    }
    if (!unitId) return;
    retenesHoy += 1;
    const nested = assignment.retenes as { name?: string } | { name?: string }[] | null;
    const nestedName = Array.isArray(nested) ? nested[0]?.name : nested?.name;
    const name = String(nestedName || '').trim() || 'Retén';
    const schedule = [formatTimeShort(assignment.start_time), formatTimeShort(assignment.end_time)]
      .filter(Boolean)
      .join('-');
    const detail = schedule ? `${name} ${schedule}` : name;
    const existing = retenByUnit.get(unitId) || { details: [], names: [], count: 0 };
    if (!existing.names.includes(name)) existing.names.push(name);
    existing.details.push(detail);
    existing.count += 1;
    retenByUnit.set(unitId, existing);
  });

  let descanso = 0;
  let falta = 0;
  let vacaciones = 0;
  personnel.forEach((resource) => {
    const todayType = shiftByResource.get(String(resource.id || ''));
    if (todayType === 'OFF') descanso += 1;
    else if (todayType === 'Sick') falta += 1;
    else if (todayType === 'Vacation') vacaciones += 1;
  });

  const rows: JsonRecord[] = [];
  const sortedUnits = [...operational].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'es')
  );

  sortedUnits.forEach((unit) => {
    const unitId = String(unit.id);
    const unitName = String(unit.name || '');
    const clientName = String(unit.client_name || '');
    const required = asArray(unit.required_positions);
    const meta = asArray(unit.headcount_meta);
    const staff = personnelByUnit.get(unitId) || [];
    const reten = retenByUnit.get(unitId) || null;

    const byPosition = new Map<string, {
      positionId: string;
      positionName: string;
      requiredByShift: ShiftCounts;
      rq: number;
    }>();

    required.forEach((reqPos) => {
      const positionId = String(reqPos.positionId || '');
      if (!positionId) return;
      const positionName = String(reqPos.positionName || positionNames.get(positionId) || 'Desconocido');
      if (!byPosition.has(positionId)) {
        byPosition.set(positionId, {
          positionId,
          positionName,
          requiredByShift: emptyShift(),
          rq: 0,
        });
      }
      const entry = byPosition.get(positionId)!;
      const quantity = Number(reqPos.quantity) || 0;
      entry.rq += quantity;
      const shift = reqPos.shift ? normalizeShift(String(reqPos.shift)) : null;
      if (shift) entry.requiredByShift[shift] += quantity;
      else entry.requiredByShift.unassigned += quantity;
    });

    const readPreventivo = (positionId: string): PreventivoCounts => {
      const found = meta.find((item) => String(item.positionId || '') === positionId);
      const preventivo = (found?.preventivo && typeof found.preventivo === 'object'
        ? found.preventivo
        : {}) as JsonRecord;
      return {
        Day: Number(preventivo.Day) || 0,
        Afternoon: Number(preventivo.Afternoon) || 0,
        Night: Number(preventivo.Night) || 0,
      };
    };

    const positionEntries = Array.from(byPosition.values()).sort((a, b) =>
      a.positionName.localeCompare(b.positionName, 'es')
    );

    if (positionEntries.length === 0) {
      rows.push({
        unitId,
        unitName,
        clientName,
        positionId: '__sin_rq__',
        positionName: staff.length === 0 ? 'Sin personal / Sin RQ' : 'Sin puestos requeridos',
        rq: 0,
        requiredByShift: emptyShift(),
        activos: 0,
        porCubrir: 0,
        vacantByShift: emptyShift(),
        turnover: 0,
        preventivo: readPreventivo('__sin_rq__'),
        isFirstInUnit: true,
        unitRowSpan: 1,
        reten,
      });
      return;
    }

    positionEntries.forEach((entry, index) => {
      const matching = staff.filter((worker) => {
        const puesto = String(worker.puesto || '');
        return puesto === entry.positionName || puesto === entry.positionId;
      });
      const activosByShift = emptyShift();
      let turnover = 0;
      matching.forEach((worker) => {
        turnover += (Number(worker.monthly_salary) || 0) + (Number(worker.work_condition_amount) || 0);
        const assigned = String(worker.assigned_shift || '');
        let workerShift = assigned;
        if (!workerShift) {
          const todayType = shiftByResource.get(String(worker.id || ''));
          if (todayType && todayType !== 'OFF' && todayType !== 'Vacation' && todayType !== 'Sick') {
            workerShift = todayType;
          }
        }
        const normalized = workerShift ? normalizeShift(workerShift) : null;
        if (normalized) activosByShift[normalized] += 1;
        else activosByShift.unassigned += 1;
      });
      const activos = matching.length;
      const porCubrir = Math.max(0, entry.rq - activos);
      const vacantByShift = emptyShift();
      (['Day', 'Afternoon', 'Night'] as ShiftKey[]).forEach((shift) => {
        vacantByShift[shift] = Math.max(0, entry.requiredByShift[shift] - activosByShift[shift]);
      });
      vacantByShift.unassigned = Math.max(0, entry.requiredByShift.unassigned - activosByShift.unassigned);
      rows.push({
        unitId,
        unitName,
        clientName,
        positionId: entry.positionId,
        positionName: entry.positionName,
        rq: entry.rq,
        requiredByShift: entry.requiredByShift,
        activos,
        porCubrir,
        vacantByShift,
        turnover,
        preventivo: readPreventivo(entry.positionId),
        isFirstInUnit: index === 0,
        unitRowSpan: positionEntries.length,
        reten: index === 0 ? reten : null,
      });
    });
  });

  const totals = {
    rq: 0,
    activos: 0,
    porCubrir: 0,
    turnover: 0,
    shiftReq: emptyShift(),
    shiftVacant: emptyShift(),
    preventivo: emptyPreventivo(),
    coverage: 0,
  };
  const positionMap = new Map<string, JsonRecord>();
  const unitMap = new Map<string, JsonRecord>();

  rows.forEach((row) => {
    const rq = Number(row.rq) || 0;
    const activos = Number(row.activos) || 0;
    const porCubrir = Number(row.porCubrir) || 0;
    const turnover = Number(row.turnover) || 0;
    const required = row.requiredByShift as ShiftCounts;
    const vacant = row.vacantByShift as ShiftCounts;
    const preventivo = row.preventivo as PreventivoCounts;
    totals.rq += rq;
    totals.activos += activos;
    totals.porCubrir += porCubrir;
    totals.turnover += turnover;
    (['Day', 'Afternoon', 'Night'] as ShiftKey[]).forEach((shift) => {
      totals.shiftReq[shift] += required[shift] || 0;
      totals.shiftVacant[shift] += vacant[shift] || 0;
      totals.preventivo[shift] += preventivo[shift] || 0;
    });
    totals.shiftReq.unassigned += required.unassigned || 0;
    totals.shiftVacant.unassigned += vacant.unassigned || 0;

    if (row.positionId !== '__sin_rq__') {
      const key = String(row.positionId);
      if (!positionMap.has(key)) {
        positionMap.set(key, {
          positionName: row.positionName,
          rq: 0,
          activos: 0,
          porCubrir: 0,
          requiredByShift: emptyShift(),
          vacantByShift: emptyShift(),
        });
      }
      const item = positionMap.get(key)!;
      item.rq = Number(item.rq) + rq;
      item.activos = Number(item.activos) + activos;
      item.porCubrir = Number(item.porCubrir) + porCubrir;
      const itemReq = item.requiredByShift as ShiftCounts;
      const itemVac = item.vacantByShift as ShiftCounts;
      (['Day', 'Afternoon', 'Night'] as ShiftKey[]).forEach((shift) => {
        itemReq[shift] += required[shift] || 0;
        itemVac[shift] += vacant[shift] || 0;
      });
    }

    const unitId = String(row.unitId);
    if (!unitMap.has(unitId)) {
      unitMap.set(unitId, {
        unitId,
        unitName: row.unitName,
        clientName: row.clientName,
        rq: 0,
        activos: 0,
        porCubrir: 0,
        turnover: 0,
        requiredByShift: emptyShift(),
        vacantByShift: emptyShift(),
        reten: retenByUnit.get(unitId) || null,
      });
    }
    const unitItem = unitMap.get(unitId)!;
    unitItem.rq = Number(unitItem.rq) + rq;
    unitItem.activos = Number(unitItem.activos) + activos;
    unitItem.porCubrir = Number(unitItem.porCubrir) + porCubrir;
    unitItem.turnover = Number(unitItem.turnover) + turnover;
    const unitReq = unitItem.requiredByShift as ShiftCounts;
    const unitVac = unitItem.vacantByShift as ShiftCounts;
    (['Day', 'Afternoon', 'Night'] as ShiftKey[]).forEach((shift) => {
      unitReq[shift] += required[shift] || 0;
      unitVac[shift] += vacant[shift] || 0;
    });
  });

  totals.coverage = totals.rq > 0 ? (totals.activos / totals.rq) * 100 : 0;

  const positionSummary = Array.from(positionMap.values()).sort((a, b) =>
    String(a.positionName).localeCompare(String(b.positionName), 'es')
  );
  const unitSummary = Array.from(unitMap.values()).sort((a, b) =>
    String(a.unitName).localeCompare(String(b.unitName), 'es')
  );

  return {
    available: true,
    readOnly: true,
    windowLabel: WINDOW_LABEL,
    rows,
    positionSummary,
    unitSummary,
    totals,
    dayStatus: { descanso, falta, vacaciones, retenesHoy },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ message: 'Método no permitido' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !anonKey || !serviceKey) {
    return jsonResponse({ message: 'Servicio de headcount no configurado.' }, 500);
  }
  const admin = createClient(url, serviceKey);

  try {
    const body = await req.json().catch(() => ({})) as JsonRecord;
    const action = String(body.action || '');
    const clock = limaParts();

    if (action === 'link' || action === 'rotate') {
      const userIdOrResponse = await requireShareUser(req, admin, anonKey, url);
      if (userIdOrResponse instanceof Response) return userIdOrResponse;
      const token = await issueToken(admin, userIdOrResponse, action === 'rotate');
      return jsonResponse({ token, windowLabel: WINDOW_LABEL }, 200);
    }

    if (action !== 'view') {
      return jsonResponse({ message: 'Acción no válida' }, 400);
    }

    const token = String(body.token || '').trim().toLowerCase();
    if (!TOKEN_RE.test(token) || !(await tokenIsActive(admin, token))) {
      return jsonResponse({
        available: false,
        code: 'invalid_token',
        message: 'Este enlace no es válido o ya fue renovado.',
        windowLabel: WINDOW_LABEL,
      }, 404);
    }

    if (!isOpen(clock.minutes)) {
      return jsonResponse({
        available: false,
        code: 'outside_window',
        message: 'El cuadro de headcount solo se puede ver de 8:00 a.m. a 6:00 p.m. (hora de Perú).',
        windowLabel: WINDOW_LABEL,
        limaDate: clock.date,
        limaTime: clock.time,
      }, 200);
    }

    const board = await buildBoard(admin, clock.date);
    return jsonResponse({ ...board, limaDate: clock.date, limaTime: clock.time }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el headcount';
    console.error('public-headcount', error);
    const missingTable = /public_headcount_links|schema cache|42P01/i.test(message);
    return jsonResponse({
      available: false,
      code: 'unavailable',
      message: missingTable
        ? 'Falta aplicar la migración del enlace público de headcount.'
        : 'No se pudo cargar el cuadro. Intenta de nuevo en unos minutos.',
      windowLabel: WINDOW_LABEL,
    }, missingTable ? 503 : 500);
  }
});
