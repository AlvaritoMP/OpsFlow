
import React, { useState, useEffect, useRef } from 'react';
import { Unit, ResourceType, StaffStatus, Resource, UnitStatus, Training, OperationalLog, UserRole, AssignedAsset, UnitContact, ManagementStaff, ManagementRole, MaintenanceRecord, Zone, ClientRequest, ShiftType, DailyShift, NightSupervisionShift, NightSupervisionCall, NightSupervisionCameraReview } from '../types';
import { ArrowLeft, UserCheck, Box, ClipboardList, MapPin, Calendar, ShieldCheck, HardHat, Sparkles, BrainCircuit, Truck, Edit2, X, ChevronDown, ChevronUp, Award, Camera, Clock, PlusSquare, CheckSquare, Square, Plus, Trash2, Image as ImageIcon, Save, Users, PackagePlus, FileText, UserPlus, AlertCircle, Shirt, Smartphone, Laptop, Briefcase, Phone, Mail, BadgeCheck, Wrench, PenTool, History, RefreshCw, Link as LinkIcon, LayoutGrid, Maximize2, Move, GripHorizontal, Package, Share2, Maximize, Layers, MessageSquarePlus, CheckCircle, Clock3, Paperclip, Send, MessageCircle, ChevronLeft, ChevronRight, Table, Copy, Archive, Moon, Eye, XCircle, Upload, FileSpreadsheet } from 'lucide-react';
import { syncResourceWithInventory } from '../services/inventoryService';
import { checkPermission } from '../services/permissionService';
import { nightSupervisionService } from '../services/nightSupervisionService';

interface UnitDetailProps {
  unit: Unit;
  userRole: UserRole;
  availableStaff: ManagementStaff[]; // GLOBAL REGISTRY PASSED DOWN
  onBack: () => void;
  onUpdate?: (updatedUnit: Unit) => void;
}

const STATUS_COLORS: Record<string, string> = {
  'Activo': 'bg-green-100 text-green-700',
  'De Licencia': 'bg-yellow-100 text-yellow-700',
  'Reemplazo Temporal': 'bg-orange-100 text-orange-700',
  'Operativo': 'bg-green-100 text-green-700',
  'En Reparación': 'bg-red-100 text-red-700',
  'Stock OK': 'bg-blue-100 text-blue-700',
  'Stock Bajo': 'bg-red-100 text-red-700',
  'Agotado': 'bg-gray-100 text-gray-700',
  'Baja': 'bg-gray-100 text-gray-700',
};

const REQUEST_STATUS_STYLES = {
    'PENDING': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'IN_PROGRESS': 'bg-blue-100 text-blue-800 border-blue-200',
    'RESOLVED': 'bg-green-100 text-green-800 border-green-200'
};

const PRIORITY_STYLES = {
    'LOW': 'bg-slate-100 text-slate-600',
    'MEDIUM': 'bg-orange-100 text-orange-600',
    'HIGH': 'bg-red-100 text-red-600 font-bold'
};

// Helper to start weeks on Monday
const getMonday = (d: Date) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  return new Date(date.setDate(diff));
}

export const UnitDetail: React.FC<UnitDetailProps> = ({ unit, userRole, availableStaff, onBack, onUpdate }) => {
  // Cargar activos estándar al montar el componente
  React.useEffect(() => {
    const loadStandardAssets = async () => {
      try {
        const { standardAssetsService } = await import('../services/standardAssetsService');
        const assets = await standardAssetsService.getAll();
        setStandardAssets(assets.map(a => ({ 
          id: a.id, 
          name: a.name, 
          type: a.type,
          defaultSerialNumberPrefix: a.defaultSerialNumberPrefix 
        })));
      } catch (error) {
        console.error('Error al cargar activos estándar:', error);
      }
    };
    loadStandardAssets();
  }, []);

  // Mantener el tab activo incluso cuando la unidad se actualiza
  const [activeTab, setActiveTab] = useState<'personnel' | 'logistics' | 'management' | 'overview' | 'blueprint' | 'requests'>('overview');
  const activeTabRef = useRef<'personnel' | 'logistics' | 'management' | 'overview' | 'blueprint' | 'requests'>('overview');
  const previousUnitIdRef = useRef<string>(unit.id);

  // Estados para modal de supervisión nocturna
  const [showNightSupervisionModal, setShowNightSupervisionModal] = useState(false);
  const [nightSupervisionShifts, setNightSupervisionShifts] = useState<NightSupervisionShift[]>([]);
  const [selectedShift, setSelectedShift] = useState<NightSupervisionShift | null>(null);
  const [shiftCalls, setShiftCalls] = useState<NightSupervisionCall[]>([]);
  const [shiftCameraReviews, setShiftCameraReviews] = useState<NightSupervisionCameraReview[]>([]);
  const [loadingNightSupervision, setLoadingNightSupervision] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);
  
  // Sincronizar el ref con el estado
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  
  // Restaurar el tab activo si la unidad cambia pero es la misma unidad (solo actualización de datos)
  useEffect(() => {
    // Si es la misma unidad (mismo ID), mantener el tab activo
    if (previousUnitIdRef.current === unit.id) {
      // Si el tab cambió inesperadamente, restaurarlo
      if (activeTab !== activeTabRef.current && activeTabRef.current !== 'overview') {
        setActiveTab(activeTabRef.current);
      }
    } else {
      // Nueva unidad, resetear a overview
      setActiveTab('overview');
      activeTabRef.current = 'overview';
    }
    previousUnitIdRef.current = unit.id;
  }, [unit.id]); // Solo cuando cambia el ID de la unidad
  
  // Edit Unit General Info State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(unit);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneShifts, setNewZoneShifts] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');

  // Personnel State
  const [personnelViewMode, setPersonnelViewMode] = useState<'list' | 'roster'>('list'); // New View Mode
  const [expandedPersonnel, setExpandedPersonnel] = useState<string | null>(null);
  const [selectedPersonnelIds, setSelectedPersonnelIds] = useState<string[]>([]);
  
  // Loading and notification states
  const [isSavingWorker, setIsSavingWorker] = useState(false);
  const [isUpdatingResource, setIsUpdatingResource] = useState(false);
  const [isArchivingPersonnel, setIsArchivingPersonnel] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Roster State
  const [rosterStartDate, setRosterStartDate] = useState(getMonday(new Date()));

  // Mass Training State
  const [showMassTrainingModal, setShowMassTrainingModal] = useState(false);
  const [massTrainingForm, setMassTrainingForm] = useState({ topic: '', date: '', status: 'Programado' });
  
  // Mass Asset Assignment State
  const [showAssetAssignmentModal, setShowAssetAssignmentModal] = useState(false);
  const [assetAssignmentForm, setAssetAssignmentForm] = useState({ 
    name: '', 
    type: 'EPP' as 'EPP' | 'Uniforme' | 'Tecnologia' | 'Herramienta' | 'Otro', 
    dateAssigned: '', 
    serialNumber: '',
    standardAssetId: '' as string | undefined
  });
  const [generateConstancy, setGenerateConstancy] = useState(true); // Por defecto generar constancia
  const [standardAssets, setStandardAssets] = useState<Array<{ id: string; name: string; type: string; defaultSerialNumberPrefix?: string }>>([]);
  const [useStandardAsset, setUseStandardAsset] = useState(true); // Por defecto usar catálogo

  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [newWorkerForm, setNewWorkerForm] = useState<{ name: string; zones: string[]; shift: string; dni?: string; puesto?: string; startDate?: string; endDate?: string }>({ name: '', zones: [], shift: '', dni: '', puesto: '', startDate: '', endDate: '' });
  
  // Bulk Import State
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ totalRows: number; successful: number; failed: number; errors: Array<{ row: number; error: string; data: any }>; warnings: Array<{ row: number; warning: string; data: any }> } | null>(null);
  
  // Image Upload State - Rastrea imágenes que se están subiendo
  const [uploadingImages, setUploadingImages] = useState<Set<string>>(new Set()); // Set de blob URLs que se están subiendo

  // Resource Editing State (Logistics & Personnel)
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [isSyncing, setIsSyncing] = useState<string | null>(null); // ID of resource currently syncing
  
  // Maintenance History State (Equipment)
  const [expandedEquipment, setExpandedEquipment] = useState<string | null>(null);
  const [maintenanceResource, setMaintenanceResource] = useState<Resource | null>(null);
  const [newMaintenanceForm, setNewMaintenanceForm] = useState({ date: '', type: 'Preventivo', description: '', technician: '' });
  const [newMaintenanceResponsibles, setNewMaintenanceResponsibles] = useState<string[]>([]);
  const [newMaintenanceImages, setNewMaintenanceImages] = useState<string[]>([]);
  const [newMaintenanceImageUrl, setNewMaintenanceImageUrl] = useState('');
  
  // Add Logistics Resource State
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);
  const [newResourceType, setNewResourceType] = useState<ResourceType>(ResourceType.EQUIPMENT);
  const [newResourceForm, setNewResourceForm] = useState<Partial<Resource>>({ name: '', quantity: 1, status: 'Operativo', assignedZones: [] });
  const [equipmentResponsibleWorkerId, setEquipmentResponsibleWorkerId] = useState<string>('');
  const [generateEquipmentConstancy, setGenerateEquipmentConstancy] = useState(false);

  // Log/Event State
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEventForm, setNewEventForm] = useState({ type: 'Coordinacion', date: '', description: '' });
  const [newEventImages, setNewEventImages] = useState<string[]>([]);
  const [newEventImageUrl, setNewEventImageUrl] = useState('');
  const [newEventResponsibles, setNewEventResponsibles] = useState<string[]>([]);
  
  const [editingLog, setEditingLog] = useState<OperationalLog | null>(null);
  const [newLogImageUrl, setNewLogImageUrl] = useState('');

  // Client Requests State
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [newRequestForm, setNewRequestForm] = useState<{ category: string, description: string, priority: string, relatedResourceId: string }>({
      category: 'GENERAL',
      description: '',
      priority: 'MEDIUM',
      relatedResourceId: ''
  });
  // Client Request Attachments (New Feature)
  const [newRequestImages, setNewRequestImages] = useState<string[]>([]);
  const [newRequestImageUrl, setNewRequestImageUrl] = useState('');

  const [editingRequest, setEditingRequest] = useState<ClientRequest | null>(null); // For tracking/discussion
  const [resolveAttachments, setResolveAttachments] = useState<string[]>([]);
  const [resolveImageUrl, setResolveImageUrl] = useState('');
  
  // Inline Comments State (Map requestId -> draft text)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});


  // Blueprint State
  const [isEditingBlueprint, setIsEditingBlueprint] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null); // NEW: Manage layers
  const [gridRows, setGridRows] = useState(12); // Dynamic rows

  // Drag & Resize State for Zones
  const gridRef = useRef<HTMLDivElement>(null);
  const [interactionState, setInteractionState] = useState<{
      type: 'idle' | 'drag' | 'resize';
      zoneId: string | null;
      startGridX: number;
      startGridY: number;
      startLayout: { x: number, y: number, w: number, h: number };
  }>({ type: 'idle', zoneId: null, startGridX: 0, startGridY: 0, startLayout: {x:1,y:1,w:1,h:1} });


  // --- PERMISSIONS CHECKS ---
  const canEditGeneral = checkPermission(userRole, 'UNIT_OVERVIEW', 'edit');
  const canEditPersonnel = checkPermission(userRole, 'PERSONNEL', 'edit');
  const canEditLogistics = checkPermission(userRole, 'LOGISTICS', 'edit');
  const canEditLogs = checkPermission(userRole, 'LOGS', 'edit');
  const canEditBlueprint = checkPermission(userRole, 'BLUEPRINT', 'edit');
  const canViewRequests = checkPermission(userRole, 'CLIENT_REQUESTS', 'view');
  const canCreateRequests = checkPermission(userRole, 'CLIENT_REQUESTS', 'edit'); // Client can edit (create)

  // Función para formatear fecha desde string YYYY-MM-DD
  const formatDateFromString = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // Cargar turnos de supervisión nocturna para esta unidad
  const loadNightSupervisionShifts = async () => {
    setLoadingNightSupervision(true);
    try {
      const shifts = await nightSupervisionService.getAllShifts({
        unitId: unit.id
      });
      setNightSupervisionShifts(shifts.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      }));
    } catch (error) {
      console.error('Error cargando turnos de supervisión nocturna:', error);
    } finally {
      setLoadingNightSupervision(false);
    }
  };

  // Cargar detalles de un turno específico
  const loadShiftDetails = async (shift: NightSupervisionShift) => {
    setLoadingNightSupervision(true);
    try {
      const calls = await nightSupervisionService.getCallsByShiftId(shift.id);
      const reviews = await nightSupervisionService.getCameraReviewsByShiftId(shift.id);
      setShiftCalls(calls);
      setShiftCameraReviews(reviews);
      setSelectedShift(shift);
    } catch (error) {
      console.error('Error cargando detalles del turno:', error);
    } finally {
      setLoadingNightSupervision(false);
    }
  };

  // Abrir modal de supervisión nocturna
  const openNightSupervisionModal = async () => {
    setShowNightSupervisionModal(true);
    await loadNightSupervisionShifts();
  };

  // CRITICAL FIX: Sync local edit state when parent unit prop changes
  useEffect(() => {
    setEditForm(unit);
  }, [unit]);

  // Initial Layer Set
  useEffect(() => {
    if (!activeLayerId && unit.blueprintLayers && unit.blueprintLayers.length > 0) {
        setActiveLayerId(unit.blueprintLayers[0].id);
    }
  }, [unit, activeLayerId]);

  // Infinite Canvas Logic - Initial Calculation
  useEffect(() => {
    let maxRow = 12;
    unit.zones.forEach(z => {
        if (z.layout && (z.layout.y + z.layout.h) > maxRow) {
            maxRow = z.layout.y + z.layout.h + 2;
        }
    });
    setGridRows(maxRow);
  }, [unit.zones]);

  // Handle Bottom Edge Resize (Infinite Canvas)
  const handleMapResizeStart = (e: React.MouseEvent) => {
    if (!isEditingBlueprint) return;
    e.preventDefault();
    
    const startY = e.clientY;
    const startRows = gridRows;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const addedRows = Math.floor(deltaY / 60); // approx 60px per row
        setGridRows(Math.max(12, startRows + addedRows));
    };
    
    const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // --- General Unit Update ---
  const handleSaveUnit = async () => {
    if (!onUpdate) return;
    
    // Verificar si hay imágenes subiéndose
    if (uploadingImages.size > 0) {
      setNotification({ 
        type: 'error', 
        message: `Espera a que terminen de subirse ${uploadingImages.size} imagen(es) antes de guardar.` 
      });
      setTimeout(() => setNotification(null), 5000);
      return;
    }
    
    console.log('💾 Iniciando guardado de unidad:', unit.id);
    console.log('📸 Imágenes en editForm:', editForm.images);
    
    // Verificar sesión de Supabase Auth antes de guardar
    try {
      const { supabase } = await import('../services/supabase');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.warn('⚠️ No hay sesión de Supabase Auth activa. Las imágenes pueden no guardarse correctamente.');
        const { authService } = await import('../services/authService');
        const localSession = authService.getSession();
        if (localSession) {
          setNotification({ 
            type: 'error', 
            message: 'No hay sesión de Supabase Auth activa. Por favor, cierra sesión y vuelve a iniciar sesión antes de guardar imágenes.' 
          });
          setTimeout(() => setNotification(null), 8000);
          return; // No guardar si no hay sesión de Auth
        }
      } else {
        console.log('✅ Sesión de Supabase Auth activa:', session.user.id);
      }
    } catch (authCheckError) {
      console.warn('⚠️ Error al verificar sesión de Auth:', authCheckError);
    }
    
    // Filtrar y limpiar cualquier blob URL que pueda quedar (por si acaso)
    const cleanedImages = editForm.images.filter(img => {
      if (img.startsWith('blob:')) {
        console.warn('⚠️ Se encontró un blob URL en las imágenes. Omitiendo:', img);
        return false; // NO mantener blob URLs, deben haberse subido a Storage
      }
      return true;
    });
    
    console.log('✅ Imágenes limpiadas (sin blob URLs):', cleanedImages);
    
    const cleanedForm = { ...editForm, images: cleanedImages };
    
    try {
      // Actualizar la unidad
      console.log('🔄 Llamando a onUpdate con:', { 
        id: cleanedForm.id, 
        name: cleanedForm.name, 
        imagesCount: cleanedForm.images.length,
        images: cleanedForm.images 
      });
      onUpdate(cleanedForm);
      setIsEditing(false);
      
      setNotification({ type: 'success', message: 'Unidad actualizada correctamente' });
      setTimeout(() => setNotification(null), 3000);
    } catch (error: any) {
      console.error('❌ Error al guardar unidad:', error);
      console.error('❌ Detalles del error:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      let errorMessage = `Error al guardar: ${error.message || 'Error desconocido'}`;
      
      if (error.message?.includes('permission') || error.message?.includes('RLS') || error.message?.includes('row-level security')) {
        errorMessage = `Error de permisos al guardar. Verifica que tengas permisos para editar unidades y que las políticas RLS estén configuradas correctamente.\n\nError: ${error.message}`;
      }
      
      setNotification({ 
        type: 'error', 
        message: errorMessage
      });
      setTimeout(() => setNotification(null), 8000);
    }
  };

  const handleAddZone = () => {
    if (!newZoneName) return;
    const newZone: Zone = {
      id: `z-${Date.now()}`,
      name: newZoneName,
      shifts: newZoneShifts.split(',').map(s => s.trim()).filter(s => s !== ''),
      layout: { 
          x: 1, y: 1, w: 2, h: 2, color: '#e2e8f0',
          layerId: activeLayerId || undefined // Assign to current layer
      }, 
      area: 0
    };
    if (newZone.shifts.length === 0) newZone.shifts = ['Diurno']; // Default
    
    setEditForm({
      ...editForm,
      zones: [...editForm.zones, newZone]
    });
    setNewZoneName('');
    setNewZoneShifts('');
  };

  const handleDeleteZone = (zoneId: string) => {
    setEditForm({
      ...editForm,
      zones: editForm.zones.filter(z => z.id !== zoneId)
    });
  };

  // --- Blueprint Layer Management ---
  const handleAddLayer = () => {
      if(!onUpdate) return;
      const newLayer = { id: `bl-${Date.now()}`, name: `Nivel ${ (unit.blueprintLayers?.length || 0) + 1}` };
      const updatedLayers = [...(unit.blueprintLayers || []), newLayer];
      onUpdate({ ...unit, blueprintLayers: updatedLayers });
      setActiveLayerId(newLayer.id);
  };

  const handleDeleteLayer = (layerId: string) => {
      if(!onUpdate) return;
      if (confirm('¿Eliminar este nivel y todas sus zonas?')) {
          const updatedLayers = (unit.blueprintLayers || []).filter(l => l.id !== layerId);
          // Also remove zones in this layer
          const updatedZones = unit.zones.filter(z => z.layout?.layerId !== layerId);
          onUpdate({ ...unit, blueprintLayers: updatedLayers, zones: updatedZones });
          if (updatedLayers.length > 0) setActiveLayerId(updatedLayers[0].id);
          else setActiveLayerId(null);
      }
  };

  const handleRenameLayer = (layerId: string, newName: string) => {
      if (!onUpdate) return;
      const updatedLayers = (unit.blueprintLayers || []).map(l => l.id === layerId ? { ...l, name: newName } : l);
      onUpdate({ ...unit, blueprintLayers: updatedLayers });
  };


  // --- Edit Unit Images ---
  const handleAddImageToEdit = () => {
    if (!editImageUrl) return;
    setEditForm({ ...editForm, images: [...editForm.images, editImageUrl] });
    setEditImageUrl('');
  };

  const handleRemoveImageFromEdit = (index: number) => {
    setEditForm({ ...editForm, images: editForm.images.filter((_, i) => i !== index) });
  };

  const handleFileUploadForEdit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const fileInput = e.target;
      
      console.log('📤 Iniciando subida de imagen:', file.name, file.size, 'bytes');
      
      // Verificar sesión de Supabase Auth ANTES de crear el blob URL
      try {
        const { supabase } = await import('../services/supabase');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          console.error('❌ No hay sesión de Supabase Auth:', sessionError);
          const { authService } = await import('../services/authService');
          const localSession = authService.getSession();
          
          if (localSession) {
            setNotification({ 
              type: 'error', 
              message: 'No hay sesión de Supabase Auth activa.\n\nPara subir imágenes, necesitas cerrar sesión y volver a iniciar sesión.\n\nEsto activará la sesión de Supabase Auth necesaria para Storage.' 
            });
            setTimeout(() => setNotification(null), 10000);
            
            // Limpiar el input
            if (fileInput) {
              fileInput.value = '';
            }
            return; // No continuar si no hay sesión de Auth
          } else {
            setNotification({ 
              type: 'error', 
              message: 'Debes estar autenticado para subir imágenes. Por favor, inicia sesión.' 
            });
            setTimeout(() => setNotification(null), 5000);
            
            // Limpiar el input
            if (fileInput) {
              fileInput.value = '';
            }
            return;
          }
        }
        
        console.log('✅ Sesión de Supabase Auth verificada:', session.user.id);
      } catch (authCheckError) {
        console.error('❌ Error al verificar sesión de Auth:', authCheckError);
        setNotification({ 
          type: 'error', 
          message: 'Error al verificar autenticación. Por favor, intenta de nuevo.' 
        });
        setTimeout(() => setNotification(null), 5000);
        
        // Limpiar el input
        if (fileInput) {
          fileInput.value = '';
        }
        return;
      }
      
      // Mostrar preview temporal mientras se sube
      const tempUrl = URL.createObjectURL(file);
      
      // Agregar a la lista de imágenes que se están subiendo
      setUploadingImages(prev => new Set(prev).add(tempUrl));
      
      setEditForm({ ...editForm, images: [...editForm.images, tempUrl] });
      console.log('🖼️ Preview temporal creado:', tempUrl);
      
      try {
        // Subir a Supabase Storage
        const { storageService } = await import('../services/storageService');
        const timestamp = Date.now();
        const fileName = `unit-${unit.id}-${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const path = `units/${unit.id}/${fileName}`;
        
        console.log('☁️ Subiendo a Storage:', { bucket: 'unit-images', path });
        const permanentUrl = await storageService.uploadFile('unit-images', file, path);
        console.log('✅ URL permanente obtenida:', permanentUrl);
        
        // Reemplazar el blob URL temporal con la URL permanente
        setEditForm(prev => {
          const updated = {
            ...prev,
            images: prev.images.map(img => img === tempUrl ? permanentUrl : img)
          };
          console.log('🔄 Estado actualizado con URL permanente. Total imágenes:', updated.images.length);
          return updated;
        });
        
        // Remover de la lista de imágenes que se están subiendo
        setUploadingImages(prev => {
          const newSet = new Set(prev);
          newSet.delete(tempUrl);
          return newSet;
        });
        
        // Limpiar el blob URL temporal
        URL.revokeObjectURL(tempUrl);
        
        setNotification({ type: 'success', message: 'Imagen subida correctamente' });
        setTimeout(() => setNotification(null), 3000);
      } catch (error: any) {
        console.error('❌ Error al subir imagen:', error);
        console.error('❌ Detalles del error:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
        
        // Remover de la lista de imágenes que se están subiendo
        setUploadingImages(prev => {
          const newSet = new Set(prev);
          newSet.delete(tempUrl);
          return newSet;
        });
        
        // Remover la imagen temporal si falló la subida
        setEditForm(prev => {
          const updated = {
            ...prev,
            images: prev.images.filter(img => img !== tempUrl)
          };
          console.log('🗑️ Imagen temporal removida. Total imágenes:', updated.images.length);
          return updated;
        });
        URL.revokeObjectURL(tempUrl);
        
        // Mensaje de error más específico
        let errorMessage = `Error al subir imagen: ${error.message || 'Error desconocido'}`;
        
        if (error.message?.includes('Supabase Auth') || error.message?.includes('sesión')) {
          errorMessage = `No se puede subir la imagen.\n\n${error.message}\n\nPor favor, cierra sesión y vuelve a iniciar sesión para activar la sesión de Supabase Auth necesaria.`;
        }
        
        setNotification({ 
          type: 'error', 
          message: errorMessage
        });
        setTimeout(() => setNotification(null), 10000); // Más tiempo para leer el mensaje
      } finally {
        // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
        if (fileInput) {
          fileInput.value = '';
        }
      }
    }
  };

  // --- Staff Selection Helper ---
  const handleSelectStaff = (roleKey: 'coordinator' | 'residentSupervisor' | 'rovingSupervisor', staffId: string) => {
     if (!staffId) {
        setEditForm({ ...editForm, [roleKey]: undefined });
        return;
     }
     const staffMember = availableStaff.find(s => s.id === staffId);
     if (staffMember) {
         setEditForm({
             ...editForm,
             [roleKey]: {
                 id: staffMember.id,
                 name: staffMember.name,
                 photo: staffMember.photo,
                 email: staffMember.email,
                 phone: staffMember.phone
             }
         });
     }
  };

  // --- CLIENT REQUESTS HANDLERS ---
  const handleAddImageToRequest = () => {
    if (!newRequestImageUrl) return;
    setNewRequestImages([...newRequestImages, newRequestImageUrl]);
    setNewRequestImageUrl('');
  };

  const handleFileUploadForRequest = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const imageUrl = URL.createObjectURL(file);
      setNewRequestImages([...newRequestImages, imageUrl]);
    }
  };

  const handleCreateRequest = () => {
      if(!onUpdate) return;
      
      const newRequest: ClientRequest = {
          id: `req-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          category: newRequestForm.category as any,
          priority: newRequestForm.priority as any,
          status: 'PENDING',
          description: newRequestForm.description,
          author: userRole === 'CLIENT' ? 'Cliente' : 'Admin/Ops',
          relatedResourceId: newRequestForm.relatedResourceId || undefined,
          attachments: newRequestImages,
          comments: []
      };

      const updatedRequests = [...(unit.requests || []), newRequest];
      onUpdate({ ...unit, requests: updatedRequests });
      setShowRequestModal(false);
      setNewRequestForm({ category: 'GENERAL', description: '', priority: 'MEDIUM', relatedResourceId: '' });
      setNewRequestImages([]);
  };

  const handleUpdateRequestStatus = (status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED', response?: string, attachments?: string[]) => {
      if(!onUpdate || !editingRequest) return;
      const updatedRequests = (unit.requests || []).map(req => {
          if (req.id === editingRequest.id) {
              return { 
                  ...req, 
                  status, 
                  response: response || req.response,
                  responseAttachments: attachments || req.responseAttachments,
                  resolvedDate: status === 'RESOLVED' ? new Date().toISOString().split('T')[0] : req.resolvedDate
              };
          }
          return req;
      });
      onUpdate({ ...unit, requests: updatedRequests });
      setEditingRequest(null);
      setResolveAttachments([]);
  };
  
  const handleAddResolveImage = () => {
    if (!resolveImageUrl) return;
    setResolveAttachments([...resolveAttachments, resolveImageUrl]);
    setResolveImageUrl('');
  };

  const handleFileUploadForResolve = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const imageUrl = URL.createObjectURL(file);
      setResolveAttachments([...resolveAttachments, imageUrl]);
    }
  };

  const handleRemoveResolveImage = (index: number) => {
      setResolveAttachments(resolveAttachments.filter((_, i) => i !== index));
  };

  // INLINE COMMENTS HANDLER
  const handleInlineCommentSubmit = (reqId: string) => {
      const text = commentDrafts[reqId];
      if (!onUpdate || !text || !text.trim()) return;

      const newComment = {
          id: `c-${Date.now()}`,
          author: userRole === 'CLIENT' ? 'Cliente' : 'Admin/Ops',
          role: userRole,
          date: new Date().toISOString(),
          text: text
      };

      const updatedRequests = (unit.requests || []).map(req => {
          if (req.id === reqId) {
              return { ...req, comments: [...(req.comments || []), newComment] };
          }
          return req;
      });

      onUpdate({ ...unit, requests: updatedRequests });
      setCommentDrafts(prev => ({ ...prev, [reqId]: '' }));
  };


  // --- BLUEPRINT INTERACTION LOGIC ---

  // 2. Handle Zone Drag & Drop
  const handleGridMouseDown = (e: React.MouseEvent, zone: Zone, type: 'drag' | 'resize') => {
      if (!isEditingBlueprint || !gridRef.current) return;
      e.stopPropagation(); // Prevent triggering parent clicks
      e.preventDefault();  // Prevent text selection

      const gridRect = gridRef.current.getBoundingClientRect();
      const cellWidth = gridRect.width / 12; // 12 column grid
      const cellHeight = gridRect.height / gridRows; // DYNAMIC row grid

      // Calculate initial mouse grid position
      const startGridX = Math.floor((e.clientX - gridRect.left) / cellWidth);
      const startGridY = Math.floor((e.clientY - gridRect.top) / cellHeight);

      setInteractionState({
          type,
          zoneId: zone.id,
          startGridX,
          startGridY,
          startLayout: { ...(zone.layout || {x:1,y:1,w:2,h:2,color:'#ccc', layerId: activeLayerId || undefined}) }
      });
      setSelectedZoneId(zone.id);
  };

  const handleGridMouseMove = (e: React.MouseEvent) => {
      if (interactionState.type === 'idle' || !gridRef.current || !interactionState.zoneId) return;

      const gridRect = gridRef.current.getBoundingClientRect();
      const cellWidth = gridRect.width / 12;
      const cellHeight = gridRect.height / gridRows; // DYNAMIC
      
      const currentGridX = Math.floor((e.clientX - gridRect.left) / cellWidth);
      const currentGridY = Math.floor((e.clientY - gridRect.top) / cellHeight);

      const deltaX = currentGridX - interactionState.startGridX;
      const deltaY = currentGridY - interactionState.startGridY;

      const zonesCopy = [...unit.zones];
      const zoneIndex = zonesCopy.findIndex(z => z.id === interactionState.zoneId);
      if (zoneIndex === -1) return;

      const zone = { ...zonesCopy[zoneIndex] };
      const baseLayout = interactionState.startLayout;

      if (interactionState.type === 'drag') {
          // Update X/Y
          let newX = baseLayout.x + deltaX;
          let newY = baseLayout.y + deltaY;
          
          // Boundaries (12 columns, gridRows rows)
          newX = Math.max(1, Math.min(newX, 13 - baseLayout.w));
          newY = Math.max(1, Math.min(newY, (gridRows + 1) - baseLayout.h)); // Use dynamic gridRows

          zone.layout = { ...baseLayout, x: newX, y: newY };

      } else if (interactionState.type === 'resize') {
          // Update W/H
          let newW = baseLayout.w + deltaX;
          let newH = baseLayout.h + deltaY;

          // Min Size & Boundaries
          newW = Math.max(1, Math.min(newW, 13 - baseLayout.x));
          newH = Math.max(1, Math.min(newH, (gridRows + 1) - baseLayout.y));

          zone.layout = { ...baseLayout, w: newW, h: newH };
      }

      // Optimistic update
      zonesCopy[zoneIndex] = zone;
      if (onUpdate) onUpdate({ ...unit, zones: zonesCopy });
  };

  const handleGridMouseUp = () => {
      setInteractionState({ type: 'idle', zoneId: null, startGridX: 0, startGridY: 0, startLayout: {x:0,y:0,w:0,h:0} });
  };

  const updateSelectedZoneDetails = (key: string, value: any) => {
      if (!selectedZoneId || !onUpdate) return;
      const zonesCopy = unit.zones.map(z => z.id === selectedZoneId ? { ...z, [key]: value } : z);
      if (key === 'color') {
           // Color is nested in layout
           const target = unit.zones.find(z => z.id === selectedZoneId);
           if (target) {
               zonesCopy.splice(zonesCopy.indexOf(target), 1, { ...target, layout: { ...target.layout!, color: value } });
           }
      }
      onUpdate({ ...unit, zones: zonesCopy });
  };


  // --- Personnel Actions ---
  const togglePersonnelSelection = (id: string) => {
    if (selectedPersonnelIds.includes(id)) {
      setSelectedPersonnelIds(selectedPersonnelIds.filter(pid => pid !== id));
    } else {
      setSelectedPersonnelIds([...selectedPersonnelIds, id]);
    }
  };

  const selectAllPersonnel = () => {
    if (selectedPersonnelIds.length === unit.resources.filter(r => r.type === ResourceType.PERSONNEL).length) {
      setSelectedPersonnelIds([]);
    } else {
      setSelectedPersonnelIds(unit.resources.filter(r => r.type === ResourceType.PERSONNEL).map(r => r.id));
    }
  };

  const handleMassAssignTraining = () => {
    if (!onUpdate) return;
    const newTraining: Training = {
      id: `t-${Date.now()}`,
      topic: massTrainingForm.topic,
      date: massTrainingForm.date,
      status: massTrainingForm.status as any,
    };
    const updatedResources = unit.resources.map(res => {
      if (res.type === ResourceType.PERSONNEL && selectedPersonnelIds.includes(res.id)) {
        return {
          ...res,
          trainings: [...(res.trainings || []), { ...newTraining, id: `t-${Date.now()}-${res.id}` }]
        };
      }
      return res;
    });
    onUpdate({ ...unit, resources: updatedResources });
    setShowMassTrainingModal(false);
    setSelectedPersonnelIds([]);
    setMassTrainingForm({ topic: '', date: '', status: 'Programado' });
  };

  const handleMassAssignAsset = async () => {
    if (!onUpdate) return;
    
    // Obtener trabajadores seleccionados
    const selectedWorkers = unit.resources.filter(
      r => r.type === ResourceType.PERSONNEL && selectedPersonnelIds.includes(r.id)
    );

    if (selectedWorkers.length === 0) {
      setNotification({ type: 'error', message: 'No hay trabajadores seleccionados' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    // Si se solicita generar constancia, generarla para cada trabajador ANTES de asignar
    if (generateConstancy) {
      try {
        console.log(`🔄 Iniciando generación de constancias para ${selectedWorkers.length} trabajador(es)`);
        const { constancyService } = await import('../services/constancyService');
        const { authService } = await import('../services/authService');
        
        const currentUser = await authService.getCurrentUser();
        console.log(`👤 Usuario actual:`, currentUser?.name || currentUser?.email || 'Sistema');
        
        // Generar constancias para cada trabajador y guardar códigos
        const constancyCodes: Record<string, string> = {};
        
        for (const worker of selectedWorkers) {
          console.log(`🔍 Procesando trabajador: ${worker.name} (ID: ${worker.id}, DNI: ${worker.dni || 'NO TIENE'})`);
          
          if (!worker.dni) {
            console.warn(`⚠️ Trabajador ${worker.name} no tiene DNI, saltando generación de constancia`);
            setNotification({ 
              type: 'error', 
              message: `El trabajador ${worker.name} no tiene DNI registrado. Se requiere DNI para generar constancia.` 
            });
            setTimeout(() => setNotification(null), 5000);
            continue;
          }

          try {
            const assetForConstancy: AssignedAsset = {
              id: `a-${Date.now()}-${worker.id}`,
              name: assetAssignmentForm.name,
              type: assetAssignmentForm.type as any,
              dateAssigned: assetAssignmentForm.dateAssigned || new Date().toISOString().split('T')[0],
              serialNumber: assetAssignmentForm.serialNumber
            };

            // Generar constancia (solo guardar en BD, no descargar PDF)
            console.log(`🔄 Generando constancia para trabajador ${worker.name} (DNI: ${worker.dni})`);
            const constancy = await constancyService.generateAssetConstancy(
              worker.id,
              worker.name,
              worker.dni,
              unit.id,
              unit.name,
              [assetForConstancy],
              currentUser?.name || currentUser?.email || 'Sistema'
            );

            console.log(`✅ Constancia generada: ${constancy.code} para trabajador ${worker.name}`);
            constancyCodes[worker.id] = constancy.code;
          } catch (error) {
            console.error(`❌ Error al generar constancia para ${worker.name}:`, error);
            setNotification({ 
              type: 'error', 
              message: `Error al generar constancia para ${worker.name}: ${error instanceof Error ? error.message : 'Error desconocido'}` 
            });
            setTimeout(() => setNotification(null), 5000);
            // Continuar con el siguiente trabajador
            continue;
          }
        }
        
        console.log(`📋 Códigos de constancia generados:`, constancyCodes);
        console.log(`📊 Total de códigos generados: ${Object.keys(constancyCodes).length} de ${selectedWorkers.length} trabajadores`);

        // Asignar activos con códigos de constancia
        const updatedResources = unit.resources.map(res => {
          if (res.type === ResourceType.PERSONNEL && selectedPersonnelIds.includes(res.id)) {
            const constancyCode = constancyCodes[res.id];
            if (!constancyCode) {
              console.warn(`⚠️ No se generó código de constancia para trabajador ${res.id}`);
            }
            
            const assetWithConstancy: AssignedAsset = {
              id: `a-${Date.now()}-${res.id}`,
              name: assetAssignmentForm.name,
              type: assetAssignmentForm.type as any,
              dateAssigned: assetAssignmentForm.dateAssigned || new Date().toISOString().split('T')[0],
              serialNumber: assetAssignmentForm.serialNumber,
              constancyCode: constancyCode || undefined,
              constancyGeneratedAt: constancyCode ? new Date().toISOString() : undefined,
              standardAssetId: assetAssignmentForm.standardAssetId || undefined
            };
            
            console.log(`💾 Guardando activo con constancia:`, {
              name: assetWithConstancy.name,
              worker: res.name,
              constancyCode: assetWithConstancy.constancyCode
            });
            
            return {
              ...res,
              assignedAssets: [...(res.assignedAssets || []), assetWithConstancy]
            };
          }
          return res;
        });

        // Cerrar modal ANTES de actualizar para evitar que se recargue y cierre
        setShowAssetAssignmentModal(false);
        setSelectedPersonnelIds([]);
        setAssetAssignmentForm({ name: '', type: 'EPP', dateAssigned: '', serialNumber: '' });
        setGenerateConstancy(true);
        
        // Actualizar unidad (esto guardará los activos con códigos de constancia)
        onUpdate({ ...unit, resources: updatedResources });
        
        setNotification({ 
          type: 'success', 
          message: `Activos asignados y constancias registradas para ${selectedWorkers.length} trabajador(es). Puedes descargar los PDFs desde cada registro.` 
        });
        setTimeout(() => setNotification(null), 5000);
      } catch (error) {
        console.error('Error al generar constancias:', error);
        setNotification({ 
          type: 'error', 
          message: 'Error al generar constancias. Los activos se asignaron pero las constancias no se generaron.' 
        });
        setTimeout(() => setNotification(null), 5000);
      }
    } else {
      // Si no se genera constancia, solo asignar activos
      const updatedResources = unit.resources.map(res => {
        if (res.type === ResourceType.PERSONNEL && selectedPersonnelIds.includes(res.id)) {
            const newAsset: AssignedAsset = {
              id: `a-${Date.now()}-${res.id}`,
              name: assetAssignmentForm.name,
              type: assetAssignmentForm.type as any,
              dateAssigned: assetAssignmentForm.dateAssigned || new Date().toISOString().split('T')[0],
              serialNumber: assetAssignmentForm.serialNumber,
              standardAssetId: assetAssignmentForm.standardAssetId || undefined
            };
          
          return {
            ...res,
            assignedAssets: [...(res.assignedAssets || []), newAsset]
          };
        }
        return res;
      });

      // Cerrar modal ANTES de actualizar
      setShowAssetAssignmentModal(false);
      setSelectedPersonnelIds([]);
      setAssetAssignmentForm({ name: '', type: 'EPP', dateAssigned: '', serialNumber: '', standardAssetId: undefined });
      setGenerateConstancy(true);
      setUseStandardAsset(true);
      
      onUpdate({ ...unit, resources: updatedResources });
      
      setNotification({ 
        type: 'success', 
        message: `Activos asignados a ${selectedWorkers.length} trabajador(es)` 
      });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleAddWorker = async () => {
    if (!onUpdate || !newWorkerForm.name) {
      setNotification({ type: 'error', message: 'Por favor, complete el nombre del trabajador' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    setIsSavingWorker(true);
    try {
      const { resourcesService } = await import('../services/resourcesService');
      const newWorker = await resourcesService.create({
        name: newWorkerForm.name,
        type: ResourceType.PERSONNEL,
        quantity: 1,
        status: StaffStatus.ACTIVE,
        assignedZones: newWorkerForm.zones,
        assignedShift: newWorkerForm.shift,
        compliancePercentage: 100,
        dni: newWorkerForm.dni || undefined,
        puesto: newWorkerForm.puesto || undefined,
        startDate: newWorkerForm.startDate || undefined,
        endDate: newWorkerForm.endDate || undefined,
        personnelStatus: newWorkerForm.endDate ? 'cesado' : 'activo',
        archived: false,
        trainings: [],
        assignedAssets: []
      }, unit.id);
      
      // Actualizar solo los recursos localmente para mantener el tab activo
      const updatedResources = [...unit.resources, newWorker];
      const currentTab = activeTabRef.current; // Guardar el tab actual
      onUpdate({ ...unit, resources: updatedResources });
      
      // Asegurar que el tab se mantenga
      setTimeout(() => {
        if (activeTab !== currentTab) {
          setActiveTab(currentTab);
        }
      }, 100);
      
      // Cerrar modal y limpiar formulario
      setShowAddWorkerModal(false);
      setNewWorkerForm({ name: '', zones: [], shift: '', dni: '', startDate: '', endDate: '' });
      setNotification({ type: 'success', message: 'Trabajador agregado correctamente' });
      setTimeout(() => setNotification(null), 3000);
      
      // Recargar en segundo plano para sincronizar con BD (sin afectar la UI)
      setTimeout(async () => {
        try {
          const { unitsService } = await import('../services/unitsService');
          const refreshedUnit = await unitsService.getById(unit.id);
          if (refreshedUnit && onUpdate) {
            const savedTab = activeTabRef.current; // Guardar el tab antes de actualizar
            onUpdate({ ...refreshedUnit });
            // Restaurar el tab activo después de la actualización
            setTimeout(() => {
              if (activeTab !== savedTab) {
                setActiveTab(savedTab);
              }
            }, 50);
          }
        } catch (error) {
          console.error('Error al sincronizar unidad:', error);
        }
      }, 500);
    } catch (error) {
      console.error('Error al agregar trabajador:', error);
      setNotification({ type: 'error', message: 'Error al agregar el trabajador. Por favor, intente nuevamente.' });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setIsSavingWorker(false);
    }
  };

  const handleBulkImport = async (file: File) => {
    if (!onUpdate) return;
    
    setIsImporting(true);
    setImportResult(null);
    
    try {
      const { excelService } = await import('../services/excelService');
      const { resourcesService } = await import('../services/resourcesService');
      
      // Importar datos del Excel
      const { data: personnelData, result } = await excelService.importPersonnelFromExcel(file);
      
      setImportResult(result);
      
      if (personnelData.length === 0) {
        setNotification({ 
          type: 'error', 
          message: 'No se encontraron datos válidos en el archivo Excel' 
        });
        setTimeout(() => setNotification(null), 5000);
        return;
      }
      
      // Crear trabajadores
      const createdWorkers: Resource[] = [];
      const errors: Array<{ row: number; error: string }> = [];
      
      for (let i = 0; i < personnelData.length; i++) {
        const row = personnelData[i];
        try {
          // Parsear zonas (separadas por coma o punto y coma)
          const zones = row.zonas 
            ? row.zonas.split(/[,;]/).map(z => z.trim()).filter(z => z !== '')
            : [];
          
          // Normalizar turno
          let shift = row.turno?.trim() || '';
          if (shift) {
            const shiftLower = shift.toLowerCase();
            if (shiftLower.includes('diurno')) shift = 'Diurno';
            else if (shiftLower.includes('nocturno')) shift = 'Nocturno';
            else if (shiftLower.includes('mixto')) shift = 'Mixto';
          }
          
          const newWorker = await resourcesService.create({
            name: row.nombre.trim(),
            type: ResourceType.PERSONNEL,
            quantity: 1,
            status: StaffStatus.ACTIVE,
            assignedZones: zones,
            assignedShift: shift || undefined,
            compliancePercentage: 100,
            dni: row.dni?.trim() || undefined,
            puesto: row.puesto?.trim() || undefined,
            startDate: row.fechaInicio || undefined,
            endDate: row.fechaFin || undefined,
            personnelStatus: row.fechaFin ? 'cesado' : 'activo',
            archived: false,
            trainings: [],
            assignedAssets: []
          }, unit.id);
          
          createdWorkers.push(newWorker);
        } catch (error: any) {
          errors.push({
            row: i + 2, // +2 porque la primera fila es encabezados y empezamos desde 0
            error: error.message || 'Error al crear trabajador'
          });
        }
      }
      
      // Actualizar unidad con los nuevos trabajadores
      const updatedResources = [...unit.resources, ...createdWorkers];
      onUpdate({ ...unit, resources: updatedResources });
      
      // Mostrar resultado
      if (createdWorkers.length > 0) {
        setNotification({ 
          type: 'success', 
          message: `Se importaron ${createdWorkers.length} trabajador(es) correctamente${errors.length > 0 ? `. ${errors.length} error(es).` : '.'}` 
        });
        setTimeout(() => setNotification(null), 5000);
      }
      
      if (errors.length > 0) {
        setImportResult({
          ...result,
          failed: errors.length,
          errors: [...result.errors, ...errors]
        });
      }
    } catch (error: any) {
      console.error('Error al importar trabajadores:', error);
      setNotification({ 
        type: 'error', 
        message: `Error al importar: ${error.message || 'Error desconocido'}` 
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setIsImporting(false);
    }
  };

  // NEW: Helper to add single Training/Asset directly from expanded view
  const handleAddSingleTraining = (resourceId: string) => {
      setSelectedPersonnelIds([resourceId]);
      setShowMassTrainingModal(true);
  };

  const handleAddSingleAsset = (resourceId: string) => {
      setSelectedPersonnelIds([resourceId]);
      setShowAssetAssignmentModal(true);
  };
  
  const handleDeleteTraining = (resourceId: string, trainingId: string) => {
      if(!onUpdate) return;
      const updatedResources = unit.resources.map(r => {
          if (r.id === resourceId) {
              return { ...r, trainings: r.trainings?.filter(t => t.id !== trainingId) };
          }
          return r;
      });
      onUpdate({ ...unit, resources: updatedResources });
  };

  const handleDeleteAsset = (resourceId: string, assetId: string) => {
      if(!onUpdate) return;
      const updatedResources = unit.resources.map(r => {
          if (r.id === resourceId) {
              return { ...r, assignedAssets: r.assignedAssets?.filter(a => a.id !== assetId) };
          }
          return r;
      });
      onUpdate({ ...unit, resources: updatedResources });
  };

  // Función para generar y descargar PDF de constancia a demanda
  const handleDownloadConstancyPDF = async (worker: Resource, asset: AssignedAsset) => {
    if (!asset.constancyCode) {
      setNotification({ 
        type: 'error', 
        message: 'Este activo no tiene constancia registrada. Asigna el activo nuevamente con la opción de generar constancia.' 
      });
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    if (!worker.dni) {
      setNotification({ 
        type: 'error', 
        message: 'El trabajador no tiene DNI registrado. No se puede generar la constancia.' 
      });
      setTimeout(() => setNotification(null), 5000);
      return;
    }

    try {
      const { constancyService } = await import('../services/constancyService');
      const { pdfConstancyService } = await import('../services/pdfConstancyService');

      // Obtener la constancia desde la BD
      const constancy = await constancyService.getByCode(asset.constancyCode);
      
      if (!constancy) {
        setNotification({ 
          type: 'error', 
          message: 'No se encontró la constancia en la base de datos.' 
        });
        setTimeout(() => setNotification(null), 5000);
        return;
      }

      // Generar y descargar PDF
      pdfConstancyService.downloadPDF({
        code: constancy.code,
        workerName: worker.name,
        workerDni: worker.dni,
        unitName: unit.name,
        date: constancy.date,
        items: constancy.items,
        constancyType: 'ASSET',
      }, `constancia-${constancy.code}-${worker.name.replace(/\s+/g, '-')}.pdf`);

      setNotification({ 
        type: 'success', 
        message: 'PDF de constancia descargado correctamente' 
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error('Error al generar PDF de constancia:', error);
      setNotification({ 
        type: 'error', 
        message: 'Error al generar el PDF. Por favor, intente nuevamente.' 
      });
      setTimeout(() => setNotification(null), 5000);
    }
  };


  const togglePersonnelExpand = (id: string) => {
    setExpandedPersonnel(expandedPersonnel === id ? null : id);
  };
  
  const toggleEquipmentExpand = (id: string) => {
    setExpandedEquipment(expandedEquipment === id ? null : id);
  };

  // --- ROSTERING LOGIC ---
  const changeRosterDate = (days: number) => {
      const newDate = new Date(rosterStartDate);
      newDate.setDate(newDate.getDate() + days);
      setRosterStartDate(getMonday(newDate));
  };

  const getRosterDates = () => {
      const dates = [];
      const monday = new Date(rosterStartDate);
      for (let i = 0; i < 7; i++) {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          dates.push(d);
      }
      return dates;
  };

  const handleRosterShiftChange = (resourceId: string, date: string, currentType: ShiftType) => {
     if(!onUpdate) return;
     
     // Cycle: Day -> Night -> OFF -> Day
     let nextType: ShiftType = 'Day';
     let hours = 8;
     if (currentType === 'Day') { nextType = 'Night'; hours = 8; }
     else if (currentType === 'Night') { nextType = 'OFF'; hours = 0; }
     else if (currentType === 'OFF') { nextType = 'Day'; hours = 8; }
     else { nextType = 'Day'; hours = 8; }

     const updatedResources = unit.resources.map(r => {
         if (r.id === resourceId) {
             const schedule = r.workSchedule ? [...r.workSchedule] : [];
             const existingIdx = schedule.findIndex(s => s.date === date);
             if (existingIdx >= 0) {
                 schedule[existingIdx] = { date, type: nextType, hours };
             } else {
                 schedule.push({ date, type: nextType, hours });
             }
             return { ...r, workSchedule: schedule };
         }
         return r;
     });
     onUpdate({ ...unit, resources: updatedResources });
  };

  const handleReplicateWeek = () => {
      if (!onUpdate) return;
      
      const currentWeekDates = getRosterDates().map(d => d.toISOString().split('T')[0]);
      
      const updatedResources = unit.resources.map(r => {
          if (r.type !== ResourceType.PERSONNEL) return r;
          
          const schedule = r.workSchedule ? [...r.workSchedule] : [];
          
          // Iterate over current week dates to find shifts to copy
          currentWeekDates.forEach(dateStr => {
              const shift = schedule.find(s => s.date === dateStr);
              if (shift) {
                  // Calculate target date (+7 days)
                  const targetDate = new Date(dateStr);
                  targetDate.setDate(targetDate.getDate() + 7);
                  const targetDateStr = targetDate.toISOString().split('T')[0];
                  
                  // Remove existing shift at target date if any
                  const existingIdx = schedule.findIndex(s => s.date === targetDateStr);
                  if (existingIdx > -1) schedule.splice(existingIdx, 1);
                  
                  // Add copy
                  schedule.push({
                      date: targetDateStr,
                      type: shift.type,
                      hours: shift.hours
                  });
              }
          });
          
          return { ...r, workSchedule: schedule };
      });
      
      onUpdate({ ...unit, resources: updatedResources });
      alert("Se han replicado los turnos a la próxima semana.");
  };

  const getShiftColor = (type: string) => {
      switch(type) {
          case 'Day': return 'bg-blue-500 text-white hover:bg-blue-600';
          case 'Night': return 'bg-indigo-600 text-white hover:bg-indigo-700';
          case 'OFF': return 'bg-slate-200 text-slate-500 hover:bg-slate-300';
          case 'Vacation': return 'bg-orange-400 text-white hover:bg-orange-500';
          default: return 'bg-slate-100 text-slate-400 hover:bg-slate-200';
      }
  };


  // --- Logistics Actions (Updated for Integration) ---
  const handleSyncInventory = async (resource: Resource) => {
     if (!onUpdate || !resource.externalId) return;
     
     setIsSyncing(resource.id);
     try {
         const externalData = await syncResourceWithInventory(resource.externalId);
         if (externalData) {
             const updatedResources = unit.resources.map(r => r.id === resource.id ? {
                 ...r,
                 quantity: externalData.currentStock,
                 status: externalData.status === 'Disponible' ? (r.type === ResourceType.MATERIAL ? 'Stock OK' : 'Operativo') : externalData.status,
                 lastSync: new Date().toISOString()
             } : r);
             onUpdate({ ...unit, resources: updatedResources });
             // If editing, update form too
             if (editingResource?.id === resource.id) {
                 setEditingResource({
                     ...editingResource,
                     quantity: externalData.currentStock,
                     status: externalData.status === 'Disponible' ? (editingResource.type === ResourceType.MATERIAL ? 'Stock OK' : 'Operativo') : externalData.status,
                     lastSync: new Date().toISOString()
                 });
             }
         } else {
             alert('No se encontró el SKU en el sistema externo.');
         }
     } catch (e) {
         console.error(e);
         alert('Error de conexión con App de Inventarios.');
     } finally {
         setIsSyncing(null);
     }
  };

  const handleUpdateResource = async () => {
    if (!onUpdate || !editingResource) return;
    setIsUpdatingResource(true);
    try {
      const { resourcesService } = await import('../services/resourcesService');
      await resourcesService.update(editingResource.id, editingResource);
      
      // Actualizar solo el recurso localmente para mantener el tab activo
      const updatedResources = unit.resources.map(r => r.id === editingResource.id ? editingResource : r);
      const currentTab = activeTabRef.current; // Guardar el tab actual
      onUpdate({ ...unit, resources: updatedResources });
      
      // Asegurar que el tab se mantenga
      setTimeout(() => {
        if (activeTab !== currentTab) {
          setActiveTab(currentTab);
        }
      }, 100);
      
      // Cerrar modal y mostrar notificación
      setEditingResource(null);
      setNotification({ type: 'success', message: 'Trabajador actualizado correctamente' });
      setTimeout(() => setNotification(null), 3000);
      
      // Recargar en segundo plano para sincronizar con BD (sin afectar la UI)
      setTimeout(async () => {
        try {
          const { unitsService } = await import('../services/unitsService');
          const refreshedUnit = await unitsService.getById(unit.id);
          if (refreshedUnit && onUpdate) {
            const savedTab = activeTabRef.current; // Guardar el tab antes de actualizar
            onUpdate({ ...refreshedUnit });
            // Restaurar el tab activo después de la actualización
            setTimeout(() => {
              if (activeTab !== savedTab) {
                setActiveTab(savedTab);
              }
            }, 50);
          }
        } catch (error) {
          console.error('Error al sincronizar unidad:', error);
        }
      }, 500);
    } catch (error) {
      console.error('Error al actualizar trabajador:', error);
      setNotification({ type: 'error', message: 'Error al actualizar el trabajador. Por favor, intente nuevamente.' });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setIsUpdatingResource(false);
    }
  };

  const handleDeleteResource = () => {
    if (!onUpdate || !editingResource) return;
    if (confirm('¿Estás seguro de eliminar este recurso?')) {
      const updatedResources = unit.resources.filter(r => r.id !== editingResource.id);
      onUpdate({ ...unit, resources: updatedResources });
      setEditingResource(null);
    }
  };

  const handleAddResource = async () => {
    if (!onUpdate) return;
    const newResource: Resource = {
      id: `r-${Date.now()}`,
      name: newResourceForm.name || 'Nuevo Recurso',
      type: newResourceType,
      quantity: newResourceForm.quantity || 1,
      status: newResourceType === ResourceType.MATERIAL ? 'Stock OK' : 'Operativo',
      unitOfMeasure: newResourceForm.unitOfMeasure,
      assignedZones: newResourceForm.assignedZones || [],
      nextMaintenance: newResourceForm.nextMaintenance,
      lastRestock: newResourceForm.lastRestock,
      image: newResourceForm.image,
      externalId: newResourceForm.externalId // SKU
    };

    // Si es equipo y se solicita generar constancia
    if (newResourceType === ResourceType.EQUIPMENT && generateEquipmentConstancy && equipmentResponsibleWorkerId) {
      try {
        const responsibleWorker = unit.resources.find(r => r.id === equipmentResponsibleWorkerId && r.type === ResourceType.PERSONNEL);
        
        if (!responsibleWorker) {
          setNotification({ type: 'error', message: 'Trabajador responsable no encontrado' });
          setTimeout(() => setNotification(null), 3000);
          return;
        }

        if (!responsibleWorker.dni) {
          setNotification({ 
            type: 'error', 
            message: `El trabajador ${responsibleWorker.name} no tiene DNI registrado. Se requiere DNI para generar constancia.` 
          });
          setTimeout(() => setNotification(null), 5000);
          return;
        }

        const { constancyService } = await import('../services/constancyService');
        const { pdfConstancyService } = await import('../services/pdfConstancyService');
        const { authService } = await import('../services/authService');
        
        const currentUser = await authService.getCurrentUser();

        // Generar constancia de maquinaria
        const constancy = await constancyService.generateEquipmentConstancy(
          responsibleWorker.id,
          responsibleWorker.name,
          responsibleWorker.dni,
          unit.id,
          unit.name,
          newResource,
          currentUser?.name || currentUser?.email || 'Sistema'
        );

        // Generar y descargar PDF
        pdfConstancyService.downloadPDF({
          code: constancy.code,
          workerName: responsibleWorker.name,
          workerDni: responsibleWorker.dni,
          unitName: unit.name,
          date: constancy.date,
          items: constancy.items,
          constancyType: 'EQUIPMENT',
        }, `constancia-maquinaria-${constancy.code}-${responsibleWorker.name.replace(/\s+/g, '-')}.pdf`);

        setNotification({ 
          type: 'success', 
          message: `Constancia de maquinaria generada y descargada` 
        });
        setTimeout(() => setNotification(null), 5000);
      } catch (error) {
        console.error('Error al generar constancia de maquinaria:', error);
        setNotification({ 
          type: 'error', 
          message: 'Error al generar constancia. El equipo se registró pero la constancia no se generó.' 
        });
        setTimeout(() => setNotification(null), 5000);
      }
    }

    onUpdate({ ...unit, resources: [...unit.resources, newResource] });
    setShowAddResourceModal(false);
    setNewResourceForm({ name: '', quantity: 1, status: 'Operativo', externalId: '', assignedZones: [] });
    setEquipmentResponsibleWorkerId('');
    setGenerateEquipmentConstancy(false);
  };

  const openAddResourceModal = (type: ResourceType) => {
    setNewResourceType(type);
    setNewResourceForm({ name: '', quantity: 1, status: type === ResourceType.MATERIAL ? 'Stock OK' : 'Operativo', externalId: '', assignedZones: [] });
    setEquipmentResponsibleWorkerId('');
    setGenerateEquipmentConstancy(false);
    setShowAddResourceModal(true);
  }

  // --- Maintenance History (Equipment) Actions ---
  const toggleMaintenanceResponsible = (id: string) => {
      if (newMaintenanceResponsibles.includes(id)) {
          setNewMaintenanceResponsibles(newMaintenanceResponsibles.filter(r => r !== id));
      } else {
          setNewMaintenanceResponsibles([...newMaintenanceResponsibles, id]);
      }
  };

  const handleAddImageToMaintenance = () => {
    if (!newMaintenanceImageUrl) return;
    setNewMaintenanceImages([...newMaintenanceImages, newMaintenanceImageUrl]);
    setNewMaintenanceImageUrl('');
  };

  const handleFileUploadForMaintenance = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const imageUrl = URL.createObjectURL(file);
      setNewMaintenanceImages([...newMaintenanceImages, imageUrl]);
    }
  };

  const handleAddMaintenance = () => {
    if (!onUpdate || !maintenanceResource) return;
    
    const newRecord: MaintenanceRecord = {
        id: `m-${Date.now()}`,
        date: newMaintenanceForm.date,
        type: newMaintenanceForm.type as any,
        description: newMaintenanceForm.description,
        technician: newMaintenanceForm.technician,
        status: 'Realizado',
        responsibleIds: newMaintenanceResponsibles,
        images: newMaintenanceImages
    };

    const updatedResource = {
        ...maintenanceResource,
        maintenanceHistory: [...(maintenanceResource.maintenanceHistory || []), newRecord]
    };

    const updatedResources = unit.resources.map(r => r.id === maintenanceResource.id ? updatedResource : r);
    onUpdate({ ...unit, resources: updatedResources });
    
    // Update local state and close modal
    setMaintenanceResource(null); // Close modal after saving
    setNewMaintenanceForm({ date: '', type: 'Preventivo', description: '', technician: '' });
    setNewMaintenanceResponsibles([]);
    setNewMaintenanceImages([]);
  };

  // --- Event/Log Actions ---
  const toggleEventResponsible = (id: string) => {
    if (newEventResponsibles.includes(id)) {
        setNewEventResponsibles(newEventResponsibles.filter(r => r !== id));
    } else {
        setNewEventResponsibles([...newEventResponsibles, id]);
    }
  };

  const toggleEditLogResponsible = (id: string) => {
    if (!editingLog) return;
    const current = editingLog.responsibleIds || [];
    if (current.includes(id)) {
        setEditingLog({...editingLog, responsibleIds: current.filter(r => r !== id)});
    } else {
        setEditingLog({...editingLog, responsibleIds: [...current, id]});
    }
  };

  const handleCreateEvent = () => {
    if (!onUpdate) return;
    const newLog: OperationalLog = {
      id: `l-${Date.now()}`,
      date: newEventForm.date,
      type: newEventForm.type as any,
      description: newEventForm.description,
      author: userRole === 'OPERATIONS' ? 'Operaciones' : 'Admin',
      images: newEventImages,
      responsibleIds: newEventResponsibles
    };
    onUpdate({ ...unit, logs: [...unit.logs, newLog] });
    setShowEventModal(false);
    setNewEventForm({ type: 'Coordinacion', date: '', description: '' });
    setNewEventImages([]);
    setNewEventResponsibles([]);
  };

  const handleAddImageToNewEvent = () => {
    if (!newEventImageUrl) return;
    setNewEventImages([...newEventImages, newEventImageUrl]);
    setNewEventImageUrl('');
  };

  const handleFileUploadForNewEvent = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const imageUrl = URL.createObjectURL(file);
      setNewEventImages([...newEventImages, imageUrl]);
    }
  };

  const handleUpdateLog = () => {
    if (!onUpdate || !editingLog) return;
    const updatedLogs = unit.logs.map(l => l.id === editingLog.id ? editingLog : l);
    onUpdate({ ...unit, logs: updatedLogs });
    setEditingLog(null);
  };

  const handleAddImageToLog = () => {
    if (!editingLog || !newLogImageUrl) return;
    setEditingLog({
      ...editingLog,
      images: [...(editingLog.images || []), newLogImageUrl]
    });
    setNewLogImageUrl('');
  };

  const handleFileUploadForLog = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (editingLog && e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const imageUrl = URL.createObjectURL(file);
        setEditingLog({
            ...editingLog,
            images: [...(editingLog.images || []), imageUrl]
        });
    }
  };

  // --- Helper Data ---
  const personnel = unit.resources.filter(r => r.type === ResourceType.PERSONNEL && !r.archived);
  const equipment = unit.resources.filter(r => r.type === ResourceType.EQUIPMENT);
  const materials = unit.resources.filter(r => r.type === ResourceType.MATERIAL);

  const getUpcomingEvents = () => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const events = [
      ...unit.logs.filter(l => new Date(l.date) >= today).map(l => ({ date: l.date, title: l.type, desc: l.description, type: 'log' })),
      ...unit.resources.filter(r => r.nextMaintenance && new Date(r.nextMaintenance) >= today).map(r => ({ date: r.nextMaintenance!, title: 'Mantenimiento', desc: `Equipo: ${r.name}`, type: 'maintenance' })),
      ...unit.resources.flatMap(r => r.trainings || []).filter(t => t.status === 'Programado' || (new Date(t.date) >= today && t.status !== 'Completado')).map(t => ({ date: t.date, title: 'Capacitación', desc: t.topic, type: 'training' }))
    ];
    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };
  const upcomingEvents = getUpcomingEvents();

  const getAssetIcon = (type: string) => {
    switch (type) {
        case 'Uniforme': return <Shirt size={16} className="text-blue-500" />;
        case 'Tecnologia': return <Laptop size={16} className="text-purple-500" />;
        case 'EPP': return <HardHat size={16} className="text-orange-500" />;
        default: return <Briefcase size={16} className="text-slate-500" />;
    }
  };

  const getPersonName = (id: string) => {
     const worker = personnel.find(p => p.id === id);
     if (worker) return worker.name;
     const manager = availableStaff.find(m => m.id === id);
     if (manager) return manager.name;
     return id;
  };

  // Helper component for multi-zone selection
  const ZoneMultiSelect = ({ selectedZones, onChange }: { selectedZones: string[], onChange: (zones: string[]) => void }) => {
     const toggleZone = (zoneName: string) => {
        if (selectedZones.includes(zoneName)) {
           onChange(selectedZones.filter(z => z !== zoneName));
        } else {
           onChange([...selectedZones, zoneName]);
        }
     }
     
     return (
        <div className="border border-slate-300 rounded-lg p-2 max-h-32 overflow-y-auto bg-white">
           {unit.zones.map(z => (
               <label key={z.id} className="flex items-center p-1 hover:bg-slate-50 cursor-pointer text-sm">
                   <input 
                      type="checkbox" 
                      className="mr-2"
                      checked={selectedZones.includes(z.name)}
                      onChange={() => toggleZone(z.name)}
                   />
                   <span className="text-slate-700">{z.name}</span>
               </label>
           ))}
           {unit.zones.length === 0 && <span className="text-xs text-slate-400 italic p-1">No hay zonas definidas.</span>}
        </div>
     );
  };

  // --- CLIENT REQUESTS RENDERER ---
  const renderClientRequests = () => {
    const requests = unit.requests || [];
    
    return (
        <div className="space-y-6 animate-in fade-in duration-300 pb-10">
            <div className="flex justify-between items-center mb-4">
                <div>
                   <h3 className="font-bold text-slate-700 text-lg flex items-center"><MessageSquarePlus className="mr-2"/> Requerimientos y Observaciones</h3>
                   <p className="text-slate-500 text-sm">Solicitudes directas del cliente y seguimiento de acuerdos.</p>
                </div>
                {canCreateRequests && (
                    <button 
                       onClick={() => setShowRequestModal(true)} 
                       className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center shadow-sm"
                    >
                        <Plus size={16} className="mr-1.5"/> Nueva Solicitud
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 gap-4">
                {requests.length === 0 && (
                    <div className="bg-slate-50 rounded-xl border border-slate-200 border-dashed p-10 flex flex-col items-center justify-center text-slate-400">
                        <MessageSquarePlus size={48} className="mb-4 opacity-30"/>
                        <p className="font-medium">No hay requerimientos registrados.</p>
                    </div>
                )}
                
                {requests.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(req => {
                    const relatedRes = req.relatedResourceId ? unit.resources.find(r => r.id === req.relatedResourceId) : null;
                    const hasAttachments = req.attachments && req.attachments.length > 0;

                    return (
                        <div key={req.id} className={`bg-white rounded-xl border shadow-sm transition-shadow hover:shadow-md ${req.status === 'RESOLVED' ? 'border-l-4 border-l-green-500 border-slate-200' : 'border-l-4 border-l-yellow-500 border-slate-200'}`}>
                             <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
                                 {/* LEFT COLUMN: DETAILS */}
                                 <div className="lg:col-span-2 p-5 border-b lg:border-b-0 lg:border-r border-slate-100">
                                     <div className="flex justify-between items-start mb-3">
                                         <div>
                                             <div className="flex items-center gap-2 mb-1">
                                                 <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${REQUEST_STATUS_STYLES[req.status]}`}>
                                                     {req.status === 'IN_PROGRESS' ? 'En Proceso' : req.status === 'RESOLVED' ? 'Resuelto' : 'Pendiente'}
                                                 </span>
                                                 <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${PRIORITY_STYLES[req.priority]}`}>
                                                     {req.priority === 'HIGH' ? 'Alta' : req.priority === 'MEDIUM' ? 'Media' : 'Baja'}
                                                 </span>
                                                 <span className="text-xs text-slate-400 font-mono">{req.date}</span>
                                             </div>
                                             <h4 className="font-bold text-slate-800 text-sm">
                                                 {req.category === 'PERSONNEL' ? 'Personal' : req.category === 'LOGISTICS' ? 'Logística' : 'General'}
                                                 {relatedRes && <span className="font-normal text-slate-500 ml-1">sobre: {relatedRes.name}</span>}
                                             </h4>
                                         </div>
                                         
                                         {/* Old Edit Button - Kept for Resolving/Changing Status */}
                                         <button 
                                            onClick={() => {
                                                setEditingRequest(req);
                                                setResolveAttachments(req.responseAttachments || []);
                                            }} 
                                            className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-medium transition-colors border border-slate-200"
                                            title="Gestionar Estado / Resolver"
                                         >
                                             <Edit2 size={14}/>
                                         </button>
                                     </div>
                                     
                                     <p className="text-slate-700 text-sm mb-4 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                                        "{req.description}"
                                     </p>

                                     {hasAttachments && (
                                         <div className="mb-4">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center"><Paperclip size={10} className="mr-1"/> Evidencias Cliente</p>
                                            <div className="flex gap-2 overflow-x-auto pb-1">
                                                {req.attachments!.map((img, i) => (
                                                    <div key={i} className="w-16 h-16 shrink-0 rounded border border-slate-200 overflow-hidden bg-slate-100">
                                                        <img src={img} className="w-full h-full object-cover" alt="client attachment" />
                                                    </div>
                                                ))}
                                            </div>
                                         </div>
                                     )}

                                     <div className="text-xs text-slate-400 flex items-center justify-between border-t border-slate-50 pt-2">
                                         <span>Autor: {req.author}</span>
                                         {req.resolvedDate && <span className="text-green-600 font-bold flex items-center"><CheckCircle size={12} className="mr-1"/> Resuelto el: {req.resolvedDate}</span>}
                                     </div>

                                     {/* Resolved Response Preview */}
                                     {req.status === 'RESOLVED' && req.response && (
                                         <div className="mt-2 pt-2 border-t border-slate-100">
                                             <p className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center"><UserCheck size={12} className="mr-1"/> Solución Final:</p>
                                             <p className="text-sm text-slate-600 line-clamp-2">{req.response}</p>
                                         </div>
                                     )}
                                 </div>

                                 {/* RIGHT COLUMN: INLINE CHAT */}
                                 <div className="bg-slate-50/50 flex flex-col h-full min-h-[250px] lg:h-auto border-l border-slate-100">
                                     <div className="p-3 border-b border-slate-200 bg-slate-50">
                                         <h6 className="text-[10px] uppercase font-bold text-slate-500 flex items-center">
                                             <MessageCircle size={12} className="mr-1.5" /> Discusión / Chat
                                         </h6>
                                     </div>
                                     
                                     {/* Scrollable Messages */}
                                     <div className="flex-1 p-3 overflow-y-auto custom-scrollbar space-y-3 max-h-60 lg:max-h-80">
                                        {(!req.comments || req.comments.length === 0) ? (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-300">
                                                <MessageSquarePlus size={24} className="mb-1 opacity-50"/>
                                                <span className="text-xs">Sin comentarios</span>
                                            </div>
                                        ) : (
                                            req.comments.map(comment => (
                                                <div key={comment.id} className={`flex flex-col ${comment.role === userRole ? 'items-end' : 'items-start'}`}>
                                                    <div className={`relative px-3 py-2 rounded-lg text-xs max-w-[90%] ${
                                                        comment.role === userRole 
                                                        ? 'bg-blue-100 text-blue-900 rounded-br-none' 
                                                        : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'
                                                    }`}>
                                                        <p>{comment.text}</p>
                                                    </div>
                                                    <span className="text-[9px] text-slate-400 mt-1 px-1">
                                                    {comment.author}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                     </div>

                                     {/* Input Area */}
                                     <div className="p-3 border-t border-slate-200 bg-white">
                                         <div className="flex gap-2">
                                             <input 
                                                 type="text" 
                                                 className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                                 placeholder="Escribir comentario..."
                                                 value={commentDrafts[req.id] || ''}
                                                 onChange={(e) => setCommentDrafts({...commentDrafts, [req.id]: e.target.value})}
                                                 onKeyDown={(e) => e.key === 'Enter' && handleInlineCommentSubmit(req.id)}
                                             />
                                             <button 
                                                 onClick={() => handleInlineCommentSubmit(req.id)} 
                                                 disabled={!commentDrafts[req.id]?.trim()} 
                                                 className="bg-slate-800 text-white p-1.5 rounded-md hover:bg-slate-900 disabled:opacity-50 transition-colors"
                                             >
                                                 <Send size={14} />
                                             </button>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
  };


  // --- BLUEPRINT RENDERER ---
  const renderBlueprint = () => {
    const selectedZone = unit.zones.find(z => z.id === selectedZoneId);
    
    // Filter resources that have this zone in their assignedZones array
    const zoneResources = selectedZone ? unit.resources.filter(r => r.assignedZones?.includes(selectedZone.name)) : [];
    
    // Split for better display in sidebar
    const zonePersonnel = zoneResources.filter(r => r.type === ResourceType.PERSONNEL);
    const zoneEquipment = zoneResources.filter(r => r.type === ResourceType.EQUIPMENT);
    const zoneMaterials = zoneResources.filter(r => r.type === ResourceType.MATERIAL);

    // Summary Calculations for Header
    const totalArea = unit.zones.reduce((acc, z) => acc + (z.area || 0), 0);
    const totalPersonnel = unit.resources.filter(r => r.type === ResourceType.PERSONNEL).length;
    const totalEquipment = unit.resources.filter(r => r.type === ResourceType.EQUIPMENT).length;
    const totalMaterials = unit.resources.filter(r => r.type === ResourceType.MATERIAL).length;
    
    // Filter zones for current layer
    const activeLayers = unit.blueprintLayers || [];
    const currentZones = unit.zones.filter(z => !activeLayerId || z.layout?.layerId === activeLayerId || (!z.layout?.layerId && activeLayers.length > 0 && activeLayerId === activeLayers[0].id));

    return (
    <div className="flex flex-col h-full animate-in fade-in duration-300 pb-10">
       
       {/* 1. TOP SUMMARY HEADER */}
       <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                  <p className="text-xs text-slate-500 uppercase font-bold">Área Total</p>
                  <p className="text-xl font-bold text-slate-800">{totalArea} m²</p>
              </div>
              <div className="p-2 bg-slate-100 rounded-lg text-slate-500"><Maximize size={20}/></div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                  <p className="text-xs text-slate-500 uppercase font-bold">Dotación Total</p>
                  <p className="text-xl font-bold text-slate-800">{totalPersonnel}</p>
              </div>
              <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><Users size={20}/></div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                  <p className="text-xs text-slate-500 uppercase font-bold">Maquinaria</p>
                  <p className="text-xl font-bold text-slate-800">{totalEquipment}</p>
              </div>
              <div className="p-2 bg-orange-100 rounded-lg text-orange-600"><Truck size={20}/></div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                  <p className="text-xs text-slate-500 uppercase font-bold">Insumos/Mat</p>
                  <p className="text-xl font-bold text-slate-800">{totalMaterials}</p>
              </div>
              <div className="p-2 bg-purple-100 rounded-lg text-purple-600"><Package size={20}/></div>
          </div>
       </div>

       {/* Toolbar & Layer Tabs */}
       <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm sticky top-0 z-20 mb-4">
           <div className="flex justify-between items-center mb-4">
               <div>
                   <h3 className="font-bold text-slate-700 text-lg flex items-center"><LayoutGrid className="mr-2"/> Plano de Distribución</h3>
                   <p className="text-xs text-slate-500">Distribución de zonas por niveles.</p>
               </div>
               {canEditBlueprint && (
                   <button 
                      onClick={() => setIsEditingBlueprint(!isEditingBlueprint)} 
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm ${isEditingBlueprint ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                   >
                       {isEditingBlueprint ? <CheckSquare size={16} className="mr-2"/> : <Edit2 size={16} className="mr-2"/>} 
                       {isEditingBlueprint ? 'Finalizar Edición' : 'Editar Plano'}
                   </button>
               )}
           </div>

           {/* Layer Tabs */}
           <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-100">
                {activeLayers.map(layer => (
                    <div 
                        key={layer.id}
                        className={`px-4 py-2 rounded-t-lg text-sm font-medium cursor-pointer flex items-center gap-2 border-b-2 transition-colors
                            ${activeLayerId === layer.id ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
                        `}
                        onClick={() => setActiveLayerId(layer.id)}
                    >
                        <Layers size={14}/>
                        {isEditingBlueprint ? (
                            <input 
                                type="text" 
                                className="bg-transparent border-b border-slate-300 outline-none w-20 text-xs" 
                                value={layer.name} 
                                onChange={(e) => handleRenameLayer(layer.id, e.target.value)}
                                onClick={e => e.stopPropagation()}
                            />
                        ) : (
                            <span>{layer.name}</span>
                        )}
                        {isEditingBlueprint && (
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteLayer(layer.id); }} className="text-slate-300 hover:text-red-500"><X size={12}/></button>
                        )}
                    </div>
                ))}
                
                {isEditingBlueprint && (
                    <button onClick={handleAddLayer} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-full transition-colors" title="Agregar Nivel/Página">
                        <Plus size={16}/>
                    </button>
                )}
           </div>
       </div>

       <div className="flex flex-col lg:flex-row gap-6 h-[700px] lg:h-[600px]">
           {/* MAP CANVAS */}
           <div 
              className="flex-1 bg-slate-900 rounded-xl relative overflow-hidden shadow-inner border border-slate-700 select-none flex flex-col"
           >
              {/* Scrollable Container */}
              <div 
                  ref={gridRef}
                  className="flex-1 overflow-auto relative custom-scrollbar bg-slate-900"
                  onMouseMove={handleGridMouseMove}
                  onMouseUp={handleGridMouseUp}
                  onMouseLeave={handleGridMouseUp}
              >
                  {/* Grid Background Pattern */}
                  <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '8.33% 8.33%' }}></div>
                  
                  {/* Grid Container (12 cols x 12 rows fixed per page) */}
                  <div 
                    className="grid grid-cols-12 gap-2 w-full p-8 min-h-[600px] min-w-[600px]"
                    style={{ gridTemplateRows: `repeat(${gridRows}, minmax(60px, 1fr))` }} // Dynamic Rows
                  >
                      {currentZones.map(zone => {
                          // Count resources in this zone (checking inclusion in array)
                          const zP = unit.resources.filter(r => r.type === ResourceType.PERSONNEL && r.assignedZones?.includes(zone.name)).length;
                          const zE = unit.resources.filter(r => r.type === ResourceType.EQUIPMENT && r.assignedZones?.includes(zone.name)).length;
                          const zM = unit.resources.filter(r => r.type === ResourceType.MATERIAL && r.assignedZones?.includes(zone.name)).length;
                          
                          // Defaults if no layout
                          const layout = zone.layout || { x: 1, y: 1, w: 2, h: 2, color: '#94a3b8' };
                          const isSelected = selectedZoneId === zone.id;
                          
                          return (
                              <div 
                                    key={zone.id}
                                    onMouseDown={(e) => isEditingBlueprint ? handleGridMouseDown(e, zone, 'drag') : setSelectedZoneId(zone.id)}
                                    onClick={() => !isEditingBlueprint && setSelectedZoneId(zone.id)}
                                    className={`rounded-xl flex flex-col shadow-lg transition-all border-2 relative overflow-hidden group
                                        ${isEditingBlueprint ? 'cursor-move' : 'cursor-pointer'}
                                        ${isSelected ? 'ring-4 ring-white ring-offset-2 ring-offset-slate-900 z-20 shadow-2xl scale-[1.02]' : 'border-transparent/20 hover:scale-[1.01]'}
                                    `}
                                    style={{
                                        gridColumnStart: layout.x,
                                        gridColumnEnd: `span ${layout.w}`,
                                        gridRowStart: layout.y,
                                        gridRowEnd: `span ${layout.h}`,
                                        backgroundColor: layout.color,
                                        color: '#1e293b'
                                    }}
                              >
                                  {/* Zone Header */}
                                  <div className="flex justify-between items-center p-3 bg-white/20 backdrop-blur-sm">
                                      <span className="font-bold text-xs md:text-sm leading-tight uppercase tracking-wide truncate">{zone.name}</span>
                                      {isEditingBlueprint && <Move size={12} className="opacity-50"/>}
                                  </div>
                                  
                                  {/* Zone Content (Icons) */}
                                  <div className="flex-1 p-2 flex flex-col justify-center items-center gap-2">
                                      <div className="flex gap-4 items-center justify-center">
                                          {zP > 0 && (
                                              <div className="flex flex-col items-center">
                                                  <Users size={24} className="mb-0.5 opacity-80" />
                                                  <span className="text-[10px] font-bold bg-white/40 px-1.5 rounded-full">{zP}</span>
                                              </div>
                                          )}
                                          {zE > 0 && (
                                              <div className="flex flex-col items-center">
                                                  <Truck size={24} className="mb-0.5 opacity-80" />
                                                  <span className="text-[10px] font-bold bg-white/40 px-1.5 rounded-full">{zE}</span>
                                              </div>
                                          )}
                                            {zM > 0 && (
                                              <div className="flex flex-col items-center">
                                                  <Package size={24} className="mb-0.5 opacity-80" />
                                                  <span className="text-[10px] font-bold bg-white/40 px-1.5 rounded-full">{zM}</span>
                                              </div>
                                          )}
                                      </div>
                                  </div>

                                  {/* Zone Footer */}
                                  <div className="p-2 flex justify-between items-end">
                                      <div className="text-[10px] bg-white/50 px-2 py-0.5 rounded-full font-mono font-medium backdrop-blur-sm shadow-sm">
                                          {zone.area || 0} m²
                                      </div>
                                      
                                      {/* Resize Handle (Only visible in edit mode) */}
                                      {isEditingBlueprint && (
                                          <div 
                                              className="w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center cursor-se-resize hover:scale-110 transition-transform absolute bottom-1 right-1"
                                              onMouseDown={(e) => handleGridMouseDown(e, zone, 'resize')}
                                          >
                                              <Maximize2 size={12} className="text-slate-600"/>
                                          </div>
                                      )}
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
              
              {/* Bottom Resize Handle for Infinite Canvas */}
              {isEditingBlueprint && (
                  <div 
                    className="h-4 bg-slate-800 border-t border-slate-700 cursor-ns-resize flex items-center justify-center hover:bg-slate-700 transition-colors z-30"
                    onMouseDown={handleMapResizeStart}
                    title="Arrastrar para ampliar el mapa hacia abajo"
                  >
                      <GripHorizontal className="text-slate-500" size={16}/>
                  </div>
              )}
           </div>

           {/* DYNAMIC SIDEBAR */}
           <div className="w-full lg:w-96 flex flex-col gap-6 h-full">
               
               {/* 1. Edit Zone Details Panel */}
               {selectedZone ? (
                   <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-5 flex flex-col animate-in slide-in-from-right duration-300">
                       <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                           <div className="flex items-center">
                               <div className="w-4 h-4 rounded-full mr-2 shadow-sm" style={{ backgroundColor: selectedZone.layout?.color }}></div>
                               <h4 className="font-bold text-slate-800">Detalle de Zona</h4>
                           </div>
                           <button onClick={() => setSelectedZoneId(null)} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
                       </div>
                       
                       <div className="space-y-4 mb-4">
                            {/* Editable Fields */}
                           <div className="grid grid-cols-2 gap-4">
                               <div>
                                   <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nombre</label>
                                   {isEditingBlueprint ? (
                                       <input type="text" className="w-full border border-slate-300 rounded p-1.5 text-sm outline-none" value={selectedZone.name} onChange={e => updateSelectedZoneDetails('name', e.target.value)} />
                                   ) : <p className="text-sm font-medium">{selectedZone.name}</p>}
                               </div>
                               <div>
                                   <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Área (m²)</label>
                                   {isEditingBlueprint ? (
                                       <input type="number" className="w-full border border-slate-300 rounded p-1.5 text-sm outline-none" value={selectedZone.area || 0} onChange={e => updateSelectedZoneDetails('area', Number(e.target.value))} />
                                   ) : <p className="text-sm font-medium">{selectedZone.area} m²</p>}
                               </div>
                           </div>
                           
                           {isEditingBlueprint && (
                               <div>
                                   <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Color Identificativo</label>
                                   <div className="flex gap-2 flex-wrap">
                                       {['#dbeafe', '#dcfce7', '#fef3c7', '#fee2e2', '#f3e8ff', '#ffedd5', '#e2e8f0', '#cbd5e1'].map(c => (
                                           <div 
                                             key={c} 
                                             onClick={() => updateSelectedZoneDetails('color', c)}
                                             className={`w-8 h-8 rounded-full cursor-pointer shadow-sm border-2 transition-transform hover:scale-110 ${selectedZone.layout?.color === c ? 'border-slate-800 scale-110' : 'border-transparent'}`}
                                             style={{ backgroundColor: c }}
                                           />
                                       ))}
                                   </div>
                               </div>
                           )}
                       </div>

                       {/* 2. Resources List for Selected Zone (CATEGORIZED) */}
                       <div className="border-t border-slate-100 pt-4 flex-1 overflow-hidden flex flex-col">
                            <h5 className="font-bold text-slate-600 text-sm mb-3 flex items-center"><ClipboardList className="mr-2" size={16}/> Recursos Asignados</h5>
                            
                            <div className="overflow-y-auto pr-1 custom-scrollbar space-y-4 flex-1">
                                {zoneResources.length === 0 && (
                                    <div className="text-center py-6 text-slate-400 text-sm italic border-2 border-dashed border-slate-100 rounded-lg">
                                        Zona libre de recursos asignados.
                                    </div>
                                )}
                                
                                {/* PERSONNEL GROUP */}
                                {zonePersonnel.length > 0 && (
                                    <div>
                                        <h6 className="text-[10px] font-bold text-blue-500 uppercase mb-2">Personal ({zonePersonnel.length})</h6>
                                        <div className="space-y-2">
                                            {zonePersonnel.map(res => {
                                                const isShared = (res.assignedZones?.length || 0) > 1;
                                                return (
                                                <div key={res.id} className="bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center justify-between">
                                                    <div className="flex items-center">
                                                        <div className={`p-1 rounded-full mr-2 ${isShared ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'}`}>
                                                            {isShared ? <Share2 size={12}/> : <UserCheck size={12}/>}
                                                        </div>
                                                        <div className="truncate">
                                                            <p className="text-xs font-bold text-slate-700">{res.name}</p>
                                                            <p className="text-[9px] text-slate-500">
                                                                {isShared 
                                                                  ? `Compartido (${res.assignedZones?.length} zonas)` 
                                                                  : 'Exclusivo'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className={`w-2 h-2 rounded-full ${res.status === 'Activo' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                                </div>
                                            )})}
                                        </div>
                                    </div>
                                )}

                                {/* EQUIPMENT GROUP */}
                                {zoneEquipment.length > 0 && (
                                    <div>
                                        <h6 className="text-[10px] font-bold text-orange-500 uppercase mb-2">Maquinaria ({zoneEquipment.length})</h6>
                                        <div className="space-y-2">
                                            {zoneEquipment.map(res => {
                                                const isShared = (res.assignedZones?.length || 0) > 1;
                                                return (
                                                <div key={res.id} className="bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center justify-between">
                                                    <div className="flex items-center">
                                                        <div className={`p-1 rounded-full mr-2 ${isShared ? 'bg-indigo-100 text-indigo-600' : 'bg-orange-100 text-orange-600'}`}>
                                                            {isShared ? <Share2 size={12}/> : <Truck size={12}/>}
                                                        </div>
                                                        <div className="truncate">
                                                            <p className="text-xs font-bold text-slate-700">{res.name}</p>
                                                            <p className="text-[9px] text-slate-500">{isShared ? `Compartido (${res.assignedZones?.length})` : 'Exclusivo'}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )})}
                                        </div>
                                    </div>
                                )}

                                {/* MATERIALS GROUP */}
                                {zoneMaterials.length > 0 && (
                                    <div>
                                        <h6 className="text-[10px] font-bold text-purple-500 uppercase mb-2">Insumos ({zoneMaterials.length})</h6>
                                        <div className="space-y-2">
                                            {zoneMaterials.map(res => {
                                                const isShared = (res.assignedZones?.length || 0) > 1;
                                                return (
                                                <div key={res.id} className="bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center justify-between">
                                                    <div className="flex items-center">
                                                        <div className={`p-1 rounded-full mr-2 ${isShared ? 'bg-indigo-100 text-indigo-600' : 'bg-purple-100 text-purple-600'}`}>
                                                            {isShared ? <Share2 size={12}/> : <Package size={12}/>}
                                                        </div>
                                                        <div className="truncate">
                                                            <p className="text-xs font-bold text-slate-700">{res.name}</p>
                                                            <p className="text-[9px] text-slate-500">{isShared ? `Compartido (${res.assignedZones?.length})` : 'Exclusivo'}</p>
                                                        </div>
                                                    </div>
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${res.status === 'Stock Bajo' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                                        {res.quantity}
                                                    </span>
                                                </div>
                                            )})}
                                        </div>
                                    </div>
                                )}
                            </div>
                       </div>
                   </div>
               ) : (
                   // Placeholder State
                   <div className="bg-slate-50 rounded-xl border border-slate-200 border-dashed h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                       <LayoutGrid size={48} className="mb-4 opacity-20"/>
                       <h4 className="font-bold text-slate-500">Ninguna Zona Seleccionada</h4>
                       <p className="text-sm mt-2">Haz clic en una zona del mapa para ver sus detalles, editarla o consultar los recursos asignados.</p>
                   </div>
               )}
           </div>
       </div>
    </div>
  )};

  const renderOverview = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Photo Gallery */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 aspect-video md:aspect-auto md:h-80 rounded-xl overflow-hidden shadow-sm relative group bg-slate-200">
          {unit.images && unit.images.length > 0 ? (
            <img 
              src={unit.images[0]} 
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-pointer" 
              alt="Main" 
              onClick={() => {
                setImageModalUrl(unit.images[0]);
                setShowImageModal(true);
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400"><Camera size={48} /></div>
          )}
          <div className="absolute bottom-4 left-4"><span className="bg-black/50 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium">Portada</span></div>
        </div>
        <div className="hidden md:flex flex-col gap-4 h-80">
           <div className="flex-1 rounded-xl overflow-hidden shadow-sm relative bg-slate-100">
             {unit.images && unit.images[1] ? (
               <img 
                 src={unit.images[1]} 
                 className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                 alt="Sec" 
                 onClick={() => {
                   setImageModalUrl(unit.images[1]);
                   setShowImageModal(true);
                 }}
               />
             ) : (
               <div className="w-full h-full flex items-center justify-center text-slate-300"><Camera size={24} /></div>
             )}
           </div>
           <div className="flex-1 rounded-xl overflow-hidden shadow-sm relative bg-slate-100">
             {unit.images && unit.images[2] ? (
               <img 
                 src={unit.images[2]} 
                 className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                 alt="Ter" 
                 onClick={() => {
                   setImageModalUrl(unit.images[2]);
                   setShowImageModal(true);
                 }}
               />
             ) : (
               <div className="w-full h-full flex items-center justify-center text-slate-300"><Camera size={24} /></div>
             )}
             {unit.images && unit.images.length > 3 && (
               <div 
                 className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold cursor-pointer hover:bg-black/70 transition-colors"
                 onClick={() => {
                   // Mostrar galería completa o la primera imagen adicional
                   setImageModalUrl(unit.images[3]);
                   setShowImageModal(true);
                 }}
               >
                 +{unit.images.length - 3}
               </div>
             )}
           </div>
        </div>
      </div>

      {/* --- Management Team (Horizontal Large Cards) --- */}
      {!isEditing && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center mb-6"><Users className="w-5 h-5 mr-2 text-slate-500" /> Equipo de Gestión y Supervisión</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Coordinator Card */}
                <div className="flex flex-col items-center text-center p-6 bg-slate-50 rounded-xl border border-slate-100 hover:shadow-md transition-shadow">
                    <div className="w-40 h-40 rounded-full bg-blue-100 overflow-hidden flex-shrink-0 border-4 border-white shadow-md mb-4">
                        {unit.coordinator?.photo ? <img src={unit.coordinator.photo} alt="Coord" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-blue-400 font-bold text-4xl">CO</div>}
                    </div>
                    <p className="text-base font-bold text-slate-800 mb-1">{unit.coordinator?.name || "Sin Asignar"}</p>
                    <div className="flex items-center text-xs text-blue-700 bg-blue-100 px-3 py-1 rounded-full font-medium mb-3">
                        <BadgeCheck size={12} className="mr-1"/> Coordinador General
                    </div>
                    {unit.coordinator?.phone && (
                        <div className="flex items-center text-sm text-slate-600 mb-1">
                            <Phone size={14} className="mr-2 text-slate-400"/> {unit.coordinator.phone}
                        </div>
                    )}
                    {unit.coordinator?.email && (
                        <div className="flex items-center text-sm text-slate-600">
                            <Mail size={14} className="mr-2 text-slate-400"/> {unit.coordinator.email}
                        </div>
                    )}
                </div>
                {/* Resident Supervisor */}
                <div className="flex flex-col items-center text-center p-6 bg-slate-50 rounded-xl border border-slate-100 hover:shadow-md transition-shadow">
                    <div className="w-40 h-40 rounded-full bg-indigo-100 overflow-hidden flex-shrink-0 border-4 border-white shadow-md mb-4">
                        {unit.residentSupervisor?.photo ? <img src={unit.residentSupervisor.photo} alt="Res" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-indigo-400 font-bold text-4xl">SR</div>}
                    </div>
                    <p className="text-base font-bold text-slate-800 mb-1">{unit.residentSupervisor?.name || "Sin Asignar"}</p>
                    <div className="flex items-center text-xs text-indigo-700 bg-indigo-100 px-3 py-1 rounded-full font-medium mb-3">
                        <ShieldCheck size={12} className="mr-1"/> Supervisor Residente
                    </div>
                    {unit.residentSupervisor?.phone && (
                        <div className="flex items-center text-sm text-slate-600 mb-1">
                            <Phone size={14} className="mr-2 text-slate-400"/> {unit.residentSupervisor.phone}
                        </div>
                    )}
                </div>
                {/* Roving Supervisor */}
                <div className="flex flex-col items-center text-center p-6 bg-slate-50 rounded-xl border border-slate-100 hover:shadow-md transition-shadow">
                    <div className="w-40 h-40 rounded-full bg-slate-200 overflow-hidden flex-shrink-0 border-4 border-white shadow-md mb-4">
                        {unit.rovingSupervisor?.photo ? <img src={unit.rovingSupervisor.photo} alt="Ronda" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold text-4xl">RO</div>}
                    </div>
                    <p className="text-base font-bold text-slate-800 mb-1">{unit.rovingSupervisor?.name || "Sin Asignar"}</p>
                    <div className="flex items-center text-xs text-slate-700 bg-slate-200 px-3 py-1 rounded-full font-medium mb-3">
                        <UserCheck size={12} className="mr-1"/> Supervisor de Ronda
                    </div>
                    {unit.rovingSupervisor?.phone && (
                        <div className="flex items-center text-sm text-slate-600 mb-1">
                            <Phone size={14} className="mr-2 text-slate-400"/> {unit.rovingSupervisor.phone}
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-1 lg:col-span-2 space-y-6">
          {/* General Information Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative">
             <div className="absolute top-4 right-4 flex space-x-2">
                {canEditGeneral && (
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className="flex items-center bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    {isEditing ? <><Save size={16} className="mr-1.5"/> Guardar</> : <><Edit2 size={16} className="mr-1.5"/> Editar Información</>}
                  </button>
                )}
             </div>

             <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
               <Box className="w-5 h-5 mr-2 text-slate-500" /> Información General
             </h3>
             
             {isEditing ? (
               <div className="space-y-4">
                  <div><label className="block text-sm font-medium text-slate-700">Nombre Unidad</label><input type="text" className="w-full border border-slate-300 rounded p-2" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} /></div>
                  <div><label className="block text-sm font-medium text-slate-700">Cliente</label><input type="text" className="w-full border border-slate-300 rounded p-2" value={editForm.clientName} onChange={e => setEditForm({...editForm, clientName: e.target.value})} /></div>
                  <div><label className="block text-sm font-medium text-slate-700">Dirección</label><input type="text" className="w-full border border-slate-300 rounded p-2" value={editForm.address} onChange={e => setEditForm({...editForm, address: e.target.value})} /></div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Estado</label>
                    <select className="w-full border border-slate-300 rounded p-2" value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value as UnitStatus})}>
                      <option value={UnitStatus.ACTIVE}>Activo</option>
                      <option value={UnitStatus.PENDING}>Pendiente</option>
                      <option value={UnitStatus.ISSUE}>Con Incidencias</option>
                    </select>
                  </div>
                  <div><label className="block text-sm font-medium text-slate-700">Descripción Operativa</label><textarea className="w-full border border-slate-300 rounded p-2" value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})} /></div>

                  {/* Staff Selectors */}
                  <div>
                      <label className="block text-sm font-medium text-slate-700">Coordinador General</label>
                      <select className="w-full border border-slate-300 rounded p-2" value={editForm.coordinator?.id || ''} onChange={e => handleSelectStaff('coordinator', e.target.value)}>
                          <option value="">Seleccionar...</option>
                          {availableStaff.filter(s => s.role === 'COORDINATOR').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                  </div>
                   <div><label className="block text-sm font-medium text-slate-700">Supervisor Residente</label><select className="w-full border border-slate-300 rounded p-2" value={editForm.residentSupervisor?.id || ''} onChange={e => handleSelectStaff('residentSupervisor', e.target.value)}><option value="">Seleccionar...</option>{availableStaff.filter(s => s.role === 'RESIDENT_SUPERVISOR').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                   <div><label className="block text-sm font-medium text-slate-700">Supervisor de Ronda</label><select className="w-full border border-slate-300 rounded p-2" value={editForm.rovingSupervisor?.id || ''} onChange={e => handleSelectStaff('rovingSupervisor', e.target.value)}><option value="">Seleccionar...</option>{availableStaff.filter(s => s.role === 'ROVING_SUPERVISOR').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>

                  {/* Zones Management */}
                  <div className="pt-4 border-t border-slate-100">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Gestión de Zonas y Turnos</label>
                    {editForm.zones.map(z => (
                        <div key={z.id} className="flex justify-between items-center bg-slate-50 p-2 rounded mb-2 border border-slate-100">
                            <div><span className="font-bold text-sm">{z.name}</span> <span className="text-xs text-slate-500">({z.shifts.join(', ')})</span></div>
                            <button onClick={() => handleDeleteZone(z.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>
                        </div>
                    ))}
                    <div className="flex gap-2 mt-2">
                        <input type="text" placeholder="Nombre Zona" className="flex-1 border border-slate-300 rounded p-1.5 text-sm" value={newZoneName} onChange={e => setNewZoneName(e.target.value)} />
                        <input type="text" placeholder="Turnos (sep. por coma)" className="flex-1 border border-slate-300 rounded p-1.5 text-sm" value={newZoneShifts} onChange={e => setNewZoneShifts(e.target.value)} />
                        <button onClick={handleAddZone} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700">Agregar</button>
                    </div>
                  </div>

                  {/* Image Management */}
                  <div className="pt-4 border-t border-slate-100">
                     <label className="block text-sm font-medium text-slate-700 mb-2">Galería de Fotos</label>
                     <div className="flex gap-2 mb-2">
                        <input type="text" className="flex-1 border border-slate-300 rounded p-1.5 text-sm" placeholder="URL Imagen" value={editImageUrl} onChange={e => setEditImageUrl(e.target.value)} />
                        <label className="bg-slate-100 px-3 py-1.5 rounded cursor-pointer hover:bg-slate-200 border border-slate-200"><Camera size={18} className="text-slate-600"/><input type="file" accept="image/*" className="hidden" onChange={handleFileUploadForEdit} /></label>
                        <button onClick={handleAddImageToEdit} className="bg-slate-200 px-3 py-1.5 rounded text-sm hover:bg-slate-300">Añadir</button>
                     </div>
                     <div className="flex gap-2 overflow-x-auto pb-2">
                        {editForm.images.map((img, idx) => (
                            <div key={idx} className="relative shrink-0 w-20 h-20 group">
                                <img 
                                  src={img} 
                                  alt="thumb" 
                                  className="w-full h-full object-cover rounded border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity" 
                                  onClick={() => {
                                    setImageModalUrl(img);
                                    setShowImageModal(true);
                                  }}
                                  title="Click para ver en tamaño completo"
                                />
                                {isEditing && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveImageFromEdit(idx);
                                    }} 
                                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                    title="Eliminar imagen"
                                  >
                                    <X size={12}/>
                                  </button>
                                )}
                            </div>
                        ))}
                     </div>
                  </div>

                  <button 
                    onClick={handleSaveUnit} 
                    disabled={uploadingImages.size > 0}
                    className={`w-full py-2.5 rounded font-medium transition-colors ${
                      uploadingImages.size > 0 
                        ? 'bg-slate-400 text-white cursor-not-allowed' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {uploadingImages.size > 0 
                      ? `Subiendo ${uploadingImages.size} imagen(es)...` 
                      : 'Guardar Cambios'
                    }
                  </button>
               </div>
             ) : (
               <div className="text-sm text-slate-600 space-y-3">
                 <p className="line-clamp-3">{unit.description || "Sin descripción."}</p>
                 <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                        <span className="block text-xs font-semibold text-slate-400 uppercase">Cliente</span>
                        <span className="font-medium text-slate-900">{unit.clientName}</span>
                    </div>
                    <div>
                        <span className="block text-xs font-semibold text-slate-400 uppercase">Ubicación</span>
                        <span className="font-medium text-slate-900">{unit.address}</span>
                    </div>
                 </div>
                 
                 {/* Zones Read-Only */}
                 <div className="pt-4">
                    <span className="block text-xs font-semibold text-slate-400 uppercase mb-2">Zonas y Turnos</span>
                    <div className="flex flex-wrap gap-2">
                        {unit.zones.map(z => (
                            <span key={z.id} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                                {z.name} <span className="ml-1 text-slate-400">| {z.shifts.length} Turnos</span>
                            </span>
                        ))}
                    </div>
                 </div>
               </div>
             )}
          </div>

          {/* Agenda / Upcoming Events */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-slate-800 flex items-center">
                  <Calendar className="w-5 h-5 mr-2 text-slate-500" /> Agenda Operativa (30 Días)
                </h3>
                {canEditLogs && <button onClick={() => setShowEventModal(true)} className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-medium hover:bg-blue-100 flex items-center"><Plus size={14} className="mr-1"/> Agendar Evento</button>}
             </div>
             
             <div className="space-y-3">
                {upcomingEvents.length > 0 ? upcomingEvents.slice(0, 5).map((ev, i) => (
                    <div key={i} className="flex items-start p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                        <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 mr-3 ${ev.type === 'log' ? 'bg-blue-400' : ev.type === 'maintenance' ? 'bg-orange-400' : 'bg-green-400'}`} />
                        <div>
                            <p className="text-sm font-semibold text-slate-800">{ev.title} <span className="text-xs font-normal text-slate-500 ml-1">• {ev.date}</span></p>
                            <p className="text-xs text-slate-600 line-clamp-1">{ev.desc}</p>
                        </div>
                    </div>
                )) : <p className="text-slate-400 text-sm italic">No hay eventos próximos.</p>}
             </div>
          </div>
        </div>

        <div className="col-span-1 space-y-6">
           {/* Compliance Mini Chart */}
           <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
             <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center">
               <ShieldCheck className="w-5 h-5 mr-2 text-slate-500" /> Nivel de Cumplimiento
             </h3>
             <div className="flex items-end space-x-2 h-32 w-full justify-between px-2">
                {unit.complianceHistory.map((h, i) => (
                    <div key={i} className="flex flex-col items-center flex-1 group relative">
                        <div className="absolute -top-8 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">{h.score}%</div>
                        <div 
                           className={`w-full rounded-t transition-all duration-500 ${h.score >= 95 ? 'bg-green-500' : h.score >= 90 ? 'bg-yellow-400' : 'bg-red-500'}`} 
                           style={{ height: `${h.score}%` }}
                        ></div>
                        <span className="text-xs text-slate-500 mt-2 font-medium">{h.month}</span>
                    </div>
                ))}
             </div>
           </div>
        </div>
      </div>
    </div>
  );

  const renderPersonnel = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Gestión de Personal ({personnel.length})</h3>
          <p className="text-slate-500 text-sm">Administración de colaboradores, asistencias y capacitaciones.</p>
        </div>
        {canEditPersonnel && (
          <div className="flex gap-2">
             <div className="bg-slate-100 rounded-lg p-1 flex">
                 <button 
                    onClick={() => setPersonnelViewMode('list')} 
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center ${personnelViewMode === 'list' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                     <Users size={14} className="mr-1.5"/> Lista
                 </button>
                 <button 
                    onClick={() => setPersonnelViewMode('roster')} 
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center ${personnelViewMode === 'roster' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                 >
                     <Calendar size={14} className="mr-1.5"/> Turnos / Rostering
                 </button>
             </div>
             
            {selectedPersonnelIds.length > 0 && personnelViewMode === 'list' && (
              <>
                <button onClick={() => setShowMassTrainingModal(true)} className="bg-indigo-50 text-indigo-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors flex items-center">
                   <Award size={16} className="mr-2"/> + Capacitación ({selectedPersonnelIds.length})
                </button>
                <button onClick={() => setShowAssetAssignmentModal(true)} className="bg-orange-50 text-orange-600 px-3 py-2 rounded-lg text-sm font-medium hover:bg-orange-100 transition-colors flex items-center">
                   <Briefcase size={16} className="mr-2"/> + Entrega EPP ({selectedPersonnelIds.length})
                </button>
              </>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowBulkImportModal(true)} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center shadow-sm">
                <Upload size={18} className="mr-2" /> Carga Masiva
              </button>
              <button onClick={() => setShowAddWorkerModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center shadow-sm">
                <UserPlus size={18} className="mr-2" /> Nuevo Colaborador
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center space-x-3 animate-in slide-in-from-right duration-300 ${
          notification.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle size={20} className="text-green-600" />
          ) : (
            <AlertCircle size={20} className="text-red-600" />
          )}
          <span className="font-medium">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
      )}

      {personnelViewMode === 'list' ? (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
         {/* Table Header */}
         <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-200 p-3 text-xs font-bold text-slate-500 uppercase tracking-wider gap-2">
            <div className="col-span-1 flex items-center justify-center">
               <input type="checkbox" onChange={selectAllPersonnel} checked={selectedPersonnelIds.length === personnel.length && personnel.length > 0} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
            </div>
            <div className="col-span-3 md:col-span-2">Colaborador</div>
            <div className="col-span-2 hidden md:block text-center">DNI</div>
            <div className="col-span-2 text-center">Estado</div>
            <div className="col-span-2 hidden md:block text-center">Fechas</div>
            <div className="col-span-1 hidden md:block text-center">Turno</div>
            <div className="col-span-1 hidden md:block text-center">Cumpl.</div>
            <div className="col-span-3 md:col-span-2 text-right">Acciones</div>
         </div>

         <div className="divide-y divide-slate-100">
            {personnel.map(worker => (
              <div key={worker.id} className="group transition-colors hover:bg-slate-50">
                 {/* Main Row */}
                 <div className={`grid grid-cols-12 p-4 items-center gap-2 ${isArchivingPersonnel === worker.id ? 'opacity-50' : ''}`}>
                    <div className="col-span-1 flex items-center justify-center">
                       <input type="checkbox" checked={selectedPersonnelIds.includes(worker.id)} onChange={() => togglePersonnelSelection(worker.id)} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" disabled={isArchivingPersonnel === worker.id} />
                    </div>
                    <div className="col-span-3 md:col-span-2 flex items-center min-w-0">
                       <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 mr-2 shrink-0">
                          {worker.name.charAt(0)}
                       </div>
                       <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 truncate">{worker.name}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {worker.puesto ? `${worker.puesto} • ` : ''}{worker.assignedZones?.join(', ') || 'Sin zona'}
                          </p>
                       </div>
                    </div>
                    <div className="col-span-2 hidden md:flex items-center justify-center text-sm text-slate-500 font-mono">
                       {worker.dni || <span className="text-slate-300 italic">-</span>}
                    </div>
                    <div className="col-span-2 flex items-center justify-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          worker.personnelStatus === 'cesado' 
                            ? 'bg-red-100 text-red-700' 
                            : STATUS_COLORS[worker.status as string] || 'bg-green-100 text-green-700'
                        }`}>
                           {worker.personnelStatus === 'cesado' ? 'Cesado' : (worker.status || 'Activo')}
                        </span>
                    </div>
                    <div className="col-span-2 hidden md:flex flex-col items-center justify-center text-xs text-slate-500">
                       {worker.startDate && (
                         <div className="whitespace-nowrap">Inicio: {formatDateFromString(worker.startDate)}</div>
                       )}
                       {worker.endDate && (
                         <div className="text-red-600 whitespace-nowrap">Fin: {formatDateFromString(worker.endDate)}</div>
                       )}
                       {!worker.startDate && !worker.endDate && <span className="text-slate-300 italic">-</span>}
                    </div>
                    <div className="col-span-1 hidden md:flex items-center justify-center text-sm text-slate-600">{worker.assignedShift || '-'}</div>
                    <div className="col-span-1 hidden md:flex items-center justify-center">
                        <div className="flex items-center">
                            <div className="w-12 bg-slate-200 rounded-full h-1.5 mr-1">
                                <div className={`h-1.5 rounded-full ${worker.compliancePercentage && worker.compliancePercentage >= 90 ? 'bg-green-500' : 'bg-yellow-500'}`} style={{ width: `${worker.compliancePercentage || 0}%` }}></div>
                            </div>
                            <span className="text-xs font-medium">{worker.compliancePercentage || 0}%</span>
                        </div>
                    </div>
                    <div className="col-span-3 md:col-span-2 flex justify-end items-center gap-2">
                        <button onClick={() => togglePersonnelExpand(worker.id)} className="text-slate-400 hover:text-blue-600 p-1" disabled={isArchivingPersonnel === worker.id}>
                            {expandedPersonnel === worker.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                        {canEditPersonnel && (
                            <>
                                <button onClick={() => { setEditingResource(worker); }} className="text-blue-600 hover:text-blue-900 p-1" title="Editar" disabled={isArchivingPersonnel === worker.id || isUpdatingResource}>
                                    {isUpdatingResource && editingResource?.id === worker.id ? (
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                    ) : (
                                      <Edit2 size={16} />
                                    )}
                                </button>
                                <button 
                                    onClick={async () => {
                                        if (confirm(`¿Está seguro de eliminar a ${worker.name}? Esta acción no se puede deshacer.`)) {
                                            if (!onUpdate) return;
                                            try {
                                                const { resourcesService } = await import('../services/resourcesService');
                                                // Intentar eliminar desde el servicio
                                                await resourcesService.delete(worker.id);
                                                // Actualizar localmente
                                                const currentTab = activeTabRef.current;
                                                const updatedUnit = { ...unit };
                                                updatedUnit.resources = updatedUnit.resources.filter(r => r.id !== worker.id);
                                                onUpdate(updatedUnit);
                                                // Asegurar que el tab se mantenga
                                                setTimeout(() => {
                                                    if (activeTab !== currentTab) {
                                                        setActiveTab(currentTab);
                                                    }
                                                }, 100);
                                                setNotification({ type: 'success', message: 'Trabajador eliminado correctamente' });
                                                setTimeout(() => setNotification(null), 3000);
                                            } catch (error) {
                                                console.error('Error al eliminar trabajador:', error);
                                                // Si falla el servicio, eliminar localmente de todas formas
                                                const currentTab = activeTabRef.current;
                                                const updatedUnit = { ...unit };
                                                updatedUnit.resources = updatedUnit.resources.filter(r => r.id !== worker.id);
                                                onUpdate(updatedUnit);
                                                setTimeout(() => {
                                                    if (activeTab !== currentTab) {
                                                        setActiveTab(currentTab);
                                                    }
                                                }, 100);
                                                setNotification({ type: 'success', message: 'Trabajador eliminado de la unidad' });
                                                setTimeout(() => setNotification(null), 3000);
                                            }
                                        }
                                    }}
                                    className="text-red-600 hover:text-red-900 p-1" 
                                    title="Eliminar trabajador"
                                    disabled={isArchivingPersonnel === worker.id || isUpdatingResource}
                                >
                                    <Trash2 size={16} />
                                </button>
                                {worker.personnelStatus === 'cesado' && (
                                    <button 
                                        onClick={async () => {
                                            if (confirm('¿Archivar este trabajador? El trabajador será removido de la vista normal pero permanecerá en la base de datos para consultas en informes.')) {
                                                setIsArchivingPersonnel(worker.id);
                                                try {
                                                    const { resourcesService } = await import('../services/resourcesService');
                                                    await resourcesService.archivePersonnel(worker.id);
                                                    // Actualizar solo los recursos localmente para mantener el tab activo
                                                    if (onUpdate) {
                                                        const currentTab = activeTabRef.current; // Guardar el tab actual
                                                        const updatedUnit = { ...unit };
                                                        updatedUnit.resources = updatedUnit.resources.filter(r => r.id !== worker.id);
                                                        onUpdate(updatedUnit);
                                                        // Asegurar que el tab se mantenga
                                                        setTimeout(() => {
                                                            if (activeTab !== currentTab) {
                                                                setActiveTab(currentTab);
                                                            }
                                                        }, 100);
                                                    }
                                                    setNotification({ type: 'success', message: 'Trabajador archivado correctamente' });
                                                    setTimeout(() => setNotification(null), 3000);
                                                } catch (error) {
                                                    console.error('Error al archivar trabajador:', error);
                                                    setNotification({ type: 'error', message: 'Error al archivar el trabajador. Por favor, intente nuevamente.' });
                                                    setTimeout(() => setNotification(null), 5000);
                                                } finally {
                                                    setIsArchivingPersonnel(null);
                                                }
                                            }
                                        }}
                                        className="text-amber-600 hover:text-amber-900 p-1 disabled:opacity-50" 
                                        title="Archivar trabajador"
                                        disabled={isArchivingPersonnel === worker.id}
                                    >
                                        {isArchivingPersonnel === worker.id ? (
                                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600"></div>
                                        ) : (
                                          <Archive size={16} />
                                        )}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                 </div>

                 {/* Expanded Details */}
                 {expandedPersonnel === worker.id && (
                    <div className="bg-slate-50/50 p-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-2 duration-200">
                        {/* Training History */}
                        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-center mb-3">
                                <h5 className="text-xs font-bold text-slate-500 uppercase flex items-center"><Award size={14} className="mr-1.5"/> Capacitaciones</h5>
                                {canEditPersonnel && <button onClick={() => handleAddSingleTraining(worker.id)} className="text-xs text-blue-600 hover:underline flex items-center"><Plus size={12} className="mr-1"/> Agregar</button>}
                            </div>
                            <div className="space-y-2">
                                {(worker.trainings || []).length > 0 ? worker.trainings?.map(t => (
                                    <div key={t.id} className="flex justify-between items-start text-sm border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                                        <div>
                                            <p className="font-medium text-slate-700">{t.topic}</p>
                                            <p className="text-xs text-slate-500">{t.date} • {t.status}</p>
                                        </div>
                                        <div className="flex items-center">
                                            {t.score && <span className={`text-xs font-bold px-1.5 py-0.5 rounded mr-2 ${t.score >= 13 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.score}</span>}
                                            {canEditPersonnel && <button onClick={() => handleDeleteTraining(worker.id, t.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={12}/></button>}
                                        </div>
                                    </div>
                                )) : <p className="text-xs text-slate-400 italic">Sin registro de capacitaciones.</p>}
                            </div>
                        </div>

                        {/* Assigned Assets */}
                        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                            <div className="flex justify-between items-center mb-3">
                                <h5 className="text-xs font-bold text-slate-500 uppercase flex items-center"><Briefcase size={14} className="mr-1.5"/> Dotación (EPP / Activos)</h5>
                                {canEditPersonnel && <button onClick={() => handleAddSingleAsset(worker.id)} className="text-xs text-orange-600 hover:underline flex items-center"><Plus size={12} className="mr-1"/> Asignar</button>}
                            </div>
                            <div className="space-y-2">
                                {(worker.assignedAssets || []).length > 0 ? worker.assignedAssets?.map(a => {
                                    // Debug: verificar si tiene código de constancia
                                    const hasConstancy = !!a.constancyCode;
                                    if (hasConstancy) {
                                      console.log(`✅ Activo con constancia encontrado:`, { 
                                        name: a.name, 
                                        code: a.constancyCode,
                                        worker: worker.name 
                                      });
                                    }
                                    return (
                                    <div key={a.id} className="flex justify-between items-center text-sm border-b border-slate-50 last:border-0 pb-2 last:pb-0">
                                        <div className="flex items-center flex-1 min-w-0">
                                            <div className="mr-2 shrink-0">{getAssetIcon(a.type)}</div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-medium text-slate-700 truncate">{a.name}</p>
                                                <p className="text-xs text-slate-500 truncate">
                                                    {a.dateAssigned} 
                                                    {a.serialNumber && ` • SN: ${a.serialNumber}`}
                                                    {a.constancyCode && ` • Const: ${a.constancyCode}`}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {hasConstancy ? (
                                                <button 
                                                    onClick={() => handleDownloadConstancyPDF(worker, a)} 
                                                    className="text-blue-600 hover:text-blue-700 p-1 hover:bg-blue-50 rounded transition-colors flex items-center justify-center" 
                                                    title={`Descargar constancia PDF (${a.constancyCode})`}
                                                >
                                                    <FileText size={16} className="text-blue-600"/>
                                                </button>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">Sin constancia</span>
                                            )}
                                            {canEditPersonnel && (
                                                <button 
                                                    onClick={() => handleDeleteAsset(worker.id, a.id)} 
                                                    className="text-slate-300 hover:text-red-500 p-1 hover:bg-red-50 rounded transition-colors"
                                                    title="Eliminar activo"
                                                >
                                                    <Trash2 size={12}/>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    );
                                }) : <p className="text-xs text-slate-400 italic">Sin activos asignados.</p>}
                            </div>
                        </div>
                    </div>
                 )}
              </div>
            ))}
            {personnel.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                    <Users size={48} className="mx-auto mb-2 opacity-20"/>
                    <p>No hay personal registrado en esta unidad.</p>
                </div>
            )}
         </div>
      </div>
      ) : (
          // --- ROSTER VIEW (GRID) ---
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
             {/* Roster Controls */}
             <div className="flex justify-between items-center p-4 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center space-x-2">
                    <button onClick={() => changeRosterDate(-7)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600"><ChevronLeft size={18}/></button>
                    <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5">
                        <Calendar size={14} className="text-slate-500"/>
                        <span className="text-sm font-bold text-slate-700">
                             {getRosterDates()[0].toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })} 
                             {' - '} 
                             {getRosterDates()[6].toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                    </div>
                    <button onClick={() => changeRosterDate(7)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600"><ChevronRight size={18}/></button>
                </div>
                
                <div className="flex items-center space-x-4">
                    <div className="text-xs text-slate-400 font-medium">Click en turno para cambiar</div>
                    <button 
                        onClick={handleReplicateWeek}
                        className="flex items-center bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
                        title="Copiar estos turnos a la próxima semana"
                    >
                        <Copy size={14} className="mr-1.5"/> Copiar a Sem. Siguiente
                    </button>
                </div>
             </div>
             
             {/* Roster Grid */}
             <div className="overflow-x-auto">
                 <table className="min-w-full divide-y divide-slate-200">
                     <thead className="bg-white">
                         <tr>
                             <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-white z-10 w-48 border-r border-slate-100">Colaborador</th>
                             {getRosterDates().map((date, i) => (
                                 <th key={i} className={`px-2 py-3 text-center text-xs font-bold uppercase tracking-wider min-w-[80px] ${date.toDateString() === new Date().toDateString() ? 'bg-blue-50 text-blue-700' : 'text-slate-500'}`}>
                                     <div className="flex flex-col">
                                         <span>{date.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                                         <span className="text-xs opacity-70">{date.getDate()}</span>
                                     </div>
                                 </th>
                             ))}
                             <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Horas</th>
                         </tr>
                     </thead>
                     <tbody className="bg-white divide-y divide-slate-100">
                         {personnel.map(worker => {
                             // Calculate total hours in view
                             const dates = getRosterDates();
                             const totalHours = dates.reduce((acc, d) => {
                                 const dateStr = d.toISOString().split('T')[0];
                                 const shift = worker.workSchedule?.find(s => s.date === dateStr);
                                 return acc + (shift?.hours || 0);
                             }, 0);

                             return (
                                 <tr key={worker.id} className="hover:bg-slate-50/50">
                                     <td className="px-4 py-3 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-slate-100">
                                         <div className="flex items-center">
                                             <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 mr-2 shrink-0">
                                                 {worker.name.charAt(0)}
                                             </div>
                                             <div>
                                                 <p className="text-sm font-medium text-slate-900 truncate max-w-[120px]" title={worker.name}>{worker.name}</p>
                                                 <p className="text-[10px] text-slate-400">{worker.assignedShift || 'N/A'}</p>
                                             </div>
                                         </div>
                                     </td>
                                     {getRosterDates().map((date, i) => {
                                         const dateStr = date.toISOString().split('T')[0];
                                         const shift = worker.workSchedule?.find(s => s.date === dateStr);
                                         const type = shift?.type || 'OFF';
                                         
                                         return (
                                             <td key={i} className="px-2 py-3 text-center relative group">
                                                 <button 
                                                     onClick={() => handleRosterShiftChange(worker.id, dateStr, type)}
                                                     className={`w-full py-1.5 rounded text-xs font-bold transition-all shadow-sm active:scale-95 ${getShiftColor(type)}`}
                                                 >
                                                     {type === 'Day' ? 'Dia' : type === 'Night' ? 'Noc' : type}
                                                 </button>
                                             </td>
                                         );
                                     })}
                                     <td className="px-4 py-3 text-center whitespace-nowrap">
                                         <span className="text-sm font-bold text-slate-700">{totalHours}</span>
                                         <span className="text-xs text-slate-400 ml-1">h</span>
                                     </td>
                                 </tr>
                             );
                         })}
                     </tbody>
                 </table>
             </div>
          </div>
      )}

    </div>
  );

  const renderLogistics = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Logística y Equipamiento</h3>
          <p className="text-slate-500 text-sm">Control de inventario, maquinaria y materiales.</p>
        </div>
        {canEditLogistics && (
          <div className="flex gap-2">
             <button onClick={() => openAddResourceModal(ResourceType.EQUIPMENT)} className="bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center">
                <Truck size={16} className="mr-2"/> + Maquinaria
             </button>
             <button onClick={() => openAddResourceModal(ResourceType.MATERIAL)} className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center shadow-sm">
                <Package size={16} className="mr-2"/> + Material
             </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* Equipment Section */}
         <div className="space-y-4">
             <h4 className="font-bold text-slate-700 flex items-center text-sm uppercase tracking-wide"><Truck size={16} className="mr-2"/> Equipos y Maquinaria</h4>
             <div className="space-y-3">
                 {equipment.map(eq => (
                     <div key={eq.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden group">
                         <div className="p-4 flex gap-4">
                             <div className="w-20 h-20 rounded-lg bg-slate-100 shrink-0 overflow-hidden">
                                 {eq.image ? <img src={eq.image} alt={eq.name} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-400"><Truck size={24}/></div>}
                             </div>
                             <div className="flex-1 min-w-0">
                                 <div className="flex justify-between items-start">
                                     <div>
                                         <h5 className="font-bold text-slate-800 text-sm truncate">{eq.name}</h5>
                                         <div className="flex items-center gap-2 mt-1">
                                             <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLORS[eq.status as string] || 'bg-slate-100 text-slate-600'}`}>{eq.status}</span>
                                             {eq.nextMaintenance && <span className="text-[10px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full flex items-center"><Wrench size={10} className="mr-1"/> Mant: {eq.nextMaintenance}</span>}
                                         </div>
                                     </div>
                                     <div className="flex gap-1">
                                         {eq.externalId && (
                                             <button 
                                                onClick={() => handleSyncInventory(eq)} 
                                                disabled={isSyncing === eq.id}
                                                className={`p-1.5 rounded hover:bg-slate-100 ${isSyncing === eq.id ? 'animate-spin text-blue-600' : 'text-slate-400 hover:text-blue-600'}`} 
                                                title="Sincronizar Stock"
                                             >
                                                 <RefreshCw size={14}/>
                                             </button>
                                         )}
                                         <button onClick={() => toggleEquipmentExpand(eq.id)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600">
                                            {expandedEquipment === eq.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                         </button>
                                         {canEditLogistics && (
                                            <button onClick={() => setEditingResource(eq)} className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600"><Edit2 size={14}/></button>
                                         )}
                                     </div>
                                 </div>
                                 <p className="text-xs text-slate-500 mt-2 line-clamp-1">Ubicación: {eq.assignedZones?.join(', ') || 'Sin asignar'}</p>
                             </div>
                         </div>
                         
                         {/* Maintenance History Expanded */}
                         {expandedEquipment === eq.id && (
                             <div className="bg-slate-50 border-t border-slate-100 p-4">
                                 <div className="flex justify-between items-center mb-3">
                                     <h6 className="text-xs font-bold text-slate-500 uppercase">Historial de Mantenimiento</h6>
                                     {canEditLogistics && (
                                         <button 
                                            onClick={() => { setMaintenanceResource(eq); /* Should trigger modal logic */ }} 
                                            className="text-xs bg-white border border-slate-300 px-2 py-1 rounded hover:bg-slate-100 text-slate-600 flex items-center"
                                         >
                                             <Plus size={12} className="mr-1"/> Registrar
                                         </button>
                                     )}
                                 </div>
                                 <div className="space-y-3">
                                     {(eq.maintenanceHistory || []).length > 0 ? eq.maintenanceHistory?.map(m => (
                                         <div key={m.id} className="text-sm bg-white p-2 rounded border border-slate-200">
                                             <div className="flex justify-between">
                                                 <span className="font-bold text-slate-700">{m.type}</span>
                                                 <span className="text-xs text-slate-400">{m.date}</span>
                                             </div>
                                             <p className="text-xs text-slate-600 mt-1">{m.description}</p>
                                             <p className="text-[10px] text-slate-400 mt-1">Téc: {m.technician} • Estado: {m.status}</p>
                                         </div>
                                     )) : <p className="text-xs text-slate-400 italic text-center py-2">Sin registros.</p>}
                                 </div>
                             </div>
                         )}
                     </div>
                 ))}
                 {equipment.length === 0 && <p className="text-sm text-slate-400 italic">No hay equipos registrados.</p>}
             </div>
         </div>

         {/* Materials Section */}
         <div className="space-y-4">
             <h4 className="font-bold text-slate-700 flex items-center text-sm uppercase tracking-wide"><Package size={16} className="mr-2"/> Insumos y Materiales</h4>
             <div className="grid grid-cols-1 gap-3">
                 {materials.map(mat => (
                     <div key={mat.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex gap-4 items-center group">
                         <div className="w-12 h-12 rounded bg-purple-50 flex items-center justify-center text-purple-600 shrink-0 border border-purple-100">
                             {mat.image ? <img src={mat.image} alt={mat.name} className="w-full h-full object-cover rounded"/> : <Package size={20}/>}
                         </div>
                         <div className="flex-1 min-w-0">
                             <div className="flex justify-between items-start">
                                 <div>
                                     <h5 className="font-bold text-slate-800 text-sm truncate">{mat.name}</h5>
                                     <p className="text-xs text-slate-500">Stock: <span className="font-bold text-slate-700">{mat.quantity} {mat.unitOfMeasure}</span></p>
                                 </div>
                                 <div className="flex gap-1">
                                      {mat.externalId && (
                                         <button 
                                            onClick={() => handleSyncInventory(mat)} 
                                            disabled={isSyncing === mat.id}
                                            className={`p-1 rounded hover:bg-slate-100 ${isSyncing === mat.id ? 'animate-spin text-blue-600' : 'text-slate-400 hover:text-blue-600'}`}
                                         >
                                             <RefreshCw size={14}/>
                                         </button>
                                      )}
                                      {canEditLogistics && (
                                         <button onClick={() => setEditingResource(mat)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600"><Edit2 size={14}/></button>
                                      )}
                                 </div>
                             </div>
                             <div className="flex items-center gap-2 mt-1.5">
                                 <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLORS[mat.status as string] || 'bg-slate-100 text-slate-600'}`}>{mat.status}</span>
                                 <span className="text-[10px] text-slate-400">Restock: {mat.lastRestock || '-'}</span>
                             </div>
                         </div>
                     </div>
                 ))}
                 {materials.length === 0 && <p className="text-sm text-slate-400 italic">No hay materiales registrados.</p>}
             </div>
         </div>
      </div>
    </div>
  );

  const renderManagement = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
       <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Supervisión y Bitácora</h3>
          <p className="text-slate-500 text-sm">Registro de eventos, incidencias y visitas.</p>
        </div>
        {canEditLogs && (
          <button onClick={() => setShowEventModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center shadow-sm">
             <Plus size={18} className="mr-2" /> Registrar Evento
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
              {[...unit.logs].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(log => (
                  <div key={log.id} className="p-6 hover:bg-slate-50 transition-colors">
                      <div className="flex flex-col md:flex-row gap-4">
                          <div className="flex-shrink-0 flex flex-col items-center">
                              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs mb-2">
                                  {new Date(log.date).getDate()}
                                  <span className="block text-[8px] uppercase">{new Date(log.date).toLocaleString('default', { month: 'short' })}</span>
                              </div>
                              <div className={`h-full w-0.5 bg-slate-200 my-2`}></div>
                          </div>
                          <div className="flex-1">
                              <div className="flex justify-between items-start mb-2">
                                  <div>
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mb-2
                                          ${log.type === 'Incidencia' ? 'bg-red-100 text-red-800' : 
                                            log.type === 'Supervision' ? 'bg-blue-100 text-blue-800' : 
                                            log.type === 'Capacitacion' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                          {log.type}
                                      </span>
                                      <h4 className="text-base font-bold text-slate-800">{log.description}</h4>
                                  </div>
                                  {canEditLogs && (
                                      <button onClick={() => setEditingLog(log)} className="text-slate-400 hover:text-blue-600 p-2 hover:bg-slate-100 rounded-lg transition-colors">
                                          <Edit2 size={16}/>
                                      </button>
                                  )}
                              </div>
                              
                              <div className="flex flex-wrap gap-4 text-sm text-slate-500 mb-3">
                                  <span className="flex items-center"><UserCheck size={14} className="mr-1.5"/> Autor: {log.author}</span>
                                  {log.responsibleIds && log.responsibleIds.length > 0 && (
                                      <span className="flex items-center"><Users size={14} className="mr-1.5"/> {log.responsibleIds.length} Involucrados</span>
                                  )}
                              </div>
                              
                              {/* Responsible avatars if any */}
                              {log.responsibleIds && log.responsibleIds.length > 0 && (
                                  <div className="flex -space-x-2 mb-3">
                                      {log.responsibleIds.map(rid => {
                                          const name = getPersonName(rid);
                                          return (
                                              <div key={rid} className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600" title={name}>
                                                  {name.charAt(0)}
                                              </div>
                                          );
                                      })}
                                  </div>
                              )}

                              {/* Images */}
                              {log.images && log.images.length > 0 && (
                                  <div className="flex gap-2 overflow-x-auto pb-2">
                                      {log.images.map((img, i) => (
                                          <div key={i} className="h-20 w-20 shrink-0 rounded-lg overflow-hidden border border-slate-200">
                                              <img src={img} alt="Evidence" className="w-full h-full object-cover cursor-pointer hover:scale-110 transition-transform" />
                                          </div>
                                      ))}
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>
              ))}
              {unit.logs.length === 0 && (
                  <div className="p-12 text-center text-slate-400">
                      <ClipboardList size={48} className="mx-auto mb-4 opacity-20"/>
                      <p>No hay registros en la bitácora aún.</p>
                  </div>
              )}
          </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col w-full relative min-h-screen">
      <div className="sticky top-0 z-40 bg-slate-50 border-b border-slate-200 mb-6 shadow-sm px-6 md:px-8 py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-4">
            <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600"><ArrowLeft size={20} /></button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{unit.name}</h1>
              <div className="flex items-center space-x-2 text-sm text-slate-500">
                <span className={`w-2 h-2 rounded-full ${unit.status === 'Activo' ? 'bg-green-500' : 'bg-red-500'}`}></span><span>{unit.status}</span><span>•</span><span>{unit.clientName}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-full md:w-fit overflow-x-auto">
          {checkPermission(userRole, 'UNIT_OVERVIEW', 'view') && (
              <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap capitalize ${activeTab === 'overview' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>General</button>
          )}
          {checkPermission(userRole, 'PERSONNEL', 'view') && (
              <button onClick={() => setActiveTab('personnel')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap capitalize ${activeTab === 'personnel' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Personal</button>
          )}
          {checkPermission(userRole, 'LOGISTICS', 'view') && (
              <button onClick={() => setActiveTab('logistics')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap capitalize ${activeTab === 'logistics' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Logística</button>
          )}
          {checkPermission(userRole, 'LOGS', 'view') && (
              <button onClick={() => setActiveTab('management')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap capitalize ${activeTab === 'management' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Supervisión</button>
          )}
          {checkPermission(userRole, 'BLUEPRINT', 'view') && (
              <button onClick={() => setActiveTab('blueprint')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap capitalize ${activeTab === 'blueprint' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Plano</button>
          )}
          {checkPermission(userRole, 'CLIENT_REQUESTS', 'view') && (
              <button onClick={() => setActiveTab('requests')} className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap capitalize ${activeTab === 'requests' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Requerimientos</button>
          )}
          <button 
            onClick={openNightSupervisionModal}
            className="px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex items-center gap-2"
            title="Ver reportes de supervisión nocturna"
          >
            <Moon className="w-4 h-4" />
            Supervisión Nocturna
          </button>
        </div>
      </div>

      <div className="px-6 md:px-8 pb-10">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'personnel' && renderPersonnel()}
        {activeTab === 'logistics' && renderLogistics()}
        {activeTab === 'management' && renderManagement()}
        {activeTab === 'blueprint' && renderBlueprint()}
        {activeTab === 'requests' && renderClientRequests()}
      </div>
      
      {/* --- MODALS SECTION --- */}
      
      {/* 1. Client Request Modal (Updated with Photos) */}
      {showRequestModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center"><MessageSquarePlus className="mr-2" size={20}/> Nuevo Requerimiento</h3>
                      <button onClick={() => setShowRequestModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <p className="text-sm text-slate-600">Por favor, detalle su observación o solicitud para que nuestro equipo pueda atenderla.</p>
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Categoría</label>
                          <select 
                            className="w-full border border-slate-300 rounded-lg p-2 outline-none"
                            value={newRequestForm.category}
                            onChange={(e) => setNewRequestForm({...newRequestForm, category: e.target.value, relatedResourceId: ''})}
                          >
                              <option value="GENERAL">General / Adicional</option>
                              <option value="PERSONNEL">Personal</option>
                              <option value="LOGISTICS">Logística (Equipos/Insumos)</option>
                          </select>
                      </div>

                      {newRequestForm.category === 'PERSONNEL' && (
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Trabajador Relacionado (Opcional)</label>
                              <select 
                                className="w-full border border-slate-300 rounded-lg p-2 outline-none"
                                value={newRequestForm.relatedResourceId}
                                onChange={(e) => setNewRequestForm({...newRequestForm, relatedResourceId: e.target.value})}
                              >
                                  <option value="">-- Seleccionar Trabajador --</option>
                                  {unit.resources.filter(r => r.type === ResourceType.PERSONNEL).map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                              </select>
                          </div>
                      )}

                      {newRequestForm.category === 'LOGISTICS' && (
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Recurso Relacionado (Opcional)</label>
                              <select 
                                className="w-full border border-slate-300 rounded-lg p-2 outline-none"
                                value={newRequestForm.relatedResourceId}
                                onChange={(e) => setNewRequestForm({...newRequestForm, relatedResourceId: e.target.value})}
                              >
                                  <option value="">-- Seleccionar Equipo/Insumo --</option>
                                  {unit.resources.filter(r => r.type !== ResourceType.PERSONNEL).map(r => (
                                      <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                              </select>
                          </div>
                      )}

                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Prioridad</label>
                          <select 
                            className="w-full border border-slate-300 rounded-lg p-2 outline-none"
                            value={newRequestForm.priority}
                            onChange={(e) => setNewRequestForm({...newRequestForm, priority: e.target.value})}
                          >
                              <option value="LOW">Baja</option>
                              <option value="MEDIUM">Media</option>
                              <option value="HIGH">Alta</option>
                          </select>
                      </div>

                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                          <textarea 
                             className="w-full border border-slate-300 rounded-lg p-2 outline-none h-24" 
                             placeholder="Describa su solicitud..."
                             value={newRequestForm.description}
                             onChange={(e) => setNewRequestForm({...newRequestForm, description: e.target.value})}
                          />
                      </div>
                      
                      {/* NEW: Client Attachments */}
                      <div>
                           <label className="block text-sm font-medium text-slate-700 mb-1">Evidencias / Fotos (Opcional)</label>
                           <div className="flex gap-2">
                               <input type="text" className="flex-1 border border-slate-300 rounded-lg p-2 outline-none text-sm" placeholder="URL..." value={newRequestImageUrl} onChange={e => setNewRequestImageUrl(e.target.value)} />
                                <label className="bg-slate-100 p-2 rounded-lg cursor-pointer hover:bg-slate-200 border border-slate-200 flex items-center justify-center">
                                  <Camera size={20} className="text-slate-600"/>
                                  <input type="file" accept="image/*" className="hidden" onChange={handleFileUploadForRequest} />
                                </label>
                               <button onClick={handleAddImageToRequest} disabled={!newRequestImageUrl} className="bg-slate-100 p-2 rounded hover:bg-slate-200 disabled:opacity-50"><Plus size={20}/></button>
                           </div>
                           {newRequestImages.length > 0 && (
                               <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                                   {newRequestImages.map((img, i) => (
                                       <div key={i} className="w-16 h-16 shrink-0 relative group">
                                           <img src={img} className="w-full h-full object-cover rounded border border-slate-200" alt="ev" />
                                           <button onClick={() => setNewRequestImages(newRequestImages.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                                       </div>
                                   ))}
                               </div>
                           )}
                      </div>

                      <button 
                        onClick={handleCreateRequest} 
                        disabled={!newRequestForm.description}
                        className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2 disabled:opacity-50"
                      >
                          Enviar Solicitud
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* 2. Tracking / Resolution / Comment Modal (Replaces old Admin Resolve Modal) */}
      {editingRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col animate-in fade-in zoom-in-95 duration-200 max-h-[90vh]">
                  <div className="bg-slate-800 text-white px-6 py-4 rounded-t-xl flex justify-between items-center shrink-0">
                      <h3 className="font-bold text-lg flex items-center"><Edit2 className="mr-2" size={20}/> Seguimiento de Solicitud</h3>
                      <button onClick={() => setEditingRequest(null)} className="text-white/80 hover:text-white"><X size={20} /></button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                      {/* Original Request Info */}
                      <div className="mb-6">
                          <div className="flex justify-between items-start mb-2">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${REQUEST_STATUS_STYLES[editingRequest.status]}`}>
                                 {editingRequest.status === 'IN_PROGRESS' ? 'En Proceso' : editingRequest.status === 'RESOLVED' ? 'Resuelto' : 'Pendiente'}
                              </span>
                              <span className="text-xs text-slate-400">{editingRequest.date}</span>
                          </div>
                          <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded border border-slate-100 italic mb-3">"{editingRequest.description}"</p>
                          
                          {/* Client Attachments Display */}
                          {editingRequest.attachments && editingRequest.attachments.length > 0 && (
                             <div className="mb-3">
                                 <p className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center"><Paperclip size={12} className="mr-1"/> Adjuntos del Cliente</p>
                                 <div className="flex gap-2 overflow-x-auto pb-1">
                                     {editingRequest.attachments.map((img, i) => (
                                         <div key={i} className="w-20 h-20 shrink-0 rounded border border-slate-200 overflow-hidden">
                                             <img src={img} className="w-full h-full object-cover" alt="client attachment" />
                                         </div>
                                     ))}
                                 </div>
                             </div>
                          )}
                      </div>

                      {/* Comment Thread (Chat) - Kept for legacy/detail view, but now primarily inline */}
                      <div className="mb-6 border-t border-slate-100 pt-4">
                          <h4 className="font-bold text-slate-700 text-sm mb-3 flex items-center"><MessageCircle size={16} className="mr-2"/> Historial de Comentarios</h4>
                          <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-100 max-h-60 overflow-y-auto custom-scrollbar">
                              {(!editingRequest.comments || editingRequest.comments.length === 0) && (
                                  <p className="text-xs text-slate-400 italic text-center">No hay comentarios aún.</p>
                              )}
                              {editingRequest.comments?.map(comment => (
                                  <div key={comment.id} className={`flex flex-col ${comment.role === userRole ? 'items-end' : 'items-start'}`}>
                                      <div className={`max-w-[85%] rounded-lg p-3 text-sm ${comment.role === userRole ? 'bg-blue-100 text-blue-900 rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none'}`}>
                                          <p>{comment.text}</p>
                                      </div>
                                      <span className="text-[10px] text-slate-400 mt-1 px-1">
                                          {comment.author} • {new Date(comment.date).toLocaleDateString()}
                                      </span>
                                  </div>
                              ))}
                          </div>
                      </div>

                      {/* Admin Resolution Section (Only visible to non-clients or if resolved) */}
                      {(userRole !== 'CLIENT' || editingRequest.status === 'RESOLVED') && (
                          <div className="border-t border-slate-100 pt-4 mt-4">
                              <h4 className="font-bold text-slate-700 text-sm mb-3 flex items-center"><CheckCircle size={16} className="mr-2"/> Resolución / Cambio de Estado</h4>
                              
                              {userRole !== 'CLIENT' ? (
                                  <div className="space-y-4">
                                      <div>
                                          <label className="block text-sm font-medium text-slate-700 mb-1">Nuevo Estado</label>
                                          <select 
                                            className="w-full border border-slate-300 rounded-lg p-2 outline-none"
                                            defaultValue={editingRequest.status}
                                            id="resolve-status"
                                          >
                                              <option value="PENDING">Pendiente</option>
                                              <option value="IN_PROGRESS">En Proceso</option>
                                              <option value="RESOLVED">Resuelto</option>
                                          </select>
                                      </div>

                                      <div>
                                          <label className="block text-sm font-medium text-slate-700 mb-1">Respuesta Final / Resumen</label>
                                          <textarea 
                                             className="w-full border border-slate-300 rounded-lg p-2 outline-none h-20" 
                                             placeholder="Indique las acciones tomadas..."
                                             defaultValue={editingRequest.response || ''}
                                             id="resolve-response"
                                          />
                                      </div>

                                      {/* NEW: Admin Attachments (Sustento) */}
                                      <div>
                                           <label className="block text-sm font-medium text-slate-700 mb-1">Evidencias de Respuesta (Fotos/Docs)</label>
                                           <div className="flex gap-2">
                                               <input type="text" className="flex-1 border border-slate-300 rounded-lg p-2 outline-none text-sm" placeholder="URL..." value={resolveImageUrl} onChange={e => setResolveImageUrl(e.target.value)} />
                                                <label className="bg-slate-100 p-2 rounded-lg cursor-pointer hover:bg-slate-200 border border-slate-200 flex items-center justify-center">
                                                  <Camera size={20} className="text-slate-600"/>
                                                  <input type="file" accept="image/*" className="hidden" onChange={handleFileUploadForResolve} />
                                                </label>
                                               <button onClick={handleAddResolveImage} disabled={!resolveImageUrl} className="bg-slate-100 p-2 rounded hover:bg-slate-200 disabled:opacity-50"><Plus size={20}/></button>
                                           </div>
                                           {resolveAttachments.length > 0 && (
                                               <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                                                   {resolveAttachments.map((img, i) => (
                                                       <div key={i} className="w-16 h-16 shrink-0 relative group">
                                                           <img src={img} className="w-full h-full object-cover rounded border border-slate-200" alt="admin ev" />
                                                           <button onClick={() => handleRemoveResolveImage(i)} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                                                       </div>
                                                   ))}
                                               </div>
                                           )}
                                      </div>

                                      <button 
                                        onClick={() => {
                                            const status = (document.getElementById('resolve-status') as HTMLSelectElement).value as any;
                                            const response = (document.getElementById('resolve-response') as HTMLTextAreaElement).value;
                                            handleUpdateRequestStatus(status, response, resolveAttachments);
                                        }} 
                                        className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                                      >
                                          Actualizar Estado
                                      </button>
                                  </div>
                              ) : (
                                  <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                                      <p className="text-sm font-bold text-green-800 mb-1">Respuesta Final:</p>
                                      <p className="text-sm text-green-700">{editingRequest.response || "Sin respuesta final registrada."}</p>
                                      {/* Show attachments preview in read-only mode */}
                                      {editingRequest.responseAttachments && editingRequest.responseAttachments.length > 0 && (
                                         <div className="flex gap-2 mt-2 pt-2 border-t border-green-200/50">
                                            {editingRequest.responseAttachments.map((att, i) => (
                                                <div key={i} className="w-12 h-12 rounded border border-green-200 overflow-hidden"><img src={att} className="w-full h-full object-cover"/></div>
                                            ))}
                                         </div>
                                     )}
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* 3. New Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                <h3 className="font-bold text-lg flex items-center"><Plus className="mr-2" size={20}/> Nuevo Evento</h3>
                <button onClick={() => setShowEventModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
             </div>
             <div className="p-6 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Evento</label>
                    <select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newEventForm.type} onChange={e => setNewEventForm({...newEventForm,type: e.target.value})}>
                        <option value="Coordinacion">Coordinación</option>
                        <option value="Supervision">Supervisión</option>
                        <option value="Incidencia">Incidencia</option>
                        <option value="Capacitacion">Capacitación</option>
                        <option value="Visita Cliente">Visita Cliente</option>
                    </select>
                </div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label><input type="date" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newEventForm.date} onChange={e => setNewEventForm({...newEventForm, date: e.target.value})} /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label><textarea className="w-full border border-slate-300 rounded-lg p-2 outline-none h-24" value={newEventForm.description} onChange={e => setNewEventForm({...newEventForm, description: e.target.value})} /></div>
                
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-2">Responsables / Involucrados</label>
                   <div className="border border-slate-200 rounded-lg max-h-32 overflow-y-auto p-2 bg-slate-50 space-y-1">
                      <p className="text-xs text-slate-400 uppercase font-bold px-1">Staff Gestión</p>
                      {availableStaff.map(s => (
                          <div key={s.id} onClick={() => toggleEventResponsible(s.id)} className={`flex items-center p-1.5 rounded cursor-pointer ${newEventResponsibles.includes(s.id) ? 'bg-blue-100' : 'hover:bg-slate-100'}`}>
                              <div className={`w-3 h-3 border rounded mr-2 ${newEventResponsibles.includes(s.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}></div>
                              <span className="text-xs text-slate-700">{s.name}</span>
                          </div>
                      ))}
                      <p className="text-xs text-slate-400 uppercase font-bold px-1 mt-2">Personal Unidad</p>
                      {personnel.map(p => (
                          <div key={p.id} onClick={() => toggleEventResponsible(p.id)} className={`flex items-center p-1.5 rounded cursor-pointer ${newEventResponsibles.includes(p.id) ? 'bg-blue-100' : 'hover:bg-slate-100'}`}>
                              <div className={`w-3 h-3 border rounded mr-2 ${newEventResponsibles.includes(p.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}></div>
                              <span className="text-xs text-slate-700">{p.name}</span>
                          </div>
                      ))}
                   </div>
                </div>

                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Fotos (Evidencias)</label>
                   <div className="flex gap-2">
                     <input type="text" className="flex-1 border border-slate-300 rounded-lg p-2 outline-none text-sm" placeholder="URL..." value={newEventImageUrl} onChange={e => setNewEventImageUrl(e.target.value)} />
                      <label className="bg-slate-100 p-2 rounded-lg cursor-pointer hover:bg-slate-200 border border-slate-200 flex items-center justify-center">
                        <Camera size={20} className="text-slate-600"/>
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUploadForNewEvent} />
                      </label>
                     <button onClick={handleAddImageToNewEvent} disabled={!newEventImageUrl} className="bg-slate-100 p-2 rounded hover:bg-slate-200 disabled:opacity-50"><Plus size={20}/></button>
                   </div>
                   {newEventImages.length > 0 && (
                     <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                       {newEventImages.map((img, i) => (
                         <div key={i} className="w-12 h-12 shrink-0 relative group">
                            <img src={img} className="w-full h-full object-cover rounded border border-slate-200" alt="ev" />
                            <button onClick={() => setNewEventImages(newEventImages.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                         </div>
                       ))}
                     </div>
                   )}
                </div>

                <button onClick={handleCreateEvent} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2">Guardar Evento</button>
             </div>
          </div>
        </div>
      )}
      
      {/* 4. Bulk Import Modal */}
      {showBulkImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-green-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center">
                <FileSpreadsheet className="mr-2" size={20}/> Carga Masiva de Trabajadores
              </h3>
              <button onClick={() => { setShowBulkImportModal(false); setImportResult(null); }} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">Formato del archivo Excel</h4>
                <p className="text-sm text-blue-800 mb-3">
                  El archivo debe tener las siguientes columnas (la primera fila debe ser encabezados):
                </p>
                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                  <li><strong>Nombre</strong> (requerido) - Nombre completo del trabajador</li>
                  <li><strong>DNI</strong> (opcional) - Documento Nacional de Identidad</li>
                  <li><strong>Puesto</strong> (opcional) - Cargo o puesto del trabajador</li>
                  <li><strong>Zonas</strong> (opcional) - Zonas asignadas, separadas por coma o punto y coma</li>
                  <li><strong>Turno</strong> (opcional) - Diurno, Nocturno o Mixto</li>
                  <li><strong>Fecha Inicio</strong> (opcional) - Formato: YYYY-MM-DD o DD/MM/YYYY</li>
                  <li><strong>Fecha Fin</strong> (opcional) - Formato: YYYY-MM-DD o DD/MM/YYYY</li>
                </ul>
                <p className="text-xs text-blue-600 mt-3">
                  <strong>Nota:</strong> Los encabezados pueden estar en español o inglés y no son case-sensitive.
                </p>
              </div>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={async () => {
                    try {
                      const { excelService } = await import('../services/excelService');
                      await excelService.generatePersonnelTemplate();
                      setNotification({ 
                        type: 'success', 
                        message: 'Plantilla descargada correctamente' 
                      });
                      setTimeout(() => setNotification(null), 3000);
                    } catch (error: any) {
                      setNotification({ 
                        type: 'error', 
                        message: `Error al generar plantilla: ${error.message}` 
                      });
                      setTimeout(() => setNotification(null), 5000);
                    }
                  }}
                  className="flex-1 bg-slate-100 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors flex items-center justify-center"
                >
                  <FileSpreadsheet size={18} className="mr-2" /> Descargar Plantilla
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Seleccionar archivo Excel (.xlsx, .xls)
                </label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-green-500 transition-colors">
                  <input
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleBulkImport(file);
                      }
                    }}
                    className="hidden"
                    id="bulk-import-file"
                    disabled={isImporting}
                  />
                  <label
                    htmlFor="bulk-import-file"
                    className={`cursor-pointer flex flex-col items-center ${isImporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Upload size={48} className="text-slate-400 mb-2" />
                    <span className="text-sm font-medium text-slate-700">
                      {isImporting ? 'Procesando...' : 'Haz clic para seleccionar archivo'}
                    </span>
                    <span className="text-xs text-slate-500 mt-1">
                      Solo archivos Excel (.xlsx, .xls)
                    </span>
                  </label>
                </div>
              </div>

              {isImporting && (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                  <span className="ml-3 text-slate-600">Procesando archivo...</span>
                </div>
              )}

              {importResult && (
                <div className="border border-slate-200 rounded-lg p-4">
                  <h4 className="font-semibold text-slate-800 mb-3">Resultado de la importación</h4>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-slate-600">{importResult.totalRows}</div>
                      <div className="text-xs text-slate-500">Total</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{importResult.successful}</div>
                      <div className="text-xs text-slate-500">Exitosos</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{importResult.failed}</div>
                      <div className="text-xs text-slate-500">Errores</div>
                    </div>
                  </div>

                  {importResult.errors.length > 0 && (
                    <div className="mt-4">
                      <h5 className="font-medium text-red-700 mb-2">Errores:</h5>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {importResult.errors.map((error, idx) => (
                          <div key={idx} className="text-xs bg-red-50 border border-red-200 rounded p-2">
                            <span className="font-medium">Fila {error.row}:</span> {error.error}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {importResult.warnings.length > 0 && (
                    <div className="mt-4">
                      <h5 className="font-medium text-yellow-700 mb-2">Advertencias:</h5>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {importResult.warnings.map((warning, idx) => (
                          <div key={idx} className="text-xs bg-yellow-50 border border-yellow-200 rounded p-2">
                            <span className="font-medium">Fila {warning.row}:</span> {warning.warning}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <button
                  onClick={() => { setShowBulkImportModal(false); setImportResult(null); }}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                  disabled={isImporting}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Add Worker Modal */}
      {showAddWorkerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                <h3 className="font-bold text-lg flex items-center"><UserPlus className="mr-2" size={20}/> Nuevo Colaborador</h3>
                <button onClick={() => setShowAddWorkerModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
             </div>
             <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo *</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newWorkerForm.name} onChange={e => setNewWorkerForm({...newWorkerForm, name: e.target.value})} required />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">DNI</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newWorkerForm.dni || ''} onChange={e => setNewWorkerForm({...newWorkerForm, dni: e.target.value})} placeholder="Documento Nacional de Identidad" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Puesto</label>
                  <input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newWorkerForm.puesto || ''} onChange={e => setNewWorkerForm({...newWorkerForm, puesto: e.target.value})} placeholder="Ej. Guardia de Seguridad, Supervisor, etc." />
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Zona(s) Asignada(s)</label>
                    <ZoneMultiSelect 
                        selectedZones={newWorkerForm.zones}
                        onChange={(zones) => setNewWorkerForm({...newWorkerForm, zones})}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Turno</label>
                    <select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newWorkerForm.shift} onChange={e => setNewWorkerForm({...newWorkerForm, shift: e.target.value})}>
                        <option value="">Seleccionar...</option>
                        <option value="Diurno">Diurno</option>
                        <option value="Nocturno">Nocturno</option>
                        <option value="Mixto">Mixto</option>
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Inicio</label>
                    <input type="date" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newWorkerForm.startDate || ''} onChange={e => setNewWorkerForm({...newWorkerForm, startDate: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Fin</label>
                    <input type="date" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newWorkerForm.endDate || ''} onChange={e => {
                      const endDate = e.target.value;
                      setNewWorkerForm({...newWorkerForm, endDate});
                    }} />
                    {newWorkerForm.endDate && (
                      <p className="text-xs text-amber-600 mt-1">El trabajador pasará a estado "Cesado"</p>
                    )}
                  </div>
                </div>

                <button 
                  onClick={handleAddWorker} 
                  disabled={isSavingWorker}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isSavingWorker ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Guardando...
                    </>
                  ) : (
                    'Registrar Colaborador'
                  )}
                </button>
             </div>
          </div>
        </div>
      )}

      {/* 6. Mass Training Modal */}
      {showMassTrainingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                <h3 className="font-bold text-lg flex items-center"><Award className="mr-2" size={20}/> Registrar Capacitación</h3>
                <button onClick={() => setShowMassTrainingModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
             </div>
             <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600">Asignando a <span className="font-bold">{selectedPersonnelIds.length}</span> colaboradores seleccionados.</p>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Tema / Curso</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={massTrainingForm.topic} onChange={e => setMassTrainingForm({...massTrainingForm, topic: e.target.value})} /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label><input type="date" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={massTrainingForm.date} onChange={e => setMassTrainingForm({...massTrainingForm, date: e.target.value})} /></div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                    <select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={massTrainingForm.status} onChange={e => setMassTrainingForm({...massTrainingForm, status: e.target.value})}>
                        <option value="Programado">Programado</option>
                        <option value="Completado">Completado</option>
                    </select>
                </div>
                <button onClick={handleMassAssignTraining} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2">Guardar Capacitación</button>
             </div>
          </div>
        </div>
      )}

      {/* 7. Mass Asset Assignment Modal (Was missing in previous provided text) */}
      {showAssetAssignmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-orange-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                <h3 className="font-bold text-lg flex items-center"><Briefcase className="mr-2" size={20}/> Asignar EPP / Activo</h3>
                <button onClick={() => setShowAssetAssignmentModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
             </div>
             <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600">Asignando a <span className="font-bold">{selectedPersonnelIds.length}</span> colaboradores seleccionados.</p>
                
                {/* Opción: Usar catálogo o texto libre */}
                <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="useStandardAsset"
                    checked={useStandardAsset}
                    onChange={(e) => {
                      setUseStandardAsset(e.target.checked);
                      if (!e.target.checked) {
                        setAssetAssignmentForm({ ...assetAssignmentForm, standardAssetId: undefined, name: '', serialNumber: '' });
                      }
                    }}
                    className="rounded"
                  />
                  <label htmlFor="useStandardAsset" className="text-sm text-slate-700 cursor-pointer">
                    Usar activo del catálogo estándar
                  </label>
                </div>

                {useStandardAsset ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Activo Estándar <span className="text-red-500">*</span>
                      </label>
                      <select
                        className="w-full border border-slate-300 rounded-lg p-2 outline-none"
                        value={assetAssignmentForm.standardAssetId || ''}
                        onChange={(e) => {
                          const selectedAsset = standardAssets.find(a => a.id === e.target.value);
                          if (selectedAsset) {
                            setAssetAssignmentForm({
                              ...assetAssignmentForm,
                              standardAssetId: selectedAsset.id,
                              name: selectedAsset.name,
                              type: selectedAsset.type as any,
                              serialNumber: selectedAsset.defaultSerialNumberPrefix || ''
                            });
                          }
                        }}
                      >
                        <option value="">Seleccionar activo del catálogo...</option>
                        {['EPP', 'Uniforme', 'Tecnologia', 'Herramienta', 'Otro'].map(type => {
                          const assetsOfType = standardAssets.filter(a => a.type === type);
                          if (assetsOfType.length === 0) return null;
                          return (
                            <optgroup key={type} label={type === 'Tecnologia' ? 'Tecnología' : type}>
                              {assetsOfType.map(asset => (
                                <option key={asset.id} value={asset.id}>
                                  {asset.name}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                      {assetAssignmentForm.standardAssetId && (
                        <p className="text-xs text-slate-500 mt-1">
                          Activo seleccionado: <span className="font-medium">{assetAssignmentForm.name}</span>
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                      <select 
                        className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-slate-100" 
                        value={assetAssignmentForm.type} 
                        disabled
                      >
                        <option value={assetAssignmentForm.type}>
                          {assetAssignmentForm.type === 'Tecnologia' ? 'Tecnología' : assetAssignmentForm.type}
                        </option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1">Tipo definido por el activo estándar</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Activo</label>
                      <input 
                        type="text" 
                        className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                        placeholder="Ej. Botas de Seguridad" 
                        value={assetAssignmentForm.name} 
                        onChange={e => setAssetAssignmentForm({...assetAssignmentForm, name: e.target.value})} 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                      <select 
                        className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                        value={assetAssignmentForm.type} 
                        onChange={e => setAssetAssignmentForm({...assetAssignmentForm, type: e.target.value as any})}
                      >
                        <option value="EPP">EPP</option>
                        <option value="Uniforme">Uniforme</option>
                        <option value="Tecnologia">Tecnología (Celular/Laptop)</option>
                        <option value="Herramienta">Herramienta</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                  </>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha Entrega</label>
                  <input 
                    type="date" 
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                    value={assetAssignmentForm.dateAssigned} 
                    onChange={e => setAssetAssignmentForm({...assetAssignmentForm, dateAssigned: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">N° Serie (Opcional)</label>
                  <input 
                    type="text" 
                    className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                    value={assetAssignmentForm.serialNumber} 
                    onChange={e => setAssetAssignmentForm({...assetAssignmentForm, serialNumber: e.target.value})} 
                    placeholder={useStandardAsset && assetAssignmentForm.standardAssetId ? "Prefijo aplicado automáticamente" : ""}
                  />
                </div>
                
                <div className="flex items-center space-x-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <input 
                    type="checkbox" 
                    id="generateConstancy" 
                    checked={generateConstancy} 
                    onChange={(e) => setGenerateConstancy(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="generateConstancy" className="text-sm text-slate-700 cursor-pointer">
                    <span className="font-medium">Generar constancia de entrega en PDF</span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      Se generará una constancia con declaración jurada para cada trabajador (requiere DNI)
                    </span>
                  </label>
                </div>
                
                <button onClick={handleMassAssignAsset} className="w-full bg-orange-600 text-white py-2.5 rounded-lg font-medium hover:bg-orange-700 transition-colors mt-2">Registrar Entrega</button>
             </div>
          </div>
        </div>
      )}

      {/* 8. Edit Resource Modal */}
      {editingResource && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center"><Edit2 className="mr-2" size={20}/> Editar Recurso</h3>
                      <button onClick={() => setEditingResource(null)} className="text-white/80 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.name} onChange={e => setEditingResource({...editingResource, name: e.target.value})} /></div>
                      
                      {editingResource.type === ResourceType.PERSONNEL && (
                          <>
                              <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">DNI</label>
                                  <input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.dni || ''} onChange={e => setEditingResource({...editingResource, dni: e.target.value})} placeholder="Documento Nacional de Identidad" />
                              </div>
                              <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">Puesto</label>
                                  <input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.puesto || ''} onChange={e => setEditingResource({...editingResource, puesto: e.target.value})} placeholder="Ej. Guardia de Seguridad, Supervisor, etc." />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-sm font-medium text-slate-700 mb-1">Turno</label>
                                      <select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.assignedShift} onChange={e => setEditingResource({...editingResource, assignedShift: e.target.value})}>
                                          <option value="">Seleccionar...</option>
                                          <option value="Diurno">Diurno</option>
                                          <option value="Nocturno">Nocturno</option>
                                          <option value="Mixto">Mixto</option>
                                      </select>
                                  </div>
                                  <div>
                                      <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                                      <select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.status} onChange={e => setEditingResource({...editingResource, status: e.target.value})}>
                                          <option value="Activo">Activo</option>
                                          <option value="De Licencia">De Licencia</option>
                                          <option value="Reemplazo Temporal">Reemplazo Temporal</option>
                                      </select>
                                  </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                  <div>
                                      <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Inicio</label>
                                      <input type="date" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.startDate || ''} onChange={e => setEditingResource({...editingResource, startDate: e.target.value})} />
                                  </div>
                                  <div>
                                      <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Fin</label>
                                      <input type="date" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.endDate || ''} onChange={e => {
                                        const endDate = e.target.value;
                                        setEditingResource({
                                          ...editingResource, 
                                          endDate,
                                          // El trigger de la BD cambiará automáticamente el personnelStatus a 'cesado'
                                        });
                                      }} />
                                      {editingResource.endDate && (
                                        <p className="text-xs text-amber-600 mt-1">El trabajador pasará a estado "Cesado"</p>
                                      )}
                                  </div>
                              </div>
                          </>
                      )}

                      {/* Zone Multi-Select for Edit */}
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Zona(s) Asignada(s)</label>
                          <ZoneMultiSelect 
                              selectedZones={editingResource.assignedZones || []}
                              onChange={(zones) => setEditingResource({...editingResource, assignedZones: zones})}
                          />
                      </div>
                      
                      {/* Only for Logistics: Edit SKU */}
                      {editingResource.type !== ResourceType.PERSONNEL && (
                           <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center"><LinkIcon size={12} className="mr-1"/> Código SKU / ID Externo</label>
                              <input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none font-mono text-sm" value={editingResource.externalId || ''} onChange={e => setEditingResource({...editingResource, externalId: e.target.value})} />
                          </div>
                      )}

                      <div className="flex gap-2 pt-2">
                          <button 
                            onClick={handleDeleteResource} 
                            disabled={isUpdatingResource}
                            className="flex-1 bg-red-50 text-red-600 py-2.5 rounded-lg font-medium hover:bg-red-100 transition-colors border border-red-100 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Trash2 size={16} className="mr-2"/> Eliminar
                          </button>
                          <button 
                            onClick={handleUpdateResource} 
                            disabled={isUpdatingResource}
                            className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                          >
                            {isUpdatingResource ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                Guardando...
                              </>
                            ) : (
                              'Guardar Cambios'
                            )}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
      
      {/* 9. Add Resource Modal (Logistics) */}
      {showAddResourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                <h3 className="font-bold text-lg flex items-center">
                    {newResourceType === ResourceType.EQUIPMENT ? <Truck className="mr-2" size={20}/> : <Package className="mr-2" size={20}/>} 
                    Nuevo {newResourceType === ResourceType.EQUIPMENT ? 'Equipo' : 'Material'}
                </h3>
                <button onClick={() => setShowAddResourceModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
             </div>
             <div className="p-6 space-y-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newResourceForm.name} onChange={e => setNewResourceForm({...newResourceForm, name: e.target.value})} /></div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Cantidad</label>
                        <input type="number" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newResourceForm.quantity} onChange={e => setNewResourceForm({...newResourceForm, quantity: Number(e.target.value)})} />
                    </div>
                    {newResourceType === ResourceType.MATERIAL && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Unidad Medida</label>
                            <input type="text" placeholder="Ej. Litros" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newResourceForm.unitOfMeasure || ''} onChange={e => setNewResourceForm({...newResourceForm, unitOfMeasure: e.target.value})} />
                        </div>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Zona(s) Asignada(s)</label>
                    <ZoneMultiSelect 
                        selectedZones={newResourceForm.assignedZones || []}
                        onChange={(zones) => setNewResourceForm({...newResourceForm, assignedZones: zones})}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center"><LinkIcon size={12} className="mr-1"/> SKU (Opcional)</label>
                    <input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none font-mono text-sm" value={newResourceForm.externalId || ''} onChange={e => setNewResourceForm({...newResourceForm, externalId: e.target.value})} />
                </div>

                {newResourceType === ResourceType.EQUIPMENT && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Trabajador Responsable (para constancia)</label>
                      <select 
                        className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                        value={equipmentResponsibleWorkerId} 
                        onChange={e => setEquipmentResponsibleWorkerId(e.target.value)}
                      >
                        <option value="">Seleccionar trabajador...</option>
                        {unit.resources
                          .filter(r => r.type === ResourceType.PERSONNEL)
                          .map(worker => (
                            <option key={worker.id} value={worker.id}>
                              {worker.name} {worker.dni ? `(DNI: ${worker.dni})` : '(Sin DNI)'}
                            </option>
                          ))}
                      </select>
                    </div>

                    {equipmentResponsibleWorkerId && (
                      <div className="flex items-center space-x-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <input 
                          type="checkbox" 
                          id="generateEquipmentConstancy" 
                          checked={generateEquipmentConstancy} 
                          onChange={(e) => setGenerateEquipmentConstancy(e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="generateEquipmentConstancy" className="text-sm text-slate-700 cursor-pointer">
                          <span className="font-medium">Generar constancia de entrega de maquinaria en PDF</span>
                          <span className="block text-xs text-slate-500 mt-0.5">
                            Se generará una constancia con compromiso de uso adecuado y cuidado
                          </span>
                        </label>
                      </div>
                    )}
                  </>
                )}

                <button onClick={handleAddResource} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2">Registrar</button>
             </div>
          </div>
        </div>
      )}
      
      {/* 10. Maintenance Modal (Triggered by maintenanceResource state) */}
      {maintenanceResource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-orange-500 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                <h3 className="font-bold text-lg flex items-center"><Wrench className="mr-2" size={20}/> Registrar Mantenimiento</h3>
                <button onClick={() => setMaintenanceResource(null)} className="text-white/80 hover:text-white"><X size={20} /></button>
             </div>
             <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600">Equipo: <span className="font-bold">{maintenanceResource.name}</span></p>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label><input type="date" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newMaintenanceForm.date} onChange={e => setNewMaintenanceForm({...newMaintenanceForm, date: e.target.value})} /></div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                        <select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newMaintenanceForm.type} onChange={e => setNewMaintenanceForm({...newMaintenanceForm, type: e.target.value})}>
                            <option value="Preventivo">Preventivo</option>
                            <option value="Correctivo">Correctivo</option>
                            <option value="Supervision">Supervisión</option>
                            <option value="Calibracion">Calibración</option>
                        </select>
                    </div>
                </div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label><textarea className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newMaintenanceForm.description} onChange={e => setNewMaintenanceForm({...newMaintenanceForm, description: e.target.value})} /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Técnico / Proveedor</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newMaintenanceForm.technician} onChange={e => setNewMaintenanceForm({...newMaintenanceForm, technician: e.target.value})} /></div>
                
                {/* Responsibles Selection */}
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-2">Responsables / Involucrados</label>
                   <div className="border border-slate-200 rounded-lg max-h-32 overflow-y-auto p-2 bg-slate-50 space-y-1">
                      {availableStaff.map(s => (
                          <div key={s.id} onClick={() => toggleMaintenanceResponsible(s.id)} className={`flex items-center p-1.5 rounded cursor-pointer ${newMaintenanceResponsibles.includes(s.id) ? 'bg-orange-100' : 'hover:bg-slate-100'}`}>
                              <div className={`w-3 h-3 border rounded mr-2 ${newMaintenanceResponsibles.includes(s.id) ? 'bg-orange-600 border-orange-600' : 'border-slate-300 bg-white'}`}></div>
                              <span className="text-xs text-slate-700">{s.name}</span>
                          </div>
                      ))}
                   </div>
                </div>

                 {/* Image Upload for Maintenance */}
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Fotos (Evidencias)</label>
                   <div className="flex gap-2">
                     <input type="text" className="flex-1 border border-slate-300 rounded-lg p-2 outline-none text-sm" placeholder="URL..." value={newMaintenanceImageUrl} onChange={e => setNewMaintenanceImageUrl(e.target.value)} />
                      <label className="bg-slate-100 p-2 rounded-lg cursor-pointer hover:bg-slate-200 border border-slate-200 flex items-center justify-center">
                        <Camera size={20} className="text-slate-600"/>
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUploadForMaintenance} />
                      </label>
                     <button onClick={handleAddImageToMaintenance} disabled={!newMaintenanceImageUrl} className="bg-slate-100 p-2 rounded hover:bg-slate-200 disabled:opacity-50"><Plus size={20}/></button>
                   </div>
                   {newMaintenanceImages.length > 0 && (
                     <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                       {newMaintenanceImages.map((img, i) => (
                         <div key={i} className="w-12 h-12 shrink-0 relative group">
                            <img src={img} className="w-full h-full object-cover rounded border border-slate-200" alt="ev" />
                            <button onClick={() => setNewMaintenanceImages(newMaintenanceImages.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                         </div>
                       ))}
                     </div>
                   )}
                </div>

                <button onClick={handleAddMaintenance} className="w-full bg-orange-600 text-white py-2.5 rounded-lg font-medium hover:bg-orange-700 transition-colors mt-2">Guardar Registro</button>
             </div>
          </div>
        </div>
      )}

      {/* 11. Edit Log Modal */}
      {editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
             <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                <h3 className="font-bold text-lg flex items-center"><Edit2 className="mr-2" size={20}/> Editar Registro</h3>
                <button onClick={() => setEditingLog(null)} className="text-white/80 hover:text-white"><X size={20} /></button>
             </div>
             <div className="p-6 space-y-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label><input type="date" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingLog.date} onChange={e => setEditingLog({...editingLog, date: e.target.value})} /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label><textarea className="w-full border border-slate-300 rounded-lg p-2 outline-none h-24" value={editingLog.description} onChange={e => setEditingLog({...editingLog, description: e.target.value})} /></div>
                
                 {/* Responsible Selection in Edit Log */}
                 <div>
                   <label className="block text-sm font-medium text-slate-700 mb-2">Responsables / Involucrados</label>
                   <div className="border border-slate-200 rounded-lg max-h-32 overflow-y-auto p-2 bg-slate-50 space-y-1">
                      <p className="text-xs text-slate-400 uppercase font-bold px-1">Staff Gestión</p>
                      {availableStaff.map(s => (
                          <div key={s.id} onClick={() => toggleEditLogResponsible(s.id)} className={`flex items-center p-1.5 rounded cursor-pointer ${editingLog.responsibleIds?.includes(s.id) ? 'bg-blue-100' : 'hover:bg-slate-100'}`}>
                              <div className={`w-3 h-3 border rounded mr-2 ${editingLog.responsibleIds?.includes(s.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}></div>
                              <span className="text-xs text-slate-700">{s.name}</span>
                          </div>
                      ))}
                      <p className="text-xs text-slate-400 uppercase font-bold px-1 mt-2">Personal Unidad</p>
                      {personnel.map(p => (
                          <div key={p.id} onClick={() => toggleEditLogResponsible(p.id)} className={`flex items-center p-1.5 rounded cursor-pointer ${editingLog.responsibleIds?.includes(p.id) ? 'bg-blue-100' : 'hover:bg-slate-100'}`}>
                              <div className={`w-3 h-3 border rounded mr-2 ${editingLog.responsibleIds?.includes(p.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}></div>
                              <span className="text-xs text-slate-700">{p.name}</span>
                          </div>
                      ))}
                   </div>
                </div>

                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Agregar Fotos</label>
                   <div className="flex gap-2">
                     <input type="text" className="flex-1 border border-slate-300 rounded-lg p-2 outline-none text-sm" placeholder="URL..." value={newLogImageUrl} onChange={e => setNewLogImageUrl(e.target.value)} />
                      <label className="bg-slate-100 p-2 rounded-lg cursor-pointer hover:bg-slate-200 border border-slate-200 flex items-center justify-center">
                        <Camera size={20} className="text-slate-600"/>
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUploadForLog} />
                      </label>
                     <button onClick={handleAddImageToLog} className="bg-slate-100 p-2 rounded hover:bg-slate-200"><Plus size={20}/></button>
                   </div>
                   {editingLog.images && (
                     <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                       {editingLog.images.map((img, i) => (
                         <div key={i} className="w-12 h-12 shrink-0 relative group">
                            <img src={img} className="w-full h-full object-cover rounded border border-slate-200" alt="ev" />
                            <button onClick={() => setEditingLog({...editingLog, images: editingLog.images?.filter((_, idx) => idx !== i)})} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                         </div>
                       ))}
                     </div>
                   )}
                </div>
                <button onClick={handleUpdateLog} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2">Guardar Cambios</button>
             </div>
          </div>
        </div>
      )}

      {/* Modal: Supervisión Nocturna */}
      {showNightSupervisionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <Moon className="w-6 h-6" />
                  Supervisión Nocturna - {unit.name}
                </h2>
                <p className="text-sm text-gray-600 mt-1">Reportes de supervisión nocturna para esta unidad</p>
              </div>
              <button
                onClick={() => {
                  setShowNightSupervisionModal(false);
                  setSelectedShift(null);
                  setShiftCalls([]);
                  setShiftCameraReviews([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {loadingNightSupervision ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-gray-600">Cargando...</p>
              </div>
            ) : selectedShift ? (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => {
                      setSelectedShift(null);
                      setShiftCalls([]);
                      setShiftCameraReviews([]);
                    }}
                    className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Volver a lista
                  </button>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Turno del {formatDateFromString(selectedShift.date)}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Supervisor:</span>
                      <p className="font-medium">{selectedShift.supervisor_name}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Horario:</span>
                      <p className="font-medium">{selectedShift.shift_start} - {selectedShift.shift_end}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Completitud:</span>
                      <p className="font-medium">{selectedShift.completion_percentage}%</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Estado:</span>
                      <p className="font-medium">{selectedShift.status}</p>
                    </div>
                  </div>
                </div>

                {/* Llamadas a Trabajadores */}
                <div className="bg-white border rounded-lg p-4">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    Llamadas a Trabajadores ({shiftCalls.length})
                  </h4>
                  {shiftCalls.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No hay llamadas registradas</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Trabajador</th>
                            <th className="px-3 py-2 text-left">Llamada #</th>
                            <th className="px-3 py-2 text-left">Hora Programada</th>
                            <th className="px-3 py-2 text-left">Hora Real</th>
                            <th className="px-3 py-2 text-center">Contestó</th>
                            <th className="px-3 py-2 text-center">Foto Recibida</th>
                            <th className="px-3 py-2 text-left">Observaciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shiftCalls.map((call) => (
                            <tr key={call.id} className="border-b">
                              <td className="px-3 py-2">{call.worker_name}</td>
                              <td className="px-3 py-2">{call.call_number}</td>
                              <td className="px-3 py-2">{call.scheduled_time}</td>
                              <td className="px-3 py-2">{call.actual_time || '-'}</td>
                              <td className="px-3 py-2 text-center">
                                {call.answered ? (
                                  <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-red-600 mx-auto" />
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {call.photo_received ? (
                                  <CheckCircle className="w-5 h-5 text-green-600 mx-auto" />
                                ) : (
                                  <XCircle className="w-5 h-5 text-red-600 mx-auto" />
                                )}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600">{call.notes || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Revisiones de Cámaras */}
                <div className="bg-white border rounded-lg p-4">
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Camera className="w-5 h-5" />
                    Revisiones de Cámaras ({shiftCameraReviews.length}/3)
                  </h4>
                  {shiftCameraReviews.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No hay revisiones registradas</p>
                  ) : (
                    <div className="space-y-4">
                      {shiftCameraReviews.map((review) => (
                        <div key={review.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h5 className="font-semibold text-gray-900">Revisión #{review.review_number}</h5>
                              <p className="text-sm text-gray-600">
                                Programada: {review.scheduled_time} | 
                                Real: {review.actual_time || 'No registrada'}
                              </p>
                            </div>
                          </div>
                          {review.screenshot_url && (
                            <div className="mt-3">
                              <img
                                src={review.screenshot_url}
                                alt={`Revisión ${review.review_number}`}
                                className="w-full max-w-md h-auto rounded cursor-pointer hover:opacity-90 transition-opacity"
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
                                <Eye className="w-3 h-3" />
                                Ver foto completa
                              </button>
                            </div>
                          )}
                          {review.notes && (
                            <div className="mt-3">
                              <p className="text-sm font-medium text-gray-700">Observaciones:</p>
                              <p className="text-sm text-gray-600 mt-1">{review.notes}</p>
                            </div>
                          )}
                          {review.non_conformity && (
                            <div className="mt-3 bg-red-50 border border-red-200 rounded p-2">
                              <p className="text-sm font-medium text-red-800">No Conformidad</p>
                              {review.non_conformity_description && (
                                <p className="text-sm text-red-700 mt-1">{review.non_conformity_description}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {nightSupervisionShifts.length === 0 ? (
                  <div className="text-center py-8">
                    <Moon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No hay turnos de supervisión nocturna registrados para esta unidad</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Turnos Registrados</h3>
                    {nightSupervisionShifts.map((shift) => (
                      <div
                        key={shift.id}
                        className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => loadShiftDetails(shift)}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <h4 className="font-semibold text-gray-900">
                              Turno del {formatDateFromString(shift.date)}
                            </h4>
                            <p className="text-sm text-gray-600">
                              Supervisor: {shift.supervisor_name} | 
                              Completitud: {shift.completion_percentage}% | 
                              Estado: {shift.status}
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Ver Imagen Completa - Funciona para imágenes de unidad y fotos de supervisión */}
      {showImageModal && imageModalUrl && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50" 
          onClick={() => setShowImageModal(false)}
        >
          <div className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center p-4">
            {/* Botón cerrar */}
            <button
              className="absolute top-4 right-4 bg-white/90 text-black rounded-full p-2 hover:bg-white z-10 shadow-lg transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setShowImageModal(false);
              }}
            >
              <X size={24} />
            </button>
            
            {/* Navegación entre imágenes (solo si hay múltiples imágenes de la unidad) */}
            {unit.images && unit.images.length > 1 && unit.images.includes(imageModalUrl) && (
              <>
                <button
                  className="absolute left-4 bg-white/90 text-black rounded-full p-3 hover:bg-white z-10 shadow-lg transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    const currentIndex = unit.images.findIndex(img => img === imageModalUrl);
                    const prevIndex = currentIndex > 0 ? currentIndex - 1 : unit.images.length - 1;
                    setImageModalUrl(unit.images[prevIndex]);
                  }}
                  title="Imagen anterior"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  className="absolute right-4 bg-white/90 text-black rounded-full p-3 hover:bg-white z-10 shadow-lg transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    const currentIndex = unit.images.findIndex(img => img === imageModalUrl);
                    const nextIndex = currentIndex < unit.images.length - 1 ? currentIndex + 1 : 0;
                    setImageModalUrl(unit.images[nextIndex]);
                  }}
                  title="Imagen siguiente"
                >
                  <ChevronRight size={24} />
                </button>
                
                {/* Indicador de imagen actual */}
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm z-10 backdrop-blur-sm">
                  {unit.images.findIndex(img => img === imageModalUrl) + 1} / {unit.images.length}
                </div>
              </>
            )}
            
            {/* Imagen */}
            <img
              src={imageModalUrl}
              alt="Imagen completa"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              onError={(e) => {
                console.error('Error al cargar imagen:', imageModalUrl);
                (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5Y2EzYWYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZW4gbm8gZGlzcG9uaWJsZTwvdGV4dD48L3N2Zz4=';
              }}
            />
          </div>
        </div>
      )}

    </div>
  );
};

