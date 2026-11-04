import { supabase, handleSupabaseError } from './supabase';
import { DeliveryConstancy, ConstancyItem, AssignedAsset, Resource } from '../types';

function toDateOnly(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const iso = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : undefined;
}

function todayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

let deliveryCodeRpcReady: boolean | null = null;

function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202'
    || /does not exist|Could not find the function|schema cache/i.test(error.message || '');
}

function resolveAssetDeliveryDate(asset: AssignedAsset): string | undefined {
  return toDateOnly(asset.dateAssigned || (asset as { date_assigned?: string }).date_assigned);
}

// ============================================
// SERVICIO DE CONSTANCIAS DE ENTREGA
// ============================================

export const constancyService = {
  // Generar código correlativo único
  async generateConstancyCode(): Promise<string> {
    try {
      if (deliveryCodeRpcReady !== false) {
        const { data, error } = await supabase.rpc('next_delivery_constancy_code');
        if (!error && typeof data === 'string' && data.length > 0) {
          deliveryCodeRpcReady = true;
          return data;
        }
        if (isMissingRpc(error)) deliveryCodeRpcReady = false;
      }

      const year = new Date().getFullYear();
      const prefix = `CONST-${year}-`;
      const { data: rows, error: queryError } = await supabase
        .from('delivery_constancies')
        .select('code')
        .like('code', `${prefix}%`)
        .order('code', { ascending: false })
        .limit(1);

      if (queryError) throw queryError;

      let nextNumber = 1;
      const lastCode = rows?.[0]?.code as string | undefined;
      const match = lastCode?.match(/-(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }

      return this.formatConstancyCode(nextNumber);
    } catch (error) {
      console.error('Error al generar código de constancia:', error);
      return this.formatConstancyCode(Date.now());
    }
  },

  async insertConstancyRow(row: Record<string, unknown>) {
    let lastMessage = 'código duplicado';
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = await this.generateConstancyCode();
      const { data, error } = await supabase
        .from('delivery_constancies')
        .insert({ ...row, code })
        .select();

      if (!error) return { code, data };
      lastMessage = error.message || lastMessage;
      if (error.code !== '23505') break;
    }
    throw new Error(`Error al guardar constancia: ${lastMessage}`);
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

      const items: ConstancyItem[] = assets.map(asset => {
        const dateAssigned = resolveAssetDeliveryDate(asset);
        return {
          name: asset.name,
          type: asset.type,
          serialNumber: asset.serialNumber,
          quantity: 1,
          condition: 'Buen estado',
          dateAssigned,
        };
      });

      const deliveryDates = items
        .map(item => item.dateAssigned)
        .filter((value): value is string => Boolean(value))
        .sort();
      const date = deliveryDates[0] || todayIsoLocal();

      console.log(`📦 Items de constancia:`, items);

      const constancyId = crypto.randomUUID();
      const generatedAt = new Date().toISOString();

      console.log(`💾 Guardando constancia en BD:`, {
        workerName,
        workerDni,
        itemsCount: items.length
      });

      const { code } = await this.insertConstancyRow({
        id: constancyId,
        type: 'ASSET',
        worker_id: workerId,
        worker_name: workerName,
        worker_dni: workerDni,
        unit_id: unitId,
        unit_name: unitName,
        items: items,
        date: date,
        generated_at: generatedAt,
        generated_by: generatedBy,
      });

      const constancy: DeliveryConstancy = {
        id: constancyId,
        code,
        type: 'ASSET',
        workerId,
        workerName,
        workerDni,
        unitId,
        unitName,
        items,
        date,
        generatedAt,
        generatedBy,
      };

      console.log(`✅ Constancia guardada exitosamente en BD:`, code);
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
      const date = todayIsoLocal();

      const items: ConstancyItem[] = [{
        name: equipment.name,
        type: 'Maquinaria/Equipo',
        serialNumber: equipment.externalId,
        quantity: equipment.quantity || 1,
        condition: equipment.status || 'Buen estado',
      }];

      const constancyId = crypto.randomUUID();
      const generatedAt = new Date().toISOString();

      const { code } = await this.insertConstancyRow({
        id: constancyId,
        type: 'EQUIPMENT',
        worker_id: workerId,
        worker_name: workerName,
        worker_dni: workerDni,
        unit_id: unitId,
        unit_name: unitName,
        items: items,
        date: date,
        generated_at: generatedAt,
        generated_by: generatedBy,
      });

      const constancy: DeliveryConstancy = {
        id: constancyId,
        code,
        type: 'EQUIPMENT',
        workerId,
        workerName,
        workerDni,
        unitId,
        unitName,
        items,
        date,
        generatedAt,
        generatedBy,
      };

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

