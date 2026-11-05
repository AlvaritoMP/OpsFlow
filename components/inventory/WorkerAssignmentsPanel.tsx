import React, { useMemo, useState } from 'react';
import { stockInventoryService } from '../../services/stockInventoryService';
import type { InvProduct, InvRequisition, InvWorkerAssignment } from '../../types';

interface WorkerOption {
  id: string;
  name: string;
  dni?: string;
}

interface WorkerAssignmentsPanelProps {
  unitId?: string;
  workers: WorkerOption[];
  products: InvProduct[];
  requisitions: InvRequisition[];
  assignments: InvWorkerAssignment[];
  assignmentsReady: boolean;
  canEdit: boolean;
  userName: string;
  onChanged: () => Promise<void> | void;
}

export const WorkerAssignmentsPanel: React.FC<WorkerAssignmentsPanelProps> = ({
  unitId,
  workers,
  products,
  requisitions,
  assignments,
  assignmentsReady,
  canEdit,
  userName,
  onChanged,
}) => {
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [itemLabel, setItemLabel] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ASIGNADO' | 'DEVUELTO' | ''>('ASIGNADO');

  const pending = useMemo(() => {
    return requisitions
      .filter((order) => (order.status === 'DESPACHADO' || order.status === 'PARCIAL') && (!unitId || order.unitId === unitId))
      .flatMap((order) => order.items.map((item) => ({ order, item })))
      .map(({ order, item }) => {
        const product = products.find((row) => row.id === item.productId);
        if (!product?.assignToWorker || item.quantityApproved <= 0) return null;
        const assigned = assignments
          .filter((row) => row.requisitionItemId === item.id && row.status === 'ASIGNADO')
          .reduce((sum, row) => sum + row.quantity, 0);
        const left = item.quantityApproved - assigned;
        if (left <= 0.0001) return null;
        return { order, item, product, left };
      })
      .filter((row): row is NonNullable<typeof row> => !!row);
  }, [assignments, products, requisitions, unitId]);

  const visibleAssignments = assignments.filter((row) => {
    if (unitId && row.unitId !== unitId) return false;
    if (statusFilter && row.status !== statusFilter) return false;
    return true;
  });

  const assign = async (row: (typeof pending)[number]) => {
    const worker = workers.find((person) => person.id === workerId);
    if (!worker) {
      setMessage('Elija el trabajador.');
      return;
    }
    try {
      setSaving(true);
      setMessage(null);
      await stockInventoryService.assignRequisitionItem({
        requisition: row.order,
        item: row.item,
        product: row.product,
        worker,
        quantity,
        itemLabel,
        assignedBy: userName,
      });
      setOpenItemId(null);
      setItemLabel('');
      setWorkerId('');
      setQuantity(1);
      setMessage(`${row.product.name} quedó asignado a ${worker.name}. El almacén de la unidad conserva el stock y el inventario muestra al titular.`);
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo asignar');
    } finally {
      setSaving(false);
    }
  };

  const giveBack = async (assignmentId: string) => {
    try {
      setSaving(true);
      setMessage(null);
      await stockInventoryService.returnWorkerAssignment(assignmentId, userName);
      setMessage('La asignación se anuló. El ítem sigue en el almacén de la unidad y puede asignarse de nuevo.');
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo devolver');
    } finally {
      setSaving(false);
    }
  };

  if (!assignmentsReady) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-900">
        Para asignar equipos a un trabajador ejecute <code>migrations/MIGRATION_INVENTORY_ASSIGNMENTS.sql</code> en Supabase.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-800">{unitId ? 'Asignar a personal de la unidad' : 'Asignaciones a personal'}</h3>
        <p className="text-sm text-slate-500 mt-1">
          Solo los productos marcados como asignables a un trabajador. El almacén ya descargó el central y el stock está en la unidad; aquí se indica quién lo tiene, sin sacar la cantidad del inventario.
        </p>
      </div>
      {message && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{message}</p>}

      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Pendiente de asignar</p>
        </div>
        {pending.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">No hay equipos despachados esperando titular.</p>}
        {pending.map((row) => (
          <div key={row.item.id} className="px-4 py-3 border-t border-slate-100 text-sm space-y-2">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="font-medium text-slate-800">{row.product.name}</p>
                <p className="text-xs text-slate-500 font-mono">
                  {row.product.sku} · pedido {row.order.code} · {row.order.unitName} · faltan {row.left}
                </p>
              </div>
              {unitId && canEdit && (
                <button
                  type="button"
                  className="text-xs font-semibold text-blue-700"
                  onClick={() => {
                    setOpenItemId(row.item.id);
                    setQuantity(Math.min(1, row.left) || 1);
                    setItemLabel('');
                    setMessage(null);
                  }}
                >
                  Asignar
                </button>
              )}
            </div>
            {openItemId === row.item.id && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <select value={workerId} onChange={(e) => setWorkerId(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-2 md:col-span-2">
                  <option value="">Trabajador</option>
                  {workers.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}{person.dni ? ` · ${person.dni}` : ''}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={row.left}
                  value={itemLabel.trim() ? 1 : quantity}
                  disabled={!!itemLabel.trim()}
                  onChange={(e) => setQuantity(Math.max(1, Math.min(row.left, parseInt(e.target.value, 10) || 1)))}
                  className="border border-slate-300 rounded-lg px-2 py-2"
                />
                <input
                  value={itemLabel}
                  onChange={(e) => {
                    setItemLabel(e.target.value);
                    if (e.target.value.trim()) setQuantity(1);
                  }}
                  placeholder="Serie o placa (opcional, de a uno)"
                  className="border border-slate-300 rounded-lg px-2 py-2"
                />
                <div className="md:col-span-4 flex justify-end gap-2">
                  <button type="button" className="text-xs text-slate-500" onClick={() => setOpenItemId(null)}>Cancelar</button>
                  <button type="button" disabled={saving || workers.length === 0} onClick={() => void assign(row)} className="bg-blue-600 text-white text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Confirmar titular'}
                  </button>
                </div>
                {workers.length === 0 && <p className="md:col-span-4 text-xs text-amber-800">Esta unidad no tiene personal activo para recibir el equipo.</p>}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-700">Trazabilidad</p>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ASIGNADO' | 'DEVUELTO' | '')} className="border border-slate-300 rounded-lg px-2 py-1 text-xs">
            <option value="ASIGNADO">Asignados</option>
            <option value="DEVUELTO">Devueltos</option>
            <option value="">Todos</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500 text-xs">
              <tr>
                <th className="p-3">Producto</th>
                <th className="p-3">Trabajador</th>
                <th className="p-3">Pedido</th>
                <th className="p-3">Cantidad</th>
                {canEdit && <th className="p-3" />}
              </tr>
            </thead>
            <tbody>
              {visibleAssignments.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="p-3">
                    <p className="font-medium">{row.productName}</p>
                    <p className="text-xs font-mono text-slate-500">{row.sku}{row.itemLabel ? ` · ${row.itemLabel}` : ''}</p>
                  </td>
                  <td className="p-3">
                    <p>{row.workerName}</p>
                    <p className="text-xs text-slate-500">{row.workerDocument || row.unitName}</p>
                  </td>
                  <td className="p-3">
                    <p className="font-mono text-xs">{row.requisitionCode}</p>
                    <p className="text-xs text-slate-500">{row.unitName} · {row.status === 'ASIGNADO' ? 'vigente' : 'devuelto'}</p>
                  </td>
                  <td className="p-3 font-semibold">{row.quantity}</td>
                  {canEdit && (
                    <td className="p-3 text-right">
                      {row.status === 'ASIGNADO' && (
                        <button type="button" disabled={saving} className="text-xs text-slate-500 hover:text-red-600" onClick={() => void giveBack(row.id)}>
                          Quitar titular
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {visibleAssignments.length === 0 && <p className="px-4 py-6 text-sm text-slate-400">Todavía no hay asignaciones.</p>}
        </div>
      </div>
    </div>
  );
};
