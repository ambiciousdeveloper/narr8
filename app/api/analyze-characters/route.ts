import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { projectId, suggestedCharacters, sceneText: inputSceneText } = body;
        const isAdapted = body.isAdapted === true || body.isAdapted === 'true'; // Strict boolean check
        const geminiKey = process.env.GEMINI_API_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey || !geminiKey) throw new Error("Credentials missing");

        const supabase = createClient(supabaseUrl, supabaseKey);
        const genAI = new GoogleGenerativeAI(geminiKey);

        // Name Normalizer for robust linkage
        const normalizeName = (name: string) => {
            if (!name) return "";
            return name.trim()
                .replace(/\s*[\(\[].*?[\)\]]$/, "") // Strip trailing (suffix) or [suffix]
                .trim();
        };
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // 1. Context Collection
        const { data: projectConfig } = await supabase.from('project_master_config').select('*').eq('project_id', projectId).single();
        const { data: summaries } = await supabase.from('story_summary').select('level, synthesized_body_kr').eq('project_id', projectId);
        const { data: existingChars } = await supabase.from('characters').select('id, reinterpreted_name_kr, reinterpreted_name_en, reinterpreted_role_kr, reinterpreted_tier_kr').eq('project_id', projectId);

        const projectDNA = projectConfig ?
            `[PROJECT NARRATIVE DNA]
            Genre: ${projectConfig.genre_en} (${projectConfig.genre_kr})
            Tone: ${projectConfig.story_tone_en} (${projectConfig.story_tone_kr})
            World: ${projectConfig.world_city_en} (${projectConfig.world_city_kr})
            Culture: ${projectConfig.cultural_setting_en} (${projectConfig.cultural_setting_kr})
            Art Style: ${projectConfig.art_style_en} (${projectConfig.art_style_kr})` : "None";

        const contextText = inputSceneText || summaries?.filter(s => s.level === 'L1').map(s => s.synthesized_body_kr).join('\n') || "";

        // Inventory Context for Semantic Deduplication
        const inventoryContext = existingChars?.map(c =>
            `- [ID: ${c.id}] Name: ${c.reinterpreted_name_kr} (${c.reinterpreted_name_en}), Role: ${c.reinterpreted_role_kr}, Tier: ${c.reinterpreted_tier_kr}`
        ).join('\n') || "None";

        // Suggested Slots (e.g. from L1 Blueprint)
        const slotsContext = suggestedCharacters ? `[TARGET CHARACTER SLOTS TO COMPLETE]\n${JSON.stringify(suggestedCharacters, null, 2)}` : "None";

        // 2. AI Casting & Profile Completion Instruction
        const prompt = `
            Task: Character Bible Master Forge. Establish or update character profiles for this narrative.
            Context: ${contextText}
            
            [IDENTITY INVENTORY: EXISTING RECORDS]
            ${inventoryContext}
            
            ${slotsContext !== "None" ? slotsContext : "[CASTING MODE: Discover up to 10 significant characters from context]"}

            [PROJECT CONTEXT]
            ${projectDNA}

            [CENTRALIZED IDENTITY RULES]
            1. **Reuse Absolute**: If a character in context matches an [EXISTING RECORD] semantically (even if spelling differs), YOU MUST use the Existing ID.
            2. **Profile Completion**: Generate Deep Personality, Trauma Matrix, Tone, and Visual Traits.
            3. **Gender Accuracy**: Explicitly determine the character's gender (MALE/FEMALE/NON-BINARY) based on context and name.
            4. **Thematic Visuals**: Visual traits MUST reflect the [PROJECT NARRATIVE DNA].
            5. **Descriptions Only**: provide high-quality narrative descriptions.

            Return ONLY a JSON array.
            Format: {
              "existing_id": "uuid if reused",
              "name_kr": "Name", "name_en": "Name",
              "role_kr": "Detailed Role", "role_en": "Role",
              "personality_kr": "Deep Personality", "personality_en": "Personality",
              "trauma_matrix_kr": { "type": "string (KO)", "depth": 1-10, "description": "text (KO)" },
              "trauma_matrix_en": { "type": "string (EN)", "depth": 1-10, "description": "text (EN)" },
              "turning_point_kr": "text (KO)", "turning_point_en": "text (EN)",
              "tier": "MAIN|SUPPORTING|EXTRA",
              "age_kr": "Description (KO)", "age_en": "Description (EN)",
              "gender_kr": "남성|여성|기타", "gender_en": "MALE|FEMALE|NON-BINARY",
              "tone": "Voice description",
              "traits": "Thematic visual traits description"
            }
        `;

        console.log(`>>> [Character Engine] Starting analysis for Project: ${projectId}, isAdapted: ${isAdapted}`);
        console.log(`>>> [Character Engine] Suggested Slots: ${Array.isArray(suggestedCharacters) ? suggestedCharacters.length : 0} items`);
        console.log(`>>> [Character Engine] Existing Inventory: ${existingChars?.length || 0} characters`);
        const result = await model.generateContent(prompt);
        const jsonMatch = result.response.text().match(/\[[\s\S]*\]/);
        const charList = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        let successCount = 0;
        let failCount = 0;
        let lastError = "";

        // 3. Centralized Save/Sync Logic
        for (const char of charList) {
            try {
                const searchName = (char.name_kr || "").trim();
                const normalizedSearchName = normalizeName(searchName);
                let targetId = char.existing_id || null;

                // [Step A] Find matching slot from suggestedCharacters (Casting Slots)
                const slot = Array.isArray(suggestedCharacters) ? suggestedCharacters.find((s: any) =>
                    normalizeName(s.reinterpreted_name_kr) === normalizedSearchName ||
                    normalizeName(s.reinterpreted_name_en) === normalizeName(char.name_en)
                ) : null;

                // [Step B] Semantic Resolution Fallback (Prioritizing Slot Mapping)
                if (!targetId && normalizedSearchName) {
                    // Fallback to direct name match
                    const match = existingChars?.find(c =>
                        normalizeName(c.reinterpreted_name_kr) === normalizedSearchName ||
                        normalizeName(c.reinterpreted_name_en) === normalizeName(char.name_en)
                    );
                    if (match) {
                        targetId = match.id;
                        console.log(`>>> [Character Sync] Semantic name match found for ${searchName}: ${targetId}`);
                    }
                }

                if (!targetId) {
                    console.log(`>>> [Character Sync] No match found for ${searchName}. Creating NEW row.`);
                }

                // Logic Selection: Strict Isolation between Original Source and Project Adaptation
                if (!isAdapted) {
                    console.log(`>>> [Character Engine] Skipping DB write in Original mode (Isolation v5.1)`);
                    continue;
                }

                const actualTier = (char.tier || char.reinterpreted_tier || 'EXTRA').toUpperCase();

                const payload: any = {
                    project_id: projectId,
                    reinterpreted_name_kr: searchName,
                    reinterpreted_name_en: char.name_en,
                    reinterpreted_role_kr: char.role_kr,
                    reinterpreted_role_en: char.role_en,
                    reinterpreted_personality_kr: char.personality_kr,
                    reinterpreted_personality_en: char.personality_en,
                    reinterpreted_tier_kr: actualTier.includes('MAIN') ? '주연' : actualTier.includes('SUPPORT') ? '조연' : '엑스트라',
                    reinterpreted_tier_en: actualTier.includes('MAIN') ? 'MAIN' : actualTier.includes('SUPPORT') ? 'SUPPORT' : 'EXTRA',

                    // Master Narrative Bible (Project Depth)
                    trauma_matrix_kr: char.trauma_matrix_kr,
                    trauma_matrix_en: char.trauma_matrix_en,
                    turning_point_kr: char.turning_point_kr,
                    turning_point_en: char.turning_point_en,
                    detailed_profile_kr: char.personality_kr,
                    detailed_profile_en: char.personality_en,

                    // Temporal Metadata
                    aging_evolution_kr: char.age_kr,
                    aging_evolution_en: char.age_en,

                    // [V8.0] Gender
                    reinterpreted_gender_kr: char.gender_kr,
                    reinterpreted_gender_en: char.gender_en
                };

                let charId;
                if (targetId) {
                    const { data: u, error: uErr } = await supabase.from('characters').update(payload).eq('id', targetId).select('id').single();
                    if (uErr) throw uErr;
                    charId = u?.id;
                } else {
                    const { data: i, error: iErr } = await supabase.from('characters').insert(payload).select('id').single();
                    if (iErr) throw iErr;
                    charId = i?.id;
                }

                if (charId) {
                    // [V6.0] Refined Asset Sync with Casting Broker Hooks
                    const voicePayload = {
                        character_id: charId,
                        project_id: projectId,
                        voice_persona_name: char.tone,
                        voice_settings: {
                            stability: 0.5,
                            similarity_boost: 0.75,
                            style: 0.0,
                            use_speaker_boost: true,
                            description: char.tone
                        }
                    };

                    const visualPayload = {
                        character_id: charId,
                        project_id: projectId,
                        visual_traits_kr: char.traits,
                        style_guide_kr: char.traits,
                        seed: Math.floor(Math.random() * 2147483647), // Initial seed for consistency
                        model_version: 'flux-pro',
                        prompt: char.traits // Initial prompt recommendation
                    };

                    await supabase.from('character_voices').upsert(voicePayload, { onConflict: 'character_id' });
                    await supabase.from('character_visuals').upsert(visualPayload, { onConflict: 'character_id' });

                    successCount++;
                }
            } catch (innerE: any) {
                failCount++;
                lastError = innerE.message;
            }
        }

        return NextResponse.json({ success: true, summary: { total_processed: charList.length, saved: successCount, failed: failCount, last_error: lastError } });

    } catch (err: any) {
        console.error(`>>> [Character Engine ERROR]`, err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
