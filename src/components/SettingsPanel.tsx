import React, { useEffect, useMemo, useState } from 'react';
import type { AppSettings, ProcessingLogEntry } from '../types';
import { useAppStore } from '../store/useAppStore';
import { invoke } from '@tauri-apps/api/tauri';
import { getLangMap } from '../i18n/translations';
import CategoryManager from './CategoryManager';

const ArchiveLockSection: React.FC<{ lang: string }> = ({ lang }) => {
    const tr = getLangMap(lang);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [locked, setLocked] = useState(false);

    useEffect(() => {
        invoke<boolean>('get_archive_status').then(setLocked).catch(() => { });
    }, []);

    const handleLock = async () => {
        if (password.length < 8) { setStatus(`✗ ${tr.archive_min_error}`); return; }
        if (password !== confirm) { setStatus(`✗ ${tr.archive_mismatch}`); return; }
        setLoading(true);
        try {
            const count = await invoke<number>('lock_archive', { password });
            setStatus(`✓ ${count}`);
            setLocked(true);
            setPassword(''); setConfirm('');
            window.dispatchEvent(new CustomEvent('archive-status-changed', { detail: { locked: true } }));
        } catch (e: any) {
            setStatus(`✗ ${typeof e === 'string' ? e : e?.message ?? String(e)}`);
        } finally { setLoading(false); }
    };

    const handleUnlock = async () => {
        setLoading(true);
        try {
            const count = await invoke<number>('unlock_archive', { password });
            setStatus(`✓ ${count}`);
            setLocked(false);
            setPassword('');
            window.dispatchEvent(new CustomEvent('archive-status-changed', { detail: { locked: false } }));
        } catch (e: any) {
            setStatus(`✗ ${typeof e === 'string' ? e : e?.message ?? String(e)}`);
        } finally { setLoading(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, color: locked ? 'var(--orange)' : 'var(--green)' }}>
                {locked ? tr.archive_locked : tr.archive_open}
            </span>
            <input className="input" type="password"
                placeholder={locked ? tr.archive_unlock_placeholder : tr.archive_lock_placeholder}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            {!locked && (
                <input className="input" type="password"
                    placeholder={tr.archive_confirm_placeholder}
                    value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            )}
            <button
                className={`btn ${locked ? 'btn-secondary' : 'btn-danger'}`}
                style={{ alignSelf: 'flex-start' }}
                onClick={locked ? handleUnlock : handleLock}
                disabled={loading || !password}
            >
                {loading
                    ? <><div className="spinner" style={{ width: 12, height: 12 }} /> {tr.archive_processing}</>
                    : (locked ? tr.archive_unlock_btn : tr.archive_lock_btn)}
            </button>
            {status && (
                <span style={{ fontSize: 12, color: status.startsWith('✓') ? 'var(--green)' : 'var(--orange)' }}>
                    {status}
                </span>
            )}
        </div>
    );
};

export const SettingsPanel: React.FC = () => {
    const settings = useAppStore((s) => s.settings);
    const saveSettings = useAppStore((s) => s.saveSettings);
    const checkTesseract = useAppStore((s) => s.checkTesseract);
    const tesseractAvailable = useAppStore((s) => s.tesseractAvailable);

    const [form, setForm] = useState<AppSettings | null>(null);
    const [saved, setSaved] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);
    const [processingLogs, setProcessingLogs] = useState<ProcessingLogEntry[]>([]);

    useEffect(() => { if (settings) setForm({ ...settings }); }, [settings]);

    useEffect(() => {
        checkTesseract();
        invoke<ProcessingLogEntry[]>('get_processing_logs', { limit: 80 })
            .then(setProcessingLogs).catch(() => { });
    }, []);

    const lang = (form?.ui_language ?? settings?.ui_language ?? 'en');
    const tr = useMemo(() => getLangMap(lang), [lang]);

    if (!form) return <div className="settings-loading">...</div>;

    const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setForm((prev) => ({ ...prev!, [key]: value }));
    };

    const handleSave = async () => {
        await saveSettings(form);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
    };

    const handleTestLlm = async () => {
        setTesting(true); setTestResult(null);
        try {
            await saveSettings(form);
            const result = await invoke<string>('test_llm_connection');
            setTestResult(result);
        } catch (e: any) {
            setTestResult(typeof e === 'string' ? e : e?.message ?? String(e));
        } finally { setTesting(false); }
    };

    const addExcluded = (app: string) => {
        const x = app.trim().toLowerCase();
        if (!x || form.excluded_apps.includes(x)) return;
        update('excluded_apps', [...form.excluded_apps, x]);
    };

    return (
        <div className="settings">
            <div className="settings-header">
                <h2>{tr.settings_title}</h2>
                <p style={{ color: 'var(--text-2)', fontSize: 13 }}>{tr.settings_subtitle}</p>
            </div>

            <div className="settings-body">
                {/* AI / LLM */}
                <section className="settings-section">
                    <h3 className="settings-section-title">🤖 {tr.settings_ai}</h3>
                    <div className="field">
                        <label>{tr.settings_provider}</label>
                        <select className="input" value={form.llm_provider} onChange={(e) => update('llm_provider', e.target.value as any)}>
                            <option value="none">{tr.settings_disabled}</option>
                            <option value="openai">OpenAI / Compatible</option>
                            <option value="ollama">Ollama (Local)</option>
                        </select>
                    </div>
                    {form.llm_provider === 'openai' && (<>
                        <div className="field"><label>{tr.settings_api_key}</label><input className="input" type="password" value={form.openai_api_key} onChange={(e) => update('openai_api_key', e.target.value)} /></div>
                        <div className="field"><label>{tr.settings_model}</label><input className="input" value={form.openai_model} onChange={(e) => update('openai_model', e.target.value)} /></div>
                        <div className="field"><label>{tr.settings_base_url}</label><input className="input" value={form.openai_base_url} onChange={(e) => update('openai_base_url', e.target.value)} /></div>
                    </>)}
                    {form.llm_provider === 'ollama' && (<>
                        <div className="field"><label>{tr.settings_ollama_url}</label><input className="input" value={form.ollama_url} onChange={(e) => update('ollama_url', e.target.value)} /></div>
                        <div className="field"><label>{tr.settings_model}</label><input className="input" value={form.ollama_model} onChange={(e) => update('ollama_model', e.target.value)} /></div>
                    </>)}
                    {form.llm_provider !== 'none' && (<>
                        {/* FIX: vision toggle — was missing, image was never sent to LLM */}
                        <div className="field">
                            <label className="toggle-label">
                                <input
                                    type="checkbox"
                                    checked={form.llm_use_vision ?? true}
                                    onChange={(e) => update('llm_use_vision', e.target.checked)}
                                />
                                <span>{tr.settings_vision}</span>
                            </label>
                            <span className="settings-section-desc" style={{ marginTop: 2 }}>
                                {tr.settings_vision_hint}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button className="btn btn-secondary" onClick={handleTestLlm} disabled={testing}>
                                {testing ? <><div className="spinner" /> {tr.settings_testing}</> : tr.settings_test}
                            </button>
                            {testResult && <span style={{ fontSize: 12, color: testResult.startsWith('✓') ? 'var(--green)' : 'var(--orange)' }}>{testResult}</span>}
                        </div>
                    </>)}
                </section>

                {/* OCR */}
                <section className="settings-section">
                    <h3 className="settings-section-title">🔍 {tr.settings_ocr}</h3>
                    {!tesseractAvailable && <div className="alert alert-warning">Tesseract not found.</div>}
                    <div className="field"><label>{tr.settings_ocr_lang}</label><input className="input" value={form.ocr_language} onChange={(e) => update('ocr_language', e.target.value)} /></div>
                    <div className="field">
                        <label>{tr.settings_app_lang}</label>
                        <select className="input" value={form.ui_language} onChange={(e) => update('ui_language', e.target.value as any)}>
                            <option value="tr">Türkçe</option>
                            <option value="en">English</option>
                        </select>
                    </div>
                </section>

                {/* Behavior */}
                <section className="settings-section">
                    <h3 className="settings-section-title">⚙️ {tr.settings_behavior}</h3>
                    <div className="field"><label className="toggle-label"><input type="checkbox" checked={form.auto_process} onChange={(e) => update('auto_process', e.target.checked)} /><span>{tr.settings_auto}</span></label></div>
                    <div className="field"><label>{tr.settings_poll}</label><input className="input" type="number" min={200} max={5000} step={100} value={form.poll_interval_ms} onChange={(e) => update('poll_interval_ms', parseInt(e.target.value || '800'))} /></div>
                    <div className="field"><label className="toggle-label"><input type="checkbox" checked={form.run_on_startup ?? false} onChange={(e) => update('run_on_startup', e.target.checked)} /><span>{tr.settings_startup}</span></label></div>
                </section>

                {/* Notifications */}
                <section className="settings-section">
                    <h3 className="settings-section-title">🔔 {tr.settings_notifications}</h3>
                    <div className="field"><label className="toggle-label"><input type="checkbox" checked={form.show_notifications} onChange={(e) => update('show_notifications', e.target.checked)} /><span>{tr.settings_show_notif}</span></label></div>
                </section>

                {/* Excluded Apps */}
                <section className="settings-section">
                    <h3 className="settings-section-title">🚫 {tr.settings_excluded}</h3>
                    <p className="settings-section-desc">{tr.settings_excluded_hint}</p>
                    <div className="excluded-list">
                        {form.excluded_apps.map((app) => (
                            <div key={app} className="excluded-item">
                                <span className="mono" style={{ fontSize: 12 }}>{app}</span>
                                <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 12 }}
                                    onClick={() => update('excluded_apps', form.excluded_apps.filter((x) => x !== app))}>x</button>
                            </div>
                        ))}
                    </div>
                    <AddExcluded onAdd={addExcluded} addLabel={tr.settings_add} />
                </section>

                {/* Performance */}
                <section className="settings-section">
                    <h3 className="settings-section-title">⚡ {tr.settings_perf}</h3>
                    <div className="field"><label className="toggle-label"><input type="checkbox" checked={form.dedup_enabled} onChange={(e) => update('dedup_enabled', e.target.checked)} /><span>{tr.settings_dedup}</span></label></div>
                    <div className="field"><label>{tr.settings_dedup_threshold}</label><input className="input" type="number" min={0} max={20} value={form.dedup_threshold} onChange={(e) => update('dedup_threshold', parseInt(e.target.value || '10'))} /></div>
                    <div className="field"><label>{tr.settings_queue}</label><select className="input" value={form.queue_concurrency} onChange={(e) => update('queue_concurrency', parseInt(e.target.value || '2'))}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></div>
                </section>

                {/* Security */}
                <section className="settings-section">
                    <h3 className="settings-section-title">🔒 {tr.settings_sec}</h3>
                    <div className="field"><label className="toggle-label"><input type="checkbox" checked={form.masking_enabled} onChange={(e) => update('masking_enabled', e.target.checked)} /><span>{tr.settings_mask}</span></label></div>
                    <div className="field">
                        <label style={{ fontWeight: 600, color: 'var(--text-1)' }}>{tr.settings_archive_enc}</label>
                        <ArchiveLockSection lang={lang} />
                    </div>
                    <div className="field">
                        <label style={{ fontWeight: 600, color: 'var(--text-1)' }}>{tr.settings_api_protect}</label>
                        <label>{tr.settings_api_token}</label>
                        <input className="input mono" value={form.local_api_token} onChange={(e) => update('local_api_token', e.target.value)} />
                        <label>{tr.settings_allowed_origins}</label>
                        <textarea className="input" rows={3} value={form.local_api_allowed_origins.join(', ')}
                            onChange={(e) => update('local_api_allowed_origins', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))}
                            style={{ resize: 'vertical' }} />
                        <label>{tr.settings_rate_limit}</label>
                        <input className="input" type="number" min={10} max={5000} step={10} value={form.local_api_rate_limit_per_min}
                            onChange={(e) => update('local_api_rate_limit_per_min', parseInt(e.target.value || '180'))} />
                    </div>
                </section>

                {/* Personalization */}
                <section className="settings-section">
                    <h3 className="settings-section-title">🧠 {tr.settings_personalization}</h3>
                    <div className="field"><label className="toggle-label"><input type="checkbox" checked={form.personalization_enabled} onChange={(e) => update('personalization_enabled', e.target.checked)} /><span>{tr.settings_personalization_on}</span></label></div>
                    <div className="field"><label>{tr.settings_personalization_min}</label><input className="input" type="number" min={1} max={20} value={form.personalization_min_samples} onChange={(e) => update('personalization_min_samples', parseInt(e.target.value || '2'))} /></div>
                </section>

                {/* Categories */}
                <section className="settings-section">
                    <h3 className="settings-section-title">🏷️ {tr.settings_categories}</h3>
                    <p className="settings-section-desc">{tr.settings_categories_hint}</p>
                    <CategoryManager />
                </section>

                {/* Logs */}
                <section className="settings-section">
                    <h3 className="settings-section-title">🧾 {tr.settings_logs}</h3>
                    {processingLogs.length === 0 ? (
                        <p className="settings-section-desc">{tr.settings_no_logs}</p>
                    ) : (
                        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                            {processingLogs.map((log, idx) => (
                                <div key={idx} style={{ padding: '8px 10px', borderBottom: idx < processingLogs.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 12, display: 'grid', gridTemplateColumns: '150px 70px 70px 1fr', gap: 8, alignItems: 'center' }}>
                                    <span className="mono" style={{ color: 'var(--text-3)' }}>{new Date(log.created_at).toLocaleString()}</span>
                                    <span className="mono" style={{ color: 'var(--text-2)' }}>{log.level}</span>
                                    <span className="mono" style={{ color: 'var(--text-2)' }}>{log.stage}</span>
                                    <span style={{ color: 'var(--text-1)' }}>{log.message}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Storage */}
                <section className="settings-section">
                    <h3 className="settings-section-title">💾 {tr.settings_storage}</h3>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary" onClick={() => invoke('open_images_folder')}>{tr.settings_images_folder}</button>
                        <button className="btn btn-secondary" onClick={() => invoke('open_exports_folder')}>{tr.settings_exports_folder}</button>
                    </div>
                </section>
            </div>

            <div className="settings-footer">
                <button className="btn btn-primary" onClick={handleSave}>{saved ? `✓ ${tr.settings_saved}` : tr.settings_save}</button>
            </div>

            <style>{`
        .settings { flex:1; display:flex; flex-direction:column; overflow:hidden; }
        .settings-loading { flex:1; display:flex; align-items:center; justify-content:center; color:var(--text-3); }
        .settings-header { padding:24px 32px 16px; border-bottom:1px solid var(--border); flex-shrink:0; }
        .settings-header h2 { font-size:20px; margin-bottom:4px; }
        .settings-body { flex:1; overflow-y:auto; padding:16px 32px; display:flex; flex-direction:column; gap:0; }
        .settings-section { padding:20px 0; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:14px; }
        .settings-section:last-child { border-bottom:none; }
        .settings-section-title { font-size:14px; font-weight:600; display:flex; align-items:center; }
        .settings-section-desc { font-size:13px; color:var(--text-2); margin-top:-8px; }
        .field { display:flex; flex-direction:column; gap:6px; max-width:520px; }
        .field label { font-size:13px; color:var(--text-2); font-weight:500; }
        .toggle-label { display:flex!important; align-items:center!important; gap:8px; cursor:pointer; flex-direction:row!important; color:var(--text-1)!important; }
        .toggle-label input[type="checkbox"] { width:15px; height:15px; accent-color:var(--accent); cursor:pointer; }
        .alert { padding:10px 14px; border-radius:var(--radius); font-size:13px; }
        .alert-warning { background:rgba(227,179,65,.1); border:1px solid rgba(227,179,65,.3); color:var(--yellow); }
        .excluded-list { display:flex; flex-wrap:wrap; gap:6px; max-width:520px; }
        .excluded-item { display:flex; align-items:center; gap:4px; padding:4px 8px; background:var(--surface-2); border:1px solid var(--border); border-radius:6px; }
        .settings-footer { padding:16px 32px; border-top:1px solid var(--border); flex-shrink:0; }
      `}</style>
        </div>
    );
};

const AddExcluded: React.FC<{ onAdd: (value: string) => void; addLabel: string }> = ({ onAdd, addLabel }) => {
    const [value, setValue] = useState('');
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 520 }}>
            <input className="input" style={{ flex: 1 }} value={value} onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && value.trim()) { onAdd(value); setValue(''); }
                }} placeholder="app.exe" />
            <button className="btn btn-secondary" disabled={!value.trim()} onClick={() => { onAdd(value); setValue(''); }}>
                {addLabel}
            </button>
        </div>
    );
};
