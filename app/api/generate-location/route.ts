import { NextRequest, NextResponse } from 'next/server';
import { REPLICATE_MODEL_FLUX_SCHNELL, DEFAULT_LOCATION_VISUAL_STYLE, DEFAULT_PROJECT_WORLD } from '@/lib/constants';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
    try {
        const { locationId, episodeId } = await req.json();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const replicateKey = process.env.REPLICATE_API_TOKEN;

        if (!supabaseUrl || !supabaseKey || !replicateKey) {
            throw new Error("Missing credentials or API keys");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Fetch location data
        const { data: locData, error: locError } = await supabase
            .from('story_locations')
            .select('*')
            .eq('id', locationId)
            .single();

        if (locError || !locData) throw new Error("Location not found");

        // 2. Fetch Project Style Config
        const { data: projectConfig } = await supabase
            .from('project_master_config')
            .select('*')
            .eq('project_id', locData.project_id)
            .single();

        // [V18.0 Visual DNA Overlays]
        let episodeOverlay: any = {};
        if (episodeId) {
            console.log(`>>> [DNA Sync] Checking for episode-specific overlay: ${episodeId}`);
            const { data: epData } = await supabase
                .from('episodes')
                .select('style_dna_overlay')
                .eq('id', episodeId)
                .single();
            if (epData?.style_dna_overlay) {
                episodeOverlay = epData.style_dna_overlay;
                console.log(`>>> [DNA Sync] Found overlay:`, JSON.stringify(episodeOverlay));
            }
        }

        // [V29 Refinement] Explicitly use all requested fields
        const artStyleKr = projectConfig?.art_style_kr || "";
        const artStyleEn = projectConfig?.art_style_en || DEFAULT_LOCATION_VISUAL_STYLE.artStyleEn;
        const aestheticDnaKr = projectConfig?.aesthetic_dna_kr || "";
        const aestheticDnaEn = projectConfig?.aesthetic_dna_en || DEFAULT_LOCATION_VISUAL_STYLE.aestheticDnaEn;
        const cinematographyKr = projectConfig?.cinematography_kr || "";
        const cinematographyEn = projectConfig?.cinematography_en || DEFAULT_LOCATION_VISUAL_STYLE.cinematographyEn;

        const genreKr = projectConfig?.genre_kr || "";
        const genreEn = projectConfig?.genre_en || DEFAULT_LOCATION_VISUAL_STYLE.genreEn;
        const storyToneKr = projectConfig?.story_tone_kr || "";
        const storyToneEn = projectConfig?.story_tone_en || DEFAULT_LOCATION_VISUAL_STYLE.storyToneEn;
        const worldCountryKr = projectConfig?.world_country_kr || "";
        const worldCountryEn = projectConfig?.world_country_en || DEFAULT_PROJECT_WORLD.worldCountryEn;
        const worldCityKr = projectConfig?.world_city_kr || "";
        const worldCityEn = projectConfig?.world_city_en || DEFAULT_PROJECT_WORLD.worldCityEn;
        const culturalSettingKr = projectConfig?.cultural_setting_kr || "";
        const culturalSettingEn = projectConfig?.cultural_setting_en || DEFAULT_PROJECT_WORLD.culturalSettingEn;

        const artStyleFinal = episodeOverlay.art_style || artStyleEn;
        const aestheticDnaFinal = episodeOverlay.aesthetic_dna || aestheticDnaEn;
        const cinematographyRaw = episodeOverlay.cinematography || cinematographyEn; // Use a 'Raw' suffix to differentiate

        // Logic: Detect Interior vs Exterior to avoid "Landscape" keyword clashing with "Room"
        const nameText = (locData.name_en || locData.name_kr || "").toLowerCase();
        const descText = (locData.description_en || locData.description_kr || "").toLowerCase();
        const traitsText = (locData.visual_traits_en || locData.visual_traits_kr || "").toLowerCase();

        const interiorKeywords = [
            'room', 'office', 'interior', 'indoor', 'apartment', 'house', 'studio', 'inside', 'kitchen', 'bedroom', 'hallway', 'corridor', 'lobby', 'station', 'bus', 'train', 'classroom', 'auditorium',
            '방', '실내', '집안', '사무실', '내부', '복도', '버스', '강당', '교실', '로비', '역사'
        ];
        const isInterior = interiorKeywords.some(k => nameText.includes(k) || descText.includes(k));

        const stylizedKeywords = /ghibli|anime|illustration|cartoon|animation|shinkai|kyoto|mappa|ufotable|cyberpunk|noir|ink|painting|pixel|sketch|drawn|3d|render|cgi|unreal/i;
        const isStylized = stylizedKeywords.test(artStyleFinal);
        const stylizedModifiers = isStylized ? "2D, hand-drawn, flat color, stylized art, masterpiece illustration, no realism, no photorealistic textures" : "";
        const negativePrompt = isStylized ? "### [NEGATIVE: PHOTOREALISTIC, REALISM, PHOTOGRAPH, RAW PHOTO, 3D RENDER] ###" : "";

        // Dynamic Framing: Use "Environment" or "Scene" instead of forcing "Landscape" for interiors
        const framing = isStylized
            ? `A high-quality stylized ${isInterior ? 'interior' : 'environmental'} illustration`
            : `A professional high-fidelity cinematic ${isInterior ? 'interior scene' : 'environmental photograph'}`;

        const cinematography = isInterior
            ? (cinematographyRaw.includes('wide') ? "wide view from a corner" : "close-up environment detail")
            : cinematographyRaw;

        // Preparation: Master Location Prompt
        const textSuppressionPrefix = `### [CRITICAL: ABSOLUTELY NO TEXT, NO LETTERS, NO SIGNS, NO READABLE CHARACTERS, NO GIBBERISH WRITING] ###`;
        const stylePrefix = `[MASTER ART STYLE: ${artStyleFinal}] [Aesthetic: ${aestheticDnaFinal}] [Cinematography: ${cinematography}]`;
        const composition = isInterior ? 'Interior shot' : 'Exterior shot';

        // Handling 'Writing' or 'Script' in traits
        const writingTraitMod = (traitsText.includes('문자') || traitsText.includes('글씨') || traitsText.includes('script') || traitsText.includes('writing'))
            ? "Writing/text mentioned in the description should be represented by abstract, non-readable glowing symbols or geometric patterns only. Absolutely no real-world language characters or letters."
            : "";

        const prompt = `${textSuppressionPrefix} ${negativePrompt} ${stylePrefix} ${stylizedModifiers}
        ${framing} of the location: ${locData.name_en || locData.name_kr}. 
        Composition: ${composition}.
        Visual Context: ${locData.description_en || locData.description_kr}. 
        Key Visual Traits: ${locData.visual_traits_en || locData.visual_traits_kr || 'N/A'}.
        ${writingTraitMod}
        Project Context:
        - Genre: ${genreEn} (${genreKr})
        - Story Tone: ${storyToneEn} (${storyToneKr})
        - World/Setting: ${worldCityEn}, ${worldCountryEn} (${worldCityKr}, ${worldCountryKr})
        - Cultural Background: ${culturalSettingEn} (${culturalSettingKr})`;

        console.log(`>>> [Location Gen] Generating ${locData.name_kr} using Flux...`);

        // 3. Call Replicate (Flux Schnell for landscapes)
        const response = await fetch(`https://api.replicate.com/v1/models/${REPLICATE_MODEL_FLUX_SCHNELL}/predictions`, {
            method: "POST",
            headers: {
                "Authorization": `Token ${replicateKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                input: {
                    prompt: prompt,
                    aspect_ratio: "16:9", // Landscapes usually 16:9
                    output_format: "webp",
                    output_quality: 90
                },
            }),
        });

        if (!response.ok) throw new Error(`Replicate API failed: ${await response.text()}`);

        const prediction = await response.json();

        // 4. Polling
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

        // --- Persistent Storage (V15.0 Logic) ---
        let permanentUrl = resultUrl;
        try {
            console.log(`>>> [Vault] Persisting location image to Supabase Storage...`);
            const imageRes = await fetch(resultUrl);
            if (!imageRes.ok) throw new Error(`Failed to fetch from Replicate: ${imageRes.statusText}`);

            const imageBlob = await imageRes.blob();
            const fileName = `loc_${locationId}_${Date.now()}.webp`;
            const filePath = `locations/${fileName}`;

            const { error: uploadErr } = await supabase.storage
                .from('vault')
                .upload(filePath, imageBlob, {
                    contentType: 'image/webp',
                    upsert: true
                });

            if (uploadErr) {
                console.error(">>> [Vault Storage Error] Upload failed:", uploadErr);
                throw uploadErr;
            }

            const { data: publicUrlData } = supabase.storage.from('vault').getPublicUrl(filePath);
            if (publicUrlData?.publicUrl) {
                permanentUrl = publicUrlData.publicUrl;
                console.log(`>>> [Vault] Persistent URL created: ${permanentUrl}`);
            }
        } catch (persistErr) {
            console.error(">>> [Vault Persistence Failed] Falling back to temporary URL:", persistErr);
        }

        // 5. Update location_visuals
        const { error: visErr } = await supabase
            .from('location_visuals')
            .upsert({
                location_id: locationId,
                project_id: locData.project_id,
                image_url: permanentUrl,
                prompt: prompt,
                model_version: 'flux-schnell'
            });

        if (visErr) throw visErr;

        // 6. Register in Permanent Vault
        try {
            await supabase.from('permanent_vault').insert({
                asset_type: 'IMAGE',
                storage_url: permanentUrl,
                asset_name: `${locData.name_kr}_master_bg.webp`,
                source_project_id: locData.project_id,
                metadata: {
                    location_id: locationId,
                    category: 'LOCATION',
                    prompt: prompt
                }
            });
        } catch (vaultErr) {
            console.error(">>> [Vault Error] Registration failed:", vaultErr);
        }

        return NextResponse.json({ success: true, imageUrl: permanentUrl });

    } catch (err: any) {
        console.error(">>> [Location Gen Error]", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
