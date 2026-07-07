import { supabase, handleSupabaseError } from './supabase';
import { BpoContactCategory, BpoUnitContact } from '../types';

function transformContactFromDB(data: any): BpoUnitContact {
  return {
    id: data.id,
    unitId: data.unit_id,
    category: data.category as BpoContactCategory,
    name: data.name,
    phone: data.phone || undefined,
    email: data.email || undefined,
    organization: data.organization || undefined,
    roleTitle: data.role_title || undefined,
    notes: data.notes || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export const bpoContactsService = {
  async getByUnitId(unitId: string): Promise<BpoUnitContact[]> {
    try {
      const { data, error } = await supabase
        .from('unit_bpo_contacts')
        .select('*')
        .eq('unit_id', unitId)
        .order('category')
        .order('name');

      if (error) throw error;
      return (data || []).map(transformContactFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async create(unitId: string, contact: Partial<BpoUnitContact>): Promise<BpoUnitContact> {
    try {
      const { data, error } = await supabase
        .from('unit_bpo_contacts')
        .insert({
          unit_id: unitId,
          category: contact.category || 'other',
          name: contact.name,
          phone: contact.phone || null,
          email: contact.email || null,
          organization: contact.organization || null,
          role_title: contact.roleTitle || null,
          notes: contact.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      return transformContactFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async update(id: string, contact: Partial<BpoUnitContact>): Promise<BpoUnitContact> {
    try {
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (contact.category !== undefined) payload.category = contact.category;
      if (contact.name !== undefined) payload.name = contact.name;
      if (contact.phone !== undefined) payload.phone = contact.phone || null;
      if (contact.email !== undefined) payload.email = contact.email || null;
      if (contact.organization !== undefined) payload.organization = contact.organization || null;
      if (contact.roleTitle !== undefined) payload.role_title = contact.roleTitle || null;
      if (contact.notes !== undefined) payload.notes = contact.notes || null;

      const { data, error } = await supabase
        .from('unit_bpo_contacts')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return transformContactFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('unit_bpo_contacts').delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};
