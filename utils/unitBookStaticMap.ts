/** Mapas estáticos para el Unit Book (solo PDF). Tiles Carto/OSM, sin UI. */

export const UNIT_BOOK_NEAR_RADIUS_M = 500; // ~5 cuadras
export const UNIT_BOOK_WIDE_RADIUS_M = 10_000;

const TILE = 256;
const NEAR_ZOOM = 16;
const WIDE_ZOOM = 12;

function lngToTile(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * 2 ** zoom;
}

function latToTile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom
  );
}

function wrapTile(x: number, zoom: number): number {
  const n = 2 ** zoom;
  return ((x % n) + n) % n;
}

function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

function loadTileImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function renderMapCanvas(
  lat: number,
  lng: number,
  zoom: number,
  width: number,
  height: number,
  radiusM: number,
  circleRgb: [number, number, number],
): Promise<string | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#e8eef4';
  ctx.fillRect(0, 0, width, height);

  const centerX = lngToTile(lng, zoom);
  const centerY = latToTile(lat, zoom);
  const topLeftX = centerX - width / 2 / TILE;
  const topLeftY = centerY - height / 2 / TILE;
  const startTx = Math.floor(topLeftX);
  const startTy = Math.floor(topLeftY);
  const endTx = Math.floor(topLeftX + width / TILE);
  const endTy = Math.floor(topLeftY + height / TILE);

  const jobs: Array<Promise<void>> = [];
  for (let tx = startTx; tx <= endTx; tx++) {
    for (let ty = startTy; ty <= endTy; ty++) {
      if (ty < 0 || ty >= 2 ** zoom) continue;
      const url = `https://a.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${wrapTile(tx, zoom)}/${ty}.png`;
      const dx = (tx - topLeftX) * TILE;
      const dy = (ty - topLeftY) * TILE;
      jobs.push(
        (async () => {
          let img = await loadTileImage(url);
          if (!img) {
            img = await loadTileImage(
              `https://tile.openstreetmap.org/${zoom}/${wrapTile(tx, zoom)}/${ty}.png`,
            );
          }
          if (img) ctx.drawImage(img, dx, dy, TILE, TILE);
        })(),
      );
    }
  }
  await Promise.all(jobs);

  const cx = width / 2;
  const cy = height / 2;
  const rPx = radiusM / metersPerPixel(lat, zoom);

  ctx.beginPath();
  ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${circleRgb[0]}, ${circleRgb[1]}, ${circleRgb[2]}, 0.14)`;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgb(${circleRgb[0]}, ${circleRgb[1]}, ${circleRgb[2]})`;
  ctx.stroke();

  // Pin
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${circleRgb[0]}, ${circleRgb[1]}, ${circleRgb[2]})`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  return canvas.toDataURL('image/jpeg', 0.86);
}

export async function buildUnitBookLocationMaps(
  lat: number,
  lng: number,
): Promise<{ near: string | null; wide: string | null }> {
  const [near, wide] = await Promise.all([
    renderMapCanvas(lat, lng, NEAR_ZOOM, 800, 500, UNIT_BOOK_NEAR_RADIUS_M, [196, 30, 58]),
    renderMapCanvas(lat, lng, WIDE_ZOOM, 800, 500, UNIT_BOOK_WIDE_RADIUS_M, [22, 48, 92]),
  ]);
  return { near, wide };
}

export function hasUnitCoordinates(unit: { latitude?: number; longitude?: number }): boolean {
  return Number.isFinite(unit.latitude) && Number.isFinite(unit.longitude);
}
