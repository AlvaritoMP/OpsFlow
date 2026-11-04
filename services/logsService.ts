import { supabase, handleSupabaseError } from './supabase';
import { OperationalLog } from '../types';
import { fetchAllPaged, fetchInChunks } from '../utils/queryBatch';

async function buildResponsibleRows(operationalLogId: string, responsibleIds: string[]) {
  const ids = [...new Set(responsibleIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const [{ data: resources, error: resourceError }, { data: staff, error: staffError }] = await Promise.all([
    supabase.from('resources').select('id').in('id', ids),
    supabase.from('management_staff').select('id').in('id', ids),
  ]);

  if (resourceError) throw resourceError;
  if (staffError && staffError.code !== '42P01') throw staffError;

  const resourceSet = new Set((resources || []).map((row: { id: string }) => row.id));
  const staffSet = new Set((staff || []).map((row: { id: string }) => row.id));

  return ids.flatMap((id) => {
    if (resourceSet.has(id)) {
      return [{ operational_log_id: operationalLogId, resource_id: id, management_staff_id: null }];
    }
    if (staffSet.has(id)) {
      return [{ operational_log_id: operationalLogId, resource_id: null, management_staff_id: id }];
    }
    console.warn(`Responsable omitido (${id}): no existe en personal ni en equipo de gestión`);
    return [];
  });
}

async function replaceLogResponsibles(operationalLogId: string, responsibleIds: string[]) {
  const { error: deleteError } = await supabase
    .from('log_responsible')
    .delete()
    .eq('operational_log_id', operationalLogId);
  if (deleteError) throw deleteError;

  const rows = await buildResponsibleRows(operationalLogId, responsibleIds);
  if (rows.length === 0) return;

  const { error } = await supabase.from('log_responsible').insert(rows);
  if (error) throw error;
}

// ============================================
// CRUD PARA OPERATIONAL_LOGS
// ============================================

export const logsService = {
  // Obtener todos los logs de una unidad
  async getByUnitId(unitId: string): Promise<OperationalLog[]> {
    try {
      const { data, error } = await supabase
        .from('operational_logs')
        .select('*, log_images(image_url), log_responsible(*)')
        .eq('unit_id', unitId)
        .order('date', { ascending: false });

      if (error) throw error;

      return data.map(transformLogFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async getByUnitIds(unitIds: string[], options?: { light?: boolean }): Promise<Map<string, OperationalLog[]>> {
    const grouped = new Map<string, OperationalLog[]>();
    if (unitIds.length === 0) return grouped;
    const light = options?.light === true;
    const select = light
      ? 'id, unit_id, date, type, description, author'
      : '*, log_images(image_url), log_responsible(*)';
    try {
      const rows = await fetchInChunks(unitIds, 80, (ids) =>
        fetchAllPaged(async (from, to) => {
          const { data, error } = await supabase
            .from('operational_logs')
            .select(select)
            .in('unit_id', ids)
            .order('date', { ascending: false })
            .range(from, to);
          if (error) throw error;
          return data || [];
        })
      );
      for (const row of rows as any[]) {
        const unitId = row.unit_id as string;
        const list = grouped.get(unitId) || [];
        list.push(transformLogFromDB(row));
        grouped.set(unitId, list);
      }
      return grouped;
    } catch (error) {
      handleSupabaseError(error);
      return grouped;
    }
  },

  // Obtener un log por ID
  async getById(id: string): Promise<OperationalLog | null> {
    try {
      const { data, error } = await supabase
        .from('operational_logs')
        .select('*, log_images(image_url), log_responsible(*)')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return data ? transformLogFromDB(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Crear un log
  async create(log: Partial<OperationalLog>, unitId: string): Promise<OperationalLog> {
    try {
      const logData = transformLogToDB(log, unitId);

      const { data, error } = await supabase
        .from('operational_logs')
        .insert(logData)
        .select()
        .single();

      if (error) throw error;

      // Hacer operaciones en paralelo para mejorar rendimiento
      const promises: Promise<any>[] = [];

      // Insertar imágenes si existen (en paralelo)
      if (log.images && log.images.length > 0) {
        promises.push(
          supabase.from('log_images').insert(
            log.images.map(url => ({
              operational_log_id: data.id,
              image_url: url,
            }))
          )
        );
      }

      // Personal va a resource_id; equipo de gestión a management_staff_id.
      // Guardar un supervisor como resource_id rompe log_responsible_resource_id_fkey.
      if (log.responsibleIds && log.responsibleIds.length > 0) {
        promises.push(replaceLogResponsibles(data.id, log.responsibleIds));
      }

      // Ejecutar todas las operaciones en paralelo
      if (promises.length > 0) {
        await Promise.all(promises);
      }

      // Recargar el log completo para obtener los responsables guardados
      return await this.getById(data.id) || {
        id: data.id,
        date: data.date,
        type: data.type as any,
        description: data.description,
        author: data.author,
        images: log.images || [],
        responsibleIds: log.responsibleIds || [],
      } as OperationalLog;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar un log
  async update(id: string, log: Partial<OperationalLog>): Promise<OperationalLog> {
    try {
      const logData = transformLogToDB(log);

      const { error } = await supabase
        .from('operational_logs')
        .update(logData)
        .eq('id', id);

      if (error) throw error;

      // Hacer operaciones en paralelo para mejorar rendimiento
      const promises: Promise<any>[] = [];

      // Actualizar imágenes si se proporcionan
      if (log.images !== undefined) {
        promises.push(
          supabase.from('log_images').delete().eq('operational_log_id', id).then(() => {
            if (log.images && log.images.length > 0) {
              return supabase.from('log_images').insert(
                log.images.map(url => ({
                  operational_log_id: id,
                  image_url: url,
                }))
              );
            }
          })
        );
      }

      if (log.responsibleIds !== undefined) {
        promises.push(replaceLogResponsibles(id, log.responsibleIds));
      }

      // Ejecutar todas las operaciones en paralelo
      if (promises.length > 0) {
        await Promise.all(promises);
      }

      // Recargar el log completo para obtener los responsables guardados
      return await this.getById(id) || log as OperationalLog;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar un log
  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('operational_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar todos los logs de una unidad
  async deleteByUnitId(unitId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('operational_logs')
        .delete()
        .eq('unit_id', unitId);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function transformLogFromDB(data: any): OperationalLog {
  return {
    id: data.id,
    date: data.date,
    type: data.type as any,
    description: data.description,
    author: data.author,
    images: data.log_images?.map((img: any) => img.image_url) || [],
    responsibleIds: data.log_responsible?.map((r: any) => r.resource_id || r.management_staff_id).filter(Boolean) || [],
  };
}

function transformLogToDB(log: Partial<OperationalLog>, unitId?: string): any {
  return {
    unit_id: unitId,
    date: log.date,
    type: log.type,
    description: log.description,
    author: log.author,
  };
}

