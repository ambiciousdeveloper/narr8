'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Activity, BookOpen, Film, Map, Mic, Settings, Play, Archive,
    Scissors, Coins, Globe, Users, Sparkles, TrendingUp, MessageCircle,
    Clapperboard, Languages, Languages as LangIcon, Shield, FileText, Target, Megaphone, Layout, Package
} from 'lucide-react';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '../context/LanguageContext';
import { useProject } from '../context/ProjectContext';

export default function Sidebar() {
    const pathname = usePathname();
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const { lang, t, setLang } = useLanguage();
    const { projectId: activeProjectId } = useProject();

    const CATEGORIES = useMemo(() => [
        {
            id: 'cmd',
            label: t.sidebar.command,
            icon: Activity,
            items: [
                { icon: Activity, label: t.sidebar.items.dashboard, href: "/" },
                { icon: TrendingUp, label: t.sidebar.items.analytics, href: "/analytics" },
                { icon: MessageCircle, label: t.sidebar.items.audience, href: "/audience" },
                { icon: Coins, label: t.sidebar.items.ledger, href: "/ledger" },
            ]
        },
        {
            id: 'create',
            label: t.sidebar.creative,
            icon: BookOpen,
            items: [
                { icon: BookOpen, label: t.sidebar.items.bible, href: "/story-bible" },
                { icon: Layout, label: lang === 'KO' ? '마스터 설계도' : 'Master Blueprint', href: "/blueprint" },
                { icon: BookOpen, label: t.sidebar.items.novel, href: "/novel-studio" },
                { icon: FileText, label: t.sidebar.items.script, href: "/script-studio" },
                { icon: Users, label: t.sidebar.items.collab, href: "/collab" },
                { icon: Map, label: t.sidebar.items.world, href: "/world" },
                { icon: Sparkles, label: t.sidebar.items.agency, href: "/agency" },
                { icon: Map, label: t.sidebar.items.locations, href: "/locations" },
                { icon: Package, label: t.sidebar.items.props, href: "/props" },
                { icon: Archive, label: t.sidebar.items.vault, href: "/vault" },
            ]
        },
        {
            id: 'prod',
            label: t.sidebar.production,
            icon: Clapperboard,
            items: [
                { icon: Mic, label: t.sidebar.items.voice, href: "/voice" },
                { icon: Play, label: t.sidebar.items.producer, href: "/produce" },
                { icon: Scissors, label: t.sidebar.items.cutting, href: "/cutting-room" },
            ]
        },
        {
            id: 'dist',
            label: t.sidebar.broadcast,
            icon: Globe,
            items: [
                { icon: Globe, label: t.sidebar.items.broadcaster, href: "/broadcast" },
                { icon: Megaphone, label: t.sidebar.items.pr, href: "/pr-center" },
                { icon: Target, label: t.sidebar.items.ads, href: "/ad-campaign" },
            ]
        },
        {
            id: 'sys',
            label: t.sidebar.system,
            icon: Settings,
            items: [
                { icon: Settings, label: t.sidebar.items.settings, href: "/settings" },
                { icon: Shield, label: t.sidebar.items.access, href: "/access-control" },
                { icon: FileText, label: t.sidebar.items.audit, href: "/audit-logs" },
            ]
        }
    ], [t]);

    return (
        <>
            {/* Click-outside Overlay */}
            {activeCategory && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
                    onClick={() => setActiveCategory(null)}
                />
            )}

            {/* Primary Sidebar (Fixed Left) */}
            <motion.aside
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="w-20 lg:w-24 border-r border-white/10 bg-[#0f0f12] flex flex-col items-center py-8 gap-6 fixed h-full z-50 shadow-2xl"
            >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20 mb-4 shrink-0">
                    <Film className="w-6 h-6 text-white" />
                </div>

                <nav className="flex flex-col gap-4 w-full px-2">
                    {CATEGORIES.map((cat) => {
                        const isActive = activeCategory === cat.id;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                                className={clsx(
                                    "flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-300 group w-full relative",
                                    isActive
                                        ? "bg-purple-500/10 text-purple-400"
                                        : "text-gray-500 hover:text-white hover:bg-white/5"
                                )}
                            >
                                <cat.icon className={clsx("w-6 h-6", isActive && "stroke-[2.5px]")} />
                                <span className="text-[10px] font-bold text-center w-full truncate">{cat.label}</span>

                                {isActive && (
                                    <motion.div
                                        layoutId="active-pill"
                                        className="absolute left-0 top-2 bottom-2 w-1 bg-purple-500 rounded-r-full"
                                    />
                                )}
                            </button>
                        )
                    })}
                </nav>

                <div className="w-full px-2 mt-auto">
                    <button
                        onClick={() => setLang(lang === 'EN' ? 'KO' : 'EN')}
                        className="flex flex-col items-center gap-1 p-3 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all duration-300 group w-full"
                    >
                        <LangIcon className="w-6 h-6" />
                        <span className="text-[10px] font-bold">{lang}</span>
                    </button>
                </div>
            </motion.aside>

            {/* Secondary Slide-out Drawer */}
            <AnimatePresence>
                {activeCategory && (
                    <motion.div
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -20, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed left-20 lg:left-24 top-0 h-full w-64 bg-[#141417]/95 backdrop-blur-xl border-r border-white/10 z-40 p-6 flex flex-col shadow-2xl"
                    >
                        {(() => {
                            const category = CATEGORIES.find(c => c.id === activeCategory);
                            if (!category) return null;

                            return (
                                <>
                                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-white/90">
                                        <category.icon className="w-5 h-5 text-purple-500" />
                                        {category.label}
                                    </h3>
                                    <div className="flex flex-col gap-2">
                                        {category.items.map((item, idx) => {
                                            const finalHref = (item.href === '/story-bible' || item.href === '/novel-studio' || item.href === '/script-studio') && activeProjectId
                                                ? `${item.href}?project_id=${activeProjectId}`
                                                : item.href;
                                            const isActive = pathname === item.href;

                                            return (
                                                <Link
                                                    key={idx}
                                                    href={finalHref}
                                                    onClick={() => setActiveCategory(null)}
                                                    className={clsx(
                                                        "flex items-center gap-3 p-3 rounded-lg transition-all duration-200",
                                                        isActive
                                                            ? "bg-purple-600 text-white shadow-lg shadow-purple-900/40"
                                                            : "text-gray-400 hover:text-white hover:bg-white/5"
                                                    )}
                                                >
                                                    <item.icon className="w-5 h-5" />
                                                    <span className="font-medium text-sm">{item.label}</span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </>
                            );
                        })()}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
