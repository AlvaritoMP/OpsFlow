// Servicio para exportar e importar datos a Excel
// Requiere: npm install xlsx

export interface ExcelExportOptions {
  filename?: string;
  sheetName?: string;
}

export interface PersonnelImportRow {
  nombre: string;
  dni?: string;
  puesto?: string;
  zonas?: string; // Separadas por coma o punto y coma
  turno?: string; // Diurno, Nocturno, Mixto
  fechaInicio?: string; // YYYY-MM-DD o DD/MM/YYYY
  fechaFin?: string; // YYYY-MM-DD o DD/MM/YYYY
}

export interface ImportResult {
  success: boolean;
  totalRows: number;
  successful: number;
  failed: number;
  errors: Array<{ row: number; error: string; data: PersonnelImportRow }>;
  warnings: Array<{ row: number; warning: string; data: PersonnelImportRow }>;
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
  },

  // Importar trabajadores desde Excel
  async importPersonnelFromExcel(file: File): Promise<{ data: PersonnelImportRow[]; result: ImportResult }> {
    try {
      const XLSX = await import('xlsx');
      
      // Leer el archivo
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Obtener la primera hoja
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convertir a JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: '' // Valor por defecto para celdas vacías
      }) as any[][];
      
      if (jsonData.length < 2) {
        throw new Error('El archivo Excel debe tener al menos una fila de encabezados y una fila de datos');
      }
      
      // Obtener encabezados (primera fila)
      const headers = jsonData[0].map((h: any) => String(h).trim().toLowerCase());
      
      // Mapeo de encabezados posibles
      const headerMap: Record<string, string> = {
        'nombre': 'nombre',
        'name': 'nombre',
        'trabajador': 'nombre',
        'colaborador': 'nombre',
        'dni': 'dni',
        'documento': 'dni',
        'documento nacional de identidad': 'dni',
        'puesto': 'puesto',
        'cargo': 'puesto',
        'posicion': 'puesto',
        'zonas': 'zonas',
        'zona': 'zonas',
        'zona asignada': 'zonas',
        'turno': 'turno',
        'shift': 'turno',
        'fecha inicio': 'fechaInicio',
        'fecha de inicio': 'fechaInicio',
        'inicio': 'fechaInicio',
        'start date': 'fechaInicio',
        'fecha fin': 'fechaFin',
        'fecha de fin': 'fechaFin',
        'fin': 'fechaFin',
        'end date': 'fechaFin',
        'fecha fin de labores': 'fechaFin'
      };
      
      // Normalizar encabezados
      const normalizedHeaders = headers.map(h => headerMap[h] || h);
      
      // Procesar filas de datos
      const rows: PersonnelImportRow[] = [];
      const result: ImportResult = {
        success: true,
        totalRows: jsonData.length - 1,
        successful: 0,
        failed: 0,
        errors: [],
        warnings: []
      };
      
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.every((cell: any) => !cell || String(cell).trim() === '')) {
          continue; // Saltar filas vacías
        }
        
        const rowData: PersonnelImportRow = {
          nombre: '',
          dni: undefined,
          puesto: undefined,
          zonas: undefined,
          turno: undefined,
          fechaInicio: undefined,
          fechaFin: undefined
        };
        
        // Mapear datos según encabezados
        normalizedHeaders.forEach((normalizedHeader, index) => {
          const value = row[index];
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            const stringValue = String(value).trim();
            
            switch (normalizedHeader) {
              case 'nombre':
                rowData.nombre = stringValue;
                break;
              case 'dni':
                rowData.dni = stringValue;
                break;
              case 'puesto':
                rowData.puesto = stringValue;
                break;
              case 'zonas':
                rowData.zonas = stringValue;
                break;
              case 'turno':
                rowData.turno = stringValue;
                break;
              case 'fechaInicio':
                rowData.fechaInicio = this.normalizeDate(stringValue);
                break;
              case 'fechaFin':
                rowData.fechaFin = this.normalizeDate(stringValue);
                break;
            }
          }
        });
        
        // Validar fila
        const validation = this.validatePersonnelRow(rowData, i + 1);
        if (validation.isValid) {
          rows.push(rowData);
          result.successful++;
        } else {
          result.failed++;
          result.errors.push({
            row: i + 1,
            error: validation.error || 'Datos inválidos',
            data: rowData
          });
        }
        
        // Advertencias
        if (validation.warning) {
          result.warnings.push({
            row: i + 1,
            warning: validation.warning,
            data: rowData
          });
        }
      }
      
      result.success = result.failed === 0;
      
      return { data: rows, result };
    } catch (error) {
      console.error('Error al importar Excel:', error);
      throw new Error(`Error al importar Excel: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  },

  // Normalizar formato de fecha
  normalizeDate(dateString: string): string {
    if (!dateString) return '';
    
    // Si ya está en formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString;
    }
    
    // Si está en formato DD/MM/YYYY o DD-MM-YYYY
    const dateMatch = dateString.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // Intentar parsear como fecha de Excel (número serial)
    const excelDate = parseFloat(dateString);
    if (!isNaN(excelDate) && excelDate > 0) {
      // Excel almacena fechas como días desde 1900-01-01
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + excelDate * 24 * 60 * 60 * 1000);
      return date.toISOString().split('T')[0];
    }
    
    return dateString; // Retornar original si no se puede normalizar
  },

  // Validar fila de personal
  validatePersonnelRow(row: PersonnelImportRow, rowNumber: number): { isValid: boolean; error?: string; warning?: string } {
    // Nombre es requerido
    if (!row.nombre || row.nombre.trim() === '') {
      return { isValid: false, error: 'El nombre es requerido' };
    }
    
    // Validar turno si está presente
    if (row.turno) {
      const turnoNormalized = row.turno.trim().toLowerCase();
      const validTurnos = ['diurno', 'nocturno', 'mixto'];
      if (!validTurnos.includes(turnoNormalized)) {
        return { 
          isValid: true, 
          warning: `Turno "${row.turno}" no es válido. Se usará el valor por defecto.` 
        };
      }
    }
    
    // Validar formato de fechas
    if (row.fechaInicio && !/^\d{4}-\d{2}-\d{2}$/.test(row.fechaInicio)) {
      return { 
        isValid: true, 
        warning: `Fecha de inicio "${row.fechaInicio}" no tiene formato válido (YYYY-MM-DD). Se intentará convertir.` 
      };
    }
    
    if (row.fechaFin && !/^\d{4}-\d{2}-\d{2}$/.test(row.fechaFin)) {
      return { 
        isValid: true, 
        warning: `Fecha de fin "${row.fechaFin}" no tiene formato válido (YYYY-MM-DD). Se intentará convertir.` 
      };
    }
    
    return { isValid: true };
  },

  // Generar plantilla Excel para carga masiva de trabajadores
  async generatePersonnelTemplate(): Promise<void> {
    try {
      const XLSX = await import('xlsx');
      
      // Datos de ejemplo
      const headers = ['Nombre', 'DNI', 'Puesto', 'Zonas', 'Turno', 'Fecha Inicio', 'Fecha Fin'];
      const exampleData = [
        ['Juan Pérez García', '12345678', 'Guardia de Seguridad', 'Zona A, Zona B', 'Diurno', '2025-01-15', ''],
        ['María López Sánchez', '87654321', 'Supervisor', 'Zona C', 'Nocturno', '2025-01-20', ''],
        ['Carlos Rodríguez', '11223344', 'Guardia de Seguridad', 'Zona A', 'Mixto', '2025-02-01', ''],
      ];
      
      // Crear workbook
      const worksheetData = [headers, ...exampleData];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      
      // Ajustar ancho de columnas
      worksheet['!cols'] = [
        { wch: 25 }, // Nombre
        { wch: 12 }, // DNI
        { wch: 25 }, // Puesto
        { wch: 20 }, // Zonas
        { wch: 12 }, // Turno
        { wch: 15 }, // Fecha Inicio
        { wch: 15 }, // Fecha Fin
      ];
      
      // Agregar hoja de instrucciones
      const instructionsData = [
        ['INSTRUCCIONES PARA CARGA MASIVA DE TRABAJADORES'],
        [''],
        ['FORMATO DE COLUMNAS:'],
        [''],
        ['Nombre (REQUERIDO):', 'Nombre completo del trabajador'],
        ['DNI (Opcional):', 'Documento Nacional de Identidad'],
        ['Puesto (Opcional):', 'Cargo o puesto del trabajador (ej: Guardia de Seguridad, Supervisor)'],
        ['Zonas (Opcional):', 'Zonas asignadas, separadas por coma o punto y coma (ej: Zona A, Zona B)'],
        ['Turno (Opcional):', 'Diurno, Nocturno o Mixto'],
        ['Fecha Inicio (Opcional):', 'Formato: YYYY-MM-DD o DD/MM/YYYY (ej: 2025-01-15 o 15/01/2025)'],
        ['Fecha Fin (Opcional):', 'Formato: YYYY-MM-DD o DD/MM/YYYY. Si se especifica, el trabajador se marcará como "Cesado"'],
        [''],
        ['NOTAS:'],
        ['- La primera fila debe contener los encabezados'],
        ['- Los encabezados pueden estar en español o inglés y no son case-sensitive'],
        ['- Solo el campo "Nombre" es obligatorio'],
        ['- Las filas vacías serán ignoradas'],
        ['- Los datos de ejemplo en la hoja "Datos" pueden ser eliminados'],
      ];
      
      const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsData);
      instructionsSheet['!cols'] = [{ wch: 30 }, { wch: 50 }];
      
      // Agregar hojas al workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
      XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instrucciones');
      
      // Descargar archivo
      const filename = `plantilla_carga_masiva_trabajadores_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (error) {
      console.error('Error al generar plantilla:', error);
      throw new Error('Error al generar plantilla Excel. Asegúrate de que xlsx está instalado: npm install xlsx');
    }
  }
};

