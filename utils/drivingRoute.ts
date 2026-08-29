export interface LatLngPoint {
  latitude: number;
  longitude: number;
}

export interface DrivingPath {
  path: [number, number][];
  distanceKm: number;
  durationMin: number;
}

const cache = new Map<string, DrivingPath>();

function cacheKey(points: LatLngPoint[]): string {
  return points.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join('|');
}

/**
 * Traza un recorrido por calles (OSRM / OpenStreetMap).
 * Si el servicio no responde, el llamador puede caer a línea recta.
 */
export async function fetchDrivingPath(points: LatLngPoint[]): Promise<DrivingPath | null> {
  const usable = points.filter(
    (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
  );
  if (usable.length < 2) return null;

  const key = cacheKey(usable);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const coords = usable.map((p) => `${p.longitude},${p.latitude}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const json = await response.json();
    const route = json?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) return null;

    const path = (route.geometry.coordinates as [number, number][]).map(
      ([lng, lat]) => [lat, lng] as [number, number]
    );
    const result: DrivingPath = {
      path,
      distanceKm: Math.round((Number(route.distance) / 1000) * 10) / 10,
      durationMin: Math.round(Number(route.duration) / 60),
    };
    cache.set(key, result);
    return result;
  } catch {
    return null;
  }
}
