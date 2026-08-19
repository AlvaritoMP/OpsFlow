// Servicio para generar PDFs de constancias
// Nota: Requiere jsPDF instalado (npm install jspdf)

import { formatDateDisplay } from '../utils/dateFormat';

export interface PDFConstancyData {
  code: string;
  workerName: string;
  workerDni: string;
  unitName: string;
  date: string;
  items: Array<{
    name: string;
    type: string;
    serialNumber?: string;
    quantity?: number;
    condition?: string;
    dateAssigned?: string;
  }>;
  constancyType: 'ASSET' | 'EQUIPMENT';
}

export const pdfConstancyService = {
  // Generar PDF de constancia de entrega
  async generatePDF(data: PDFConstancyData): Promise<Blob> {
    // Importación dinámica de jsPDF
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    let yPos = margin;

    // Colores
    const primaryColor = [41, 128, 185]; // Azul
    const darkGray = [51, 51, 51];
    const lightGray = [153, 153, 153];

    // ============================================
    // ENCABEZADO
    // ============================================
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Título
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('CONSTANCIA DE ENTREGA', pageWidth / 2, 20, { align: 'center' });

    // Subtítulo
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(
      data.constancyType === 'ASSET' 
        ? 'Equipos de Protección Personal y Activos' 
        : 'Maquinarias y Equipos',
      pageWidth / 2,
      30,
      { align: 'center' }
    );

    yPos = 50;

    // ============================================
    // INFORMACIÓN GENERAL
    // ============================================
    doc.setTextColor(...darkGray);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('INFORMACIÓN GENERAL', margin, yPos);
    yPos += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const itemDates = [...new Set(
      data.items
        .map(item => (item.dateAssigned || data.date || '').slice(0, 10))
        .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
    )].sort();
    const hasDistinctDates = itemDates.length > 1;
    const headerDateLabel = itemDates.length === 0
      ? this.formatDate(data.date)
      : this.formatDate(itemDates[0]);
    const infoLines = [
      `Código de Constancia: ${data.code}`,
      hasDistinctDates
        ? 'Fecha de Entrega: se indica de forma específica en cada ítem'
        : `Fecha de Entrega: ${headerDateLabel}`,
      `Unidad: ${data.unitName}`,
      `Trabajador: ${data.workerName}`,
      `DNI: ${data.workerDni}`,
    ];

    infoLines.forEach(line => {
      doc.text(line, margin + 5, yPos);
      yPos += 6;
    });

    yPos += 5;

    // ============================================
    // ITEMS ENTREGADOS
    // ============================================
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('ITEMS ENTREGADOS', margin, yPos);
    yPos += 8;

    const contentWidth = pageWidth - 2 * margin;

    if (hasDistinctDates) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...darkGray);
      doc.text('Cada ítem se entregó en la fecha que se indica a continuación:', margin, yPos);
      yPos += 8;

      data.items.forEach((item, index) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        const deliveryDate = this.formatDate(item.dateAssigned || data.date) || '—';
        const nameLines = doc.splitTextToSize(`${index + 1}. ${item.name}`, contentWidth - 8);
        const extraName = Math.max(0, nameLines.length - 1) * 4;
        const rowHeight = 20 + extraName + (item.serialNumber ? 4 : 0);

        if (yPos + rowHeight > pageHeight - 50) {
          doc.addPage();
          yPos = margin;
        }

        const bgColor = index % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
        doc.setFillColor(...bgColor);
        doc.setDrawColor(226, 232, 240);
        doc.rect(margin, yPos - 4, contentWidth, rowHeight, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...darkGray);
        doc.text(nameLines, margin + 3, yPos + 2);

        const metaY = yPos + 8 + extraName;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        const metaParts = [
          `Tipo: ${item.type}`,
          `Cantidad: ${item.quantity || 1}`,
          `Estado: ${item.condition || 'Buen estado'}`,
        ];
        if (item.serialNumber) metaParts.push(`SN: ${item.serialNumber}`);
        doc.text(metaParts.join('   •   '), margin + 7, metaY, { maxWidth: contentWidth - 12 });

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(41, 128, 185);
        doc.text(`Se entregó el ${deliveryDate}`, margin + 7, metaY + 6);

        yPos += rowHeight + 3;
      });
    } else {
      const colWidths = [58, 28, 32, 18, 44];
      const colX = [
        margin,
        margin + colWidths[0],
        margin + colWidths[0] + colWidths[1],
        margin + colWidths[0] + colWidths[1] + colWidths[2],
        margin + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
      ];

      doc.setFillColor(240, 240, 240);
      doc.rect(margin, yPos - 5, contentWidth, 8, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...darkGray);
      doc.text('Descripción', colX[0] + 2, yPos);
      doc.text('Tipo', colX[1] + 2, yPos);
      doc.text('F. Entrega', colX[2] + 2, yPos);
      doc.text('Cant.', colX[3] + 2, yPos);
      doc.text('Estado', colX[4] + 2, yPos);
      yPos += 8;

      doc.setFont('helvetica', 'normal');
      data.items.forEach((item, index) => {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = margin + 20;
        }

        const bgColor = index % 2 === 0 ? [255, 255, 255] : [250, 250, 250];
        doc.setFillColor(...bgColor);
        doc.rect(margin, yPos - 4, contentWidth, 6, 'F');

        doc.setFontSize(8);
        doc.setTextColor(...darkGray);

        const description = item.serialNumber
          ? `${item.name}\nSN: ${item.serialNumber}`
          : item.name;
        doc.text(description, colX[0] + 2, yPos, { maxWidth: colWidths[0] - 4 });

        doc.text(item.type, colX[1] + 2, yPos);
        doc.text(this.formatDate(item.dateAssigned || data.date) || '—', colX[2] + 2, yPos);
        doc.text((item.quantity || 1).toString(), colX[3] + 2, yPos);
        doc.text(item.condition || 'Buen estado', colX[4] + 2, yPos);

        yPos += 7;
      });
    }

    yPos += 10;

    // ============================================
    // DECLARACIÓN JURADA
    // ============================================
    if (yPos > pageHeight - 100) {
      doc.addPage();
      yPos = margin;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...darkGray);
    doc.text('DECLARACIÓN JURADA', margin, yPos);
    yPos += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...darkGray);

    const declarations = data.constancyType === 'ASSET' 
      ? [
          'Yo, ' + data.workerName + ', con DNI ' + data.workerDni + ', declaro bajo juramento que:',
          '',
          hasDistinctDates
            ? '1. He recibido cada uno de los items detallados, en la fecha de entrega indicada para cada ítem, en BUEN ESTADO.'
            : '1. He recibido los items detallados en esta constancia en BUEN ESTADO.',
          '2. Me comprometo a devolver los items entregados en el MEJOR ESTADO POSIBLE.',
          '3. Acepto que en caso de no devolver los items entregados o devolverlos en mal estado,',
          '   se me descontará el costo de reposición mediante descuento por planilla.',
          '4. Entiendo que soy responsable del cuidado y mantenimiento adecuado de los items.',
          '5. Me comprometo a reportar inmediatamente cualquier desperfecto o pérdida.',
        ]
      : [
          'Yo, ' + data.workerName + ', con DNI ' + data.workerDni + ', declaro bajo juramento que:',
          '',
          '1. He recibido la maquinaria/equipo detallado en esta constancia en BUEN ESTADO.',
          '2. Me comprometo a hacer un USO ADECUADO de la maquinaria/equipo asignado.',
          '3. Me comprometo a CUIDAR y mantener en buen estado la maquinaria/equipo.',
          '4. Me comprometo a AVISAR DE MANERA INMEDIATA cualquier desperfecto o falla.',
          '5. Acepto que cualquier daño que ocurra por USO O MANIPULACIÓN INCORRECTA será',
          '   de mi responsabilidad, comprometiéndome a asumir el costo mediante descuento',
          '   por planilla.',
          '6. Entiendo que debo reportar inmediatamente cualquier anomalía detectada.',
        ];

    declarations.forEach(line => {
      if (yPos > pageHeight - 50) {
        doc.addPage();
        yPos = margin;
      }
      doc.text(line, margin + 5, yPos, { maxWidth: pageWidth - 2 * margin - 10 });
      yPos += line === '' ? 3 : 5;
    });

    yPos += 15;

    // ============================================
    // FIRMAS
    // ============================================
    if (yPos > pageHeight - 60) {
      doc.addPage();
      yPos = margin;
    }

    const signatureY = yPos;
    const signatureWidth = (pageWidth - 2 * margin) / 2 - 10;

    // Firma del trabajador
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('FIRMA DEL TRABAJADOR', margin, signatureY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(data.workerName, margin, signatureY + 15);
    doc.text(`DNI: ${data.workerDni}`, margin, signatureY + 20);
    doc.line(margin, signatureY + 25, margin + signatureWidth, signatureY + 25);

    // Firma del responsable
    doc.setFont('helvetica', 'bold');
    doc.text('FIRMA DEL RESPONSABLE', margin + signatureWidth + 20, signatureY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('_________________________', margin + signatureWidth + 20, signatureY + 15);
    doc.text('Nombre y Cargo', margin + signatureWidth + 20, signatureY + 20);
    doc.line(margin + signatureWidth + 20, signatureY + 25, margin + signatureWidth + 20 + signatureWidth, signatureY + 25);

    // ============================================
    // PIE DE PÁGINA
    // ============================================
    const footerY = pageHeight - 15;
    doc.setFontSize(7);
    doc.setTextColor(...lightGray);
    const generatedToday = (() => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    })();
    doc.text(
      `Constancia generada el ${this.formatDate(generatedToday)} - ${data.code}`,
      pageWidth / 2,
      footerY,
      { align: 'center' }
    );

    // Generar blob
    const pdfBlob = doc.output('blob');
    return pdfBlob;
  },

  // Descargar PDF
  downloadPDF(data: PDFConstancyData, filename?: string): void {
    this.generatePDF(data).then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `constancia-${data.code}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    });
  },

  // Formatear fecha (yyyy-MM-dd → dd/mm/yyyy, sin desfase UTC)
  formatDate(dateString: string): string {
    if (!dateString?.trim()) return '';
    return formatDateDisplay(dateString.trim().slice(0, 10)) || dateString;
  },
};

