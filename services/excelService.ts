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
  localidad?: string;
  telefono?: string;
  zonas?: string; // Separadas por coma o punto y coma
  turno?: string; // Diurno, Nocturno, Mixto
  fechaInicio?: string; // YYYY-MM-DD o DD/MM/YYYY
  fechaFin?: string; // YYYY-MM-DD o DD/MM/YYYY
  compartido?: boolean | string; // Si el trabajador es compartido (true, 'true', 'Sí', etc.)
}

export interface ImportResult {
  success: boolean;
  totalRows: number;
  successful: number;
  failed: number;
  errors: Array<{ row: number; error: string; data: PersonnelImportRow }>;
  warnings: Array<{ row: number; warning: string; data: PersonnelImportRow }>;
}

export interface VariableCompensationImportRow {
  trabajador?: string;
  dni?: string;
  mes?: string;
  monto: number;
  concepto?: string;
  fechaPago?: string;
  notas?: string;
}

export interface VariableCompensationImportResult {
  success: boolean;
  totalRows: number;
  successful: number;
  failed: number;
  errors: Array<{ row: number; error: string; data: Partial<VariableCompensationImportRow> }>;
  warnings: Array<{ row: number; warning: string; data: Partial<VariableCompensationImportRow> }>;
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

  async importVariableCompensationsFromExcel(file: File): Promise<{ data: VariableCompensationImportRow[]; result: VariableCompensationImportResult }> {
    try {
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: ''
      }) as any[][];

      if (jsonData.length < 2) {
        throw new Error('El archivo Excel debe tener encabezados y al menos una fila de datos');
      }

      const headerMap: Record<string, string> = {
        'trabajador': 'trabajador',
        'colaborador': 'trabajador',
        'nombre': 'trabajador',
        'name': 'trabajador',
        'dni': 'dni',
        'documento': 'dni',
        'mes': 'mes',
        'periodo': 'mes',
        'periodo mensual': 'mes',
        'month': 'mes',
        'monto': 'monto',
        'importe': 'monto',
        'amount': 'monto',
        'comision': 'monto',
        'comisión': 'monto',
        'concepto': 'concepto',
        'tipo': 'concepto',
        'fecha pago': 'fechaPago',
        'fecha de pago': 'fechaPago',
        'payment date': 'fechaPago',
        'notas': 'notas',
        'observaciones': 'notas',
        'notes': 'notas'
      };

      const headers = jsonData[0].map((h: any) => headerMap[String(h).trim().toLowerCase()] || String(h).trim().toLowerCase());
      const rows: VariableCompensationImportRow[] = [];
      const result: VariableCompensationImportResult = {
        success: true,
        totalRows: jsonData.length - 1,
        successful: 0,
        failed: 0,
        errors: [],
        warnings: []
      };

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.every((cell: any) => !cell || String(cell).trim() === '')) continue;

        const rowData: Partial<VariableCompensationImportRow> = {};

        headers.forEach((header, index) => {
          const value = row[index];
          if (value === undefined || value === null || String(value).trim() === '') return;

          const stringValue = String(value).trim();
          switch (header) {
            case 'trabajador':
              rowData.trabajador = stringValue;
              break;
            case 'dni':
              rowData.dni = stringValue;
              break;
            case 'mes':
              rowData.mes = this.normalizeMonth(stringValue);
              break;
            case 'monto':
              rowData.monto = this.normalizeMoney(stringValue);
              break;
            case 'concepto':
              rowData.concepto = stringValue;
              break;
            case 'fechaPago':
              rowData.fechaPago = this.normalizeDate(stringValue);
              break;
            case 'notas':
              rowData.notas = stringValue;
              break;
          }
        });

        if (!rowData.dni && !rowData.trabajador) {
          result.failed++;
          result.errors.push({ row: i + 1, error: 'Debe indicar DNI o nombre del trabajador', data: rowData });
          continue;
        }

        if (!rowData.monto || rowData.monto <= 0) {
          result.failed++;
          result.errors.push({ row: i + 1, error: 'El monto debe ser mayor a cero', data: rowData });
          continue;
        }

        rows.push({
          trabajador: rowData.trabajador,
          dni: rowData.dni,
          mes: rowData.mes,
          monto: rowData.monto,
          concepto: rowData.concepto || 'Comisión',
          fechaPago: rowData.fechaPago,
          notas: rowData.notas
        });
        result.successful++;
      }

      result.success = result.failed === 0;
      return { data: rows, result };
    } catch (error) {
      console.error('Error al importar comisiones desde Excel:', error);
      throw new Error(`Error al importar Excel: ${error instanceof Error ? error.message : 'Error desconocido'}`);
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
        'localidad': 'localidad',
        'locality': 'localidad',
        'distrito': 'localidad',
        'ciudad': 'localidad',
        'telefono': 'telefono',
        'teléfono': 'telefono',
        'telefono de contacto': 'telefono',
        'phone': 'telefono',
        'celular': 'telefono',
        'movil': 'telefono',
        'móvil': 'telefono',
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
          localidad: undefined,
          telefono: undefined,
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
              case 'localidad':
                rowData.localidad = stringValue;
                break;
              case 'telefono':
                rowData.telefono = stringValue;
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

  normalizeMonth(value: string): string {
    const normalizedDate = this.normalizeDate(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      return normalizedDate.slice(0, 7);
    }
    if (/^\d{4}-\d{2}$/.test(value)) {
      return value;
    }
    return value;
  },

  normalizeMoney(value: string): number {
    const normalized = value
      .replace(/S\/\.?/gi, '')
      .replace(/\s/g, '')
      .replace(/,/g, '');
    return Number(normalized) || 0;
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
  async generateVariableCompensationsTemplate(): Promise<void> {
    try {
      const XLSX = await import('xlsx');
      const headers = ['DNI', 'Trabajador', 'Mes', 'Monto', 'Concepto', 'Fecha Pago', 'Notas'];
      const exampleData = [
        ['12345678', 'Juan Pérez García', '2026-05', 250.00, 'Comisión por productividad', '2026-05-31', 'Pago validado'],
        ['87654321', 'María López Sánchez', '2026-05', 180.50, 'Bono variable', '2026-05-31', '']
      ];

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
      worksheet['!cols'] = [
        { wch: 12 },
        { wch: 28 },
        { wch: 12 },
        { wch: 12 },
        { wch: 28 },
        { wch: 15 },
        { wch: 35 }
      ];

      const instructions = XLSX.utils.aoa_to_sheet([
        ['INSTRUCCIONES PARA CARGA DE COMISIONES / VARIABLES'],
        [''],
        ['DNI o Trabajador:', 'Debe indicar al menos uno. Se recomienda DNI para evitar homónimos.'],
        ['Mes:', 'Formato YYYY-MM. Si se deja vacío, se usará el mes seleccionado en la pantalla.'],
        ['Monto:', 'Monto pagado. Debe ser mayor a cero.'],
        ['Concepto:', 'Ej: Comisión, Bono variable, Productividad. Si se deja vacío se usará "Comisión".'],
        ['Fecha Pago:', 'Opcional. Formato YYYY-MM-DD o DD/MM/YYYY.'],
        ['Notas:', 'Opcional.']
      ]);
      instructions['!cols'] = [{ wch: 28 }, { wch: 70 }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
      XLSX.utils.book_append_sheet(workbook, instructions, 'Instrucciones');
      XLSX.writeFile(workbook, `plantilla_comisiones_variables_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      console.error('Error al generar plantilla de comisiones:', error);
      throw new Error('Error al generar plantilla Excel. Asegúrate de que xlsx está instalado.');
    }
  },

  async generatePersonnelTemplate(): Promise<void> {
    try {
      const XLSX = await import('xlsx');
      
      // Datos de ejemplo
      const headers = ['Nombre', 'DNI', 'Puesto', 'Localidad', 'Teléfono', 'Zonas', 'Turno', 'Fecha Inicio', 'Fecha Fin'];
      const exampleData = [
        ['Juan Pérez García', '12345678', 'Guardia de Seguridad', 'San Isidro', '987654321', 'Zona A, Zona B', 'Diurno', '2025-01-15', ''],
        ['María López Sánchez', '87654321', 'Supervisor', 'Miraflores', '912345678', 'Zona C', 'Nocturno', '2025-01-20', ''],
        ['Carlos Rodríguez', '11223344', 'Guardia de Seguridad', 'La Molina', '', 'Zona A', 'Mixto', '2025-02-01', ''],
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
        { wch: 18 }, // Localidad
        { wch: 14 }, // Teléfono
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
        ['Localidad (Opcional):', 'Distrito, ciudad u otro lugar de referencia del trabajador'],
        ['Teléfono (Opcional):', 'Número de contacto del trabajador (ej: 987654321)'],
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
  },

  /** Reporte de saldos de vacaciones */
  async exportVacationBalances(
    summaries: Array<{
      workerName: string;
      workerDni?: string;
      puesto?: string;
      unitName: string;
      startDate?: string;
      fullYears: number;
      monthsInCurrentPeriod: number;
      accruedDays: number;
      serviceDays?: number;
      daysInCurrentPeriod?: number;
      historicalTakenDays: number;
      papeletaDays: number;
      pendingIndividualDays: number;
      totalUsedDays: number;
      availableDays: number;
      canIssuePapeleta: boolean;
      pendingDayDates: string[];
      first15Available?: number;
      second15Available?: number;
      weeklyRestDayLabel?: string;
    }>,
    options: { includeUnit?: boolean; unitName?: string } = {}
  ): Promise<void> {
    const includeUnit = options.includeUnit !== false;
    const headers = [
      ...(includeUnit ? ['Unidad'] : []),
      'Trabajador',
      'DNI',
      'Puesto',
      'Fecha ingreso',
      'Años completos',
      'Meses periodo actual',
      'Días de servicio',
      'Días ganados',
      'Primeros 15 disponibles',
      'Segundos 15 disponibles',
      'Días históricos (pre-sistema)',
      'Días en papeletas',
      'Días a cuenta',
      'Total usado',
      'Saldo disponible',
      'Descanso semanal',
      'Puede emitir papeleta',
      'Fechas días a cuenta',
    ];

    const rows = summaries.map(s => {
      const row: Record<string, string | number> = {
        Trabajador: s.workerName,
        DNI: s.workerDni || '',
        Puesto: s.puesto || '',
        'Fecha ingreso': s.startDate || '',
        'Años completos': s.fullYears,
        'Meses periodo actual': s.monthsInCurrentPeriod,
        'Días de servicio': s.serviceDays ?? '',
        'Días ganados': s.accruedDays,
        'Primeros 15 disponibles': s.first15Available ?? '',
        'Segundos 15 disponibles': s.second15Available ?? '',
        'Días históricos (pre-sistema)': s.historicalTakenDays,
        'Días en papeletas': s.papeletaDays,
        'Días a cuenta': s.pendingIndividualDays,
        'Total usado': s.totalUsedDays,
        'Saldo disponible': s.availableDays,
        'Descanso semanal': s.weeklyRestDayLabel || '',
        'Puede emitir papeleta': s.canIssuePapeleta ? 'Sí' : 'No',
        'Fechas días a cuenta': s.pendingDayDates.join(', '),
      };
      if (includeUnit) row['Unidad'] = s.unitName;
      return row;
    });

    const unitSuffix = options.unitName
      ? `_${options.unitName.replace(/[^\w\-]+/g, '_').slice(0, 40)}`
      : '';
    await this.exportToExcel(rows, headers, {
      sheetName: 'Saldos vacaciones',
      filename: `reporte_saldos_vacaciones${unitSuffix}_${new Date().toISOString().split('T')[0]}.xlsx`,
    });
  },

  /** Reporte de papeletas emitidas */
  async exportVacationPapeletas(
    papeletas: Array<{
      code: string;
      workerName: string;
      workerDni?: string;
      unitName: string;
      startDate: string;
      endDate: string;
      returnDate: string;
      calendarDays: number;
      sourceType: string;
      status: string;
      notes?: string;
      issuedAt?: string;
      accumulatedDates?: string;
    }>,
    options: { includeUnit?: boolean; unitName?: string } = {}
  ): Promise<void> {
    const includeUnit = options.includeUnit !== false;
    const headers = [
      'Código',
      ...(includeUnit ? ['Unidad'] : []),
      'Trabajador',
      'DNI',
      'Fecha salida',
      'Fecha término',
      'Fecha retorno',
      'Días calendario',
      'Tipo',
      'Estado',
      'Fecha emisión',
      'Observaciones',
      'Días acumulados origen',
    ];

    const sourceLabel = (t: string) =>
      t === 'accumulated' ? 'Acumulada (días a cuenta)' : 'Directa (continua)';

    const statusLabel = (s: string) => {
      if (s === 'issued') return 'Emitida';
      if (s === 'draft') return 'Borrador';
      if (s === 'cancelled') return 'Anulada';
      return s;
    };

    const rows = papeletas.map(p => {
      const row: Record<string, string | number> = {
        Código: p.code,
        Trabajador: p.workerName,
        DNI: p.workerDni || '',
        'Fecha salida': p.startDate,
        'Fecha término': p.endDate,
        'Fecha retorno': p.returnDate,
        'Días calendario': p.calendarDays,
        Tipo: sourceLabel(p.sourceType),
        Estado: statusLabel(p.status),
        'Fecha emisión': p.issuedAt ? p.issuedAt.split('T')[0] : '',
        Observaciones: p.notes || '',
        'Días acumulados origen': p.accumulatedDates || '',
      };
      if (includeUnit) row['Unidad'] = p.unitName;
      return row;
    });

    const unitSuffix = options.unitName
      ? `_${options.unitName.replace(/[^\w\-]+/g, '_').slice(0, 40)}`
      : '';
    await this.exportToExcel(rows, headers, {
      sheetName: 'Papeletas',
      filename: `reporte_papeletas_vacaciones${unitSuffix}_${new Date().toISOString().split('T')[0]}.xlsx`,
    });
  },
};

