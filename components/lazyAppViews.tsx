import React from 'react';

const CHUNK_RELOAD_KEY = 'opsflow-lazy-chunk-reload';

function goToFreshCopy() {
  const next = new URL(window.location.href);
  next.searchParams.set('opsflow', String(Date.now()));
  window.location.replace(next.toString());
}

function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  // Chrome en español traduce el fallo: "Error al obtener el módulo importado dinámicamente".
  return /Failed to fetch dynamically imported module|Loading chunk|error loading dynamically imported module|Importing a module script failed|importado dinámicamente|Unable to preload CSS|text\/html/i.test(
    msg
  );
}

function chunkUrlFromError(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const match = msg.match(/https?:\/\/[^\s)'"]+\.js/i);
  return match ? match[0] : null;
}

/** El chunk de Vite a veces envuelve el componente. Un solo candidato evita elegir otra exportación. */
function componentFromChunk(mod: Record<string, unknown>): React.ComponentType<any> | null {
  if (typeof mod.default === 'function') return mod.default as React.ComponentType<any>;
  const values = Object.values(mod);
  const functions = values.filter((value) => typeof value === 'function');
  if (functions.length === 1) return functions[0] as React.ComponentType<any>;
  const nested = values.flatMap((value) =>
    value && typeof value === 'object' ? Object.values(value as object).filter((item) => typeof item === 'function') : []
  );
  return nested.length === 1 ? (nested[0] as React.ComponentType<any>) : null;
}

/** Chrome recuerda el fallo de esa URL. Otra consulta obliga a bajar el archivo de nuevo. */
async function importFreshChunk(err: unknown): Promise<{ default: React.ComponentType<any> } | null> {
  const raw = chunkUrlFromError(err);
  if (!raw) return null;
  const url = new URL(raw);
  url.searchParams.set('opsflow', String(Date.now()));
  const mod = (await import(/* @vite-ignore */ url.href)) as Record<string, unknown>;
  const component = componentFromChunk(mod);
  return component ? { default: component } : null;
}

/** Recarga una vez si un chunk lazy desapareció tras un deploy (hashes viejos). */
function lazyView<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>
) {
  return React.lazy(() =>
    importer()
      .then((mod) => {
        try {
          sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        } catch {
          /* ignore */
        }
        return mod;
      })
      .catch(async (err) => {
        if (!isStaleChunkError(err)) throw err;
        try {
          const recovered = await importFreshChunk(err);
          if (recovered) {
            try {
              sessionStorage.removeItem(CHUNK_RELOAD_KEY);
            } catch {
              /* ignore */
            }
            return recovered as { default: T };
          }
        } catch {
          /* el reintento tampoco pudo bajar el archivo */
        }
        try {
          if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
            sessionStorage.setItem(CHUNK_RELOAD_KEY, Date.now().toString());
            goToFreshCopy();
            return new Promise<{ default: T }>(() => {});
          }
        } catch {
          /* ignore */
        }
        throw err;
      })
  );
}

export const Dashboard = lazyView(() =>
  import('./Dashboard').then((m) => ({ default: m.Dashboard }))
);
export const UnitDetail = lazyView(() =>
  import('./UnitDetail').then((m) => ({ default: m.UnitDetail }))
);
export const ControlCenter = lazyView(() =>
  import('./ControlCenter').then((m) => ({ default: m.ControlCenter }))
);
export const ClientControlCenter = lazyView(() =>
  import('./ClientControlCenter').then((m) => ({ default: m.ClientControlCenter }))
);
export const Reports = lazyView(() =>
  import('./Reports').then((m) => ({ default: m.Reports }))
);
export const OperationsDashboard = lazyView(() =>
  import('./OperationsDashboard').then((m) => ({ default: m.OperationsDashboard }))
);
export const StandardAssetsCatalog = lazyView(() =>
  import('./StandardAssetsCatalog').then((m) => ({ default: m.StandardAssetsCatalog }))
);
export const Retenes = lazyView(() =>
  import('./Retenes').then((m) => ({ default: m.Retenes }))
);
export const NightSupervision = lazyView(() =>
  import('./NightSupervision').then((m) => ({ default: m.NightSupervision }))
);
export const SupervisionPlanning = lazyView(() =>
  import('./SupervisionPlanning').then((m) => ({ default: m.SupervisionPlanning }))
);
export const Headcount = lazyView(() =>
  import('./Headcount').then((m) => ({ default: m.Headcount }))
);
export const Vacations = lazyView(() =>
  import('./Vacations').then((m) => ({ default: m.Vacations }))
);
export const Archive = lazyView(() =>
  import('./Archive').then((m) => ({ default: m.Archive }))
);
export const WorkersManagement = lazyView(() =>
  import('./WorkersManagement').then((m) => ({ default: m.WorkersManagement }))
);
export const InboundWorkerHandoff = lazyView(() =>
  import('./InboundWorkerHandoff').then((m) => ({ default: m.InboundWorkerHandoff }))
);
export const AtsPresentations = lazyView(() =>
  import('./AtsPresentations').then((m) => ({ default: m.AtsPresentations }))
);
export const HrOpalosisIngreso = lazyView(() =>
  import('./HrOpalosisIngreso').then((m) => ({ default: m.HrOpalosisIngreso }))
);
export const InventoryManagement = lazyView(() =>
  import('./inventory/InventoryManagement').then((m) => ({ default: m.InventoryManagement }))
);
export const AuditLogs = lazyView(() =>
  import('./AuditLogs').then((m) => ({ default: m.AuditLogs }))
);
export const MattermostIncidents = lazyView(() =>
  import('./MattermostIncidents').then((m) => ({ default: m.MattermostIncidents }))
);
export const ClientBilling = lazyView(() =>
  import('./ClientBilling').then((m) => ({ default: m.ClientBilling }))
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

type ChunkBoundaryState = { hasError: boolean; stale: boolean; detail: string };

export class ChunkLoadErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ChunkBoundaryState
> {
  state: ChunkBoundaryState = { hasError: false, stale: false, detail: '' };

  static getDerivedStateFromError(error: Error): ChunkBoundaryState {
    const stale = isStaleChunkError(error);
    const detail = stale ? '' : (error?.message || 'Error al dibujar la sección').slice(0, 500);
    return { hasError: true, stale, detail };
  }

  componentDidCatch(error: Error) {
    const stale = isStaleChunkError(error);
    this.setState({ stale, detail: stale ? '' : (error?.message || '').slice(0, 500) });
    if (!stale) return;
    try {
      if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, Date.now().toString());
        goToFreshCopy();
      }
    } catch {
      /* ignore */
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex items-center justify-center h-full min-h-[40vh]">
        <div className="text-center px-4">
          <p className="text-slate-800 font-medium mb-1">
            {this.state.stale ? 'Hay una versión nueva de OpsFlow' : 'No se pudo abrir esta sección'}
          </p>
          <p className="text-sm text-slate-500 mb-4">
            {this.state.stale
              ? 'Recarga la página para continuar.'
              : this.state.detail || 'Vuelve a cargar OpsFlow. Si sigue igual, cierra la pestaña y entra de nuevo.'}
          </p>
          {!this.state.stale && (
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, stale: false, detail: '' })}
              className="px-4 py-2 mr-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm"
            >
              Volver
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem(CHUNK_RELOAD_KEY);
              } catch {
                /* ignore */
              }
              goToFreshCopy();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
