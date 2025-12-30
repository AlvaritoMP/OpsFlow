/**
 * Servicio de geocodificación usando Nominatim (OpenStreetMap)
 * Convierte direcciones en coordenadas geográficas (latitud, longitud)
 */

interface GeocodingResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

export const geocodingService = {
  /**
   * Geocodifica una dirección y retorna las coordenadas
   * @param address Dirección completa (ej: "Av. Javier Prado 450, Lima, Perú")
   * @returns Coordenadas o null si no se encuentra
   */
  async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    if (!address || address.trim().length === 0) {
      return null;
    }

    try {
      // Usar Nominatim API (OpenStreetMap) - gratuita y sin API key
      // Agregar "Perú" o "Lima, Perú" si no está en la dirección para mejorar resultados
      let searchQuery = address.trim();
      if (!searchQuery.toLowerCase().includes('perú') && !searchQuery.toLowerCase().includes('peru')) {
        searchQuery = `${searchQuery}, Perú`;
      }

      const encodedAddress = encodeURIComponent(searchQuery);
      const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1&addressdetails=1`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'OpsFlow/1.0' // Nominatim requiere User-Agent
        }
      });

      if (!response.ok) {
        console.warn('⚠️ Error en geocodificación:', response.statusText);
        return null;
      }

      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        const result = data[0];
        return {
          latitude: parseFloat(result.lat),
          longitude: parseFloat(result.lon),
          displayName: result.display_name || address
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Error al geocodificar dirección:', error);
      return null;
    }
  },

  /**
   * Geocodifica múltiples direcciones (con rate limiting para respetar los límites de Nominatim)
   * @param addresses Array de direcciones
   * @param delayMs Delay entre requests (por defecto 1000ms para respetar rate limits)
   */
  async geocodeAddresses(
    addresses: string[],
    delayMs: number = 1000
  ): Promise<Map<string, GeocodingResult>> {
    const results = new Map<string, GeocodingResult>();

    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      const result = await this.geocodeAddress(address);
      
      if (result) {
        results.set(address, result);
      }

      // Esperar entre requests para respetar rate limits de Nominatim (1 req/segundo)
      if (i < addresses.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }
};

