# Plan de Integración: Appinventario → OpsFlow

## 📋 Objetivo
Integrar completamente Appinventario dentro de OpsFlow como un módulo más, permitiendo:
- Gestión completa de inventarios (productos, SKUs, stock, etc.)
- Solicitudes de materiales desde unidades usando SKUs del inventario
- Gestión de compras y aprobaciones
- Todo en una sola aplicación unificada

## ✅ Ventajas de la Integración Completa

1. **Una sola aplicación**: No necesitas mantener dos apps separadas
2. **Base de datos unificada**: Todo en el mismo Supabase, sin sincronización
3. **Interfaz consistente**: Mismo diseño y UX en todos los módulos
4. **Permisos unificados**: Sistema de permisos integrado
5. **Menos complejidad**: No necesitas APIs, webhooks, ni sincronización
6. **Mejor experiencia**: Los usuarios no necesitan cambiar de aplicación

---

## 🔍 Fase 1: Análisis y Diseño

### 1.1 Estructura de Módulos en OpsFlow

OpsFlow ya tiene una arquitectura modular con diferentes vistas:
- Dashboard
- Unidades
- Retenes
- Supervisión Nocturna
- Catálogo de Activos
- Headcount
- etc.

**Appinventario se integrará como:**
- **Nuevo módulo "Inventario"** en el sidebar
- **Subsección en Requerimientos** para solicitudes de materiales
- **Gestión de Compras** integrada en el módulo de Inventario

### 1.2 Funcionalidades a Integrar

**Módulo de Inventario:**
- Catálogo de productos (SKUs)
- Gestión de stock
- Categorías de productos
- Proveedores
- Órdenes de compra
- Recepción de materiales
- Historial de movimientos

**Integración con Requerimientos:**
- Buscar SKUs al crear requerimientos LOGISTICS
- Crear solicitudes de materiales vinculadas a requerimientos
- Ver estado de solicitudes (pendiente, aprobada, ordenada, entregada)
- Gestión de aprobaciones por equipo de Compras

---

## 🗄️ Fase 2: Diseño de Base de Datos

### 2.1 Tabla: `inventory_products` (Catálogo de Productos)

```sql
CREATE TABLE inventory_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- Categoría del producto
  brand TEXT, -- Marca (opcional)
  unit_of_measure TEXT NOT NULL, -- Unidad de medida (ej: "Litros", "Cajas", "Unidad")
  
  -- Stock
  current_stock NUMERIC DEFAULT 0,
  min_stock NUMERIC DEFAULT 0, -- Stock mínimo
  max_stock NUMERIC, -- Stock máximo (opcional)
  reorder_point NUMERIC, -- Punto de reorden
  
  -- Precios (opcional)
  unit_cost NUMERIC, -- Costo unitario
  selling_price NUMERIC, -- Precio de venta (si aplica)
  
  -- Estado
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
  
  -- Ubicación (opcional)
  location TEXT, -- Ubicación en almacén
  warehouse TEXT, -- Almacén específico
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id)
);

CREATE INDEX idx_inventory_products_sku ON inventory_products(sku);
CREATE INDEX idx_inventory_products_status ON inventory_products(status);
CREATE INDEX idx_inventory_products_category ON inventory_products(category);
```

### 2.2 Tabla: `material_requests` (Solicitudes de Materiales)

```sql
CREATE TABLE material_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relación con OpsFlow
  opsflow_request_id UUID REFERENCES client_requests(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES units(id),
  unit_name TEXT NOT NULL,
  
  -- Información del Material
  sku TEXT NOT NULL, -- SKU del Appinventario
  material_name TEXT, -- Nombre del material (cacheado)
  quantity NUMERIC NOT NULL,
  unit_of_measure TEXT, -- Unidad de medida (ej: "Litros", "Cajas", "Unidad")
  
  -- Estado y Gestión
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'ordered', 'delivered', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Información adicional
  description TEXT,
  requested_by TEXT, -- Nombre del usuario que solicitó
  requested_by_id UUID, -- ID del usuario (si está disponible)
  requested_date TIMESTAMPTZ DEFAULT now(),
  
  -- Gestión en Appinventario
  approved_by TEXT,
  approved_date TIMESTAMPTZ,
  rejected_reason TEXT,
  order_number TEXT, -- Número de orden de compra
  delivery_date TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ, -- Última sincronización con Appinventario
);

-- Índices
CREATE INDEX idx_material_requests_opsflow_request_id ON material_requests(opsflow_request_id);
CREATE INDEX idx_material_requests_status ON material_requests(status);
CREATE INDEX idx_material_requests_sku ON material_requests(sku);
CREATE INDEX idx_material_requests_unit_id ON material_requests(unit_id);
```

### 2.3 Tabla: `purchase_orders` (Órdenes de Compra)

```sql
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL, -- Número de orden (ej: PO-2024-001)
  supplier_name TEXT, -- Nombre del proveedor
  supplier_contact TEXT, -- Contacto del proveedor
  order_date TIMESTAMPTZ DEFAULT now(),
  expected_delivery_date TIMESTAMPTZ,
  actual_delivery_date TIMESTAMPTZ,
  
  -- Estado
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'ordered', 'partial', 'received', 'cancelled')),
  
  -- Totales
  total_amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'PEN',
  
  -- Metadata
  notes TEXT,
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX idx_purchase_orders_order_number ON purchase_orders(order_number);
```

### 2.4 Tabla: `purchase_order_items` (Items de Orden de Compra)

```sql
CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  material_request_id UUID REFERENCES material_requests(id), -- Opcional: vinculado a solicitud
  product_id UUID REFERENCES inventory_products(id),
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit_of_measure TEXT NOT NULL,
  unit_price NUMERIC,
  total_price NUMERIC,
  received_quantity NUMERIC DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_po_items_po_id ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_po_items_material_request_id ON purchase_order_items(material_request_id);
```

### 2.5 Tabla: `inventory_movements` (Movimientos de Inventario)

```sql
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES inventory_products(id),
  sku TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entry', 'exit', 'adjustment', 'transfer')),
  quantity NUMERIC NOT NULL,
  unit_of_measure TEXT NOT NULL,
  
  -- Referencias
  reference_type TEXT, -- 'purchase_order', 'material_request', 'adjustment', etc.
  reference_id UUID, -- ID de la referencia
  
  -- Ubicación
  unit_id UUID REFERENCES units(id), -- Si es salida a unidad
  location TEXT, -- Ubicación en almacén
  
  -- Metadata
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_inventory_movements_product_id ON inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_type ON inventory_movements(movement_type);
CREATE INDEX idx_inventory_movements_unit_id ON inventory_movements(unit_id);
```

---

## 🔧 Fase 3: Estructura de Módulos en OpsFlow

### 3.1 Nuevo Módulo: InventoryManagement

**Ubicación**: `components/InventoryManagement.tsx`

**Funcionalidades principales:**
- Lista de productos (catálogo)
- Búsqueda y filtrado de productos
- Crear/editar/eliminar productos
- Gestión de stock
- Ver movimientos de inventario
- Gestión de órdenes de compra
- Aprobar/rechazar solicitudes de materiales

### 3.2 Integración en Navegación

**Agregar al sidebar:**
- Nuevo botón "Inventario" con icono `Package`
- Nueva vista `'inventory'` en `currentView`
- Permisos: `INVENTORY_MANAGEMENT` en sistema de permisos

### 3.3 Extender el tipo `ClientRequest`

```typescript
// En types.ts
export interface ClientRequest {
  // ... campos existentes
  materialRequests?: MaterialRequest[]; // Nuevo campo
}

export interface MaterialRequest {
  id: string;
  sku: string;
  materialName: string;
  quantity: number;
  unitOfMeasure: string;
  description?: string;
  status: 'pending' | 'approved' | 'rejected' | 'ordered' | 'delivered' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
}
```

### 3.4 Crear Servicios

**services/inventoryProductsService.ts:**
- CRUD de productos
- Búsqueda de productos por SKU/nombre
- Actualización de stock

**services/materialRequestsService.ts:**
- Crear solicitudes de materiales
- Obtener solicitudes por unidad/requerimiento
- Actualizar estado de solicitudes
- Aprobar/rechazar solicitudes

**services/purchaseOrdersService.ts:**
- CRUD de órdenes de compra
- Crear orden desde solicitudes aprobadas
- Registrar recepción de materiales
- Actualizar stock al recibir

```typescript
// services/materialRequestsService.ts
- getProductsBySku(sku: string)
- searchProducts(query: string)
- createMaterialRequest(request: MaterialRequest, opsflowRequestId: string)
- getMaterialRequestsByOpsflowRequest(opsflowRequestId: string)
- updateMaterialRequestStatus(id: string, status: string, metadata?: any)
```

### 3.5 Modificar Modal de Requerimientos

**En `UnitDetail.tsx`:**
- Agregar sección "Solicitud de Materiales" cuando `category === 'LOGISTICS'`
- Buscador de SKUs con autocompletado
- Lista de materiales a solicitar (múltiples SKUs por requerimiento)
- Mostrar estado de cada solicitud de material

---

## 🔧 Fase 4: Migración del Código de Appinventario

### 4.1 Análisis del Código de Appinventario

**Pasos:**
1. Revisar estructura de componentes de Appinventario
2. Identificar servicios y lógica de negocio
3. Identificar tipos/interfaces
4. Identificar dependencias externas

### 4.2 Estrategia de Migración

**Opción A: Migración Directa (Recomendada)**
- Copiar componentes relevantes a `components/InventoryManagement/`
- Adaptar servicios a estructura de OpsFlow
- Integrar con sistema de permisos existente
- Adaptar estilos a diseño de OpsFlow

**Opción B: Reescritura Incremental**
- Recrear funcionalidades una por una
- Más control sobre el código
- Más tiempo pero mejor integración

### 4.3 Componentes a Migrar/Adaptar

**Desde Appinventario:**
- Lista de productos
- Formulario de producto
- Gestión de stock
- Órdenes de compra
- Recepción de materiales
- Reportes de inventario

**Adaptaciones necesarias:**
- Usar servicios de Supabase de OpsFlow
- Integrar con sistema de permisos
- Adaptar UI a diseño de OpsFlow
- Conectar con sistema de unidades

---

## 📝 Fase 5: Flujo de Trabajo

### 5.1 Creación de Solicitud de Materiales

1. Usuario en OpsFlow crea requerimiento tipo LOGISTICS
2. Selecciona "Solicitar Materiales"
3. Busca SKU en catálogo de inventario (integrado)
4. Agrega cantidad y descripción
5. Guarda el requerimiento
6. **Automático**: Se crea registro en `material_requests` con `status = 'pending'`
7. **Automático**: Se crea/actualiza relación con `client_requests`

### 5.2 Gestión de Solicitudes (Módulo Inventario)

1. Equipo de Compras accede al módulo "Inventario" → "Solicitudes Pendientes"
2. Ve lista de solicitudes desde unidades
3. Revisa detalles (unidad, SKU, cantidad, prioridad)
4. Toma acción:
   - **Aprobar**: Cambia `status = 'approved'`, puede crear orden de compra
   - **Rechazar**: Cambia `status = 'rejected'`, agrega `rejected_reason`
5. Si se crea orden: actualiza `order_number` y `status = 'ordered'`
6. Cuando llega material: actualiza `status = 'delivered'` y `delivery_date`

### 5.3 Actualización de Estados

1. Estado se actualiza directamente en la base de datos
2. OpsFlow muestra estado actualizado en tiempo real (Supabase Realtime)
3. Usuario ve estado actualizado en el requerimiento
4. Notificaciones automáticas cuando cambia el estado

---

## 🚀 Fase 6: Implementación Paso a Paso

### Paso 1: Preparación de Base de Datos
- [ ] Crear tabla `inventory_products`
- [ ] Crear tabla `material_requests`
- [ ] Crear tabla `purchase_orders`
- [ ] Crear tabla `purchase_order_items`
- [ ] Crear tabla `inventory_movements`
- [ ] Crear índices necesarios
- [ ] Configurar permisos/RLS si es necesario
- [ ] Migrar datos de Appinventario (si existen)

### Paso 2: Servicios en OpsFlow
- [ ] Crear `inventoryProductsService.ts` (CRUD productos)
- [ ] Crear `materialRequestsService.ts` (solicitudes)
- [ ] Crear `purchaseOrdersService.ts` (órdenes de compra)
- [ ] Crear `inventoryMovementsService.ts` (movimientos)

### Paso 3: Componente Principal de Inventario
- [ ] Crear `components/InventoryManagement.tsx`
- [ ] Implementar vista de catálogo de productos
- [ ] Implementar CRUD de productos
- [ ] Implementar gestión de stock
- [ ] Implementar vista de solicitudes pendientes
- [ ] Implementar gestión de órdenes de compra

### Paso 4: Integración en Modal de Requerimientos
- [ ] Modificar modal de requerimientos en `UnitDetail.tsx`
- [ ] Agregar sección "Solicitar Materiales" cuando `category === 'LOGISTICS'`
- [ ] Implementar buscador de SKUs con autocompletado
- [ ] Agregar lista de materiales a solicitar
- [ ] Mostrar estados de solicitudes en el requerimiento

### Paso 5: Navegación y Permisos
- [ ] Agregar `'inventory'` al tipo `currentView`
- [ ] Agregar botón "Inventario" al sidebar
- [ ] Agregar `INVENTORY_MANAGEMENT` a `AppFeature`
- [ ] Configurar permisos por rol
- [ ] Agregar ruta en el renderizado de vistas

### Paso 6: Migración de Código de Appinventario
- [ ] Revisar código de Appinventario
- [ ] Identificar componentes reutilizables
- [ ] Adaptar componentes a estructura de OpsFlow
- [ ] Integrar con servicios de Supabase
- [ ] Adaptar estilos a diseño de OpsFlow

### Paso 7: Testing
- [ ] Probar creación de producto
- [ ] Probar creación de solicitud desde requerimiento
- [ ] Probar aprobación/rechazo de solicitudes
- [ ] Probar creación de orden de compra
- [ ] Probar recepción de materiales
- [ ] Probar actualización de stock
- [ ] Probar permisos por rol

---

## 🔐 Consideraciones de Seguridad

1. **Autenticación**: Ambas apps deben validar que el usuario tiene permisos
2. **Validación**: Validar que los SKUs existen antes de crear solicitudes
3. **Auditoría**: Registrar quién creó/modificó cada solicitud
4. **Permisos**: Solo usuarios autorizados pueden aprobar/rechazar en Appinventario

---

## 📊 Consideraciones Técnicas

### Sincronización en Tiempo Real
- Usar Supabase Realtime para notificaciones instantáneas
- O usar polling cada X segundos si Realtime no está disponible

### Manejo de Errores
- Si Appinventario no está disponible, guardar solicitud localmente
- Reintentar sincronización cuando Appinventario vuelva
- Mostrar estado "Pendiente de sincronización"

### Performance
- Cachear catálogo de productos en OpsFlow
- Actualizar cache periódicamente
- Usar paginación en búsquedas de productos

---

## 📦 Estructura de Archivos Propuesta

```
components/
  InventoryManagement/
    ├── InventoryManagement.tsx (Componente principal)
    ├── ProductCatalog.tsx (Lista de productos)
    ├── ProductForm.tsx (Crear/editar producto)
    ├── MaterialRequests.tsx (Solicitudes pendientes)
    ├── PurchaseOrders.tsx (Órdenes de compra)
    ├── StockMovements.tsx (Movimientos de inventario)
    └── InventoryReports.tsx (Reportes)

services/
  ├── inventoryProductsService.ts
  ├── materialRequestsService.ts
  ├── purchaseOrdersService.ts
  └── inventoryMovementsService.ts

types.ts
  ├── InventoryProduct (nuevo)
  ├── MaterialRequest (nuevo)
  ├── PurchaseOrder (nuevo)
  └── InventoryMovement (nuevo)
```

## ❓ Preguntas para Definir

1. **¿Appinventario ya tiene datos en producción?**
   - Si SÍ → Necesitamos plan de migración de datos
   - Si NO → Empezamos desde cero

2. **¿Qué funcionalidades tiene Appinventario actualmente?**
   - Catálogo de productos
   - Gestión de stock
   - Órdenes de compra
   - Proveedores
   - Reportes
   - etc.

3. **¿Qué información adicional necesita el módulo de inventario?**
   - Presupuesto asignado
   - Fecha límite de entrega
   - Contacto de la unidad
   - Múltiples almacenes
   - etc.

4. **¿Necesita notificaciones en tiempo real?**
   - Si SÍ → Implementar Supabase Realtime
   - Si NO → Actualización manual/on-demand

---

## 🎯 Próximos Pasos Inmediatos

1. **Revisar código de Appinventario**
   - Ver estructura de componentes
   - Ver servicios y lógica de negocio
   - Ver tipos/interfaces
   - Identificar funcionalidades clave

2. **Crear migraciones de base de datos**
   - Tabla `inventory_products`
   - Tabla `material_requests`
   - Tablas de órdenes de compra
   - Tablas de movimientos

3. **Crear servicios base en OpsFlow**
   - `inventoryProductsService.ts`
   - `materialRequestsService.ts`

4. **Crear componente principal de Inventario**
   - `InventoryManagement.tsx` con estructura básica

5. **Integrar en navegación**
   - Agregar al sidebar
   - Agregar permisos
   - Agregar ruta

6. **Modificar modal de requerimientos**
   - Agregar sección de materiales
   - Implementar buscador de SKUs

---

## 💡 Recomendación de Orden de Implementación

1. **Fase 1: Base de Datos** (1-2 días)
   - Crear todas las tablas
   - Migrar datos si existen

2. **Fase 2: Servicios** (2-3 días)
   - Crear todos los servicios
   - Implementar CRUD básico

3. **Fase 3: Componente Principal** (3-4 días)
   - Crear `InventoryManagement.tsx`
   - Implementar catálogo de productos
   - Implementar CRUD de productos

4. **Fase 4: Solicitudes de Materiales** (2-3 días)
   - Modificar modal de requerimientos
   - Implementar buscador de SKUs
   - Implementar creación de solicitudes

5. **Fase 5: Gestión de Solicitudes** (2-3 días)
   - Vista de solicitudes pendientes
   - Aprobar/rechazar
   - Crear órdenes de compra

6. **Fase 6: Órdenes y Recepción** (2-3 días)
   - Gestión de órdenes de compra
   - Recepción de materiales
   - Actualización de stock

7. **Fase 7: Migración de Código** (3-5 días)
   - Revisar y adaptar código de Appinventario
   - Integrar funcionalidades adicionales
   - Testing completo

**Total estimado: 15-23 días de desarrollo**

¿Quieres que comience con alguna fase específica? Puedo empezar creando las migraciones de base de datos y los servicios base.

