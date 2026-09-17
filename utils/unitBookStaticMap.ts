/** Mapas estáticos para el Unit Book (solo PDF). Tiles OSM/Esri, sin clave ni radio. */

const TILE = 256;
const NEAR_ZOOM = 16;
const WIDE_ZOOM = 12;
const PIN_RED: [number, number, number] = [196, 30, 58];

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

function loadTileImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function tileUrls(zoom: number, tx: number, ty: number): string[] {
  const x = wrapTile(tx, zoom);
  return [
    `https://tile.openstreetmap.org/${zoom}/${x}/${ty}.png`,
    `https://tile.openstreetmap.de/${zoom}/${x}/${ty}.png`,
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${zoom}/${ty}/${x}`,
  ];
}

async function loadFirstTile(zoom: number, tx: number, ty: number): Promise<HTMLImageElement | null> {
  for (const url of tileUrls(zoom, tx, ty)) {
    const img = await loadTileImage(url);
    if (img) return img;
  }
  return null;
}

function drawLocationPin(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const [r, g, b] = PIN_RED;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  ctx.beginPath();
  ctx.moveTo(cx, cy + 12);
  ctx.bezierCurveTo(cx + 14, cy + 2, cx + 12, cy - 12, cx, cy - 12);
  ctx.bezierCurveTo(cx - 12, cy - 12, cx - 14, cy + 2, cx, cy + 12);
  ctx.closePath();
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.beginPath();
  ctx.arc(cx, cy - 4, 4.2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

async function renderMapCanvas(
  lat: number,
  lng: number,
  zoom: number,
  width: number,
  height: number,
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
      const dx = (tx - topLeftX) * TILE;
      const dy = (ty - topLeftY) * TILE;
      jobs.push(
        loadFirstTile(zoom, tx, ty).then((img) => {
          if (img) ctx.drawImage(img, dx, dy, TILE, TILE);
        }),
      );
    }
  }
  await Promise.all(jobs);

  drawLocationPin(ctx, width / 2, height / 2);
  return canvas.toDataURL('image/jpeg', 0.86);
}

export async function buildUnitBookLocationMaps(
  lat: number,
  lng: number,
): Promise<{ near: string | null; wide: string | null }> {
  const [near, wide] = await Promise.all([
    renderMapCanvas(lat, lng, NEAR_ZOOM, 800, 500),
    renderMapCanvas(lat, lng, WIDE_ZOOM, 800, 500),
  ]);
  return { near, wide };
}

export function hasUnitCoordinates(unit: { latitude?: number; longitude?: number }): boolean {
  return Number.isFinite(unit.latitude) && Number.isFinite(unit.longitude);
}
