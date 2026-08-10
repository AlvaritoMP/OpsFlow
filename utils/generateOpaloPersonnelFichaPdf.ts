import { jsPDF } from 'jspdf';
import type {
  Resource,
  WorkerSnapshotComplementary,
  WorkerSnapshotEducacion,
  WorkerSnapshotExperiencia,
  WorkerSnapshotFamiliar,
  WorkerSnapshotAntecedenteSalud,
} from '../types';
import { hydrateComplementaryFromSnapshot } from './complementaryHydrate';
import { extractHandoffNameParts } from './handoffNameParts';

type FichaContext = {
  unitName?: string;
  clientName?: string;
};

type Cell = { label: string; value: string; span?: number };

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 10;
const CONTENT_W = PAGE_W - MARGIN * 2;

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value).trim();
}

function formatDateDisplay(raw: unknown): string {
  const value = text(raw);
  if (!value) return '';
  // Already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
  // YYYY-MM-DD
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return value;
}

function splitWorkerName(fullName: string): { nombres: string; apellidoPaterno: string; apellidoMaterno: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { nombres: '', apellidoPaterno: '', apellidoMaterno: '' };
  if (parts.length === 1) return { nombres: parts[0], apellidoPaterno: '', apellidoMaterno: '' };
  if (parts.length === 2) return { apellidoPaterno: parts[0], apellidoMaterno: '', nombres: parts[1] };
  if (parts.length === 3) {
    return { apellidoPaterno: parts[0], apellidoMaterno: parts[1], nombres: parts[2] };
  }
  return {
    apellidoPaterno: parts[0],
    apellidoMaterno: parts[1],
    nombres: parts.slice(2).join(' '),
  };
}

function resolveFicha(worker: Resource, ctx: FichaContext = {}): WorkerSnapshotComplementary {
  const snapshot = worker.inboundSourceData?.workerSnapshot;
  const complementary = hydrateComplementaryFromSnapshot(snapshot, snapshot?.complementary ?? null);
  const fromSnapshot = extractHandoffNameParts(snapshot);
  const fromName = splitWorkerName(worker.name || '');

  const fill = (key: keyof WorkerSnapshotComplementary, ...candidates: unknown[]) => {
    if (text(complementary[key])) return;
    for (const candidate of candidates) {
      const v = text(candidate);
      if (v) {
        complementary[key] = v;
        return;
      }
    }
  };

  fill('nombres', fromSnapshot.nombres, fromName.nombres);
  fill('apellidoPaterno', fromSnapshot.apellidoPaterno, fromName.apellidoPaterno);
  fill('apellidoMaterno', fromSnapshot.apellidoMaterno, fromName.apellidoMaterno);
  fill('nroDocumento', worker.dni);
  fill('tipoDocumento', worker.dni ? 'DNI' : '');
  fill('telefono', worker.phone);
  fill('fechaNacimiento', worker.birthDate);
  fill('puestoContrato', worker.puesto);
  fill('unidadDestaque', ctx.unitName, worker.localidad);
  fill('distrito', worker.localidad);

  return complementary;
}

function extraField(ficha: WorkerSnapshotComplementary, key: string): string {
  return text((ficha as Record<string, unknown>)[key]);
}

function safeFilenamePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

class FichaPdfBuilder {
  doc: jsPDF;
  y = MARGIN;
  private readonly lineH = 4.2;

  constructor() {
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  }

  private ensureSpace(needed: number) {
    if (this.y + needed <= PAGE_H - MARGIN) return;
    this.doc.addPage();
    this.y = MARGIN;
  }

  title() {
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(13);
    this.doc.text('FICHA DE PERSONAL', PAGE_W / 2, this.y + 4, { align: 'center' });
    this.y += 9;
    this.doc.setDrawColor(30, 30, 30);
    this.doc.setLineWidth(0.4);
    this.doc.line(MARGIN, this.y, PAGE_W - MARGIN, this.y);
    this.y += 3;
  }

  section(title: string) {
    this.ensureSpace(8);
    this.doc.setFillColor(235, 235, 235);
    this.doc.rect(MARGIN, this.y, CONTENT_W, 5.5, 'F');
    this.doc.setDrawColor(80, 80, 80);
    this.doc.setLineWidth(0.2);
    this.doc.rect(MARGIN, this.y, CONTENT_W, 5.5, 'S');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(8);
    this.doc.setTextColor(20, 20, 20);
    this.doc.text(title, MARGIN + 1.5, this.y + 3.8);
    this.y += 5.5;
  }

  private drawCell(x: number, y: number, w: number, h: number, label: string, value: string) {
    this.doc.setDrawColor(120, 120, 120);
    this.doc.setLineWidth(0.15);
    this.doc.rect(x, y, w, h, 'S');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(5.5);
    this.doc.setTextColor(70, 70, 70);
    this.doc.text(label.toUpperCase(), x + 1, y + 2.4);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7.5);
    this.doc.setTextColor(15, 15, 15);
    const lines = this.doc.splitTextToSize(value || ' ', w - 2);
    const maxLines = Math.max(1, Math.floor((h - 3.4) / this.lineH));
    this.doc.text(lines.slice(0, maxLines), x + 1, y + 5.2);
  }

  row(cells: Cell[], rowHeight = 9) {
    const totalSpan = cells.reduce((sum, c) => sum + (c.span ?? 1), 0) || 1;
    this.ensureSpace(rowHeight);
    let x = MARGIN;
    for (const cell of cells) {
      const span = cell.span ?? 1;
      const w = (CONTENT_W * span) / totalSpan;
      this.drawCell(x, this.y, w, rowHeight, cell.label, cell.value);
      x += w;
    }
    this.y += rowHeight;
  }

  tableHeader(headers: string[], widths: number[]) {
    const h = 5.2;
    this.ensureSpace(h);
    let x = MARGIN;
    this.doc.setFillColor(245, 245, 245);
    this.doc.rect(MARGIN, this.y, CONTENT_W, h, 'F');
    headers.forEach((header, i) => {
      const w = widths[i];
      this.doc.setDrawColor(120, 120, 120);
      this.doc.setLineWidth(0.15);
      this.doc.rect(x, this.y, w, h, 'S');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(5.5);
      this.doc.setTextColor(60, 60, 60);
      this.doc.text(header.toUpperCase(), x + 1, this.y + 3.5);
      x += w;
    });
    this.y += h;
  }

  tableRow(values: string[], widths: number[], rowHeight = 6.5) {
    this.ensureSpace(rowHeight);
    let x = MARGIN;
    values.forEach((value, i) => {
      const w = widths[i];
      this.doc.setDrawColor(120, 120, 120);
      this.doc.setLineWidth(0.15);
      this.doc.rect(x, this.y, w, rowHeight, 'S');
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(6.5);
      this.doc.setTextColor(20, 20, 20);
      const lines = this.doc.splitTextToSize(value || ' ', w - 2);
      this.doc.text(lines.slice(0, 2), x + 1, this.y + 2.8);
      x += w;
    });
    this.y += rowHeight;
  }

  emptyRows(count: number, widths: number[], rowHeight = 6.5) {
    for (let i = 0; i < count; i++) {
      this.tableRow(widths.map(() => ''), widths, rowHeight);
    }
  }

  paragraph(label: string, value: string) {
    this.ensureSpace(10);
    this.doc.setDrawColor(120, 120, 120);
    this.doc.setLineWidth(0.15);
    const h = 9;
    this.doc.rect(MARGIN, this.y, CONTENT_W, h, 'S');
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(5.5);
    this.doc.setTextColor(70, 70, 70);
    this.doc.text(label.toUpperCase(), MARGIN + 1, this.y + 2.4);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(7.5);
    this.doc.setTextColor(15, 15, 15);
    this.doc.text(value || ' ', MARGIN + 1, this.y + 5.8);
    this.y += h;
  }

  declaration() {
    this.ensureSpace(28);
    this.y += 2;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(7);
    this.doc.text('Declaración Jurada y Autorización', MARGIN, this.y);
    this.y += 3.5;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(5.8);
    const body =
      'Declaro que la información brindada y los datos registrados en esta ficha son verdaderos y tienen carácter de declaración jurada. En tanto no informe por escrito algún cambio, autorizo a LA EMPRESA a utilizar válidamente los datos contenidos en el presente documento. Asimismo, declaro tener pleno conocimiento que en caso brinde información falsa estaré incurriendo en una falta grave laboral conforme a lo establecido en el literal d) del artículo 25 del D.L. N° 728. Asimismo, autorizo a LA EMPRESA de forma expresa, inequívoca e informada a: (i) recopilar, registrar, organizar, almacenar, conservar, elaborar, modificar, bloquear, suprimir, extraer, consultar, utilizar, transferir, exportar, importar o procesar (tratar), de cualquier otra forma, los datos personales por sí mismo o a través de terceros y (ii) a elaborar bases de datos de forma indefinida con la información proporcionada. LA EMPRESA declara que resguardará la información conforme a las disposiciones de la Ley N° 29733, Ley de protección de datos personales.';
    const lines = this.doc.splitTextToSize(body, CONTENT_W);
    this.doc.text(lines, MARGIN, this.y);
    this.y += lines.length * 2.4 + 2;
    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(5.5);
    this.doc.setTextColor(90, 90, 90);
    this.doc.text('* Documento de carácter oficial para la administración de personal y legajo.', MARGIN, this.y);
    this.doc.setTextColor(20, 20, 20);
  }
}

function padRows<T>(rows: T[] | undefined, min: number): Array<T | undefined> {
  const list = [...(rows ?? [])];
  while (list.length < min) list.push(undefined);
  return list;
}

export function buildOpaloPersonnelFichaPdf(worker: Resource, ctx: FichaContext = {}): jsPDF {
  const ficha = resolveFicha(worker, ctx);
  const b = new FichaPdfBuilder();

  b.title();

  // I. DATOS PERSONALES
  b.section('I. DATOS PERSONALES');
  b.row([
    { label: 'Apellido paterno', value: text(ficha.apellidoPaterno) },
    { label: 'Apellido materno', value: text(ficha.apellidoMaterno) },
    { label: 'Nombre(s)', value: text(ficha.nombres), span: 1.4 },
  ]);
  b.row([
    { label: 'Fecha nac. (DD/MM/AAAA)', value: formatDateDisplay(ficha.fechaNacimiento) },
    { label: 'Nacionalidad', value: text(ficha.nacionalidad) },
    { label: 'Edad', value: text(ficha.edad) },
    { label: 'Tipo doc.', value: text(ficha.tipoDocumento) },
    { label: 'N° documento', value: text(ficha.nroDocumento) },
    { label: 'Sexo', value: text(ficha.sexo) },
    { label: 'Estado civil', value: text(ficha.estadoCivil) },
  ]);
  b.row([
    { label: 'Dirección de domicilio actual', value: text(ficha.direccion), span: 2.2 },
    { label: 'Distrito', value: text(ficha.distrito) },
    { label: 'Provincia', value: text(ficha.provincia) },
    { label: 'Departamento', value: text(ficha.departamento) },
  ]);
  b.row([
    { label: 'Correo electrónico', value: text(ficha.email), span: 1.6 },
    { label: 'Celular / teléfono', value: text(ficha.telefono) },
    { label: 'Talla camisa/blusa', value: text(ficha.tallaCamisa) },
    { label: 'Talla pantalón', value: text(ficha.tallaPantalon) },
    { label: 'Talla calzado', value: text(ficha.tallaCalzado) },
  ]);
  b.row([
    {
      label: 'En caso de emergencia llamar a (nombres y apellidos)',
      value: extraField(ficha, 'emergenciaNombre'),
      span: 2,
    },
    { label: 'Parentesco', value: text(ficha.emergenciaParentesco) },
    { label: 'Teléfono / celular de emergencia', value: text(ficha.emergenciaTelefono), span: 1.3 },
  ]);

  // II. DATOS FAMILIARES
  b.section('II. DATOS FAMILIARES');
  const famWidths = [38, 38, 42, 30, 18, CONTENT_W - 166];
  b.tableHeader(
    ['Apellido paterno', 'Apellido materno', 'Nombre(s)', 'Parentesco', 'Edad', 'Celular'],
    famWidths,
  );
  for (const fam of padRows<WorkerSnapshotFamiliar>(ficha.familiares, 3)) {
    b.tableRow(
      [
        text(fam?.apellidoPaterno),
        text(fam?.apellidoMaterno),
        text(fam?.nombres),
        text(fam?.parentesco),
        text(fam?.edad),
        text(fam?.telefono),
      ],
      famWidths,
    );
  }
  b.paragraph(
    '¿Tienes algún pariente trabajando en la empresa? / Nombre del familiar',
    [
      ficha.parienteEnOpalo == null ? '' : ficha.parienteEnOpalo ? 'Sí' : 'No',
      text(ficha.nombreFamiliarOpalo),
    ]
      .filter(Boolean)
      .join(' — '),
  );

  // III. DATOS DE INSTRUCCIÓN
  b.section('III. DATOS DE INSTRUCCIÓN');
  const eduWidths = [28, 55, 40, 35, CONTENT_W - 158];
  b.tableHeader(['Nivel', 'Institución', 'Lugar', 'Periodo', 'Grado obtenido'], eduWidths);
  const defaultLevels = ['Secundaria', 'Técnico', 'Universitario', 'Otros / Postgrado'];
  const educacion = ficha.educacion ?? [];
  const eduRows: Array<WorkerSnapshotEducacion | undefined> = defaultLevels.map((nivel) => {
    const found = educacion.find((e) => text(e.nivel).toLowerCase() === nivel.toLowerCase());
    return found ?? { nivel };
  });
  for (const extra of educacion) {
    const nivel = text(extra.nivel).toLowerCase();
    if (!defaultLevels.some((d) => d.toLowerCase() === nivel)) {
      eduRows.push(extra);
    }
  }
  for (const edu of eduRows.slice(0, 6)) {
    b.tableRow(
      [
        text(edu?.nivel),
        text(edu?.institucion),
        text(edu?.lugar),
        text(edu?.periodo),
        text(edu?.grado),
      ],
      eduWidths,
    );
  }

  // IV. EXPERIENCIA LABORAL
  b.section('IV. EXPERIENCIA LABORAL');
  const expWidths = [48, 42, 28, 28, CONTENT_W - 146];
  b.tableHeader(
    ['Empresa', 'Puesto desempeñado', 'Fecha ingreso', 'Fecha cese', 'Motivo de cese / renuncia'],
    expWidths,
  );
  for (const exp of padRows<WorkerSnapshotExperiencia>(ficha.experienciaLaboral, 3)) {
    b.tableRow(
      [
        text(exp?.empresa),
        text(exp?.puesto),
        formatDateDisplay(exp?.fechaIngreso),
        formatDateDisplay(exp?.fechaCese),
        text(exp?.motivoCese),
      ],
      expWidths,
    );
  }

  // V. REFERENCIAS LABORALES (estructura lista; datos aún no modelados de forma canónica)
  b.section('V. REFERENCIAS LABORALES');
  const refWidths = [55, 50, 50, CONTENT_W - 155];
  b.tableHeader(['Empresa', 'Puesto desempeñado', 'Jefe inmediato', 'Celular'], refWidths);
  const refsRaw = (ficha as Record<string, unknown>).referenciasLaborales;
  const refList = Array.isArray(refsRaw) ? (refsRaw as Array<Record<string, unknown>>) : [];
  for (const ref of padRows(refList, 2)) {
    b.tableRow(
      [text(ref?.empresa), text(ref?.puesto), text(ref?.jefeInmediato), text(ref?.celular ?? ref?.telefono)],
      refWidths,
    );
  }

  // VI. ANTECEDENTES DE SALUD
  b.section('VI. ANTECEDENTES DE SALUD');
  const healthWidths = [55, 18, 55, CONTENT_W - 128];
  b.tableHeader(
    ['Tipo de enfermedad / accidentes', 'Edad', 'Diagnóstico', 'Secuela / observación'],
    healthWidths,
  );
  for (const item of padRows<WorkerSnapshotAntecedenteSalud>(ficha.antecedentesSalud, 2)) {
    b.tableRow(
      [text(item?.tipoEnfermedad), text(item?.edad), text(item?.diagnostico), text(item?.secuela)],
      healthWidths,
    );
  }

  // VII. DATOS DE INCORPORACIÓN
  b.section('VII. DATOS DE INCORPORACIÓN');
  b.row([
    { label: 'Unidad de destaque', value: text(ficha.unidadDestaque) || text(ctx.unitName), span: 1.4 },
    { label: 'Puesto a ocupar', value: text(ficha.puestoContrato) || text(worker.puesto), span: 1.4 },
    {
      label: '¿Cómo se enteró del empleo?',
      value: extraField(ficha, 'comoSeEnteroEmpleo'),
    },
  ]);
  b.row([
    { label: 'Apertura / banco de cuenta sueldo', value: text(ficha.bancoSueldo) },
    { label: 'Apertura / banco de cta. CTS', value: text(ficha.bancoCts) },
  ]);
  b.row([
    {
      label: 'Aportes al sistema de pensiones (si ya ha aportado) — Sistema / AFP / ONP',
      value: text(ficha.sistemaPensionesAnterior),
    },
    {
      label: 'De no haber aportado anteriormente, desea afiliarse a — Elección AFP / ONP',
      value: text(ficha.sistemaPensionesDeseado),
    },
  ]);

  b.declaration();

  return b.doc;
}

export function getOpaloPersonnelFichaFilename(worker: Resource): string {
  const dni = text(worker.dni) || 'sin_dni';
  const name = safeFilenamePart(worker.name || 'trabajador') || 'trabajador';
  return `Ficha_Personal_Opalo_${dni}_${name}.pdf`;
}

export function downloadOpaloPersonnelFicha(worker: Resource, ctx: FichaContext = {}): void {
  const doc = buildOpaloPersonnelFichaPdf(worker, ctx);
  doc.save(getOpaloPersonnelFichaFilename(worker));
}
