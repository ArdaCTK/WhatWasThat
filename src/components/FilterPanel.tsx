import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getLangMap } from '../i18n/translations';

export const FilterPanel: React.FC = () => {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const resetFilters = useAppStore((s) => s.resetFilters);
  const filterPanelOpen = useAppStore((s) => s.filterPanelOpen);
  const lang = useAppStore((s) => s.settings?.ui_language ?? 'en');
  const tr = useMemo(() => getLangMap(lang), [lang]);
  const [tagInput, setTagInput] = useState('');

  if (!filterPanelOpen) return null;

  const addTag = () => {
    const next = tagInput.trim().toLowerCase();
    if (next && !filters.tags.includes(next)) setFilters({ tags: [...filters.tags, next] });
    setTagInput('');
  };
  const removeTag = (tag: string) => setFilters({ tags: filters.tags.filter((x) => x !== tag) });

  return (
    <div className="filter-panel animate-fade-in">
      <div style={{ padding: '8px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{tr.sidebar_advanced_filter}</span>
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={resetFilters}>{tr.gallery_clear}</button>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ width: 140, fontSize: 12, padding: '4px 8px' }}
            placeholder={tr.fp_tag_add}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
          />
          {filters.tags.map((tag) => (
            <span key={tag} className="tag" style={{ cursor: 'pointer' }} onClick={() => removeTag(tag)}>
              #{tag} ×
            </span>
          ))}
          <label className="fp-check">
            <input type="checkbox" checked={filters.only_low_confidence} onChange={(e) => setFilters({ only_low_confidence: e.target.checked })} />
            <span style={{ fontSize: 12 }}>{tr.sidebar_low_confidence}</span>
          </label>
          <label className="fp-check">
            <input type="checkbox" checked={filters.only_favorites} onChange={(e) => setFilters({ only_favorites: e.target.checked })} />
            <span style={{ fontSize: 12 }}>{tr.sidebar_favorites}</span>
          </label>
          <label className="fp-check">
            <input type="checkbox" checked={filters.include_archived} onChange={(e) => setFilters({ include_archived: e.target.checked })} />
            <span style={{ fontSize: 12 }}>{tr.sidebar_archive}</span>
          </label>
        </div>
      </div>
      <style>{`.filter-panel { background:var(--bg-2); border-bottom:1px solid var(--border); flex-shrink:0; } .fp-check { display:flex; align-items:center; gap:4px; cursor:pointer; }`}</style>
    </div>
  );
};