import { VacationPapeleta } from '../types';

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${parseInt(d, 10)} de ${months[parseInt(m, 10) - 1]} de ${y}`;
}

export const vacationPdfService = {
  async generatePapeletaPDF(papeleta: VacationPapeleta, companyName: string = 'Empresa'): Promise<Blob> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = margin;

    const primaryColor: [number, number, number] = [41, 128, 185];
    const darkGray: [number, number, number] = [51, 51, 51];

    // Encabezado
    const isAdvance = Boolean(papeleta.isAdvance);
    const headerTitle = isAdvance ? 'ADELANTO DE VACACIONES' : 'PAPELETA DE VACACIONES';
    doc.setFillColor(...(isAdvance ? ([180, 83, 9] as [number, number, number]) : primaryColor));
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(headerTitle, pageWidth / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Código: ${papeleta.code}`, pageWidth / 2, 28, { align: 'center' });
    doc.text(
      isAdvance
        ? 'Goce otorgado antes de completar 30 días ganados — Régimen General D.L. 713'
        : 'Régimen General - D.L. 713 / Ley de Productividad y Competitividad Laboral',
      pageWidth / 2,
      35,
      { align: 'center' }
    );

    y = 55;
    doc.setTextColor(...darkGray);

    const fields: [string, string][] = [
      ['Empresa / Servicio:', companyName],
      ['Unidad:', papeleta.unitName],
      ['Trabajador:', papeleta.workerName],
      ['DNI:', papeleta.workerDni || '—'],
      ['Fecha de inicio (salida):', formatDate(papeleta.startDate)],
      ['Fecha de término:', formatDate(papeleta.endDate)],
      ['Fecha de retorno (reincorporación):', formatDate(papeleta.returnDate)],
      ['Días calendario:', `${papeleta.calendarDays} día(s)`],
      [
        'Tipo:',
        isAdvance
          ? 'Adelanto de vacaciones'
          : papeleta.sourceType === 'accumulated'
            ? 'Vacaciones acumuladas (días a cuenta)'
            : 'Vacaciones continuas',
      ],
    ];

    doc.setFontSize(11);
    fields.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.text(value, margin + 65, y);
      y += 9;
    });

    // Días acumulados individuales
    if (papeleta.accumulatedDays && papeleta.accumulatedDays.length > 0) {
      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Días individuales acumulados (control interno):', margin, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const dates = papeleta.accumulatedDays.map(d => formatDate(d.vacationDate)).join(', ');
      const lines = doc.splitTextToSize(dates, pageWidth - 2 * margin);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 5;
    }

    // Texto legal
    y += 10;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    const legalText = doc.splitTextToSize(
      isAdvance
        ? 'Por la presente se autoriza al trabajador indicado a hacer uso de un ADELANTO DE VACACIONES, ' +
          'otorgado antes de haber ganado los 30 días calendario correspondientes al año de servicios. ' +
          'Los días gozados se descontarán del derecho vacacional que se complete al cumplir el año de servicios, ' +
          'conforme al Decreto Legislativo N° 713 y normas complementarias.'
        : 'Por la presente se autoriza al trabajador indicado a hacer uso de su periodo vacacional conforme al artículo 11° del Decreto Legislativo N° 713 y normas complementarias. ' +
          'El trabajador en régimen general tiene derecho a 30 días calendario de vacaciones por cada año completo de servicios. ' +
          'El fraccionamiento del periodo vacacional solo procede cuando cada fracción sea de un mínimo de 7 días calendario.',
      pageWidth - 2 * margin
    );
    doc.text(legalText, margin, y);
    y += legalText.length * 4 + 15;

    if (papeleta.notes) {
      doc.setFont('helvetica', 'bold');
      doc.text('Observaciones:', margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      const noteLines = doc.splitTextToSize(papeleta.notes, pageWidth - 2 * margin);
      doc.text(noteLines, margin, y);
      y += noteLines.length * 4 + 15;
    }

    // Firmas
    y = Math.max(y, 220);
    const sigWidth = 70;
    doc.setDrawColor(150, 150, 150);
    doc.line(margin, y, margin + sigWidth, y);
    doc.line(pageWidth - margin - sigWidth, y, pageWidth - margin, y);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Firma del Trabajador', margin, y + 5);
    doc.text('Firma y Sello del Empleador', pageWidth - margin - sigWidth, y + 5);

    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    const issuedDate = papeleta.issuedAt
      ? new Date(papeleta.issuedAt).toLocaleDateString('es-PE')
      : new Date().toLocaleDateString('es-PE');
    doc.text(`Documento generado el ${issuedDate} — OpsFlow`, pageWidth / 2, 285, { align: 'center' });

    return doc.output('blob');
  },

  downloadPapeletaPDF(papeleta: VacationPapeleta, companyName?: string): Promise<void> {
    return this.generatePapeletaPDF(papeleta, companyName).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${papeleta.code}_${papeleta.workerName.replace(/\s+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  },
};
