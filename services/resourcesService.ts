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
      const resources = await Promise.all(
        data.map(async (resource) => {
          const [trainings, assets, shifts, maintenance, zoneAssignments] = await Promise.all([
            this.getTrainings(resource.id),
            this.getAssignedAssets(resource.id),
            this.getDailyShifts(resource.id),
            this.getMaintenanceRecords(resource.id),
            this.getZoneAssignments(resource.id),
          ]);

          return transformResourceFromDB(resource, trainings, assets, shifts, maintenance, zoneAssignments);
        })
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

      const resources = await Promise.all(
        data.map(async (resource) => {
          const [trainings, assets, shifts, maintenance, zoneAssignments] = await Promise.all([
            this.getTrainings(resource.id),
            this.getAssignedAssets(resource.id),
            this.getDailyShifts(resource.id),
            this.getMaintenanceRecords(resource.id),
            this.getZoneAssignments(resource.id),
          ]);

          return transformResourceFromDB(resource, trainings, assets, shifts, maintenance, zoneAssignments);
        })
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

      const [trainings, assets, shifts, maintenance, zoneAssignments] = await Promise.all([
        this.getTrainings(id),
        this.getAssignedAssets(id),
        this.getDailyShifts(id),
        this.getMaintenanceRecords(id),
        this.getZoneAssignments(id),
      ]);

      return transformResourceFromDB(data, trainings, assets, shifts, maintenance, zoneAssignments);
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

      return await this.getById(data.id) || resource as Resource;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar un recurso
  async update(id: string, resource: Partial<Resource>): Promise<Resource> {
    try {
      const resourceData = transformResourceToDB(resource);

      const { error } = await supabase
        .from('resources')
        .update(resourceData)
        .eq('id', id);

      if (error) throw error;

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
    const { data } = await supabase
      .from('trainings')
      .select('*')
      .eq('resource_id', resourceId)
      .order('date', { ascending: false });

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
    const { data } = await supabase
      .from('assigned_assets')
      .select('*')
      .eq('resource_id', resourceId)
      .order('date_assigned', { ascending: false });

    return data?.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type as any,
      dateAssigned: a.date_assigned,
      serialNumber: a.serial_number,
      notes: a.notes,
    })) || [];
  },

  async createAssignedAssets(resourceId: string, assets: AssignedAsset[]): Promise<void> {
    await supabase.from('assigned_assets').insert(
      assets.map(a => ({
        resource_id: resourceId,
        name: a.name,
        type: a.type,
        date_assigned: a.dateAssigned,
        serial_number: a.serialNumber,
        notes: a.notes,
      }))
    );
  },

  async getDailyShifts(resourceId: string): Promise<DailyShift[]> {
    const { data } = await supabase
      .from('daily_shifts')
      .select('*')
      .eq('resource_id', resourceId)
      .order('date', { ascending: true });

    return data?.map(s => ({
      date: s.date,
      type: s.type as any,
      hours: Number(s.hours),
    })) || [];
  },

  async createDailyShifts(resourceId: string, shifts: DailyShift[]): Promise<void> {
    await supabase.from('daily_shifts').insert(
      shifts.map(s => ({
        resource_id: resourceId,
        date: s.date,
        type: s.type,
        hours: s.hours,
      }))
    );
  },

  async getMaintenanceRecords(resourceId: string): Promise<MaintenanceRecord[]> {
    const { data } = await supabase
      .from('maintenance_records')
      .select('*, maintenance_images(*)')
      .eq('resource_id', resourceId)
      .order('date', { ascending: false });

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

  async getZoneAssignments(resourceId: string): Promise<string[]> {
    const { data } = await supabase
      .from('resource_zone_assignments')
      .select('zones(name)')
      .eq('resource_id', resourceId);

    return data?.map((item: any) => item.zones.name) || [];
  },

  async createZoneAssignments(resourceId: string, zoneNames: string[]): Promise<void> {
    // Primero obtener los IDs de las zonas por nombre
    const { data: zones } = await supabase
      .from('zones')
      .select('id, name')
      .in('name', zoneNames);

    if (zones && zones.length > 0) {
      await supabase.from('resource_zone_assignments').insert(
        zones.map(z => ({
          resource_id: resourceId,
          zone_id: z.id,
        }))
      );
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
    startDate: data.start_date,
    endDate: data.end_date,
    personnelStatus: data.personnel_status as 'activo' | 'cesado' || (data.type === 'Personal' ? 'activo' : undefined),
    archived: data.archived || false,
  };
}

function transformResourceToDB(resource: Partial<Resource>, unitId?: string): any {
  const result: any = {
    unit_id: unitId,
    name: resource.name,
    type: resource.type,
    quantity: resource.quantity,
    unit_of_measure: resource.unitOfMeasure,
    status: resource.status,
    assigned_shift: resource.assignedShift,
    compliance_percentage: resource.compliancePercentage,
    last_restock: resource.lastRestock,
    next_maintenance: resource.nextMaintenance,
    image: resource.image,
    external_id: resource.externalId,
    last_sync: resource.lastSync,
  };

  // Incluir nuevos campos solo si el recurso es de tipo Personal
  if (resource.type === ResourceType.PERSONNEL) {
    if (resource.dni !== undefined) result.dni = resource.dni;
    if (resource.startDate !== undefined) result.start_date = resource.startDate;
    if (resource.endDate !== undefined) result.end_date = resource.endDate;
    if (resource.personnelStatus !== undefined) result.personnel_status = resource.personnelStatus;
    if (resource.archived !== undefined) result.archived = resource.archived;
  }

  return result;
}

