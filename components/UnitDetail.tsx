
import React, { useState, useEffect } from 'react';
import { Unit, ResourceType, StaffStatus, Resource, UnitStatus, Training, OperationalLog, UserRole, AssignedAsset, UnitContact, ManagementStaff, ManagementRole, MaintenanceRecord } from '../types';
import { ArrowLeft, UserCheck, Box, ClipboardList, MapPin, Calendar, ShieldCheck, HardHat, Sparkles, BrainCircuit, Truck, Edit2, X, ChevronDown, ChevronUp, Award, Camera, Clock, PlusSquare, CheckSquare, Square, Plus, Trash2, Image as ImageIcon, Save, Users, PackagePlus, FileText, UserPlus, AlertCircle, Shirt, Smartphone, Laptop, Briefcase, Phone, Mail, BadgeCheck, Wrench, PenTool, History, RefreshCw, Link as LinkIcon } from 'lucide-react';
import { generateExecutiveReport } from '../services/geminiService';
import { syncResourceWithInventory } from '../services/inventoryService';

interface UnitDetailProps {
  unit: Unit;
  userRole: UserRole;
  availableStaff: ManagementStaff[]; // GLOBAL REGISTRY PASSED DOWN
  onBack: () => void;
  onUpdate?: (updatedUnit: Unit) => void;
}

const STATUS_COLORS = {
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

export const UnitDetail: React.FC<UnitDetailProps> = ({ unit, userRole, availableStaff, onBack, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'personnel' | 'logistics' | 'management' | 'overview'>('overview');
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  
  // Edit Unit General Info State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(unit);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneShifts, setNewZoneShifts] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');

  // Personnel State
  const [expandedPersonnel, setExpandedPersonnel] = useState<string | null>(null);
  const [selectedPersonnelIds, setSelectedPersonnelIds] = useState<string[]>([]);
  
  // Mass Training State
  const [showMassTrainingModal, setShowMassTrainingModal] = useState(false);
  const [massTrainingForm, setMassTrainingForm] = useState({ topic: '', date: '', status: 'Programado' });
  
  // Mass Asset Assignment State
  const [showAssetAssignmentModal, setShowAssetAssignmentModal] = useState(false);
  const [assetAssignmentForm, setAssetAssignmentForm] = useState({ name: '', type: 'EPP', dateAssigned: '', serialNumber: '' });

  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [newWorkerForm, setNewWorkerForm] = useState({ name: '', zone: '', shift: '' });

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
  const [newResourceForm, setNewResourceForm] = useState<Partial<Resource>>({ name: '', quantity: 1, status: 'Operativo' });

  // Log/Event State
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEventForm, setNewEventForm] = useState({ type: 'Coordinacion', date: '', description: '' });
  const [newEventImages, setNewEventImages] = useState<string[]>([]);
  const [newEventImageUrl, setNewEventImageUrl] = useState('');
  const [newEventResponsibles, setNewEventResponsibles] = useState<string[]>([]);
  
  const [editingLog, setEditingLog] = useState<OperationalLog | null>(null);
  const [newLogImageUrl, setNewLogImageUrl] = useState('');

  const canEdit = userRole === 'ADMIN' || userRole === 'OPERATIONS';

  // CRITICAL FIX: Sync local edit state when parent unit prop changes
  useEffect(() => {
    setEditForm(unit);
  }, [unit]);

  // --- AI Reporting ---
  const handleGenerateReport = async () => {
    setIsLoadingAi(true);
    setAiReport(null);
    try {
      const report = await generateExecutiveReport(unit);
      setAiReport(report);
    } catch (e) {
      setAiReport("Error generating report.");
    } finally {
      setIsLoadingAi(false);
    }
  };

  // --- General Unit Update ---
  const handleSaveUnit = () => {
    if (onUpdate) {
      onUpdate(editForm);
      setIsEditing(false);
    }
  };

  const handleAddZone = () => {
    if (!newZoneName) return;
    const newZone = {
      id: `z-${Date.now()}`,
      name: newZoneName,
      shifts: newZoneShifts.split(',').map(s => s.trim()).filter(s => s !== '')
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

  // --- Edit Unit Images ---
  const handleAddImageToEdit = () => {
    if (!editImageUrl) return;
    setEditForm({ ...editForm, images: [...editForm.images, editImageUrl] });
    setEditImageUrl('');
  };

  const handleRemoveImageFromEdit = (index: number) => {
    setEditForm({ ...editForm, images: editForm.images.filter((_, i) => i !== index) });
  };

  const handleFileUploadForEdit = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const imageUrl = URL.createObjectURL(file);
      setEditForm({ ...editForm, images: [...editForm.images, imageUrl] });
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

  const handleMassAssignAsset = () => {
    if (!onUpdate) return;
    const newAsset: AssignedAsset = {
        id: `a-${Date.now()}`,
        name: assetAssignmentForm.name,
        type: assetAssignmentForm.type as any,
        dateAssigned: assetAssignmentForm.dateAssigned,
        serialNumber: assetAssignmentForm.serialNumber
    };
    
    const updatedResources = unit.resources.map(res => {
        if (res.type === ResourceType.PERSONNEL && selectedPersonnelIds.includes(res.id)) {
            return {
                ...res,
                assignedAssets: [...(res.assignedAssets || []), { ...newAsset, id: `a-${Date.now()}-${res.id}` }]
            };
        }
        return res;
    });

    onUpdate({ ...unit, resources: updatedResources });
    setShowAssetAssignmentModal(false);
    setSelectedPersonnelIds([]);
    setAssetAssignmentForm({ name: '', type: 'EPP', dateAssigned: '', serialNumber: '' });
  };

  const handleAddWorker = () => {
    if (!onUpdate) return;
    const newWorker: Resource = {
      id: `r-${Date.now()}`,
      name: newWorkerForm.name,
      type: ResourceType.PERSONNEL,
      quantity: 1,
      status: StaffStatus.ACTIVE,
      assignedZone: newWorkerForm.zone,
      assignedShift: newWorkerForm.shift,
      compliancePercentage: 100,
      trainings: [],
      assignedAssets: []
    };
    onUpdate({ ...unit, resources: [...unit.resources, newWorker] });
    setShowAddWorkerModal(false);
    setNewWorkerForm({ name: '', zone: '', shift: '' });
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


  const togglePersonnelExpand = (id: string) => {
    setExpandedPersonnel(expandedPersonnel === id ? null : id);
  };
  
  const toggleEquipmentExpand = (id: string) => {
    setExpandedEquipment(expandedEquipment === id ? null : id);
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

  const handleUpdateResource = () => {
    if (!onUpdate || !editingResource) return;
    const updatedResources = unit.resources.map(r => r.id === editingResource.id ? editingResource : r);
    onUpdate({ ...unit, resources: updatedResources });
    setEditingResource(null);
  };

  const handleDeleteResource = () => {
    if (!onUpdate || !editingResource) return;
    if (confirm('¿Estás seguro de eliminar este recurso?')) {
      const updatedResources = unit.resources.filter(r => r.id !== editingResource.id);
      onUpdate({ ...unit, resources: updatedResources });
      setEditingResource(null);
    }
  };

  const handleAddResource = () => {
    if (!onUpdate) return;
    const newResource: Resource = {
      id: `r-${Date.now()}`,
      name: newResourceForm.name || 'Nuevo Recurso',
      type: newResourceType,
      quantity: newResourceForm.quantity || 1,
      status: newResourceType === ResourceType.MATERIAL ? 'Stock OK' : 'Operativo',
      unitOfMeasure: newResourceForm.unitOfMeasure,
      assignedZone: newResourceForm.assignedZone,
      nextMaintenance: newResourceForm.nextMaintenance,
      lastRestock: newResourceForm.lastRestock,
      image: newResourceForm.image,
      externalId: newResourceForm.externalId // SKU
    };
    onUpdate({ ...unit, resources: [...unit.resources, newResource] });
    setShowAddResourceModal(false);
    setNewResourceForm({ name: '', quantity: 1, status: 'Operativo', externalId: '' });
  };

  const openAddResourceModal = (type: ResourceType) => {
    setNewResourceType(type);
    setNewResourceForm({ name: '', quantity: 1, status: type === ResourceType.MATERIAL ? 'Stock OK' : 'Operativo', externalId: '' });
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
  const personnel = unit.resources.filter(r => r.type === ResourceType.PERSONNEL);
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
     // Try finding in unit personnel
     const worker = personnel.find(p => p.id === id);
     if (worker) return worker.name;
     // Try finding in global management staff
     const manager = availableStaff.find(m => m.id === id);
     if (manager) return manager.name;
     return id;
  };

  const renderOverview = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Photo Gallery */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 aspect-video md:aspect-auto md:h-80 rounded-xl overflow-hidden shadow-sm relative group bg-slate-200">
          {unit.images && unit.images.length > 0 ? (
            <img src={unit.images[0]} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Main" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400"><Camera size={48} /></div>
          )}
          <div className="absolute bottom-4 left-4"><span className="bg-black/50 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-medium">Portada</span></div>
        </div>
        <div className="hidden md:flex flex-col gap-4 h-80">
           <div className="flex-1 rounded-xl overflow-hidden shadow-sm relative bg-slate-100">
             {unit.images && unit.images[1] ? <img src={unit.images[1]} className="w-full h-full object-cover" alt="Sec" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Camera size={24} /></div>}
           </div>
           <div className="flex-1 rounded-xl overflow-hidden shadow-sm relative bg-slate-100">
             {unit.images && unit.images[2] ? <img src={unit.images[2]} className="w-full h-full object-cover" alt="Ter" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Camera size={24} /></div>}
             {unit.images && unit.images.length > 3 && <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold cursor-pointer hover:bg-black/70 transition-colors">+{unit.images.length - 3}</div>}
           </div>
        </div>
      </div>

      {/* --- Management Team (Horizontal Large Cards) --- */}
      {!isEditing && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center mb-6"><Users className="w-5 h-5 mr-2 text-slate-500" /> Equipo de Gestión y Supervisión</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* ... (Existing Management Team Code) ... */}
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
                {/* ... Other Supervisors ... */}
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
                {canEdit && (
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
                  {/* ... (Existing Edit Form) ... */}
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
                   {/* ... Other selectors ... */}
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
                                <img src={img} alt="thumb" className="w-full h-full object-cover rounded border border-slate-200" />
                                <button onClick={() => handleRemoveImageFromEdit(idx)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></button>
                            </div>
                        ))}
                     </div>
                  </div>

                  <button onClick={handleSaveUnit} className="w-full bg-blue-600 text-white py-2 rounded font-medium hover:bg-blue-700">Guardar Cambios</button>
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
                {canEdit && <button onClick={() => setShowEventModal(true)} className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-medium hover:bg-blue-100 flex items-center"><Plus size={14} className="mr-1"/> Agendar Evento</button>}
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

           {/* AI Report Generator */}
           <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-xl shadow-lg text-white">
              <div className="flex items-start justify-between mb-4">
                 <div>
                    <h3 className="font-bold text-lg flex items-center"><Sparkles className="mr-2 text-yellow-300" size={18}/> OpsFlow AI</h3>
                    <p className="text-indigo-200 text-xs mt-1">Generación de reportes inteligentes</p>
                 </div>
                 <BrainCircuit className="text-white/20" size={32} />
              </div>
              
              {!aiReport ? (
                  <button 
                    onClick={handleGenerateReport} 
                    disabled={isLoadingAi}
                    className="w-full bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 rounded-lg py-2 text-sm font-medium transition-colors flex items-center justify-center"
                  >
                    {isLoadingAi ? <><span className="animate-spin mr-2">⏳</span> Generando...</> : "Generar Reporte Ejecutivo"}
                  </button>
              ) : (
                  <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 text-xs leading-relaxed max-h-60 overflow-y-auto custom-scrollbar border border-white/20">
                      <div className="markdown-prose space-y-2">
                         {aiReport.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                      </div>
                  </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );

  const renderPersonnel = () => (
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
          {/* Toolbar */}
          <div className="flex flex-wrap justify-between items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-700 flex items-center"><Users className="mr-2"/> Dotación de Personal</h3>
              <div className="flex gap-2">
                  {selectedPersonnelIds.length > 0 && (
                      <>
                        <button onClick={() => setShowMassTrainingModal(true)} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-100 flex items-center"><Award size={16} className="mr-1.5"/> Asignar Capacitación ({selectedPersonnelIds.length})</button>
                        <button onClick={() => setShowAssetAssignmentModal(true)} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-100 flex items-center"><Briefcase size={16} className="mr-1.5"/> Asignar Activo/EPP ({selectedPersonnelIds.length})</button>
                      </>
                  )}
                  {canEdit && <button onClick={() => setShowAddWorkerModal(true)} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center shadow-sm"><UserPlus size={16} className="mr-1.5"/> Nuevo Colaborador</button>}
              </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
             <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                    <tr>
                        <th className="px-6 py-3 text-left"><button onClick={selectAllPersonnel} className="text-slate-400 hover:text-slate-600"><CheckSquare size={16}/></button></th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Colaborador</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Zona / Turno</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Cumplimiento</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Acciones</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                    {personnel.map((p) => (
                        <React.Fragment key={p.id}>
                            <tr className={`hover:bg-slate-50 transition-colors ${expandedPersonnel === p.id ? 'bg-slate-50' : ''}`}>
                                <td className="px-6 py-4"><button onClick={() => togglePersonnelSelection(p.id)} className={`${selectedPersonnelIds.includes(p.id) ? 'text-blue-600' : 'text-slate-300'}`}>{selectedPersonnelIds.includes(p.id) ? <CheckSquare size={16}/> : <Square size={16}/>}</button></td>
                                <td className="px-6 py-4 whitespace-nowrap flex items-center">
                                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center font-bold text-xs text-slate-600 mr-3">{p.name.substring(0,2)}</div>
                                    <div className="text-sm font-medium text-slate-900">{p.name}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{p.assignedZone} <span className="text-slate-400">•</span> {p.assignedShift}</td>
                                <td className="px-6 py-4 whitespace-nowrap"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_COLORS[p.status as keyof typeof STATUS_COLORS] || 'bg-gray-100'}`}>{p.status}</span></td>
                                <td className="px-6 py-4 whitespace-nowrap"><div className="w-24 bg-slate-200 rounded-full h-1.5 mt-1"><div className="bg-green-500 h-1.5 rounded-full" style={{width: `${p.compliancePercentage}%`}}></div></div><span className="text-xs text-slate-500 mt-1 block">{p.compliancePercentage}%</span></td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-2">
                                    <button onClick={() => togglePersonnelExpand(p.id)} className="text-blue-600 hover:text-blue-900 bg-blue-50 p-1.5 rounded">{expandedPersonnel === p.id ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}</button>
                                    {canEdit && <button onClick={() => setEditingResource(p)} className="text-slate-400 hover:text-slate-600 p-1.5"><Edit2 size={16}/></button>}
                                </td>
                            </tr>
                            {expandedPersonnel === p.id && (
                                <tr>
                                    <td colSpan={6} className="bg-slate-50 p-4 border-b border-slate-200 animate-in fade-in duration-200">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* Trainings */}
                                            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                                <div className="flex justify-between items-center mb-3">
                                                    <h4 className="text-xs font-bold uppercase text-slate-500 flex items-center"><Award className="mr-1.5" size={14}/> Historial de Capacitaciones</h4>
                                                    {canEdit && <button onClick={() => handleAddSingleTraining(p.id)} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 flex items-center"><Plus size={10} className="mr-1"/> Agregar</button>}
                                                </div>
                                                {p.trainings && p.trainings.length > 0 ? (
                                                    <div className="space-y-2">
                                                        {p.trainings.map(t => (
                                                            <div key={t.id} className="flex justify-between items-center text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                                                                <div><span className="font-medium text-slate-800">{t.topic}</span><div className="text-xs text-slate-500">{t.date}</div></div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.status === 'Completado' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{t.status}</span>
                                                                    {canEdit && <button onClick={() => handleDeleteTraining(p.id, t.id)} className="text-slate-300 hover:text-red-500"><X size={12}/></button>}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <p className="text-sm text-slate-400 italic">Sin capacitaciones registradas.</p>}
                                            </div>
                                            {/* Assigned Assets */}
                                            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                                <div className="flex justify-between items-center mb-3">
                                                    <h4 className="text-xs font-bold uppercase text-slate-500 flex items-center"><Briefcase className="mr-1.5" size={14}/> Inventario Asignado</h4>
                                                    {canEdit && <button onClick={() => handleAddSingleAsset(p.id)} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100 flex items-center"><Plus size={10} className="mr-1"/> Agregar</button>}
                                                </div>
                                                {p.assignedAssets && p.assignedAssets.length > 0 ? (
                                                    <div className="space-y-2">
                                                        {p.assignedAssets.map(asset => (
                                                            <div key={asset.id} className="flex justify-between items-center text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                                                                <div className="flex items-center">
                                                                    <div className="bg-slate-100 p-1.5 rounded mr-2">{getAssetIcon(asset.type)}</div>
                                                                    <div><span className="font-medium text-slate-800">{asset.name}</span><div className="text-[10px] text-slate-400">Entregado: {asset.dateAssigned}</div></div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {asset.serialNumber && <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-mono">{asset.serialNumber}</span>}
                                                                    {canEdit && <button onClick={() => handleDeleteAsset(p.id, asset.id)} className="text-slate-300 hover:text-red-500"><X size={12}/></button>}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <p className="text-sm text-slate-400 italic">Sin equipamiento asignado.</p>}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                </tbody>
             </table>
          </div>
      </div>
  );

  const renderLogistics = () => (
      <div className="space-y-8 animate-in fade-in duration-300 pb-10">
         {/* Equipment Section (STACK LAYOUT) */}
         <div>
             <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-700 text-lg flex items-center"><Truck className="mr-2"/> Maquinaria y Equipos</h3>
                {canEdit && <button onClick={() => openAddResourceModal(ResourceType.EQUIPMENT)} className="bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center shadow-sm"><Plus size={16} className="mr-1.5"/> Agregar Equipo</button>}
             </div>
             
             <div className="flex flex-col gap-4">
                 {equipment.map(eq => (
                     <div key={eq.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:flex-row group transition-all hover:border-blue-300">
                         {/* Image Side */}
                         <div className="w-full md:w-48 h-40 md:h-auto bg-slate-100 relative shrink-0">
                             {eq.image ? <img src={eq.image} alt={eq.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400"><Box size={32}/></div>}
                             <div className="absolute top-2 left-2"><span className={`text-[10px] font-bold px-2 py-1 rounded-full shadow-sm ${STATUS_COLORS[eq.status as keyof typeof STATUS_COLORS]}`}>{eq.status}</span></div>
                         </div>
                         
                         {/* Content Side */}
                         <div className="p-4 flex-1 flex flex-col justify-between">
                             <div className="flex justify-between items-start">
                                 <div>
                                     <h4 className="font-bold text-slate-800 text-lg">{eq.name}</h4>
                                     <div className="flex items-center text-sm text-slate-500 mt-1">
                                        <MapPin size={14} className="mr-1"/> {eq.assignedZone}
                                        {eq.externalId && <span className="ml-2 bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded font-mono border border-purple-200 flex items-center"><LinkIcon size={10} className="mr-1"/> {eq.externalId}</span>}
                                     </div>
                                 </div>
                                 <div className="flex gap-2">
                                     {canEdit && <button onClick={() => setEditingResource(eq)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><Edit2 size={18}/></button>}
                                 </div>
                             </div>

                             <div className="flex justify-between items-end mt-4">
                                 <div>
                                    <p className="text-xs text-slate-400 uppercase font-bold mb-1">Próximo Mantenimiento</p>
                                    <div className="flex items-center text-sm font-medium text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-100 w-fit">
                                        <Clock size={14} className="mr-1.5 text-orange-500"/> {eq.nextMaintenance || 'No programado'}
                                    </div>
                                 </div>
                                 <button onClick={() => toggleEquipmentExpand(eq.id)} className="flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium">
                                     {expandedEquipment === eq.id ? 'Ocultar Historial' : 'Ver Historial'} {expandedEquipment === eq.id ? <ChevronUp size={16} className="ml-1"/> : <ChevronDown size={16} className="ml-1"/>}
                                 </button>
                             </div>
                         </div>

                         {/* Expanded History Section (Inline) */}
                         {expandedEquipment === eq.id && (
                             <div className="w-full border-t border-slate-200 bg-slate-50 p-4 md:w-96 md:border-t-0 md:border-l shrink-0 flex flex-col h-auto md:h-auto animate-in slide-in-from-right-4 duration-300">
                                <div className="flex justify-between items-center mb-3">
                                    <h5 className="font-bold text-slate-700 text-sm flex items-center"><History size={14} className="mr-1.5"/> Historial Técnico</h5>
                                    <button onClick={() => setMaintenanceResource(eq)} className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 flex items-center"><Plus size={10} className="mr-1"/> Nuevo Reg.</button>
                                </div>
                                <div className="space-y-3 overflow-y-auto max-h-60 custom-scrollbar pr-1 flex-1">
                                    {eq.maintenanceHistory && eq.maintenanceHistory.length > 0 ? eq.maintenanceHistory.map(record => (
                                        <div key={record.id} className="bg-white p-2.5 rounded border border-slate-200 shadow-sm text-sm relative">
                                            <div className="flex justify-between mb-1">
                                                <span className="font-bold text-slate-800 text-xs">{record.date}</span>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${record.type === 'Correctivo' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{record.type}</span>
                                            </div>
                                            <p className="text-slate-600 text-xs leading-relaxed mb-2">{record.description}</p>
                                            
                                            {/* Evidence Images in History */}
                                            {record.images && record.images.length > 0 && (
                                                <div className="flex gap-1 mb-2 overflow-x-auto">
                                                    {record.images.map((img, idx) => (
                                                        <img key={idx} src={img} alt="evidencia" className="w-10 h-10 object-cover rounded border border-slate-100" />
                                                    ))}
                                                </div>
                                            )}

                                            <div className="border-t border-slate-100 pt-1.5 mt-1.5 flex justify-between items-center">
                                                <div className="flex items-center text-[10px] text-slate-500">
                                                    <UserCheck size={10} className="mr-1"/> 
                                                    {record.technician}
                                                </div>
                                                {record.responsibleIds && record.responsibleIds.length > 0 && (
                                                   <span className="text-[9px] bg-slate-100 text-slate-500 px-1 rounded" title="Responsables asignados">
                                                       +{record.responsibleIds.length} inv.
                                                   </span>
                                                )}
                                            </div>
                                        </div>
                                    )) : <div className="text-center py-6 text-slate-400 italic text-xs">Sin registros de mantenimiento.</div>}
                                </div>
                             </div>
                         )}
                     </div>
                 ))}
             </div>
         </div>

         {/* Materials Section */}
         <div>
             <div className="flex justify-between items-center mb-4 pt-4 border-t border-slate-200">
                <h3 className="font-bold text-slate-700 text-lg flex items-center"><PackagePlus className="mr-2"/> Insumos y Materiales</h3>
                {canEdit && <button onClick={() => openAddResourceModal(ResourceType.MATERIAL)} className="bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center shadow-sm"><Plus size={16} className="mr-1.5"/> Agregar Material</button>}
             </div>
             
             <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                 {materials.map(mat => (
                     <div key={mat.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 relative group hover:shadow-md transition-shadow">
                         {canEdit && <button onClick={() => setEditingResource(mat)} className="absolute top-2 right-2 p-1.5 bg-white/80 rounded-full text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"><Edit2 size={14}/></button>}
                         
                         <div className="h-24 w-full bg-slate-50 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                             {mat.image ? <img src={mat.image} className="w-full h-full object-cover" alt={mat.name} /> : <Box className="text-slate-300" size={32}/>}
                         </div>
                         
                         <h4 className="font-bold text-slate-800 text-sm line-clamp-2 h-10 mb-1" title={mat.name}>{mat.name}</h4>
                         <div className="flex justify-between items-end">
                             <div>
                                 <p className="text-xs text-slate-500">Stock Actual</p>
                                 <p className="font-bold text-lg text-slate-800">{mat.quantity} <span className="text-xs font-normal text-slate-400">{mat.unitOfMeasure}</span></p>
                             </div>
                             {/* Sync Button */}
                             {canEdit && mat.externalId && (
                                 <button 
                                   onClick={() => handleSyncInventory(mat)} 
                                   disabled={isSyncing === mat.id}
                                   className="text-purple-500 hover:text-purple-700 p-1" 
                                   title="Sincronizar Stock"
                                 >
                                     <RefreshCw size={16} className={isSyncing === mat.id ? 'animate-spin' : ''} />
                                 </button>
                             )}
                         </div>
                         <div className={`mt-2 text-[10px] font-bold px-2 py-0.5 rounded text-center ${STATUS_COLORS[mat.status as keyof typeof STATUS_COLORS]}`}>{mat.status}</div>
                         
                         <div className="mt-2 flex justify-between items-center border-t border-slate-100 pt-1.5">
                            <span className="text-[10px] text-slate-400">Reposición: {mat.lastRestock || '-'}</span>
                            {mat.externalId && <span className="text-[9px] bg-purple-50 text-purple-600 px-1 rounded border border-purple-100">{mat.externalId}</span>}
                         </div>
                     </div>
                 ))}
             </div>
         </div>
      </div>
  );

  // ... (Management Render - unchanged) ...
  const renderManagement = () => (
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
          <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-700 text-lg flex items-center"><ClipboardList className="mr-2"/> Bitácora de Sucesos</h3>
              {canEdit && <button onClick={() => setShowEventModal(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center shadow-sm"><Plus size={16} className="mr-1.5"/> Nuevo Registro</button>}
          </div>

          <div className="relative border-l-2 border-slate-200 ml-4 space-y-8">
              {unit.logs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(log => (
                  <div key={log.id} className="relative pl-6">
                      <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm ${log.type === 'Incidencia' ? 'bg-red-500' : log.type === 'Supervision' ? 'bg-blue-500' : 'bg-slate-400'}`}></div>
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex justify-between items-start mb-2">
                              <div>
                                  <div className="flex items-center space-x-2">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${log.type === 'Incidencia' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>{log.type}</span>
                                    <span className="text-sm font-semibold text-slate-900">{log.date}</span>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-1">Registrado por: {log.author}</p>
                              </div>
                              {canEdit && <button onClick={() => setEditingLog(log)} className="text-slate-400 hover:text-blue-600 p-1"><Edit2 size={16}/></button>}
                          </div>
                          
                          <p className="text-slate-700 text-sm leading-relaxed mb-3">{log.description}</p>
                          
                          {/* Responsible Staff Display */}
                          {log.responsibleIds && log.responsibleIds.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-3">
                                  {log.responsibleIds.map(rid => (
                                      <span key={rid} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-100">
                                          <UserCheck size={10} className="mr-1"/> {getPersonName(rid)}
                                      </span>
                                  ))}
                              </div>
                          )}

                          {/* Log Images Grid */}
                          {log.images && log.images.length > 0 && (
                              <div className="grid grid-cols-4 gap-2 mt-3">
                                  {log.images.map((img, i) => (
                                      <div key={i} className="aspect-square rounded-lg overflow-hidden border border-slate-100 bg-slate-50">
                                          <img src={img} alt="evidence" className="w-full h-full object-cover hover:scale-110 transition-transform duration-300 cursor-zoom-in" />
                                      </div>
                                  ))}
                              </div>
                          )}
                      </div>
                  </div>
              ))}
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
          {['overview', 'personnel', 'logistics', 'management'].map(t => (
            <button key={t} onClick={() => setActiveTab(t as any)} className={`px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap capitalize ${activeTab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
               {t === 'overview' ? 'General' : t === 'personnel' ? 'Personal' : t === 'logistics' ? 'Logística' : 'Supervisión'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 md:px-8 pb-10">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'personnel' && renderPersonnel()}
        {activeTab === 'logistics' && renderLogistics()}
        {activeTab === 'management' && renderManagement()}
      </div>

      {/* --- MODALS --- */}
      
      {/* ... [New Maintenance Entry Modal - Unchanged] ... */}
      {maintenanceResource && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-orange-600 text-white px-6 py-4 border-b border-orange-700 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <Wrench size={20}/>
                        <div>
                            <h3 className="font-bold text-lg">Nuevo Mantenimiento</h3>
                            <p className="text-xs text-orange-200 font-medium">{maintenanceResource.name}</p>
                        </div>
                    </div>
                    <button onClick={() => setMaintenanceResource(null)} className="text-white/80 hover:text-white"><X size={20} /></button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 bg-slate-50">
                    {/* Add New Record Form */}
                    {canEdit && (
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center"><PlusSquare size={16} className="mr-2 text-blue-600"/> Registrar Evento</h4>
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 block mb-1">Tipo</label>
                                        <select className="w-full border border-slate-300 rounded p-1.5 text-sm outline-none" value={newMaintenanceForm.type} onChange={e => setNewMaintenanceForm({...newMaintenanceForm, type: e.target.value})}>
                                            <option value="Preventivo">Preventivo</option>
                                            <option value="Correctivo">Correctivo</option>
                                            <option value="Supervision">Supervisión</option>
                                            <option value="Calibracion">Calibración</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-slate-500 block mb-1">Fecha</label>
                                        <input type="date" className="w-full border border-slate-300 rounded p-1.5 text-sm outline-none" value={newMaintenanceForm.date} onChange={e => setNewMaintenanceForm({...newMaintenanceForm, date: e.target.value})} />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-500 block mb-1">Descripción del Trabajo</label>
                                    <input type="text" className="w-full border border-slate-300 rounded p-1.5 text-sm outline-none" placeholder="Detalle de lo realizado..." value={newMaintenanceForm.description} onChange={e => setNewMaintenanceForm({...newMaintenanceForm, description: e.target.value})} />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-500 block mb-1">Responsable Externo / Técnico</label>
                                    <input type="text" className="w-full border border-slate-300 rounded p-1.5 text-sm outline-none" placeholder="Nombre o Proveedor" value={newMaintenanceForm.technician} onChange={e => setNewMaintenanceForm({...newMaintenanceForm, technician: e.target.value})} />
                                </div>

                                {/* Internal Responsibles Selection */}
                                <div>
                                   <label className="text-xs font-medium text-slate-500 block mb-2">Responsables / Involucrados (Internos)</label>
                                   <div className="border border-slate-200 rounded-lg max-h-32 overflow-y-auto p-2 bg-slate-50 space-y-2">
                                      <p className="text-[10px] text-slate-400 uppercase font-bold px-1">Equipo de Gestión</p>
                                      {availableStaff.map(s => (
                                          <div key={s.id} onClick={() => toggleMaintenanceResponsible(s.id)} className={`flex items-center p-1.5 rounded cursor-pointer transition-colors ${newMaintenanceResponsibles.includes(s.id) ? 'bg-orange-100 border border-orange-200' : 'hover:bg-slate-100 border border-transparent'}`}>
                                              <div className={`w-3 h-3 border rounded mr-2 flex items-center justify-center ${newMaintenanceResponsibles.includes(s.id) ? 'bg-orange-600 border-orange-600' : 'border-slate-300 bg-white'}`}>
                                                  {newMaintenanceResponsibles.includes(s.id) && <Plus size={10} className="text-white"/>}
                                              </div>
                                              <span className="text-xs text-slate-700">{s.name}</span>
                                          </div>
                                      ))}
                                      
                                      <p className="text-[10px] text-slate-400 uppercase font-bold px-1 mt-2">Personal Unidad</p>
                                      {personnel.length > 0 ? personnel.map(p => (
                                          <div key={p.id} onClick={() => toggleMaintenanceResponsible(p.id)} className={`flex items-center p-1.5 rounded cursor-pointer transition-colors ${newMaintenanceResponsibles.includes(p.id) ? 'bg-orange-100 border border-orange-200' : 'hover:bg-slate-100 border border-transparent'}`}>
                                              <div className={`w-3 h-3 border rounded mr-2 flex items-center justify-center ${newMaintenanceResponsibles.includes(p.id) ? 'bg-orange-600 border-orange-600' : 'border-slate-300 bg-white'}`}>
                                                  {newMaintenanceResponsibles.includes(p.id) && <Plus size={10} className="text-white"/>}
                                              </div>
                                              <span className="text-xs text-slate-700">{p.name}</span>
                                          </div>
                                      )) : <p className="text-[10px] text-slate-400 italic px-2">No hay personal operativo.</p>}
                                   </div>
                                </div>

                                {/* Image Upload for Maintenance */}
                                <div>
                                   <label className="text-xs font-medium text-slate-500 block mb-1">Evidencias (Fotos)</label>
                                   <div className="flex gap-2">
                                     <input type="text" className="flex-1 border border-slate-300 rounded p-1.5 text-xs outline-none" placeholder="URL..." value={newMaintenanceImageUrl} onChange={e => setNewMaintenanceImageUrl(e.target.value)} />
                                     <label className="bg-slate-100 p-1.5 rounded cursor-pointer hover:bg-slate-200 border border-slate-200 flex items-center justify-center">
                                        <Camera size={16} className="text-slate-600"/>
                                        <input type="file" accept="image/*" className="hidden" onChange={handleFileUploadForMaintenance} />
                                     </label>
                                     <button onClick={handleAddImageToMaintenance} disabled={!newMaintenanceImageUrl} className="bg-slate-100 p-1.5 rounded hover:bg-slate-200 disabled:opacity-50"><Plus size={16}/></button>
                                   </div>
                                   {newMaintenanceImages.length > 0 && (
                                     <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                                       {newMaintenanceImages.map((img, i) => (
                                         <div key={i} className="w-10 h-10 shrink-0 relative group">
                                            <img src={img} className="w-full h-full object-cover rounded border border-slate-200" alt="ev" />
                                            <button onClick={() => setNewMaintenanceImages(newMaintenanceImages.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={8} /></button>
                                         </div>
                                       ))}
                                     </div>
                                   )}
                                </div>

                                <button onClick={handleAddMaintenance} disabled={!newMaintenanceForm.date || !newMaintenanceForm.description} className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded hover:bg-blue-700 disabled:opacity-50">Guardar Registro</button>
                            </div>
                        </div>
                    )}
                </div>
             </div>
         </div>
      )}

      {/* Resource Edit Modal */}
      {editingResource && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-blue-600 text-white px-6 py-4 border-b border-blue-700 flex justify-between items-center shrink-0">
                    <div className="flex items-center">
                    {editingResource.type === ResourceType.PERSONNEL ? <UserCheck className="mr-2"/> : <PackagePlus className="mr-2"/>}
                    <h3 className="font-bold text-lg">
                        {editingResource.type === ResourceType.MATERIAL ? 'Editar Material' : 
                        editingResource.type === ResourceType.PERSONNEL ? 'Editar Colaborador' : 'Editar Equipo'}
                    </h3>
                    </div>
                    <button onClick={() => setEditingResource(null)} className="text-white/80 hover:text-white"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                    <input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.name} onChange={e => setEditingResource({...editingResource, name: e.target.value})} />
                    </div>
                    
                    {editingResource.type === ResourceType.PERSONNEL ? (
                    // --- FIELDS FOR PERSONNEL ---
                    <>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Zona Asignada</label><select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.assignedZone} onChange={e => setEditingResource({...editingResource, assignedZone: e.target.value})}><option value="">Seleccionar Zona</option>{unit.zones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Turno</label><select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.assignedShift} onChange={e => setEditingResource({...editingResource, assignedShift: e.target.value})}><option value="">Seleccionar Turno</option><option value="Diurno">Diurno</option><option value="Nocturno">Nocturno</option><option value="Rotativo">Rotativo</option></select></div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Estado</label><select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.status} onChange={e => setEditingResource({...editingResource, status: e.target.value})}><option value="Activo">Activo</option><option value="De Licencia">De Licencia</option><option value="Reemplazo Temporal">Reemplazo Temporal</option></select></div>
                    </>
                    ) : editingResource.type === ResourceType.MATERIAL ? (
                    // --- FIELDS FOR MATERIAL (UPDATED FOR INTEGRATION) ---
                    <>
                         {/* Inventory Integration Input */}
                         <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                             <label className="block text-xs font-bold text-purple-700 mb-1 uppercase">Sincronización de Inventario</label>
                             <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    className="flex-1 border border-purple-200 rounded p-1.5 text-sm outline-none" 
                                    placeholder="Código SKU / ID Externo" 
                                    value={editingResource.externalId || ''} 
                                    onChange={e => setEditingResource({...editingResource, externalId: e.target.value})} 
                                />
                                {editingResource.externalId && (
                                    <button 
                                      onClick={() => handleSyncInventory(editingResource)} 
                                      className="bg-purple-600 text-white p-2 rounded hover:bg-purple-700 disabled:opacity-50"
                                      disabled={isSyncing === editingResource.id}
                                    >
                                        <RefreshCw size={16} className={isSyncing === editingResource.id ? 'animate-spin' : ''} />
                                    </button>
                                )}
                             </div>
                             {editingResource.lastSync && <p className="text-[10px] text-purple-600 mt-1">Última sinc: {new Date(editingResource.lastSync).toLocaleString()}</p>}
                         </div>

                        <div className="grid grid-cols-2 gap-3 mt-2">
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Cantidad</label><input type="number" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.quantity} onChange={e => setEditingResource({...editingResource, quantity: Number(e.target.value)})} /></div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Unidad</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-slate-100" readOnly value={editingResource.unitOfMeasure} /></div>
                        </div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Última Reposición</label><input type="date" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.lastRestock || ''} onChange={e => setEditingResource({...editingResource, lastRestock: e.target.value})} /></div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Estado Stock</label><select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.status} onChange={e => setEditingResource({...editingResource, status: e.target.value})}><option value="Stock OK">Stock OK</option><option value="Stock Bajo">Stock Bajo</option><option value="Agotado">Agotado</option></select></div>
                    </>
                    ) : (
                    // --- FIELDS FOR EQUIPMENT (UPDATED FOR INTEGRATION) ---
                    <>
                        <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 mb-2">
                             <label className="block text-xs font-bold text-purple-700 mb-1 uppercase">Sincronización de Activo</label>
                             <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    className="flex-1 border border-purple-200 rounded p-1.5 text-sm outline-none" 
                                    placeholder="Código ID Activo Fijo" 
                                    value={editingResource.externalId || ''} 
                                    onChange={e => setEditingResource({...editingResource, externalId: e.target.value})} 
                                />
                             </div>
                         </div>

                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Ubicación (Zona)</label><select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.assignedZone} onChange={e => setEditingResource({...editingResource, assignedZone: e.target.value})}><option value="">Seleccionar Zona</option>{unit.zones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Próximo Mantenimiento (Agenda)</label><input type="date" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.nextMaintenance || ''} onChange={e => setEditingResource({...editingResource, nextMaintenance: e.target.value})} /></div>
                        
                        {/* Equipment Photo Editing */}
                        <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Foto Equipo</label>
                        <div className="flex gap-2">
                            <input type="text" className="flex-1 border border-slate-300 rounded-lg p-2 outline-none text-sm" placeholder="URL..." value={editingResource.image || ''} onChange={e => setEditingResource({...editingResource, image: e.target.value})} />
                            <label className="bg-slate-100 p-2 rounded cursor-pointer hover:bg-slate-200 border border-slate-200">
                                <Camera size={20} className="text-slate-600"/>
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                    setEditingResource({...editingResource, image: URL.createObjectURL(e.target.files[0])});
                                    }
                                }} />
                            </label>
                        </div>
                        {editingResource.image && <img src={editingResource.image} alt="preview" className="mt-2 h-20 w-20 object-cover rounded border border-slate-200" />}
                        </div>

                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Estado</label><select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.status} onChange={e => setEditingResource({...editingResource, status: e.target.value})}><option value="Operativo">Operativo</option><option value="En Reparación">En Reparación</option><option value="Baja">Baja</option></select></div>
                    </>
                    )}
                    
                    <div className="pt-2 flex flex-col gap-2">
                    <button onClick={handleUpdateResource} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"><Save size={16} className="inline mr-2"/> Guardar Cambios</button>
                    <button onClick={handleDeleteResource} className="w-full bg-red-50 text-red-600 py-2.5 rounded-lg font-medium hover:bg-red-100 transition-colors flex items-center justify-center"><Trash2 size={16} className="mr-2"/> Eliminar Recurso</button>
                    </div>
                </div>
             </div>
         </div>
      )}

      {/* Add Resource Modal (Logistics) */}
      {showAddResourceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-blue-600 text-white px-6 py-4 border-b border-blue-700 flex justify-between items-center shrink-0">
                     <div className="flex items-center">
                        <PackagePlus className="mr-2"/>
                        <h3 className="font-bold text-lg">{newResourceType === ResourceType.MATERIAL ? 'Nuevo Material' : 'Nuevo Equipo'}</h3>
                     </div>
                     <button onClick={() => setShowAddResourceModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto">
                     <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Recurso</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" placeholder={newResourceType === ResourceType.MATERIAL ? "Ej. Papel Toalla" : "Ej. Aspiradora"} value={newResourceForm.name} onChange={e => setNewResourceForm({...newResourceForm, name: e.target.value})} /></div>
                     
                     {/* External ID Input for New Resource */}
                     <div><label className="block text-sm font-medium text-slate-700 mb-1">Código SKU / ID Externo</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-purple-50 border-purple-200 focus:border-purple-400" placeholder="Opcional para sincronización" value={newResourceForm.externalId || ''} onChange={e => setNewResourceForm({...newResourceForm, externalId: e.target.value})} /></div>

                     {newResourceType === ResourceType.MATERIAL ? (
                        <div className="grid grid-cols-2 gap-3">
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">Cantidad Inicial</label><input type="number" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newResourceForm.quantity} onChange={e => setNewResourceForm({...newResourceForm, quantity: Number(e.target.value)})} /></div>
                            <div><label className="block text-sm font-medium text-slate-700 mb-1">Unidad de Medida</label><input type="text" placeholder="Cajas, Litros..." className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newResourceForm.unitOfMeasure || ''} onChange={e => setNewResourceForm({...newResourceForm, unitOfMeasure: e.target.value})} /></div>
                        </div>
                    ) : (
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Zona de Ubicación</label><select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newResourceForm.assignedZone || ''} onChange={e => setNewResourceForm({...newResourceForm, assignedZone: e.target.value})}><option value="">Seleccionar Zona</option>{unit.zones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}</select></div>
                    )}

                    <div><label className="block text-sm font-medium text-slate-700 mb-1">URL Foto (Opcional)</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" placeholder="https://..." value={newResourceForm.image || ''} onChange={e => setNewResourceForm({...newResourceForm, image: e.target.value})} /></div>

                    <button onClick={handleAddResource} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2">Agregar a Inventario</button>
                  </div>
              </div>
          </div>
      )}

      {/* Log Edit Modal */}
      {editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
             <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-blue-600 text-white px-6 py-4 border-b border-blue-700 flex justify-between items-center shrink-0">
                    <div className="flex items-center"><FileText className="mr-2"/><h3 className="font-bold text-lg">Editar Registro</h3></div>
                    <button onClick={() => setEditingLog(null)} className="text-white/80 hover:text-white"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                        <textarea className="w-full border border-slate-300 rounded-lg p-2 outline-none h-24" value={editingLog.description} onChange={e => setEditingLog({...editingLog, description: e.target.value})} />
                     </div>
                     
                     {/* Edit Responsible Selection */}
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Responsables / Involucrados</label>
                        <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto p-2 bg-slate-50 space-y-2">
                           <p className="text-xs text-slate-400 uppercase font-bold px-1">Equipo de Gestión</p>
                           {availableStaff.map(s => (
                               <div key={s.id} onClick={() => toggleEditLogResponsible(s.id)} className={`flex items-center p-2 rounded cursor-pointer transition-colors ${editingLog.responsibleIds?.includes(s.id) ? 'bg-blue-100 border-blue-200' : 'hover:bg-slate-100'}`}>
                                   <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${editingLog.responsibleIds?.includes(s.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                                       {editingLog.responsibleIds?.includes(s.id) && <Plus size={12} className="text-white"/>}
                                   </div>
                                   <span className="text-sm text-slate-700">{s.name} <span className="text-xs text-slate-400">({s.role === 'COORDINATOR' ? 'Coord' : 'Sup'})</span></span>
                               </div>
                           ))}
                           
                           <p className="text-xs text-slate-400 uppercase font-bold px-1 mt-2">Personal Operativo</p>
                           {personnel.length > 0 ? personnel.map(p => (
                               <div key={p.id} onClick={() => toggleEditLogResponsible(p.id)} className={`flex items-center p-2 rounded cursor-pointer transition-colors ${editingLog.responsibleIds?.includes(p.id) ? 'bg-blue-100 border-blue-200' : 'hover:bg-slate-100'}`}>
                                   <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${editingLog.responsibleIds?.includes(p.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                                       {editingLog.responsibleIds?.includes(p.id) && <Plus size={12} className="text-white"/>}
                                   </div>
                                   <span className="text-sm text-slate-700">{p.name}</span>
                               </div>
                           )) : <p className="text-xs text-slate-400 italic px-2">No hay personal operativo asignado.</p>}
                        </div>
                     </div>
                     
                     {/* Image Editing */}
                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Agregar Foto (Evidencia)</label>
                        <div className="flex gap-2">
                            <input type="text" className="flex-1 border border-slate-300 rounded-lg p-2 outline-none text-sm" placeholder="URL de la imagen..." value={newLogImageUrl} onChange={e => setNewLogImageUrl(e.target.value)} />
                            <label className="bg-slate-100 p-2 rounded-lg cursor-pointer hover:bg-slate-200 border border-slate-200 flex items-center justify-center">
                                <Camera size={20} className="text-slate-600"/>
                                <input type="file" accept="image/*" className="hidden" onChange={handleFileUploadForLog} />
                            </label>
                            <button onClick={handleAddImageToLog} disabled={!newLogImageUrl} className="bg-slate-100 p-2 rounded hover:bg-slate-200 disabled:opacity-50"><Plus size={20} /></button>
                        </div>
                        {editingLog.images && editingLog.images.length > 0 && (
                            <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                            {editingLog.images.map((img, i) => (
                                <div key={i} className="w-16 h-16 shrink-0 relative group">
                                    <img src={img} className="w-full h-full object-cover rounded border border-slate-200" alt="ev" />
                                    <button onClick={() => setEditingLog({...editingLog, images: editingLog.images?.filter((_, idx) => idx !== i)})} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                                </div>
                            ))}
                            </div>
                        )}
                     </div>

                     <button onClick={handleUpdateLog} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2"><Save size={16} className="inline mr-2"/> Actualizar Evento</button>
                </div>
             </div>
        </div>
      )}

      {/* Mass Training Modal */}
      {showMassTrainingModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-blue-600 text-white px-6 py-4 border-b border-blue-700 flex justify-between items-center shrink-0">
                     <div className="flex items-center"><Users className="mr-2"/><h3 className="font-bold text-lg">Asignar Capacitación</h3></div>
                     <button onClick={() => setShowMassTrainingModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto">
                     <div className="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm mb-4">Asignando a <strong>{selectedPersonnelIds.length}</strong> colaboradores seleccionados.</div>
                     <div><label className="block text-sm font-medium text-slate-700 mb-1">Tema / Curso</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej. Seguridad en Altura" value={massTrainingForm.topic} onChange={e => setMassTrainingForm({...massTrainingForm, topic: e.target.value})} /></div>
                     <div><label className="block text-sm font-medium text-slate-700 mb-1">Fecha Programada</label><input type="date" className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" value={massTrainingForm.date} onChange={e => setMassTrainingForm({...massTrainingForm, date: e.target.value})} /></div>
                     <button onClick={handleMassAssignTraining} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2">Confirmar Asignación</button>
                  </div>
              </div>
          </div>
      )}

      {/* Mass Asset Assignment Modal */}
      {showAssetAssignmentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-indigo-600 text-white px-6 py-4 border-b border-indigo-700 flex justify-between items-center shrink-0">
                     <div className="flex items-center"><Briefcase className="mr-2"/><h3 className="font-bold text-lg">Asignar Equipamiento / EPP</h3></div>
                     <button onClick={() => setShowAssetAssignmentModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto">
                     <div className="bg-indigo-50 text-indigo-700 p-3 rounded-lg text-sm mb-4">Entregando a <strong>{selectedPersonnelIds.length}</strong> colaboradores seleccionados.</div>
                     
                     <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Recurso</label>
                     <select className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" value={assetAssignmentForm.type} onChange={e => setAssetAssignmentForm({...assetAssignmentForm, type: e.target.value})}>
                        <option value="EPP">EPP (Protección Personal)</option>
                        <option value="Uniforme">Uniforme / Ropa</option>
                        <option value="Tecnologia">Tecnología (Laptop/Celular)</option>
                        <option value="Herramienta">Herramienta</option>
                        <option value="Otro">Otro</option>
                     </select>
                     </div>

                     <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Ítem</label>
                        <input type="text" className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder={assetAssignmentForm.type === 'Tecnologia' ? "Ej. Celular Samsung A54" : assetAssignmentForm.type === 'Uniforme' ? "Ej. Pantalón Drill Talla 32" : "Ej. Casco Dielectrico"} value={assetAssignmentForm.name} onChange={e => setAssetAssignmentForm({...assetAssignmentForm, name: e.target.value})} />
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Fecha Entrega</label><input type="date" className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" value={assetAssignmentForm.dateAssigned} onChange={e => setAssetAssignmentForm({...assetAssignmentForm, dateAssigned: e.target.value})} /></div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Serie / Talla (Opcional)</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="SN-12345 o Talla M" value={assetAssignmentForm.serialNumber} onChange={e => setAssetAssignmentForm({...assetAssignmentForm, serialNumber: e.target.value})} /></div>
                     </div>

                     <button onClick={handleMassAssignAsset} disabled={!assetAssignmentForm.name || !assetAssignmentForm.dateAssigned} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors mt-2 disabled:opacity-50">Confirmar Entrega</button>
                  </div>
               </div>
          </div>
      )}
      
      {/* Add Worker Modal */}
      {showAddWorkerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
               <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-blue-600 text-white px-6 py-4 border-b border-blue-700 flex justify-between items-center shrink-0">
                     <div className="flex items-center"><UserPlus className="mr-2"/><h3 className="font-bold text-lg">Agregar Colaborador</h3></div>
                     <button onClick={() => setShowAddWorkerModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto">
                     <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ej. Juan Perez" value={newWorkerForm.name} onChange={e => setNewWorkerForm({...newWorkerForm, name: e.target.value})} /></div>
                     <div><label className="block text-sm font-medium text-slate-700 mb-1">Zona Asignada</label><select className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" value={newWorkerForm.zone} onChange={e => setNewWorkerForm({...newWorkerForm, zone: e.target.value})}><option value="">Seleccionar Zona</option>{unit.zones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}</select></div>
                     <div><label className="block text-sm font-medium text-slate-700 mb-1">Turno</label><select className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" value={newWorkerForm.shift} onChange={e => setNewWorkerForm({...newWorkerForm, shift: e.target.value})}><option value="">Seleccionar Turno</option><option value="Diurno">Diurno</option><option value="Nocturno">Nocturno</option><option value="Rotativo">Rotativo</option></select></div>
                     <button onClick={handleAddWorker} disabled={!newWorkerForm.name || !newWorkerForm.zone} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2 disabled:opacity-50">Registrar Personal</button>
                  </div>
               </div>
          </div>
      )}

      {/* New Event Modal */}
      {showEventModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                 <div className="bg-blue-600 text-white px-6 py-4 border-b border-blue-700 flex justify-between items-center shrink-0">
                    <div className="flex items-center"><Calendar className="mr-2"/><h3 className="font-bold text-lg">Nuevo Evento</h3></div>
                    <button onClick={() => setShowEventModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
                 </div>
                 <div className="p-6 space-y-4 overflow-y-auto">
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Evento</label><select className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" value={newEventForm.type} onChange={e => setNewEventForm({...newEventForm, type: e.target.value})}><option value="Coordinacion">Coordinación</option><option value="Supervision">Supervisión</option><option value="Visita Cliente">Visita Cliente</option><option value="Capacitacion">Capacitación</option></select></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Fecha</label><input type="date" className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none" value={newEventForm.date} onChange={e => setNewEventForm({...newEventForm, date: e.target.value})} /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label><textarea className="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none h-24" placeholder="Detalles del evento..." value={newEventForm.description} onChange={e => setNewEventForm({...newEventForm, description: e.target.value})} /></div>
                    
                    {/* Responsible Selection */}
                    <div>
                       <label className="block text-sm font-medium text-slate-700 mb-2">Responsables / Involucrados</label>
                       <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto p-2 bg-slate-50 space-y-2">
                          <p className="text-xs text-slate-400 uppercase font-bold px-1">Equipo de Gestión</p>
                          {availableStaff.map(s => (
                              <div key={s.id} onClick={() => toggleEventResponsible(s.id)} className={`flex items-center p-2 rounded cursor-pointer transition-colors ${newEventResponsibles.includes(s.id) ? 'bg-blue-100 border-blue-200' : 'hover:bg-slate-100'}`}>
                                  <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${newEventResponsibles.includes(s.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                                      {newEventResponsibles.includes(s.id) && <Plus size={12} className="text-white"/>}
                                  </div>
                                  <span className="text-sm text-slate-700">{s.name} <span className="text-xs text-slate-400">({s.role === 'COORDINATOR' ? 'Coord' : 'Sup'})</span></span>
                              </div>
                          ))}
                          
                          <p className="text-xs text-slate-400 uppercase font-bold px-1 mt-2">Personal Operativo</p>
                          {personnel.length > 0 ? personnel.map(p => (
                              <div key={p.id} onClick={() => toggleEventResponsible(p.id)} className={`flex items-center p-2 rounded cursor-pointer transition-colors ${newEventResponsibles.includes(p.id) ? 'bg-blue-100 border-blue-200' : 'hover:bg-slate-100'}`}>
                                  <div className={`w-4 h-4 border rounded mr-2 flex items-center justify-center ${newEventResponsibles.includes(p.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white'}`}>
                                      {newEventResponsibles.includes(p.id) && <Plus size={12} className="text-white"/>}
                                  </div>
                                  <span className="text-sm text-slate-700">{p.name}</span>
                              </div>
                          )) : <p className="text-xs text-slate-400 italic px-2">No hay personal operativo asignado.</p>}
                       </div>
                    </div>

                    <div>
                       <label className="block text-sm font-medium text-slate-700 mb-1">Evidencias (Fotos)</label>
                       <div className="flex gap-2">
                         <input type="text" className="flex-1 border border-slate-300 rounded-lg p-2 outline-none text-sm" placeholder="URL de la imagen..." value={newEventImageUrl} onChange={e => setNewEventImageUrl(e.target.value)} />
                         <label className="bg-slate-100 p-2 rounded-lg cursor-pointer hover:bg-slate-200 border border-slate-200 flex items-center justify-center">
                            <Camera size={20} className="text-slate-600"/>
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileUploadForNewEvent} />
                         </label>
                         <button onClick={handleAddImageToNewEvent} disabled={!newEventImageUrl} className="bg-slate-100 p-2 rounded hover:bg-slate-200 disabled:opacity-50"><Plus size={20} /></button>
                       </div>
                       {newEventImages.length > 0 && (
                         <div className="flex gap-2 mt-2 overflow-x-auto pb-2">
                           {newEventImages.map((img, i) => (
                             <div key={i} className="w-16 h-16 shrink-0 relative group">
                                <img src={img} className="w-full h-full object-cover rounded border border-slate-200" alt="ev" />
                                <button onClick={() => setNewEventImages(newEventImages.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                             </div>
                           ))}
                         </div>
                       )}
                    </div>

                    <button onClick={handleCreateEvent} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2">Agendar Evento</button>
                 </div>
              </div>
          </div>
      )}

    </div>
  );
};
