import React, { useEffect, useMemo, useRef, useState } from 'react';
import { HelpCircle, X, Search, ChevronRight, BookOpen, List } from 'lucide-react';
import {
  HELP_TOPICS,
  HelpTopic,
  getHelpTopic,
  resolveHelpTopicId,
} from '../data/helpContent';

export type HelpPanelView =
  | 'dashboard'
  | 'units'
  | 'settings'
  | 'control-center'
  | 'client-control-center'
  | 'reports'
  | 'audit-logs'
  | 'operations-dashboard'
  | 'assets-catalog'
  | 'retenes'
  | 'night-supervision'
  | 'supervision-planning'
  | 'headcount'
  | 'vacations'
  | 'archive'
  | 'workers-management'
  | 'ats-reception'
  | 'ats-presentations'
  | 'hr-opalosis'
  | 'inventory'
  | 'supervision-planning';

interface HelpPanelProps {
  open: boolean;
  onClose: () => void;
  currentView: HelpPanelView;
  selectedUnitId: string | null;
}

export const HelpPanel: React.FC<HelpPanelProps> = ({
  open,
  onClose,
  currentView,
  selectedUnitId,
}) => {
  const contextualId = resolveHelpTopicId(currentView, selectedUnitId);
  const [activeId, setActiveId] = useState<HelpTopic['id']>(contextualId);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'topic' | 'index'>('topic');
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setActiveId(contextualId);
    setMode('topic');
    setQuery('');
    const t = window.setTimeout(() => searchRef.current?.focus(), 180);
    return () => window.clearTimeout(t);
  }, [open, contextualId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const topic = getHelpTopic(activeId);

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return HELP_TOPICS;
    return HELP_TOPICS.filter((t) => {
      const haystack = [
        t.title,
        t.navLabel,
        t.summary,
        ...t.sections.flatMap((s) => [
          s.heading,
          s.body,
          ...(s.steps || []),
          ...(s.tips || []),
        ]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  if (!open) return null;

  const selectTopic = (id: HelpTopic['id']) => {
    setActiveId(id);
    setMode('topic');
    setQuery('');
    panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="fixed inset-0 z-[90] flex justify-end" role="dialog" aria-modal="true" aria-label="Ayuda de OpsFlow">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        aria-label="Cerrar ayuda"
        onClick={onClose}
      />

      <aside
        className="relative z-[91] flex h-full w-full max-w-md flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-200 bg-slate-900 px-4 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <HelpCircle size={20} className="shrink-0 text-blue-300" />
                <h2 className="text-lg font-semibold tracking-tight">Ayuda</h2>
              </div>
              <p className="mt-1 text-xs text-slate-300">
                Guía de uso según la pantalla actual y el resto de módulos.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mt-3 flex gap-1 rounded-lg bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => {
                setActiveId(contextualId);
                setMode('topic');
              }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                mode === 'topic' && activeId === contextualId
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <BookOpen size={14} />
              Esta pantalla
            </button>
            <button
              type="button"
              onClick={() => setMode('index')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                mode === 'index'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <List size={14} />
              Índice
            </button>
          </div>

          <div className="relative mt-3">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim()) setMode('index');
              }}
              placeholder="Buscar en la ayuda…"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div ref={panelRef} className="min-h-0 flex-1 overflow-y-auto">
          {mode === 'index' || query.trim() ? (
            <div className="p-3">
              {filteredTopics.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-slate-500">
                  No hay resultados para “{query}”.
                </p>
              ) : (
                <ul className="space-y-1">
                  {filteredTopics.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => selectTopic(t.id)}
                        className={`flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors ${
                          t.id === activeId && mode === 'topic'
                            ? 'bg-blue-50 text-blue-900'
                            : 'hover:bg-slate-50 text-slate-800'
                        }`}
                      >
                        <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-400" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{t.navLabel}</span>
                          <span className="mt-0.5 block text-xs text-slate-500 line-clamp-2">
                            {t.summary}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <article className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">
                {topic.id === contextualId ? 'Pantalla actual' : 'Tema'}
              </p>
              <h3 className="mt-1 text-xl font-semibold text-slate-900">{topic.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{topic.summary}</p>

              <div className="mt-6 space-y-6">
                {topic.sections.map((section) => (
                  <section key={section.heading}>
                    <h4 className="text-sm font-semibold text-slate-900">{section.heading}</h4>
                    {section.body ? (
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{section.body}</p>
                    ) : null}
                    {section.steps && section.steps.length > 0 ? (
                      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
                        {section.steps.map((step) => (
                          <li key={step} className="leading-relaxed pl-1">
                            {step}
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    {section.tips && section.tips.length > 0 ? (
                      <ul className="mt-3 space-y-1.5 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2.5">
                        {section.tips.map((tip) => (
                          <li key={tip} className="text-xs leading-relaxed text-amber-950">
                            <span className="font-semibold">Tip:</span> {tip}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setMode('index')}
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <List size={16} />
                Ver todos los temas
              </button>
            </article>
          )}
        </div>
      </aside>
    </div>
  );
};

interface HelpTriggerButtonProps {
  onClick: () => void;
  variant?: 'header' | 'floating' | 'sidebar';
}

export const HelpTriggerButton: React.FC<HelpTriggerButtonProps> = ({
  onClick,
  variant = 'header',
}) => {
  if (variant === 'floating') {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Ayuda"
        aria-label="Abrir ayuda"
        className="hidden md:flex fixed bottom-5 right-5 z-40 items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/25 ring-1 ring-white/10 transition hover:bg-slate-800 hover:shadow-xl"
      >
        <HelpCircle size={18} className="text-blue-300" />
        Ayuda
      </button>
    );
  }

  if (variant === 'sidebar') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center space-x-2 md:space-x-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg transition-colors text-sm md:text-base min-w-0 text-slate-400 hover:bg-slate-800 hover:text-white"
      >
        <HelpCircle size={18} className="md:w-5 md:h-5 shrink-0" />
        <span className="truncate min-w-0">Ayuda</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title="Ayuda"
      aria-label="Abrir ayuda"
      className="text-slate-600 p-1 rounded-lg hover:bg-slate-100 hover:text-blue-600"
    >
      <HelpCircle size={22} />
    </button>
  );
};
