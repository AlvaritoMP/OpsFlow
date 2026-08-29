import { supabase, handleSupabaseError } from './supabase';
import {
  ManagementStaff,
  SupervisionAssignment,
  SupervisionCategory,
  SupervisionFrequency,
  SupervisionRoute,
  SupervisionRouteStop,
  SupervisionVisit,
  SupervisionVisitStatus,
  Unit,
} from '../types';
import {
  EMPTY_VISIT_DAYS,
  frequencyAppliesToDate,
  isoWeekdayFromDate,
  mondayOf,
  normalizeVisitDays,
  parseYmd,
  visitDaysForIso,
  weekDates,
} from '../utils/supervisionPlanning';
import { optimizeRouteOrder } from '../utils/routeOptimization';

const ASSIGNMENTS = 'supervision_assignments';
const ROUTES = 'supervision_routes';
const STOPS = 'supervision_route_stops';
const VISITS = 'supervision_visits';

const db = () => supabase as any;

function staffById(staff: ManagementStaff[]) {
  return new Map(staff.map((s) => [s.id, s]));
}

function unitById(units: Unit[]) {
  return new Map(units.map((u) => [u.id, u]));
}

export function hydrateAssignment(
  row: SupervisionAssignment,
  units: Unit[],
  staff: ManagementStaff[]
): SupervisionAssignment {
  const unit = unitById(units).get(row.unitId);
  const supervisors = staffById(staff);
  return {
    ...row,
    unitName: unit?.name || row.unitName,
    unitAddress: unit?.address || row.unitAddress,
    unitClientName: unit?.clientName || row.unitClientName,
    supervisorName: row.supervisorStaffId ? supervisors.get(row.supervisorStaffId)?.name : row.supervisorName,
    coordinatorName: row.coordinatorStaffId ? supervisors.get(row.coordinatorStaffId)?.name : row.coordinatorName,
  };
}

export function hydrateVisit(
  row: SupervisionVisit,
  units: Unit[],
  staff: ManagementStaff[],
  assignments: SupervisionAssignment[]
): SupervisionVisit {
  const unit = unitById(units).get(row.unitId);
  const supervisors = staffById(staff);
  const assignment = assignments.find((a) => a.id === row.assignmentId || a.unitId === row.unitId);
  return {
    ...row,
    unitName: unit?.name || row.unitName,
    unitAddress: unit?.address || row.unitAddress,
    unitClientName: unit?.clientName || row.unitClientName,
    latitude: unit?.latitude ?? row.latitude,
    longitude: unit?.longitude ?? row.longitude,
    supervisorName: supervisors.get(row.supervisorStaffId)?.name || row.supervisorName,
    coordinatorName: row.coordinatorStaffId
      ? supervisors.get(row.coordinatorStaffId)?.name
      : row.coordinatorName,
    category: assignment?.category || row.category,
  };
}

function mapAssignment(row: any): SupervisionAssignment {
  return {
    id: row.id,
    unitId: row.unit_id,
    supervisorStaffId: row.supervisor_staff_id || undefined,
    coordinatorStaffId: row.coordinator_staff_id || undefined,
    category: (row.category || 'MEDIA') as SupervisionCategory,
    frequency: (row.frequency || 'SEMANAL') as SupervisionFrequency,
    visitDays: normalizeVisitDays(row.visit_days),
    restWeekday: row.rest_weekday ?? 7,
    notes: row.notes || undefined,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStop(row: any): SupervisionRouteStop {
  return {
    id: row.id,
    routeId: row.route_id,
    unitId: row.unit_id,
    stopOrder: row.stop_order,
  };
}

function mapRoute(row: any, stops: SupervisionRouteStop[] = []): SupervisionRoute {
  return {
    id: row.id,
    supervisorStaffId: row.supervisor_staff_id,
    weekday: row.weekday,
    name: row.name,
    isOptimized: Boolean(row.is_optimized),
    estimatedDistanceKm: row.estimated_distance_km != null ? Number(row.estimated_distance_km) : undefined,
    stops: stops.sort((a, b) => a.stopOrder - b.stopOrder),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVisit(row: any): SupervisionVisit {
  return {
    id: row.id,
    assignmentId: row.assignment_id || undefined,
    routeId: row.route_id || undefined,
    unitId: row.unit_id,
    supervisorStaffId: row.supervisor_staff_id,
    coordinatorStaffId: row.coordinator_staff_id || undefined,
    visitDate: row.visit_date,
    weekday: row.weekday,
    stopOrder: row.stop_order ?? undefined,
    plannedStart: row.planned_start || undefined,
    status: (row.status || 'pending') as SupervisionVisitStatus,
    checkInAt: row.check_in_at || undefined,
    checkOutAt: row.check_out_at || undefined,
    checkInLat: row.check_in_lat != null ? Number(row.check_in_lat) : undefined,
    checkInLng: row.check_in_lng != null ? Number(row.check_in_lng) : undefined,
    checkOutLat: row.check_out_lat != null ? Number(row.check_out_lat) : undefined,
    checkOutLng: row.check_out_lng != null ? Number(row.check_out_lng) : undefined,
    notes: row.notes || undefined,
    skipReason: row.skip_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface UpsertAssignmentInput {
  id?: string;
  unitId: string;
  supervisorStaffId?: string | null;
  coordinatorStaffId?: string | null;
  category: SupervisionCategory;
  frequency: SupervisionFrequency;
  visitDays?: Partial<SupervisionAssignment['visitDays']>;
  restWeekday?: number;
  notes?: string;
  isActive?: boolean;
  userId?: string;
}

export const supervisionPlanningService = {
  async getAssignments(): Promise<SupervisionAssignment[]> {
    try {
      const { data, error } = await db().from(ASSIGNMENTS).select('*').order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []).map(mapAssignment);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async upsertAssignment(input: UpsertAssignmentInput): Promise<SupervisionAssignment> {
    const payload: Record<string, unknown> = {
      unit_id: input.unitId,
      supervisor_staff_id: input.supervisorStaffId || null,
      coordinator_staff_id: input.coordinatorStaffId || null,
      category: input.category,
      frequency: input.frequency,
      visit_days: { ...EMPTY_VISIT_DAYS, ...(input.visitDays || {}) },
      rest_weekday: input.restWeekday ?? 7,
      notes: input.notes || null,
      is_active: input.isActive !== false,
      updated_by: input.userId || null,
    };
    if (input.id) payload.id = input.id;
    else payload.created_by = input.userId || null;

    const { data, error } = await db()
      .from(ASSIGNMENTS)
      .upsert(payload, { onConflict: 'unit_id' })
      .select('*')
      .single();
    if (error) handleSupabaseError(error);
    return mapAssignment(data);
  },

  async deleteAssignment(id: string): Promise<void> {
    const { error } = await db().from(ASSIGNMENTS).delete().eq('id', id);
    if (error) handleSupabaseError(error);
  },

  async getRoutes(supervisorStaffId?: string): Promise<SupervisionRoute[]> {
    try {
      let query = db().from(ROUTES).select('*').order('weekday');
      if (supervisorStaffId) query = query.eq('supervisor_staff_id', supervisorStaffId);
      const { data, error } = await query;
      if (error) throw error;
      const routes = data || [];
      if (!routes.length) return [];
      const ids = routes.map((r: any) => r.id);
      const { data: stopRows, error: stopError } = await db()
        .from(STOPS)
        .select('*')
        .in('route_id', ids)
        .order('stop_order');
      if (stopError) throw stopError;
      const byRoute = new Map<string, SupervisionRouteStop[]>();
      (stopRows || []).forEach((row: any) => {
        const mapped = mapStop(row);
        const list = byRoute.get(mapped.routeId) || [];
        list.push(mapped);
        byRoute.set(mapped.routeId, list);
      });
      return routes.map((row: any) => mapRoute(row, byRoute.get(row.id) || []));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async saveRoute(input: {
    id?: string;
    supervisorStaffId: string;
    weekday: number;
    name: string;
    unitIds: string[];
    isOptimized?: boolean;
    estimatedDistanceKm?: number;
    userId?: string;
  }): Promise<SupervisionRoute> {
    const routePayload: Record<string, unknown> = {
      supervisor_staff_id: input.supervisorStaffId,
      weekday: input.weekday,
      name: input.name,
      is_optimized: Boolean(input.isOptimized),
      estimated_distance_km: input.estimatedDistanceKm ?? null,
      updated_by: input.userId || null,
    };
    if (input.id) routePayload.id = input.id;
    else routePayload.created_by = input.userId || null;

    const { data, error } = await db()
      .from(ROUTES)
      .upsert(routePayload, { onConflict: 'supervisor_staff_id,weekday' })
      .select('*')
      .single();
    if (error) handleSupabaseError(error);

    const routeId = data.id as string;
    const { error: delError } = await db().from(STOPS).delete().eq('route_id', routeId);
    if (delError) handleSupabaseError(delError);

    if (input.unitIds.length) {
      const stopRows = input.unitIds.map((unitId, index) => ({
        route_id: routeId,
        unit_id: unitId,
        stop_order: index + 1,
      }));
      const { error: insError } = await db().from(STOPS).insert(stopRows);
      if (insError) handleSupabaseError(insError);
    }

    const routes = await this.getRoutes(input.supervisorStaffId);
    const saved = routes.find((r) => r.id === routeId);
    if (!saved) throw new Error('No se pudo recargar la ruta guardada');
    return saved;
  },

  async getVisits(from: string, to: string, supervisorStaffId?: string): Promise<SupervisionVisit[]> {
    try {
      let query = db()
        .from(VISITS)
        .select('*')
        .gte('visit_date', from)
        .lte('visit_date', to)
        .order('visit_date')
        .order('stop_order');
      if (supervisorStaffId) query = query.eq('supervisor_staff_id', supervisorStaffId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(mapVisit);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async generateWeek(weekStartYmd: string, userId?: string): Promise<number> {
    const weekStart = mondayOf(parseYmd(weekStartYmd));
    const dates = weekDates(weekStart);
    const assignments = (await this.getAssignments()).filter((a) => a.isActive && a.supervisorStaffId);
    const routes = await this.getRoutes();
    const routeByKey = new Map<string, SupervisionRoute>(
      routes.map((r) => [`${r.supervisorStaffId}:${r.weekday}`, r])
    );

    const rows: Record<string, unknown>[] = [];
    for (const assignment of assignments) {
      for (const dateStr of dates) {
        const date = parseYmd(dateStr);
        const iso = isoWeekdayFromDate(date);
        if (iso === assignment.restWeekday) continue;
        if (!visitDaysForIso(assignment.visitDays, iso)) continue;
        if (!frequencyAppliesToDate(assignment.frequency, date)) continue;
        const supervisorId = assignment.supervisorStaffId!;
        const route = routeByKey.get(`${supervisorId}:${iso}`);
        const stopOrder = route?.stops.find((s) => s.unitId === assignment.unitId)?.stopOrder;
        rows.push({
          assignment_id: assignment.id,
          route_id: route?.id || null,
          unit_id: assignment.unitId,
          supervisor_staff_id: supervisorId,
          coordinator_staff_id: assignment.coordinatorStaffId || null,
          visit_date: dateStr,
          weekday: iso,
          stop_order: stopOrder ?? null,
          status: 'pending',
          created_by: userId || null,
          updated_by: userId || null,
        });
      }
    }

    if (!rows.length) return 0;

    const { data, error } = await db()
      .from(VISITS)
      .upsert(rows, { onConflict: 'visit_date,supervisor_staff_id,unit_id', ignoreDuplicates: true })
      .select('id');
    if (error) handleSupabaseError(error);
    return (data || []).length;
  },

  async createManualVisit(input: {
    unitId: string;
    supervisorStaffId: string;
    coordinatorStaffId?: string | null;
    visitDate: string;
    notes?: string;
    userId?: string;
  }): Promise<SupervisionVisit> {
    const weekday = isoWeekdayFromDate(parseYmd(input.visitDate));
    const { data, error } = await db()
      .from(VISITS)
      .insert({
        unit_id: input.unitId,
        supervisor_staff_id: input.supervisorStaffId,
        coordinator_staff_id: input.coordinatorStaffId || null,
        visit_date: input.visitDate,
        weekday,
        status: 'pending',
        notes: input.notes || null,
        created_by: input.userId || null,
        updated_by: input.userId || null,
      })
      .select('*')
      .single();
    if (error) handleSupabaseError(error);
    return mapVisit(data);
  },

  async updateVisit(
    id: string,
    patch: Partial<{
      status: SupervisionVisitStatus;
      checkInAt: string | null;
      checkOutAt: string | null;
      checkInLat: number | null;
      checkInLng: number | null;
      checkOutLat: number | null;
      checkOutLng: number | null;
      notes: string | null;
      skipReason: string | null;
      stopOrder: number | null;
    }>,
    userId?: string
  ): Promise<SupervisionVisit> {
    const payload: Record<string, unknown> = { updated_by: userId || null };
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.checkInAt !== undefined) payload.check_in_at = patch.checkInAt;
    if (patch.checkOutAt !== undefined) payload.check_out_at = patch.checkOutAt;
    if (patch.checkInLat !== undefined) payload.check_in_lat = patch.checkInLat;
    if (patch.checkInLng !== undefined) payload.check_in_lng = patch.checkInLng;
    if (patch.checkOutLat !== undefined) payload.check_out_lat = patch.checkOutLat;
    if (patch.checkOutLng !== undefined) payload.check_out_lng = patch.checkOutLng;
    if (patch.notes !== undefined) payload.notes = patch.notes;
    if (patch.skipReason !== undefined) payload.skip_reason = patch.skipReason;
    if (patch.stopOrder !== undefined) payload.stop_order = patch.stopOrder;

    const { data, error } = await db().from(VISITS).update(payload).eq('id', id).select('*').single();
    if (error) handleSupabaseError(error);
    return mapVisit(data);
  },

  async deleteVisit(id: string): Promise<void> {
    const { error } = await db().from(VISITS).delete().eq('id', id);
    if (error) handleSupabaseError(error);
  },

  buildDayStopsFromAssignments(
    assignments: SupervisionAssignment[],
    supervisorStaffId: string,
    weekday: number,
    units: Unit[]
  ): Array<{ unitId: string; unitName: string; latitude?: number; longitude?: number }> {
    const lookup = unitById(units);
    return assignments
      .filter(
        (a) => a.isActive && a.supervisorStaffId === supervisorStaffId && visitDaysForIso(a.visitDays, weekday)
      )
      .map((a) => {
        const unit = lookup.get(a.unitId);
        return {
          unitId: a.unitId,
          unitName: unit?.name || a.unitName || a.unitId,
          latitude: unit?.latitude,
          longitude: unit?.longitude,
        };
      });
  },

  optimizeStops(stops: Array<{ unitId: string; unitName: string; latitude?: number; longitude?: number }>) {
    const result = optimizeRouteOrder(
      stops.map((s) => ({
        id: s.unitId,
        latitude: s.latitude,
        longitude: s.longitude,
        unitName: s.unitName,
      }))
    );
    return {
      ordered: result.ordered.map((s) => ({
        unitId: s.id,
        unitName: (s as { unitName?: string }).unitName || s.id,
        latitude: s.latitude ?? undefined,
        longitude: s.longitude ?? undefined,
      })),
      distanceKm: result.distanceKm,
      skippedWithoutCoords: result.skippedWithoutCoords.length,
    };
  },
};
