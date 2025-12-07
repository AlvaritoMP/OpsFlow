import { GoogleGenAI } from "@google/genai";
import { Unit } from "../types";

const GEMINI_STORAGE_KEY = 'OPSFLOW_GEMINI_KEY';

export const getGeminiApiKey = (): string | null => {
  try {
    const stored = localStorage.getItem(GEMINI_STORAGE_KEY);
    if (stored) {
      console.log('✅ API Key de Gemini cargada correctamente');
      return stored;
    }
    
    // Intentar usar la variable de entorno como fallback
    const envKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
    if (envKey) {
      console.log('📦 Usando API Key de Gemini desde variable de entorno');
      return envKey;
    }
    
    return null;
  } catch (e) {
    console.error('❌ Error al cargar API Key de Gemini:', e);
    return null;
  }
};

export const saveGeminiApiKey = (key: string) => {
  try {
    // Validar que la key no esté vacía (aunque puede ser válida si el usuario quiere limpiarla)
    if (key && key.trim().length === 0) {
      console.warn('⚠️ Intento de guardar API Key vacía, limpiando...');
      localStorage.removeItem(GEMINI_STORAGE_KEY);
      return;
    }
    
    // Guardar la key
    localStorage.setItem(GEMINI_STORAGE_KEY, key.trim());
    console.log('✅ API Key de Gemini guardada correctamente');
  } catch (error) {
    console.error('❌ Error al guardar API Key de Gemini:', error);
    throw error;
  }
};

const getAiClient = () => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    // console.error("API Key not found"); // Optional logging
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateExecutiveReport = async (unit: Unit): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "Error: No se ha configurado la API Key de Gemini. Ve a Configuración > Integraciones para añadirla.";

  try {
    const prompt = `
      Actúa como un Gerente de Operaciones Senior de una empresa de Facility Management.
      Genera un "Reporte Ejecutivo de Estado de Servicio" para el cliente "${unit.clientName}" sobre la unidad "${unit.name}".
      
      Datos de la unidad:
      ${JSON.stringify(unit, null, 2)}

      El reporte debe ser formal, empático y transparente. Estructura:
      1. Resumen General del Cumplimiento (Basado en complianceHistory).
      2. Estado de Recursos Humanos (Mencionar si hay reemplazos o personal activo, destacar capacitaciones recientes si las hay en los logs).
      3. Logística y Equipamiento (Estado de materiales y maquinaria).
      4. Gestión y Supervisión (Resumen de las últimas visitas/coordinaciones en los logs).
      5. Conclusión breve.

      Usa formato Markdown. Sé conciso pero profesional.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || "No se pudo generar el reporte.";
  } catch (error) {
    console.error("Error generating report:", error);
    return "Ocurrió un error al generar el reporte con IA. Verifica tu API Key.";
  }
};