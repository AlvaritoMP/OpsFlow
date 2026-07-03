# Comandos para Verificar y Subir Cambios

Ejecuta estos comandos en tu terminal para verificar el estado y subir los cambios:

## 1. Verificar Estado Actual
```bash
git status
```

## 2. Ver Archivos No Rastreados
```bash
git status --untracked-files=all
```

## 3. Agregar Todos los Archivos
```bash
git add .
```

## 4. Verificar Qué se Va a Commitear
```bash
git status
```

## 5. Hacer Commit
```bash
git commit -m "feat: Migración a Google Maps - Implementación completa con geocodificación y componente de mapa interactivo"
```

## 6. Ver la Rama Actual
```bash
git branch
```

## 7. Hacer Push (ajusta según tu rama)
```bash
# Si estás en main:
git push origin main

# Si estás en master:
git push origin master

# O para cualquier rama:
git push -u origin HEAD
```

## 8. Verificar que se Subió Correctamente
```bash
git log --oneline -3
git status
```

## Si hay Problemas

Si el push falla, intenta:
```bash
git pull origin main  # o master
git push origin main  # o master
```
