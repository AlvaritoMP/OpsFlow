// services/googleMapsService.ts
import { supabase } from './supabase';

const STORAGE_KEY = 'GOOGLE_MAPS_API_KEY'; // Para compatibilidad con localStorage existente
const SETTINGS_TABLE = 'system_settings';
const SETTINGS_KEY = 'google_maps_api_key';

/**
 * Obtiene la API Key de Google Maps desde Supabase
 * Si no existe en Supabase, intenta obtenerla de localStorage (migración)
 */
export const getGoogleMapsApiKey = async (): Promise<string | null> => {
  try {
    // Intentar obtener desde Supabase
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select('value')
      .eq('key', SETTINGS_KEY)
      .single();

    if (error) {
      // Si la tabla no existe o hay error, intentar desde localStorage (fallback)
      console.warn('⚠️ No se pudo obtener API key desde Supabase, intentando localStorage:', error.message);
      const localKey = localStorage.getItem(STORAGE_KEY);
      if (localKey) {
        // Migrar a Supabase si existe en localStorage
        await saveGoogleMapsApiKey(localKey);
        return localKey;
      }
      return null;
    }

    if (data && data.value) {
      return data.value as string;
    }

    // Fallback a localStorage si no hay en Supabase
    const localKey = localStorage.getItem(STORAGE_KEY);
    return localKey;
  } catch (error) {
    console.error('❌ Error al obtener API key de Google Maps:', error);
    // Fallback a localStorage
    return localStorage.getItem(STORAGE_KEY);
  }
};

/**
 * Guarda la API Key de Google Maps en Supabase
 * También guarda en localStorage para compatibilidad
 */
export const saveGoogleMapsApiKey = async (apiKey: string): Promise<void> => {
  try {
    // Guardar en Supabase usando upsert (insertar o actualizar)
    const { error } = await supabase
      .from(SETTINGS_TABLE)
      .upsert(
        {
          key: SETTINGS_KEY,
          value: apiKey,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'key',
        }
      );

    if (error) {
      console.error('❌ Error al guardar API key en Supabase:', error);
      // Si falla Supabase, guardar en localStorage como fallback
      localStorage.setItem(STORAGE_KEY, apiKey);
      throw error;
    }

    // También guardar en localStorage para compatibilidad y caché local
    localStorage.setItem(STORAGE_KEY, apiKey);
    console.log('✅ API Key de Google Maps guardada correctamente');
  } catch (error) {
    console.error('❌ Error al guardar API key:', error);
    // Fallback: guardar en localStorage
    localStorage.setItem(STORAGE_KEY, apiKey);
    throw error;
  }
};

