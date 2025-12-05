import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

console.log('index.tsx cargado');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

console.log('Root element encontrado:', rootElement);

// Importar App con manejo de errores
import App from './App';

const root = ReactDOM.createRoot(rootElement);
console.log('Creando root de React');

try {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log('App renderizada');
} catch (error: any) {
  console.error('Error al renderizar:', error);
  root.render(
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1 style={{ color: 'red' }}>Error al renderizar</h1>
      <p>Error: {String(error)}</p>
      {error.stack && <pre>{error.stack}</pre>}
    </div>
  );
}