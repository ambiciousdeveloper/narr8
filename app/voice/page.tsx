'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, Play, Pause, RefreshCw, Mic, Volume2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function VoiceStudio() {
    const { projectId } = useProject();
    const [characters, setCharacters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [generatingId, setGeneratingId] = useState<string | null>(null);
    const [audioMap, setAudioMap] = useState<{ [key: string]: string }>({});
    const [customTextMap, setCustomTextMap] = useState<{ [key: string]: string }>({});
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const { t } = useLanguage();

    useEffect(() => {
        if (projectId) {
            fetchCharacters();
        }
    }, [projectId]);

    async function fetchCharacters() {
        if (!projectId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('characters')
                .select('*, character_voices(*)')
                .eq('project_id', projectId)
                .order('created_at', { ascending: true })
                .limit(20);

            if (error) {
                console.warn('Relationship query failed, falling back to simple query:', error);
                const { data: simpleData } = await supabase
                    .from('characters')
                    .select('*')
                    .eq('project_id', projectId);
                if (simpleData) setCharacters(simpleData);
            } else if (data) {
                setCharacters(data);
                // Initialize customTextMap with the default text shown in the textarea
                // This ensures the text is sent to TTS even if the user doesn't type anything
                setCustomTextMap(prev => {
                    const defaults: { [key: string]: string } = { ...prev };
                    data.forEach(c => {
                        if (!defaults[c.id]) {
                            defaults[c.id] = c.reinterpreted_personality_kr?.split('.')[0]
                                || c.reinterpreted_role_kr
                                || '안녕하세요, 만나서 반갑습니다.';
                        }
                    });
                    return defaults;
                });
            }
        } catch (e) {
            console.error('Fetch error:', e);
        } finally {
            setLoading(false);
        }
    }

    const togglePlay = (charId: string) => {
        if (playingId === charId) {
            audioRef.current?.pause();
            setPlayingId(null);
            return;
        }

        const audioData = audioMap[charId] || characters.find(c => c.id === charId)?.character_voices?.[0]?.audio_url;
        if (!audioData) return;

        if (audioRef.current) {
            const isValidDataUri = audioData.startsWith('data:audio');
            const newSrc = isValidDataUri ? audioData : `data:audio/mpeg;base64,${audioData}`;

            // Only update src if it changed, to avoid reloading overhead
            if (audioRef.current.src !== newSrc) {
                audioRef.current.src = newSrc;
            }

            audioRef.current.play()
                .then(() => setPlayingId(charId))
                .catch(e => {
                    console.error("Playback failed:", e);
                    setPlayingId(null);
                });
        }
    };

    async function handleAutoCast(charId: string) {
        setGeneratingId(charId);
        try {
            const customText = customTextMap[charId];
            const res = await fetch('/api/generate-voice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ characterId: charId, projectId, customText })
            });
            const data = await res.json();
            if (data.success) {
                const audioUrl = `data:audio/mpeg;base64,${data.audioData}`;
                setAudioMap(prev => ({ ...prev, [charId]: audioUrl }));
                togglePlay(charId);
                // Refresh character list to show 'Casted' status
                fetchCharacters();
            } else {
                alert('Generation failed: ' + data.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setGeneratingId(null);
        }
    }

    return (
        <div className="p-8 lg:p-12 min-h-screen">
            <header className="mb-10">
                <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                    <Mic className="w-8 h-8 text-pink-500" />
                    {t.voice.title}
                </h1>
                <p className="text-gray-400">{t.voice.subtitle}</p>
            </header>

            {loading ? (
                <div className="flex flex-col items-center justify-center py-40 opacity-30">
                    <RefreshCw className="w-12 h-12 animate-spin mb-4" />
                    <p className="font-bold">Fetching Voices...</p>
                </div>
            ) : characters.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                    <AnimatePresence>
                        {characters.map((char, i) => (
                            <motion.div
                                key={char.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.2, delay: i * 0.05 }}
                                className="glass-panel p-6 rounded-2xl relative overflow-hidden group"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-bold text-lg">
                                            {char.reinterpreted_name_kr || char.reinterpreted_name_en || char.original_name_kr || 'Unknown'}
                                        </h3>
                                        <p className="text-xs text-pink-400">
                                            {char.reinterpreted_role_kr || char.reinterpreted_role_en || 'Role Pending'}
                                        </p>
                                    </div>
                                    {char.character_voices?.[0]?.voice_api_id ? (
                                        <div className="flex flex-col items-end gap-1">
                                            <div className="px-2 py-1 rounded bg-green-500/20 text-green-400 text-[10px] font-bold border border-green-500/30">
                                                {char.character_voices?.[0]?.voice_persona_name || t.voice.casted}
                                            </div>
                                            <button
                                                onClick={() => handleAutoCast(char.id)}
                                                className="p-1 hover:bg-white/10 rounded text-gray-400"
                                                title="Regenerate"
                                            >
                                                <RefreshCw className={`w-3 h-3 ${generatingId === char.id ? 'animate-spin' : ''}`} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleAutoCast(char.id)}
                                            disabled={generatingId === char.id}
                                            className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-xs transition-colors disabled:opacity-50"
                                        >
                                            {generatingId === char.id ? (
                                                <RefreshCw className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <Wand2 className="w-3 h-3" />
                                            )}
                                            {t.voice.auto_cast}
                                        </button>
                                    )}
                                </div>

                                <div className="p-4 bg-black/40 rounded-xl mb-4 border border-white/5 relative group">
                                    <textarea
                                        className="w-full bg-transparent text-sm text-gray-300 italic resize-none focus:outline-none focus:text-white transition-colors"
                                        rows={2}
                                        value={customTextMap[char.id] ?? (char.reinterpreted_personality_kr?.split('.')[0] || char.personality_keywords?.split('.')[0] || '안녕하세요, 만나서 반갑습니다.')}
                                        onChange={(e) => {
                                            setCustomTextMap(prev => ({ ...prev, [char.id]: e.target.value }));
                                        }}
                                        placeholder="이곳에 테스트할 대사를 입력하세요..."
                                    />
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="px-2 py-0.5 rounded bg-white/10 text-[10px] text-gray-400">수정 가능</div>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center mt-2">
                                    <button
                                        onClick={() => {
                                            if (audioMap[char.id] || char.character_voices?.[0]?.audio_url) {
                                                togglePlay(char.id);
                                            } else {
                                                handleAutoCast(char.id);
                                            }
                                        }}
                                        disabled={generatingId === char.id}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${generatingId === char.id ? 'opacity-50 cursor-wait'
                                            : playingId === char.id
                                                ? 'bg-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.5)]'
                                                : (audioMap[char.id] || char.character_voices?.[0]?.audio_url)
                                                    ? 'bg-white/10 hover:bg-white/20 text-white border border-pink-500/30'
                                                    : 'bg-white/10 hover:bg-white/20 text-pink-400 border border-pink-500/30'
                                            }`}
                                    >
                                        {generatingId === char.id ? <RefreshCw className="w-4 h-4 animate-spin" />
                                            : playingId === char.id ? <Pause className="w-4 h-4" />
                                                : <Play className="w-4 h-4" />}

                                        {generatingId === char.id ? '합성 중...'
                                            : playingId === char.id ? '재생 중'
                                                : (audioMap[char.id] || char.character_voices?.[0]?.audio_url) ? '음성 미리 듣기'
                                                    : '✨ 보이스 생성'}
                                    </button>
                                    {(audioMap[char.id] || char.character_voices?.[0]?.audio_url) && (
                                        <div className="flex items-center gap-3 text-pink-400">
                                            <button
                                                onClick={() => handleAutoCast(char.id)}
                                                className="flex items-center gap-1 hover:text-white transition-colors opacity-80 hover:opacity-100"
                                                title="텍스트를 바꾸고 다시 생성하기"
                                            >
                                                <RefreshCw className="w-3 h-3" />
                                                <span className="text-[10px] font-bold">다시 생성</span>
                                            </button>
                                            <div className="flex items-center gap-1 opacity-50">
                                                <Volume2 className="w-4 h-4 animate-pulse" />
                                                <span className="text-[10px] font-bold uppercase tracking-widest">Ready</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            ) : (
                <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-[40px] opacity-20">
                    <Mic className="w-16 h-16 mx-auto mb-4" />
                    <p className="text-xl font-bold">No Characters Found</p>
                    <p className="text-sm">Please analyze characters in Story Bible first.</p>
                </div>
            )
            }
            <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />
        </div >
    );
}
