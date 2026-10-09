import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

type Tone = 'slate' | 'amber' | 'green' | 'red' | 'indigo' | 'blue' | 'purple' | 'orange';

const NODE_TONE: Record<Tone, string> = {
  slate: 'border-slate-200 bg-white text-slate-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-950',
  green: 'border-green-200 bg-green-50 text-green-950',
  red: 'border-red-200 bg-red-50 text-red-950',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-950',
  blue: 'border-blue-200 bg-blue-50 text-blue-950',
  purple: 'border-purple-200 bg-purple-50 text-purple-950',
  orange: 'border-orange-200 bg-orange-50 text-orange-950',
};

const PILL_TONE: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  amber: 'bg-amber-100 text-amber-800',
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-100 text-red-800',
  indigo: 'bg-indigo-100 text-indigo-800',
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
  orange: 'bg-orange-100 text-orange-800',
};

interface FlowNode {
  label: string;
  hint: string;
  tone: Tone;
}

interface FlowBranch {
  from: string;
  label: string;
  detail: string;
  tone: Tone;
}

interface FlowNote {
  label: string;
  where: string;
  detail: string;
  tone: Tone;
}

interface FlowGroup {
  title: string;
  notes: FlowNote[];
}

interface StatusFlowGuideProps {
  storageKey: string;
  title: string;
  summary: string;
  sources?: string[];
  pipeline: FlowNode[];
  branches: FlowBranch[];
  groups: FlowGroup[];
  footnote: string;
}

function readOpen(storageKey: string): boolean {
  try {
    return localStorage.getItem(storageKey) !== '0';
  } catch {
    return true;
  }
}

function FlowArrow() {
  return (
    <>
      <span className="flex justify-center py-0.5 text-slate-300 sm:hidden" aria-hidden>
        <ChevronDown size={16} />
      </span>
      <span className="hidden w-5 shrink-0 items-center justify-center text-slate-300 sm:flex" aria-hidden>
        <ChevronRight size={16} />
      </span>
    </>
  );
}

function StatusFlowGuide({
  storageKey,
  title,
  summary,
  sources,
  pipeline,
  branches,
  groups,
  footnote,
}: StatusFlowGuideProps) {
  const [open, setOpen] = useState(() => readOpen(storageKey));

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* el esquema sigue usable sin persistir */
      }
      return next;
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Esquema del flujo
          </span>
          <span className="mt-0.5 block text-sm font-semibold text-slate-900">{title}</span>
          {!open && <span className="mt-1 block text-xs leading-relaxed text-slate-500">{summary}</span>}
        </span>
        <ChevronDown
          size={18}
          className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-200 px-4 py-4 sm:px-5">
          <p className="text-sm leading-relaxed text-slate-600">{summary}</p>

          {sources && sources.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Entran a la cola desde
              </p>
              <div className="flex flex-wrap gap-2">
                {sources.map((source) => (
                  <span
                    key={source}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {source}
                  </span>
                ))}
              </div>
              <div className="flex justify-center pt-2 text-slate-300" aria-hidden>
                <ChevronDown size={16} />
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Camino habitual
            </p>
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="flex min-w-0 flex-col sm:min-w-full sm:flex-row sm:items-stretch">
              {pipeline.map((node, index) => (
                <div key={node.label} className="contents">
                  {index > 0 && <FlowArrow />}
                  <div
                    className={`flex w-full min-w-0 flex-col justify-center rounded-xl border px-3 py-2.5 sm:w-36 sm:min-w-[9rem] sm:flex-1 ${NODE_TONE[node.tone]}`}
                  >
                    <p className="text-sm font-semibold leading-tight">{node.label}</p>
                    <p className="mt-1 text-[11px] leading-snug opacity-80">{node.hint}</p>
                  </div>
                </div>
              ))}
              </div>
            </div>
          </div>

          {branches.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Salidas del camino
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {branches.map((branch) => (
                  <div
                    key={branch.label}
                    className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2.5"
                  >
                    <p className="text-[11px] text-slate-500">{branch.from}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <ChevronRight size={14} className="shrink-0 text-slate-400" aria-hidden />
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PILL_TONE[branch.tone]}`}
                      >
                        {branch.label}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{branch.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.title}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {group.title}
              </p>
              <dl className="grid gap-2 sm:grid-cols-2">
                {group.notes.map((note) => (
                  <div key={note.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <dt className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PILL_TONE[note.tone]}`}>
                        {note.label}
                      </span>
                      <span className="text-[11px] text-slate-500">{note.where}</span>
                    </dt>
                    <dd className="mt-1.5 text-xs leading-relaxed text-slate-600">{note.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}

          <p className="text-xs leading-relaxed text-slate-500">{footnote}</p>
        </div>
      )}
    </section>
  );
}

export function AtsPresentationFlowGuide() {
  return (
    <StatusFlowGuide
      storageKey="opsflow.flowGuide.ats"
      title="Cómo avanza un candidato"
      summary="El ATS envía la presentación. Cada cambio de estado define si la persona sigue en entrevista, queda lista para ingresar o sale del proceso."
      pipeline={[
        {
          label: 'Pendiente',
          hint: 'Llegó del ATS. Todavía no hay decisión.',
          tone: 'slate',
        },
        {
          label: 'En revisión',
          hint: 'Al abrir la ficha para editarla. Sigue en Pendientes.',
          tone: 'amber',
        },
        {
          label: 'Aprobado',
          hint: 'Entrevista favorable. Aún sin unidad.',
          tone: 'green',
        },
        {
          label: 'Registrado',
          hint: 'Ya es colaborador y pasa a Opalosis.',
          tone: 'indigo',
        },
      ]}
      branches={[
        {
          from: 'Desde Pendiente o En revisión',
          label: 'Rechazado',
          detail: 'Pide un motivo y cierra la presentación. Esa persona no se registra en una unidad desde aquí.',
          tone: 'red',
        },
        {
          from: 'Desde Aprobado, si todavía no tiene unidad',
          label: 'Archivado',
          detail:
            'No inició labores. La presentación se cierra con motivo y no genera contrato ni colaborador.',
          tone: 'slate',
        },
      ]}
      groups={[
        {
          title: 'Qué implica cada estado',
          notes: [
            {
              label: 'Pendiente',
              where: 'Filtro Pendientes',
              detail: 'Bandeja de entrada. Se revisan identidad, ficha y condiciones antes de decidir.',
              tone: 'slate',
            },
            {
              label: 'En revisión',
              where: 'Filtro Pendientes',
              detail:
                'Abrir la ficha con permiso de edición mueve el estado. Guardar avances no aprueba ni rechaza.',
              tone: 'amber',
            },
            {
              label: 'Aprobado',
              where: 'Filtro Aprobados',
              detail:
                'Queda listo para un posible ingreso. El colaborador se crea al registrar en unidad, con las condiciones OpsFlow completas.',
              tone: 'green',
            },
            {
              label: 'Registrado',
              where: 'Filtro Aprobados',
              detail:
                'Ya está en una unidad, con fecha de ingreso. El alta de RRHH sigue en Envío Opalosis.',
              tone: 'indigo',
            },
            {
              label: 'Rechazado',
              where: 'Filtro Rechazados',
              detail: 'La presentación termina con el motivo indicado. OpsFlow deja aviso hacia el ATS.',
              tone: 'red',
            },
            {
              label: 'Archivado',
              where: 'Filtro Archivados',
              detail:
                'Aprobado que no empezó a trabajar (no se presentó, no aceptó o el cliente canceló). Un cese de quien sí trabajó se consulta en Archivo.',
              tone: 'slate',
            },
          ],
        },
      ]}
      footnote="Aprobar deja la ficha en Aprobados. La cola de Opalosis se llena al pulsar Registrar en unidad."
    />
  );
}

export function OpalosisFlowGuide() {
  return (
    <StatusFlowGuide
      storageKey="opsflow.flowGuide.opalosis"
      title="Cómo se envía un ingreso"
      summary="Aquí llegan personas que ya son colaboradoras de una unidad. La cola junta los ingresos por enviar; al enviarlos, el grupo pasa a Paquetes enviados."
      sources={[
        'Registro desde Presentaciones ATS',
        'Alta directa o referido',
        'Recontratación',
      ]}
      pipeline={[
        {
          label: 'Cola pendiente',
          hint: 'Espera el envío. La ficha aún se puede actualizar.',
          tone: 'slate',
        },
        {
          label: 'Enviar',
          hint: 'El grupo sale de la cola y arma un paquete.',
          tone: 'blue',
        },
        {
          label: 'Paquete enviado',
          hint: 'Queda en el historial. Ese paquete ya no se edita.',
          tone: 'indigo',
        },
        {
          label: 'Respuesta',
          hint: 'Opalosis confirma, observa o rechaza.',
          tone: 'green',
        },
      ]}
      branches={[
        {
          from: 'Desde Cola pendiente',
          label: 'Excluido',
          detail:
            'Limpiar pendientes o reemplazar la cola por DNI retira el ingreso. No se envía y se puede volver a encolar.',
          tone: 'amber',
        },
        {
          from: 'Al enviar el paquete',
          label: 'Error o parcial',
          detail:
            'Si nadie quedó registrado, el paquete queda en Error. Si solo algunos, queda en Parcial. Corrija el dato y reintente.',
          tone: 'red',
        },
      ]}
      groups={[
        {
          title: 'En la cola',
          notes: [
            {
              label: 'Pendiente',
              where: 'Pestaña Cola pendiente',
              detail:
                'Espera el envío. Si completan /ficha o se edita la ficha en la unidad, la cola se actualiza mientras siga aquí.',
              tone: 'slate',
            },
            {
              label: 'Incluido',
              where: 'Dentro de un paquete',
              detail: 'Ya salió de la cola. Vive en Paquetes enviados con los datos del momento del envío.',
              tone: 'indigo',
            },
            {
              label: 'Excluido',
              where: 'Fuera de la cola',
              detail:
                'Se retiró a propósito. Sincronizar cola o encolar por DNI puede devolverlo si todavía corresponde enviarlo.',
              tone: 'amber',
            },
          ],
        },
        {
          title: 'En el paquete',
          notes: [
            {
              label: 'Enviado',
              where: 'Paquetes enviados',
              detail: 'Opalosis recibió el grupo. Abra el paquete para ver cada trabajador.',
              tone: 'blue',
            },
            {
              label: 'Simulado',
              where: 'Paquetes enviados',
              detail: 'Prueba interna, sin conexión real a Opalosis. El ingreso todavía no existe allá.',
              tone: 'purple',
            },
            {
              label: 'Error',
              where: 'Paquetes enviados',
              detail: 'Ningún trabajador quedó registrado. Revise el motivo antes de reintentar.',
              tone: 'red',
            },
            {
              label: 'Parcial',
              where: 'Paquetes enviados',
              detail: 'Una parte se registró y otra no. El detalle del paquete indica quién falló.',
              tone: 'amber',
            },
            {
              label: 'Procesado',
              where: 'Tras actualizar estado',
              detail: 'Opalosis tomó las solicitudes. Actualizar Estado / Etapa refresca esta lectura.',
              tone: 'green',
            },
            {
              label: 'Observado',
              where: 'Tras actualizar estado',
              detail: 'Hay observaciones. Abra el paquete, revise el mensaje y vuelva a consultar el estado.',
              tone: 'orange',
            },
            {
              label: 'Rechazado',
              where: 'Tras actualizar estado',
              detail: 'Opalosis rechazó la solicitud. El paquete muestra el motivo de cada persona.',
              tone: 'red',
            },
          ],
        },
      ]}
      footnote="Sincronizar cola recupera presentaciones y altas de los últimos 7 días que no quedaron encoladas. Un candidato solo aprobado, o archivado sin ingreso, no aparece aquí."
    />
  );
}
