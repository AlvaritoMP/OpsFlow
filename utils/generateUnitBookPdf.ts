import type { jsPDF } from 'jspdf';
import type { Resource, Unit, UnitBook, UnitBookMember, UnitBookPhoto } from '../types';
import { formatOpaloTenure, safeUnitBookFilename } from './unitBookHelpers';

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

const NAVY: [number, number, number] = [16, 43, 82];
const GOLD: [number, number, number] = [184, 148, 79];
const SLATE: [number, number, number] = [51, 65, 85];
const MUTED: [number, number, number] = [100, 116, 139];
const LIGHT: [number, number, number] = [241, 245, 249];
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
};

type LoadedImage = { dataUrl: string; format: 'PNG' | 'JPEG' };

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'PNG';
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

function drawFooter(doc: jsPDF, page: number, unitName: string) {
  doc.setFillColor(...NAVY);
  doc.rect(0, PAGE_H - 10, PAGE_W, 10, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...WHITE);
  doc.text(`Unit Book  ·  ${unitName}`, MARGIN, PAGE_H - 4);
  doc.text(String(page), PAGE_W - MARGIN, PAGE_H - 4, { align: 'right' });
}

function ensureSpace(doc: jsPDF, y: number, needed: number, unitName: string, pageRef: { n: number }): number {
  if (y + needed <= PAGE_H - 16) return y;
  drawFooter(doc, pageRef.n, unitName);
  doc.addPage();
  pageRef.n += 1;
  return 16;
}

function writeWrapped(
  doc: jsPDF,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineH: number,
  unitName: string,
  pageRef: { n: number },
): number {
  const lines = (doc.splitTextToSize(value || '—', maxWidth) as string[]) || ['—'];
  for (const line of lines) {
    y = ensureSpace(doc, y, lineH + 1, unitName, pageRef);
    doc.text(line, x, y);
    y += lineH;
  }
  return y;
}

function sectionTitle(doc: jsPDF, title: string, y: number, unitName: string, pageRef: { n: number }): number {
  y = ensureSpace(doc, y, 12, unitName, pageRef);
  doc.setFillColor(...GOLD);
  doc.rect(MARGIN, y, 3.2, 7, 'F');
  doc.setFillColor(...LIGHT);
  doc.rect(MARGIN + 3.2, y, CONTENT_W - 3.2, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(title.toUpperCase(), MARGIN + 7, y + 4.8);
  return y + 12;
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
  const pageRef = { n: 1 };
  const unitName = unit.name || 'Unidad';

  const logo = await loadImageAsDataUrl(OPALO_LOGO_SRC, 400);
  const coverSrc = photos[0]?.imageUrl || unit.images?.[0] || '';
  const cover = coverSrc ? await loadImageAsDataUrl(coverSrc, 1400) : null;
  const photoImgs = await Promise.all(
    photos.map(async (p) => ({ photo: p, img: await loadImageAsDataUrl(p.imageUrl, 1100) })),
  );
  const memberImgs = await Promise.all(
    members.map(async (m) => ({
      id: m.resource.id,
      img: m.resource.image ? await loadImageAsDataUrl(m.resource.image, 500) : null,
    })),
  );
  const memberImgMap = new Map(memberImgs.map((m) => [m.id, m.img]));

  // ---------- Portada ----------
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 0, 6, PAGE_H, 'F');

  if (logo?.dataUrl) {
    try {
      doc.addImage(logo.dataUrl, logo.format, MARGIN + 4, 16, 38, 14);
    } catch {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(...WHITE);
      doc.text('OPALO', MARGIN + 4, 26);
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...WHITE);
    doc.text('OPALO', MARGIN + 4, 26);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text('LIBRO DE UNIDAD  ·  UNIT BOOK', MARGIN + 4, 40);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...WHITE);
  const nameLines = doc.splitTextToSize(unitName, CONTENT_W - 8) as string[];
  let y = 56;
  nameLines.slice(0, 3).forEach((line) => {
    doc.text(line, MARGIN + 4, y);
    y += 11;
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(203, 213, 225);
  doc.text(unit.clientName || '', MARGIN + 4, y + 2);
  y += 8;
  if (unit.address) {
    const addr = doc.splitTextToSize(unit.address, CONTENT_W - 8) as string[];
    addr.slice(0, 2).forEach((line) => {
      doc.text(line, MARGIN + 4, y);
      y += 6;
    });
  }

  if (cover?.dataUrl) {
    const imgY = Math.min(y + 10, 118);
    const imgH = 110;
    try {
      doc.addImage(cover.dataUrl, cover.format, MARGIN + 4, imgY, CONTENT_W - 8, imgH);
    } catch {
      // sin portada
    }
    y = imgY + imgH + 12;
  } else {
    y += 16;
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  const tagline = 'Guía de incorporación para quienes se suman al equipo de esta unidad.';
  const tagLines = doc.splitTextToSize(tagline, CONTENT_W - 8) as string[];
  tagLines.forEach((line) => {
    doc.text(line, MARGIN + 4, y);
    y += 6;
  });

  const generated = new Date().toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(`Generado el ${generated}`, MARGIN + 4, PAGE_H - 16);
  doc.text('Uso interno · Opalo', PAGE_W - MARGIN, PAGE_H - 16, { align: 'right' });

  // ---------- La unidad ----------
  doc.addPage();
  pageRef.n += 1;
  y = 18;

  y = sectionTitle(doc, 'Conoce la unidad', y, unitName, pageRef);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...SLATE);

  const welcome = text(book.welcomeMessage);
  if (welcome) {
    y = ensureSpace(doc, y, 20, unitName, pageRef);
    doc.setFillColor(255, 250, 240);
    const welcomeLines = doc.splitTextToSize(`“${welcome}”`, CONTENT_W - 10) as string[];
    const boxH = Math.min(48, 8 + welcomeLines.length * 5);
    doc.roundedRect(MARGIN, y - 4, CONTENT_W, boxH, 2, 2, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    let wy = y + 4;
    welcomeLines.slice(0, 7).forEach((line) => {
      doc.text(line, MARGIN + 5, wy);
      wy += 5;
    });
    y += boxH + 6;
  }

  const facts: Array<{ label: string; value: string }> = [
    { label: 'Cliente', value: text(unit.clientName) },
    { label: 'Dirección', value: text(unit.address) },
    {
      label: 'Pisos / niveles',
      value: book.floorCount != null && book.floorCount !== undefined ? String(book.floorCount) : '',
    },
    {
      label: 'Zonas de la unidad',
      value: (unit.zones || []).map((z) => z.name).filter(Boolean).join(', '),
    },
  ].filter((f) => f.value);

  for (const fact of facts) {
    y = ensureSpace(doc, y, 12, unitName, pageRef);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GOLD);
    doc.text(fact.label.toUpperCase(), MARGIN, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE);
    y = writeWrapped(doc, fact.value, MARGIN, y, CONTENT_W, 5, unitName, pageRef);
    y += 3;
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
  ];

  for (const block of blocks) {
    if (!text(block.body)) continue;
    y = sectionTitle(doc, block.title, y, unitName, pageRef);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...SLATE);
    y = writeWrapped(doc, text(block.body), MARGIN, y, CONTENT_W, 5.2, unitName, pageRef);
    y += 4;
  }

  const supervisors = [
    unit.coordinator ? { label: 'Coordinador', name: unit.coordinator.name } : null,
    unit.residentSupervisor ? { label: 'Supervisor residente', name: unit.residentSupervisor.name } : null,
    unit.rovingSupervisor ? { label: 'Supervisor de ronda', name: unit.rovingSupervisor.name } : null,
  ].filter((s): s is { label: string; name: string } => Boolean(s?.name));

  if (supervisors.length) {
    y = sectionTitle(doc, 'Supervisión de la unidad', y, unitName, pageRef);
    for (const s of supervisors) {
      y = ensureSpace(doc, y, 8, unitName, pageRef);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...NAVY);
      doc.text(s.label, MARGIN, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...SLATE);
      doc.text(s.name, MARGIN + 52, y);
      y += 6;
    }
  }

  drawFooter(doc, pageRef.n, unitName);

  // ---------- Galería ----------
  const gallery = photoImgs.filter((p) => p.img?.dataUrl);
  if (gallery.length) {
    doc.addPage();
    pageRef.n += 1;
    y = 18;
    y = sectionTitle(doc, 'Fotos de la unidad', y, unitName, pageRef);

    const colW = (CONTENT_W - 6) / 2;
    const imgH = 62;
    let col = 0;
    for (const item of gallery) {
      if (!item.img) continue;
      y = ensureSpace(doc, y, imgH + 16, unitName, pageRef);
      const x = col === 0 ? MARGIN : MARGIN + colW + 6;
      try {
        doc.addImage(item.img.dataUrl, item.img.format, x, y, colW, imgH);
      } catch {
        doc.setFillColor(...LIGHT);
        doc.rect(x, y, colW, imgH, 'F');
      }
      if (item.photo.caption) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        const cap = (doc.splitTextToSize(item.photo.caption, colW) as string[])[0] || '';
        doc.text(cap, x, y + imgH + 4.5);
      }
      if (col === 1) {
        y += imgH + 12;
        col = 0;
      } else {
        col = 1;
      }
    }
    if (col === 1) y += imgH + 12;
    drawFooter(doc, pageRef.n, unitName);
  }

  // ---------- Equipo ----------
  doc.addPage();
  pageRef.n += 1;
  y = 18;
  y = sectionTitle(doc, 'Tu equipo en la unidad', y, unitName, pageRef);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...SLATE);
  y = writeWrapped(
    doc,
    members.length
      ? 'Estas son las personas con las que compartirás el servicio. Conócelas: su puesto, funciones, zona y un mensaje para quienes se incorporan.'
      : 'Aún no hay colaboradores incluidos en este Unit Book.',
    MARGIN,
    y,
    CONTENT_W,
    5.2,
    unitName,
    pageRef,
  );
  y += 6;

  const cardH = 88;
  for (const member of members) {
    y = ensureSpace(doc, y, cardH, unitName, pageRef);
    doc.setFillColor(...LIGHT);
    doc.roundedRect(MARGIN, y, CONTENT_W, cardH - 4, 2.5, 2.5, 'F');

    const photo = memberImgMap.get(member.resource.id);
    const photoSize = 36;
    const photoX = MARGIN + 4;
    const photoY = y + 6;
    if (photo?.dataUrl) {
      try {
        doc.addImage(photo.dataUrl, photo.format, photoX, photoY, photoSize, photoSize);
      } catch {
        drawPhotoPlaceholder(doc, photoX, photoY, photoSize, member.resource.name);
      }
    } else {
      drawPhotoPlaceholder(doc, photoX, photoY, photoSize, member.resource.name);
    }

    const textX = photoX + photoSize + 5;
    const textW = CONTENT_W - photoSize - 16;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    const names = (doc.splitTextToSize(member.resource.name || 'Colaborador', textW) as string[]).slice(0, 2);
    let ty = y + 12;
    names.forEach((line) => {
      doc.text(line, textX, ty);
      ty += 5.5;
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...GOLD);
    doc.text(text(member.resource.puesto) || 'Puesto no indicado', textX, ty);
    ty += 6;

    const metaBits = [
      member.workZone ? `Zona: ${member.workZone}` : '',
      member.tenure ? `Tiempo en Opalo: ${member.tenure}` : '',
      member.resource.assignedShift ? `Turno: ${member.resource.assignedShift}` : '',
    ].filter(Boolean);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    if (metaBits.length) {
      const metaLines = doc.splitTextToSize(metaBits.join('  ·  '), textW) as string[];
      metaLines.slice(0, 2).forEach((line) => {
        doc.text(line, textX, ty);
        ty += 4.2;
      });
    }

    const bodyY = Math.max(photoY + photoSize + 6, ty + 2);
    let by = bodyY;
    const addMini = (label: string, value: string) => {
      if (!text(value)) return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...NAVY);
      doc.text(label.toUpperCase(), MARGIN + 4, by);
      by += 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...SLATE);
      const lines = (doc.splitTextToSize(value, CONTENT_W - 10) as string[]).slice(0, 3);
      lines.forEach((line) => {
        doc.text(line, MARGIN + 4, by);
        by += 4;
      });
      by += 1.5;
    };

    addMini('Funciones', member.functions);
    addMini('Experiencia', member.experience);
    if (member.colleagueMessage) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(...NAVY);
      const quote = (doc.splitTextToSize(`“${member.colleagueMessage}”`, CONTENT_W - 10) as string[]).slice(0, 3);
      quote.forEach((line) => {
        if (by < y + cardH - 8) {
          doc.text(line, MARGIN + 4, by);
          by += 4;
        }
      });
    }

    y += cardH;
  }

  drawFooter(doc, pageRef.n, unitName);

  // ---------- Cierre ----------
  doc.addPage();
  pageRef.n += 1;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 0, 6, PAGE_H, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.text('Bienvenido al equipo', MARGIN + 8, 120);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(203, 213, 225);
  const close = doc.splitTextToSize(
    'Este Unit Book es una guía para situarte en la unidad: el servicio, los espacios y las personas con las que trabajarás. Cualquier duda, acude a tu supervisor o al equipo de operaciones.',
    CONTENT_W - 10,
  ) as string[];
  let cy = 136;
  close.forEach((line) => {
    doc.text(line, MARGIN + 8, cy);
    cy += 7;
  });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text('Opalo  ·  Operaciones', MARGIN + 8, 250);

  doc.save(safeUnitBookFilename(unitName));
}

function drawPhotoPlaceholder(doc: jsPDF, x: number, y: number, size: number, name: string) {
  doc.setFillColor(203, 213, 225);
  doc.rect(x, y, size, size, 'F');
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...NAVY);
  doc.text(initials || '—', x + size / 2, y + size / 2 + 4, { align: 'center' });
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
      };
      return row;
    })
    .filter((m): m is UnitBookPdfMember => m !== null);
}
