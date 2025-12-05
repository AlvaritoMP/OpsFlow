import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

// Configuración de Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://rlnfehtgspnkyeevduli.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsbmZlaHRnc3Bua3llZXZkdWxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NzQ5MzUsImV4cCI6MjA4MDQ1MDkzNX0.8VJfcSBgGylmXrpyVR6wVTMq94P8jlRkfkZgUlvRDtY';
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsbmZlaHRnc3Bua3llZXZkdWxpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDg3NDkzNSwiZXhwIjoyMDgwNDUwOTM1fQ.nUk_BOHhCugZCJXa4pz8q_XFhbGbH3jI4B67XhZDYH8';

// Crear cliente de Supabase (anon key - para operaciones normales)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Crear cliente de administración (service_role key - solo para operaciones admin)
// ADVERTENCIA: Este key debe estar protegido. En producción, considera usar Edge Functions
export const supabaseAdmin = supabaseServiceRoleKey 
  ? createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

// Verificar que supabaseAdmin esté disponible
if (supabaseAdmin) {
  console.log('supabaseAdmin inicializado correctamente');
} else {
  console.warn('supabaseAdmin NO está disponible. Service role key no configurada.');
}

// Helper para manejar errores
export const handleSupabaseError = (error: any) => {
  console.error('Supabase Error:', error);
  throw new Error(error?.message || 'Error desconocido en la base de datos');
};

