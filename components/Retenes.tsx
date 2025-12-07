import React, { useState, useEffect } from 'react';
import { 
  Users, Plus, Edit2, Trash2, Calendar, Clock, MapPin, 
  Send, FileText, Download, ChevronLeft, ChevronRight, 
  X, Save, CheckCircle, AlertCircle, Share2, MessageCircle,
  Filter, Search
} from 'lucide-react';
import { retenesService, Reten, RetenAssignment } from '../services/retenesService';
import { excelService } from '../services/excelService';
import { Unit } from '../types';
import { pdfConstancyService } from '../services/pdfConstancyService';

interface RetenesProps {
  units: Unit[];
  currentUserRole?: string;
}

export const Retenes: React.FC<RetenesProps> = ({ units, currentUserRole }) => {
  // Estados principales
  const [activeView, setActiveView] = useState<'weekly' | 'retenes' | 'reports'>('weekly');
  const [retenes, setRetenes] = useState<Reten[]>([]);
  const [assignments, setAssignments] = useState<RetenAssignment[]>([]);
  const [loading, setLoading] = useState(false);

  // Estados para vista semanal
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    const monday = new Date(today);
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Ajustar para lunes
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  // Estados para gestión de retenes
  const [showRetenModal, setShowRetenModal] = useState(false);
  const [editingReten, setEditingReten] = useState<Reten | null>(null);
  const [retenForm, setRetenForm] = useState({
    name: '',
    dni: '',
    phone: '',
    email: '',
    photo: '',
    status: 'disponible' as Reten['status'],
    notes: ''
  });
  const [retenPhotoUrl, setRetenPhotoUrl] = useState('');

  // Estados para asignaciones
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<RetenAssignment | null>(null);
  const [assignmentForm, setAssignmentForm] = useState({
    reten_id: '',
    unit_id: '',
    assignment_date: '',
    start_time: '',
    end_time: '',
    assignment_type: 'planificada' as 'planificada' | 'inmediata',
    reason: '',
    notes: ''
  });

  // Estados para reportes
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [monthlyReport, setMonthlyReport] = useState<any[]>([]);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Cargar datos
  useEffect(() => {
    loadRetenes();
  }, []);

  useEffect(() => {
    if (activeView === 'weekly') {
      loadAssignments();
    }
  }, [weekStart, activeView]);

  useEffect(() => {
    if (activeView === 'reports') {
      loadMonthlyReport();
    }
  }, [reportMonth, reportYear, activeView]);

  const loadRetenes = async () => {
    setLoading(true);
    try {
      const data = await retenesService.getAll();
      setRetenes(data);
    } catch (error) {
      console.error('Error cargando retenes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const start = weekStart.toISOString().split('T')[0];
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 6);
      const endStr = end.toISOString().split('T')[0];
      
      const data = await retenesService.getAssignmentsByDateRange(start, endStr);
      setAssignments(data);
    } catch (error) {
      console.error('Error cargando asignaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMonthlyReport = async () => {
    setLoading(true);
    try {
      const data = await retenesService.getMonthlyReport(reportYear, reportMonth);
      setMonthlyReport(data);
    } catch (error) {
      console.error('Error cargando reporte mensual:', error);
    } finally {
      setLoading(false);
    }
  };

  // Navegación de semana
  const changeWeek = (delta: number) => {
    const newDate = new Date(weekStart);
    newDate.setDate(newDate.getDate() + (delta * 7));
    setWeekStart(newDate);
  };

  // Gestión de retenes
  const handleSaveReten = async () => {
    if (!retenForm.name || !retenForm.dni || !retenForm.phone) {
      alert('Por favor complete todos los campos requeridos');
      return;
    }

    try {
      const retenData = {
        ...retenForm,
        photo: retenForm.photo || null // Guardar null si está vacío
      };
      
      if (editingReten) {
        await retenesService.update(editingReten.id, retenData);
      } else {
        await retenesService.create(retenData);
      }
      setShowRetenModal(false);
      setEditingReten(null);
      setRetenForm({ name: '', dni: '', phone: '', email: '', photo: '', status: 'disponible', notes: '' });
      setRetenPhotoUrl('');
      loadRetenes();
    } catch (error) {
      console.error('Error guardando retén:', error);
      alert('Error al guardar el retén');
    }
  };

  const handleDeleteReten = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este retén?')) return;
    try {
      await retenesService.delete(id);
      loadRetenes();
    } catch (error) {
      console.error('Error eliminando retén:', error);
      alert('Error al eliminar el retén');
    }
  };

  // Gestión de asignaciones
  const handleSaveAssignment = async () => {
    if (!assignmentForm.reten_id || !assignmentForm.unit_id || !assignmentForm.assignment_date || 
        !assignmentForm.start_time || !assignmentForm.end_time) {
      alert('Por favor complete todos los campos requeridos');
      return;
    }

    try {
      const unit = units.find(u => u.id === assignmentForm.unit_id);
      if (editingAssignment) {
        await retenesService.updateAssignment(editingAssignment.id, {
          ...assignmentForm,
          unit_name: unit?.name || ''
        });
      } else {
        await retenesService.createAssignment({
          ...assignmentForm,
          unit_name: unit?.name || ''
        });
      }
      setShowAssignmentModal(false);
      setEditingAssignment(null);
      setAssignmentForm({
        reten_id: '',
        unit_id: '',
        assignment_date: '',
        start_time: '',
        end_time: '',
        assignment_type: 'planificada',
        reason: '',
        notes: ''
      });
      loadAssignments();
    } catch (error) {
      console.error('Error guardando asignación:', error);
      alert('Error al guardar la asignación');
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta asignación?')) return;
    try {
      await retenesService.deleteAssignment(id);
      loadAssignments();
    } catch (error) {
      console.error('Error eliminando asignación:', error);
      alert('Error al eliminar la asignación');
    }
  };

  // Generar y enviar constancia por WhatsApp
  const handleGenerateConstancy = async (assignment: RetenAssignment) => {
    try {
      const reten = retenes.find(r => r.id === assignment.reten_id);
      if (!reten) {
        alert('No se encontró información del retén');
        return;
      }

      if (!reten.phone) {
        alert('El retén no tiene un número de teléfono registrado');
        return;
      }

      // Limpiar número de teléfono (solo números)
      const cleanPhone = reten.phone.replace(/[^0-9]/g, '');
      if (!cleanPhone || cleanPhone.length < 9) {
        alert('El número de teléfono no es válido');
        return;
      }

      // Mensaje para WhatsApp (más corto y directo)
      const message = `*CONSTANCIA DE ASIGNACIÓN*\n\n` +
        `Código: ${assignment.constancy_code || 'PENDIENTE'}\n` +
        `Retén: ${reten.name}\n` +
        `DNI: ${reten.dni}\n` +
        `Unidad: ${assignment.unit_name}\n` +
        `Fecha: ${new Date(assignment.assignment_date).toLocaleDateString('es-ES')}\n` +
        `Horario: ${assignment.start_time} - ${assignment.end_time}\n` +
        `Tipo: ${assignment.assignment_type === 'planificada' ? 'Planificada' : 'Inmediata'}\n` +
        (assignment.reason ? `Razón: ${assignment.reason}\n` : '') +
        `\nPor favor presente esta constancia en la unidad asignada.`;

      // Abrir WhatsApp con el mensaje
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');

      // Marcar como enviado (sin esperar)
      try {
        await retenesService.updateAssignment(assignment.id, { whatsapp_sent: true });
        loadAssignments();
      } catch (updateError) {
        console.error('Error actualizando estado de WhatsApp:', updateError);
        // No mostrar error al usuario, el WhatsApp ya se abrió
      }
    } catch (error) {
      console.error('Error generando constancia:', error);
      alert('Error al abrir WhatsApp. Verifica que el número de teléfono sea correcto.');
    }
  };

  // Exportar reporte mensual a Excel
  const handleExportMonthlyReport = async () => {
    try {
      const headers = [
        'Retén',
        'DNI',
        'Teléfono',
        'Total Asignaciones',
        'Total Horas',
        'Unidades Cubiertas',
        'Detalle Asignaciones'
      ];

      const data = monthlyReport.map(item => ({
        'Retén': item.reten_name,
        'DNI': item.reten_dni,
        'Teléfono': item.reten_phone,
        'Total Asignaciones': item.total_assignments,
        'Total Horas': item.total_hours.toFixed(2),
        'Unidades Cubiertas': item.units_covered,
        'Detalle Asignaciones': item.assignments.map((a: any) => 
          `${a.date} ${a.unit} (${a.start_time}-${a.end_time})`
        ).join('; ')
      }));

      await excelService.exportToExcel(data, headers, {
        filename: `reporte_retenes_${reportYear}_${String(reportMonth).padStart(2, '0')}.xlsx`,
        sheetName: `Reporte ${reportMonth}/${reportYear}`
      });
    } catch (error) {
      console.error('Error exportando reporte:', error);
      alert('Error al exportar el reporte. Asegúrate de que xlsx está instalado: npm install xlsx');
    }
  };

  // Compartir vista semanal
  const handleShareWeeklyView = () => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    const summary = `*ASIGNACIONES DE RETENES - SEMANA*\n\n` +
      `Período: ${weekStart.toLocaleDateString('es-ES')} - ${weekEnd.toLocaleDateString('es-ES')}\n\n` +
      assignments.map(a => {
        const reten = retenes.find(r => r.id === a.reten_id);
        return `• ${reten?.name || 'N/A'}: ${a.unit_name} - ${a.assignment_date} (${a.start_time}-${a.end_time})`;
      }).join('\n');

    // Copiar al portapapeles
    navigator.clipboard.writeText(summary);
    alert('Vista semanal copiada al portapapeles. Puedes compartirla por WhatsApp o email.');
  };

  // Filtrar retenes
  const filteredRetenes = retenes.filter(r => {
    const matchesSearch = !searchTerm || 
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.dni.includes(searchTerm) ||
      r.phone.includes(searchTerm);
    const matchesStatus = filterStatus === 'all' || r.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Obtener días de la semana
  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  };

  // Obtener asignaciones por día
  const getAssignmentsForDay = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return assignments.filter(a => a.assignment_date === dateStr);
  };

  if (loading && retenes.length === 0) {
    return (
      <div className="p-6 md:p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Users className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando retenes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Gestión de Retenes</h1>
          <p className="text-xs md:text-sm text-slate-500">Administración y coordinación de retenes para cobertura de faltas</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveView('weekly')}
            className={`px-3 md:px-4 py-2 rounded-lg text-sm md:text-base font-medium transition-colors ${
              activeView === 'weekly' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Calendar className="inline mr-2 w-4 h-4" />
            Vista Semanal
          </button>
          <button
            onClick={() => setActiveView('retenes')}
            className={`px-3 md:px-4 py-2 rounded-lg text-sm md:text-base font-medium transition-colors ${
              activeView === 'retenes' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Users className="inline mr-2 w-4 h-4" />
            Retenes
          </button>
          <button
            onClick={() => setActiveView('reports')}
            className={`px-3 md:px-4 py-2 rounded-lg text-sm md:text-base font-medium transition-colors ${
              activeView === 'reports' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <FileText className="inline mr-2 w-4 h-4" />
            Reportes
          </button>
        </div>
      </div>

      {/* Vista Semanal */}
      {activeView === 'weekly' && (
        <div className="space-y-4">
          {/* Controles de semana */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => changeWeek(-1)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <ChevronLeft size={20} />
              </button>
              <h2 className="text-lg font-bold text-slate-800 min-w-[200px] text-center">
                {weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} - {' '}
                {new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              </h2>
              <button
                onClick={() => changeWeek(1)}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <ChevronRight size={20} />
              </button>
              <button
                onClick={() => setWeekStart(() => {
                  const today = new Date();
                  const monday = new Date(today);
                  const day = today.getDay();
                  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                  monday.setDate(diff);
                  monday.setHours(0, 0, 0, 0);
                  return monday;
                })}
                className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Hoy
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleShareWeeklyView}
                className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm"
              >
                <Share2 size={16} />
                Compartir Vista
              </button>
              <button
                onClick={() => {
                  setEditingAssignment(null);
                  setAssignmentForm({
                    reten_id: '',
                    unit_id: '',
                    assignment_date: weekStart.toISOString().split('T')[0],
                    start_time: '08:00',
                    end_time: '17:00',
                    assignment_type: 'planificada',
                    reason: '',
                    notes: ''
                  });
                  setShowAssignmentModal(true);
                }}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
              >
                <Plus size={16} />
                Nueva Asignación
              </button>
            </div>
          </div>

          {/* Calendario semanal */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-px bg-slate-200">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day, idx) => {
                const date = getWeekDays()[idx];
                const dayAssignments = getAssignmentsForDay(date);
                const isToday = date.toDateString() === new Date().toDateString();

                return (
                  <div key={idx} className="bg-white min-h-[250px] md:min-h-[300px] p-2 md:p-3">
                    <div className={`text-center mb-2 md:mb-3 ${isToday ? 'bg-blue-600 text-white rounded px-2 py-1' : ''}`}>
                      <div className="text-[10px] md:text-xs font-semibold text-slate-500">{day}</div>
                      <div className="text-sm md:text-base font-bold">{date.getDate()}</div>
                    </div>
                    <div className="space-y-1.5 md:space-y-2">
                      {dayAssignments.map(assignment => {
                        const reten = retenes.find(r => r.id === assignment.reten_id);
                        return (
                          <div
                            key={assignment.id}
                            className={`p-2 md:p-2.5 rounded-lg text-[10px] md:text-xs border-l-3 shadow-sm ${
                              assignment.assignment_type === 'inmediata' 
                                ? 'bg-red-50 border-red-400' 
                                : 'bg-blue-50 border-blue-400'
                            }`}
                          >
                            <div className="flex items-start gap-2 mb-1.5">
                              {reten?.photo ? (
                                <img 
                                  src={reten.photo} 
                                  alt={reten.name}
                                  className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover border-2 border-white shadow-sm shrink-0"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs md:text-sm font-bold shrink-0">
                                  {reten?.name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-slate-800 truncate">{reten?.name || 'N/A'}</div>
                                <div className="text-slate-600 truncate text-[9px] md:text-[10px]">{assignment.unit_name}</div>
                              </div>
                            </div>
                            <div className="text-slate-500 text-[9px] md:text-[10px] mb-1.5">
                              <Clock size={10} className="inline mr-1" />
                              {assignment.start_time} - {assignment.end_time}
                            </div>
                            {assignment.reason && (
                              <div className="text-slate-600 text-[9px] md:text-[10px] mb-1.5 line-clamp-2">
                                {assignment.reason}
                              </div>
                            )}
                            <div className="flex gap-1 mt-2 flex-wrap">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGenerateConstancy(assignment);
                                }}
                                className="p-1 md:p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors shrink-0"
                                title="Enviar por WhatsApp"
                              >
                                <MessageCircle size={12} className="md:w-3.5 md:h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingAssignment(assignment);
                                  setAssignmentForm({
                                    reten_id: assignment.reten_id,
                                    unit_id: assignment.unit_id,
                                    assignment_date: assignment.assignment_date,
                                    start_time: assignment.start_time,
                                    end_time: assignment.end_time,
                                    assignment_type: assignment.assignment_type,
                                    reason: assignment.reason || '',
                                    notes: assignment.notes || ''
                                  });
                                  setShowAssignmentModal(true);
                                }}
                                className="p-1 md:p-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors shrink-0"
                                title="Editar"
                              >
                                <Edit2 size={12} className="md:w-3.5 md:h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteAssignment(assignment.id);
                                }}
                                className="p-1 md:p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors shrink-0"
                                title="Eliminar"
                              >
                                <Trash2 size={12} className="md:w-3.5 md:h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {dayAssignments.length === 0 && (
                        <div className="text-[9px] md:text-xs text-slate-400 text-center py-2">
                          Sin asignaciones
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Vista de Retenes */}
      {activeView === 'retenes' && (
        <div className="space-y-4">
          {/* Filtros y acciones */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Buscar retén..."
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="all">Todos los estados</option>
              <option value="disponible">Disponible</option>
              <option value="asignado">Asignado</option>
              <option value="no_disponible">No Disponible</option>
            </select>
            <button
                    onClick={() => {
                      setEditingReten(null);
                      setRetenForm({ name: '', dni: '', phone: '', email: '', photo: '', status: 'disponible', notes: '' });
                      setRetenPhotoUrl('');
                      setShowRetenModal(true);
                    }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
            >
              <Plus size={16} />
              Nuevo Retén
            </button>
          </div>

          {/* Lista de retenes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {filteredRetenes.map(reten => (
              <div key={reten.id} className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-start gap-3 mb-3">
                  {reten.photo ? (
                    <img 
                      src={reten.photo} 
                      alt={reten.name}
                      className="w-12 h-12 md:w-16 md:h-16 rounded-full object-cover border-2 border-slate-200 shadow-sm shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-base md:text-lg font-bold shrink-0 ${reten.photo ? 'hidden' : ''}`}>
                    {reten.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="font-bold text-sm md:text-base text-slate-800 truncate">{reten.name}</h3>
                      <span className={`px-2 py-0.5 md:py-1 text-[9px] md:text-xs rounded-full shrink-0 ml-2 ${
                        reten.status === 'disponible' ? 'bg-green-100 text-green-700' :
                        reten.status === 'asignado' ? 'bg-blue-100 text-blue-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {reten.status}
                      </span>
                    </div>
                    <p className="text-[10px] md:text-xs text-slate-500">DNI: {reten.dni}</p>
                  </div>
                </div>
                <div className="space-y-1 text-xs md:text-sm text-slate-600 mb-3">
                  <p className="truncate"><strong>Teléfono:</strong> {reten.phone}</p>
                  {reten.email && <p className="truncate"><strong>Email:</strong> {reten.email}</p>}
                  {reten.notes && <p className="text-[10px] md:text-xs text-slate-500 line-clamp-2">{reten.notes}</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingReten(reten);
                      setRetenForm({
                        name: reten.name,
                        dni: reten.dni,
                        phone: reten.phone,
                        email: reten.email || '',
                        photo: reten.photo || '',
                        status: reten.status,
                        notes: reten.notes || ''
                      });
                      setRetenPhotoUrl(reten.photo || '');
                      setShowRetenModal(true);
                    }}
                    className="flex-1 px-2 md:px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-xs md:text-sm flex items-center justify-center gap-1"
                  >
                    <Edit2 size={12} className="md:w-3.5 md:h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => handleDeleteReten(reten.id)}
                    className="px-2 md:px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 text-xs md:text-sm"
                  >
                    <Trash2 size={12} className="md:w-3.5 md:h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vista de Reportes */}
      {activeView === 'reports' && (
        <div className="space-y-4">
          {/* Controles de reporte */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-end">
            <div>
              <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Mes</label>
              <select
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                value={reportMonth}
                onChange={e => setReportMonth(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1).toLocaleDateString('es-ES', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Año</label>
              <input
                type="number"
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-24"
                value={reportYear}
                onChange={e => setReportYear(Number(e.target.value))}
                min={2020}
                max={2100}
              />
            </div>
            <button
              onClick={handleExportMonthlyReport}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm"
            >
              <Download size={16} />
              Exportar a Excel
            </button>
          </div>

          {/* Tabla de reporte */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700">Retén</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700">DNI</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700">Teléfono</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-700">Asignaciones</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-700">Total Horas</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700">Unidades</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyReport.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{item.reten_name}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.reten_dni}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.reten_phone}</td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-slate-800">{item.total_assignments}</td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-slate-800">{item.total_hours.toFixed(2)}h</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{item.units_covered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Retén */}
      {showRetenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 md:p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[95vh] md:max-h-[90vh]">
            <div className="bg-blue-600 text-white px-4 md:px-6 py-3 md:py-4 rounded-t-xl flex justify-between items-center">
              <h3 className="text-base md:text-lg font-bold">
                {editingReten ? 'Editar Retén' : 'Nuevo Retén'}
              </h3>
              <button onClick={() => setShowRetenModal(false)} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 md:p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  value={retenForm.name}
                  onChange={e => setRetenForm({ ...retenForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">DNI *</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  value={retenForm.dni}
                  onChange={e => setRetenForm({ ...retenForm, dni: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Teléfono *</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  value={retenForm.phone}
                  onChange={e => setRetenForm({ ...retenForm, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  value={retenForm.email}
                  onChange={e => setRetenForm({ ...retenForm, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Foto (URL)</label>
                <input
                  type="url"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  placeholder="https://ejemplo.com/foto.jpg"
                  value={retenForm.photo}
                  onChange={e => {
                    setRetenForm({ ...retenForm, photo: e.target.value });
                    setRetenPhotoUrl(e.target.value);
                  }}
                />
                {retenPhotoUrl && (
                  <div className="mt-2 flex items-center gap-3">
                    <img 
                      src={retenPhotoUrl} 
                      alt="Vista previa" 
                      className="w-16 h-16 rounded-full object-cover border-2 border-slate-200"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    <span className="text-xs text-slate-500">Vista previa</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Estado</label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  value={retenForm.status}
                  onChange={e => setRetenForm({ ...retenForm, status: e.target.value as Reten['status'] })}
                >
                  <option value="disponible">Disponible</option>
                  <option value="asignado">Asignado</option>
                  <option value="no_disponible">No Disponible</option>
                </select>
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Notas</label>
                <textarea
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  rows={3}
                  value={retenForm.notes}
                  onChange={e => setRetenForm({ ...retenForm, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="p-4 md:p-6 bg-slate-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => setShowRetenModal(false)}
                className="px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveReten}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Asignación */}
      {showAssignmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 md:p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[95vh] md:max-h-[90vh]">
            <div className="bg-indigo-600 text-white px-4 md:px-6 py-3 md:py-4 rounded-t-xl flex justify-between items-center">
              <h3 className="text-base md:text-lg font-bold">
                {editingAssignment ? 'Editar Asignación' : 'Nueva Asignación'}
              </h3>
              <button onClick={() => setShowAssignmentModal(false)} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 md:p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Retén *</label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  value={assignmentForm.reten_id}
                  onChange={e => setAssignmentForm({ ...assignmentForm, reten_id: e.target.value })}
                >
                  <option value="">Seleccionar retén...</option>
                  {retenes.filter(r => r.status !== 'no_disponible').map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.status})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Unidad *</label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  value={assignmentForm.unit_id}
                  onChange={e => setAssignmentForm({ ...assignmentForm, unit_id: e.target.value })}
                >
                  <option value="">Seleccionar unidad...</option>
                  {units.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Fecha *</label>
                <input
                  type="date"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  value={assignmentForm.assignment_date}
                  onChange={e => setAssignmentForm({ ...assignmentForm, assignment_date: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Hora Inicio *</label>
                  <input
                    type="time"
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                    value={assignmentForm.start_time}
                    onChange={e => setAssignmentForm({ ...assignmentForm, start_time: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Hora Fin *</label>
                  <input
                    type="time"
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                    value={assignmentForm.end_time}
                    onChange={e => setAssignmentForm({ ...assignmentForm, end_time: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Tipo</label>
                <select
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  value={assignmentForm.assignment_type}
                  onChange={e => setAssignmentForm({ ...assignmentForm, assignment_type: e.target.value as 'planificada' | 'inmediata' })}
                >
                  <option value="planificada">Planificada</option>
                  <option value="inmediata">Inmediata</option>
                </select>
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Razón de Cobertura</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  placeholder="Ej: Falta de personal, licencia, etc."
                  value={assignmentForm.reason}
                  onChange={e => setAssignmentForm({ ...assignmentForm, reason: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 mb-1">Notas</label>
                <textarea
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                  rows={3}
                  value={assignmentForm.notes}
                  onChange={e => setAssignmentForm({ ...assignmentForm, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="p-4 md:p-6 bg-slate-50 rounded-b-xl flex justify-end gap-3">
              <button
                onClick={() => setShowAssignmentModal(false)}
                className="px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveAssignment}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

