import { supabase, handleSupabaseError } from './supabase';
import { DeliveryConstancy, ConstancyItem, AssignedAsset, Resource } from '../types';

// ============================================
// SERVICIO DE CONSTANCIAS DE ENTREGA
// ============================================

export const constancyService = {
  // Generar código correlativo único
  async generateConstancyCode(): Promise<string> {
    try {
      // Obtener el último código generado
      const { data, error } = await supabase
        .from('delivery_constancies')
        .select('code')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        // Si no hay registros, empezar desde 1
        if (error.code === 'PGRST116') {
          return this.formatConstancyCode(1);
        }
        throw error;
      }

      let nextNumber = 1;
      if (data?.code) {
        // Extraer el número del código (formato: CONST-YYYY-000001)
        const match = data.code.match(/-(\d+)$/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }

      return this.formatConstancyCode(nextNumber);
    } catch (error) {
      console.error('Error al generar código de constancia:', error);
      // Fallback: usar timestamp
      return this.formatConstancyCode(Date.now());
    }
  },

  // Formatear código de constancia (CONST-YYYY-000001)
  formatConstancyCode(number: number): string {
    const year = new Date().getFullYear();
    const paddedNumber = number.toString().padStart(6, '0');
    return `CONST-${year}-${paddedNumber}`;
  },

  // Generar constancia de entrega de activos/EPPs a trabajador
  async generateAssetConstancy(
    workerId: string,
    workerName: string,
    workerDni: string,
    unitId: string,
    unitName: string,
    assets: AssignedAsset[],
    generatedBy?: string
  ): Promise<DeliveryConstancy> {
    try {
      console.log(`📝 constancyService.generateAssetConstancy llamado con:`, {
        workerId,
        workerName,
        workerDni,
        unitId,
        unitName,
        assetsCount: assets.length,
        generatedBy
      });

      const code = await this.generateConstancyCode();
      console.log(`🔢 Código generado: ${code}`);
      
      const date = new Date().toISOString().split('T')[0];

      const items: ConstancyItem[] = assets.map(asset => ({
        name: asset.name,
        type: asset.type,
        serialNumber: asset.serialNumber,
        quantity: 1,
        condition: 'Buen estado',
      }));

      console.log(`📦 Items de constancia:`, items);

      const constancy: DeliveryConstancy = {
        id: crypto.randomUUID(),
        code,
        type: 'ASSET',
        workerId,
        workerName,
        workerDni,
        unitId,
        unitName,
        items,
        date,
        generatedAt: new Date().toISOString(),
        generatedBy,
      };

      console.log(`💾 Guardando constancia en BD:`, {
        code: constancy.code,
        workerName: constancy.workerName,
        workerDni: constancy.workerDni,
        itemsCount: constancy.items.length
      });

      // Guardar en base de datos
      const { data, error: dbError } = await supabase
        .from('delivery_constancies')
        .insert({
          id: constancy.id,
          code: constancy.code,
          type: constancy.type,
          worker_id: workerId,
          worker_name: workerName,
          worker_dni: workerDni,
          unit_id: unitId,
          unit_name: unitName,
          items: items,
          date: date,
          generated_at: constancy.generatedAt,
          generated_by: generatedBy,
        })
        .select();

      if (dbError) {
        console.error('❌ Error al guardar constancia en BD:', dbError);
        console.error('❌ Detalles del error:', JSON.stringify(dbError, null, 2));
        throw new Error(`Error al guardar constancia: ${dbError.message}`);
      }

      console.log(`✅ Constancia guardada exitosamente en BD:`, data?.[0]?.code || constancy.code);
      return constancy;
    } catch (error) {
      console.error('❌ Error al generar constancia de activos:', error);
      throw error;
    }
  },

  // Generar constancia de entrega de maquinaria/equipo a unidad
  async generateEquipmentConstancy(
    workerId: string,
    workerName: string,
    workerDni: string,
    unitId: string,
    unitName: string,
    equipment: Resource,
    generatedBy?: string
  ): Promise<DeliveryConstancy> {
    try {
      const code = await this.generateConstancyCode();
      const date = new Date().toISOString().split('T')[0];

      const items: ConstancyItem[] = [{
        name: equipment.name,
        type: 'Maquinaria/Equipo',
        serialNumber: equipment.externalId,
        quantity: equipment.quantity || 1,
        condition: equipment.status || 'Buen estado',
      }];

      const constancy: DeliveryConstancy = {
        id: crypto.randomUUID(),
        code,
        type: 'EQUIPMENT',
        workerId,
        workerName,
        workerDni,
        unitId,
        unitName,
        items,
        date,
        generatedAt: new Date().toISOString(),
        generatedBy,
      };

      // Guardar en base de datos
      const { error: dbError } = await supabase
        .from('delivery_constancies')
        .insert({
          id: constancy.id,
          code: constancy.code,
          type: constancy.type,
          worker_id: workerId,
          worker_name: workerName,
          worker_dni: workerDni,
          unit_id: unitId,
          unit_name: unitName,
          items: items,
          date: date,
          generated_at: constancy.generatedAt,
          generated_by: generatedBy,
        });

      if (dbError) {
        console.error('Error al guardar constancia en BD:', dbError);
        // Continuar aunque falle el guardado en BD
      }

      return constancy;
    } catch (error) {
      console.error('Error al generar constancia de maquinaria:', error);
      throw error;
    }
  },

  // Obtener todas las constancias
  async getAll(unitId?: string): Promise<DeliveryConstancy[]> {
    try {
      let query = supabase
        .from('delivery_constancies')
        .select('*')
        .order('created_at', { ascending: false });

      if (unitId) {
        query = query.eq('unit_id', unitId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(transformConstancyFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener constancia por código
  async getByCode(code: string): Promise<DeliveryConstancy | null> {
    try {
      const { data, error } = await supabase
        .from('delivery_constancies')
        .select('*')
        .eq('code', code)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data ? transformConstancyFromDB(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },
};

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function transformConstancyFromDB(data: any): DeliveryConstancy {
  return {
    id: data.id,
    code: data.code,
    type: data.type,
    workerId: data.worker_id,
    workerName: data.worker_name,
    workerDni: data.worker_dni,
    unitId: data.unit_id,
    unitName: data.unit_name,
    items: data.items || [],
    date: data.date,
    generatedAt: data.generated_at,
    generatedBy: data.generated_by,
  };
}

