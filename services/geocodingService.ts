/**
 * Servicio de Geocodificación con Google Maps API
 * Convierte direcciones en coordenadas (latitud, longitud) usando Google Geocoding API
 */

export interface GeocodingResult {
  address: string;
  latitude: number;
  longitude: number;
  formattedAddress: string;
  placeId?: string;
}

export interface GeocodingError {
  message: string;
  code?: string;
}

/**
 * Geocodifica una dirección usando Google Geocoding API
 * @param address Dirección a geocodificar
 * @param apiKey API Key de Google Maps
 * @returns Coordenadas y información de la dirección
 */
export async function geocodeAddress(
  address: string,
  apiKey: string
): Promise<GeocodingResult> {
  if (!address || !address.trim()) {
    throw new Error('La dirección no puede estar vacía');
  }

  if (!apiKey) {
    throw new Error('API Key de Google Maps es requerida');
  }

  try {
    const encodedAddress = encodeURIComponent(address.trim());
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Error en la solicitud: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      const location = result.geometry.location;

      return {
        address: address,
        latitude: location.lat,
        longitude: location.lng,
        formattedAddress: result.formatted_address,
        placeId: result.place_id,
      };
    } else if (data.status === 'ZERO_RESULTS') {
      throw new Error(`No se encontraron resultados para la dirección: ${address}`);
    } else if (data.status === 'OVER_QUERY_LIMIT') {
      throw new Error('Se ha excedido el límite de consultas de la API');
    } else if (data.status === 'REQUEST_DENIED') {
      throw new Error('Solicitud denegada. Verifica tu API Key y las restricciones de dominio');
    } else {
      throw new Error(`Error en la geocodificación: ${data.status}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Error desconocido en la geocodificación');
  }
}

/**
 * Geocodifica múltiples direcciones
 * @param addresses Array de direcciones
 * @param apiKey API Key de Google Maps
 * @returns Array de resultados de geocodificación
 */
export async function geocodeMultipleAddresses(
  addresses: string[],
  apiKey: string
): Promise<GeocodingResult[]> {
  // Procesar en paralelo con un límite para evitar exceder rate limits
  const batchSize = 5; // Procesar 5 a la vez
  const results: GeocodingResult[] = [];

  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(addr => geocodeAddress(addr, apiKey))
    );

    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error(`Error geocodificando "${batch[index]}":`, result.reason);
        // Podrías agregar un resultado con coordenadas por defecto o lanzar error
      }
    });

    // Pequeña pausa entre lotes para evitar rate limiting
    if (i + batchSize < addresses.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}
