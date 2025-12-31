import React, { useMemo, useCallback } from 'react';
import { APIProvider, Map, Marker, InfoWindow } from '@vis.gl/react-google-maps';
import { Unit, UnitStatus } from '../types';
import { geocodeAddress, GeocodingResult } from '../services/geocodingService';

interface UnitsMapProps {
  units: Unit[];
  apiKey: string;
  onUnitClick?: (unitId: string) => void;
  height?: string;
}

interface UnitWithCoordinates extends Unit {
  coordinates?: {
    lat: number;
    lng: number;
  };
  geocodingError?: boolean;
}

/**
 * Componente de mapa que muestra las unidades en Google Maps
 */
export const UnitsMap: React.FC<UnitsMapProps> = ({
  units,
  apiKey,
  onUnitClick,
  height = '400px',
}) => {
  const [unitsWithCoords, setUnitsWithCoords] = React.useState<UnitWithCoordinates[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedUnit, setSelectedUnit] = React.useState<string | null>(null);
  const geocodingCacheRef = React.useRef<Map<string, GeocodingResult>>(new Map());

  // Geocodificar direcciones cuando cambien las unidades
  React.useEffect(() => {
    const geocodeUnits = async () => {
      if (!apiKey || units.length === 0) {
        setUnitsWithCoords(units);
        setLoading(false);
        return;
      }

      setLoading(true);
      const unitsToProcess: UnitWithCoordinates[] = [];

      for (const unit of units) {
        // Verificar cache primero
        const cached = geocodingCacheRef.current.get(unit.address);
        if (cached) {
          unitsToProcess.push({
            ...unit,
            coordinates: {
              lat: cached.latitude,
              lng: cached.longitude,
            },
          });
          continue;
        }

        try {
          const result = await geocodeAddress(unit.address, apiKey);
          geocodingCacheRef.current.set(unit.address, result);
          unitsToProcess.push({
            ...unit,
            coordinates: {
              lat: result.latitude,
              lng: result.longitude,
            },
          });
        } catch (error) {
          console.error(`Error geocodificando ${unit.name}:`, error);
          unitsToProcess.push({
            ...unit,
            geocodingError: true,
          });
        }

        // Pequeña pausa para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      setUnitsWithCoords(unitsToProcess);
      setLoading(false);
    };

    geocodeUnits();
  }, [units, apiKey]);

  // Calcular el centro del mapa basado en las unidades geocodificadas
  const center = useMemo(() => {
    const validUnits = unitsWithCoords.filter(u => u.coordinates && !u.geocodingError);
    if (validUnits.length === 0) {
      // Centro por defecto (Lima, Perú)
      return { lat: -12.0464, lng: -77.0428 };
    }

    const avgLat = validUnits.reduce((sum, u) => sum + u.coordinates!.lat, 0) / validUnits.length;
    const avgLng = validUnits.reduce((sum, u) => sum + u.coordinates!.lng, 0) / validUnits.length;

    return { lat: avgLat, lng: avgLng };
  }, [unitsWithCoords]);

  const handleMarkerClick = useCallback(
    (unitId: string) => {
      setSelectedUnit(unitId);
      if (onUnitClick) {
        onUnitClick(unitId);
      }
    },
    [onUnitClick]
  );

  const handleMapClick = useCallback(() => {
    setSelectedUnit(null);
  }, []);

  const selectedUnitData = unitsWithCoords.find(u => u.id === selectedUnit);

  if (!apiKey) {
    return (
      <div
        className="flex items-center justify-center bg-slate-100 rounded-lg border border-slate-300"
        style={{ height }}
      >
        <p className="text-slate-500 text-sm">
          API Key de Google Maps no configurada. Por favor, configura VITE_GOOGLE_MAPS_API_KEY
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center bg-slate-100 rounded-lg border border-slate-300"
        style={{ height }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-slate-600 text-sm">Geocodificando direcciones...</p>
        </div>
      </div>
    );
  }

  const validUnits = unitsWithCoords.filter(u => u.coordinates && !u.geocodingError);

  return (
    <div className="w-full rounded-lg overflow-hidden border border-slate-300 shadow-sm relative" style={{ height }}>
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={center}
          defaultZoom={validUnits.length > 1 ? 11 : 15}
          gestureHandling="greedy"
          disableDefaultUI={false}
          onClick={handleMapClick}
          style={{ width: '100%', height: '100%' }}
        >
          {validUnits.map(unit => (
            <Marker
              key={unit.id}
              position={unit.coordinates!}
              onClick={() => handleMarkerClick(unit.id)}
              title={unit.name}
            />
          ))}

          {selectedUnitData && selectedUnitData.coordinates && (
            <InfoWindow
              position={selectedUnitData.coordinates}
              onCloseClick={() => setSelectedUnit(null)}
            >
              <div className="p-2">
                <h3 className="font-bold text-sm text-slate-800 mb-1">{selectedUnitData.name}</h3>
                <p className="text-xs text-slate-600 mb-1">{selectedUnitData.clientName}</p>
                <p className="text-xs text-slate-500 mb-2">{selectedUnitData.address}</p>
                <span
                  className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                    selectedUnitData.status === UnitStatus.ACTIVE
                      ? 'bg-green-100 text-green-700'
                      : selectedUnitData.status === UnitStatus.ISSUE
                      ? 'bg-red-100 text-red-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {selectedUnitData.status}
                </span>
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>

      {validUnits.length < units.length && (
        <div className="absolute bottom-2 left-2 bg-yellow-100 border border-yellow-400 text-yellow-700 px-3 py-2 rounded text-xs">
          {units.length - validUnits.length} unidad(es) no pudieron ser geocodificadas
        </div>
      )}
    </div>
  );
};
