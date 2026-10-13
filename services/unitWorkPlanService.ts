import { supabase, handleSupabaseError } from './supabase';
import type { UnitWorkPlan } from '../types';
import { parseShifts } from '../utils/workPlan';

function rowToPlan(data: Record<string, unknown>): UnitWorkPlan {
  return {
    id: String(data.id || ''),
    unitId: String(data.unit_id || ''),
    title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Plan de trabajo',
    validFrom: typeof data.valid_from === 'string' ? data.valid_from : null,
    validUntil: typeof data.valid_until === 'string' ? data.valid_until : null,
    notes: typeof data.notes === 'string' ? data.notes : '',
    status: data.status === 'active' ? 'active' : 'draft',
    shifts: parseShifts(data.shifts),
    updatedBy: typeof data.updated_by === 'string' ? data.updated_by : undefined,
    createdAt: typeof data.created_at === 'string' ? data.created_at : new Date().toISOString(),
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : new Date().toISOString(),
  };
}

function payload(plan: UnitWorkPlan, userId?: string) {
  return {
    unit_id: plan.unitId,
    title: plan.title.trim(),
    valid_from: plan.validFrom || null,
    valid_until: plan.validUntil || null,
    notes: plan.notes?.trim() || null,
    status: plan.status,
    shifts: plan.shifts,
    updated_by: userId || null,
    updated_at: new Date().toISOString(),
  };
}

async function clearOtherActive(unitId: string, keepId?: string) {
  let query = supabase
    .from('unit_work_plans')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('unit_id', unitId)
    .eq('status', 'active');
  if (keepId) query = query.neq('id', keepId);
  const { error } = await query;
  if (error) handleSupabaseError(error);
}

export const unitWorkPlanService = {
  async listByUnit(unitId: string): Promise<UnitWorkPlan[]> {
    const { data, error } = await supabase
      .from('unit_work_plans')
      .select('*')
      .eq('unit_id', unitId)
      .order('updated_at', { ascending: false });
    if (error) handleSupabaseError(error);
const plans = ((data || []) as unknown[]).map((row) => rowToPlan(row as Record<string, unknown>));
    return plans.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  },

  async save(plan: UnitWorkPlan, userId?: string): Promise<UnitWorkPlan> {
    if (plan.status === 'active') {
      await clearOtherActive(plan.unitId, plan.id || undefined);
    }
    const body = payload(plan, userId);
    if (!plan.id) {
      const { data, error } = await supabase.from('unit_work_plans').insert(body).select('*').single();
      if (error) handleSupabaseError(error);
      return rowToPlan(data as unknown as Record<string, unknown>);
    }
    const { data, error } = await supabase
      .from('unit_work_plans')
      .update(body)
      .eq('id', plan.id)
      .select('*')
      .single();
    if (error) handleSupabaseError(error);
    return rowToPlan(data as unknown as Record<string, unknown>);
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('unit_work_plans').delete().eq('id', id);
    if (error) handleSupabaseError(error);
  },
};
