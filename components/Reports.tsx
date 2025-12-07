
import React, { useState, useEffect } from 'react';
import { Unit, ResourceType, ManagementStaff } from '../types';
import { Sparkles, BrainCircuit, FileText, Download, Filter, Table2, CheckSquare, Square, Archive, Users } from 'lucide-react';
import { generateExecutiveReport } from '../services/geminiService';
import { managementStaffService } from '../services/managementStaffService';

interface ReportsProps {
  units: Unit[];
}

type DataSource = 'PERSONNEL' | 'LOGISTICS' | 'LOGS' | 'MANAGEMENT_STAFF';

export const Reports: React.FC<ReportsProps> = ({ units }) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'export'>('ai');
  
  // AI Report State
  const [selectedUnitIdAi, setSelectedUnitIdAi] = useState<string>('');
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  // Data Export State
  const [dataSource, setDataSource] = useState<DataSource>('PERSONNEL');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [includeArchivedStaff, setIncludeArchivedStaff] = useState(false);
  const [includeArchivedPersonnel, setIncludeArchivedPersonnel] = useState(false);
  const [managementStaff, setManagementStaff] = useState<ManagementStaff[]>([]);
  const [archivedStaff, setArchivedStaff] = useState<ManagementStaff[]>([]);
  
  // Load management staff data
  useEffect(() => {
    const loadStaff = async () => {
      try {
        const active = await managementStaffService.getAll(false);
        const archived = await managementStaffService.getArchived();
        setManagementStaff(active);
        setArchivedStaff(archived);
      } catch (error) {
        console.error('Error loading management staff:', error);
      }
    };
    loadStaff();
  }, []);
  
  // Available Columns Definition
  const columnsConfig: Record<DataSource, string[]> = {
    PERSONNEL: ['Unidad', 'Nombre', 'DNI', 'Turno', 'Estado', 'Estado Personal', 'Fecha Inicio', 'Fecha Fin', 'Cumplimiento', 'Zonas Asignadas', 'Archivado'],
    LOGISTICS: ['Unidad', 'Nombre', 'Tipo', 'Cantidad', 'Estado', 'Ubicación', 'SKU'],
    LOGS: ['Unidad', 'Fecha', 'Tipo', 'Descripción', 'Autor'],
    MANAGEMENT_STAFF: ['Nombre', 'DNI', 'Rol', 'Email', 'Teléfono', 'Estado', 'Fecha Inicio', 'Fecha Fin', 'Archivado']
  };

  const handleGenerateAiReport = async () => {
    if (!selectedUnitIdAi) return;
    const unit = units.find(u => u.id === selectedUnitIdAi);
    if (!unit) return;

    setIsLoadingAi(true);
    setAiReport(null);
    try {
      const report = await generateExecutiveReport(unit);
      setAiReport(report);
    } catch (e) {
      setAiReport("Error al generar el reporte.");
    } finally {
      setIsLoadingAi(false);
    }
  };

  const toggleColumn = (col: string) => {
    if (selectedColumns.includes(col)) {
      setSelectedColumns(selectedColumns.filter(c => c !== col));
    } else {
      setSelectedColumns([...selectedColumns, col]);
    }
  };

  const selectAllColumns = () => {
    setSelectedColumns(columnsConfig[dataSource]);
  };

  // Helper to flatten data based on selection
  const getFlattenedData = () => {
    let data: any[] = [];
    
    if (dataSource === 'MANAGEMENT_STAFF') {
      const staffToInclude = includeArchivedStaff 
        ? [...managementStaff, ...archivedStaff]
        : managementStaff;
      
      staffToInclude.forEach(staff => {
        data.push({
          'Nombre': staff.name,
          'DNI': staff.dni || '-',
          'Rol': staff.role === 'COORDINATOR' ? 'Coordinador' : staff.role === 'RESIDENT_SUPERVISOR' ? 'Supervisor Residente' : 'Supervisor de Ronda',
          'Email': staff.email || '-',
          'Teléfono': staff.phone || '-',
          'Estado': staff.status === 'cesado' ? 'Cesado' : 'Activo',
          'Fecha Inicio': staff.startDate ? new Date(staff.startDate).toLocaleDateString('es-ES') : '-',
          'Fecha Fin': staff.endDate ? new Date(staff.endDate).toLocaleDateString('es-ES') : '-',
          'Archivado': staff.archived ? 'Sí' : 'No'
        });
      });
      return data;
    }
    
    units.forEach(u => {
      if (dataSource === 'PERSONNEL') {
        const personnel = includeArchivedPersonnel 
          ? u.resources.filter(r => r.type === ResourceType.PERSONNEL)
          : u.resources.filter(r => r.type === ResourceType.PERSONNEL && !r.archived);
        
        personnel.forEach(r => {
          data.push({
            'Unidad': u.name,
            'Nombre': r.name,
            'DNI': r.dni || '-',
            'Turno': r.assignedShift || '-',
            'Estado': r.status || '-',
            'Estado Personal': r.personnelStatus === 'cesado' ? 'Cesado' : 'Activo',
            'Fecha Inicio': r.startDate ? new Date(r.startDate).toLocaleDateString('es-ES') : '-',
            'Fecha Fin': r.endDate ? new Date(r.endDate).toLocaleDateString('es-ES') : '-',
            'Cumplimiento': (r.compliancePercentage || 0) + '%',
            'Zonas Asignadas': r.assignedZones?.join(', ') || '-',
            'Archivado': r.archived ? 'Sí' : 'No'
          });
        });
      } else if (dataSource === 'LOGISTICS') {
        u.resources.filter(r => r.type !== ResourceType.PERSONNEL).forEach(r => {
          data.push({
            'Unidad': u.name,
            'Nombre': r.name,
            'Tipo': r.type === ResourceType.EQUIPMENT ? 'Equipo' : 'Material',
            'Cantidad': r.quantity + (r.unitOfMeasure ? ` ${r.unitOfMeasure}` : ''),
            'Estado': r.status,
            'Ubicación': r.assignedZones?.join(', ') || '',
            'SKU': r.externalId || '-'
          });
        });
      } else if (dataSource === 'LOGS') {
        u.logs.forEach(l => {
          data.push({
            'Unidad': u.name,
            'Fecha': l.date,
            'Tipo': l.type,
            'Descripción': l.description,
            'Autor': l.author
          });
        });
      }
    });

    return data;
  };

  const handleExportCsv = () => {
    if (selectedColumns.length === 0) {
      alert('Seleccione al menos una columna para exportar.');
      return;
    }
    
    const data = getFlattenedData();
    const headers = selectedColumns.join(',');
    const rows = data.map(row => {
      return selectedColumns.map(col => {
        let val = row[col] || '';
        // Escape commas for CSV
        if (typeof val === 'string' && val.includes(',')) val = `"${val}"`;
        return val;
      }).join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_${dataSource.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const previewData = getFlattenedData().slice(0, 5); // Show first 5 rows

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 h-full flex flex-col">
       <div>
         <h1 className="text-xl md:text-2xl font-bold text-slate-800">Informes y Analítica</h1>
         <p className="text-xs md:text-sm text-slate-500">Generación de reportes inteligentes y exportación de datos.</p>
       </div>

       <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
         {/* Tabs */}
         <div className="flex border-b border-slate-200 bg-slate-50 overflow-x-auto">
            <button 
              onClick={() => setActiveTab('ai')}
              className={`px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-medium flex items-center transition-colors whitespace-nowrap shrink-0 ${activeTab === 'ai' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Sparkles className="mr-1 md:mr-2" size={14} /> <span className="hidden sm:inline">Reportes Ejecutivos (IA)</span><span className="sm:hidden">IA</span>
            </button>
            <button 
              onClick={() => setActiveTab('export')}
              className={`px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-medium flex items-center transition-colors whitespace-nowrap shrink-0 ${activeTab === 'export' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Table2 className="mr-1 md:mr-2" size={14} /> <span className="hidden sm:inline">Exportación de Datos</span><span className="sm:hidden">Exportar</span>
            </button>
         </div>

         {/* Content */}
         <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
            {activeTab === 'ai' && (
              <div className="max-w-4xl mx-auto space-y-6">
                 <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-8 rounded-2xl shadow-lg text-white">
                    <div className="flex items-center mb-6">
                        <BrainCircuit size={32} className="mr-4 text-white/80"/>
                        <div>
                          <h2 className="text-xl font-bold">Generador de Reportes Inteligente</h2>
                          <p className="text-indigo-200 text-sm">Seleccione una unidad operativa para generar un análisis ejecutivo completo utilizando IA.</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-4">
                      <select 
                        className="flex-1 bg-white/20 border border-white/30 text-white placeholder-white/50 rounded-lg p-3 outline-none focus:bg-white/30 transition-colors"
                        value={selectedUnitIdAi}
                        onChange={(e) => setSelectedUnitIdAi(e.target.value)}
                      >
                         <option value="" className="text-slate-800">Seleccionar Unidad...</option>
                         {units.map(u => <option key={u.id} value={u.id} className="text-slate-800">{u.name}</option>)}
                      </select>
                      <button 
                         onClick={handleGenerateAiReport}
                         disabled={!selectedUnitIdAi || isLoadingAi}
                         className="bg-white text-indigo-700 font-bold px-6 py-3 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                      >
                         {isLoadingAi ? <span className="animate-spin mr-2">⏳</span> : <Sparkles className="mr-2" size={18}/>}
                         Generar Reporte
                      </button>
                    </div>
                 </div>

                 {aiReport && (
                   <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 animate-in slide-in-from-bottom-4 duration-500">
                      <div className="prose prose-slate max-w-none">
                        <div className="markdown-prose space-y-4">
                            {aiReport.split('\n').map((line, i) => <p key={i} className="text-slate-700 leading-relaxed">{line}</p>)}
                        </div>
                      </div>
                      <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                         <button onClick={() => window.print()} className="text-slate-500 hover:text-slate-700 flex items-center text-sm font-medium"><Download size={16} className="mr-2"/> Descargar PDF (Imprimir)</button>
                      </div>
                   </div>
                 )}
              </div>
            )}

            {activeTab === 'export' && (
              <div className="max-w-5xl mx-auto space-y-6">
                 <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center"><Filter className="mr-2" size={20}/> Configuración de Exportación</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Fuente de Datos</label>
                          <select 
                            className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                            value={dataSource}
                            onChange={(e) => {
                               setDataSource(e.target.value as DataSource);
                               setSelectedColumns([]); // Reset columns on source change
                            }}
                          >
                             <option value="PERSONNEL">Personal Operativo</option>
                             <option value="LOGISTICS">Inventario y Logística</option>
                             <option value="LOGS">Bitácora de Eventos</option>
                             <option value="MANAGEMENT_STAFF">Equipo de Supervisión</option>
                          </select>
                       </div>

                       <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-slate-700 mb-2 flex justify-between">
                             <span>Columnas a Incluir</span>
                             <button onClick={selectAllColumns} className="text-blue-600 text-xs hover:underline">Seleccionar Todas</button>
                          </label>
                          <div className="flex flex-wrap gap-2">
                             {columnsConfig[dataSource].map(col => (
                                <button 
                                  key={col}
                                  onClick={() => toggleColumn(col)}
                                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex items-center
                                     ${selectedColumns.includes(col) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}
                                  `}
                                >
                                   {selectedColumns.includes(col) ? <CheckSquare size={14} className="mr-1.5"/> : <Square size={14} className="mr-1.5"/>}
                                   {col}
                                </button>
                             ))}
                          </div>
                          {(dataSource === 'MANAGEMENT_STAFF' || dataSource === 'PERSONNEL') && (
                            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={dataSource === 'MANAGEMENT_STAFF' ? includeArchivedStaff : includeArchivedPersonnel}
                                  onChange={(e) => {
                                    if (dataSource === 'MANAGEMENT_STAFF') {
                                      setIncludeArchivedStaff(e.target.checked);
                                    } else {
                                      setIncludeArchivedPersonnel(e.target.checked);
                                    }
                                  }}
                                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 mr-2"
                                />
                                <span className="text-sm text-slate-700 flex items-center">
                                  <Archive size={14} className="mr-1.5" />
                                  Incluir trabajadores archivados
                                  {dataSource === 'MANAGEMENT_STAFF' && ` (${archivedStaff.length} registros)`}
                                </span>
                              </label>
                              <p className="text-xs text-slate-500 mt-2 ml-6">
                                Los trabajadores archivados permanecen en la base de datos para consultas históricas y reportes.
                              </p>
                            </div>
                          )}
                       </div>
                    </div>
                 </div>

                 {/* Preview Table */}
                 <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50">
                       <h3 className="font-bold text-slate-700 text-xs md:text-sm">Vista Previa (Primeros 5 registros)</h3>
                       <button 
                         onClick={handleExportCsv}
                         className="bg-green-600 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium hover:bg-green-700 transition-colors flex items-center shadow-sm w-full sm:w-auto justify-center"
                       >
                         <FileText size={14} className="mr-1 md:mr-2 md:w-4 md:h-4"/> <span className="hidden sm:inline">Exportar Excel / CSV</span><span className="sm:hidden">Exportar</span>
                       </button>
                    </div>
                    
                    <div className="overflow-x-auto -mx-4 md:mx-0">
                      <div className="inline-block min-w-full align-middle px-4 md:px-0">
                        <table className="min-w-full divide-y divide-slate-200">
                           <thead className="bg-slate-50">
                              <tr>
                                 {selectedColumns.length > 0 ? selectedColumns.map(col => (
                                    <th key={col} className="px-3 md:px-6 py-2 md:py-3 text-left text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider">{col}</th>
                                 )) : <th className="px-3 md:px-6 py-2 md:py-3 text-left text-[10px] md:text-xs text-slate-400">Seleccione columnas...</th>}
                              </tr>
                           </thead>
                           <tbody className="bg-white divide-y divide-slate-200">
                              {previewData.map((row, idx) => (
                                 <tr key={idx}>
                                    {selectedColumns.map(col => (
                                       <td key={col} className="px-3 md:px-6 py-2 md:py-4 text-xs md:text-sm text-slate-700">
                                          <div className="max-w-[150px] md:max-w-none truncate" title={String(row[col])}>{row[col]}</div>
                                       </td>
                                    ))}
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                      </div>
                    </div>
                 </div>
              </div>
            )}
         </div>
       </div>
    </div>
  );
};