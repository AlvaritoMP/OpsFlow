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
    console.log('🗺️ geocodingService.geocodeAddress - Dirección recibida:', address);
    if (!address || address.trim().length === 0) {
      console.log('🗺️ geocodingService - Dirección vacía, retornando null');
      return null;
    }

    try {
      // Estrategia de búsqueda: intentar diferentes variaciones
      const searchQueries: string[] = [];
      const baseAddress = address.trim();
      
      // 1. Dirección completa con "Lima, Perú"
      if (!baseAddress.toLowerCase().includes('lima')) {
        searchQueries.push(`${baseAddress}, Lima, Perú`);
      }
      
      // 2. Dirección completa con "Perú"
      if (!baseAddress.toLowerCase().includes('perú') && !baseAddress.toLowerCase().includes('peru')) {
        searchQueries.push(`${baseAddress}, Perú`);
      }
      
      // 3. Dirección original
      searchQueries.push(baseAddress);
      
      // 4. Si tiene número, intentar sin el número (solo calle y distrito)
      const numberMatch = baseAddress.match(/^(\d+[\s,.-]*)?(.+)$/);
      if (numberMatch && numberMatch[1]) {
        const streetPart = numberMatch[2].trim();
        if (streetPart.length > 5) { // Solo si queda algo significativo
          searchQueries.push(`${streetPart}, Lima, Perú`);
        }
      }

      // Intentar cada variación hasta encontrar resultados
      for (const searchQuery of searchQueries) {
        const encodedAddress = encodeURIComponent(searchQuery);
        const url = `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1&addressdetails=1`;

        console.log('🗺️ geocodingService - Intentando búsqueda:', searchQuery);
        console.log('🗺️ geocodingService - URL:', url);

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'OpsFlow/1.0' // Nominatim requiere User-Agent
          }
        });

        console.log('🗺️ geocodingService - Respuesta:', response.status, response.statusText);

        if (!response.ok) {
          console.warn('⚠️ Error en geocodificación:', response.statusText);
          continue; // Intentar siguiente variación
        }

        const data = await response.json();
        console.log('🗺️ geocodingService - Resultados encontrados:', data?.length || 0);

        if (Array.isArray(data) && data.length > 0) {
          const result = data[0];
          const coords = {
            latitude: parseFloat(result.lat),
            longitude: parseFloat(result.lon),
            displayName: result.display_name || address
          };
          console.log('✅ geocodingService - Coordenadas obtenidas:', coords);
          return coords;
        }
      }

      console.log('⚠️ geocodingService - No se encontraron resultados para ninguna variación');
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

