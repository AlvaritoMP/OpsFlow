import { supabase, handleSupabaseError } from './supabase';
import { UnitBook, UnitBookCustomSection, UnitBookMember, UnitBookPhoto } from '../types';
import { storageService } from './storageService';

function parseCustomSections(raw: unknown): UnitBookCustomSection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const title = typeof row.title === 'string' ? row.title : '';
      const body = typeof row.body === 'string' ? row.body : '';
      const id = typeof row.id === 'string' && row.id ? row.id : `sec-${Date.now()}`;
      return { id, title, body };
    })
    .filter((s): s is UnitBookCustomSection => s !== null);
}

function transformBook(data: any): UnitBook {
  return {
    id: data.id,
    unitId: data.unit_id,
    serviceObjective: data.service_objective || undefined,
    floorCount: data.floor_count ?? null,
    welcomeMessage: data.welcome_message || undefined,
    workSchedule: data.work_schedule || undefined,
    dressCode: data.dress_code || undefined,
    accessInstructions: data.access_instructions || undefined,
    importantNotes: data.important_notes || undefined,
    customSections: parseCustomSections(data.custom_sections),
    updatedBy: data.updated_by || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformPhoto(data: any): UnitBookPhoto {
  return {
    id: data.id,
    unitId: data.unit_id,
    imageUrl: data.image_url,
    caption: data.caption || undefined,
    displayOrder: data.display_order ?? 0,
    createdAt: data.created_at,
  };
}

function transformMember(data: any): UnitBookMember {
  return {
    id: data.id,
    unitId: data.unit_id,
    resourceId: data.resource_id,
    functions: data.functions || undefined,
    experience: data.experience || undefined,
    workZone: data.work_zone || undefined,
    colleagueMessage: data.colleague_message || undefined,
    includeInBook: data.include_in_book !== false,
    displayOrder: data.display_order ?? 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function emptyBook(unitId: string): UnitBook {
  const now = new Date().toISOString();
  return {
    id: '',
    unitId,
    customSections: [],
    floorCount: null,
    createdAt: now,
    updatedAt: now,
  };
}

export const unitBookService = {
  async getByUnitId(unitId: string): Promise<UnitBook | null> {
    try {
      const { data, error } = await supabase
        .from('unit_books')
        .select('*')
        .eq('unit_id', unitId)
        .maybeSingle();

      if (error) throw error;
      return data ? transformBook(data) : null;
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  async getOrCreate(unitId: string): Promise<UnitBook> {
    const existing = await this.getByUnitId(unitId);
    if (existing) return existing;

    try {
      const { data, error } = await supabase
        .from('unit_books')
        .insert({
          unit_id: unitId,
          custom_sections: [],
        })
        .select()
        .single();

      if (error) {
        // Carrera: otro cliente lo creó al mismo tiempo
        if (error.code === '23505') {
          const again = await this.getByUnitId(unitId);
          if (again) return again;
        }
        throw error;
      }
      return transformBook(data);
    } catch (error) {
      handleSupabaseError(error);
      return emptyBook(unitId);
    }
  },

  async saveBook(unitId: string, book: Partial<UnitBook>, updatedBy?: string): Promise<UnitBook> {
    try {
      const payload: Record<string, unknown> = {
        unit_id: unitId,
        service_objective: book.serviceObjective?.trim() || null,
        floor_count: book.floorCount === undefined || book.floorCount === null || Number.isNaN(book.floorCount)
          ? null
          : Number(book.floorCount),
        welcome_message: book.welcomeMessage?.trim() || null,
        work_schedule: book.workSchedule?.trim() || null,
        dress_code: book.dressCode?.trim() || null,
        access_instructions: book.accessInstructions?.trim() || null,
        important_notes: book.importantNotes?.trim() || null,
        custom_sections: (book.customSections || []).map((s) => ({
          id: s.id,
          title: (s.title || '').trim(),
          body: (s.body || '').trim(),
        })),
        updated_at: new Date().toISOString(),
      };
      if (updatedBy) payload.updated_by = updatedBy;

      const { data, error } = await supabase
        .from('unit_books')
        .upsert(payload, { onConflict: 'unit_id' })
        .select()
        .single();

      if (error) throw error;
      return transformBook(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async getPhotos(unitId: string): Promise<UnitBookPhoto[]> {
    try {
      const { data, error } = await supabase
        .from('unit_book_photos')
        .select('*')
        .eq('unit_id', unitId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []).map(transformPhoto);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async addPhoto(unitId: string, file: File, caption?: string): Promise<UnitBookPhoto> {
    const unique = storageService.generateUniqueFileName(file.name, 'book');
    const path = `unit-books/${unitId}/${unique}`;
    const persisted = await storageService.persistImage(file, { bucket: 'unit-images', path });

    const existing = await this.getPhotos(unitId);
    const nextOrder = existing.length === 0 ? 0 : Math.max(...existing.map((p) => p.displayOrder)) + 1;

    try {
      const { data, error } = await supabase
        .from('unit_book_photos')
        .insert({
          unit_id: unitId,
          image_url: persisted.url,
          caption: caption?.trim() || null,
          display_order: nextOrder,
        })
        .select()
        .single();

      if (error) throw error;
      return transformPhoto(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async addPhotoFromUrl(unitId: string, imageUrl: string, caption?: string, displayOrder?: number): Promise<UnitBookPhoto> {
    try {
      const { data, error } = await supabase
        .from('unit_book_photos')
        .insert({
          unit_id: unitId,
          image_url: imageUrl,
          caption: caption?.trim() || null,
          display_order: displayOrder ?? 0,
        })
        .select()
        .single();

      if (error) throw error;
      return transformPhoto(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async updatePhoto(id: string, patch: { caption?: string; displayOrder?: number }): Promise<UnitBookPhoto> {
    try {
      const payload: Record<string, unknown> = {};
      if (patch.caption !== undefined) payload.caption = patch.caption.trim() || null;
      if (patch.displayOrder !== undefined) payload.display_order = patch.displayOrder;

      const { data, error } = await supabase
        .from('unit_book_photos')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return transformPhoto(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async deletePhoto(photo: UnitBookPhoto): Promise<void> {
    try {
      const { error } = await supabase.from('unit_book_photos').delete().eq('id', photo.id);
      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }

    if (photo.imageUrl.includes('/unit-books/')) {
      try {
        const urlPattern = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;
        const match = photo.imageUrl.match(urlPattern);
        if (match) {
          await storageService.deleteFile(match[1], decodeURIComponent(match[2]));
        }
      } catch {
        // La fila ya se eliminó; no bloquear si Storage falla
      }
    }
  },

  async getMembers(unitId: string): Promise<UnitBookMember[]> {
    try {
      const { data, error } = await supabase
        .from('unit_book_members')
        .select('*')
        .eq('unit_id', unitId)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return (data || []).map(transformMember);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async upsertMember(unitId: string, resourceId: string, patch: Partial<UnitBookMember>): Promise<UnitBookMember> {
    try {
      const payload: Record<string, unknown> = {
        unit_id: unitId,
        resource_id: resourceId,
        updated_at: new Date().toISOString(),
      };
      if (patch.functions !== undefined) payload.functions = patch.functions.trim() || null;
      if (patch.experience !== undefined) payload.experience = patch.experience.trim() || null;
      if (patch.workZone !== undefined) payload.work_zone = patch.workZone.trim() || null;
      if (patch.colleagueMessage !== undefined) payload.colleague_message = patch.colleagueMessage.trim() || null;
      if (patch.includeInBook !== undefined) payload.include_in_book = patch.includeInBook;
      if (patch.displayOrder !== undefined) payload.display_order = patch.displayOrder;

      const { data, error } = await supabase
        .from('unit_book_members')
        .upsert(payload, { onConflict: 'unit_id,resource_id' })
        .select()
        .single();

      if (error) throw error;
      return transformMember(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};
