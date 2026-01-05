import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Unit, UnitStatus } from '../types';
import { Building2 } from 'lucide-react';
import { GoogleMap, LoadScript, Marker, InfoWindow } from '@react-google-maps/api';

interface UnitsMapProps {
  units: Unit[];
  onSelectUnit?: (unitId: string) => void;
}

// Configuración del mapa
const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = {
  lat: -12.0464,
  lng: -77.0428,
};

// Opciones del mapa
const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
  styles: [
    {
      featureType: 'poi',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }],
    },
  ],
};

// Componente del mapa que se carga dinámicamente solo en el cliente
const MapComponent: React.FC<{ units: Unit[]; onSelectUnit?: (unitId: string) => void; apiKey: string }> = ({ 
  units, 
  onSelectUnit,
  apiKey 
}) => {
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const unitsWithCoords = useMemo(() => 
    units.filter(u => u.latitude && u.longitude),
    [units]
  );

  // Ajustar el mapa a las unidades cuando se cargan
  useEffect(() => {
    if (!map || !isLoaded || unitsWithCoords.length === 0) return;
    
    if (unitsWithCoords.length === 1) {
      // Si hay una sola unidad, centrar en ella con zoom apropiado
      map.setCenter({
        lat: unitsWithCoords[0].latitude!,
        lng: unitsWithCoords[0].longitude!,
      });
      map.setZoom(15);
    } else if (unitsWithCoords.length > 1) {
      // Si hay múltiples unidades, ajustar el bounds
      const bounds = new google.maps.LatLngBounds();
      unitsWithCoords.forEach(unit => {
        bounds.extend({
          lat: unit.latitude!,
          lng: unit.longitude!,
        });
      });
      map.fitBounds(bounds, { padding: 50 });
    }
  }, [map, isLoaded, unitsWithCoords]);

  const onLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance);
    setIsLoaded(true);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Función para obtener el color del marcador según el estado
  const getMarkerColor = (status: UnitStatus): string => {
    switch (status) {
      case UnitStatus.ACTIVE:
        return '#3b82f6'; // Azul
      case UnitStatus.ISSUE:
        return '#ef4444'; // Rojo
      case UnitStatus.PENDING:
        return '#f59e0b'; // Amarillo
      default:
        return '#3b82f6';
    }
  };

  // Crear icono personalizado SVG para el marcador
  const createCustomIcon = (status: UnitStatus): google.maps.Icon => {
    const color = getMarkerColor(status);
    const svgIcon = `
      <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="12" fill="${color}" stroke="white" stroke-width="2"/>
        <text x="16" y="20" font-size="16" text-anchor="middle" fill="white">📍</text>
      </svg>
    `;
    
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgIcon)}`,
      scaledSize: new google.maps.Size(32, 32),
      anchor: new google.maps.Point(16, 32),
    };
  };

  return (
    <LoadScript googleMapsApiKey={apiKey}>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={defaultCenter}
        zoom={11}
        options={mapOptions}
        onLoad={onLoad}
        onUnmount={onUnmount}
      >
        {unitsWithCoords.map((unit) => (
          <React.Fragment key={unit.id}>
            <Marker
              position={{
                lat: unit.latitude!,
                lng: unit.longitude!,
              }}
              icon={createCustomIcon(unit.status)}
              onClick={() => setSelectedUnit(unit)}
              title={unit.name}
            />
            {selectedUnit?.id === unit.id && (
              <InfoWindow
                position={{
                  lat: unit.latitude!,
                  lng: unit.longitude!,
                }}
                onCloseClick={() => setSelectedUnit(null)}
              >
                <div className="p-2 min-w-[200px]">
                  <h4 className="font-semibold text-slate-800 mb-1">{unit.name}</h4>
                  <p className="text-sm text-slate-600 mb-2">{unit.clientName}</p>
                  <p className="text-xs text-slate-500 mb-2">{unit.address}</p>
                  <div className="flex items-center gap-2 mb-2">
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
                      onClick={() => {
                        onSelectUnit(unit.id);
                        setSelectedUnit(null);
                      }}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      Ver detalles
                    </button>
                  )}
                </div>
              </InfoWindow>
            )}
          </React.Fragment>
        ))}
      </GoogleMap>
    </LoadScript>
  );
};

export const UnitsMap: React.FC<UnitsMapProps> = ({ units, onSelectUnit }) => {
  const [apiKey, setApiKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Obtener la API key de Google Maps desde localStorage
    const key = localStorage.getItem('GOOGLE_MAPS_API_KEY') || '';
    setApiKey(key);
    setIsLoading(false);
  }, []);

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

  // Si no hay API key, mostrar mensaje
  if (!isLoading && !apiKey) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="text-slate-600" size={20} />
          <h3 className="text-lg font-semibold text-slate-800">Mapa de Unidades</h3>
        </div>
        <div className="text-center py-8">
          <p className="text-slate-500 mb-2">Se requiere una API Key de Google Maps para mostrar el mapa.</p>
          <p className="text-sm text-slate-400">
            Por favor, configura tu API Key de Google Maps en la sección de Configuración.
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
        {isLoading ? (
          <div className="h-full w-full flex items-center justify-center bg-slate-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-slate-500">Cargando mapa...</p>
            </div>
          </div>
        ) : (
          <MapComponent units={units} onSelectUnit={onSelectUnit} apiKey={apiKey} />
        )}
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
