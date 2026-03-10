'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, ArrowLeft, CheckCircle2, Loader2, Rocket, Beaker } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '../context/LanguageContext';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function OnboardingPage() {
    return (
        <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-[#0f0f12]"><Loader2 className="animate-spin text-purple-500" /></div>}>
            <OnboardingContent />
        </Suspense>
    );
}

function OnboardingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const editProjectId = searchParams.get('project_id');
    const { t, lang } = useLanguage();
    const [step, setStep] = useState(editProjectId ? 2 : 1);
    const [isEditing, setIsEditing] = useState(!!editProjectId);

    // Master Options from DB
    const [masterOptions, setMasterOptions] = useState<any>({});

    // Form State (Bilingual)
    const [projectId, setProjectId] = useState('');
    const [conceptInput, setConceptInput] = useState(''); // User's initial input

    const [sourceIdentity, setSourceIdentity] = useState({ kr: '', en: '' });
    const [sourceAuthor, setSourceAuthor] = useState({ kr: '', en: '' });

    const [genre, setGenre] = useState('');
    const [tone, setTone] = useState('');
    const [city, setCity] = useState('');
    const [country, setCountry] = useState('');
    const [culture, setCulture] = useState('');
    const [artStyle, setArtStyle] = useState('');
    const [aesthetic, setAesthetic] = useState('');
    const [cinematography, setCinematography] = useState('');
    const [tempo, setTempo] = useState('');
    const [audioBgm, setAudioBgm] = useState('');
    const [audioAmbience, setAudioAmbience] = useState('');
    const [targetMinutes, setTargetMinutes] = useState(10);

    // AI Recommended values
    const [aiRecs, setAiRecs] = useState<any>(null);

    const [isSuggesting, setIsSuggesting] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        async function fetchOptions() {
            const res = await fetch('/api/options');
            const data = await res.json();
            setMasterOptions(data);
        }
        fetchOptions();

        if (editProjectId) {
            async function loadProject() {
                const { data, error } = await supabase
                    .from('project_master_config')
                    .select('*')
                    .eq('project_id', editProjectId)
                    .single();

                if (data && !error) {
                    setProjectId(data.project_id);
                    setGenre(data.genre_kr || '');
                    setTone(data.story_tone_kr || '');
                    setCity(data.world_city_kr || '');
                    setCountry(data.world_country_kr || '');
                    setCulture(data.cultural_setting_kr || '');
                    setArtStyle(data.art_style_kr || '');
                    setAesthetic(data.aesthetic_dna_kr || '');
                    setCinematography(data.cinematography_kr || '');
                    setTempo(data.narrative_tempo_kr || '');
                    setAudioBgm(data.audio_palette_bgm_kr || '');
                    setAudioAmbience(data.audio_palette_ambience_kr || '');
                    setTargetMinutes(data.target_minutes || 5);
                    setSourceIdentity({ kr: data.source_identity_kr, en: data.source_identity_en });
                    setSourceAuthor({ kr: data.source_author_kr, en: data.source_author_en });

                    // Critical: Load aiRecs from DB to enable bilingual display for non-library options
                    setAiRecs({
                        genre_kr: data.genre_kr, genre_en: data.genre_en,
                        story_tone_kr: data.story_tone_kr, story_tone_en: data.story_tone_en,
                        world_city_kr: data.world_city_kr, world_city_en: data.world_city_en,
                        world_country_kr: data.world_country_kr, world_country_en: data.world_country_en,
                        cultural_setting_kr: data.cultural_setting_kr, cultural_setting_en: data.cultural_setting_en,
                        art_style_kr: data.art_style_kr, art_style_en: data.art_style_en,
                        aesthetic_dna_kr: data.aesthetic_dna_kr, aesthetic_dna_en: data.aesthetic_dna_en,
                        cinematography_kr: data.cinematography_kr, cinematography_en: data.cinematography_en,
                        narrative_tempo_kr: data.narrative_tempo_kr, narrative_tempo_en: data.narrative_tempo_en,
                        audio_palette_bgm_kr: data.audio_palette_bgm_kr, audio_palette_bgm_en: data.audio_palette_bgm_en,
                        audio_palette_ambience_kr: data.audio_palette_ambience_kr, audio_palette_ambience_en: data.audio_palette_ambience_en,
                        // Load all structure levels for UI consistency
                        structure_l1_kr: data.structure_l1_kr, structure_l1_en: data.structure_l1_en,
                        structure_l2_kr: data.structure_l2_kr, structure_l2_en: data.structure_l2_en,
                        structure_l3_kr: data.structure_l3_kr, structure_l3_en: data.structure_l3_en
                    });
                }
            }
            loadProject();
        }
    }, [editProjectId]);

    const handleSuggest = async () => {
        if (!conceptInput) return;
        setIsSuggesting(true);
        try {
            const res = await fetch('/api/suggest-style', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ concept: conceptInput, lang })
            });
            const data = await res.json();

            if (data.genre_kr) {
                setAiRecs(data);
                // Set initial values to AI recommendations
                setSourceIdentity({ kr: data.source_identity_kr, en: data.source_identity_en });
                setSourceAuthor({ kr: data.source_author_kr, en: data.source_author_en });
                setGenre(data.genre_kr);
                setTone(data.story_tone_kr);
                setCity(data.world_city_kr);
                setCulture(data.cultural_setting_kr);
                setArtStyle(data.art_style_kr);
                setAesthetic(data.aesthetic_dna_kr);
                setCinematography(data.cinematography_kr);
                setTempo(data.narrative_tempo_kr);
                setAudioBgm(data.audio_palette_bgm_kr);
                setAudioAmbience(data.audio_palette_ambience_kr);
                setStep(2);
            } else {
                alert('AI Suggestion Error: ' + (data.error || 'Unknown error'));
            }
        } catch (e: any) {
            console.error(e);
            alert('Fetch Error: ' + e.message);
        }
        setIsSuggesting(false);
    };

    const handleCreate = async () => {
        if (!projectId || !sourceIdentity.kr) return;
        setIsCreating(true);

        // Find the English equivalents if they were selected from master options
        const findEn = (cat: string, krVal: string, fallback: string) => {
            const opt = masterOptions[cat]?.find((o: any) => o.label_kr === krVal);
            return opt ? opt.label_en : fallback;
        };

        const { error } = await supabase
            .from('project_master_config')
            .upsert([{
                project_id: projectId,
                // Source
                source_identity_kr: sourceIdentity.kr,
                source_identity_en: sourceIdentity.en,
                source_author_kr: sourceAuthor.kr,
                source_author_en: sourceAuthor.en,
                // Narrative
                genre_kr: genre,
                genre_en: findEn('genre', genre, aiRecs?.genre_en || genre),
                story_tone_kr: tone,
                story_tone_en: findEn('story_tone', tone, aiRecs?.story_tone_en || tone),
                // World
                world_country_kr: country,
                world_country_en: findEn('world_country', country, aiRecs?.world_country_en || country),
                world_city_kr: city,
                world_city_en: findEn('world_city', city, aiRecs?.world_city_en || city),
                cultural_setting_kr: culture,
                cultural_setting_en: findEn('cultural_setting', culture, aiRecs?.cultural_setting_en || culture),
                // Visual
                art_style_kr: artStyle,
                art_style_en: findEn('art_style', artStyle, aiRecs?.art_style_en || artStyle),
                aesthetic_dna_kr: aesthetic,
                aesthetic_dna_en: findEn('aesthetic_dna', aesthetic, aiRecs?.aesthetic_dna_en || aesthetic),
                cinematography_kr: cinematography,
                cinematography_en: findEn('cinematography', cinematography, aiRecs?.cinematography_en || cinematography),
                // Tempo & Meta
                narrative_tempo_kr: tempo,
                narrative_tempo_en: findEn('narrative_tempo', tempo, aiRecs?.narrative_tempo_en || tempo),
                // Audio
                audio_palette_bgm_kr: audioBgm,
                audio_palette_bgm_en: findEn('audio_bgm', audioBgm, aiRecs?.audio_palette_bgm_en || audioBgm),
                audio_palette_ambience_kr: audioAmbience,
                audio_palette_ambience_en: findEn('audio_ambience', audioAmbience, aiRecs?.audio_palette_ambience_en || audioAmbience),
                // Save all discovered structure levels for resetting context
                structure_l1_kr: aiRecs?.structure_l1_kr,
                structure_l1_en: aiRecs?.structure_l1_en,
                structure_l2_kr: aiRecs?.structure_l2_kr,
                structure_l2_en: aiRecs?.structure_l2_en,
                structure_l3_kr: aiRecs?.structure_l3_kr,
                structure_l3_en: aiRecs?.structure_l3_en,
                target_minutes: targetMinutes,
                created_at: new Date().toISOString()
            }]);

        if (!error) {
            localStorage.setItem('active_project_id', projectId);
            if (isEditing) {
                router.push(`/story-bible?project_id=${projectId}`);
            } else {
                setStep(4);
                setTimeout(() => router.push(`/story-bible?project_id=${projectId}`), 2000);
            }
        } else {
            alert('Error: ' + error.message);
        }
        setIsCreating(false);
    };

    const nextStep = () => setStep(s => s + 1);
    const prevStep = () => setStep(s => s - 1);

    return (
        <main className="min-h-screen bg-[#0f0f12] text-white p-8 lg:p-12 flex items-center justify-center">
            <div className="max-w-3xl w-full">

                {/* Stepper Header */}
                <div className="flex justify-between mb-12 relative px-4 text-xs font-bold text-gray-500 uppercase tracking-widest">
                    <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/10 -z-0" />
                    {[1, 2, 3].map(i => (
                        <div key={i} className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${step >= i ? 'bg-purple-600 border-purple-500 text-white scale-110 shadow-lg shadow-purple-600/30' : 'bg-[#0f0f12] border-white/10'}`}>
                            {step > i ? <CheckCircle2 className="w-4 h-4" /> : i}
                        </div>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {step === 1 && (
                        <motion.section key="step1" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-8">
                            <header>
                                <h1 className="text-4xl font-bold mb-3">{t.onboarding.step1_title}</h1>
                                <p className="text-gray-400">{t.onboarding.step1_desc}</p>
                            </header>
                            <textarea
                                value={conceptInput}
                                onChange={(e) => setConceptInput(e.target.value)}
                                className="w-full h-40 bg-white/5 border border-white/10 rounded-2xl p-6 text-xl leading-relaxed focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder:text-gray-700"
                                placeholder={t.onboarding.source_placeholder}
                            />
                            <div className="flex gap-4">
                                <button onClick={() => router.back()} className="flex-1 py-4 bg-white/5 border border-white/10 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-white/10 transition-colors">
                                    <ArrowLeft className="w-5 h-5" /> {lang === 'KO' ? '뒤로' : 'Back'}
                                </button>
                                <button onClick={handleSuggest} disabled={!conceptInput || isSuggesting} className="flex-[3] py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl font-bold text-lg flex items-center justify-center gap-3 hover:scale-[1.02] transition-all disabled:opacity-50">
                                    {isSuggesting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
                                    {t.onboarding.suggest_btn}
                                </button>
                            </div>
                        </motion.section>
                    )}

                    {step === 2 && (
                        <motion.section key="step2" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-8">
                            <header className="flex justify-between items-end">
                                <div>
                                    <h1 className="text-3xl font-bold mb-2">{t.onboarding.step2_title}</h1>
                                    <p className="text-gray-400 text-sm">{lang === 'KO' ? 'AI가 원작 정보를 찾고 최적의 설정을 분석했습니다.' : 'AI analyzed the source and suggested optimal settings.'}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-tighter">{lang === 'KO' ? '식별된 원작' : 'Identified Work'}</p>
                                    <p className="text-purple-400 font-bold">{lang === 'KO' ? sourceIdentity.kr : sourceIdentity.en} <span className="text-gray-600">by</span> {lang === 'KO' ? sourceAuthor.kr : sourceAuthor.en}</p>
                                </div>
                            </header>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <SelectField label={lang === 'KO' ? '장르 (Genre)' : 'Genre'} value={genre} onChange={setGenre} options={masterOptions.genre} aiValue={{ kr: aiRecs?.genre_kr, en: aiRecs?.genre_en }} lang={lang} />
                                <SelectField label={lang === 'KO' ? '서사 톤 (Tone)' : 'Story Tone'} value={tone} onChange={setTone} options={masterOptions.story_tone} aiValue={{ kr: aiRecs?.story_tone_kr, en: aiRecs?.story_tone_en }} lang={lang} />
                                <SelectField label={lang === 'KO' ? '국가 (Country)' : 'Country'} value={country} onChange={setCountry} options={masterOptions.world_country} aiValue={{ kr: aiRecs?.world_country_kr, en: aiRecs?.world_country_en }} lang={lang} />
                                <SelectField label={lang === 'KO' ? '월드/도시 (World/City)' : 'World/City'} value={city} onChange={setCity} options={masterOptions.world_city} aiValue={{ kr: aiRecs?.world_city_kr, en: aiRecs?.world_city_en }} lang={lang} />
                                <SelectField label={lang === 'KO' ? '문화적 배경 (Culture)' : 'Cultural Setting'} value={culture} onChange={setCulture} options={masterOptions.cultural_setting} aiValue={{ kr: aiRecs?.cultural_setting_kr, en: aiRecs?.cultural_setting_en }} lang={lang} />
                                <SelectField label={lang === 'KO' ? '아트 스타일 (Art Style)' : 'Art Style'} value={artStyle} onChange={setArtStyle} options={masterOptions.art_style} aiValue={{ kr: aiRecs?.art_style_kr, en: aiRecs?.art_style_en }} lang={lang} />
                                <SelectField label={lang === 'KO' ? '미적 DNA (Aesthetic)' : 'Aesthetic DNA'} value={aesthetic} onChange={setAesthetic} options={masterOptions.aesthetic_dna} aiValue={{ kr: aiRecs?.aesthetic_dna_kr, en: aiRecs?.aesthetic_dna_en }} lang={lang} />
                                <SelectField label={lang === 'KO' ? '연출 기법 (Cinematography)' : 'Cinematography'} value={cinematography} onChange={setCinematography} options={masterOptions.cinematography} aiValue={{ kr: aiRecs?.cinematography_kr, en: aiRecs?.cinematography_en }} lang={lang} />
                                <SelectField label={lang === 'KO' ? '서사 템포 (Tempo)' : 'Narrative Tempo'} value={tempo} onChange={setTempo} options={masterOptions.narrative_tempo} aiValue={{ kr: aiRecs?.narrative_tempo_kr, en: aiRecs?.narrative_tempo_en }} lang={lang} />
                                <SelectField label={lang === 'KO' ? '배경 음악 (BGM)' : 'Background Music'} value={audioBgm} onChange={setAudioBgm} options={masterOptions.audio_bgm} aiValue={{ kr: aiRecs?.audio_palette_bgm_kr, en: aiRecs?.audio_palette_bgm_en }} lang={lang} />
                                <SelectField label={lang === 'KO' ? '환경음 (Ambience)' : 'Ambience'} value={audioAmbience} onChange={setAudioAmbience} options={masterOptions.audio_ambience} aiValue={{ kr: aiRecs?.audio_palette_ambience_kr, en: aiRecs?.audio_palette_ambience_en }} lang={lang} />
                            </div>


                            <div className="flex gap-4">
                                <button onClick={prevStep} className="flex-1 py-4 bg-white/5 border border-white/10 rounded-xl font-bold flex items-center justify-center gap-2">
                                    <ArrowLeft className="w-5 h-5" /> {lang === 'KO' ? '이전' : 'Back'}
                                </button>
                                <button onClick={nextStep} className="flex-1 py-4 bg-purple-600 rounded-xl font-bold flex items-center justify-center gap-2">
                                    {lang === 'KO' ? '다음' : 'Next'} <ArrowRight className="w-5 h-5" />
                                </button>
                            </div>
                        </motion.section>
                    )}

                    {step === 3 && (
                        <motion.section key="step3" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} className="space-y-8">
                            <header>
                                <h1 className="text-4xl font-bold mb-3">{t.onboarding.step3_title}</h1>
                                <p className="text-gray-400">{t.onboarding.step3_desc}</p>
                            </header>

                            <div className="space-y-6">
                                <div className="p-6 bg-white/5 border border-white/10 rounded-2xl space-y-4">
                                    <FormItem label={lang === 'KO' ? '프로젝트 영문 ID' : 'Project ID (English)'} value={projectId} onChange={setProjectId} placeholder="e.g. cyber_david_2025" />
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormItem label={lang === 'KO' ? '식별된 제목' : 'Identified Title'} value={lang === 'KO' ? sourceIdentity.kr : sourceIdentity.en} onChange={(v) => setSourceIdentity(lang === 'KO' ? { ...sourceIdentity, kr: v } : { ...sourceIdentity, en: v })} />
                                        <FormItem label={lang === 'KO' ? '작가' : 'Author'} value={lang === 'KO' ? sourceAuthor.kr : sourceAuthor.en} onChange={(v) => setSourceAuthor(lang === 'KO' ? { ...sourceAuthor, kr: v } : { ...sourceAuthor, en: v })} />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t.settings.target_min}</label>
                                    <div className="flex items-center gap-6 p-4 bg-white/5 border border-white/10 rounded-xl">
                                        <input type="range" min="5" max="120" step="5" value={targetMinutes} onChange={(e) => setTargetMinutes(Number(e.target.value))} className="flex-1 accent-purple-500" />
                                        <span className="text-2xl font-bold text-purple-400 w-16 text-right">{targetMinutes}m</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button onClick={prevStep} className="flex-1 py-4 bg-white/5 border border-white/10 rounded-xl font-bold flex items-center justify-center gap-2">
                                    <ArrowLeft className="w-5 h-5" /> {lang === 'KO' ? '이전' : 'Back'}
                                </button>
                                <button onClick={handleCreate} disabled={!projectId || !sourceIdentity.kr} className="flex-[2] py-4 bg-purple-600 rounded-xl font-bold text-lg flex items-center justify-center gap-3">
                                    {isCreating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Rocket className="w-6 h-6" />}
                                    {isEditing ? (lang === 'KO' ? '설정 업데이트' : 'Update Settings') : t.onboarding.create_btn}
                                </button>
                            </div>
                        </motion.section>
                    )}

                    {step === 4 && (
                        <motion.section key="success" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-6">
                            <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-8 border border-green-500/30">
                                <CheckCircle2 className="w-12 h-12 text-green-400" />
                            </div>
                            <h1 className="text-4xl font-bold">{t.onboarding.success}</h1>
                            <p className="text-gray-400">Redirecting to Dashboard...</p>
                        </motion.section>
                    )}
                </AnimatePresence>
            </div>
        </main>
    );
}

function SelectField({ label, value, onChange, options, aiValue, lang }: { label: string, value: string, onChange: (v: string) => void, options: any[], aiValue: { kr: string, en: string }, lang: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isManual, setIsManual] = useState(false);
    const [openUp, setOpenUp] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const toggleOpen = () => {
        if (!isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            // If space below is less than 300px, open upwards
            setOpenUp(spaceBelow < 300);
        }
        setIsOpen(!isOpen);
    };

    // Helper to get display label based on current language
    const getDisplayLabel = (krVal: string) => {
        if (!krVal) return lang === 'KO' ? '선택해주세요' : 'Select an option';

        // 1. Check AI Recommendation match
        if (krVal === aiValue.kr) return lang === 'KO' ? aiValue.kr : aiValue.en;

        // 2. Check Master Library match
        const opt = options?.find(o => o.label_kr === krVal);
        if (opt) return lang === 'KO' ? opt.label_kr : opt.label_en;

        // 3. Fallback (Manual Input)
        return krVal;
    };

    if (isManual) {
        return (
            <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none block ml-1">{label}</label>
                <div className="relative">
                    <input
                        type="text" value={value} onChange={(e) => onChange(e.target.value)} autoFocus
                        className="w-full min-h-[80px] bg-white/5 border border-purple-500/50 rounded-xl p-4 pr-24 focus:ring-2 focus:ring-purple-500 outline-none transition-all text-white"
                        placeholder={lang === 'KO' ? '직접 입력하세요...' : 'Type manually...'}
                    />
                    <button onClick={() => { setIsManual(false); setIsOpen(false); }} className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-purple-400 hover:text-purple-300 uppercase font-black tracking-widest bg-purple-500/10 px-2 py-1 rounded">
                        {lang === 'KO' ? '취소' : 'Cancel'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2 relative" ref={containerRef}>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-none block ml-1">{label}</label>

            {/* Custom Select Trigger */}
            <button
                onClick={toggleOpen}
                className={`w-full min-h-[80px] flex items-center justify-between bg-white/5 border ${isOpen ? 'border-purple-500' : 'border-white/10'} rounded-xl p-4 text-left transition-all hover:bg-white/10 group gap-4`}
            >
                <span className={`flex-1 leading-snug ${value ? 'text-white' : 'text-gray-500'}`}>
                    {value ? (value === aiValue.kr ? `✨ ${lang === 'KO' ? aiValue.kr : aiValue.en}` : getDisplayLabel(value)) : getDisplayLabel('')}
                </span>
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} className="flex-shrink-0">
                    <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-purple-400 rotate-90" />
                </motion.div>
            </button>

            {/* Custom Dropdown Menu */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop to close */}
                        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

                        <motion.div
                            initial={{ opacity: 0, y: openUp ? 10 : -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: openUp ? 10 : -10 }}
                            className={`absolute z-50 w-full ${openUp ? 'bottom-full mb-2' : 'top-full mt-2'} bg-[#1a1a20] border border-white/10 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl`}
                        >
                            <div className="max-h-60 overflow-y-auto custom-scrollbar">
                                {aiValue.kr && (
                                    <button
                                        onClick={() => { onChange(aiValue.kr); setIsOpen(false); }}
                                        className="w-full text-left p-4 hover:bg-purple-600/20 text-purple-300 font-bold border-b border-white/5 flex items-center gap-2"
                                    >
                                        <Sparkles className="w-4 h-4" /> {lang === 'KO' ? 'AI 추천:' : 'AI Suggestion:'} {lang === 'KO' ? aiValue.kr : aiValue.en}
                                    </button>
                                )}
                                {options?.map((opt: any, i: number) => {
                                    const optLabel = lang === 'KO' ? opt.label_kr : opt.label_en;
                                    return (
                                        <button
                                            key={i}
                                            onClick={() => { onChange(opt.label_kr); setIsOpen(false); }}
                                            className="w-full text-left p-4 hover:bg-white/5 text-gray-300 transition-colors border-b border-white/5 last:border-0"
                                        >
                                            {optLabel}
                                        </button>
                                    );
                                })}
                                <button
                                    onClick={() => { setIsManual(true); setIsOpen(false); }}
                                    className="w-full text-left p-4 hover:bg-white/10 text-gray-400 italic flex items-center gap-2 bg-white/5"
                                >
                                    <Beaker className="w-4 h-4" /> ➕ {lang === 'KO' ? '직접 입력...' : 'Type manually...'}
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

function FormItem({ label, value, onChange, placeholder }: { label: string, value: string, onChange: (v: string) => void, placeholder?: string }) {
    return (
        <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">{label}</label>
            <input
                type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
                className="w-full bg-white/10 border border-white/10 rounded-xl p-3 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
            />
        </div>
    );
}

