import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

// Configuración de Supabase
// IMPORTANTE: Solo usamos la clave anónima (anon key) en el frontend.
// La clave de servicio (service_role) NO debe exponerse en el frontend.
// Para operaciones administrativas, usa Supabase Edge Functions o un backend separado.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://rlnfehtgspnkyeevduli.supabase.co';
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsbmZlaHRnc3Bua3llZXZkdWxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NzQ5MzUsImV4cCI6MjA4MDQ1MDkzNX0.8VJfcSBgGylmXrpyVR6wVTMq94P8jlRkfkZgUlvRDtY';

const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = SUPABASE_ANON_KEY;

// Crear cliente de Supabase (anon key - para operaciones normales)
// Configurado para mantener sesión activa (necesario para Storage)
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // CRÍTICO: Necesario para que Storage funcione
    autoRefreshToken: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined, // Usar localStorage solo en el navegador
    storageKey: 'supabase.auth.token', // Clave específica para Auth
  },
  global: {
    headers: {
      'X-Client-Info': 'opsflow-web',
    },
  },
  db: {
    schema: 'public',
  },
});

// Helper para manejar errores
export const handleSupabaseError = (error: any) => {
  console.error('Supabase Error:', error);
  
  // Detectar errores de red y proporcionar mensajes más útiles
  if (error?.message?.includes('Failed to fetch') || 
      error?.message?.includes('ERR_FAILED') || 
      error?.name === 'TypeError' ||
      error?.code === 'ECONNREFUSED' ||
      error?.code === 'ETIMEDOUT') {
    const networkError = new Error(
      'Error de conexión con el servidor. Por favor, verifica tu conexión a internet e intenta de nuevo.\n\n' +
      'Si el problema persiste, puede ser que el servidor esté temporalmente no disponible.'
    );
    networkError.name = 'NetworkError';
    throw networkError;
  }
  
  // Detectar errores de timeout
  if (error?.message?.includes('timeout') || error?.code === 'ETIMEDOUT') {
    const timeoutError = new Error(
      'La solicitud tardó demasiado tiempo. Por favor, intenta de nuevo.\n\n' +
      'Si el problema persiste, verifica tu conexión a internet.'
    );
    timeoutError.name = 'TimeoutError';
    throw timeoutError;
  }
  
  // Error genérico
  throw new Error(error?.message || 'Error desconocido en la base de datos');
};

