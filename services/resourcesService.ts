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
      if (!data || data.length === 0) return [];

      // Cargar datos relacionados en lote (evita N×6 requests y ERR_CONNECTION_CLOSED)
      const related = await loadRelatedDataBatched(data.map((r: any) => r.id), { includeContracts: true });

      return data.map((resource: any) => {
        const transformed = transformResourceFromDB(
          resource,
          related.trainingsById.get(resource.id) || [],
          related.assetsById.get(resource.id) || [],
          related.shiftsById.get(resource.id) || [],
          related.maintenanceById.get(resource.id) || [],
          related.zonesById.get(resource.id) || []
        );
        return {
          ...transformed,
          contractHistory: related.contractsById.get(resource.id) || [],
        };
      });
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
      if (!data || data.length === 0) return [];

      const related = await loadRelatedDataBatched(data.map((r: any) => r.id), { includeContracts: true });

      return data.map((resource: any) => {
        const transformed = transformResourceFromDB(
          resource,
          related.trainingsById.get(resource.id) || [],
          related.assetsById.get(resource.id) || [],
          related.shiftsById.get(resource.id) || [],
          related.maintenanceById.get(resource.id) || [],
          related.zonesById.get(resource.id) || []
        );
        return {
          ...transformed,
          contractHistory: related.contractsById.get(resource.id) || [],
        };
      });
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
      if (!data || data.length === 0) return [];

      // Listado de archivados: sin contratos (caro) y con lotes para no saturar la red
      const related = await loadRelatedDataBatched(data.map((r: any) => r.id), { includeContracts: false });

      return data.map((resource: any) => {
        const transformed = transformResourceFromDB(
          resource,
          related.trainingsById.get(resource.id) || [],
          related.assetsById.get(resource.id) || [],
          related.shiftsById.get(resource.id) || [],
          related.maintenanceById.get(resource.id) || [],
          related.zonesById.get(resource.id) || []
        );
        return {
          ...transformed,
          originalUnitId: resource.unit_id,
          originalUnitName: resource.unit?.name || 'Unidad desconocida',
        };
      });
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
        
        if (!updateResult || updateResult.length === 0) {
          console.warn('⚠️ [resourcesService.update] No se encontró el recurso después de actualizar');
        }
      }

      // Actualizar workSchedule (turnos) si se proporcionan
      if (resource.workSchedule !== undefined) {
        
        // Eliminar turnos existentes
        const { error: deleteError } = await supabase.from('daily_shifts').delete().eq('resource_id', id);
        if (deleteError) {
          console.error('❌ Error al eliminar turnos existentes:', deleteError);
          throw deleteError;
        }
        
        // Insertar nuevos turnos
        if (resource.workSchedule.length > 0) {
          await this.createDailyShifts(id, resource.workSchedule);
        }
      }

      // Actualizar assignedAssets si se proporcionan
      if (resource.assignedAssets !== undefined) {
        
        // Eliminar activos existentes
        const { error: deleteError } = await supabase.from('assigned_assets').delete().eq('resource_id', id);
        if (deleteError) {
          console.error('Error al eliminar activos existentes:', deleteError);
          throw deleteError;
        }
        
        // Insertar nuevos activos
        if (resource.assignedAssets.length > 0) {
          await this.createAssignedAssets(id, resource.assignedAssets);
        }
      }

      // Actualizar trainings (capacitaciones) si se proporcionan
      if (resource.trainings !== undefined) {
        
        // Eliminar capacitaciones existentes
        const { error: deleteError } = await supabase.from('trainings').delete().eq('resource_id', id);
        if (deleteError) {
          console.error('Error al eliminar capacitaciones existentes:', deleteError);
          throw deleteError;
        }
        
        // Insertar nuevas capacitaciones
        if (resource.trainings.length > 0) {
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

  // Eliminar un recurso y filas dependientes (evita FK y filas huérfanas)
  async delete(id: string): Promise<void> {
    const safe = async (
      label: string,
      run: () => Promise<{ error: { code?: string; message?: string } | null }>
    ) => {
      try {
        const { error } = await run();
        if (error && error.code !== '42P01') {
          console.warn(`⚠️ [resources.delete] ${label}:`, error);
        }
      } catch (e) {
        console.warn(`⚠️ [resources.delete] ${label}:`, e);
      }
    };

    try {
      await safe('maintenance_responsible', () =>
        supabase.from('maintenance_responsible').delete().eq('resource_id', id)
      );

      try {
        const { data: maintenanceRecords } = await supabase
          .from('maintenance_records')
          .select('id')
          .eq('resource_id', id);
        if (maintenanceRecords?.length) {
          const recordIds = maintenanceRecords.map((r: { id: string }) => r.id);
          await safe('maintenance_images', () =>
            supabase.from('maintenance_images').delete().in('maintenance_record_id', recordIds)
          );
          await safe('maintenance_records', () =>
            supabase.from('maintenance_records').delete().eq('resource_id', id)
          );
        }
      } catch (e) {
        console.warn('⚠️ [resources.delete] maintenance_records (bloque):', e);
      }

      await safe('daily_shifts', () =>
        supabase.from('daily_shifts').delete().eq('resource_id', id)
      );
      await safe('assigned_assets', () =>
        supabase.from('assigned_assets').delete().eq('resource_id', id)
      );
      await safe('trainings', () =>
        supabase.from('trainings').delete().eq('resource_id', id)
      );
      await safe('resource_zone_assignments', () =>
        supabase.from('resource_zone_assignments').delete().eq('resource_id', id)
      );

      await safe('contract_history', () =>
        supabase.from('contract_history').delete().eq('resource_id', id)
      );
      await safe('salary_increments', () =>
        supabase.from('salary_increments').delete().eq('resource_id', id)
      );
      await safe('variable_compensations', () =>
        supabase.from('variable_compensations').delete().eq('resource_id', id)
      );

      const { error } = await supabase.from('resources').delete().eq('id', id);

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
      return mapTrainingsFromDB(data || []);
    } catch (error: any) {
      if (error?.name === 'NetworkError' || error?.message?.includes('Failed to fetch') || error?.message?.includes('ERR_FAILED')) {
        console.warn(`⚠️ Error de red al obtener capacitaciones para ${resourceId}`);
        return [];
      }
      console.error('Error al obtener capacitaciones:', error);
      return [];
    }
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

      return data?.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type as any,
        dateAssigned: a.date_assigned,
        serialNumber: a.serial_number,
        phoneNumber: a.phone_number,
        notes: a.notes,
        constancyCode: a.constancy_code || undefined,
        constancyGeneratedAt: a.constancy_generated_at || undefined,
        standardAssetId: a.standard_asset_id || undefined,
      })) || [];
    } catch (error: any) {
      if (error?.name === 'NetworkError' || error?.message?.includes('Failed to fetch') || error?.message?.includes('ERR_FAILED')) {
        console.warn(`⚠️ Error de red al obtener activos asignados para ${resourceId}`);
        return [];
      }
      console.error('Error al obtener activos asignados:', error);
      return [];
    }
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
      return mapShiftsFromDB(data || []);
    } catch (error: any) {
      if (error?.name === 'NetworkError' || error?.message?.includes('Failed to fetch') || error?.message?.includes('ERR_FAILED')) {
        console.warn(`⚠️ Error de red al obtener turnos para ${resourceId}`);
        return [];
      }
      console.error('Error al obtener turnos:', error);
      return [];
    }
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
      return mapMaintenanceFromDB(data || []);
    } catch (error: any) {
      if (error?.name === 'NetworkError' || error?.message?.includes('Failed to fetch') || error?.message?.includes('ERR_FAILED')) {
        console.warn(`⚠️ Error de red al obtener registros de mantenimiento para ${resourceId}`);
        return [];
      }
      console.error('Error al obtener registros de mantenimiento:', error);
      return [];
    }
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
        .select('zone_id, zones(name)')
        .eq('resource_id', resourceId);

      if (error) throw error;

      const fromEmbed = (data || [])
        .map((item: any) => item.zones?.name)
        .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0);

      if (fromEmbed.length > 0) {
        return fromEmbed;
      }

      const zoneIds = (data || [])
        .map((row: any) => row.zone_id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);

      if (zoneIds.length === 0) return [];

      const { data: zoneRows, error: zoneErr } = await supabase
        .from('zones')
        .select('name')
        .in('id', zoneIds);

      if (zoneErr) throw zoneErr;
      return zoneRows?.map((z: { name: string }) => z.name) || [];
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

    const uniqueRequested = [...new Set(zoneNames.map((z) => z.trim()).filter(Boolean))];
    if (uniqueRequested.length === 0) return;

    const { data: resource, error: resourceError } = await supabase
      .from('resources')
      .select('unit_id')
      .eq('id', resourceId)
      .single();

    if (resourceError) throw resourceError;

    const { data: allZones, error: zonesError } = await supabase
      .from('zones')
      .select('id, name')
      .eq('unit_id', resource.unit_id);

    if (zonesError) throw zonesError;

    const zonesList = allZones || [];
    const normalize = (s: string) => s.trim().toLocaleLowerCase('es');

    const matchedIds: string[] = [];
    const unmatched: string[] = [];

    for (const requested of uniqueRequested) {
      const n = normalize(requested);
      const found = zonesList.find((z) => normalize(z.name) === n);
      if (found) {
        matchedIds.push(found.id);
      } else {
        unmatched.push(requested);
      }
    }

    if (unmatched.length > 0) {
      const available = zonesList.map((z) => z.name).join(', ') || '(ninguna)';
      throw new Error(
        `No se encontraron zonas para: ${unmatched.join(', ')}. Zonas de la unidad: ${available}`
      );
    }

    const uniqueIds = [...new Set(matchedIds)];

    const { error } = await supabase.from('resource_zone_assignments').insert(
      uniqueIds.map((zone_id) => ({
        resource_id: resourceId,
        zone_id,
      }))
    );

    if (error) throw error;
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
    inboundSourceData: data.inbound_source_data ?? undefined,
    trainings,
    assignedAssets: assets,
    workSchedule: shifts,
    maintenanceHistory: maintenance,
    // Nuevos campos para personal
    dni: data.dni,
    localidad: data.localidad || undefined,
    phone: data.phone || undefined,
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
    workDays: Array.isArray(data.work_days) ? data.work_days.filter(Boolean) : undefined,
    entryTime: data.entry_time || undefined,
    exitTime: data.exit_time || undefined,
    jornadaType: data.jornada_type || undefined,
    laborRegime: data.labor_regime || undefined,
    mobilityBonus:
      data.mobility_bonus !== null && data.mobility_bonus !== undefined
        ? Number(data.mobility_bonus)
        : undefined,
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

function mapTrainingsFromDB(rows: any[]): Training[] {
  return rows.map(t => ({
    id: t.id,
    topic: t.topic,
    date: t.date,
    status: t.status as 'Completado' | 'Programado' | 'Vencido',
    score: t.score,
    certificateUrl: t.certificate_url,
  }));
}

function mapAssetsFromDB(rows: any[]): AssignedAsset[] {
  return rows.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type as any,
    dateAssigned: a.date_assigned,
    serialNumber: a.serial_number,
    phoneNumber: a.phone_number,
    notes: a.notes,
    constancyCode: a.constancy_code || undefined,
    constancyGeneratedAt: a.constancy_generated_at || undefined,
    standardAssetId: a.standard_asset_id || undefined,
  }));
}

function mapShiftsFromDB(rows: any[]): DailyShift[] {
  return rows.map(s => ({
    date: s.date,
    type: s.type as any,
    hours: Number(s.hours),
  }));
}

function mapMaintenanceFromDB(rows: any[]): MaintenanceRecord[] {
  return rows.map((m) => {
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
  });
}

function groupByResourceId<T extends { resource_id?: string }>(
  rows: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = row.resource_id;
    if (!id) continue;
    const list = map.get(id);
    if (list) list.push(row);
    else map.set(id, [row]);
  }
  return map;
}

async function fetchInChunks<T>(
  ids: string[],
  chunkSize: number,
  fetcher: (chunkIds: string[]) => Promise<T[]>
): Promise<T[]> {
  if (ids.length === 0) return [];
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const rows = await fetcher(chunk);
    results.push(...rows);
  }
  return results;
}

type RelatedDataMaps = {
  trainingsById: Map<string, Training[]>;
  assetsById: Map<string, AssignedAsset[]>;
  shiftsById: Map<string, DailyShift[]>;
  maintenanceById: Map<string, MaintenanceRecord[]>;
  zonesById: Map<string, string[]>;
  contractsById: Map<string, any[]>;
};

/**
 * Carga datos relacionados de muchos recursos en pocas consultas (.in),
 * en lugar de 6 requests por recurso (causa típica de ERR_CONNECTION_CLOSED).
 */
async function loadRelatedDataBatched(
  resourceIds: string[],
  options: { includeContracts?: boolean } = {}
): Promise<RelatedDataMaps> {
  const empty: RelatedDataMaps = {
    trainingsById: new Map(),
    assetsById: new Map(),
    shiftsById: new Map(),
    maintenanceById: new Map(),
    zonesById: new Map(),
    contractsById: new Map(),
  };

  if (resourceIds.length === 0) return empty;

  const CHUNK = 80;
  const includeContracts = options.includeContracts !== false;

  const safeFetch = async <T>(label: string, fn: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await fn();
    } catch (error: any) {
      console.warn(`⚠️ Error de red al cargar ${label} en lote:`, error?.message || error);
      return [];
    }
  };

  const [trainingRows, assetRows, shiftRows, maintenanceRows, zoneRows, contractRows] = await Promise.all([
    safeFetch('capacitaciones', () =>
      fetchInChunks(resourceIds, CHUNK, async (ids) => {
        const { data, error } = await supabase
          .from('trainings')
          .select('*')
          .in('resource_id', ids)
          .order('date', { ascending: false });
        if (error) throw error;
        return data || [];
      })
    ),
    safeFetch('activos', () =>
      fetchInChunks(resourceIds, CHUNK, async (ids) => {
        const { data, error } = await supabase
          .from('assigned_assets')
          .select('*')
          .in('resource_id', ids)
          .order('date_assigned', { ascending: false });
        if (error) throw error;
        return data || [];
      })
    ),
    safeFetch('turnos', () =>
      fetchInChunks(resourceIds, CHUNK, async (ids) => {
        const { data, error } = await supabase
          .from('daily_shifts')
          .select('*')
          .in('resource_id', ids)
          .order('date', { ascending: true });
        if (error) throw error;
        return data || [];
      })
    ),
    safeFetch('mantenimiento', () =>
      fetchInChunks(resourceIds, CHUNK, async (ids) => {
        const { data, error } = await supabase
          .from('maintenance_records')
          .select('*, maintenance_images(*)')
          .in('resource_id', ids)
          .order('date', { ascending: false });
        if (error) throw error;
        return data || [];
      })
    ),
    safeFetch('zonas', () =>
      fetchInChunks(resourceIds, CHUNK, async (ids) => {
        const { data, error } = await supabase
          .from('resource_zone_assignments')
          .select('resource_id, zone_id, zones(name)')
          .in('resource_id', ids);
        if (error) throw error;
        return data || [];
      })
    ),
    includeContracts
      ? safeFetch('contratos', () =>
          fetchInChunks(resourceIds, CHUNK, async (ids) => {
            const { data, error } = await supabase
              .from('contract_history')
              .select('*')
              .in('resource_id', ids)
              .order('contract_number', { ascending: true });
            if (error) throw error;
            return data || [];
          })
        )
      : Promise.resolve([] as any[]),
  ]);

  const trainingsGrouped = groupByResourceId(trainingRows);
  const assetsGrouped = groupByResourceId(assetRows);
  const shiftsGrouped = groupByResourceId(shiftRows);
  const maintenanceGrouped = groupByResourceId(maintenanceRows);
  const contractsGrouped = groupByResourceId(contractRows);

  const trainingsById = new Map<string, Training[]>();
  for (const [id, rows] of trainingsGrouped) {
    trainingsById.set(id, mapTrainingsFromDB(rows));
  }

  const assetsById = new Map<string, AssignedAsset[]>();
  for (const [id, rows] of assetsGrouped) {
    assetsById.set(id, mapAssetsFromDB(rows));
  }

  const shiftsById = new Map<string, DailyShift[]>();
  for (const [id, rows] of shiftsGrouped) {
    shiftsById.set(id, mapShiftsFromDB(rows));
  }

  const maintenanceById = new Map<string, MaintenanceRecord[]>();
  for (const [id, rows] of maintenanceGrouped) {
    maintenanceById.set(id, mapMaintenanceFromDB(rows));
  }

  const zonesById = new Map<string, string[]>();
  for (const row of zoneRows as any[]) {
    const resourceId = row.resource_id as string;
    const zoneName = row.zones?.name as string | undefined;
    if (!resourceId || !zoneName) continue;
    const list = zonesById.get(resourceId) || [];
    list.push(zoneName);
    zonesById.set(resourceId, list);
  }

  // Fallback: si el embed de zones falló, resolver nombres por zone_id
  const missingZoneResourceIds = (zoneRows as any[])
    .filter((r) => r.resource_id && r.zone_id && !r.zones?.name)
    .map((r) => r.zone_id as string);
  if (missingZoneResourceIds.length > 0) {
    const uniqueZoneIds = [...new Set(missingZoneResourceIds)];
    try {
      const { data: zoneNameRows } = await supabase
        .from('zones')
        .select('id, name')
        .in('id', uniqueZoneIds);
      const nameById = new Map((zoneNameRows || []).map((z: any) => [z.id, z.name]));
      for (const row of zoneRows as any[]) {
        if (row.zones?.name || !row.resource_id || !row.zone_id) continue;
        const name = nameById.get(row.zone_id);
        if (!name) continue;
        const list = zonesById.get(row.resource_id) || [];
        list.push(name);
        zonesById.set(row.resource_id, list);
      }
    } catch {
      // ignorar; zonas quedan vacías para esos recursos
    }
  }

  const contractsById = new Map<string, any[]>();
  for (const [id, rows] of contractsGrouped) {
    contractsById.set(id, rows);
  }

  return {
    trainingsById,
    assetsById,
    shiftsById,
    maintenanceById,
    zonesById,
    contractsById,
  };
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
  setIfDefined('inbound_source_data', resource.inboundSourceData);

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
                             resource.localidad !== undefined ||
                             resource.puesto !== undefined ||
                             resource.archived !== undefined ||
                             resource.endDate !== undefined ||
                             resource.startDate !== undefined ||
                             resource.monthlySalary !== undefined ||
                             resource.workConditionAmount !== undefined ||
                             resource.workDays !== undefined ||
                             resource.entryTime !== undefined ||
                             resource.exitTime !== undefined ||
                             resource.jornadaType !== undefined ||
                             resource.laborRegime !== undefined ||
                             resource.mobilityBonus !== undefined;
  
  if (hasPersonnelFields) {
    if (resource.dni !== undefined) result.dni = resource.dni;
    if (resource.localidad !== undefined) result.localidad = resource.localidad;
    if (resource.phone !== undefined) result.phone = resource.phone;
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
    if (resource.workDays !== undefined) result.work_days = resource.workDays;
    if (resource.entryTime !== undefined) result.entry_time = resource.entryTime || null;
    if (resource.exitTime !== undefined) result.exit_time = resource.exitTime || null;
    if (resource.jornadaType !== undefined) result.jornada_type = resource.jornadaType || null;
    if (resource.laborRegime !== undefined) result.labor_regime = resource.laborRegime || null;
    if (resource.mobilityBonus !== undefined) result.mobility_bonus = resource.mobilityBonus;
  }

  return result;
}

