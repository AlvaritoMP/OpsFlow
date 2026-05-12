import { supabase, handleSupabaseError } from './supabase';
import { Resource, ResourceType, Training, AssignedAsset, DailyShift, MaintenanceRecord } from '../types';

// ============================================
// CRUD PARA RESOURCES
// ============================================

export const resourcesService = {
  // Obtener todos los recursos de una unidad (excluyendo archivados por defecto)
  async getByUnitId(unitId: string, includeArchived: boolean = false): Promise<Resource[]> {
    try {
      let query = supabase
        .from('resources')
        .select('*')
        .eq('unit_id', unitId);
      
      // Si no se incluyen archivados, filtrarlos (solo para Personal)
      if (!includeArchived) {
        query = query.or('archived.is.null,archived.eq.false,type.neq.Personal');
      }
      
      const { data, error } = await query
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Cargar datos relacionados para cada recurso
      const resources = await mapWithConcurrency(
        data,
        4,
        async (resource) => {
          const [trainings, assets, shifts, maintenance, zoneAssignments, contractHistory] = await Promise.all([
            this.getTrainings(resource.id),
            this.getAssignedAssets(resource.id),
            this.getDailyShifts(resource.id),
            this.getMaintenanceRecords(resource.id),
            this.getZoneAssignments(resource.id),
            this.getContractHistory(resource.id),
          ]);

          const transformed = transformResourceFromDB(resource, trainings, assets, shifts, maintenance, zoneAssignments);
          return {
            ...transformed,
            contractHistory: contractHistory,
          };
        }
      );

      return resources;
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener solo personal archivado de una unidad
  async getArchivedPersonnel(unitId: string): Promise<Resource[]> {
    try {
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .eq('unit_id', unitId)
        .eq('type', 'Personal')
        .eq('archived', true)
        .order('end_date', { ascending: false });

      if (error) throw error;

      const resources = await mapWithConcurrency(
        data,
        4,
        async (resource) => {
          const [trainings, assets, shifts, maintenance, zoneAssignments, contractHistory] = await Promise.all([
            this.getTrainings(resource.id),
            this.getAssignedAssets(resource.id),
            this.getDailyShifts(resource.id),
            this.getMaintenanceRecords(resource.id),
            this.getZoneAssignments(resource.id),
            this.getContractHistory(resource.id),
          ]);

          const transformed = transformResourceFromDB(resource, trainings, assets, shifts, maintenance, zoneAssignments);
          return {
            ...transformed,
            contractHistory: contractHistory,
          };
        }
      );

      return resources;
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener todos los trabajadores archivados/cesados de todas las unidades
  // Solo incluir trabajadores que están EXPLÍCITAMENTE archivados (archived = true)
  // O que tienen personnel_status = 'cesado' Y archived = true
  // NO incluir trabajadores activos con solo endDate o solo personnel_status = 'cesado'
  async getAllArchivedPersonnel(): Promise<Array<Resource & { originalUnitId: string; originalUnitName: string }>> {
    try {
      const { data, error } = await supabase
        .from('resources')
        .select(`
          *,
          unit:units!resources_unit_id_fkey(id, name)
        `)
        .eq('type', 'Personal')
        .eq('archived', true) // Solo trabajadores explícitamente archivados
        .order('end_date', { ascending: false });

      if (error) throw error;

      const resources = await mapWithConcurrency(
        data,
        4,
        async (resource: any) => {
          const [trainings, assets, shifts, maintenance, zoneAssignments] = await Promise.all([
            this.getTrainings(resource.id),
            this.getAssignedAssets(resource.id),
            this.getDailyShifts(resource.id),
            this.getMaintenanceRecords(resource.id),
            this.getZoneAssignments(resource.id),
          ]);

          const transformed = transformResourceFromDB(resource, trainings, assets, shifts, maintenance, zoneAssignments);
          return {
            ...transformed,
            originalUnitId: resource.unit_id,
            originalUnitName: resource.unit?.name || 'Unidad desconocida',
          };
        }
      );

      return resources;
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener un recurso por ID
  async getById(id: string): Promise<Resource | null> {
    try {
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      const [trainings, assets, shifts, maintenance, zoneAssignments, contractHistory] = await Promise.all([
        this.getTrainings(id),
        this.getAssignedAssets(id),
        this.getDailyShifts(id),
        this.getMaintenanceRecords(id),
        this.getZoneAssignments(id),
        this.getContractHistory(id),
      ]);

      const transformed = transformResourceFromDB(data, trainings, assets, shifts, maintenance, zoneAssignments);
      return {
        ...transformed,
        contractHistory: contractHistory,
      };
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Crear un recurso
  async create(resource: Partial<Resource>, unitId: string): Promise<Resource> {
    try {
      const resourceData = transformResourceToDB(resource, unitId);

      const { data, error } = await supabase
        .from('resources')
        .insert(resourceData)
        .select()
        .single();

      if (error) throw error;

      // Insertar datos relacionados
      if (resource.trainings) {
        await this.createTrainings(data.id, resource.trainings);
      }
      if (resource.assignedAssets) {
        await this.createAssignedAssets(data.id, resource.assignedAssets);
      }
      if (resource.workSchedule) {
        await this.createDailyShifts(data.id, resource.workSchedule);
      }
      if (resource.assignedZones) {
        await this.createZoneAssignments(data.id, resource.assignedZones);
      }

      // Si es personal y tiene startDate y endDate, crear contrato inicial
      if (resource.type === ResourceType.PERSONNEL && resource.startDate && resource.endDate) {
        try {
          const { contractService } = await import('./contractService');
          await contractService.createContract(data.id, resource.startDate, resource.endDate);
        } catch (error) {
          console.error('Error al crear contrato inicial:', error);
          // No lanzar error, solo registrar
        }
      }

      return await this.getById(data.id) || resource as Resource;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar un recurso
  async update(id: string, resource: Partial<Resource>, newUnitId?: string): Promise<Resource> {
    try {
      const resourceData = transformResourceToDB(resource, newUnitId);
      
      // Log detallado para debugging de ceses
      if (resource.personnelStatus) {
        console.log('🔍 [resourcesService.update] Actualizando trabajador:', {
          id,
          personnelStatus: resource.personnelStatus,
          archived: resource.archived,
          endDate: resource.endDate,
          resourceData: resourceData
        });
      }

      if (Object.keys(resourceData).length > 0) {
        const { data: updateResult, error } = await supabase
          .from('resources')
          .update(resourceData)
          .eq('id', id)
          .select(); // Agregar select para verificar que se actualizó

        if (error) {
          console.error('❌ [resourcesService.update] Error al actualizar:', error);
          throw error;
        }
        
        // Verificar que se actualizó correctamente
        if (updateResult && updateResult.length > 0) {
          console.log('✅ [resourcesService.update] Recurso actualizado en BD:', {
            id: updateResult[0].id,
            personnel_status: updateResult[0].personnel_status,
            archived: updateResult[0].archived,
            end_date: updateResult[0].end_date
          });
        } else {
          console.warn('⚠️ [resourcesService.update] No se encontró el recurso después de actualizar');
        }
      }

      // Actualizar workSchedule (turnos) si se proporcionan
      if (resource.workSchedule !== undefined) {
        console.log(`🔄 Actualizando ${resource.workSchedule.length} turnos para recurso ${id}`);
        
        // Eliminar turnos existentes
        const { error: deleteError } = await supabase.from('daily_shifts').delete().eq('resource_id', id);
        if (deleteError) {
          console.error('❌ Error al eliminar turnos existentes:', deleteError);
          throw deleteError;
        }
        
        // Insertar nuevos turnos
        if (resource.workSchedule.length > 0) {
          console.log('📅 Insertando turnos:', resource.workSchedule.map(s => ({ 
            date: s.date, 
            type: s.type,
            hours: s.hours
          })));
          await this.createDailyShifts(id, resource.workSchedule);
        }
      }

      // Actualizar assignedAssets si se proporcionan
      if (resource.assignedAssets !== undefined) {
        console.log(`🔄 Actualizando ${resource.assignedAssets.length} activos para recurso ${id}`);
        
        // Eliminar activos existentes
        const { error: deleteError } = await supabase.from('assigned_assets').delete().eq('resource_id', id);
        if (deleteError) {
          console.error('Error al eliminar activos existentes:', deleteError);
          throw deleteError;
        }
        
        // Insertar nuevos activos
        if (resource.assignedAssets.length > 0) {
          console.log('📦 Insertando activos:', resource.assignedAssets.map(a => ({ 
            name: a.name, 
            constancyCode: a.constancyCode 
          })));
          await this.createAssignedAssets(id, resource.assignedAssets);
        }
      }

      // Actualizar trainings (capacitaciones) si se proporcionan
      if (resource.trainings !== undefined) {
        console.log(`🔄 Actualizando ${resource.trainings.length} capacitaciones para recurso ${id}`);
        
        // Eliminar capacitaciones existentes
        const { error: deleteError } = await supabase.from('trainings').delete().eq('resource_id', id);
        if (deleteError) {
          console.error('Error al eliminar capacitaciones existentes:', deleteError);
          throw deleteError;
        }
        
        // Insertar nuevas capacitaciones
        if (resource.trainings.length > 0) {
          console.log('📚 Insertando capacitaciones:', resource.trainings.map(t => ({ 
            topic: t.topic, 
            date: t.date,
            status: t.status
          })));
          await this.createTrainings(id, resource.trainings);
        }
      }

      // Actualizar zonas asignadas si se proporcionan
      if (resource.assignedZones !== undefined) {
        const { error: deleteError } = await supabase
          .from('resource_zone_assignments')
          .delete()
          .eq('resource_id', id);

        if (deleteError) {
          console.error('Error al eliminar asignaciones de zonas existentes:', deleteError);
          throw deleteError;
        }

        if (resource.assignedZones.length > 0) {
          await this.createZoneAssignments(id, resource.assignedZones);
        }
      }

      return await this.getById(id) || resource as Resource;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar un recurso
  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('resources')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Archivar un trabajador (solo para Personal)
  async archivePersonnel(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('resources')
        .update({ archived: true })
        .eq('id', id)
        .eq('type', 'Personal');

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Desarchivar un trabajador (solo para Personal)
  async unarchivePersonnel(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('resources')
        .update({ archived: false })
        .eq('id', id)
        .eq('type', 'Personal');

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // ============================================
  // MÉTODOS PARA DATOS RELACIONADOS
  // ============================================

  async getTrainings(resourceId: string): Promise<Training[]> {
    try {
      const { data, error } = await supabase
        .from('trainings')
        .select('*')
        .eq('resource_id', resourceId)
        .order('date', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error: any) {
      if (error?.name === 'NetworkError' || error?.message?.includes('Failed to fetch') || error?.message?.includes('ERR_FAILED')) {
        console.warn(`⚠️ Error de red al obtener capacitaciones para ${resourceId}`);
        return [];
      }
      console.error('Error al obtener capacitaciones:', error);
      return [];
    }

    return data?.map(t => ({
      id: t.id,
      topic: t.topic,
      date: t.date,
      status: t.status as 'Completado' | 'Programado' | 'Vencido',
      score: t.score,
      certificateUrl: t.certificate_url,
    })) || [];
  },

  async createTrainings(resourceId: string, trainings: Training[]): Promise<void> {
    await supabase.from('trainings').insert(
      trainings.map(t => ({
        resource_id: resourceId,
        topic: t.topic,
        date: t.date,
        status: t.status,
        score: t.score,
        certificate_url: t.certificateUrl,
      }))
    );
  },

  async getAssignedAssets(resourceId: string): Promise<AssignedAsset[]> {
    try {
      const { data, error } = await supabase
        .from('assigned_assets')
        .select('*')
        .eq('resource_id', resourceId)
        .order('date_assigned', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error: any) {
      if (error?.name === 'NetworkError' || error?.message?.includes('Failed to fetch') || error?.message?.includes('ERR_FAILED')) {
        console.warn(`⚠️ Error de red al obtener activos asignados para ${resourceId}`);
        return [];
      }
      console.error('Error al obtener activos asignados:', error);
      return [];
    }

    if (error) {
      console.error('Error al obtener assigned assets:', error);
      return [];
    }

    const assets = data?.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type as any,
      dateAssigned: a.date_assigned,
      serialNumber: a.serial_number,
      notes: a.notes,
      constancyCode: a.constancy_code || undefined,
      constancyGeneratedAt: a.constancy_generated_at || undefined,
    })) || [];
    
    // Debug: verificar códigos de constancia
    // Logs reducidos - solo en modo debug
    // const withConstancy = assets.filter(a => a.constancyCode);
    // if (withConstancy.length > 0 && process.env.NODE_ENV === 'development') {
    //   console.log(`📄 Activos con constancia para recurso ${resourceId}:`, 
    //     withConstancy.map(a => ({ name: a.name, code: a.constancyCode })));
    // }
    
    return assets;
  },

  async createAssignedAssets(resourceId: string, assets: AssignedAsset[]): Promise<void> {
    const assetsToInsert = assets.map(a => {
      const assetData = {
        resource_id: resourceId,
        name: a.name,
        type: a.type,
        date_assigned: a.dateAssigned,
        serial_number: a.serialNumber,
        phone_number: a.phoneNumber || null,
        notes: a.notes,
        constancy_code: a.constancyCode || null,
        constancy_generated_at: a.constancyGeneratedAt || null,
      };
      
      if (a.constancyCode) {
        console.log(`📄 Activo con constancia: ${a.name} -> Código: ${a.constancyCode}`);
      }
      
      return assetData;
    });
    
    console.log(`💾 Insertando ${assetsToInsert.length} activos para recurso ${resourceId}`);
    const withConstancy = assetsToInsert.filter(a => a.constancy_code);
    if (withConstancy.length > 0) {
      console.log(`📋 ${withConstancy.length} activos con código de constancia:`, 
        withConstancy.map(a => ({ name: a.name, code: a.constancy_code })));
    }
    
    const { data, error } = await supabase.from('assigned_assets').insert(assetsToInsert).select();
    
    if (error) {
      console.error('❌ Error al crear assigned assets:', error);
      throw error;
    }
    
    console.log(`✅ Activos insertados correctamente:`, data?.length || 0);
    if (data) {
      const insertedWithConstancy = data.filter((d: any) => d.constancy_code);
      if (insertedWithConstancy.length > 0) {
        console.log(`✅ Activos con constancia guardados:`, 
          insertedWithConstancy.map((d: any) => ({ name: d.name, code: d.constancy_code })));
      }
    }
  },

  // Limpiar duplicados de activos asignados
  async cleanupDuplicateAssets(): Promise<{ totalDuplicates: number; cleanedResources: number }> {
    try {
      // Obtener todos los activos agrupados por recurso
      const { data: allAssets, error: fetchError } = await supabase
        .from('assigned_assets')
        .select('*')
        .order('resource_id')
        .order('date_assigned', { ascending: false });

      if (fetchError) throw fetchError;
      if (!allAssets || allAssets.length === 0) {
        return { totalDuplicates: 0, cleanedResources: 0 };
      }

      // Agrupar por resource_id
      const assetsByResource = new Map<string, any[]>();
      allAssets.forEach(asset => {
        if (!assetsByResource.has(asset.resource_id)) {
          assetsByResource.set(asset.resource_id, []);
        }
        assetsByResource.get(asset.resource_id)!.push(asset);
      });

      let totalDuplicates = 0;
      let cleanedResources = 0;
      const idsToDelete: string[] = [];

      // Para cada recurso, identificar duplicados
      for (const [resourceId, assets] of assetsByResource.entries()) {
        if (assets.length <= 1) continue; // No hay duplicados si solo hay uno

        // Agrupar por combinación de: name, date_assigned, serial_number
        const uniqueGroups = new Map<string, any[]>();
        
        assets.forEach(asset => {
          // Crear clave única basada en nombre, fecha y serial number
          const key = `${asset.name}|${asset.date_assigned || ''}|${asset.serial_number || ''}`;
          if (!uniqueGroups.has(key)) {
            uniqueGroups.set(key, []);
          }
          uniqueGroups.get(key)!.push(asset);
        });

        // Para cada grupo, si hay más de uno, mantener el más reciente (o el que tiene constancia) y eliminar los demás
        for (const [key, group] of uniqueGroups.entries()) {
          if (group.length > 1) {
            // Ordenar: primero los que tienen constancia, luego por fecha más reciente, luego por id más reciente
            group.sort((a, b) => {
              // Priorizar los que tienen constancia
              if (a.constancy_code && !b.constancy_code) return -1;
              if (!a.constancy_code && b.constancy_code) return 1;
              // Luego por fecha más reciente
              if (a.date_assigned && b.date_assigned) {
                const dateCompare = b.date_assigned.localeCompare(a.date_assigned);
                if (dateCompare !== 0) return dateCompare;
              }
              // Finalmente por id más reciente (asumiendo que los IDs más nuevos son mayores)
              return b.id.localeCompare(a.id);
            });

            // Mantener el primero (el mejor), eliminar los demás
            const toKeep = group[0];
            const toDelete = group.slice(1);
            
            totalDuplicates += toDelete.length;
            idsToDelete.push(...toDelete.map(a => a.id));
            
            if (toDelete.length > 0) {
              cleanedResources++;
              console.log(`🧹 Recurso ${resourceId}: ${toDelete.length} duplicado(s) de "${toKeep.name}" - Manteniendo: ${toKeep.id}, Eliminando: ${toDelete.map(d => d.id).join(', ')}`);
            }
          }
        }
      }

      // Eliminar duplicados en lotes para mejor rendimiento
      if (idsToDelete.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < idsToDelete.length; i += batchSize) {
          const batch = idsToDelete.slice(i, i + batchSize);
          const { error: deleteError } = await supabase
            .from('assigned_assets')
            .delete()
            .in('id', batch);

          if (deleteError) {
            console.error(`❌ Error al eliminar lote de duplicados (${i} a ${i + batch.length}):`, deleteError);
            throw deleteError;
          }
        }

        console.log(`✅ Limpieza completada: ${totalDuplicates} duplicados eliminados de ${cleanedResources} recursos`);
      }

      return { totalDuplicates, cleanedResources };
    } catch (error) {
      console.error('❌ Error al limpiar duplicados:', error);
      handleSupabaseError(error);
      throw error;
    }
  },

  async getDailyShifts(resourceId: string): Promise<DailyShift[]> {
    try {
      const { data, error } = await supabase
        .from('daily_shifts')
        .select('*')
        .eq('resource_id', resourceId)
        .order('date', { ascending: true });
      
      if (error) throw error;
      return data || [];
    } catch (error: any) {
      if (error?.name === 'NetworkError' || error?.message?.includes('Failed to fetch') || error?.message?.includes('ERR_FAILED')) {
        console.warn(`⚠️ Error de red al obtener turnos para ${resourceId}`);
        return [];
      }
      console.error('Error al obtener turnos:', error);
      return [];
    }

    return data?.map(s => ({
      date: s.date,
      type: s.type as any,
      hours: Number(s.hours),
    })) || [];
  },

  async createDailyShifts(resourceId: string, shifts: DailyShift[]): Promise<void> {
    const { error } = await supabase.from('daily_shifts').insert(
      shifts.map(s => ({
        resource_id: resourceId,
        date: s.date,
        type: s.type,
        hours: s.hours,
      }))
    );

    if (error) throw error;
  },

  async upsertDailyShiftsForResource(resourceId: string, shifts: DailyShift[]): Promise<void> {
    if (shifts.length === 0) return;

    const uniqueShifts = [...new Map(shifts.map(shift => [shift.date, shift])).values()];
    const dates = uniqueShifts.map(shift => shift.date);

    const { error: deleteError } = await supabase
      .from('daily_shifts')
      .delete()
      .eq('resource_id', resourceId)
      .in('date', dates);

    if (deleteError) {
      console.error('❌ Error al eliminar turnos existentes:', deleteError);
      throw deleteError;
    }

    const { error: insertError } = await supabase.from('daily_shifts').insert(
      uniqueShifts.map(shift => ({
        resource_id: resourceId,
        date: shift.date,
        type: shift.type,
        hours: shift.hours,
      }))
    );

    if (insertError) {
      console.error('❌ Error al insertar turnos:', insertError);
      throw insertError;
    }
  },

  // Actualizar un solo turno (comportamiento tipo upsert sin depender de índices únicos)
  async upsertDailyShift(resourceId: string, shift: DailyShift): Promise<void> {
    // 1) Eliminar cualquier turno existente para ese recurso y fecha
    const { error: deleteError } = await supabase
      .from('daily_shifts')
      .delete()
      .eq('resource_id', resourceId)
      .eq('date', shift.date);

    if (deleteError) {
      console.error('❌ Error al eliminar turno existente:', deleteError);
      throw deleteError;
    }

    // 2) Insertar el nuevo turno
    const { error: insertError } = await supabase.from('daily_shifts').insert({
      resource_id: resourceId,
      date: shift.date,
      type: shift.type,
      hours: shift.hours,
    });

    if (insertError) {
      console.error('❌ Error al insertar turno:', insertError);
      throw insertError;
    }
  },

  async getMaintenanceRecords(resourceId: string): Promise<MaintenanceRecord[]> {
    try {
      const { data, error } = await supabase
        .from('maintenance_records')
        .select('*, maintenance_images(*)')
        .eq('resource_id', resourceId)
        .order('date', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error: any) {
      if (error?.name === 'NetworkError' || error?.message?.includes('Failed to fetch') || error?.message?.includes('ERR_FAILED')) {
        console.warn(`⚠️ Error de red al obtener registros de mantenimiento para ${resourceId}`);
        return [];
      }
      console.error('Error al obtener registros de mantenimiento:', error);
      return [];
    }

    return data?.map((m) => {
      const images = m.maintenance_images?.map((img: any) => img.image_url) || [];
      return {
        id: m.id,
        date: m.date,
        type: m.type as any,
        description: m.description,
        technician: m.technician,
        cost: m.cost ? Number(m.cost) : undefined,
        status: m.status as 'Realizado' | 'Programado',
        nextScheduledDate: m.next_scheduled_date,
        images,
      };
    }) || [];
  },

  // Obtener historial de contratos para un recurso
  async getContractHistory(resourceId: string): Promise<any[]> {
    try {
      const { contractService } = await import('./contractService');
      return await contractService.getContractHistory(resourceId);
    } catch (error: any) {
      // Si es un error de red, no loguear como error crítico
      if (error?.name === 'NetworkError' || error?.message?.includes('Failed to fetch') || error?.message?.includes('ERR_FAILED')) {
        console.warn(`⚠️ Error de red al obtener historial de contratos para ${resourceId}:`, error.message);
      } else {
        console.error('Error al obtener historial de contratos:', error);
      }
      return [];
    }
  },

  async getZoneAssignments(resourceId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('resource_zone_assignments')
        .select('zones(name)')
        .eq('resource_id', resourceId);
      
      if (error) throw error;
      return data?.map((item: any) => item.zones.name) || [];
    } catch (error: any) {
      if (error?.name === 'NetworkError' || error?.message?.includes('Failed to fetch') || error?.message?.includes('ERR_FAILED')) {
        console.warn(`⚠️ Error de red al obtener asignaciones de zonas para ${resourceId}`);
        return [];
      }
      console.error('Error al obtener asignaciones de zonas:', error);
      return [];
    }
  },

  async createZoneAssignments(resourceId: string, zoneNames: string[]): Promise<void> {
    if (zoneNames.length === 0) return;

    const uniqueZoneNames = [...new Set(zoneNames)];

    // Primero obtener la unidad del recurso para evitar tomar zonas homónimas de otra unidad.
    const { data: resource, error: resourceError } = await supabase
      .from('resources')
      .select('unit_id')
      .eq('id', resourceId)
      .single();

    if (resourceError) throw resourceError;

    const { data: zones, error: zonesError } = await supabase
      .from('zones')
      .select('id, name')
      .eq('unit_id', resource.unit_id)
      .in('name', uniqueZoneNames);

    if (zonesError) throw zonesError;

    if (zones && zones.length > 0) {
      const { error } = await supabase.from('resource_zone_assignments').insert(
        zones.map(z => ({
          resource_id: resourceId,
          zone_id: z.id,
        }))
      );

      if (error) throw error;
    }
  },
};

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function transformResourceFromDB(
  data: any,
  trainings: Training[] = [],
  assets: AssignedAsset[] = [],
  shifts: DailyShift[] = [],
  maintenance: MaintenanceRecord[] = [],
  zoneNames: string[] = []
): Resource {
  return {
    id: data.id,
    name: data.name,
    type: data.type as ResourceType,
    quantity: Number(data.quantity || 1),
    unitOfMeasure: data.unit_of_measure,
    status: data.status,
    assignedZones: zoneNames,
    assignedShift: data.assigned_shift,
    compliancePercentage: data.compliance_percentage ? Number(data.compliance_percentage) : undefined,
    lastRestock: data.last_restock,
    nextMaintenance: data.next_maintenance,
    image: data.image,
    externalId: data.external_id,
    lastSync: data.last_sync,
    trainings,
    assignedAssets: assets,
    workSchedule: shifts,
    maintenanceHistory: maintenance,
    // Nuevos campos para personal
    dni: data.dni,
    puesto: data.puesto,
    birthDate: normalizeDateFromDB(data.birth_date),
    isShared: data.is_shared ?? false, // Por defecto false (único)
    // Normalizar fechas para evitar problemas de timezone
    startDate: normalizeDateFromDB(data.start_date),
    endDate: normalizeDateFromDB(data.end_date),
    // endDate es solo para monitoreo, NO cambia automáticamente el estado
    // El estado se cambia manualmente mediante el proceso de cese
    personnelStatus: (() => {
      // Usar el valor de la BD directamente, sin lógica automática basada en endDate
      return (data.personnel_status as 'activo' | 'cesado' | 'archivado') || (data.type === 'Personal' ? 'activo' : undefined);
    })(),
    // archived solo se cambia manualmente mediante el proceso de cese/archivo
    archived: data.archived || false,
    // Campos de capacitación
    inTraining: data.in_training || false,
    trainingStartDate: normalizeDateFromDB(data.training_start_date),
    contractGenerated: data.contract_generated || false,
    // Campos de salario
    monthlySalary: data.monthly_salary ? Number(data.monthly_salary) : undefined,
    workConditionAmount: data.work_condition_amount ? Number(data.work_condition_amount) : undefined,
  };
}

// Función helper para normalizar fechas desde la BD (evita problemas de timezone)
function normalizeDateFromDB(dateValue: any): string | undefined {
  if (!dateValue) return undefined;
  
  // Si es un string, extraer solo la parte de la fecha (YYYY-MM-DD)
  if (typeof dateValue === 'string') {
    return dateValue.split('T')[0].split(' ')[0];
  } else if (dateValue instanceof Date) {
    // Si es un objeto Date, usar UTC para evitar problemas de zona horaria
    const year = dateValue.getUTCFullYear();
    const month = String(dateValue.getUTCMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return undefined;
}

// Función helper para normalizar fechas antes de guardar en la BD
function normalizeDateToDB(dateValue: any): string | null | undefined {
  if (dateValue === null || dateValue === undefined) return null; // null elimina el campo en BD
  if (!dateValue) return null;
  
  // Si es un string, extraer solo la parte de la fecha (YYYY-MM-DD)
  if (typeof dateValue === 'string') {
    return dateValue.split('T')[0].split(' ')[0];
  } else if (dateValue instanceof Date) {
    // Si es un objeto Date, convertir a YYYY-MM-DD usando hora local
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  return undefined;
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

function transformResourceToDB(resource: Partial<Resource>, unitId?: string): any {
  const result: any = {};
  const setIfDefined = (key: string, value: any) => {
    if (value !== undefined) {
      result[key] = value;
    }
  };

  setIfDefined('name', resource.name);
  setIfDefined('type', resource.type);
  setIfDefined('quantity', resource.quantity);
  setIfDefined('unit_of_measure', resource.unitOfMeasure);
  setIfDefined('status', resource.status);
  setIfDefined('assigned_shift', resource.assignedShift);
  setIfDefined('compliance_percentage', resource.compliancePercentage);
  setIfDefined('last_restock', resource.lastRestock);
  setIfDefined('next_maintenance', resource.nextMaintenance);
  // No persistir null para image: las recargas antiguas pueden traer image=null y
  // borrar accidentalmente una foto ya subida cuando se actualiza la unidad completa.
  // Para quitar una foto explícitamente se usa string vacío.
  if (resource.image !== undefined && resource.image !== null) {
    result.image = resource.image;
  }
  setIfDefined('external_id', resource.externalId);
  setIfDefined('last_sync', resource.lastSync);

  // Solo incluir unit_id si se proporciona (para actualizaciones que cambian de unidad)
  if (unitId !== undefined) {
    result.unit_id = unitId;
  }

  // Incluir nuevos campos de personal si están presentes
  // Procesar campos de personal si el tipo es PERSONNEL o si hay campos de personal presentes
  // (esto permite actualizaciones parciales sin requerir el type)
  const hasPersonnelFields = resource.type === ResourceType.PERSONNEL || 
                             resource.personnelStatus !== undefined ||
                             resource.dni !== undefined ||
                             resource.puesto !== undefined ||
                             resource.archived !== undefined ||
                             resource.endDate !== undefined ||
                             resource.startDate !== undefined;
  
  if (hasPersonnelFields) {
    if (resource.dni !== undefined) result.dni = resource.dni;
    if (resource.puesto !== undefined) result.puesto = resource.puesto;
    if (resource.birthDate !== undefined) result.birth_date = normalizeDateToDB(resource.birthDate);
    if (resource.isShared !== undefined) result.is_shared = resource.isShared;
    // Normalizar fechas antes de guardar para evitar problemas de timezone
    // endDate es solo referencial, NO debe archivar automáticamente
    if (resource.startDate !== undefined) result.start_date = normalizeDateToDB(resource.startDate);
    if (resource.endDate !== undefined) {
      // Si endDate es null, establecerlo explícitamente para eliminar la fecha de fin
      result.end_date = normalizeDateToDB(resource.endDate);
    }
    if (resource.personnelStatus !== undefined) result.personnel_status = resource.personnelStatus;
    if (resource.archived !== undefined) result.archived = resource.archived;
    // Campos de capacitación
    if (resource.inTraining !== undefined) result.in_training = resource.inTraining;
    if (resource.trainingStartDate !== undefined) result.training_start_date = normalizeDateToDB(resource.trainingStartDate);
    if (resource.contractGenerated !== undefined) result.contract_generated = resource.contractGenerated;
    // Campos de salario
    if (resource.monthlySalary !== undefined) result.monthly_salary = resource.monthlySalary;
    if (resource.workConditionAmount !== undefined) result.work_condition_amount = resource.workConditionAmount;
  }

  return result;
}

