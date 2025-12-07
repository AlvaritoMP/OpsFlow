// Servicio para generar PDFs de constancias
// Nota: Requiere jsPDF instalado (npm install jspdf)

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
    const infoLines = [
      `Código de Constancia: ${data.code}`,
      `Fecha de Entrega: ${this.formatDate(data.date)}`,
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

    // Tabla de items
    const tableStartY = yPos;
    const colWidths = [80, 40, 30, 30];
    const colX = [margin, margin + colWidths[0], margin + colWidths[0] + colWidths[1], margin + colWidths[0] + colWidths[1] + colWidths[2]];

    // Encabezado de tabla
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 8, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkGray);
    doc.text('Descripción', colX[0] + 2, yPos);
    doc.text('Tipo', colX[1] + 2, yPos);
    doc.text('Cantidad', colX[2] + 2, yPos);
    doc.text('Estado', colX[3] + 2, yPos);
    yPos += 8;

    // Filas de items
    doc.setFont('helvetica', 'normal');
    data.items.forEach((item, index) => {
      if (yPos > pageHeight - 60) {
        doc.addPage();
        yPos = margin + 20;
      }

      const bgColor = index % 2 === 0 ? [255, 255, 255] : [250, 250, 250];
      doc.setFillColor(...bgColor);
      doc.rect(margin, yPos - 4, pageWidth - 2 * margin, 6, 'F');

      doc.setFontSize(8);
      doc.setTextColor(...darkGray);
      
      // Descripción (con número de serie si existe)
      const description = item.serialNumber 
        ? `${item.name}\nSN: ${item.serialNumber}`
        : item.name;
      doc.text(description, colX[0] + 2, yPos, { maxWidth: colWidths[0] - 4 });
      
      doc.text(item.type, colX[1] + 2, yPos);
      doc.text((item.quantity || 1).toString(), colX[2] + 2, yPos);
      doc.text(item.condition || 'Buen estado', colX[3] + 2, yPos);

      yPos += 7;
    });

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
          '1. He recibido los items detallados en esta constancia en BUEN ESTADO.',
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
    doc.text(
      `Constancia generada el ${this.formatDate(new Date().toISOString().split('T')[0])} - ${data.code}`,
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

  // Formatear fecha
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  },
};

