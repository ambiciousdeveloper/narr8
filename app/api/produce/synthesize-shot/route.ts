import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
    try {
        const { projectId, episodeId, shotId, characterId, locationId, dialogue, action } = await req.json();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const replicateKey = process.env.REPLICATE_API_TOKEN;

        if (!supabaseUrl || !supabaseKey || !replicateKey) {
            throw new Error("Missing credentials or API keys");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Fetch Character, Location, and Project Config
        const [
            { data: charData },
            { data: locData },
            { data: projectConfig }
        ] = await Promise.all([
            characterId ? supabase.from('characters').select('*').eq('id', characterId).single() : Promise.resolve({ data: null }),
            locationId ? supabase.from('story_locations').select('*').eq('id', locationId).single() : Promise.resolve({ data: null }),
            supabase.from('project_master_config').select('*').eq('project_id', projectId).single()
        ]);

        // 2. Fetch Style DNA
        const { data: epData } = await supabase
            .from('episodes')
            .select('style_dna_overlay')
            .eq('id', episodeId)
            .single();

        const styleOverlay = epData?.style_dna_overlay || {};

        // 3. Construct Prompt (Composite Scene with full Master Config)
        const genre = projectConfig?.genre_en || "";
        const city = projectConfig?.world_city_en || "";
        const country = projectConfig?.world_country_en || "";
        const culturalSetting = projectConfig?.cultural_setting_en || "";
        const storyTone = projectConfig?.story_tone_en || "";
        const artStyle = styleOverlay.art_style || projectConfig?.art_style_en || "cinematic, 8k, highly detailed";
        const aestheticDna = styleOverlay.aesthetic_dna || projectConfig?.aesthetic_dna_en || "";

        const charDesc = charData ? `${charData.reinterpreted_name_en}, ${charData.visual_traits_en || ''}` : "a character";
        const locDesc = locData ? `at ${locData.name_en}, ${locData.description_en || ''}` : "in a cinematic setting";
        const sceneAction = action || dialogue || "gazing intently";

        const textSuppression = "### [CRITICAL: ABSOLUTELY NO TEXT, NO LETTERS, NO SIGNS, NO READABLE CHARACTERS] ###";

        const prompt = `${textSuppression} 
        [Art Style: ${artStyle}] 
        [Aesthetic DNA: ${aestheticDna}] 
        [Genre: ${genre}] 
        [Setting: ${city}, ${country}] 
        [Cultural Background: ${culturalSetting}] 
        [Narrative Tone: ${storyTone}]
        
        Cinematic film shot of ${charDesc} ${locDesc}. 
        Action/Emotion: ${sceneAction}. 
        Key Visual Context: ${locData?.visual_traits_en || ''} set within a ${culturalSetting} environment. 
        Lighting: Cinematic lighting reflecting a ${storyTone} mood, realistic shadows, depth of field. 
        Perspective: Dramatic camera angle appropriate for ${genre} genre.`.trim();

        console.log(`>>> [Shot Synthesis] Rendering shot_${shotId} for Ep ${episodeId}...`);

        // 4. Call Replicate (Flux Pro or Schnell)
        const response = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
            method: "POST",
            headers: {
                "Authorization": `Token ${replicateKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                input: {
                    prompt: prompt,
                    aspect_ratio: "16:9",
                    output_format: "webp",
                    output_quality: 90
                },
            }),
        });

        if (!response.ok) throw new Error(`Replicate API failed: ${await response.text()}`);
        const prediction = await response.json();

        // 5. Polling for completion
        let resultUrl = null;
        let attempts = 0;
        while (attempts < 20) {
            const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
                headers: { "Authorization": `Token ${replicateKey}` },
            });
            const pollData = await pollRes.json();
            if (pollData.status === "succeeded") {
                resultUrl = pollData.output[0];
                break;
            } else if (pollData.status === "failed") throw new Error("Flux generation failed");
            await new Promise(r => setTimeout(r, 2000));
            attempts++;
        }

        if (!resultUrl) throw new Error("Generation timed out");

        // 6. Persistent Storage
        let permanentUrl = resultUrl;
        try {
            const imageRes = await fetch(resultUrl);
            const imageBlob = await imageRes.blob();
            const fileName = `shot_${episodeId}_${shotId}_${Date.now()}.webp`;
            const filePath = `storyboards/${fileName}`;

            const { error: uploadErr } = await supabase.storage
                .from('vault')
                .upload(filePath, imageBlob, { contentType: 'image/webp', upsert: true });

            if (!uploadErr) {
                const { data: publicUrlData } = supabase.storage.from('vault').getPublicUrl(filePath);
                permanentUrl = publicUrlData.publicUrl;
            }
        } catch (persistErr) {
            console.error(">>> [Shot Persistence Failed]", persistErr);
        }

        // 7. Update Storyboard Data (Atomic)
        // We fetch the current storyboard, update the specific clip, and save back.
        const { data: currentSb } = await supabase
            .from('episode_storyboards')
            .select('timeline_data')
            .eq('episode_id', episodeId)
            .single();

        if (currentSb?.timeline_data) {
            const updatedTimeline = { ...currentSb.timeline_data };
            const videoTrack = updatedTimeline.tracks.find((t: any) => t.type === 'video');
            if (videoTrack) {
                const clip = videoTrack.clips.find((c: any) => c.id === shotId);
                if (clip) {
                    clip.visual_url = permanentUrl;
                }
            }
            await supabase
                .from('episode_storyboards')
                .update({ timeline_data: updatedTimeline })
                .eq('episode_id', episodeId);
        }

        return NextResponse.json({ success: true, imageUrl: permanentUrl });

    } catch (err: any) {
        console.error(">>> [Shot Synthesis Error]", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
