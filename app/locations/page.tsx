'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Map, Plus, RefreshCw, Wand2, Image as ImageIcon, MapPin, Search, Trash2, Sparkles } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LocationBoard() {
    const [locations, setLocations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState<string | null>(null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [selectedBoardItems, setSelectedBoardItems] = useState<string[]>([]);
    const [batchStatus, setBatchStatus] = useState<{ current: number, total: number } | null>(null);

    const { t } = useLanguage();
    const { projectId } = useProject();

    // Form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');

    useEffect(() => {
        if (projectId) {
            fetchLocations();
        }
    }, [projectId]);

    async function fetchLocations() {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('story_locations')
                .select('*, location_visuals(*)')
                .eq('project_id', projectId);

            if (error) throw error;
            setLocations(data || []);
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
            const res = await fetch('/api/extract-locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    existingLocations: locations.map(l => l.name_kr)
                })
            });
            const data = await res.json();
            if (data.success) {
                setSuggestions(data.locations);
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
        if (!confirm(`${selectedBoardItems.length}개의 배경 이미지를 일괄 생성하시겠습니까? (시간이 다소 소요될 수 있습니다)`)) return;

        setBatchStatus({ current: 0, total: selectedBoardItems.length });

        for (let i = 0; i < selectedBoardItems.length; i++) {
            const locId = selectedBoardItems[i];
            setBatchStatus({ current: i + 1, total: selectedBoardItems.length });
            setIsGenerating(locId);
            try {
                const res = await fetch('/api/generate-location', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ locationId: locId })
                });
                const data = await res.json();
                if (!data.success) console.error(`Failed loc ${locId}:`, data.error);
            } catch (e) {
                console.error(e);
            }
        }

        setIsGenerating(null);
        setBatchStatus(null);
        setSelectedBoardItems([]);
        fetchLocations();
    }

    async function handleConfirmSuggestion(suggestedLoc: any) {
        try {
            const { error } = await supabase
                .from('story_locations')
                .insert({
                    project_id: projectId,
                    name_kr: suggestedLoc.name_kr,
                    name_en: suggestedLoc.name_en,
                    description_kr: suggestedLoc.description_kr,
                    description_en: suggestedLoc.description_en,
                    visual_traits_kr: suggestedLoc.visual_traits_kr,
                    visual_traits_en: suggestedLoc.visual_traits_en
                });

            if (error) throw error;
            setSuggestions(prev => prev.filter(s => s.name_kr !== suggestedLoc.name_kr));
            fetchLocations();
        } catch (e) {
            console.error(e);
        }
    }

    async function handleAddLocation() {
        if (!newName.trim()) return;
        try {
            const { error } = await supabase
                .from('story_locations')
                .insert({
                    project_id: projectId,
                    name_kr: newName,
                    description_kr: newDesc
                });

            if (error) throw error;
            setNewName('');
            setNewDesc('');
            setShowAddForm(false);
            fetchLocations();
        } catch (e) {
            console.error(e);
        }
    }

    async function handleGenerateLocation(locId: string) {
        setIsGenerating(locId);
        try {
            const res = await fetch('/api/generate-location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locationId: locId })
            });
            const data = await res.json();
            if (data.success) {
                await fetchLocations();
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
            await supabase.from('story_locations').delete().eq('id', id);
            fetchLocations();
        } catch (e) {
            console.error(e);
        }
    }

    const toggleBoardItem = (id: string) => {
        setSelectedBoardItems(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    // Filter AI suggestions to exclude already registered locations
    const filteredSuggestions = suggestions.filter(s =>
        !locations.some(loc => loc.name_kr === s.name_kr)
    );

    return (
        <div className="p-8 lg:p-12 min-h-screen">
            <header className="mb-10 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <Map className="w-8 h-8 text-emerald-400" />
                        {t.sidebar.items.locations}
                        {projectId && <span className="text-sm font-mono text-gray-600 ml-4 bg-white/5 px-2 py-1 rounded">[{projectId}]</span>}
                    </h1>
                    <p className="text-gray-400">일관성 있는 배경 설정을 위한 마스터 로케이션 관리</p>
                </div>
                <div className="flex gap-4">
                    {selectedBoardItems.length > 0 && (
                        <button
                            onClick={handleBatchGenerate}
                            disabled={!!batchStatus}
                            className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-orange-900/40 relative overflow-hidden"
                        >
                            <Wand2 className="w-5 h-5" />
                            {batchStatus ? `${batchStatus.current}/${batchStatus.total} 진행 중...` : `${selectedBoardItems.length}개 배경 생성`}
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
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-900/40"
                    >
                        <Plus className="w-5 h-5" /> {showAddForm ? t.common.cancel : '직접 추가'}
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
                                AI 발견 로케이션 (제안)
                            </h2>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => setSuggestions([])} className="text-gray-400 hover:text-white transition-colors text-sm">
                                숨기기
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredSuggestions.map((s, idx) => (
                            <div
                                key={idx}
                                className="bg-black/40 border border-white/10 p-4 rounded-xl flex justify-between items-start gap-4 hover:border-purple-500/30 transition-all"
                            >
                                <div className="flex gap-3">
                                    <div>
                                        <h4 className="font-bold text-purple-400 mb-1">{s.name_kr}</h4>
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
                    className="glass-panel p-6 rounded-2xl mb-8 border border-emerald-500/20 max-w-2xl"
                >
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">장소 이름 (예: 강해준의 아지트)</label>
                            <input
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2 focus:border-emerald-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 mb-1 block">장소 묘사 (소설 기반의 상세 설명 권장)</label>
                            <textarea
                                value={newDesc}
                                onChange={e => setNewDesc(e.target.value)}
                                className="w-full h-24 bg-black/40 border border-white/10 rounded-lg px-4 py-2 focus:border-emerald-500 outline-none resize-none"
                            />
                        </div>
                        <button
                            onClick={handleAddLocation}
                            className="w-full py-3 bg-emerald-600 rounded-xl font-bold hover:bg-emerald-500 transition-colors"
                        >
                            저장하기
                        </button>
                    </div>
                </motion.div>
            )}

            {loading ? (
                <div className="py-40 flex flex-col items-center justify-center">
                    <RefreshCw className="w-12 h-12 animate-spin text-emerald-500 mb-4" />
                    <p className="text-gray-500">로케이션 정보를 불러오는 중...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {locations.map((loc, i) => (
                        <motion.div
                            key={loc.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.05 }}
                            onClick={() => toggleBoardItem(loc.id)}
                            className={`glass-panel rounded-[32px] overflow-hidden border transition-all flex flex-col group cursor-pointer relative ${selectedBoardItems.includes(loc.id) ? 'border-orange-500 ring-4 ring-orange-500/20' : 'border-white/5 hover:border-white/20'}`}
                        >
                            {/* Selection Checkbox Overlay */}
                            <div className="absolute top-4 left-4 z-20">
                                <input
                                    type="checkbox"
                                    readOnly
                                    checked={selectedBoardItems.includes(loc.id)}
                                    className="w-5 h-5 rounded-full border-white/20 accent-orange-500 shadow-xl"
                                />
                            </div>

                            <div className="aspect-video bg-gray-900 relative">
                                {loc.location_visuals?.[0]?.image_url ? (
                                    <img
                                        src={loc.location_visuals[0].image_url}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                        alt={loc.name_kr}
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-700">
                                        <ImageIcon className="w-12 h-12 mb-2" />
                                        <span className="text-xs uppercase tracking-widest">No Master Background</span>
                                    </div>
                                )}

                                {isGenerating === loc.id && (
                                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-30">
                                        <RefreshCw className="w-10 h-10 animate-spin text-orange-500 mb-2" />
                                        <span className="text-xs font-bold text-orange-400">배경 생성 중...</span>
                                    </div>
                                )}

                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleGenerateLocation(loc.id); }}
                                        className="bg-emerald-600/90 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 backdrop-blur-md"
                                    >
                                        <Wand2 className="w-3 h-3" />
                                        개별 재생성
                                    </button>
                                </div>
                            </div>

                            <div className="p-6 flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-lg font-bold flex items-center gap-2">
                                        <MapPin className="w-4 h-4 text-emerald-500" />
                                        {loc.name_kr}
                                    </h3>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(loc.id); }}
                                        className="text-gray-500 hover:text-red-400 p-2 transition-colors bg-white/5 rounded-lg"
                                        title="Delete Location"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="text-sm text-gray-400 line-clamp-3 mb-6 flex-1">
                                    {loc.description_kr || "설명이 없습니다."}
                                </p>
                                <div className="flex gap-2">
                                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-tighter ${loc.location_visuals?.[0] ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-gray-600'}`}>
                                        {loc.location_visuals?.[0] ? 'MASTER READY' : 'NO BACKGROUND'}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}

                    {/* Empty State / Add Placeholder */}
                    {locations.length === 0 && !showAddForm && (
                        <div className="col-span-full py-40 text-center border-2 border-dashed border-white/5 rounded-[40px] opacity-20 group hover:opacity-100 transition-opacity cursor-pointer" onClick={handleExtractAI}>
                            <Map className="w-16 h-16 mx-auto mb-4" />
                            <p className="text-xl font-bold text-white">No Locations Registered</p>
                            <p className="text-sm text-gray-400 mb-6">오토 프로듀서 작업을 위해 주요 배경을 먼저 등록하세요.</p>
                            <div className="inline-block px-8 py-4 bg-purple-600 rounded-2xl font-bold text-white flex items-center gap-3">
                                <Sparkles className="w-5 h-5" />
                                AI 분석 결과에서 자동으로 채우기
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
