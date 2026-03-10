'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Youtube, Instagram, Share2, UploadCloud, Monitor, Smartphone, LayoutGrid } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

export default function BroadcastPage() {
    const [platform, setPlatform] = useState<'youtube' | 'instagram' | 'tiktok'>('youtube');
    const [isPublishing, setIsPublishing] = useState(false);
    const { t } = useLanguage();
    const { projectId } = useProject();

    const startPublish = () => {
        setIsPublishing(true);
        setTimeout(() => setIsPublishing(false), 3000);
    };

    return (
        <div className="p-8 lg:p-12 min-h-screen">
            <header className="mb-10">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                    <Globe className="w-8 h-8 text-blue-500" />
                    {t.broadcast.title}
                    {projectId && <span className="text-sm font-mono text-gray-600 ml-4 bg-white/5 px-2 py-1 rounded">[{projectId}]</span>}
                </h1>
                <p className="text-gray-400">{t.broadcast.subtitle}</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Channel Selector */}
                <div className="lg:col-span-1 space-y-4">
                    <h2 className="text-lg font-bold text-gray-400 mb-4 uppercase tracking-wider">{t.broadcast.select_channel}</h2>

                    <div
                        onClick={() => setPlatform('youtube')}
                        className={`p-6 rounded-2xl border cursor-pointer transition-all flex items-center gap-4 ${platform === 'youtube' ? 'bg-red-600/20 border-red-500' : 'bg-black/40 border-white/10 hover:bg-white/5'}`}
                    >
                        <Youtube className={`w-8 h-8 ${platform === 'youtube' ? 'text-red-500' : 'text-gray-500'}`} />
                        <div>
                            <h3 className="font-bold">YouTube</h3>
                            <p className="text-xs text-gray-500">Long-form & Shorts (16:9 / 9:16)</p>
                        </div>
                    </div>

                    <div
                        onClick={() => setPlatform('instagram')}
                        className={`p-6 rounded-2xl border cursor-pointer transition-all flex items-center gap-4 ${platform === 'instagram' ? 'bg-pink-600/20 border-pink-500' : 'bg-black/40 border-white/10 hover:bg-white/5'}`}
                    >
                        <Instagram className={`w-8 h-8 ${platform === 'instagram' ? 'text-pink-500' : 'text-gray-500'}`} />
                        <div>
                            <h3 className="font-bold">Instagram</h3>
                            <p className="text-xs text-gray-500">Reels & Feed (9:16 / 1:1)</p>
                        </div>
                    </div>

                    <div
                        onClick={() => setPlatform('tiktok')}
                        className={`p-6 rounded-2xl border cursor-pointer transition-all flex items-center gap-4 ${platform === 'tiktok' ? 'bg-cyan-600/20 border-cyan-500' : 'bg-black/40 border-white/10 hover:bg-white/5'}`}
                    >
                        <Share2 className={`w-8 h-8 ${platform === 'tiktok' ? 'text-cyan-500' : 'text-gray-500'}`} />
                        <div>
                            <h3 className="font-bold">TikTok</h3>
                            <p className="text-xs text-gray-500">Viral Short-form (9:16)</p>
                        </div>
                    </div>
                </div>

                {/* Preview & Config */}
                <div className="lg:col-span-2 glass-panel p-8 rounded-2xl flex flex-col md:flex-row gap-8">
                    {/* Phone/Screen Simulator */}
                    <div className="w-full md:w-1/2 flex items-center justify-center bg-black/40 rounded-xl border border-white/5 p-8">
                        <div className={`transition-all duration-500 bg-gray-800 border-4 border-gray-700 overflow-hidden relative shadow-2xl ${platform === 'youtube' ? 'w-full aspect-video rounded-lg' : 'w-64 aspect-[9/16] rounded-[2rem]'
                            }`}>
                            {/* Simulated Content */}
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-900 to-black flex items-center justify-center">
                                <h3 className="text-center font-bold text-white/50 animate-pulse">
                                    PREVIEW<br />{platform.toUpperCase()}
                                </h3>
                            </div>
                            {/* Overlay UI Mockup */}
                            <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-2">
                                <div className="h-2 w-2/3 bg-white/20 rounded" />
                                <div className="h-2 w-1/3 bg-white/20 rounded" />
                            </div>
                        </div>
                    </div>

                    {/* Configuration */}
                    <div className="flex-1 flex flex-col justify-between">
                        <div className="space-y-6">
                            <div>
                                <label className="text-sm text-gray-500 font-bold mb-2 block">{t.broadcast.caption_gen}</label>
                                <textarea
                                    className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-300 resize-none focus:outline-none focus:border-blue-500"
                                    defaultValue="✨ New Episode Alert! Dive into the cyber-noir mystery of Sector 7. Can Alice find the truth before it finds her? #Cyberpunk #AIStories #SciFi"
                                />
                            </div>
                            <div>
                                <label className="text-sm text-gray-500 font-bold mb-2 block">{t.broadcast.privacy}</label>
                                <div className="flex gap-4">
                                    <button className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold">{t.broadcast.public}</button>
                                    <button className="px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm">{t.broadcast.unlisted}</button>
                                    <button className="px-4 py-2 rounded-lg bg-white/5 text-gray-400 hover:text-white text-sm">{t.broadcast.private}</button>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={startPublish}
                            disabled={isPublishing}
                            className="mt-8 w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-lg flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-blue-900/40 transition-all disabled:opacity-50"
                        >
                            {isPublishing ? (
                                <>
                                    <UploadCloud className="w-5 h-5 animate-bounce" /> {t.broadcast.uploading}
                                </>
                            ) : (
                                <>
                                    <Globe className="w-5 h-5" /> {t.broadcast.publish_to} {platform}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
