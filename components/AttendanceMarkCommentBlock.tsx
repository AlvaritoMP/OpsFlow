import React, { useEffect, useState } from 'react';
import { MessageSquare, Pencil, Save, X, Loader2 } from 'lucide-react';
import { attendanceReportService } from '../services/attendanceReportService';

export interface AttendanceMarkCommentBlockProps {
  rowId: string;
  fileNotes?: string | null;
  userComment?: string | null;
  canEdit: boolean;
  onSaved: () => void;
  /** Resaltar cuando la marca es incompleta (UI opcional). */
  emphasizeIncomplete?: boolean;
  attendanceStatus?: string | null;
}

export const AttendanceMarkCommentBlock: React.FC<AttendanceMarkCommentBlockProps> = ({
  rowId,
  fileNotes,
  userComment,
  canEdit,
  onSaved,
  emphasizeIncomplete,
  attendanceStatus,
}) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(userComment?.trim() || '');
  const [saving, setSaving] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  useEffect(() => {
    setText(userComment?.trim() || '');
  }, [userComment, rowId]);

  const s = (attendanceStatus || '').toLowerCase();
  const looksIncomplete =
    emphasizeIncomplete !== false &&
    (s.includes('incompleta') || s.includes('marcación incompleta') || s.includes('marcacion incompleta'));

  const save = async () => {
    setSaving(true);
    setLocalErr(null);
    try {
      const v = text.trim() || null;
      await attendanceReportService.updateRowUserComment(rowId, v);
      setEditing(false);
      onSaved();
    } catch (e: unknown) {
      setLocalErr(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setText(userComment?.trim() || '');
    setEditing(false);
    setLocalErr(null);
  };

  const hasUser = Boolean(userComment?.trim());
  const hasFile = Boolean(fileNotes?.trim());

  return (
    <div
      className={`rounded-lg border p-2.5 text-xs ${
        looksIncomplete && !hasUser
          ? 'border-amber-200 bg-amber-50/50'
          : 'border-slate-200 bg-slate-50/60'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 font-semibold text-slate-600">
          <MessageSquare size={14} className="text-slate-500 shrink-0" />
          Comentario (OpsFlow)
        </div>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
          >
            <Pencil size={12} />
            {hasUser ? 'Editar' : 'Añadir'}
          </button>
        )}
      </div>

      {hasFile && (
        <p className="text-[11px] text-slate-500 mb-1.5">
          <span className="font-medium text-slate-600">Notas del archivo:</span> {fileNotes}
        </p>
      )}

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Explicación sobre la marca (motivo de incompleta, permiso, etc.)"
          />
          <p className="text-[10px] text-slate-400">{text.length}/2000</p>
          {localErr && <p className="text-[11px] text-red-600">{localErr}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 text-white px-2.5 py-1 text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Guardar
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              <X size={12} /> Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-800">
          {hasUser ? (
            <p className="whitespace-pre-wrap break-words">{userComment}</p>
          ) : (
            <p className="text-slate-400 italic">
              {canEdit ? 'Sin comentario. Pulsa «Añadir» para registrar el detalle.' : 'Sin comentario registrado.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
