'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Fingerprint, Mic, User, Plus, Camera, RefreshCw, Wand2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function TalentAgency() {
    const [activeTab, setActiveTab] = useState<'roster' | 'create'>('roster');
    const [talents, setTalents] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { t } = useLanguage();
    const { projectId } = useProject();

    useEffect(() => {
        if (projectId) {
            fetchTalents();
        }
    }, [projectId]);

    async function handleGenerateVisual(charId: string) {
        setLoading(true);
        try {
            const res = await fetch('/api/generate-visual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId: charId })
            });
            const data = await res.json();
            if (data.success) {
                await fetchTalents();
            } else {
                alert('Image generation failed: ' + data.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    async function fetchTalents() {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('characters')
                .select('*, character_visuals!character_visuals_character_id_fkey(*)')
                .eq('project_id', projectId);

            let finalData = data;
            if (error) {
                console.warn('Relationship query failed, falling back to simple query:', error);
                const { data: simpleData } = await supabase
                    .from('characters')
                    .select('*')
                    .eq('project_id', projectId);
                finalData = simpleData;
            }

            if (finalData) {
                const mapped = finalData.map((c: any) => ({
                    id: c.id,
                    name: c.reinterpreted_name_kr || c.reinterpreted_name_en || c.original_name_kr || 'Unknown',
                    type: 'Virtual Human',
                    tags: [c.reinterpreted_tier_kr, c.reinterpreted_role_kr].filter(Boolean),
                    img: (c.character_visuals && c.character_visuals[0]?.image_url) || 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400',
                    hasVisual: !!(c.character_visuals && c.character_visuals[0]?.image_url)
                }));
                setTalents(mapped);
            }
        } catch (e) {
            console.error('Fetch error:', e);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="p-8 lg:p-12 min-h-screen">
            <header className="mb-10 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <Sparkles className="w-8 h-8 text-purple-400" />
                        {t.agency.title}
                        {projectId && <span className="text-sm font-mono text-gray-600 ml-4 bg-white/5 px-2 py-1 rounded">[{projectId}]</span>}
                    </h1>
                    <p className="text-gray-400">{t.agency.subtitle}</p>
                </div>
                <button
                    onClick={() => setActiveTab(activeTab === 'roster' ? 'create' : 'roster')}
                    className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-purple-900/40"
                >
                    <Plus className="w-5 h-5" /> {activeTab === 'roster' ? t.agency.create_actor : t.agency.roster}
                </button>
            </header>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-40">
                    <div className="relative w-20 h-20 mb-6">
                        <RefreshCw className="w-20 h-20 animate-spin text-purple-500" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Sparkles className="w-8 h-8 text-white animate-pulse" />
                        </div>
                    </div>
                    <p className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                        {talents.some(t => t.hasVisual === false) ? "AI 시각화 작업 중..." : "Fetching Talents..."}
                    </p>
                    <p className="text-sm text-gray-500 mt-2">잠시만 기다려 주세요.</p>
                </div>
            ) : activeTab === 'roster' ? (
                talents.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {talents.map((tal, i) => (
                            <motion.div
                                key={tal.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                onClick={() => !tal.hasVisual && handleGenerateVisual(tal.id)}
                                className={`glass-panel p-4 rounded-2xl group cursor-pointer relative overflow-hidden transition-all ${!tal.hasVisual ? 'hover:border-purple-500/50' : ''}`}
                            >
                                {tal.hasVisual ? (
                                    <div className="aspect-[3/4] rounded-xl bg-gray-800 mb-4 overflow-hidden relative">
                                        <img src={tal.img} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={tal.name} />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-4">
                                            <h3 className="font-bold text-lg text-white">{tal.name}</h3>
                                            <p className="text-xs text-purple-300">{tal.type}</p>
                                        </div>
                                        {/* V7.4 Regenerate Overlay */}
                                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all transform translate-y-[-10px] group-hover:translate-y-0 duration-300">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleGenerateVisual(tal.id);
                                                }}
                                                className="p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white shadow-lg shadow-purple-900/40 flex items-center gap-2 text-xs font-bold whitespace-nowrap"
                                                title="다시 생성하기"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                                <span>다시 생성</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="aspect-[3/4] rounded-xl bg-gradient-to-br from-purple-900/40 to-black mb-4 flex flex-col items-center justify-center border border-white/5 group-hover:bg-purple-900/60 transition-all">
                                        <div className="bg-purple-600/20 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
                                            <Wand2 className="w-10 h-10 text-purple-400" />
                                        </div>
                                        <h3 className="font-bold text-lg">{tal.name}</h3>
                                        <p className="text-xs text-purple-300 mb-4">비주얼 생성 필요</p>
                                        <button className="text-[10px] px-3 py-1 bg-purple-600 rounded-full font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                            AI 생성하기
                                        </button>
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                    {tal.tags.map((tag: any) => (
                                        <span key={tag} className="text-[10px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-[40px] opacity-20">
                        <User className="w-16 h-16 mx-auto mb-4" />
                        <p className="text-xl font-bold">No Talents Found</p>
                        <p className="text-sm">Please analyze characters in Story Bible first.</p>
                    </div>
                )
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    {/* Persona Generator */}
                    <div className="glass-panel p-8 rounded-3xl border border-purple-500/30 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-20"><User className="w-48 h-48" /></div>
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                            <Camera className="w-6 h-6 text-purple-400" /> {t.agency.create_actor}
                        </h2>

                        <div className="space-y-6 relative z-10">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-400">Description Prompt</label>
                                <textarea className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 resize-none focus:border-purple-500 outline-none" placeholder="e.g. A cyberpunk hacker in her 20s, neon hair, confident smirk..." />
                            </div>
                            <button className="w-full py-4 bg-white text-black font-bold rounded-xl hover:scale-[1.02] transition-transform flex items-center justify-center gap-2">
                                <Sparkles className="w-5 h-5 text-purple-600" /> {t.common.generate}
                            </button>
                        </div>
                    </div>

                    {/* Voice Cloner */}
                    <div className="glass-panel p-8 rounded-3xl border border-blue-500/30 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-20"><Mic className="w-48 h-48" /></div>
                        <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                            <Fingerprint className="w-6 h-6 text-blue-400" /> {t.agency.clone_voice}
                        </h2>

                        <div className="space-y-6 relative z-10">
                            <div className="p-8 border-2 border-dashed border-white/20 rounded-2xl flex flex-col items-center justify-center gap-4 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer">
                                <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center">
                                    <Mic className="w-8 h-8 text-blue-400" />
                                </div>
                                <div className="text-center">
                                    <p className="font-bold">Record Sample (30s)</p>
                                    <p className="text-xs text-gray-500">Read the script shown below</p>
                                </div>
                            </div>
                            <div className="bg-black/40 p-4 rounded-xl text-sm text-gray-400 italic font-mono">
                                "The quick brown fox jumps over the lazy dog. I am creating a digital voice twin to narrate my stories..."
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
