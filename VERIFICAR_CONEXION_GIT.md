# Verificación de Conexión Git

Por favor, ejecuta estos comandos en tu terminal para verificar la conexión:

## Comandos de Verificación (Ejecuta en orden):

### 1. Verificar que es un repositorio git:
```bash
git rev-parse --git-dir
```
**Resultado esperado:** Debe mostrar `.git` o la ruta del directorio git

### 2. Verificar remoto configurado:
```bash
git remote -v
```
**Resultado esperado:** Debe mostrar:
```
origin  git@github.com:AlvaritoMP/OpsFlow.git (fetch)
origin  git@github.com:AlvaritoMP/OpsFlow.git (push)
```

### 3. Verificar URL del remoto:
```bash
git remote get-url origin
```
**Resultado esperado:** `git@github.com:AlvaritoMP/OpsFlow.git`

### 4. Probar conexión al remoto:
```bash
git ls-remote --heads origin
```
**Resultado esperado:** Debe mostrar las ramas remotas (main, master, etc.)

### 5. Ver información del remoto:
```bash
git remote show origin
```
**Resultado esperado:** Información sobre el remoto, ramas, etc.

### 6. Ver estado del repositorio:
```bash
git status
```

### 7. Ver rama actual:
```bash
git branch -vv
```
**Nota:** La `-vv` muestra también la rama remota de tracking

## Si el remoto NO está configurado:

Ejecuta:
```bash
git remote add origin git@github.com:AlvaritoMP/OpsFlow.git
```

O si ya existe pero está mal configurado:
```bash
git remote set-url origin git@github.com:AlvaritoMP/OpsFlow.git
```

## Si hay problemas de conexión SSH:

Si `git ls-remote` falla con error de SSH, prueba con HTTPS:
```bash
git remote set-url origin https://github.com/AlvaritoMP/OpsFlow.git
```

Luego verifica:
```bash
git remote -v
git ls-remote --heads origin
```
