'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useProject } from '../context/ProjectContext';
import { useLanguage } from '../context/LanguageContext';
import { motion } from 'framer-motion';
import { Layout, GitBranch, Target, BookOpen, User, Users, Globe, Zap, Sparkles, Clock, Bookmark, Palette, FileText, ChevronRight, X, Info, Loader2, ArrowRight, RefreshCw } from 'lucide-react';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function BlueprintPage() {
    const { projectId } = useProject();
    const { lang } = useLanguage();
    const [blueprint, setBlueprint] = useState<any>(null);
    const [characters, setCharacters] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'structure' | 'foreshadowing' | 'characters' | 'world' | 'conflict' | 'theme' | 'glossary' | 'timeline'>('structure');
    const [viewType, setViewType] = useState<'ORIGINAL' | 'ADAPTED'>('ORIGINAL');

    const [unitNamingRules, setUnitNamingRules] = useState<any>(null);
    const [projectConfig, setProjectConfig] = useState<any>(null);
    const [l2Items, setL2Items] = useState<any[]>([]);
    const [l3Items, setL3Items] = useState<any[]>([]);

    useEffect(() => {
        if (projectId) fetchBlueprint();
    }, [projectId, viewType]);

    const fetchBlueprint = async () => {
        setLoading(true);

        // 0. Fetch Project Config & SOP (Parallel)
        const [projReq, sopReq] = await Promise.all([
            supabase.from('project_master_config').select('*').eq('project_id', projectId).single(),
            supabase.from('agent_sop_registry').select('instruction').eq('sop_type', 'UNIT_NAMING_CONVENTION').maybeSingle()
        ]);

        if (projReq.data) setProjectConfig(projReq.data);
        if (sopReq.data && sopReq.data.instruction) {
            try {
                setUnitNamingRules(JSON.parse(sopReq.data.instruction));
            } catch (e) {
                console.error("Failed to parse SOP instruction", e);
            }
        }

        // 1. Fetch Blueprint JSON
        let query = supabase
            .from('story_blueprints')
            .select('*')
            .eq('project_id', projectId)
            .eq('is_active', true);

        if (viewType === 'ADAPTED') {
            query = query.eq('blueprint_type', 'ADAPTED');
        } else {
            query = query.or(`blueprint_type.eq.ORIGINAL,blueprint_type.is.null`);
        }

        const { data: bpData, error: bpError } = await query.order('updated_at', { ascending: false }).limit(1).maybeSingle();
        if (bpError) console.error("Blueprint fetch error:", bpError);
        setBlueprint(bpData);

        // 2. Fetch Characters (Wait for previous query to avoid race conditions if needed, but here parallel is fine usually. keeping sequential for safety)
        const { data: charData, error: charError } = await supabase
            .from('characters')
            .select('*')
            .eq('project_id', projectId);

        if (charError) console.error("Character fetch error:", charError);
        setCharacters(charData || []);

        // 3. Fetch L2/L3 Items (Story Summary) for Dynamic Unit Linking
        const { data: summaryData } = await supabase
            .from('story_summary')
            .select('*')
            .eq('project_id', projectId)
            .in('hierarchy_group', ['L2', 'L3'])
            .order('order_index', { ascending: true });

        const l2 = summaryData?.filter(item => item.hierarchy_group === 'L2') || [];
        const l3 = summaryData?.filter(item => item.hierarchy_group === 'L3') || [];

        setL2Items(l2);
        setL3Items(l3);

        setLoading(false);
    };

    const getTabStyle = (tab: string) => `
        flex items-center gap-2 px-6 py-3 rounded-full transition-all font-bold text-sm
        ${activeTab === tab
            ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}
    `;

    // Helper to get localized string with fallback
    const getLocalized = (obj: any, keyBase: string) => {
        if (!obj) return "";
        if (lang === 'KO') {
            return obj[`${keyBase}_kr`] || obj[keyBase] || "";
        } else {
            return obj[`${keyBase}_en`] || obj[keyBase] || "";
        }
    };

    // Helper: Resolve Unit Name (e.g. Vol.1 (Ch.1-5) -> 제1권 (1장~5장)) based on SOP
    const getUnitLabel = (rawLabel: string) => {
        if (!rawLabel) return "";

        // Default type
        const scale = projectConfig?.source_scale || 'Saga';
        const sopMap = unitNamingRules ? unitNamingRules[scale] : null;
        if (!sopMap) return rawLabel;

        // Parse: "Vol.1" or "Vol.1 (Ch.1-5)"
        // Regex to capture: Volume Number, and optional Chapter Range
        const volMatch = rawLabel.match(/Vol\.(\d+)/i);
        const chRangeMatch = rawLabel.match(/\(Ch\.([\d\-~]+)\)/i);

        const volNum = volMatch ? volMatch[1] : "";
        const chRange = chRangeMatch ? chRangeMatch[1] : "";

        // L2 Format (Volume/Part/Arc)
        const l2Format = lang === 'KO' ? sopMap.l2?.kr : sopMap.l2?.en;

        let result = rawLabel;

        // 1. Transform Volume Part
        if (volNum && l2Format) {
            if (lang === 'KO') {
                // "제1권"
                result = `제${volNum}${l2Format}`;
            } else {
                // "Vol. 1"
                result = `${l2Format} ${volNum}`;
            }
        }

        // 2. Transform Chapter Range Part if exists
        if (chRange) {
            const l3Format = lang === 'KO' ? sopMap.l3?.kr : sopMap.l3?.en;
            // chRange could be "1-5" or "1~5"
            // We want " (1장~5장)" or " (Ch. 1-5)"

            if (lang === 'KO') {
                // If range is "1-5", split and add suffix
                const parts = chRange.split(/[-~]/);
                if (parts.length === 2 && parts[0] && parts[1]) {
                    result += ` (${parts[0]}${l3Format}~${parts[1]}${l3Format})`;
                } else {
                    result += ` (${chRange}${l3Format})`;
                }
            } else {
                // English: " (Ch. 1-5)"
                result += ` (${l3Format} ${chRange})`;
            }
        }

        // Determine if we can link this to an active L2 item
        // If we found a volNum, look for L2 item with that order_index
        const linkedL2 = l2Items.find(item => item.order_index === parseInt(volNum));
        if (linkedL2) {
            const statusEmoji = linkedL2.is_synthesized ? "🟢" : "⚪";
            // [Improved] Use the actual L2 title if available
            const realTitle = lang === 'KO' ? (linkedL2.unit_title_kr || linkedL2.title) : (linkedL2.unit_title_en || linkedL2.title);

            if (realTitle) {
                // Format: "제1권: 타이틀 🟢"
                // If the generic result is already "제1권", apppend title
                return `${result}: ${realTitle} ${statusEmoji}`;
            }

            return `${result} ${statusEmoji}`;
        }

        return result;
    };

    // Helper: Ensure 4 Acts (Ki-Seung-Jeon-Gyeol) structure
    const getEnrichedStructure = () => {
        const raw = blueprint?.structural_arc || [];
        const requiredActs = [
            { no: 1, title_kr: "기 - 발단", title_en: "Setup" },
            { no: 2, title_kr: "승 - 전개", title_en: "Confrontation" },
            { no: 3, title_kr: "전 - 위기/절정", title_en: "Resolution" },
            { no: 4, title_kr: "결 - 결말", title_en: "Conclusion" }
        ];

        // We now check PER ACT. If an act has no assignments, try to auto-map L2 items sequentially.
        return requiredActs.map((req) => {
            const existing = raw.find((r: any) => r.act_no === req.no);
            let assigned = existing ? (existing.assigned_volumes || []) : [];

            // Fallback: If no assigned volumes, FORCE assign Vol.N
            // This ensures "Vol.1" appears even if L2 item lookup fails (user will see generic label)
            if (assigned.length === 0) {
                // Try to find chapter range
                const l2 = l2Items.find(item => item.order_index === req.no);
                let label = `Vol.${req.no}`;

                if (l2) {
                    // Find L3 children
                    const l3Children = l3Items.filter(child => child.parent_id === l2.id).sort((a, b) => a.order_index - b.order_index);
                    if (l3Children.length > 0) {
                        const startCh = l3Children[0].order_index;
                        const endCh = l3Children[l3Children.length - 1].order_index;
                        label += ` (Ch.${startCh}-${endCh})`;
                    }
                }
                assigned = [label];
            }

            // Title Fallback: If existing is missing (placeholder), try to get title from L2 item
            // This prevents "결 - 결말" from looking generic if we actually have Volume 4 title.
            let displayTitleKr = existing ? getLocalized(existing, 'act_title') : req.title_kr;
            let displayTitleEn = existing ? getLocalized(existing, 'act_title') : req.title_en;

            if (!existing) {
                const l2 = l2Items.find(item => item.order_index === req.no);
                if (l2) {
                    const l2TitleKr = l2.unit_title_kr || l2.title;
                    const l2TitleEn = l2.unit_title_en || l2.title;
                    if (lang === 'KO' && l2TitleKr) displayTitleKr = `${req.title_kr}: ${l2TitleKr}`;
                    if (lang !== 'KO' && l2TitleEn) displayTitleEn = `${req.title_en}: ${l2TitleEn}`;
                }
            }

            // Return existing but with potentially updated assigned_volumes and goal fallback
            return {
                act_no: req.no,
                act_title_kr: displayTitleKr,
                act_title_en: displayTitleEn,
                goal_kr: existing?.goal_kr || "내용이 생성되지 않았습니다.",
                goal_en: existing?.goal_en || "Content not generated.",
                assigned_volumes: assigned
            };
        });
    };

    // Helper to find DB Character and get correct Name
    // Helper to find DB Character and get correct Name
    // [Technical Debt Clearance] V3.2 Schema Enforcement
    // Removed legacy 'name', 'name_kr' fallbacks.
    const getCharacterName = (charObj: any) => {
        if (!charObj) return "";

        // 1. Direct JSON Check
        if (viewType === 'ADAPTED') {
            if (lang === 'KO') return charObj.reinterpreted_name_kr || charObj.name_kr || "알 수 없음";
            return charObj.reinterpreted_name_en || charObj.name_en || "Unknown";
        } else {
            // ORIGINAL sources (from Blueprint JSON)
            if (lang === 'KO') return charObj.name_kr || charObj.original_name_kr || "알 수 없음";
            return charObj.name_en || charObj.original_name_en || "Unknown";
        }

        // Note: Previous "DB Lookup" fallback logic was removed as it relied on legacy names matching.
        // If names are missing in JSON, strict schema requires them to be filled or re-generated.
    };

    if (!projectId) return (
        <div className="min-h-screen bg-[#0f0f12] text-white flex flex-col items-center justify-center p-10">
            <h2 className="text-xl font-bold text-gray-500 mb-4">
                {lang === 'KO' ? '프로젝트를 먼저 선택해주세요.' : 'Please select a project first.'}
            </h2>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0f0f12] text-white p-8 lg:p-12">
            <header className="mb-12">
                <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8">
                    <div className="flex-1">
                        <h1 className="text-4xl font-bold mb-3 flex items-center gap-4">
                            <Layout className="w-10 h-10 text-purple-400" />
                            {lang === 'KO' ? '마스터 서사 설계도' : 'Master Narrative Blueprint'}
                        </h1>
                        <p className="text-gray-400 text-lg ml-14">
                            {getLocalized(blueprint?.core_premise, 'logline') || (lang === 'KO' ? "설계도 데이터가 없습니다. 분석(Analyze) 또는 각색(Synthesize)을 수행하세요." : "No blueprint found. Run analysis or synthesis first.")}
                        </p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 self-start md:self-center">
                        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 shrink-0">
                            <button
                                onClick={() => setViewType('ORIGINAL')}
                                className={`px-6 py-3 rounded-lg text-sm font-bold transition-all ${viewType === 'ORIGINAL' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                            >
                                {lang === 'KO' ? '원작 설계도 (Original)' : 'Original Binding'}
                            </button>
                            <button
                                onClick={() => setViewType('ADAPTED')}
                                className={`px-6 py-3 rounded-lg text-sm font-bold transition-all ${viewType === 'ADAPTED' ? 'bg-pink-600 text-white shadow-lg shadow-pink-900/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                            >
                                {lang === 'KO' ? '각색 설계도 (Adapted)' : 'Adapted Blueprint'}
                            </button>
                        </div>

                        {/* [Re-analyze Button] Upgraded to trigger full AI re-analysis for L1/Characters */}
                        <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 shrink-0">
                            <button
                                onClick={async () => {
                                    if (window.confirm(lang === 'KO' ? "캐릭터 정보를 AI로 재구축하시겠습니까? (기존 데이터 덮어씀, 약 20초 소요)" : "Re-analyze Characters? (Overwrites data)")) {
                                        try {
                                            // Call analyze-story to regenerate blueprint with new schema
                                            const res = await fetch('/api/analyze-story', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    projectId,
                                                    level: 'L1',
                                                    isReAnalyze: true
                                                })
                                            });

                                            if (res.ok) {
                                                const data = await res.json();
                                                console.log(data);
                                                // After AI analysis, trigger the sync logic one more time just in case (optional, but safe)
                                                let msg = "재구축 완료!";
                                                if (data.syncReport) {
                                                    const s = data.syncReport;
                                                    msg += `\n- Source: ${s.source}\n- Total: ${s.totalFound}\n- Success: ${s.success}\n- Failed: ${s.failed}`;
                                                    if (s.errors && s.errors.length > 0) msg += `\nErrors: ${JSON.stringify(s.errors)}`;
                                                } else if (data.debugInfo) {
                                                    const info = data.debugInfo;
                                                    msg += `\n- Blueprint Updated: ${info.blueprintUpdated !== false}`;
                                                }
                                                alert(msg);
                                                alert(msg);
                                                window.location.reload();
                                            } else {
                                                const errData = await res.json();
                                                alert(`재구축 실패: ${errData.error}`);
                                            }
                                        } catch (e) {
                                            alert("에러 발생: " + e);
                                        }
                                    }
                                }}
                                className="px-4 py-3 text-red-400 hover:text-red-300 transition-colors"
                                title="AI Re-analyze Characters"
                            >
                                <RefreshCw size={20} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex gap-4 border-b border-gray-800 pb-6 overflow-x-auto no-scrollbar">
                    <button onClick={() => setActiveTab('structure')} className={getTabStyle('structure')}>
                        <BookOpen size={18} /> {lang === 'KO' ? '기승전결 구조' : 'Structural Arc'}
                    </button>
                    <button onClick={() => setActiveTab('world')} className={getTabStyle('world')}>
                        <Globe size={18} /> {lang === 'KO' ? '월드 바이블' : 'World Bible'}
                    </button>
                    <button onClick={() => setActiveTab('glossary')} className={getTabStyle('glossary')}>
                        <Bookmark size={18} /> {lang === 'KO' ? '주요 용어집' : 'Glossary'}
                    </button>
                    <button onClick={() => setActiveTab('conflict')} className={getTabStyle('conflict')}>
                        <Zap size={18} /> {lang === 'KO' ? '갈등 레이어' : 'Conflict Layers'}
                    </button>
                    <button onClick={() => setActiveTab('theme')} className={getTabStyle('theme')}>
                        <Sparkles size={18} /> {lang === 'KO' ? '테마 & 스타일' : 'Theme & Style'}
                    </button>
                    <button onClick={() => setActiveTab('timeline')} className={getTabStyle('timeline')}>
                        <Clock size={18} /> {lang === 'KO' ? '타임라인' : 'Timeline'}
                    </button>
                    <button onClick={() => setActiveTab('foreshadowing')} className={getTabStyle('foreshadowing')}>
                        <Target size={18} /> {lang === 'KO' ? '복선 매트릭스' : 'Foreshadowing Matrix'}
                    </button>
                    <button onClick={() => setActiveTab('characters')} className={getTabStyle('characters')}>
                        <User size={18} /> {lang === 'KO' ? '인물 성장 곡선' : 'Character Arcs'}
                    </button>
                </div>
            </header>

            {loading ? (
                <div className="text-center py-40 text-gray-500 animate-pulse flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
                    <p>{lang === 'KO' ? '데이터를 불러오는 중입니다...' : 'Loading data...'}</p>
                </div>
            ) : !blueprint && characters.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 bg-white/5 rounded-3xl border border-white/10 border-dashed m-4">
                    <Layout className="w-16 h-16 text-gray-700 mb-6" />
                    <p className="text-xl text-gray-400 mb-2 font-bold">
                        {lang === 'KO' ? '데이터가 없습니다.' : 'No data found.'}
                    </p>
                </div>
            ) : (
                <main className="space-y-12 animate-in fade-in duration-500 pb-20">

                    {/* 1. Structural Arc View */}
                    {activeTab === 'structure' && blueprint && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 auto-rows-fr">
                            {getEnrichedStructure().map((act: any, idx: number) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className="bg-white/5 p-8 rounded-[2rem] border border-white/10 hover:border-purple-500/30 transition-all hover:bg-white/10 flex flex-col group"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="text-xs font-bold text-purple-400 tracking-widest uppercase flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></span>
                                            ACT {act.act_no}
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-bold mb-4 text-white group-hover:text-purple-300 transition-colors">
                                        {getLocalized(act, 'act_title')}
                                    </h3>
                                    <div className="flex-grow">
                                        <p className="text-gray-400 text-sm leading-relaxed line-clamp-4">
                                            {getLocalized(act, 'goal')}
                                        </p>
                                    </div>

                                    {/* Assigned Volumes: Scrollable if too many */}
                                    <div className="mt-6 pt-6 border-t border-white/5">
                                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">Assigned Units</div>
                                        <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto custom-scrollbar pr-2">
                                            {act.assigned_volumes?.map((vol: string) => (
                                                <span key={vol} className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] text-gray-300 font-mono border border-white/5 transition-colors whitespace-nowrap">
                                                    {getUnitLabel(vol)}
                                                </span>
                                            ))}
                                            {(!act.assigned_volumes || act.assigned_volumes.length === 0) && (
                                                <span className="text-[10px] text-gray-600 italic">No units assigned</span>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {/* 2. World Bible View */}
                    {activeTab === 'world' && blueprint && (
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {[
                                    { title_kr: "시대적 배경", title_en: "Era Setting", icon: <Layout />, key: "era" },
                                    { title_kr: "공간적 배경", title_en: "Spatial Setting", icon: <Globe />, key: "location" },
                                    { title_kr: "사회 시스템", title_en: "Social System", icon: <Users />, key: "system" }
                                ].map((item, i) => (
                                    <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                                        className="bg-white/5 border border-white/10 p-8 rounded-3xl hover:border-purple-500/50 transition-all group">
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className="p-3 bg-purple-500/20 text-purple-400 rounded-2xl group-hover:scale-110 transition-transform">
                                                {React.cloneElement(item.icon as React.ReactElement, { size: 24 } as any)}
                                            </div>
                                            <h3 className="text-xl font-bold">{lang === 'KO' ? item.title_kr : item.title_en}</h3>
                                        </div>
                                        <p className="text-gray-400 leading-relaxed text-lg">
                                            {getLocalized(blueprint.world_bible, item.key) || (lang === 'KO' ? "정보 없음" : "No Information available")}
                                        </p>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Technical Rules Section */}
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white/5 border border-white/10 p-10 rounded-[2.5rem] hover:border-purple-500/30 transition-all">
                                <h3 className="text-2xl font-bold text-purple-400 mb-6 flex items-center gap-3">
                                    <Zap size={24} /> {lang === 'KO' ? "기술 및 능력 시스템 메커니즘" : "Tech & Power System Mechanisms"}
                                </h3>
                                <div className="text-gray-300 leading-relaxed whitespace-pre-wrap text-lg p-6 bg-black/20 rounded-2xl border border-white/5">
                                    {getLocalized(blueprint.world_bible, 'rules') || (lang === 'KO' ? "시스템 규칙 정보가 없습니다." : "No system rules information found.")}
                                </div>
                            </motion.div>
                        </div>
                    )}

                    {/* 3. Glossary View */}
                    {activeTab === 'glossary' && blueprint && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {(blueprint.glossary || []).map((term: any, i: number) => (
                                <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                                    className="bg-white/5 border border-white/10 p-6 rounded-2xl hover:bg-white/10 transition-all">
                                    <h4 className="text-purple-400 font-black text-lg mb-2 uppercase tracking-tight">
                                        {getLocalized(term, 'term')}
                                    </h4>
                                    <p className="text-gray-400 text-sm leading-relaxed">
                                        {getLocalized(term, 'def')}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {/* 3. Conflict Layers View */}
                    {activeTab === 'conflict' && blueprint && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {[
                                { id: 'external', title_kr: "외적 갈등", title_en: "External Conflict", subtitle_kr: "사건 및 물리적 대립", subtitle_en: "Events & Physical Conflict", color: "purple" },
                                { id: 'internal', title_kr: "내적 갈등", title_en: "Internal Conflict", subtitle_kr: "심리 및 내면의 결핍", subtitle_en: "Psychology & Emotional Void", color: "pink" }
                            ].map((item, i) => (
                                <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                                    className={`bg-gradient-to-br ${item.color === 'purple' ? 'from-purple-900/20 to-transparent border-purple-500/20' : 'from-pink-900/20 to-transparent border-pink-500/20'} border p-10 rounded-[2.5rem] relative overflow-hidden group`}>
                                    <div className={`absolute -right-10 -top-10 w-40 h-40 ${item.color === 'purple' ? 'bg-purple-600/10' : 'bg-pink-600/10'} rounded-full blur-3xl group-hover:scale-150 transition-all`} />
                                    <div className="relative z-10">
                                        <span className={`text-xs font-black uppercase tracking-[0.2em] ${item.color === 'purple' ? 'text-purple-400' : 'text-pink-400'} mb-2 block`}>
                                            {lang === 'KO' ? item.subtitle_kr : item.subtitle_en}
                                        </span>
                                        <h3 className="text-3xl font-black mb-6">{lang === 'KO' ? item.title_kr : item.title_en}</h3>
                                        <div className="p-6 bg-black/40 rounded-2xl border border-white/5 text-gray-300 leading-relaxed shadow-inner">
                                            {getLocalized(blueprint.conflict_layers, item.id) || (lang === 'KO' ? "정보 없음" : "No Information available")}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {/* 5. Theme & Style View */}
                    {activeTab === 'theme' && blueprint && (
                        <div className="space-y-12">
                            <div className="bg-gradient-to-r from-purple-600/10 via-pink-600/10 to-transparent border border-white/10 rounded-[3rem] p-12 relative overflow-hidden">
                                <div className="max-w-4xl relative z-10">
                                    <div className="flex items-center gap-3 mb-8">
                                        <div className="w-12 h-[2px] bg-purple-500"></div>
                                        <span className="text-purple-400 font-black tracking-widest text-sm uppercase">Conceptual Core</span>
                                    </div>
                                    <h2 className="text-5xl font-black mb-12 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500 leading-tight">
                                        {getLocalized(blueprint.theme_message, 'core_theme') || (lang === 'KO' ? "주제 정보 없음" : "No Theme Found")}
                                    </h2>
                                    <div>
                                        <h4 className="text-gray-500 font-bold mb-4 uppercase text-xs tracking-widest">Main Message</h4>
                                        <p className="text-2xl text-gray-200 leading-relaxed font-medium italic">
                                            "{getLocalized(blueprint.theme_message, 'main_message') || (lang === 'KO' ? "메시지 없음" : "No Message")}"
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Style Guide Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {[
                                    { title_kr: "전체적 톤", title_en: "Overall Tone", key: "tone", icon: <Sparkles />, source: "tone_guide" },
                                    { title_kr: "문체 가이드", title_en: "Prose Style", key: "prose_style", icon: <BookOpen />, source: "style_guide" },
                                    { title_kr: "비주얼 테마", title_en: "Visual Motifs", key: "visual_motifs", icon: <Palette />, source: "style_guide" }
                                ].map((s, idx) => (
                                    <div key={idx} className="bg-black/40 border border-white/5 p-8 rounded-3xl">
                                        <div className="flex items-center gap-3 text-purple-400 mb-4">
                                            {s.icon}
                                            <span className="font-bold text-sm uppercase tracking-wider">{lang === 'KO' ? s.title_kr : s.title_en}</span>
                                        </div>
                                        <p className="text-gray-400 leading-relaxed font-medium">
                                            {getLocalized(blueprint[s.source], s.key) || (lang === 'KO' ? "가이드 정보 없음" : "No guide info")}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 6. Timeline View */}
                    {activeTab === 'timeline' && blueprint && (
                        <div className="relative pl-12 border-l-2 border-purple-500/20 space-y-12">
                            {(blueprint.timeline || []).map((ev: any, i: number) => (
                                <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                                    className="relative">
                                    <div className="absolute -left-[54px] top-0 w-4 h-4 rounded-full bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.5)] border-4 border-[#0f0f12]" />
                                    <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 hover:border-purple-500/30 transition-all">
                                        <div className="text-purple-400 font-black mb-2 flex items-center gap-2">
                                            <Clock size={16} /> {getLocalized(ev, 'time')}
                                        </div>
                                        <p className="text-xl text-white font-bold leading-snug">
                                            {getLocalized(ev, 'event')}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {/* 5. Foreshadowing Matrix View */}
                    {activeTab === 'foreshadowing' && blueprint && (
                        <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden shadow-2xl shadow-black/50">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-black/20 text-gray-400 text-sm border-b border-white/5">
                                    <tr>
                                        <th className="p-6 w-1/4 font-bold uppercase tracking-wider pl-8">{lang === 'KO' ? '단서 (Clue)' : 'Clue'}</th>
                                        <th className="p-6 w-1/6 text-center font-bold uppercase tracking-wider">{lang === 'KO' ? '파종 (Seed)' : 'Seed'}</th>
                                        <th className="p-6 w-1/6 text-center font-bold uppercase tracking-wider">{lang === 'KO' ? '회수 (Reveal)' : 'Reveal'}</th>
                                        <th className="p-6 font-bold uppercase tracking-wider pr-8">{lang === 'KO' ? '의미 & 효과' : 'Meaning & Payoff'}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {blueprint.foreshadowing_matrix?.map((item: any, idx: number) => (
                                        <tr key={idx} className="hover:bg-white/5 transition-colors group">
                                            <td className="p-6 font-bold text-purple-300 group-hover:text-purple-200 transition-colors pl-8">
                                                {getLocalized(item, 'clue')}
                                            </td>
                                            <td className="p-6 text-center">
                                                <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-bold ring-1 ring-emerald-500/20">
                                                    {getUnitLabel(item.seed_at)}
                                                </span>
                                            </td>
                                            <td className="p-6 text-center">
                                                <span className="px-3 py-1.5 bg-rose-500/10 text-rose-400 rounded-lg text-xs font-bold ring-1 ring-rose-500/20">
                                                    {getUnitLabel(item.reveal_at)}
                                                </span>
                                            </td>
                                            <td className="p-6 text-gray-400 text-sm leading-relaxed pr-8">
                                                {getLocalized(item, 'meaning')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* 3. Character Arcs & Profiles View */}
                    {activeTab === 'characters' && (
                        <div className="space-y-12">
                            {/* Arc Section (From Blueprint JSON + DB Name Lookup) */}
                            {blueprint && blueprint.character_arcs && (
                                <div className="grid grid-cols-1 gap-6">
                                    {blueprint.character_arcs.map((char: any, idx: number) => (
                                        <motion.div
                                            key={idx}
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className="bg-white/5 p-8 rounded-3xl border border-white/10 flex flex-col md:flex-row items-center justify-between group hover:border-purple-500/20 transition-all gap-8"
                                        >
                                            <div className="w-full md:w-1/4">
                                                <h3 className="text-2xl font-bold text-white group-hover:text-purple-300 transition-colors">
                                                    {getCharacterName(char)}
                                                </h3>
                                                <div className="mt-3 flex items-center gap-2">
                                                    <div className="h-8 w-1 bg-purple-500 rounded-full"></div>
                                                    <div>
                                                        <div className="text-[10px] uppercase font-bold text-gray-500">{lang === 'KO' ? '전환점' : 'Turning Point'}</div>
                                                        <div className="text-sm text-purple-400 font-bold">
                                                            {getLocalized(char, 'turning_point')}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex-1 w-full flex items-center justify-between relative px-2 md:px-12 py-4 md:py-0">
                                                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-gray-700 -z-0 hidden md:block"></div>
                                                <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-gradient-to-r from-gray-700 via-purple-500 to-emerald-500 opacity-30 -z-0 hidden md:block"></div>

                                                <div className="relative z-10 bg-[#0f0f12] px-6 py-4 border border-gray-700 rounded-xl text-center min-w-[120px] shadow-lg w-full md:w-auto">
                                                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-1 tracking-wider">{lang === 'KO' ? '시작' : 'Start'}</div>
                                                    <div className="font-bold text-gray-300">
                                                        {getLocalized(char, 'start_state')}
                                                    </div>
                                                </div>

                                                <div className="relative z-10 bg-[#0f0f12] p-3 rounded-full border border-purple-500/50 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.3)] mx-4 shrink-0">
                                                    <GitBranch size={24} />
                                                </div>

                                                <div className="relative z-10 bg-[#0f0f12] px-6 py-4 border border-emerald-500/30 rounded-xl text-center min-w-[120px] shadow-lg shadow-emerald-900/10 w-full md:w-auto">
                                                    <div className="text-[10px] text-emerald-500/70 uppercase font-bold mb-1 tracking-wider">{lang === 'KO' ? '종료' : 'End'}</div>
                                                    <div className="font-bold text-white text-lg">
                                                        {getLocalized(char, 'end_state')}
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}

                            {/* Character Details Section (From DB Table) */}
                            <div className="bg-[#0f0f12] border-t border-gray-800 pt-8 mt-8">
                                <h3 className="text-2xl font-bold mb-8 text-white flex items-center gap-3">
                                    <Users className="text-purple-400" />
                                    {lang === 'KO' ? `등장인물 상세 프로필 (${viewType === 'ORIGINAL' ? '원작' : '각색'})` : `Character Profiles (${viewType})`}
                                </h3>

                                {((viewType === 'ORIGINAL' && (!blueprint?.character_arcs || blueprint.character_arcs.length === 0)) ||
                                    (viewType === 'ADAPTED' && characters.length === 0)) ? (
                                    <p className="text-gray-500">등록된 캐릭터 정보가 없습니다.</p>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {viewType === 'ORIGINAL' ? (
                                            // ORIGINAL SOURCE: Show from Blueprint JSON
                                            (blueprint?.character_arcs || []).map((c: any, idx: number) => {
                                                const name = lang === 'KO' ? (c.original_name_kr || c.name_kr) : (c.original_name_en || c.name_en);
                                                const role = lang === 'KO' ? (c.original_role_kr || c.role_kr) : (c.original_role_en || c.role_en);
                                                const personality = lang === 'KO' ? (c.original_personality_kr || c.personality_kr) : (c.original_personality_en || c.personality_en);
                                                const tier = lang === 'KO' ? (c.original_tier_kr || c.tier_kr || c.tier) : (c.original_tier_en || c.tier_en || c.tier);

                                                return (
                                                    <div key={idx} className="bg-white/5 p-6 rounded-2xl border border-white/10 hover:border-purple-500/30 transition-all">
                                                        <div className="flex justify-between items-start mb-3">
                                                            <h4 className="text-xl font-bold text-white">{name || `Character ${idx + 1}`}</h4>
                                                            {tier && (
                                                                <span className={`text-[10px] font-bold px-2 py-1 rounded border ${tier === '주연' || tier === 'MAIN' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                                                                    tier === '조연' || tier === 'SUPPORTING' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                                                                        'bg-gray-500/20 text-gray-300 border-gray-500/30'
                                                                    }`}>
                                                                    {tier}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-purple-400 font-bold mb-4 flex items-center gap-2">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 block"></span>
                                                            {role || 'Role Unknown'}
                                                        </p>
                                                        <div className="bg-black/20 p-4 rounded-xl text-sm text-gray-400 leading-relaxed min-h-[80px]">
                                                            {personality || 'No personality description available.'}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            // ADAPTED SOURCE: Show from Characters DB Table
                                            characters
                                                .filter(c => !!(c.reinterpreted_name_kr || c.reinterpreted_name_en))
                                                .map((c, idx) => {
                                                    const name = lang === 'KO' ? (c.reinterpreted_name_kr || c.reinterpreted_name_en) : (c.reinterpreted_name_en || c.reinterpreted_name_kr);
                                                    const role = lang === 'KO' ? c.reinterpreted_role_kr : c.reinterpreted_role_en;
                                                    const personality = lang === 'KO' ? c.reinterpreted_personality_kr : c.reinterpreted_personality_en;
                                                    const tier = lang === 'KO' ? c.reinterpreted_tier_kr : c.reinterpreted_tier_en;
                                                    const trauma = lang === 'KO' ? c.trauma_matrix_kr : c.trauma_matrix_en;

                                                    return (
                                                        <div key={idx} className="bg-white/5 p-6 rounded-2xl border border-white/10 hover:border-pink-500/30 transition-all">
                                                            <div className="flex justify-between items-start mb-3">
                                                                <h4 className="text-xl font-bold text-white">{name}</h4>
                                                                {tier && (
                                                                    <span className={`text-[10px] font-bold px-2 py-1 rounded border ${tier === '주연' || tier === 'MAIN' ? 'bg-pink-500/20 text-pink-300 border-pink-500/30' :
                                                                        tier === '조연' || tier === 'SUPPORTING' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                                                                            'bg-gray-500/20 text-gray-300 border-gray-500/30'
                                                                        }`}>
                                                                        {tier}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-sm text-pink-400 font-bold mb-4 flex items-center gap-2">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-pink-500 block"></span>
                                                                {role || 'Role Unknown'}
                                                            </p>

                                                            <div className="bg-black/20 p-4 rounded-xl text-sm text-gray-400 leading-relaxed mb-4 min-h-[80px]">
                                                                {personality || 'No personality description available.'}
                                                            </div>

                                                            {/* Trauma Matrix Info */}
                                                            {trauma && (typeof trauma === 'object') && (
                                                                <div className="bg-pink-500/5 p-4 rounded-xl border border-pink-500/10 space-y-2">
                                                                    <div className="text-pink-400 uppercase font-black text-[10px] tracking-widest mb-1 flex items-center gap-2">
                                                                        <Zap size={10} />
                                                                        Trauma Matrix
                                                                    </div>
                                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                                        {trauma.type && (
                                                                            <span className="px-2 py-0.5 bg-pink-500/20 text-pink-300 rounded text-[9px] font-bold">
                                                                                {trauma.type}
                                                                            </span>
                                                                        )}
                                                                        {trauma.depth && (
                                                                            <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-[9px] font-bold">
                                                                                Intensity: {trauma.depth}/10
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                }))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </main>
            )}

        </div>
    );
}
