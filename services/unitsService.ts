import { supabase, handleSupabaseError } from './supabase';
import { Unit, UnitStatus } from '../types';
import { resourcesService } from './resourcesService';
import { logsService } from './logsService';
import { requestsService } from './requestsService';
import { zonesService } from './zonesService';
import { auditService } from './auditService';

// Tipos para la base de datos
interface UnitRow {
  id: string;
  name: string;
  client_name: string;
  address: string;
  status: string;
  description?: string;
  coordinator_id?: string;
  roving_supervisor_id?: string;
  resident_supervisor_id?: string;
  created_at?: string;
  updated_at?: string;
}

// ============================================
// CRUD PARA UNITS
// ============================================

export const unitsService = {
  // Obtener todas las unidades
  async getAll(): Promise<Unit[]> {
    try {
      console.log('🔍 Obteniendo unidades de la base de datos...');
      const { data, error } = await supabase
        .from('units')
        .select(`
          *,
          coordinator:management_staff!units_coordinator_id_fkey(*),
          roving_supervisor:management_staff!units_roving_supervisor_id_fkey(*),
          resident_supervisor:management_staff!units_resident_supervisor_id_fkey(*),
          unit_images(*),
          blueprint_layers(*),
          zones(*),
          compliance_history(*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error al obtener unidades:', error);
        console.error('Código de error:', error.code);
        console.error('Mensaje:', error.message);
        throw error;
      }

      console.log(`📊 Unidades encontradas en BD: ${data?.length || 0}`);

      if (!data || data.length === 0) {
        console.warn('⚠️ No se encontraron unidades en la base de datos');
        return [];
      }

      // Cargar datos relacionados para cada unidad
      console.log('🔄 Cargando datos relacionados (recursos, logs, requests, zones, imágenes)...');
      const units = await Promise.all(
        data.map(async (unitData) => {
          try {
            const [resources, logs, requests, zones] = await Promise.all([
              resourcesService.getByUnitId(unitData.id).catch(err => {
                console.warn(`⚠️ Error al cargar recursos para unidad ${unitData.id}:`, err);
                return [];
              }),
              logsService.getByUnitId(unitData.id).catch(err => {
                console.warn(`⚠️ Error al cargar logs para unidad ${unitData.id}:`, err);
                return [];
              }),
              requestsService.getByUnitId(unitData.id).catch(err => {
                console.warn(`⚠️ Error al cargar requests para unidad ${unitData.id}:`, err);
                return [];
              }),
              zonesService.getByUnitId(unitData.id).catch(err => {
                console.warn(`⚠️ Error al cargar zones para unidad ${unitData.id}:`, err);
                return [];
              }),
            ]);

            const transformed = transformUnitFromDB(unitData, resources, logs, requests, zones);
            console.log(`✅ Unidad ${unitData.name}: ${transformed.images.length} imágenes, ${transformed.logs.length} logs, ${transformed.resources.length} recursos`);
            return transformed;
          } catch (err) {
            console.error(`❌ Error al transformar unidad ${unitData.id}:`, err);
            // Retornar unidad básica sin datos relacionados
            return transformUnitFromDB(unitData, [], [], [], []);
          }
        })
      );

      return units;
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener una unidad por ID
  async getById(id: string): Promise<Unit | null> {
    try {
      const { data, error } = await supabase
        .from('units')
        .select(`
          *,
          coordinator:management_staff!units_coordinator_id_fkey(*),
          roving_supervisor:management_staff!units_roving_supervisor_id_fkey(*),
          resident_supervisor:management_staff!units_resident_supervisor_id_fkey(*),
          unit_images(*),
          blueprint_layers(*),
          zones(*),
          compliance_history(*)
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // No encontrado
        throw error;
      }

      if (!data) return null;

      // Cargar datos relacionados
      const [resources, logs, requests, zones] = await Promise.all([
        resourcesService.getByUnitId(data.id),
        logsService.getByUnitId(data.id),
        requestsService.getByUnitId(data.id),
        zonesService.getByUnitId(data.id),
      ]);

      return transformUnitFromDB(data, resources, logs, requests, zones);
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Crear una nueva unidad
  async create(unit: Partial<Unit>): Promise<Unit> {
    try {
      const unitData = transformUnitToDB(unit);

      const { data, error } = await supabase
        .from('units')
        .insert(unitData)
        .select()
        .single();

      if (error) throw error;

      // Insertar imágenes si existen
      if (unit.images && unit.images.length > 0) {
        await supabase.from('unit_images').insert(
          unit.images.map((url, index) => ({
            unit_id: data.id,
            image_url: url,
            display_order: index,
          }))
        );
      }

      // Insertar blueprint layers si existen
      if (unit.blueprintLayers && unit.blueprintLayers.length > 0) {
        await supabase.from('blueprint_layers').insert(
          unit.blueprintLayers.map((layer) => ({
            unit_id: data.id,
            name: layer.name,
          }))
        );
      }

      // Insertar historial de cumplimiento si existe
      if (unit.complianceHistory && unit.complianceHistory.length > 0) {
        await supabase.from('compliance_history').insert(
          unit.complianceHistory.map((item) => ({
            unit_id: data.id,
            month: item.month,
            score: item.score,
          }))
        );
      }

      const createdUnit = await this.getById(data.id);
      return createdUnit!;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar una unidad
  async update(id: string, unit: Partial<Unit>, skipAuditLog: boolean = false): Promise<Unit> {
    try {
      // Obtener la unidad antes de actualizar para el log (solo si vamos a registrar)
      const oldUnit = skipAuditLog ? null : await this.getById(id);
      
      const unitData = transformUnitToDB(unit);

      const { error } = await supabase
        .from('units')
        .update(unitData)
        .eq('id', id);

      if (error) throw error;

      // Actualizar imágenes si se proporcionan
      if (unit.images !== undefined) {
        console.log(`📸 Actualizando imágenes para unidad ${id}:`, unit.images);
        
        // Eliminar imágenes existentes
        const { error: deleteError } = await supabase.from('unit_images').delete().eq('unit_id', id);
        if (deleteError) {
          console.error('❌ Error al eliminar imágenes existentes:', deleteError);
          throw new Error(`Error al eliminar imágenes existentes: ${deleteError.message}`);
        }
        console.log('✅ Imágenes existentes eliminadas');
        
        // Insertar nuevas imágenes
        if (unit.images.length > 0) {
          // Filtrar blob URLs (no deberían llegar aquí, pero por si acaso)
          const validImages = unit.images.filter(url => {
            if (url.startsWith('blob:')) {
              console.warn('⚠️ Se intentó guardar un blob URL, omitiendo:', url);
              return false;
            }
            return true;
          });
          
          if (validImages.length > 0) {
            const imageRecords = validImages.map((url, index) => ({
              unit_id: id,
              image_url: url,
              display_order: index,
            }));
            
            console.log(`📤 Insertando ${imageRecords.length} imágenes:`, imageRecords);
            const { data: insertData, error: insertError } = await supabase
              .from('unit_images')
              .insert(imageRecords)
              .select();
            
            if (insertError) {
              console.error('❌ Error al insertar imágenes:', insertError);
              throw new Error(`Error al insertar imágenes: ${insertError.message}`);
            }
            
            console.log('✅ Imágenes insertadas correctamente:', insertData);
          } else {
            console.warn('⚠️ No hay imágenes válidas para guardar (todas eran blob URLs)');
          }
        } else {
          console.log('ℹ️ No hay imágenes para insertar (array vacío)');
        }
      }

      // Actualizar recursos si se proporcionan
      if (unit.resources !== undefined) {
        const { resourcesService } = await import('./resourcesService');
        
        // Actualizar cada recurso
        for (const resource of unit.resources) {
          if (resource.id) {
            await resourcesService.update(resource.id, resource);
          }
        }
      }

      const updatedUnit = await this.getById(id);
      if (!updatedUnit) throw new Error('Unidad no encontrada');

      // Registrar en auditoría solo si no se omite explícitamente (para evitar logs de actualizaciones optimistas)
      if (!skipAuditLog && oldUnit) {
        // Verificar si hay cambios en campos principales
        const hasFieldChanges = 
          oldUnit.name !== updatedUnit.name ||
          oldUnit.clientName !== updatedUnit.clientName ||
          oldUnit.address !== updatedUnit.address ||
          oldUnit.status !== updatedUnit.status;
        
        // Verificar si hay cambios en imágenes
        const oldImagesCount = oldUnit.images?.length || 0;
        const newImagesCount = updatedUnit.images?.length || 0;
        const hasImageChanges = oldImagesCount !== newImagesCount || 
          (unit.images !== undefined && JSON.stringify(oldUnit.images) !== JSON.stringify(updatedUnit.images));
        
        // Verificar si hay cambios en recursos
        const oldResourcesCount = oldUnit.resources?.length || 0;
        const newResourcesCount = updatedUnit.resources?.length || 0;
        const hasResourceChanges = oldResourcesCount !== newResourcesCount;
        
        // Registrar log si hay cualquier cambio (campos, imágenes o recursos)
        if (hasFieldChanges || hasImageChanges || hasResourceChanges) {
          const changeDescription = [];
          if (hasFieldChanges) changeDescription.push('campos principales');
          if (hasImageChanges) changeDescription.push(`${newImagesCount} imagen(es)`);
          if (hasResourceChanges) changeDescription.push('recursos');
          
          await auditService.log({
            actionType: 'UPDATE',
            entityType: 'UNIT',
            entityId: updatedUnit.id,
            entityName: updatedUnit.name,
            description: `Unidad "${updatedUnit.name}" actualizada (${changeDescription.join(', ')})`,
            changes: {
              before: {
                name: oldUnit.name,
                clientName: oldUnit.clientName,
                address: oldUnit.address,
                status: oldUnit.status,
                imagesCount: oldImagesCount,
                resourcesCount: oldResourcesCount,
              },
              after: {
                name: updatedUnit.name,
                clientName: updatedUnit.clientName,
                address: updatedUnit.address,
                status: updatedUnit.status,
                imagesCount: newImagesCount,
                resourcesCount: newResourcesCount,
              },
              fields: Object.keys(unitData),
            },
          });
        }
      }

      return updatedUnit;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar una unidad
  async delete(id: string): Promise<void> {
    try {
      // Obtener la unidad antes de eliminar para el log
      const unit = await this.getById(id);
      
      const { error } = await supabase
        .from('units')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Registrar en auditoría
      if (unit) {
        await auditService.log({
          actionType: 'DELETE',
          entityType: 'UNIT',
          entityId: unit.id,
          entityName: unit.name,
          description: `Unidad "${unit.name}" eliminada`,
          changes: {
            before: {
              name: unit.name,
              clientName: unit.clientName,
              address: unit.address,
              status: unit.status,
            },
          },
        });
      }
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function transformUnitFromDB(
  data: any,
  resources: any[] = [],
  logs: any[] = [],
  requests: any[] = [],
  zones: any[] = []
): Unit {
  return {
    id: data.id,
    name: data.name,
    clientName: data.client_name,
    address: data.address,
    status: data.status as UnitStatus,
    description: data.description,
    // Filtrar blob URLs (no deberían estar en la BD, pero por si acaso) y ordenar por display_order
    images: (data.unit_images
      ?.filter((img: any) => {
        // Filtrar blob URLs
        if (img.image_url && img.image_url.startsWith('blob:')) {
          console.warn('⚠️ Se encontró un blob URL en la BD, omitiendo:', img.image_url);
          return false;
        }
        return true;
      })
      .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0))
      .map((img: any) => img.image_url) || []),
    blueprintLayers: data.blueprint_layers?.map((layer: any) => ({
      id: layer.id,
      name: layer.name,
    })) || [],
    zones: zones.length > 0 ? zones : (data.zones?.map(transformZoneFromDB) || []),
    resources,
    logs,
    requests,
    complianceHistory: data.compliance_history?.map((item: any) => ({
      month: item.month,
      score: Number(item.score),
    })) || [],
    coordinator: data.coordinator ? {
      id: data.coordinator.id,
      name: data.coordinator.name,
      email: data.coordinator.email,
      phone: data.coordinator.phone,
      photo: data.coordinator.photo,
    } : undefined,
    rovingSupervisor: data.roving_supervisor ? {
      id: data.roving_supervisor.id,
      name: data.roving_supervisor.name,
      email: data.roving_supervisor.email,
      phone: data.roving_supervisor.phone,
      photo: data.roving_supervisor.photo,
    } : undefined,
    residentSupervisor: data.resident_supervisor ? {
      id: data.resident_supervisor.id,
      name: data.resident_supervisor.name,
      email: data.resident_supervisor.email,
      phone: data.resident_supervisor.phone,
      photo: data.resident_supervisor.photo,
    } : undefined,
  };
}

function transformUnitToDB(unit: Partial<Unit>): Partial<UnitRow> {
  return {
    name: unit.name,
    client_name: unit.clientName,
    address: unit.address,
    status: unit.status,
    description: unit.description,
    coordinator_id: unit.coordinator?.id,
    roving_supervisor_id: unit.rovingSupervisor?.id,
    resident_supervisor_id: unit.residentSupervisor?.id,
  };
}

function transformZoneFromDB(zone: any) {
  return {
    id: zone.id,
    name: zone.name,
    shifts: [], // Se cargan por separado
    area: zone.area ? Number(zone.area) : undefined,
    layout: zone.layout_x ? {
      x: zone.layout_x,
      y: zone.layout_y,
      w: zone.layout_w,
      h: zone.layout_h,
      color: zone.layout_color,
      layerId: zone.layout_layer_id,
    } : undefined,
  };
}

