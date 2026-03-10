'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Users, MessagesSquare, GitBranch, PenTool, Sparkles, UserPlus } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

export default function CollaborativeWriter() {
    const [activeCursor, setActiveCursor] = useState({ x: 0, y: 0 });
    const [script, setScript] = useState('EXT. DARK FOREST - NIGHT\n\nThe wind howls through the ancient trees.\n\nALICE (v.o)\nI shouldn\'t be here...');
    const [collaborators, setCollaborators] = useState([
        { id: 1, name: 'Director (You)', color: 'bg-blue-500' },
        { id: 2, name: 'AI Thriller Bot', color: 'bg-red-500', isAi: true },
        { id: 3, name: 'Assistant Writer', color: 'bg-green-500' }
    ]);
    const { t } = useLanguage();
    const { projectId } = useProject();

    // Mock "Real-time" typing simulation
    const handleType = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setScript(e.target.value);
        // Simulate cursor movement for demo
        setActiveCursor({ x: Math.random() * 50 + 20, y: Math.random() * 200 + 100 });
    };

    return (
        <div className="p-4 lg:p-8 h-screen flex flex-col">
            <header className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
                        <Users className="w-6 h-6 text-green-400" />
                        {t.collab.title}
                        {projectId && <span className="text-sm font-mono text-gray-600 ml-2 bg-white/5 px-2 py-1 rounded">[{projectId}]</span>}
                    </h1>
                    <p className="text-gray-400 text-sm">{t.collab.subtitle}</p>
                </div>

                <div className="flex -space-x-3">
                    {collaborators.map(c => (
                        <div key={c.id} title={c.name} className={`w-10 h-10 rounded-full border-2 border-[#0f0f12] flex items-center justify-center text-white text-xs font-bold ${c.color} shadow-lg relative`}>
                            {c.name[0]}
                            {c.isAi && <Sparkles className="w-3 h-3 absolute -top-1 -right-1 text-yellow-300 fill-yellow-300" />}
                        </div>
                    ))}
                    <button className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/20 transition-colors border-2 border-[#0f0f12]">
                        <UserPlus className="w-4 h-4" />
                    </button>
                </div>
            </header>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
                {/* Branch Manager */}
                <div className="hidden lg:flex flex-col gap-4 bg-black/20 border border-white/5 rounded-2xl p-4">
                    <h3 className="font-bold text-gray-400 text-sm flex items-center gap-2">
                        <GitBranch className="w-4 h-4" /> {t.collab.version_history}
                    </h3>

                    <div className="space-y-3">
                        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                            <span className="text-xs text-blue-400 font-bold block mb-1">{t.collab.current_draft}</span>
                            <p className="text-sm">Episode 1: The Beginning</p>
                        </div>

                        <div className="p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 cursor-pointer opacity-70">
                            <span className="text-xs text-gray-500 font-bold block mb-1">ALT_A (HAPPY)</span>
                            <p className="text-sm">Finding the Key</p>
                        </div>

                        <div className="p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 cursor-pointer opacity-70">
                            <span className="text-xs text-gray-500 font-bold block mb-1">ALT_B (TRAGIC)</span>
                            <p className="text-sm">Lost in Shadows</p>
                        </div>

                        <button className="w-full py-2 border border-dashed border-gray-600 rounded-lg text-gray-500 text-sm hover:text-white hover:border-gray-400 transition-colors flex items-center justify-center gap-2">
                            <GitBranch className="w-3 h-3" /> Branch Out
                        </button>
                    </div>
                </div>

                {/* Editor Area */}
                <div className="lg:col-span-2 relative bg-[#1a1a20] rounded-xl text-white font-mono shadow-2xl overflow-hidden flex flex-col border border-white/10">
                    {/* Toolbar */}
                    <div className="bg-[#2a2a35] border-b border-white/10 p-2 flex gap-2">
                        <button className="p-1 hover:bg-white/10 rounded text-gray-300 transition-colors"><span className="font-bold">B</span></button>
                        <button className="p-1 hover:bg-white/10 rounded text-gray-300 transition-colors"><span className="italic">I</span></button>
                        <div className="w-[1px] bg-white/10 mx-2" />
                        <span className="text-xs text-gray-500 self-center">Last edit by AI Thriller Bot (2s ago)</span>
                    </div>

                    <div className="flex-1 relative p-8 overflow-y-auto">
                        <textarea
                            className="w-full h-full resize-none outline-none bg-transparent relative z-10 font-courier text-lg leading-relaxed"
                            value={script}
                            onChange={handleType}
                        />

                        {/* Mock Remote Cursor */}
                        <motion.div
                            animate={activeCursor}
                            transition={{ type: "spring", damping: 20 }}
                            className="absolute pointer-events-none z-20 flex gap-2 items-center"
                        >
                            <div className="w-[2px] h-5 bg-red-500" />
                            <span className="bg-red-500 text-white text-[10px] px-1 rounded font-bold">AI Bot writing...</span>
                        </motion.div>
                    </div>
                </div>

                {/* Chat / Comments */}
                <div className="hidden lg:flex flex-col bg-black/20 border border-white/5 rounded-2xl p-4">
                    <h3 className="font-bold text-gray-400 text-sm flex items-center gap-2 mb-4">
                        <MessagesSquare className="w-4 h-4" /> Discussion
                    </h3>

                    <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-red-500 flex-shrink-0 flex items-center justify-center text-xs font-bold text-white">AI</div>
                            <div>
                                <div className="bg-white/10 rounded-lg rounded-tl-none p-3 text-sm">
                                    I suggest increasing the tension in line 4. The forest should feel 'alive'.
                                </div>
                                <span className="text-[10px] text-gray-500 mt-1 block">10:42 AM</span>
                            </div>
                        </div>

                        <div className="flex gap-3 flex-row-reverse">
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center text-xs font-bold text-white">Me</div>
                            <div>
                                <div className="bg-blue-600/50 rounded-lg rounded-tr-none p-3 text-sm">
                                    Agreed. Let's add sound cues.
                                </div>
                                <span className="text-[10px] text-gray-500 mt-1 block text-right">10:44 AM</span>
                            </div>
                        </div>
                    </div>

                    <div className="relative">
                        <input type="text" placeholder="Type a message..." className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-blue-500 outline-none" />
                    </div>
                </div>
            </div>
        </div>
    );
}
