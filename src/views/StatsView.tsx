import React, { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useAppStore } from '../store/useAppStore';
import { getLangMap } from '../i18n/translations';
import type { UserCorrection } from '../types';

interface LearnedPattern {
    category: string;
    count: number;
    tags: string[];
}

export const StatsView: React.FC = () => {
    const stats = useAppStore((s) => s.stats);
    const reprocessAll = useAppStore((s) => s.reprocessAll);
    const reprocessLowConf = useAppStore((s) => s.reprocessLowConfidence);
    const setFilters = useAppStore((s) => s.setFilters);
    const setView = useAppStore((s) => s.setView);
    const lang = useAppStore((s) => s.settings?.ui_language ?? 'en');
    const personalizationEnabled = useAppStore((s) => s.settings?.personalization_enabled ?? true);
    const minSamples = useAppStore((s) => s.settings?.personalization_min_samples ?? 2);
    const tr = useMemo(() => getLangMap(lang), [lang]);

    const [reprocessing, setReprocessing] = useState(false);
    const [reprocessMsg, setReprocessMsg] = useState<string | null>(null);
    const [corrections, setCorrections] = useState<UserCorrection[]>([]);
    const [learnedPatterns, setLearnedPatterns] = useState<LearnedPattern[]>([]);

    useEffect(() => {
        invoke<UserCorrection[]>('get_corrections', { limit: 10 })
            .then(setCorrections)
            .catch(() => { });
    }, []);

    // Öğrenilen paternleri: new_category bazında grupla, eşiği geçenleri göster
    useEffect(() => {
        invoke<UserCorrection[]>('get_corrections', { limit: 500 })
            .then((all) => {
                const catCounts: Record<string, { count: number; tags: Set<string> }> = {};
                for (const c of all) {
                    const key = c.new_category;
                    if (!catCounts[key]) catCounts[key] = { count: 0, tags: new Set() };
                    catCounts[key].count++;
                    (c.new_tags ?? []).forEach((t) => catCounts[key].tags.add(t));
                }
                const patterns: LearnedPattern[] = Object.entries(catCounts)
                    .filter(([, v]) => v.count >= minSamples)
                    .sort(([, a], [, b]) => b.count - a.count)
                    .map(([category, v]) => ({
                        category,
                        count: v.count,
                        tags: Array.from(v.tags).slice(0, 6),
                    }));
                setLearnedPatterns(patterns);
            })
            .catch(() => { });
    }, [minSamples]);

    if (!stats) {
        return (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                {tr.stats_processing}
            </div>
        );
    }

    const handleReprocessPending = async () => {
        setReprocessing(true);
        setReprocessMsg(null);
        try {
            const count = await reprocessAll();
            setReprocessMsg(`✓ ${count} ${tr.stats_queued_pending}`);
        } catch (e: any) {
            setReprocessMsg(`✗ ${e?.message ?? String(e)}`);
        } finally {
            setReprocessing(false);
        }
    };

    const handleReprocessLow = async () => {
        setReprocessing(true);
        setReprocessMsg(null);
        try {
            const r = await reprocessLowConf();
            setReprocessMsg(`✓ ${r.queued} ${tr.stats_queued_low}`);
        } catch (e: any) {
            setReprocessMsg(`✗ ${e?.message ?? String(e)}`);
        } finally {
            setReprocessing(false);
        }
    };

    const maxCount = Math.max(...(stats.by_category.map((c) => c.count)), 1);

    return (
        <div className="stats-view">
            <div className="stats-header">
                <h2>{tr.stats_title}</h2>
                <p style={{ color: 'var(--text-2)', fontSize: 13 }}>{tr.stats_subtitle}</p>
            </div>

            <div className="stats-body">
                {/* Summary cards */}
                <div className="stats-cards">
                    {[
                        { label: tr.stats_total, value: stats.total },
                        { label: tr.stats_category, value: stats.by_category.length },
                        { label: tr.stats_low_conf, value: stats.low_confidence_count },
                        { label: tr.stats_favorite, value: stats.favorites_count },
                        { label: tr.stats_sensitive, value: stats.sensitive_count },
                        { label: tr.stats_duplicate, value: stats.duplicate_count },
                    ].map(({ label, value }) => (
                        <div key={label} className="stats-card">
                            <span className="stats-card-value">{value}</span>
                            <span className="stats-card-label">{label}</span>
                        </div>
                    ))}
                </div>

                {/* Category distribution */}
                <section className="stats-section">
                    <h3 className="stats-section-title">{tr.stats_category_dist}</h3>
                    {stats.by_category.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{tr.stats_no_category}</p>
                    ) : (
                        <div className="stats-categories">
                            {stats.by_category.map((cat) => (
                                <div
                                    key={cat.category}
                                    className="stats-cat-row"
                                    onClick={() => {
                                        setFilters({ category: cat.category });
                                        setView('gallery');
                                    }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <span className="stats-cat-name">{cat.category}</span>
                                    <div className="stats-cat-bar-wrap">
                                        <div
                                            className="stats-cat-bar"
                                            style={{ width: `${(cat.count / maxCount) * 100}%` }}
                                        />
                                    </div>
                                    <span className="stats-cat-count mono">{cat.count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Activity chart */}
                <section className="stats-section">
                    <h3 className="stats-section-title">{tr.stats_activity}</h3>
                    {stats.by_date.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{tr.stats_no_data}</p>
                    ) : (
                        <div className="stats-activity">
                            {stats.by_date.map((d) => {
                                const maxVal = Math.max(...stats.by_date.map((x) => x.count), 1);
                                return (
                                    <div key={d.date} className="activity-col" title={`${d.date}: ${d.count}`}>
                                        <div
                                            className="activity-bar"
                                            style={{ height: `${(d.count / maxVal) * 48}px` }}
                                        />
                                        <span className="activity-label">{d.date.slice(5)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                {/* Recent corrections */}
                <section className="stats-section">
                    <h3 className="stats-section-title">
                        {tr.stats_recent_fixes}
                        <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>{tr.stats_fine_tuning}</span>
                    </h3>
                    {corrections.length === 0 ? (
                        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{tr.stats_no_data}</p>
                    ) : (
                        <div className="stats-corrections">
                            {corrections.map((c, i) => (
                                <div key={i} className="correction-row">
                                    <div className="correction-main">
                                        <span className="correction-old">{c.old_category ?? '—'}</span>
                                        <span style={{ color: 'var(--text-3)' }}>→</span>
                                        <span className="correction-new">{c.new_category}</span>
                                    </div>
                                    {c.new_tags?.length > 0 && (
                                        <div className="correction-tags">
                                            {c.new_tags.map((t) => <span key={t} className="tag">#{t}</span>)}
                                        </div>
                                    )}
                                    <span className="correction-date mono">{new Date(c.corrected_at).toLocaleDateString()}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Learned patterns */}
                {personalizationEnabled && (
                    <section className="stats-section">
                        <h3 className="stats-section-title">
                            🧠 {tr.stats_learned_patterns}
                            <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>
                                (min {minSamples}x)
                            </span>
                        </h3>
                        {learnedPatterns.length === 0 ? (
                            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{tr.stats_no_learned}</p>
                        ) : (
                            <div className="stats-corrections">
                                {learnedPatterns.map((p) => (
                                    <div key={p.category} className="learned-row">
                                        <span className="correction-new" style={{ minWidth: 110 }}>{p.category}</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.count}× {tr.stats_learned_times}</span>
                                        {p.tags.length > 0 && (
                                            <div className="correction-tags">
                                                {p.tags.map((t) => <span key={t} className="tag">#{t}</span>)}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* Actions */}
                <section className="stats-section">
                    <h3 className="stats-section-title">{tr.stats_actions}</h3>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button className="btn btn-secondary" onClick={handleReprocessPending} disabled={reprocessing}>
                            {reprocessing ? <><div className="spinner" style={{ width: 12, height: 12 }} /> {tr.stats_processing}</> : tr.stats_reprocess_pending}
                        </button>
                        <button className="btn btn-secondary" onClick={handleReprocessLow} disabled={reprocessing}>
                            {reprocessing ? <><div className="spinner" style={{ width: 12, height: 12 }} /> {tr.stats_processing}</> : tr.stats_reprocess_low}
                        </button>
                        {reprocessMsg && (
                            <span style={{ fontSize: 12, color: reprocessMsg.startsWith('✓') ? 'var(--green)' : 'var(--orange)' }}>
                                {reprocessMsg}
                            </span>
                        )}
                    </div>
                </section>
            </div>

            <style>{`
                .stats-view { flex:1; display:flex; flex-direction:column; overflow:hidden; }
                .stats-header { padding:24px 32px 16px; border-bottom:1px solid var(--border); flex-shrink:0; }
                .stats-header h2 { font-size:20px; margin-bottom:4px; }
                .stats-body { flex:1; overflow-y:auto; padding:20px 32px; display:flex; flex-direction:column; gap:0; }
                .stats-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:10px; margin-bottom:24px; }
                .stats-card { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:14px 8px; background:var(--surface); border:1px solid var(--border); border-radius:10px; gap:4px; }
                .stats-card-value { font-size:22px; font-weight:700; font-family:var(--mono); color:var(--accent); }
                .stats-card-label { font-size:11px; color:var(--text-2); text-align:center; }
                .stats-section { padding:20px 0; border-bottom:1px solid var(--border); }
                .stats-section:last-child { border-bottom:none; }
                .stats-section-title { font-size:14px; font-weight:600; margin-bottom:12px; }
                .stats-categories { display:flex; flex-direction:column; gap:7px; }
                .stats-cat-row { display:grid; grid-template-columns:120px 1fr 40px; align-items:center; gap:10px; }
                .stats-cat-name { font-size:12px; color:var(--text-1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .stats-cat-bar-wrap { background:var(--surface); border-radius:4px; height:6px; overflow:hidden; }
                .stats-cat-bar { height:100%; background:var(--accent); border-radius:4px; transition:width .3s; }
                .stats-cat-count { font-size:11px; color:var(--text-2); text-align:right; }
                .stats-activity { display:flex; gap:2px; align-items:flex-end; height:64px; padding-bottom:16px; position:relative; overflow-x:auto; }
                .activity-col { display:flex; flex-direction:column; align-items:center; gap:2px; min-width:12px; }
                .activity-bar { background:var(--accent); border-radius:2px 2px 0 0; min-height:2px; width:8px; opacity:.8; transition:height .2s; }
                .activity-label { font-size:8px; color:var(--text-3); font-family:var(--mono); transform:rotate(-45deg); white-space:nowrap; }
                .stats-corrections { display:flex; flex-direction:column; gap:6px; }
                .correction-row { display:flex; flex-direction:column; gap:4px; padding:8px 10px; background:var(--surface); border-radius:6px; font-size:12px; }
                .correction-main { display:flex; align-items:center; gap:8px; }
                .correction-tags { display:flex; flex-wrap:wrap; gap:4px; padding-top:2px; }
                .correction-old { color:var(--orange); }
                .correction-new { color:var(--green); font-weight:500; }
                .correction-date { font-size:10px; color:var(--text-3); margin-top:2px; }
                .learned-row { display:flex; align-items:center; gap:10px; padding:8px 10px; background:var(--surface); border-radius:6px; font-size:12px; flex-wrap:wrap; }
                .tag { background:var(--surface-2, var(--border)); border-radius:4px; padding:1px 6px; font-size:10px; color:var(--text-2); }
            `}</style>
        </div>
    );
};