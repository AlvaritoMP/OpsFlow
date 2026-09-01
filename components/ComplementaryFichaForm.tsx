import React from 'react';
import type { WorkerSnapshotComplementary } from '../types';

export type ComplementaryFieldDef = {
  key: keyof WorkerSnapshotComplementary;
  label: string;
  input?: 'text' | 'tel' | 'email' | 'select';
  options?: string[];
  fullWidth?: boolean;
};

export type ComplementaryFieldGroup = {
  id: string;
  title: string;
  fields: ComplementaryFieldDef[];
};

export const COMPLEMENTARY_FICHA_GROUPS: ComplementaryFieldGroup[] = [
  {
    id: 'personal',
    title: 'Datos personales',
    fields: [
      { key: 'nombres', label: 'Nombres' },
      { key: 'apellidoPaterno', label: 'Apellido paterno' },
      { key: 'apellidoMaterno', label: 'Apellido materno' },
      { key: 'fechaNacimiento', label: 'Fecha de nacimiento' },
      {
        key: 'tipoDocumento',
        label: 'Tipo documento',
        input: 'select',
        options: ['DNI', 'CE', 'Pasaporte'],
      },
      { key: 'nroDocumento', label: 'N° documento (DNI, CE o pasaporte)' },
      { key: 'nacionalidad', label: 'Nacionalidad' },
      { key: 'edad', label: 'Edad' },
      {
        key: 'sexo',
        label: 'Sexo',
        input: 'select',
        options: ['Masculino', 'Femenino'],
      },
      {
        key: 'estadoCivil',
        label: 'Estado civil',
        input: 'select',
        options: ['Soltero', 'Casado', 'Viudo', 'Divorciado'],
      },
    ],
  },
  {
    id: 'contacto',
    title: 'Contacto y dirección',
    fields: [
      { key: 'email', label: 'Correo', input: 'email', fullWidth: true },
      { key: 'telefono', label: 'Teléfono', input: 'tel' },
      { key: 'emergenciaTelefono', label: 'Tel. emergencia', input: 'tel' },
      { key: 'emergenciaParentesco', label: 'Parentesco emergencia' },
      { key: 'direccion', label: 'Dirección', fullWidth: true },
      { key: 'distrito', label: 'Distrito' },
      { key: 'provincia', label: 'Provincia' },
      { key: 'departamento', label: 'Departamento' },
    ],
  },
  {
    id: 'tallas',
    title: 'Tallas',
    fields: [
      { key: 'tallaCamisa', label: 'Talla camisa' },
      { key: 'tallaPantalon', label: 'Talla pantalón' },
      { key: 'tallaCalzado', label: 'Talla calzado' },
    ],
  },
  {
    id: 'laboral',
    title: 'Laboral y bancos',
    fields: [
      { key: 'unidadDestaque', label: 'Unidad destaque', fullWidth: true },
      { key: 'puestoContrato', label: 'Puesto contrato', fullWidth: true },
      { key: 'bancoSueldo', label: 'Banco sueldo' },
      { key: 'bancoCts', label: 'Banco CTS' },
      {
        key: 'sistemaPensionesAnterior',
        label: 'Pensiones anterior',
        input: 'select',
        options: ['AFP', 'ONP'],
      },
      {
        key: 'sistemaPensionesDeseado',
        label: 'Pensiones deseado',
        input: 'select',
        options: ['AFP', 'ONP'],
      },
      { key: 'nombreFamiliarOpalo', label: 'Familiar en Opalo', fullWidth: true },
    ],
  },
];

const inputClassName =
  'w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500';

function fieldToInputValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value);
}

interface ComplementaryFichaFormProps {
  value: WorkerSnapshotComplementary;
  disabled?: boolean;
  onChange: (next: WorkerSnapshotComplementary) => void;
  /** Compact spacing for embedding in unit panels */
  compact?: boolean;
}

export const ComplementaryFichaForm: React.FC<ComplementaryFichaFormProps> = ({
  value,
  disabled = false,
  onChange,
  compact = false,
}) => {
  const setField = (key: keyof WorkerSnapshotComplementary, raw: string) => {
    onChange({ ...value, [key]: raw });
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'}>
      {COMPLEMENTARY_FICHA_GROUPS.map((group) => (
        <div key={group.id}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {group.title}
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.fields.map((field) => {
              const spanClass = field.fullWidth ? 'col-span-1 sm:col-span-2' : 'col-span-1';
              const current = fieldToInputValue(value[field.key]);
              return (
                <label key={String(field.key)} className={`block ${spanClass}`}>
                  <span className="mb-1.5 block text-xs font-medium text-slate-600">
                    {field.label}
                  </span>
                  {field.input === 'select' ? (
                    <select
                      disabled={disabled}
                      value={current}
                      onChange={(e) => setField(field.key, e.target.value)}
                      className={inputClassName}
                    >
                      <option value="">Seleccionar…</option>
                      {(field.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                      {current && !(field.options ?? []).includes(current) && (
                        <option value={current}>{current}</option>
                      )}
                    </select>
                  ) : (
                    <input
                      type={field.input ?? 'text'}
                      disabled={disabled}
                      value={current}
                      onChange={(e) => setField(field.key, e.target.value)}
                      autoComplete="off"
                      className={inputClassName}
                    />
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-600">
          ¿Pariente en Opalo?
        </label>
        <select
          disabled={disabled}
          value={
            value.parienteEnOpalo === true ? 'si' : value.parienteEnOpalo === false ? 'no' : ''
          }
          onChange={(e) => {
            const raw = e.target.value;
            onChange({
              ...value,
              parienteEnOpalo: raw === 'si' ? true : raw === 'no' ? false : null,
            });
          }}
          className={inputClassName}
        >
          <option value="">Sin indicar</option>
          <option value="si">Sí</option>
          <option value="no">No</option>
        </select>
      </div>

      {(value.familiares?.length ?? 0) > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Familiares
          </h4>
          <ul className="space-y-2 text-sm text-slate-800">
            {value.familiares!.map((fam, idx) => (
              <li key={idx} className="rounded-xl bg-slate-50 px-3 py-2.5">
                {[fam.nombres, fam.apellidoPaterno, fam.apellidoMaterno].filter(Boolean).join(' ')}
                {fam.parentesco ? ` · ${fam.parentesco}` : ''}
                {fam.edad !== undefined && fam.edad !== null && String(fam.edad).trim() !== ''
                  ? ` · ${fam.edad} años`
                  : ''}
                {fam.telefono ? ` · ${fam.telefono}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(value.experienciaLaboral?.length ?? 0) > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Experiencia laboral
          </h4>
          <ul className="space-y-2 text-sm text-slate-800">
            {value.experienciaLaboral!.map((exp, idx) => (
              <li key={idx} className="rounded-xl bg-slate-50 px-3 py-2.5">
                <span className="font-medium">{exp.empresa || '—'}</span>
                {exp.puesto ? ` · ${exp.puesto}` : ''}
                {(exp.fechaIngreso || exp.fechaCese) && (
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {exp.fechaIngreso || '?'} → {exp.fechaCese || '?'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(value.educacion?.length ?? 0) > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Educación
          </h4>
          <ul className="space-y-2 text-sm text-slate-800">
            {value.educacion!.map((edu, idx) => (
              <li key={idx} className="rounded-xl bg-slate-50 px-3 py-2.5">
                {[edu.nivel, edu.institucion, edu.grado].filter(Boolean).join(' · ') || '—'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(value.antecedentesSalud?.length ?? 0) > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Antecedentes de salud
          </h4>
          <ul className="space-y-2 text-sm text-slate-800">
            {value.antecedentesSalud!.map((ant, idx) => (
              <li key={idx} className="rounded-xl bg-slate-50 px-3 py-2.5">
                {[ant.tipoEnfermedad, ant.diagnostico, ant.secuela].filter(Boolean).join(' · ') ||
                  '—'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
