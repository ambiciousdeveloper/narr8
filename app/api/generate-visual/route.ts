import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
    try {
        const { characterId, episodeId } = await req.json();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const replicateKey = process.env.REPLICATE_API_TOKEN;

        if (!supabaseUrl || !supabaseKey || !replicateKey) {
            throw new Error("Missing credentials or API keys");
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Fetch visual traits
        const { data: charData, error: charError } = await supabase
            .from('characters')
            .select('*, character_visuals(*)')
            .eq('id', characterId)
            .single();

        if (charError || !charData) throw new Error("Character not found");

        let visualInfo = charData.character_visuals?.[0];

        // [V7.1 Robustness] Auto-initialize if missing
        if (!visualInfo) {
            console.log(`>>> [Visual Gen] Initializing missing settings for ${characterId}`);
            const initialVisual = {
                character_id: characterId,
                project_id: charData.project_id,
                visual_traits_kr: charData.reinterpreted_personality_kr || "준비 중",
                style_guide_kr: "photorealistic, high detail, cinematic",
                seed: Math.floor(Math.random() * 2147483647),
                model_version: 'flux-pro'
            };
            const { data: newVal, error: initErr } = await supabase
                .from('character_visuals')
                .insert(initialVisual)
                .select()
                .single();

            if (initErr) throw new Error("Failed to initialize visual settings: " + initErr.message);
            if (!newVal) throw new Error("Visual settings insert returned no data");
            visualInfo = newVal;
        }

        // [V7.3 Prompt Refinement] Fetch Project Style Config
        const { data: projectConfig } = await supabase
            .from('project_master_config')
            .select('*')
            .eq('project_id', charData.project_id)
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
        const artStyleEn = projectConfig?.art_style_en || "photorealistic, high detail";
        const aestheticDnaKr = projectConfig?.aesthetic_dna_kr || "";
        const aestheticDnaEn = projectConfig?.aesthetic_dna_en || "cinematic lighting, 8k";
        const cinematographyKr = projectConfig?.cinematography_kr || "";
        const cinematographyEn = projectConfig?.cinematography_en || "shallow depth of field";

        const genreKr = projectConfig?.genre_kr || "";
        const genreEn = projectConfig?.genre_en || "Cinematic";
        const storyToneKr = projectConfig?.story_tone_kr || "";
        const storyToneEn = projectConfig?.story_tone_en || "Neutral";
        const worldCountryKr = projectConfig?.world_country_kr || "";
        const worldCountryEn = projectConfig?.world_country_en || "South Korea";
        const worldCityKr = projectConfig?.world_city_kr || "";
        const worldCityEn = projectConfig?.world_city_en || "Seoul";
        const culturalSettingKr = projectConfig?.cultural_setting_kr || "";
        const culturalSettingEn = projectConfig?.cultural_setting_en || "Modern Korean";

        const artStyle = episodeOverlay.art_style || artStyleEn;
        const aestheticDna = episodeOverlay.aesthetic_dna || aestheticDnaEn;
        const cinematography = episodeOverlay.cinematography || cinematographyEn;
        const genre = episodeOverlay.genre || genreEn;
        const tone = episodeOverlay.story_tone || storyToneEn;

        // character specific fields
        const charGenderKr = charData.reinterpreted_gender_kr || "";
        const charGenderEn = charData.reinterpreted_gender_en || "";
        const charAgeKr = charData.aging_evolution_kr || "";
        const charAgeEn = charData.aging_evolution_en || "";

        console.log(`>>> [Visual Gen] Generating for ${charData.reinterpreted_name_kr} (${charGenderKr}/${charGenderEn}) using Flux...`);
        console.log(`>>> [Style Sync] Art Style: ${artStyle}, Genre: ${genre}`);

        // 2. Prepare Refined Prompt (V28 Unified Style Detection)
        const stylizedKeywords = /ghibli|anime|illustration|cartoon|animation|shinkai|kyoto|mappa|ufotable|cyberpunk|noir|ink|painting|pixel|sketch|drawn|3d|render|cgi|unreal/i;
        const isStylized = stylizedKeywords.test(artStyle);

        // Critical: Prepend Art Style and suppression directives for maximum weight
        const textSuppressionPrefix = `### [CRITICAL: ABSOLUTELY NO TEXT, NO LETTERS, NO SIGNS, NO READABLE CHARACTERS, NO GIBBERISH WRITING] ###`;

        // [V13.2 Age Enforcement] Extract age to ensure it's not lost in prose descriptions
        const ageRawText = [charAgeEn, charAgeKr].join(' ').toLowerCase();
        const ageNumMatch = ageRawText.match(/(\d{2})(?:s|대|세|살|\s*years?)/);
        const ageTag = ageNumMatch ? `[AGE: ${ageNumMatch[1]}s]` : "";

        const stylePrefix = `[MASTER ART STYLE: ${artStyle}] ${ageTag} [Aesthetic: ${aestheticDna}] [Cinematography: ${cinematography}]`;
        const stylizedModifiers = isStylized ? "2D, hand-drawn, flat color, stylized art, masterpiece illustration, no realism, no photorealistic textures" : "";
        const negativePrompt = isStylized ? "### [NEGATIVE: PHOTOREALISTIC, REALISM, PHOTOGRAPH, RAW PHOTO, 3D RENDER] ###" : "";

        // Framing: use "illustration" for stylized and "photograph" for realistic
        const framing = isStylized ? "A high-quality stylized illustration" : "A professional high-fidelity photograph";
        const composition = "Upper body portrait, medium shot, centered composition";

        const prompt = `${textSuppressionPrefix} ${negativePrompt} ${stylePrefix} ${stylizedModifiers}
        ${framing} of a ${charGenderEn} ${worldCountryEn} character: ${charData.reinterpreted_name_kr}. 
        Composition: ${composition}.
        Character physical traits & age: ${charAgeEn} (${charAgeKr}). ${visualInfo.visual_traits_kr}. 
        Project Context:
        - Genre: ${genreEn} (${genreKr})
        - Story Tone: ${storyToneEn} (${storyToneKr})
        - World/Setting: ${worldCityEn}, ${worldCountryEn} (${worldCityKr}, ${worldCountryKr})
        - Cultural Background: ${culturalSettingEn} (${culturalSettingKr})`;

        // 3. Call Replicate (Flux Pro)
        // Using flux-pro model endpoint
        // [V7.2 Fix] Using named model endpoint for better stability
        const response = await fetch("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
            method: "POST",
            headers: {
                "Authorization": `Token ${replicateKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                input: {
                    prompt: prompt,
                    aspect_ratio: "3:4",
                    output_format: "webp",
                    output_quality: 80,
                    seed: visualInfo.seed
                },
            }),
        });

        if (!response.ok) {
            const errDetail = await response.text();
            throw new Error(`Replicate API failed: ${errDetail}`);
        }

        const prediction = await response.json();

        // 4. Poll for result (Simple polling for now, could be improved with webhooks)
        let resultUrl = null;
        let attempts = 0;
        const maxAttempts = 20;

        while (attempts < maxAttempts) {
            const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
                headers: { "Authorization": `Token ${replicateKey}` },
            });
            const pollData = await pollRes.json();

            if (pollData.status === "succeeded") {
                resultUrl = pollData.output[0];
                break;
            } else if (pollData.status === "failed") {
                throw new Error("Flux generation failed");
            }

            await new Promise(r => setTimeout(r, 2000));
            attempts++;
        }

        if (!resultUrl) throw new Error("Generation timed out");

        // --- Persistent Storage (V15.0) ---
        let permanentUrl = resultUrl;
        try {
            console.log(`>>> [Vault] Persisting image to Supabase Storage...`);
            const imageRes = await fetch(resultUrl);
            if (!imageRes.ok) throw new Error(`Failed to fetch from Replicate: ${imageRes.statusText}`);

            const imageBlob = await imageRes.blob();
            const fileName = `${characterId}_${Date.now()}.webp`;
            const filePath = `visuals/${fileName}`;

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

            // Get Public URL
            const { data: publicUrlData } = supabase.storage
                .from('vault')
                .getPublicUrl(filePath);

            if (publicUrlData?.publicUrl) {
                permanentUrl = publicUrlData.publicUrl;
                console.log(`>>> [Vault] Persistent URL created: ${permanentUrl}`);
            }
        } catch (persistErr) {
            console.error(">>> [Vault Persistence Failed] Falling back to temporary URL:", persistErr);
        }

        // 5. Update DB (Use permanentUrl)
        const { error: upErr } = await supabase
            .from('character_visuals')
            .update({ image_url: permanentUrl, prompt: prompt })
            .eq('character_id', characterId);

        if (upErr) throw upErr;

        // 6. [V14.0] Register in Permanent Vault
        try {
            await supabase.from('permanent_vault').insert({
                asset_type: 'IMAGE',
                storage_url: permanentUrl,
                asset_name: `${charData.reinterpreted_name_kr}_visual.webp`,
                source_project_id: charData.project_id,
                metadata: {
                    character_id: characterId,
                    prompt: prompt,
                    seed: visualInfo.seed,
                    model_version: 'flux-pro'
                }
            });
            console.log(`>>> [Vault] Image asset registered for ${charData.reinterpreted_name_kr}`);
        } catch (vaultErr) {
            console.error(">>> [Vault Error] Failed to register image:", vaultErr);
        }

        return NextResponse.json({ success: true, imageUrl: permanentUrl });

    } catch (err: any) {
        console.error(">>> [Visual Gen Error]", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
