import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Placeholder royalty-free audio for demonstration
const PLACEHOLDERS: Record<string, string> = {
    BGM_MAIN: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    BGM_TENSION: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    BGM_CLIMAX: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    AMBIENCE: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'
};

export async function POST(req: NextRequest) {
    try {
        const { projectId, storyId, assetType, assetNameKr, assetNameEn, prompt } = await req.json();

        if (!projectId || !storyId || !assetType) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // [V29 Refinement] Fetch Project Audio Palettes
        const { data: projectConfig } = await supabase
            .from('project_master_config')
            .select('audio_palette_bgm_en, audio_palette_bgm_kr, audio_palette_ambience_en, audio_palette_ambience_kr')
            .eq('project_id', projectId)
            .single();

        const paletteBgm = projectConfig?.audio_palette_bgm_en || projectConfig?.audio_palette_bgm_kr || "Neutral cinematic";
        const paletteAmbience = projectConfig?.audio_palette_ambience_en || projectConfig?.audio_palette_ambience_kr || "Soft background";

        const refinedPrompt = `${prompt || ''} [BGM Palette: ${paletteBgm}] [Ambience Palette: ${paletteAmbience}]`.trim();

        console.log(`>>> [Generate BGM] Type: ${assetType}, Refined Prompt: ${refinedPrompt}`);

        // In a real implementation, we would call an AI audio generation service here (e.g., Suno, Udio, Stable Audio)
        // For now, we simulate the asset registration with a placeholder.
        const storageUrl = PLACEHOLDERS[assetType] || PLACEHOLDERS.BGM_MAIN;

        const { data, error } = await supabase.from('chapter_audio_assets').insert({
            project_id: projectId,
            story_id: storyId,
            asset_type: assetType,
            asset_name_kr: assetNameKr || `${assetType} (KR)`,
            asset_name_en: assetNameEn || `${assetType} (EN)`,
            storage_url: storageUrl,
            duration_seconds: 120, // Mock duration
            metadata: {
                prompt: refinedPrompt,
                engine: 'v20-mock-engine',
                palettes: { bgm: paletteBgm, ambience: paletteAmbience },
                generated_at: new Date().toISOString()
            }
        }).select().single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error('BGM Generation Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
