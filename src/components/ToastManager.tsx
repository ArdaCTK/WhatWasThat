import React from 'react';
import { useAppStore } from '../store/useAppStore';

export const ToastManager: React.FC = () => {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);
  const undoDelete = useAppStore((s) => s.undoDelete);
  if (toasts.length === 0) return null;
  const ICONS: Record<string, string> = { info:'ℹ', success:'✓', warning:'⚠', error:'✗' };
  const COLORS: Record<string, string> = { info:'var(--accent)', success:'var(--green)', warning:'var(--orange)', error:'var(--orange)' };
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon" style={{ color: COLORS[t.type] }}>{ICONS[t.type]}</span>
          <span className="toast-msg">{t.message}</span>
          {t.undoId && <button className="toast-undo" onClick={() => { undoDelete(); removeToast(t.id); }}>Geri Al</button>}
          <button className="toast-close" onClick={() => removeToast(t.id)}>×</button>
        </div>
      ))}
      <style>{`.toast-container{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;}.toast{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface-2);border:1px solid var(--border-2);border-radius:var(--radius-lg);box-shadow:0 8px 24px rgba(0,0,0,0.5);font-size:13px;color:var(--text-1);min-width:260px;max-width:380px;pointer-events:all;animation:slideInRight 0.2s ease;}@keyframes slideInRight{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}.toast-icon{font-size:14px;flex-shrink:0;}.toast-msg{flex:1;line-height:1.4;font-size:12px;}.toast-undo{flex-shrink:0;padding:3px 10px;border-radius:4px;border:1px solid var(--accent);background:var(--accent-glow);color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;}.toast-undo:hover{background:var(--accent);color:var(--bg);}.toast-close{flex-shrink:0;width:18px;height:18px;border:none;background:none;color:var(--text-3);font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:3px;}.toast-close:hover{background:var(--surface);color:var(--text-1);}`}</style>
    </div>
  );
};
