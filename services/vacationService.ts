import { supabase, handleSupabaseError } from './supabase';
import {
  VacationBalance,
  VacationDayEntry,
  VacationPapeleta,
  VacationBalanceSummary,
  Resource,
  Unit,
  ResourceType,
  VacationCalendarEvent,
} from '../types';
import { resourcesService } from './resourcesService';

// Régimen general Perú: 30 días calendario por año = 2.5 días por mes
export const DAYS_PER_YEAR = 30;
export const DAYS_PER_MONTH = 2.5;
export const MIN_PAPELETA_DAYS = 7;

// ============================================
// UTILIDADES DE CÁLCULO
// ============================================

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetweenInclusive(start: string, end: string): number {
  const s = parseDate(start);
  const e = parseDate(end);
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return diff + 1;
}

function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function monthsWorkedSince(hireDate: string, asOf: Date = new Date()): number {
  const hire = parseDate(hireDate);
  let months = (asOf.getFullYear() - hire.getFullYear()) * 12 + (asOf.getMonth() - hire.getMonth());
  if (asOf.getDate() < hire.getDate()) months--;
  return Math.max(0, months);
}

export function calculateAccruedDays(
  startDate: string,
  annualEntitlement: number = DAYS_PER_YEAR,
  asOf: Date = new Date()
): { accruedDays: number; fullYears: number; monthsInCurrentPeriod: number } {
  const months = monthsWorkedSince(startDate, asOf);
  const fullYears = Math.floor(months / 12);
  const monthsInCurrentPeriod = months % 12;
  const daysPerMonth = annualEntitlement / 12;
  const accruedDays = fullYears * annualEntitlement + monthsInCurrentPeriod * daysPerMonth;
  return {
    accruedDays: Math.round(accruedDays * 10) / 10,
    fullYears,
    monthsInCurrentPeriod,
  };
}

export function buildBalanceSummary(
  resource: Resource,
  unit: Unit,
  balance: VacationBalance | null,
  papeletas: VacationPapeleta[],
  dayEntries: VacationDayEntry[]
): VacationBalanceSummary | null {
  if (!resource.startDate) return null;

  const annualEntitlement = balance?.annualEntitlement ?? DAYS_PER_YEAR;
  const { accruedDays, fullYears, monthsInCurrentPeriod } = calculateAccruedDays(
    resource.startDate,
    annualEntitlement
  );

  const activePapeletas = papeletas.filter(p => p.status !== 'cancelled');
  const papeletaDays = activePapeletas.reduce((s, p) => s + p.calendarDays, 0);

  const pendingEntries = dayEntries.filter(d => d.status === 'pending_batch');
  const pendingIndividualDays = pendingEntries.length;
  const pendingDayDates = pendingEntries.map(d => d.vacationDate).sort();

  const historicalTakenDays = balance?.historicalTakenDays ?? 0;
  const totalUsedDays = historicalTakenDays + papeletaDays + pendingIndividualDays;
  const availableDays = Math.round((accruedDays - totalUsedDays) * 10) / 10;

  return {
    resourceId: resource.id,
    workerName: resource.name,
    workerDni: resource.dni,
    unitId: unit.id,
    unitName: unit.name,
    startDate: resource.startDate,
    puesto: resource.puesto,
    accruedDays,
    historicalTakenDays,
    papeletaDays,
    pendingIndividualDays,
    totalUsedDays: Math.round(totalUsedDays * 10) / 10,
    availableDays,
    fullYears,
    monthsInCurrentPeriod,
    canIssuePapeleta: pendingIndividualDays >= MIN_PAPELETA_DAYS,
    pendingDayDates,
  };
}

// ============================================
// TRANSFORMACIONES DB
// ============================================

function transformBalanceFromDB(data: any): VacationBalance {
  return {
    id: data.id,
    resourceId: data.resource_id,
    historicalTakenDays: Number(data.historical_taken_days),
    annualEntitlement: data.annual_entitlement ?? DAYS_PER_YEAR,
    notes: data.notes,
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
  };
}

function transformDayEntryFromDB(data: any): VacationDayEntry {
  return {
    id: data.id,
    resourceId: data.resource_id,
    unitId: data.unit_id,
    vacationDate: data.vacation_date,
    status: data.status,
    papeletaId: data.papeleta_id,
    notes: data.notes,
    createdAt: data.created_at,
    createdBy: data.created_by,
  };
}

function transformPapeletaFromDB(data: any): VacationPapeleta {
  return {
    id: data.id,
    resourceId: data.resource_id,
    unitId: data.unit_id,
    code: data.code,
    workerName: data.worker_name,
    workerDni: data.worker_dni,
    unitName: data.unit_name,
    startDate: data.start_date,
    endDate: data.end_date,
    returnDate: data.return_date,
    calendarDays: data.calendar_days,
    sourceType: data.source_type,
    status: data.status,
    notes: data.notes,
    issuedAt: data.issued_at,
    issuedBy: data.issued_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

async function syncVacationShifts(resourceId: string, dates: string[]): Promise<void> {
  for (const date of dates) {
    await resourcesService.upsertDailyShift(resourceId, {
      date,
      type: 'Vacation',
      hours: 0,
    });
  }
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

// ============================================
// SERVICIO
// ============================================

export const vacationService = {
  DAYS_PER_YEAR,
  DAYS_PER_MONTH,
  MIN_PAPELETA_DAYS,
  calculateAccruedDays,
  buildBalanceSummary,

  async generatePapeletaCode(): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('vacation_papeletas')
        .select('code')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      let nextNumber = 1;
      if (data?.code) {
        const match = data.code.match(/-(\d+)$/);
        if (match) nextNumber = parseInt(match[1], 10) + 1;
      }

      const year = new Date().getFullYear();
      return `PAP-${year}-${nextNumber.toString().padStart(6, '0')}`;
    } catch {
      const year = new Date().getFullYear();
      return `PAP-${year}-${Date.now().toString().slice(-6)}`;
    }
  },

  // --- Balances ---

  async getBalance(resourceId: string): Promise<VacationBalance | null> {
    try {
      const { data, error } = await supabase
        .from('vacation_balances')
        .select('*')
        .eq('resource_id', resourceId)
        .maybeSingle();
      if (error) throw error;
      return data ? transformBalanceFromDB(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  async upsertBalance(
    resourceId: string,
    historicalTakenDays: number,
    notes?: string,
    updatedBy?: string,
    annualEntitlement: number = DAYS_PER_YEAR
  ): Promise<VacationBalance> {
    const { data, error } = await supabase
      .from('vacation_balances')
      .upsert(
        {
          resource_id: resourceId,
          historical_taken_days: historicalTakenDays,
          annual_entitlement: annualEntitlement,
          notes,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'resource_id' }
      )
      .select()
      .single();

    if (error) {
      handleSupabaseError(error);
      throw error;
    }
    return transformBalanceFromDB(data);
  },

  // --- Day entries ---

  async getDayEntries(resourceId?: string, unitId?: string): Promise<VacationDayEntry[]> {
    try {
      let query = supabase.from('vacation_day_entries').select('*').order('vacation_date', { ascending: false });
      if (resourceId) query = query.eq('resource_id', resourceId);
      if (unitId) query = query.eq('unit_id', unitId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(transformDayEntryFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async addDayEntry(
    resourceId: string,
    unitId: string,
    vacationDate: string,
    notes?: string,
    createdBy?: string
  ): Promise<VacationDayEntry> {
    const { data, error } = await supabase
      .from('vacation_day_entries')
      .insert({
        resource_id: resourceId,
        unit_id: unitId,
        vacation_date: vacationDate,
        status: 'pending_batch',
        notes,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    await syncVacationShifts(resourceId, [vacationDate]);
    return transformDayEntryFromDB(data);
  },

  async cancelDayEntry(id: string, resourceId: string): Promise<void> {
    const { data: entry } = await supabase
      .from('vacation_day_entries')
      .select('vacation_date, status')
      .eq('id', id)
      .single();

    if (!entry || entry.status !== 'pending_batch') {
      throw new Error('Solo se pueden cancelar días pendientes de agrupar');
    }

    const { error } = await supabase
      .from('vacation_day_entries')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    // Restaurar turno a OFF en roster
    await resourcesService.upsertDailyShift(resourceId, {
      date: entry.vacation_date,
      type: 'OFF',
      hours: 0,
    });
  },

  // --- Papeletas ---

  async getPapeletas(resourceId?: string, unitId?: string): Promise<VacationPapeleta[]> {
    try {
      let query = supabase.from('vacation_papeletas').select('*').order('start_date', { ascending: false });
      if (resourceId) query = query.eq('resource_id', resourceId);
      if (unitId) query = query.eq('unit_id', unitId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(transformPapeletaFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async getPapeletaWithDays(id: string): Promise<VacationPapeleta | null> {
    const { data: papeleta, error } = await supabase
      .from('vacation_papeletas')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !papeleta) return null;

    const { data: days } = await supabase
      .from('vacation_day_entries')
      .select('*')
      .eq('papeleta_id', id)
      .order('vacation_date', { ascending: true });

    const result = transformPapeletaFromDB(papeleta);
    if (days?.length) {
      result.accumulatedDays = days.map(transformDayEntryFromDB);
    }
    return result;
  },

  async createDirectPapeleta(params: {
    resourceId: string;
    unitId: string;
    unitName: string;
    workerName: string;
    workerDni?: string;
    startDate: string;
    endDate: string;
    returnDate: string;
    notes?: string;
    issuedBy?: string;
  }): Promise<VacationPapeleta> {
    const calendarDays = daysBetweenInclusive(params.startDate, params.endDate);
    if (calendarDays < MIN_PAPELETA_DAYS) {
      throw new Error(`La papeleta debe tener al menos ${MIN_PAPELETA_DAYS} días calendario (normativa peruana)`);
    }

    const code = await this.generatePapeletaCode();

    const { data, error } = await supabase
      .from('vacation_papeletas')
      .insert({
        resource_id: params.resourceId,
        unit_id: params.unitId,
        code,
        worker_name: params.workerName,
        worker_dni: params.workerDni,
        unit_name: params.unitName,
        start_date: params.startDate,
        end_date: params.endDate,
        return_date: params.returnDate,
        calendar_days: calendarDays,
        source_type: 'direct',
        status: 'issued',
        notes: params.notes,
        issued_by: params.issuedBy,
      })
      .select()
      .single();

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    const dates = dateRange(params.startDate, params.endDate);
    await syncVacationShifts(params.resourceId, dates);

    return transformPapeletaFromDB(data);
  },

  async createPapeletaFromAccumulated(params: {
    resourceId: string;
    unitId: string;
    unitName: string;
    workerName: string;
    workerDni?: string;
    startDate: string;
    endDate: string;
    returnDate: string;
    dayEntryIds: string[];
    notes?: string;
    issuedBy?: string;
  }): Promise<VacationPapeleta> {
    if (params.dayEntryIds.length < MIN_PAPELETA_DAYS) {
      throw new Error(`Se requieren al menos ${MIN_PAPELETA_DAYS} días acumulados para emitir papeleta`);
    }

    const { data: entries, error: entriesError } = await supabase
      .from('vacation_day_entries')
      .select('*')
      .in('id', params.dayEntryIds)
      .eq('resource_id', params.resourceId)
      .eq('status', 'pending_batch');

    if (entriesError) throw entriesError;
    if (!entries || entries.length < MIN_PAPELETA_DAYS) {
      throw new Error('Los días seleccionados no están disponibles o son insuficientes');
    }

    const calendarDays = params.dayEntryIds.length;
    const code = await this.generatePapeletaCode();

    const { data, error } = await supabase
      .from('vacation_papeletas')
      .insert({
        resource_id: params.resourceId,
        unit_id: params.unitId,
        code,
        worker_name: params.workerName,
        worker_dni: params.workerDni,
        unit_name: params.unitName,
        start_date: params.startDate,
        end_date: params.endDate,
        return_date: params.returnDate,
        calendar_days: calendarDays,
        source_type: 'accumulated',
        status: 'issued',
        notes: params.notes,
        issued_by: params.issuedBy,
      })
      .select()
      .single();

    if (error) {
      handleSupabaseError(error);
      throw error;
    }

    await supabase
      .from('vacation_day_entries')
      .update({ status: 'batched', papeleta_id: data.id })
      .in('id', params.dayEntryIds);

    const result = transformPapeletaFromDB(data);
    result.accumulatedDays = entries.map(transformDayEntryFromDB);
    return result;
  },

  async cancelPapeleta(id: string): Promise<void> {
    const { error } = await supabase
      .from('vacation_papeletas')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // --- Agregados ---

  async getUnitSummaries(units: Unit[]): Promise<VacationBalanceSummary[]> {
    const summaries: VacationBalanceSummary[] = [];

    for (const unit of units) {
      const personnel = (unit.resources || []).filter(
        r => r.type === ResourceType.PERSONNEL && r.personnelStatus !== 'cesado' && !r.archived
      );

      for (const resource of personnel) {
        const [balance, papeletas, dayEntries] = await Promise.all([
          this.getBalance(resource.id),
          this.getPapeletas(resource.id),
          this.getDayEntries(resource.id),
        ]);

        const summary = buildBalanceSummary(resource, unit, balance, papeletas, dayEntries);
        if (summary) summaries.push(summary);
      }
    }

    return summaries.sort((a, b) => a.workerName.localeCompare(b.workerName));
  },

  async getWorkersOnVacation(units: Unit[], fromDate: string, toDate: string): Promise<{
    resourceId: string;
    workerName: string;
    unitName: string;
    startDate: string;
    endDate: string;
    type: 'papeleta' | 'day_entry';
    code?: string;
  }[]> {
    const unitIds = units.map(u => u.id);
    if (unitIds.length === 0) return [];

    const { data: papeletas } = await supabase
      .from('vacation_papeletas')
      .select('*')
      .in('unit_id', unitIds)
      .neq('status', 'cancelled')
      .lte('start_date', toDate)
      .gte('end_date', fromDate);

    const { data: dayEntries } = await supabase
      .from('vacation_day_entries')
      .select('*')
      .in('unit_id', unitIds)
      .eq('status', 'pending_batch')
      .gte('vacation_date', fromDate)
      .lte('vacation_date', toDate);

    const results: {
      resourceId: string;
      workerName: string;
      unitName: string;
      startDate: string;
      endDate: string;
      type: 'papeleta' | 'day_entry';
      code?: string;
    }[] = [];

    (papeletas || []).forEach(p => {
      results.push({
        resourceId: p.resource_id,
        workerName: p.worker_name,
        unitName: p.unit_name,
        startDate: p.start_date,
        endDate: p.end_date,
        type: 'papeleta',
        code: p.code,
      });
    });

    const resourceMap = new Map<string, string>();
    units.forEach(u => {
      (u.resources || []).forEach(r => resourceMap.set(r.id, r.name));
    });

    (dayEntries || []).forEach(d => {
      const unit = units.find(u => u.id === d.unit_id);
      results.push({
        resourceId: d.resource_id,
        workerName: resourceMap.get(d.resource_id) || 'Desconocido',
        unitName: unit?.name || '',
        startDate: d.vacation_date,
        endDate: d.vacation_date,
        type: 'day_entry',
      });
    });

    return results;
  },

  async getCalendarEvents(units: Unit[], fromDate: string, toDate: string): Promise<VacationCalendarEvent[]> {
    const unitIds = units.map(u => u.id);
    if (unitIds.length === 0) return [];

    const { data: papeletas } = await supabase
      .from('vacation_papeletas')
      .select('*')
      .in('unit_id', unitIds)
      .neq('status', 'cancelled')
      .lte('start_date', toDate)
      .gte('end_date', fromDate);

    const { data: dayEntries } = await supabase
      .from('vacation_day_entries')
      .select('*')
      .in('unit_id', unitIds)
      .in('status', ['pending_batch', 'batched'])
      .gte('vacation_date', fromDate)
      .lte('vacation_date', toDate);

    const resourceMap = new Map<string, string>();
    units.forEach(u => {
      (u.resources || []).forEach(r => resourceMap.set(r.id, r.name));
    });

    const events: VacationCalendarEvent[] = [];

    (papeletas || []).forEach(p => {
      for (const d of dateRange(p.start_date, p.end_date)) {
        if (d >= fromDate && d <= toDate) {
          events.push({
            date: d,
            unitId: p.unit_id,
            unitName: p.unit_name,
            resourceId: p.resource_id,
            workerName: p.worker_name,
            eventType: 'papeleta',
            code: p.code,
          });
        }
      }
    });

    (dayEntries || []).forEach(d => {
      const unit = units.find(u => u.id === d.unit_id);
      events.push({
        date: d.vacation_date,
        unitId: d.unit_id,
        unitName: unit?.name || '',
        resourceId: d.resource_id,
        workerName: resourceMap.get(d.resource_id) || 'Desconocido',
        eventType: 'day_entry',
      });
    });

    return events.sort((a, b) => a.date.localeCompare(b.date) || a.workerName.localeCompare(b.workerName));
  },
};
