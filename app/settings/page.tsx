'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import { Save, RefreshCw, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ProjectConfig {
    project_id: string;
    source_identity_kr: string;
    source_identity_en: string; // Added
    source_author_kr: string;   // Added
    source_author_en: string;   // Added
    source_scale: string;
    l2_unit_type: string;
    l3_unit_type: string;
    genre_kr: string;
    genre_en: string;           // Added
    art_style_kr: string;
    art_style_en: string;       // Added
    story_tone_kr: string;
    story_tone_en: string;      // Added
    target_minutes: number;
    world_country_kr: string;   // Added
    world_country_en: string;   // Added
    world_city_kr: string;
    world_city_en: string;      // Added
    cultural_setting_kr: string;
    cultural_setting_en: string; // Added
    aesthetic_dna_kr: string;
    aesthetic_dna_en: string;    // Added
    cinematography_kr: string;
    cinematography_en: string;   // Added
    narrative_tempo_kr: string;
    narrative_tempo_en: string;  // Added
    audio_palette_bgm_kr: string; // Added
    audio_palette_bgm_en: string; // Added
    audio_palette_ambience_kr: string; // Added
    audio_palette_ambience_en: string; // Added
}

export default function SettingsPage() {
    const router = useRouter();
    const { t, lang } = useLanguage();
    const { projectConfig: initialConfig, refreshProject, projectId } = useProject();
    const [config, setConfig] = useState<ProjectConfig | null>(null);
    const [masterOptions, setMasterOptions] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        async function fetchOptions() {
            const res = await fetch('/api/options');
            const data = await res.json();
            setMasterOptions(data);
        }
        fetchOptions();
    }, []);

    const updateBilingualField = (category: string, value: string, fromLang: 'KR' | 'EN') => {
        if (!config) return;

        const options = masterOptions[category] || [];
        let otherValue = '';

        if (fromLang === 'KR') {
            const match = options.find((opt: any) => opt.label_kr === value);
            otherValue = match ? match.label_en : (config as any)[`${category}_en` || ''];

            // Special mapping for field names that don't match category exactly
            const enKey = category === 'world_city' ? 'world_city_en'
                : category === 'world_country' ? 'world_country_en'
                    : category === 'cultural_setting' ? 'cultural_setting_en'
                        : category === 'aesthetic_dna' ? 'aesthetic_dna_en'
                            : category === 'cinematography' ? 'cinematography_en'
                                : category === 'narrative_tempo' ? 'narrative_tempo_en'
                                    : category === 'audio_bgm' ? 'audio_palette_bgm_en'
                                        : category === 'audio_ambience' ? 'audio_palette_ambience_en'
                                            : `${category}_en`;

            const krKey = category === 'audio_bgm' ? 'audio_palette_bgm_kr'
                : category === 'audio_ambience' ? 'audio_palette_ambience_kr'
                    : `${category}_kr`;

            setConfig({
                ...config,
                [krKey]: value,
                [enKey]: otherValue || (config as any)[enKey]
            });
        } else {
            const match = options.find((opt: any) => opt.label_en === value);
            otherValue = match ? match.label_kr : (config as any)[`${category}_kr` || ''];

            const enKey = category === 'audio_bgm' ? 'audio_palette_bgm_en'
                : category === 'audio_ambience' ? 'audio_palette_ambience_en'
                    : `${category}_en`;

            const krKey = category === 'world_city' ? 'world_city_kr'
                : category === 'world_country' ? 'world_country_kr'
                    : category === 'cultural_setting' ? 'cultural_setting_kr'
                        : category === 'aesthetic_dna' ? 'aesthetic_dna_kr'
                            : category === 'cinematography' ? 'cinematography_kr'
                                : category === 'narrative_tempo' ? 'narrative_tempo_kr'
                                    : category === 'audio_bgm' ? 'audio_palette_bgm_kr'
                                        : category === 'audio_ambience' ? 'audio_palette_ambience_kr'
                                            : `${category}_kr`;

            setConfig({
                ...config,
                [enKey]: value,
                [krKey]: otherValue || (config as any)[krKey]
            });
        }
    };

    useEffect(() => {
        if (initialConfig) {
            // Ensure we have default values if DB returns null
            setConfig({
                ...initialConfig,
                source_scale: initialConfig.source_scale || 'Saga',
                l2_unit_type: initialConfig.l2_unit_type || 'Volume',
                l3_unit_type: initialConfig.l3_unit_type || 'Episode'
            });
            setLoading(false);
        } else if (projectId === null) {
            setLoading(false);
        }
    }, [initialConfig, projectId]);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        if (!config) return;

        setSaving(true);
        setMessage(null);

        const { error } = await supabase
            .from('project_master_config')
            .update({
                source_identity_en: config.source_identity_en,
                source_author_kr: config.source_author_kr,
                source_author_en: config.source_author_en,
                source_scale: config.source_scale,
                l2_unit_type: config.l2_unit_type,
                l3_unit_type: config.l3_unit_type,
                genre_kr: config.genre_kr,
                genre_en: config.genre_en,
                art_style_kr: config.art_style_kr,
                art_style_en: config.art_style_en,
                story_tone_kr: config.story_tone_kr,
                story_tone_en: config.story_tone_en,
                target_minutes: config.target_minutes,
                world_country_kr: config.world_country_kr,
                world_country_en: config.world_country_en,
                world_city_kr: config.world_city_kr,
                world_city_en: config.world_city_en,
                cultural_setting_kr: config.cultural_setting_kr,
                cultural_setting_en: config.cultural_setting_en,
                aesthetic_dna_kr: config.aesthetic_dna_kr,
                aesthetic_dna_en: config.aesthetic_dna_en,
                cinematography_kr: config.cinematography_kr,
                cinematography_en: config.cinematography_en,
                narrative_tempo_kr: config.narrative_tempo_kr,
                narrative_tempo_en: config.narrative_tempo_en,
                audio_palette_bgm_kr: config.audio_palette_bgm_kr,
                audio_palette_bgm_en: config.audio_palette_bgm_en,
                audio_palette_ambience_kr: config.audio_palette_ambience_kr,
                audio_palette_ambience_en: config.audio_palette_ambience_en
            })
            .eq('project_id', config.project_id);

        if (error) {
            setMessage({ type: 'error', text: t.settings.failed_save + error.message });
        } else {
            setMessage({ type: 'success', text: t.settings.success_save });
            // Global context sync
            await refreshProject();
            router.refresh();
        }
        setSaving(false);
    }

    if (loading) return (
        <div className="flex bg-[#0f0f12] h-screen items-center justify-center text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" /> {t.settings.loading_config}
        </div>
    );

    if (!config) {
        if (!projectId) {
            return (
                <div className="flex flex-col bg-[#0f0f12] h-screen items-center justify-center text-gray-500 gap-4">
                    <AlertCircle className="w-12 h-12 opacity-50" />
                    <div className="text-center">
                        <h2 className="text-xl font-bold mb-2">{lang === 'KO' ? '프로젝트를 선택해주세요' : 'No Project Selected'}</h2>
                        <button
                            onClick={() => router.push('/')}
                            className="bg-white/5 hover:bg-white/10 px-6 py-2 rounded-lg text-sm font-bold transition-colors"
                        >
                            {lang === 'KO' ? '대시보드로 이동' : 'Go directly to Dashboard'}
                        </button>
                    </div>
                </div>
            );
        }
        return (
            <div className="flex bg-[#0f0f12] h-screen items-center justify-center text-red-400">
                <AlertCircle className="w-6 h-6 mr-2" /> {t.settings.failed_config}
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-[#0f0f12] text-white p-8 lg:p-12 font-sans overflow-y-auto">
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="max-w-4xl mx-auto pb-20"
            >
                <header className="mb-10 border-b border-white/10 pb-6">
                    <h1 className="text-3xl font-bold mb-2">{t.settings.title}</h1>
                    <p className="text-gray-400">{t.settings.subtitle} for: <span className="text-purple-400 font-mono">{config.project_id}</span></p>
                </header>

                {message && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`p-4 rounded-xl mb-8 border ${message.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
                            }`}
                    >
                        {message.text}
                    </motion.div>
                )}

                <form onSubmit={handleSave} className="space-y-8">
                    {/* Core Identity Section */}
                    <div className="glass-panel p-8 rounded-2xl space-y-6">
                        <h2 className="text-xl font-semibold flex items-center gap-2 mb-6 text-purple-400">
                            <span className="w-2 h-6 bg-purple-500 rounded-full" />
                            {t.settings.core_identity}
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {lang === 'KO' ? (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.settings.source_material} (KR)</label>
                                        <input
                                            type="text"
                                            value={config.source_identity_kr}
                                            disabled
                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-gray-500 cursor-not-allowed"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">작가 (Author KR)</label>
                                        <input
                                            type="text"
                                            value={config.source_author_kr || ''}
                                            onChange={(e) => setConfig({ ...config, source_author_kr: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.settings.source_material} (EN)</label>
                                        <input
                                            type="text"
                                            value={config.source_identity_en}
                                            onChange={(e) => setConfig({ ...config, source_identity_en: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Author (EN)</label>
                                        <input
                                            type="text"
                                            value={config.source_author_en || ''}
                                            onChange={(e) => setConfig({ ...config, source_author_en: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                                        />
                                    </div>
                                </>
                            )}

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                                    {lang === 'KO' ? '프로젝트 유형 (Source Scale)' : 'Project Type (Scale)'}
                                </label>
                                <select
                                    value={config.source_scale}
                                    onChange={(e) => setConfig({ ...config, source_scale: e.target.value })}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-purple-500 outline-none transition-all appearance-none text-purple-300 font-bold"
                                >
                                    <option value="Saga">{lang === 'KO' ? '대하소설 / 시리즈 (Saga)' : 'Saga (Series)'}</option>
                                    <option value="Novel">{lang === 'KO' ? '단행본 / 영화 (Novel/Movie)' : 'Novel / Movie'}</option>
                                    <option value="WebNovel">{lang === 'KO' ? '웹소설 / 드라마 (WebNovel)' : 'WebNovel / Drama'}</option>
                                </select>
                                <p className="text-[10px] text-gray-600 pl-1 flex gap-2">
                                    <span>L2: {config.l2_unit_type}</span>
                                    <span>L3: {config.l3_unit_type}</span>
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.settings.target_min}</label>
                                <input
                                    type="number"
                                    value={config.target_minutes}
                                    onChange={(e) => setConfig({ ...config, target_minutes: Number(e.target.value) })}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Creative Direction & Narrative Section */}
                    <div className="glass-panel p-8 rounded-2xl space-y-6">
                        <h2 className="text-xl font-semibold flex items-center gap-2 mb-6 text-blue-400">
                            <span className="w-2 h-6 bg-blue-500 rounded-full" />
                            {lang === 'KO' ? '서사 및 세계관 설정' : 'Narrative & World Settings'}
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.settings.genre_label} ({lang === 'KO' ? 'KR' : 'EN'})</label>
                                <input
                                    type="text"
                                    value={lang === 'KO' ? (config.genre_kr || '') : (config.genre_en || '')}
                                    onChange={(e) => updateBilingualField('genre', e.target.value, lang === 'KO' ? 'KR' : 'EN')}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-blue-300 font-bold"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.settings.story_tone_label} ({lang === 'KO' ? 'KR' : 'EN'})</label>
                                <input
                                    type="text"
                                    value={lang === 'KO' ? (config.story_tone_kr || '') : (config.story_tone_en || '')}
                                    onChange={(e) => updateBilingualField('story_tone', e.target.value, lang === 'KO' ? 'KR' : 'EN')}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{lang === 'KO' ? '국가 (Country)' : 'Country'} ({lang === 'KO' ? 'KR' : 'EN'})</label>
                                <input
                                    type="text"
                                    value={lang === 'KO' ? (config.world_country_kr || '') : (config.world_country_en || '')}
                                    onChange={(e) => updateBilingualField('world_country', e.target.value, lang === 'KO' ? 'KR' : 'EN')}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.settings.world_city_label} ({lang === 'KO' ? 'KR' : 'EN'})</label>
                                <input
                                    type="text"
                                    value={lang === 'KO' ? (config.world_city_kr || '') : (config.world_city_en || '')}
                                    onChange={(e) => updateBilingualField('world_city', e.target.value, lang === 'KO' ? 'KR' : 'EN')}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                            </div>

                            <div className="space-y-2 col-span-full">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.settings.culture_label} ({lang === 'KO' ? 'KR' : 'EN'})</label>
                                <input
                                    type="text"
                                    value={lang === 'KO' ? (config.cultural_setting_kr || '') : (config.cultural_setting_en || '')}
                                    onChange={(e) => updateBilingualField('cultural_setting', e.target.value, lang === 'KO' ? 'KR' : 'EN')}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Visual Style Section */}
                    <div className="glass-panel p-8 rounded-2xl space-y-6">
                        <h2 className="text-xl font-semibold flex items-center gap-2 mb-6 text-pink-400">
                            <span className="w-2 h-6 bg-pink-500 rounded-full" />
                            {lang === 'KO' ? '시각적 스타일 설정' : 'Visual Style Settings'}
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.settings.art_style_label} ({lang === 'KO' ? 'KR' : 'EN'})</label>
                                <input
                                    type="text"
                                    value={lang === 'KO' ? (config.art_style_kr || '') : (config.art_style_en || '')}
                                    onChange={(e) => updateBilingualField('art_style', e.target.value, lang === 'KO' ? 'KR' : 'EN')}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-pink-500 outline-none transition-all text-pink-300 font-bold"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.settings.aesthetic_label} ({lang === 'KO' ? 'KR' : 'EN'})</label>
                                <input
                                    type="text"
                                    value={lang === 'KO' ? (config.aesthetic_dna_kr || '') : (config.aesthetic_dna_en || '')}
                                    onChange={(e) => updateBilingualField('aesthetic_dna', e.target.value, lang === 'KO' ? 'KR' : 'EN')}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-pink-500 outline-none transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.settings.cinema_label} ({lang === 'KO' ? 'KR' : 'EN'})</label>
                                <input
                                    type="text"
                                    value={lang === 'KO' ? (config.cinematography_kr || '') : (config.cinematography_en || '')}
                                    onChange={(e) => updateBilingualField('cinematography', e.target.value, lang === 'KO' ? 'KR' : 'EN')}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-pink-500 outline-none transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.settings.tempo_label} ({lang === 'KO' ? 'KR' : 'EN'})</label>
                                <input
                                    type="text"
                                    value={lang === 'KO' ? (config.narrative_tempo_kr || '') : (config.narrative_tempo_en || '')}
                                    onChange={(e) => updateBilingualField('narrative_tempo', e.target.value, lang === 'KO' ? 'KR' : 'EN')}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-pink-500 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Audio Palette Section */}
                    <div className="glass-panel p-8 rounded-2xl space-y-6">
                        <h2 className="text-xl font-semibold flex items-center gap-2 mb-6 text-green-400">
                            <span className="w-2 h-6 bg-green-500 rounded-full" />
                            {lang === 'KO' ? '오디오 팔레트 설정' : 'Audio Palette Settings'}
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{lang === 'KO' ? '배경 음악 (BGM)' : 'BGM Style'} ({lang === 'KO' ? 'KR' : 'EN'})</label>
                                <input
                                    type="text"
                                    value={lang === 'KO' ? (config.audio_palette_bgm_kr || '') : (config.audio_palette_bgm_en || '')}
                                    onChange={(e) => updateBilingualField('audio_bgm', e.target.value, lang === 'KO' ? 'KR' : 'EN')}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{lang === 'KO' ? '환경음 (Ambience)' : 'Ambience Style'} ({lang === 'KO' ? 'KR' : 'EN'})</label>
                                <input
                                    type="text"
                                    value={lang === 'KO' ? (config.audio_palette_ambience_kr || '') : (config.audio_palette_ambience_en || '')}
                                    onChange={(e) => updateBilingualField('audio_ambience', e.target.value, lang === 'KO' ? 'KR' : 'EN')}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 focus:ring-2 focus:ring-green-500 outline-none transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-8 py-4 rounded-xl font-bold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-900/40"
                        >
                            {saving ? (
                                <>
                                    <RefreshCw className="w-5 h-5 animate-spin" /> {t.settings.saving_changes}
                                </>
                            ) : (
                                <>
                                    <Save className="w-5 h-5" /> {t.settings.save_config}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </motion.div >
        </main >
    );
}
