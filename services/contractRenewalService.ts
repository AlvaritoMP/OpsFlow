import { Resource, ResourceType } from '../types';
import { PlannedRenewal } from '../utils/contractRenewal';
import { contractService } from './contractService';
import { resourcesService } from './resourcesService';

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Aplica una renovación o un ajuste del contrato vigente.
 * Usa el mismo registro de historial y la misma actualización de ficha que la renovación individual.
 */
export async function applyPlannedRenewal(plan: PlannedRenewal): Promise<Resource> {
  if (plan.error) throw new Error(plan.error);

  const worker = plan.worker.resource;
  const id = worker.id;

  if (plan.action === 'renew') {
    if (!plan.nextStart || !plan.nextEnd) {
      throw new Error(`${worker.name}: faltan las fechas del nuevo contrato.`);
    }

    try {
      await contractService.createContract(id, plan.nextStart, plan.nextEnd, plan.notes, {
        isRenewal: true,
        monthlySalary: plan.nextSalary,
        workConditionAmount: plan.nextCondition,
      });
    } catch (error) {
      throw new Error(`${worker.name}: ${errorText(error, 'No se pudo crear el contrato.')}`);
    }

    try {
      const patch: Partial<Resource> = {
        type: ResourceType.PERSONNEL,
        endDate: plan.nextEnd,
        personnelStatus: 'activo',
        archived: false,
        terminationReason: null,
      };
      if (plan.nextSalary !== undefined) patch.monthlySalary = plan.nextSalary;
      if (plan.nextCondition !== undefined) patch.workConditionAmount = plan.nextCondition;
      const updated = await resourcesService.update(id, patch);
      return { ...worker, ...updated, id: worker.id };
    } catch (error) {
      throw new Error(
        `${worker.name}: el contrato nuevo quedó registrado, pero la ficha no se actualizó. ${errorText(error, '')}`.trim(),
      );
    }
  }

  const history = await contractService.getContractHistory(id);
  const active = history.find((contract) => contract.status === 'activo') || history[history.length - 1];
  if (active && plan.endChanged && plan.nextEnd && plan.nextEnd < String(active.startDate).slice(0, 10)) {
    throw new Error(
      `${worker.name}: el fin queda antes del inicio del contrato vigente (${String(active.startDate).slice(0, 10)}).`,
    );
  }

  if (active && (plan.endChanged || plan.salaryChanged || plan.conditionChanged)) {
    await contractService.updateContract(active.id, {
      startDate: String(active.startDate).slice(0, 10),
      endDate: plan.endChanged && plan.nextEnd ? plan.nextEnd : String(active.endDate).slice(0, 10),
      notes: active.notes,
      monthlySalary: plan.salaryChanged ? (plan.nextSalary ?? null) : (active.monthlySalary ?? null),
      workConditionAmount: plan.conditionChanged ? (plan.nextCondition ?? null) : (active.workConditionAmount ?? null),
    });
  }

  const patch: Partial<Resource> = { type: ResourceType.PERSONNEL };
  if (plan.endChanged && plan.nextEnd) patch.endDate = plan.nextEnd;
  if (plan.salaryChanged && plan.nextSalary !== undefined) patch.monthlySalary = plan.nextSalary;
  if (plan.conditionChanged && plan.nextCondition !== undefined) patch.workConditionAmount = plan.nextCondition;
  const updated = await resourcesService.update(id, patch);
  return { ...worker, ...updated, id: worker.id };
}
