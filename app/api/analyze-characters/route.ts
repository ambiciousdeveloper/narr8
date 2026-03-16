import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODEL } from '@/lib/constants';

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
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        // 1. Context Collection
        const { data: projectConfig } = await supabase.from('project_master_config').select('*').eq('project_id', projectId).single();
        const { data: summaries } = await supabase.from('story_summary').select('level, synthesized_body_kr').eq('project_id', projectId);
        const { data: existingChars } = await supabase.from('characters').select('id, reinterpreted_name_kr, reinterpreted_name_en, reinterpreted_role_kr, reinterpreted_tier_kr').eq('project_id', projectId);

        // 배경 국가 기반 이름 규칙 동적 생성
        const worldCountry: string = projectConfig?.world_country_kr || projectConfig?.world_country_en || '';
        const worldCity: string = projectConfig?.world_city_kr || projectConfig?.world_city_en || '';
        const namingRule = buildCharacterNamingRule(worldCountry, worldCity);

        const projectDNA = projectConfig ?
            `[PROJECT NARRATIVE DNA]
            Genre: ${projectConfig.genre_en} (${projectConfig.genre_kr})
            Tone: ${projectConfig.story_tone_en} (${projectConfig.story_tone_kr})
            Country: ${projectConfig.world_country_en} (${projectConfig.world_country_kr})
            World/City: ${projectConfig.world_city_en} (${projectConfig.world_city_kr})
            Culture: ${projectConfig.cultural_setting_en} (${projectConfig.cultural_setting_kr})
            Art Style: ${projectConfig.art_style_en} (${projectConfig.art_style_kr})

            [NAMING RULE — MANDATORY]
            ${namingRule}` : "None";

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
            6. **NAMING RULE (CRITICAL)**: ${namingRule} — 이 규칙을 어기는 이름(예: 배경이 일본인데 한국식 성씨 사용)은 절대 생성하지 마라.

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
        const rawText = result.response.text();
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        let charList: any[] = [];
        if (jsonMatch) {
            try {
                charList = JSON.parse(jsonMatch[0]);
            } catch (parseErr) {
                console.error(">>> [Character Engine] JSON parse failed:", parseErr);
                charList = [];
            }
        }

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

/**
 * buildCharacterNamingRule
 * 배경 국가에 따라 캐릭터 이름 생성 규칙을 반환합니다.
 * analyze-characters 프롬프트에 주입되어 국가와 맞지 않는 이름 생성을 방지합니다.
 */
function buildCharacterNamingRule(worldCountry: string, worldCity: string): string {
    const c = (worldCountry || '').toLowerCase();
    const location = [worldCity, worldCountry].filter(Boolean).join(', ');
    const hint = location ? `배경(${location})` : '프로젝트 배경';

    if (c.includes('japan') || c.includes('일본')) {
        return `${hint}이 일본이므로 반드시 일본식 이름을 사용하라. 성씨 예: 霧島·黒木·白銀·緋山·蒼井·夜刀·朧·雪代 등. 이름 예: 蒼·零·渉·夜叉·朔·紫苑 등. 한국식 성씨(김·이·박·최·정 등)는 절대 사용 금지.`;
    }
    if (c.includes('china') || c.includes('중국')) {
        return `${hint}이 중국이므로 반드시 중국식 이름을 사용하라. 성씨 예: 鄒·聶·靳·顧·謝·燕·蕭·凌 등. 한국식 성씨는 절대 사용 금지.`;
    }
    if (c.includes('korea') || c.includes('한국')) {
        return `${hint}이 한국이므로 한국식 이름을 사용하되, AI가 자주 반복하는 클리셰 이름(강태준·김민준·이서연 등)은 절대 사용 금지. 개성 있는 성씨(범·제갈·남궁·견·선우·독고 등)를 권장.`;
    }
    if (c.includes('usa') || c.includes('미국') || c.includes('america')) {
        return `${hint}이 미국이므로 영미식 이름을 사용하라. 한국·일본·중국식 성씨는 사용 금지 (해당 문화권 캐릭터로 명시된 경우 제외).`;
    }
    if (c.includes('europe') || c.includes('유럽') || c.includes('uk') || c.includes('영국') || c.includes('france') || c.includes('프랑스')) {
        return `${hint}이 유럽이므로 해당 국가 문화에 맞는 유럽식 이름을 사용하라. 아시아계 성씨는 사용 금지 (해당 문화권 캐릭터로 명시된 경우 제외).`;
    }
    if (!worldCountry) {
        return `배경 국가가 명시되지 않았습니다. 세계관의 문화적 맥락에 맞는 이름을 사용하고, 특정 국가 성씨를 임의로 적용하지 마라.`;
    }
    return `${hint}의 문화·언어 체계에 맞는 이름을 사용하라. 배경과 관련 없는 국가의 이름 체계를 임의로 사용하지 마라.`;
}
