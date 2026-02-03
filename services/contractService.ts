import { supabase, handleSupabaseError } from './supabase';
import { ContractHistory } from '../types';

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

      return data.map(contract => ({
        id: contract.id,
        resourceId: contract.resource_id,
        contractNumber: contract.contract_number,
        startDate: contract.start_date,
        endDate: contract.end_date,
        status: contract.status,
        notes: contract.notes || undefined,
        createdAt: contract.created_at,
        updatedAt: contract.updated_at,
      }));
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
    notes?: string
  ): Promise<ContractHistory> {
    try {
      // Obtener el siguiente número de contrato
      const { data: existingContracts } = await supabase
        .from('contract_history')
        .select('contract_number')
        .eq('resource_id', resourceId)
        .order('contract_number', { ascending: false })
        .limit(1);

      const nextContractNumber = existingContracts && existingContracts.length > 0
        ? existingContracts[0].contract_number + 1
        : 1;

      // Si es una renovación, marcar el contrato anterior como renovado
      if (nextContractNumber > 1) {
        await supabase
          .from('contract_history')
          .update({ status: 'renovado' })
          .eq('resource_id', resourceId)
          .eq('status', 'activo');
      }

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
        })
        .select()
        .single();

      if (error) throw error;

      return {
        id: data.id,
        resourceId: data.resource_id,
        contractNumber: data.contract_number,
        startDate: data.start_date,
        endDate: data.end_date,
        status: data.status,
        notes: data.notes || undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
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

      return {
        id: data.id,
        resourceId: data.resource_id,
        contractNumber: data.contract_number,
        startDate: data.start_date,
        endDate: data.end_date,
        status: data.status,
        notes: data.notes || undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
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
};
