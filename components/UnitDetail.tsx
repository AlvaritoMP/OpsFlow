import React, { useState, useEffect } from 'react';
import { Unit, ResourceType, StaffStatus, Resource, UnitStatus, Training, OperationalLog, UserRole, AssignedAsset, UnitContact, ManagementStaff, ManagementRole } from '../types';
import { ArrowLeft, UserCheck, Box, ClipboardList, MapPin, Calendar, ShieldCheck, HardHat, Sparkles, BrainCircuit, Truck, Edit2, X, ChevronDown, ChevronUp, Award, Camera, Clock, PlusSquare, CheckSquare, Square, Plus, Trash2, Image as ImageIcon, Save, Users, PackagePlus, FileText, UserPlus, AlertCircle, Shirt, Smartphone, Laptop, Briefcase, Phone, Mail, BadgeCheck } from 'lucide-react';
import { generateExecutiveReport } from '../services/geminiService';

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
  
  // Add Logistics Resource State
  const [showAddResourceModal, setShowAddResourceModal] = useState(false);
  const [newResourceType, setNewResourceType] = useState<ResourceType>(ResourceType.EQUIPMENT);
  const [newResourceForm, setNewResourceForm] = useState<Partial<Resource>>({ name: '', quantity: 1, status: 'Operativo' });

  // Log/Event State
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEventForm, setNewEventForm] = useState({ type: 'Coordinacion', date: '', description: '' });
  const [newEventImages, setNewEventImages] = useState<string[]>([]);
  const [newEventImageUrl, setNewEventImageUrl] = useState('');
  
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

  const togglePersonnelExpand = (id: string) => {
    setExpandedPersonnel(expandedPersonnel === id ? null : id);
  };

  // --- Logistics Actions ---
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
      image: newResourceForm.image
    };
    onUpdate({ ...unit, resources: [...unit.resources, newResource] });
    setShowAddResourceModal(false);
    setNewResourceForm({ name: '', quantity: 1, status: 'Operativo' });
  };

  const openAddResourceModal = (type: ResourceType) => {
    setNewResourceType(type);
    setNewResourceForm({ name: '', quantity: 1, status: type === ResourceType.MATERIAL ? 'Stock OK' : 'Operativo' });
    setShowAddResourceModal(true);
  }

  // --- Event/Log Actions ---
  const handleCreateEvent = () => {
    if (!onUpdate) return;
    const newLog: OperationalLog = {
      id: `l-${Date.now()}`,
      date: newEventForm.date,
      type: newEventForm.type as any,
      description: newEventForm.description,
      author: userRole === 'OPERATIONS' ? 'Operaciones' : 'Admin',
      images: newEventImages 
    };
    onUpdate({ ...unit, logs: [...unit.logs, newLog] });
    setShowEventModal(false);
    setNewEventForm({ type: 'Coordinacion', date: '', description: '' });
    setNewEventImages([]);
  };

  const handleAddImageToNewEvent = () => {
    if (!newEventImageUrl) return;
    setNewEventImages([...newEventImages, newEventImageUrl]);
    setNewEventImageUrl('');
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

  // --- Render Sections ---

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

                {/* Resident Supervisor Card */}
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
                    {unit.residentSupervisor?.email && (
                        <div className="flex items-center text-sm text-slate-600">
                            <Mail size={14} className="mr-2 text-slate-400"/> {unit.residentSupervisor.email}
                        </div>
                    )}
                </div>

                {/* Roving Supervisor Card */}
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
                    {unit.rovingSupervisor?.email && (
                        <div className="flex items-center text-sm text-slate-600">
                            <Mail size={14} className="mr-2 text-slate-400"/> {unit.rovingSupervisor.email}
                        </div>
                    )}
                </div>

            </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-1 space-y-6">
            {/* Unit Details Card */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-slate-800 flex items-center"><MapPin className="w-5 h-5 mr-2 text-slate-500" /> Detalles Técnicos</h3>
                {canEdit && !isEditing && (
                <button onClick={() => setIsEditing(true)} className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center bg-blue-50 px-2 py-1 rounded-md transition-colors"><Edit2 size={12} className="mr-1" /> Editar Info</button>
                )}
            </div>
            
            {isEditing ? (
                <div className="space-y-4">
                <div><label className="text-xs text-slate-500 font-medium block mb-1">Nombre Unidad</label><input type="text" value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500" /></div>
                <div><label className="text-xs text-slate-500 font-medium block mb-1">Cliente</label><input type="text" value={editForm.clientName} onChange={(e) => setEditForm({...editForm, clientName: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500" /></div>
                <div><label className="text-xs text-slate-500 font-medium block mb-1">Dirección</label><input type="text" value={editForm.address} onChange={(e) => setEditForm({...editForm, address: e.target.value})} className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500" /></div>
                <div>
                    <label className="text-xs text-slate-500 font-medium block mb-1">Estado</label>
                    <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value as UnitStatus})} className="w-full p-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500">
                        <option value={UnitStatus.ACTIVE}>Activo</option>
                        <option value={UnitStatus.PENDING}>Pendiente</option>
                        <option value={UnitStatus.ISSUE}>Con Incidencias</option>
                    </select>
                </div>

                {/* Supervisor Assignment Section in Edit Mode (USING SELECTORS) */}
                <div className="border-t border-slate-100 pt-3">
                    <label className="text-xs text-slate-500 font-medium block mb-3">Asignación de Supervisión</label>
                    
                    {/* Coordinator Selector */}
                    <div className="bg-slate-50 p-2 rounded mb-2">
                         <div className="flex items-center gap-2 mb-1">
                             <BadgeCheck size={14} className="text-blue-600"/>
                             <span className="text-xs font-bold text-slate-700">Coordinador</span>
                         </div>
                         <select 
                            className="w-full p-1.5 border border-slate-300 rounded text-xs outline-none bg-white"
                            value={editForm.coordinator?.id || ''}
                            onChange={(e) => handleSelectStaff('coordinator', e.target.value)}
                         >
                            <option value="">-- Seleccionar --</option>
                            {availableStaff.filter(s => s.role === 'COORDINATOR').map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                         </select>
                         {editForm.coordinator?.photo && <img src={editForm.coordinator.photo} alt="prev" className="w-8 h-8 rounded-full object-cover mt-2" />}
                    </div>

                    {/* Resident Supervisor Selector */}
                    <div className="bg-slate-50 p-2 rounded mb-2">
                         <div className="flex items-center gap-2 mb-1">
                             <ShieldCheck size={14} className="text-indigo-600"/>
                             <span className="text-xs font-bold text-slate-700">Supervisor Residente</span>
                         </div>
                         <select 
                            className="w-full p-1.5 border border-slate-300 rounded text-xs outline-none bg-white"
                            value={editForm.residentSupervisor?.id || ''}
                            onChange={(e) => handleSelectStaff('residentSupervisor', e.target.value)}
                         >
                            <option value="">-- Seleccionar --</option>
                            {availableStaff.filter(s => s.role === 'RESIDENT_SUPERVISOR').map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                         </select>
                         {editForm.residentSupervisor?.photo && <img src={editForm.residentSupervisor.photo} alt="prev" className="w-8 h-8 rounded-full object-cover mt-2" />}
                    </div>

                     {/* Roving Supervisor Selector */}
                     <div className="bg-slate-50 p-2 rounded mb-2">
                         <div className="flex items-center gap-2 mb-1">
                             <UserCheck size={14} className="text-slate-600"/>
                             <span className="text-xs font-bold text-slate-700">Supervisor de Ronda</span>
                         </div>
                         <select 
                            className="w-full p-1.5 border border-slate-300 rounded text-xs outline-none bg-white"
                            value={editForm.rovingSupervisor?.id || ''}
                            onChange={(e) => handleSelectStaff('rovingSupervisor', e.target.value)}
                         >
                            <option value="">-- Seleccionar --</option>
                            {availableStaff.filter(s => s.role === 'ROVING_SUPERVISOR').map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                         </select>
                         {editForm.rovingSupervisor?.photo && <img src={editForm.rovingSupervisor.photo} alt="prev" className="w-8 h-8 rounded-full object-cover mt-2" />}
                    </div>
                    
                    <div className="text-xs text-slate-400 italic mt-1 text-center">
                        * Gestiónalos en Configuración
                    </div>
                </div>

                {/* Image Management Section */}
                <div className="border-t border-slate-100 pt-3">
                    <label className="text-xs text-slate-500 font-medium block mb-2">Gestión de Imágenes (Galería)</label>
                    
                    <div className="flex gap-2 mb-2">
                        <input 
                        type="text" 
                        className="flex-1 border border-slate-300 rounded p-2 outline-none text-xs" 
                        placeholder="URL de imagen..." 
                        value={editImageUrl} 
                        onChange={e => setEditImageUrl(e.target.value)} 
                        />
                        <label className="bg-slate-100 p-2 rounded cursor-pointer hover:bg-slate-200 border border-slate-200 flex items-center justify-center">
                            <Camera size={14} className="text-slate-600"/>
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileUploadForEdit} />
                        </label>
                        <button onClick={handleAddImageToEdit} disabled={!editImageUrl} className="bg-blue-50 text-blue-600 p-2 rounded hover:bg-blue-100 disabled:opacity-50 border border-blue-100"><Plus size={14} /></button>
                    </div>

                    {editForm.images.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                        {editForm.images.map((img, idx) => (
                        <div key={idx} className="relative shrink-0 w-16 h-16 group">
                            <img src={img} alt="preview" className="w-full h-full object-cover rounded border border-slate-200" />
                            <button onClick={() => handleRemoveImageFromEdit(idx)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10">
                                <X size={10} />
                            </button>
                        </div>
                        ))}
                    </div>
                    ) : <p className="text-xs text-slate-400 italic">Sin imágenes.</p>}
                </div>
                
                {/* Zone Management in Edit Mode */}
                <div className="border-t border-slate-100 pt-3">
                    <label className="text-xs text-slate-500 font-medium block mb-2">Configuración de Zonas</label>
                    <div className="space-y-2 mb-3">
                    {editForm.zones.map(z => (
                        <div key={z.id} className="flex justify-between items-center bg-slate-50 p-2 rounded text-sm">
                        <span>{z.name} <span className="text-xs text-slate-400">({z.shifts.join(', ')})</span></span>
                        <button onClick={() => handleDeleteZone(z.id)} className="text-red-500 hover:text-red-700"><Trash2 size={14}/></button>
                        </div>
                    ))}
                    </div>
                    <div className="flex gap-2">
                    <input 
                        placeholder="Nueva Zona" 
                        value={newZoneName} 
                        onChange={e => setNewZoneName(e.target.value)}
                        className="flex-1 p-2 border border-slate-300 rounded text-xs outline-none" 
                    />
                    <input 
                        placeholder="Turnos (sep. comas)" 
                        value={newZoneShifts} 
                        onChange={e => setNewZoneShifts(e.target.value)}
                        className="w-1/3 p-2 border border-slate-300 rounded text-xs outline-none" 
                    />
                    <button onClick={handleAddZone} className="bg-slate-200 text-slate-600 p-2 rounded hover:bg-slate-300"><Plus size={14}/></button>
                    </div>
                </div>

                <div className="flex space-x-2 pt-2">
                    <button onClick={handleSaveUnit} className="flex-1 bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700">Guardar</button>
                    <button onClick={() => { setIsEditing(false); setEditForm(unit); }} className="flex-1 bg-slate-100 text-slate-700 py-2 rounded text-sm font-medium hover:bg-slate-200">Cancelar</button>
                </div>
                </div>
            ) : (
                <div className="space-y-4 text-sm">
                <div><p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Cliente</p><p className="font-medium text-slate-800">{unit.clientName}</p></div>
                <div><p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Dirección</p><p className="font-medium text-slate-800">{unit.address}</p></div>
                <div><p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Descripción</p><p className="text-slate-600 leading-relaxed">{unit.description || "Sin descripción."}</p></div>
                <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Zonas Activas</p>
                    <div className="flex flex-wrap gap-2">
                    {unit.zones.map(z => (<span key={z.id} className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs border border-slate-200 font-medium">{z.name}</span>))}
                    </div>
                </div>
                </div>
            )}
            </div>
        </div>

        <div className="col-span-1 lg:col-span-2 space-y-6">
          <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-xl border border-indigo-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-indigo-900 flex items-center"><BrainCircuit className="w-5 h-5 mr-2 text-indigo-600" /> Reporte Ejecutivo IA</h3>
              {!aiReport && !isLoadingAi && (
                <button onClick={handleGenerateReport} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><Sparkles className="w-4 h-4 mr-2" /> Generar Reporte</button>
              )}
            </div>
            {isLoadingAi && <div className="flex flex-col items-center py-8 text-slate-500"><div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-2"></div><p className="text-sm">Analizando datos...</p></div>}
            {aiReport && <div className="prose prose-sm prose-indigo max-w-none bg-white p-4 rounded-lg border border-indigo-100 max-h-60 overflow-y-auto custom-scrollbar"><div dangerouslySetInnerHTML={{ __html: aiReport.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} /></div>}
            {!aiReport && !isLoadingAi && <p className="text-slate-500 text-sm">Genera un resumen ejecutivo instantáneo para el cliente analizando cumplimiento, personal y novedades.</p>}
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-lg font-semibold text-slate-800 flex items-center"><Calendar className="w-5 h-5 mr-2 text-slate-500" /> Agenda Operativa</h3>
               {canEdit && <button onClick={() => setShowEventModal(true)} className="text-blue-600 text-sm font-medium hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-blue-100 flex items-center"><PlusSquare size={16} className="mr-1.5" /> Agendar Evento</button>}
             </div>
             {upcomingEvents.length > 0 ? (
               <div className="space-y-3">
                 {upcomingEvents.map((event, idx) => (
                   <div key={idx} className="flex items-start p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className={`p-2 rounded-lg mr-3 shrink-0 ${event.type === 'maintenance' ? 'bg-orange-100 text-orange-600' : event.type === 'training' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                        {event.type === 'maintenance' ? <Truck size={18} /> : event.type === 'training' ? <HardHat size={18} /> : <Clock size={18} />}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">{event.title}</h4>
                        <p className="text-sm text-slate-600">{event.desc}</p>
                        <p className="text-xs text-slate-500 mt-1 font-medium">{event.date}</p>
                      </div>
                   </div>
                 ))}
               </div>
             ) : <p className="text-slate-500 text-sm italic py-4 text-center">No hay eventos programados.</p>}
          </div>
        </div>
      </div>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200"><p className="text-xs text-slate-500 uppercase tracking-wider">Personal</p><p className="text-2xl font-bold text-slate-800 mt-1">{personnel.length}</p></div>
        <div className="bg-white p-4 rounded-lg border border-slate-200"><p className="text-xs text-slate-500 uppercase tracking-wider">Equipos</p><p className="text-2xl font-bold text-slate-800 mt-1">{equipment.length}</p></div>
        <div className="bg-white p-4 rounded-lg border border-slate-200"><p className="text-xs text-slate-500 uppercase tracking-wider">Incidencias</p><p className="text-2xl font-bold text-slate-800 mt-1">{unit.logs.filter(l => l.type === 'Incidencia').length}</p></div>
        <div className="bg-white p-4 rounded-lg border border-slate-200"><p className="text-xs text-slate-500 uppercase tracking-wider">Cumplimiento</p><p className="text-2xl font-bold text-emerald-600 mt-1">{unit.complianceHistory[unit.complianceHistory.length-1].score}%</p></div>
      </div>
    </div>
  );

  const renderPersonnel = () => (
    <div className="space-y-6 animate-in fade-in duration-300 pb-10">
      <div className="flex justify-between items-center">
         <div>
          <h3 className="text-lg font-semibold text-slate-800">Dotación, Capacitaciones y Equipamiento</h3>
          {canEdit && selectedPersonnelIds.length > 0 && <p className="text-xs text-blue-600 mt-1">{selectedPersonnelIds.length} seleccionados</p>}
         </div>
         <div className="flex space-x-3">
            {canEdit && selectedPersonnelIds.length > 0 && (
              <>
                 <button onClick={() => setShowMassTrainingModal(true)} className="bg-blue-600 text-white text-sm px-3 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center"><Award size={16} className="mr-2" /> Asignar Capacitación</button>
                 <button onClick={() => setShowAssetAssignmentModal(true)} className="bg-indigo-600 text-white text-sm px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm flex items-center"><Briefcase size={16} className="mr-2" /> Asignar Activo/EPP</button>
              </>
            )}
            {canEdit && <button onClick={() => setShowAddWorkerModal(true)} className="text-blue-600 text-sm font-medium hover:underline flex items-center bg-blue-50 px-3 py-2 rounded-lg"><Plus size={16} className="mr-1" /> Agregar Colaborador</button>}
         </div>
      </div>
      
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {canEdit && <th className="px-6 py-3 text-left w-10"><button onClick={selectAllPersonnel} className="text-slate-400 hover:text-slate-600">{selectedPersonnelIds.length > 0 && selectedPersonnelIds.length === personnel.length ? <CheckSquare size={18} /> : <Square size={18} />}</button></th>}
              <th className="px-6 py-3 text-left w-10"></th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Zona / Turno</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Cumplimiento</th>
              {canEdit && <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {personnel.map((p) => (
              <React.Fragment key={p.id}>
                <tr className={`hover:bg-slate-50 transition-colors ${selectedPersonnelIds.includes(p.id) ? 'bg-blue-50/50' : ''}`}>
                  {canEdit && <td className="px-6 py-4"><button onClick={() => togglePersonnelSelection(p.id)} className="text-slate-400 hover:text-blue-600">{selectedPersonnelIds.includes(p.id) ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}</button></td>}
                  <td className="px-6 py-4 text-slate-400 cursor-pointer" onClick={() => togglePersonnelExpand(p.id)}>{expandedPersonnel === p.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                  <td className="px-6 py-4 whitespace-nowrap cursor-pointer" onClick={() => togglePersonnelExpand(p.id)}>
                    <div className="flex items-center"><div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 overflow-hidden"><UserCheck size={16} /></div><div className="ml-4"><div className="text-sm font-medium text-slate-900">{p.name}</div><div className="text-xs text-slate-500">ID: {p.id}</div></div></div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-slate-900">{p.assignedZone}</div><div className="text-xs text-slate-500">{p.assignedShift}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_COLORS[p.status as keyof typeof STATUS_COLORS] || 'bg-gray-100 text-gray-800'}`}>{p.status}</span></td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500"><div className="flex items-center"><div className="w-16 bg-slate-200 rounded-full h-1.5 mr-2"><div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${p.compliancePercentage}%` }}></div></div><span>{p.compliancePercentage}%</span></div></td>
                  {canEdit && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => setEditingResource(p)} className="text-blue-600 hover:text-blue-900 bg-blue-50 p-1.5 rounded-full"><Edit2 size={16} /></button>
                    </td>
                  )}
                </tr>
                {expandedPersonnel === p.id && (
                  <tr className="bg-slate-50 animate-in fade-in duration-200">
                    <td colSpan={canEdit ? 7 : 6} className="px-6 py-4">
                      <div className="flex flex-col md:flex-row gap-6 ml-12">
                          {/* Trainings Section */}
                          <div className={`flex-1 border-l-2 border-slate-200 pl-4`}>
                            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center"><Award className="w-4 h-4 mr-2 text-blue-500" /> Historial de Capacitaciones</h4>
                            {p.trainings && p.trainings.length > 0 ? (
                              <div className="space-y-2">
                                {p.trainings.map(t => (
                                  <div key={t.id} className="bg-white p-3 rounded border border-slate-200 shadow-sm flex justify-between items-center">
                                    <div><p className="text-sm font-medium text-slate-800">{t.topic}</p><p className="text-xs text-slate-500">{t.date}</p></div>
                                    <div className="text-right"><span className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'Completado' ? 'bg-green-100 text-green-700' : t.status === 'Programado' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100'}`}>{t.status}</span>{t.score && <p className="text-xs font-bold text-slate-600 mt-1">Nota: {t.score}</p>}</div>
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-sm text-slate-500 italic">No hay capacitaciones registradas.</p>}
                          </div>
                          
                          {/* Assets / PPE Section */}
                          <div className={`flex-1 border-l-2 border-slate-200 pl-4`}>
                             <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center"><Briefcase className="w-4 h-4 mr-2 text-indigo-500" /> Inventario Asignado (Activos / EPPs)</h4>
                             {p.assignedAssets && p.assignedAssets.length > 0 ? (
                                <div className="space-y-2">
                                   {p.assignedAssets.map(asset => (
                                      <div key={asset.id} className="bg-white p-3 rounded border border-slate-200 shadow-sm flex items-start gap-3">
                                         <div className="mt-1">{getAssetIcon(asset.type)}</div>
                                         <div className="flex-1">
                                            <p className="text-sm font-medium text-slate-800">{asset.name}</p>
                                            <p className="text-xs text-slate-500">Entrega: {asset.dateAssigned}</p>
                                            {asset.serialNumber && <p className="text-xs text-slate-400 mt-0.5 font-mono">SN: {asset.serialNumber}</p>}
                                         </div>
                                         <div className="text-xs font-semibold bg-slate-100 px-2 py-0.5 rounded text-slate-600">{asset.type}</div>
                                      </div>
                                   ))}
                                </div>
                             ) : <p className="text-sm text-slate-500 italic">Sin equipamiento asignado.</p>}
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
       <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center"><Truck className="w-5 h-5 mr-2"/> Logística e Infraestructura</h3>
          {canEdit && (
            <div className="flex space-x-2">
               <button onClick={() => openAddResourceModal(ResourceType.EQUIPMENT)} className="bg-white border border-slate-200 text-slate-700 text-sm px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors shadow-sm flex items-center font-medium"><Plus size={16} className="mr-2" /> Equipo</button>
               <button onClick={() => openAddResourceModal(ResourceType.MATERIAL)} className="bg-white border border-slate-200 text-slate-700 text-sm px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors shadow-sm flex items-center font-medium"><Plus size={16} className="mr-2" /> Material</button>
            </div>
          )}
       </div>

       {/* Equipment Section */}
       <div>
         <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Maquinaria y Equipos</h4>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {equipment.map(eq => (
             <div key={eq.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 relative group">
               {canEdit && (
                 <button onClick={() => setEditingResource(eq)} className="absolute top-2 right-2 p-1.5 bg-white text-blue-600 rounded-full shadow-sm hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity border border-slate-200">
                   <Edit2 size={14} />
                 </button>
               )}
               {eq.image && (
                  <div className="w-full md:w-32 h-32 shrink-0 rounded-lg overflow-hidden bg-slate-100">
                    <img src={eq.image} alt={eq.name} className="w-full h-full object-cover" />
                  </div>
               )}
               <div className="flex-1 flex flex-col justify-between">
                 <div>
                   <div className="flex justify-between items-start pr-6">
                     <h4 className="font-medium text-slate-900">{eq.name}</h4>
                     <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_COLORS[eq.status as keyof typeof STATUS_COLORS] || 'bg-gray-100'}`}>{eq.status}</span>
                   </div>
                   <p className="text-sm text-slate-500 mt-1">Ubicación: {eq.assignedZone}</p>
                 </div>
                 <div className="mt-2 flex justify-between items-center text-xs text-slate-500">
                   <span>Mantenimiento: {eq.nextMaintenance}</span>
                   <button onClick={() => setEditingResource(eq)} className="text-indigo-600 hover:text-indigo-800 font-medium">Ver Ficha / Editar</button>
                 </div>
               </div>
             </div>
           ))}
           {equipment.length === 0 && <p className="text-slate-400 italic">No hay maquinaria asignada.</p>}
         </div>
       </div>

       {/* Materials Section */}
       <div>
         <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Abastecimiento Mensual (Insumos)</h4>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {materials.map(m => (
             <div key={m.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 relative group">
                 {canEdit && (
                   <button onClick={() => setEditingResource(m)} className="absolute top-2 right-2 p-1.5 bg-white text-blue-600 rounded-full shadow-sm hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity border border-slate-200">
                     <Edit2 size={14} />
                   </button>
                 )}
                 {m.image ? (
                    <div className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-slate-100">
                      <img src={m.image} alt={m.name} className="w-full h-full object-cover" />
                    </div>
                 ) : (
                   <div className="w-16 h-16 shrink-0 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400"><Box size={24} /></div>
                 )}
                 <div className="flex-1">
                   <h4 className="font-medium text-slate-900 text-sm">{m.name}</h4>
                   <p className="text-sm text-slate-500 font-medium">{m.quantity} {m.unitOfMeasure}</p>
                   <div className="flex items-center mt-1">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${STATUS_COLORS[m.status as keyof typeof STATUS_COLORS] || 'bg-gray-100'}`}>{m.status}</span>
                      <span className="text-xs text-slate-400 ml-2">Repo: {m.lastRestock}</span>
                   </div>
                 </div>
             </div>
           ))}
           {materials.length === 0 && <p className="text-slate-400 italic">No hay materiales registrados.</p>}
         </div>
       </div>
    </div>
  );

  const renderManagement = () => (
    <div className="space-y-6 animate-in fade-in duration-300 pb-10">
      <div className="flex justify-between items-center">
         <h3 className="text-lg font-semibold text-slate-800">Bitácora de Gestión y Supervisión</h3>
         {canEdit && <button onClick={() => setShowEventModal(true)} className="bg-slate-800 text-white text-sm px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors shadow-sm">+ Nuevo Registro</button>}
      </div>

      <div className="relative border-l-2 border-slate-200 ml-3 space-y-8 pb-8">
        {unit.logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((log) => (
          <div key={log.id} className="mb-8 ml-6">
            <div className={`absolute -left-[9px] mt-1.5 w-4 h-4 rounded-full border-2 border-white shadow-sm ${log.type === 'Incidencia' ? 'bg-red-500' : log.type === 'Supervision' ? 'bg-blue-500' : log.type === 'Capacitacion' ? 'bg-purple-500' : 'bg-slate-400'}`}></div>
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow relative group">
              {canEdit && (
                 <button onClick={() => setEditingLog(log)} className="absolute top-2 right-2 text-slate-400 hover:text-blue-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                   <Edit2 size={16} />
                 </button>
              )}
              <div className="flex justify-between items-start mb-1 pr-6">
                <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${log.type === 'Incidencia' ? 'bg-red-50 text-red-600' : log.type === 'Supervision' ? 'bg-blue-50 text-blue-600' : log.type === 'Capacitacion' ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-600'}`}>{log.type}</span>
                <span className="text-xs text-slate-400">{log.date}</span>
              </div>
              <h4 className="text-sm font-medium text-slate-900 mb-1">{log.author}</h4>
              <p className="text-sm text-slate-600 mb-4">{log.description}</p>
              
              {/* Evidence Images */}
              {log.images && log.images.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                   {log.images.map((img, idx) => (
                     <div key={idx} className="aspect-square rounded-lg overflow-hidden border border-slate-100 relative group cursor-pointer">
                        <img src={img} alt="Evidence" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
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

      {/* Resource Edit Modal (Generic for Personnel, Material, Equipment) */}
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
                  // --- FIELDS FOR MATERIAL ---
                  <>
                    <div className="grid grid-cols-2 gap-3">
                       <div><label className="block text-sm font-medium text-slate-700 mb-1">Cantidad</label><input type="number" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.quantity} onChange={e => setEditingResource({...editingResource, quantity: Number(e.target.value)})} /></div>
                       <div><label className="block text-sm font-medium text-slate-700 mb-1">Unidad</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-slate-100" readOnly value={editingResource.unitOfMeasure} /></div>
                    </div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Última Reposición</label><input type="date" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.lastRestock || ''} onChange={e => setEditingResource({...editingResource, lastRestock: e.target.value})} /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Estado Stock</label><select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.status} onChange={e => setEditingResource({...editingResource, status: e.target.value})}><option value="Stock OK">Stock OK</option><option value="Stock Bajo">Stock Bajo</option><option value="Agotado">Agotado</option></select></div>
                  </>
                ) : (
                  // --- FIELDS FOR EQUIPMENT ---
                  <>
                     <div><label className="block text-sm font-medium text-slate-700 mb-1">Ubicación (Zona)</label><select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.assignedZone} onChange={e => setEditingResource({...editingResource, assignedZone: e.target.value})}><option value="">Seleccionar Zona</option>{unit.zones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}</select></div>
                     <div><label className="block text-sm font-medium text-slate-700 mb-1">Próximo Mantenimiento</label><input type="date" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={editingResource.nextMaintenance || ''} onChange={e => setEditingResource({...editingResource, nextMaintenance: e.target.value})} /></div>
                     
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
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Agregar Foto (Evidencia)</label>
                   <div className="flex gap-2">
                     <input type="text" className="flex-1 border border-slate-300 rounded-lg p-2 outline-none text-sm" placeholder="URL de la imagen..." value={newLogImageUrl} onChange={e => setNewLogImageUrl(e.target.value)} />
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
                
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Evidencias (Fotos)</label>
                   <div className="flex gap-2">
                     <input type="text" className="flex-1 border border-slate-300 rounded-lg p-2 outline-none text-sm" placeholder="URL de la imagen..." value={newEventImageUrl} onChange={e => setNewEventImageUrl(e.target.value)} />
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