'use client';

import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { Eye, TrendingUp, Flame, MousePointer2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

export default function AnalyticsCenter() {
    const { t } = useLanguage();
    const { projectId } = useProject();
    // Mock Data
    const retentionData = [
        { time: '0s', value: 100 }, { time: '10s', value: 95 }, { time: '20s', value: 88 },
        { time: '30s', value: 82 }, { time: '40s', value: 70 }, { time: '50s', value: 65 },
        { time: '60s', value: 50 },
    ];

    const trendRadarData = [
        { subject: 'Visual', A: 120, fullMark: 150 },
        { subject: 'Story', A: 98, fullMark: 150 },
        { subject: 'Pacing', A: 86, fullMark: 150 },
        { subject: 'Sound', A: 99, fullMark: 150 },
        { subject: 'Trend', A: 85, fullMark: 150 },
        { subject: 'Char', A: 65, fullMark: 150 },
    ];

    return (
        <div className="p-8 lg:p-12 min-h-screen">
            <header className="mb-10">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                    <TrendingUp className="w-8 h-8 text-green-500" />
                    {t.analytics.title}
                    {projectId && <span className="text-sm font-mono text-gray-600 ml-4 bg-white/5 px-2 py-1 rounded">[{projectId}]</span>}
                </h1>
                <p className="text-gray-400">{t.analytics.subtitle}</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Heatmap & Retention */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="glass-panel p-6 rounded-2xl">
                        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                            <Eye className="w-5 h-5 text-gray-400" /> {t.analytics.retention}
                        </h2>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={retentionData}>
                                    <defs>
                                        <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis dataKey="time" stroke="#666" />
                                    <YAxis stroke="#666" />
                                    <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }} />
                                    <Area type="monotone" dataKey="value" stroke="#10b981" fillOpacity={1} fill="url(#colorVal)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-xs text-center text-gray-500 mt-4">{t.analytics.drop_off}: <span className="text-red-400 font-bold">42s</span></p>
                    </div>

                    <div className="glass-panel p-6 rounded-2xl">
                        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                            <MousePointer2 className="w-5 h-5 text-gray-400" /> {t.analytics.heatmap}
                        </h2>
                        {/* Heatmap Mockup */}
                        <div className="relative aspect-video bg-gray-800 rounded-xl overflow-hidden group">
                            <img src="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800" className="w-full h-full object-cover opacity-50" />
                            <div className="absolute top-[30%] left-[40%] w-32 h-32 bg-red-500 rounded-full blur-[50px] mix-blend-screen opacity-70 animate-pulse" />
                            <div className="absolute top-[20%] right-[20%] w-20 h-20 bg-yellow-500 rounded-full blur-[40px] mix-blend-screen opacity-60" />

                            <div className="absolute bottom-4 left-4 bg-black/80 px-4 py-2 rounded-lg text-xs font-bold border border-white/10">
                                {t.analytics.focal_point}: Character's Eyes (92%)
                            </div>
                        </div>
                    </div>
                </div>

                {/* Trend Radar */}
                <div className="space-y-8">
                    <div className="glass-panel p-6 rounded-2xl h-[400px]">
                        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                            <Flame className="w-5 h-5 text-orange-500" /> {t.analytics.viral_potential}
                        </h2>
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={trendRadarData}>
                                <PolarGrid stroke="#333" />
                                <PolarAngleAxis dataKey="subject" stroke="#888" fontSize={12} />
                                <PolarRadiusAxis angle={30} domain={[0, 150]} stroke="#333" />
                                <Radar name="This Episode" dataKey="A" stroke="#f97316" fill="#f97316" fillOpacity={0.3} />
                                <Tooltip />
                            </RadarChart>
                        </ResponsiveContainer>
                        <div className="text-center mt-[-20px]">
                            <span className="text-4xl font-bold text-orange-400">8.5</span>
                            <span className="text-sm text-gray-500">/10</span>
                        </div>
                    </div>

                    <div className="glass-panel p-6 rounded-2xl">
                        <h2 className="font-bold text-lg mb-4">{t.analytics.top_keywords}</h2>
                        <div className="flex flex-wrap gap-2">
                            {['#Cyberpunk', '#Revenge', '#PlotTwist', '#AI', '#UnrealEngine'].map(tag => (
                                <span key={tag} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-gray-300">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
