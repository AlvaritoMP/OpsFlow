import { supabase, handleSupabaseError } from './supabase';
import { 
  NightSupervisionShift, 
  NightSupervisionCall, 
  NightSupervisionCameraReview, 
  NightSupervisionAlert,
  NightSupervisionReport 
} from '../types';

// ============================================
// TRANSFORMACIONES DE BASE DE DATOS
// ============================================

function transformShiftFromDB(data: any): NightSupervisionShift {
  // Normalizar la fecha para asegurar formato YYYY-MM-DD
  // IMPORTANTE: No usar new Date() aquí porque puede cambiar el día debido a zona horaria
  let normalizedDate = data.date;
  if (normalizedDate) {
    // Si es un string, extraer solo la parte de la fecha (YYYY-MM-DD)
    if (typeof normalizedDate === 'string') {
      // Extraer solo YYYY-MM-DD, ignorar cualquier hora o zona horaria
      normalizedDate = normalizedDate.split('T')[0].split(' ')[0];
    } else if (normalizedDate instanceof Date) {
      // Si es un objeto Date, usar UTC para evitar problemas de zona horaria
      const year = normalizedDate.getUTCFullYear();
      const month = String(normalizedDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(normalizedDate.getUTCDate()).padStart(2, '0');
      normalizedDate = `${year}-${month}-${day}`;
    }
  }
  
  
  return {
    id: data.id,
    date: normalizedDate,
    unit_id: data.unit_id,
    unit_name: data.unit_name,
    supervisor_id: data.supervisor_id,
    supervisor_name: data.supervisor_name,
    shift_start: data.shift_start,
    shift_end: data.shift_end,
    status: data.status,
    completion_percentage: data.completion_percentage || 0,
    notes: data.notes || undefined,
    created_at: data.created_at,
    updated_at: data.updated_at,
    created_by: data.created_by || undefined,
    updated_by: data.updated_by || undefined,
  };
}

function transformShiftToDB(shift: Partial<NightSupervisionShift>): any {
  // Normalizar la fecha antes de guardar para asegurar formato YYYY-MM-DD
  let normalizedDate = shift.date;
  if (normalizedDate) {
    // Si es un string, extraer solo la parte de la fecha (YYYY-MM-DD)
    if (typeof normalizedDate === 'string') {
      normalizedDate = normalizedDate.split('T')[0].split(' ')[0];
    } else if (normalizedDate instanceof Date) {
      // Si es un objeto Date, convertir a YYYY-MM-DD
      const year = normalizedDate.getFullYear();
      const month = String(normalizedDate.getMonth() + 1).padStart(2, '0');
      const day = String(normalizedDate.getDate()).padStart(2, '0');
      normalizedDate = `${year}-${month}-${day}`;
    }
  }
  
  // Construir el objeto solo con los campos que están presentes (no incluir undefined)
  const result: any = {};
  
  if (normalizedDate !== undefined) result.date = normalizedDate;
  if (shift.unit_id !== undefined) result.unit_id = shift.unit_id;
  if (shift.unit_name !== undefined) result.unit_name = shift.unit_name;
  if (shift.supervisor_id !== undefined) result.supervisor_id = shift.supervisor_id;
  if (shift.supervisor_name !== undefined) result.supervisor_name = shift.supervisor_name;
  if (shift.shift_start !== undefined) result.shift_start = shift.shift_start;
  if (shift.shift_end !== undefined) result.shift_end = shift.shift_end;
  if (shift.status !== undefined) result.status = shift.status;
  if (shift.completion_percentage !== undefined) result.completion_percentage = shift.completion_percentage;
  if (shift.notes !== undefined) result.notes = shift.notes || null;
  if (shift.created_by !== undefined) result.created_by = shift.created_by || null;
  if (shift.updated_by !== undefined) result.updated_by = shift.updated_by || null;
  
  return result;
}

function transformCallFromDB(data: any): NightSupervisionCall {
  return {
    id: data.id,
    shift_id: data.shift_id,
    worker_id: data.worker_id,
    worker_name: data.worker_name,
    worker_phone: data.worker_phone,
    call_number: data.call_number,
    scheduled_time: data.scheduled_time,
    actual_time: data.actual_time || undefined,
    answered: data.answered || false,
    photo_received: data.photo_received || false,
    photo_url: data.photo_url || undefined,
    photo_timestamp: data.photo_timestamp || undefined,
    on_rest: data.on_rest || false,
    notes: data.notes || undefined,
    non_conformity: data.non_conformity || false,
    non_conformity_description: data.non_conformity_description || undefined,
    created_at: data.created_at,
    updated_at: data.updated_at,
    created_by: data.created_by || undefined,
    updated_by: data.updated_by || undefined,
  };
}

function transformCallToDB(call: Partial<NightSupervisionCall>): any {
  return {
    shift_id: call.shift_id,
    worker_id: call.worker_id,
    worker_name: call.worker_name,
    worker_phone: call.worker_phone,
    call_number: call.call_number,
    scheduled_time: call.scheduled_time,
    actual_time: call.actual_time || null,
    answered: call.answered !== undefined ? call.answered : false,
    photo_received: call.photo_received !== undefined ? call.photo_received : false,
    photo_url: call.photo_url || null,
    photo_timestamp: call.photo_timestamp || null,
    on_rest: call.on_rest !== undefined ? call.on_rest : false,
    notes: call.notes || null,
    non_conformity: call.non_conformity !== undefined ? call.non_conformity : false,
    non_conformity_description: call.non_conformity_description || null,
    created_by: call.created_by || null,
    updated_by: call.updated_by || null,
  };
}

function transformCameraReviewFromDB(data: any): NightSupervisionCameraReview {
  return {
    id: data.id,
    shift_id: data.shift_id,
    unit_id: data.unit_id,
    unit_name: data.unit_name,
    review_number: data.review_number,
    scheduled_time: data.scheduled_time,
    actual_time: data.actual_time || undefined,
    screenshot_url: data.screenshot_url,
    screenshot_timestamp: data.screenshot_timestamp || undefined,
    cameras_reviewed: Array.isArray(data.cameras_reviewed) ? data.cameras_reviewed : [],
    notes: data.notes || undefined,
    non_conformity: data.non_conformity || false,
    non_conformity_description: data.non_conformity_description || undefined,
    created_at: data.created_at,
    updated_at: data.updated_at,
    created_by: data.created_by || undefined,
    updated_by: data.updated_by || undefined,
  };
}

function transformCameraReviewToDB(review: Partial<NightSupervisionCameraReview>): any {
  return {
    shift_id: review.shift_id,
    unit_id: review.unit_id,
    unit_name: review.unit_name,
    review_number: review.review_number,
    scheduled_time: review.scheduled_time,
    actual_time: review.actual_time || null,
    screenshot_url: review.screenshot_url,
    screenshot_timestamp: review.screenshot_timestamp || null,
    cameras_reviewed: Array.isArray(review.cameras_reviewed) ? review.cameras_reviewed : [],
    notes: review.notes || null,
    non_conformity: review.non_conformity !== undefined ? review.non_conformity : false,
    non_conformity_description: review.non_conformity_description || null,
    created_by: review.created_by || null,
    updated_by: review.updated_by || null,
  };
}

function transformAlertFromDB(data: any): NightSupervisionAlert {
  return {
    id: data.id,
    shift_id: data.shift_id,
    type: data.type,
    severity: data.severity || 'medium',
    title: data.title,
    description: data.description,
    related_entity_type: data.related_entity_type || undefined,
    related_entity_id: data.related_entity_id || undefined,
    resolved: data.resolved || false,
    resolved_at: data.resolved_at || undefined,
    resolved_by: data.resolved_by || undefined,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

// ============================================
// SERVICIO DE SUPERVISIÓN NOCTURNA
// ============================================

export const nightSupervisionService = {
  // ========== CRUD SHIFTS ==========
  
  async getAllShifts(filters?: {
    dateFrom?: string;
    dateTo?: string;
    unitId?: string;
    supervisorId?: string;
    status?: string;
  }): Promise<NightSupervisionShift[]> {
    try {
      let query = supabase
        .from('night_supervision_shifts')
        .select('*');

      // Aplicar filtros en orden específico para mejor rendimiento
      if (filters?.unitId) {
        query = query.eq('unit_id', filters.unitId);
      }
      if (filters?.supervisorId) {
        query = query.eq('supervisor_id', filters.supervisorId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      
      // Filtro de fecha: si dateFrom y dateTo son iguales, usar eq para comparación exacta
      if (filters?.dateFrom && filters?.dateTo) {
        // Normalizar fechas: solo la parte de fecha (YYYY-MM-DD)
        const dateFromNormalized = filters.dateFrom.split('T')[0];
        const dateToNormalized = filters.dateTo.split('T')[0];
        
        // Si dateFrom y dateTo son iguales, usar eq para comparación exacta
        if (dateFromNormalized === dateToNormalized) {
          query = query.eq('date', dateFromNormalized);
        } else {
          query = query.gte('date', dateFromNormalized).lte('date', dateToNormalized);
        }
      } else if (filters?.dateFrom) {
        // Solo dateFrom: buscar desde esa fecha
        const dateFromNormalized = filters.dateFrom.split('T')[0];
        query = query.gte('date', dateFromNormalized);
      } else if (filters?.dateTo) {
        // Solo dateTo: buscar hasta esa fecha
        const dateToNormalized = filters.dateTo.split('T')[0];
        query = query.lte('date', dateToNormalized);
      }

      // Ordenar al final
      query = query.order('date', { ascending: false }).order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(transformShiftFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async getShiftById(id: string): Promise<NightSupervisionShift | null> {
    try {
      const { data, error } = await supabase
        .from('night_supervision_shifts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data ? transformShiftFromDB(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  async createShift(shift: Partial<NightSupervisionShift>): Promise<NightSupervisionShift> {
    try {
      const shiftData = transformShiftToDB(shift);
      
      const { data, error } = await supabase
        .from('night_supervision_shifts')
        .insert(shiftData)
        .select()
        .single();

      if (error) {
        console.error('❌ Error al insertar turno:', error);
        throw error;
      }
      
      
      const transformed = transformShiftFromDB(data);
      
      return transformed;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async updateShift(id: string, shift: Partial<NightSupervisionShift>): Promise<NightSupervisionShift> {
    try {
      const shiftData = transformShiftToDB(shift);
      const { data, error } = await supabase
        .from('night_supervision_shifts')
        .update(shiftData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return transformShiftFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async deleteShift(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('night_supervision_shifts')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // ========== CRUD CALLS ==========

  async getCallsByShiftId(shiftId: string): Promise<NightSupervisionCall[]> {
    try {
      const { data, error } = await supabase
        .from('night_supervision_calls')
        .select('*')
        .eq('shift_id', shiftId)
        .order('call_number', { ascending: true })
        .order('worker_name', { ascending: true });

      if (error) throw error;
      return (data || []).map(transformCallFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async createCall(call: Partial<NightSupervisionCall>): Promise<NightSupervisionCall> {
    try {
      // Verificar si ya existe una llamada con los mismos parámetros
      if (call.shift_id && call.worker_id && call.call_number) {
        const { data: existingCalls, error: checkError } = await supabase
          .from('night_supervision_calls')
          .select('id')
          .eq('shift_id', call.shift_id)
          .eq('worker_id', call.worker_id)
          .eq('call_number', call.call_number);

        if (checkError) {
          console.warn('Error verificando llamadas existentes:', checkError);
        } else if (existingCalls && existingCalls.length > 0) {
          // Ya existe una llamada con estos parámetros
          const error = new Error('duplicate_call_entry') as any;
          error.existingCallId = existingCalls[0].id;
          throw error;
        }
      }

      const callData = transformCallToDB(call);
      const { data, error } = await supabase
        .from('night_supervision_calls')
        .insert(callData)
        .select()
        .single();

      if (error) {
        // Si es error de duplicado, lanzar error personalizado
        if (error.code === '23505' || error.message?.includes('duplicate key')) {
          const duplicateError = new Error('duplicate_call_entry') as any;
          duplicateError.originalError = error;
          throw duplicateError;
        }
        throw error;
      }
      return transformCallFromDB(data);
    } catch (error: any) {
      // Si es nuestro error personalizado, no llamar handleSupabaseError
      if (error.message === 'duplicate_call_entry') {
        throw error;
      }
      handleSupabaseError(error);
      throw error;
    }
  },

  async updateCall(id: string, call: Partial<NightSupervisionCall>): Promise<NightSupervisionCall> {
    try {
      const callData = transformCallToDB(call);
      const { data, error } = await supabase
        .from('night_supervision_calls')
        .update(callData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return transformCallFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async deleteCall(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('night_supervision_calls')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // ========== CRUD CAMERA REVIEWS ==========

  async getCameraReviewsByShiftId(shiftId: string): Promise<NightSupervisionCameraReview[]> {
    try {
      const { data, error } = await supabase
        .from('night_supervision_camera_reviews')
        .select('*')
        .eq('shift_id', shiftId)
        .order('review_number', { ascending: true });

      if (error) throw error;
      return (data || []).map(transformCameraReviewFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async createCameraReview(review: Partial<NightSupervisionCameraReview>): Promise<NightSupervisionCameraReview> {
    try {
      // Verificar si ya existe una revisión con el mismo shift_id y review_number
      if (review.shift_id && review.review_number) {
        const { data: existing } = await supabase
          .from('night_supervision_camera_reviews')
          .select('id')
          .eq('shift_id', review.shift_id)
          .eq('review_number', review.review_number)
          .single();

        if (existing) {
          // Si existe, actualizar en lugar de crear
          const reviewData = transformCameraReviewToDB(review);
          const { data, error } = await supabase
            .from('night_supervision_camera_reviews')
            .update(reviewData)
            .eq('id', existing.id)
            .select()
            .single();

          if (error) throw error;
          return transformCameraReviewFromDB(data);
        }
      }

      // Si no existe, crear nueva
      const reviewData = transformCameraReviewToDB(review);
      const { data, error } = await supabase
        .from('night_supervision_camera_reviews')
        .insert(reviewData)
        .select()
        .single();

      if (error) throw error;
      return transformCameraReviewFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async updateCameraReview(id: string, review: Partial<NightSupervisionCameraReview>): Promise<NightSupervisionCameraReview> {
    try {
      const reviewData = transformCameraReviewToDB(review);
      const { data, error } = await supabase
        .from('night_supervision_camera_reviews')
        .update(reviewData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return transformCameraReviewFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async deleteCameraReview(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('night_supervision_camera_reviews')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // ========== ALERTS ==========

  async getAlertsByShiftId(shiftId: string, includeResolved: boolean = false): Promise<NightSupervisionAlert[]> {
    try {
      let query = supabase
        .from('night_supervision_alerts')
        .select('*')
        .eq('shift_id', shiftId)
        .order('severity', { ascending: false })
        .order('created_at', { ascending: false });

      if (!includeResolved) {
        query = query.eq('resolved', false);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(transformAlertFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async createAlert(alert: Partial<NightSupervisionAlert>): Promise<NightSupervisionAlert> {
    try {
      const alertData = {
        shift_id: alert.shift_id,
        type: alert.type,
        severity: alert.severity || 'medium',
        title: alert.title,
        description: alert.description,
        related_entity_type: alert.related_entity_type || null,
        related_entity_id: alert.related_entity_id || null,
        resolved: alert.resolved !== undefined ? alert.resolved : false,
      };

      const { data, error } = await supabase
        .from('night_supervision_alerts')
        .insert(alertData)
        .select()
        .single();

      if (error) throw error;
      return transformAlertFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async resolveAlert(id: string, resolvedBy: string): Promise<NightSupervisionAlert> {
    try {
      const { data, error } = await supabase
        .from('night_supervision_alerts')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: resolvedBy,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return transformAlertFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // ========== REPORTS ==========

  async getReportByShiftId(shiftId: string): Promise<NightSupervisionReport | null> {
    try {
      const shift = await this.getShiftById(shiftId);
      if (!shift) return null;

      const calls = await this.getCallsByShiftId(shiftId);
      const cameraReviews = await this.getCameraReviewsByShiftId(shiftId);
      const alerts = await this.getAlertsByShiftId(shiftId, true);

      // Calcular estadísticas
      const uniqueWorkers = new Set(calls.map(c => c.worker_id));
      const totalWorkers = uniqueWorkers.size;
      const totalCallsRequired = totalWorkers * 3;
      const totalCallsCompleted = calls.length;
      const totalCallsAnswered = calls.filter(c => c.answered).length;
      const totalPhotosReceived = calls.filter(c => c.photo_received).length;
      const totalCameraReviewsRequired = 3; // Siempre 3 revisiones por turno
      const totalCameraReviewsCompleted = cameraReviews.length;
      const nonConformitiesCount = alerts.filter(a => a.type === 'non_conformity' && !a.resolved).length;
      const criticalEventsCount = alerts.filter(a => a.severity === 'critical' && !a.resolved).length;

      // Calcular porcentaje de completitud
      const callsProgress = totalCallsRequired > 0 ? (totalCallsCompleted / totalCallsRequired) * 50 : 0;
      const cameraProgress = (totalCameraReviewsCompleted / totalCameraReviewsRequired) * 50;
      const completionPercentage = Math.round(callsProgress + cameraProgress);

      return {
        shift_id: shiftId,
        date: shift.date,
        unit_name: shift.unit_name,
        supervisor_name: shift.supervisor_name,
        total_workers: totalWorkers,
        total_calls_required: totalCallsRequired,
        total_calls_completed: totalCallsCompleted,
        total_calls_answered: totalCallsAnswered,
        total_photos_received: totalPhotosReceived,
        total_camera_reviews_required: totalCameraReviewsRequired,
        total_camera_reviews_completed: totalCameraReviewsCompleted,
        non_conformities_count: nonConformitiesCount,
        critical_events_count: criticalEventsCount,
        completion_percentage: completionPercentage,
        calls,
        camera_reviews: cameraReviews,
        alerts,
      };
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // ========== HELPER FUNCTIONS ==========

  async updateShiftCompletion(shiftId: string): Promise<void> {
    try {
      const calls = await this.getCallsByShiftId(shiftId);
      const cameraReviews = await this.getCameraReviewsByShiftId(shiftId);
      const alerts = await this.getAlertsByShiftId(shiftId, false);

      // Calcular porcentaje de completitud
      const uniqueWorkers = new Set(calls.map(c => c.worker_id));
      const totalWorkers = uniqueWorkers.size;
      const totalCallsRequired = totalWorkers * 3;
      const totalCallsCompleted = calls.length;
      const totalCameraReviewsRequired = 3;
      const totalCameraReviewsCompleted = cameraReviews.length;

      const callsProgress = totalCallsRequired > 0 ? (totalCallsCompleted / totalCallsRequired) * 50 : 0;
      const cameraProgress = (totalCameraReviewsCompleted / totalCameraReviewsRequired) * 50;
      const completionPercentage = Math.round(callsProgress + cameraProgress);

      // Determinar estado
      let status: 'en_curso' | 'completada' | 'incompleta' | 'cancelada' = 'en_curso';
      if (completionPercentage === 100 && alerts.length === 0) {
        status = 'completada';
      } else if (completionPercentage < 100 && alerts.some(a => a.severity === 'critical')) {
        status = 'incompleta';
      }

      await this.updateShift(shiftId, {
        completion_percentage: completionPercentage,
        status,
      });
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};

