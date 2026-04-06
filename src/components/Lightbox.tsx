import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useAppStore } from '../store/useAppStore';
import { getLangMap } from '../i18n/translations';

export const Lightbox: React.FC = () => {
  const lightboxId = useAppStore((s) => s.lightboxId);
  const setLightboxId = useAppStore((s) => s.setLightboxId);
  const screenshots = useAppStore((s) => s.screenshots);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  // FIX: use i18n instead of hardcoded 'Isimsiz'
  const lang = useAppStore((s) => s.settings?.ui_language ?? 'en');
  const T = getLangMap(lang);

  const [imgData, setImgData] = useState<string | null>(null);
  const idx = screenshots.findIndex((s) => s.id === lightboxId);
  const ss = idx >= 0 ? screenshots[idx] : null;

  useEffect(() => {
    if (!ss) { setImgData(null); return; }
    setImgData(null);
    invoke<string>('get_image_data', { imagePath: ss.image_path })
      .then(setImgData)
      .catch(console.error);
  }, [ss?.id]);

  useEffect(() => {
    if (!lightboxId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxId(null);
      if (e.key === 'ArrowRight' && idx < screenshots.length - 1) setLightboxId(screenshots[idx + 1].id);
      if (e.key === 'ArrowLeft' && idx > 0) setLightboxId(screenshots[idx - 1].id);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxId, idx]);

  if (!ss) return null;

  return (
    <div className="lightbox" onClick={() => setLightboxId(null)}>
      <div className="lb-img-wrap" onClick={(e) => e.stopPropagation()}>
        {imgData
          ? <img src={imgData} alt={ss.title ?? ''} className="lb-img" />
          : <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />}
      </div>
      <div className="lb-topbar" onClick={(e) => e.stopPropagation()}>
        {/* FIX: T.detail_untitled replaces hardcoded 'Isimsiz' */}
        <span className="lb-title">{ss.title ?? T.detail_untitled}</span>
        {ss.category && <span className="tag">{ss.category}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className="lb-btn" style={{ color: ss.is_favorite ? 'var(--yellow)' : '' }} onClick={() => toggleFavorite(ss.id)}>
            {ss.is_favorite ? '⭐' : '☆'}
          </button>
          <button className="lb-btn" onClick={() => setLightboxId(null)}>✕</button>
        </div>
      </div>
      {idx > 0 && (
        <button className="lb-nav lb-prev" onClick={(e) => { e.stopPropagation(); setLightboxId(screenshots[idx - 1].id); }}>‹</button>
      )}
      {idx < screenshots.length - 1 && (
        <button className="lb-nav lb-next" onClick={(e) => { e.stopPropagation(); setLightboxId(screenshots[idx + 1].id); }}>›</button>
      )}
      <style>{`
        .lightbox { position:fixed; inset:0; z-index:1000; background:rgba(0,0,0,0.92); display:flex; flex-direction:column; align-items:center; justify-content:center; animation:fadeIn .15s ease; backdrop-filter:blur(8px); }
        .lb-img-wrap { flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden; width:100%; padding:60px 80px; }
        .lb-img { max-width:100%; max-height:100%; object-fit:contain; border-radius:4px; }
        .lb-topbar { position:absolute; top:0; left:0; right:0; display:flex; align-items:center; gap:8px; padding:12px 16px; background:linear-gradient(to bottom, rgba(0,0,0,.8), transparent); }
        .lb-title { font-size:14px; font-weight:600; color:var(--text-1); }
        .lb-btn { width:32px; height:32px; background:rgba(255,255,255,.1); border:none; border-radius:6px; color:var(--text-1); font-size:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .lb-nav { position:absolute; top:50%; transform:translateY(-50%); width:48px; height:48px; background:rgba(255,255,255,.1); border:none; border-radius:50%; color:white; font-size:28px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        .lb-prev { left:16px; } .lb-next { right:16px; }
      `}</style>
    </div>
  );
};
