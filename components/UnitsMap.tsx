import React, { useEffect, useState } from 'react';
import { Unit, UnitStatus } from '../types';
import { Building2 } from 'lucide-react';

interface UnitsMapProps {
  units: Unit[];
  onSelectUnit?: (unitId: string) => void;
}

// Componente del mapa que se carga dinámicamente solo en el cliente
const MapComponent: React.FC<{ units: Unit[]; onSelectUnit?: (unitId: string) => void }> = ({ units, onSelectUnit }) => {
  const [MapContainer, setMapContainer] = useState<any>(null);
  const [TileLayer, setTileLayer] = useState<any>(null);
  const [Marker, setMarker] = useState<any>(null);
  const [Popup, setPopup] = useState<any>(null);
  const [useMap, setUseMap] = useState<any>(null);
  const [L, setL] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Cargar Leaflet solo en el cliente
    if (typeof window !== 'undefined') {
      Promise.all([
        import('react-leaflet'),
        import('leaflet'),
        import('leaflet/dist/leaflet.css')
      ]).then(([leaflet, leafletLib]) => {
        // Fix para los iconos de Leaflet en React
        delete (leafletLib.default.Icon.Default.prototype as any)._getIconUrl;
        leafletLib.default.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });

        setMapContainer(() => leaflet.MapContainer);
        setTileLayer(() => leaflet.TileLayer);
        setMarker(() => leaflet.Marker);
        setPopup(() => leaflet.Popup);
        setUseMap(() => leaflet.useMap);
        setL(leafletLib.default);
        setIsLoaded(true);
      }).catch((error) => {
        console.error('Error al cargar Leaflet:', error);
      });
    }
  }, []);

  if (!isLoaded || !MapContainer || !L) {
    return (
      <div className="h-96 w-full rounded-lg border border-slate-200 flex items-center justify-center bg-slate-50" style={{ minHeight: '384px' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-slate-500">Cargando mapa...</p>
        </div>
      </div>
    );
  }

  const unitsWithCoords = units.filter(u => u.latitude && u.longitude);

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
  const MapBounds = ({ units }: { units: Unit[] }) => {
    const map = useMap();
    const unitsWithCoords = units.filter(u => u.latitude && u.longitude);

    useEffect(() => {
      if (!map || !L) return;
      
      if (unitsWithCoords.length > 0) {
        const bounds = L.latLngBounds(
          unitsWithCoords.map(u => [u.latitude!, u.longitude!] as [number, number])
        );
        map.fitBounds(bounds, { padding: [50, 50] });
      } else if (unitsWithCoords.length === 1) {
        map.setView([unitsWithCoords[0].latitude!, unitsWithCoords[0].longitude!], 13);
      } else {
        map.setView([-12.0464, -77.0428], 12);
      }
    }, [map, unitsWithCoords, L]);

    return null;
  };

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      <style>{`
        .leaflet-container {
          height: 100% !important;
          width: 100% !important;
          z-index: 0;
        }
      `}</style>
      <MapContainer
        center={[-12.0464, -77.0428]}
        zoom={11}
        style={{ height: '100%', width: '100%', zIndex: 0 }}
        scrollWheelZoom={true}
        key={`map-${unitsWithCoords.length}`}
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
  );
};

export const UnitsMap: React.FC<UnitsMapProps> = ({ units, onSelectUnit }) => {
  console.log('🗺️ UnitsMap - Recibidas', units.length, 'unidades');
  const unitsWithCoords = units.filter(u => u.latitude && u.longitude);
  console.log('🗺️ UnitsMap - Unidades con coordenadas:', unitsWithCoords.length);
  console.log('🗺️ UnitsMap - Unidades con coordenadas detalle:', unitsWithCoords.map(u => ({ name: u.name, lat: u.latitude, lon: u.longitude })));

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
    <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex items-center gap-3 mb-4">
        <Building2 className="text-slate-600" size={20} />
        <h3 className="text-base md:text-lg font-semibold text-slate-800">Mapa de Unidades</h3>
        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
          {unitsWithCoords.length} {unitsWithCoords.length === 1 ? 'unidad' : 'unidades'}
        </span>
      </div>
      <div className="h-96 w-full rounded-lg overflow-hidden border border-slate-200 relative" style={{ minHeight: '384px' }}>
        <MapComponent units={units} onSelectUnit={onSelectUnit} />
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
