import React from 'react';
import { appWindow } from '@tauri-apps/api/window';
import { useAppStore } from '../store/useAppStore';
import { getLangMap } from '../i18n/translations';

export const Titlebar: React.FC = () => {
  const lang = useAppStore((s) => s.settings?.ui_language ?? 'en');
  const tr = getLangMap(lang);

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <div className="titlebar-logo">
          <span className="logo-icon">W</span>
          <span className="logo-text mono">WhatWasThat</span>
        </div>
        <span className="titlebar-sub mono">{tr.titlebar_subtitle}</span>
      </div>
      <div className="titlebar-controls">
        <button className="win-btn minimize" onClick={() => appWindow.minimize()} title={tr.titlebar_minimize}>
          <svg width="10" height="1" viewBox="0 0 10 1"><line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
        <button className="win-btn maximize" onClick={() => appWindow.toggleMaximize()} title={tr.titlebar_maximize}>
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
        <button className="win-btn close" onClick={() => appWindow.hide()} title={tr.titlebar_hide}>
          <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" /><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </div>
      <style>{`.titlebar{display:flex;align-items:center;justify-content:space-between;height:40px;padding:0 12px 0 16px;background:var(--bg);border-bottom:1px solid var(--border);flex-shrink:0;-webkit-app-region:drag;user-select:none;}.titlebar-left{display:flex;align-items:center;gap:12px;}.titlebar-logo{display:flex;align-items:center;gap:6px;}.logo-icon{font-size:13px;font-weight:700;color:var(--accent);line-height:1;border:1px solid var(--accent);border-radius:4px;padding:2px 4px;}.logo-text{font-size:13px;font-weight:700;color:var(--text-1);letter-spacing:.02em;}.titlebar-sub{font-size:10px;color:var(--text-3);letter-spacing:.05em;}.titlebar-controls{display:flex;gap:4px;-webkit-app-region:no-drag;}.win-btn{width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:var(--text-3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;}.win-btn:hover{background:var(--surface-2);color:var(--text-1);}.win-btn.close:hover{background:rgba(247,129,102,0.2);color:var(--orange);}`}</style>
    </div>
  );
};