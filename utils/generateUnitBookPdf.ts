import type { jsPDF } from 'jspdf';
import type { Resource, Unit, UnitBook, UnitBookMember, UnitBookPhoto } from '../types';
import { formatAgeFromBirthDate, formatOpaloTenure, safeUnitBookFilename } from './unitBookHelpers';
import { buildUnitBookLocationMaps, hasUnitCoordinates } from './unitBookStaticMap';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 11;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 8;

const RED: [number, number, number] = [196, 30, 58];
const BLUE: [number, number, number] = [22, 48, 92];
const BLUE_SOFT: [number, number, number] = [236, 242, 250];
const RED_SOFT: [number, number, number] = [252, 235, 238];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [226, 232, 240];
const WHITE: [number, number, number] = [255, 255, 255];

const OPALO_LOGO_SRC = new URL('../assets/logo-opalo.jpg', import.meta.url).href;

export type UnitBookPdfMember = {
  resource: Resource;
  profile?: UnitBookMember;
  functions: string;
  experience: string;
  workZone: string;
  colleagueMessage: string;
  tenure: string;
  age: string;
};

type LoadedImage = { dataUrl: string; format: 'PNG' | 'JPEG'; aspect?: number };

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  return 'JPEG';
}

async function loadImageAsDataUrl(src: string, maxEdge = 900): Promise<LoadedImage | null> {
  if (!src) return null;
  try {
    let dataUrl = src;
    if (!src.startsWith('data:')) {
      const response = await fetch(src);
      if (!response.ok) return null;
      const blob = await response.blob();
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('No se pudo leer la imagen'));
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    const resized = await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (!w || !h) {
            resolve(dataUrl);
            return;
          }
          const scale = Math.min(1, maxEdge / Math.max(w, h));
          const cw = Math.max(1, Math.round(w * scale));
          const ch = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });

    if (!resized) return null;
    return { dataUrl: resized, format: imageFormat(resized) };
  } catch (error) {
    console.warn('No se pudo cargar imagen para Unit Book:', src, error);
    return null;
  }
}

/** Recorta al centro (un poco arriba, para el rostro) sin estirar. */
async function loadCoverCroppedImage(
  src: string,
  targetW: number,
  targetH: number,
): Promise<LoadedImage | null> {
  const loaded = await loadImageAsDataUrl(src, Math.max(targetW, targetH) * 3);
  if (!loaded?.dataUrl) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(loaded);
          return;
        }
        const targetRatio = targetW / targetH;
        const srcRatio = w / h;
        let sx = 0;
        let sy = 0;
        let sw = w;
        let sh = h;
        if (srcRatio > targetRatio) {
          sw = h * targetRatio;
          sx = (w - sw) / 2;
        } else {
          sh = w / targetRatio;
          sy = Math.max(0, (h - sh) * 0.22);
        }
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(loaded);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.88), format: 'JPEG' });
      } catch {
        resolve(loaded);
      }
    };
    img.onerror = () => resolve(loaded);
    img.src = loaded.dataUrl;
  });
}

/** Recorta el blanco alrededor del logo y conserva su proporción. */
function prepareLogoDataUrl(src: string): Promise<LoadedImage | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        if (!width || !height) {
          resolve(null);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, width, height);
        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;
        let found = false;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            if (a < 20) continue;
            if (r > 245 && g > 245 && b > 245) continue;
            found = true;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
        if (!found) {
          resolve({ dataUrl: canvas.toDataURL('image/png'), format: 'PNG', aspect: width / height });
          return;
        }
        const pad = Math.max(2, Math.round(Math.min(width, height) * 0.02));
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(width - 1, maxX + pad);
        maxY = Math.min(height - 1, maxY + pad);
        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;
        const out = document.createElement('canvas');
        out.width = cropW;
        out.height = cropH;
        const outCtx = out.getContext('2d');
        if (!outCtx) {
          resolve(null);
          return;
        }
        outCtx.fillStyle = '#ffffff';
        outCtx.fillRect(0, 0, cropW, cropH);
        outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
        resolve({
          dataUrl: out.toDataURL('image/png'),
          format: 'PNG',
          aspect: cropW / Math.max(cropH, 1),
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const HEADER_RED = 3.2;
const HEADER_BODY = 18;
const HEADER_H = HEADER_RED + HEADER_BODY;
const CONTENT_TOP = HEADER_H + 3.2;

function drawHeaderBar(doc: jsPDF, logo: LoadedImage | null) {
  doc.setFillColor(...RED);
  doc.rect(0, 0, PAGE_W, HEADER_RED, 'F');
  doc.setFillColor(...WHITE);
  doc.rect(0, HEADER_RED, PAGE_W, HEADER_BODY, 'F');

  const logoH = 13;
  const logoW = logo?.aspect ? Math.min(54, Math.max(38, logoH * logo.aspect)) : 46;
  const logoY = HEADER_RED + (HEADER_BODY - logoH) / 2;

  if (logo?.dataUrl) {
    try {
      doc.addImage(logo.dataUrl, logo.format, MARGIN, logoY, logoW, logoH);
    } catch {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...BLUE);
      doc.text('opalo', MARGIN, HEADER_RED + 12);
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...BLUE);
    doc.text('opalo', MARGIN, HEADER_RED + 12);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...RED);
  doc.text('UNIT BOOK', PAGE_W - MARGIN, HEADER_RED + HEADER_BODY / 2 + 1.2, { align: 'right' });
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, HEADER_H, PAGE_W - MARGIN, HEADER_H);
}

function drawFooter(doc: jsPDF, page: number, totalHint: string) {
  doc.setFillColor(...BLUE);
  doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H, 'F');
  doc.setFillColor(...RED);
  doc.rect(0, PAGE_H - FOOTER_H, 4, FOOTER_H, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...WHITE);
  doc.text(totalHint, MARGIN + 2, PAGE_H - 3);
  doc.text(String(page), PAGE_W - MARGIN, PAGE_H - 3, { align: 'right' });
}

function newContentPage(doc: jsPDF, logo: LoadedImage | null, pageRef: { n: number }, unitName: string) {
  if (pageRef.n > 0) {
    drawFooter(doc, pageRef.n, `Unit Book  ·  ${unitName}`);
    doc.addPage();
  }
  pageRef.n += 1;
  drawHeaderBar(doc, logo);
  return CONTENT_TOP;
}

function ensureSpace(
  doc: jsPDF,
  y: number,
  needed: number,
  logo: LoadedImage | null,
  pageRef: { n: number },
  unitName: string,
): number {
  if (y + needed <= PAGE_H - FOOTER_H - 3) return y;
  return newContentPage(doc, logo, pageRef, unitName);
}

function writeLines(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineH: number,
  maxLines: number,
): number {
  const lines = (doc.splitTextToSize(value, maxWidth) as string[]).slice(0, maxLines);
  lines.forEach((line) => {
    doc.text(line, x, y);
    y += lineH;
  });
  return y;
}

function sectionLabel(doc: jsPDF, title: string, y: number): number {
  doc.setFillColor(...RED);
  doc.rect(MARGIN, y, 2.2, 5.2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...BLUE);
  doc.text(title.toUpperCase(), MARGIN + 5, y + 3.8);
  return y + 8;
}

function addImageSafe(
  doc: jsPDF,
  img: LoadedImage | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (!img?.dataUrl) {
    doc.setFillColor(...BLUE_SOFT);
    doc.rect(x, y, w, h, 'F');
    return;
  }
  try {
    doc.addImage(img.dataUrl, img.format, x, y, w, h);
  } catch {
    doc.setFillColor(...BLUE_SOFT);
    doc.rect(x, y, w, h, 'F');
  }
}

function drawPhotoPlaceholder(doc: jsPDF, x: number, y: number, w: number, h: number, name: string) {
  doc.setFillColor(...BLUE);
  doc.rect(x, y, w, h, 'F');
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...WHITE);
  doc.text(initials || '—', x + w / 2, y + h / 2 + 2.4, { align: 'center' });
}

export async function generateUnitBookPdf(opts: {
  unit: Unit;
  book: UnitBook;
  photos: UnitBookPhoto[];
  members: UnitBookPdfMember[];
}): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const { unit, book, photos, members } = opts;
  const pageRef = { n: 0 };
  const unitName = unit.name || 'Unidad';

  const logo = await prepareLogoDataUrl(OPALO_LOGO_SRC);
  const coverSrc = photos[0]?.imageUrl || unit.images?.[0] || '';
  const cover = coverSrc ? await loadImageAsDataUrl(coverSrc, 1200) : null;
  const photoImgs = await Promise.all(
    photos.map(async (p) => ({ photo: p, img: await loadImageAsDataUrl(p.imageUrl, 900) })),
  );
  const memberImgs = await Promise.all(
    members.map(async (m) => ({
      id: m.resource.id,
      img: m.resource.image ? await loadCoverCroppedImage(m.resource.image, 240, 320) : null,
    })),
  );
  const memberImgMap = new Map(memberImgs.map((m) => [m.id, m.img]));

  const coordsOk = hasUnitCoordinates(unit);
  const maps = coordsOk
    ? await buildUnitBookLocationMaps(unit.latitude as number, unit.longitude as number)
    : { near: null, wide: null };

  let y = newContentPage(doc, logo, pageRef, unitName);

  // Portada compacta
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...BLUE);
  y = writeLines(doc, unitName, MARGIN, y + 4, CONTENT_W * 0.62, 6.2, 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const introBits = [text(unit.clientName), text(unit.address)].filter(Boolean);
  introBits.forEach((bit) => {
    y = writeLines(doc, bit, MARGIN, y, CONTENT_W * 0.62, 4.2, 2);
  });

  if (cover?.dataUrl) {
    addImageSafe(doc, cover, MARGIN + CONTENT_W * 0.64, CONTENT_TOP, CONTENT_W * 0.36, 38);
  }

  y = Math.max(y, CONTENT_TOP + 38 + 2);

  const welcome = text(book.welcomeMessage);
  if (welcome) {
    y = ensureSpace(doc, y, 16, logo, pageRef, unitName);
    doc.setFillColor(...RED_SOFT);
    const welcomeLines = (doc.splitTextToSize(`“${welcome}”`, CONTENT_W - 8) as string[]).slice(0, 3);
    const boxH = 5 + welcomeLines.length * 4.2;
    doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 1.5, 1.5, 'F');
    doc.setFillColor(...RED);
    doc.rect(MARGIN, y, 1.8, boxH, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...BLUE);
    let wy = y + 5;
    welcomeLines.forEach((line) => {
      doc.text(line, MARGIN + 5, wy);
      wy += 4.2;
    });
    y += boxH + 4;
  }

  // Datos clave en fila
  const facts = [
    { label: 'Pisos', value: book.floorCount != null ? String(book.floorCount) : '' },
    { label: 'Zonas', value: (unit.zones || []).map((z) => z.name).filter(Boolean).join(', ') },
    {
      label: 'Supervisión',
      value: [unit.coordinator?.name, unit.residentSupervisor?.name, unit.rovingSupervisor?.name]
        .filter(Boolean)
        .join(' · '),
    },
  ].filter((f) => f.value);

  if (facts.length) {
    y = ensureSpace(doc, y, 16, logo, pageRef, unitName);
    const colW = CONTENT_W / facts.length;
    facts.forEach((fact, i) => {
      const x = MARGIN + i * colW;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...RED);
      doc.text(fact.label.toUpperCase(), x, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      const lines = (doc.splitTextToSize(fact.value, colW - 3) as string[]).slice(0, 2);
      lines.forEach((line, li) => doc.text(line, x, y + 4.2 + li * 3.6));
    });
    y += 14;
  }

  const blocks: Array<{ title: string; body?: string }> = [
    { title: 'Objetivo del servicio', body: book.serviceObjective },
    { title: 'Horarios y jornada', body: book.workSchedule },
    { title: 'Código de vestimenta', body: book.dressCode },
    { title: 'Acceso e indicaciones', body: book.accessInstructions },
    { title: 'Notas importantes', body: book.importantNotes },
    ...(book.customSections || [])
      .filter((s) => text(s.title) || text(s.body))
      .map((s) => ({ title: s.title || 'Sección', body: s.body })),
  ].filter((b) => text(b.body));

  for (const block of blocks) {
    y = ensureSpace(doc, y, 16, logo, pageRef, unitName);
    y = sectionLabel(doc, block.title, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(text(block.body), CONTENT_W) as string[];
    for (const line of lines) {
      y = ensureSpace(doc, y, 5, logo, pageRef, unitName);
      doc.text(line, MARGIN, y);
      y += 3.8;
    }
    y += 2.5;
  }

  // Mapas (solo folleto)
  if (maps.near || maps.wide) {
    y = ensureSpace(doc, y, 78, logo, pageRef, unitName);
    y = sectionLabel(doc, 'Ubicación', y);
    const mapW = (CONTENT_W - 4) / 2;
    const mapH = 58;
    const nearImg: LoadedImage | null = maps.near ? { dataUrl: maps.near, format: 'JPEG' } : null;
    const wideImg: LoadedImage | null = maps.wide ? { dataUrl: maps.wide, format: 'JPEG' } : null;
    addImageSafe(doc, nearImg, MARGIN, y, mapW, mapH);
    addImageSafe(doc, wideImg, MARGIN + mapW + 4, y, mapW, mapH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...RED);
    doc.text('Alrededores · calles cercanas', MARGIN, y + mapH + 4);
    doc.setTextColor(...BLUE);
    doc.text('Contexto urbano · zona amplia', MARGIN + mapW + 4, y + mapH + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    const mapNote = text(unit.address) || 'Ubicación de la unidad';
    doc.text(mapNote.slice(0, 90), MARGIN, y + mapH + 8);
    y += mapH + 12;
  }

  // Galería compacta 3 columnas
  const gallery = photoImgs.filter((p) => p.img?.dataUrl);
  if (gallery.length) {
    y = ensureSpace(doc, y, 42, logo, pageRef, unitName);
    y = sectionLabel(doc, 'Fotos de la unidad', y);
    const cols = 3;
    const gap = 2.5;
    const colW = (CONTENT_W - gap * (cols - 1)) / cols;
    const imgH = 32;
    gallery.forEach((item, i) => {
      const col = i % cols;
      if (col === 0 && i > 0) y += imgH + (item.photo.caption ? 8 : 3);
      y = ensureSpace(doc, y, imgH + 8, logo, pageRef, unitName);
      const x = MARGIN + col * (colW + gap);
      addImageSafe(doc, item.img, x, y, colW, imgH);
      if (item.photo.caption) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        doc.text((doc.splitTextToSize(item.photo.caption, colW) as string[])[0] || '', x, y + imgH + 3.2);
      }
      if (i === gallery.length - 1) y += imgH + (item.photo.caption ? 8 : 4);
    });
  }

  // Equipo compacto 2 columnas
  y = ensureSpace(doc, y, 50, logo, pageRef, unitName);
  y = sectionLabel(doc, 'Tu equipo', y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    members.length
      ? `${members.length} colaboradores de la unidad.`
      : 'Aún no hay colaboradores incluidos.',
    MARGIN,
    y,
  );
  y += 5;

  const gap = 3;
  const cardW = (CONTENT_W - gap) / 2;
  const photoW = 16;
  const photoH = 21.5;
  let col = 0;
  let rowY = y;
  let leftH = 0;

  const cardHeightFor = (member: UnitBookPdfMember): number => {
    let h = 28.5;
    if (text(member.functions)) h += 8;
    if (text(member.experience)) h += 7;
    if (text(member.colleagueMessage)) h += 7;
    return Math.min(h, 46);
  };

  for (const member of members) {
    const cardH = cardHeightFor(member);
    if (col === 0) {
      rowY = ensureSpace(doc, rowY, cardH + 2, logo, pageRef, unitName);
      leftH = cardH;
    } else if (rowY + cardH > PAGE_H - FOOTER_H - 3) {
      rowY = newContentPage(doc, logo, pageRef, unitName);
      col = 0;
      leftH = cardH;
    }

    const x = MARGIN + col * (cardW + gap);
    const cardY = rowY;

    doc.setFillColor(...BLUE_SOFT);
    doc.roundedRect(x, cardY, cardW, cardH, 1.4, 1.4, 'F');
    doc.setFillColor(...RED);
    doc.rect(x, cardY, 1.5, cardH, 'F');

    const photo = memberImgMap.get(member.resource.id);
    const px = x + 3.5;
    const py = cardY + 3.5;
    if (photo?.dataUrl) {
      try {
        doc.addImage(photo.dataUrl, photo.format, px, py, photoW, photoH);
      } catch {
        drawPhotoPlaceholder(doc, px, py, photoW, photoH, member.resource.name);
      }
    } else {
      drawPhotoPlaceholder(doc, px, py, photoW, photoH, member.resource.name);
    }

    const tx = px + photoW + 3;
    const tw = cardW - photoW - 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...BLUE);
    const names = (doc.splitTextToSize(member.resource.name || 'Colaborador', tw) as string[]).slice(0, 2);
    let ty = cardY + 7;
    names.forEach((line) => {
      doc.text(line, tx, ty);
      ty += 3.5;
    });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...RED);
    doc.text((text(member.resource.puesto) || 'Sin puesto').slice(0, 42), tx, ty);
    ty += 3.6;

    const meta = [
      member.age,
      member.tenure ? `${member.tenure} en Opalo` : '',
      member.workZone,
      member.resource.assignedShift,
    ]
      .filter(Boolean)
      .join('  ·  ');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    if (meta) {
      const metaLines = (doc.splitTextToSize(meta, tw) as string[]).slice(0, 2);
      metaLines.forEach((line) => {
        doc.text(line, tx, ty);
        ty += 3.1;
      });
    }

    let by = Math.max(py + photoH + 3.5, ty + 1);
    const addMini = (label: string, value: string, lines: number) => {
      if (!text(value) || by > cardY + cardH - 4) return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(...BLUE);
      doc.text(label, x + 3.5, by);
      by += 2.8;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...INK);
      const wrapped = (doc.splitTextToSize(value, cardW - 7) as string[]).slice(0, lines);
      wrapped.forEach((line) => {
        if (by > cardY + cardH - 2.5) return;
        doc.text(line, x + 3.5, by);
        by += 2.8;
      });
      by += 0.6;
    };
    addMini('FUNCIONES', member.functions, 2);
    addMini('EXPERIENCIA', member.experience, 1);
    if (text(member.colleagueMessage) && by < cardY + cardH - 4) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.setTextColor(...RED);
      const q = (doc.splitTextToSize(`“${member.colleagueMessage}”`, cardW - 7) as string[])[0];
      if (q) doc.text(q, x + 3.5, by);
    }

    if (col === 1) {
      rowY += Math.max(leftH, cardH) + 2.2;
      col = 0;
    } else {
      col = 1;
    }
  }

  drawFooter(doc, pageRef.n, `Unit Book  ·  ${unitName}  ·  Opalo`);
  doc.save(safeUnitBookFilename(unitName));
}

export function buildPdfMembers(
  resources: Resource[],
  profiles: UnitBookMember[],
  drafts: Record<string, { functions: string; experience: string; workZone: string; colleagueMessage: string; includeInBook: boolean }>,
): UnitBookPdfMember[] {
  const profileById = new Map(profiles.map((p) => [p.resourceId, p]));
  return resources
    .map((resource) => {
      const profile = profileById.get(resource.id);
      const draft = drafts[resource.id];
      const include = draft ? draft.includeInBook : profile ? profile.includeInBook : true;
      if (!include) return null;
      const row: UnitBookPdfMember = {
        resource,
        profile,
        functions: draft?.functions ?? profile?.functions ?? '',
        experience: draft?.experience ?? profile?.experience ?? '',
        workZone: draft?.workZone ?? profile?.workZone ?? '',
        colleagueMessage: draft?.colleagueMessage ?? profile?.colleagueMessage ?? '',
        tenure: formatOpaloTenure(resource.startDate),
        age: formatAgeFromBirthDate(resource.birthDate),
      };
      return row;
    })
    .filter((m): m is UnitBookPdfMember => m !== null);
}
