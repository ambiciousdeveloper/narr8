'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, ThumbsUp, TrendingUp, Lightbulb, ArrowUpRight, Youtube, Share2, MessageSquare } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

export default function AudienceFeedbackLoop() {
    const [activeTab, setActiveTab] = useState<'insights' | 'comments'>('insights');
    const { t } = useLanguage();
    const { projectId } = useProject();

    // Mock Feedback Data
    const comments = [
        { id: 1, user: 'SciFi_Fan_99', text: 'The plot twist in Ep 3 was insane! But I feel like the pacing in the middle was a bit slow.', sentiment: 'mixed', platform: 'youtube' },
        { id: 2, user: 'NeonRunner', text: 'We need more backstory on the villain. Why is he so obsessed with the chip?', sentiment: 'constructive', platform: 'youtube' },
        { id: 3, user: 'CyberAlice', text: 'Visually stunning as always. The new art style is perfect.', sentiment: 'positive', platform: 'instagram' },
        { id: 4, user: 'Critic_Bot', text: 'Dialogue felt a bit robotic in the cafe scene.', sentiment: 'negative', platform: 'tiktok' },
    ];

    // AI Insights
    const insights = [
        { title: 'Pacing Issue Detected', desc: '35% of comments mention "slow middle".', suggestion: 'Reduce dialogue in Scene 4-6 by 20% and add an action beat.', impact: 'High' },
        { title: 'Character Demand', desc: 'High interest in "Villian Backstory".', suggestion: 'Create a 3-min spin-off episode focusing on the Villian\'s origin.', impact: 'Medium' },
        { title: 'Visual Praise', desc: 'Neon Noir style is retaining viewers.', suggestion: 'Double down on high-contrast night scenes for the next thumbnail.', impact: 'Low' },
    ];

    return (
        <div className="p-8 lg:p-12 min-h-screen">
            <header className="mb-10">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                    <MessageCircle className="w-8 h-8 text-indigo-500" />
                    {t.audience.title}
                    {projectId && <span className="text-sm font-mono text-gray-600 ml-4 bg-white/5 px-2 py-1 rounded">[{projectId}]</span>}
                </h1>
                <p className="text-gray-400">{t.audience.subtitle}</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: AI Strategy */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Strategic Suggestions */}
                    <div className="glass-panel p-8 rounded-2xl border border-indigo-500/30 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10"><Lightbulb className="w-32 h-32" /></div>
                        <h2 className="text-xl font-bold mb-6 flex items-center gap-2 relative z-10">
                            <Lightbulb className="w-6 h-6 text-yellow-400" /> {t.audience.strategy}
                        </h2>

                        <div className="space-y-4 relative z-10">
                            {insights.map((insight, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ x: -20, opacity: 0 }}
                                    animate={{ x: 0, opacity: 1 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="bg-white/5 border border-white/10 p-4 rounded-xl hover:bg-white/10 transition-colors"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-bold text-lg text-indigo-300">{insight.title}</h3>
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${insight.impact === 'High' ? 'bg-red-500/20 text-red-400' :
                                            insight.impact === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                                'bg-blue-500/20 text-blue-400'
                                            }`}>
                                            {(t.audience as any)[insight.impact.toLowerCase()]} {t.audience.impact}
                                        </span>
                                    </div>
                                    <p className="text-gray-400 text-sm mb-3">"{insight.desc}"</p>
                                    <div className="flex items-start gap-2 bg-indigo-900/20 p-3 rounded-lg">
                                        <ArrowUpRight className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-1" />
                                        <p className="text-sm text-indigo-200"><span className="font-bold">{t.audience.strategy_label}:</span> {insight.suggestion}</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        <button className="mt-6 w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-900/40">
                            {t.audience.apply_strategy || 'Apply Top Strategies to Next Script'}
                        </button>
                    </div>
                </div>

                {/* Right Column: Feed */}
                <div className="glass-panel p-6 rounded-2xl h-[calc(100vh-200px)] flex flex-col">
                    <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-gray-400" /> {t.audience.feedback}
                    </h2>

                    <div className="flex gap-2 mb-4">
                        <button className="flex-1 py-2 rounded-lg bg-white/10 text-sm font-bold text-white">{t.common.all}</button>
                        <button className="flex-1 py-2 rounded-lg bg-black/20 text-sm font-bold text-gray-500 hover:text-white transition-colors">{t.audience.positive}</button>
                        <button className="flex-1 py-2 rounded-lg bg-black/20 text-sm font-bold text-gray-500 hover:text-white transition-colors">{t.audience.negative}</button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                        {comments.map((comment, i) => (
                            <div key={i} className="p-4 bg-black/40 rounded-xl border border-white/5">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        {comment.platform === 'youtube' && <Youtube className="w-3 h-3 text-red-500" />}
                                        {comment.platform === 'instagram' && <div className="w-3 h-3 rounded bg-pink-500" />}
                                        <span className="font-bold text-xs text-gray-300">{comment.user}</span>
                                    </div>
                                    <span className={`text-[10px] uppercase font-bold ${comment.sentiment === 'positive' ? 'text-green-400' :
                                        comment.sentiment === 'negative' ? 'text-red-400' : 'text-yellow-400'
                                        }`}>
                                        {(t.audience as any)[comment.sentiment] || comment.sentiment}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-400 leading-relaxed">"{comment.text}"</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
