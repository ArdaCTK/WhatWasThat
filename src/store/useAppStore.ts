import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/api/notification';
import { create } from 'zustand';
import type {
  AppSettings, BulkReprocessResult, Category, FilterState,
  Screenshot, SearchQuery, Stats, AppView, ViewMode,
} from '../types';

export interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  undoId?: string;
  /** 'delete' uses undoDelete, 'archive' uses undoArchive */
  undoAction?: 'delete' | 'archive';
}

interface AppStore {
  screenshots: Screenshot[];
  categories: Category[];
  stats: Stats | null;
  settings: AppSettings | null;
  selectedId: string | null;
  lightboxId: string | null;
  view: AppView;
  viewMode: ViewMode;
  filters: FilterState;
  isLoading: boolean;
  processingIds: Set<string>;
  sidebarOpen: boolean;
  filterPanelOpen: boolean;
  tesseractAvailable: boolean;
  selectedIds: Set<string>;
  selectMode: boolean;
  toasts: ToastItem[];
  canUndo: boolean;
  /** Last archived screenshot kept in memory for undo */
  lastArchived: Screenshot | null;

  setView: (v: AppView) => void;
  setViewMode: (v: ViewMode) => void;
  setSelectedId: (id: string | null) => void;
  setLightboxId: (id: string | null) => void;
  setSidebarOpen: (o: boolean) => void;
  setFilterPanelOpen: (o: boolean) => void;
  setFilters: (f: Partial<FilterState>) => void;
  resetFilters: () => void;
  toggleSelectMode: () => void;
  toggleSelectId: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  selectLowConfidence: () => void;
  loadScreenshots: () => Promise<void>;
  loadCategories: () => Promise<void>;
  loadStats: () => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (s: AppSettings) => Promise<void>;
  deleteScreenshot: (id: string) => Promise<void>;
  deleteScreenshotWithUndo: (id: string) => Promise<void>;
  undoDelete: () => Promise<void>;
  archiveScreenshot: (id: string) => Promise<void>;
  undoArchive: () => Promise<void>;
  unarchiveScreenshot: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  updateScreenshot: (s: Screenshot) => Promise<void>;
  processScreenshot: (id: string) => Promise<void>;
  cancelProcessing: (id: string) => Promise<void>;
  bulkReprocess: (ids: string[]) => Promise<BulkReprocessResult>;
  reprocessLowConfidence: () => Promise<BulkReprocessResult>;
  reprocessAll: () => Promise<number>;
  checkTesseract: () => Promise<void>;
  importImages: (paths: string[]) => Promise<Screenshot[]>;
  addToast: (msg: string, type?: ToastItem['type'], undoId?: string, undoAction?: ToastItem['undoAction']) => void;
  removeToast: (id: string) => void;
  initEventListeners: () => void;
  initNotifications: () => Promise<void>;
}

const defaultFilters: FilterState = {
  query: undefined, category: undefined, tags: [],
  date_from: undefined, date_to: undefined,
  only_low_confidence: false, only_favorites: false,
  only_archived: false, include_archived: false,
  only_error: false,
  app_filter: undefined,
};

function filtersToQuery(f: FilterState): SearchQuery {
  return {
    query: f.query, category: f.category, tags: f.tags,
    date_from: f.date_from, date_to: f.date_to,
    only_low_confidence: f.only_low_confidence,
    only_favorites: f.only_favorites,
    only_archived: f.only_archived,
    include_archived: f.include_archived,
    only_error: f.only_error,
    limit: 200, offset: 0,
  };
}

let toastN = 0;

export const useAppStore = create<AppStore>((set, get) => ({
  screenshots: [], categories: [], stats: null, settings: null,
  selectedId: null, lightboxId: null, view: 'gallery', viewMode: 'grid',
  filters: defaultFilters, isLoading: false, processingIds: new Set(),
  sidebarOpen: true, filterPanelOpen: false, tesseractAvailable: false,
  selectedIds: new Set(), selectMode: false, toasts: [], canUndo: false,
  lastArchived: null,

  setView: (view) => set({ view }),
  setViewMode: (viewMode) => set({ viewMode }),
  setSelectedId: (selectedId) => set({ selectedId }),
  setLightboxId: (lightboxId) => set({ lightboxId }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setFilterPanelOpen: (filterPanelOpen) => set({ filterPanelOpen }),

  setFilters: (f) => {
    const next = { ...get().filters, ...f };
    set({ filters: next });
    get().loadScreenshots();
  },

  resetFilters: () => {
    set({ filters: defaultFilters });
    get().loadScreenshots();
  },

  toggleSelectMode: () => set((s) => ({ selectMode: !s.selectMode, selectedIds: new Set() })),
  toggleSelectId: (id) => set((s) => {
    const n = new Set(s.selectedIds);
    n.has(id) ? n.delete(id) : n.add(id);
    return { selectedIds: n };
  }),
  selectAll: () => set({ selectedIds: new Set(get().screenshots.map((s) => s.id)) }),
  clearSelection: () => set({ selectedIds: new Set() }),
  selectLowConfidence: () => {
    const threshold = get().settings?.low_confidence_threshold ?? 0.6;
    const ids = new Set(get().screenshots.filter((s) => (s.confidence ?? 1) < threshold).map((s) => s.id));
    set({ selectedIds: ids, selectMode: ids.size > 0 });
  },

  addToast: (message, type = 'info', undoId, undoAction) => {
    const id = `t${++toastN}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type, undoId, undoAction }] }));
    setTimeout(() => get().removeToast(id), undoId ? 8000 : 5000);
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  loadScreenshots: async () => {
    set({ isLoading: true });
    try {
      const q = filtersToQuery(get().filters);
      let data = await invoke<Screenshot[]>('get_screenshots', { query: q });
      const af = get().filters.app_filter?.toLowerCase();
      if (af) data = data.filter((s) => s.app_info?.toLowerCase().includes(af));
      set({ screenshots: data });
    } finally {
      set({ isLoading: false });
    }
  },

  loadCategories: async () => {
    try { set({ categories: await invoke<Category[]>('get_categories') }); } catch { }
  },

  loadStats: async () => {
    try { set({ stats: await invoke<Stats>('get_stats') }); } catch { }
  },

  loadSettings: async () => {
    try {
      const s = await invoke<AppSettings>('get_settings');
      set({ settings: s });
      document.documentElement.setAttribute('data-theme', s.theme ?? 'dark');
      if (s.accent_color) {
        document.documentElement.style.setProperty('--accent', s.accent_color);
        document.documentElement.style.setProperty('--accent-glow', s.accent_color + '26');
      }
      invoke('apply_shell_language', { lang: s.ui_language ?? 'en' }).catch(() => { });
    } catch { }
  },

  saveSettings: async (settings) => {
    await invoke('save_settings', { settings });
    set({ settings });
    document.documentElement.setAttribute('data-theme', settings.theme ?? 'dark');
    if (settings.accent_color) {
      document.documentElement.style.setProperty('--accent', settings.accent_color);
      document.documentElement.style.setProperty('--accent-glow', settings.accent_color + '26');
    }
    invoke('apply_shell_language', { lang: settings.ui_language ?? 'en' }).catch(() => { });
  },

  deleteScreenshot: async (id) => {
    await invoke('delete_screenshot', { id });
    set((s) => ({ screenshots: s.screenshots.filter((ss) => ss.id !== id), selectedId: s.selectedId === id ? null : s.selectedId }));
    get().loadCategories();
    get().loadStats();
  },

  deleteScreenshotWithUndo: async (id) => {
    const title = await invoke<string | null>('delete_screenshot_with_undo', { id });
    set((s) => ({ screenshots: s.screenshots.filter((ss) => ss.id !== id), selectedId: s.selectedId === id ? null : s.selectedId, canUndo: true }));
    get().loadCategories();
    get().loadStats();
    const lang = get().settings?.ui_language ?? 'en';
    get().addToast(`"${title ?? 'Record'}" ${lang === 'tr' ? 'silindi' : 'deleted'}`, 'warning', id, 'delete');
  },

  undoDelete: async () => {
    const restored = await invoke<Screenshot | null>('undo_delete');
    if (restored) {
      set((s) => ({ screenshots: [restored, ...s.screenshots] }));
      get().loadCategories();
      get().loadStats();
      const lang = get().settings?.ui_language ?? 'en';
      get().addToast(`"${restored.title ?? 'Record'}" ${lang === 'tr' ? 'geri alındı' : 'restored'}`, 'success');
    }
    const more = await invoke<string | null>('peek_undo');
    set({ canUndo: !!more });
  },

  archiveScreenshot: async (id) => {
    const ss = get().screenshots.find((s) => s.id === id);
    if (!ss) return;
    await invoke('update_screenshot', { screenshot: { ...ss, is_archived: true } });
    // Keep a copy in memory for potential undo
    set((s) => ({
      screenshots: s.screenshots.filter((x) => x.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      lastArchived: ss,
    }));
    get().loadStats();
    const lang = get().settings?.ui_language ?? 'en';
    get().addToast(
      lang === 'tr' ? 'Arşivlendi' : 'Archived',
      'info',
      id,
      'archive',
    );
  },

  undoArchive: async () => {
    const ss = get().lastArchived;
    if (!ss) return;
    const updated = { ...ss, is_archived: false };
    await invoke('update_screenshot', { screenshot: updated });
    set((s) => ({
      screenshots: [updated, ...s.screenshots],
      lastArchived: null,
    }));
    get().loadStats();
    const lang = get().settings?.ui_language ?? 'en';
    get().addToast(
      `"${ss.title ?? 'Record'}" ${lang === 'tr' ? 'arşivden çıkarıldı' : 'removed from archive'}`,
      'success',
    );
  },

  unarchiveScreenshot: async (id) => {
    // Try in current list first, fall back to lastArchived buffer
    let ss = get().screenshots.find((s) => s.id === id) ?? get().lastArchived ?? null;
    if (!ss) return;
    const updated = { ...ss, is_archived: false };
    await invoke('update_screenshot', { screenshot: updated });
    set((s) => ({
      screenshots: s.screenshots.some((x) => x.id === id)
        ? s.screenshots.map((x) => x.id === id ? updated : x)
        : [updated, ...s.screenshots],
      lastArchived: s.lastArchived?.id === id ? null : s.lastArchived,
    }));
    get().loadStats();
    const lang = get().settings?.ui_language ?? 'en';
    get().addToast(lang === 'tr' ? 'Arşivden çıkarıldı' : 'Removed from archive', 'success');
  },

  toggleFavorite: async (id) => {
    const ss = get().screenshots.find((s) => s.id === id);
    if (!ss) return;
    const updated = { ...ss, is_favorite: !ss.is_favorite };
    await invoke('update_screenshot', { screenshot: updated });
    set((s) => ({ screenshots: s.screenshots.map((x) => x.id === id ? updated : x) }));
    get().loadCategories();
    get().loadStats();
  },

  updateScreenshot: async (screenshot) => {
    await invoke('update_screenshot', { screenshot });
    set((s) => ({ screenshots: s.screenshots.map((ss) => ss.id === screenshot.id ? screenshot : ss) }));
    get().loadCategories();
  },

  processScreenshot: async (id) => {
    set((s) => ({ processingIds: new Set([...s.processingIds, id]) }));
    try {
      const updated = await invoke<Screenshot>('process_screenshot', { id });
      set((s) => ({ screenshots: s.screenshots.map((ss) => ss.id === id ? updated : ss) }));
      get().loadCategories();
      get().loadStats();
      const lang = get().settings?.ui_language ?? 'en';
      const title = updated.title ?? (lang === 'tr' ? 'Kayıt' : 'Record');
      const cat = updated.category ?? '';
      const conf = updated.confidence != null ? Math.round(updated.confidence * 100) : 0;
      const low = (updated.confidence ?? 1) < (get().settings?.low_confidence_threshold ?? 0.6);
      get().addToast(
        lang === 'tr'
          ? `${title} — ${cat} (%${conf})`
          : `${title} — ${cat} (${conf}% confidence)`,
        low ? 'warning' : 'success'
      );
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message ?? String(e);
      get().addToast(msg, 'error');
    } finally {
      set((s) => { const n = new Set(s.processingIds); n.delete(id); return { processingIds: n }; });
    }
  },

  cancelProcessing: async (id) => {
    const updated = await invoke<Screenshot>('cancel_screenshot_processing', { id });
    set((s) => ({
      screenshots: s.screenshots.map((ss) => ss.id === id ? updated : ss),
      processingIds: new Set([...s.processingIds].filter((x) => x !== id)),
    }));
    get().addToast('Processing stopped', 'warning');
    get().loadStats();
  },

  bulkReprocess: async (ids) => {
    set((s) => ({
      processingIds: new Set([...s.processingIds, ...ids]),
      screenshots: s.screenshots.map((ss) => ids.includes(ss.id) ? { ...ss, status: 'pending' as const } : ss),
    }));
    try {
      const result = await invoke<BulkReprocessResult>('bulk_reprocess', { ids });
      await get().loadScreenshots();
      await get().loadCategories();
      await get().loadStats();
      return result;
    } finally {
      set((s) => {
        const n = new Set(s.processingIds);
        ids.forEach((id) => n.delete(id));
        return { processingIds: n, selectedIds: new Set(), selectMode: false };
      });
    }
  },

  reprocessLowConfidence: async () => {
    const r = await invoke<BulkReprocessResult>('reprocess_low_confidence');
    await get().loadScreenshots();
    await get().loadCategories();
    await get().loadStats();
    return r;
  },

  reprocessAll: async () => {
    const c = await invoke<number>('reprocess_all_pending');
    await get().loadScreenshots();
    await get().loadCategories();
    await get().loadStats();
    return c;
  },

  checkTesseract: async () => {
    set({ tesseractAvailable: await invoke<boolean>('check_tesseract') });
  },

  importImages: async (paths) => {
    const wwtPaths = paths.filter((p) => p.toLowerCase().endsWith('.wwt'));
    const imgPaths = paths.filter((p) => !p.toLowerCase().endsWith('.wwt'));

    const results: Screenshot[] = [];

    for (const p of wwtPaths) {
      try {
        const ss = await invoke<Screenshot>('import_wwt', { wwtPath: p });
        results.push(ss);
      } catch (e) {
        console.warn('WWT import failed', p, e);
      }
    }

    if (imgPaths.length > 0) {
      const imported = await invoke<Screenshot[]>('import_images', { paths: imgPaths });
      results.push(...imported);
    }

    if (results.length > 0) {
      await get().loadScreenshots();
      get().loadCategories();
      get().loadStats();
    }
    return results;
  },

  initNotifications: async () => {
    try {
      let ok = await isPermissionGranted();
      if (!ok) { const p = await requestPermission(); ok = p === 'granted'; }
      if (ok) {
        listen<{ title: string; body: string; low_confidence: boolean }>('notification:show', ({ payload }) => {
          if (get().settings?.show_notifications) { sendNotification({ title: payload.title, body: payload.body }); }
          get().addToast(payload.body, payload.low_confidence ? 'warning' : 'success');
        });
      }
    } catch { }
  },

  initEventListeners: () => {
    listen<Screenshot>('screenshot:new', ({ payload }) => {
      set((s) => {
        if (s.screenshots.some((ss) => ss.id === payload.id)) {
          return { screenshots: s.screenshots.map((ss) => ss.id === payload.id ? payload : ss) };
        }
        return { screenshots: [payload, ...s.screenshots] };
      });
    });
    listen<{ id: string }>('wwt:opened', ({ payload }) => {
      if (!payload?.id) return;
      set({ selectedId: payload.id, view: 'gallery' });
    });
    listen<string>('screenshot:processing', ({ payload: id }) => {
      set((s) => ({
        screenshots: s.screenshots.map((ss) => ss.id === id ? { ...ss, status: 'processing' as const } : ss),
        processingIds: new Set([...s.processingIds, id]),
      }));
    });
    listen<Screenshot>('screenshot:done', ({ payload }) => {
      set((s) => {
        const n = new Set(s.processingIds);
        n.delete(payload.id);
        return { screenshots: s.screenshots.map((ss) => ss.id === payload.id ? payload : ss), processingIds: n };
      });
      get().loadCategories();
      get().loadStats();
      if (payload.status === 'done' && payload.title) {
        const lang = get().settings?.ui_language ?? 'en';
        const cat = payload.category ?? '';
        const conf = payload.confidence != null ? Math.round(payload.confidence * 100) : 0;
        const low = (payload.confidence ?? 1) < (get().settings?.low_confidence_threshold ?? 0.6);
        get().addToast(
          lang === 'tr'
            ? `${payload.title} — ${cat} (%${conf})`
            : `${payload.title} — ${cat} (${conf}% confidence)`,
          low ? 'warning' : 'success'
        );
      } else if (payload.status === 'error') {
        get().addToast(payload.error_msg ?? 'Processing failed', 'error');
      }
    });
  },
}));
