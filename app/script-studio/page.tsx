'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@supabase/supabase-js';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import { FileText, Sparkles, Loader2, Save, Settings, X, Info, Languages, ChevronRight, History, Film, BookOpen, Archive } from 'lucide-react';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function ScriptStudioContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const episodeId = searchParams.get('source_episode_id');
    const { lang } = useLanguage();
    const { projectId, projectConfig } = useProject();

    const [isGenerating, setIsGenerating] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    const [sourceNovel, setSourceNovel] = useState('');
    const [sourceNovelEn, setSourceNovelEn] = useState('');
    const [episodeTitle, setEpisodeTitle] = useState(searchParams.get('title') || '');
    const [sourceMetadata, setSourceMetadata] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'script_kr' | 'script_en'>(lang === 'KO' ? 'script_kr' : 'script_en');
    const [generatedData, setGeneratedData] = useState<any>({
        script_kr: '',
        script_en: ''
    });


    useEffect(() => {
        if (episodeId) {
            fetchSourceData(episodeId);
        }
    }, [episodeId, projectId]);

    async function fetchSourceData(id: string) {
        try {
            // 1. Fetch Basic Info from story_summary
            const { data: summary, error: sumError } = await supabase
                .from('story_summary')
                .select('synthesized_title_kr, unit_title_kr, synthesized_title_en, unit_title_en, last_synthesized_at, created_at')
                .eq('id', id)
                .single();

            if (sumError) throw sumError;

            // 2. Fetch Source Novel (Prose) from episodes
            const { data: epData, error: epError } = await supabase
                .from('episodes')
                .select('prose_kr, prose_en, script_kr, script_en')
                .eq('story_id', id)
                .maybeSingle();

            if (summary) {
                // Determine Source Novel content: Prefer episodes.prose, fallback to story_summary if empty
                const novelContent = epData?.prose_kr || '';
                const novelContentEn = epData?.prose_en || '';
                setSourceNovel(novelContent);
                setSourceNovelEn(novelContentEn);

                const dbTitle = lang === 'KO'
                    ? (summary.synthesized_title_kr || summary.unit_title_kr)
                    : (summary.synthesized_title_en || summary.unit_title_en || summary.synthesized_title_kr || summary.unit_title_kr);
                if (dbTitle) setEpisodeTitle(dbTitle);

                setSourceMetadata({
                    from: '소설 스튜디오',
                    timestamp: summary.last_synthesized_at || summary.created_at
                });

                // Load existing script if any
                if (epData) {
                    setGeneratedData({
                        script_kr: epData.script_kr || '',
                        script_en: epData.script_en || ''
                    });
                }
            }
        } catch (err: any) {
            console.error('데이터 불러오기 오류:', err.message || err);
        }
    }

    const handleDownloadToFile = () => {
        const content = generatedData[activeTab];
        if (!content) return;

        const filename = `[대본]_${episodeTitle || 'untitled'}_${new Date().toISOString().split('T')[0]}.txt`;
        const blob = new Blob([`제목: ${episodeTitle}\n언어: ${activeTab === 'script_kr' ? '국문' : '영문'}\n날짜: ${new Date().toLocaleString()}\n\n-------------------\n\n${content}`], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    async function handleAdaptToScript() {
        if (!projectId || !sourceNovel) {
            alert(lang === 'KO' ? '프로젝트 또는 소설 본문이 없습니다!' : 'No project or source novel!');
            return;
        }

        if (generatedData[activeTab]) {
            if (!confirm(lang === 'KO' ? '이미 작성된 내용이 있습니다. 소설 본문을 기반으로 다시 각색하시겠습니까?' : 'Content already exists. Adapt again from the novel source?')) {
                return;
            }
        }

        setIsGenerating(true);
        try {
            const currentLang = activeTab === 'script_kr' ? 'KO' : 'EN';

            const res = await fetch('/api/synthesize-story', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    storyId: episodeId,
                    format: 'SCRIPT',
                    language: currentLang,
                    mode: 'ADAPT_TO_SCRIPT',
                    refText: sourceNovel
                })
            });

            if (!res.ok) throw new Error('각색 실패');
            const result = await res.json();

            setGeneratedData((prev: any) => ({
                ...prev,
                [activeTab]: result?.data?.synthesized_kr || result?.data?.synthesized_en || result?.rawText || ''
            }));

        } catch (error: any) {
            alert(error.message);
        } finally {
            setIsGenerating(false);
        }
    }

    async function handleTranslate() {
        const sourceTab = activeTab === 'script_kr' ? 'script_en' : 'script_kr';
        const sourceText = generatedData[sourceTab];

        if (!sourceText) {
            alert(lang === 'KO' ? '번역할 원본 내용이 없습니다!' : 'No source text to translate!');
            return;
        }

        setIsTranslating(true);
        try {
            const targetLang = activeTab === 'script_kr' ? 'KO' : 'EN';

            const res = await fetch('/api/synthesize-story', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    storyId: episodeId,
                    format: 'SCRIPT',
                    language: targetLang,
                    mode: 'TRANSLATE',
                    refText: sourceText
                })
            });

            if (!res.ok) throw new Error('번역 실패');
            const result = await res.json();

            setGeneratedData((prev: any) => ({
                ...prev,
                [activeTab]: result.data.synthesized_kr || result.data.synthesized_en || result.rawText
            }));
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsTranslating(false);
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
                    assetName: `[SCRIPT] ${episodeTitle} (${activeTab === 'script_kr' ? 'KR' : 'EN'})`,
                    metadata: {
                        category: 'SCRIPT',
                        episode_id: episodeId,
                        language: activeTab === 'script_kr' ? 'KO' : 'EN',
                        title: episodeTitle
                    }
                })
            });

            if (!res.ok) throw new Error('Failed to save to vault');
            alert(lang === 'KO' ? '금고에 안전하게 보존되었습니다.' : 'Safely preserved in the vault.');
        } catch (err: any) {
            alert(err.message);
        }
    }

    const tabs = [
        { id: 'script_kr', label: lang === 'KO' ? '대본 (국문)' : 'Script (KR)' },
        { id: 'script_en', label: lang === 'KO' ? '대본 (영문)' : 'Script (EN)' }
    ];

    const sortedTabs = lang === 'KO' ? [...tabs] : [...tabs].reverse();

    return (
        <div className="min-h-screen bg-[#0f0f12] p-6">
            <div className="max-w-[2000px] mx-auto mb-8 flex items-center gap-3 text-sm font-bold uppercase tracking-wider text-gray-500">
                <span className="hover:text-purple-400 cursor-pointer transition-colors" onClick={() => router.push('/story-bible')}>{lang === 'KO' ? '스토리 바이블(기획)' : 'Story Bible (Planning)'}</span>
                <ChevronRight className="w-4 h-4 text-gray-700" />
                <span className="hover:text-purple-400 cursor-pointer transition-colors" onClick={() => router.push(`/novel-studio?project_id=${projectId}&source_episode_id=${episodeId}&title=${encodeURIComponent(episodeTitle)}`)}>{lang === 'KO' ? '소설 스튜디오(창작)' : 'Novel Studio (Creation)'}</span>
                <ChevronRight className="w-4 h-4 text-gray-700" />
                <span className="text-pink-400">{lang === 'KO' ? '대본 스튜디오(각색)' : 'Script Studio (Adaptation)'}</span>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-[2000px] mx-auto"
            >
                <div className="mb-8">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-400 to-orange-400 bg-clip-text text-transparent mb-2">
                        {lang === 'KO' ? '대본 스튜디오' : 'Script Studio'}
                    </h1>
                    <p className="text-gray-400 text-lg flex items-center gap-3">
                        {lang === 'KO' ? '소설의 깊이를 시각적인 대본으로 각색합니다.' : 'Adapt the depth of the novel into a visual script.'}
                        <span className="text-pink-400 font-bold">[{projectId || 'Loading...'}]</span>
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
                    <motion.div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-10 shadow-2xl flex flex-col h-[850px]">
                        <div className="flex items-center justify-between mb-6 h-16 border-b border-white/5 pb-6">
                            <div className="flex items-center gap-3">
                                <BookOpen className="w-6 h-6 text-pink-400" />
                                <h2 className="text-2xl font-bold text-white">
                                    {lang === 'KO' ? '원본 소설' : 'Source Novel'}
                                    {episodeTitle && <span className="text-pink-400 ml-2">[{episodeTitle}]</span>}
                                </h2>
                            </div>
                            {sourceMetadata && (
                                <div className="flex flex-col items-end">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                                        <History className="w-3 h-3" />
                                        {lang === 'KO' ? '전송원' : 'Source'}: {sourceMetadata.from}
                                    </span>
                                    <span className="text-[9px] text-gray-600 font-mono">
                                        {new Date(sourceMetadata.timestamp).toLocaleString()}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex-1 w-full bg-black/30 border border-white/10 rounded-2xl p-8 text-white/90 font-mono text-sm leading-relaxed mb-6 overflow-y-auto">
                            {((activeTab === 'script_kr' ? sourceNovel : sourceNovelEn) || (lang === 'KO' ? '소설 스튜디오에서 먼저 소설을 작성해 주세요.' : 'Please write a novel in the Novel Studio first.'))}
                        </div>

                        <div className="flex items-center justify-between gap-4 h-24 border-t border-white/5 pt-6">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleAdaptToScript}
                                    disabled={isGenerating || isTranslating || !sourceNovel}
                                    className="px-8 py-4 bg-pink-600 hover:bg-pink-500 disabled:bg-gray-600 rounded-2xl font-bold text-white transition-all flex items-center gap-3 shadow-lg shadow-pink-900/20"
                                >
                                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Film className="w-5 h-5" />}
                                    {isGenerating ? (lang === 'KO' ? '대본 각색 중...' : 'Adapting to Script...') : (lang === 'KO' ? '대본으로 각색하기' : 'Adapt to Script')}
                                </button>
                            </div>
                        </div>

                    </motion.div>

                    <motion.div className="bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-10 shadow-2xl flex flex-col h-[850px]">
                        <div className="flex items-center justify-between mb-6 h-16 border-b border-white/5 pb-6">
                            <div className="flex items-center gap-4">
                                <h2 className="text-2xl font-bold text-white">{lang === 'KO' ? '각색된 대본' : 'Adapted Script'}</h2>
                                <div className="px-4 py-2 bg-pink-500/20 border border-pink-500/30 rounded-xl text-pink-300 font-bold text-sm">
                                    {tabs.find(t => t.id === activeTab)?.label}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleSaveToVault}
                                    className="p-3 hover:bg-white/10 rounded-xl transition-all border border-transparent hover:border-white/10 text-white/50 hover:text-amber-400"
                                    title={lang === 'KO' ? '금고에 보관하기' : 'Save to Vault'}
                                >
                                    <Archive className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={handleDownloadToFile}
                                    className="p-3 hover:bg-white/10 rounded-xl transition-all border border-transparent hover:border-white/10"
                                >
                                    <Save className="w-5 h-5 text-white" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 bg-black/30 border border-white/10 rounded-2xl p-8 overflow-y-auto mb-6 relative group">
                            {!generatedData[activeTab] ? (
                                <div className="h-full flex flex-col items-center justify-center text-white/20">
                                    <Sparkles className="w-16 h-16 mb-4 opacity-20" />
                                    <p className="mb-8">{lang === 'KO' ? '원본을 기반으로 대본을 생성하거나 다른 언어를 번역해 주세요.' : 'Please generate script from source or translate other language.'}</p>

                                    {generatedData[activeTab === 'script_kr' ? 'script_en' : 'script_kr'] && (
                                        <button
                                            onClick={handleTranslate}
                                            disabled={isTranslating}
                                            className="px-8 py-4 bg-orange-600 hover:bg-orange-500 rounded-2xl font-bold text-white shadow-2xl transition-all flex items-center gap-3 animate-pulse hover:animate-none"
                                        >
                                            {isTranslating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Languages className="w-5 h-5" />}
                                            {lang === 'KO' ? '국문으로 번역하기' : 'Translate to English'}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <div className="text-white/90 whitespace-pre-wrap leading-relaxed font-mono text-sm">
                                        {generatedData[activeTab]}
                                    </div>
                                    <button
                                        onClick={handleTranslate}
                                        disabled={isTranslating}
                                        className="absolute bottom-6 right-6 p-4 bg-orange-600/80 hover:bg-orange-600 rounded-full shadow-2xl opacity-0 group-hover:opacity-100 transition-all text-white"
                                    >
                                        <Languages className="w-6 h-6" />
                                    </button>
                                </>
                            )}

                            {isTranslating && (
                                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center rounded-2xl z-10">
                                    <Loader2 className="w-10 h-10 text-orange-400 animate-spin mb-4" />
                                    <p className="text-orange-200 font-bold">{lang === 'KO' ? '전문가용 대본 번역 중...' : 'Translating pro script...'}</p>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4 h-24 border-t border-white/5 pt-6 items-center">
                            {sortedTabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`w-full py-4 rounded-xl font-bold text-sm transition-all ${activeTab === tab.id
                                        ? 'bg-pink-600 text-white shadow-lg shadow-pink-900/40'
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

export default function ScriptStudio() {
    return (
        <Suspense fallback={<div className="h-screen bg-[#0f0f12] flex items-center justify-center"><Loader2 className="animate-spin text-pink-500" /></div>}>
            <ScriptStudioContent />
        </Suspense>
    );
}
