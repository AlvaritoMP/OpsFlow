// Script para proteger el index.html compilado después del build
import { readFileSync, writeFileSync, existsSync, unlinkSync, copyFileSync } from 'fs';
import { join } from 'path';

const distIndexPath = join(process.cwd(), 'dist', 'index.html');
const distIndexTsxPath = join(process.cwd(), 'dist', 'index.tsx');
const sourceIndexPath = join(process.cwd(), 'index.html');

if (existsSync(distIndexPath)) {
  let distContent = readFileSync(distIndexPath, 'utf-8');
  
  // Verificar que el index.html compilado tiene la referencia correcta al JS
  if (distContent.includes('/assets/main-') && distContent.includes('.js')) {
    console.log('✓ dist/index.html está correcto');
    
    // Eliminar index.tsx si existe en dist (no debería estar ahí)
    if (existsSync(distIndexTsxPath)) {
      console.log('⚠ Eliminando index.tsx de dist/ (no debería estar ahí)');
      unlinkSync(distIndexTsxPath);
    }
    
    // Verificar que el index.html fuente no se haya copiado sobre el compilado
    const sourceContent = readFileSync(sourceIndexPath, 'utf-8');
    if (sourceContent.includes('/index.tsx') && distContent.includes('/index.tsx')) {
      console.error('✗ ERROR: El index.html fuente se ha copiado sobre el compilado!');
      console.error('  El index.html compilado debería tener /assets/main-*.js, no /index.tsx');
      process.exit(1);
    }
    
    // Asegurarse de que el index.html compilado NO tenga la referencia a /index.tsx
    if (distContent.includes('/index.tsx')) {
      console.error('✗ ERROR: El index.html compilado tiene referencia a /index.tsx!');
      console.error('  Esto no debería suceder. El build de Vite debería haberlo reemplazado.');
      process.exit(1);
    }
    
    console.log('✓ dist/index.html está protegido y listo para producción');
  } else {
    console.error('✗ dist/index.html NO tiene la referencia correcta al JS compilado!');
    console.error('  Debería contener /assets/main-*.js');
    process.exit(1);
  }
} else {
  console.error('✗ dist/index.html NO existe después del build!');
  process.exit(1);
}
