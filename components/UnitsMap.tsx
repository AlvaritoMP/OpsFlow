import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Unit, UnitStatus } from '../types';
import { Building2, MapPin } from 'lucide-react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface UnitsMapProps {
  units: Unit[];
  onSelectUnit?: (unitId: string) => void;
}

interface LocatedUnit extends Unit {
  latitude: number;
  longitude: number;
  plotLat: number;
  plotLng: number;
}

const defaultCenter: [number, number] = [-12.0464, -77.0428];

const statusStyle: Record<string, { marker: string; badgeBg: string; badgeText: string }> = {
  [UnitStatus.ACTIVE]: { marker: '#3b82f6', badgeBg: '#dcfce7', badgeText: '#15803d' },
  [UnitStatus.ISSUE]: { marker: '#ef4444', badgeBg: '#fee2e2', badgeText: '#b91c1c' },
  [UnitStatus.PENDING]: { marker: '#f59e0b', badgeBg: '#fef3c7', badgeText: '#b45309' },
  [UnitStatus.DEACTIVATED]: { marker: '#94a3b8', badgeBg: '#f1f5f9', badgeText: '#475569' },
};

function styleFor(status: UnitStatus) {
  return statusStyle[status] || statusStyle[UnitStatus.ACTIVE];
}

function isPlottable(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

function locateUnits(units: Unit[]): { located: LocatedUnit[]; missing: Unit[] } {
  const valid: Array<Unit & { latitude: number; longitude: number }> = [];
  const missing: Unit[] = [];

  units.forEach((unit) => {
    const latitude = Number(unit.latitude);
    const longitude = Number(unit.longitude);
    if (!isPlottable(latitude, longitude)) {
      missing.push(unit);
      return;
    }
    valid.push({ ...unit, latitude, longitude });
  });

  const groups = new Map<string, typeof valid>();
  valid.forEach((unit) => {
    const key = `${unit.latitude.toFixed(5)}|${unit.longitude.toFixed(5)}`;
    const bucket = groups.get(key) || [];
    bucket.push(unit);
    groups.set(key, bucket);
  });

  const located: LocatedUnit[] = [];
  groups.forEach((bucket) => {
    bucket.forEach((unit, index) => {
      const angle = (2 * Math.PI * index) / Math.max(bucket.length, 1);
      const radius = bucket.length > 1 ? 0.00035 : 0;
      located.push({
        ...unit,
        plotLat: unit.latitude + Math.sin(angle) * radius,
        plotLng: unit.longitude + Math.cos(angle) * radius,
      });
    });
  });

  located.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  missing.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return { located, missing };
}

const createUnitIcon = (status: UnitStatus) => {
  const color = styleFor(status).marker;
  return L.divIcon({
    className: 'unit-map-pin',
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
    popupAnchor: [0, -16],
  });
};

const FitBounds: React.FC<{ units: LocatedUnit[] }> = ({ units }) => {
  const map = useMap();
  const signature = units.map((unit) => `${unit.id}:${unit.plotLat.toFixed(5)}:${unit.plotLng.toFixed(5)}`).join('|');

  useEffect(() => {
    const apply = () => {
      map.invalidateSize();
      if (units.length === 0) {
        map.setView(defaultCenter, 11);
        return;
      }
      if (units.length === 1) {
        map.setView([units[0].plotLat, units[0].plotLng], 15);
        return;
      }
      const bounds = L.latLngBounds(units.map((unit) => [unit.plotLat, unit.plotLng] as [number, number]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    };
    const timer = window.setTimeout(apply, 80);
    return () => window.clearTimeout(timer);
    // signature captures coordinate changes without refitting on unrelated unit fields
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);

  useEffect(() => {
    const node = map.getContainer().parentElement || map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, [map]);

  return null;
};

const FocusUnit: React.FC<{
  focus: { id: string; token: number } | null;
  units: LocatedUnit[];
  markers: React.MutableRefObject<Record<string, L.Marker>>;
}> = ({ focus, units, markers }) => {
  const map = useMap();

  useEffect(() => {
    if (!focus) return;
    const unit = units.find((item) => item.id === focus.id);
    if (!unit) return;
    map.flyTo([unit.plotLat, unit.plotLng], Math.max(map.getZoom(), 15), { duration: 0.45 });
    const timer = window.setTimeout(() => markers.current[unit.id]?.openPopup(), 380);
    return () => window.clearTimeout(timer);
  }, [focus, map, markers, units]);

  return null;
};

const MapCanvas: React.FC<{
  units: LocatedUnit[];
  onSelectUnit?: (unitId: string) => void;
  focus: { id: string; token: number } | null;
}> = ({ units, onSelectUnit, focus }) => {
  const markers = useRef<Record<string, L.Marker>>({});
  const icons = useMemo(
    () => ({
      [UnitStatus.ACTIVE]: createUnitIcon(UnitStatus.ACTIVE),
      [UnitStatus.ISSUE]: createUnitIcon(UnitStatus.ISSUE),
      [UnitStatus.PENDING]: createUnitIcon(UnitStatus.PENDING),
      [UnitStatus.DEACTIVATED]: createUnitIcon(UnitStatus.DEACTIVATED),
    }),
    [],
  );

  return (
    <MapContainer center={defaultCenter} zoom={11} scrollWheelZoom className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds units={units} />
      <FocusUnit focus={focus} units={units} markers={markers} />
      {units.map((unit) => {
        const tone = styleFor(unit.status);
        return (
          <Marker
            key={unit.id}
            position={[unit.plotLat, unit.plotLng]}
            icon={icons[unit.status] || icons[UnitStatus.ACTIVE]}
            ref={(instance) => {
              if (instance) markers.current[unit.id] = instance;
              else delete markers.current[unit.id];
            }}
          >
            <Popup maxWidth={280} minWidth={220}>
              <div style={{ fontFamily: 'inherit', color: '#1e293b' }}>
                <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3, marginBottom: 4 }}>{unit.name}</div>
                <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{unit.clientName || 'Sin cliente'}</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, marginBottom: 8 }}>
                  {unit.address || 'Sin dirección registrada'}
                </div>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: tone.badgeBg,
                    color: tone.badgeText,
                  }}
                >
                  {unit.status}
                </span>
                {onSelectUnit && (
                  <button
                    type="button"
                    onClick={() => onSelectUnit(unit.id)}
                    style={{
                      display: 'block',
                      marginTop: 10,
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: '#2563eb',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Abrir unidad
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
};

export const UnitsMap: React.FC<UnitsMapProps> = ({ units, onSelectUnit }) => {
  const { located, missing } = useMemo(() => locateUnits(units), [units]);
  const [focus, setFocus] = useState<{ id: string; token: number } | null>(null);
  const listed = useMemo(() => [...located, ...missing], [located, missing]);

  const focusUnit = (unitId: string) => {
    setFocus({ id: unitId, token: Date.now() });
  };

  return (
    <div className="relative z-0 bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 h-full">
      <div className="flex items-center gap-3 mb-4">
        <Building2 className="text-slate-600 shrink-0" size={20} />
        <h3 className="text-base md:text-lg font-semibold text-slate-800">Mapa de Unidades</h3>
        <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
          {located.length} en mapa{missing.length > 0 ? ` · ${missing.length} sin ubicación` : ''}
        </span>
      </div>

      <div className="h-[340px] md:h-[420px] w-full rounded-lg overflow-hidden border border-slate-200 relative bg-slate-100">
        {located.length === 0 ? (
          <div className="absolute inset-0 z-[1] flex items-center justify-center px-6 text-center">
            <div>
              <MapPin className="mx-auto mb-2 text-slate-300" size={28} />
              <p className="text-sm text-slate-500">Ninguna unidad tiene coordenadas válidas.</p>
              <p className="text-xs text-slate-400 mt-1">El listado de abajo sigue mostrando nombre, cliente y dirección.</p>
            </div>
          </div>
        ) : (
          <MapCanvas units={located} onSelectUnit={onSelectUnit} focus={focus} />
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
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

      <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
        {listed.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No hay unidades para mostrar.</p>
        ) : (
          listed.map((unit) => {
            const onMap = located.some((item) => item.id === unit.id);
            const tone = styleFor(unit.status);
            const selected = focus?.id === unit.id;
            return (
              <div
                key={unit.id}
                className={`px-3 py-2.5 flex items-start gap-3 ${selected ? 'bg-blue-50' : 'bg-white'}`}
              >
                <button
                  type="button"
                  onClick={() => onMap && focusUnit(unit.id)}
                  disabled={!onMap}
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: onMap ? tone.marker : '#cbd5e1' }} />
                    <span className="text-sm font-semibold text-slate-800 truncate">{unit.name}</span>
                  </div>
                  <p className="text-xs text-slate-600 truncate mt-0.5 pl-4">{unit.clientName || 'Sin cliente'}</p>
                  <p className="text-xs text-slate-400 truncate pl-4">{unit.address || 'Sin dirección'}</p>
                  {!onMap && <p className="text-[11px] text-amber-600 pl-4 mt-0.5">Sin coordenadas en el mapa</p>}
                </button>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: tone.badgeBg, color: tone.badgeText }}
                  >
                    {unit.status}
                  </span>
                  {onSelectUnit && (
                    <button
                      type="button"
                      onClick={() => onSelectUnit(unit.id)}
                      className="text-[11px] font-medium text-blue-600 hover:text-blue-800"
                    >
                      Abrir
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
