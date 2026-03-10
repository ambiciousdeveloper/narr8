'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Scissors, Play, SkipBack, SkipForward, Layers, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Image from 'next/image';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const PX_PER_SEC = 30;

export default function CuttingRoom() {
    const searchParams = useSearchParams();
    const episodeId = searchParams.get('episode_id');

    const [isPlaying, setIsPlaying]     = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [timeline, setTimeline]       = useState<any>(null);
    const [isLoading, setIsLoading]     = useState(true);
    const [isSaving, setIsSaving]       = useState(false);
    const [assets, setAssets]           = useState<any[]>([]);
    const [activeClip, setActiveClip]   = useState<any>(null);
    const [rangeValue, setRangeValue]   = useState(0);

    const bgmRef    = useRef<HTMLAudioElement>(null);
    const voiceRef  = useRef<HTMLAudioElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { projectId } = useProject();

    const contentWidth = Math.max((timeline?.duration || 0) * PX_PER_SEC + 1000, 4000);

    // 휠 → 가로 스크롤
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            el.scrollLeft += e.deltaY + e.deltaX;
            setRangeValue(el.scrollLeft);
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    const handleScroll = () => {
        setRangeValue(scrollRef.current?.scrollLeft ?? 0);
    };

    const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Number(e.target.value);
        setRangeValue(val);
        if (scrollRef.current) scrollRef.current.scrollLeft = val;
    };

    useEffect(() => {
        if (episodeId) fetchStoryboard();
        if (projectId) fetchAssets();
    }, [episodeId, projectId]);

    useEffect(() => {
        let interval: any;
        if (isPlaying && timeline) {
            bgmRef.current?.play().catch(console.error);
            interval = setInterval(() => {
                setCurrentTime(prev => {
                    const next = prev + 0.1;
                    if (next >= timeline.duration) {
                        setIsPlaying(false);
                        bgmRef.current?.pause();
                        return timeline.duration;
                    }
                    return next;
                });
            }, 100);
        } else {
            bgmRef.current?.pause();
        }
        return () => clearInterval(interval);
    }, [isPlaying, timeline]);

    useEffect(() => {
        if (!isPlaying || !timeline) return;
        const audioTrack = timeline.tracks.find((t: any) => t.type === 'audio');
        if (!audioTrack) return;
        const clip = audioTrack.clips.find((c: any) =>
            currentTime >= c.start && currentTime < c.start + 0.15
        );
        if (clip?.audio_url && voiceRef.current && voiceRef.current.src !== clip.audio_url) {
            voiceRef.current.src = clip.audio_url;
            voiceRef.current.play().catch(console.error);
        }
    }, [currentTime, isPlaying, timeline]);

    useEffect(() => {
        if (!timeline) return;
        const videoTrack = timeline.tracks.find((t: any) => t.type === 'video');
        if (!videoTrack) return;
        const clip = videoTrack.clips.find((c: any) =>
            currentTime >= c.start && currentTime < c.start + c.duration
        );
        if (clip) setActiveClip(clip);
    }, [currentTime, timeline]);

    async function fetchStoryboard() {
        setIsLoading(true);
        const { data } = await supabase
            .from('episode_storyboards')
            .select('timeline_data')
            .eq('episode_id', episodeId)
            .single();
        if (data) setTimeline(data.timeline_data);
        setIsLoading(false);
    }

    async function fetchAssets() {
        const [{ data: charVisuals }, { data: locVisuals }, { data: propVisuals }] =
            await Promise.all([
                supabase.from('character_visuals').select('id,image_url,created_at').eq('project_id', projectId).order('created_at', { ascending: false }),
                supabase.from('location_visuals').select('id,image_url,created_at').eq('project_id', projectId).order('created_at', { ascending: false }),
                supabase.from('prop_visuals').select('id,image_url,created_at').eq('project_id', projectId).order('created_at', { ascending: false }),
            ]);
        setAssets([
            ...(charVisuals || []).map((v: any) => ({ ...v, type: 'char' })),
            ...(locVisuals  || []).map((v: any) => ({ ...v, type: 'loc' })),
            ...(propVisuals || []).map((v: any) => ({ ...v, type: 'prop' })),
        ]);
    }

    async function saveTimeline() {
        if (!episodeId) return;
        setIsSaving(true);
        await supabase.from('episode_storyboards').update({ timeline_data: timeline }).eq('episode_id', episodeId);
        setIsSaving(false);
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen text-purple-400">
                <Loader2 className="w-12 h-12 animate-spin" />
            </div>
        );
    }

    const maxScroll = Math.max(contentWidth - (scrollRef.current?.clientWidth ?? 0), 0);

    return (
        // ── 루트: 전체 뷰포트를 overflow:hidden으로 차단 ──
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', overflow: 'hidden', background: '#0a0a0c' }}>
            <audio ref={bgmRef} src={timeline?.bgm_url || undefined} loop />
            <audio ref={voiceRef} />

            {/* 상단: 프리뷰 + Vault */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '16px', padding: '24px', overflow: 'hidden' }}>
                <div style={{ flex: 1, minWidth: 0, background: '#000', borderRadius: '32px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', top: '24px', left: '24px', zIndex: 100, padding: '4px 12px', background: '#9333ea', borderRadius: '9999px', fontWeight: 900, fontSize: '8px', color: '#fff', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                        V69.0 ABS-FIX
                    </div>
                    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
                        {activeClip?.visual_url?.includes('/vault/storyboards/') ? (
                            <Image src={activeClip.visual_url} alt="Monitor" fill className="object-contain" />
                        ) : activeClip ? (
                            <div style={{ textAlign: 'center', padding: '48px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px' }}>
                                <Loader2 style={{ width: 48, height: 48, margin: '0 auto 24px', color: '#a855f7', animation: 'spin 1s linear infinite' }} />
                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Synthesis in Progress</p>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', opacity: 0.2 }}>
                                <ImageIcon style={{ width: 64, height: 64, margin: '0 auto 16px', color: '#374151' }} />
                                <p style={{ color: '#4b5563', fontFamily: 'monospace', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Monitor Standby</p>
                            </div>
                        )}
                    </div>
                    {/* Transport */}
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-black/90 backdrop-blur-3xl px-8 py-4 rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => setCurrentTime(0)} className="text-white/40 hover:text-white"><SkipBack className="w-5 h-5" /></button>
                        <button onClick={() => setIsPlaying(!isPlaying)} className="w-12 h-12 rounded-full bg-purple-600 text-white flex items-center justify-center hover:bg-purple-500 active:scale-90 transition-all">
                            {isPlaying ? <Scissors className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1 fill-current" />}
                        </button>
                        <button className="text-white/40 hover:text-white"><SkipForward className="w-5 h-5" /></button>
                    </div>
                </div>

                <div style={{ width: '320px', flexShrink: 0, background: '#111114', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '32px', padding: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <h3 style={{ fontWeight: 900, fontSize: '10px', color: '#6b7280', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                        <Layers style={{ width: 16, height: 16, color: '#a855f7' }} /> Project Vault
                    </h3>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {assets.map((asset, i) => (
                            <div key={i} style={{ position: 'relative', aspectRatio: '16/9', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', overflow: 'hidden', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Image src={asset.image_url} alt="Asset" fill style={{ objectFit: 'cover', opacity: 0.4 }} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── 하단: 타임라인 ──────────────────────────────────────────
                핵심 구조:
                  [A] 외부 래퍼: height:320px, overflow:hidden (자식 너비 차단)
                  [B] 헤더: height:56px, flexShrink:0
                  [C] 스크롤 래퍼: position:relative, flex:1, overflow:hidden
                      [D] 스크롤 컨테이너: position:ABSOLUTE, inset:0
                          → inset:0 = top/right/bottom/left 모두 0
                          → 부모 [C]의 너비에 완전히 갇힘 → clientWidth = 부모 너비
                          → 내부 div width:4000px 이 실제 overflow 발생시킴
                  [E] range 바: height:32px, flexShrink:0
            ─────────────────────────────────────────────────────────── */}
            <div style={{ height: '320px', flexShrink: 0, background: '#000', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* [B] 헤더 */}
                <div style={{ height: '56px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', background: '#0a0a0c' }}>
                    <span style={{ color: '#a855f7', fontWeight: 900, fontSize: '16px' }}>
                        {currentTime.toFixed(2)}s
                        <span style={{ color: '#4b5563', fontWeight: 700, marginLeft: '8px', fontSize: '12px' }}>/ {timeline?.duration?.toFixed(2) || '0.00'}s</span>
                    </span>
                    <button onClick={saveTimeline} style={{ padding: '8px 24px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', color: '#9ca3af', fontSize: '10px', fontWeight: 900, border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', textTransform: 'uppercase' }}>
                        {isSaving ? <Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : 'Save Project'}
                    </button>
                </div>

                {/* [C] 스크롤 래퍼: overflow:hidden으로 자식 너비 차단 */}
                <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#050507' }}>

                    {/* [D] 스크롤 컨테이너: position:absolute + inset:0
                        → 이렇게 해야 clientWidth = 부모 너비 (늘어나지 않음)
                        → overflow-x:scroll + 내부 4000px div = 실제 스크롤 발생 */}
                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            overflowX: 'scroll',
                            overflowY: 'hidden',
                            scrollbarWidth: 'none',
                        } as React.CSSProperties}
                    >
                        {/* 실제 콘텐츠: 너비를 contentWidth(4000px+)로 강제 */}
                        <div style={{ position: 'relative', height: '100%', width: `${contentWidth}px`, padding: '32px 0' }}>

                            {timeline?.tracks.map((track: any) => (
                                <div key={track.id} style={{ display: 'flex', height: '80px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    {/* 트랙 헤더: sticky */}
                                    <div style={{ width: '224px', flexShrink: 0, position: 'sticky', left: 0, zIndex: 50, height: '100%', background: '#000', borderRight: '1px solid rgba(255,255,255,0.1)', padding: '0 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        <span style={{ fontSize: '9px', color: '#a855f7', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', opacity: 0.4, marginBottom: '4px' }}>{track.type}</span>
                                        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.9)', fontWeight: 900, textTransform: 'uppercase', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{track.name}</span>
                                    </div>
                                    {/* 클립들 */}
                                    <div style={{ flex: 1, position: 'relative' }}>
                                        {track.clips.map((clip: any) => (
                                            <motion.div
                                                key={clip.id}
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={(e) => { e.stopPropagation(); setCurrentTime(clip.start); }}
                                                style={{
                                                    position: 'absolute',
                                                    top: '8px',
                                                    bottom: '8px',
                                                    left: `${clip.start * PX_PER_SEC}px`,
                                                    width: `${clip.duration * PX_PER_SEC}px`,
                                                    borderRadius: '16px',
                                                    border: activeClip?.id === clip.id ? '1px solid #c084fc' : '1px solid rgba(255,255,255,0.05)',
                                                    background: activeClip?.id === clip.id ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.03)',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    padding: '16px',
                                                    overflow: 'hidden',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <span style={{ fontSize: '10px', fontWeight: 900, color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginBottom: '4px' }}>
                                                    {clip.name || clip.character || 'Shot'}
                                                </span>
                                                {clip.dialogue && (
                                                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontStyle: 'italic' }}>
                                                        &quot;{clip.dialogue}&quot;
                                                    </span>
                                                )}
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {/* 플레이헤드 */}
                            <div style={{ position: 'absolute', top: 0, bottom: 0, width: '2px', background: '#dc2626', zIndex: 100, pointerEvents: 'none', left: `${currentTime * PX_PER_SEC + 224}px`, boxShadow: '0 0 15px #dc2626' }}>
                                <div style={{ width: '16px', height: '16px', background: '#dc2626', borderRadius: '2px', transform: 'rotate(45deg)', marginLeft: '-7px' }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* [E] range 스크롤바 */}
                <div style={{ height: '32px', flexShrink: 0, background: '#0a0a0c', padding: '0 24px', display: 'flex', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <input
                        type="range"
                        min={0}
                        max={maxScroll || contentWidth}
                        step={1}
                        value={rangeValue}
                        onChange={handleRangeChange}
                        style={{ width: '100%', accentColor: '#a855f7', cursor: 'pointer' }}
                    />
                </div>
            </div>
        </div>
    );
}