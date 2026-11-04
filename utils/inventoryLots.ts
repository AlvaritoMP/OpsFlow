import type { InvCompany, InvCompanyStock } from '../types';

export function lotsInWarehouse(stock: InvCompanyStock[], productId: string, warehouseId: string): InvCompanyStock[] {
  return stock.filter((row) => row.productId === productId && row.warehouseId === warehouseId && row.quantity > 0);
}

export function unassignedQuantity(total: number, lots: { quantity: number }[]): number {
  const tagged = lots.reduce((sum, lot) => sum + lot.quantity, 0);
  return Math.max(0, Math.round((total - tagged) * 1000) / 1000);
}

export function companyLabel(companies: Pick<InvCompany, 'id' | 'profileName'>[], companyId?: string): string {
  if (!companyId) return 'Sin empresa';
  return companies.find((company) => company.id === companyId)?.profileName || 'Empresa';
}
