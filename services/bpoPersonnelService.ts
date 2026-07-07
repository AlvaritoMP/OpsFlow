import { supabase, handleSupabaseError } from './supabase';
import { storageService } from './storageService';
import {
  BpoPersonnelProfile,
  BpoPersonnelDependent,
  BpoPersonnelDocument,
  BpoDependentRelationship,
  BpoPersonnelDocumentCategory,
} from '../types';

function transformProfileFromDB(data: any): BpoPersonnelProfile {
  return {
    resourceId: data.resource_id,
    unitId: data.unit_id,
    nationality: data.nationality || undefined,
    address: data.address || undefined,
    maritalStatus: data.marital_status || undefined,
    gender: data.gender || undefined,
    afpName: data.afp_name || undefined,
    afpAffiliationDate: data.afp_affiliation_date || undefined,
    afpEmail: data.afp_email || undefined,
    afpCuspp: data.afp_cuspp || undefined,
    emergencyContactName: data.emergency_contact_name || undefined,
    emergencyContactPhone: data.emergency_contact_phone || undefined,
    emergencyContactRelationship: data.emergency_contact_relationship || undefined,
    educationLevel: data.education_level || undefined,
    educationInstitution: data.education_institution || undefined,
    educationCareer: data.education_career || undefined,
    educationCompletionYear: data.education_completion_year ?? undefined,
    notes: data.notes || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformDependentFromDB(data: any): BpoPersonnelDependent {
  return {
    id: data.id,
    resourceId: data.resource_id,
    unitId: data.unit_id,
    relationship: data.relationship,
    fullName: data.full_name,
    documentType: data.document_type || undefined,
    documentNumber: data.document_number || undefined,
    birthDate: data.birth_date || undefined,
    isDependent: data.is_dependent !== false,
    notes: data.notes || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformDocumentFromDB(data: any): BpoPersonnelDocument {
  return {
    id: data.id,
    resourceId: data.resource_id,
    unitId: data.unit_id,
    dependentId: data.dependent_id || undefined,
    category: data.category,
    name: data.name,
    description: data.description || undefined,
    fileUrl: data.file_url,
    fileName: data.file_name,
    fileSize: Number(data.file_size) || 0,
    mimeType: data.mime_type || undefined,
    uploadedAt: data.uploaded_at,
    uploadedBy: data.uploaded_by || undefined,
  };
}

async function removeStorageFile(fileUrl: string): Promise<void> {
  try {
    const url = new URL(fileUrl);
    const pathParts = url.pathname.split('/');
    const bucketIndex = pathParts.findIndex((p) => p === 'storage');
    if (bucketIndex >= 0 && bucketIndex + 3 < pathParts.length) {
      const bucket = pathParts[bucketIndex + 2];
      const filePath = pathParts.slice(bucketIndex + 3).join('/');
      await supabase.storage.from(bucket).remove([filePath]);
    }
  } catch {
    // omitir
  }
}

const MARITAL_STATUSES = ['soltero', 'casado', 'conviviente', 'divorciado', 'viudo', 'otro'] as const;
const EDUCATION_LEVELS = [
  'sin_estudios', 'primaria', 'secundaria', 'tecnico',
  'universitario_incompleto', 'universitario_completo', 'postgrado', 'otro',
] as const;

function toNullableText(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function toNullableDate(value?: string | null): string | null {
  const text = toNullableText(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function toNullableEnum<T extends string>(value: T | undefined | null, allowed: readonly T[]): T | null {
  if (!value) return null;
  const trimmed = String(value).trim() as T;
  return allowed.includes(trimmed) ? trimmed : null;
}

function toNullableYear(value?: number | null): number | null {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  const year = Math.trunc(Number(value));
  if (year < 1900 || year > 2100) return null;
  return year;
}

function buildProfilePayload(resourceId: string, unitId: string, profile: Partial<BpoPersonnelProfile>) {
  return {
    resource_id: resourceId,
    unit_id: unitId,
    nationality: toNullableText(profile.nationality),
    address: toNullableText(profile.address),
    marital_status: toNullableEnum(profile.maritalStatus, MARITAL_STATUSES),
    gender: toNullableText(profile.gender),
    afp_name: toNullableText(profile.afpName),
    afp_affiliation_date: toNullableDate(profile.afpAffiliationDate),
    afp_email: toNullableText(profile.afpEmail),
    afp_cuspp: toNullableText(profile.afpCuspp),
    emergency_contact_name: toNullableText(profile.emergencyContactName),
    emergency_contact_phone: toNullableText(profile.emergencyContactPhone),
    emergency_contact_relationship: toNullableText(profile.emergencyContactRelationship),
    education_level: toNullableEnum(profile.educationLevel, EDUCATION_LEVELS),
    education_institution: toNullableText(profile.educationInstitution),
    education_career: toNullableText(profile.educationCareer),
    education_completion_year: toNullableYear(profile.educationCompletionYear),
    notes: toNullableText(profile.notes),
    updated_at: new Date().toISOString(),
  };
}

export const bpoPersonnelService = {
  async getProfile(resourceId: string): Promise<BpoPersonnelProfile | null> {
    const { data, error } = await supabase
      .from('resource_bpo_profiles')
      .select('*')
      .eq('resource_id', resourceId)
      .maybeSingle();

    if (error) throw error;
    return data ? transformProfileFromDB(data) : null;
  },

  async upsertProfile(
    resourceId: string,
    unitId: string,
    profile: Partial<BpoPersonnelProfile>
  ): Promise<BpoPersonnelProfile> {
    const payload = buildProfilePayload(resourceId, unitId, profile);

    const { data, error } = await supabase
      .from('resource_bpo_profiles')
      .upsert(payload, { onConflict: 'resource_id' })
      .select()
      .single();

    if (error) throw error;
    return transformProfileFromDB(data);
  },

  async getDependents(resourceId: string): Promise<BpoPersonnelDependent[]> {
    try {
      const { data, error } = await supabase
        .from('resource_bpo_dependents')
        .select('*')
        .eq('resource_id', resourceId)
        .order('full_name');

      if (error) throw error;
      return (data || []).map(transformDependentFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async createDependent(
    resourceId: string,
    unitId: string,
    dependent: Partial<BpoPersonnelDependent>
  ): Promise<BpoPersonnelDependent> {
    try {
      const { data, error } = await supabase
        .from('resource_bpo_dependents')
        .insert({
          resource_id: resourceId,
          unit_id: unitId,
          relationship: dependent.relationship || 'otro',
          full_name: dependent.fullName,
          document_type: dependent.documentType || 'DNI',
          document_number: dependent.documentNumber || null,
          birth_date: dependent.birthDate || null,
          is_dependent: dependent.isDependent !== false,
          notes: dependent.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      return transformDependentFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async updateDependent(id: string, dependent: Partial<BpoPersonnelDependent>): Promise<BpoPersonnelDependent> {
    try {
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (dependent.relationship !== undefined) payload.relationship = dependent.relationship;
      if (dependent.fullName !== undefined) payload.full_name = dependent.fullName;
      if (dependent.documentType !== undefined) payload.document_type = dependent.documentType || 'DNI';
      if (dependent.documentNumber !== undefined) payload.document_number = dependent.documentNumber || null;
      if (dependent.birthDate !== undefined) payload.birth_date = dependent.birthDate || null;
      if (dependent.isDependent !== undefined) payload.is_dependent = dependent.isDependent;
      if (dependent.notes !== undefined) payload.notes = dependent.notes || null;

      const { data, error } = await supabase
        .from('resource_bpo_dependents')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return transformDependentFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async deleteDependent(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('resource_bpo_dependents').delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async getDocuments(resourceId: string): Promise<BpoPersonnelDocument[]> {
    try {
      const { data, error } = await supabase
        .from('resource_bpo_personnel_documents')
        .select('*')
        .eq('resource_id', resourceId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(transformDocumentFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async uploadDocument(
    resourceId: string,
    unitId: string,
    file: File,
    meta: {
      name: string;
      category: BpoPersonnelDocumentCategory;
      description?: string;
      dependentId?: string;
    }
  ): Promise<BpoPersonnelDocument> {
    try {
      const uniqueFileName = storageService.generateUniqueFileName(file.name, 'bpo-doc');
      const filePath = `bpo-personnel/${unitId}/${resourceId}/${uniqueFileName}`;
      const fileUrl = await storageService.uploadFile('unit-images', file, filePath);

      const { authService } = await import('./authService');
      const currentUser = await authService.getCurrentUser();

      const { data, error } = await supabase
        .from('resource_bpo_personnel_documents')
        .insert({
          resource_id: resourceId,
          unit_id: unitId,
          dependent_id: meta.dependentId || null,
          category: meta.category,
          name: meta.name,
          description: meta.description || null,
          file_url: fileUrl,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
          uploaded_by: currentUser?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return transformDocumentFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async deleteDocument(id: string): Promise<void> {
    try {
      const { data, error: fetchError } = await supabase
        .from('resource_bpo_personnel_documents')
        .select('file_url')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (data?.file_url) await removeStorageFile(data.file_url);

      const { error } = await supabase.from('resource_bpo_personnel_documents').delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};
