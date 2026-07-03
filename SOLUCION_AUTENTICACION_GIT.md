# 🔐 Solución: Autenticación de Git con GitHub

## Problema
Cursor ha perdido acceso a GitHub. Para usar Git con HTTPS, necesitas un **Personal Access Token**.

## Solución: Configurar Personal Access Token

### Paso 1: Crear un Personal Access Token en GitHub

1. Ve a: https://github.com/settings/tokens
2. Click en **"Generate new token"** → **"Generate new token (classic)"**
3. Configuración:
   - **Note:** `OpsFlow Development` (o el nombre que prefieras)
   - **Expiration:** Elige una fecha (ej: 90 días, 1 año)
   - **Select scopes:** Marca **`repo`** (esto incluye todos los permisos del repositorio)
     - `repo` permite: read, write, delete, etc.
4. Click en **"Generate token"** (al final de la página)
5. **⚠️ IMPORTANTE:** **COPIA EL TOKEN INMEDIATAMENTE** 
   - Se ve algo como: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Solo lo verás una vez - guárdalo en un lugar seguro

### Paso 2: Ejecutar el Script de Configuración

1. Abre el Explorador de Archivos
2. Ve a: `c:\Users\alvaro\.cursor\OpsFlow`
3. Haz **doble clic** en: `configurar-git-https.bat`
4. Sigue las instrucciones que aparezcan

### Paso 3: Usar el Token

Cuando Git te pida credenciales (al hacer pull/push):

1. **Usuario:** Tu nombre de usuario de GitHub
2. **Contraseña:** **PEGA EL TOKEN** (NO tu contraseña de GitHub)
   - Git pedirá "Password", pero debes pegar el token

### Paso 4: Verificar que Funciona

Después de configurar, ejecuta `pull-ultima-version.bat` nuevamente.

## Alternativa: GitHub CLI (Opcional)

Si prefieres una forma más sencilla, puedes instalar GitHub CLI:

1. Descarga: https://cli.github.com/
2. Instálalo
3. Ejecuta: `gh auth login`
4. Sigue las instrucciones

Luego Git usará automáticamente las credenciales de GitHub CLI.

## Guardar Credenciales (Opcional)

Si quieres que Git recuerde tus credenciales para no tener que escribirlas cada vez:

```cmd
git config --global credential.helper manager-core
```

Esto guardará las credenciales en el Administrador de Credenciales de Windows.

## Verificar Configuración

Para verificar que todo está bien:

```cmd
git remote -v
git config --global credential.helper
```

Deberías ver:
- `origin  https://github.com/AlvaritoMP/OpsFlow.git`
- `manager-core` (o el helper que configuraste)
