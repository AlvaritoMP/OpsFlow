// Servicio para generar reportes históricos de supervisión nocturna
import { supabase, handleSupabaseError } from './supabase';
import { NightSupervisionShift, NightSupervisionCall, NightSupervisionCameraReview } from '../types';

export interface HistoricalReportByWorker {
  worker_id: string;
  worker_name: string;
  total_shifts: number;
  total_calls_required: number;
  total_calls_completed: number;
  total_calls_answered: number;
  total_photos_received: number;
  total_on_rest_days: number;
  total_non_conformities: number;
  average_completion_percentage: number;
  shifts: Array<{
    date: string;
    unit_name: string;
    supervisor_name: string;
    calls: NightSupervisionCall[];
    completion_percentage: number;
  }>;
}

export interface HistoricalReportByUnit {
  unit_id: string;
  unit_name: string;
  total_shifts: number;
  total_workers: number;
  total_calls_required: number;
  total_calls_completed: number;
  total_calls_answered: number;
  total_photos_received: number;
  total_camera_reviews_required: number;
  total_camera_reviews_completed: number;
  total_non_conformities: number;
  average_completion_percentage: number;
  shifts: Array<{
    date: string;
    supervisor_name: string;
    completion_percentage: number;
    calls_count: number;
    camera_reviews_count: number;
  }>;
}

export const nightSupervisionHistoricalService = {
  // Reporte histórico por trabajador
  async getHistoricalReportByWorker(
    workerId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<HistoricalReportByWorker | null> {
    try {
      let query = supabase
        .from('night_supervision_calls')
        .select('*, night_supervision_shifts(*)')
        .eq('worker_id', workerId);

      if (dateFrom) {
        query = query.gte('night_supervision_shifts.date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('night_supervision_shifts.date', dateTo);
      }

      const { data, error } = await query.order('night_supervision_shifts.date', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return null;

      // Agrupar por turno
      const shiftsMap = new Map<string, any>();
      data.forEach((call: any) => {
        const shift = call.night_supervision_shifts;
        if (!shift) return;

        if (!shiftsMap.has(shift.id)) {
          shiftsMap.set(shift.id, {
            date: shift.date,
            unit_name: shift.unit_name,
            supervisor_name: shift.supervisor_name,
            calls: [],
            completion_percentage: shift.completion_percentage || 0,
          });
        }
        shiftsMap.get(shift.id)!.calls.push(call);
      });

      const shifts = Array.from(shiftsMap.values());
      const firstCall = data[0];
      const workerName = firstCall.worker_name;

      // Calcular estadísticas
      const totalShifts = shifts.length;
      const totalCallsRequired = totalShifts * 3;
      const totalCallsCompleted = data.length;
      const totalCallsAnswered = data.filter((c: any) => c.answered).length;
      const totalPhotosReceived = data.filter((c: any) => c.photo_received).length;
      const totalOnRestDays = data.filter((c: any) => c.on_rest).length;
      const totalNonConformities = data.filter((c: any) => c.non_conformity).length;
      const averageCompletionPercentage = shifts.length > 0
        ? Math.round(shifts.reduce((sum, s) => sum + s.completion_percentage, 0) / shifts.length)
        : 0;

      return {
        worker_id: workerId,
        worker_name: workerName,
        total_shifts: totalShifts,
        total_calls_required: totalCallsRequired,
        total_calls_completed: totalCallsCompleted,
        total_calls_answered: totalCallsAnswered,
        total_photos_received: totalPhotosReceived,
        total_on_rest_days: totalOnRestDays,
        total_non_conformities: totalNonConformities,
        average_completion_percentage: averageCompletionPercentage,
        shifts,
      };
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Reporte histórico por unidad
  async getHistoricalReportByUnit(
    unitId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<HistoricalReportByUnit | null> {
    try {
      let query = supabase
        .from('night_supervision_shifts')
        .select('*, night_supervision_calls(*), night_supervision_camera_reviews(*)')
        .eq('unit_id', unitId);

      if (dateFrom) {
        query = query.gte('date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('date', dateTo);
      }

      const { data, error } = await query.order('date', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const firstShift = data[0];
      const unitName = firstShift.unit_name;

      // Calcular estadísticas
      const totalShifts = data.length;
      const uniqueWorkers = new Set<string>();
      let totalCallsRequired = 0;
      let totalCallsCompleted = 0;
      let totalCallsAnswered = 0;
      let totalPhotosReceived = 0;
      let totalCameraReviewsRequired = 0;
      let totalCameraReviewsCompleted = 0;
      let totalNonConformities = 0;
      let totalCompletionPercentage = 0;

      const shifts = data.map((shift: any) => {
        const calls = shift.night_supervision_calls || [];
        const reviews = shift.night_supervision_camera_reviews || [];

        calls.forEach((call: any) => {
          uniqueWorkers.add(call.worker_id);
          if (call.answered) totalCallsAnswered++;
          if (call.photo_received) totalPhotosReceived++;
          if (call.non_conformity) totalNonConformities++;
        });

        const workersInShift = new Set(calls.map((c: any) => c.worker_id)).size;
        totalCallsRequired += workersInShift * 3;
        totalCallsCompleted += calls.length;
        totalCameraReviewsRequired += 3;
        totalCameraReviewsCompleted += reviews.length;
        totalCompletionPercentage += shift.completion_percentage || 0;

        return {
          date: shift.date,
          supervisor_name: shift.supervisor_name,
          completion_percentage: shift.completion_percentage || 0,
          calls_count: calls.length,
          camera_reviews_count: reviews.length,
        };
      });

      const totalWorkers = uniqueWorkers.size;
      const averageCompletionPercentage = totalShifts > 0
        ? Math.round(totalCompletionPercentage / totalShifts)
        : 0;

      return {
        unit_id: unitId,
        unit_name: unitName,
        total_shifts: totalShifts,
        total_workers: totalWorkers,
        total_calls_required: totalCallsRequired,
        total_calls_completed: totalCallsCompleted,
        total_calls_answered: totalCallsAnswered,
        total_photos_received: totalPhotosReceived,
        total_camera_reviews_required: totalCameraReviewsRequired,
        total_camera_reviews_completed: totalCameraReviewsCompleted,
        total_non_conformities: totalNonConformities,
        average_completion_percentage: averageCompletionPercentage,
        shifts,
      };
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },
};

