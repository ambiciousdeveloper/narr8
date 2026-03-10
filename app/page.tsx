'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion } from 'framer-motion';
import { Activity, Plus, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from './context/LanguageContext';

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ProjectConfig {
  project_id: string;
  source_identity_kr: string;
  source_identity_en: string;
  genre_kr: string;
  genre_en: string;
  art_style_kr: string;
  art_style_en: string;
  story_tone_kr: string;
  story_tone_en: string;
  target_minutes: number;
}

export default function CommandStation() {
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectConfig | null>(null);
  const [visualImage, setVisualImage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const { t, lang } = useLanguage();

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    const { data } = await supabase
      .from('project_master_config')
      .select('*')
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      setProjects(data);

      const savedId = localStorage.getItem('active_project_id');
      const savedProject = savedId ? data.find(p => p.project_id === savedId) : null;

      if (savedProject) {
        setActiveProject(savedProject);
      } else {
        setActiveProject(data[0]);
        localStorage.setItem('active_project_id', data[0].project_id);
      }
    } else {
      setProjects([]);
      setActiveProject(null);
    }
  }

  const handleLoadProject = (project: ProjectConfig) => {
    setActiveProject(project);
    localStorage.setItem('active_project_id', project.project_id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();

    const confirmMsg = lang === 'KO'
      ? `"${projectId}" 프로젝트를 정말 삭제하시겠습니까?\n모든 데이터가 영구적으로 삭제됩니다.`
      : `Are you sure you want to delete project "${projectId}"?\nAll associated data will be permanently removed.`;

    if (!confirm(confirmMsg)) return;

    setIsDeleting(projectId);
    try {
      const { error } = await supabase
        .from('project_master_config')
        .delete()
        .eq('project_id', projectId);

      if (error) throw error;

      // Update UI
      setProjects(prev => prev.filter(p => p.project_id !== projectId));

      if (activeProject?.project_id === projectId) {
        localStorage.removeItem('active_project_id');
        setActiveProject(null);
        // Refresh to pick next project
        await fetchProjects();
      }
    } catch (err: any) {
      console.error('Delete Error:', err);
      alert(lang === 'KO' ? '삭제 실패: ' + err.message : 'Delete failed: ' + err.message);
    }
    setIsDeleting(null);
  };

  return (
    <div className="p-8 lg:p-12 h-screen overflow-y-auto">
      <header className="flex justify-between items-end mb-12">
        <div className="flex flex-col items-start gap-4">
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-4xl lg:text-5xl font-bold mb-2 tracking-tight"
          >
            {t.dashboard.title}
          </motion.h1>
          <Link
            href="/onboarding"
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all transform hover:scale-105 shadow-lg shadow-purple-900/40 text-sm"
          >
            <Plus className="w-4 h-4" /> {t.onboarding.title}
          </Link>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500 uppercase tracking-widest">{t.dashboard.active_prod}</p>
          <p className="text-xl font-semibold text-purple-400">{activeProject?.project_id || 'Loading...'}</p>
        </div>
      </header>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">

        {/* Status Card */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="col-span-1 md:col-span-2 lg:col-span-2 h-[300px] rounded-3xl bg-black/40 border border-white/10 backdrop-blur-md p-8 relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-bold mb-1">{t.dashboard.sys_health}</h3>
                <p className="text-gray-400">Real-time inference engine</p>
              </div>
              <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-sm font-medium border border-green-500/30 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                ONLINE
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                <p className="text-sm text-gray-500 mb-1">{t.settings.target_min}</p>
                <p className="text-2xl font-bold">{activeProject?.target_minutes || 0} min</p>
              </div>
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                <p className="text-sm text-gray-500 mb-1">{t.producer.scenes}</p>
                <p className="text-2xl font-bold">--</p>
              </div>
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                <p className="text-sm text-gray-500 mb-1">{t.common.status}</p>
                <p className="text-2xl font-bold text-yellow-400">Dynamic</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Visual DNA Card */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="h-[300px] rounded-3xl bg-black/40 border border-white/10 backdrop-blur-md p-8 relative overflow-hidden group"
        >
          {visualImage ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-cover bg-center group-hover:scale-110 transition-transform duration-700 ease-out"
              style={{ backgroundImage: `url(${visualImage})` }}
            />
          ) : (
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center opacity-40 group-hover:scale-110 transition-transform duration-700 ease-out" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

          <div className="relative z-10 flex flex-col h-full justify-end">
            <p className="text-purple-400 font-medium mb-1 tracking-wider uppercase text-sm">{t.settings.core_identity}</p>
            <h3 className="text-3xl font-bold mb-2">
              {lang === 'KO' ? (activeProject?.art_style_kr || '미지정') : (activeProject?.art_style_en || 'Not Set')}
            </h3>
            <p className="text-gray-300 line-clamp-2">
              {lang === 'KO' ? (activeProject?.genre_kr || '장르 미정') : (activeProject?.genre_en || 'Genre not defined')} / {lang === 'KO' ? (activeProject?.story_tone_kr || '톤 미정') : (activeProject?.story_tone_en || 'Tone not defined')}
            </p>
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="col-span-1 md:col-span-3 rounded-3xl bg-black/40 border border-white/10 backdrop-blur-md p-8"
        >
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-gray-400" />
            {t.dashboard.recent_activity}
          </h3>
          <div className="space-y-4">
            {projects.slice(0, 5).map((p, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 group/item">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 font-bold">
                    {p.project_id.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-white">
                      {lang === 'KO' ? p.source_identity_kr : p.source_identity_en}
                    </p>
                    <p className="text-sm text-gray-500">{p.project_id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleDeleteProject(e, p.project_id)}
                    disabled={isDeleting === p.project_id}
                    className="p-2.5 rounded-lg bg-red-500/10 text-red-500 opacity-0 group-hover/item:opacity-100 hover:bg-red-500 hover:text-white transition-all"
                  >
                    {isDeleting === p.project_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleLoadProject(p)}
                    disabled={activeProject?.project_id === p.project_id}
                    className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${activeProject?.project_id === p.project_id
                      ? 'bg-purple-600 text-white cursor-default'
                      : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white'
                      }`}
                  >
                    {activeProject?.project_id === p.project_id ? (lang === 'KO' ? '활성 프로덕션' : 'Active') : t.dashboard.load_context}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
