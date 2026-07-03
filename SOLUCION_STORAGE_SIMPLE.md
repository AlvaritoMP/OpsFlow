# Solución Simple para Subir Fotos - Sin RLS Complejo

## El Problema
Supabase Storage requiere políticas RLS, pero no puedes crearlas con SQL porque `storage.objects` es una tabla del sistema.

## La Solución Más Simple

### Opción 1: Usar un bucket existente (SI YA TIENES UNO)
Si en Opalopy ya tienes un bucket configurado, puedes usar ese mismo bucket aquí:

1. Ve a `services/storageService.ts`
2. Cambia el nombre del bucket de `'night-supervision-photos'` al nombre del bucket que usas en Opalopy
3. Listo - debería funcionar sin configurar nada más

### Opción 2: Crear políticas a través de la interfaz web (5 minutos)

**PASO 1: Ve a Storage Policies**
1. Abre Supabase Dashboard
2. Ve a **Storage** (menú lateral)
3. Haz clic en el bucket `night-supervision-photos`
4. Busca la pestaña **"Policies"** o **"Security"**

**PASO 2: Crea la política de INSERT (la más importante)**
1. Haz clic en **"New Policy"** o **"Create Policy"**
2. Configura así:
   - **Policy name:** `Allow authenticated uploads`
   - **Allowed operation:** Selecciona **INSERT**
   - **Target roles:** Selecciona **authenticated**
   - **Policy definition:** 
     - En **WITH CHECK expression**, escribe: `bucket_id = 'night-supervision-photos'`
   - Haz clic en **"Save"** o **"Create"**

**PASO 3: Crea la política de SELECT (para leer)**
1. Haz clic en **"New Policy"** nuevamente
2. Configura así:
   - **Policy name:** `Allow public read`
   - **Allowed operation:** Selecciona **SELECT**
   - **Target roles:** Selecciona **public**
   - **Policy definition:**
     - En **USING expression**, escribe: `bucket_id = 'night-supervision-photos'`
   - Haz clic en **"Save"**

**PASO 4: Prueba**
- Intenta subir una foto desde la aplicación
- Debería funcionar ahora

### Opción 3: Política Ultra Permisiva (Si las anteriores no funcionan)

Si las políticas específicas no funcionan, crea una política que permita TODO:

1. Ve a Storage → Policies del bucket
2. Crea una política:
   - **Name:** `Allow all authenticated`
   - **Operation:** **INSERT**
   - **Roles:** **authenticated**
   - **WITH CHECK:** `true` (literalmente escribe `true`)
3. Guarda

Esto permitirá a cualquier usuario autenticado subir archivos a cualquier bucket. No es lo más seguro, pero funciona.

## ¿Por qué Opalopy funciona sin esto?

Probablemente en Opalopy:
- Ya tienen un bucket con políticas configuradas
- O tienen políticas permisivas que permiten todo a usuarios autenticados
- O el bucket fue creado antes de que Supabase implementara RLS estricto

## Recomendación

**Usa la Opción 1** si tienes un bucket en Opalopy - es la más rápida.
Si no, **usa la Opción 2** - solo necesitas crear 2 políticas (INSERT y SELECT) y toma 5 minutos.

