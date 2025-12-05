// Script para proteger el index.html compilado después del build
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';

const distDir = join(process.cwd(), 'dist');
const distIndexPath = join(distDir, 'index.html');
const distIndexTsxPath = join(distDir, 'index.tsx');
const sourceIndexPath = join(process.cwd(), 'index.html');

console.log('🔍 Verificando dist/ después del build...');

// Verificar que dist/index.html existe
if (!existsSync(distIndexPath)) {
  console.error('✗ ERROR: dist/index.html NO existe después del build!');
  process.exit(1);
}

// Leer el contenido del index.html compilado
let distContent = readFileSync(distIndexPath, 'utf-8');

// CRÍTICO: Si el index.html tiene referencia a /index.tsx, corregirlo automáticamente
if (distContent.includes('/index.tsx')) {
  console.log('⚠ ADVERTENCIA: El index.html compilado tiene referencia a /index.tsx!');
  console.log('  Esto indica que el index.html fuente se copió sobre el compilado.');
  console.log('  Corrigiendo automáticamente...');
  
  // Buscar el archivo JS compilado en dist/assets/
  const assetsDir = join(distDir, 'assets');
  if (existsSync(assetsDir)) {
    const assetsFiles = readdirSync(assetsDir);
    const jsFile = assetsFiles.find(f => f.startsWith('main-') && f.endsWith('.js'));
    const cssFile = assetsFiles.find(f => f.startsWith('main-') && f.endsWith('.css'));
    
    if (jsFile) {
      console.log(`✓ Encontrado archivo JS compilado: ${jsFile}`);
      
      // Reemplazar la referencia a /index.tsx con la referencia correcta al JS compilado
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
    } else {
      console.error('✗ No se encontró el archivo JS compilado en dist/assets/');
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

// Eliminar index.tsx si existe en dist (no debería estar ahí)
if (existsSync(distIndexTsxPath)) {
  console.log('⚠ Eliminando index.tsx de dist/ (no debería estar ahí)');
  unlinkSync(distIndexTsxPath);
  console.log('✓ index.tsx eliminado de dist/');
}

// Listar todos los archivos .tsx en dist/ y eliminarlos
console.log('🔍 Buscando archivos .tsx en dist/...');
const distFiles = readdirSync(distDir);
const tsxFiles = distFiles.filter(f => f.endsWith('.tsx'));
if (tsxFiles.length > 0) {
  console.log(`⚠ Encontrados ${tsxFiles.length} archivo(s) .tsx en dist/:`, tsxFiles);
  tsxFiles.forEach(file => {
    const filePath = join(distDir, file);
    console.log(`  Eliminando ${file}...`);
    unlinkSync(filePath);
  });
  console.log('✓ Todos los archivos .tsx eliminados de dist/');
}

// Verificar que el index.html compilado NO tenga la referencia a /index.tsx (después de la corrección)
distContent = readFileSync(distIndexPath, 'utf-8');
if (distContent.includes('/index.tsx')) {
  console.error('✗ ERROR: El index.html compilado AÚN tiene referencia a /index.tsx después de la corrección!');
  console.error('  Esto no debería suceder.');
  process.exit(1);
}

console.log('✅ dist/index.html está protegido y listo para producción');
console.log('✅ No hay archivos .tsx en dist/');
console.log('✅ El index.html compilado NO tiene referencia a /index.tsx');
