// Componente de prueba temporal
import React from 'react';

const TestApp: React.FC = () => {
  console.log('TestApp renderizando');
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>Test App - React está funcionando</h1>
      <p>Si ves esto, React está cargando correctamente.</p>
    </div>
  );
};

export default TestApp;

