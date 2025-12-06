import { useState, useEffect } from 'react';
import { clientsService } from '../services/clientsService';
import { Client } from '../types';

export const useClients = (isAuthenticated: boolean) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadClients = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await clientsService.getAll();
      setClients(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar clientes');
      console.error('Error loading clients:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkAndLoad = async () => {
    if (isAuthenticated) {
      await loadClients();
    } else {
      setClients([]);
      setLoading(false);
      setError(null);
    }
  };

  useEffect(() => {
    checkAndLoad();
  }, [isAuthenticated]);

  const createClient = async (client: Partial<Client>) => {
    try {
      const newClient = await clientsService.create(client);
      setClients([...clients, newClient]);
      return newClient;
    } catch (err: any) {
      setError(err.message || 'Error al crear cliente');
      throw err;
    }
  };

  const updateClient = async (id: string, client: Partial<Client>) => {
    try {
      const updatedClient = await clientsService.update(id, client);
      setClients(clients.map(c => c.id === id ? updatedClient : c));
      return updatedClient;
    } catch (err: any) {
      setError(err.message || 'Error al actualizar cliente');
      throw err;
    }
  };

  const deleteClient = async (id: string) => {
    try {
      await clientsService.delete(id);
      setClients(clients.filter(c => c.id !== id));
    } catch (err: any) {
      setError(err.message || 'Error al eliminar cliente');
      throw err;
    }
  };

  return {
    clients,
    loading,
    error,
    loadClients,
    createClient,
    updateClient,
    deleteClient,
  };
};

