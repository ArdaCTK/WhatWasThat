import React, { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { useAppStore } from '../store/useAppStore';
import { ScreenshotCard } from '../components/ScreenshotCard';
import { ScreenshotDetail } from '../components/ScreenshotDetail';
import { Sidebar } from '../components/Sidebar';
import type { ViewMode } from '../types';
import { getLangMap } from '../i18n/translations';

const PAGE_SIZE = 40;

const VIEW_ICONS: Record<ViewMode, React.ReactNode> = {
  grid: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  masonry: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="11" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="17" width="7" height="4" rx="1" /><rect x="14" y="13" width="7" height="8" rx="1" />
    </svg>
  ),
  list: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  ),
  timeline: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="6" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="18" r="2" />
      <line x1="12" y1="8" x2="12" y2="10" /><line x1="12" y1="14" x2="12" y2="16" />
    </svg>
  ),
};

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  grid: 'Grid', masonry: 'Masonry', list: 'List', timeline: 'Timeline',
};

export const Gallery: React.FC = () => {
  const screenshots = useAppStore((s) => s.screenshots);
  const isLoading = useAppStore((s) => s.isLoading);
  const selectedId = useAppStore((s) => s.selectedId);
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const selectMode = useAppStore((s) => s.selectMode);
  const selectedIds = useAppStore((s) => s.selectedIds);
  const toggleSelectMode = useAppStore((s) => s.toggleSelectMode);
  const selectAll = useAppStore((s) => s.selectAll);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const selectLowConf = useAppStore((s) => s.selectLowConfidence);
  const bulkReprocess = useAppStore((s) => s.bulkReprocess);
  const stats = useAppStore((s) => s.stats);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const deleteWithUndo = useAppStore((s) => s.deleteScreenshotWithUndo);
  const undoDelete = useAppStore((s) => s.undoDelete);
  const canUndo = useAppStore((s) => s.canUndo);

  const importImages = useAppStore((s) => s.importImages);
  const lang = useAppStore((s) => s.settings?.ui_language ?? 'en');
  const T = getLangMap(lang);

  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [dupToast, setDupToast] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleCount((n) => n + PAGE_SIZE); },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [screenshots.length]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filters]);

  // Duplicate detection toast
  useEffect(() => {
    const unsub = listen<{ original_id: string; hamming: number }>('screenshot:duplicate', ({ payload }) => {
      setDupToast(`${T.toast_duplicate_detected} (${Math.round((1 - payload.hamming / 64) * 100)}% similar)`);
      setTimeout(() => setDupToast(null), 4000);
    });
    return () => { unsub.then((fn) => fn()); };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'Escape' && selectMode) { toggleSelectMode(); return; }
      if (!isInput) {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !selectMode) {
          e.preventDefault(); deleteWithUndo(selectedId); return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && canUndo) { e.preventDefault(); undoDelete(); return; }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectMode, selectedId, canUndo]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ query: e.target.value || undefined });
  }, []);

  const handleBulkReprocess = async () => {
    if (!selectedIds.size) return;
    setBulkLoading(true);
    try {
      const r = await bulkReprocess(Array.from(selectedIds));
      setBulkMsg(`✓ ${r.queued} ${T.gallery_process_selected}`);
      setTimeout(() => setBulkMsg(null), 4000);
    } finally { setBulkLoading(false); }
  };

  const handleImport = async () => {
    try {
      const paths = await invoke<string[]>('pick_files');
      if (!paths || paths.length === 0) return;
      setImporting(true);
      const imported = await importImages(paths);
      setBulkMsg(`✓ ${imported.length} ${T.gallery_import_success}`);
      setTimeout(() => setBulkMsg(null), 4000);
    } catch (e) {
      console.error('Import failed', e);
    } finally {
      setImporting(false);
    }
  };

  const visibleScreenshots = screenshots.slice(0, visibleCount);

  const activeFilterCount = [
    filters.date_from, filters.date_to, filters.app_filter,
    ...(filters.tags ?? []),
  ].filter(Boolean).length +
    (filters.only_low_confidence ? 1 : 0) +
    (filters.only_favorites ? 1 : 0) +
    (filters.only_archived ? 1 : 0);

  const hasAnyFilter = !!(filters.query || filters.category || filters.only_low_confidence || filters.only_archived);

  return (
    <div className="gallery-layout">
      <Sidebar />
      <div className="gallery-main">
        {/* Topbar */}
        <div className="gallery-topbar">
          <div className="search-wrap">
            <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              className="search-input"
              type="text"
              placeholder={T.gallery_search_placeholder}
              defaultValue={filters.query ?? ''}
              onChange={handleSearch}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="view-toggle">
              {(Object.keys(VIEW_ICONS) as ViewMode[]).map((m) => (
                <button key={m} className={`view-btn ${viewMode === m ? 'active' : ''}`} onClick={() => setViewMode(m)} title={VIEW_MODE_LABELS[m]}>
                  {VIEW_ICONS[m]}
                </button>
              ))}
            </div>
            {activeFilterCount > 0 && (
              <span className="filter-badge">{activeFilterCount} {T.gallery_filters}</span>
            )}
            {(stats?.low_confidence_count ?? 0) > 0 && (
              <button
                className={`btn btn-secondary ${filters.only_low_confidence ? 'active-filter' : ''}`}
                style={{ fontSize: 11, padding: '4px 9px' }}
                onClick={() => setFilters({ only_low_confidence: !filters.only_low_confidence })}
              >
                ⚠ {stats?.low_confidence_count}
              </button>
            )}
            {/* Import existing screenshots */}
            <button
              className="btn btn-secondary"
              style={{ fontSize: 11, padding: '4px 9px' }}
              onClick={handleImport}
              disabled={importing}
              title={T.gallery_import_images}
            >
              {importing ? T.gallery_importing : '📂'}
            </button>
            <button
              className={`btn ${selectMode ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 11, padding: '4px 9px' }}
              onClick={toggleSelectMode}
            >
              {selectMode ? `✓ ${selectedIds.size}` : '☑'}
            </button>
            <span className="gallery-count mono">{isLoading ? '…' : `${screenshots.length}`}</span>
          </div>
        </div>



        {/* Bulk selection toolbar */}
        {selectMode && (
          <div className="bulk-toolbar">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={selectAll}>{T.gallery_select_all}</button>
              <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={selectLowConf}>! {T.gallery_low_conf_btn}</button>
              {selectedIds.size > 0 && (
                <>
                  <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={clearSelection}>{T.gallery_clear}</button>
                  <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={handleBulkReprocess} disabled={bulkLoading}>
                    {bulkLoading
                      ? <><div className="spinner" style={{ width: 10, height: 10 }} />{T.gallery_processing}</>
                      : `⟳ ${selectedIds.size} ${T.gallery_process_selected}`}
                  </button>
                </>
              )}
            </div>
            {bulkMsg && <span style={{ fontSize: 11, color: 'var(--green)', fontFamily: 'var(--mono)' }}>{bulkMsg}</span>}
          </div>
        )}

        {/* Content */}
        <div className="gallery-scroll">
          {isLoading && screenshots.length === 0 ? (
            <SkeletonGrid />
          ) : screenshots.length === 0 ? (
            <EmptyState hasFilter={hasAnyFilter} T={T} />
          ) : viewMode === 'timeline' ? (
            <TimelineView screenshots={visibleScreenshots} selectedId={selectedId} T={T} />
          ) : viewMode === 'masonry' ? (
            <MasonryView screenshots={visibleScreenshots} selectedId={selectedId} />
          ) : viewMode === 'list' ? (
            <div className="list-view">
              {visibleScreenshots.map((ss) => (
                <ScreenshotCard key={ss.id} screenshot={ss} selected={ss.id === selectedId} viewMode="list" />
              ))}
            </div>
          ) : (
            <div className="grid-view">
              {visibleScreenshots.map((ss) => (
                <ScreenshotCard key={ss.id} screenshot={ss} selected={ss.id === selectedId} viewMode="grid" />
              ))}
            </div>
          )}
          {visibleCount < screenshots.length && (
            <div ref={sentinelRef} style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="spinner" />
            </div>
          )}
          {dupToast && (
            <div style={{
              position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--surface-2)', border: '1px solid var(--orange)',
              borderRadius: 'var(--radius-lg)', padding: '8px 16px', fontSize: 12,
              color: 'var(--orange)', zIndex: 100, boxShadow: 'var(--shadow)', animation: 'fadeIn .2s ease',
            }}>
              {dupToast}
            </div>
          )}
        </div>
      </div>
      <ScreenshotDetail />
      <style>{`
        .gallery-layout { display:flex; flex:1; overflow:hidden; }
        .gallery-main   { flex:1; display:flex; flex-direction:column; overflow:hidden; }
        .gallery-topbar { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 14px; border-bottom:1px solid var(--border); flex-shrink:0; background:var(--bg-2); }
        .search-wrap { flex:1; position:relative; max-width:380px; }
        .search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:var(--text-3); pointer-events:none; }
        .search-input { width:100%; padding:7px 12px 7px 32px; background:var(--surface); border:1px solid var(--border-2); border-radius:var(--radius); color:var(--text-1); font-family:var(--sans); font-size:12px; outline:none; transition:border-color .15s; }
        .search-input:focus { border-color:var(--accent); }
        .search-input::placeholder { color:var(--text-3); }
        .view-toggle { display:flex; gap:2px; background:var(--surface); border:1px solid var(--border-2); border-radius:var(--radius); padding:2px; }
        .view-btn { width:26px; height:26px; border:none; background:transparent; color:var(--text-3); cursor:pointer; border-radius:5px; display:flex; align-items:center; justify-content:center; transition:all .1s; }
        .view-btn:hover { color:var(--text-1); background:var(--surface-2); }
        .view-btn.active { background:var(--accent-glow); color:var(--accent); }
        .filter-badge { font-size:10px; padding:2px 7px; background:var(--accent-glow); color:var(--accent); border-radius:10px; font-family:var(--mono); }
        .active-filter { border-color:var(--orange)!important; color:var(--orange)!important; background:rgba(247,129,102,.08)!important; }
        .gallery-count { font-size:11px; color:var(--text-3); white-space:nowrap; }
        .bulk-toolbar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px; padding:7px 14px; background:var(--surface); border-bottom:1px solid var(--border); flex-shrink:0; }
        .gallery-scroll { flex:1; overflow-y:auto; padding:14px; }
        .grid-view { display:grid; grid-template-columns:repeat(auto-fill, minmax(210px,1fr)); gap:10px; }
        .list-view { display:flex; flex-direction:column; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); overflow:hidden; }
      `}</style>
    </div>
  );
};

const MasonryView: React.FC<{ screenshots: any[]; selectedId: string | null }> = ({ screenshots, selectedId }) => {
  const cols = 4;
  const columns: any[][] = Array.from({ length: cols }, () => []);
  screenshots.forEach((ss, i) => columns[i % cols].push(ss));
  return (
    <div className="masonry-view">
      {columns.map((col, ci) => (
        <div key={ci} className="masonry-col">
          {col.map((ss) => <ScreenshotCard key={ss.id} screenshot={ss} selected={ss.id === selectedId} viewMode="masonry" />)}
        </div>
      ))}
      <style>{`
        .masonry-view { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; align-items:start; }
        .masonry-col  { display:flex; flex-direction:column; gap:10px; }
        .masonry-col .sc-thumb { aspect-ratio: unset; min-height: 80px; }
        .masonry-col .sc-thumb img { aspect-ratio: unset; height: auto; min-height: 80px; }
        @media (max-width: 1100px) { .masonry-view { grid-template-columns: repeat(3,1fr); } }
        @media (max-width: 800px)  { .masonry-view { grid-template-columns: repeat(2,1fr); } }
      `}</style>
    </div>
  );
};

const TimelineView: React.FC<{ screenshots: any[]; selectedId: string | null; T: any }> = ({ screenshots, selectedId, T }) => {
  const groups: Record<string, any[]> = {};
  screenshots.forEach((ss) => {
    const d = new Date(ss.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    if (!groups[d]) groups[d] = [];
    groups[d].push(ss);
  });
  return (
    <div className="timeline">
      {Object.entries(groups).map(([date, items]) => (
        <div key={date} className="tl-group">
          <div className="tl-date-header">
            <div className="tl-dot" />
            <span className="tl-date mono">{date}</span>
            <span className="tl-count">{items.length} {T.stats_records}</span>
          </div>
          <div className="tl-items">
            {items.map((ss) => <ScreenshotCard key={ss.id} screenshot={ss} selected={ss.id === selectedId} viewMode="grid" />)}
          </div>
        </div>
      ))}
      <style>{`
        .timeline { display:flex; flex-direction:column; gap:20px; }
        .tl-date-header { display:flex; align-items:center; gap:10px; margin-bottom:10px; padding-bottom:6px; border-bottom:1px solid var(--border); }
        .tl-dot { width:8px; height:8px; border-radius:50%; background:var(--accent); flex-shrink:0; }
        .tl-date { font-size:12px; color:var(--text-2); font-weight:600; }
        .tl-count { font-size:11px; color:var(--text-3); font-family:var(--mono); }
        .tl-items { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px,1fr)); gap:10px; padding-left:18px; }
      `}</style>
    </div>
  );
};

const SkeletonGrid: React.FC = () => (
  <div className="grid-view">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div className="skeleton" style={{ aspectRatio: '16/9' }} />
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skeleton" style={{ height: 12, width: '80%' }} />
          <div className="skeleton" style={{ height: 10, width: '60%' }} />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState: React.FC<{ hasFilter: boolean; T: any }> = ({ hasFilter, T }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 360, gap: 12, color: 'var(--text-3)', textAlign: 'center', padding: 40 }}>
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
      {hasFilter
        ? <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>
        : <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>}
    </svg>
    <h3 style={{ fontSize: 15, color: 'var(--text-2)' }}>{hasFilter ? T.gallery_no_results : T.gallery_no_records}</h3>
    <p style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 280 }}>
      {hasFilter ? T.gallery_change_filters : T.gallery_take_screenshot}
    </p>
  </div>
);