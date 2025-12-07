

import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Building, Settings, Menu, X, Plus, MapPin, Users, ChevronDown, Trash2, UserPlus, Camera, Image as ImageIcon, Briefcase, LayoutList, Package, Globe, Server, Key, Save, CheckCircle2, ToggleRight, ToggleLeft, Sparkles, Palette, Shield, Lock, FileBarChart, Bell, MessageCircle, Edit2, Archive, Activity } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { UnitDetail } from './components/UnitDetail';
import { ControlCenter } from './components/ControlCenter';
import { ClientControlCenter } from './components/ClientControlCenter';
import { Reports } from './components/Reports';
import { OperationsDashboard } from './components/OperationsDashboard';
import { MOCK_USERS } from './constants'; // Mantener solo para currentUser demo
import { Unit, UnitStatus, User, UserRole, ManagementStaff, ManagementRole, ResourceType, InventoryApiConfig, PermissionConfig, AppFeature, Client, ClientRepresentative } from './types';
import { getApiConfig, saveApiConfig } from './services/inventoryService';
import { getGeminiApiKey, saveGeminiApiKey } from './services/geminiService';
import { getPermissions, savePermissions, FEATURE_LABELS, checkPermission } from './services/permissionService';
import { useUnits } from './hooks/useUnits';
import { useUsers } from './hooks/useUsers';
import { useManagementStaff } from './hooks/useManagementStaff';
import { useClients } from './hooks/useClients';
import { unitsService } from './services/unitsService';
import { usersService } from './services/usersService';
import { Login } from './components/Login';
import { authService } from './services/authService';
import { LogOut, FileText } from 'lucide-react';
import { AuditLogs } from './components/AuditLogs';

const App: React.FC = () => {
  // Estado de autenticación
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [appError, setAppError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentView, setCurrentView] = useState<'dashboard' | 'units' | 'settings' | 'control-center' | 'client-control-center' | 'reports' | 'audit-logs' | 'operations-dashboard'>('dashboard');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  
  // Usar hooks de Supabase (solo cargar si está autenticado)
  const { units, loading: unitsLoading, error: unitsError, createUnit, updateUnit, deleteUnit, loadUnits } = useUnits(isAuthenticated);
  const { users, loading: usersLoading, createUser, updateUser, deleteUser, loadUsers } = useUsers(isAuthenticated);
  const { staff: managementStaff, loading: staffLoading, createStaff, updateStaff, deleteStaff, archiveStaff, loadStaff } = useManagementStaff(isAuthenticated);
  const { clients, loading: clientsLoading, createClient, updateClient, deleteClient, loadClients } = useClients(isAuthenticated);
  
  // Client Management State (solo para admin)
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState<{
    name: string;
    ruc: string;
    representatives: ClientRepresentative[];
  }>({
    name: '',
    ruc: '',
    representatives: [{ name: '', phone: '', email: '' }]
  });

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
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<{name: string, email: string, password: string, role: UserRole, linkedClientNames: string[]}>({ name: '', email: '', password: '', role: 'OPERATIONS', linkedClientNames: [] });
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState<{userId: string, newPassword: string, confirmPassword: string}>({ userId: '', newPassword: '', confirmPassword: '' });
  const [userOperationLoading, setUserOperationLoading] = useState<{type: 'create' | 'update' | 'delete' | 'password' | null, userId?: string}>({ type: null });
  
  // Management Staff State (Supervisors/Coordinators)
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<ManagementStaff | null>(null);
  const [newStaffForm, setNewStaffForm] = useState<Partial<ManagementStaff>>({ 
    name: '', 
    role: 'COORDINATOR', 
    email: '',
    status: 'activo',
    archived: false
  });
  const [newStaffPhotoUrl, setNewStaffPhotoUrl] = useState('');

  // API Config State
  const [apiConfig, setApiConfig] = useState<InventoryApiConfig>(() => {
    const config = getApiConfig();
    console.log('📦 Cargando configuración de inventario al iniciar:', config);
    return config;
  });
  const [isInventoryConfigSaved, setIsInventoryConfigSaved] = useState(false);

  // Gemini API Config State
  const [geminiKey, setGeminiKey] = useState<string>(() => {
    const key = getGeminiApiKey() || '';
    console.log('📦 Cargando API Key de Gemini al iniciar:', key ? '***' + key.slice(-4) : 'no configurada');
    return key;
  });
  const [isGeminiSaved, setIsGeminiSaved] = useState(false);


  // Branding State
  const [companyLogo, setCompanyLogo] = useState<string>(() => {
    const saved = localStorage.getItem('OPSFLOW_LOGO');
    // Validar que no sea un blob URL (no persisten)
    if (saved && !saved.startsWith('blob:')) {
      return saved;
    }
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjUwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxNTAiIGhlaWdodD0iNTAiIGZpbGw9IiNmM2Y0ZjYiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+TE9HTzwvdGV4dD48L3N2Zz4=';
  });
  const [isLogoSaved, setIsLogoSaved] = useState(false);

  // Recargar logo cuando cambie en localStorage (para persistencia entre navegaciones)
  useEffect(() => {
    // Limpiar blob URLs guardados (no persisten) - solo al iniciar
    const saved = localStorage.getItem('OPSFLOW_LOGO');
    if (saved && saved.startsWith('blob:')) {
      console.warn('⚠️ Se encontró un blob URL guardado, limpiando...');
      localStorage.removeItem('OPSFLOW_LOGO');
      setCompanyLogo('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjUwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxNTAiIGhlaWdodD0iNTAiIGZpbGw9IiNmM2Y0ZjYiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+TE9HTzwvdGV4dD48L3N2Zz4=');
    }
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'OPSFLOW_LOGO' && e.newValue) {
        // Validar que no sea un blob URL
        if (!e.newValue.startsWith('blob:')) {
          setCompanyLogo(e.newValue);
        } else {
          console.warn('⚠️ Intento de guardar blob URL, ignorando...');
        }
      }
    };
    
    // Escuchar cambios en localStorage (de otras pestañas)
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []); // Sin dependencias para evitar loops

  // Permissions State
  const [permissions, setPermissions] = useState<PermissionConfig>(() => {
    const perms = getPermissions();
    console.log('📦 Cargando permisos al iniciar');
    return perms;
  });
  const [isPermsSaved, setIsPermsSaved] = useState(false);

  // User / Role Context
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Verificar autenticación al cargar
  useEffect(() => {
    let mounted = true;
    
    const checkAuth = async () => {
      try {
        const dbUser = await authService.getCurrentUser();
        if (!mounted) return;
        
        if (dbUser) {
          setCurrentUser(dbUser);
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error: any) {
        console.error('Error verificando autenticación:', error);
        if (!mounted) return;
        setAppError(error.message || 'Error al verificar autenticación');
        setIsAuthenticated(false);
      } finally {
        if (mounted) {
          setAuthLoading(false);
        }
      }
    };

    checkAuth();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Actualizar currentUser cuando se carguen los usuarios
  useEffect(() => {
    if (isAuthenticated && currentUser && users.length > 0) {
      const userExists = users.find(u => u.id === currentUser.id);
      if (userExists) {
        setCurrentUser(userExists);
      }
    }
  }, [users, isAuthenticated, currentUser?.id]);

  // Check screen size for responsive sidebar
  useEffect(() => {
    if (!isAuthenticated) return;
    
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
  }, [isAuthenticated]);

  // Manejar login exitoso
  const handleLoginSuccess = async (user: User) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
  };

  // Manejar logout
  const handleLogout = async () => {
    try {
      await authService.signOut();
      setIsAuthenticated(false);
      setCurrentUser(null);
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const handleSelectUnit = (id: string) => {
    setSelectedUnitId(id);
    setCurrentView('units');
    // On mobile, close sidebar when navigating
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  const handleUpdateUnit = async (updatedUnit: Unit) => {
    try {
      await updateUnit(updatedUnit.id, updatedUnit);
      await loadUnits(); // Recargar para obtener datos actualizados
    } catch (error) {
      console.error('Error al actualizar unidad:', error);
      alert('Error al actualizar la unidad. Por favor, intente nuevamente.');
    }
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

  // --- CLIENT MANAGEMENT HANDLERS (solo admin) ---
  const openAddClientModal = () => {
    setEditingClient(null);
    setClientForm({
      name: '',
      ruc: '',
      representatives: [{ name: '', phone: '', email: '' }]
    });
    setShowClientModal(true);
  };

  const openEditClientModal = (client: Client) => {
    setEditingClient(client);
    setClientForm({
      name: client.name,
      ruc: client.ruc,
      representatives: client.representatives.length > 0 
        ? client.representatives 
        : [{ name: '', phone: '', email: '' }]
    });
    setShowClientModal(true);
  };

  const handleAddRepresentative = () => {
    setClientForm({
      ...clientForm,
      representatives: [...clientForm.representatives, { name: '', phone: '', email: '' }]
    });
  };

  const handleRemoveRepresentative = (index: number) => {
    setClientForm({
      ...clientForm,
      representatives: clientForm.representatives.filter((_, i) => i !== index)
    });
  };

  const handleUpdateRepresentative = (index: number, field: keyof ClientRepresentative, value: string) => {
    const updated = [...clientForm.representatives];
    updated[index] = { ...updated[index], [field]: value };
    setClientForm({ ...clientForm, representatives: updated });
  };

  const handleSaveClient = async () => {
    if (!clientForm.name || !clientForm.ruc) {
      alert('El nombre y RUC del cliente son requeridos');
      return;
    }

    // Validar que al menos un representante tenga nombre
    const hasValidRepresentative = clientForm.representatives.some(rep => rep.name.trim() !== '');
    if (!hasValidRepresentative) {
      alert('Debe agregar al menos un representante con nombre');
      return;
    }

    try {
      // Filtrar representantes vacíos
      const validRepresentatives = clientForm.representatives.filter(
        rep => rep.name.trim() !== '' && (rep.phone.trim() !== '' || rep.email.trim() !== '')
      );

      if (editingClient) {
        await updateClient(editingClient.id, {
          name: clientForm.name,
          ruc: clientForm.ruc,
          representatives: validRepresentatives
        });
      } else {
        await createClient({
          name: clientForm.name,
          ruc: clientForm.ruc,
          representatives: validRepresentatives
        });
      }

      // Recargar lista de clientes después de guardar
      await new Promise(resolve => setTimeout(resolve, 300));
      await loadClients();
      
      setShowClientModal(false);
      setClientForm({ name: '', ruc: '', representatives: [{ name: '', phone: '', email: '' }] });
      
      console.log('✅ Cliente guardado y recargado correctamente');
    } catch (error: any) {
      console.error('Error al guardar cliente:', error);
      alert(error.message || 'Error al guardar el cliente. Por favor, intente nuevamente.');
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    if (!confirm('¿Está seguro de eliminar este cliente? Esto no eliminará las unidades asociadas, pero las unidades quedarán sin cliente asignado.')) {
      return;
    }

    try {
      await deleteClient(clientId);
      // Recargar después de eliminar
      await new Promise(resolve => setTimeout(resolve, 300));
      await loadClients();
      console.log('✅ Cliente eliminado y lista recargada');
    } catch (error: any) {
      console.error('Error al eliminar cliente:', error);
      alert(error.message || 'Error al eliminar el cliente.');
    }
  };

  const handleAddUnit = async () => {
    if (!newUnitForm.name || !newUnitForm.clientName) return;

    try {
      const newUnitData: Partial<Unit> = {
        name: newUnitForm.name!,
        clientName: newUnitForm.clientName!,
        address: newUnitForm.address || '',
        status: newUnitForm.status as UnitStatus || UnitStatus.ACTIVE,
        description: 'Nueva unidad registrada. Configure zonas y recursos.',
        images: newUnitImages,
        zones: [],
        resources: [],
        logs: [],
        requests: [],
        complianceHistory: [{ month: 'Actual', score: 100 }] // Default start
      };

      await createUnit(newUnitData);
      setShowAddUnitModal(false);
      setNewUnitForm({ name: '', clientName: '', address: '', status: UnitStatus.ACTIVE });
      setNewUnitImages([]);
      setNewUnitImageUrl('');
    } catch (error) {
      console.error('Error al crear unidad:', error);
      alert('Error al crear la unidad. Por favor, intente nuevamente.');
    }
  };

  // --- USER MANAGEMENT HANDLERS ---
  const openAddUserModal = () => {
      setEditingUser(null);
      setUserForm({ name: '', email: '', password: '', role: 'OPERATIONS', linkedClientNames: [] });
      setShowUserModal(true);
  };

  const openEditUserModal = (user: User) => {
      setEditingUser(user);
      setUserForm({ 
          name: user.name, 
          email: user.email, 
          password: '', 
          role: user.role, 
          linkedClientNames: user.linkedClientNames || [] 
      });
      setShowUserModal(true);
  };

  const openChangePasswordModal = (user: User) => {
      setPasswordForm({ userId: user.id, newPassword: '', confirmPassword: '' });
      setShowChangePasswordModal(true);
  };

  const handleChangePassword = async () => {
      if (!passwordForm.newPassword || passwordForm.newPassword.length < 6) {
          alert('La contraseña debe tener al menos 6 caracteres');
          return;
      }
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
          alert('Las contraseñas no coinciden');
          return;
      }
      
      try {
          setUserOperationLoading({ type: 'password', userId: passwordForm.userId });
          
          // Cambiar contraseña (el servicio verifica permisos internamente)
          await authService.updatePassword(passwordForm.userId, passwordForm.newPassword);
          
          setShowChangePasswordModal(false);
          setPasswordForm({ userId: '', newPassword: '', confirmPassword: '' });
          alert('✅ Contraseña actualizada correctamente');
      } catch (error: any) {
          console.error('Error al cambiar contraseña:', error);
          const errorMessage = error.message || 'Error al cambiar la contraseña. Por favor, intente nuevamente.';
          
          // Si el mensaje contiene información útil, mostrarlo
          if (errorMessage.includes('email de reset') || errorMessage.includes('enviado')) {
              alert(`ℹ️ ${errorMessage}`);
          } else {
              alert(`❌ ${errorMessage}`);
          }
      } finally {
          setUserOperationLoading({ type: null });
      }
  };

  const handleToggleLinkedClient = (clientName: string) => {
      if (userForm.linkedClientNames.includes(clientName)) {
          setUserForm({ ...userForm, linkedClientNames: userForm.linkedClientNames.filter(c => c !== clientName) });
      } else {
          setUserForm({ ...userForm, linkedClientNames: [...userForm.linkedClientNames, clientName] });
      }
  };

  const handleSaveUser = async () => {
    if (!userForm.name || !userForm.email) return;
    
    // Si es nuevo usuario, requiere contraseña
    if (!editingUser && !userForm.password) {
      alert('Debe ingresar una contraseña para el nuevo usuario');
      return;
    }
    
    try {
      setUserOperationLoading({ type: editingUser ? 'update' : 'create', userId: editingUser?.id });
      
      const isRestrictedRole = ['CLIENT', 'OPERATIONS', 'OPERATIONS_SUPERVISOR'].includes(userForm.role);

      if (editingUser) {
        // Update existing user (sin crear cuenta de Auth si ya existe)
        await updateUser(editingUser.id, {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          linkedClientNames: isRestrictedRole ? userForm.linkedClientNames : undefined
        });
      } else {
        // Create new user (sin Supabase Auth)
        const { dbUser } = await authService.signUp(userForm.email, userForm.password, {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          avatar: userForm.name.substring(0,2).toUpperCase(),
          linkedClientNames: isRestrictedRole ? userForm.linkedClientNames : undefined
        });
        
        if (!dbUser) {
          throw new Error('Error al crear el usuario en la base de datos');
        }
      }
      
      // Recargar lista de usuarios después de crear o actualizar
      // Esperar un momento para que la base de datos se actualice
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadUsers();
      
      setShowUserModal(false);
      setUserForm({ name: '', email: '', password: '', role: 'OPERATIONS', linkedClientNames: [] });
    } catch (error: any) {
      console.error('Error al guardar usuario:', error);
      alert(error.message || 'Error al guardar el usuario. Por favor, intente nuevamente.');
    } finally {
      setUserOperationLoading({ type: null });
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (confirm('¿Eliminar usuario?')) {
      try {
        setUserOperationLoading({ type: 'delete', userId });
        await deleteUser(userId);
      } catch (error) {
        console.error('Error al eliminar usuario:', error);
        alert('Error al eliminar el usuario. Por favor, intente nuevamente.');
      } finally {
        setUserOperationLoading({ type: null });
      }
    }
  };

  // Management Staff Handlers
  const handleAddStaff = async () => {
      if (!newStaffForm.name || !newStaffForm.role) return;
      
      try {
        await createStaff({
          name: newStaffForm.name,
          role: newStaffForm.role,
          email: newStaffForm.email,
          photo: newStaffPhotoUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI2U1ZTdlYiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iNDgiIGZpbGw9IiM5Y2EzYjgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj4/PC90ZXh0Pjwvc3ZnPg=='
        });
        setShowAddStaffModal(false);
        setNewStaffForm({ name: '', role: 'COORDINATOR', email: '' });
        setNewStaffPhotoUrl('');
      } catch (error) {
        console.error('Error al agregar personal:', error);
        alert('Error al agregar el personal. Por favor, intente nuevamente.');
      }
  };

  const handleDeleteStaff = async (staffId: string) => {
      if (confirm('¿Eliminar este miembro del equipo de gestión? Esta acción no se puede deshacer.')) {
        try {
          await deleteStaff(staffId);
        } catch (error) {
          console.error('Error al eliminar personal:', error);
          alert('Error al eliminar el personal. Por favor, intente nuevamente.');
        }
      }
  };

  const handleArchiveStaff = async (staffId: string) => {
      if (confirm('¿Archivar este trabajador? El trabajador será removido de la vista normal pero permanecerá en la base de datos para consultas en informes.')) {
        try {
          await archiveStaff(staffId);
        } catch (error) {
          console.error('Error al archivar personal:', error);
          alert('Error al archivar el personal. Por favor, intente nuevamente.');
        }
      }
  };

  const openEditStaffModal = (staff: ManagementStaff) => {
    setEditingStaff(staff);
    setNewStaffForm({
      name: staff.name,
      role: staff.role,
      email: staff.email || '',
      phone: staff.phone || '',
      dni: staff.dni || '',
      startDate: staff.startDate || '',
      endDate: staff.endDate || '',
      status: staff.status || 'activo',
      archived: staff.archived || false
    });
    setNewStaffPhotoUrl(staff.photo || '');
    setShowAddStaffModal(true);
  };

  const handleSaveStaff = async () => {
    if (!newStaffForm.name || !newStaffForm.role) {
      alert('Por favor, complete todos los campos requeridos.');
      return;
    }

    try {
      if (editingStaff) {
        await updateStaff(editingStaff.id, {
          ...newStaffForm,
          photo: newStaffPhotoUrl || editingStaff.photo
        });
      } else {
        await createStaff({
          ...newStaffForm,
          photo: newStaffPhotoUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTUwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iI2U1ZTdlYiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iNDgiIGZpbGw9IiM5Y2EzYjgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj4/PC90ZXh0Pjwvc3ZnPg=='
        });
      }
      
      // Recargar lista de staff después de guardar
      await new Promise(resolve => setTimeout(resolve, 300));
      await loadStaff();
      
      setShowAddStaffModal(false);
      setEditingStaff(null);
      setNewStaffForm({ name: '', role: 'COORDINATOR', email: '', status: 'activo', archived: false });
      setNewStaffPhotoUrl('');
      
      console.log('✅ Personal guardado y recargado correctamente');
    } catch (error: any) {
      console.error('Error al guardar personal:', error);
      alert(error.message || 'Error al guardar el personal. Por favor, intente nuevamente.');
    }
  };

  // API Config Handlers
  const handleSaveApiConfig = () => {
    try {
      // Validar antes de guardar
      if (!apiConfig || typeof apiConfig !== 'object') {
        throw new Error('Configuración de inventario inválida');
      }
      
      // Guardar
      saveApiConfig(apiConfig);
      
      // Recargar para asegurar persistencia
      const reloaded = getApiConfig();
      setApiConfig(reloaded);
      
      // Mostrar confirmación
      setIsInventoryConfigSaved(true);
      setTimeout(() => setIsInventoryConfigSaved(false), 3000);
      
      console.log('✅ Configuración de inventario guardada y recargada');
    } catch (error: any) {
      console.error('Error al guardar configuración de inventario:', error);
      alert(`Error al guardar la configuración: ${error.message || 'Error desconocido'}`);
    }
  };

  const handleSaveGeminiKey = () => {
    try {
      // Guardar
      saveGeminiApiKey(geminiKey);
      
      // Recargar para asegurar persistencia
      const reloaded = getGeminiApiKey() || '';
      setGeminiKey(reloaded);
      
      // Mostrar confirmación
      setIsGeminiSaved(true);
      setTimeout(() => setIsGeminiSaved(false), 3000);
      
      console.log('✅ API Key de Gemini guardada y recargada');
    } catch (error: any) {
      console.error('Error al guardar API Key de Gemini:', error);
      alert(`Error al guardar la API Key: ${error.message || 'Error desconocido'}`);
    }
  };

  // Función para convertir archivo a base64
  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Error al convertir archivo a base64'));
        }
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsDataURL(file);
    });
  };

  // Handler para subir archivo de logo
  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validar que sea una imagen
      if (!file.type.startsWith('image/')) {
        alert('Por favor, seleccione un archivo de imagen válido.');
        e.target.value = ''; // Limpiar el input
        return;
      }
      
      // Validar tamaño (máximo 2MB)
      if (file.size > 2 * 1024 * 1024) {
        alert('El archivo es demasiado grande. Por favor, seleccione una imagen menor a 2MB.');
        e.target.value = ''; // Limpiar el input
        return;
      }
      
      try {
        // Convertir a base64 para persistencia
        const base64 = await convertFileToBase64(file);
        
        // Validar que el base64 sea válido
        if (!base64 || !base64.startsWith('data:image/')) {
          throw new Error('Error al convertir imagen a base64');
        }
        
        // Actualizar el estado con el base64
        setCompanyLogo(base64);
        
        // Guardar automáticamente en localStorage
        localStorage.setItem('OPSFLOW_LOGO', base64);
        
        console.log('✅ Logo convertido a base64 y guardado');
      } catch (error) {
        console.error('Error al procesar imagen:', error);
        alert('Error al procesar la imagen. Por favor, intente nuevamente.');
        e.target.value = ''; // Limpiar el input
      }
    }
  };

  const handleSaveLogo = async () => {
      try {
        if (!companyLogo || companyLogo.trim() === '') {
          alert('Por favor, ingrese una URL de logo válida o seleccione una imagen.');
          return;
        }
        
        // Validar que sea una URL válida o base64
        const isUrl = companyLogo.startsWith('http://') || companyLogo.startsWith('https://');
        const isBase64 = companyLogo.startsWith('data:image/');
        const isDataSvg = companyLogo.startsWith('data:image/svg+xml');
        
        // Rechazar blob URLs (no persisten)
        if (companyLogo.startsWith('blob:')) {
          alert('Por favor, use una URL o suba una imagen. Los archivos temporales no se pueden guardar.');
          return;
        }
        
        if (!isUrl && !isBase64 && !isDataSvg) {
          alert('Por favor, ingrese una URL válida o seleccione una imagen para subir.');
          return;
        }
        
        // Guardar en localStorage
        localStorage.setItem('OPSFLOW_LOGO', companyLogo);
        
        // Forzar actualización del estado para que se refleje inmediatamente
        setCompanyLogo(companyLogo);
        
        // Mostrar confirmación
        setIsLogoSaved(true);
        setTimeout(() => setIsLogoSaved(false), 3000);
        
        console.log('✅ Logo guardado correctamente:', isBase64 ? 'base64' : isUrl ? 'URL' : 'SVG');
      } catch (error) {
        console.error('Error al guardar logo:', error);
        alert('Error al guardar el logo. Por favor, intente nuevamente.');
      }
  };

  // Permission Handlers
  const handlePermissionChange = (role: UserRole, feature: AppFeature, type: 'view' | 'edit', value: boolean) => {
    try {
      setPermissions(prev => {
        // Crear una copia profunda para evitar mutaciones
        const newPermissions = {
          ...prev,
          [role]: {
            ...prev[role],
            [feature]: {
              ...prev[role][feature],
              [type]: value
            }
          }
        };
        return newPermissions;
      });
    } catch (error) {
      console.error('Error updating permission:', error);
      alert('Error al actualizar el permiso. Por favor, intente nuevamente.');
    }
  };

  const handleSavePermissions = () => {
      try {
        // Validar que permissions sea un objeto válido
        if (!permissions || typeof permissions !== 'object') {
          console.error('Invalid permissions object:', permissions);
          alert('Error: Configuración de permisos inválida. Por favor, recarga la página.');
          return;
        }

        // Crear una copia limpia del objeto para evitar referencias circulares
        const cleanPermissions: PermissionConfig = {
          ADMIN: { ...permissions.ADMIN },
          OPERATIONS: { ...permissions.OPERATIONS },
          OPERATIONS_SUPERVISOR: { ...permissions.OPERATIONS_SUPERVISOR },
          CLIENT: { ...permissions.CLIENT }
        };

        // Validar estructura de cada rol
        const roles: UserRole[] = ['ADMIN', 'OPERATIONS', 'OPERATIONS_SUPERVISOR', 'CLIENT'];
        for (const role of roles) {
          if (!cleanPermissions[role] || typeof cleanPermissions[role] !== 'object') {
            throw new Error(`Invalid permissions structure for role: ${role}`);
          }
          
          // Validar cada feature
          const features: AppFeature[] = ['DASHBOARD', 'UNIT_OVERVIEW', 'PERSONNEL', 'LOGISTICS', 'LOGS', 'BLUEPRINT', 'CONTROL_CENTER', 'REPORTS', 'CLIENT_REQUESTS', 'SETTINGS'];
          for (const feature of features) {
            if (!cleanPermissions[role][feature] || typeof cleanPermissions[role][feature] !== 'object') {
              throw new Error(`Invalid permissions structure for role ${role}, feature ${feature}`);
            }
            
            // Asegurar que view y edit sean booleanos
            if (typeof cleanPermissions[role][feature].view !== 'boolean' || 
                typeof cleanPermissions[role][feature].edit !== 'boolean') {
              throw new Error(`Invalid permission values for role ${role}, feature ${feature}`);
            }
          }
        }

        // Intentar serializar para verificar que no hay problemas
        const serialized = JSON.stringify(cleanPermissions);
        if (!serialized || serialized === '{}') {
          throw new Error('Failed to serialize permissions');
        }

        // Guardar en localStorage
        savePermissions(cleanPermissions);
        
        // Actualizar el estado local con la versión limpia
        setPermissions(cleanPermissions);
        
        // Mostrar confirmación
        setIsPermsSaved(true);
        setTimeout(() => setIsPermsSaved(false), 3000);
      } catch (error: any) {
        console.error('Error al guardar permisos:', error);
        alert(`Error al guardar la configuración de permisos: ${error.message || 'Error desconocido'}. Por favor, intente nuevamente.`);
      }
  };

  // --- UNIT FILTERING LOGIC ---
  // Now applies to ANY role that has linkedClientNames
  const visibleUnits = React.useMemo(() => {
      if (!currentUser) return [];
      
      if (currentUser.role === 'ADMIN') return units;
      
      // If user has linked clients, filter by them
      if (currentUser.linkedClientNames && currentUser.linkedClientNames.length > 0) {
          return units.filter(u => currentUser.linkedClientNames?.includes(u.clientName));
      }
      
      // If no linked clients (and not admin), behavior depends on role.
      // Usually Operations sees ALL if not restricted.
      // Client sees NONE if not linked.
      if (currentUser.role === 'CLIENT') return [];
      
      return units;
  }, [units, currentUser]);

  // Extract unique client names for the dropdown
  const availableClients = React.useMemo(() => {
      const names = new Set(units.map(u => u.clientName));
      return Array.from(names);
  }, [units]);


  const renderContent = () => {
    // Mostrar error si hay uno crítico
    if (appError && !authLoading) {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center text-red-600">
            <p className="font-bold mb-2">Error en la aplicación</p>
            <p className="text-sm mb-4">{appError}</p>
            <button 
              onClick={() => {
                setAppError(null);
                setAuthLoading(true);
                window.location.reload();
              }} 
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    
    // Mostrar loading mientras se verifica la autenticación
    if (authLoading) {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600">Verificando autenticación...</p>
          </div>
        </div>
      );
    }

    // Mostrar login si no está autenticado
    if (!isAuthenticated || !currentUser) {
      return <Login onLoginSuccess={handleLoginSuccess} />;
    }

    // Mostrar loading mientras se cargan los datos
    if (unitsLoading || usersLoading || staffLoading) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600">Cargando datos...</p>
          </div>
        </div>
      );
    }

    // Mostrar error si hay problemas
    if (unitsError) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-red-600">
            <p className="font-bold mb-2">Error al cargar datos</p>
            <p className="text-sm">{unitsError}</p>
            <button 
              onClick={() => loadUnits()} 
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    if (currentView === 'control-center') {
      return <ControlCenter units={visibleUnits} managementStaff={managementStaff} onUpdateUnit={handleUpdateUnit} currentUserRole={currentUser.role} />;
    }

    if (currentView === 'client-control-center') {
      return <ClientControlCenter units={visibleUnits} managementStaff={managementStaff} />;
    }

    if (currentView === 'reports') {
      return <Reports units={visibleUnits} />;
    }

    if (currentView === 'dashboard') {
      return <Dashboard units={visibleUnits} onSelectUnit={handleSelectUnit} />;
    }

    if (currentView === 'operations-dashboard') {
      return <OperationsDashboard currentUser={currentUser} users={users} />;
    }

    if (currentView === 'audit-logs') {
      return <AuditLogs />;
    }

    if (currentView === 'units') {
      if (selectedUnitId) {
        const unit = units.find(u => u.id === selectedUnitId);
        if (!unit) return <div className="p-8">Unidad no encontrada</div>;
        
        // Security check: Ensure user can see this unit
        const isLinked = currentUser.linkedClientNames?.includes(unit.clientName);
        if (currentUser.role !== 'ADMIN' && currentUser.linkedClientNames?.length && !isLinked) {
             return <div className="p-8 text-red-600 font-bold">Acceso Denegado a esta Unidad.</div>;
        }

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
            {visibleUnits.map(unit => {
              const staffCount = unit.resources.filter(r => r.type === ResourceType.PERSONNEL).length;
              const logisticsCount = unit.resources.filter(r => r.type !== ResourceType.PERSONNEL).length;
              const pendingRequestsCount = unit.requests?.filter(r => r.status === 'PENDING').length || 0;

              return (
                <div 
                  key={unit.id} 
                  onClick={() => handleSelectUnit(unit.id)}
                  className={`bg-white rounded-xl shadow-sm hover:shadow-lg transition-all cursor-pointer group overflow-hidden relative ${pendingRequestsCount > 0 ? 'ring-2 ring-orange-500 shadow-md' : 'border border-slate-200'}`}
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
                    
                    {/* Status Badge */}
                    <div className="absolute top-3 right-3">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full shadow-sm ${unit.status === 'Activo' ? 'bg-white/90 text-green-700 backdrop-blur-sm' : 'bg-white/90 text-red-700 backdrop-blur-sm'}`}>
                        {unit.status}
                      </span>
                    </div>

                    {/* Pending Requests Alert Badge (Top Left) */}
                    {pendingRequestsCount > 0 && (
                      <div className="absolute top-3 left-3 z-10 animate-pulse">
                        <span className="bg-orange-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-md flex items-center border border-white">
                           <Bell size={12} className="mr-1.5 fill-white"/> {pendingRequestsCount} Nuevos Req.
                        </span>
                      </div>
                    )}
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
                    
                    {/* Visual cue in footer if requests exist */}
                    {pendingRequestsCount > 0 && (
                       <div className="mt-3 pt-2 border-t border-orange-100 flex items-center justify-center text-orange-600 text-xs font-bold">
                           <MessageCircle size={14} className="mr-1.5"/> Atención Requerida
                       </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {visibleUnits.length === 0 && (
                <div className="col-span-1 md:col-span-3 p-12 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                    <Building size={48} className="mx-auto mb-4 opacity-20"/>
                    <p>No se encontraron unidades asignadas a su cuenta.</p>
                </div>
            )}
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
                      <div className="flex gap-2">
                        <select 
                          className="flex-1 border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
                          value={newUnitForm.clientName}
                          onChange={e => setNewUnitForm({...newUnitForm, clientName: e.target.value})}
                        >
                          <option value="">Seleccione un cliente</option>
                          {clients.map(client => (
                            <option key={client.id} value={client.name}>{client.name}</option>
                          ))}
                        </select>
                        {currentUser.role === 'ADMIN' && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddUnitModal(false);
                              openAddClientModal();
                            }}
                            className="bg-slate-100 text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors border border-slate-300 flex items-center"
                            title="Crear nuevo cliente"
                          >
                            <Plus size={16} />
                          </button>
                        )}
                      </div>
                      {clients.length === 0 && (
                        <p className="text-xs text-slate-500 mt-1">
                          {currentUser.role === 'ADMIN' 
                            ? 'No hay clientes. Cree uno primero.' 
                            : 'No hay clientes disponibles. Contacte al administrador.'}
                        </p>
                      )}
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
                                    {['ADMIN', 'OPERATIONS', 'OPERATIONS_SUPERVISOR', 'CLIENT'].map(role => (
                                        <th key={role} className="px-4 py-3 bg-slate-50 text-center text-xs font-bold text-slate-500 uppercase tracking-wider border-l border-slate-200">
                                            {role === 'ADMIN' ? 'Admin' : role === 'OPERATIONS' ? 'Operaciones' : role === 'OPERATIONS_SUPERVISOR' ? 'Sup. Ops' : 'Cliente'}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {(Object.keys(FEATURE_LABELS) as AppFeature[]).map(feature => (
                                    <tr key={feature} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 text-sm font-medium text-slate-700 sticky left-0 bg-white">{FEATURE_LABELS[feature]}</td>
                                        {['ADMIN', 'OPERATIONS', 'OPERATIONS_SUPERVISOR', 'CLIENT'].map(roleStr => {
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
                        <button 
                          type="button"
                          onClick={handleSavePermissions} 
                          className="bg-slate-800 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-900 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
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
                                        <input 
                                          type="file" 
                                          accept="image/*" 
                                          className="hidden" 
                                          onChange={handleLogoFileUpload}
                                        />
                                    </label>
                                </div>
                            </div>
                            <button 
                              type="button"
                              onClick={handleSaveLogo} 
                              className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={!companyLogo || companyLogo.trim() === ''}
                            >
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
               <button onClick={openAddUserModal} className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-50 transition-colors flex items-center">
                  <UserPlus size={14} className="mr-1.5" /> Nuevo Usuario
               </button>
             </div>
             <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-white">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Usuario</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Rol</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Contraseña</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Empresa(s) Asignada(s)</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                   {usersLoading ? (
                     <tr>
                       <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                         <div className="flex items-center justify-center">
                           <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mr-3"></div>
                           Cargando usuarios...
                         </div>
                       </td>
                     </tr>
                   ) : users.length === 0 ? (
                     <tr>
                       <td colSpan={6} className="px-6 py-8 text-center text-slate-400">No hay usuarios registrados</td>
                     </tr>
                   ) : (
                     users.map(u => {
                       const isProcessing = userOperationLoading.type !== null && 
                         (userOperationLoading.userId === u.id || 
                          (userOperationLoading.type === 'create' && !userOperationLoading.userId));
                       return (
                         <tr key={u.id} className={`hover:bg-slate-50 ${isProcessing ? 'opacity-50' : ''}`}>
                            <td className="px-6 py-4 whitespace-nowrap flex items-center">
                              <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 mr-3">{u.avatar}</div>
                              <span className="text-sm font-medium text-slate-900">{u.name}</span>
                              {isProcessing && (
                                <div className="ml-2 animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500"></div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{u.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-xs font-medium bg-slate-100 px-2 py-1 rounded-full text-slate-600">{u.role}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                          {u.temporaryPassword ? (
                            <span className="text-green-600" title="Contraseña temporal">{u.temporaryPassword}</span>
                          ) : (
                            <span className="text-slate-300 italic">••••••••</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                {u.linkedClientNames && u.linkedClientNames.length > 0 ? (
                                    <span className="block truncate max-w-xs" title={u.linkedClientNames.join(', ')}>
                                        {u.linkedClientNames.join(', ')}
                                    </span>
                                ) : (
                                    <span className="text-slate-300 italic">Global / Sin asignar</span>
                                )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                               <button 
                                 onClick={() => openEditUserModal(u)} 
                                 disabled={isProcessing}
                                 className="text-blue-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 mr-2 disabled:opacity-50 disabled:cursor-not-allowed" 
                                 title="Editar usuario">
                                 <Edit2 size={16}/>
                               </button>
                               <button 
                                 onClick={() => openChangePasswordModal(u)} 
                                 disabled={isProcessing}
                                 className="text-amber-400 hover:text-amber-600 p-1 rounded hover:bg-amber-50 mr-2 disabled:opacity-50 disabled:cursor-not-allowed" 
                                 title="Cambiar contraseña">
                                 <Shield size={16}/>
                               </button>
                               <button 
                                 onClick={() => handleDeleteUser(u.id)} 
                                 disabled={isProcessing}
                                 className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed" 
                                 title="Eliminar usuario">
                                 <Trash2 size={16}/>
                               </button>
                            </td>
                         </tr>
                       );
                     })
                   )}
                </tbody>
             </table>
           </div>

           {/* --- Management Staff Registry --- */}
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
             <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <h3 className="font-bold text-slate-700 flex items-center"><Briefcase className="mr-2" size={18} /> Gestión de Equipo de Supervisión (Global)</h3>
               <button onClick={() => { setEditingStaff(null); setNewStaffForm({ name: '', role: 'COORDINATOR', email: '', status: 'activo', archived: false }); setNewStaffPhotoUrl(''); setShowAddStaffModal(true); }} className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-50 transition-colors flex items-center">
                  <Plus size={14} className="mr-1.5" /> Agregar Personal
               </button>
             </div>
             <div className="p-6">
               <table className="min-w-full divide-y divide-slate-200">
                 <thead className="bg-slate-50">
                   <tr>
                     <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Personal</th>
                     <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">DNI</th>
                     <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Rol</th>
                     <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
                     <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fechas</th>
                     <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>
                   </tr>
                 </thead>
                 <tbody className="bg-white divide-y divide-slate-200">
                   {staffLoading ? (
                     <tr>
                       <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                         <div className="flex items-center justify-center">
                           <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mr-3"></div>
                           Cargando personal...
                         </div>
                       </td>
                     </tr>
                   ) : managementStaff.length === 0 ? (
                     <tr>
                       <td colSpan={6} className="px-6 py-8 text-center text-slate-400">No hay personal registrado</td>
                     </tr>
                   ) : (
                     managementStaff.map(staff => (
                       <tr key={staff.id} className="hover:bg-slate-50">
                         <td className="px-4 py-4 whitespace-nowrap">
                           <div className="flex items-center">
                             <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex-shrink-0 mr-3">
                               {staff.photo ? (
                                 <img src={staff.photo} alt={staff.name} className="w-full h-full object-cover"/>
                               ) : (
                                 <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 text-sm">?</div>
                               )}
                             </div>
                             <div>
                               <div className="text-sm font-medium text-slate-900">{staff.name}</div>
                               <div className="text-xs text-slate-500">{staff.email || 'Sin email'}</div>
                               {staff.phone && <div className="text-xs text-slate-400">{staff.phone}</div>}
                             </div>
                           </div>
                         </td>
                         <td className="px-4 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                           {staff.dni || <span className="text-slate-300 italic">-</span>}
                         </td>
                         <td className="px-4 py-4 whitespace-nowrap">
                           <span className="text-xs font-medium bg-blue-100 px-2 py-1 rounded-full text-blue-700">
                             {staff.role === 'COORDINATOR' ? 'Coordinador' : staff.role === 'RESIDENT_SUPERVISOR' ? 'Sup. Residente' : 'Sup. Ronda'}
                           </span>
                         </td>
                         <td className="px-4 py-4 whitespace-nowrap">
                           <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                             staff.status === 'cesado' 
                               ? 'bg-red-100 text-red-700' 
                               : 'bg-green-100 text-green-700'
                           }`}>
                             {staff.status === 'cesado' ? 'Cesado' : 'Activo'}
                           </span>
                         </td>
                         <td className="px-4 py-4 whitespace-nowrap text-xs text-slate-500">
                           {staff.startDate && (
                             <div>Inicio: {new Date(staff.startDate).toLocaleDateString('es-ES')}</div>
                           )}
                           {staff.endDate && (
                             <div className="text-red-600">Fin: {new Date(staff.endDate).toLocaleDateString('es-ES')}</div>
                           )}
                           {!staff.startDate && !staff.endDate && <span className="text-slate-300 italic">-</span>}
                         </td>
                         <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                           <div className="flex items-center justify-end space-x-2">
                             <button
                               onClick={() => openEditStaffModal(staff)}
                               className="text-blue-600 hover:text-blue-900 p-1 rounded hover:bg-blue-50"
                               title="Editar"
                             >
                               <Edit2 size={16} />
                             </button>
                             {staff.status === 'cesado' && (
                               <button
                                 onClick={() => handleArchiveStaff(staff.id)}
                                 className="text-amber-600 hover:text-amber-900 p-1 rounded hover:bg-amber-50"
                                 title="Archivar trabajador"
                               >
                                 <Archive size={16} />
                               </button>
                             )}
                             <button
                               onClick={() => handleDeleteStaff(staff.id)}
                               className="text-red-600 hover:text-red-900 p-1 rounded hover:bg-red-50"
                               title="Eliminar"
                             >
                               <Trash2 size={16} />
                             </button>
                           </div>
                         </td>
                       </tr>
                     ))
                   )}
                 </tbody>
               </table>
             </div>
           </div>

           {/* --- Clients Management (solo admin) --- */}
           {currentUser.role === 'ADMIN' && (
             <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
               <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                 <h3 className="font-bold text-slate-700 flex items-center"><Building className="mr-2" size={18} /> Gestión de Clientes</h3>
                 <button onClick={openAddClientModal} className="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-50 transition-colors flex items-center">
                   <Plus size={14} className="mr-1.5" /> Nuevo Cliente
                 </button>
               </div>
               <div className="p-6">
                 {clientsLoading ? (
                   <div className="text-center py-8 text-slate-500">
                     <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-3"></div>
                     Cargando clientes...
                   </div>
                 ) : clients.length === 0 ? (
                   <div className="text-center py-8 text-slate-400">
                     <Building size={32} className="mx-auto mb-3 opacity-50" />
                     <p>No hay clientes registrados</p>
                     <p className="text-xs mt-1">Cree un cliente para poder asignarlo a unidades</p>
                   </div>
                 ) : (
                   <div className="space-y-4">
                     {clients.map(client => (
                       <div key={client.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                         <div className="flex justify-between items-start">
                           <div className="flex-1">
                             <div className="flex items-center gap-3 mb-2">
                               <h4 className="font-bold text-slate-800">{client.name}</h4>
                               <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                 RUC: {client.ruc}
                               </span>
                             </div>
                             {client.representatives.length > 0 && (
                               <div className="mt-3 space-y-2">
                                 <p className="text-xs font-bold text-slate-500 uppercase">Representantes:</p>
                                 {client.representatives.map((rep, idx) => (
                                   <div key={idx} className="text-sm text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                                     <div className="font-medium">{rep.name}</div>
                                     {rep.phone && <div className="text-xs text-slate-500">Tel: {rep.phone}</div>}
                                     {rep.email && <div className="text-xs text-slate-500">Email: {rep.email}</div>}
                                   </div>
                                 ))}
                               </div>
                             )}
                           </div>
                           <div className="flex gap-2 ml-4">
                             <button
                               onClick={() => openEditClientModal(client)}
                               className="text-blue-600 hover:text-blue-900 p-1.5 rounded hover:bg-blue-50"
                               title="Editar cliente"
                             >
                               <Edit2 size={16} />
                             </button>
                             <button
                               onClick={() => handleDeleteClient(client.id)}
                               className="text-red-600 hover:text-red-900 p-1.5 rounded hover:bg-red-50"
                               title="Eliminar cliente"
                             >
                               <Trash2 size={16} />
                             </button>
                           </div>
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
             </div>
           )}

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


           {/* Add/Edit User Modal */}
           {showUserModal && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center">
                          {editingUser ? <><Edit2 className="mr-2" size={20}/> Editar Usuario</> : <><UserPlus className="mr-2" size={20}/> Nuevo Usuario</>}
                      </h3>
                      <button onClick={() => setShowUserModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div><label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label><input type="text" className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} /></div>
                      <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" className="w-full border border-slate-300 rounded-lg p-2 outline-none bg-slate-50" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} disabled={!!editingUser} /></div>
                      {!editingUser && (
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                          <input 
                            type="password" 
                            className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                            value={userForm.password} 
                            onChange={e => setUserForm({...userForm, password: e.target.value})} 
                            placeholder="Mínimo 6 caracteres"
                          />
                          <p className="text-xs text-slate-500 mt-1">La contraseña se usará para iniciar sesión</p>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                        <select className="w-full border border-slate-300 rounded-lg p-2 outline-none" value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value as UserRole})}>
                          <option value="OPERATIONS">Operaciones</option>
                          <option value="OPERATIONS_SUPERVISOR">Supervisor Operaciones</option>
                          <option value="CLIENT">Cliente</option>
                          <option value="ADMIN">Administrador</option>
                        </select>
                      </div>
                      
                      {/* Linked Client Selection for ALL relevant roles */}
                      {['CLIENT', 'OPERATIONS', 'OPERATIONS_SUPERVISOR'].includes(userForm.role) && (
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">Empresas / Clientes Asignados</label>
                              <div className="border border-slate-300 rounded-lg p-2 bg-slate-50 max-h-40 overflow-y-auto">
                                  {clientsLoading ? (
                                    <p className="text-xs text-slate-400 italic p-1">Cargando clientes...</p>
                                  ) : (() => {
                                    // Combinar clientes de la tabla clients con clientNames de unidades existentes
                                    const clientNamesFromTable = clients.map(c => c.name);
                                    const clientNamesFromUnits = Array.from(new Set(units.map(u => u.clientName).filter(Boolean)));
                                    const allClientNames = Array.from(new Set([...clientNamesFromTable, ...clientNamesFromUnits]));
                                    
                                    if (allClientNames.length === 0) {
                                      return (
                                        <p className="text-xs text-slate-400 italic p-1">
                                          {currentUser.role === 'ADMIN' 
                                            ? 'No hay clientes creados. Cree clientes primero en la sección "Gestión de Clientes".' 
                                            : 'No hay clientes disponibles.'}
                                        </p>
                                      );
                                    }
                                    
                                    return allClientNames.map(clientName => {
                                      const clientFromTable = clients.find(c => c.name === clientName);
                                      const isFromTable = !!clientFromTable;
                                      
                                      return (
                                        <label key={clientName} className="flex items-center p-1.5 hover:bg-slate-100 rounded cursor-pointer">
                                            <input 
                                              type="checkbox" 
                                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 mr-2"
                                              checked={userForm.linkedClientNames.includes(clientName)}
                                              onChange={() => handleToggleLinkedClient(clientName)}
                                            />
                                            <span className="text-sm text-slate-700">{clientName}</span>
                                            {clientFromTable?.ruc && (
                                              <span className="text-xs text-slate-500 ml-2">({clientFromTable.ruc})</span>
                                            )}
                                            {!isFromTable && (
                                              <span className="text-xs text-amber-600 ml-2 italic">(de unidades existentes)</span>
                                            )}
                                        </label>
                                      );
                                    });
                                  })()}
                              </div>
                              <p className="text-xs text-slate-500 mt-1">
                                  {userForm.linkedClientNames.length > 0 
                                    ? `Seleccionados: ${userForm.linkedClientNames.length}` 
                                    : "Ninguno seleccionado (Verá todo si es Operaciones, nada si es Cliente)"}
                              </p>
                          </div>
                      )}

                      <button 
                        onClick={handleSaveUser} 
                        disabled={userOperationLoading.type === 'create' || userOperationLoading.type === 'update'}
                        className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        {userOperationLoading.type === 'create' || userOperationLoading.type === 'update' ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            {editingUser ? 'Guardando...' : 'Creando usuario...'}
                          </>
                        ) : (
                          editingUser ? 'Guardar Cambios' : 'Crear Usuario'
                        )}
                      </button>
                  </div>
                </div>
             </div>
           )}

           {/* Change Password Modal */}
           {showChangePasswordModal && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200">
                  <div className="bg-amber-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
                      <h3 className="font-bold text-lg flex items-center">
                          <Shield className="mr-2" size={20}/> Cambiar Contraseña
                      </h3>
                      <button onClick={() => setShowChangePasswordModal(false)} className="text-white/80 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Nueva Contraseña</label>
                          <input 
                            type="password" 
                            className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                            value={passwordForm.newPassword} 
                            onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})} 
                            placeholder="Mínimo 6 caracteres"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar Contraseña</label>
                          <input 
                            type="password" 
                            className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                            value={passwordForm.confirmPassword} 
                            onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})} 
                            placeholder="Repita la contraseña"
                          />
                      </div>
                      <button 
                        onClick={handleChangePassword} 
                        disabled={userOperationLoading.type === 'password'}
                        className="w-full bg-amber-600 text-white py-2.5 rounded-lg font-medium hover:bg-amber-700 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        {userOperationLoading.type === 'password' ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Cambiando contraseña...
                          </>
                        ) : (
                          'Cambiar Contraseña'
                        )}
                      </button>
                  </div>
                </div>
             </div>
           )}

           {/* Add/Edit Staff Modal */}
           {showAddStaffModal && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                  <div className="bg-indigo-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center shrink-0">
                      <h3 className="font-bold text-lg flex items-center">
                        <Briefcase className="mr-2" size={20}/> 
                        {editingStaff ? 'Editar Personal' : 'Nuevo Supervisor/Coord.'}
                      </h3>
                      <button onClick={() => { setShowAddStaffModal(false); setEditingStaff(null); setNewStaffForm({ name: '', role: 'COORDINATOR', email: '', status: 'activo', archived: false }); setNewStaffPhotoUrl(''); }} className="text-white/80 hover:text-white"><X size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo *</label>
                        <input 
                          type="text" 
                          className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                          value={newStaffForm.name || ''} 
                          onChange={e => setNewStaffForm({...newStaffForm, name: e.target.value})} 
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">DNI</label>
                        <input 
                          type="text" 
                          className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                          value={newStaffForm.dni || ''} 
                          onChange={e => setNewStaffForm({...newStaffForm, dni: e.target.value})} 
                          placeholder="Documento Nacional de Identidad"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Rol de Gestión *</label>
                        <select 
                          className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                          value={newStaffForm.role || 'COORDINATOR'} 
                          onChange={e => setNewStaffForm({...newStaffForm, role: e.target.value as ManagementRole})}
                        >
                          <option value="COORDINATOR">Coordinador</option>
                          <option value="RESIDENT_SUPERVISOR">Supervisor Residente</option>
                          <option value="ROVING_SUPERVISOR">Supervisor de Ronda</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <input 
                          type="email" 
                          className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                          value={newStaffForm.email || ''} 
                          onChange={e => setNewStaffForm({...newStaffForm, email: e.target.value})} 
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                        <input 
                          type="tel" 
                          className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                          value={newStaffForm.phone || ''} 
                          onChange={e => setNewStaffForm({...newStaffForm, phone: e.target.value})} 
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Inicio</label>
                          <input 
                            type="date" 
                            className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                            value={newStaffForm.startDate || ''} 
                            onChange={e => setNewStaffForm({...newStaffForm, startDate: e.target.value})} 
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de Fin</label>
                          <input 
                            type="date" 
                            className="w-full border border-slate-300 rounded-lg p-2 outline-none" 
                            value={newStaffForm.endDate || ''} 
                            onChange={e => {
                              const endDate = e.target.value;
                              setNewStaffForm({
                                ...newStaffForm, 
                                endDate: endDate,
                                // El trigger de la BD cambiará automáticamente el status a 'cesado'
                              });
                            }} 
                          />
                          {newStaffForm.endDate && (
                            <p className="text-xs text-amber-600 mt-1">El trabajador pasará a estado "Cesado"</p>
                          )}
                        </div>
                      </div>
                      
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

                      <button 
                        onClick={handleSaveStaff} 
                        className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors mt-2"
                      >
                        {editingStaff ? 'Guardar Cambios' : 'Agregar a Registro'}
                      </button>
                  </div>
                </div>
             </div>
           )}

          {/* Client Management Modal (solo admin) */}
          {showClientModal && currentUser.role === 'ADMIN' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-blue-600 text-white px-6 py-4 rounded-t-xl flex justify-between items-center shrink-0">
                  <div className="flex items-center font-bold text-lg">
                    <Building className="mr-2" size={20}/>
                    {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
                  </div>
                  <button onClick={() => setShowClientModal(false)} className="text-white/80 hover:text-white">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Cliente *</label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Ej. Banco Global S.A."
                      value={clientForm.name}
                      onChange={e => setClientForm({...clientForm, name: e.target.value})}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">RUC *</label>
                    <input
                      type="text"
                      className="w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Ej. 20123456789"
                      value={clientForm.ruc}
                      onChange={e => setClientForm({...clientForm, ruc: e.target.value})}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-slate-700">Representantes *</label>
                      <button
                        type="button"
                        onClick={handleAddRepresentative}
                        className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 flex items-center"
                      >
                        <Plus size={14} className="mr-1" /> Agregar Representante
                      </button>
                    </div>
                    <div className="space-y-3">
                      {clientForm.representatives.map((rep, index) => (
                        <div key={index} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-500">Representante {index + 1}</span>
                            {clientForm.representatives.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveRepresentative(index)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <X size={16} />
                              </button>
                            )}
                          </div>
                          <div className="space-y-2">
                            <input
                              type="text"
                              className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Nombre completo *"
                              value={rep.name}
                              onChange={e => handleUpdateRepresentative(index, 'name', e.target.value)}
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                type="tel"
                                className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Teléfono"
                                value={rep.phone}
                                onChange={e => handleUpdateRepresentative(index, 'phone', e.target.value)}
                              />
                              <input
                                type="email"
                                className="w-full border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Email"
                                value={rep.email}
                                onChange={e => handleUpdateRepresentative(index, 'email', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleSaveClient}
                    disabled={!clientForm.name || !clientForm.ruc}
                    className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {editingClient ? 'Guardar Cambios' : 'Crear Cliente'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  // Si no está autenticado, solo mostrar el login (ya manejado en renderContent)
  if (!isAuthenticated || !currentUser) {
    return renderContent();
  }

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
          {/* Navegación para usuarios CLIENT */}
          {currentUser.role === 'CLIENT' ? (
            <>
              <button 
                onClick={() => { setCurrentView('dashboard'); setSelectedUnitId(null); }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <LayoutDashboard size={20} />
                <span>Dashboard</span>
              </button>
              
              {checkPermission(currentUser.role, 'UNIT_OVERVIEW', 'view') && (
                <button 
                  onClick={() => { setCurrentView('units'); setSelectedUnitId(null); }}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'units' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                  <Building size={20} />
                  <span>Unidades</span>
                </button>
              )}
              
              <button 
                onClick={() => { setCurrentView('client-control-center'); setSelectedUnitId(null); }}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'client-control-center' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <LayoutList size={20} />
                <span>Centro de Control - Consulta</span>
              </button>
            </>
          ) : (
            <>
              {/* Navegación para otros roles (ADMIN, OPERATIONS, etc.) */}
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

              {/* New Reports Link */}
              {checkPermission(currentUser.role, 'REPORTS', 'view') && (
                  <button 
                    onClick={() => { setCurrentView('reports'); setSelectedUnitId(null); }}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'reports' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                  >
                    <FileBarChart size={20} />
                    <span>Informes y Analítica</span>
                  </button>
              )}

              {/* Operations Dashboard - Visible for ADMIN, OPERATIONS, OPERATIONS_SUPERVISOR */}
              {(currentUser.role === 'ADMIN' || currentUser.role === 'OPERATIONS' || currentUser.role === 'OPERATIONS_SUPERVISOR') && (
                  <button 
                    onClick={() => { setCurrentView('operations-dashboard'); setSelectedUnitId(null); }}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'operations-dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                  >
                    <Activity size={20} />
                    <span>Dashboard Operaciones</span>
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

              {/* Auditoría - Solo para administradores */}
              {currentUser.role === 'ADMIN' && (
                <>
                  <div className="pt-4 pb-2 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Administración
                  </div>
                  <button 
                    onClick={() => { setCurrentView('audit-logs'); setSelectedUnitId(null); }}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'audit-logs' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                  >
                    <FileText size={20} />
                    <span>Logs de Auditoría</span>
                  </button>
                </>
              )}
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

          {/* User Menu */}
          {showUserMenu && currentUser && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2">
               <div className="p-2 text-xs font-semibold text-slate-500 uppercase">Usuario</div>
               <div className="px-4 py-2 text-sm text-slate-300 border-b border-slate-700">
                 <p className="font-medium">{currentUser.name}</p>
                 <p className="text-xs text-slate-400">{currentUser.email}</p>
                 <p className="text-xs text-slate-500 mt-1">Rol: {currentUser.role}</p>
               </div>
               {users.length > 0 && users.length > 1 && (
                 <>
                   <div className="p-2 text-xs font-semibold text-slate-500 uppercase border-t border-slate-700 mt-2">Cambiar Usuario</div>
                   {users.map(user => (
                     <button
                       key={user.id}
                       onClick={() => { setCurrentUser(user); setShowUserMenu(false); }}
                       className={`w-full text-left px-4 py-3 text-sm flex items-center hover:bg-slate-700 ${currentUser.id === user.id ? 'text-blue-400 bg-slate-700/50' : 'text-slate-300'}`}
                     >
                        <span className="w-2 h-2 rounded-full bg-current mr-2"></span>
                        {user.name} ({user.role})
                     </button>
                   ))}
                 </>
               )}
               <button
                 onClick={handleLogout}
                 className="w-full text-left px-4 py-3 text-sm flex items-center hover:bg-red-900/20 text-red-400 border-t border-slate-700 mt-2"
               >
                 <LogOut size={16} className="mr-2" />
                 Cerrar Sesión
               </button>
            </div>
          )}
        </div>

        {/* Powered By Logo Section - DYNAMIC */}
        <div className="px-6 pb-6 pt-0 flex flex-col items-center justify-center">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Powered By</span>
            {companyLogo ? (
              <img 
                src={companyLogo} 
                alt="Company Logo" 
                className="h-10 w-auto object-contain max-w-full"
                onError={(e) => {
                  console.error('Error al cargar logo');
                  // Si falla, usar el logo por defecto
                  e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTUwIiBoZWlnaHQ9IjUwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxNTAiIGhlaWdodD0iNTAiIGZpbGw9IiNmM2Y0ZjYiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE0IiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+TE9HTzwvdGV4dD48L3N2Zz4=';
                }}
              />
            ) : (
              <div className="h-10 w-24 bg-slate-700 rounded flex items-center justify-center text-white text-xs font-bold">
                LOGO
              </div>
            )}
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

