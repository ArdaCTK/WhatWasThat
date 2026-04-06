import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Titlebar } from './components/Titlebar';
import { Navbar } from './components/Navbar';
import { Gallery } from './views/Gallery';
import { StatsView } from './views/StatsView';
import { SettingsPanel } from './components/SettingsPanel';
import { ToastManager } from './components/ToastManager';
import { Lightbox } from './components/Lightbox';
import { useAppStore } from './store/useAppStore';
import { getLangMap } from './i18n/translations';
import './styles/globals.css';

const App: React.FC = () => {
  const view = useAppStore((s) => s.view);
  const lightboxId = useAppStore((s) => s.lightboxId);
  const loadScreenshots = useAppStore((s) => s.loadScreenshots);
  const loadCategories = useAppStore((s) => s.loadCategories);
  const loadStats = useAppStore((s) => s.loadStats);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const initEventListeners = useAppStore((s) => s.initEventListeners);
  const initNotifications = useAppStore((s) => s.initNotifications);
  const checkTesseract = useAppStore((s) => s.checkTesseract);
  const settings = useAppStore((s) => s.settings);

  const [archiveLocked, setArchiveLocked] = useState(false);
  const [archiveProtected, setArchiveProtected] = useState(false);
  const [lockChecked, setLockChecked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Use 'en' as the default language — user can change in Settings
  const lang = settings?.ui_language ?? 'en';
  const T = getLangMap(lang);

  useEffect(() => {
    const init = async () => {
      await loadSettings();
      const [locked, protectedByPassword] = await Promise.all([
        invoke<boolean>('get_archive_status').catch(() => false),
        invoke<boolean>('is_archive_password_set').catch(() => false),
      ]);
      setArchiveLocked(locked);
      setArchiveProtected(protectedByPassword);
      setLockChecked(true);
      if (!locked && !protectedByPassword) {
        await loadScreenshots();
        setTimeout(() => { loadCategories(); loadStats(); checkTesseract(); }, 120);
      } else {
        setTimeout(() => checkTesseract(), 120);
      }
    };
    init();
    initEventListeners();
    initNotifications();
  }, []);

  useEffect(() => {
    const blockContextMenu = (e: MouseEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea') e.preventDefault();
    };
    window.addEventListener('contextmenu', blockContextMenu);
    return () => window.removeEventListener('contextmenu', blockContextMenu);
  }, []);

  useEffect(() => { if (view === 'stats') loadStats(); }, [view]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const onArchiveStatusChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ locked: boolean }>).detail;
      const nextLocked = !!detail?.locked;
      setArchiveLocked(nextLocked);
      if (!nextLocked) {
        setArchiveProtected(false);
        loadSettings();
        loadScreenshots();
        loadCategories();
        loadStats();
      }
    };
    window.addEventListener('archive-status-changed', onArchiveStatusChanged as EventListener);
    return () => window.removeEventListener('archive-status-changed', onArchiveStatusChanged as EventListener);
  }, []);

  const handleUnlock = async () => {
    if (!unlockPassword) return;
    setUnlockError(null);
    setUnlocking(true);
    try {
      if (archiveLocked) {
        await invoke<number>('unlock_archive', { password: unlockPassword });
      } else {
        const ok = await invoke<boolean>('verify_archive_password', { password: unlockPassword });
        if (!ok) throw new Error(T.archive_mismatch);
      }
      setArchiveLocked(false);
      setArchiveProtected(false);
      setUnlockPassword('');
      await Promise.all([loadSettings(), loadScreenshots(), loadCategories(), loadStats()]);
    } catch (e: any) {
      setUnlockError(typeof e === 'string' ? e : e?.message ?? String(e));
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className={`app-shell ${(archiveLocked || archiveProtected || !lockChecked) ? 'locked' : ''}`}>
      <Titlebar />
      <Navbar />
      <main className="app-content">
        {view === 'gallery' && <Gallery />}
        {view === 'stats' && <StatsView />}
        {view === 'settings' && <SettingsPanel />}
      </main>
      {!archiveLocked && !archiveProtected && <ToastManager />}
      {lightboxId && <Lightbox />}
      {(archiveLocked || archiveProtected || !lockChecked) && (
        <div className="lock-overlay">
          <div className="lock-card">
            <h2 className="lock-title">{T.archive_locked}</h2>
            <p className="lock-subtitle">{lang === 'tr' ? 'Devam etmek için şifrenizi girin.' : 'Enter your password to continue.'}</p>
            <input
              type="password"
              className="input"
              placeholder={T.archive_unlock_placeholder}
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !unlocking && handleUnlock()}
              autoFocus
              disabled={!lockChecked || unlocking}
            />
            {unlockError && <div className="lock-error">{unlockError}</div>}
            <button
              className="btn btn-primary lock-btn"
              onClick={handleUnlock}
              disabled={!lockChecked || !unlockPassword || unlocking}
            >
              {unlocking
                ? <><div className="spinner" /> {T.archive_processing}</>
                : T.archive_unlock_btn}
            </button>
          </div>
        </div>
      )}
      <style>{`.app-shell{display:flex;flex-direction:column;height:100vh;overflow:hidden;background:var(--bg);position:relative}.app-content{flex:1;display:flex;overflow:hidden}.app-shell.locked .titlebar,.app-shell.locked .app-content,.app-shell.locked nav{filter:blur(10px) saturate(0.2);pointer-events:none;user-select:none}.lock-overlay{position:absolute;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(2px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px}.lock-card{width:min(420px,90vw);border:1px solid var(--border-2);background:var(--surface);border-radius:var(--radius-lg);box-shadow:var(--shadow);padding:18px;display:flex;flex-direction:column;gap:10px}.lock-title{font-size:18px;color:var(--text-1)}.lock-subtitle{font-size:12px;color:var(--text-2)}.lock-error{font-size:12px;color:var(--orange);background:rgba(247,129,102,.08);border:1px solid rgba(247,129,102,.24);border-radius:var(--radius);padding:8px 10px}.lock-btn{justify-content:center;margin-top:2px}`}</style>
    </div>
  );
};

export default App;