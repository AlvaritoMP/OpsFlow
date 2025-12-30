import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Unit, UnitStatus } from '../types';
import { Building2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Fix para los iconos de Leaflet en React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Iconos personalizados según el estado de la unidad
const createCustomIcon = (status: UnitStatus) => {
  let color = '#3b82f6'; // Azul por defecto (Activo)
  if (status === UnitStatus.ISSUE) {
    color = '#ef4444'; // Rojo (Con Incidencias)
  } else if (status === UnitStatus.PENDING) {
    color = '#f59e0b'; // Amarillo (Pendiente)
  }

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 24px;
        height: 24px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ">
        <div style="
          transform: rotate(45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          color: white;
          font-size: 12px;
        ">📍</div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
};

// Componente para ajustar el mapa al mostrar todas las unidades
function MapBounds({ units }: { units: Unit[] }) {
  const map = useMap();
  const unitsWithCoords = units.filter(u => u.latitude && u.longitude);

  useEffect(() => {
    if (unitsWithCoords.length > 0) {
      const bounds = L.latLngBounds(
        unitsWithCoords.map(u => [u.latitude!, u.longitude!] as [number, number])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (unitsWithCoords.length === 1) {
      // Si solo hay una unidad, centrar en ella con zoom apropiado
      map.setView([unitsWithCoords[0].latitude!, unitsWithCoords[0].longitude!], 13);
    } else {
      // Si no hay unidades con coordenadas, centrar en Lima, Perú
      map.setView([-12.0464, -77.0428], 12);
    }
  }, [map, unitsWithCoords]);

  return null;
}

interface UnitsMapProps {
  units: Unit[];
  onSelectUnit?: (unitId: string) => void;
}

export const UnitsMap: React.FC<UnitsMapProps> = ({ units, onSelectUnit }) => {
  const unitsWithCoords = units.filter(u => u.latitude && u.longitude);

  // Si no hay unidades con coordenadas, mostrar mensaje
  if (unitsWithCoords.length === 0) {
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
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex items-center gap-3 mb-4">
        <Building2 className="text-slate-600" size={20} />
        <h3 className="text-base md:text-lg font-semibold text-slate-800">Mapa de Unidades</h3>
        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
          {unitsWithCoords.length} {unitsWithCoords.length === 1 ? 'unidad' : 'unidades'}
        </span>
      </div>
      <div className="h-96 w-full rounded-lg overflow-hidden border border-slate-200">
        <MapContainer
          center={[-12.0464, -77.0428]} // Lima, Perú por defecto
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapBounds units={units} />
          {unitsWithCoords.map((unit) => (
            <Marker
              key={unit.id}
              position={[unit.latitude!, unit.longitude!]}
              icon={createCustomIcon(unit.status)}
            >
              <Popup>
                <div className="p-2">
                  <h4 className="font-semibold text-slate-800 mb-1">{unit.name}</h4>
                  <p className="text-sm text-slate-600 mb-2">{unit.clientName}</p>
                  <p className="text-xs text-slate-500 mb-2">{unit.address}</p>
                  <div className="flex items-center gap-2">
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
                  </div>
                  {onSelectUnit && (
                    <button
                      onClick={() => onSelectUnit(unit.id)}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      Ver detalles
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
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

