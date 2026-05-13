import { supabase, handleSupabaseError } from './supabase';
import { VariableCompensation } from '../types';

type VariableCompensationInput = {
  unitId: string;
  resourceId: string;
  periodMonth: string;
  amount: number;
  concept: string;
  paymentDate?: string;
  notes?: string;
  source?: 'manual' | 'import';
};

export const variableCompensationsService = {
  async getByUnitAndMonth(unitId: string, periodMonth: string): Promise<VariableCompensation[]> {
    try {
      const { data, error } = await supabase
        .from('variable_compensations')
        .select('*')
        .eq('unit_id', unitId)
        .eq('period_month', normalizePeriodMonth(periodMonth))
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(transformFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async create(compensation: VariableCompensationInput): Promise<VariableCompensation> {
    try {
      const { data, error } = await supabase
        .from('variable_compensations')
        .insert(transformToDB(compensation))
        .select()
        .single();

      if (error) throw error;

      return transformFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async createMany(compensations: VariableCompensationInput[]): Promise<VariableCompensation[]> {
    if (compensations.length === 0) return [];

    try {
      const { data, error } = await supabase
        .from('variable_compensations')
        .insert(compensations.map(transformToDB))
        .select();

      if (error) throw error;

      return (data || []).map(transformFromDB);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('variable_compensations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};

function normalizePeriodMonth(periodMonth: string): string {
  const base = (periodMonth || '').trim();
  if (base.length < 7) {
    throw new Error('El mes de período no es válido (use formato AAAA-MM).');
  }
  return `${base.slice(0, 7)}-01`;
}

function formatPeriodMonth(periodMonth: string): string {
  return periodMonth.slice(0, 7);
}

function transformToDB(compensation: VariableCompensationInput): any {
  return {
    unit_id: compensation.unitId,
    resource_id: compensation.resourceId,
    period_month: normalizePeriodMonth(compensation.periodMonth),
    amount: compensation.amount,
    concept: compensation.concept || 'Comisión',
    payment_date: compensation.paymentDate || null,
    notes: compensation.notes || null,
    source: compensation.source || 'manual',
  };
}

function transformFromDB(data: any): VariableCompensation {
  return {
    id: data.id,
    unitId: data.unit_id,
    resourceId: data.resource_id,
    periodMonth: formatPeriodMonth(data.period_month),
    amount: Number(data.amount || 0),
    concept: data.concept || 'Comisión',
    paymentDate: data.payment_date || undefined,
    notes: data.notes || undefined,
    source: data.source || 'manual',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
