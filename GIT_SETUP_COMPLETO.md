# Configuración Completa de Git - Migración a Google Maps

## 🔧 Configuración del Repositorio Remoto

He configurado el remoto correctamente. Ahora ejecuta estos comandos **uno por uno** en tu terminal PowerShell o Git Bash:

### Paso 1: Verificar y Configurar el Remoto
```bash
git remote -v
```
Si no ves `git@github.com:AlvaritoMP/OpsFlow.git`, ejecuta:
```bash
git remote set-url origin git@github.com:AlvaritoMP/OpsFlow.git
git remote -v
```

### Paso 2: Verificar la Rama Actual
```bash
git branch
```
o
```bash
git branch --show-current
```
Anota el nombre de la rama (puede ser `main`, `master`, u otra).

### Paso 3: Obtener la Última Versión
```bash
git fetch origin
```

Luego, dependiendo de tu rama:
```bash
# Si estás en main:
git pull origin main

# Si estás en master:
git pull origin master

# Si estás en otra rama (reemplaza NOMBRE_RAMA):
git pull origin NOMBRE_RAMA
```

### Paso 4: Verificar Estado
```bash
git status
```
Verás qué archivos están modificados o sin rastrear.

### Paso 5: Agregar Archivos
```bash
git add .
```

Verifica qué se agregó:
```bash
git status
```

### Paso 6: Hacer Commit
```bash
git commit -m "feat: Migración a Google Maps - Implementación completa con geocodificación y componente de mapa interactivo"
```

### Paso 7: Hacer Push
Dependiendo de tu rama (reemplaza según el resultado del Paso 2):

```bash
# Si estás en main:
git push origin main

# Si estás en master:
git push origin master

# Si estás en otra rama y es la primera vez:
git push -u origin NOMBRE_RAMA

# Si ya existe la rama remota:
git push origin NOMBRE_RAMA
```

### Paso 8: Verificar que se Subió
```bash
git log --oneline -3
git status
```

## 📋 Archivos que Deberían Estar en el Commit

### Nuevos:
- `components/UnitsMap.tsx`
- `services/geocodingService.ts`
- `GOOGLE_MAPS_SETUP.md`
- `VERIFICACION_GOOGLE_MAPS.md`
- `scripts/verificar-y-subir-git.ps1`
- `GIT_STATUS_VERIFICATION.md`
- `COMANDOS_GIT_MANUAL.md`
- `GIT_SETUP_COMPLETO.md` (este archivo)

### Modificados:
- `components/Dashboard.tsx`
- `package.json` (con la dependencia `@vis.gl/react-google-maps`)
- `ENV_VARIABLES.md`

## ⚠️ Si Encuentras Errores

### Error: "fatal: 'main' does not appear to be a git repository"
**Causa:** Estás usando el comando incorrecto.

**Incorrecto:** `git push main`  
**Correcto:** `git push origin main`

### Error: "Permission denied (publickey)"
**Solución:** Necesitas configurar SSH keys con GitHub:
1. Genera una clave SSH si no la tienes: `ssh-keygen -t ed25519 -C "tu_email@example.com"`
2. Agrega la clave a ssh-agent: `ssh-add ~/.ssh/id_ed25519`
3. Copia la clave pública: `cat ~/.ssh/id_ed25519.pub`
4. Agrega la clave en GitHub: Settings > SSH and GPG keys > New SSH key

**Alternativa:** Usa HTTPS en lugar de SSH:
```bash
git remote set-url origin https://github.com/AlvaritoMP/OpsFlow.git
```

### Error: "Updates were rejected"
**Solución:** Primero haz pull y luego push:
```bash
git pull origin main  # o master
git push origin main  # o master
```

## ✅ Verificación Final

Después de hacer push, verifica en GitHub:
1. Ve a https://github.com/AlvaritoMP/OpsFlow
2. Verifica que los archivos nuevos aparezcan
3. Verifica que el commit más reciente sea el de "Migración a Google Maps"
