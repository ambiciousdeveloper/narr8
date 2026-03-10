'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, Wind, Play, Pause, RefreshCw, Loader2, CheckCircle, Volume2, Sparkles, ChevronRight, Sliders, Info, HardDrive } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function BGMBoardContent() {
    const { lang } = useLanguage();
    const { projectId, projectConfig } = useProject();

    const [chapters, setChapters] = useState<any[]>([]);
    const [audioAssets, setAudioAssets] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState<string | null>(null);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (!projectId) return;
        fetchChapters();
        fetchAudioAssets();
    }, [projectId]);

    async function fetchChapters() {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('story_summary')
            .select('*')
            .eq('project_id', projectId)
            .eq('hierarchy_group', 'L3')
            .order('order_index', { ascending: true });

        if (!error) setChapters(data || []);
        setIsLoading(false);
    }

    async function fetchAudioAssets() {
        if (!projectId) return;
        const { data, error } = await supabase
            .from('chapter_audio_assets')
            .select('*')
            .eq('project_id', projectId);

        if (!error) setAudioAssets(data || []);
    }

    async function handleGenerate(storyId: string, assetType: string, prompt: string) {
        setIsGenerating(`${storyId}-${assetType}`);
        try {
            const res = await fetch('/api/generate-bgm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    storyId,
                    assetType,
                    prompt
                })
            });
            const json = await res.json();
            if (res.ok) {
                setAudioAssets(prev => [...prev.filter(a => !(a.story_id === storyId && a.asset_type === assetType)), json.data]);
            } else {
                alert(json.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsGenerating(null);
        }
    }

    function togglePlay(url: string, id: string) {
        if (playingId === id) {
            audioElement?.pause();
            setPlayingId(null);
        } else {
            if (audioElement) {
                audioElement.pause();
            }
            const newAudio = new Audio(url);
            newAudio.play();
            newAudio.onended = () => setPlayingId(null);
            setAudioElement(newAudio);
            setPlayingId(id);
        }
    }

    const getAsset = (storyId: string, type: string) => {
        return audioAssets.find(a => a.story_id === storyId && a.asset_type === type);
    };

    return (
        <main className="min-h-screen bg-[#0a0a0c] text-white p-8 lg:p-12">
            <header className="max-w-7xl mx-auto mb-12">
                <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-purple-500/60 mb-4">
                    <Music className="w-4 h-4" />
                    <span>{lang === 'KO' ? '사운드 테마 보드' : 'Audio Palette Board'}</span>
                    <ChevronRight className="w-3 h-3" />
                    <span className="text-white">BGM & Ambience</span>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                    <div>
                        <h1 className="text-5xl font-black mb-4 tracking-tight">Audio Palette</h1>
                        <p className="text-gray-400 max-w-2xl text-lg">
                            {lang === 'KO'
                                ? '프로젝트의 전체 분위기에 맞춘 BGM과 환경음을 관리합니다. AI 페어링을 통해 최적의 사운드를 제안받고 직접 생성하세요.'
                                : 'Manage BGMs and Ambience tailored to your project tone. Receive optimized sound pairing via AI and generate assets.'}
                        </p>
                    </div>
                </div>

                {/* Global DNA Summary */}
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center gap-6">
                        <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                            <Music className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Global BGM DNA</span>
                            <span className="text-xl font-bold">{projectConfig?.audio_palette_bgm_kr || 'None'}</span>
                        </div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center gap-6">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                            <Wind className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Global Ambience DNA</span>
                            <span className="text-xl font-bold">{projectConfig?.audio_palette_ambience_kr || 'None'}</span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto space-y-8">
                {isLoading ? (
                    <div className="py-20 flex flex-col items-center gap-4 opacity-30">
                        <Loader2 className="w-12 h-12 animate-spin text-purple-500" />
                        <p className="font-bold">Syncing Chapters...</p>
                    </div>
                ) : chapters.length > 0 ? (
                    chapters.map((chapter, idx) => (
                        <ChapterAudioRow
                            key={chapter.id}
                            chapter={chapter}
                            index={idx}
                            projectAudio={{ bgm: projectConfig?.audio_palette_bgm_kr, ambience: projectConfig?.audio_palette_ambience_kr }}
                            assets={{
                                opening: getAsset(chapter.id, 'BGM_MAIN'),
                                tension: getAsset(chapter.id, 'BGM_TENSION'),
                                climax: getAsset(chapter.id, 'BGM_CLIMAX'),
                                ambience: getAsset(chapter.id, 'AMBIENCE')
                            }}
                            onGenerate={handleGenerate}
                            isGenerating={isGenerating}
                            playingId={playingId}
                            onTogglePlay={togglePlay}
                            lang={lang}
                        />
                    ))
                ) : (
                    <div className="py-20 text-center bg-white/5 border border-dashed border-white/10 rounded-3xl">
                        <Info className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p className="text-gray-500">{lang === 'KO' ? '분석된 챕터(L3)가 없습니다. 스토리 바이블에서 먼저 분석을 진행해 주세요.' : 'No L3 chapters found. Please run analysis in Story Bible first.'}</p>
                    </div>
                )}
            </div>
        </main>
    );
}

function ChapterAudioRow({ chapter, index, projectAudio, assets, onGenerate, isGenerating, playingId, onTogglePlay, lang }: any) {
    const bgmTheme = chapter.audio_palette_bgm_kr || projectAudio.bgm || 'Standard';
    const ambienceTheme = chapter.audio_palette_ambience_kr || projectAudio.ambience || 'Standard';
    const isOverridden = !!chapter.audio_palette_bgm_kr;

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="group relative bg-white/5 hover:bg-white/[0.08] border border-white/10 rounded-3xl p-8 transition-all"
        >
            <div className="flex flex-col lg:flex-row gap-8 items-start lg:items-center">
                {/* Chapter Info */}
                <div className="w-full lg:w-1/4">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px] font-black uppercase">CH {index + 1}</span>
                        {isOverridden && <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-500 uppercase"><Sparkles className="w-3 h-3" /> Override</span>}
                    </div>
                    <h3 className="text-xl font-bold mb-3 truncate">{lang === 'KO' ? chapter.synthesized_title_kr : (chapter.synthesized_title_en || chapter.synthesized_title_kr)}</h3>
                    <div className="flex flex-wrap gap-2">
                        <div className="px-3 py-1 bg-black/40 rounded-full text-[11px] font-medium text-gray-400 border border-white/5">{bgmTheme}</div>
                        <div className="px-3 py-1 bg-black/40 rounded-full text-[11px] font-medium text-gray-400 border border-white/5">{ambienceTheme}</div>
                    </div>
                </div>

                {/* Audio Asset Controls */}
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                    <AudioButton
                        label={lang === 'KO' ? 'Opening' : 'Opening'}
                        subLabel="Main Theme"
                        asset={assets.opening}
                        isGenerating={isGenerating === `${chapter.id}-BGM_MAIN`}
                        onGenerate={() => onGenerate(chapter.id, 'BGM_MAIN', `Create a BGM theme for: ${chapter.synthesized_body_kr?.substring(0, 200)}. Style: ${bgmTheme}`)}
                        isPlaying={playingId === `opening-${chapter.id}`}
                        onPlay={() => onTogglePlay(assets.opening.storage_url, `opening-${chapter.id}`)}
                    />
                    <AudioButton
                        label={lang === 'KO' ? 'Tension' : 'Tension'}
                        subLabel="Conflict"
                        asset={assets.tension}
                        isGenerating={isGenerating === `${chapter.id}-BGM_TENSION`}
                        onGenerate={() => onGenerate(chapter.id, 'BGM_TENSION', `Create a tension/suspense music for: ${chapter.synthesized_body_kr?.substring(0, 200)}. Style: ${bgmTheme}`)}
                        isPlaying={playingId === `tension-${chapter.id}`}
                        onPlay={() => onTogglePlay(assets.tension.storage_url, `tension-${chapter.id}`)}
                    />
                    <AudioButton
                        label={lang === 'KO' ? 'Climax' : 'Climax'}
                        subLabel="Epic Flow"
                        asset={assets.climax}
                        isGenerating={isGenerating === `${chapter.id}-BGM_CLIMAX`}
                        onGenerate={() => onGenerate(chapter.id, 'BGM_CLIMAX', `Create a climax anthem for: ${chapter.synthesized_body_kr?.substring(0, 200)}. Style: ${bgmTheme}`)}
                        isPlaying={playingId === `climax-${chapter.id}`}
                        onPlay={() => onTogglePlay(assets.climax.storage_url, `climax-${chapter.id}`)}
                    />
                    <AudioButton
                        label={lang === 'KO' ? 'Ambience' : 'Ambience'}
                        subLabel="Environment"
                        asset={assets.ambience}
                        isGenerating={isGenerating === `${chapter.id}-AMBIENCE`}
                        onGenerate={() => onGenerate(chapter.id, 'AMBIENCE', `Create environmental soundscape: ${ambienceTheme}. Context: ${chapter.synthesized_body_kr?.substring(0, 200)}`)}
                        isPlaying={playingId === `ambience-${chapter.id}`}
                        onPlay={() => onTogglePlay(assets.ambience.storage_url, `ambience-${chapter.id}`)}
                        isAmbience
                    />
                </div>
            </div>
        </motion.div>
    )
}

function AudioButton({ label, subLabel, asset, isGenerating, onGenerate, isPlaying, onPlay, isAmbience }: any) {
    return (
        <div className="relative group/btn h-24 bg-black/20 hover:bg-black/40 border border-white/5 rounded-2xl flex flex-col items-center justify-center transition-all overflow-hidden">
            {!asset ? (
                <button
                    onClick={onGenerate}
                    disabled={isGenerating}
                    className="w-full h-full flex flex-col items-center justify-center gap-1 group-hover/btn:scale-105 transition-transform"
                >
                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin text-purple-500" /> : <Sparkles className="w-5 h-5 text-purple-400 opacity-60 group-hover/btn:opacity-100" />}
                    <span className="text-[10px] font-bold text-gray-500 uppercase">{label}</span>
                </button>
            ) : (
                <>
                    <button
                        onClick={onPlay}
                        className="relative z-10 flex flex-col items-center justify-center gap-1"
                    >
                        {isPlaying ? <Pause className="w-6 h-6 text-pink-400" /> : <Play className="w-6 h-6 text-purple-400 fill-purple-400" />}
                        <span className="text-[10px] font-bold text-gray-300 uppercase">{label}</span>
                    </button>
                    {/* Background Visualizer Animation when playing */}
                    {isPlaying && (
                        <div className="absolute inset-0 flex items-end gap-1 px-4 opacity-20 pointer-events-none">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <motion.div
                                    key={i}
                                    animate={{ height: ['20%', '80%', '20%'] }}
                                    transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                                    className="flex-1 bg-purple-500 rounded-t"
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Corner Indicators */}
            <div className="absolute top-2 right-2 flex items-center gap-1">
                {asset && <CheckCircle className="w-3 h-3 text-green-500/60" />}
                {isAmbience ? <Wind className="w-3 h-3 text-blue-500/40" /> : <Music className="w-3 h-3 text-purple-500/40" />}
            </div>
        </div>
    )
}

export default function BGMBoard() {
    return (
        <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-[#0a0a0c]"><Loader2 className="animate-spin text-purple-500" /></div>}>
            <BGMBoardContent />
        </Suspense>
    );
}
