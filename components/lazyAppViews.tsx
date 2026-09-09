import React from 'react';

export const Dashboard = React.lazy(() =>
  import('./Dashboard').then((m) => ({ default: m.Dashboard }))
);
export const UnitDetail = React.lazy(() =>
  import('./UnitDetail').then((m) => ({ default: m.UnitDetail }))
);
export const ControlCenter = React.lazy(() =>
  import('./ControlCenter').then((m) => ({ default: m.ControlCenter }))
);
export const ClientControlCenter = React.lazy(() =>
  import('./ClientControlCenter').then((m) => ({ default: m.ClientControlCenter }))
);
export const Reports = React.lazy(() =>
  import('./Reports').then((m) => ({ default: m.Reports }))
);
export const OperationsDashboard = React.lazy(() =>
  import('./OperationsDashboard').then((m) => ({ default: m.OperationsDashboard }))
);
export const StandardAssetsCatalog = React.lazy(() =>
  import('./StandardAssetsCatalog').then((m) => ({ default: m.StandardAssetsCatalog }))
);
export const Retenes = React.lazy(() =>
  import('./Retenes').then((m) => ({ default: m.Retenes }))
);
export const NightSupervision = React.lazy(() =>
  import('./NightSupervision').then((m) => ({ default: m.NightSupervision }))
);
export const SupervisionPlanning = React.lazy(() =>
  import('./SupervisionPlanning').then((m) => ({ default: m.SupervisionPlanning }))
);
export const Headcount = React.lazy(() =>
  import('./Headcount').then((m) => ({ default: m.Headcount }))
);
export const Vacations = React.lazy(() =>
  import('./Vacations').then((m) => ({ default: m.Vacations }))
);
export const Archive = React.lazy(() =>
  import('./Archive').then((m) => ({ default: m.Archive }))
);
export const WorkersManagement = React.lazy(() =>
  import('./WorkersManagement').then((m) => ({ default: m.WorkersManagement }))
);
export const InboundWorkerHandoff = React.lazy(() =>
  import('./InboundWorkerHandoff').then((m) => ({ default: m.InboundWorkerHandoff }))
);
export const AtsPresentations = React.lazy(() =>
  import('./AtsPresentations').then((m) => ({ default: m.AtsPresentations }))
);
export const HrOpalosisIngreso = React.lazy(() =>
  import('./HrOpalosisIngreso').then((m) => ({ default: m.HrOpalosisIngreso }))
);
export const InventoryManagement = React.lazy(() =>
  import('./inventory/InventoryManagement').then((m) => ({ default: m.InventoryManagement }))
);
export const AuditLogs = React.lazy(() =>
  import('./AuditLogs').then((m) => ({ default: m.AuditLogs }))
);

export const ViewFallback: React.FC<{ message?: string }> = ({ message = 'Cargando sección...' }) => (
  <div className="flex items-center justify-center h-full min-h-[40vh]">
    <div className="text-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
      <p className="text-slate-600 text-sm">{message}</p>
    </div>
  </div>
);

export const KeepAlivePane: React.FC<{
  active: boolean;
  fillHeight?: boolean;
  children: React.ReactNode;
}> = ({ active, fillHeight, children }) => (
  <div
    hidden={!active}
    className={!active ? 'hidden' : fillHeight ? 'h-full' : undefined}
    aria-hidden={!active}
  >
    {children}
  </div>
);
