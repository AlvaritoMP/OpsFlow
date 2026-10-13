import { supabase, handleSupabaseError } from './supabase';
import type { UnitWorkPlan } from '../types';
import { parseShifts } from '../utils/workPlan';

export type WorkPlanAuthor = { id?: string; name?: string };

function textOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

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
    createdBy: textOrUndefined(data.created_by),
    createdByName: textOrUndefined(data.created_by_name),
    updatedBy: textOrUndefined(data.updated_by),
    updatedByName: textOrUndefined(data.updated_by_name),
    createdAt: typeof data.created_at === 'string' ? data.created_at : new Date().toISOString(),
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : new Date().toISOString(),
  };
}

function payload(plan: UnitWorkPlan, author?: WorkPlanAuthor, includeCreator = false) {
  const body: Record<string, unknown> = {
    unit_id: plan.unitId,
    title: plan.title.trim(),
    valid_from: plan.validFrom || null,
    valid_until: plan.validUntil || null,
    notes: plan.notes?.trim() || null,
    status: plan.status,
    shifts: plan.shifts,
    updated_by: author?.id || null,
    updated_by_name: author?.name?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (includeCreator) {
    body.created_by = author?.id || null;
    body.created_by_name = author?.name?.trim() || null;
  }
  return body;
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

  async save(plan: UnitWorkPlan, author?: WorkPlanAuthor): Promise<UnitWorkPlan> {
    if (plan.status === 'active') {
      await clearOtherActive(plan.unitId, plan.id || undefined);
    }
    if (!plan.id) {
      const { data, error } = await supabase.from('unit_work_plans').insert(payload(plan, author, true)).select('*').single();
      if (error) handleSupabaseError(error);
      return rowToPlan(data as unknown as Record<string, unknown>);
    }
    const { data, error } = await supabase
      .from('unit_work_plans')
      .update(payload(plan, author, false))
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
