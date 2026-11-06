import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      root: '.',
      server: {
        port: 3001,
        host: true, // Permite acceso desde cualquier IP (incluye localhost)
        strictPort: false, // Si el puerto está ocupado, usa el siguiente disponible
      },
      preview: {
        port: parseInt(process.env.PORT || '3000'),
        host: '0.0.0.0',
        strictPort: false,
      },
      plugins: [react()],
      optimizeDeps: {
        include: ['exceljs'],
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          // jspdf los importa solo para HTML/SVG. Los PDF de OpsFlow no usan eso,
          // y meter esas librerías alarga varios minutos la compilación en el VPS.
          html2canvas: path.resolve(__dirname, 'utils/jspdfOptionalStub.js'),
          canvg: path.resolve(__dirname, 'utils/jspdfOptionalStub.js'),
          dompurify: path.resolve(__dirname, 'utils/jspdfOptionalStub.js'),
        }
      },
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        reportCompressedSize: false,
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html')
          },
          output: {
            manualChunks(id) {
              if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'charts';
              if (id.includes('leaflet') || id.includes('@vis.gl')) return 'maps';
            }
          }
        }
      }
    };
});
