'use client';

import { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layout, GitBranch, Target, BookOpen, User, Users, Globe, Zap, Sparkles, Clock, Bookmark, Palette, RefreshCw, Loader2, ArrowRight, Settings, History, Wand2, CheckCircle, ChevronRight, Maximize2, X, Search, AlertTriangle, Sliders, MessageSquare, Info, FileText } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function StoryBibleContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const urlProjectId = searchParams.get('project_id');
    const { t, lang } = useLanguage();
    const { projectId, projectConfig: project } = useProject();

    const [episodes, setEpisodes] = useState<any[]>([]);
    const [characters, setCharacters] = useState<any[]>([]); // [NEW] Characters State
    const [isLoading, setIsLoading] = useState(true);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isSynthesizing, setIsSynthesizing] = useState<string | null>(null);
    const [currentParentId, setCurrentParentId] = useState<string | null>(null);
    const [currentParent, setCurrentParent] = useState<any>(null);
    const [breadcrumb, setBreadcrumb] = useState<any[]>([]);
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [branchMode, setBranchMode] = useState<'ORIGINAL' | 'ADAPTED'>('ORIGINAL');

    const [adaptationLevel, setAdaptationLevel] = useState(3);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [fullHierarchy, setFullHierarchy] = useState<any[]>([]);

    // [개선] 프로젝트가 바뀌면 네비게이션 상태(계층 구조)를 초기화하여 이전 프로젝트의 데이터가 보이지 않게 함
    useEffect(() => {
        setCurrentParentId(null);
        setBreadcrumb([]);
        // [Smart Default] L1이 각색되었는지 확인하여 초기 브랜치 모드 결정
        const checkL1Synthesis = async () => {
            if (!projectId) return;
            const { data } = await supabase.from('story_summary')
                .select('is_synthesized')
                .eq('project_id', projectId)
                .eq('hierarchy_group', 'L1')
                .maybeSingle();

            // L1이 각색되었으면 ADAPTED 모드로 시작, 아니면 ORIGINAL
            setBranchMode(data?.is_synthesized ? 'ADAPTED' : 'ORIGINAL');
        };
        checkL1Synthesis();
    }, [projectId]);

    useEffect(() => {
        if (!projectId) {
            setIsLoading(false);
            setEpisodes([]);
            setCharacters([]);
            setFullHierarchy([]);
            return;
        }
        fetchData();
        fetchCharacters(); // [NEW] Fetch Characters
        fetchFullHierarchy();
    }, [projectId, currentParentId, branchMode]); // branchMode 감시 추가


    async function fetchData() {
        if (!projectId) return;
        setIsLoading(true);
        try {
            if (project?.adaptation_level) setAdaptationLevel(project.adaptation_level);

            if (currentParentId) {
                const { data: pInfo } = await supabase.from('story_summary').select('*').eq('id', currentParentId).single();
                setCurrentParent(pInfo);
            } else {
                setCurrentParent(null);
            }

            let query = supabase.from('story_summary').select('*').eq('project_id', projectId);
            if (currentParentId) {
                query = query.eq('parent_id', currentParentId).eq('branch_type', branchMode);
            } else {
                // L1은 항상 하나이며 ORIGINAL 브랜치에 앵커링되어 있음
                query = query.is('parent_id', null).eq('hierarchy_group', 'L1');
            }

            const { data, error } = await query.order('order_index', { ascending: true });

            if (error) throw error;
            // [V3.1 Fix] Deduplicate episodes to prevent React Key errors
            const uniqueEpisodes = Array.from(new Map((data || []).map(item => [item.id, item])).values());
            setEpisodes(uniqueEpisodes);
        } catch (error) {
            console.error('Error fetching story bible:', error);
        } finally {
            setIsLoading(false);
        }
    }

    // [NEW] Fetch Characters Logic
    async function fetchCharacters() {
        if (!projectId) return;
        try {
            // Fetch characters for the Project
            const { data, error } = await supabase
                .from('characters')
                .select('*')
                .eq('project_id', projectId);

            if (error) throw error;

            // Custom Sort: MAIN -> SUPPORT -> EXTRA
            const tierOrder: Record<string, number> = { 'MAIN': 0, 'SUPPORT': 1, 'EXTRA': 2 };
            const sorted = (data || []).sort((a, b) => {
                const tA = tierOrder[a.tier] ?? 3;
                const tB = tierOrder[b.tier] ?? 3;
                return tA - tB;
            });

            setCharacters(sorted);
        } catch (e) {
            console.error('Error fetching characters:', e);
        }
    }

    async function fetchFullHierarchy() {
        if (!projectId) return;
        const { data } = await supabase.from('story_summary')
            .select('id, parent_id, hierarchy_group, unit_title_kr, unit_title_en, synthesized_title_kr, synthesized_title_en, branch_type, is_synthesized')
            .eq('project_id', projectId)
            .order('order_index', { ascending: true });

        // [V3.1 Fix] Deduplicate by ID to prevent React Key errors from DB/Cache pollution
        const uniqueData = Array.from(new Map((data || []).map(item => [item.id, item])).values());
        setFullHierarchy(uniqueData);
    }

    async function handleAnalyze(level: string, parentId: string | null = null, isReAnalyze = false) {
        setIsAnalyzing(true);
        try {
            const res = await fetch('/api/analyze-story', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    level,
                    parentId,
                    isAdapted: isReAnalyze // Re-analysis means Adaptation Phase for L1
                })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);

            await fetchData();
            await fetchCharacters(); // Refresh characters after analysis
            await fetchFullHierarchy();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsAnalyzing(false);
        }
    }

    // [Handler] Synthesize (L3 Generation)
    // 기존 L3 생성 로직 (Creative Scribe 호출)
    async function handleSynthesize(storyId: string) {
        setIsSynthesizing(storyId);
        try {
            const res = await fetch('/api/synthesize-story', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, storyId })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);

            // Refresh Local State
            setEpisodes(prev => prev.map(ep => ep.id === storyId ? { ...ep, ...json, is_synthesized: true } : ep));
            await fetchCharacters(); // Refresh characters (new chars might be added)
            await fetchFullHierarchy();
        } catch (err: any) {
            console.error(err);
            alert(`Synthesis Failed: ${err.message}`);
        } finally {
            setIsSynthesizing(null);
        }
    }

    async function handleExportToScript(episode: any) {
        if (confirm(lang === 'KO' ? '이 에피소드를 소설 스튜디오로 보내시겠습니까?' : 'Export this episode to Novel Studio?')) {
            const title = lang === 'KO'
                ? (episode.synthesized_title_kr || episode.unit_title_kr)
                : (episode.synthesized_title_en || episode.unit_title_en || episode.synthesized_title_kr || episode.unit_title_kr);

            router.push(`/novel-studio?project_id=${projectId}&source_episode_id=${episode.id}&title=${encodeURIComponent(title)}`);
        }
    }

    async function updateAdaptationLevel(lvl: number) {
        setAdaptationLevel(lvl);
        await supabase.from('project_master_config').update({ adaptation_level: lvl }).eq('project_id', projectId);
    }

    const getLevelName = (lvl: number) => {
        if (lang === 'KO') {
            if (lvl === 1) return '레벨 1: 원작 충실';
            if (lvl === 2) return '레벨 2: 완만한 각색';
            if (lvl === 3) return '레벨 3: 균형 있는 각색';
            if (lvl === 4) return '레벨 4: 과감한 재해석';
            if (lvl === 5) return '레벨 5: 파격적 재창조';
            return `레벨 ${lvl}`;
        }
        if (lvl === 1) return 'Level 1: Faithful';
        if (lvl === 2) return 'Level 2: Creative';
        if (lvl === 3) return 'Level 3: Balanced';
        if (lvl === 4) return 'Level 4: Bold';
        if (lvl === 5) return 'Level 5: Radical';
        return `Level ${lvl}`;
    };

    function handleDrillDown(ep: any, flipped: boolean) {
        // L1에서 하위로 갈 때는, 카드가 뒤집혀있으면(Adapted) -> ADAPTED 모드로 진입
        // 카드가 앞면이면(Original) -> ORIGINAL 모드로 진입
        if (ep.hierarchy_group === 'L1') {
            setBranchMode(flipped ? 'ADAPTED' : 'ORIGINAL');
        }

        setBreadcrumb(prev => {
            // Prevent duplicate entries in breadcrumb
            if (prev.some(b => b.id === ep.id)) return prev;
            return [...prev, {
                id: ep.id,
                title_kr: ep.synthesized_title_kr || ep.unit_title_kr,
                title_en: ep.synthesized_title_en || ep.unit_title_en
            }];
        });
        setCurrentParentId(ep.id);
    }

    function handleNavigateUp(index: number) {
        if (index === -1) {
            // Root로 이동
            setCurrentParentId(null);
            setBreadcrumb([]);
        } else {
            // 해당 인덱스까지 유지
            const target = breadcrumb[index];
            setCurrentParentId(target.id);
            setBreadcrumb(prev => prev.slice(0, index + 1));
        }
    }

    // Quick Jump Handler
    const handleJumpTo = (target: any) => {
        if (target.hierarchy_group === 'L1') {
            handleNavigateUp(-1);
            return;
        }

        // Parent가 누군지 찾아서 Breadcrumb 구성해야 함 (복잡하므로 단순화)
        // 여기서는 단순 이동만 지원하거나, Full Path를 추적해야 함.
        // 일단 현재 컨텍스트만 변경
        setCurrentParentId(target.parent_id); // This enters the parent folder
        // But we want to VIEW the target item.
        // Actually, currentParentId determines "Which items to show".
        // So if I click L2 item, I should set currentParentId to L2 item's parent (L1) -> Show L2 items?
        // No, "View Sub Narrative" usually means "Go Inside".
        // If I click L2 button in sidebar, maybe I want to see L3s inside it?
        // Let's assume Quick Jump to L2 means "Enter L2 to see L3s".
        setCurrentParentId(target.id);
    };

    return (
        <main className="min-h-screen bg-[#0f0f12] text-white p-8 lg:p-12">
            {/* Quick Studio Jump */}
            <div className="max-w-[2000px] mx-auto mb-8 flex items-center gap-3 text-sm font-bold uppercase tracking-wider text-gray-500 px-2">
                <span className="text-purple-400">{lang === 'KO' ? '스토리 바이블(기획)' : 'Story Bible (Planning)'}</span>
                <ChevronRight className="w-4 h-4 text-gray-700" />
                <span className="opacity-30 cursor-not-allowed">{lang === 'KO' ? '소설 스튜디오(창작)' : 'Novel Studio (Creation)'}</span>
                <ChevronRight className="w-4 h-4 text-gray-700 opacity-30" />
                <span className="opacity-30 cursor-not-allowed">{lang === 'KO' ? '대본 스튜디오(각색)' : 'Script Studio (Adaptation)'}</span>
            </div>

            <header className="mx-auto mb-12 px-2">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
                    <div>
                        <h1 className="text-4xl font-bold mb-3 flex items-center gap-4">
                            <BookOpen className="w-10 h-10 text-purple-400" />
                            {t.storyBible.title}
                        </h1>
                        <nav className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                            <button onClick={() => handleNavigateUp(-1)} className="hover:text-purple-400 transition-colors">
                                {lang === 'KO' ? (project?.source_identity_kr || 'Root') : (project?.source_identity_en || project?.source_identity_kr || 'Root')}
                            </button>
                            {breadcrumb.map((b, idx) => (
                                <div key={`${b.id}-${idx}`} className="flex items-center gap-2">
                                    <ChevronRight className="w-3 h-3 text-gray-700" />
                                    <button onClick={() => handleNavigateUp(idx)} className="hover:text-purple-400 transition-colors max-w-[150px] truncate uppercase">
                                        {lang === 'KO' ? b.title_kr : (b.title_en || b.title_kr)}
                                    </button>
                                </div>
                            ))}
                        </nav>

                        {/* Quick Level Navigation */}
                        {fullHierarchy.length > 0 && (
                            <div className="flex items-center gap-2 mt-3">
                                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider mr-1">Quick Jump:</span>

                                <button
                                    onClick={() => handleNavigateUp(-1)}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${currentParentId === null ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'}`}
                                >
                                    L1
                                </button>

                                {(() => {
                                    const l1 = fullHierarchy.find(h => h.hierarchy_group === 'L1');
                                    const isL2Active = currentParentId === l1?.id;
                                    return (
                                        <button
                                            disabled={!l1}
                                            onClick={() => l1 && setCurrentParentId(l1.id)}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${isL2Active ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 disabled:opacity-30'}`}
                                        >
                                            L2
                                        </button>
                                    );
                                })()}

                                {(() => {
                                    const l2s = fullHierarchy.filter(h => h.hierarchy_group === 'L2' && h.branch_type === branchMode);
                                    const isL3Active = fullHierarchy.find(h => h.id === currentParentId)?.hierarchy_group === 'L2';
                                    return (
                                        <button
                                            disabled={l2s.length === 0}
                                            onClick={() => l2s.length > 0 && setCurrentParentId(l2s[0].id)}
                                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${isL3Active ? 'bg-purple-600 text-white' : 'bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 disabled:opacity-30'}`}
                                        >
                                            L3
                                        </button>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        {/* Controls */}
                        <div className="flex items-center gap-3 px-4 h-[60px] bg-white/5 border border-white/10 rounded-2xl w-fit">
                            <Sliders className="w-4 h-4 text-purple-400" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">{lang === 'KO' ? '각색 강도' : 'Adaptation Level'}</span>
                                <div className="flex items-center gap-3">
                                    <input type="range" min="1" max="5" step="1" value={adaptationLevel} onChange={(e) => updateAdaptationLevel(parseInt(e.target.value))} className="w-20 accent-purple-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                                    <span className="text-xs font-bold text-purple-300 min-w-[130px] text-center">{getLevelName(adaptationLevel)}</span>
                                </div>
                            </div>
                        </div>

                        <button onClick={() => router.push(`/onboarding?project_id=${projectId}`)} className="flex items-center gap-2 px-6 h-[60px] bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all">
                            <Settings className="w-4 h-4 text-gray-400" />
                            {t.storyBible.resetConditions}
                        </button>
                    </div>
                </div>
            </header>

            {/* MAIN EPISODE GRID */}
            <div className="mx-auto pb-20 px-2 min-h-[400px] relative">
                <AnimatePresence mode="wait">
                    {!projectId ? (
                        <div key="no" className="text-center py-20"><p>No Project</p></div>
                    ) : isLoading && episodes.length === 0 ? (
                        <motion.div key="loader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-20"><Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" /><p className="text-gray-400 font-medium">Loading...</p></motion.div>
                    ) : episodes.length > 0 ? (
                        <motion.div key="grid" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 ${isLoading ? 'opacity-30 blur-[2px] pointer-events-none' : ''}`}>
                            {episodes.map((ep) => (
                                <StoryCard
                                    key={ep.id}
                                    ep={ep}
                                    parentLastSync={currentParent?.last_synthesized_at}
                                    isSynthesizing={isSynthesizing === ep.id || (ep.hierarchy_group === 'L1' && isAnalyzing)}
                                    isAnalyzing={isAnalyzing}
                                    onSynthesize={() => {
                                        if (ep.hierarchy_group === 'L1') return handleAnalyze('L1', null, true);

                                        // [Prologue Routing] Hybrid check to send directly to Novel Studio
                                        const isPrologue = ep.hierarchy_group === 'L2' && (
                                            ep.unit_type === 'PROLOGUE' ||
                                            ep.order_index === 0 ||
                                            (ep.unit_title_kr && ep.unit_title_kr.includes('프롤로그')) ||
                                            (ep.unit_title_en && ep.unit_title_en.toLowerCase().includes('prologue'))
                                        );

                                        if (isPrologue || ep.hierarchy_group === 'L3') return handleExportToScript(ep);
                                        return handleSynthesize(ep.id);
                                    }}
                                    onDrillDown={(flipped: boolean) => handleDrillDown(ep, flipped)}
                                    onExpand={(type: string) => setSelectedItem({ ...ep, type })}
                                    lang={lang}
                                    t={t}
                                    branchMode={branchMode}
                                    hasAdaptedChildren={fullHierarchy.some(h => h.parent_id === ep.id && h.branch_type === 'ADAPTED')}
                                    project={project}
                                />
                            ))}
                        </motion.div>
                    ) : (
                        <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20 bg-white/5 border border-dashed border-white/10 rounded-[40px]">
                            <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4 opacity-20" />
                            <p className="text-gray-500 text-lg font-medium">{lang === 'KO' ? '데이터가 없습니다.' : 'No data.'}</p>
                            <button
                                onClick={() => {
                                    const nextLevel = currentParentId ? (currentParent?.hierarchy_group === 'L1' ? 'L2' : 'L3') : 'L1';
                                    handleAnalyze(nextLevel, currentParentId, branchMode === 'ADAPTED');
                                }}
                                disabled={isAnalyzing}
                                className="mt-8 flex items-center gap-2 px-10 py-4 bg-purple-600 hover:bg-purple-500 rounded-2xl mx-auto font-bold shadow-2xl"
                            >
                                {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 text-yellow-300" />}
                                {lang === 'KO' ? '최초 분석 시작' : 'Start Analysis'}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {selectedItem && (
                    <DetailModal
                        item={selectedItem}
                        onClose={() => setSelectedItem(null)}
                        lang={lang}
                        project={project}
                    />
                )}
            </AnimatePresence>

            {/* Navigator Trigger Bookmark */}
            <motion.button
                drag="y"
                dragConstraints={{ top: -400, bottom: 400 }}
                dragElastic={0.1}
                dragMomentum={false}
                onClick={() => setIsSidebarOpen(true)}
                className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-purple-600 hover:bg-purple-500 p-3 pl-4 rounded-l-3xl shadow-2xl transition-all group flex items-center gap-3 cursor-grab active:cursor-grabbing"
            >
                <div className="flex flex-col items-center gap-1 pointer-events-none">
                    <BookOpen className="w-5 h-5 text-white" />
                    <span className="text-[9px] font-bold text-white/60 tracking-tighter uppercase [writing-mode:vertical-lr]">Map</span>
                </div>
                <ChevronRight className="w-4 h-4 text-white/40 group-hover:translate-x-1 transition-transform rotate-180 pointer-events-none" />
            </motion.button>
            {/* Story Map Sidebar */}
            <AnimatePresence>
                {isSidebarOpen && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
                        <motion.aside initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed right-0 top-0 bottom-0 w-[400px] z-[70] bg-[#16161a] border-l border-white/5 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/5">
                                <div><h2 className="text-xl font-bold flex items-center gap-2"><Zap className="w-5 h-5 text-yellow-400" />{lang === 'KO' ? '내러티브 맵' : 'Narrative Map'}</h2><p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">Story Architecture Tree</p></div>
                                <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all"><X className="w-6 h-6 text-gray-400" /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
                                {fullHierarchy.length === 0 ? <div className="py-20 text-center opacity-30"><Search className="w-12 h-12 mx-auto mb-4" /><p>{t.storyBible.noData}</p></div> : (
                                    <div className="space-y-1">
                                        {fullHierarchy.filter(h => h.hierarchy_group === 'L1').map(l1 => (
                                            <div key={l1.id} className="space-y-2">
                                                <button onClick={() => handleJumpTo(l1)} className={`w-full text-left p-4 rounded-2xl flex items-center justify-between transition-all group ${currentParentId === l1.id ? 'bg-purple-600 shadow-lg' : 'hover:bg-white/5'}`}>
                                                    <div className="flex items-center gap-3">
                                                        <span className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-bold">L1</span>
                                                        <div className="flex flex-col">
                                                            <span className={`font-bold leading-tight ${currentParentId === l1.id ? 'text-white' : 'text-gray-300'}`}>
                                                                {lang === 'KO'
                                                                    ? (branchMode === 'ADAPTED' && l1.synthesized_title_kr ? l1.synthesized_title_kr : l1.unit_title_kr)
                                                                    : (branchMode === 'ADAPTED' && l1.synthesized_title_en ? l1.synthesized_title_en : (l1.unit_title_en || project?.source_identity_en || l1.unit_title_kr))
                                                                }
                                                            </span>
                                                            {l1.is_synthesized && <span className="text-[9px] text-purple-400 font-bold uppercase tracking-tighter">{lang === 'KO' ? '각색 모드 활성' : 'Adapted Mode Active'}</span>}
                                                        </div>
                                                    </div>
                                                    {l1.is_synthesized && <Sparkles className={`w-4 h-4 ${currentParentId === l1.id ? 'text-white' : 'text-purple-400 opacity-60'}`} />}
                                                </button>
                                                <div className="pl-6 space-y-1 border-l border-white/10 ml-3">
                                                    {fullHierarchy.filter(h => h.parent_id === l1.id && h.branch_type === branchMode).map(l2 => (
                                                        <div key={l2.id} className="space-y-1">
                                                            <button onClick={() => handleJumpTo(l2)} className={`w-full text-left py-2.5 px-4 rounded-xl flex items-center justify-between transition-all text-sm group ${currentParentId === l2.id ? 'bg-purple-900/40 border border-purple-500/30 text-purple-200' : 'text-gray-500 hover:text-gray-300'}`}>
                                                                <span className="truncate flex-1">
                                                                    {lang === 'KO'
                                                                        ? (branchMode === 'ADAPTED' && l2.synthesized_title_kr ? l2.synthesized_title_kr : l2.unit_title_kr)
                                                                        : (branchMode === 'ADAPTED' && l2.synthesized_title_en ? l2.synthesized_title_en : (l2.unit_title_en || l2.unit_title_kr))
                                                                    }
                                                                </span>
                                                                {l2.is_synthesized && <Sparkles className="w-3 h-3 text-purple-400" />}
                                                            </button>
                                                            <div className="pl-4 space-y-0.5 border-l border-white/5 ml-2 mt-1">
                                                                {fullHierarchy.filter(h => h.parent_id === l2.id && h.branch_type === branchMode).map(l3 => (
                                                                    <button key={l3.id} onClick={() => handleJumpTo(l3)} className={`w-full text-left py-1.5 px-3 rounded-lg text-xs transition-all truncate flex items-center justify-between group ${currentParentId === l3.id ? 'text-purple-400 font-bold bg-purple-500/5' : 'text-gray-600 hover:text-gray-400'}`}>
                                                                        <span>• {lang === 'KO'
                                                                            ? (branchMode === 'ADAPTED' && l3.synthesized_title_kr ? l3.synthesized_title_kr : l3.unit_title_kr)
                                                                            : (branchMode === 'ADAPTED' && l3.synthesized_title_en ? l3.synthesized_title_en : (l3.unit_title_en || l3.unit_title_kr))
                                                                        }</span>
                                                                        {l3.is_synthesized && <Sparkles className="w-2.5 h-2.5 text-purple-500/60" />}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </main>
    );
}

function StoryCard({ ep, parentLastSync, isSynthesizing, isAnalyzing, onSynthesize, onDrillDown, onExpand, lang, t, branchMode, hasAdaptedChildren, project }: any) {
    const isL1 = ep.hierarchy_group === 'L1';
    const [isFlipped, setIsFlipped] = useState(isL1 ? branchMode === 'ADAPTED' : true);

    // [Hybrid Prologue Identification] Strict Metadata > Order Index > Title Keyword
    const isPrologue = ep.hierarchy_group === 'L2' && (
        ep.unit_type === 'PROLOGUE' ||
        ep.order_index === 0 ||
        (ep.unit_title_kr && ep.unit_title_kr.includes('프롤로그')) ||
        (ep.unit_title_en && ep.unit_title_en.toLowerCase().includes('prologue'))
    );

    useEffect(() => {
        if (isL1) {
            setIsFlipped(branchMode === 'ADAPTED');
        }
    }, [branchMode, isL1]);

    useEffect(() => {
        // [Improvement] Flip to Adapted view immediately after synthesis completes
        if (isL1 && ep.is_synthesized && !isSynthesizing) {
            setIsFlipped(true);
        }
    }, [ep.is_synthesized, isSynthesizing, isL1]);

    const renderHeaderButtons = (type: 'original' | 'creative') => (
        <div className="flex gap-2">
            {type === 'creative' && ep.source_metadata?.adaptation_reasoning && (
                <button onClick={() => onExpand('reasoning')} className="p-1.5 bg-yellow-500/10 rounded-lg" title="AI Reasoning"><MessageSquare className="w-4 h-4 text-yellow-500" /></button>
            )}
            <button onClick={() => onExpand(type)} className="p-1.5 hover:bg-white/10 rounded-lg"><Maximize2 className="w-4 h-4 text-purple-400" /></button>
            {isL1 && ep.is_synthesized && (
                <button onClick={() => setIsFlipped(type === 'original')} className="p-1.5 hover:bg-white/10 rounded-lg" title={type === 'original' ? (lang === 'KO' ? "각색본 보기" : "View Adapted") : (lang === 'KO' ? "원작 보기" : "View Original")}>
                    {type === 'original' ? <CheckCircle className="w-4 h-4 text-purple-400" /> : <History className="w-4 h-4 text-gray-400" />}
                </button>
            )}
        </div>
    );

    if (!isL1) {
        return (
            <div className="w-full h-[450px]">
                <div className="w-full h-full bg-[#1a1625] border border-purple-500/40 rounded-3xl p-8 flex flex-col shadow-2xl">
                    <div className="flex justify-between items-start mb-6">
                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">Creative Vision (L{ep.hierarchy_group})</span>
                        {renderHeaderButtons('creative')}
                    </div>
                    <h3 className="text-2xl font-bold mb-4 text-purple-300">{lang === 'KO' ? (ep.synthesized_title_kr || ep.unit_title_kr) : (ep.synthesized_title_en || ep.unit_title_en)}</h3>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-6 text-sm text-gray-200 leading-relaxed">
                        {lang === 'KO'
                            ? (ep.synthesized_body_kr || (isSynthesizing ? '창작 중...' : '생성된 내용이 없습니다.'))
                            : (ep.synthesized_body_en || ep.synthesized_body_kr || (isSynthesizing ? 'Creating narrative...' : 'No adapted content available.'))}
                    </div>
                    <div className="flex gap-3">
                        {isPrologue ? (
                            <button
                                onClick={() => onSynthesize()}
                                className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-purple-500/20"
                            >
                                <FileText className="w-4 h-4" />
                                {lang === 'KO' ? '소설 스튜디오로 보내기' : 'Send to Novel Studio'}
                            </button>
                        ) : ep.hierarchy_group === 'L2' ? (
                            <button
                                onClick={() => onDrillDown(true)}
                                className="flex-1 py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg bg-purple-600/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 group"
                            >
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                {lang === 'KO' ? '하위 구성 진입' : 'View Sub Narrative'}
                            </button>
                        ) : (
                            <button
                                onClick={onSynthesize}
                                className="flex-1 py-4 bg-purple-600 hover:bg-purple-500 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-purple-500/20"
                            >
                                <FileText className="w-4 h-4" />
                                {lang === 'KO' ? '소설 스튜디오로 보내기' : 'Send to Novel Studio'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="perspective-1000 w-full h-[450px]">
            <motion.div initial={false} animate={{ rotateY: isFlipped ? 180 : 0 }} transition={{ duration: 0.6, type: 'spring' }} className="relative w-full h-full preserve-3d">
                <div className="absolute inset-0 backface-hidden bg-white/5 border border-white/10 rounded-3xl p-8 flex flex-col">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex flex-col gap-1"><span className="text-[10px] font-bold text-purple-400/60 uppercase tracking-widest">Original (Level {ep.hierarchy_group})</span></div>
                        {renderHeaderButtons('original')}
                    </div>
                    <h3 className="text-2xl font-bold mb-4 leading-tight">
                        {lang === 'KO' ? ep.unit_title_kr : (ep.unit_title_en || (isL1 ? project?.source_identity_en : '') || ep.unit_title_kr)}
                    </h3>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-4"><p className="text-sm text-gray-400 leading-relaxed italic">"{lang === 'KO' ? ep.original_body_kr : (ep.original_body_en || ep.original_body_kr)}"</p></div>
                    <div className="mt-8 flex gap-2">
                        <div className="flex-1 flex gap-2">
                            <button onClick={onSynthesize} disabled={isSynthesizing || isAnalyzing || hasAdaptedChildren} className={`flex-1 py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${ep.is_synthesized ? (hasAdaptedChildren ? 'bg-white/5 text-gray-600 border border-white/5' : 'bg-white/10 text-gray-400 border border-white/10 hover:bg-white/20') : 'bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900/50 shadow-purple-900/20'}`}>
                                {isSynthesizing ? <Loader2 className="w-5 h-5 animate-spin" /> : (hasAdaptedChildren ? <CheckCircle className="w-5 h-5" /> : (ep.is_synthesized ? <Wand2 className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />))}
                                {hasAdaptedChildren ? (lang === 'KO' ? '각색 완료 (하위 구성 확인)' : 'Adaptation Complete') : (ep.is_synthesized ? (lang === 'KO' ? '다시 각색하기' : 'Re-Synthesize') : (lang === 'KO' ? '이 스토리 각색하기' : 'Synthesize story'))}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="absolute inset-0 backface-hidden bg-[#1a1625] border border-purple-500/40 rounded-3xl p-8 flex flex-col rotate-y-180 shadow-2xl">
                    <div className="flex justify-between items-start mb-6"><span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">Creative Vision</span>{renderHeaderButtons('creative')}</div>
                    <h3 className="text-2xl font-bold mb-4 text-purple-300">
                        {lang === 'KO' ? (ep.synthesized_title_kr || ep.unit_title_kr) : (ep.synthesized_title_en || (isL1 ? project?.source_identity_en : '') || ep.unit_title_en)}
                    </h3>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-6 text-sm text-gray-200 leading-relaxed">
                        {lang === 'KO'
                            ? (ep.synthesized_body_kr || (isSynthesizing ? '창작 중...' : '각색된 내용이 없습니다.'))
                            : (ep.synthesized_body_en || ep.synthesized_body_kr || (isSynthesizing ? 'Creating narrative...' : 'No adapted content available.'))}
                    </div>
                    <div className="flex gap-3">
                        {isPrologue ? (
                            <button
                                onClick={() => onSynthesize()}
                                className="flex-1 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-purple-500/20"
                            >
                                <FileText className="w-4 h-4" />
                                {lang === 'KO' ? '소설 스튜디오로 보내기' : 'Send to Novel Studio'}
                            </button>
                        ) : (
                            <button
                                onClick={() => onDrillDown(true)}
                                className="flex-1 py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg bg-purple-600/10 text-purple-400 border border-purple-500/30 hover:bg-purple-500/20 group"
                            >
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                {lang === 'KO' ? '하위 구성 진입' : 'View Sub Narrative'}
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

function DetailModal({ item, onClose, lang, project }: any) {
    const isL1 = item.hierarchy_group === 'L1';

    const getTitle = () => {
        if (item.type === 'original') return lang === 'KO' ? '원작 설정' : 'Original Source';
        if (item.type === 'reasoning') return lang === 'KO' ? 'AI 각색 의도' : 'AI Adaptation Reasoning';
        return lang === 'KO' ? '창의적 재해석' : 'Creative Vision';
    };

    const getContent = () => {
        if (item.type === 'original') return lang === 'KO' ? item.original_body_kr : (item.original_body_en || item.original_body_kr);
        if (item.type === 'reasoning') return item.source_metadata?.adaptation_reasoning || (lang === 'KO' ? '생성된 의도가 없습니다.' : 'No reasoning available.');
        return lang === 'KO' ? item.synthesized_body_kr : (item.synthesized_body_en || item.synthesized_body_kr);
    };

    const getUnitTitle = () => {
        if (item.type === 'creative') {
            return lang === 'KO' ? (item.synthesized_title_kr || item.unit_title_kr) : (item.synthesized_title_en || (isL1 ? project?.source_identity_en : '') || item.unit_title_en || item.unit_title_kr);
        }
        return lang === 'KO' ? item.unit_title_kr : (item.unit_title_en || (isL1 ? project?.source_identity_en : '') || item.unit_title_kr);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="relative w-full max-w-2xl max-h-[85vh] bg-[#1a1a1f] border border-white/10 rounded-[40px] shadow-2xl overflow-hidden flex flex-col">
                <div className="p-10 pb-4">
                    <div className="flex justify-between items-start mb-6">
                        <div className="space-y-2">
                            <span className="text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
                                {item.type === 'reasoning' ? <MessageSquare className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                                {getTitle()}
                            </span>
                            <h2 className="text-3xl font-extrabold">{getUnitTitle()}</h2>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X className="w-6 h-6 text-gray-400" /></button>
                    </div>
                </div>
                <div className="px-10 pb-12 overflow-y-auto custom-scrollbar flex-1">
                    {item.type === 'reasoning' && (
                        <div className="mb-6 p-4 bg-purple-500/5 border border-purple-500/20 rounded-2xl">
                            <p className="text-sm text-purple-300 flex items-center gap-2">
                                <Info className="w-4 h-4" />
                                {lang === 'KO' ? '적용된 각색 레벨' : 'Applied Adaptation Level'}: {item.source_metadata?.applied_adaptation_level || 'N/A'}
                            </p>
                        </div>
                    )}
                    <p className={`text-lg leading-relaxed whitespace-pre-wrap ${item.type === 'reasoning' ? 'text-yellow-100/80 font-medium' : 'text-gray-300'}`}>
                        {getContent()}
                    </p>
                </div>
            </motion.div>
        </div>
    );
}

export default function StoryBible() {
    return (
        <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-[#0f0f12]"><Loader2 className="animate-spin text-purple-500" /></div>}>
            <StoryBibleContent />
        </Suspense>
    );
}
