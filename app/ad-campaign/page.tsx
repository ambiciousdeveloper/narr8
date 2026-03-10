'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Target, TrendingUp, DollarSign, PieChart, BarChart } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

export default function AdCampaign() {
    const [budget, setBudget] = useState(50);
    const { t } = useLanguage();
    const { projectId } = useProject();

    return (
        <div className="p-8 lg:p-12 min-h-screen">
            <header className="mb-10">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                    <Target className="w-8 h-8 text-green-500" />
                    {t.ads.title}
                    {projectId && <span className="text-sm font-mono text-gray-600 ml-4 bg-white/5 px-2 py-1 rounded">[{projectId}]</span>}
                </h1>
                <p className="text-gray-400">{t.ads.subtitle}</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Campaign Setup */}
                <div className="lg:col-span-1 glass-panel p-6 rounded-2xl">
                    <h2 className="text-lg font-bold mb-6">{t.ads.quick_launch}</h2>

                    <div className="space-y-6">
                        <div>
                            <label className="text-sm font-bold text-gray-500 mb-2 block">{t.ads.objective}</label>
                            <select className="w-full bg-black/20 border border-white/10 rounded-xl p-3 outline-none focus:border-green-500 transition-colors">
                                <option>Max Views (YouTube)</option>
                                <option>App Installs</option>
                                <option>Website Traffic</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-sm font-bold text-gray-500 mb-2 block">{t.ads.budget} ($)</label>
                            <div className="flex items-center gap-4">
                                <input
                                    type="range" min="10" max="500" step="10"
                                    value={budget}
                                    onChange={(e) => setBudget(Number(e.target.value))}
                                    className="flex-1 accent-green-500"
                                />
                                <span className="font-bold text-green-400 w-16 text-right">${budget}</span>
                            </div>
                        </div>

                        <div className="p-4 bg-green-900/10 border border-green-500/20 rounded-xl">
                            <p className="text-xs text-green-300 font-bold mb-1">{t.ads.reach}</p>
                            <p className="text-2xl font-bold text-white">{(budget * 150).toLocaleString()} <span className="text-sm text-gray-400 font-normal">{t.ads.people_day}</span></p>
                        </div>

                        <button className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-white shadow-lg shadow-green-900/40">
                            {t.ads.launch}
                        </button>
                    </div>
                </div>

                {/* Live Performance */}
                <div className="lg:col-span-2 glass-panel p-6 rounded-2xl flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-gray-400" /> {t.ads.performance}
                        </h2>
                        <div className="flex gap-2">
                            <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded text-xs font-bold border border-green-500/30">{t.common.active}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                            <p className="text-xs text-gray-500 font-bold mb-1">CTR (Click-Through)</p>
                            <p className="text-2xl font-bold">4.2%</p>
                            <p className="text-[10px] text-green-400">+0.5% vs avg</p>
                        </div>
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                            <p className="text-xs text-gray-500 font-bold mb-1">CPC (Cost per Click)</p>
                            <p className="text-2xl font-bold">$0.32</p>
                            <p className="text-[10px] text-gray-400">Stable</p>
                        </div>
                        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                            <p className="text-xs text-gray-500 font-bold mb-1">Total Spend</p>
                            <p className="text-2xl font-bold text-yellow-400">$240.50</p>
                        </div>
                    </div>

                    {/* Chart Placeholder */}
                    <div className="flex-1 bg-black/40 rounded-xl border border-white/5 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-green-500/10 to-transparent" />
                        <BarChart className="w-16 h-16 text-gray-700" />
                        <p className="text-gray-600 mt-2 font-mono text-xs">Real-time Data Visualization Service</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
