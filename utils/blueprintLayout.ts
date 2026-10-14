import { BlueprintLayer, Zone, ZoneLayout } from '../types';

export const PLAN_COLS = 12;

const ZONE_COLORS = ['#dbeafe', '#dcfce7', '#fef3c7', '#fee2e2', '#f3e8ff', '#ffedd5', '#e2e8f0', '#cbd5e1'];

function asCell(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

/** Lee el layout de una fila de `zones`. Acepta 0 y números que vienen como texto. */
export function zoneLayoutFromRow(data: {
  layout_x?: number | string | null;
  layout_y?: number | string | null;
  layout_w?: number | string | null;
  layout_h?: number | string | null;
  layout_color?: string | null;
  layout_layer_id?: string | null;
}): ZoneLayout | undefined {
  if (data.layout_x == null || data.layout_x === '') return undefined;
  const x = asCell(data.layout_x, NaN);
  if (!Number.isFinite(x)) return undefined;
  return {
    x: Math.max(1, x),
    y: Math.max(1, asCell(data.layout_y, 1)),
    w: Math.max(1, asCell(data.layout_w, 2)),
    h: Math.max(1, asCell(data.layout_h, 2)),
    color: data.layout_color?.trim() || '#e2e8f0',
    layerId: data.layout_layer_id || undefined,
  };
}

function normalizeLayout(layout: ZoneLayout | undefined): ZoneLayout {
  const base = layout
    ? {
        x: Math.max(1, asCell(layout.x, 1)),
        y: Math.max(1, asCell(layout.y, 1)),
        w: Math.max(1, asCell(layout.w, 2)),
        h: Math.max(1, asCell(layout.h, 2)),
        color: layout.color?.trim() || '#e2e8f0',
        layerId: layout.layerId,
      }
    : { x: 1, y: 1, w: 2, h: 2, color: '#94a3b8', layerId: undefined as string | undefined };

  const w = Math.min(base.w, PLAN_COLS);
  const x = Math.min(base.x, PLAN_COLS - w + 1);
  return { ...base, x, w };
}

/**
 * Una zona se dibuja en el nivel activo si pertenece a ese nivel,
 * si no tiene nivel y este es el primero, o si su nivel ya no existe.
 */
export function zoneBelongsToLayer(
  zone: Zone,
  activeLayerId: string | null,
  layers: BlueprintLayer[],
): boolean {
  if (!activeLayerId) return true;
  const layerId = zone.layout?.layerId;
  const known = new Set(layers.map((layer) => layer.id));
  if (layerId && layerId === activeLayerId) return true;
  const onFirst = layers.length === 0 || activeLayerId === layers[0]?.id;
  if (!layerId || !known.has(layerId)) return onFirst;
  return false;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function mark(occupied: Set<string>, layout: ZoneLayout) {
  for (let dy = 0; dy < layout.h; dy++) {
    for (let dx = 0; dx < layout.w; dx++) {
      occupied.add(cellKey(layout.x + dx, layout.y + dy));
    }
  }
}

function fullyCovered(occupied: Set<string>, layout: ZoneLayout): boolean {
  for (let dy = 0; dy < layout.h; dy++) {
    for (let dx = 0; dx < layout.w; dx++) {
      if (!occupied.has(cellKey(layout.x + dx, layout.y + dy))) return false;
    }
  }
  return true;
}

function findFreeSlot(occupied: Set<string>, w: number, h: number): { x: number; y: number } {
  const width = Math.min(Math.max(w, 1), PLAN_COLS);
  for (let y = 1; y <= 80; y++) {
    for (let x = 1; x <= PLAN_COLS - width + 1; x++) {
      let free = true;
      for (let dy = 0; dy < h && free; dy++) {
        for (let dx = 0; dx < width; dx++) {
          if (occupied.has(cellKey(x + dx, y + dy))) {
            free = false;
            break;
          }
        }
      }
      if (free) return { x, y };
    }
  }
  return { x: 1, y: 81 };
}

/**
 * Separa zonas que ocupan exactamente la misma área (al crearlas todas
 * quedan en 1,1) para que cada una sea visible. Las que ya tienen
 * una posición propia no se mueven.
 */
export function withVisibleLayouts(zones: Zone[]): Zone[] {
  const occupied = new Set<string>();
  const layouts = new Map<string, ZoneLayout>();
  const order = [...zones].sort((a, b) => a.id.localeCompare(b.id));

  for (const zone of order) {
    const base = normalizeLayout(zone.layout);
    const layout = fullyCovered(occupied, base)
      ? { ...base, ...findFreeSlot(occupied, base.w, base.h) }
      : base;
    mark(occupied, layout);
    layouts.set(zone.id, layout);
  }

  return zones.map((zone) => ({ ...zone, layout: layouts.get(zone.id) || normalizeLayout(zone.layout) }));
}

export function nextZoneLayout(
  zones: Zone[],
  activeLayerId: string | null,
  layers: BlueprintLayer[],
): ZoneLayout {
  const visible = withVisibleLayouts(zones.filter((zone) => zoneBelongsToLayer(zone, activeLayerId, layers)));
  const occupied = new Set<string>();
  for (const zone of visible) {
    if (zone.layout) mark(occupied, zone.layout);
  }
  const slot = findFreeSlot(occupied, 2, 2);
  return {
    x: slot.x,
    y: slot.y,
    w: 2,
    h: 2,
    color: ZONE_COLORS[zones.length % ZONE_COLORS.length],
    layerId: activeLayerId || undefined,
  };
}
