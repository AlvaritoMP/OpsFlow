import { supabase, handleSupabaseError } from './supabase';
import { Client, ClientRepresentative } from '../types';

// Tipos para la base de datos
interface ClientRow {
  id: string;
  name: string;
  ruc: string;
  created_at?: string;
  updated_at?: string;
}

interface ClientRepresentativeRow {
  id: string;
  client_id: string;
  name: string;
  phone: string;
  email: string;
  created_at?: string;
}

// ============================================
// CRUD PARA CLIENTS
// ============================================

export const clientsService = {
  // Obtener todos los clientes
  async getAll(): Promise<Client[]> {
    try {
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true });

      if (clientsError) throw clientsError;

      if (!clientsData || clientsData.length === 0) return [];

      // Obtener representantes para cada cliente
      const clientsWithRepresentatives = await Promise.all(
        clientsData.map(async (client) => {
          const { data: representativesData } = await supabase
            .from('client_representatives')
            .select('*')
            .eq('client_id', client.id)
            .order('name', { ascending: true });

          return transformClientFromDB(client, representativesData || []);
        })
      );

      return clientsWithRepresentatives;
    } catch (error) {
      handleSupabaseError(error);
      return [];
    }
  },

  // Obtener un cliente por ID
  async getById(id: string): Promise<Client | null> {
    try {
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();

      if (clientError) {
        if (clientError.code === 'PGRST116') return null; // No encontrado
        throw clientError;
      }

      if (!clientData) return null;

      // Obtener representantes
      const { data: representativesData } = await supabase
        .from('client_representatives')
        .select('*')
        .eq('client_id', id)
        .order('name', { ascending: true });

      return transformClientFromDB(clientData, representativesData || []);
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Obtener un cliente por nombre
  async getByName(name: string): Promise<Client | null> {
    try {
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('name', name)
        .single();

      if (clientError) {
        if (clientError.code === 'PGRST116') return null;
        throw clientError;
      }

      if (!clientData) return null;

      const { data: representativesData } = await supabase
        .from('client_representatives')
        .select('*')
        .eq('client_id', clientData.id)
        .order('name', { ascending: true });

      return transformClientFromDB(clientData, representativesData || []);
    } catch (error) {
      handleSupabaseError(error);
      return null;
    }
  },

  // Crear un cliente
  async create(client: Partial<Client>): Promise<Client> {
    try {
      if (!client.name || !client.ruc) {
        throw new Error('El nombre y RUC del cliente son requeridos');
      }

      const clientData: Partial<ClientRow> = {
        name: client.name,
        ruc: client.ruc,
      };

      const { data: createdClient, error: createError } = await supabase
        .from('clients')
        .insert(clientData)
        .select()
        .single();

      if (createError) throw createError;

      // Crear representantes si existen
      if (client.representatives && client.representatives.length > 0) {
        const representativesData = client.representatives.map((rep) => ({
          client_id: createdClient.id,
          name: rep.name,
          phone: rep.phone,
          email: rep.email,
        }));

        const { error: repsError } = await supabase
          .from('client_representatives')
          .insert(representativesData);

        if (repsError) {
          // Si falla al crear representantes, eliminar el cliente creado
          await supabase.from('clients').delete().eq('id', createdClient.id);
          throw repsError;
        }
      }

      return await this.getById(createdClient.id) || client as Client;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Actualizar un cliente
  async update(id: string, client: Partial<Client>): Promise<Client> {
    try {
      const clientData: Partial<ClientRow> = {};
      if (client.name) clientData.name = client.name;
      if (client.ruc) clientData.ruc = client.ruc;

      if (Object.keys(clientData).length > 0) {
        const { error: updateError } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', id);

        if (updateError) throw updateError;
      }

      // Actualizar representantes si se proporcionan
      if (client.representatives !== undefined) {
        // Eliminar representantes existentes
        await supabase
          .from('client_representatives')
          .delete()
          .eq('client_id', id);

        // Insertar nuevos representantes
        if (client.representatives.length > 0) {
          const representativesData = client.representatives.map((rep) => ({
            client_id: id,
            name: rep.name,
            phone: rep.phone,
            email: rep.email,
          }));

          const { error: repsError } = await supabase
            .from('client_representatives')
            .insert(representativesData);

          if (repsError) throw repsError;
        }
      }

      return await this.getById(id) || client as Client;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },

  // Eliminar un cliente
  async delete(id: string): Promise<void> {
    try {
      // Primero eliminar representantes
      await supabase
        .from('client_representatives')
        .delete()
        .eq('client_id', id);

      // Luego eliminar el cliente
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      handleSupabaseError(error);
      throw error;
    }
  },
};

// ============================================
// FUNCIONES DE TRANSFORMACIÓN
// ============================================

function transformClientFromDB(
  data: any,
  representativesData: any[] = []
): Client {
  return {
    id: data.id,
    name: data.name,
    ruc: data.ruc,
    representatives: representativesData.map((rep) => ({
      name: rep.name,
      phone: rep.phone,
      email: rep.email,
    })),
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

