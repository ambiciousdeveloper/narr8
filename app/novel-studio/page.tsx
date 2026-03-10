'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import { NovelScribe } from '@/agents/chamber-2-4-novel';
import { StoryCritic } from '@/agents/chamber-2-6-critic';
import { createClient } from '@supabase/supabase-js';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import { FileText, Sparkles, Loader2, Save, Settings, X, Info, Send, BookOpen, Languages, ChevronRight, Archive } from 'lucide-react';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function NovelStudioContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const episodeId = searchParams.get('source_episode_id'); // This is the ID from story_summary
    const { lang } = useLanguage();
    const { projectId, projectConfig } = useProject();

    const [isGenerating, setIsGenerating] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    const [synopsis, setSynopsis] = useState('');
    const [episodeTitle, setEpisodeTitle] = useState(searchParams.get('title') || '');
    const [activeTab, setActiveTab] = useState<'novel_kr' | 'novel_en'>(lang === 'KO' ? 'novel_kr' : 'novel_en');
    const [generatedData, setGeneratedData] = useState<any>({
        novel_kr: '',
        novel_en: ''
    });

    // [REMOVED] Local length settings - now using project_master_config.target_minutes only

    // [Technical Debt Clearance] State for Dynamic UI & Config
    const [uiTranslations, setUiTranslations] = useState<Record<string, Record<string, string>>>({});
    const [systemConfig, setSystemConfig] = useState<Record<string, any>>({});

    // Fetch UI Resources & Config on Mount
    useEffect(() => {
        async function loadResources() {
            try {
                // 1. Fetch Translations
                const { data: transData } = await supabase.from('ui_translations').select('*');
                if (transData) {
                    const map: Record<string, Record<string, string>> = {};
                    transData.forEach((row: any) => {
                        if (!map[row.key]) map[row.key] = {};
                        map[row.key][row.lang] = row.text;
                    });
                    setUiTranslations(map);
                }

                // 2. Fetch System Config
                const { data: configData } = await supabase.from('system_config').select('*');
                if (configData) {
                    const configMap: Record<string, any> = {};
                    configData.forEach((row: any) => {
                        configMap[row.key] = row.value;
                    });
                    setSystemConfig(configMap);

                    // [REMOVED] No longer using local state for length settings
                }
            } catch (e) {
                console.error("Failed to load dynamic resources:", e);
            }
        }
        loadResources();
    }, []);

    // Helper: Dynamic Text Resolver
    const t = (key: string, defaultText: string) => {
        return uiTranslations[key]?.[lang] || defaultText;
    };

    // Helper: Dynamic Config Resolver
    const c = (key: string, defaultValue: any) => {
        return systemConfig[key] !== undefined ? systemConfig[key] : defaultValue;
    };

    // [REMOVED] Length settings now pulled directly from DB in API, not stored in frontend state

    useEffect(() => {
        if (episodeId) {
            fetchEpisodeSynopsis(episodeId);
        }
    }, [episodeId, projectId]);

    async function fetchEpisodeSynopsis(id: string) {
        try {
            // 1. Fetch Synopsis from story_summary
            const { data, error } = await supabase
                .from('story_summary')
                .select('original_body_kr, original_body_en, synthesized_body_kr, synthesized_body_en, synthesized_title_kr, unit_title_kr, synthesized_title_en, unit_title_en')
                .eq('id', id)
                .single();

            if (error) throw error;
            if (data) {
                // Fallback: use original_body if synthesized_body is missing
                const content = data.synthesized_body_kr || data.original_body_kr || '';
                setSynopsis(content);

                const dbTitle = lang === 'KO'
                    ? (data.synthesized_title_kr || data.unit_title_kr)
                    : (data.synthesized_title_en || data.unit_title_en || data.synthesized_title_kr || data.unit_title_kr);
                if (dbTitle) setEpisodeTitle(dbTitle);

                // 2. Fetch Existing Prose from episodes
                const { data: epData } = await supabase
                    .from('episodes')
                    .select('prose_kr, prose_en')
                    .eq('story_id', id)
                    .maybeSingle();

                if (epData) {
                    console.log('>>> Found existing prose in episodes table:', epData);
                    setGeneratedData({
                        novel_kr: epData.prose_kr || '',
                        novel_en: epData.prose_en || ''
                    });
                } else {
                    console.log('>>> No existing prose found in episodes table for this ID.');
                    // Don't reset if we are just loading, but ensure consistency
                    setGeneratedData((prev: any) => ({
                        ...prev,
                        novel_kr: prev.novel_kr || '',
                        novel_en: prev.novel_en || ''
                    }));
                }
            } else {
                console.warn('>>> No data found in story_summary for ID:', id);
            }
        } catch (err: any) {
            console.error('에피소드 불러오기 오류:', err.message || err);
        }
    }

    const handleDownloadToFile = () => {
        const content = generatedData[activeTab];
        if (!content) return;

        const filename = `[소설]_${episodeTitle || 'untitled'}_${new Date().toISOString().split('T')[0]}.txt`;
        const blob = new Blob([`제목: ${episodeTitle}\n언어: ${activeTab === 'novel_kr' ? '국문' : '영문'}\n날짜: ${new Date().toLocaleString()}\n\n-------------------\n\n${content}`], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    async function handleGenerate() {
        if (!projectId || !synopsis) {
            alert(t('alert.no_project', lang === 'KO' ? '프로젝트 또는 시놉시스가 없습니다!' : 'No project or synopsis!'));
            return;
        }

        setIsGenerating(true);
        try {
            const currentLang = activeTab === 'novel_kr' ? 'KO' : 'EN';

            const res = await fetch('/api/synthesize-story', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    storyId: episodeId,
                    customConcept: synopsis,
                    format: 'NOVEL',
                    language: currentLang,
                    mode: 'CREATE'
                })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || t('common.error', '생성 실패'));
            }

            const result = await res.json();
            const field = activeTab === 'novel_kr' ? 'synthesized_kr' : 'synthesized_en';
            const content = result?.data?.[field] || result?.data?.synthesized_kr || result?.data?.synthesized_en || result?.rawText || '';

            setGeneratedData((prev: any) => ({
                ...prev,
                [activeTab]: content
            }));

        } catch (error: any) {
            alert(`${t('common.error', '오류')}: ${error.message}`);
        } finally {
            setIsGenerating(false);
        }
    }

    async function handleTranslate() {
        const sourceTab = activeTab === 'novel_kr' ? 'novel_en' : 'novel_kr';
        const sourceText = generatedData[sourceTab];

        if (!sourceText) {
            alert(t('alert.no_content', lang === 'KO' ? '번역할 원본 내용이 없습니다!' : 'No source text to translate!'));
            return;
        }

        setIsTranslating(true);
        try {
            const targetLang = activeTab === 'novel_kr' ? 'KO' : 'EN';

            const res = await fetch('/api/synthesize-story', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    storyId: episodeId,
                    format: 'NOVEL',
                    language: targetLang,
                    mode: 'TRANSLATE',
                    refText: sourceText
                })
            });

            if (!res.ok) throw new Error(t('common.error', '번역 실패'));
            const result = await res.json();
            const field = activeTab === 'novel_kr' ? 'synthesized_kr' : 'synthesized_en';
            const content = result?.data?.[field] || result?.data?.synthesized_kr || result?.data?.synthesized_en || result?.rawText || '';

            setGeneratedData((prev: any) => ({
                ...prev,
                [activeTab]: content
            }));
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsTranslating(false);
        }
    }

    async function handleSendToScript() {
        if (!generatedData.novel_kr && !generatedData.novel_en) {
            alert(t('alert.no_content', lang === 'KO' ? '전송할 소설 본문이 없습니다!' : 'No novel content to send!'));
            return;
        }

        if (confirm(t('novel_studio.send_script', lang === 'KO' ? '이 소설을 대본 스튜디오로 보내시겠습니까?' : 'Send this novel to Script Studio?'))) {
            try {
                const query = new URLSearchParams({
                    project_id: projectId || '',
                    source_episode_id: episodeId || '',
                    title: episodeTitle
                });

                router.push(`/script-studio?${query.toString()}`);
            } catch (err) {
                console.error(err);
            }
        }
    }

    async function handleSaveToVault() {
        const content = generatedData[activeTab];
        if (!content) {
            alert(lang === 'KO' ? '보관할 내용이 없습니다.' : 'No content to archive.');
            return;
        }

        try {
            const res = await fetch('/api/vault-save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    assetType: 'TEXT',
                    content: content,
                    assetName: `[NOVEL] ${episodeTitle} (${activeTab === 'novel_kr' ? 'KR' : 'EN'})`,
                    metadata: {
                        category: 'NOVEL',
                        episode_id: episodeId,
                        language: activeTab === 'novel_kr' ? 'KO' : 'EN',
                        title: episodeTitle
                    }
                })
            });

            if (!res.ok) throw new Error('Failed to save to vault');
            const data = await res.json();
            alert(lang === 'KO' ? '금고에 안전하게 보존되었습니다.' : 'Safely preserved in the vault.');
        } catch (err: any) {
            alert(err.message);
        }
    }

    const tabs = [
        { id: 'novel_kr', label: lang === 'KO' ? '소설 (국문)' : 'Novel (KR)' },
        { id: 'novel_en', label: lang === 'KO' ? '소설 (영문)' : 'Novel (EN)' }
    ];

    const sortedTabs = lang === 'KO' ? [...tabs] : [...tabs].reverse();

    return (
        <div className="min-h-screen bg-[#0f0f12] p-6">
            {/* Breadcrumbs */}
            <div className="max-w-[2000px] mx-auto mb-8 flex items-center gap-3 text-sm font-bold uppercase tracking-wider text-gray-500">
                <span className="hover:text-purple-400 cursor-pointer transition-colors" onClick={() => router.push('/story-bible')}>{lang === 'KO' ? '스토리 바이블(기획)' : 'Story Bible (Planning)'}</span>
                <ChevronRight className="w-4 h-4 text-gray-700" />
                <span className="text-purple-400">{lang === 'KO' ? '소설 스튜디오(창작)' : 'Novel Studio (Creation)'}</span>
                <ChevronRight className="w-4 h-4 text-gray-700 opacity-30" />
                <span className="opacity-30 cursor-not-allowed">{lang === 'KO' ? '대본 스튜디오(각색)' : 'Script Studio (Adaptation)'}</span>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-[2000px] mx-auto"
            >
                <div className="mb-8 flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent mb-2">
                            {t('novel_studio.title', lang === 'KO' ? '소설 스튜디오' : 'Novel Studio')}
                        </h1>
                        <p className="text-gray-400 text-lg flex items-center gap-3">
                            {t('novel_studio.desc', lang === 'KO' ? '시놉시스를 가장 풍부한 문학 작품으로 완성합니다.' : 'Turn your synopsis into a rich literary masterpiece.')}
                            <span className="text-purple-400 font-bold">[{projectId || 'Loading...'}]</span>
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
                    {/* 좌측: 스토리 컨셉 */}
                    <motion.div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-10 shadow-2xl flex flex-col h-[850px]">
                        <div className="flex items-center justify-between mb-6 h-16 border-b border-white/5 pb-6">
                            <div className="flex items-center gap-3">
                                <FileText className="w-6 h-6 text-purple-400" />
                                <h2 className="text-2xl font-bold text-white">
                                    {lang === 'KO' ? '스토리 컨셉' : 'Story Concept'}
                                    {episodeTitle && <span className="text-purple-400 ml-2">[{episodeTitle}]</span>}
                                </h2>
                            </div>
                        </div>

                        <textarea
                            value={synopsis}
                            onChange={(e) => setSynopsis(e.target.value)}
                            className="flex-1 w-full bg-black/30 border border-white/10 rounded-2xl p-6 text-white/90 focus:ring-2 focus:ring-purple-500/50 resize-none font-mono text-sm leading-relaxed mb-6 overflow-y-auto"
                        />

                        <div className="flex items-center justify-between gap-4 h-24 border-t border-white/5 pt-6">
                            <div className="flex items-center gap-3">
                                {/* [REMOVED] Settings button - story length now controlled by DB only */}
                                <button
                                    onClick={handleGenerate}
                                    disabled={isGenerating || isTranslating || !synopsis}
                                    className="px-8 py-4 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded-2xl font-bold text-white transition-all flex items-center gap-3"
                                >
                                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                                    {isGenerating ? t('novel_studio.generating', '소설 집필 중...') : t('novel_studio.generate_btn', '소설 생성하기')}
                                </button>
                            </div>
                        </div>

                        {/* [REMOVED] Settings panel - story length now controlled by project_master_config.target_minutes */}
                    </motion.div>

                    {/* 우측: 결과 표시 */}
                    <motion.div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-10 shadow-2xl flex flex-col h-[850px]">
                        <div className="flex items-center justify-between mb-6 h-16 border-b border-white/5 pb-6">
                            <div className="flex items-center gap-4">
                                <h2 className="text-2xl font-bold text-white">{lang === 'KO' ? '문학 사본' : 'Literary Archive'}</h2>
                                <div className="px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-xl text-purple-300 font-bold text-sm">
                                    {tabs.find(t => t.id === activeTab)?.label}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleSaveToVault}
                                    className="p-3 text-white/50 hover:text-amber-400 transition-all group"
                                    title={lang === 'KO' ? '금고에 보관하기' : 'Save to Vault'}
                                >
                                    <Archive className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                                </button>
                                <button
                                    onClick={handleSendToScript}
                                    className="p-3 text-white/50 hover:text-white transition-all group"
                                    title={t('novel_studio.send_script', '대본 스튜디오로 보내기')}
                                >
                                    <Send className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-0.5 transition-transform" />
                                </button>
                                <button
                                    onClick={handleDownloadToFile}
                                    className="p-3 text-white/50 hover:text-white transition-all group"
                                    title={t('common.save', '저장하기')}
                                >
                                    <Save className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 bg-black/30 border border-white/10 rounded-2xl p-8 overflow-y-auto mb-6 relative group">
                            {!generatedData[activeTab] ? (
                                <div className="h-full flex flex-col items-center justify-center text-white/20">
                                    <BookOpen className="w-16 h-16 mb-4 opacity-20" />
                                    <p className="mb-8">{t('alert.no_content', lang === 'KO' ? '아직 내용이 없습니다.' : 'No content yet.')}</p>

                                    {/* Translation Button (Center) */}
                                    {generatedData[activeTab === 'novel_kr' ? 'novel_en' : 'novel_kr'] && (
                                        <button
                                            onClick={handleTranslate}
                                            disabled={isTranslating}
                                            className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold text-white shadow-2xl transition-all flex items-center gap-3 animate-pulse hover:animate-none"
                                        >
                                            {isTranslating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Languages className="w-5 h-5" />}
                                            {t('novel_studio.translate_btn', lang === 'KO' ? '국문으로 번역하기' : 'Translate to English')}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <div className="text-white/90 whitespace-pre-wrap leading-relaxed font-mono text-sm">
                                        {generatedData[activeTab]}
                                    </div>
                                    {/* Small Floating Translate Button (When content exists) */}
                                    <button
                                        onClick={handleTranslate}
                                        disabled={isTranslating}
                                        className="absolute bottom-6 right-6 p-4 bg-indigo-600/80 hover:bg-indigo-600 rounded-full shadow-2xl opacity-0 group-hover:opacity-100 transition-all text-white"
                                        title={lang === 'KO' ? '다시 번역하기' : 'Retranslate'}
                                    >
                                        <Languages className="w-6 h-6" />
                                    </button>
                                </>
                            )}

                            {/* Loading Overlay */}
                            {isTranslating && (
                                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl z-10">
                                    <Loader2 className="w-10 h-10 text-indigo-400 animate-spin mb-4" />
                                    <p className="text-indigo-200 font-bold">{t('novel_studio.translating', '고품질 번역 중...')}</p>
                                </div>
                            )}
                        </div>

                        {/* Tabs (Dynamic Order) */}
                        <div className="grid grid-cols-2 gap-4 h-24 border-t border-white/5 pt-6 items-center">
                            {sortedTabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`w-full py-4 rounded-xl font-bold text-sm transition-all ${activeTab === tab.id
                                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                                        : 'bg-white/5 text-white/50 hover:bg-white/10'
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
}

export default function NovelStudio() {
    return (
        <Suspense fallback={<div className="h-screen bg-[#0f0f12] flex items-center justify-center"><Loader2 className="animate-spin text-purple-500" /></div>}>
            <NovelStudioContent />
        </Suspense>
    );
}
