'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, Twitter, Instagram, Send, Sparkles, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

export default function PRCenter() {
    const [activeTab, setActiveTab] = useState<'create' | 'schedule'>('create');
    const [platform, setPlatform] = useState('twitter');
    const [tone, setTone] = useState('hype');
    const { t } = useLanguage();
    const { projectId } = useProject();

    // Generated Content Mock
    const generatedCopy = {
        hype: "🚀 Protocol initialized. The System is watching. Episode 4 drops tonight. Are you ready for the truth? #Cyberpunk #AI #Premiere",
        mysterious: "Something is waking up in the deep code...  22:00 KST. Do not miss the signal. 👁️ #TheAwakening",
        professional: "We are proud to present the latest installment of our AI-driven narrative series. Tune in for enhanced visual fidelity. #AIProduction #Storytelling"
    };

    return (
        <div className="p-8 lg:p-12 min-h-screen">
            <header className="mb-10">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                    <Megaphone className="w-8 h-8 text-pink-500" />
                    {t.pr.title}
                    {projectId && <span className="text-sm font-mono text-gray-600 ml-4 bg-white/5 px-2 py-1 rounded">[{projectId}]</span>}
                </h1>
                <p className="text-gray-400">{t.pr.subtitle}</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Generator */}
                <div className="glass-panel p-8 rounded-2xl">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-pink-400" /> {t.pr.copy_gen}
                    </h2>

                    <div className="space-y-6">
                        <div>
                            <label className="text-sm font-bold text-gray-500 mb-2 block">{t.pr.platform}</label>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setPlatform('twitter')}
                                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${platform === 'twitter' ? 'bg-sky-500/20 border-sky-500 text-sky-400' : 'bg-black/20 border-white/5'}`}
                                >
                                    <Twitter className="w-4 h-4" /> Twitter / X
                                </button>
                                <button
                                    onClick={() => setPlatform('instagram')}
                                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${platform === 'instagram' ? 'bg-pink-500/20 border-pink-500 text-pink-400' : 'bg-black/20 border-white/5'}`}
                                >
                                    <Instagram className="w-4 h-4" /> Instagram
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-bold text-gray-500 mb-2 block">{t.pr.tone}</label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['hype', 'mysterious', 'professional'] as const).map(tonename => (
                                    <button
                                        key={tonename}
                                        onClick={() => setTone(tonename)}
                                        className={`py-2 rounded-lg text-sm font-bold border transition-all ${tone === tonename ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-400 border-transparent hover:bg-white/10'}`}
                                    >
                                        {t.pr[tonename]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl font-bold text-white shadow-lg shadow-pink-900/40 hover:scale-[1.02] transition-transform">
                            {t.pr.gen_magic}
                        </button>
                    </div>
                </div>

                {/* Preview & Schedule */}
                <div className="glass-panel p-8 rounded-2xl border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Megaphone className="w-64 h-64" />
                    </div>

                    <h2 className="text-xl font-bold mb-6">{t.pr.preview}</h2>

                    <div className="bg-black/40 border border-white/10 p-6 rounded-xl mb-6 relative">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-gray-700" />
                            <div>
                                <p className="font-bold text-sm">PRism Studios Official</p>
                                <p className="text-xs text-gray-500">@prism_studios</p>
                            </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed mb-4">
                            {generatedCopy[tone as keyof typeof generatedCopy]}
                        </p>
                        {platform === 'instagram' && (
                            <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center text-gray-600 text-xs">
                                [Current Episode Thumbnail]
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-4">
                        <button className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 font-bold text-sm border border-white/5">
                            {t.pr.save_draft}
                        </button>
                        <button className="px-6 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm border border-green-500 shadow-lg shadow-green-900/20 flex items-center gap-2">
                            <Send className="w-4 h-4" /> {t.pr.schedule_post}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
