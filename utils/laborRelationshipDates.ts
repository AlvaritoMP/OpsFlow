import { ContractHistory, Resource } from '../types';

const pickEarlierDate = (a?: string, b?: string): string | undefined => {
  if (!a) return b;
  if (!b) return a;
  const aDate = new Date(a);
  const bDate = new Date(b);
  if (Number.isNaN(aDate.getTime())) return b;
  if (Number.isNaN(bDate.getTime())) return a;
  return aDate <= bDate ? a : b;
};

export function getLaborRelationshipDisplayDates(
  worker: Pick<Resource, 'startDate' | 'endDate' | 'contractHistory'>,
  history?: ContractHistory[]
): { start?: string; end?: string } {
  const sourceHistory = history ?? worker.contractHistory;

  if (sourceHistory && sourceHistory.length > 0) {
    const sorted = [...sourceHistory].sort((a, b) => a.contractNumber - b.contractNumber);
    const start = pickEarlierDate(worker.startDate, sorted[0].startDate);
    return {
      start,
      end: sorted[sorted.length - 1].endDate,
    };
  }

  return { start: worker.startDate, end: worker.endDate };
}
