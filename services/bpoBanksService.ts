import { supabase, handleSupabaseError } from './supabase';
import { BpoBankAccount, BpoBankAccountType, BpoBankStatement, BpoCurrency } from '../types';
import { storageService } from './storageService';

function transformAccountFromDB(data: any): BpoBankAccount {
  return {
    id: data.id,
    unitId: data.unit_id,
    accountType: data.account_type as BpoBankAccountType,
    bankName: data.bank_name,
    accountHolderName: data.account_holder_name || undefined,
    accountNumber: data.account_number || undefined,
    interbankAccount: data.interbank_account || undefined,
    currency: data.currency as BpoCurrency,
    currencyOther: data.currency_other || undefined,
    swiftCode: data.swift_code || undefined,
    providerName: data.provider_name || undefined,
    executiveName: data.executive_name || undefined,
    executivePhone: data.executive_phone || undefined,
    executiveEmail: data.executive_email || undefined,
    notes: data.notes || undefined,
    isActive: data.is_active !== false,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformStatementFromDB(data: any): BpoBankStatement {
  return {
    id: data.id,
    unitId: data.unit_id,
    bankAccountId: data.bank_account_id,
    label: data.label,
    periodMonth: data.period_month || undefined,
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
    const bucketIndex = pathParts.findIndex((part) => part === 'storage');
    if (bucketIndex >= 0 && bucketIndex + 3 < pathParts.length) {
      const bucket = pathParts[bucketIndex + 2];
      const filePath = pathParts.slice(bucketIndex + 3).join('/');
      await supabase.storage.from(bucket).remove([filePath]);
    }
  } catch {
    // omitir si no se puede eliminar del storage
  }
}

export const bpoBanksService = {
  async getAccountsByUnitId(unitId: string): Promise<BpoBankAccount[]> {
    try {
      const { data, error } = await supabase
        .from('unit_bpo_bank_accounts')
        .select('*')
        .eq('unit_id', unitId)
        .order('account_type')
        .order('bank_name');

      if (error) throw error;
      return (data || []).map(transformAccountFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async createAccount(unitId: string, account: Partial<BpoBankAccount>): Promise<BpoBankAccount> {
    try {
      const { data, error } = await supabase
        .from('unit_bpo_bank_accounts')
        .insert({
          unit_id: unitId,
          account_type: account.accountType || 'own',
          bank_name: account.bankName,
          account_holder_name: account.accountHolderName || null,
          account_number: account.accountNumber || null,
          interbank_account: account.interbankAccount || null,
          currency: account.currency || 'PEN',
          currency_other: account.currencyOther || null,
          swift_code: account.swiftCode || null,
          provider_name: account.providerName || null,
          executive_name: account.executiveName || null,
          executive_phone: account.executivePhone || null,
          executive_email: account.executiveEmail || null,
          notes: account.notes || null,
          is_active: account.isActive !== false,
        })
        .select()
        .single();

      if (error) throw error;
      return transformAccountFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async updateAccount(id: string, account: Partial<BpoBankAccount>): Promise<BpoBankAccount> {
    try {
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (account.accountType !== undefined) payload.account_type = account.accountType;
      if (account.bankName !== undefined) payload.bank_name = account.bankName;
      if (account.accountHolderName !== undefined) payload.account_holder_name = account.accountHolderName || null;
      if (account.accountNumber !== undefined) payload.account_number = account.accountNumber || null;
      if (account.interbankAccount !== undefined) payload.interbank_account = account.interbankAccount || null;
      if (account.currency !== undefined) payload.currency = account.currency;
      if (account.currencyOther !== undefined) payload.currency_other = account.currencyOther || null;
      if (account.swiftCode !== undefined) payload.swift_code = account.swiftCode || null;
      if (account.providerName !== undefined) payload.provider_name = account.providerName || null;
      if (account.executiveName !== undefined) payload.executive_name = account.executiveName || null;
      if (account.executivePhone !== undefined) payload.executive_phone = account.executivePhone || null;
      if (account.executiveEmail !== undefined) payload.executive_email = account.executiveEmail || null;
      if (account.notes !== undefined) payload.notes = account.notes || null;
      if (account.isActive !== undefined) payload.is_active = account.isActive;

      const { data, error } = await supabase
        .from('unit_bpo_bank_accounts')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return transformAccountFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async deleteAccount(id: string): Promise<void> {
    try {
      const statements = await this.getStatementsByAccountId(id);
      for (const st of statements) {
        await removeStorageFile(st.fileUrl);
      }
      const { error } = await supabase.from('unit_bpo_bank_accounts').delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async getStatementsByUnitId(unitId: string): Promise<BpoBankStatement[]> {
    try {
      const { data, error } = await supabase
        .from('unit_bpo_bank_statements')
        .select('*')
        .eq('unit_id', unitId)
        .order('period_month', { ascending: false, nullsFirst: false })
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(transformStatementFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async getStatementsByAccountId(accountId: string): Promise<BpoBankStatement[]> {
    try {
      const { data, error } = await supabase
        .from('unit_bpo_bank_statements')
        .select('*')
        .eq('bank_account_id', accountId)
        .order('period_month', { ascending: false, nullsFirst: false })
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(transformStatementFromDB);
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  async uploadStatement(
    unitId: string,
    bankAccountId: string,
    file: File,
    meta: { label: string; periodMonth?: string }
  ): Promise<BpoBankStatement> {
    try {
      const uniqueFileName = storageService.generateUniqueFileName(file.name, 'statement');
      const filePath = `bpo-bank-statements/${unitId}/${bankAccountId}/${uniqueFileName}`;
      const fileUrl = await storageService.uploadFile('unit-images', file, filePath);

      const { authService } = await import('./authService');
      const currentUser = await authService.getCurrentUser();

      const { data, error } = await supabase
        .from('unit_bpo_bank_statements')
        .insert({
          unit_id: unitId,
          bank_account_id: bankAccountId,
          label: meta.label,
          period_month: meta.periodMonth || null,
          file_url: fileUrl,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type || 'application/octet-stream',
          uploaded_by: currentUser?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return transformStatementFromDB(data);
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  async deleteStatement(id: string): Promise<void> {
    try {
      const { data, error: fetchError } = await supabase
        .from('unit_bpo_bank_statements')
        .select('file_url')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (data?.file_url) await removeStorageFile(data.file_url);

      const { error } = await supabase.from('unit_bpo_bank_statements').delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};
