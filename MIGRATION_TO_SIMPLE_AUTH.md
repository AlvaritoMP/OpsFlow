# Migración a Autenticación Simple (Sin Supabase Auth)

## Resumen

Se ha migrado el sistema de autenticación de Supabase Auth a un sistema simple basado en la tabla `users` con passwords hasheados, similar a la otra app del usuario.

## Cambios Realizados

### 1. Nuevo Sistema de Autenticación

- **Eliminado**: Dependencia de Supabase Auth (`supabase.auth.signInWithPassword`, `supabase.auth.signUp`, etc.)
- **Implementado**: Autenticación simple basada en la tabla `users` con campo `password_hash`
- **Sesión**: Almacenada en `localStorage` en lugar de cookies/JWT de Supabase

### 2. Archivos Modificados

#### `utils/passwordHash.ts` (NUEVO)
- Funciones `hashPassword()` y `verifyPassword()` usando SHA-256
- Usa `crypto.subtle` nativo del navegador

#### `services/authService.ts` (REFACTORIZADO)
- Eliminadas todas las funciones de Supabase Auth
- Nuevas funciones:
  - `getSession()`: Obtiene sesión de localStorage
  - `getCurrentUser()`: Obtiene usuario actual desde la sesión
  - `signIn()`: Verifica email/password contra la tabla `users`
  - `signUp()`: Crea usuario directamente en la tabla `users` (solo admins)
  - `updatePassword()`: Actualiza `password_hash` directamente en la tabla
  - `isAuthenticated()`: Verifica si hay sesión activa

#### `services/usersService.ts`
- Actualizado `transformUserToDB()` para manejar `password_hash`
- Actualizado `transformUserFromDB()` para NO retornar `password_hash` (seguridad)
- Simplificado `create()` para no depender de Supabase Auth

#### `components/Login.tsx`
- Simplificado para usar el nuevo `authService.signIn()`
- Eliminada referencia a `updateUserRole()`

#### `App.tsx`
- Actualizado `useEffect` de autenticación para usar `getCurrentUser()`
- Eliminadas referencias a `updateUserRole()` y `onAuthStateChange()`
- Simplificado `handleLoginSuccess()`
- Actualizado `handleChangePassword()` para usar el nuevo sistema
- Actualizado `handleSaveUser()` para usar el nuevo `signUp()`

#### `types.ts`
- Actualizado interface `User`:
  - Eliminado: `temporaryPassword`
  - Agregado: `password?` (solo para crear/actualizar)
  - Agregado: `password_hash?` (solo para comparación interna)

### 3. Base de Datos

#### `database/add_password_hash.sql` (NUEVO)
- Script SQL para agregar columna `password_hash` a la tabla `users`
- Crea índice en `email` para búsquedas rápidas

**IMPORTANTE**: Ejecuta este script en Supabase antes de usar la nueva autenticación.

### 4. Archivos Eliminados (Opcional)

Los siguientes archivos ya no son necesarios pero pueden mantenerse como referencia:
- `supabase/functions/update-user-password/` (Edge Function ya no se usa)
- `DEPLOY_EDGE_FUNCTION.md`
- `SUPABASE_EDGE_FUNCTION_PASSWORD_RESET.md`

## Pasos para Completar la Migración

### 1. Ejecutar Script SQL

En Supabase Dashboard > SQL Editor, ejecuta:
```sql
-- Ver contenido de database/add_password_hash.sql
```

### 2. Migrar Usuarios Existentes

Los usuarios existentes necesitarán:
- Que un administrador les asigne una nueva contraseña desde la app, O
- Que cambien su contraseña desde el login (si implementas recuperación de contraseña)

### 3. Probar la Autenticación

1. Cerrar sesión si estás logueado
2. Intentar iniciar sesión con un usuario existente (fallará si no tiene `password_hash`)
3. Crear un nuevo usuario como administrador
4. Iniciar sesión con el nuevo usuario
5. Cambiar contraseña de otro usuario (como admin)

## Ventajas del Nuevo Sistema

1. **Simplicidad**: No depende de configuración compleja de Supabase Auth
2. **Control Total**: Tú controlas completamente el flujo de autenticación
3. **Sin Edge Functions**: No necesitas desplegar funciones en Supabase
4. **Sin Emails**: No requiere configuración de SMTP
5. **Consistencia**: Mismo estilo que tu otra app

## Consideraciones de Seguridad

- Las contraseñas se hashean con SHA-256 (suficiente para apps internas)
- El `password_hash` nunca se retorna al frontend
- Las sesiones expiran después de 30 días
- Solo administradores pueden crear usuarios y cambiar contraseñas de otros

## Notas

- Este sistema es adecuado para **apps internas** con pocos usuarios
- Para apps públicas, considera usar Supabase Auth o un sistema más robusto
- Las políticas RLS de Supabase siguen funcionando normalmente

