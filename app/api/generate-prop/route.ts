import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { REPLICATE_MODEL_FLUX_SCHNELL, DEFAULT_VISUAL_STYLE, DEFAULT_PROJECT_WORLD } from '@/lib/constants';
import { createClient } from '@supabase/supabase-js';

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(req: NextRequest) {
    try {
        const { propId, episodeId } = await req.json();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Fetch Prop Data
        const { data: prop, error: propError } = await supabase
            .from('story_props')
            .select('*')
            .eq('id', propId)
            .single();

        if (propError || !prop) throw new Error("Prop not found");

        // 2. Fetch Project Config for Style
        const { data: projectConfig } = await supabase
            .from('project_master_config')
            .select('*')
            .eq('project_id', prop.project_id)
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
        const artStyleEn = projectConfig?.art_style_en || DEFAULT_VISUAL_STYLE.artStyleEn;
        const aestheticDnaKr = projectConfig?.aesthetic_dna_kr || "";
        const aestheticDnaEn = projectConfig?.aesthetic_dna_en || DEFAULT_VISUAL_STYLE.aestheticDnaEn;
        const culturalSettingKr = projectConfig?.cultural_setting_kr || "";
        const culturalSettingEn = projectConfig?.cultural_setting_en || DEFAULT_PROJECT_WORLD.culturalSettingEn;
        const worldCountryKr = projectConfig?.world_country_kr || "";
        const worldCountryEn = projectConfig?.world_country_en || DEFAULT_PROJECT_WORLD.worldCountryEn;
        const storyToneKr = projectConfig?.story_tone_kr || "";
        const storyToneEn = projectConfig?.story_tone_en || DEFAULT_VISUAL_STYLE.storyToneEn;

        const currentArtStyle = episodeOverlay.art_style || artStyleEn;
        const currentAestheticDna = episodeOverlay.aesthetic_dna || aestheticDnaEn;
        const currentCulturalSettingEn = episodeOverlay.cultural_setting || culturalSettingEn;
        const currentStoryToneEn = episodeOverlay.story_tone || storyToneEn;

        // [V29] Fetch Inventory from story_summary context_state
        let inventoryDesc = "";
        if (episodeId) {
            const { data: epRecord } = await supabase
                .from('episodes')
                .select('story_id')
                .eq('id', episodeId)
                .single();

            if (epRecord?.story_id) {
                const { data: storyRecord } = await supabase
                    .from('story_summary')
                    .select('source_metadata')
                    .eq('id', epRecord.story_id)
                    .single();

                if (storyRecord?.source_metadata?.context_state?.inventory) {
                    const inventory = storyRecord.source_metadata.context_state.inventory;
                    // Find matching prop in inventory object/array
                    if (typeof inventory === 'object') {
                        const matchingProp = Object.entries(inventory).find(([key, val]) =>
                            key.includes(prop.name_kr) || (typeof val === 'string' && val.includes(prop.name_kr))
                        );
                        if (matchingProp) inventoryDesc = `Inventory Context: ${JSON.stringify(matchingProp[1])}`;
                    }
                }
            }
        }

        // 3. Search for Detailed Prose (Step 4)
        const { data: episodes } = await supabase
            .from('episodes')
            .select('prose_kr')
            .eq('project_id', prop.project_id);

        const propNameLower = prop.name_kr.toLowerCase();
        const matchingLines = episodes
            ?.map(e => e.prose_kr)
            .filter(Boolean)
            .flatMap(p => p.split(/[.!?]\s+/))
            .filter(line => line.toLowerCase().includes(propNameLower))
            .slice(0, 5) // Get first 5 relevant lines
            .join(' ');

        const stylizedKeywords = /ghibli|anime|illustration|cartoon|animation|shinkai|kyoto|mappa|ufotable|cyberpunk|noir|ink|painting|pixel|sketch|drawn|3d|render|cgi|unreal/i;
        const isStylized = stylizedKeywords.test(currentArtStyle);

        // Critical: Prepend Art Style for maximum weight
        const textSuppressionPrefix = `### [CRITICAL: ABSOLUTELY NO TEXT, NO LETTERS, NO SIGNS, NO READABLE CHARACTERS, NO GIBBERISH WRITING] ###`;
        const stylePrefix = `[MASTER ART STYLE: ${currentArtStyle}] [Aesthetic: ${currentAestheticDna}] [Cinematography: Studio lighting, center-weighted, sharp focus]`;
        const stylizedModifiers = isStylized ? "2D, hand-drawn, flat color, stylized art, masterpiece illustration, no realism, no photorealistic textures" : "";
        const negativePrompt = isStylized ? "### [NEGATIVE: PHOTOREALISTIC, REALISM, PHOTOGRAPH, RAW PHOTO, 3D RENDER] ###" : "";

        // Framing: use "illustration" for stylized and "photograph" for realistic
        const framing = isStylized ? "A high-quality stylized illustration" : "A professional high-fidelity photograph";
        const composition = "Single item, product photography style, macro shot, isolated aesthetic";

        const prompt = `${textSuppressionPrefix} ${negativePrompt} ${stylePrefix} ${stylizedModifiers}
        ${framing} of the prop: ${prop.name_en || prop.name_kr}. 
        Composition: ${composition}.
        Visual Description: ${prop.description_en || prop.description_kr || prop.visual_traits_kr}. 
        ${inventoryDesc ? `Inventory Detail: ${inventoryDesc}\n` : ''}
        Narrative Context from Novel: ${matchingLines || prop.description_kr}
        Project Context:
        - Story Tone: ${currentStoryToneEn} (${storyToneKr})
        - World/Setting: ${worldCountryEn} (${worldCountryKr})
        - Cultural Background: ${currentCulturalSettingEn} (${culturalSettingKr})`;

        // 5. Trigger Generation
        console.log(`>>> Generating Prop Visual: ${prop.name_kr}`);
        const output = await replicate.run(
            REPLICATE_MODEL_FLUX_SCHNELL,
            { input: { prompt, aspect_ratio: "1:1" } }
        );

        const imageUrl = output && (output as any[])[0] ? (output as any[])[0].toString() : null;
        if (!imageUrl) throw new Error("Flux generation failed: No output URL");

        // --- Persistent Storage (V15.0 Logic) ---
        let permanentUrl = imageUrl;
        try {
            console.log(`>>> [Vault] Persisting prop image to Supabase Storage...`);
            const imageRes = await fetch(imageUrl);
            if (!imageRes.ok) throw new Error(`Failed to fetch from Replicate: ${imageRes.statusText}`);

            const imageBlob = await imageRes.blob();
            const fileName = `prop_${prop.id}_${Date.now()}.webp`;
            const filePath = `props/${fileName}`;

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

            const { data } = supabase.storage.from('vault').getPublicUrl(filePath);
            if (data?.publicUrl) {
                permanentUrl = data.publicUrl;
                console.log(`>>> [Vault] Persistent URL created: ${permanentUrl}`);
            }
        } catch (persistErr) {
            console.error(">>> [Vault Persistence Failed] Falling back to temporary URL:", persistErr);
        }

        // 6. Save to Vault & Link
        const { data: vaultItem, error: vaultError } = await supabase
            .from('permanent_vault')
            .insert({
                source_project_id: prop.project_id,
                storage_url: permanentUrl,
                asset_name: `${prop.name_kr}_visual.webp`,
                asset_type: 'IMAGE',
                metadata: {
                    source: 'replicate',
                    model: 'flux-schnell',
                    prompt: prompt,
                    prop_id: prop.id,
                    episode_id: episodeId
                },
                tags: ['prop', prop.name_en]
            })
            .select()
            .single();

        if (vaultError) console.error(">>> Vault registration failed:", vaultError);

        // 7. Insert into prop_visuals (History)
        const { error: visceralError } = await supabase
            .from('prop_visuals')
            .insert({
                prop_id: propId,
                project_id: prop.project_id,
                image_url: permanentUrl,
                vault_id: vaultItem?.id,
                prompt: prompt
            });

        if (visceralError) console.error(">>> Prop Visual registration failed:", visceralError);

        const { error: linkError } = await supabase
            .from('story_props')
            .update({
                image_url: permanentUrl,
                vault_id: vaultItem?.id
            })
            .eq('id', propId);

        if (linkError) console.error(">>> Prop link update failed:", linkError);

        return NextResponse.json({
            success: true,
            imageUrl: permanentUrl,
            vaultId: vaultItem?.id
        });

    } catch (error: any) {
        console.error(">>> Prop Visual Gen Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
