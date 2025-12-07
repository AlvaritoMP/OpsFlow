import { supabase, handleSupabaseError } from './supabase';

// ============================================
// TIPOS
// ============================================

export interface Reten {
  id: string;
  name: string;
  dni: string;
  phone: string;
  email?: string;
  photo?: string; // URL de la foto del retén
  status: 'disponible' | 'asignado' | 'no_disponible';
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface RetenAssignment {
  id: string;
  reten_id: string;
  reten_name?: string; // Para joins
  reten_phone?: string; // Para joins
  unit_id: string;
  unit_name: string;
  assignment_date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  assignment_type: 'planificada' | 'inmediata';
  reason?: string;
  status: 'programada' | 'en_curso' | 'completada' | 'cancelada';
  constancy_code?: string;
  constancy_generated_at?: string;
  whatsapp_sent: boolean;
  whatsapp_sent_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

// ============================================
// SERVICIO DE RETENES
// ============================================

export const retenesService = {
  // ========== CRUD RETENES ==========
  
  // Obtener todos los retenes
  async getAll(): Promise<Reten[]> {
    try {
      const { data, error } = await supabase
        .from('retenes')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []).map(transformRetenFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener retén por ID
  async getById(id: string): Promise<Reten | null> {
    try {
      const { data, error } = await supabase
        .from('retenes')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data ? transformRetenFromDB(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Crear retén
  async create(reten: Partial<Reten>): Promise<Reten> {
    try {
      const retenData = {
        name: reten.name!,
        dni: reten.dni!,
        phone: reten.phone!,
        email: reten.email || null,
        photo: reten.photo || null,
        status: reten.status || 'disponible',
        notes: reten.notes || null,
        created_by: reten.created_by || null,
      };

      const { data, error } = await supabase
        .from('retenes')
        .insert(retenData)
        .select()
        .single();

      if (error) throw error;
      return transformRetenFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar retén
  async update(id: string, reten: Partial<Reten>): Promise<Reten> {
    try {
      const retenData: any = {};
      if (reten.name) retenData.name = reten.name;
      if (reten.dni) retenData.dni = reten.dni;
      if (reten.phone) retenData.phone = reten.phone;
      if (reten.email !== undefined) retenData.email = reten.email || null;
      if (reten.photo !== undefined) retenData.photo = reten.photo || null;
      if (reten.status) retenData.status = reten.status;
      if (reten.notes !== undefined) retenData.notes = reten.notes || null;
      if (reten.updated_by) retenData.updated_by = reten.updated_by;

      const { error } = await supabase
        .from('retenes')
        .update(retenData)
        .eq('id', id);

      if (error) throw error;
      return await this.getById(id) || reten as Reten;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar retén
  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('retenes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // ========== ASIGNACIONES ==========

  // Obtener asignaciones por rango de fechas
  async getAssignmentsByDateRange(
    startDate: string,
    endDate: string
  ): Promise<RetenAssignment[]> {
    try {
      const { data, error } = await supabase
        .from('reten_assignments')
        .select(`
          *,
          retenes (
            name,
            phone
          )
        `)
        .gte('assignment_date', startDate)
        .lte('assignment_date', endDate)
        .order('assignment_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      return (data || []).map(transformAssignmentFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener asignaciones por retén
  async getAssignmentsByReten(retenId: string): Promise<RetenAssignment[]> {
    try {
      const { data, error } = await supabase
        .from('reten_assignments')
        .select('*')
        .eq('reten_id', retenId)
        .order('assignment_date', { ascending: false });

      if (error) throw error;
      return (data || []).map(transformAssignmentFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Crear asignación
  async createAssignment(assignment: Partial<RetenAssignment>): Promise<RetenAssignment> {
    try {
      // Generar código de constancia si no existe
      let constancyCode = assignment.constancy_code;
      if (!constancyCode) {
        constancyCode = await this.generateConstancyCode();
      }

      const assignmentData = {
        reten_id: assignment.reten_id!,
        unit_id: assignment.unit_id!,
        unit_name: assignment.unit_name!,
        assignment_date: assignment.assignment_date!,
        start_time: assignment.start_time!,
        end_time: assignment.end_time!,
        assignment_type: assignment.assignment_type || 'planificada',
        reason: assignment.reason || null,
        status: assignment.status || 'programada',
        constancy_code: constancyCode,
        notes: assignment.notes || null,
        created_by: assignment.created_by || null,
      };

      const { data, error } = await supabase
        .from('reten_assignments')
        .insert(assignmentData)
        .select()
        .single();

      if (error) throw error;

      // Actualizar estado del retén a 'asignado' si está disponible
      const reten = await this.getById(assignment.reten_id!);
      if (reten && reten.status === 'disponible') {
        await this.update(assignment.reten_id!, { status: 'asignado' });
      }

      return transformAssignmentFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar asignación
  async updateAssignment(
    id: string,
    assignment: Partial<RetenAssignment>
  ): Promise<RetenAssignment> {
    try {
      const assignmentData: any = {};
      if (assignment.reten_id) assignmentData.reten_id = assignment.reten_id;
      if (assignment.unit_id) assignmentData.unit_id = assignment.unit_id;
      if (assignment.unit_name) assignmentData.unit_name = assignment.unit_name;
      if (assignment.assignment_date) assignmentData.assignment_date = assignment.assignment_date;
      if (assignment.start_time) assignmentData.start_time = assignment.start_time;
      if (assignment.end_time) assignmentData.end_time = assignment.end_time;
      if (assignment.assignment_type) assignmentData.assignment_type = assignment.assignment_type;
      if (assignment.reason !== undefined) assignmentData.reason = assignment.reason || null;
      if (assignment.status) assignmentData.status = assignment.status;
      if (assignment.notes !== undefined) assignmentData.notes = assignment.notes || null;
      if (assignment.whatsapp_sent !== undefined) {
        assignmentData.whatsapp_sent = assignment.whatsapp_sent;
        if (assignment.whatsapp_sent) {
          assignmentData.whatsapp_sent_at = new Date().toISOString();
        }
      }
      if (assignment.updated_by) assignmentData.updated_by = assignment.updated_by;

      const { error } = await supabase
        .from('reten_assignments')
        .update(assignmentData)
        .eq('id', id);

      if (error) throw error;

      // Obtener asignación actualizada
      const { data } = await supabase
        .from('reten_assignments')
        .select(`
          *,
          retenes (
            name,
            phone
          )
        `)
        .eq('id', id)
        .single();

      return transformAssignmentFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar asignación
  async deleteAssignment(id: string): Promise<void> {
    try {
      // Obtener asignación antes de eliminar para actualizar estado del retén
      const assignment = await supabase
        .from('reten_assignments')
        .select('reten_id, assignment_date')
        .eq('id', id)
        .single();

      const { error } = await supabase
        .from('reten_assignments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Verificar si el retén tiene otras asignaciones activas
      if (assignment.data) {
        const { data: otherAssignments } = await supabase
          .from('reten_assignments')
          .select('id')
          .eq('reten_id', assignment.data.reten_id)
          .gte('assignment_date', new Date().toISOString().split('T')[0])
          .in('status', ['programada', 'en_curso']);

        // Si no hay otras asignaciones, cambiar estado a disponible
        if (!otherAssignments || otherAssignments.length === 0) {
          await this.update(assignment.data.reten_id, { status: 'disponible' });
        }
      }
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Generar código de constancia
  async generateConstancyCode(): Promise<string> {
    try {
      const year = new Date().getFullYear();
      const { data } = await supabase
        .from('reten_assignments')
        .select('constancy_code')
        .like('constancy_code', `RET-${year}-%`)
        .order('constancy_code', { ascending: false })
        .limit(1);

      let sequence = 1;
      if (data && data.length > 0 && data[0].constancy_code) {
        const lastCode = data[0].constancy_code;
        const match = lastCode.match(/\d+$/);
        if (match) {
          sequence = parseInt(match[0]) + 1;
        }
      }

      return `RET-${year}-${String(sequence).padStart(6, '0')}`;
    } catch (error) {
      console.error('Error generando código de constancia:', error);
      const year = new Date().getFullYear();
      const timestamp = Date.now();
      return `RET-${year}-${String(timestamp).slice(-6)}`;
    }
  },

  // Obtener reporte mensual de coberturas
  async getMonthlyReport(year: number, month: number): Promise<any[]> {
    try {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;

      const { data, error } = await supabase
        .from('reten_assignments')
        .select(`
          *,
          retenes (
            name,
            dni,
            phone
          )
        `)
        .gte('assignment_date', startDate)
        .lte('assignment_date', endDate)
        .order('assignment_date', { ascending: true });

      if (error) throw error;

      // Agrupar por retén
      const report: Record<string, any> = {};
      
      (data || []).forEach((assignment: any) => {
        const retenId = assignment.reten_id;
        const reten = assignment.retenes;
        
        if (!report[retenId]) {
          report[retenId] = {
            reten_id: retenId,
            reten_name: reten?.name || 'N/A',
            reten_dni: reten?.dni || 'N/A',
            reten_phone: reten?.phone || 'N/A',
            total_assignments: 0,
            total_hours: 0,
            units_covered: new Set(),
            assignments: []
          };
        }

        report[retenId].total_assignments++;
        const start = new Date(`2000-01-01T${assignment.start_time}`);
        const end = new Date(`2000-01-01T${assignment.end_time}`);
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
        report[retenId].total_hours += hours;
        report[retenId].units_covered.add(assignment.unit_name);
        report[retenId].assignments.push({
          date: assignment.assignment_date,
          unit: assignment.unit_name,
          start_time: assignment.start_time,
          end_time: assignment.end_time,
          status: assignment.status
        });
      });

      return Object.values(report).map((item: any) => ({
        ...item,
        units_covered: Array.from(item.units_covered).join(', ')
      }));
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  }
};

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function transformRetenFromDB(data: any): Reten {
  return {
    id: data.id,
    name: data.name,
    dni: data.dni,
    phone: data.phone,
    email: data.email,
    photo: data.photo,
    status: data.status,
    notes: data.notes,
    created_at: data.created_at,
    updated_at: data.updated_at,
    created_by: data.created_by,
    updated_by: data.updated_by,
  };
}

function transformAssignmentFromDB(data: any): RetenAssignment {
  return {
    id: data.id,
    reten_id: data.reten_id,
    reten_name: data.retenes?.name || data.reten_name,
    reten_phone: data.retenes?.phone || data.reten_phone,
    unit_id: data.unit_id,
    unit_name: data.unit_name,
    assignment_date: data.assignment_date,
    start_time: data.start_time,
    end_time: data.end_time,
    assignment_type: data.assignment_type,
    reason: data.reason,
    status: data.status,
    constancy_code: data.constancy_code,
    constancy_generated_at: data.constancy_generated_at,
    whatsapp_sent: data.whatsapp_sent || false,
    whatsapp_sent_at: data.whatsapp_sent_at,
    notes: data.notes,
    created_at: data.created_at,
    updated_at: data.updated_at,
    created_by: data.created_by,
    updated_by: data.updated_by,
  };
}

