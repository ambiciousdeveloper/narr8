'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Package, Plus, RefreshCw, Wand2, Image as ImageIcon, Box, Search, Trash2, Sparkles } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PropBoard() {
    const [props, setProps] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState<string | null>(null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [selectedBoardItems, setSelectedBoardItems] = useState<string[]>([]);
    const [batchStatus, setBatchStatus] = useState<{ current: number, total: number } | null>(null);

    const { t } = useLanguage(); // Note: t.sidebar.items.props might not exist yet, fallback to "Props"
    const { projectId } = useProject();

    // Form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');

    useEffect(() => {
        if (projectId) {
            fetchProps();
        }
    }, [projectId]);

    async function fetchProps() {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('story_props')
                .select(`
                    *,
                    prop_visuals (
                        *,
                        permanent_vault (*)
                    )
                `)
                .eq('project_id', projectId);

            if (error) throw error;
            setProps(data || []);
        } catch (e) {
            console.error('Fetch error:', e);
        } finally {
            setLoading(false);
        }
    }

    async function handleExtractAI() {
        setIsExtracting(true);
        setSuggestions([]);
        try {
            const res = await fetch('/api/extract-props', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    existingPropNames: props.map(p => p.name_kr)
                })
            });
            const data = await res.json();
            if (data.success) {
                setSuggestions(data.props);
            } else {
                alert(data.error || 'AI 분석에 실패했습니다.');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsExtracting(false);
        }
    }

    async function handleBatchGenerate() {
        if (selectedBoardItems.length === 0) return;
        if (!confirm(`${selectedBoardItems.length}개의 소품 이미지를 일괄 생성하시겠습니까?`)) return;

        setBatchStatus({ current: 0, total: selectedBoardItems.length });

        for (let i = 0; i < selectedBoardItems.length; i++) {
            const propId = selectedBoardItems[i];
            setBatchStatus({ current: i + 1, total: selectedBoardItems.length });
            setIsGenerating(propId);
            try {
                const res = await fetch('/api/generate-prop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ propId })
                });
                const data = await res.json();
                if (!data.success) console.error(`Failed prop ${propId}:`, data.error);
            } catch (e) {
                console.error(e);
            }
        }

        setIsGenerating(null);
        setBatchStatus(null);
        setSelectedBoardItems([]);
        fetchProps();
    }

    async function handleConfirmSuggestion(suggested: any) {
        try {
            const { error } = await supabase
                .from('story_props')
                .insert({
                    project_id: projectId,
                    name_kr: suggested.name_kr,
                    name_en: suggested.name_en,
                    description_kr: suggested.description_kr,
                    description_en: suggested.description_en,
                    visual_traits_kr: suggested.visual_traits_kr,
                    visual_traits_en: suggested.visual_traits_en,
                    importance: suggested.importance
                });

            if (error) throw error;
            setSuggestions(prev => prev.filter(s => s.name_kr !== suggested.name_kr));
            fetchProps();
        } catch (e) {
            console.error(e);
        }
    }

    async function handleAddProp() {
        if (!newName.trim()) return;
        try {
            const { error } = await supabase
                .from('story_props')
                .insert({
                    project_id: projectId,
                    name_kr: newName,
                    description_kr: newDesc
                });

            if (error) throw error;
            setNewName('');
            setNewDesc('');
            setShowAddForm(false);
            fetchProps();
        } catch (e) {
            console.error(e);
        }
    }

    async function handleGenerateProp(propId: string) {
        setIsGenerating(propId);
        try {
            const res = await fetch('/api/generate-prop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propId })
            });
            const data = await res.json();
            if (data.success) {
                await fetchProps();
            } else {
                alert('Generation failed: ' + data.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsGenerating(null);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        try {
            await supabase.from('story_props').delete().eq('id', id);
            fetchProps();
        } catch (e) {
            console.error(e);
        }
    }

    const toggleBoardItem = (id: string) => {
        setSelectedBoardItems(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const filteredSuggestions = suggestions.filter(s =>
        !props.some(p => p.name_kr === s.name_kr)
    );

    return (
        <div className="p-8 lg:p-12 min-h-screen">
            <header className="mb-10 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <Package className="w-8 h-8 text-amber-400" />
                        주요 소품 (Key Props)
                        {projectId && <span className="text-sm font-mono text-gray-600 ml-4 bg-white/5 px-2 py-1 rounded">[{projectId}]</span>}
                    </h1>
                    <p className="text-gray-400">서사적으로 중요한 핵심 오브젝트 디자인 및 관리</p>
                </div>
                <div className="flex gap-4">
                    {selectedBoardItems.length > 0 && (
                        <button
                            onClick={handleBatchGenerate}
                            disabled={!!batchStatus}
                            className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-orange-900/40 relative overflow-hidden"
                        >
                            <Wand2 className="w-5 h-5" />
                            {batchStatus ? `${batchStatus.current}/${batchStatus.total} 진행 중...` : `${selectedBoardItems.length}개 소품 생성`}
                            {batchStatus && (
                                <motion.div
                                    className="absolute bottom-0 left-0 bg-white/20 h-1"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(batchStatus.current / batchStatus.total) * 100}%` }}
                                />
                            )}
                        </button>
                    )}
                    <button
                        onClick={handleExtractAI}
                        disabled={isExtracting}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-purple-900/40"
                    >
                        {isExtracting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                        AI 분석 및 추출
                    </button>
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-amber-900/40"
                    >
                        <Plus className="w-5 h-5" /> {showAddForm ? '취소' : '직접 추가'}
                    </button>
                </div>
            </header>

            {/* AI Suggestions Section */}
            {filteredSuggestions.length > 0 && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="mb-12 bg-purple-500/5 border border-purple-500/30 rounded-[32px] p-8"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <Sparkles className="w-6 h-6 text-purple-400" />
                                AI 발견 소품 (제안)
                            </h2>
                        </div>
                        <button onClick={() => setSuggestions([])} className="text-gray-400 hover:text-white transition-colors text-sm">
                            숨기기
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredSuggestions.map((s, idx) => (
                            <div
                                key={idx}
                                className="bg-black/40 border border-white/10 p-4 rounded-xl flex justify-between items-start gap-4 hover:border-purple-500/30 transition-all"
                            >
                                <div className="flex gap-3">
                                    <div className="bg-purple-900/20 p-2 rounded-lg">
                                        <Box className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-bold text-purple-400">{s.name_kr}</h4>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${s.importance === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                                                {s.importance}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-400 line-clamp-2">{s.description_kr}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleConfirmSuggestion(s)}
                                    className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-colors shadow-lg shadow-purple-900/20"
                                >
                                    추가하기
                                </button>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {showAddForm && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel p-6 rounded-2xl mb-8 border border-amber-500/20 max-w-2xl"
                >
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">소품 이름 (예: 전설의 검)</label>
                            <input
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 focus:border-amber-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">상세 묘사</label>
                            <textarea
                                value={newDesc}
                                onChange={e => setNewDesc(e.target.value)}
                                className="w-full h-24 bg-black/40 border border-white/10 rounded-lg px-4 py-2 focus:border-amber-500 outline-none resize-none"
                            />
                        </div>
                        <button
                            onClick={handleAddProp}
                            className="w-full py-3 bg-amber-600 rounded-xl font-bold hover:bg-amber-500 transition-colors"
                        >
                            저장하기
                        </button>
                    </div>
                </motion.div>
            )}

            {loading ? (
                <div className="py-40 flex flex-col items-center justify-center">
                    <RefreshCw className="w-12 h-12 animate-spin text-amber-500 mb-4" />
                    <p className="text-gray-500">소품 정보를 불러오는 중...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {props.map((prop, i) => {
                        // Get the latest vault image from prop_visuals
                        const latestVisual = [...(prop.prop_visuals || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

                        return (
                            <motion.div
                                key={prop.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.05 }}
                                onClick={() => toggleBoardItem(prop.id)}
                                className={`glass-panel rounded-[24px] overflow-hidden border transition-all flex flex-col group cursor-pointer relative ${selectedBoardItems.includes(prop.id) ? 'border-orange-500 ring-4 ring-orange-500/20' : 'border-white/5 hover:border-white/20'}`}
                            >
                                <div className="absolute top-3 left-3 z-20">
                                    <input
                                        type="checkbox"
                                        readOnly
                                        checked={selectedBoardItems.includes(prop.id)}
                                        className="w-4 h-4 rounded-full border-white/20 accent-orange-500"
                                    />
                                </div>

                                <div className="aspect-square bg-gray-900 relative">
                                    {latestVisual || prop.image_url ? (
                                        <img
                                            src={latestVisual ? (latestVisual.permanent_vault?.storage_url || latestVisual.image_url) : prop.image_url}
                                            className="w-full h-full object-contain p-4 group-hover:scale-110 transition-transform duration-700"
                                            alt={prop.name_kr}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-800">
                                            <Box className="w-16 h-16 mb-2" />
                                            <span className="text-[10px] uppercase tracking-widest font-bold">No Visual</span>
                                        </div>
                                    )}

                                    {isGenerating === prop.id && (
                                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-30">
                                            <RefreshCw className="w-8 h-8 animate-spin text-orange-500 mb-2" />
                                            <span className="text-[10px] font-bold text-orange-400">생성 중...</span>
                                        </div>
                                    )}

                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-4">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleGenerateProp(prop.id); }}
                                            className="bg-amber-600/90 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-[10px] font-bold flex items-center gap-2 backdrop-blur-md"
                                        >
                                            <Wand2 className="w-3 h-3" />
                                            비주얼 생성
                                        </button>
                                    </div>
                                </div>

                                <div className="p-5 flex-1 flex flex-col">
                                    <div className="flex justify-between items-start mb-1">
                                        <h3 className="text-sm font-bold truncate pr-2">
                                            {prop.name_kr}
                                        </h3>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(prop.id); }}
                                            className="text-gray-600 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-gray-500 line-clamp-2 mb-4 leading-relaxed">
                                        {prop.description_kr || "설명이 없습니다."}
                                    </p>
                                    <div className="mt-auto pt-3 border-t border-white/5 flex gap-2">
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${latestVisual ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-gray-700'}`}>
                                            {latestVisual ? 'DESIGNED' : 'PENDING'}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}

                    {props.length === 0 && !showAddForm && (
                        <div className="col-span-full py-40 text-center border-2 border-dashed border-white/5 rounded-[40px] opacity-20 group hover:opacity-100 transition-opacity cursor-pointer" onClick={handleExtractAI}>
                            <Package className="w-16 h-16 mx-auto mb-4" />
                            <p className="text-xl font-bold text-white">No Props Found</p>
                            <p className="text-sm text-gray-400 mb-6">스토리의 핵심 소품을 등록하고 고정된 디자인을 생성하세요.</p>
                            <div className="inline-block px-8 py-4 bg-purple-600 rounded-2xl font-bold text-white flex items-center gap-3">
                                <Sparkles className="w-5 h-5" />
                                인벤토리 및 스크립트에서 자동 추출
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
