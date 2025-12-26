import React, { useState, useEffect, useMemo } from 'react';
import { Unit, Resource, ResourceType, RequiredPosition } from '../types';
import { positionsService } from '../services/positionsService';
import { Position } from '../types';
import { Users, AlertCircle, CheckCircle, XCircle, Briefcase, Building } from 'lucide-react';

interface HeadcountProps {
  units: Unit[];
}

interface PositionSummary {
  positionId: string;
  positionName: string;
  totalRequired: number;
  totalCovered: number;
  units: {
    unitId: string;
    unitName: string;
    required: number;
    covered: number;
    deficit: number;
  }[];
}

export const Headcount: React.FC<HeadcountProps> = ({ units }) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  useEffect(() => {
    loadPositions();
  }, []);

  const loadPositions = async () => {
    try {
      setLoading(true);
      const data = await positionsService.getAll(true); // Incluir inactivos para referencia
      setPositions(data);
    } catch (error) {
      console.error('Error al cargar puestos:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calcular resumen de puestos (sin duplicar trabajadores compartidos en totales)
  const positionSummary = useMemo(() => {
    const summary: PositionSummary[] = [];
    const positionMap = new Map<string, PositionSummary>();

    units.forEach(unit => {
      const requiredPositions = unit.requiredPositions || [];
      const personnel = (unit.resources || []).filter(r => r.type === ResourceType.PERSONNEL && r.personnelStatus !== 'cesado');

      requiredPositions.forEach(reqPos => {
        if (!positionMap.has(reqPos.positionId)) {
          positionMap.set(reqPos.positionId, {
            positionId: reqPos.positionId,
            positionName: reqPos.positionName || positions.find(p => p.id === reqPos.positionId)?.name || 'Desconocido',
            totalRequired: 0,
            totalCovered: 0,
            units: [],
          });
        }

        const summaryItem = positionMap.get(reqPos.positionId)!;
        // Contar trabajadores para esta unidad (cantidad bruta)
        const unitPersonnel = personnel.filter(p => p.puesto === reqPos.positionName || p.puesto === reqPos.positionId);
        const covered = unitPersonnel.length;
        const deficit = reqPos.quantity - covered;

        summaryItem.totalRequired += reqPos.quantity;
        summaryItem.units.push({
          unitId: unit.id,
          unitName: unit.name,
          required: reqPos.quantity,
          covered, // Cantidad bruta para la unidad
          deficit,
        });
      });
    });

    // Recalcular totalCovered correctamente para cada posición (sin duplicar compartidos)
    positionMap.forEach((summaryItem, positionId) => {
      const sharedWorkers = new Set<string>(); // Set de identificadores de trabajadores compartidos ya contados
      let totalUnique = 0;
      
      units.forEach(unit => {
        const requiredPositions = unit.requiredPositions || [];
        const reqPos = requiredPositions.find(rp => rp.positionId === positionId);
        if (reqPos) {
          const personnel = (unit.resources || []).filter(
            r => r.type === ResourceType.PERSONNEL && 
            r.personnelStatus !== 'cesado' &&
            (r.puesto === reqPos.positionName || r.puesto === reqPos.positionId)
          );
          
          personnel.forEach(p => {
            const identifier = p.dni || p.name;
            if (p.isShared) {
              // Trabajador compartido: solo contar una vez en el total
              if (!sharedWorkers.has(identifier)) {
                sharedWorkers.add(identifier);
                totalUnique++;
              }
            } else {
              // Trabajador único: contar siempre
              totalUnique++;
            }
          });
        }
      });
      
      summaryItem.totalCovered = totalUnique;
    });

    return Array.from(positionMap.values()).sort((a, b) => a.positionName.localeCompare(b.positionName));
  }, [units, positions]);

  // Calcular resumen por unidad
  const unitSummary = useMemo(() => {
    return units.map(unit => {
      const requiredPositions = unit.requiredPositions || [];
      const personnel = (unit.resources || []).filter(r => r.type === ResourceType.PERSONNEL && r.personnelStatus !== 'cesado');
      
      let totalRequired = 0;
      let totalCovered = 0;

      requiredPositions.forEach(reqPos => {
        totalRequired += reqPos.quantity;
        const covered = personnel.filter(p => p.puesto === reqPos.positionName || p.puesto === reqPos.positionId).length;
        totalCovered += Math.min(covered, reqPos.quantity); // No contar más de lo requerido
      });

      return {
        unitId: unit.id,
        unitName: unit.name,
        clientName: unit.clientName,
        totalRequired,
        totalCovered,
        deficit: totalRequired - totalCovered,
        positions: requiredPositions.map(reqPos => {
          const covered = personnel.filter(p => p.puesto === reqPos.positionName || p.puesto === reqPos.positionId).length;
          return {
            positionId: reqPos.positionId,
            positionName: reqPos.positionName || positions.find(p => p.id === reqPos.positionId)?.name || 'Desconocido',
            required: reqPos.quantity,
            covered,
            deficit: reqPos.quantity - covered,
          };
        }),
      };
    }).sort((a, b) => a.unitName.localeCompare(b.unitName));
  }, [units, positions]);

  const filteredUnitSummary = selectedUnitId
    ? unitSummary.filter(u => u.unitId === selectedUnitId)
    : unitSummary;

  const overallStats = useMemo(() => {
    const totalRequired = unitSummary.reduce((sum, u) => sum + u.totalRequired, 0);
    const totalCovered = unitSummary.reduce((sum, u) => sum + u.totalCovered, 0);
    const totalDeficit = totalRequired - totalCovered;
    const coveragePercentage = totalRequired > 0 ? (totalCovered / totalRequired) * 100 : 0;

    return {
      totalRequired,
      totalCovered,
      totalDeficit,
      coveragePercentage,
    };
  }, [unitSummary]);

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-500">Cargando información de Headcount...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center">
            <Users className="mr-2" size={24} /> Headcount - Conciliación de Puestos
          </h1>
          <p className="text-slate-500 mt-1">Resumen de puestos requeridos vs cubiertos por unidad</p>
        </div>
      </div>

      {/* Estadísticas generales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Requerido</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{overallStats.totalRequired}</p>
            </div>
            <Briefcase className="text-blue-600" size={32} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Cubierto</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{overallStats.totalCovered}</p>
            </div>
            <CheckCircle className="text-green-600" size={32} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Déficit</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{overallStats.totalDeficit}</p>
            </div>
            <XCircle className="text-red-600" size={32} />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Cobertura</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{overallStats.coveragePercentage.toFixed(1)}%</p>
            </div>
            <Users className="text-slate-600" size={32} />
          </div>
        </div>
      </div>

      {/* Filtro por unidad */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">Filtrar por Unidad</label>
        <select
          className="w-full md:w-64 border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
          value={selectedUnitId || ''}
          onChange={(e) => setSelectedUnitId(e.target.value || null)}
        >
          <option value="">Todas las unidades</option>
          {units.map(unit => (
            <option key={unit.id} value={unit.id}>{unit.name}</option>
          ))}
        </select>
      </div>

      {/* Resumen por puesto */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-700 flex items-center">
            <Briefcase className="mr-2" size={18} /> Resumen por Puesto
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Puesto</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Requerido</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Cubierto</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Déficit</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Cobertura</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {positionSummary.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    No hay puestos requeridos definidos en las unidades
                  </td>
                </tr>
              ) : (
                positionSummary.map((pos) => {
                  const coverage = pos.totalRequired > 0 ? (pos.totalCovered / pos.totalRequired) * 100 : 0;
                  return (
                    <tr key={pos.positionId} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        {pos.positionName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-slate-600">
                        {pos.totalRequired}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-green-600 font-medium">
                        {pos.totalCovered}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        {pos.totalRequired - pos.totalCovered > 0 ? (
                          <span className="text-red-600 font-medium">{pos.totalRequired - pos.totalCovered}</span>
                        ) : (
                          <span className="text-green-600">0</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        <div className="flex items-center justify-center">
                          <div className="w-16 bg-slate-200 rounded-full h-2 mr-2">
                            <div
                              className={`h-2 rounded-full ${
                                coverage >= 100 ? 'bg-green-600' : coverage >= 80 ? 'bg-yellow-500' : 'bg-red-600'
                              }`}
                              style={{ width: `${Math.min(coverage, 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs font-medium ${
                            coverage >= 100 ? 'text-green-600' : coverage >= 80 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {coverage.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen por unidad */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
          <h3 className="font-bold text-slate-700 flex items-center">
            <Building className="mr-2" size={18} /> Resumen por Unidad
          </h3>
        </div>
        <div className="divide-y divide-slate-200">
          {filteredUnitSummary.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-400">
              No hay unidades con puestos requeridos definidos
            </div>
          ) : (
            filteredUnitSummary.map((unit) => {
              const unitCoverage = unit.totalRequired > 0 ? (unit.totalCovered / unit.totalRequired) * 100 : 0;
              return (
                <div key={unit.unitId} className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-bold text-slate-800">{unit.unitName}</h4>
                      <p className="text-sm text-slate-500">{unit.clientName}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center space-x-4">
                        <div>
                          <p className="text-xs text-slate-500">Requerido</p>
                          <p className="text-lg font-bold text-slate-800">{unit.totalRequired}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Cubierto</p>
                          <p className="text-lg font-bold text-green-600">{unit.totalCovered}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Déficit</p>
                          <p className={`text-lg font-bold ${unit.deficit > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {unit.deficit}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Cobertura</p>
                          <p className={`text-lg font-bold ${
                            unitCoverage >= 100 ? 'text-green-600' : unitCoverage >= 80 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {unitCoverage.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {unit.positions.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {unit.positions.map((pos) => {
                        const posCoverage = pos.required > 0 ? (pos.covered / pos.required) * 100 : 0;
                        return (
                          <div key={pos.positionId} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-slate-700">{pos.positionName}</p>
                            </div>
                            <div className="flex items-center space-x-4 text-sm">
                              <span className="text-slate-600">Req: {pos.required}</span>
                              <span className="text-green-600 font-medium">Cub: {pos.covered}</span>
                              {pos.deficit > 0 ? (
                                <span className="text-red-600 font-medium flex items-center">
                                  <AlertCircle size={14} className="mr-1" /> Falta: {pos.deficit}
                                </span>
                              ) : (
                                <span className="text-green-600 flex items-center">
                                  <CheckCircle size={14} className="mr-1" /> Completo
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

