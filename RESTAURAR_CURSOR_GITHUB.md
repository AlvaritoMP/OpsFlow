# 🔧 Restaurar Conexión de Cursor con GitHub

## Problema
Cursor perdió acceso al repositorio de GitHub. Necesitamos restaurar la conexión.

## Solución Paso a Paso

### Paso 1: Ejecutar Script de Configuración

1. Haz **doble clic** en: `restaurar-conexion-cursor.bat`
2. Este script configurará Git correctamente

### Paso 2: Configurar Personal Access Token en GitHub

Si no tienes un token o expiró:

1. Ve a: **https://github.com/settings/tokens**
2. Click en **"Generate new token"** → **"Generate new token (classic)"**
3. Configuración:
   - **Note:** `Cursor OpsFlow`
   - **Expiration:** 90 días o 1 año
   - **Select scopes:** Marca **`repo`** (todos los permisos)
4. Click en **"Generate token"**
5. **⚠️ COPIA EL TOKEN INMEDIATAMENTE** (solo lo verás una vez)
   - Se ve como: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Paso 3: Hacer Pull desde Cursor

**Opción A: Usando la Terminal Integrada de Cursor**

1. En Cursor, abre la terminal integrada (`` Ctrl+` `` o View → Terminal)
2. Ejecuta:
   ```bash
   git pull origin main
   ```
3. Cuando pida credenciales:
   - **Username:** tu_usuario_de_github
   - **Password:** pega el Personal Access Token (NO tu contraseña)

**Opción B: Usando Command Palette**

1. Presiona `Ctrl+Shift+P` (o View → Command Palette)
2. Escribe: `Git: Pull`
3. Selecciona la opción
4. Cuando pida credenciales, ingresa usuario y token

### Paso 4: Verificar que Funcionó

Después del pull exitoso:

1. En Cursor, abre la terminal integrada
2. Ejecuta: `git status`
3. Deberías ver que estás sincronizado con origin/main

## Si Sigue Sin Funcionar

### Verificar Configuración en Cursor

1. En Cursor: File → Preferences → Settings
2. Busca: "git"
3. Verifica que:
   - `git.enabled` esté en `true`
   - `git.path` apunte a tu instalación de Git

### Verificar Credenciales en Windows

1. Abre: **Panel de Control → Credenciales de Windows**
2. Busca credenciales de `git:https://github.com`
3. Si hay una antigua, elimínala
4. Git pedirá credenciales nuevas en el próximo pull

### Usar GitHub CLI (Alternativa)

Si prefieres una solución más robusta:

1. Instala GitHub CLI: https://cli.github.com/
2. Ejecuta: `gh auth login`
3. Sigue las instrucciones
4. Cursor usará automáticamente las credenciales de GitHub CLI

## Configuración Actual

Después de ejecutar el script, Git estará configurado con:
- ✅ Remoto: `https://github.com/AlvaritoMP/OpsFlow.git`
- ✅ Credential Helper: `manager-core` (Windows Credential Manager)
- ✅ Listo para autenticarse con Personal Access Token

## Después del Pull Exitoso

Una vez que Cursor pueda hacer pull:
1. Integraremos tus cambios locales con la última versión
2. Resolveremos cualquier conflicto
3. Haremos commit y push de todo
