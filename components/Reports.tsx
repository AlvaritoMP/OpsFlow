
import React, { useState } from 'react';
import { Unit, ResourceType } from '../types';
import { Sparkles, BrainCircuit, FileText, Download, Filter, Table2, CheckSquare, Square } from 'lucide-react';
import { generateExecutiveReport } from '../services/geminiService';

interface ReportsProps {
  units: Unit[];
}

type DataSource = 'PERSONNEL' | 'LOGISTICS' | 'LOGS';

export const Reports: React.FC<ReportsProps> = ({ units }) => {
  const [activeTab, setActiveTab] = useState<'ai' | 'export'>('ai');
  
  // AI Report State
  const [selectedUnitIdAi, setSelectedUnitIdAi] = useState<string>('');
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  // Data Export State
  const [dataSource, setDataSource] = useState<DataSource>('PERSONNEL');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  
  // Available Columns Definition
  const columnsConfig: Record<DataSource, string[]> = {
    PERSONNEL: ['Unidad', 'Nombre', 'Turno', 'Estado', 'Cumplimiento', 'Zonas Asignadas'],
    LOGISTICS: ['Unidad', 'Nombre', 'Tipo', 'Cantidad', 'Estado', 'Ubicación', 'SKU'],
    LOGS: ['Unidad', 'Fecha', 'Tipo', 'Descripción', 'Autor']
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
    
    units.forEach(u => {
      if (dataSource === 'PERSONNEL') {
        u.resources.filter(r => r.type === ResourceType.PERSONNEL).forEach(r => {
          data.push({
            'Unidad': u.name,
            'Nombre': r.name,
            'Turno': r.assignedShift,
            'Estado': r.status,
            'Cumplimiento': r.compliancePercentage + '%',
            'Zonas Asignadas': r.assignedZones?.join(', ') || ''
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
    <div className="p-6 md:p-8 space-y-6 h-full flex flex-col">
       <div>
         <h1 className="text-2xl font-bold text-slate-800">Informes y Analítica</h1>
         <p className="text-slate-500">Generación de reportes inteligentes y exportación de datos.</p>
       </div>

       <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-1 overflow-hidden">
         {/* Tabs */}
         <div className="flex border-b border-slate-200 bg-slate-50">
            <button 
              onClick={() => setActiveTab('ai')}
              className={`px-6 py-4 text-sm font-medium flex items-center transition-colors ${activeTab === 'ai' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Sparkles className="mr-2" size={18}/> Reportes Ejecutivos (IA)
            </button>
            <button 
              onClick={() => setActiveTab('export')}
              className={`px-6 py-4 text-sm font-medium flex items-center transition-colors ${activeTab === 'export' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Table2 className="mr-2" size={18}/> Exportación de Datos
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
                       </div>
                    </div>
                 </div>

                 {/* Preview Table */}
                 <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                       <h3 className="font-bold text-slate-700 text-sm">Vista Previa (Primeros 5 registros)</h3>
                       <button 
                         onClick={handleExportCsv}
                         className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center shadow-sm"
                       >
                         <FileText size={16} className="mr-2"/> Exportar Excel / CSV
                       </button>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200">
                         <thead className="bg-slate-50">
                            <tr>
                               {selectedColumns.length > 0 ? selectedColumns.map(col => (
                                  <th key={col} className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{col}</th>
                               )) : <th className="px-6 py-3 text-left text-xs text-slate-400">Seleccione columnas...</th>}
                            </tr>
                         </thead>
                         <tbody className="bg-white divide-y divide-slate-200">
                            {previewData.map((row, idx) => (
                               <tr key={idx}>
                                  {selectedColumns.map(col => (
                                     <td key={col} className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                                        {row[col]}
                                     </td>
                                  ))}
                               </tr>
                            ))}
                         </tbody>
                      </table>
                    </div>
                 </div>
              </div>
            )}
         </div>
       </div>
    </div>
  );
};