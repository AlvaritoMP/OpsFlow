import { useState, useEffect } from 'react';
import { usersService } from '../services/usersService';
import { User } from '../types';

export const useUsers = (isAuthenticated: boolean) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await usersService.getAll();
      setUsers(data);
    } catch (err: any) {
      // No mostrar error si es por falta de autenticación
      if (err.message?.includes('JWT') || err.message?.includes('auth') || err.message?.includes('session')) {
        setUsers([]);
        setError(null);
      } else {
        setError(err.message || 'Error al cargar usuarios');
        console.error('Error loading users:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const checkAndLoad = async () => {
    if (isAuthenticated) {
      await loadUsers();
    } else {
      setUsers([]);
      setLoading(false);
      setError(null);
    }
  };

  useEffect(() => {
    checkAndLoad();
  }, [isAuthenticated]);

  const createUser = async (user: Partial<User>) => {
    try {
      const newUser = await usersService.create(user);
      setUsers([...users, newUser]);
      return newUser;
    } catch (err: any) {
      setError(err.message || 'Error al crear usuario');
      throw err;
    }
  };

  const updateUser = async (id: string, user: Partial<User>) => {
    try {
      const updatedUser = await usersService.update(id, user);
      setUsers(users.map(u => u.id === id ? updatedUser : u));
      return updatedUser;
    } catch (err: any) {
      setError(err.message || 'Error al actualizar usuario');
      throw err;
    }
  };

  const deleteUser = async (id: string) => {
    try {
      await usersService.delete(id);
      setUsers(users.filter(u => u.id !== id));
    } catch (err: any) {
      setError(err.message || 'Error al eliminar usuario');
      throw err;
    }
  };

  return {
    users,
    loading,
    error,
    loadUsers,
    createUser,
    updateUser,
    deleteUser,
  };
};

