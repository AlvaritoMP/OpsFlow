import React, { useState, useEffect, useRef } from 'react';
import { 
  Moon, Phone, Camera, AlertTriangle, CheckCircle, XCircle, 
  Plus, Edit2, Trash2, Calendar, Clock, MapPin, FileText, 
  Download, Filter, Search, Upload, Image as ImageIcon,
  Bell, TrendingUp, Users, Eye, Save, X, ChevronLeft, ChevronRight
} from 'lucide-react';
import { nightSupervisionService } from '../services/nightSupervisionService';
import { 
  NightSupervisionShift, 
  NightSupervisionCall, 
  NightSupervisionCameraReview,
  NightSupervisionAlert,
  NightSupervisionReport 
} from '../types';
import { Unit, Resource, ResourceType, User, ManagementStaff } from '../types';
import { nightSupervisionPdfService } from '../services/nightSupervisionPdfService';
import { excelService } from '../services/excelService';
import { storageService } from '../services/storageService';

interface NightSupervisionProps {
  units: Unit[];
  currentUser: User;
  managementStaff: ManagementStaff[];
}

export const NightSupervision: React.FC<NightSupervisionProps> = ({ 
  units, 
  currentUser,
  managementStaff
}) => {
  // Estados principales
  const [activeView, setActiveView] = useState<'shifts' | 'current' | 'reports' | 'historical'>('shifts');
  
  // Estados para reportes históricos
  const [historicalReportType, setHistoricalReportType] = useState<'worker' | 'unit'>('worker');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [historicalDateFrom, setHistoricalDateFrom] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split('T')[0];
  });
  const [historicalDateTo, setHistoricalDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [historicalReport, setHistoricalReport] = useState<HistoricalReportByWorker | HistoricalReportByUnit | null>(null);
  const [shifts, setShifts] = useState<NightSupervisionShift[]>([]);
  const [currentShift, setCurrentShift] = useState<NightSupervisionShift | null>(null);
  const [todayShift, setTodayShift] = useState<NightSupervisionShift | null>(null);
  const [calls, setCalls] = useState<NightSupervisionCall[]>([]);
  const [cameraReviews, setCameraReviews] = useState<NightSupervisionCameraReview[]>([]);
  const [alerts, setAlerts] = useState<NightSupervisionAlert[]>([]);
  const [loading, setLoading] = useState(false);

  // Estados para filtros
  const [dateFrom, setDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [filterUnitId, setFilterUnitId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Estados para modales
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);
  const [showCameraReviewModal, setShowCameraReviewModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<NightSupervisionShift | null>(null);
  const [editingCall, setEditingCall] = useState<NightSupervisionCall | null>(null);
  const [editingCameraReview, setEditingCameraReview] = useState<NightSupervisionCameraReview | null>(null);

  // Función para obtener la fecha de hoy en formato YYYY-MM-DD (sin problemas de zona horaria)
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    return dateStr;
  };

  // Función para formatear fecha desde string YYYY-MM-DD sin problemas de zona horaria
  const formatDateFromString = (dateStr: string, options?: Intl.DateTimeFormatOptions) => {
    if (!dateStr) return '';
    // Parsear directamente desde el string YYYY-MM-DD
    const [year, month, day] = dateStr.split('-').map(Number);
    // Crear fecha en hora local (no UTC) usando el constructor con año, mes, día
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-PE', options || {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // Función para formatear fecha completa (con día de la semana)
  const formatDateFull = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  };

  // Estados para formularios
  const [shiftForm, setShiftForm] = useState({
    date: getTodayDate(), // Usar función explícita para asegurar fecha correcta
    unit_id: '',
    shift_start: '22:00',
    shift_end: '06:00',
    notes: ''
  });
  const [workersOnRest, setWorkersOnRest] = useState<Set<string>>(new Set()); // IDs de trabajadores en descanso

  const [callForm, setCallForm] = useState({
    worker_id: '',
    call_number: 1 as 1 | 2 | 3,
    scheduled_time: '',
    actual_time: '',
    answered: false,
    photo_received: false,
    photo_url: '',
    notes: '',
    non_conformity: false,
    non_conformity_description: ''
  });
  const [callPhotoFile, setCallPhotoFile] = useState<File | null>(null);
  const [callPhotoPreview, setCallPhotoPreview] = useState<string | null>(null);

  const [cameraReviewForm, setCameraReviewForm] = useState({
    review_number: 1 as 1 | 2 | 3,
    scheduled_time: '',
    actual_time: '',
    screenshot_url: '',
    cameras_reviewed: [] as string[],
    notes: '',
    non_conformity: false,
    non_conformity_description: ''
  });
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Refs para evitar loops infinitos
  const currentShiftIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);

  // Cargar datos
  useEffect(() => {
    loadShifts();
  }, [dateFrom, dateTo, filterUnitId, filterStatus]);

  // Cargar datos del turno cuando cambia el ID (no el objeto completo)
  useEffect(() => {
    if (currentShift && currentShift.id !== currentShiftIdRef.current && !isLoadingRef.current) {
      currentShiftIdRef.current = currentShift.id;
      isLoadingRef.current = true;
      loadShiftData(currentShift.id).finally(() => {
        isLoadingRef.current = false;
      });
    }
  }, [currentShift?.id]); // Solo dependemos del ID, no del objeto completo

  const loadShifts = async () => {
    if (isLoadingRef.current) return; // Evitar múltiples cargas simultáneas
    
    setLoading(true);
    try {
      const filters: any = {
        dateFrom,
        dateTo,
      };
      if (filterUnitId !== 'all') {
        filters.unitId = filterUnitId;
      }
      if (filterStatus !== 'all') {
        filters.status = filterStatus;
      }
      const data = await nightSupervisionService.getAllShifts(filters);
      setShifts(data);
      
      // Buscar turno del día actual
      const today = new Date().toISOString().split('T')[0];
      const todayShiftData = data.find(s => s.date === today);
      if (todayShiftData) {
        setTodayShift(todayShiftData);
        // Si no hay turno actual seleccionado o el turno actual no es el del día, seleccionar el del día
        if (!currentShift || currentShift.id !== todayShiftData.id) {
          // Solo actualizar si realmente cambió
          if (currentShiftIdRef.current !== todayShiftData.id) {
            setCurrentShift(todayShiftData);
            currentShiftIdRef.current = todayShiftData.id;
            setActiveView('current');
          }
        }
      } else {
        setTodayShift(null);
      }
    } catch (error) {
      console.error('Error cargando turnos:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadShiftData = async (shiftId: string) => {
    setLoading(true);
    try {
      const [callsData, reviewsData, alertsData] = await Promise.all([
        nightSupervisionService.getCallsByShiftId(shiftId),
        nightSupervisionService.getCameraReviewsByShiftId(shiftId),
        nightSupervisionService.getAlertsByShiftId(shiftId, false)
      ]);
      setCalls(callsData);
      setCameraReviews(reviewsData);
      setAlerts(alertsData);
      
      // Actualizar completitud del turno
      await nightSupervisionService.updateShiftCompletion(shiftId);
      const updatedShift = await nightSupervisionService.getShiftById(shiftId);
      if (updatedShift) {
        setCurrentShift(updatedShift);
      }
    } catch (error) {
      console.error('Error cargando datos del turno:', error);
    } finally {
      setLoading(false);
    }
  };

  // Obtener trabajadores nocturnos de una unidad
  const getNightWorkers = (unitId: string): Resource[] => {
    const unit = units.find(u => u.id === unitId);
    if (!unit) return [];
    
    // Buscar trabajadores con turno nocturno (flexible con diferentes valores)
    const nightShiftVariants = ['Night', 'Nocturno', 'Nocturna', 'night', 'nocturno', 'Noche', 'noche'];
    
    return unit.resources.filter(r => {
      if (r.type !== ResourceType.PERSONNEL) return false;
      if (r.archived) return false;
      if (r.personnelStatus === 'cesado') return false;
      
      // Verificar si el turno asignado es nocturno
      const shift = r.assignedShift?.toLowerCase() || '';
      return nightShiftVariants.some(variant => 
        shift.includes(variant.toLowerCase()) || 
        shift === variant.toLowerCase()
      );
    });
  };

  // Obtener información del supervisor actual
  const getSupervisorInfo = () => {
    // Buscar si el usuario actual está en management_staff
    const staffMember = managementStaff.find(s => s.id === currentUser.id);
    if (staffMember) {
      return {
        id: staffMember.id,
        name: staffMember.name
      };
    }
    // Si no está en management_staff, usar la información del usuario
    return {
      id: currentUser.id,
      name: currentUser.name
    };
  };

  // Crear nuevo turno
  const handleCreateShift = async () => {
    if (!shiftForm.unit_id) {
      alert('Por favor seleccione una unidad');
      return;
    }

    if (!currentUser || !currentUser.id) {
      alert('Error: No se pudo identificar al usuario actual');
      return;
    }

    const unit = units.find(u => u.id === shiftForm.unit_id);
    if (!unit) return;

    setLoading(true);
    try {
      // Obtener información del supervisor automáticamente
      const supervisorInfo = getSupervisorInfo();

      // Verificar si ya existe un turno para esta fecha EXACTA, unidad y supervisor
      // Normalizar la fecha para comparación (solo la parte de fecha, sin hora)
      const normalizedDate = shiftForm.date.split('T')[0]; // Asegurar formato YYYY-MM-DD
      
      
      // Buscar turnos de la fecha exacta, unidad y supervisor
      const existingShifts = await nightSupervisionService.getAllShifts({
        dateFrom: normalizedDate,
        dateTo: normalizedDate,
        unitId: shiftForm.unit_id,
        supervisorId: supervisorInfo.id, // Filtrar también por supervisor
      });


      // Verificar que realmente sea de la misma fecha (doble verificación)
      // Normalizar todas las fechas para comparación exacta
      const existingShift = existingShifts.find(s => {
        // Normalizar fecha del turno existente
        const shiftDateStr = typeof s.date === 'string' ? s.date : s.date.toString();
        const shiftDateNormalized = shiftDateStr.split('T')[0].split(' ')[0]; // Remover hora si existe
        
        // Comparar fechas normalizadas
        const datesMatch = shiftDateNormalized === normalizedDate;
        
        // Verificar también unidad y supervisor
        const unitMatches = s.unit_id === shiftForm.unit_id;
        const supervisorMatches = s.supervisor_id === supervisorInfo.id;
        
          unidadCoincide: unitMatches,
          supervisorCoincide: supervisorMatches,
          resultado: datesMatch && unitMatches && supervisorMatches
        });
        
        return datesMatch && unitMatches && supervisorMatches;
      });

      if (existingShift) {
        // Verificación final: asegurar que las fechas coincidan exactamente
        const existingDateStr = typeof existingShift.date === 'string' ? existingShift.date : existingShift.date.toString();
        const existingDateNormalized = existingDateStr.split('T')[0].split(' ')[0];
        
        
        // Solo mostrar el mensaje si las fechas coinciden EXACTAMENTE
        if (existingDateNormalized === normalizedDate) {
          // Formatear fecha de forma segura para evitar problemas de zona horaria
          const existingDateObj = new Date(existingShift.date + 'T00:00:00'); // Agregar hora para evitar problemas de zona horaria
          const existingDateFormatted = existingDateObj.toLocaleDateString('es-PE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          
          const newDateObj = new Date(shiftForm.date + 'T00:00:00');
          const newDateFormatted = new Date(shiftForm.date + 'T00:00:00').toLocaleDateString('es-PE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          
          
          // Mostrar información detallada del turno existente
          const existingShiftCreatedAt = existingShift.created_at 
            ? new Date(existingShift.created_at).toLocaleString('es-PE', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })
            : 'Fecha desconocida';
          
          // Obtener la fecha del turno existente directamente de la base de datos para verificar
          const existingShiftFromDB = await nightSupervisionService.getShiftById(existingShift.id);
          const actualExistingDate = existingShiftFromDB?.date 
            ? (typeof existingShiftFromDB.date === 'string' 
                ? existingShiftFromDB.date.split('T')[0] 
                : existingShiftFromDB.date.toString().split('T')[0])
            : existingDateNormalized;
          
          
          // Verificar si las fechas realmente coinciden (comparación estricta)
          const datesActuallyMatch = actualExistingDate === normalizedDate;
          
          });
          
          if (!datesActuallyMatch) {
            // Las fechas NO coinciden realmente, continuar con la creación sin mostrar mensaje
            // Continuar con la creación del nuevo turno (no retornar)
          } else {
            // Las fechas SÍ coinciden EXACTAMENTE, mostrar mensaje simple
            const userWantsToOpen = confirm(
              `Ya existe un turno de supervisión para ${unit.name} el ${existingDateFormatted}.\n\n` +
              `¿Desea abrir el turno existente?\n\n` +
              `(Si hace clic en "Cancelar", puede eliminar el turno existente desde la lista de turnos y crear uno nuevo)`
            );
            
            if (userWantsToOpen) {
              // Abrir el turno existente
              setCurrentShift(existingShift);
              setActiveView('current');
              await loadShiftData(existingShift.id);
              setShowShiftModal(false);
              setLoading(false);
              return;
            } else {
              // El usuario canceló, permitirle cambiar la fecha o eliminar el turno desde la lista
              setLoading(false);
              alert(`Puede:\n\n` +
                `1. Cambiar la fecha en el formulario y crear un nuevo turno\n` +
                `2. Ir a la lista de turnos y eliminar el turno existente del ${existingDateFormatted}\n` +
                `3. Abrir el turno existente desde la lista de turnos`);
              return;
            }
          }
        } else {
        }
        // Si las fechas NO coinciden, continuar con la creación del nuevo turno (no mostrar mensaje)
      } else {
      }

      // Asegurar que la fecha esté en formato correcto (YYYY-MM-DD)
      let dateToSave = shiftForm.date.split('T')[0]; // Normalizar fecha
      
      // Validar que la fecha sea válida y esté en formato correcto
      const dateMatch = dateToSave.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!dateMatch) {
        alert(`Error: La fecha ingresada no tiene el formato correcto (YYYY-MM-DD).\n\nFecha recibida: ${shiftForm.date}`);
        setLoading(false);
        return;
      }
      
      // Verificar que la fecha sea razonable (no en el pasado lejano ni futuro lejano)
      const dateObj = new Date(dateToSave + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dateObjNormalized = new Date(dateObj);
      dateObjNormalized.setHours(0, 0, 0, 0);
      
      // Obtener fecha de hoy usando la misma función que el formulario
      const todayDateStr = getTodayDate();
      
      
      // Advertencia si la fecha no es hoy (pero permitir continuar)
      if (dateToSave !== todayDateStr) {
        const daysDiff = Math.round((dateObjNormalized.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const confirmMessage = `Está creando un turno para el ${dateObj.toLocaleDateString('es-PE')}, que es ${Math.abs(daysDiff)} día(s) ${daysDiff > 0 ? 'en el futuro' : 'en el pasado'}.\n\nHoy es: ${today.toLocaleDateString('es-PE')}\n\n¿Está seguro de que desea continuar?`;
        if (!confirm(confirmMessage)) {
          setLoading(false);
          return;
        }
      }


      const newShift = await nightSupervisionService.createShift({
        date: dateToSave, // Usar fecha normalizada (YYYY-MM-DD)
        unit_id: shiftForm.unit_id,
        unit_name: unit.name,
        supervisor_id: supervisorInfo.id,
        supervisor_name: supervisorInfo.name,
        shift_start: shiftForm.shift_start,
        shift_end: shiftForm.shift_end,
        status: 'en_curso',
        completion_percentage: 0,
        notes: shiftForm.notes || undefined,
        created_by: currentUser.id,
      });


      // Crear llamadas programadas para cada trabajador nocturno
      const workers = getNightWorkers(shiftForm.unit_id);
      const callTimes = ['23:00', '02:00', '05:00']; // Horas programadas para las 3 llamadas

      for (const worker of workers) {
        for (let i = 0; i < 3; i++) {
          await nightSupervisionService.createCall({
            shift_id: newShift.id,
            worker_id: worker.id,
            worker_name: worker.name,
            worker_phone: '', // TODO: Obtener del recurso
            call_number: (i + 1) as 1 | 2 | 3,
            scheduled_time: callTimes[i],
            answered: false,
            photo_received: false,
            created_by: currentUser.id,
          });
        }
      }

      // Crear revisiones de cámaras programadas (solo si no existen)
      // No crear revisiones vacías automáticamente - el supervisor las creará cuando las complete
      // Esto evita errores y permite que el supervisor tenga control total sobre cuándo crear las revisiones

      await loadShifts();
      setShowShiftModal(false);
      setShiftForm({
        date: getTodayDate(), // Usar función explícita para asegurar fecha correcta
        unit_id: '',
        shift_start: '22:00',
        shift_end: '06:00',
        notes: ''
      });
    } catch (error) {
      console.error('Error creando turno:', error);
      alert('Error al crear el turno');
    } finally {
      setLoading(false);
    }
  };

  // Manejar selección de foto para llamada
  const handleCallPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (file) {
        // Validar que sea una imagen
        if (!file.type.startsWith('image/')) {
          alert('Por favor seleccione un archivo de imagen');
          e.target.value = ''; // Limpiar el input
          return;
        }
        // Validar tamaño (máx 10MB)
        if (file.size > 10 * 1024 * 1024) {
          alert('El archivo es demasiado grande. Máximo 10MB');
          e.target.value = ''; // Limpiar el input
          return;
        }
        setCallPhotoFile(file);
        const previewUrl = URL.createObjectURL(file);
        setCallPhotoPreview(previewUrl);
        setCallForm({ ...callForm, photo_received: true });
      }
    } catch (error) {
      console.error('Error seleccionando foto:', error);
      alert('Error al seleccionar la foto');
    }
  };

  // Manejar selección de screenshot para revisión de cámaras
  const handleScreenshotSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0];
      if (file) {
        // Validar que sea una imagen
        if (!file.type.startsWith('image/')) {
          alert('Por favor seleccione un archivo de imagen');
          e.target.value = ''; // Limpiar el input
          return;
        }
        // Validar tamaño (máx 10MB)
        if (file.size > 10 * 1024 * 1024) {
          alert('El archivo es demasiado grande. Máximo 10MB');
          e.target.value = ''; // Limpiar el input
          return;
        }
        setScreenshotFile(file);
        const previewUrl = URL.createObjectURL(file);
        setScreenshotPreview(previewUrl);
      }
    } catch (error) {
      console.error('Error seleccionando screenshot:', error);
      alert('Error al seleccionar el screenshot');
    }
  };

  // Actualizar llamada
  const handleUpdateCall = async () => {
    if (!editingCall) return;

    setLoading(true);
    setUploadingPhoto(true);
    try {
      let photoUrl = callForm.photo_url;

      // Si hay un archivo nuevo, subirlo primero
      if (callPhotoFile) {
        try {
          const fileName = storageService.generateUniqueFileName(
            callPhotoFile.name,
            `call-${editingCall.shift_id}-${editingCall.worker_id}`
          );
          const date = new Date().toISOString().split('T')[0];
          const path = `calls/${date}/${fileName}`;
          photoUrl = await storageService.uploadFile('night-supervision-photos', callPhotoFile, path);
        } catch (error) {
          console.error('Error subiendo foto:', error);
          alert('Error al subir la foto. Por favor intente nuevamente.');
          setLoading(false);
          setUploadingPhoto(false);
          return;
        }
      }

      await nightSupervisionService.updateCall(editingCall.id, {
        actual_time: callForm.actual_time || undefined,
        answered: callForm.answered,
        photo_received: callForm.photo_received,
        photo_url: photoUrl || undefined,
        notes: callForm.notes || undefined,
        non_conformity: callForm.non_conformity,
        non_conformity_description: callForm.non_conformity_description || undefined,
        updated_by: currentUser.id,
      });

      // Verificar y crear alertas automáticamente si es necesario
      const existingAlerts = await nightSupervisionService.getAlertsByShiftId(editingCall.shift_id, true);
      
      // Alerta por llamada no contestada
      if (!callForm.answered) {
        const existingAlert = existingAlerts.find(a => 
          a.type === 'missing_call' && 
          a.related_entity_id === editingCall.id &&
          !a.resolved
        );
        if (!existingAlert) {
          await nightSupervisionService.createAlert({
            shift_id: editingCall.shift_id,
            type: 'missing_call',
            severity: 'high',
            title: `Llamada no contestada - ${editingCall.worker_name}`,
            description: `El trabajador ${editingCall.worker_name} no contestó la llamada ${editingCall.call_number} programada para las ${editingCall.scheduled_time}`,
            related_entity_type: 'call',
            related_entity_id: editingCall.id,
          });
        }
      } else {
        // Resolver alerta si la llamada fue contestada
        const alertToResolve = existingAlerts.find(a => 
          a.type === 'missing_call' && 
          a.related_entity_id === editingCall.id &&
          !a.resolved
        );
        if (alertToResolve && currentUser.id) {
          await nightSupervisionService.resolveAlert(alertToResolve.id, currentUser.id);
        }
      }

      // Alerta por foto no recibida
      if (!callForm.photo_received) {
        const existingAlert = existingAlerts.find(a => 
          a.type === 'missing_photo' && 
          a.related_entity_id === editingCall.id &&
          !a.resolved
        );
        if (!existingAlert) {
          await nightSupervisionService.createAlert({
            shift_id: editingCall.shift_id,
            type: 'missing_photo',
            severity: 'medium',
            title: `Foto no recibida - ${editingCall.worker_name}`,
            description: `No se recibió la foto del trabajador ${editingCall.worker_name} para la llamada ${editingCall.call_number}`,
            related_entity_type: 'call',
            related_entity_id: editingCall.id,
          });
        }
      } else {
        // Resolver alerta si la foto fue recibida
        const alertToResolve = existingAlerts.find(a => 
          a.type === 'missing_photo' && 
          a.related_entity_id === editingCall.id &&
          !a.resolved
        );
        if (alertToResolve && currentUser.id) {
          await nightSupervisionService.resolveAlert(alertToResolve.id, currentUser.id);
        }
      }

      // Alerta por no conformidad
      if (callForm.non_conformity) {
        const existingAlert = existingAlerts.find(a => 
          a.type === 'non_conformity' && 
          a.related_entity_id === editingCall.id &&
          !a.resolved
        );
        if (!existingAlert) {
          await nightSupervisionService.createAlert({
            shift_id: editingCall.shift_id,
            type: 'non_conformity',
            severity: callForm.non_conformity_description?.toLowerCase().includes('crítico') ? 'critical' : 'high',
            title: `No conformidad - ${editingCall.worker_name}`,
            description: callForm.non_conformity_description || `No conformidad detectada en la llamada ${editingCall.call_number} del trabajador ${editingCall.worker_name}`,
            related_entity_type: 'call',
            related_entity_id: editingCall.id,
          });
        }
      }

      if (currentShift) {
        await loadShiftData(currentShift.id);
      }
      setShowCallModal(false);
      setEditingCall(null);
      setCallPhotoFile(null);
      setCallPhotoPreview(null);
    } catch (error) {
      console.error('Error actualizando llamada:', error);
      alert('Error al actualizar la llamada');
    } finally {
      setLoading(false);
      setUploadingPhoto(false);
    }
  };

  // Actualizar revisión de cámaras
  const handleUpdateCameraReview = async () => {
    if (!editingCameraReview) return;

    setLoading(true);
    setUploadingPhoto(true);
    try {
      let screenshotUrl = cameraReviewForm.screenshot_url;

      // Si hay un archivo nuevo, subirlo primero
      if (screenshotFile) {
        try {
          const fileName = storageService.generateUniqueFileName(
            screenshotFile.name,
            `review-${editingCameraReview.shift_id}-${editingCameraReview.review_number}`
          );
          const date = new Date().toISOString().split('T')[0];
          const path = `camera-reviews/${date}/${fileName}`;
          screenshotUrl = await storageService.uploadFile('night-supervision-photos', screenshotFile, path);
        } catch (error: any) {
          console.error('Error subiendo screenshot:', error);
          const errorMessage = error?.message || 'Error desconocido al subir el screenshot';
          if (errorMessage.includes('Bucket not found') || errorMessage.includes('no existe')) {
            alert(`⚠️ El bucket de almacenamiento no está configurado.\n\nPor favor, crea el bucket "night-supervision-photos" en Supabase Storage.\n\nConsulta el archivo STORAGE_SETUP.md para instrucciones detalladas.`);
          } else {
            alert(`Error al subir el screenshot: ${errorMessage}`);
          }
          setLoading(false);
          setUploadingPhoto(false);
          return;
        }
      }

      await nightSupervisionService.updateCameraReview(editingCameraReview.id, {
        actual_time: cameraReviewForm.actual_time || undefined,
        screenshot_url: screenshotUrl,
        cameras_reviewed: cameraReviewForm.cameras_reviewed,
        notes: cameraReviewForm.notes || undefined,
        non_conformity: cameraReviewForm.non_conformity,
        non_conformity_description: cameraReviewForm.non_conformity_description || undefined,
        updated_by: currentUser.id,
      });

      // Verificar y crear alertas automáticamente
      if (currentShift) {
        const existingAlerts = await nightSupervisionService.getAlertsByShiftId(currentShift.id, true);
        
        // Alerta por revisión faltante
        if (!cameraReviewForm.screenshot_url) {
          const existingAlert = existingAlerts.find(a => 
            a.type === 'missing_camera_review' && 
            a.related_entity_id === editingCameraReview.id &&
            !a.resolved
          );
          if (!existingAlert) {
            await nightSupervisionService.createAlert({
              shift_id: currentShift.id,
              type: 'missing_camera_review',
              severity: 'high',
              title: `Revisión de cámaras faltante - Revisión #${editingCameraReview.review_number}`,
              description: `No se ha cargado el screenshot de la revisión #${editingCameraReview.review_number} programada para las ${editingCameraReview.scheduled_time}`,
              related_entity_type: 'camera_review',
              related_entity_id: editingCameraReview.id,
            });
          }
        } else {
          // Resolver alerta si la revisión fue completada
          const alertToResolve = existingAlerts.find(a => 
            a.type === 'missing_camera_review' && 
            a.related_entity_id === editingCameraReview.id &&
            !a.resolved
          );
          if (alertToResolve && currentUser.id) {
            await nightSupervisionService.resolveAlert(alertToResolve.id, currentUser.id);
          }
        }

        // Alerta por no conformidad en revisión
        if (cameraReviewForm.non_conformity) {
          const existingAlert = existingAlerts.find(a => 
            a.type === 'non_conformity' && 
            a.related_entity_id === editingCameraReview.id &&
            !a.resolved
          );
          if (!existingAlert) {
            await nightSupervisionService.createAlert({
              shift_id: currentShift.id,
              type: 'non_conformity',
              severity: cameraReviewForm.non_conformity_description?.toLowerCase().includes('crítico') ? 'critical' : 'high',
              title: `No conformidad en revisión de cámaras - Revisión #${editingCameraReview.review_number}`,
              description: cameraReviewForm.non_conformity_description || `No conformidad detectada en la revisión #${editingCameraReview.review_number}`,
              related_entity_type: 'camera_review',
              related_entity_id: editingCameraReview.id,
            });
          }
        }

        await loadShiftData(currentShift.id);
      }
      setShowCameraReviewModal(false);
      setEditingCameraReview(null);
      setScreenshotFile(null);
      setScreenshotPreview(null);
    } catch (error) {
      console.error('Error actualizando revisión:', error);
      alert('Error al actualizar la revisión');
    } finally {
      setLoading(false);
      setUploadingPhoto(false);
    }
  };

  // Abrir modal para editar llamada
  const openCallModal = (call: NightSupervisionCall) => {
    try {
      if (!call) {
        console.error('Call is null or undefined');
        return;
      }
      setEditingCall(call);
      setCallForm({
        worker_id: call.worker_id || '',
        call_number: call.call_number || 1,
        scheduled_time: call.scheduled_time || '',
        actual_time: call.actual_time || '',
        answered: call.answered || false,
        photo_received: call.photo_received || false,
        photo_url: call.photo_url || '',
        notes: call.notes || '',
        non_conformity: call.non_conformity || false,
        non_conformity_description: call.non_conformity_description || ''
      });
      setCallPhotoFile(null);
      setCallPhotoPreview(call.photo_url || null);
      setShowCallModal(true);
    } catch (error) {
      console.error('Error abriendo modal de llamada:', error);
      alert('Error al abrir el modal de edición');
    }
  };

  // Abrir modal para editar revisión de cámaras
  const openCameraReviewModal = (review: NightSupervisionCameraReview) => {
    setEditingCameraReview(review);
    setCameraReviewForm({
      review_number: review.review_number,
      scheduled_time: review.scheduled_time,
      actual_time: review.actual_time || '',
      screenshot_url: review.screenshot_url,
      cameras_reviewed: review.cameras_reviewed,
      notes: review.notes || '',
      non_conformity: review.non_conformity,
      non_conformity_description: review.non_conformity_description || ''
    });
    setScreenshotFile(null);
    setScreenshotPreview(review.screenshot_url || null);
    setShowCameraReviewModal(true);
  };

  // Generar reporte PDF
  const handleGeneratePDF = async (shiftId: string) => {
    setLoading(true);
    try {
      const report = await nightSupervisionService.getReportByShiftId(shiftId);
      if (!report) {
        alert('No se pudo generar el reporte');
        return;
      }

      // No incluir fotos de trabajadores según requerimiento
      const blob = await nightSupervisionPdfService.generateReportPDF(report);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Reporte_Supervision_Nocturna_${report.date}_${report.unit_name.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generando PDF:', error);
      alert('Error al generar el PDF');
    } finally {
      setLoading(false);
    }
  };

  // Exportar reporte a Excel
  const handleExportExcel = async (shiftId: string) => {
    setLoading(true);
    try {
      const report = await nightSupervisionService.getReportByShiftId(shiftId);
      if (!report) {
        alert('No se pudo generar el reporte');
        return;
      }

      // Preparar datos para Excel
      const sheets = [
        {
          name: 'Resumen',
          headers: ['Métrica', 'Valor'],
          data: [
            { Métrica: 'Fecha', Valor: report.date },
            { Métrica: 'Unidad', Valor: report.unit_name },
            { Métrica: 'Supervisor', Valor: report.supervisor_name },
            { Métrica: 'Trabajadores Supervisados', Valor: report.total_workers },
            { Métrica: 'Llamadas Requeridas', Valor: report.total_calls_required },
            { Métrica: 'Llamadas Completadas', Valor: report.total_calls_completed },
            { Métrica: 'Llamadas Contestadas', Valor: report.total_calls_answered },
            { Métrica: 'Fotos Recibidas', Valor: report.total_photos_received },
            { Métrica: 'Revisiones Requeridas', Valor: report.total_camera_reviews_required },
            { Métrica: 'Revisiones Completadas', Valor: report.total_camera_reviews_completed },
            { Métrica: 'No Conformidades', Valor: report.non_conformities_count },
            { Métrica: 'Eventos Críticos', Valor: report.critical_events_count },
            { Métrica: 'Completitud', Valor: `${report.completion_percentage}%` },
          ],
        },
        {
          name: 'Llamadas',
          headers: ['Trabajador', 'Llamada', 'Programada', 'Real', 'Contestó', 'Foto', 'No Conformidad', 'Observaciones'],
          data: report.calls.map(call => ({
            Trabajador: call.worker_name,
            Llamada: `#${call.call_number}`,
            Programada: call.scheduled_time,
            Real: call.actual_time || 'N/A',
            Contestó: call.answered ? 'Sí' : 'No',
            Foto: call.photo_received ? 'Sí' : 'No',
            'No Conformidad': call.non_conformity ? 'Sí' : 'No',
            Observaciones: call.notes || '',
          })),
        },
        {
          name: 'Revisiones Cámaras',
          headers: ['Revisión', 'Programada', 'Real', 'Cámaras', 'Screenshot URL', 'No Conformidad', 'Descripción No Conformidad', 'Observaciones'],
          data: report.camera_reviews.map(review => ({
            Revisión: `#${review.review_number}`,
            Programada: review.scheduled_time,
            Real: review.actual_time || 'N/A',
            Cámaras: review.cameras_reviewed.length > 0 ? review.cameras_reviewed.join(', ') : 'N/A',
            'Screenshot URL': review.screenshot_url || 'N/A',
            'No Conformidad': review.non_conformity ? 'Sí' : 'No',
            'Descripción No Conformidad': review.non_conformity_description || '',
            Observaciones: review.notes || '',
          })),
        },
        {
          name: 'Detalle Completo Llamadas',
          headers: ['Trabajador', 'Llamada', 'Programada', 'Real', 'Contestó', 'Foto Recibida', 'Foto URL', 'En Descanso', 'No Conformidad', 'Descripción No Conformidad', 'Observaciones'],
          data: report.calls.map(call => ({
            Trabajador: call.worker_name,
            Llamada: `#${call.call_number}`,
            Programada: call.scheduled_time,
            Real: call.actual_time || 'N/A',
            Contestó: call.answered ? 'Sí' : 'No',
            'Foto Recibida': call.photo_received ? 'Sí' : 'No',
            'Foto URL': call.photo_url || 'N/A',
            'En Descanso': call.on_rest ? 'Sí' : 'No',
            'No Conformidad': call.non_conformity ? 'Sí' : 'No',
            'Descripción No Conformidad': call.non_conformity_description || '',
            Observaciones: call.notes || '',
          })),
        },
        {
          name: 'Alertas',
          headers: ['Tipo', 'Severidad', 'Título', 'Descripción', 'Resuelta', 'Fecha Resolución'],
          data: report.alerts.map(alert => ({
            Tipo: alert.type,
            Severidad: alert.severity,
            Título: alert.title,
            Descripción: alert.description,
            Resuelta: alert.resolved ? 'Sí' : 'No',
            'Fecha Resolución': alert.resolved_at ? new Date(alert.resolved_at).toLocaleString('es-PE') : 'N/A',
          })),
        },
      ];

      await excelService.exportMultipleSheets(
        sheets,
        `Reporte_Supervision_Nocturna_${report.date}_${report.unit_name.replace(/\s+/g, '_')}.xlsx`
      );
    } catch (error) {
      console.error('Error exportando a Excel:', error);
      alert('Error al exportar a Excel');
    } finally {
      setLoading(false);
    }
  };

  // Filtrar turnos
  const filteredShifts = shifts.filter(shift => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        shift.unit_name.toLowerCase().includes(searchLower) ||
        shift.supervisor_name.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  // Obtener estadísticas del turno actual
  const getShiftStats = (shift: NightSupervisionShift) => {
    // Esto se calculará cuando se carguen los datos del turno
    return {
      totalCalls: 0,
      answeredCalls: 0,
      photosReceived: 0,
      cameraReviews: 0,
      alerts: 0
    };
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Moon className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Supervisión Nocturna</h1>
            <p className="text-gray-600">Control y monitoreo de supervisión nocturna</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowShiftModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Nuevo Turno
          </button>
        </div>
      </div>

      {/* Turno del Día - Destacado */}
      {todayShift && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl shadow-lg p-6 border-2 border-blue-500">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex-1 min-w-[300px]">
              <div className="flex items-center gap-3 mb-3">
                <Clock className="w-6 h-6" />
                <h2 className="text-2xl font-bold">Turno de Hoy</h2>
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium">
                  {formatDateFull(todayShift.date)}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-blue-100 text-sm mb-1">Unidad</p>
                  <p className="text-lg font-semibold">{todayShift.unit_name}</p>
                </div>
                <div>
                  <p className="text-blue-100 text-sm mb-1">Supervisor</p>
                  <p className="text-lg font-semibold">{todayShift.supervisor_name}</p>
                </div>
                <div>
                  <p className="text-blue-100 text-sm mb-1">Completitud</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-white/20 rounded-full h-3">
                      <div
                        className="bg-white h-3 rounded-full transition-all"
                        style={{ width: `${todayShift.completion_percentage}%` }}
                      />
                    </div>
                    <span className="text-lg font-bold">{todayShift.completion_percentage}%</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-shrink-0">
              <button
                onClick={() => {
                  setCurrentShift(todayShift);
                  setActiveView('current');
                  loadShiftData(todayShift.id);
                }}
                className="px-6 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors shadow-lg flex items-center gap-2"
              >
                <Eye className="w-5 h-5" />
                Ver Detalle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveView('shifts')}
          className={`px-4 py-2 font-medium ${
            activeView === 'shifts'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Turnos
        </button>
        {currentShift && (
          <button
            onClick={() => setActiveView('current')}
            className={`px-4 py-2 font-medium ${
              activeView === 'current'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Turno Actual
          </button>
        )}
        <button
          onClick={() => setActiveView('reports')}
          className={`px-4 py-2 font-medium ${
            activeView === 'reports'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Reportes
        </button>
        <button
          onClick={() => setActiveView('historical')}
          className={`px-4 py-2 font-medium ${
            activeView === 'historical'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Reportes Históricos
        </button>
      </div>

      {/* Filtros */}
      {activeView === 'shifts' && (
        <div className="bg-white p-4 rounded-lg shadow-sm border flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
            <select
              value={filterUnitId}
              onChange={(e) => setFilterUnitId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="all">Todas</option>
              {units.map(unit => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="all">Todos</option>
              <option value="en_curso">En Curso</option>
              <option value="completada">Completada</option>
              <option value="incompleta">Incompleta</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-10 pr-3 py-2 border rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Contenido según vista activa */}
      {activeView === 'shifts' && (
        <div className="bg-white rounded-lg shadow-sm border">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Cargando...</div>
          ) : filteredShifts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No hay turnos registrados</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Fecha</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Unidad</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Supervisor</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Horario</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Completitud</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Estado</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredShifts.map(shift => (
                    <tr key={shift.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{formatDateFromString(shift.date)}</td>
                      <td className="px-4 py-3 text-sm">{shift.unit_name}</td>
                      <td className="px-4 py-3 text-sm">{shift.supervisor_name}</td>
                      <td className="px-4 py-3 text-sm">{shift.shift_start} - {shift.shift_end}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${shift.completion_percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-600">{shift.completion_percentage}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          shift.status === 'completada' ? 'bg-green-100 text-green-800' :
                          shift.status === 'en_curso' ? 'bg-blue-100 text-blue-800' :
                          shift.status === 'incompleta' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {shift.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setCurrentShift(shift);
                              setActiveView('current');
                            }}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Ver
                          </button>
                          <button
                            onClick={async () => {
                              const shiftDate = formatDateFromString(shift.date);
                              const confirmDelete = confirm(
                                `¿Está seguro de que desea eliminar el turno del ${shiftDate}?\n\n` +
                                `Esta acción eliminará:\n` +
                                `- El turno y todos sus datos\n` +
                                `- Todas las llamadas registradas\n` +
                                `- Todas las revisiones de cámaras\n` +
                                `- Todas las alertas\n\n` +
                                `Esta acción NO se puede deshacer.`
                              );
                              
                              if (confirmDelete) {
                                try {
                                  setLoading(true);
                                  await nightSupervisionService.deleteShift(shift.id);
                                  await loadShifts();
                                  alert('✅ Turno eliminado exitosamente');
                                } catch (error: any) {
                                  console.error('Error eliminando turno:', error);
                                  alert(`Error al eliminar el turno: ${error.message || 'Error desconocido'}`);
                                } finally {
                                  setLoading(false);
                                }
                              }
                            }}
                            className="text-red-600 hover:text-red-800"
                            title="Eliminar turno"
                          >
                            Eliminar
                          </button>
                          <button
                            onClick={() => handleGeneratePDF(shift.id)}
                            className="text-gray-600 hover:text-gray-800"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeView === 'current' && currentShift && (
        <div className="space-y-6">
          {/* Información del turno */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Turno del {formatDateFromString(currentShift.date)}</h2>
                <p className="text-gray-600">{currentShift.unit_name} - {currentShift.supervisor_name}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-gray-600">Completitud</div>
                  <div className="text-2xl font-bold text-blue-600">{currentShift.completion_percentage}%</div>
                </div>
                <button
                  onClick={() => handleGeneratePDF(currentShift.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Download className="w-4 h-4" />
                  Generar PDF
                </button>
              </div>
            </div>
          </div>

          {/* Alertas */}
          {alerts.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Alertas ({alerts.length})
              </h3>
              <div className="space-y-2">
                {alerts.map(alert => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border-l-4 ${
                      alert.severity === 'critical' ? 'bg-red-50 border-red-500' :
                      alert.severity === 'high' ? 'bg-orange-50 border-orange-500' :
                      alert.severity === 'medium' ? 'bg-yellow-50 border-yellow-500' :
                      'bg-blue-50 border-blue-500'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{alert.title}</div>
                        <div className="text-sm text-gray-600 mt-1">{alert.description}</div>
                      </div>
                      <button
                        onClick={async () => {
                          if (currentUser.id) {
                            await nightSupervisionService.resolveAlert(alert.id, currentUser.id);
                            await loadShiftData(currentShift.id);
                          }
                        }}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Resolver
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Llamadas */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-600" />
                Llamadas a Trabajadores ({calls.length})
              </h3>
              {currentShift && (
                <button
                  onClick={() => {
                    // Obtener trabajadores nocturnos de la unidad del turno
                    const workers = getNightWorkers(currentShift.unit_id);
                    if (workers.length === 0) {
                      alert('No hay trabajadores nocturnos registrados en esta unidad');
                      return;
                    }
                    // Abrir modal para crear nueva llamada
                    setEditingCall(null);
                    setCallForm({
                      worker_id: '',
                      call_number: 1,
                      scheduled_time: '',
                      actual_time: '',
                      answered: false,
                      photo_received: false,
                      photo_url: '',
                      notes: '',
                      non_conformity: false,
                      non_conformity_description: ''
                    });
                    setCallPhotoFile(null);
                    setCallPhotoPreview(null);
                    setShowCallModal(true);
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Nueva Llamada
                </button>
              )}
            </div>
            {calls.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Phone className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <p>No hay llamadas registradas para este turno</p>
                {currentShift && (
                  <p className="text-sm mt-2">Las llamadas se crean automáticamente al crear el turno</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Trabajador</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Llamada</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Programada</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Contestó</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Foto</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {calls.map(call => (
                      <tr key={call.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{call.worker_name || 'Sin nombre'}</td>
                        <td className="px-4 py-3 text-sm">#{call.call_number}</td>
                        <td className="px-4 py-3 text-sm">{call.scheduled_time}</td>
                        <td className="px-4 py-3 text-sm">
                          {call.answered ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-600" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {call.photo_received ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-600" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => {
                              try {
                                openCallModal(call);
                              } catch (error) {
                                console.error('Error al abrir modal:', error);
                                alert('Error al abrir el modal de edición');
                              }
                            }}
                            className="text-blue-600 hover:text-blue-800"
                            disabled={loading}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Revisiones de Cámaras */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Camera className="w-5 h-5 text-blue-600" />
              Revisiones de Cámaras ({cameraReviews.length}/3)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(reviewNum => {
                const review = cameraReviews.find(r => r.review_number === reviewNum);
                return (
                  <div
                    key={reviewNum}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">Revisión #{reviewNum}</span>
                      {review ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                    {review ? (
                      <>
                        <div className="text-sm text-gray-600 mb-2">
                          Programada: {review.scheduled_time}
                        </div>
                        {review.screenshot_url && (
                          <div className="mb-2">
                            <img
                              src={review.screenshot_url}
                              alt={`Revisión ${reviewNum}`}
                              className="w-full h-32 object-cover rounded cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => {
                                setImageModalUrl(review.screenshot_url || null);
                                setShowImageModal(true);
                              }}
                              title="Click para ver en tamaño completo"
                            />
                            <button
                              onClick={() => {
                                setImageModalUrl(review.screenshot_url || null);
                                setShowImageModal(true);
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800 mt-1 flex items-center gap-1"
                            >
                              Ver foto completa
                            </button>
                          </div>
                        )}
                        <button
                          onClick={() => openCameraReviewModal(review)}
                          className="w-full mt-2 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Editar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          // Buscar si ya existe una revisión con este número (creada automáticamente)
                          const existingReview = cameraReviews.find(r => r.review_number === reviewNum);
                          
                          if (existingReview) {
                            // Si existe, abrir para editar
                            openCameraReviewModal(existingReview);
                          } else {
                            // Si no existe, crear nueva
                            setCameraReviewForm({
                              review_number: reviewNum as 1 | 2 | 3,
                              scheduled_time: ['23:00', '02:00', '05:00'][reviewNum - 1],
                              actual_time: '',
                              screenshot_url: '',
                              cameras_reviewed: [],
                              notes: '',
                              non_conformity: false,
                              non_conformity_description: ''
                            });
                            setEditingCameraReview(null);
                            setShowCameraReviewModal(true);
                          }
                        }}
                        className="w-full mt-2 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        {cameraReviews.find(r => r.review_number === reviewNum) ? 'Completar Revisión' : 'Agregar Revisión'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeView === 'reports' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Reportes Rápidos</h3>
            <p className="text-gray-600 mb-4">Seleccione un turno para generar reportes</p>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Fecha</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Unidad</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Supervisor</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Completitud</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredShifts.map(shift => (
                    <tr key={shift.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{formatDateFromString(shift.date)}</td>
                      <td className="px-4 py-3 text-sm">{shift.unit_name}</td>
                      <td className="px-4 py-3 text-sm">{shift.supervisor_name}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${shift.completion_percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-600">{shift.completion_percentage}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleGeneratePDF(shift.id)}
                            className="flex items-center gap-1 px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                            title="Generar PDF"
                          >
                            <FileText className="w-4 h-4" />
                            PDF
                          </button>
                          <button
                            onClick={() => handleExportExcel(shift.id)}
                            className="flex items-center gap-1 px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                            title="Exportar Excel"
                          >
                            <Download className="w-4 h-4" />
                            Excel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nuevo Turno */}
      {showShiftModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Nuevo Turno de Supervisión</h2>
              <button
                onClick={() => setShowShiftModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha del Turno *</label>
                <input
                  type="date"
                  value={shiftForm.date}
                  onChange={(e) => {
                    const selectedDate = e.target.value;
                    const today = new Date().toISOString().split('T')[0];
                    setShiftForm({ ...shiftForm, date: selectedDate });
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
                {shiftForm.date && (
                  <p className="text-xs text-gray-500 mt-1">
                    Fecha seleccionada: {new Date(shiftForm.date + 'T00:00:00').toLocaleDateString('es-PE', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
                <select
                  value={shiftForm.unit_id}
                  onChange={(e) => {
                    setShiftForm({ ...shiftForm, unit_id: e.target.value });
                    setWorkersOnRest(new Set()); // Reset trabajadores en descanso al cambiar unidad
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">Seleccionar unidad</option>
                  {units.map(unit => (
                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                  ))}
                </select>
              </div>
              {shiftForm.unit_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Trabajadores Nocturnos - Marcar en Descanso
                  </label>
                  <div className="border rounded-lg p-3 max-h-48 overflow-y-auto bg-gray-50">
                    {getNightWorkers(shiftForm.unit_id).length === 0 ? (
                      <p className="text-sm text-gray-500">No hay trabajadores nocturnos registrados en esta unidad</p>
                    ) : (
                      getNightWorkers(shiftForm.unit_id).map(worker => (
                        <label key={worker.id} className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={workersOnRest.has(worker.id)}
                            onChange={(e) => {
                              const newSet = new Set(workersOnRest);
                              if (e.target.checked) {
                                newSet.add(worker.id);
                              } else {
                                newSet.delete(worker.id);
                              }
                              setWorkersOnRest(newSet);
                            }}
                            className="w-4 h-4"
                          />
                          <span className="text-sm text-gray-700">{worker.name}</span>
                          {workersOnRest.has(worker.id) && (
                            <span className="text-xs text-amber-600 font-medium">(Descanso)</span>
                          )}
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Los trabajadores marcados como "Descanso" no recibirán llamadas de supervisión este día.
                  </p>
                </div>
              )}
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor</label>
                <p className="text-sm text-gray-700 font-medium">
                  {getSupervisorInfo().name}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  (asignado automáticamente desde tu usuario)
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora Inicio</label>
                  <input
                    type="time"
                    value={shiftForm.shift_start}
                    onChange={(e) => setShiftForm({ ...shiftForm, shift_start: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora Fin</label>
                  <input
                    type="time"
                    value={shiftForm.shift_end}
                    onChange={(e) => setShiftForm({ ...shiftForm, shift_end: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea
                  value={shiftForm.notes}
                  onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowShiftModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateShift}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Crear Turno
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar/Crear Llamada */}
      {showCallModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {editingCall 
                  ? `Llamada #${editingCall.call_number} - ${editingCall.worker_name}`
                  : 'Nueva Llamada'}
              </h2>
              <button
                onClick={() => {
                  setShowCallModal(false);
                  setEditingCall(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              {!editingCall && currentShift && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Trabajador *</label>
                    <select
                      value={callForm.worker_id}
                      onChange={(e) => {
                        const workerId = e.target.value;
                        const worker = getNightWorkers(currentShift.unit_id).find(w => w.id === workerId);
                        setCallForm({ 
                          ...callForm, 
                          worker_id: workerId,
                          scheduled_time: callForm.scheduled_time || ''
                        });
                      }}
                      className="w-full px-3 py-2 border rounded-lg"
                      required
                    >
                      <option value="">Seleccionar trabajador</option>
                      {getNightWorkers(currentShift.unit_id).map(worker => (
                        <option key={worker.id} value={worker.id}>
                          {worker.name}
                        </option>
                      ))}
                    </select>
                    {getNightWorkers(currentShift.unit_id).length === 0 && (
                      <p className="text-sm text-red-600 mt-1">
                        No hay trabajadores nocturnos registrados en esta unidad
                      </p>
                    )}
                  </div>
                         <div>
                           <label className="block text-sm font-medium text-gray-700 mb-1">Número de Llamada *</label>
                           <select
                             value={callForm.call_number}
                             onChange={(e) => setCallForm({ ...callForm, call_number: parseInt(e.target.value) as 1 | 2 | 3 })}
                             className="w-full px-3 py-2 border rounded-lg"
                             required
                           >
                             {(() => {
                               // Obtener números de llamada ya usados para este trabajador en este turno
                               const usedCallNumbers = calls
                                 .filter(c => c.worker_id === callForm.worker_id)
                                 .map(c => c.call_number);
                               
                               const availableNumbers = [1, 2, 3].filter(n => !usedCallNumbers.includes(n as 1 | 2 | 3));
                               
                               // Si el número actual está disponible o es el seleccionado, mostrarlo
                               const options = [1, 2, 3].map(n => {
                                 const isUsed = usedCallNumbers.includes(n as 1 | 2 | 3);
                                 const isSelected = callForm.call_number === n;
                                 
                                 if (isUsed && !isSelected) {
                                   return (
                                     <option key={n} value={n} disabled>
                                       Llamada #{n} (Ya existe)
                                     </option>
                                   );
                                 }
                                 
                                 return (
                                   <option key={n} value={n}>
                                     Llamada #{n} {isUsed ? '(Ya existe)' : ''}
                                   </option>
                                 );
                               });
                               
                               return options;
                             })()}
                           </select>
                           {(() => {
                             const usedCallNumbers = calls
                               .filter(c => c.worker_id === callForm.worker_id)
                               .map(c => c.call_number);
                             
                             if (usedCallNumbers.length === 3) {
                               return (
                                 <p className="text-sm text-amber-600 mt-1">
                                   ⚠️ Ya se han creado las 3 llamadas para este trabajador. Edita una existente.
                                 </p>
                               );
                             }
                             return null;
                           })()}
                         </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora Programada *</label>
                    <input
                      type="time"
                      value={callForm.scheduled_time}
                      onChange={(e) => setCallForm({ ...callForm, scheduled_time: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      required
                    />
                  </div>
                </>
              )}
              {editingCall && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora Programada</label>
                    <input
                      type="time"
                      value={callForm.scheduled_time}
                      disabled
                      className="w-full px-3 py-2 border rounded-lg bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora Real</label>
                    <input
                      type="time"
                      value={callForm.actual_time}
                      onChange={(e) => setCallForm({ ...callForm, actual_time: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>
              )}
              {!editingCall && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora Real</label>
                  <input
                    type="time"
                    value={callForm.actual_time}
                    onChange={(e) => setCallForm({ ...callForm, actual_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              )}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={callForm.answered}
                    onChange={(e) => setCallForm({ ...callForm, answered: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-700">Trabajador contestó</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={callForm.photo_received}
                    onChange={(e) => setCallForm({ ...callForm, photo_received: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-700">Foto recibida</span>
                </label>
              </div>
              {callForm.photo_received && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Foto del Trabajador</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCallPhotoSelect}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  {uploadingPhoto && (
                    <p className="text-sm text-blue-600 mt-1">Subiendo foto...</p>
                  )}
                  {(callPhotoPreview || callForm.photo_url) && (
                    <div className="mt-2">
                      <img
                        src={callPhotoPreview || callForm.photo_url}
                        alt="Foto del trabajador"
                        className="w-full h-64 object-contain border rounded-lg"
                      />
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Novedades / Observaciones</label>
                <textarea
                  value={callForm.notes}
                  onChange={(e) => setCallForm({ ...callForm, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Anotar cualquier novedad o observación..."
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={callForm.non_conformity}
                  onChange={(e) => setCallForm({ ...callForm, non_conformity: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-700">Marcar como no conformidad</span>
              </div>
              {callForm.non_conformity && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción de la no conformidad</label>
                  <textarea
                    value={callForm.non_conformity_description}
                    onChange={(e) => setCallForm({ ...callForm, non_conformity_description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Describir la no conformidad..."
                  />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowCallModal(false);
                    setEditingCall(null);
                    setCallPhotoFile(null);
                    setCallPhotoPreview(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (editingCall) {
                      await handleUpdateCall();
                    } else if (currentShift) {
                      // Crear nueva llamada
                      if (!callForm.worker_id || !callForm.scheduled_time) {
                        alert('Por favor complete todos los campos requeridos (Trabajador y Hora Programada)');
                        return;
                      }
                      
                      // Obtener información del trabajador antes del try para que esté disponible en el catch
                      const workers = getNightWorkers(currentShift.unit_id);
                      const worker = workers.find(w => w.id === callForm.worker_id);
                      if (!worker) {
                        alert('Trabajador no encontrado');
                        return;
                      }
                      
                      setLoading(true);
                      setUploadingPhoto(true);
                      try {

                        let photoUrl = callForm.photo_url;
                        // Si hay un archivo, subirlo primero
                        if (callPhotoFile) {
                          try {
                            const fileName = storageService.generateUniqueFileName(
                              callPhotoFile.name,
                              `call-${currentShift.id}-${callForm.worker_id}`
                            );
                            const date = new Date().toISOString().split('T')[0];
                            const path = `calls/${date}/${fileName}`;
                            photoUrl = await storageService.uploadFile('night-supervision-photos', callPhotoFile, path);
                          } catch (error: any) {
                            console.error('Error subiendo foto:', error);
                            const errorMessage = error?.message || 'Error desconocido al subir la foto';
                            if (errorMessage.includes('Bucket not found') || errorMessage.includes('no existe')) {
                              alert(`⚠️ El bucket de almacenamiento no está configurado.\n\nPor favor, crea el bucket "night-supervision-photos" en Supabase Storage.\n\nConsulta el archivo STORAGE_SETUP.md para instrucciones detalladas.`);
                            } else {
                              alert(`Error al subir la foto: ${errorMessage}`);
                            }
                            setLoading(false);
                            setUploadingPhoto(false);
                            return;
                          }
                        }

                        await nightSupervisionService.createCall({
                          shift_id: currentShift.id,
                          worker_id: callForm.worker_id,
                          worker_name: worker.name,
                          worker_phone: '', // TODO: Obtener del recurso
                          call_number: callForm.call_number,
                          scheduled_time: callForm.scheduled_time,
                          actual_time: callForm.actual_time || undefined,
                          answered: callForm.answered,
                          photo_received: callForm.photo_received,
                          photo_url: photoUrl || undefined,
                          notes: callForm.notes || undefined,
                          non_conformity: callForm.non_conformity,
                          non_conformity_description: callForm.non_conformity_description || undefined,
                          created_by: currentUser.id,
                        });
                        await loadShiftData(currentShift.id);
                        setShowCallModal(false);
                        setEditingCall(null);
                        setCallPhotoFile(null);
                        setCallPhotoPreview(null);
                        setCallForm({
                          worker_id: '',
                          call_number: 1,
                          scheduled_time: '',
                          actual_time: '',
                          answered: false,
                          photo_received: false,
                          photo_url: '',
                          notes: '',
                          non_conformity: false,
                          non_conformity_description: ''
                        });
                      } catch (error: any) {
                        console.error('Error creando llamada:', error);
                        
                        // Manejar error de llamada duplicada
                        if (error?.message === 'duplicate_call_entry') {
                          // worker está disponible porque se definió antes del try
                          const workerName = worker?.name || callForm.worker_id || 'el trabajador';
                          const callNumber = callForm.call_number;
                          alert(
                            `Ya existe una llamada #${callNumber} para ${workerName} en este turno.\n\n` +
                            `Por favor, edita la llamada existente o selecciona otro número de llamada.`
                          );
                        } else {
                          const errorMessage = error?.message || 'Error desconocido';
                          alert(`Error al crear la llamada: ${errorMessage}`);
                        }
                      } finally {
                        setLoading(false);
                        setUploadingPhoto(false);
                      }
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading || uploadingPhoto}
                >
                  {loading || uploadingPhoto ? 'Guardando...' : editingCall ? 'Guardar' : 'Crear Llamada'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Revisión de Cámaras */}
      {showCameraReviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                Revisión de Cámaras #{editingCameraReview?.review_number || cameraReviewForm.review_number}
              </h2>
              <button
                onClick={() => {
                  setShowCameraReviewModal(false);
                  setEditingCameraReview(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora Programada</label>
                  <input
                    type="time"
                    value={cameraReviewForm.scheduled_time}
                    disabled
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora Real</label>
                  <input
                    type="time"
                    value={cameraReviewForm.actual_time}
                    onChange={(e) => setCameraReviewForm({ ...cameraReviewForm, actual_time: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Screenshot de las Cámaras</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotSelect}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                {uploadingPhoto && (
                  <p className="text-sm text-blue-600 mt-1">Subiendo screenshot...</p>
                )}
                {(screenshotPreview || cameraReviewForm.screenshot_url) && (
                  <div className="mt-2 space-y-2">
                    <img
                      src={screenshotPreview || cameraReviewForm.screenshot_url}
                      alt="Screenshot de cámaras"
                      className="w-full h-64 object-contain border rounded-lg cursor-pointer hover:opacity-90"
                      onClick={() => {
                        const imgUrl = screenshotPreview || cameraReviewForm.screenshot_url;
                        if (imgUrl) {
                          window.open(imgUrl, '_blank');
                        }
                      }}
                      title="Click para ver en tamaño completo"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const imgUrl = screenshotPreview || cameraReviewForm.screenshot_url;
                        if (imgUrl) {
                          window.open(imgUrl, '_blank');
                        }
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <Eye className="w-4 h-4" />
                      Ver foto en tamaño completo
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observaciones del Supervisor *
                </label>
                <textarea
                  value={cameraReviewForm.notes}
                  onChange={(e) => setCameraReviewForm({ ...cameraReviewForm, notes: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Ingrese observaciones sobre la revisión de cámaras, estado de las cámaras, eventos observados, etc..."
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Campo obligatorio. Describa lo observado en las cámaras durante esta revisión.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cameraReviewForm.non_conformity}
                  onChange={(e) => setCameraReviewForm({ ...cameraReviewForm, non_conformity: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium text-gray-700">Marcar como no conformidad</span>
              </div>
              {cameraReviewForm.non_conformity && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción de la no conformidad</label>
                  <textarea
                    value={cameraReviewForm.non_conformity_description}
                    onChange={(e) => setCameraReviewForm({ ...cameraReviewForm, non_conformity_description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Describir la no conformidad..."
                  />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowCameraReviewModal(false);
                    setEditingCameraReview(null);
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (editingCameraReview) {
                      await handleUpdateCameraReview();
                    } else if (currentShift) {
                      // Crear nueva revisión
                      setLoading(true);
                      setUploadingPhoto(true);
                      try {
                        let screenshotUrl = '';

                        // Si hay un archivo, subirlo primero
                        if (screenshotFile) {
                          try {
                            const fileName = storageService.generateUniqueFileName(
                              screenshotFile.name,
                              `review-${currentShift.id}-${cameraReviewForm.review_number}`
                            );
                            const date = new Date().toISOString().split('T')[0];
                            const path = `camera-reviews/${date}/${fileName}`;
                            screenshotUrl = await storageService.uploadFile('night-supervision-photos', screenshotFile, path);
                          } catch (error: any) {
                            console.error('Error subiendo screenshot:', error);
                            const errorMessage = error?.message || 'Error desconocido al subir el screenshot';
                            if (errorMessage.includes('Bucket not found') || errorMessage.includes('no existe')) {
                              alert(`⚠️ El bucket de almacenamiento no está configurado.\n\nPor favor, crea el bucket "night-supervision-photos" en Supabase Storage.\n\nConsulta el archivo STORAGE_SETUP.md para instrucciones detalladas.`);
                            } else {
                              alert(`Error al subir el screenshot: ${errorMessage}`);
                            }
                            setLoading(false);
                            setUploadingPhoto(false);
                            return;
                          }
                        }

                        // Verificar si ya existe una revisión con este número
                        // Recargar las revisiones del turno para asegurar que tenemos los datos más recientes
                        const allReviews = await nightSupervisionService.getCameraReviewsByShiftId(currentShift.id);
                        const existingReview = allReviews.find(
                          r => r.review_number === cameraReviewForm.review_number
                        );

                        });

                        if (existingReview) {
                          // Actualizar la revisión existente
                          await nightSupervisionService.updateCameraReview(existingReview.id, {
                            scheduled_time: cameraReviewForm.scheduled_time,
                            actual_time: cameraReviewForm.actual_time || undefined,
                            screenshot_url: screenshotUrl || existingReview.screenshot_url, // Preservar URL existente si no hay nueva
                            cameras_reviewed: cameraReviewForm.cameras_reviewed,
                            notes: cameraReviewForm.notes || undefined,
                            non_conformity: cameraReviewForm.non_conformity,
                            non_conformity_description: cameraReviewForm.non_conformity_description || undefined,
                            updated_by: currentUser.id,
                          });
                        } else {
                          // Crear una nueva revisión solo si no existe
                          await nightSupervisionService.createCameraReview({
                            shift_id: currentShift.id,
                            unit_id: currentShift.unit_id,
                            unit_name: currentShift.unit_name,
                            review_number: cameraReviewForm.review_number,
                            scheduled_time: cameraReviewForm.scheduled_time,
                            actual_time: cameraReviewForm.actual_time || undefined,
                            screenshot_url: screenshotUrl,
                            cameras_reviewed: cameraReviewForm.cameras_reviewed,
                            notes: cameraReviewForm.notes || undefined,
                            non_conformity: cameraReviewForm.non_conformity,
                            non_conformity_description: cameraReviewForm.non_conformity_description || undefined,
                            created_by: currentUser.id,
                          });
                        }
                        await loadShiftData(currentShift.id);
                        setShowCameraReviewModal(false);
                      } catch (error) {
                        console.error('Error creando revisión:', error);
                        alert('Error al crear la revisión');
                      } finally {
                        setLoading(false);
                      }
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vista: Reportes Históricos */}
      {activeView === 'historical' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Reportes Históricos</h3>
            
            <div className="space-y-4">
              {/* Selector de tipo de reporte */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Reporte</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="worker"
                      checked={historicalReportType === 'worker'}
                      onChange={(e) => {
                        setHistoricalReportType('worker');
                        setHistoricalReport(null);
                      }}
                      className="w-4 h-4"
                    />
                    <span>Por Trabajador</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="unit"
                      checked={historicalReportType === 'unit'}
                      onChange={(e) => {
                        setHistoricalReportType('unit');
                        setHistoricalReport(null);
                      }}
                      className="w-4 h-4"
                    />
                    <span>Por Unidad</span>
                  </label>
                </div>
              </div>

              {/* Filtros de fecha */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Desde</label>
                  <input
                    type="date"
                    value={historicalDateFrom}
                    onChange={(e) => setHistoricalDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hasta</label>
                  <input
                    type="date"
                    value={historicalDateTo}
                    onChange={(e) => setHistoricalDateTo(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              {/* Selector según tipo */}
              {historicalReportType === 'worker' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trabajador</label>
                  <select
                    value={selectedWorkerId}
                    onChange={(e) => {
                      setSelectedWorkerId(e.target.value);
                      setHistoricalReport(null);
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Seleccionar trabajador</option>
                    {units.flatMap(unit => 
                      getNightWorkers(unit.id).map(worker => (
                        <option key={worker.id} value={worker.id}>
                          {worker.name} - {unit.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {historicalReportType === 'unit' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => {
                      setSelectedUnitId(e.target.value);
                      setHistoricalReport(null);
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="">Seleccionar unidad</option>
                    {units.map(unit => (
                      <option key={unit.id} value={unit.id}>{unit.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Botón generar reporte */}
              <button
                onClick={async () => {
                  if (historicalReportType === 'worker' && !selectedWorkerId) {
                    alert('Por favor seleccione un trabajador');
                    return;
                  }
                  if (historicalReportType === 'unit' && !selectedUnitId) {
                    alert('Por favor seleccione una unidad');
                    return;
                  }

                  setLoading(true);
                  try {
                    let report: HistoricalReportByWorker | HistoricalReportByUnit | null = null;
                    
                    if (historicalReportType === 'worker') {
                      report = await nightSupervisionHistoricalService.getHistoricalReportByWorker(
                        selectedWorkerId,
                        historicalDateFrom,
                        historicalDateTo
                      );
                    } else {
                      report = await nightSupervisionHistoricalService.getHistoricalReportByUnit(
                        selectedUnitId,
                        historicalDateFrom,
                        historicalDateTo
                      );
                    }

                    if (!report) {
                      alert('No se encontraron datos para el período seleccionado');
                      return;
                    }

                    setHistoricalReport(report);
                  } catch (error) {
                    console.error('Error generando reporte histórico:', error);
                    alert('Error al generar el reporte histórico');
                  } finally {
                    setLoading(false);
                  }
                }}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                disabled={loading}
              >
                {loading ? 'Generando...' : 'Generar Reporte'}
              </button>
            </div>
          </div>

          {/* Mostrar reporte histórico */}
          {historicalReport && (
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {historicalReportType === 'worker' 
                    ? `Reporte Histórico: ${(historicalReport as HistoricalReportByWorker).worker_name}`
                    : `Reporte Histórico: ${(historicalReport as HistoricalReportByUnit).unit_name}`
                  }
                </h3>
                <button
                  onClick={async () => {
                    if (!historicalReport) return;
                    
                    setLoading(true);
                    try {
                      const sheets: Array<{ name: string; headers: string[]; data: any[] }> = [];

                      if (historicalReportType === 'worker') {
                        const workerReport = historicalReport as HistoricalReportByWorker;
                        sheets.push({
                          name: 'Resumen',
                          headers: ['Métrica', 'Valor'],
                          data: [
                            { Métrica: 'Trabajador', Valor: workerReport.worker_name },
                            { Métrica: 'Total Turnos', Valor: workerReport.total_shifts },
                            { Métrica: 'Llamadas Requeridas', Valor: workerReport.total_calls_required },
                            { Métrica: 'Llamadas Completadas', Valor: workerReport.total_calls_completed },
                            { Métrica: 'Llamadas Contestadas', Valor: workerReport.total_calls_answered },
                            { Métrica: 'Fotos Recibidas', Valor: workerReport.total_photos_received },
                            { Métrica: 'Días en Descanso', Valor: workerReport.total_on_rest_days },
                            { Métrica: 'No Conformidades', Valor: workerReport.total_non_conformities },
                            { Métrica: 'Completitud Promedio', Valor: `${workerReport.average_completion_percentage}%` },
                          ],
                        });

                        sheets.push({
                          name: 'Detalle Turnos',
                          headers: ['Fecha', 'Unidad', 'Supervisor', 'Completitud', 'Llamadas'],
                          data: workerReport.shifts.map(shift => ({
                            Fecha: shift.date,
                            Unidad: shift.unit_name,
                            Supervisor: shift.supervisor_name,
                            Completitud: `${shift.completion_percentage}%`,
                            Llamadas: shift.calls.length,
                          })),
                        });
                      } else {
                        const unitReport = historicalReport as HistoricalReportByUnit;
                        sheets.push({
                          name: 'Resumen',
                          headers: ['Métrica', 'Valor'],
                          data: [
                            { Métrica: 'Unidad', Valor: unitReport.unit_name },
                            { Métrica: 'Total Turnos', Valor: unitReport.total_shifts },
                            { Métrica: 'Total Trabajadores', Valor: unitReport.total_workers },
                            { Métrica: 'Llamadas Requeridas', Valor: unitReport.total_calls_required },
                            { Métrica: 'Llamadas Completadas', Valor: unitReport.total_calls_completed },
                            { Métrica: 'Llamadas Contestadas', Valor: unitReport.total_calls_answered },
                            { Métrica: 'Fotos Recibidas', Valor: unitReport.total_photos_received },
                            { Métrica: 'Revisiones Requeridas', Valor: unitReport.total_camera_reviews_required },
                            { Métrica: 'Revisiones Completadas', Valor: unitReport.total_camera_reviews_completed },
                            { Métrica: 'No Conformidades', Valor: unitReport.total_non_conformities },
                            { Métrica: 'Completitud Promedio', Valor: `${unitReport.average_completion_percentage}%` },
                          ],
                        });

                        sheets.push({
                          name: 'Detalle Turnos',
                          headers: ['Fecha', 'Supervisor', 'Completitud', 'Llamadas', 'Revisiones'],
                          data: unitReport.shifts.map(shift => ({
                            Fecha: shift.date,
                            Supervisor: shift.supervisor_name,
                            Completitud: `${shift.completion_percentage}%`,
                            Llamadas: shift.calls_count,
                            Revisiones: shift.camera_reviews_count,
                          })),
                        });
                      }

                      await excelService.exportMultipleSheets(
                        sheets,
                        `Reporte_Historico_${historicalReportType === 'worker' ? 'Trabajador' : 'Unidad'}_${historicalDateFrom}_${historicalDateTo}.xlsx`
                      );
                    } catch (error) {
                      console.error('Error exportando reporte histórico:', error);
                      alert('Error al exportar el reporte histórico');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Exportar a Excel
                </button>
              </div>

              {historicalReportType === 'worker' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Total Turnos</p>
                      <p className="text-2xl font-bold text-blue-600">{(historicalReport as HistoricalReportByWorker).total_shifts}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Llamadas Contestadas</p>
                      <p className="text-2xl font-bold text-green-600">{(historicalReport as HistoricalReportByWorker).total_calls_answered}</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Fotos Recibidas</p>
                      <p className="text-2xl font-bold text-purple-600">{(historicalReport as HistoricalReportByWorker).total_photos_received}</p>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Completitud Promedio</p>
                      <p className="text-2xl font-bold text-amber-600">{(historicalReport as HistoricalReportByWorker).average_completion_percentage}%</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h4 className="font-semibold text-gray-900 mb-3">Detalle por Turno</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Fecha</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Unidad</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Supervisor</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Completitud</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Llamadas</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(historicalReport as HistoricalReportByWorker).shifts.map((shift, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm">{formatDateFromString(shift.date)}</td>
                              <td className="px-4 py-3 text-sm">{shift.unit_name}</td>
                              <td className="px-4 py-3 text-sm">{shift.supervisor_name}</td>
                              <td className="px-4 py-3 text-sm">{shift.completion_percentage}%</td>
                              <td className="px-4 py-3 text-sm">{shift.calls.length}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {historicalReportType === 'unit' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Total Turnos</p>
                      <p className="text-2xl font-bold text-blue-600">{(historicalReport as HistoricalReportByUnit).total_shifts}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Trabajadores</p>
                      <p className="text-2xl font-bold text-green-600">{(historicalReport as HistoricalReportByUnit).total_workers}</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Llamadas Contestadas</p>
                      <p className="text-2xl font-bold text-purple-600">{(historicalReport as HistoricalReportByUnit).total_calls_answered}</p>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-lg">
                      <p className="text-sm text-gray-600">Completitud Promedio</p>
                      <p className="text-2xl font-bold text-amber-600">{(historicalReport as HistoricalReportByUnit).average_completion_percentage}%</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h4 className="font-semibold text-gray-900 mb-3">Detalle por Turno</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Fecha</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Supervisor</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Completitud</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Llamadas</th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Revisiones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(historicalReport as HistoricalReportByUnit).shifts.map((shift, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm">{formatDateFromString(shift.date)}</td>
                              <td className="px-4 py-3 text-sm">{shift.supervisor_name}</td>
                              <td className="px-4 py-3 text-sm">{shift.completion_percentage}%</td>
                              <td className="px-4 py-3 text-sm">{shift.calls_count}</td>
                              <td className="px-4 py-3 text-sm">{shift.camera_reviews_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: Ver Imagen Completa */}
      {showImageModal && imageModalUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={() => setShowImageModal(false)}>
          <div className="bg-white rounded-lg p-4 max-w-5xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Foto de Revisión de Cámaras</h3>
              <button
                onClick={() => setShowImageModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <img
              src={imageModalUrl}
              alt="Screenshot completo"
              className="w-full h-auto rounded-lg"
            />
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowImageModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

