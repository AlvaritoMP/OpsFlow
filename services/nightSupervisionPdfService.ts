// Servicio para generar PDFs de reportes de supervisión nocturna
import { NightSupervisionReport } from '../types';

// Función helper para cargar imagen desde URL
async function loadImageFromUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('No se pudo cargar la imagen'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Error cargando imagen:', url, error);
    return ''; // Retornar string vacío si falla
  }
}

export const nightSupervisionPdfService = {
  async generateReportPDF(report: NightSupervisionReport): Promise<Blob> {
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
    let xPos = margin; // Declarar xPos al inicio para que esté disponible en todos los bloques

    // Colores
    const primaryColor = [41, 128, 185]; // Azul
    const darkGray = [51, 51, 51];
    const lightGray = [153, 153, 153];
    const successColor = [46, 204, 113]; // Verde
    const warningColor = [241, 196, 15]; // Amarillo
    const dangerColor = [231, 76, 60]; // Rojo

    // ============================================
    // ENCABEZADO
    // ============================================
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 45, 'F');

    // Título
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE SUPERVISIÓN NOCTURNA', pageWidth / 2, 20, { align: 'center' });

    // Subtítulo
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Turno del ${nightSupervisionPdfService.formatDate(report.date)}`,
      pageWidth / 2,
      30,
      { align: 'center' }
    );

    doc.setFontSize(10);
    doc.text(
      `Unidad: ${report.unit_name} | Supervisor: ${report.supervisor_name}`,
      pageWidth / 2,
      38,
      { align: 'center' }
    );

    yPos = 55;

    // ============================================
    // RESUMEN EJECUTIVO
    // ============================================
    doc.setTextColor(...darkGray);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN EJECUTIVO', margin, yPos);
    yPos += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    // Barra de completitud
    const completionWidth = (pageWidth - 2 * margin - 40) * (report.completion_percentage / 100);
    doc.setFillColor(...(report.completion_percentage === 100 ? successColor : report.completion_percentage >= 70 ? warningColor : dangerColor));
    doc.rect(margin + 40, yPos - 4, completionWidth, 5, 'F');
    doc.setDrawColor(...lightGray);
    doc.rect(margin + 40, yPos - 4, pageWidth - 2 * margin - 40, 5, 'S');

    doc.text(`Completitud: ${report.completion_percentage}%`, margin, yPos);
    yPos += 7;

    // Estadísticas principales
    const stats = [
      { label: 'Trabajadores Supervisados', value: report.total_workers.toString() },
      { label: 'Llamadas Completadas', value: `${report.total_calls_completed}/${report.total_calls_required}` },
      { label: 'Llamadas Contestadas', value: report.total_calls_answered.toString() },
      { label: 'Fotos Recibidas', value: report.total_photos_received.toString() },
      { label: 'Revisiones de Cámaras', value: `${report.total_camera_reviews_completed}/${report.total_camera_reviews_required}` },
      { label: 'No Conformidades', value: report.non_conformities_count.toString() },
      { label: 'Eventos Críticos', value: report.critical_events_count.toString() },
    ];

    const col1X = margin;
    const col2X = pageWidth / 2;
    let currentCol = 0;
    let currentX = col1X;

    stats.forEach((stat, index) => {
      if (index > 0 && index % 4 === 0) {
        currentCol = 0;
        currentX = col1X;
        yPos += 12;
      } else if (index > 0 && index % 2 === 0) {
        currentCol = 0;
        currentX = col1X;
        yPos += 6;
      } else if (index > 0) {
        currentCol = 1;
        currentX = col2X;
      }

      doc.setFont('helvetica', 'bold');
      doc.text(`${stat.label}:`, currentX, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(stat.value, currentX + 60, yPos);

      if (currentCol === 1) {
        yPos += 6;
      }
    });

    yPos += 8;

    // ============================================
    // DETALLE DE LLAMADAS CON FOTOS DE PERFIL
    // ============================================
    if (report.calls.length > 0) {
      // Verificar si necesitamos nueva página
      if (yPos > pageHeight - 60) {
        doc.addPage();
        yPos = margin;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('DETALLE DE LLAMADAS A TRABAJADORES', margin, yPos);
      yPos += 8;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      const callHeaders = ['Trabajador', 'Llamada', 'Programada', 'Contestó', 'Foto Recibida'];
      const callColWidths = [50, 20, 25, 20, 25];
      xPos = margin;

      callHeaders.forEach((header, i) => {
        doc.text(header, xPos, yPos);
        xPos += callColWidths[i];
      });

      yPos += 5;
      doc.setDrawColor(...lightGray);
      doc.line(margin, yPos - 2, pageWidth - margin, yPos - 2);

      doc.setFont('helvetica', 'normal');
      
      // Mostrar cada llamada
      report.calls.forEach(call => {
        if (yPos > pageHeight - 20) {
          doc.addPage();
          yPos = margin;
        }

        xPos = margin;
        const callData = [
          call.worker_name.length > 20 ? call.worker_name.substring(0, 20) + '...' : call.worker_name,
          `#${call.call_number}`,
          call.scheduled_time,
          call.answered ? 'Sí' : 'No',
          call.photo_received ? 'Sí' : 'No',
        ];

        callData.forEach((data, i) => {
          doc.text(data, xPos, yPos);
          xPos += callColWidths[i];
        });

        yPos += 5;
      });

      yPos += 5;
    }

    // ============================================
    // DETALLE DE REVISIONES DE CÁMARAS CON FOTOS
    // ============================================
    if (report.camera_reviews.length > 0) {
      if (yPos > pageHeight - 50) {
        doc.addPage();
        yPos = margin;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('REVISIONES DE CÁMARAS', margin, yPos);
      yPos += 8;

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      const reviewHeaders = ['Revisión', 'Programada', 'Realizada', 'Cámaras', 'Observaciones'];
      const reviewColWidths = [20, 25, 25, 50, 60];
      xPos = margin;
      
      reviewHeaders.forEach((header, i) => {
        doc.text(header, xPos, yPos);
        xPos += reviewColWidths[i];
      });

      yPos += 5;
      doc.setDrawColor(...lightGray);
      doc.line(margin, yPos - 2, pageWidth - margin, yPos - 2);

      doc.setFont('helvetica', 'normal');
      for (const review of report.camera_reviews) {
        // Verificar espacio para foto
        if (yPos > pageHeight - 50) {
          doc.addPage();
          yPos = margin;
        }

        // Datos de la revisión
        xPos = margin;
        const reviewData = [
          `#${review.review_number}`,
          review.scheduled_time,
          review.actual_time || 'No realizada',
          review.cameras_reviewed.length > 0 ? review.cameras_reviewed.join(', ') : 'N/A',
          review.notes || 'Sin observaciones',
        ];

        reviewData.forEach((data, i) => {
          const text = data.length > 25 ? data.substring(0, 25) + '...' : data;
          doc.text(text, xPos, yPos);
          xPos += reviewColWidths[i];
        });

        yPos += 6;

        // Agregar foto del screenshot si existe
        if (review.screenshot_url) {
          try {
            const screenshotData = await loadImageFromUrl(review.screenshot_url);
            if (screenshotData) {
              // Verificar espacio para la imagen
              if (yPos > pageHeight - 60) {
                doc.addPage();
                yPos = margin;
              }

              // Crear un elemento Image para obtener dimensiones originales
              const img = new Image();
              img.src = screenshotData;
              
              // Esperar a que la imagen cargue
              await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                // Timeout de seguridad
                setTimeout(() => reject(new Error('Timeout loading image')), 5000);
              });

              // Calcular dimensiones manteniendo la proporción (aspect ratio)
              const maxWidth = pageWidth - 2 * margin;
              const maxHeight = 50; // Altura máxima permitida
              
              // Calcular aspect ratio original
              const aspectRatio = img.width / img.height;
              
              let imgWidth = maxWidth;
              let imgHeight = maxWidth / aspectRatio;
              
              // Si la altura calculada excede el máximo, ajustar por altura
              if (imgHeight > maxHeight) {
                imgHeight = maxHeight;
                imgWidth = maxHeight * aspectRatio;
              }

              // Agregar imagen con dimensiones calculadas manteniendo proporción
              doc.addImage(screenshotData, 'JPEG', margin, yPos, imgWidth, imgHeight);
              yPos += imgHeight + 5;
            }
          } catch (error) {
            console.warn('Error cargando screenshot:', review.screenshot_url, error);
            doc.setFontSize(7);
            doc.setTextColor(...lightGray);
            doc.text('Foto no disponible', margin, yPos);
            doc.setTextColor(...darkGray);
            doc.setFontSize(8);
            yPos += 5;
          }
        }

        yPos += 3;
      }

      yPos += 5;
    }

    // ============================================
    // ALERTAS Y NO CONFORMIDADES
    // ============================================
    // REMOVIDO: Las alertas no se incluyen en el PDF según requerimiento

    // ============================================
    // PIE DE PÁGINA
    // ============================================
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(...lightGray);
      doc.text(
        `Página ${i} de ${totalPages} | Generado el ${nightSupervisionPdfService.formatDateTime(new Date().toISOString())}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }

    return doc.output('blob');
  },

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  },

  formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('es-PE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  },
};
