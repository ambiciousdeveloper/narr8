'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Layers, CheckCircle2, Loader2, Sparkles, Film, ChevronRight, Wand2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import Image from 'next/image';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AutoProducer() {
    const [isProducing, setIsProducing] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);
    const [episodes, setEpisodes] = useState<any[]>([]);
    const [selectedEpisode, setSelectedEpisode] = useState<string | null>(null);
    const [storyboard, setStoryboard] = useState<any>(null);
    const { t } = useLanguage();
    const { projectId } = useProject();

    useEffect(() => {
        if (projectId) {
            fetchEpisodes();
        }
    }, [projectId]);

    async function fetchEpisodes() {
        if (!projectId) return;

        // Try fetching L3 (Episodes) first
        let { data, error } = await supabase
            .from('story_summary')
            .select('id, order_index, unit_title_kr, unit_title_en, synthesized_title_kr, synthesized_title_en, hierarchy_group')
            .eq('project_id', projectId)
            .eq('hierarchy_group', 'L3')
            .order('order_index', { ascending: true });

        // If no L3 found, try L2 (Arcs/Chapters)
        if (!data || data.length === 0) {
            const { data: fallbackData } = await supabase
                .from('story_summary')
                .select('id, order_index, unit_title_kr, unit_title_en, synthesized_title_kr, synthesized_title_en, hierarchy_group')
                .eq('project_id', projectId)
                .eq('hierarchy_group', 'L2')
                .order('order_index', { ascending: true });

            if (fallbackData) data = fallbackData;
        }

        if (data) setEpisodes(data);
    }

    async function startProduction() {
        if (!selectedEpisode) return;

        setIsProducing(true);
        setLogs([`>>> Initializing Level 5 Production for Episode ${selectedEpisode}...`]);
        setProgress(0);
        setStoryboard(null);

        try {
            // 1. Script Breakdown & Entity Linking
            setLogs(prev => [...prev, "Analyzing Screenplay & Breakdown..."]);
            setProgress(10);
            const res = await fetch('/api/produce/breakdown', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, episodeId: selectedEpisode })
            });

            if (!res.ok) throw new Error('Breakdown failed');
            const data = await res.json();
            const clips = data.tracks[0]?.clips || [];

            setProgress(20);
            setLogs(prev => [...prev, `✅ Breakdown Complete. Found ${clips.length} production shots.`]);

            // 2. Multi-Modal Synthesis (Parallelized where sensible)
            const uniqueChars = clips.filter((c: any) => c.character_id).reduce((acc: any[], curr: any) => {
                if (!acc.find(x => x.id === curr.character_id)) acc.push({ id: curr.character_id, name: curr.character });
                return acc;
            }, []);

            const uniqueLocs = clips.filter((c: any) => c.location_id).reduce((acc: any[], curr: any) => {
                if (!acc.find(x => x.id === curr.location_id)) acc.push({ id: curr.location_id, name: curr.location });
                return acc;
            }, []);

            // 2a. Voice Synthesis
            setLogs(prev => [...prev, `🎙️ Synthesizing ${uniqueChars.length} character voices...`]);
            for (const char of uniqueChars) {
                const firstDialogue = clips.find((c: any) => c.character_id === char.id && c.dialogue)?.dialogue;
                if (firstDialogue) {
                    setLogs(prev => [...prev, `   - Generating voice for "${char.name}"...`]);
                    await fetch('/api/generate-voice', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            characterId: char.id,
                            projectId,
                            customText: firstDialogue
                        })
                    });
                }
            }
            setProgress(40);

            // 2b. Visual Synthesis (Characters)
            setLogs(prev => [...prev, `🎨 Rendering ${uniqueChars.length} character visuals...`]);
            for (const char of uniqueChars) {
                setLogs(prev => [...prev, `   - Rendering visual for "${char.name}"...`]);
                await fetch('/api/generate-visual', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        characterId: char.id,
                        episodeId: selectedEpisode
                    })
                });
            }
            setProgress(60);

            // 2c. Visual Synthesis (Locations)
            setLogs(prev => [...prev, `🖼️ Rendering ${uniqueLocs.length} location backgrounds...`]);
            for (const loc of uniqueLocs) {
                setLogs(prev => [...prev, `   - Rendering background for "${loc.name}"...`]);
                await fetch('/api/generate-location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        locationId: loc.id,
                        episodeId: selectedEpisode
                    })
                });
            }
            setProgress(80);

            // 2d. BGM Generation
            setLogs(prev => [...prev, "🎵 Generating Original Score & Ambience..."]);
            await fetch('/api/generate-bgm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    storyId: selectedEpisode,
                    assetType: 'BGM_MAIN',
                    prompt: 'Cinematic orchestral background score'
                })
            });
            setProgress(85);

            // 3. Dynamic Shot Synthesis (Phase 3: High-Fidelity Rendering)
            setLogs(prev => [...prev, `🎬 Phase 3: Rendering ${clips.length} unique cinematic shots...`]);

            // Re-fetch to get IDs mapped correctly before shot synthesis
            const midRes = await fetch('/api/produce/breakdown', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, episodeId: selectedEpisode })
            });
            const midData = await midRes.json();
            const trackedClips = midData.tracks[0]?.clips || [];

            for (let i = 0; i < trackedClips.length; i++) {
                const clip = trackedClips[i];
                setLogs(prev => [...prev, `   - [Shot ${i + 1}/${trackedClips.length}] Rendering: ${clip.character || 'Scene'} at ${clip.location || 'Location'}...`]);

                await fetch('/api/produce/synthesize-shot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        projectId,
                        episodeId: selectedEpisode,
                        shotId: clip.id,
                        characterId: clip.character_id,
                        locationId: clip.location_id,
                        dialogue: clip.dialogue,
                        action: clip.name
                    })
                });

                // Fine-grained progress for shot rendering
                setProgress(85 + Math.round(((i + 1) / trackedClips.length) * 10));
            }

            // 4. Final Compilation & Persistence
            setLogs(prev => [...prev, "✨ Master Compilation & Timeline Sync..."]);
            // Re-fetch breakdown as generation APIs update the visual/audio URLs in DB
            const finalRes = await fetch('/api/produce/breakdown', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, episodeId: selectedEpisode })
            });
            const finalData = await finalRes.json();

            setStoryboard(finalData);
            setLogs(prev => [...prev, `✨ ${t.producer.ready}`]);
            setProgress(100);

        } catch (error: any) {
            setLogs(prev => [...prev, `❌ Error: ${error.message}`]);
            console.error(error);
        } finally {
            setIsProducing(false);
        }
    }

    return (
        <div className="p-8 lg:p-12 min-h-screen flex flex-col items-center relative overflow-hidden bg-[#0a0a0c]">
            {/* Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[700px] bg-purple-600/10 blur-[150px] rounded-full -z-10" />

            {/* Header Section */}
            <div className="max-w-4xl w-full text-center mb-16 relative z-10 flex flex-col items-center">
                <div className="flex justify-center gap-4 mb-10">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 text-xs font-bold uppercase tracking-widest backdrop-blur-2xl"
                    >
                        <Sparkles className="w-3.5 h-3.5" /> {t.producer.level_5}
                    </motion.div>
                    {projectId && (
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.1 }}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-xs font-bold uppercase tracking-widest backdrop-blur-2xl"
                        >
                            <Layers className="w-3.5 h-3.5" /> {projectId}
                        </motion.div>
                    )}
                </div>
                <h1 className="text-7xl font-black mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-500 tracking-tighter leading-tight">
                    {t.producer.title}
                </h1>
                <p className="text-gray-400 text-xl max-w-2xl mx-auto leading-relaxed font-semibold opacity-80">
                    {t.producer.subtitle}
                </p>
            </div>

            {/* Main Action Stack (Perfectly Centered) */}
            <div className="w-full max-w-4xl flex flex-col items-center gap-16 relative z-10">

                {/* Episode Selector (Centered Pills) */}
                <div className="w-full">
                    <div className="flex flex-wrap justify-center gap-4">
                        {episodes.map(ep => (
                            <button
                                key={ep.id}
                                onClick={() => setSelectedEpisode(ep.id)}
                                className={`px-8 py-4 rounded-3xl transition-all duration-500 border-2 font-black text-sm tracking-tight ${selectedEpisode === ep.id
                                    ? 'bg-purple-600/20 border-purple-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.3)] scale-[1.08]'
                                    : 'bg-white/5 border-transparent text-gray-600 hover:bg-white/10 hover:border-white/20'
                                    }`}
                            >
                                <span className="mr-3 opacity-20 text-[10px] tracking-widest">
                                    {ep.hierarchy_group === 'L2' ? 'ARC' : 'EP'}{String(ep.order_index).padStart(2, '0')}
                                </span>
                                {ep.synthesized_title_kr || ep.unit_title_kr}
                            </button>
                        ))}
                    </div>
                    {episodes.length === 0 && (
                        <div className="flex justify-center">
                            <div className="inline-flex items-center gap-3 px-8 py-4 rounded-3xl bg-white/5 border border-white/10 text-gray-700 text-xs font-black tracking-[0.2em] uppercase animate-pulse">
                                <div className="w-2 h-2 rounded-full bg-purple-500/40" />
                                Awaiting Production Blueprints
                            </div>
                        </div>
                    )}
                </div>

                {/* HUGE Action Button (The Star of the Show) */}
                <div className="relative group">
                    <div className="absolute inset-[-40px] bg-gradient-to-br from-[#A855F7] via-[#6366F1] to-[#3B82F6] blur-[100px] rounded-full opacity-20 group-hover:opacity-40 transition-opacity duration-1000 animate-pulse" />

                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="relative z-10"
                    >
                        <button
                            onClick={startProduction}
                            disabled={isProducing || !selectedEpisode}
                            className={`w-80 h-80 rounded-full flex flex-col items-center justify-center gap-6 transition-all duration-700 bg-gradient-to-br from-purple-500 to-blue-600 text-white shadow-[0_0_80px_rgba(168,85,247,0.4)] group-hover:shadow-[0_0_150px_rgba(168,85,247,0.6)] ${isProducing || !selectedEpisode
                                ? 'opacity-90 cursor-not-allowed'
                                : 'opacity-100 cursor-pointer shadow-[0_0_80px_rgba(168,85,247,0.5)]'
                                }`}
                        >
                            <div className="transition-all duration-700">
                                {isProducing ? (
                                    <div className="relative">
                                        <Loader2 className="w-24 h-24 animate-spin stroke-[3]" />
                                        <div className="absolute inset-0 flex items-center justify-center text-lg font-black tracking-tighter">
                                            {Math.round(progress)}%
                                        </div>
                                    </div>
                                ) : (
                                    <Play className="w-24 h-24 fill-current transition-transform duration-700 group-hover:scale-110 drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]" />
                                )}
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <span className="text-4xl font-black tracking-tighter uppercase leading-none">
                                    {isProducing ? t.producer.producing : t.producer.generate_action}
                                </span>
                                {!isProducing && (
                                    <span className="text-[12px] font-black opacity-50 tracking-[0.5em] uppercase mt-1 text-purple-200">
                                        CORE READY
                                    </span>
                                )}
                            </div>
                        </button>
                    </motion.div>
                </div>


                {/* Preview Monitor & Terminal Area */}
                <div className="w-full flex flex-col gap-12 mt-4">
                    {/* Visual Preview Monitor */}
                    <div className="aspect-video bg-[#050507] rounded-[60px] border-2 border-white/5 overflow-hidden relative shadow-[0_0_100px_rgba(0,0,0,0.8)]">
                        <AnimatePresence mode="wait">
                            {storyboard ? (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="absolute inset-0"
                                >
                                    {storyboard.tracks[0]?.clips[0]?.visual_url ? (
                                        <div className="relative w-full h-full">
                                            <Image
                                                src={storyboard.tracks[0].clips[0].visual_url}
                                                alt="Storyboard Preview"
                                                fill
                                                className="object-cover"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                                            <div className="absolute inset-x-0 bottom-0 p-12 flex items-end justify-between">
                                                <div>
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse shadow-[0_0_10px_rgba(168,85,247,1)]" />
                                                        <p className="text-white font-black text-2xl uppercase tracking-tighter italic">MASTER COMPILED</p>
                                                    </div>
                                                    <p className="text-gray-400 text-xs font-mono tracking-widest uppercase">{storyboard.tracks[0].clips.length} PRODUCTION LAYERS ACTIVE</p>
                                                </div>
                                                <Link href={`/cutting-room?episode_id=${selectedEpisode}`}>
                                                    <motion.button
                                                        whileHover={{ scale: 1.05, x: 5 }}
                                                        className="px-10 py-5 rounded-3xl bg-white text-black font-black flex items-center gap-3 text-base shadow-2xl hover:bg-purple-50 transition-colors"
                                                    >
                                                        {t.producer.goto_cutting_room} <ChevronRight className="w-5 h-5" />
                                                    </motion.button>
                                                </Link>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900/20 italic text-gray-700">
                                            <Film className="w-20 h-20 mb-6 opacity-10" />
                                            <span className="font-mono text-sm tracking-widest uppercase opacity-30">No Visual Buffer for Chunk 01</span>
                                        </div>
                                    )}
                                </motion.div>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="text-center opacity-10 group-hover:opacity-20 transition-opacity duration-1000">
                                        <div className="w-32 h-32 rounded-full border-2 border-white/5 flex items-center justify-center mb-8 mx-auto">
                                            <Play className="w-12 h-12 text-white" />
                                        </div>
                                        <p className="font-mono text-xs uppercase tracking-[0.8em] text-white underline underline-offset-8 decoration-white/20">{t.producer.waiting}</p>
                                    </div>
                                </div>
                            )}
                        </AnimatePresence>

                        {isProducing && (
                            <div className="absolute inset-x-0 bottom-0 h-2 bg-white/5 overflow-hidden">
                                <motion.div
                                    className="h-full bg-gradient-to-r from-purple-600 via-blue-500 to-purple-600 bg-[length:200%_100%]"
                                    animate={{ backgroundPosition: ["0% 0%", "200% 0%"] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                    initial={{ width: 0 }}
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Console Logs Terminal (Centered below monitor) */}
                    <div className="bg-[#050507]/80 border border-white/10 rounded-[40px] p-10 font-mono text-sm backdrop-blur-3xl shadow-2xl relative overflow-hidden h-64 flex flex-col">
                        <div className="flex items-center gap-3 mb-8 border-b border-white/5 pb-6">
                            <div className="flex gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500/30" />
                                <div className="w-3 h-3 rounded-full bg-amber-500/30" />
                                <div className="w-3 h-3 rounded-full bg-green-500/30" />
                            </div>
                            <span className="ml-4 text-[10px] text-gray-600 font-black uppercase tracking-[0.4em]">Integrated System Telemetry</span>
                        </div>
                        <div className="space-y-4 overflow-y-auto custom-scrollbar flex-1">
                            {logs.length === 0 ? (
                                <div className="text-gray-800 italic animate-pulse tracking-widest uppercase text-xs">Awaiting Command Input...</div>
                            ) : (
                                logs.map((log, i) => (
                                    <motion.div
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        key={i}
                                        className={`flex gap-6 ${log.includes('✅') || log.includes('✨') ? 'text-purple-400/80' : log.includes('❌') ? 'text-red-400' : 'text-gray-600'}`}
                                    >
                                        <span className="opacity-10 shrink-0 font-black">LOG_{String(i + 1).padStart(2, '0')}</span>
                                        <span className={log.includes('✅') || log.includes('✨') ? 'font-bold' : ''}>{log}</span>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>

    );
}
