import { supabase, handleSupabaseError } from './supabase';
import { Unit, UnitStatus, UnitClass } from '../types';
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
  unit_class?: string;
  description?: string;
  coordinator_id?: string;
  roving_supervisor_id?: string;
  resident_supervisor_id?: string;
  latitude?: number;
  longitude?: number;
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
      // Log reducido - solo en desarrollo
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 Obteniendo unidades de la base de datos...');
      }
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
          compliance_history(*),
          unit_management_staff(management_staff_id)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error al obtener unidades:', error);
        console.error('Código de error:', error.code);
        console.error('Mensaje:', error.message);
        throw error;
      }

      // Log reducido - solo en desarrollo
      if (process.env.NODE_ENV === 'development') {
        console.log(`📊 Unidades encontradas en BD: ${data?.length || 0}`);
      }

      if (!data || data.length === 0) {
        console.warn('⚠️ No se encontraron unidades en la base de datos');
        return [];
      }

      // Cargar datos relacionados para cada unidad
      // Log reducido - solo en desarrollo
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Cargando datos relacionados (recursos, logs, requests, zones, imágenes)...');
      }
      const units = await mapWithConcurrency(
        data,
        2,
        async (unitData) => {
          try {
            // Cargar assignedStaff primero
            let assignedStaff: string[] = [];
            try {
              const { data: staffData } = await supabase
                .from('unit_management_staff')
                .select('management_staff_id')
                .eq('unit_id', unitData.id);
              if (staffData) {
                assignedStaff = staffData.map((s: any) => s.management_staff_id);
              }
            } catch (e) {
              // Si la tabla no existe, simplemente usar array vacío
              console.warn('⚠️ Tabla unit_management_staff no encontrada, usando array vacío');
            }

            const [resources, logs, requests, zones, documents] = await Promise.all([
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
              (async () => {
                try {
                  const { documentsService } = await import('./documentsService');
                  return await documentsService.getByUnitId(unitData.id);
                } catch (err) {
                  console.warn(`⚠️ Error al cargar documentos para unidad ${unitData.id}:`, err);
                  return [];
                }
              })(),
            ]);

            const transformed = transformUnitFromDB(unitData, resources, logs, requests, zones, assignedStaff, documents);
            // Log reducido - solo en desarrollo
            if (process.env.NODE_ENV === 'development') {
              console.log(`✅ Unidad ${unitData.name}: ${transformed.images.length} imágenes, ${transformed.logs.length} logs, ${transformed.resources.length} recursos`);
            }
            return transformed;
          } catch (err) {
            console.error(`❌ Error al transformar unidad ${unitData.id}:`, err);
            // Retornar unidad básica sin datos relacionados
            return transformUnitFromDB(unitData, [], [], [], [], [], []);
          }
        }
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
          compliance_history(*),
          unit_management_staff(management_staff_id)
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // No encontrado
        throw error;
      }

      if (!data) return null;

      // Cargar staff asignado adicional
      let assignedStaff: string[] = [];
      try {
        const { data: staffData } = await supabase
          .from('unit_management_staff')
          .select('management_staff_id')
          .eq('unit_id', data.id);
        if (staffData) {
          assignedStaff = staffData.map((s: any) => s.management_staff_id);
        }
      } catch (e) {
        // Si la tabla no existe, simplemente usar array vacío
        console.warn('⚠️ Tabla unit_management_staff no encontrada, usando array vacío');
      }

      // Cargar datos relacionados
      const [resources, logs, requests, zones, documents] = await Promise.all([
        resourcesService.getByUnitId(data.id),
        logsService.getByUnitId(data.id),
        requestsService.getByUnitId(data.id),
        zonesService.getByUnitId(data.id),
        (async () => {
          try {
            const { documentsService } = await import('./documentsService');
            return await documentsService.getByUnitId(data.id);
          } catch (err) {
            console.warn(`⚠️ Error al cargar documentos para unidad ${data.id}:`, err);
            return [];
          }
        })(),
      ]);

      return transformUnitFromDB(data, resources, logs, requests, zones, assignedStaff, documents);
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
    let oldUnit: Unit | null = null;
    
    try {
      // Obtener la unidad antes de actualizar para el log (solo si vamos a registrar)
      // Si falla, continuar sin el log (no es crítico)
      if (!skipAuditLog) {
        try {
          oldUnit = await this.getById(id);
        } catch (getError: any) {
          console.warn('⚠️ No se pudo obtener unidad antes de actualizar (para log). Continuando...', getError);
          // Continuar sin oldUnit - el log de auditoría se omitirá
        }
      }
      
      const unitData = transformUnitToDB(unit);

      const { error } = await supabase
        .from('units')
        .update(unitData)
        .eq('id', id);

      if (error) throw error;

      // Actualizar imágenes SOLO si se proporcionan explícitamente Y realmente han cambiado
      // Para evitar perder imágenes cuando se actualiza solo un campo (como recursos, zonas, etc.)
      if (unit.images !== undefined) {
        console.log(`📸 Verificando imágenes para unidad ${id}:`, unit.images);
        
        // Obtener imágenes actuales de la base de datos para comparar
        const { data: currentImages } = await supabase
          .from('unit_images')
          .select('image_url')
          .eq('unit_id', id)
          .order('display_order');
        
        const currentImageUrls = (currentImages?.map(img => img.image_url) || []).filter(url => !url.startsWith('blob:'));
        const newImageUrls = unit.images.filter(url => !url.startsWith('blob:'));
        
        // Normalizar arrays para comparación (ordenar y eliminar duplicados)
        const normalizeUrls = (urls: string[]) => [...new Set(urls)].sort();
        const currentNormalized = normalizeUrls(currentImageUrls);
        const newNormalized = normalizeUrls(newImageUrls);
        
        // Solo actualizar si las imágenes realmente cambiaron
        const imagesChanged = JSON.stringify(currentNormalized) !== JSON.stringify(newNormalized);
        
        if (imagesChanged) {
          console.log('🔄 Las imágenes han cambiado, actualizando...');
          console.log('  Antes:', currentNormalized);
          console.log('  Después:', newNormalized);
          
          // Eliminar imágenes existentes
          const { error: deleteError } = await supabase.from('unit_images').delete().eq('unit_id', id);
          if (deleteError) {
            console.error('❌ Error al eliminar imágenes existentes:', deleteError);
            throw new Error(`Error al eliminar imágenes existentes: ${deleteError.message}`);
          }
          console.log('✅ Imágenes existentes eliminadas');
          
          // Insertar nuevas imágenes
          if (newImageUrls.length > 0) {
            const imageRecords = newImageUrls.map((url, index) => ({
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
            console.log('ℹ️ No hay imágenes para insertar (array vacío)');
          }
        } else {
          console.log('ℹ️ Las imágenes no han cambiado, preservando imágenes existentes');
        }
      }

      // Actualizar recursos si se proporcionan
      if (unit.resources !== undefined) {
        const { resourcesService } = await import('./resourcesService');
        
        // Actualizar cada recurso
        // IMPORTANTE: Excluir assignedAssets, trainings, workSchedule y assignedZones del objeto de actualización
        // cuando se actualiza la unidad completa, para evitar duplicaciones o sobrescrituras con datos incompletos.
        // Las zonas se persisten solo vía resourcesService.update/create cuando el cliente guarda un recurso explícitamente.
        for (const resource of unit.resources) {
          if (resource.id) {
            // Separar los campos relacionados que se manejan por separado
            const { assignedAssets, trainings, workSchedule, assignedZones, ...resourceData } = resource;
            
            // Solo actualizar el recurso base (sin campos relacionados)
            // Esto evita que se actualicen innecesariamente los activos cuando solo se cambian otros campos
            await resourcesService.update(resource.id, resourceData);
          }
        }
      }

      // Actualizar staff asignado si se proporciona
      if (unit.assignedStaff !== undefined) {
        try {
          // Eliminar relaciones existentes
          const { error: deleteError } = await supabase
            .from('unit_management_staff')
            .delete()
            .eq('unit_id', id);
          
          if (deleteError) {
            // Si la tabla no existe, solo registrar un warning
            if (deleteError.code === '42P01') {
              console.warn('⚠️ Tabla unit_management_staff no existe. Ejecute el script SQL para crearla.');
            } else {
              console.error('❌ Error al eliminar staff asignado:', deleteError);
              throw new Error(`Error al eliminar staff asignado: ${deleteError.message}`);
            }
          }

          // Insertar nuevas relaciones
          if (unit.assignedStaff.length > 0) {
            const staffRecords = unit.assignedStaff.map(staffId => ({
              unit_id: id,
              management_staff_id: staffId,
            }));

            const { error: insertError } = await supabase
              .from('unit_management_staff')
              .insert(staffRecords);

            if (insertError) {
              // Si la tabla no existe, solo registrar un warning
              if (insertError.code === '42P01') {
                console.warn('⚠️ Tabla unit_management_staff no existe. Ejecute el script SQL para crearla.');
              } else {
                console.error('❌ Error al insertar staff asignado:', insertError);
                throw new Error(`Error al insertar staff asignado: ${insertError.message}`);
              }
            }
          }
        } catch (e: any) {
          // Si la tabla no existe, solo registrar un warning y continuar
          if (e.code === '42P01' || e.message?.includes('does not exist')) {
            console.warn('⚠️ Tabla unit_management_staff no existe. Ejecute el script SQL para crearla.');
          } else {
            throw e;
          }
        }
      }

      // Intentar obtener la unidad actualizada con reintentos en caso de error de red
      let updatedUnit: Unit | null = null;
      let retries = 3;
      let lastError: any = null;
      
      while (retries > 0 && !updatedUnit) {
        try {
          updatedUnit = await this.getById(id);
          if (updatedUnit) break;
        } catch (getError: any) {
          lastError = getError;
          console.warn(`⚠️ Error al obtener unidad actualizada (intentos restantes: ${retries - 1}):`, getError);
          
          // Si es un error de red, esperar un poco antes de reintentar
          if (getError.message?.includes('Failed to fetch') || getError.message?.includes('ERR_FAILED') || getError.name === 'TypeError') {
            retries--;
            if (retries > 0) {
              console.log(`🔄 Reintentando en 1 segundo... (${retries} intentos restantes)`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } else {
            // Si no es error de red, no reintentar
            break;
          }
        }
      }
      
      if (!updatedUnit) {
        // Si no pudimos obtener la unidad actualizada, intentar construirla desde los datos que tenemos
        console.warn('⚠️ No se pudo obtener unidad actualizada después de actualizar. Construyendo desde datos locales...');
        
        // Construir unidad básica desde los datos que tenemos
        const fallbackUnit: Unit = {
          ...unit as Unit,
          id,
          name: unit.name || 'Unidad sin nombre',
          clientName: unit.clientName || '',
          address: unit.address || '',
          status: unit.status || UnitStatus.ACTIVE,
          resources: unit.resources || [],
          logs: unit.logs || [],
          requests: unit.requests || [],
          zones: unit.zones || [],
          images: unit.images || [],
          blueprintLayers: unit.blueprintLayers || [],
          complianceHistory: unit.complianceHistory || [],
          requiredPositions: unit.requiredPositions || [],
          documents: unit.documents || [],
          assignedStaff: unit.assignedStaff || [],
        };
        
        // Si tenemos oldUnit, usar sus datos como base
        if (oldUnit) {
          updatedUnit = {
            ...oldUnit,
            ...fallbackUnit,
          };
        } else {
          updatedUnit = fallbackUnit;
        }
        
        console.warn('⚠️ Usando unidad construida desde datos locales. Algunos datos pueden estar desactualizados.');
      }

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
      if (!unit) {
        throw new Error('Unidad no encontrada');
      }

      // Obtener todos los recursos de la unidad
      const resources = await resourcesService.getByUnitId(id, true); // Incluir archivados
      
      // Eliminar registros relacionados en maintenance_responsible y maintenance_records para cada recurso
      for (const resource of resources) {
        try {
          // Eliminar registros de maintenance_responsible que referencian este recurso
          const { error: maintenanceError } = await supabase
            .from('maintenance_responsible')
            .delete()
            .eq('resource_id', resource.id);
          
          if (maintenanceError && maintenanceError.code !== '42P01') {
            // Si la tabla no existe (42P01), continuar; de lo contrario, lanzar error
            console.warn(`⚠️ Error al eliminar maintenance_responsible para recurso ${resource.id}:`, maintenanceError);
          }
        } catch (err) {
          console.warn(`⚠️ Error al eliminar maintenance_responsible para recurso ${resource.id}:`, err);
          // Continuar con la eliminación aunque falle esto
        }

        try {
          // Obtener maintenance_records para este recurso
          const { data: maintenanceRecords } = await supabase
            .from('maintenance_records')
            .select('id')
            .eq('resource_id', resource.id);

          if (maintenanceRecords && maintenanceRecords.length > 0) {
            const recordIds = maintenanceRecords.map(r => r.id);
            
            // Eliminar maintenance_images asociadas
            await supabase
              .from('maintenance_images')
              .delete()
              .in('maintenance_record_id', recordIds);
            
            // Eliminar maintenance_records
            await supabase
              .from('maintenance_records')
              .delete()
              .eq('resource_id', resource.id);
          }
        } catch (err) {
          console.warn(`⚠️ Error al eliminar maintenance_records para recurso ${resource.id}:`, err);
          // Continuar con la eliminación aunque falle esto
        }
      }

      // Eliminar recursos de la unidad
      for (const resource of resources) {
        try {
          await resourcesService.delete(resource.id);
        } catch (err) {
          console.warn(`⚠️ Error al eliminar recurso ${resource.id}:`, err);
          // Continuar con la eliminación aunque falle algún recurso
        }
      }

      // Eliminar otros datos relacionados
      try {
        // Eliminar logs
        await logsService.deleteByUnitId(id);
      } catch (err) {
        console.warn(`⚠️ Error al eliminar logs de unidad ${id}:`, err);
      }

      try {
        // Eliminar requests
        await requestsService.deleteByUnitId(id);
      } catch (err) {
        console.warn(`⚠️ Error al eliminar requests de unidad ${id}:`, err);
      }

      try {
        // Eliminar zones
        await zonesService.deleteByUnitId(id);
      } catch (err) {
        console.warn(`⚠️ Error al eliminar zones de unidad ${id}:`, err);
      }

      try {
        // Eliminar imágenes de la unidad
        await supabase.from('unit_images').delete().eq('unit_id', id);
      } catch (err) {
        console.warn(`⚠️ Error al eliminar imágenes de unidad ${id}:`, err);
      }

      try {
        // Eliminar blueprint layers
        await supabase.from('blueprint_layers').delete().eq('unit_id', id);
      } catch (err) {
        console.warn(`⚠️ Error al eliminar blueprint layers de unidad ${id}:`, err);
      }

      try {
        // Eliminar compliance history
        await supabase.from('compliance_history').delete().eq('unit_id', id);
      } catch (err) {
        console.warn(`⚠️ Error al eliminar compliance history de unidad ${id}:`, err);
      }

      try {
        // Eliminar unit_management_staff
        await supabase.from('unit_management_staff').delete().eq('unit_id', id);
      } catch (err) {
        console.warn(`⚠️ Error al eliminar unit_management_staff de unidad ${id}:`, err);
      }

      try {
        // Eliminar documentos de la unidad
        const { documentsService } = await import('./documentsService');
        await documentsService.deleteByUnitId(id);
      } catch (err) {
        console.warn(`⚠️ Error al eliminar documentos de unidad ${id}:`, err);
      }

      // Finalmente, eliminar la unidad
      const { error } = await supabase
        .from('units')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Registrar en auditoría
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
  zones: any[] = [],
  assignedStaff: string[] = [],
  documents: any[] = []
): Unit {
  return {
    id: data.id,
    name: data.name,
    clientName: data.client_name,
    address: data.address,
    status: data.status as UnitStatus,
    unitClass: (data.unit_class === 'BPO' ? 'BPO' : 'STANDARD') as UnitClass,
    description: data.description,
    latitude: data.latitude ? Number(data.latitude) : undefined,
    longitude: data.longitude ? Number(data.longitude) : undefined,
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
    requiredPositions: data.required_positions ? (Array.isArray(data.required_positions) ? data.required_positions : []) : [],
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
    assignedStaff: assignedStaff,
    documents: documents || [],
  };
}

function transformUnitToDB(unit: Partial<Unit>): any {
  const data: any = {
    name: unit.name,
    client_name: unit.clientName,
    address: unit.address,
    status: unit.status,
    description: unit.description,
    coordinator_id: unit.coordinator?.id,
    roving_supervisor_id: unit.rovingSupervisor?.id,
    resident_supervisor_id: unit.residentSupervisor?.id,
    latitude: unit.latitude,
    longitude: unit.longitude,
  };

  if (unit.unitClass !== undefined) {
    data.unit_class = unit.unitClass;
  }
  
  // Incluir required_positions si está definido
  if (unit.requiredPositions !== undefined) {
    data.required_positions = unit.requiredPositions;
  }
  
  return data;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
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

