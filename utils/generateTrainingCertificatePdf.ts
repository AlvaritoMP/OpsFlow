import { formatDateDisplay } from './dateFormat';
import { TrainingCertificate } from '../types';

function documentTitle(certificate: TrainingCertificate): string {
  return certificate.documentType === 'acta' ? 'ACTA DE CAPACITACIÓN' : 'CERTIFICADO DE CAPACITACIÓN';
}

function intro(certificate: TrainingCertificate): string {
  const doc = certificate.workerDni?.trim()
    ? `, identificado(a) con documento ${certificate.workerDni.trim()}`
    : '';
  const role = certificate.positionName?.trim()
    ? `, en el puesto de ${certificate.positionName.trim()}`
    : '';
  if (certificate.documentType === 'acta') {
    return `Se deja constancia del desarrollo de la capacitación y de la participación de ${certificate.workerName}${doc}${role}.`;
  }
  return `Por medio del presente se certifica que ${certificate.workerName}${doc}${role} participó en la capacitación que se detalla a continuación.`;
}

export async function downloadTrainingCertificatePdf(certificate: TrainingCertificate): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const isActa = certificate.documentType === 'acta';
  const header: [number, number, number] = isActa ? [15, 118, 110] : [30, 64, 175];

  doc.setFillColor(...header);
  doc.rect(0, 0, pageWidth, 36, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(documentTitle(certificate), pageWidth / 2, 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(certificate.code, pageWidth / 2, 26, { align: 'center' });

  let y = 48;
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  const introLines = doc.splitTextToSize(intro(certificate), contentWidth);
  doc.text(introLines, margin, y);
  y += introLines.length * 5.5 + 6;

  const lines: Array<[string, string]> = [
    ['Tema', certificate.topicName],
    ['Fecha', formatDateDisplay(certificate.trainingDate) || certificate.trainingDate],
    ['Unidad', certificate.unitName],
    ['Cliente', certificate.clientName || '—'],
    ['Puesto', certificate.positionName || '—'],
    ['Estado', certificate.status],
  ];
  if (certificate.hours != null) lines.push(['Duración', `${certificate.hours} h`]);
  if (certificate.instructor) lines.push(['Instructor', certificate.instructor]);
  if (certificate.score != null) lines.push(['Calificación', `${certificate.score} / 20`]);

  lines.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${label}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(value, contentWidth - 32);
    doc.text(valueLines, margin + 32, y);
    y += Math.max(6, valueLines.length * 5);
  });

  if (certificate.description?.trim()) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Contenido', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    const body = doc.splitTextToSize(certificate.description.trim(), contentWidth);
    doc.text(body, margin, y);
    y += body.length * 5;
  }

  if (certificate.notes?.trim()) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Observaciones', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    const notes = doc.splitTextToSize(certificate.notes.trim(), contentWidth);
    doc.text(notes, margin, y);
    y += notes.length * 5;
  }

  const signatureY = Math.max(y + 28, 230);
  const safeY = signatureY > pageHeight - 40 ? pageHeight - 40 : signatureY;
  const column = (contentWidth - 10) / 3;
  const labels = [
    certificate.workerName,
    certificate.instructor || 'Instructor',
    'Empleador',
  ];
  const captions = ['Trabajador', 'Instructor', 'Empleador'];
  labels.forEach((label, index) => {
    const x = margin + index * (column + 5);
    doc.setDrawColor(148, 163, 184);
    doc.line(x, safeY, x + column, safeY);
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'normal');
    const name = doc.splitTextToSize(label, column);
    doc.text(name, x + column / 2, safeY + 5, { align: 'center' });
    doc.setTextColor(100, 116, 139);
    doc.text(captions[index], x + column / 2, safeY + 5 + name.length * 4, { align: 'center' });
  });

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const issued = certificate.createdAt
    ? formatDateDisplay(certificate.createdAt.slice(0, 10))
    : formatDateDisplay(new Date().toISOString().slice(0, 10));
  doc.text(`Documento generado el ${issued} — OpsFlow`, pageWidth / 2, pageHeight - 10, { align: 'center' });

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeName = certificate.workerName.replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '_') || 'trabajador';
  link.download = `${certificate.code}_${safeName}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
