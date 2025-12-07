// Servicio para exportar datos a Excel
// Requiere: npm install xlsx

export interface ExcelExportOptions {
  filename?: string;
  sheetName?: string;
}

export const excelService = {
  // Exportar datos a Excel
  async exportToExcel(
    data: any[],
    headers: string[],
    options: ExcelExportOptions = {}
  ): Promise<void> {
    try {
      // Importación dinámica de xlsx
      const XLSX = await import('xlsx');

      // Preparar datos
      const worksheetData = [
        headers,
        ...data.map(row => headers.map(header => {
          const value = row[header];
          // Manejar valores nulos o undefined
          if (value === null || value === undefined) return '';
          // Convertir objetos a string
          if (typeof value === 'object') return JSON.stringify(value);
          return value;
        }))
      ];

      // Crear workbook y worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      
      // Ajustar ancho de columnas
      const colWidths = headers.map((_, index) => {
        const maxLength = Math.max(
          headers[index].length,
          ...data.map(row => {
            const val = row[headers[index]];
            return val ? String(val).length : 0;
          })
        );
        return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
      });
      worksheet['!cols'] = colWidths;

      // Agregar worksheet al workbook
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        options.sheetName || 'Datos'
      );

      // Generar nombre de archivo
      const filename = options.filename || 
        `export_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Descargar archivo
      XLSX.writeFile(workbook, filename);
    } catch (error) {
      console.error('Error al exportar a Excel:', error);
      throw new Error('Error al exportar a Excel. Asegúrate de que xlsx está instalado: npm install xlsx');
    }
  },

  // Exportar múltiples hojas
  async exportMultipleSheets(
    sheets: Array<{ name: string; headers: string[]; data: any[] }>,
    filename?: string
  ): Promise<void> {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();

      sheets.forEach(sheet => {
        const worksheetData = [
          sheet.headers,
          ...sheet.data.map(row => 
            sheet.headers.map(header => {
              const value = row[header];
              if (value === null || value === undefined) return '';
              if (typeof value === 'object') return JSON.stringify(value);
              return value;
            })
          )
        ];

        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        
        // Ajustar ancho de columnas
        const colWidths = sheet.headers.map((_, index) => {
          const maxLength = Math.max(
            sheet.headers[index].length,
            ...sheet.data.map(row => {
              const val = row[sheet.headers[index]];
              return val ? String(val).length : 0;
            })
          );
          return { wch: Math.min(Math.max(maxLength + 2, 10), 50) };
        });
        worksheet['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
      });

      const finalFilename = filename || 
        `export_${new Date().toISOString().split('T')[0]}.xlsx`;

      XLSX.writeFile(workbook, finalFilename);
    } catch (error) {
      console.error('Error al exportar múltiples hojas a Excel:', error);
      throw new Error('Error al exportar a Excel. Asegúrate de que xlsx está instalado: npm install xlsx');
    }
  }
};

