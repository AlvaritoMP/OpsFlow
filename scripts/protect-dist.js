// Script para proteger el index.html compilado después del build
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const distDir = join(process.cwd(), 'dist');
const distIndexPath = join(distDir, 'index.html');
const sourceIndexPath = join(process.cwd(), 'index.html');

console.log('🔍 Verificando dist/ después del build...');
console.log('📁 Directorio dist:', distDir);
console.log('📄 Archivo index.html compilado:', distIndexPath);

// Verificar que dist/index.html existe
if (!existsSync(distIndexPath)) {
  console.error('✗ ERROR: dist/index.html NO existe después del build!');
  process.exit(1);
}

// Leer el contenido del index.html compilado
let distContent = readFileSync(distIndexPath, 'utf-8');
console.log('📝 Contenido del index.html compilado (primeros 500 caracteres):');
console.log(distContent.substring(0, 500));

// CRÍTICO: Si el index.html tiene referencia a /index.tsx, corregirlo automáticamente
if (distContent.includes('/index.tsx')) {
  console.log('⚠ ADVERTENCIA: El index.html compilado tiene referencia a /index.tsx!');
  console.log('  Esto indica que el index.html fuente se copió sobre el compilado.');
  console.log('  Corrigiendo automáticamente...');
  
  // Buscar el archivo JS compilado en dist/assets/
  const assetsDir = join(distDir, 'assets');
  if (existsSync(assetsDir)) {
    const assetsFiles = readdirSync(assetsDir);
    console.log('📦 Archivos en dist/assets/:', assetsFiles);
    const jsFile = assetsFiles.find(f => f.startsWith('main-') && f.endsWith('.js'));
    const cssFile = assetsFiles.find(f => f.startsWith('main-') && f.endsWith('.css'));
    
    if (jsFile) {
      console.log(`✓ Encontrado archivo JS compilado: ${jsFile}`);
      
      // Reemplazar TODAS las referencias a /index.tsx con la referencia correcta al JS compilado
      distContent = distContent.replace(
        /<script[^>]*src=["']\/index\.tsx["'][^>]*><\/script>/gi,
        `<script type="module" crossorigin src="/assets/${jsFile}"></script>`
      );
      
      // Si no hay referencia al CSS, agregarla
      if (cssFile && !distContent.includes(cssFile)) {
        const headMatch = distContent.match(/<head[^>]*>/i);
        if (headMatch) {
          distContent = distContent.replace(
            headMatch[0],
            `${headMatch[0]}\n    <link rel="stylesheet" crossorigin href="/assets/${cssFile}">`
          );
        }
      }
      
      // Guardar el archivo corregido
      writeFileSync(distIndexPath, distContent, 'utf-8');
      console.log('✅ index.html corregido automáticamente');
      console.log('📝 Contenido corregido (primeros 500 caracteres):');
      console.log(distContent.substring(0, 500));
    } else {
      console.error('✗ No se encontró el archivo JS compilado en dist/assets/');
      console.error('  Archivos disponibles:', assetsFiles);
      process.exit(1);
    }
  } else {
    console.error('✗ No existe el directorio dist/assets/');
    process.exit(1);
  }
}

// Verificar que el index.html compilado tiene la referencia correcta al JS
if (!distContent.includes('/assets/main-') || !distContent.includes('.js')) {
  console.error('✗ ERROR: dist/index.html NO tiene la referencia correcta al JS compilado!');
  console.error('  Debería contener /assets/main-*.js');
  console.error('  Contenido actual:', distContent.substring(0, 500));
  process.exit(1);
}

console.log('✓ dist/index.html tiene la referencia correcta al JS compilado');

// CRÍTICO: Eliminar TODOS los archivos .tsx de dist/ (incluyendo subdirectorios)
console.log('🔍 Buscando archivos .tsx en dist/ (recursivo)...');
function findTsxFiles(dir) {
  const files = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findTsxFiles(fullPath));
      } else if (entry.name.endsWith('.tsx')) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // Ignorar errores de lectura
  }
  return files;
}

const tsxFiles = findTsxFiles(distDir);
if (tsxFiles.length > 0) {
  console.log(`⚠ Encontrados ${tsxFiles.length} archivo(s) .tsx en dist/:`);
  tsxFiles.forEach(file => {
    const relativePath = file.replace(distDir + '/', '');
    console.log(`  - ${relativePath}`);
    try {
      unlinkSync(file);
      console.log(`  ✓ Eliminado: ${relativePath}`);
    } catch (err) {
      console.error(`  ✗ Error al eliminar ${relativePath}:`, err.message);
    }
  });
  console.log('✓ Todos los archivos .tsx eliminados de dist/');
} else {
  console.log('✓ No se encontraron archivos .tsx en dist/');
}

// Verificar que el index.html compilado NO tenga la referencia a /index.tsx (después de la corrección)
distContent = readFileSync(distIndexPath, 'utf-8');
if (distContent.includes('/index.tsx')) {
  console.error('✗ ERROR: El index.html compilado AÚN tiene referencia a /index.tsx después de la corrección!');
  console.error('  Esto no debería suceder.');
  console.error('  Contenido actual:', distContent);
  process.exit(1);
}

// CRÍTICO: Hacer una copia de seguridad del index.html compilado para evitar que se sobrescriba
const backupPath = join(distDir, 'index.html.backup');
writeFileSync(backupPath, distContent, 'utf-8');
console.log('✓ Copia de seguridad del index.html compilado creada');

// Verificar que el index.html fuente no se haya copiado sobre el compilado
const sourceContent = readFileSync(sourceIndexPath, 'utf-8');
if (sourceContent.includes('/index.tsx') && distContent.includes('/index.tsx')) {
  console.error('✗ ERROR: El index.html fuente se ha copiado sobre el compilado!');
  console.error('  Restaurando desde la copia de seguridad...');
  if (existsSync(backupPath)) {
    const backupContent = readFileSync(backupPath, 'utf-8');
    writeFileSync(distIndexPath, backupContent, 'utf-8');
    console.log('✓ index.html restaurado desde la copia de seguridad');
  } else {
    console.error('✗ No se encontró la copia de seguridad!');
    process.exit(1);
  }
}

console.log('✅ dist/index.html está protegido y listo para producción');
console.log('✅ No hay archivos .tsx en dist/');
console.log('✅ El index.html compilado NO tiene referencia a /index.tsx');
