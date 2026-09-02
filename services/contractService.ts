import { supabase, handleSupabaseError } from './supabase';
import { ContractHistory } from '../types';

export function mapContractFromDB(contract: any): ContractHistory {
  return {
    id: contract.id,
    resourceId: contract.resource_id ?? contract.resourceId,
    contractNumber: contract.contract_number ?? contract.contractNumber,
    startDate: contract.start_date ?? contract.startDate,
    endDate: contract.end_date ?? contract.endDate,
    status: contract.status,
    notes: contract.notes || undefined,
    monthlySalary: contract.monthly_salary !== null && contract.monthly_salary !== undefined
      ? Number(contract.monthly_salary)
      : (contract.monthlySalary !== undefined ? Number(contract.monthlySalary) : undefined),
    workConditionAmount: contract.work_condition_amount !== null && contract.work_condition_amount !== undefined
      ? Number(contract.work_condition_amount)
      : (contract.workConditionAmount !== undefined ? Number(contract.workConditionAmount) : undefined),
    createdAt: contract.created_at ?? contract.createdAt,
    updatedAt: contract.updated_at ?? contract.updatedAt,
  };
}

export const contractService = {
  // Obtener historial de contratos de un trabajador
  async getContractHistory(resourceId: string): Promise<ContractHistory[]> {
    try {
      const { data, error } = await supabase
        .from('contract_history')
        .select('*')
        .eq('resource_id', resourceId)
        .order('contract_number', { ascending: true });

      if (error) throw error;

      return (data || []).map(mapContractFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Crear un nuevo contrato (contrato inicial o renovación)
  async createContract(
    resourceId: string,
    startDate: string,
    endDate: string,
    notes?: string,
    options?: { isRenewal?: boolean; monthlySalary?: number; workConditionAmount?: number }
  ): Promise<ContractHistory> {
    try {
      // Obtener el siguiente número de contrato
      const { data: existingContracts } = await supabase
        .from('contract_history')
        .select('contract_number')
        .eq('resource_id', resourceId)
        .order('contract_number', { ascending: false })
        .limit(1);

      const hasExistingContracts = !!(existingContracts && existingContracts.length > 0);
      const nextContractNumber = hasExistingContracts
        ? existingContracts[0].contract_number + 1
        : (options?.isRenewal ? 2 : 1);

      // Crear el nuevo contrato
      const { data, error } = await supabase
        .from('contract_history')
        .insert({
          resource_id: resourceId,
          contract_number: nextContractNumber,
          start_date: startDate,
          end_date: endDate,
          status: 'activo',
          notes: notes || null,
          monthly_salary: options?.monthlySalary ?? null,
          work_condition_amount: options?.workConditionAmount ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      // Si es una renovación, marcar el contrato anterior como renovado DESPUÉS
      // de crear el nuevo contrato activo para evitar estados intermedios
      // donde el trabajador quede sin contrato activo.
      if (nextContractNumber > 1) {
        const { error: updatePreviousError } = await supabase
          .from('contract_history')
          .update({ status: 'renovado' })
          .eq('resource_id', resourceId)
          .eq('status', 'activo')
          .lt('contract_number', nextContractNumber);

        if (updatePreviousError) throw updatePreviousError;
      }

      return mapContractFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Finalizar un contrato (marcar como finalizado)
  async finalizeContract(contractId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('contract_history')
        .update({ status: 'finalizado' })
        .eq('id', contractId);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Obtener el contrato activo actual de un trabajador
  async getActiveContract(resourceId: string): Promise<ContractHistory | null> {
    try {
      const { data, error } = await supabase
        .from('contract_history')
        .select('*')
        .eq('resource_id', resourceId)
        .eq('status', 'activo')
        .order('contract_number', { ascending: false })
        .limit(1)
        .maybeSingle(); // Usar maybeSingle en lugar de single para evitar error 406

      if (error) {
        // Si es un error 406 (Not Acceptable) o PGRST116 (No encontrado), retornar null
        if (error.code === 'PGRST116' || error.code === '406' || error.message?.includes('406')) {
          console.warn(`⚠️ No se pudo obtener contrato activo para ${resourceId} (puede no existir o haber problema de permisos)`);
          return null;
        }
        throw error;
      }

      // Si no hay datos, retornar null
      if (!data) return null;

      return mapContractFromDB(data);
    } catch (error: any) {
      // Manejar errores de red o permisos sin bloquear
      if (error?.code === '406' || error?.message?.includes('406') || error?.message?.includes('Not Acceptable')) {
        console.warn(`⚠️ Error 406 al obtener contrato activo para ${resourceId} (posible problema de RLS)`);
        return null;
      }
      handleSupabaseError(error);
      return null;
    }
  },

  /**
   * Alinea el contrato operativo con las fechas de la ficha OpsFlow.
   * No usa fechas del ATS: esas quedan solo en inbound_source_data.
   */
  async syncOperationalContractDates(
    resourceId: string,
    dates: { startDate?: string | null; endDate?: string | null }
  ): Promise<void> {
    const start = typeof dates.startDate === 'string' ? dates.startDate.trim() : '';
    const end = typeof dates.endDate === 'string' ? dates.endDate.trim() : '';
    if (!start && !end) return;

    const history = await this.getContractHistory(resourceId);
    if (history.length === 0) {
      if (start && end) {
        await this.createContract(resourceId, start, end, 'Contrato operativo OpsFlow');
      }
      return;
    }

    const sorted = [...history].sort((a, b) => a.contractNumber - b.contractNumber);
    const first = sorted[0];
    const active = sorted.find((c) => c.status === 'activo') || sorted[sorted.length - 1];
    const nextStart = start || first.startDate;
    const nextEnd = end || (sorted.length === 1 ? first.endDate : active.endDate);
    if (!nextStart || !nextEnd || nextEnd < nextStart) return;

    if (sorted.length === 1) {
      if (first.startDate === nextStart && first.endDate === nextEnd) return;
      const { error } = await supabase
        .from('contract_history')
        .update({ start_date: nextStart, end_date: nextEnd })
        .eq('id', first.id);
      if (error) throw error;
      return;
    }

    if (start && first.startDate !== nextStart && first.endDate >= nextStart) {
      const { error } = await supabase
        .from('contract_history')
        .update({ start_date: nextStart })
        .eq('id', first.id);
      if (error) throw error;
    }

    if (end && active.endDate !== nextEnd && nextEnd >= active.startDate) {
      const { error } = await supabase
        .from('contract_history')
        .update({ end_date: nextEnd })
        .eq('id', active.id);
      if (error) throw error;
    }
  },
};
