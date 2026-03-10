'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive, Image as ImageIcon, Music, Type, Search, Grid, List, Download, Clock, Loader2, BookOpen, FileText, Trash2, CheckSquare, Square } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

export default function VaultPage() {
    const [activeTab, setActiveTab] = useState<'all' | 'image' | 'audio' | 'novel' | 'script'>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [assets, setAssets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState(false);

    const { t } = useLanguage();
    const { projectId } = useProject();

    useEffect(() => {
        fetchAssets();
    }, [activeTab, searchQuery]);

    async function fetchAssets() {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (activeTab !== 'all') params.append('type', activeTab);
            if (searchQuery) params.append('search', searchQuery);

            const res = await fetch(`/api/vault-assets?${params.toString()}`);
            const data = await res.json();
            if (data.success) {
                setAssets(data.assets);
            }
        } catch (error) {
            console.error('Failed to fetch vault assets:', error);
        } finally {
            setLoading(false);
        }
    }

    const toggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === assets.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(assets.map(a => a.id));
        }
    };

    async function handleBatchDelete() {
        if (selectedIds.length === 0) return;
        if (!confirm(`${selectedIds.length}개의 에셋을 삭제하시겠습니까? 이 작업은 되돌릴 수 없으며 원본 파일도 삭제됩니다.`)) return;

        setIsDeleting(true);
        try {
            const res = await fetch('/api/vault-assets', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assetIds: selectedIds })
            });
            const data = await res.json();
            if (data.success) {
                setAssets(prev => prev.filter(a => !selectedIds.includes(a.id)));
                setSelectedIds([]);
            } else {
                alert('삭제 중 오류가 발생했습니다: ' + data.error);
            }
        } catch (error) {
            console.error('Batch delete failed:', error);
            alert('삭제 요청에 실패했습니다.');
        } finally {
            setIsDeleting(false);
        }
    }

    return (
        <div className="p-8 lg:p-12 min-h-screen text-white">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <Archive className="w-8 h-8 text-amber-500" />
                        {t.vault.title}
                        {projectId && <span className="text-sm font-mono text-gray-600 ml-4 bg-white/5 px-2 py-1 rounded">[{projectId}]</span>}
                    </h1>
                    <p className="text-gray-400">{t.vault.subtitle}</p>
                </div>

                <div className="flex items-center gap-4">
                    {/* Batch Delete UI */}
                    <AnimatePresence>
                        {selectedIds.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="flex items-center bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl gap-4"
                            >
                                <span className="text-sm font-medium text-red-400">{selectedIds.length}개 선택됨</span>
                                <button
                                    onClick={handleBatchDelete}
                                    disabled={isDeleting}
                                    className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                                >
                                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    삭제
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                        >
                            <Grid className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                        >
                            <List className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row gap-4 mb-8 items-center">
                <div className="flex gap-2 items-center">
                    <button
                        onClick={toggleSelectAll}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${selectedIds.length === assets.length && assets.length > 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                    >
                        {selectedIds.length === assets.length && assets.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        <span className="text-sm">전체 선택</span>
                    </button>
                </div>

                <div className="relative flex-1 w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t.common.search}
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-12 pr-6 py-3 focus:ring-2 focus:ring-amber-500 outline-none text-white placeholder:text-gray-600 transition-all"
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 w-full md:w-auto">
                    {[
                        { id: 'all', label: t.common.all, icon: Archive },
                        { id: 'image', label: t.vault.type_image, icon: ImageIcon },
                        { id: 'audio', label: t.vault.type_audio, icon: Music },
                        { id: 'novel', label: t.vault.type_novel, icon: BookOpen },
                        { id: 'script', label: t.vault.type_script, icon: FileText },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium whitespace-nowrap transition-all ${activeTab === tab.id
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
                    <p>Accessing the vault...</p>
                </div>
            ) : assets.length === 0 ? (
                <div className="text-center py-20 text-gray-600">
                    <Archive className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>No assets found in the vault.</p>
                </div>
            ) : (
                <div className={`${viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6' : 'space-y-4'}`}>
                    {assets.map((asset, i) => (
                        <AssetCard
                            key={asset.id}
                            asset={asset}
                            index={i}
                            viewMode={viewMode}
                            isSelected={selectedIds.includes(asset.id)}
                            onSelect={() => toggleSelect(asset.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// Internal component for asset card with error handling
function AssetCard({ asset, index, viewMode, isSelected, onSelect }: { asset: any, index: number, viewMode: string, isSelected: boolean, onSelect: () => void }) {
    const [imgError, setImgError] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.05, 0.5) }}
            onClick={onSelect}
            className={`glass-panel rounded-xl overflow-hidden group relative border transition-all cursor-pointer ${isSelected ? 'border-amber-500 ring-1 ring-amber-500/50 bg-amber-500/5' : 'border-white/5 hover:border-white/20'
                } ${viewMode === 'list' ? 'flex items-center p-4 gap-6' : 'flex flex-col'}`}
        >
            {/* Selection indicator */}
            <div className={`absolute top-3 right-3 z-10 p-1 rounded-lg transition-all ${isSelected ? 'bg-amber-500 text-black scale-110 shadow-lg' : 'bg-black/40 text-white/40 opacity-0 group-hover:opacity-100'
                }`}>
                <CheckSquare className="w-4 h-4" />
            </div>

            {/* Thumbnail */}
            <div className={`${viewMode === 'list' ? 'w-16 h-16 rounded-lg' : 'aspect-square w-full'} bg-black/40 relative overflow-hidden flex items-center justify-center`}>
                {asset.asset_type === 'IMAGE' ? (
                    <>
                        <img
                            src={asset.storage_url}
                            alt={asset.asset_name}
                            onError={() => setImgError(true)}
                            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${imgError ? 'opacity-20 blur-sm' : ''}`}
                        />
                        {imgError && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-[10px] text-red-400 font-bold uppercase tracking-tighter">
                                <Clock className="w-4 h-4 mb-1" />
                                <span>Expired Link</span>
                            </div>
                        )}
                    </>
                ) : asset.asset_type === 'AUDIO' ? (
                    <div className="w-full h-full bg-gradient-to-br from-pink-900/20 to-purple-900/20 flex items-center justify-center">
                        <Music className="w-8 h-8 text-pink-500" />
                    </div>
                ) : (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center">
                        {asset.metadata?.category === 'NOVEL' ? (
                            <BookOpen className="w-8 h-8 text-purple-400" />
                        ) : (
                            <FileText className="w-8 h-8 text-pink-400" />
                        )}
                    </div>
                )}

                {/* Overlay Actions (Stop propagation to avoid triggering select on click) */}
                <div
                    className="absolute inset-0 bg-black/60 opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                >
                    <a
                        href={asset.storage_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-full bg-white text-black hover:scale-110 shadow-xl transition-transform"
                    >
                        <Download className="w-4 h-4" />
                    </a>
                </div>
            </div>

            {/* Meta Info */}
            <div className={`${viewMode === 'list' ? 'flex-1 flex justify-between items-center' : 'p-4'}`}>
                <div className="min-w-0 pr-8 lg:pr-0">
                    <p className="font-medium truncate text-sm mb-1">{asset.asset_name}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {new Date(asset.created_at).toLocaleDateString()}
                    </p>
                </div>
                {viewMode === 'list' && (
                    <div className="text-xs text-gray-500 font-mono italic px-3 py-1 bg-white/5 rounded-full">{asset.asset_type}</div>
                )}
            </div>
        </motion.div>
    );
}
