import React, { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import type { Screenshot } from '../types';
import { useAppStore } from '../store/useAppStore';
import { getLangMap } from '../i18n/translations';

const BUILTIN_CATEGORIES = [
  'Music', 'Film/TV', 'Code/Tech', 'News', 'Shopping',
  'Food', 'Travel', 'Gaming', 'Books', 'Social Media',
  'Work', 'Education', 'Other',
];

export const ScreenshotDetail: React.FC = () => {
  const selectedId = useAppStore((s) => s.selectedId);
  const screenshots = useAppStore((s) => s.screenshots);
  const setSelectedId = useAppStore((s) => s.setSelectedId);
  const deleteWithUndo = useAppStore((s) => s.deleteScreenshotWithUndo);
  const updateScreenshot = useAppStore((s) => s.updateScreenshot);
  const processScreenshot = useAppStore((s) => s.processScreenshot);
  const cancelProcessing = useAppStore((s) => s.cancelProcessing);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const archiveScreenshot = useAppStore((s) => s.archiveScreenshot);
  const processingIds = useAppStore((s) => s.processingIds);
  const settings = useAppStore((s) => s.settings);
  const lang = settings?.ui_language ?? 'en';
  const tr = useMemo(() => getLangMap(lang), [lang]);

  const [imageData, setImageData] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editState, setEditState] = useState<any>({});
  const [showOcr, setShowOcr] = useState(false);
  const [showMasked, setShowMasked] = useState(true);

  const ss = screenshots.find((s) => s.id === selectedId);
  const isProcessing = selectedId ? (processingIds.has(selectedId) || ss?.status === 'processing') : false;
  const threshold = settings?.low_confidence_threshold ?? 0.6;
  const isLowConf = ss?.confidence != null && ss.confidence < threshold && ss?.status === 'done';
  const confPct = ss?.confidence != null ? Math.round(ss.confidence * 100) : null;

  const allCategories = useMemo(() => {
    const custom = (settings?.custom_categories ?? []).map((c: any) => c.name);
    const hidden = (settings as any)?.hidden_default_categories ?? [];
    const builtins = BUILTIN_CATEGORIES.filter((c) => !hidden.includes(c));
    const merged = [...builtins];
    for (const c of custom) {
      if (!merged.includes(c)) merged.push(c);
    }
    return merged;
  }, [settings]);

  useEffect(() => {
    if (!ss) return;
    setImageData(null);
    setEditMode(false);
    setShowOcr(false);
    invoke<string>('get_image_data', { imagePath: ss.image_path, screenshotId: ss.id })
      .then(setImageData)
      .catch(() => { });
  }, [ss?.id]);

  if (!ss) return (
    <aside className="detail-empty">
      <div className="detail-empty-inner"><p>{tr.detail_select_hint}</p></div>
      <style>{`.detail-empty { width:300px; flex-shrink:0; border-left:1px solid var(--border); display:flex; align-items:center; justify-content:center; background:var(--bg-2) } .detail-empty-inner { display:flex; flex-direction:column; align-items:center; gap:10px; color:var(--text-3); font-size:13px; text-align:center }`}</style>
    </aside>
  );

  const saveEdit = async () => {
    await updateScreenshot({
      ...ss,
      title: editState.title ?? ss.title,
      description: editState.description ?? ss.description,
      category: editState.category ?? ss.category,
      source_hint: editState.source_hint ?? ss.source_hint,
      tags: editState.tagsStr !== undefined
        ? editState.tagsStr.split(',').map((x: string) => x.trim()).filter(Boolean)
        : ss.tags,
    });
    setEditMode(false);
    setEditState({});
  };

  // FIX: use locale from settings, not hardcoded 'tr-TR'
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US';

  return (
    <aside className="detail-panel animate-slide-in">
      <div className="dp-header">
        <span className="dp-header-label">Details</span>
        <div className="dp-header-actions">
          <button className="dp-icon-btn" onClick={() => toggleFavorite(ss.id)}>{ss.is_favorite ? '★' : '☆'}</button>
          {!ss.is_archived && <button className="dp-icon-btn" onClick={() => archiveScreenshot(ss.id)}>📦</button>}
          <button className="dp-icon-btn" onClick={() => invoke('export_wwt', { id: ss.id })}>📤</button>
          <button className="dp-icon-btn dp-close" onClick={() => setSelectedId(null)}>✕</button>
        </div>
      </div>
      <div className="dp-scroll">
        <div className="dp-image-wrap">
          {imageData
            ? <img src={imageData} alt={ss.title ?? ''} className="dp-image" />
            : <div className="dp-image-skeleton skeleton" />}
          {isProcessing && <div className="dp-image-overlay"><div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} /></div>}
          {ss.has_sensitive && <div className="dp-sensitive-badge">Sensitive</div>}
        </div>
        {isLowConf && !editMode && (
          <div className="dp-warn-banner">
            <span>{tr.detail_low_conf_warning}</span>
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => processScreenshot(ss.id)} disabled={isProcessing}>{tr.detail_reprocess}</button>
          </div>
        )}
        <div className="dp-content">
          {editMode ? (
            <div className="dp-edit-form">
              <div className="dp-field">
                <label>{tr.detail_title_label}</label>
                <input className="input" defaultValue={ss.title ?? ''} onChange={(e) => setEditState((p: any) => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="dp-field">
                <label>{tr.detail_description_label}</label>
                <textarea className="input" rows={2} defaultValue={ss.description ?? ''} onChange={(e) => setEditState((p: any) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="dp-field">
                <label>{tr.detail_category_label}</label>
                <select className="input" defaultValue={ss.category ?? ''} onChange={(e) => setEditState((p: any) => ({ ...p, category: e.target.value }))}>
                  <option value="">-</option>
                  {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="dp-field">
                <label>{tr.detail_tags_label}</label>
                <input className="input" defaultValue={ss.tags.join(', ')} onChange={(e) => setEditState((p: any) => ({ ...p, tagsStr: e.target.value }))} />
              </div>
              <div className="dp-edit-actions">
                <button className="btn btn-primary" onClick={saveEdit}>{tr.detail_save}</button>
                <button className="btn btn-secondary" onClick={() => setEditMode(false)}>{tr.detail_cancel}</button>
              </div>
            </div>
          ) : (
            <>
              {/* FIX: tr.detail_untitled replaces wrong usage of detail_select_hint as title fallback */}
              <h2 className="dp-title">{ss.title ?? tr.detail_untitled}</h2>
              {ss.description && <p className="dp-description">{ss.description}</p>}
              {ss.tags.length > 0 && <div className="dp-tags">{ss.tags.map((tag) => <span key={tag} className="tag">#{tag}</span>)}</div>}
              {confPct !== null && ss.status === 'done' && (
                <div className="dp-confidence">
                  <div className="dp-conf-header">
                    <span className="dp-conf-label">{tr.detail_confidence}</span>
                    <span className="dp-conf-value">%{confPct}</span>
                  </div>
                  <div className="dp-conf-bar"><div className="dp-conf-fill" style={{ width: `${confPct}%` }} /></div>
                </div>
              )}
              <div className="dp-meta-grid">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text-3)' }}>{tr.detail_date}</span>
                  {/* FIX: use locale from settings */}
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>{new Date(ss.created_at).toLocaleString(locale)}</span>
                </div>
                {ss.detected_language && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-3)' }}>{tr.detail_language}</span>
                    <span style={{ color: 'var(--text-2)' }}>{ss.detected_language}</span>
                  </div>
                )}
                {ss.app_info && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-3)' }}>App</span>
                    <span style={{ color: 'var(--text-2)' }}>{ss.app_info}</span>
                  </div>
                )}
              </div>
              {ss.error_msg && <div className="dp-error">{ss.error_msg}</div>}
            </>
          )}
          {ss.ocr_text && !editMode && (
            <div className="dp-ocr-section">
              <button className="dp-ocr-toggle" onClick={() => setShowOcr(!showOcr)}>
                <span>{tr.detail_ocr_text}</span>
                <span style={{ opacity: .6 }}>{showOcr ? '▲' : '▼'}</span>
              </button>
              {showOcr && (
                <div className="dp-ocr-body">
                  {ss.has_sensitive && ss.ocr_masked && (
                    <div className="dp-ocr-mask-toggle">
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setShowMasked(!showMasked)}>
                        {showMasked ? tr.detail_show_original : tr.detail_show_masked}
                      </button>
                    </div>
                  )}
                  <pre className="dp-ocr-text">{(showMasked && ss.ocr_masked) ? ss.ocr_masked : ss.ocr_text}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="dp-footer">
        {isProcessing && (
          <button className="btn btn-danger dp-footer-btn" onClick={() => cancelProcessing(ss.id)}>{tr.detail_stop}</button>
        )}
        {(ss.status === 'error' || ss.status === 'pending' || isLowConf) && !editMode && (
          <button className="btn btn-primary dp-footer-btn" onClick={() => processScreenshot(ss.id)} disabled={isProcessing}>{tr.detail_reprocess}</button>
        )}
        {!editMode && (
          <button className="btn btn-secondary dp-footer-btn" onClick={() => setEditMode(true)}>{tr.detail_edit}</button>
        )}
        <button className="btn btn-ghost dp-footer-delete" onClick={async () => {
          if (!confirm(tr.detail_delete_confirm)) return;
          await deleteWithUndo(ss.id);
        }}>🗑</button>
      </div>
      <style>{`
        .detail-panel { width:300px; flex-shrink:0; border-left:1px solid var(--border); background:var(--bg-2); display:flex; flex-direction:column; overflow:hidden; }
        .dp-header { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--border); flex-shrink:0; }
        .dp-header-label { font-size:11px; font-family:var(--mono); color:var(--text-3); }
        .dp-header-actions { display:flex; align-items:center; gap:2px; }
        .dp-icon-btn { width:26px; height:26px; border:none; background:transparent; color:var(--text-3); font-size:12px; border-radius:5px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .dp-icon-btn:hover { background:var(--surface-2); color:var(--text-1); }
        .dp-scroll { flex:1; overflow-y:auto; }
        .dp-image-wrap { position:relative; width:100%; aspect-ratio:16/9; background:var(--bg); overflow:hidden; }
        .dp-image { width:100%; height:100%; object-fit:contain; }
        .dp-image-overlay { position:absolute; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; }
        .dp-sensitive-badge { position:absolute; top:8px; right:8px; padding:3px 8px; background:rgba(247,129,102,.9); color:white; border-radius:4px; font-size:11px; font-weight:600; }
        .dp-warn-banner { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 14px; background:rgba(247,129,102,.07); border-bottom:1px solid rgba(247,129,102,.2); font-size:12px; color:var(--orange); }
        .dp-content { padding:14px; display:flex; flex-direction:column; gap:10px; }
        .dp-title { font-size:15px; font-weight:700; margin:0; } .dp-description { font-size:13px; color:var(--text-2); margin:0; }
        .dp-tags { display:flex; flex-wrap:wrap; gap:5px; }
        .dp-confidence { display:flex; flex-direction:column; gap:5px; }
        .dp-conf-header { display:flex; align-items:center; justify-content:space-between; }
        .dp-conf-label { font-size:12px; color:var(--text-2); } .dp-conf-value { font-family:var(--mono); font-size:13px; font-weight:700; color:var(--accent); }
        .dp-conf-bar { height:5px; background:var(--bg); border-radius:3px; overflow:hidden; }
        .dp-conf-fill { height:100%; border-radius:3px; background:var(--accent); }
        .dp-meta-grid { display:flex; flex-direction:column; gap:6px; padding:10px 12px; background:var(--surface); border-radius:var(--radius); border:1px solid var(--border); }
        .dp-error { padding:8px 10px; background:rgba(247,129,102,.08); border:1px solid rgba(247,129,102,.25); border-radius:var(--radius); font-size:12px; color:var(--orange); }
        .dp-ocr-section { border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
        .dp-ocr-toggle { display:flex; align-items:center; justify-content:space-between; width:100%; padding:8px 12px; background:var(--surface); border:none; cursor:pointer; font-size:12px; color:var(--text-2); }
        .dp-ocr-body { background:var(--bg); } .dp-ocr-mask-toggle { padding:6px 10px; border-bottom:1px solid var(--border); }
        .dp-ocr-text { margin:0; padding:10px 12px; font-family:var(--mono); font-size:11px; line-height:1.7; color:var(--text-2); white-space:pre-wrap; word-break:break-word; max-height:180px; overflow-y:auto; user-select:text; }
        .dp-edit-form { display:flex; flex-direction:column; gap:10px; }
        .dp-field { display:flex; flex-direction:column; gap:4px; } .dp-field label { font-size:11px; color:var(--text-3); font-weight:600; }
        .dp-edit-actions { display:flex; gap:7px; }
        .dp-footer { display:flex; align-items:center; gap:6px; padding:10px 14px; border-top:1px solid var(--border); background:var(--surface); flex-shrink:0; }
        .dp-footer-btn { flex:1; font-size:12px; padding:7px 10px; } .dp-footer-delete { padding:7px 9px; color:var(--text-3); flex-shrink:0; }
        .dp-image-skeleton { width:100%; height:100%; }
      `}</style>
    </aside>
  );
};
