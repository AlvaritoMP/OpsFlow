# Servicios CRUD para Supabase

Este directorio contiene todos los servicios CRUD para interactuar con la base de datos de Supabase.

## Configuración

1. Crea un archivo `.env` en la raíz del proyecto con:
```env
VITE_SUPABASE_URL=https://rlnfehtgspnkyeevduli.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anon_aqui
```

## Servicios Disponibles

### `unitsService`
CRUD completo para unidades operativas.

```typescript
import { unitsService } from './services';

// Obtener todas las unidades
const units = await unitsService.getAll();

// Obtener una unidad por ID
const unit = await unitsService.getById('unit-id');

// Crear una nueva unidad
const newUnit = await unitsService.create({
  name: 'Nueva Unidad',
  clientName: 'Cliente ABC',
  address: 'Dirección 123',
  status: 'Activo',
  images: ['url1', 'url2'],
});

// Actualizar una unidad
await unitsService.update('unit-id', { name: 'Nombre Actualizado' });

// Eliminar una unidad
await unitsService.delete('unit-id');
```

### `resourcesService`
CRUD para recursos (personal, equipos, materiales).

```typescript
import { resourcesService } from './services';

// Obtener recursos de una unidad
const resources = await resourcesService.getByUnitId('unit-id');

// Crear un recurso
const resource = await resourcesService.create({
  name: 'Juan Perez',
  type: 'Personal',
  status: 'Activo',
}, 'unit-id');
```

### `usersService`
CRUD para usuarios del sistema.

```typescript
import { usersService } from './services';

// Obtener todos los usuarios
const users = await usersService.getAll();

// Crear un usuario
const user = await usersService.create({
  name: 'Nuevo Usuario',
  email: 'usuario@example.com',
  role: 'OPERATIONS',
  linkedClientNames: ['Cliente A', 'Cliente B'],
});
```

### `logsService`
CRUD para logs operativos.

```typescript
import { logsService } from './services';

// Obtener logs de una unidad
const logs = await logsService.getByUnitId('unit-id');

// Crear un log
const log = await logsService.create({
  date: '2023-12-01',
  type: 'Supervision',
  description: 'Inspección realizada',
  author: 'Supervisor',
  images: ['url1'],
}, 'unit-id');
```

### `requestsService`
CRUD para solicitudes de clientes.

```typescript
import { requestsService } from './services';

// Obtener solicitudes de una unidad
const requests = await requestsService.getByUnitId('unit-id');

// Crear una solicitud
const request = await requestsService.create({
  date: '2023-12-01',
  category: 'LOGISTICS',
  priority: 'HIGH',
  status: 'PENDING',
  description: 'Necesito más material',
  author: 'Cliente',
}, 'unit-id');

// Agregar un comentario
await requestsService.addComment('request-id', {
  id: 'comment-id',
  author: 'Admin',
  role: 'ADMIN',
  date: new Date().toISOString(),
  text: 'Comentario de respuesta',
});
```

### `zonesService`
CRUD para zonas dentro de unidades.

```typescript
import { zonesService } from './services';

// Obtener zonas de una unidad
const zones = await zonesService.getByUnitId('unit-id');

// Crear una zona
const zone = await zonesService.create({
  name: 'Lobby',
  shifts: ['Diurno', 'Nocturno'],
  area: 120,
  layout: { x: 1, y: 1, w: 4, h: 3, color: '#dbeafe' },
}, 'unit-id');
```

### `managementStaffService`
CRUD para personal de gestión.

```typescript
import { managementStaffService } from './services';

// Obtener todo el personal
const staff = await managementStaffService.getAll();

// Crear un miembro del staff
const member = await managementStaffService.create({
  name: 'Roberto Gomez',
  role: 'COORDINATOR',
  email: 'roberto@example.com',
  phone: '+51 999 111 222',
});
```

## Manejo de Errores

Todos los servicios manejan errores automáticamente y lanzan excepciones descriptivas. Usa try-catch para manejarlos:

```typescript
try {
  const unit = await unitsService.getById('unit-id');
} catch (error) {
  console.error('Error al obtener unidad:', error);
  // Mostrar mensaje al usuario
}
```

## Autenticación

Los servicios usan el cliente de Supabase que maneja la autenticación automáticamente. Asegúrate de que el usuario esté autenticado antes de usar los servicios.

