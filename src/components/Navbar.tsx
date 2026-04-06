import React from 'react';
import type { AppView } from '../types';
import { useAppStore } from '../store/useAppStore';
import { getLangMap } from '../i18n/translations';

export const Navbar: React.FC = () => {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const processingIds = useAppStore((s) => s.processingIds);
  const lang = useAppStore((s) => s.settings?.ui_language ?? 'en');
  const tr = getLangMap(lang);

  const TABS = [
    { id: 'gallery' as AppView, label: tr.nav_gallery },
    { id: 'stats' as AppView, label: tr.nav_stats },
    { id: 'settings' as AppView, label: tr.nav_settings },
  ];

  return (
    <nav className="navbar">
      <div className="navbar-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${view === tab.id ? 'active' : ''}`}
            onClick={() => setView(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.id === 'gallery' && processingIds.size > 0 && (
              <span className="nav-badge">{processingIds.size}</span>
            )}
          </button>
        ))}
      </div>
      <style>{`
        .navbar { display:flex; align-items:center; height:44px; padding:0 10px; background:var(--bg-2); border-bottom:1px solid var(--border); flex-shrink:0; -webkit-app-region:drag; }
        .navbar-tabs { -webkit-app-region:no-drag; display:flex; align-items:center; gap:2px; }
        .nav-tab { display:flex; align-items:center; gap:5px; padding:5px 12px; border-radius:var(--radius); border:none; background:none; color:var(--text-2); font-family:var(--sans); font-size:12px; font-weight:500; cursor:pointer; transition:all .15s; }
        .nav-tab:hover { background:var(--surface); color:var(--text-1); }
        .nav-tab.active { background:var(--surface-2); color:var(--accent); }
        .nav-badge { display:inline-flex; align-items:center; justify-content:center; min-width:15px; height:15px; padding:0 3px; background:var(--accent); color:var(--bg); border-radius:8px; font-size:9px; font-weight:700; font-family:var(--mono); }
      `}</style>
    </nav>
  );
};