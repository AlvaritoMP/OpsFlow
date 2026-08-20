export interface GREPayload {
  companyInfo: { ruc: string };
  destinatario: { nombre: string; ruc: string };
  puntos: { partida: string; llegada: string };
  transportista: {
    placa: string;
    dniConductor: string;
    modalidad: string;
    pesoTotalKg: number;
  };
  motivoTraslado: string;
  fechaInicioTraslado: string;
  items: { codigo: string; descripcion: string; cantidad: number; unidad: string }[];
  documentoReferencia?: string;
}

export interface GREResponse {
  success: boolean;
  ticket: string;
  cdr?: string;
  errors?: string[];
}

/** Simulación de emisión de Guía de Remisión Electrónica (SUNAT). */
export const generateGRE_API = (payload: GREPayload): Promise<GREResponse> => {
  console.log('--- SIMULACIÓN DE ENVÍO A API SUNAT ---', payload);
  return new Promise((resolve) => {
    setTimeout(() => {
      if (Math.random() < 0.95) {
        resolve({
          success: true,
          ticket: `TICKET-${Date.now()}`,
          cdr: `CDR-${Math.floor(Math.random() * 1000000)}`,
        });
      } else {
        resolve({
          success: false,
          ticket: `TICKET-${Date.now()}`,
          errors: ['Error 2109: El RUC del transportista no existe.'],
        });
      }
    }, 1500);
  });
};
