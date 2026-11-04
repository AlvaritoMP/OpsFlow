import { supabase, handleSupabaseError } from './supabase';
import {
  Training,
  TrainingCertificate,
  TrainingDocumentType,
  TrainingTopic,
} from '../types';

const CERTIFICATE_CODE_RE = /^(CERT|ACTA)-\d{4}-\d+$/;

export function isTrainingCertificateCode(value?: string | null): boolean {
  return !!value && CERTIFICATE_CODE_RE.test(value.trim());
}

function missingTableMessage(error: any): string | null {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const missing =
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('could not find the table');
  if (!missing) return null;
  return 'Falta crear las tablas de capacitaciones. Ejecuta database/migrations/create_training_certificates.sql en el SQL Editor de Supabase y vuelve a intentar.';
}

function throwMapped(error: any): never {
  const friendly = missingTableMessage(error);
  if (friendly) throw new Error(friendly);
  handleSupabaseError(error);
  throw error;
}

function mapTopic(row: any, positionIds: string[]): TrainingTopic {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    hours: row.hours != null ? Number(row.hours) : undefined,
    isActive: row.is_active !== false,
    positionIds,
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
  };
}

function mapCertificate(row: any): TrainingCertificate {
  const date = String(row.training_date || '').slice(0, 10);
  return {
    id: row.id,
    code: row.code,
    documentType: row.document_type as TrainingDocumentType,
    topicId: row.topic_id || undefined,
    topicName: row.topic_name,
    description: row.description || undefined,
    hours: row.hours != null ? Number(row.hours) : undefined,
    resourceId: row.resource_id,
    unitId: row.unit_id,
    workerName: row.worker_name,
    workerDni: row.worker_dni || undefined,
    positionName: row.position_name || undefined,
    unitName: row.unit_name,
    clientName: row.client_name || undefined,
    trainingDate: date,
    status: row.status === 'Programado' ? 'Programado' : 'Completado',
    score: row.score != null ? Number(row.score) : undefined,
    instructor: row.instructor || undefined,
    notes: row.notes || undefined,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at || undefined,
  };
}

export interface IssueTrainingInput {
  documentType: TrainingDocumentType;
  topicId?: string;
  topicName: string;
  description?: string;
  hours?: number;
  trainingDate: string;
  status: 'Completado' | 'Programado';
  score?: number;
  instructor?: string;
  notes?: string;
  createdBy?: string;
  workers: Array<{
    resourceId: string;
    workerName: string;
    workerDni?: string;
    positionName?: string;
    unitId: string;
    unitName: string;
    clientName?: string;
  }>;
}

async function nextSerial(prefix: 'CERT' | 'ACTA', year: number): Promise<number> {
  const { data, error } = await (supabase as any)
    .from('training_certificates')
    .select('code')
    .like('code', `${prefix}-${year}-%`)
    .order('code', { ascending: false })
    .limit(1);
  if (error) throwMapped(error);
  const last = data?.[0]?.code as string | undefined;
  if (!last) return 1;
  const n = Number(last.split('-').pop());
  return Number.isFinite(n) ? n + 1 : 1;
}

export const trainingService = {
  async listTopics(): Promise<TrainingTopic[]> {
    const [{ data: topics, error: topicError }, { data: links, error: linkError }] = await Promise.all([
      (supabase as any).from('training_topics').select('*').order('name', { ascending: true }),
      (supabase as any).from('training_topic_positions').select('topic_id, position_id'),
    ]);
    if (topicError) throwMapped(topicError);
    if (linkError) throwMapped(linkError);
    const byTopic = new Map<string, string[]>();
    for (const link of links || []) {
      const list = byTopic.get(link.topic_id) || [];
      list.push(link.position_id);
      byTopic.set(link.topic_id, list);
    }
    return (topics || []).map((row) => mapTopic(row, byTopic.get(row.id) || []));
  },

  async saveTopic(input: {
    id?: string;
    name: string;
    description?: string;
    hours?: number;
    isActive: boolean;
    positionIds: string[];
  }): Promise<TrainingTopic> {
    const payload = {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      hours: input.hours ?? null,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    };
    let topicId = input.id;
    if (topicId) {
      const { error } = await (supabase as any).from('training_topics').update(payload).eq('id', topicId);
      if (error) throwMapped(error);
    } else {
      const { data, error } = await (supabase as any).from('training_topics').insert(payload).select('id').single();
      if (error) throwMapped(error);
      topicId = data.id;
    }

    const { error: deleteError } = await (supabase as any)
      .from('training_topic_positions')
      .delete()
      .eq('topic_id', topicId);
    if (deleteError) throwMapped(deleteError);

    if (input.positionIds.length > 0) {
      const { error: insertError } = await (supabase as any).from('training_topic_positions').insert(
        input.positionIds.map((positionId) => ({ topic_id: topicId, position_id: positionId }))
      );
      if (insertError) throwMapped(insertError);
    }

    return {
      id: topicId!,
      name: payload.name,
      description: input.description?.trim() || undefined,
      hours: input.hours,
      isActive: input.isActive,
      positionIds: input.positionIds,
    };
  },

  async deleteTopic(id: string): Promise<void> {
    const { error } = await (supabase as any).from('training_topics').delete().eq('id', id);
    if (error) throwMapped(error);
  },

  async listCertificates(unitIds: string[], resourceIds: string[] = []): Promise<TrainingCertificate[]> {
    if (unitIds.length === 0 && resourceIds.length === 0) return [];
    const rows: any[] = [];
    const pull = async (column: 'unit_id' | 'resource_id', ids: string[]) => {
      for (let i = 0; i < ids.length; i += 80) {
        const slice = ids.slice(i, i + 80);
        const { data, error } = await (supabase as any)
          .from('training_certificates')
          .select('*')
          .in(column, slice);
        if (error) throwMapped(error);
        rows.push(...(data || []));
      }
    };
    await pull('unit_id', unitIds);
    await pull('resource_id', resourceIds);
    const seen = new Set<string>();
    const unique = rows.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
    rows.length = 0;
    rows.push(...unique);
    rows.sort((a, b) => {
      const byDate = String(b.training_date).localeCompare(String(a.training_date));
      if (byDate !== 0) return byDate;
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    return rows.map(mapCertificate);
  },

  async getByCode(code: string): Promise<TrainingCertificate | null> {
    const { data, error } = await (supabase as any)
      .from('training_certificates')
      .select('*')
      .eq('code', code)
      .maybeSingle();
    if (error) throwMapped(error);
    return data ? mapCertificate(data) : null;
  },

  async issue(input: IssueTrainingInput): Promise<{ certificates: TrainingCertificate[]; trainings: Array<{ resourceId: string; training: Training }> }> {
    if (input.workers.length === 0) throw new Error('Selecciona al menos un trabajador.');
    const topicName = input.topicName.trim();
    if (!topicName) throw new Error('Indica el tema de la capacitación.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.trainingDate)) throw new Error('La fecha de la capacitación no es válida.');

    const year = Number(input.trainingDate.slice(0, 4));
    const prefix = input.documentType === 'acta' ? 'ACTA' : 'CERT';
    let serial = await nextSerial(prefix, year);

    const rows = input.workers.map((worker) => {
      const code = `${prefix}-${year}-${String(serial).padStart(4, '0')}`;
      serial += 1;
      return {
        code,
        document_type: input.documentType,
        topic_id: input.topicId || null,
        topic_name: topicName,
        description: input.description?.trim() || null,
        hours: input.hours ?? null,
        resource_id: worker.resourceId,
        unit_id: worker.unitId,
        worker_name: worker.workerName,
        worker_dni: worker.workerDni || null,
        position_name: worker.positionName || null,
        unit_name: worker.unitName,
        client_name: worker.clientName || null,
        training_date: input.trainingDate,
        status: input.status,
        score: input.score ?? null,
        instructor: input.instructor?.trim() || null,
        notes: input.notes?.trim() || null,
        created_by: input.createdBy || null,
      };
    });

    const { data: createdRows, error } = await (supabase as any)
      .from('training_certificates')
      .insert(rows)
      .select('*');
    if (error) throwMapped(error);
    const certificates = (createdRows || []).map(mapCertificate);

    try {
      const trainingRows = certificates.map((certificate) => ({
        resource_id: certificate.resourceId,
        topic: certificate.topicName,
        date: certificate.trainingDate,
        status: certificate.status,
        score: certificate.score ?? null,
        certificate_url: certificate.code,
      }));
      const { data: trainingData, error: trainingError } = await (supabase as any)
        .from('trainings')
        .insert(trainingRows)
        .select('id, resource_id, topic, date, status, score, certificate_url');
      if (trainingError) throw trainingError;

      const trainings = (trainingData || []).map((row: any) => ({
        resourceId: row.resource_id as string,
        training: {
          id: row.id as string,
          topic: row.topic as string,
          date: String(row.date).slice(0, 10),
          status: row.status as Training['status'],
          score: row.score != null ? Number(row.score) : undefined,
          certificateUrl: row.certificate_url || undefined,
        } satisfies Training,
      }));

      return { certificates, trainings };
    } catch (trainingError) {
      await (supabase as any).from('training_certificates').delete().in('id', certificates.map((item) => item.id));
      throwMapped(trainingError);
    }
  },

  async deleteCertificate(id: string): Promise<TrainingCertificate | null> {
    const { data, error } = await (supabase as any)
      .from('training_certificates')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throwMapped(error);
    if (!data) return null;
    const certificate = mapCertificate(data);

    const { error: trainingError } = await (supabase as any)
      .from('trainings')
      .delete()
      .eq('resource_id', certificate.resourceId)
      .eq('certificate_url', certificate.code);
    if (trainingError) throwMapped(trainingError);

    const { error: deleteError } = await (supabase as any).from('training_certificates').delete().eq('id', id);
    if (deleteError) throwMapped(deleteError);
    return certificate;
  },

  async deleteByCode(code: string): Promise<void> {
    if (!isTrainingCertificateCode(code)) return;
    const { error } = await (supabase as any).from('training_certificates').delete().eq('code', code);
    if (error) throwMapped(error);
  },
};
