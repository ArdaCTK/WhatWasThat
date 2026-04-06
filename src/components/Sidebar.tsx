import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { getLangMap } from '../i18n/translations';

export const Sidebar: React.FC = () => {
  const categories = useAppStore((s) => s.categories);
  const stats = useAppStore((s) => s.stats);
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const lang = useAppStore((s) => s.settings?.ui_language ?? 'en');
  const T = getLangMap(lang);

  if (!sidebarOpen) return null;

  const isAllActive = !filters.category && !filters.only_low_confidence &&
    !filters.only_favorites && !filters.only_archived && !filters.only_error;

  const clearViewFilters = () => ({
    only_favorites: false,
    only_low_confidence: false,
    only_archived: false,
    only_error: false,
    category: undefined,
  });

  return (
    <nav className="sidebar">
      <div className="sb-section">
        <div className="sb-label mono">/ {T.sidebar_view}</div>
        <SbBtn active={isAllActive} onClick={resetFilters} icon="🗂️" label={T.sidebar_all} count={stats?.total} />
        {(stats?.favorites_count ?? 0) > 0 && (
          <SbBtn
            active={filters.only_favorites && !filters.only_low_confidence && !filters.only_archived && !filters.only_error}
            onClick={() => setFilters({ ...clearViewFilters(), only_favorites: !filters.only_favorites })}
            icon="⭐" label={T.sidebar_favorites} count={stats?.favorites_count}
          />
        )}
        <SbBtn
          active={filters.only_low_confidence}
          warning
          onClick={() => setFilters({ ...clearViewFilters(), only_low_confidence: !filters.only_low_confidence })}
          icon="⚠️" label={T.sidebar_low_confidence} count={stats?.low_confidence_count ?? 0}
        />
        <SbBtn
          active={filters.only_error}
          danger
          onClick={() => setFilters({ ...clearViewFilters(), only_error: !filters.only_error })}
          icon="❌" label={T.sidebar_errors} count={stats?.error_count ?? 0}
        />
        <SbBtn
          active={filters.only_archived}
          muted
          onClick={() => setFilters({
            ...clearViewFilters(),
            only_archived: !filters.only_archived,
            include_archived: !filters.only_archived,
          })}
          icon="📦"
          label={T.sidebar_archive}
        />
      </div>

      {categories.length > 0 && (
        <div className="sb-section">
          <div className="sb-label mono">/ {T.sidebar_categories}</div>
          {categories.map((cat) => (
            <SbBtn
              key={cat.name}
              active={filters.category === cat.name && !filters.only_low_confidence && !filters.only_favorites && !filters.only_archived && !filters.only_error}
              onClick={() => setFilters({
                ...clearViewFilters(),
                category: filters.category === cat.name ? undefined : cat.name,
              })}
              icon={cat.icon}
              label={cat.name}
              count={cat.count}
            />
          ))}
        </div>
      )}

      <style>{`
        .sidebar { width:196px; flex-shrink:0; border-right:1px solid var(--border); background:var(--bg-2); overflow-y:auto; padding:8px 0; display:flex; flex-direction:column; }
        .sb-section { padding:6px 0; border-bottom:1px solid var(--border); }
        .sb-label { padding:4px 14px 6px; font-size:10px; color:var(--text-3); letter-spacing:.05em; }
      `}</style>
    </nav>
  );
};

const SbBtn: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  count?: number;
  warning?: boolean;
  danger?: boolean;
  muted?: boolean;
}> = ({ active, onClick, icon, label, count, warning, danger, muted }) => (
  <button
    className={`sb-btn ${active ? (warning ? 'active-warn' : danger ? 'active-danger' : 'active') : ''} ${muted ? 'muted' : ''}`}
    onClick={onClick}
  >
    <span className="sb-icon">{icon}</span>
    <span className="sb-name">{label}</span>
    {count !== undefined && <span className="sb-count">{count}</span>}
    <style>{`
      .sb-btn { display:flex; align-items:center; gap:8px; width:100%; padding:7px 14px; background:none; border:none; color:var(--text-2); font-size:13px; cursor:pointer; transition:all .1s; text-align:left; }
      .sb-btn:hover { background:var(--surface); color:var(--text-1); }
      .sb-btn.active { background:var(--accent-glow); color:var(--accent); }
      .sb-btn.active-warn { background:rgba(247,129,102,.1); color:var(--orange); }
      .sb-btn.active-danger { background:rgba(239,68,68,.1); color:#ef4444; }
      .sb-btn.muted { opacity:.7; }
      .sb-icon { font-size:14px; flex-shrink:0; }
      .sb-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .sb-count { font-family:var(--mono); font-size:11px; color:var(--text-3); }
    `}</style>
  </button>
);