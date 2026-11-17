import React from 'react';
import {
  TERMINATION_REASON_PRESETS,
  terminationDetailPlaceholder,
  terminationDetailRequired,
} from '../utils/terminationReason';

interface TerminationReasonFieldsProps {
  preset: string;
  detail: string;
  onPresetChange: (value: string) => void;
  onDetailChange: (value: string) => void;
  focusRingClass?: string;
}

export const TerminationReasonFields: React.FC<TerminationReasonFieldsProps> = ({
  preset,
  detail,
  onPresetChange,
  onDetailChange,
  focusRingClass = 'focus:ring-blue-500',
}) => {
  const detailRequired = terminationDetailRequired(preset);
  const fieldClass = `w-full border border-slate-300 rounded-lg p-2 outline-none focus:ring-2 ${focusRingClass}`;

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 mb-1">
        Motivo del cese *
      </label>
      <select
        value={preset}
        onChange={(e) => onPresetChange(e.target.value)}
        className={fieldClass}
      >
        <option value="">Seleccione un motivo...</option>
        {TERMINATION_REASON_PRESETS.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
      <label className="block text-sm font-medium text-slate-700 mt-3 mb-1">
        Detalle del motivo{detailRequired ? ' *' : ''}
      </label>
      <textarea
        value={detail}
        onChange={(e) => onDetailChange(e.target.value)}
        placeholder={terminationDetailPlaceholder(preset)}
        rows={3}
        maxLength={1000}
        className={`${fieldClass} text-sm`}
      />
      <p className="text-xs text-slate-500 mt-1">
        La lista se usa para medir. Este texto explica el caso y no cambia el motivo.
      </p>
    </div>
  );
};
