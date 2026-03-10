'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Coins, TrendingUp, Cpu, Activity, BarChart3, AlertCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

export default function LedgerPage() {
    const [activeModel, setActiveModel] = useState<'flux' | 'sdxl'>('flux');
    const { t } = useLanguage();
    const { projectId } = useProject();

    // Mock Data
    const stats = [
        { label: t.ledger.total_cost, value: '$12.45', change: '+2.4%', icon: Coins, color: 'text-yellow-400' },
        { label: t.ledger.api_calls, value: '1,240', change: '+12%', icon: Activity, color: 'text-blue-400' },
        { label: t.ledger.avg_latency, value: '1.2s', change: '-5%', icon: TrendingUp, color: 'text-green-400' },
    ];

    const recentTx = [
        { id: 1, service: 'ElevenLabs', desc: 'Voice Gen: Alice (30s)', cost: 0.15, time: '10 mins ago' },
        { id: 2, service: 'Replicate', desc: 'Image: Forest Scene (Flux.1)', cost: 0.04, time: '12 mins ago' },
        { id: 3, service: 'Gemini Pro', desc: 'Script Generation', cost: 0.01, time: '15 mins ago' },
        { id: 4, service: 'Replicate', desc: 'Image: Cyberpunk City', cost: 0.04, time: '20 mins ago' },
    ];

    return (
        <div className="p-8 lg:p-12 min-h-screen">
            <header className="mb-10">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                    <Coins className="w-8 h-8 text-yellow-500" />
                    {t.ledger.title}
                    {projectId && <span className="text-sm font-mono text-gray-600 ml-4 bg-white/5 px-2 py-1 rounded">[{projectId}]</span>}
                </h1>
                <p className="text-gray-400">{t.ledger.subtitle}</p>
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                {stats.map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="glass-panel p-6 rounded-2xl border border-white/5"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <div className={`p-3 rounded-xl bg-white/5 ${stat.color}`}>
                                <stat.icon className="w-6 h-6" />
                            </div>
                            <span className={`text-sm font-bold px-2 py-1 rounded bg-white/5 ${stat.change.startsWith('+') ? 'text-red-400' : 'text-green-400'}`}>
                                {stat.change}
                            </span>
                        </div>
                        <h3 className="text-3xl font-bold mb-1">{stat.value}</h3>
                        <p className="text-gray-400 text-sm">{stat.label}</p>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Model Switcher */}
                <div className="lg:col-span-2 glass-panel p-8 rounded-2xl">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-purple-400" /> {t.ledger.engine_config}
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div
                            onClick={() => setActiveModel('flux')}
                            className={`cursor-pointer p-6 rounded-xl border transition-all ${activeModel === 'flux' ? 'bg-purple-600/20 border-purple-500 shadow-lg shadow-purple-900/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <span className="font-bold text-lg">Flux.1 Pro</span>
                                {activeModel === 'flux' && <CheckCircle2 className="w-5 h-5 text-purple-400" />}
                            </div>
                            <p className="text-sm text-gray-400 mb-4">Cinema-grade visual quality. Best for final renders.</p>
                            <div className="flex justify-between items-center text-xs font-mono">
                                <span className="text-yellow-400">$$ High Cost</span>
                                <span className="text-gray-500">~4s / img</span>
                            </div>
                        </div>

                        <div
                            onClick={() => setActiveModel('sdxl')}
                            className={`cursor-pointer p-6 rounded-xl border transition-all ${activeModel === 'sdxl' ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-900/20' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <span className="font-bold text-lg">SDXL Lightning</span>
                                {activeModel === 'sdxl' && <CheckCircle2 className="w-5 h-5 text-blue-400" />}
                            </div>
                            <p className="text-sm text-gray-400 mb-4">Lightning fast generation. Best for storyboards & drafting.</p>
                            <div className="flex justify-between items-center text-xs font-mono">
                                <span className="text-green-400">$ Low Cost</span>
                                <span className="text-gray-500">~0.8s / img</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex gap-3 text-yellow-200 text-sm">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p>Warning: Autoscaling is enabled. System may switch to SDXL during high-traffic periods automatically.</p>
                    </div>
                </div>

                {/* Recent Transactions */}
                <div className="glass-panel p-8 rounded-2xl">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-gray-400" /> {t.ledger.history}
                    </h2>
                    <div className="space-y-4">
                        {recentTx.map(tx => (
                            <div key={tx.id} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                                <div>
                                    <p className="font-medium text-sm">{tx.service}</p>
                                    <p className="text-xs text-gray-500">{tx.desc}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-mono text-sm">-${tx.cost.toFixed(2)}</p>
                                    <p className="text-xs text-gray-600">{tx.time}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="w-full mt-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-bold transition-colors">
                        {t.ledger.full_report}
                    </button>
                </div>
            </div>
        </div>
    );
}

function CheckCircle2({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="12" cy="12" r="10" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    )
}
