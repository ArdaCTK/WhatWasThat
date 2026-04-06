import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useAppStore } from '../store/useAppStore';
import { getLangMap } from '../i18n/translations';

interface CustomCategory {
    name: string;
    icon: string;
    color: string;
}

interface AppSettings {
    custom_categories: CustomCategory[];
    hidden_default_categories?: string[];
    [key: string]: unknown;
}

// Built-in defaults that mirror backend database.rs category_color/icon
const BUILTIN_DEFAULTS: CustomCategory[] = [
    { name: 'Music', icon: '🎵', color: '#a855f7' },
    { name: 'Film/TV', icon: '🎬', color: '#3b82f6' },
    { name: 'Code/Tech', icon: '💻', color: '#22c55e' },
    { name: 'News', icon: '📰', color: '#ef4444' },
    { name: 'Shopping', icon: '🛒', color: '#f97316' },
    { name: 'Food', icon: '🍽️', color: '#eab308' },
    { name: 'Travel', icon: '✈️', color: '#06b6d4' },
    { name: 'Gaming', icon: '🎮', color: '#ec4899' },
    { name: 'Books', icon: '📚', color: '#8b5cf6' },
    { name: 'Social Media', icon: '💬', color: '#14b8a6' },
    { name: 'Work', icon: '💼', color: '#64748b' },
    { name: 'Education', icon: '🎓', color: '#f59e0b' },
    { name: 'Other', icon: '📌', color: '#6b7280' },
];

const PRESET_COLORS = [
    '#a855f7', '#3b82f6', '#22c55e', '#ef4444', '#f97316',
    '#eab308', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6',
    '#64748b', '#f59e0b', '#e11d48', '#0ea5e9', '#84cc16',
];

type TabId = 'default' | 'custom';

export default function CategoryManager() {
    const lang = useAppStore((s) => s.settings?.ui_language ?? 'en');
    const tr = useMemo(() => getLangMap(lang), [lang]);

    const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
    const [hiddenDefaults, setHiddenDefaults] = useState<string[]>([]);
    const [customOverrides, setCustomOverrides] = useState<Record<string, Partial<CustomCategory>>>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<TabId>('default');

    // New category form
    const [newName, setNewName] = useState('');
    const [newIcon, setNewIcon] = useState('📌');
    const [newColor, setNewColor] = useState('#6b7280');

    // Edit state
    const [editingDefault, setEditingDefault] = useState<string | null>(null);
    const [editDefaultState, setEditDefaultState] = useState<Partial<CustomCategory>>({});
    const [editingCustomIdx, setEditingCustomIdx] = useState<number | null>(null);
    const [editCustomState, setEditCustomState] = useState<Partial<CustomCategory>>({});

    useEffect(() => {
        invoke<AppSettings>('get_settings').then((s) => {
            setCustomCategories(s.custom_categories ?? []);
            setHiddenDefaults(s.hidden_default_categories ?? []);
            // Load overrides: custom entries that share a name with a builtin
            const overrides: Record<string, Partial<CustomCategory>> = {};
            for (const cc of (s.custom_categories ?? [])) {
                if (BUILTIN_DEFAULTS.some((b) => b.name === cc.name)) {
                    overrides[cc.name] = { icon: cc.icon, color: cc.color };
                }
            }
            setCustomOverrides(overrides);
        });
    }, []);

    const persist = async (
        updatedCustom: CustomCategory[],
        updatedHidden: string[],
    ) => {
        setSaving(true);
        try {
            const settings = await invoke<AppSettings>('get_settings');
            await invoke('save_settings', {
                settings: {
                    ...settings,
                    custom_categories: updatedCustom,
                    hidden_default_categories: updatedHidden,
                },
            });
            setCustomCategories(updatedCustom);
            setHiddenDefaults(updatedHidden);
        } catch (e) {
            setError(String(e));
        } finally {
            setSaving(false);
        }
    };

    // ── Default category actions ─────────────────────────────────────────

    const toggleDefaultVisibility = async (name: string) => {
        const updated = hiddenDefaults.includes(name)
            ? hiddenDefaults.filter((n) => n !== name)
            : [...hiddenDefaults, name];
        await persist(customCategories, updated);
    };

    const startEditDefault = (name: string) => {
        const override = customOverrides[name] ?? {};
        const base = BUILTIN_DEFAULTS.find((b) => b.name === name)!;
        setEditDefaultState({
            icon: override.icon ?? base.icon,
            color: override.color ?? base.color,
        });
        setEditingDefault(name);
    };

    const saveEditDefault = async () => {
        if (!editingDefault) return;
        const base = BUILTIN_DEFAULTS.find((b) => b.name === editingDefault)!;
        const isUnchanged =
            editDefaultState.icon === base.icon &&
            editDefaultState.color === base.color;

        // Remove old override if present
        let updated = customCategories.filter((c) => c.name !== editingDefault);
        if (!isUnchanged) {
            updated = [
                ...updated,
                { name: editingDefault, icon: editDefaultState.icon ?? base.icon, color: editDefaultState.color ?? base.color },
            ];
        }
        setCustomOverrides((prev) => {
            const next = { ...prev };
            if (isUnchanged) delete next[editingDefault];
            else next[editingDefault] = editDefaultState;
            return next;
        });
        await persist(updated, hiddenDefaults);
        setEditingDefault(null);
        setEditDefaultState({});
    };

    // ── Custom category actions ──────────────────────────────────────────

    const handleAddCustom = async () => {
        const name = newName.trim();
        if (!name) { setError(lang === 'en' ? 'Name cannot be empty.' : 'Ad boş olamaz.'); return; }
        const allNames = [
            ...BUILTIN_DEFAULTS.map((b) => b.name),
            ...customCategories.map((c) => c.name),
        ];
        if (allNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
            setError(lang === 'en' ? 'A category with that name already exists.' : 'Bu isimde bir kategori zaten var.');
            return;
        }
        setError('');
        await persist([...customCategories, { name, icon: newIcon, color: newColor }], hiddenDefaults);
        setNewName('');
        setNewIcon('📌');
        setNewColor('#6b7280');
    };

    const handleDeleteCustom = async (idx: number) => {
        await persist(customCategories.filter((_, i) => i !== idx), hiddenDefaults);
    };

    const startEditCustom = (idx: number) => {
        setEditCustomState({ ...customCategories[idx] });
        setEditingCustomIdx(idx);
    };

    const saveEditCustom = async () => {
        if (editingCustomIdx === null) return;
        const updated = customCategories.map((c, i) =>
            i === editingCustomIdx ? { ...c, ...editCustomState } as CustomCategory : c
        );
        await persist(updated, hiddenDefaults);
        setEditingCustomIdx(null);
        setEditCustomState({});
    };

    // ── Render helpers ───────────────────────────────────────────────────

    const renderColorPicker = (
        value: string,
        onChange: (c: string) => void,
    ) => (
        <div className="cm-color-row">
            {PRESET_COLORS.map((c) => (
                <button
                    key={c}
                    className={`cm-swatch ${value === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => onChange(c)}
                    title={c}
                />
            ))}
            <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="cm-color-native"
                title="Custom"
            />
        </div>
    );

    const renderDefaultTab = () => (
        <div className="cm-list">
            {BUILTIN_DEFAULTS.map((base) => {
                const override = customOverrides[base.name] ?? {};
                const icon = override.icon ?? base.icon;
                const color = override.color ?? base.color;
                const isHidden = hiddenDefaults.includes(base.name);
                const hasOverride = !!customOverrides[base.name];
                const isEditing = editingDefault === base.name;

                return (
                    <div key={base.name} className={`cm-row ${isHidden ? 'cm-row--hidden' : ''}`}>
                        {isEditing ? (
                            <div className="cm-edit-inline">
                                <div className="cm-edit-header">
                                    <input
                                        className="cm-icon-input"
                                        value={editDefaultState.icon ?? icon}
                                        onChange={(e) => setEditDefaultState((p) => ({ ...p, icon: e.target.value }))}
                                        maxLength={2}
                                    />
                                    <span className="cm-edit-name">{base.name}</span>
                                    <div
                                        className="cm-color-dot"
                                        style={{ background: editDefaultState.color ?? color }}
                                    />
                                </div>
                                {renderColorPicker(
                                    editDefaultState.color ?? color,
                                    (c) => setEditDefaultState((p) => ({ ...p, color: c })),
                                )}
                                <div className="cm-edit-actions">
                                    <button className="btn btn-primary cm-btn-sm" onClick={saveEditDefault} disabled={saving}>
                                        {saving ? '…' : (lang === 'en' ? 'Save' : 'Kaydet')}
                                    </button>
                                    <button className="btn btn-secondary cm-btn-sm" onClick={() => setEditingDefault(null)}>
                                        {lang === 'en' ? 'Cancel' : 'İptal'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <span className="cm-icon">{icon}</span>
                                <span className="cm-color-dot" style={{ background: color }} />
                                <span className="cm-name">
                                    {base.name}
                                    {hasOverride && <span className="cm-badge cm-badge--override">{lang === 'en' ? 'custom' : 'özel'}</span>}
                                </span>
                                <div className="cm-row-actions">
                                    <button
                                        className="cm-action-btn cm-action-btn--edit"
                                        onClick={() => startEditDefault(base.name)}
                                        title={lang === 'en' ? 'Edit' : 'Düzenle'}
                                        disabled={saving}
                                    >✏️</button>
                                    <button
                                        className={`cm-action-btn ${isHidden ? 'cm-action-btn--show' : 'cm-action-btn--hide'}`}
                                        onClick={() => toggleDefaultVisibility(base.name)}
                                        title={isHidden ? (lang === 'en' ? 'Show' : 'Göster') : (lang === 'en' ? 'Hide' : 'Gizle')}
                                        disabled={saving}
                                    >{isHidden ? '👁' : '🚫'}</button>
                                </div>
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );

    const renderCustomTab = () => (
        <div>
            {/* Existing custom categories */}
            {customCategories.filter((c) => !BUILTIN_DEFAULTS.some((b) => b.name === c.name)).length === 0 && (
                <p className="cm-empty">{lang === 'en' ? 'No custom categories yet.' : 'Henüz özel kategori yok.'}</p>
            )}
            <div className="cm-list">
                {customCategories
                    .map((cat, origIdx) => ({ cat, origIdx }))
                    .filter(({ cat }) => !BUILTIN_DEFAULTS.some((b) => b.name === cat.name))
                    .map(({ cat, origIdx }) => {
                        const isEditing = editingCustomIdx === origIdx;
                        return (
                            <div key={origIdx} className="cm-row">
                                {isEditing ? (
                                    <div className="cm-edit-inline">
                                        <div className="cm-edit-header">
                                            <input
                                                className="cm-icon-input"
                                                value={editCustomState.icon ?? cat.icon}
                                                onChange={(e) => setEditCustomState((p) => ({ ...p, icon: e.target.value }))}
                                                maxLength={2}
                                            />
                                            <input
                                                className="input cm-name-input"
                                                value={editCustomState.name ?? cat.name}
                                                onChange={(e) => setEditCustomState((p) => ({ ...p, name: e.target.value }))}
                                            />
                                        </div>
                                        {renderColorPicker(
                                            editCustomState.color ?? cat.color,
                                            (c) => setEditCustomState((p) => ({ ...p, color: c })),
                                        )}
                                        <div className="cm-edit-actions">
                                            <button className="btn btn-primary cm-btn-sm" onClick={saveEditCustom} disabled={saving}>
                                                {saving ? '…' : (lang === 'en' ? 'Save' : 'Kaydet')}
                                            </button>
                                            <button className="btn btn-secondary cm-btn-sm" onClick={() => setEditingCustomIdx(null)}>
                                                {lang === 'en' ? 'Cancel' : 'İptal'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <span className="cm-icon">{cat.icon}</span>
                                        <span className="cm-color-dot" style={{ background: cat.color }} />
                                        <span className="cm-name">{cat.name}</span>
                                        <div className="cm-row-actions">
                                            <button
                                                className="cm-action-btn cm-action-btn--edit"
                                                onClick={() => startEditCustom(origIdx)}
                                                title={lang === 'en' ? 'Edit' : 'Düzenle'}
                                                disabled={saving}
                                            >✏️</button>
                                            <button
                                                className="cm-action-btn cm-action-btn--delete"
                                                onClick={() => handleDeleteCustom(origIdx)}
                                                title={tr.settings_category_delete}
                                                disabled={saving}
                                            >🗑</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
            </div>

            {/* Add new */}
            <div className="cm-add-section">
                <p className="cm-add-title">{tr.settings_category_add}</p>
                <div className="cm-add-row">
                    <input
                        type="text"
                        placeholder="📌"
                        value={newIcon}
                        onChange={(e) => setNewIcon(e.target.value)}
                        maxLength={2}
                        className="cm-icon-input"
                    />
                    <input
                        type="text"
                        placeholder={tr.settings_category_name}
                        value={newName}
                        onChange={(e) => { setNewName(e.target.value); setError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
                        className="input"
                        style={{ flex: 1 }}
                    />
                    <button
                        className="btn btn-primary"
                        onClick={handleAddCustom}
                        disabled={saving || !newName.trim()}
                    >
                        {saving ? '…' : `+ ${lang === 'en' ? 'Add' : 'Ekle'}`}
                    </button>
                </div>
                {renderColorPicker(newColor, setNewColor)}
            </div>
        </div>
    );

    return (
        <div className="cm-root">
            {/* Tab bar */}
            <div className="cm-tabs">
                <button
                    className={`cm-tab ${activeTab === 'default' ? 'active' : ''}`}
                    onClick={() => setActiveTab('default')}
                >
                    {lang === 'en' ? `Default (${BUILTIN_DEFAULTS.length})` : `Varsayılan (${BUILTIN_DEFAULTS.length})`}
                </button>
                <button
                    className={`cm-tab ${activeTab === 'custom' ? 'active' : ''}`}
                    onClick={() => setActiveTab('custom')}
                >
                    {lang === 'en'
                        ? `Custom (${customCategories.filter((c) => !BUILTIN_DEFAULTS.some((b) => b.name === c.name)).length})`
                        : `Özel (${customCategories.filter((c) => !BUILTIN_DEFAULTS.some((b) => b.name === c.name)).length})`}
                </button>
            </div>

            <div className="cm-body">
                {activeTab === 'default' ? renderDefaultTab() : renderCustomTab()}
            </div>

            {error && <p className="cm-error">{error}</p>}

            <style>{`
                .cm-root { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
                .cm-tabs { display: flex; border-bottom: 1px solid var(--border); background: var(--surface); }
                .cm-tab { flex: 1; padding: 9px 12px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-2); font-size: 12px; font-weight: 500; cursor: pointer; transition: all .15s; font-family: var(--sans); }
                .cm-tab:hover { color: var(--text-1); }
                .cm-tab.active { color: var(--accent); border-bottom-color: var(--accent); background: var(--bg); }
                .cm-body { padding: 12px; max-height: 380px; overflow-y: auto; }
                .cm-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
                .cm-row { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 7px; background: var(--surface); border: 1px solid var(--border); transition: opacity .2s; }
                .cm-row--hidden { opacity: 0.38; }
                .cm-icon { font-size: 16px; width: 20px; text-align: center; flex-shrink: 0; }
                .cm-color-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; border: 1px solid rgba(255,255,255,.15); }
                .cm-name { flex: 1; font-size: 13px; color: var(--text-1); display: flex; align-items: center; gap: 6px; }
                .cm-badge { font-size: 9px; padding: 1px 5px; border-radius: 4px; font-weight: 600; }
                .cm-badge--override { background: var(--accent); color: var(--bg); opacity: .8; }
                .cm-row-actions { display: flex; gap: 3px; flex-shrink: 0; }
                .cm-action-btn { width: 26px; height: 26px; border: none; background: none; cursor: pointer; border-radius: 5px; font-size: 13px; display: flex; align-items: center; justify-content: center; opacity: 0.6; transition: all .15s; }
                .cm-action-btn:hover:not(:disabled) { opacity: 1; background: var(--surface-2); }
                .cm-action-btn:disabled { cursor: not-allowed; }
                .cm-edit-inline { width: 100%; display: flex; flex-direction: column; gap: 8px; }
                .cm-edit-header { display: flex; align-items: center; gap: 8px; }
                .cm-edit-name { font-size: 13px; font-weight: 600; color: var(--text-1); flex: 1; }
                .cm-icon-input { width: 40px; height: 32px; text-align: center; font-size: 16px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text-1); padding: 0; }
                .cm-name-input { flex: 1; font-size: 13px; }
                .cm-color-row { display: flex; flex-wrap: wrap; gap: 5px; padding-left: 2px; }
                .cm-swatch { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; transition: border-color .1s; }
                .cm-swatch.active { border-color: var(--text-1) !important; }
                .cm-color-native { width: 18px; height: 18px; padding: 0; border: none; cursor: pointer; border-radius: 50%; overflow: hidden; background: none; }
                .cm-edit-actions { display: flex; gap: 6px; }
                .cm-btn-sm { padding: 4px 10px; font-size: 12px; }
                .cm-add-section { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
                .cm-add-title { font-size: 11px; font-weight: 600; color: var(--text-2); text-transform: uppercase; letter-spacing: .04em; margin: 0; }
                .cm-add-row { display: flex; gap: 7px; align-items: center; }
                .cm-empty { font-size: 13px; color: var(--text-3); padding: 8px 0; }
                .cm-error { font-size: 12px; color: var(--orange); margin: 8px 12px 0; padding: 7px 10px; background: rgba(247,129,102,.07); border-radius: 6px; }
            `}</style>
        </div>
    );
}