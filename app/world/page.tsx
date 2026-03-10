'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Users, Search, Filter, Sparkles } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function WorldMap() {
    const [characters, setCharacters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const { t, lang } = useLanguage();
    const { projectId } = useProject();

    useEffect(() => {
        fetchCharacters();
    }, [projectId]);

    async function fetchCharacters() {
        if (!projectId) {
            setLoading(false);
            setCharacters([]);
            return;
        }

        setLoading(true);
        const { data } = await supabase
            .from('characters')
            .select('*')
            .eq('project_id', projectId)
            .order('id', { ascending: true })
            .limit(100);

        if (data) setCharacters(data);
        else setCharacters([]);
        setLoading(false);
    }

    const filteredChars = characters.filter(c => {
        // [Strict Filter] Only show adapted characters
        const hasAdaptedName = c.reinterpreted_name_kr || c.reinterpreted_name_en;
        if (!hasAdaptedName) return false;

        return (
            c.reinterpreted_name_kr?.includes(filter) ||
            c.reinterpreted_name_en?.includes(filter) ||
            c.reinterpreted_role_kr?.includes(filter) ||
            c.reinterpreted_role_en?.includes(filter)
        );
    });

    return (
        <div className="p-8 lg:p-12 min-h-screen">
            <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <Users className="w-8 h-8 text-blue-400" />
                        {t.world.title}
                    </h1>
                    <p className="text-gray-400">{t.world.subtitle}</p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4 w-full md:w-auto">
                    <button
                        onClick={async () => {
                            if (!projectId) return;
                            setLoading(true);
                            try {
                                const res = await fetch('/api/analyze-characters', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ projectId })
                                });

                                const result = await res.json();

                                if (res.ok) {
                                    await fetchCharacters();
                                    const { summary } = result;
                                    const msg = lang === 'KO'
                                        ? `완료! (AI 생성: ${summary.total_from_ai}명, 저장: ${summary.saved}명, 실패: ${summary.failed}명)\n${summary.failed > 0 ? '에러: ' + summary.last_error : ''}`
                                        : `Done! (AI: ${summary.total_from_ai}, Saved: ${summary.saved}, Failed: ${summary.failed})\n${summary.failed > 0 ? 'Error: ' + summary.last_error : ''}`;
                                    alert(msg);
                                } else {
                                    alert(`Error: ${result.error || 'Unknown error occurred'}`);
                                }
                            } catch (e: any) {
                                console.error(e);
                                alert(`Request failed: ${e.message}`);
                            }
                            setLoading(false);
                        }}
                        disabled={loading}
                        className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-full font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
                    >
                        <Sparkles className="w-5 h-5" />
                        {loading ? (lang === 'KO' ? '생성 중...' : 'Generating...') : (lang === 'KO' ? '캐릭터 생성 및 분석' : 'Gen & Analyze')}
                    </button>

                    {/* Search Bar */}
                    <div className="relative flex-1 md:w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                            type="text"
                            placeholder={t.common.search}
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-full pl-12 pr-6 py-3 focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder:text-gray-600 transition-all"
                        />
                    </div>
                </div>
            </header>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                <AnimatePresence>
                    {filteredChars.map((char, i) => (
                        <motion.div
                            key={`${char.id}-${i}`}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            whileHover={{ y: -5 }}
                            transition={{ duration: 0.2, delay: i * 0.05 }}
                            className="glass-panel p-6 rounded-2xl group cursor-pointer relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                            </div>

                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 flex items-center justify-center overflow-hidden">
                                    <User className="w-6 h-6 text-gray-500" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">
                                        {lang === 'KO'
                                            ? (char.reinterpreted_name_kr || '이름 없음 (각색)')
                                            : (char.reinterpreted_name_en || 'Unnamed (Adapted)')}
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs text-blue-400">
                                            {lang === 'KO'
                                                ? (char.reinterpreted_role_kr || char.reinterpreted_role_en)
                                                : (char.reinterpreted_role_en || char.reinterpreted_role_kr)
                                                || 'Role Undefined'}
                                        </p>
                                        {(char.reinterpreted_tier_en || char.tier) && (
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${(char.reinterpreted_tier_en || char.tier) === 'MAIN' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                                (char.reinterpreted_tier_en || char.tier)?.includes('SUPPORT') ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                                    'bg-gray-500/20 text-gray-500 border border-gray-500/30'
                                                }`}>
                                                {char.reinterpreted_tier_en || char.tier}
                                            </span>
                                        )}
                                        {char.status && (
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${char.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                                char.status === 'DECEASED' ? 'bg-red-500/20 text-red-500 border border-red-500/30' :
                                                    char.status === 'RETIRED' ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/30' :
                                                        'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                                                }`}>
                                                {char.status}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {/* [v5.1] Original name removed from character table mapping */}
                                {char.last_seen_episode_index !== undefined && char.last_seen_episode_index !== null && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">Last Seen</span>
                                        <span className="text-blue-400 text-[10px] font-bold">EPISODE {char.last_seen_episode_index}</span>
                                    </div>
                                )}
                                {char.trauma_matrix && (
                                    <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                                        <p className="text-[10px] text-purple-300/70 font-bold uppercase mb-1 flex items-center gap-1">
                                            <Filter className="w-3 h-3" /> Narrative Arc
                                        </p>
                                        <p className="text-[10px] text-gray-400 leading-relaxed italic">
                                            {lang === 'KO'
                                                ? char.trauma_matrix.fate?.substring(0, 60)
                                                : (char.trauma_matrix.fate_en || char.trauma_matrix.fate)?.substring(0, 60)}...
                                        </p>
                                    </div>
                                )}
                                <div className="mt-1 pt-3 border-t border-white/5">
                                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                                        {lang === 'KO'
                                            ? char.reinterpreted_personality_kr
                                            : ((char.reinterpreted_personality_en || char.reinterpreted_personality_kr) || 'No description available.')}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {loading && (
                <div className="flex justify-center py-20">
                    <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
            )}
        </div>
    );
}
