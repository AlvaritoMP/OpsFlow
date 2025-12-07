
// services/inventoryService.ts
import { InventoryApiConfig } from "../types";

const STORAGE_KEY = 'OPSFLOW_INVENTORY_CONFIG';

const DEFAULT_CONFIG: InventoryApiConfig = {
    baseUrl: 'https://api.tu-empresa-inventarios.com/v1',
    apiKey: '',
    useMock: true 
};

// --- CONFIGURATION HELPERS ---

export const getApiConfig = (): InventoryApiConfig => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            console.log('📦 No hay configuración de inventario guardada, usando valores por defecto');
            return DEFAULT_CONFIG;
        }
        
        const parsed = JSON.parse(stored);
        
        // Validar estructura
        if (!parsed || typeof parsed !== 'object') {
            console.warn('⚠️ Configuración de inventario inválida, usando valores por defecto');
            return DEFAULT_CONFIG;
        }
        
        // Asegurar que tenga todos los campos requeridos
        const config: InventoryApiConfig = {
            baseUrl: parsed.baseUrl || DEFAULT_CONFIG.baseUrl,
            apiKey: parsed.apiKey || DEFAULT_CONFIG.apiKey,
            useMock: typeof parsed.useMock === 'boolean' ? parsed.useMock : DEFAULT_CONFIG.useMock
        };
        
        console.log('✅ Configuración de inventario cargada correctamente');
        return config;
    } catch (e) {
        console.error('❌ Error al cargar configuración de inventario:', e);
        return DEFAULT_CONFIG;
    }
};

export const saveApiConfig = (config: InventoryApiConfig) => {
    try {
        // Validar estructura antes de guardar
        if (!config || typeof config !== 'object') {
            throw new Error('Invalid API config: config must be an object');
        }
        
        if (typeof config.useMock !== 'boolean') {
            throw new Error('Invalid API config: useMock must be a boolean');
        }
        
        // Serializar y guardar
        const serialized = JSON.stringify(config);
        localStorage.setItem(STORAGE_KEY, serialized);
        
        console.log('✅ Configuración de inventario guardada correctamente');
    } catch (error) {
        console.error('❌ Error al guardar configuración de inventario:', error);
        throw error;
    }
};

export interface ExternalInventoryItem {
  sku: string;
  name: string;
  currentStock: number;
  status: string; // 'Disponible', 'Agotado', 'En Reparacion', 'Stock Bajo'
  lastUpdated: string;
}

// --- DATOS SIMULADOS (Para Demostración) ---
const MOCK_EXTERNAL_DB: Record<string, ExternalInventoryItem> = {
  'MAT-001': { sku: 'MAT-001', name: 'Detergente Industrial Concentrado', currentStock: 120, status: 'Disponible', lastUpdated: new Date().toISOString() },
  'MAT-002': { sku: 'MAT-002', name: 'Papel Higiénico Jumbo Roll', currentStock: 45, status: 'Stock Bajo', lastUpdated: new Date().toISOString() },
  'EQP-500': { sku: 'EQP-500', name: 'Aspiradora Karcher Modelo X', currentStock: 1, status: 'En Mantenimiento', lastUpdated: new Date().toISOString() },
  'EQP-501': { sku: 'EQP-501', name: 'Lustradora Industrial', currentStock: 1, status: 'Disponible', lastUpdated: new Date().toISOString() },
};

export const syncResourceWithInventory = async (externalId: string): Promise<ExternalInventoryItem | null> => {
  const config = getApiConfig();
  
  // 1. MODO SIMULACIÓN (MOCK)
  if (config.useMock) {
      console.log(`[Inventory Service] Consultando SKU simulado: ${externalId}`);
      await new Promise(resolve => setTimeout(resolve, 800)); // Simular delay de red
      
      const item = MOCK_EXTERNAL_DB[externalId];
      if (item) {
        // Retornamos datos con una pequeña variación aleatoria para simular consumo real
        return {
            ...item,
            currentStock: Math.max(0, item.currentStock - Math.floor(Math.random() * 5)), 
            lastUpdated: new Date().toISOString()
        };
      }
      return null;
  }

  // 2. MODO REAL (API FETCH)
  try {
      console.log(`[Inventory Service] Conectando a API Real: ${config.baseUrl}/items/${externalId}`);
      
      const response = await fetch(`${config.baseUrl}/items/${externalId}`, {
          method: 'GET',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}` // Ajustar según tu tipo de autenticación
          }
      });

      if (!response.ok) {
          if (response.status === 404) return null; // No encontrado
          throw new Error(`Error API: ${response.statusText}`);
      }

      const data = await response.json();

      // Aquí mapeamos la respuesta de TU api a la interfaz de OpsFlow
      // Ajusta los campos de la derecha (data.xxx) según como responda tu servidor
      return {
          sku: data.sku || externalId,
          name: data.nombre_producto || data.name,
          currentStock: Number(data.stock_actual || data.quantity),
          status: mapExternalStatus(data.estado), // Función auxiliar para normalizar estados
          lastUpdated: new Date().toISOString()
      };

  } catch (error) {
      console.error("[Inventory Service Error]", error);
      // Opcional: Lanzar error o retornar null para manejarlo en la UI
      throw error;
  }
};

// Función auxiliar para traducir los estados de tu API a los de OpsFlow
const mapExternalStatus = (externalStatus: string): string => {
    if (!externalStatus) return 'Disponible';
    const status = externalStatus.toLowerCase();
    if (status.includes('ok') || status.includes('disponible')) return 'Disponible';
    if (status.includes('bajo') || status.includes('minimo')) return 'Stock Bajo';
    if (status.includes('mantenimiento') || status.includes('taller')) return 'En Reparacion';
    if (status.includes('baja') || status.includes('roto')) return 'Baja';
    if (status.includes('agotado') || status.includes('cero')) return 'Agotado';
    return 'Disponible'; // Default
};