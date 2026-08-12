import React, { useEffect, useId, useState } from 'react';
import { Calendar } from 'lucide-react';
import { formatDateDisplay, maskDateInput, parseDateInput } from '../utils/dateFormat';

interface DateInputProps {
  value: string;
  onChange: (isoDate: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  /** Placeholder visible; por defecto dd/mm/yyyy */
  placeholder?: string;
  /** Límite inferior ISO yyyy-MM-dd */
  min?: string;
  /** Límite superior ISO yyyy-MM-dd */
  max?: string;
}

/**
 * Campo de fecha en formato Perú dd/mm/yyyy.
 * El valor externo siempre es ISO yyyy-MM-dd (o '').
 */
export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  className = 'w-full border rounded-lg p-2 text-sm',
  disabled = false,
  required = false,
  id,
  placeholder = 'dd/mm/yyyy',
  min,
  max,
}) => {
  const autoId = useId();
  const pickerId = id || autoId;
  const [text, setText] = useState(() => formatDateDisplay(value));
  const [invalid, setInvalid] = useState(false);
  const [rangeError, setRangeError] = useState(false);

  useEffect(() => {
    setText(formatDateDisplay(value));
    setInvalid(false);
    setRangeError(false);
  }, [value]);

  const isOutOfRange = (iso: string): boolean => {
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  };

  const commitText = (raw: string) => {
    const masked = maskDateInput(raw);
    setText(masked);
    if (!masked.trim()) {
      setInvalid(false);
      setRangeError(false);
      if (value) onChange('');
      return;
    }
    if (masked.length < 10) {
      setInvalid(false);
      setRangeError(false);
      return;
    }
    const iso = parseDateInput(masked);
    if (iso === null) {
      setInvalid(true);
      setRangeError(false);
      return;
    }
    if (isOutOfRange(iso)) {
      setInvalid(true);
      setRangeError(true);
      return;
    }
    setInvalid(false);
    setRangeError(false);
    if (iso !== value) onChange(iso);
  };

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        id={pickerId}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        className={`${className} pr-9 ${invalid ? 'border-red-400 focus:ring-red-400' : ''}`}
        value={text}
        onChange={e => commitText(e.target.value)}
        onBlur={() => {
          if (!text.trim()) {
            setInvalid(false);
            setRangeError(false);
            if (value) onChange('');
            return;
          }
          const iso = parseDateInput(text);
          if (!iso) {
            setInvalid(true);
            setRangeError(false);
            setText(formatDateDisplay(value));
            return;
          }
          if (isOutOfRange(iso)) {
            setInvalid(true);
            setRangeError(true);
            setText(formatDateDisplay(value));
            return;
          }
          setInvalid(false);
          setRangeError(false);
          setText(formatDateDisplay(iso));
          if (iso !== value) onChange(iso);
        }}
        aria-invalid={invalid}
      />
      <label
        htmlFor={`${pickerId}-native`}
        className={`absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 ${
          disabled ? 'pointer-events-none opacity-40' : 'cursor-pointer hover:text-slate-600'
        }`}
        title="Abrir calendario"
      >
        <Calendar size={16} />
        <input
          id={`${pickerId}-native`}
          type="date"
          disabled={disabled}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          value={value || ''}
          min={min || undefined}
          max={max || undefined}
          onChange={e => {
            const iso = e.target.value;
            if (iso && isOutOfRange(iso)) return;
            onChange(iso);
            setText(formatDateDisplay(iso));
            setInvalid(false);
            setRangeError(false);
          }}
          tabIndex={-1}
          aria-hidden
        />
      </label>
      {invalid && (
        <p className="text-[11px] text-red-600 mt-1">
          {rangeError ? 'La fecha está fuera del rango permitido' : 'Use el formato dd/mm/yyyy'}
        </p>
      )}
    </div>
  );
};
