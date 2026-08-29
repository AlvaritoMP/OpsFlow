import React, { useEffect, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchDrivingPath } from '../utils/drivingRoute';

export interface SupervisionMapStop {
  id: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  order?: number;
  status?: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'cancelled';
}

interface SupervisionRouteMapProps {
  stops: SupervisionMapStop[];
  heightClass?: string;
}

const defaultCenter: [number, number] = [-12.0464, -77.0428];

const statusColor: Record<string, string> = {
  pending: '#64748b',
  in_progress: '#2563eb',
  completed: '#16a34a',
  skipped: '#d97706',
  cancelled: '#94a3b8',
};

const createNumberIcon = (n: number, color: string) =>
  L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;background:${color};color:white;
      border:2px solid white;border-radius:9999px;
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:700;font-family:inherit;
    ">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });

const FitStops: React.FC<{ positions: [number, number][] }> = ({ positions }) => {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 0);
    if (!positions.length) {
      map.setView(defaultCenter, 11);
      return;
    }
    if (positions.length === 1) {
      map.setView(positions[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(positions), { padding: [36, 36], maxZoom: 15 });
  }, [map, positions]);
  return null;
};

export const SupervisionRouteMap: React.FC<SupervisionRouteMapProps> = ({
  stops,
  heightClass = 'h-[420px]',
}) => {
  const located = stops
    .map((stop, index) => ({
      ...stop,
      order: stop.order ?? index + 1,
    }))
    .filter((s) => typeof s.latitude === 'number' && typeof s.longitude === 'number')
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const positions = located.map((s) => [s.latitude!, s.longitude!] as [number, number]);
  const [roadPath, setRoadPath] = useState<[number, number][] | null>(null);
  const [roadMeta, setRoadMeta] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [roadFailed, setRoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRoadPath(null);
    setRoadMeta(null);
    setRoadFailed(false);
    if (located.length < 2) return;
    fetchDrivingPath(
      located.map((s) => ({ latitude: s.latitude!, longitude: s.longitude! }))
    ).then((result) => {
      if (cancelled) return;
      if (!result) {
        setRoadFailed(true);
        return;
      }
      setRoadPath(result.path);
      setRoadMeta({ distanceKm: result.distanceKm, durationMin: result.durationMin });
    });
    return () => {
      cancelled = true;
    };
  }, [located.map((s) => `${s.id}:${s.latitude},${s.longitude}`).join('|')]);

  const line = roadPath && roadPath.length > 1 ? roadPath : positions;

  return (
    <div className={`relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${heightClass}`}>
      {located.length === 0 ? (
        <div className="absolute inset-0 z-[400] flex items-center justify-center bg-slate-50 text-sm text-slate-500 px-6 text-center">
          Estas unidades no tienen coordenadas. Cargue latitud y longitud en la ficha de la unidad para ver la ruta en el mapa.
        </div>
      ) : null}
      <MapContainer center={defaultCenter} zoom={11} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitStops positions={line.length ? line : positions} />
        {line.length > 1 && (
          <Polyline
            positions={line}
            pathOptions={{
              color: roadPath ? '#1d4ed8' : '#94a3b8',
              weight: roadPath ? 5 : 3,
              opacity: 0.9,
              dashArray: roadPath ? undefined : '6 8',
            }}
          />
        )}
        {located.map((stop) => (
          <Marker
            key={stop.id}
            position={[stop.latitude!, stop.longitude!]}
            icon={createNumberIcon(stop.order!, statusColor[stop.status || 'pending'] || '#2563eb')}
          >
            <Popup>
              <div className="min-w-[160px]">
                <p className="font-semibold text-slate-800">
                  {stop.order}. {stop.name}
                </p>
                {stop.address ? <p className="text-xs text-slate-500 mt-1">{stop.address}</p> : null}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {located.length > 1 && (
        <div className="absolute bottom-3 left-3 z-[400] bg-white/95 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600">
          {roadMeta
            ? `Ruta por calles · ${roadMeta.distanceKm} km · ${roadMeta.durationMin} min`
            : roadFailed
              ? 'No se pudo calcular el callejero; se muestra línea directa'
              : 'Calculando recorrido por calles…'}
        </div>
      )}
    </div>
  );
};
