import { GoogleGenAI } from "@google/genai";
import { Unit } from "../types";

const getAiClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API Key not found");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateExecutiveReport = async (unit: Unit): Promise<string> => {
  const ai = getAiClient();
  if (!ai) return "Error: No se ha configurado la API Key.";

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
    return "Ocurrió un error al generar el reporte con IA.";
  }
};