
import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Building, Settings, Menu, X, Plus, MapPin, Users, ChevronDown, Trash2, UserPlus, Camera, Image as ImageIcon, Briefcase, LayoutList, Package, Globe, Server, Key, Save, CheckCircle2, ToggleRight, ToggleLeft, Sparkles, Palette, Shield, Lock } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { UnitDetail } from './components/UnitDetail';
import { ControlCenter } from './components/ControlCenter';
import { MOCK_UNITS, MOCK_USERS, MOCK_MANAGEMENT_STAFF } from './constants';
import { Unit, UnitStatus, User, UserRole, ManagementStaff, ManagementRole, ResourceType, InventoryApiConfig, PermissionConfig, AppFeature } from './types';
import { getApiConfig, saveApiConfig } from './services/inventoryService';
import { getGeminiApiKey, saveGeminiApiKey } from './services/geminiService';
import { getPermissions, savePermissions, FEATURE_LABELS, checkPermission } from './services/permissionService';

const App: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentView, setCurrentView] = useState<'dashboard' | 'units' | 'settings' | 'control-center'>('dashboard');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>(MOCK_UNITS);
  
  // New Unit State
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [newUnitForm, setNewUnitForm] = useState<Partial<Unit>>({
    name: '',
    clientName: '',
    address: '',
    status: UnitStatus.ACTIVE
  });
  // New Unit Images State
  const [newUnitImages, setNewUnitImages] = useState<string[]>([]);
  const [newUnitImageUrl, setNewUnitImageUrl] = useState('');

  // User Management State
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', role: 'OPERATIONS' as UserRole });
  
  // Management Staff State (Supervisors/Coordinators)
  const [managementStaff, setManagementStaff] = useState<ManagementStaff[]>(MOCK_MANAGEMENT_STAFF);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaffForm, setNewStaffForm] = useState<Partial<ManagementStaff>>({ name: '', role: 'COORDINATOR', email: '' });
  const [newStaffPhotoUrl, setNewStaffPhotoUrl] = useState('');

  // API Config State
  const [apiConfig, setApiConfig] = useState<InventoryApiConfig>(getApiConfig());
  const [isInventoryConfigSaved, setIsInventoryConfigSaved] = useState(false);

  // Gemini API Config State
  const [geminiKey, setGeminiKey] = useState<string>(getGeminiApiKey() || '');
  const [isGeminiSaved, setIsGeminiSaved] = useState(false);

  // Branding State
  const [companyLogo, setCompanyLogo] = useState<string>(localStorage.getItem('OPSFLOW_LOGO') || 'https://via.placeholder.com/150x50?text=LOGO');
  const [isLogoSaved, setIsLogoSaved] = useState(false);

  // Permissions State
  const [permissions, setPermissions] = useState<PermissionConfig>(getPermissions());
  const [isPermsSaved, setIsPermsSaved] = useState(false);

  // User / Role Context Simulation
  const [currentUser, setCurrentUser] = useState<User>(MOCK_USERS[0]); // Default to Admin
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Check screen size for responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSelectUnit = (id: string) => {
    setSelectedUnitId(id);
    setCurrentView('units');
    // On mobile, close sidebar when navigating
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const handleUpdateUnit = (updatedUnit: Unit) => {
    setUnits(prevUnits => prevUnits.map(u => u.id === updatedUnit.id ? updatedUnit : u));
  };

  const handleAddImageToNewUnit = () => {
    if (!newUnitImageUrl) return;
    setNewUnitImages([...newUnitImages, newUnitImageUrl]);
    setNewUnitImageUrl('');
  };

  const handleFileUploadForNewUnit = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const imageUrl = URL.createObjectURL(file);
      setNewUnitImages([...newUnitImages, imageUrl]);
    }
  };

  const handleRemoveImageFromNewUnit = (index: number) => {
    setNewUnitImages(newUnitImages.filter((_, i) => i !== index));
  };

  const handleAddUnit = () => {
    if (!newUnitForm.name || !newUnitForm.clientName) return;

    const newUnit: Unit = {
      id: `u-${Date.now()}`,
      name: newUnitForm.name!,
      clientName: newUnitForm.clientName!,
      address: newUnitForm.address || '',
      status: newUnitForm.status as UnitStatus || UnitStatus.ACTIVE,
      description: 'Nueva unidad registrada. Configure zonas y recursos.',
      images: newUnitImages, 
      zones: [],
      resources: [],
      logs: [],
      complianceHistory: [{ month: 'Actual', score: 100 }] // Default start
    };

    setUnits([...units, newUnit]);
    setShowAddUnitModal(false);
    setNewUnitForm({ name: '', clientName: '', address: '', status: UnitStatus.ACTIVE });
    setNewUnitImages([]);
    setNewUnitImageUrl('');
  };

  const handleAddUser = () => {
    if (!newUserForm.name || !newUserForm.email) return;
    const newUser: User = {
      id: `u${Date.now()}`,
      name: newUserForm.name,
      email: newUserForm.email,
      role: newUserForm.role,
      avatar: newUserForm.name.substring(0,2).toUpperCase()
    };
    setUsers([...users, newUser]);
    setShowAddUserModal(false);
    setNewUserForm({ name: '', email: '', role: 'OPERATIONS' });
  };

  const handleDeleteUser = (userId: string) => {
    if (confirm('¿Eliminar usuario?')) {
      setUsers(users.filter(u => u.id !== userId));
    }
  };

  const handleChangeUserRole = (userId: string, newRole: UserRole) => {
    setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
  };

  // Management Staff Handlers
  const handleAddStaff = () => {
      if (!newStaffForm.name || !newStaffForm.role) return;
      const newStaff: ManagementStaff = {
          id: `ms-${Date.now()}`,
          name: newStaffForm.name,
          role: newStaffForm.role,
          email: newStaffForm.email,
          photo: newStaffPhotoUrl || 'https://via.placeholder.com/150'
      };
      setManagementStaff([...managementStaff, newStaff]);
      setShowAddStaffModal(false);
      setNewStaffForm({ name: '', role: 'COORDINATOR', email: '' });
      setNewStaffPhotoUrl('');
  };

  const handleDeleteStaff = (staffId: string) => {
      if (confirm('¿Eliminar este miembro del equipo de gestión?')) {
          setManagementStaff(managementStaff.filter(s => s.id !== staffId));
      }
  };

  // API Config Handlers
  const handleSaveApiConfig = () => {
    saveApiConfig(apiConfig);
    setIsInventoryConfigSaved(true);
    setTimeout(() => setIsInventoryConfigSaved(false), 3000);
  };

  const handleSaveGeminiKey = () => {
    saveGeminiApiKey(geminiKey);
    setIsGeminiSaved(true);
    setTimeout(() => setIsGeminiSaved(false), 3000);
  };

  const handleSaveLogo = () => {
      localStorage.setItem('OPSFLOW_LOGO', companyLogo);
      setIsLogoSaved(true);
      setTimeout(() => setIsLogoSaved(false), 3000);
  };

  // Permission Handlers
  const handlePermissionChange = (role: UserRole, feature: AppFeature, type: 'view' | 'edit', value: boolean) => {
    setPermissions(prev => ({
        ...prev,
        [role]: {
            ...prev[role],
            [feature]: {
                ...prev[role][feature],
                [type]: value
            }
        }
    }));
  };

  const handleSavePermissions = () => {
      savePermissions(permissions);
      setIsPermsSaved(true);
      setTimeout(() => setIsPermsSaved(false), 3000);
  };


  const renderContent = () => {
    if (currentView === 'control-center') {
      return <ControlCenter units={units} managementStaff={managementStaff} onUpdateUnit={handleUpdateUnit} currentUserRole={currentUser.role} />;
    }

    if (currentView === 'dashboard') {
      return <Dashboard units={units} onSelectUnit={handleSelectUnit} />;
    }

    if (currentView === 'units') {
      if (selectedUnitId) {
        const unit = units.find(u => u.id === selectedUnitId);
        if (!unit) return <div className="p-8">Unidad no encontrada</div>;
        return (
          <UnitDetail 
            unit={unit} 
            userRole={currentUser.role}
            availableStaff={managementStaff} // Pass global staff registry
            onBack={() => setSelectedUnitId(null)} 
            onUpdate={handleUpdateUnit} 
          />
        );
      }

      return (
        <div className="p-6 md:p-8 space-y-6 animate-in fade-in duration-500">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-slate-800">Gestión de Unidades</h1>
            {checkPermission(currentUser.role, 'UNIT_OVERVIEW', 'edit') && (
              <button 
                onClick={() => setShowAddUnitModal(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus size={20} className="mr-2" /> Nueva Unidad
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {units.map(unit => {
              const staffCount = unit.resources.filter(r => r.type === ResourceType.PERSONNEL).length;
              const logisticsCount = unit.resources.filter(r => r.type !== ResourceType.PERSONNEL).length;

              return (
                <div 
                  key={unit.id} 
                  onClick={() => handleSelectUnit(unit.id)}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-lg transition-all cursor-pointer group overflow-hidden"
                >
                  <div className="h-40 w-full overflow-hidden relative bg-slate-200">
                    {unit.images && unit.images.length > 0 ? (
                      <img 
                        src={unit.images[0]} 
                        alt={unit.name} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <Building size={48} />
                      </div>
                    )}
                    <div className="absolute top-3 right-3">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full shadow-sm ${unit.status === 'Activo' ? 'bg-white/90 text-green-700 backdrop-blur-sm' : 'bg-white/90 text-red-700 backdrop-blur-sm'}`}>
                        {unit.status}
                      </span>
                    </div>
                  </div>

                  <div className="p-5">
                    <h3 className="font-bold text-lg text-slate-800 mb-1">{unit.name}</h3>
                    <p className="text-sm text-slate-500 mb-3">{unit.clientName}</p>
                    
                    <div className="flex items-center text-slate-500 text-sm mb-4">
                      <MapPin size={16} className="mr-1.5 flex-shrink-0" />
                      <span className="truncate">{unit.address}</span>
                    </div>

                    <div className="border-t border-slate-100 pt-3 flex justify-between text-xs font-medium text-slate-600">
                      <div className="flex items-center" title="Personal">
                        <Users size={14} className="mr-1.5 text-blue-600" />
                        {staffCount} Personal
                      </div>
                      <div className="flex items-center" title="Equipos y Materiales">
                        <Package size={14} className="mr-1.5 text-orange-600" />
                        {logisticsCount} Logística
                      </div>
                      <div className="flex items-center">
                        <Building size={14} className="mr-1.5 text-slate-400" />
                        {unit.zones.length} Zonas
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Unit Modal */}
          {showAddUnitModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center shrink-0">
                    <div className="flex items-center font-bold text-lg"><Building className="mr-2" size={20}/> Nueva Unidad</div>
                    <button onClick={() => setShowAddUnitModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Unidad</label>
                      <input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ej. Edificio Central" value={newUnitForm.name} onChange={e => setNewUnitForm({...newUnitForm, name: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
                      <input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ej. Banco Global" value={newUnitForm.clientName} onChange={e => setNewUnitForm({...newUnitForm, clientName: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
                      <input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" value={newUnitForm.address} onChange={e => setNewUnitForm({...newUnitForm, address: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Estado Inicial</label>
                      <select className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500" value={newUnitForm.status} onChange={e => setNewUnitForm({...newUnitForm, status: e.target.value as UnitStatus})}>
                        <option value={UnitStatus.ACTIVE}>Activo</option>
                        <option value={UnitStatus.PENDING}>Pendiente</option>
                        <option value={UnitStatus.ISSUE}>Con Incidencias</option>
                      </select>
                    </div>

                    {/* Image Upload Section */}
                    <div>
                       <label className="block text-sm font-medium text-slate-700 mb-1">Fotos de la Unidad</label>
                       <div className="flex gap-2 mb-2">
                         <input 
                           type="text" 
                           className="flex-1 border border-slate-300 rounded-lg p-2 outline-none text-sm focus:ring-2 focus:ring-blue-500" 
                           placeholder="URL de imagen..." 
                           value={newUnitImageUrl} 
                           onChange={e => setNewUnitImageUrl(e.target.value)} 
                         />
                         <label className="bg-slate-100 p-2 rounded-lg cursor-pointer hover:bg-slate-200 border border-slate-200 flex items-center justify-center">
                            <Camera size={20} className="text-slate-600"/>
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileUploadForNewUnit} />
                         </label>
                         <button onClick={handleAddImageToNewUnit} disabled={!newUnitImageUrl} className="bg-blue-50 text-blue-600 p-2 rounded-lg hover:bg-blue-100 disabled:opacity-50 border border-blue-100"><Plus size={20} /></button>
                       </div>
                       
                       {/* Preview */}
                       {newUnitImages.length > 0 ? (
                         <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                           {newUnitImages.map((img, idx) => (
                             <div key={idx} className="relative shrink-0 w-20 h-20 group">
                                <img src={img} alt="preview" className="w-full h-full object-cover rounded-lg border border-slate-200" />
                                <button onClick={() => handleRemoveImageFromNewUnit(idx)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                                  <X size={12} />
                                </button>
                             </div>
                           ))}
                         </div>
                       ) : (
                         <div className="w-full py-4 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center text-slate-400">
                           <ImageIcon size={24} className="mb-1 opacity-50"/>
                           <span className="text-xs">Sin fotos seleccionadas</span>
                         </div>
                       )}
                    </div>

                    <button 
                      onClick={handleAddUnit} 
                      disabled={!newUnitForm.name || !newUnitForm.clientName}
                      className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                      Crear Unidad
                    </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (currentView === 'settings') {
      return (
        <div className="p-6 md:p-8 space-y-8 animate-in fade-in duration-500 pb-20">
           <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Configuración del Sistema</h1>
              <p className="text-slate-500">Administración general de la plataforma</p>
            </div>
           </div>

           {/* --- PERMISSIONS MANAGEMENT (NEW) --- */}
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center"><Shield className="mr-2" size={18} /> Control de Accesos y Permisos</h3>
                    {isPermsSaved && <span className="text-green-600 text-xs font-bold flex items-center"><CheckCircle2 size={14} className="mr-1"/> Guardado</span>}
                </div>
                <div className="p-6">
                    <p className="text-sm text-slate-600 mb-6">Defina qué pueden ver y editar los diferentes roles en la plataforma.</p>
                    
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead>
                                <tr>
                                    <th className="px-4 py-3 bg-slate-50 text-left text-xs font-bold text-slate-500 uppercase tracking-wider sticky left-0 z-10">Módulo / Función</th>
                                    {['ADMIN', 'OPERATIONS', 'CLIENT'].map(role => (
                                        <th key={role} className="px-4 py-3 bg-slate-50 text-center text-xs font-bold text-slate-500 uppercase tracking-wider border-l border-slate-200">
                                            {role === 'ADMIN' ? 'Admin' : role === 'OPERATIONS' ? 'Operaciones' : 'Cliente'}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {(Object.keys(FEATURE_LABELS) as AppFeature[]).map(feature => (
                                    <tr key={feature} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-sm font-medium text-slate-700 sticky left-0 bg-white">{FEATURE_LABELS[feature]}</td>
                                        {['ADMIN', 'OPERATIONS', 'CLIENT'].map(roleStr => {
                                            const role = roleStr as UserRole;
                                            const perm = permissions[role][feature];
                                            return (
                                                <td key={role} className="px-4 py-3 text-center border-l border-slate-200">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <label className="flex items-center space-x-2 cursor-pointer text-xs">
                                                            <input 
                                                                type="checkbox" 
                                                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                                checked={perm.view}
                                                                onChange={(e) => handlePermissionChange(role, feature, 'view', e.target.checked)}
                                                            />
                                                            <span className={perm.view ? 'text-slate-700' : 'text-slate-400'}>Ver</span>
                                                        </label>
                                                        <label className="flex items-center space-x-2 cursor-pointer text-xs">
                                                            <input 
                                                                type="checkbox" 
                                                                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                                                                checked={perm.edit}
                                                                onChange={(e) => handlePermissionChange(role, feature, 'edit', e.target.checked)}
                                                                disabled={!perm.view} // Cannot edit if cannot view
                                                            />
                                                            <span className={perm.edit ? 'text-slate-700' : 'text-slate-400'}>Editar</span>
                                                        </label>
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-6 flex justify-end">
                        <button onClick={handleSavePermissions} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-900 transition-colors flex items-center">
                            <Save size={16} className="mr-2"/> Guardar Configuración de Permisos
                        </button>
                    </div>
                </div>
           </div>

            {/* --- Branding Configuration --- */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center"><Palette className="mr-2" size={18} /> Personalización de Marca</h3>
                    {isLogoSaved && <span className="text-green-600 text-xs font-bold flex items-center"><CheckCircle2 size={14} className="mr-1"/> Guardado</span>}
                </div>
                <div className="p-6">
                    <p className="text-sm text-slate-600 mb-4">Actualice el logotipo que aparece en el menú lateral y en los reportes.</p>
                    <div className="flex flex-col md:flex-row gap-6 items-start">
                        <div className="w-full md:w-1/2 space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">URL del Logo</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                        value={companyLogo}
                                        onChange={e => setCompanyLogo(e.target.value)}
                                        placeholder="https://..."
                                    />
                                    <label className="bg-slate-100 px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-200 border border-slate-200 flex items-center">
                                        <Camera size={18} className="text-slate-600"/>
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                            if (e.target.files && e.target.files[0]) {
                                                setCompanyLogo(URL.createObjectURL(e.target.files[0]));
                                            }
                                        }} />
                                    </label>
                                </div>
                            </div>
                            <button onClick={handleSaveLogo} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center text-sm">
                                <Save size={16} className="mr-2"/> Guardar Cambio
                            </button>
                        </div>
                        <div className="w-full md:w-1/2 flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Vista Previa</span>
                            {companyLogo ? (
                                <img src={companyLogo} alt="Logo Preview" className="h-16 object-contain" />
                            ) : (
                                <ImageIcon size={32} className="text-slate-300"/>
                            )}
                        </div>
                    </div>
                </div>
            </div>

           {/* --- Users Management --- */}
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <h3 className="font-bold text-slate-700 flex items-center"><Users className="mr-2" size={18} /> Usuarios Registrados</h3>
               <button onClick={() => setShowAddUserModal(true)} className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-50 transition-colors flex items-center">
                  <UserPlus size={14} className="mr-1.5" /> Nuevo Usuario
               </button>
             </div>
             <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-white">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Usuario</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Rol</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                   {users.map(u => (
                     <tr key={u.id} className="hover:bg-slate-50">
                        <td className="px-6 py-4 whitespace-nowrap flex items-center">
                          <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 mr-3">{u.avatar}</div>
                          <span className="text-sm font-medium text-slate-900">{u.name}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{u.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <select 
                            value={u.role}
                            onChange={(e) => handleChangeUserRole(u.id, e.target.value as UserRole)}
                            className="bg-white border border-slate-200 text-slate-700 text-xs rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                          >
                             <option value="ADMIN">Administrador</option>
                             <option value="OPERATIONS">Operaciones</option>
                             <option value="CLIENT">Cliente</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                           <button onClick={() => handleDeleteUser(u.id)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50"><Trash2 size={16}/></button>
                        </td>
                     </tr>
                   ))}
                </tbody>
             </table>
           </div>

           {/* --- Management Staff Registry --- */}
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <h3 className="font-bold text-slate-700 flex items-center"><Briefcase className="mr-2" size={18} /> Gestión de Equipo de Supervisión (Global)</h3>
               <button onClick={() => setShowAddStaffModal(true)} className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-50 transition-colors flex items-center">
                  <Plus size={14} className="mr-1.5" /> Agregar Personal
               </button>
             </div>
             <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {managementStaff.map(staff => (
                     <div key={staff.id} className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg hover:shadow-md transition-shadow relative group">
                         <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 flex-shrink-0">
                             {staff.photo ? <img src={staff.photo} alt={staff.name} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center font-bold text-slate-400">?</div>}
                         </div>
                         <div className="flex-1 min-w-0">
                             <h4 className="font-medium text-slate-900 truncate">{staff.name}</h4>
                             <p className="text-xs text-slate-500 mb-1">{staff.role.replace('_', ' ')}</p>
                             <p className="text-xs text-slate-400 truncate">{staff.email}</p>
                         </div>
                         <button onClick={() => handleDeleteStaff(staff.id)} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                             <Trash2 size={14} />
                         </button>
                     </div>
                 ))}
             </div>
           </div>

           <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* --- Google Gemini API Configuration --- */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center"><Sparkles className="mr-2 text-purple-500" size={18} /> Google Gemini API (IA)</h3>
                    {isGeminiSaved && <span className="text-green-600 text-xs font-bold flex items-center"><CheckCircle2 size={14} className="mr-1"/> Guardado</span>}
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-sm text-slate-600">Configura tu clave API para habilitar la generación de reportes ejecutivos inteligentes.</p>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center"><Key size={14} className="mr-1"/> API Key</label>
                      <input 
                        type="password" 
                        className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-purple-500"
                        value={geminiKey}
                        onChange={e => setGeminiKey(e.target.value)}
                        placeholder="Pegar API Key de Google AI Studio..."
                      />
                    </div>
                    <div className="flex justify-between items-center mt-4">
                       <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-purple-600 hover:text-purple-800 underline">Obtener API Key</a>
                       <button onClick={handleSaveGeminiKey} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center">
                          <Save size={16} className="mr-2"/> Guardar API Key
                       </button>
                    </div>
                </div>
              </div>

              {/* --- API Configuration Section (Inventory) --- */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center"><Globe className="mr-2" size={18} /> API Inventario (Integración)</h3>
                    {isInventoryConfigSaved && <span className="text-green-600 text-xs font-bold flex items-center"><CheckCircle2 size={14} className="mr-1"/> Guardado</span>}
                </div>
                <div className="p-6">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <div>
                                <p className="text-sm font-bold text-slate-800">Modo Simulación</p>
                                <p className="text-xs text-slate-500">Usar datos de prueba.</p>
                            </div>
                            <button onClick={() => setApiConfig({...apiConfig, useMock: !apiConfig.useMock})} className={`transition-colors ${apiConfig.useMock ? 'text-blue-600' : 'text-slate-400'}`}>
                                {apiConfig.useMock ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                            </button>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center"><Server size={14} className="mr-1"/> Base URL</label>
                            <input 
                              type="text" 
                              className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                              value={apiConfig.baseUrl}
                              onChange={e => setApiConfig({...apiConfig, baseUrl: e.target.value})}
                              disabled={apiConfig.useMock}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center"><Key size={14} className="mr-1"/> Token</label>
                            <input 
                              type="password" 
                              className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                              value={apiConfig.apiKey}
                              onChange={e => setApiConfig({...apiConfig, apiKey: e.target.value})}
                              disabled={apiConfig.useMock}
                            />
                        </div>

                        <div className="mt-4 text-right">
                            <button onClick={handleSaveApiConfig} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center ml-auto">
                                <Save size={16} className="mr-2"/> Guardar Configuración
                            </button>
                        </div>
                    </div>
                </div>
              </div>
           </div>


           {/* Add User Modal */}
           {showAddUserModal && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center"><UserPlus className="mr-2" size={20}/> Nuevo Usuario</h3>
                      <button onClick={() => setShowAddUserModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newUserForm.name} onChange={e => setNewUserForm({...newUserForm, name: e.target.value})} /></div>
                      <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newUserForm.email} onChange={e => setNewUserForm({...newUserForm, email: e.target.value})} /></div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                        <select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newUserForm.role} onChange={e => setNewUserForm({...newUserForm, role: e.target.value as UserRole})}>
                          <option value="OPERATIONS">Operaciones</option>
                          <option value="CLIENT">Cliente</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </div>
                      <button onClick={handleAddUser} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2">Crear Usuario</button>
                  </div>
                </div>
             </div>
           )}

           {/* Add Staff Modal */}
           {showAddStaffModal && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-indigo-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center"><Briefcase className="mr-2" size={20}/> Nuevo Supervisor/Coord.</h3>
                      <button onClick={() => setShowAddStaffModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newStaffForm.name} onChange={e => setNewStaffForm({...newStaffForm, name: e.target.value})} /></div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Rol de Gestión</label>
                        <select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newStaffForm.role} onChange={e => setNewStaffForm({...newStaffForm, role: e.target.value as ManagementRole})}>
                          <option value="COORDINATOR">Coordinador</option>
                          <option value="RESIDENT_SUPERVISOR">Supervisor Residente</option>
                          <option value="ROVING_SUPERVISOR">Supervisor de Ronda</option>
                        </select>
                      </div>

                      <div><label className="block text-sm font-medium text-slate-700 mb-1">Email / Contacto</label><input type="email" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={newStaffForm.email} onChange={e => setNewStaffForm({...newStaffForm, email: e.target.value})} /></div>
                      
                      {/* Staff Photo */}
                      <div>
                       <label className="block text-sm font-medium text-slate-700 mb-1">Foto (URL o Upload)</label>
                       <div className="flex gap-2">
                         <input 
                           type="text" 
                           className="flex-1 border border-slate-300 rounded-lg p-2 outline-none text-sm" 
                           placeholder="URL de imagen..." 
                           value={newStaffPhotoUrl} 
                           onChange={e => setNewStaffPhotoUrl(e.target.value)} 
                         />
                         <label className="bg-slate-100 p-2 rounded-lg cursor-pointer hover:bg-slate-200 border border-slate-200 flex items-center justify-center">
                            <Camera size={20} className="text-slate-600"/>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                    setNewStaffPhotoUrl(URL.createObjectURL(e.target.files[0]));
                                }
                            }} />
                         </label>
                       </div>
                       {newStaffPhotoUrl && <img src={newStaffPhotoUrl} alt="prev" className="w-16 h-16 object-cover rounded mt-2 border border-slate-200" />}
                      </div>

                      <button onClick={handleAddStaff} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors mt-2">Agregar a Registro</button>
                  </div>
                </div>
             </div>
           )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={`${sidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full'} fixed inset-y-0 left-0 z-50 bg-slate-900 text-white transition-all duration-300 ease-in-out md:relative md:translate-x-0 flex flex-col shadow-xl`}
      >
        <div className="p-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2 font-bold text-xl tracking-tight">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span>OpsFlow</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {checkPermission(currentUser.role, 'DASHBOARD', 'view') && (
              <button 
                onClick={() => { setCurrentView('dashboard'); setSelectedUnitId(null); }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <LayoutDashboard size={20} />
                <span>Dashboard</span>
              </button>
          )}
          
          {checkPermission(currentUser.role, 'CONTROL_CENTER', 'view') && (
             <button 
                onClick={() => { setCurrentView('control-center'); setSelectedUnitId(null); }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'control-center' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <LayoutList size={20} />
                <span>Centro de Control</span>
             </button>
          )}

          {checkPermission(currentUser.role, 'UNIT_OVERVIEW', 'view') && (
              <button 
                onClick={() => { setCurrentView('units'); setSelectedUnitId(null); }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'units' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <Building size={20} />
                <span>Unidades</span>
              </button>
          )}
          
          {checkPermission(currentUser.role, 'SETTINGS', 'view') && (
            <>
              <div className="pt-4 pb-2 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Sistema
              </div>
              <button 
                onClick={() => setCurrentView('settings')}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'settings' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <Settings size={20} />
                <span>Configuración</span>
              </button>
            </>
          )}
        </nav>

        {/* User Switcher for Demo */}
        <div className="p-4 border-t border-slate-800 relative">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-full flex items-center space-x-3 hover:bg-slate-800 p-2 rounded-lg transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-sm font-bold">
              {currentUser.avatar}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium">{currentUser.name}</p>
              <p className="text-xs text-slate-400 truncate w-32">{currentUser.role}</p>
            </div>
            <ChevronDown size={16} className={`text-slate-500 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
          </button>

          {/* User Role Selector (Demo Feature) */}
          {showUserMenu && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
               <div className="p-2 text-xs font-semibold text-slate-500 uppercase">Cambiar Vista (Demo)</div>
               {MOCK_USERS.map(user => (
                 <button
                   key={user.id}
                   onClick={() => { setCurrentUser(user); setShowUserMenu(false); }}
                   className={`w-full text-left px-4 py-3 text-sm flex items-center hover:bg-slate-700 ${currentUser.id === user.id ? 'text-blue-400 bg-slate-700/50' : 'text-slate-300'}`}
                 >
                    <span className="w-2 h-2 rounded-full bg-current mr-2"></span>
                    {user.name} ({user.role})
                 </button>
               ))}
            </div>
          )}
        </div>

        {/* Powered By Logo Section - DYNAMIC */}
        <div className="px-6 pb-6 pt-0 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Powered By</span>
            <img src={companyLogo} alt="Company Logo" className="h-10 w-auto object-contain" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50">
        {/* Top Bar (Mobile only mostly) */}
        <header className="bg-white h-16 border-b border-slate-200 flex items-center justify-between px-6 md:hidden shrink-0 z-30 relative">
          <button onClick={() => setSidebarOpen(true)} className="text-slate-600">
            <Menu size={24} />
          </button>
          <span className="font-bold text-slate-800">OpsFlow</span>
          <div className="w-6"></div> {/* Spacer */}
        </header>

        {/* Scrollable Content Area - FIXED LAYOUT for Control Center */}
        <div className={`flex-1 relative ${currentView === 'control-center' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
           {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
