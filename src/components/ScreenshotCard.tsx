import React, { memo } from 'react';
import type { Screenshot, ViewMode } from '../types';
import { useAppStore } from '../store/useAppStore';
import { getLangMap } from '../i18n/translations';

interface Props { screenshot: Screenshot; selected: boolean; viewMode: ViewMode; }

export const ScreenshotCard: React.FC<Props> = memo(({ screenshot: ss, selected, viewMode }) => {
  const setSelectedId = useAppStore((s) => s.setSelectedId);
  const setLightboxId = useAppStore((s) => s.setLightboxId);
  const selectMode = useAppStore((s) => s.selectMode);
  const selectedIds = useAppStore((s) => s.selectedIds);
  const toggleSelectId = useAppStore((s) => s.toggleSelectId);
  const processingIds = useAppStore((s) => s.processingIds);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const archiveScreenshot = useAppStore((s) => s.archiveScreenshot);
  const settings = useAppStore((s) => s.settings);

  // FIX: use i18n instead of hardcoded 'Isimsiz'
  const lang = settings?.ui_language ?? 'en';
  const T = getLangMap(lang);

  const isProcessing = processingIds.has(ss.id) || ss.status === 'processing';
  const isChecked = selectedIds.has(ss.id);
  const threshold = settings?.low_confidence_threshold ?? 0.6;
  const isLowConf = ss.confidence != null && ss.confidence < threshold && ss.status === 'done';
  const confPct = ss.confidence != null ? Math.round(ss.confidence * 100) : null;

  // FIX: use locale from settings instead of hardcoded 'tr-TR'
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US';
  const date = new Date(ss.created_at);
  const timeStr = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  const handleClick = (e: React.MouseEvent) => {
    if (selectMode) { toggleSelectId(ss.id); return; }
    if (e.detail === 2) { setLightboxId(ss.id); return; }
    setSelectedId(selected ? null : ss.id);
  };

  if (viewMode === 'list') {
    return (
      <div className={`lc-row ${selected ? 'selected' : ''} ${isLowConf ? 'low-conf' : ''}`} onClick={handleClick} role="button" tabIndex={0}>
        <div className="lc-thumb">
          {ss.image_thumb ? <img src={ss.image_thumb} alt="" loading="lazy" /> : <div style={{ width:'100%', height:'100%', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-3)', fontSize:10 }}>📷</div>}
          {selectMode && <div className={`lc-check ${isChecked ? 'checked' : ''}`}>{isChecked && <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>}</div>}
        </div>
        <div className="lc-content">
          {/* FIX: T.detail_untitled replaces hardcoded 'Isimsiz' */}
          <div className="lc-title">{ss.title ?? T.detail_untitled}</div>
          <div className="lc-meta">{ss.category && <span className="tag" style={{ fontSize: 10 }}>{ss.category}</span>}{ss.tags.slice(0,3).map((t) => <span key={t} className="tag" style={{ fontSize: 10 }}>#{t}</span>)}</div>
        </div>
        <div className="lc-right">
          {confPct != null && <span className="mono" style={{ fontSize: 10, color: confPct >= 80 ? 'var(--green)' : confPct >= 60 ? 'var(--yellow)' : 'var(--orange)' }}>%{confPct}</span>}
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{dateStr} {timeStr}</span>
          <button className="sc-action-btn" onClick={(e) => { e.stopPropagation(); toggleFavorite(ss.id); }} style={{ color: ss.is_favorite ? 'var(--yellow)' : '' }}>{ss.is_favorite ? '⭐' : '☆'}</button>
        </div>
        <style>{`.lc-row { display:flex; align-items:center; gap:12px; padding:8px 12px; border-bottom:1px solid var(--border); cursor:pointer; transition:background .1s; animation:fadeIn .15s ease; } .lc-row:hover { background:var(--surface); } .lc-row.selected { background:var(--accent-glow); } .lc-row.low-conf { border-left:2px solid var(--orange); } .lc-thumb { width:64px; height:40px; flex-shrink:0; border-radius:4px; overflow:hidden; position:relative; background:var(--bg-2); } .lc-thumb img { width:100%; height:100%; object-fit:cover; } .lc-check { position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:3px; border:1.5px solid rgba(255,255,255,.7); background:rgba(13,17,23,.6); display:flex; align-items:center; justify-content:center; } .lc-check.checked { background:var(--accent); border-color:var(--accent); } .lc-content { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; } .lc-title { font-size:13px; font-weight:500; color:var(--text-1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .lc-meta { display:flex; align-items:center; gap:6px; flex-wrap:wrap; } .lc-right { display:flex; align-items:center; gap:10px; flex-shrink:0; } .sc-action-btn { width:26px; height:26px; border-radius:5px; border:none; background:rgba(13,17,23,.75); color:var(--text-1); font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; }`}</style>
      </div>
    );
  }

  return (
    <article className={`sc-card ${selected ? 'selected' : ''} ${isLowConf ? 'low-conf' : ''} ${ss.is_archived ? 'archived' : ''}`} onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleClick(e as any)}>
      <div className="sc-thumb">
        {ss.image_thumb ? <img src={ss.image_thumb} alt={ss.title ?? ''} loading="lazy" className={ss.has_sensitive ? 'sc-sensitive-thumb' : ''} /> : <div className="sc-thumb-empty">📷</div>}
        {isProcessing && <div className="sc-processing-overlay"><div className="spinner"/></div>}
        {selectMode && <div className={`sc-checkbox ${isChecked ? 'checked' : ''}`}>{isChecked && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>}</div>}
        {!selectMode && (
          <div className="sc-hover-actions">
            <button className="sc-action-btn" onClick={(e) => { e.stopPropagation(); setLightboxId(ss.id); }} title="Fullscreen">⛶</button>
            <button className="sc-action-btn" style={{ color: ss.is_favorite ? 'var(--yellow)' : '' }} onClick={(e) => { e.stopPropagation(); toggleFavorite(ss.id); }}>{ss.is_favorite ? '⭐' : '☆'}</button>
            {!ss.is_archived && <button className="sc-action-btn" onClick={(e) => { e.stopPropagation(); archiveScreenshot(ss.id); }}>📦</button>}
          </div>
        )}
        {ss.category && <div className="sc-badges"><span className="sc-badge">{ss.category}</span></div>}
      </div>
      <div className="sc-body">
        {/* FIX: T.detail_untitled replaces hardcoded 'Isimsiz' */}
        <div className="sc-title">{ss.title ?? (ss.ocr_text ? ss.ocr_text.slice(0, 55) + '…' : T.detail_untitled)}</div>
        <div className="sc-footer">
          <span className="sc-time mono">{dateStr} {timeStr}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {ss.is_favorite && <span style={{ fontSize: 11 }}>⭐</span>}
            {confPct != null && ss.status === 'done' && <span className="mono" style={{ fontSize: 10, color: confPct >= 80 ? 'var(--green)' : confPct >= 60 ? 'var(--yellow)' : 'var(--orange)' }}>%{confPct}{confPct < 60 ? ' ⚠' : ''}</span>}
            {ss.status === 'processing' && <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }}/>}
            {ss.status === 'error' && <span style={{ fontSize: 10, color: 'var(--orange)' }}>✗</span>}
          </div>
        </div>
        {ss.tags.length > 0 && <div className="sc-tags">{ss.tags.slice(0, 3).map((t) => <span key={t} className="tag">#{t}</span>)}</div>}
      </div>
      <style>{`
        .sc-card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; cursor:pointer; transition:all .15s ease; animation:fadeIn .2s ease; display:flex; flex-direction:column; position:relative; }
        .sc-card:hover { border-color:var(--border-2); transform:translateY(-2px); box-shadow:var(--shadow); }
        .sc-card.selected { border-color:var(--accent); box-shadow:0 0 0 2px var(--accent-glow),var(--shadow); }
        .sc-card.low-conf::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--orange); z-index:1; }
        .sc-card.archived { opacity:.6; }
        .sc-thumb { position:relative; aspect-ratio:16/9; background:var(--bg-2); overflow:hidden; flex-shrink:0; }
        .sc-thumb img { width:100%; height:100%; object-fit:cover; transition:transform .3s; }
        .sc-sensitive-thumb { filter:blur(16px) saturate(.2); transform:scale(1.08); }
        .sc-card:hover .sc-thumb img { transform:scale(1.04); }
        .sc-thumb-empty { display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:var(--text-3); font-size:24px; }
        .sc-processing-overlay { position:absolute; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; }
        .sc-checkbox { position:absolute; top:8px; left:8px; width:20px; height:20px; border-radius:5px; border:2px solid rgba(255,255,255,.7); background:rgba(13,17,23,.6); display:flex; align-items:center; justify-content:center; }
        .sc-checkbox.checked { background:var(--accent); border-color:var(--accent); }
        .sc-hover-actions { position:absolute; top:6px; right:6px; display:flex; gap:4px; opacity:0; transition:opacity .15s; z-index:2; }
        .sc-card:hover .sc-hover-actions { opacity:1; }
        .sc-action-btn { width:26px; height:26px; border-radius:5px; border:none; background:rgba(13,17,23,.75); color:var(--text-1); font-size:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .sc-badges { position:absolute; bottom:6px; left:6px; right:6px; display:flex; gap:4px; flex-wrap:wrap; }
        .sc-badge { padding:2px 7px; background:rgba(13,17,23,.85); backdrop-filter:blur(8px); border-radius:4px; font-size:10px; font-weight:500; color:var(--text-1); border:1px solid var(--border); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
        .sc-body { padding:10px; display:flex; flex-direction:column; gap:5px; flex:1; }
        .sc-title { font-size:13px; font-weight:600; color:var(--text-1); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .sc-footer { display:flex; align-items:center; justify-content:space-between; margin-top:auto; gap:4px; }
        .sc-time { font-size:10px; color:var(--text-3); white-space:nowrap; }
        .sc-tags { display:flex; flex-wrap:wrap; gap:3px; }
      `}</style>
    </article>
  );
});
