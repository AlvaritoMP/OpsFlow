import React, { useEffect, useMemo, useState } from 'react';
import { Unit, UnitStatus } from '../types';
import { Building2 } from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface UnitsMapProps {
  units: Unit[];
  onSelectUnit?: (unitId: string) => void;
}

const defaultCenter: [number, number] = [-12.0464, -77.0428];

const getMarkerColor = (status: UnitStatus): string => {
  switch (status) {
    case UnitStatus.ACTIVE:
      return '#3b82f6';
    case UnitStatus.ISSUE:
      return '#ef4444';
    case UnitStatus.PENDING:
      return '#f59e0b';
    default:
      return '#3b82f6';
  }
};

const createUnitIcon = (status: UnitStatus) => {
  const color = getMarkerColor(status);

  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: 28px;
        height: 28px;
        background: ${color};
        border: 3px solid white;
        border-radius: 9999px;
        box-shadow: 0 6px 14px rgba(15, 23, 42, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="width: 8px; height: 8px; border-radius: 9999px; background: white;"></div>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
};

const FitBounds: React.FC<{ units: Unit[] }> = ({ units }) => {
  const map = useMap();

  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 0);

    if (units.length === 0) return;

    if (units.length === 1) {
      map.setView([units[0].latitude!, units[0].longitude!], 15);
      return;
    }

    const bounds = L.latLngBounds(units.map(unit => [unit.latitude!, unit.longitude!] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [map, units]);

  return null;
};

const MapComponent: React.FC<{ units: Unit[]; onSelectUnit?: (unitId: string) => void }> = ({
  units,
  onSelectUnit,
}) => (
  <MapContainer
    center={defaultCenter}
    zoom={11}
    scrollWheelZoom
    className="h-full w-full"
  >
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    />
    <FitBounds units={units} />
    {units.map((unit) => (
      <Marker
        key={unit.id}
        position={[unit.latitude!, unit.longitude!]}
        icon={createUnitIcon(unit.status)}
      >
        <Popup>
          <div className="min-w-[200px]">
            <h4 className="font-semibold text-slate-800 mb-1">{unit.name}</h4>
            <p className="text-sm text-slate-600 mb-2">{unit.clientName}</p>
            <p className="text-xs text-slate-500 mb-2">{unit.address}</p>
            <span
              className={`text-xs px-2 py-1 rounded ${
                unit.status === UnitStatus.ACTIVE
                  ? 'bg-green-100 text-green-700'
                  : unit.status === UnitStatus.ISSUE
                  ? 'bg-red-100 text-red-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}
            >
              {unit.status}
            </span>
            {onSelectUnit && (
              <button
                onClick={() => onSelectUnit(unit.id)}
                className="mt-3 block text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Ver detalles
              </button>
            )}
          </div>
        </Popup>
      </Marker>
    ))}
  </MapContainer>
);

export const UnitsMap: React.FC<UnitsMapProps> = ({ units, onSelectUnit }) => {
  const [mapKey, setMapKey] = useState(0);

  const unitsWithCoords = useMemo(
    () => units.filter(u => u.latitude !== undefined && u.longitude !== undefined),
    [units]
  );

  useEffect(() => {
    setMapKey(prev => prev + 1);
  }, [unitsWithCoords.length]);

  // Si no hay unidades con coordenadas, mostrar mensaje
  if (unitsWithCoords.length === 0) {
    console.log('🗺️ UnitsMap - Mostrando mensaje: no hay coordenadas');
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="text-slate-600" size={20} />
          <h3 className="text-lg font-semibold text-slate-800">Mapa de Unidades</h3>
        </div>
        <div className="text-center py-8">
          <p className="text-slate-500 mb-2">No hay unidades con coordenadas geográficas registradas.</p>
          <p className="text-sm text-slate-400">
            Agrega coordenadas (latitud y longitud) a las unidades para visualizarlas en el mapa.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-0 bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex items-center gap-3 mb-4">
        <Building2 className="text-slate-600" size={20} />
        <h3 className="text-base md:text-lg font-semibold text-slate-800">Mapa de Unidades</h3>
        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
          {unitsWithCoords.length} {unitsWithCoords.length === 1 ? 'unidad' : 'unidades'}
        </span>
      </div>
      <div className="h-[600px] md:h-[700px] w-full rounded-lg overflow-hidden border border-slate-200 relative" style={{ minHeight: '600px' }}>
        <MapComponent key={mapKey} units={unitsWithCoords} onSelectUnit={onSelectUnit} />
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <span>Activo</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <span>Pendiente</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <span>Con Incidencias</span>
        </div>
      </div>
    </div>
  );
};
