import React from 'react';

export const InvCard: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white border border-slate-200 rounded-xl shadow-sm p-5 md:p-6 ${className}`}>{children}</div>
);

export const InvModal = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  maxWidth?: string;
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex justify-center items-center p-4 print-container" onClick={onClose}>
      <div
        className={`bg-white border border-slate-200 rounded-xl shadow-2xl w-full ${maxWidth} mx-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-200 flex justify-between items-center print:hidden">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none px-2">
            ×
          </button>
        </div>
        <div className="p-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const InvButton = ({
  children,
  onClick,
  className = 'bg-blue-600 hover:bg-blue-700 text-white',
  type = 'button',
  disabled = false,
  title,
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  title?: string;
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`inline-flex items-center justify-center gap-2 font-semibold py-2 px-3 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  >
    {children}
  </button>
);

export const InvInput = ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
    <input
      {...props}
      className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    />
  </div>
);

export const InvTextarea = ({
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
    <textarea
      {...props}
      className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    />
  </div>
);

export const InvSelect = ({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children?: React.ReactNode }) => (
  <div>
    <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
    <select
      {...props}
      className="w-full bg-white border border-slate-300 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    >
      {children}
    </select>
  </div>
);

export const exportToCsv = (filename: string, headers: string[], data: (string | number)[][]) => {
  const escapeCSV = (value: unknown): string => {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const rows = data.map((row) => row.map(escapeCSV).join(','));
  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
