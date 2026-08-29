export interface RoutePoint {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface OptimizedRoute<T extends RoutePoint> {
  ordered: T[];
  distanceKm: number;
  skippedWithoutCoords: T[];
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pathDistance<T extends RoutePoint>(points: T[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const next = points[i];
    if (
      prev.latitude == null ||
      prev.longitude == null ||
      next.latitude == null ||
      next.longitude == null
    ) {
      continue;
    }
    total += haversineKm(
      { latitude: prev.latitude, longitude: prev.longitude },
      { latitude: next.latitude, longitude: next.longitude }
    );
  }
  return total;
}

function nearestNeighbor<T extends RoutePoint>(points: T[], startIndex: number): T[] {
  const remaining = points.filter((_, i) => i !== startIndex);
  const ordered: T[] = [points[startIndex]];
  while (remaining.length) {
    const current = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    remaining.forEach((candidate, idx) => {
      if (
        current.latitude == null ||
        current.longitude == null ||
        candidate.latitude == null ||
        candidate.longitude == null
      ) {
        return;
      }
      const dist = haversineKm(
        { latitude: current.latitude, longitude: current.longitude },
        { latitude: candidate.latitude, longitude: candidate.longitude }
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

function twoOpt<T extends RoutePoint>(points: T[]): T[] {
  if (points.length < 4) return points;
  let best = points.slice();
  let bestDist = pathDistance(best);
  let improved = true;
  let guard = 0;
  while (improved && guard < 80) {
    improved = false;
    guard += 1;
    for (let i = 1; i < best.length - 2; i++) {
      for (let k = i + 1; k < best.length - 1; k++) {
        const next = best.slice(0, i).concat(best.slice(i, k + 1).reverse(), best.slice(k + 1));
        const dist = pathDistance(next);
        if (dist + 0.001 < bestDist) {
          best = next;
          bestDist = dist;
          improved = true;
        }
      }
    }
  }
  return best;
}

/**
 * Calcula el orden de paradas más corto (vecino más cercano + 2-opt).
 * Las unidades sin coordenadas se dejan al final, en el orden original.
 */
export function optimizeRouteOrder<T extends RoutePoint>(points: T[]): OptimizedRoute<T> {
  const withCoords = points.filter(
    (p) => typeof p.latitude === 'number' && typeof p.longitude === 'number'
  );
  const skippedWithoutCoords = points.filter(
    (p) => p.latitude == null || p.longitude == null
  );

  if (withCoords.length <= 1) {
    return {
      ordered: [...withCoords, ...skippedWithoutCoords],
      distanceKm: 0,
      skippedWithoutCoords,
    };
  }

  let best = nearestNeighbor(withCoords, 0);
  let bestDist = pathDistance(best);

  for (let i = 1; i < withCoords.length; i++) {
    const candidate = twoOpt(nearestNeighbor(withCoords, i));
    const dist = pathDistance(candidate);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }

  const polished = twoOpt(best);
  return {
    ordered: [...polished, ...skippedWithoutCoords],
    distanceKm: Math.round(pathDistance(polished) * 10) / 10,
    skippedWithoutCoords,
  };
}
