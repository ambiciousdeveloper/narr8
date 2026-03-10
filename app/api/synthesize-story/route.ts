import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * [이사님 전용 필력 초격차 엔진 V5 - 비용 0원 고도화 패키지]
 * 1. Negative Constraint: AI 전용 금지어(Blacklist) 50종 적용
 * 2. Chain of Density (CoD): 명사 밀도 및 오감 데이터 3단계 농축
 * 3. Self-Critic Loop: 내부 비평가 페르소나를 통한 문장 리터칭
 */
export async function POST(req: NextRequest) {
    try {
        const {
            projectId,
            storyId,
            lang = 'KO',
            customConcept,
            format = 'NOVEL',
            language = 'KO',
            mode = 'CREATE',
            refText = ''
        } = await req.json();

        // [V6.1] Fetch targetLength from project_master_config.target_minutes
        const { data: projectConfig } = await supabase
            .from('project_master_config')
            .select('target_minutes')
            .eq('project_id', projectId)
            .single();

        const targetLength = projectConfig?.target_minutes || 5; // Default: 5 minutes (Frontend default)

        console.log('\n=== [VOLUME CONTROL DEBUG] ===');
        console.log(`[1] DB Query: target_minutes = ${projectConfig?.target_minutes}`);
        console.log(`[2] Language: ${language}, Format: ${format}`);
        console.log(`[3] Final targetLength (minutes) = ${targetLength}`);
        console.log(`[4] Note: CreativeScribe will apply language-specific ratio (KO_Novel: 0.42, KO_Script: 0.50)`);

        // 1. 기초 데이터 및 인프라 로드
        const { data: project } = await supabase.from('project_master_config').select('*').eq('project_id', projectId).single();
        if (!project) throw new Error('Project not found');

        const { data: story } = await supabase.from('story_summary').select('*').eq('id', storyId).single();
        if (!story) throw new Error('Story item not found');

        const { data: allCharacters } = await supabase.from('characters').select('*').eq('project_id', projectId);

        // [New] CLM Filter: Only include ACTIVE characters or those mentioned in the current customConcept (Ghost Mode)
        const activeCharacters = allCharacters?.filter(c => {
            const isActive = (c.status === 'ACTIVE' || !c.status);
            const isMentioned = customConcept && (c.reinterpreted_name_kr && customConcept.includes(c.reinterpreted_name_kr));
            return isActive || isMentioned;
        }) || [];

        const charContext = activeCharacters.map(c => {
            const statusTag = c.status && c.status !== 'ACTIVE' ? ` [STATUS: ${c.status}]` : '';
            return `- ${c.reinterpreted_name_kr} (${c.reinterpreted_name_en}): ${c.reinterpreted_role_kr}${statusTag}`;
        }).join('\n');

        // RAG & DSPy 재료 확보
        const { data: litAssets } = await supabase.from('literary_assets').select('content_kr, origin_source').limit(3);
        const { data: goldStandards } = await supabase.from('writing_gold_standards').select('*').limit(5);

        const level = project.adaptation_level || 3;

        // [Continuity] 이전 에피소드들의 각색 결과를 로드하여 일관성 유지 (Story Chronicle)
        const { data: previousEpisodes } = await supabase
            .from('story_summary')
            .select('id, order_index, synthesized_title_kr, synthesized_body_kr, source_metadata')
            .eq('project_id', projectId)
            .eq('hierarchy_group', story.hierarchy_group)
            .lt('order_index', story.order_index)
            .eq('is_synthesized', true)
            .order('order_index', { ascending: true });

        const chronicle = previousEpisodes?.map(ep =>
            `Ep ${ep.order_index} [${ep.synthesized_title_kr}]: ${ep.synthesized_body_kr?.substring(0, 300)}...`
        ).join('\n\n') || "첫 번째 에피소드입니다.";

        // [World Bible & Blueprint] L1 원천 데이터에서 세계관 설계도(Blueprint) 추출
        const { data: rootStory } = await supabase
            .from('story_summary')
            .select('synthesized_body_kr')
            .eq('project_id', projectId)
            .eq('hierarchy_group', 'L1')
            .single();


        // [New] Previous Episode Context State (Inventory, HP, etc.)
        let prevContextStateObj: any = null;
        if (chronicle && previousEpisodes && previousEpisodes.length > 0) {
            const lastEp = previousEpisodes[previousEpisodes.length - 1];
            const { data: lastEpData } = await supabase
                .from('story_summary')
                .select('source_metadata')
                .eq('id', lastEp.id)
                .single();

            if (lastEpData?.source_metadata?.context_state) {
                prevContextStateObj = lastEpData.source_metadata.context_state;
            }
        }
        const prevContextState = prevContextStateObj ? JSON.stringify(prevContextStateObj, null, 2) : "No previous state.";

        // [New] L2 Context (Volume Story) - Fetched if parent_id exists
        let parentContext = "";
        let foreshadowingNote = "";
        if (story.parent_id) {
            const { data: parentStory } = await supabase
                .from('story_summary')
                .select('synthesized_title_kr, synthesized_body_kr, source_metadata')
                .eq('id', story.parent_id)
                .single();

            if (parentStory) {
                parentContext = `
          [BROADER CONTEXT: CURRENT VOLUME (${parentStory.synthesized_title_kr})]
          ${parentStory.synthesized_body_kr || "No summary available."}
          
          [L2 ROADMAP & GUIDELINES]
          ${JSON.stringify(parentStory.source_metadata?.roadmap || "Follow the natural flow.", null, 2)}
                `;

                // Check if there is a specific foreshadowing note for this episode index? 
                // For now, we pass the general foreshadowing notes of the volume.
                if (parentStory.source_metadata?.foreshadowing_notes) {
                    foreshadowingNote = `[FORESHADOWING INSTRUCTION]: ${parentStory.source_metadata.foreshadowing_notes}`;
                }
            }
        }

        // [New] Forward-Looking Context (Next Episode Preview) 
        let nextEpisodeContext = "";
        const { data: nextEpisode } = await supabase
            .from('story_summary')
            .select('synthesized_title_kr, synthesized_body_kr')
            .eq('project_id', projectId)
            .eq('hierarchy_group', story.hierarchy_group)
            .eq('order_index', story.order_index + 1)
            .maybeSingle();

        if (nextEpisode) {
            nextEpisodeContext = `
          [FUTURE CONNECTION: NEXT EPISODE PREVIEW]
          - Next Episode Title: ${nextEpisode.synthesized_title_kr}
          - Next Episode Goal: ${nextEpisode.synthesized_body_kr || "No summary available."}
          (Instruction: Subtly foreshadow or prepare the narrative path to reach this future goal.)
            `;
        }

        // [Step 2] 에이전트 동적 로드 (물리적 분리 최적화)
        const { GrandDirector } = await import('../../../agents/chamber-1-director');

        // [Blueprint Context] Fetch existing blueprint (Prefer ADAPTED for synthesis)
        const { data: blueprintData } = await supabase
            .from('story_blueprints')
            .select('*')
            .eq('project_id', projectId)
            .eq('blueprint_type', 'ADAPTED')
            .maybeSingle();

        const { data: originalBp } = await supabase
            .from('story_blueprints')
            .select('*')
            .eq('project_id', projectId)
            .eq('blueprint_type', 'ORIGINAL')
            .maybeSingle();

        // [V5.9 Anti-Leakage] Build Name Swap Map (Characters + Glossary)
        const nameMap: Record<string, string> = {};
        const forbiddenNames: string[] = [];

        // 1. Extract from Character Arcs
        if (originalBp?.character_arcs) {
            try {
                const arcs = typeof originalBp.character_arcs === 'string'
                    ? JSON.parse(originalBp.character_arcs)
                    : originalBp.character_arcs;

                arcs.forEach((char: any) => {
                    const original = char.original_name_kr || char.name_kr;
                    const reinterpreted = char.reinterpreted_name_kr;
                    if (original && reinterpreted) {
                        nameMap[original] = reinterpreted;
                        forbiddenNames.push(original);
                    }
                    if (char.original_name_en) forbiddenNames.push(char.original_name_en);
                });
            } catch (e) {
                console.warn(">>> Error parsing character arcs for swap map:", e);
            }
        }

        // 1.5. FALLBACK: Direct Query from characters table
        // If nameMap is empty from blueprint, fetch directly from DB
        if (Object.keys(nameMap).length === 0) {
            try {
                const { data: dbCharacters } = await supabase
                    .from('characters')
                    .select('original_name_kr, original_name_en, reinterpreted_name_kr, reinterpreted_name_en, aliases')
                    .eq('project_id', projectId)
                    .eq('status', 'ACTIVE');

                if (dbCharacters && dbCharacters.length > 0) {
                    console.log(`>>> Found ${dbCharacters.length} characters in DB for nameMap`);
                    dbCharacters.forEach((char: any) => {
                        // Korean mapping
                        if (char.original_name_kr && char.reinterpreted_name_kr) {
                            nameMap[char.original_name_kr] = char.reinterpreted_name_kr;
                            forbiddenNames.push(char.original_name_kr);
                        }
                        // English mapping  
                        if (char.original_name_en && char.reinterpreted_name_en) {
                            nameMap[char.original_name_en] = char.reinterpreted_name_en;
                            forbiddenNames.push(char.original_name_en);
                        }
                        // Aliases
                        if (char.aliases && Array.isArray(char.aliases)) {
                            char.aliases.forEach((alias: string) => {
                                if (char.reinterpreted_name_kr) {
                                    nameMap[alias] = char.reinterpreted_name_kr;
                                    forbiddenNames.push(alias);
                                }
                            });
                        }
                    });
                } else {
                    console.warn(">>> WARNING: No characters found in DB. nameMap is empty. IP protection may fail!");
                }
            } catch (e) {
                console.error(">>> Error querying characters table:", e);
            }
        }

        // 2. Extract from Glossary (World Terms) - ZIP Original with Adapted
        if (originalBp?.glossary && blueprintData?.glossary) {
            try {
                const originalGlossary = typeof originalBp.glossary === 'string' ? JSON.parse(originalBp.glossary) : originalBp.glossary;
                const adaptedGlossary = typeof blueprintData.glossary === 'string' ? JSON.parse(blueprintData.glossary) : blueprintData.glossary;

                console.log(`>>> Building Name Swap Map from Glossaries: ${originalGlossary.length} items`);
                originalGlossary.forEach((item: any, idx: number) => {
                    const adaptedItem = adaptedGlossary[idx];
                    // Map original Korean term to adapted Korean term
                    if (item.term_kr && adaptedItem?.term_kr && item.term_kr !== adaptedItem.term_kr) {
                        nameMap[item.term_kr] = adaptedItem.term_kr;
                        forbiddenNames.push(item.term_kr);
                    }
                    // Map original English term to adapted English term
                    if (item.term_en && adaptedItem?.term_en && item.term_en !== adaptedItem.term_en) {
                        nameMap[item.term_en] = adaptedItem.term_en;
                        forbiddenNames.push(item.term_en);
                    }
                    // Ensure original terms are in forbidden list regardless of mapping
                    if (item.term_kr) forbiddenNames.push(item.term_kr);
                    if (item.term_en) forbiddenNames.push(item.term_en);
                });
            } catch (e) {
                console.warn(">>> Error parsing glossary for swap map:", e);
            }
        }

        // Helper to clean toxic original names and era leaks from any text
        const cleanText = (text: string) => {
            if (!text) return "";
            let cleaned = text;

            // 1. Core Name Swap Map (gi)
            Object.entries(nameMap).forEach(([oldName, newName]) => {
                const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                cleaned = cleaned.replace(new RegExp(escaped, 'gi'), newName);
            });

            // 2. Era Guard: If AI hallucinates a specific year but project target is different
            const targetEra = project.target_era;
            if (targetEra && !text.includes(targetEra)) {
                // Heuristic: Replace 4-digit years with targetEra if it exists
                cleaned = cleaned.replace(/\d{4}년/g, `${targetEra}년`);
                cleaned = cleaned.replace(/\d{4}/g, targetEra);
            }

            return cleaned;
        };
        // [V6.0 Cleanup Logic Refined]
        const cleanedRootSummary = cleanText(rootStory?.synthesized_body_kr?.substring(0, 1000) || "");
        const cleanedChronicle = cleanText(chronicle);
        const cleanedParentContext = cleanText(parentContext);
        const cleanedCharContext = cleanText(charContext || "정보 없음");

        const worldSettings = `
          [ABSOLUTE GROUND TRUTH: WORLD SETTINGS]
          - Genre: ${project.genre_kr || project.target_genre || 'Fantasy'}
          - Tone: ${project.story_tone_kr || project.story_tone || 'Mysterious'}
          - World/City: ${project.world_city_kr || 'Unknown City'}
          - Cultural Background: ${project.cultural_setting_kr || 'N/A'}
          - Art Style: ${project.art_style_kr || project.art_style || 'High Fidelity'}

          [FORBIDDEN NAMES (DO NOT USE)]
          ${forbiddenNames.join(', ')}

          [MANDATORY NAME SUBSTITUTIONS]
          ${Object.entries(nameMap).map(([old, next]) => `- IF you see "${old}", YOU MUST WRITE "${next}"`).join('\n')}

          [ABSOLUTE TIME ANCHOR]
          - Current Year: ${project.target_era || '2060년'}
          - **CRITICAL**: Do NOT jump to other years (e.g., 2077) unless explicitly instructed in the Beat.

          [REFERENCE CONTEXT (PRE-CLEANED)]
          - Previous L1 Summary: ${cleanedRootSummary}
          ${cleanedParentContext}

          [LITERARY REFERENCE: DESCRIPTION GOLD STANDARD]
          ${litAssets?.map(a => a.content_kr).join('\n\n') || "표현 가이드 없음"}

          [NARRATIVE STATE (MUST INHERIT)]
          - Previous Context State: ${prevContextState}
          - Transition Policy: Read the end of the previous segment to avoid repetitive openings.
          ${foreshadowingNote}
          ${nextEpisodeContext}
        `;


        // Final BP for reference
        const activeBlueprint = blueprintData || originalBp;

        // [Step 1] Grand Director에게 조율 및 비트 확장 요청
        await GrandDirector.orchestrate('STORY_SYNTHESIS', { projectId, storyId });

        // [Step 2] Scribe Agent 준비 및 비트 확장
        let finalBeats: string[] = [];
        let agentResult;

        if (format === 'SCRIPT') {
            // [NOVEL-FIRST ADAPTATION]
            const { data: existingNovelEpisode } = await supabase
                .from('episodes')
                .select('prose_kr, prose_en')
                .eq('story_id', storyId)
                .maybeSingle();

            const novelSourceText = language === 'KO'
                ? (existingNovelEpisode?.prose_kr as string | null)
                : (existingNovelEpisode?.prose_en as string | null);

            if (novelSourceText) {
                console.log(`>>> [NOVEL-FIRST] Novel found (${novelSourceText.length} chars). Extracting beats from novel prose to ensure sync.`);
                finalBeats = await GrandDirector.extractBeatsFromProse(novelSourceText, cleanedCharContext);
                console.log(`>>> [NOVEL-FIRST] Successfully extracted ${finalBeats.length} beats from novel prose.`);
            } else {
                console.log(`>>> [NOVEL-FIRST] No novel found. Falling back to synopsis expansion.`);
                finalBeats = await GrandDirector.expandBeats(
                    cleanText(customConcept || story.original_body_kr),
                    worldSettings,
                    cleanedCharContext
                );
            }

            const { ScriptScribe } = await import('../../../agents/chamber-2-5-script');
            agentResult = await ScriptScribe.synthesize(
                finalBeats.map((beat: string) => cleanText(beat)).join('\n\n'),
                cleanedCharContext,
                activeBlueprint,
                level,
                cleanedChronicle,
                worldSettings,
                'SCRIPT',
                language,
                targetLength,
                mode,
                novelSourceText || refText // Pass novel as refText if available
            );
        } else {
            // [NOVEL MODE] Expand synopsis into beats
            console.log(">>> [NOVEL MODE] Expanding synopsis into narrative beats...");
            finalBeats = await GrandDirector.expandBeats(
                cleanText(customConcept || story.original_body_kr),
                worldSettings,
                cleanedCharContext
            );

            const { NovelScribe } = await import('../../../agents/chamber-2-4-novel');
            agentResult = await NovelScribe.synthesize(
                finalBeats.map((beat: string) => cleanText(beat)).join('\n\n'),
                cleanedCharContext,
                activeBlueprint,
                level,
                cleanedChronicle,
                worldSettings,
                'NOVEL',
                language,
                targetLength,
                mode,
                refText
            );
        }

        if (!agentResult.success) {
            throw new Error(`[Chamber 2 Error] ${agentResult.error}`);
        }

        // [V6.0 Post-Cleaning] Final safety check on the generated content
        const output = agentResult.data; // RESTORED
        const rawOutput = output.synthesized_kr;
        const finalizedStory = cleanText(rawOutput);
        const finalizedTitle = cleanText(output.synthesized_title_kr || output.title_kr || "No Title");
        const finalizedReasoning = cleanText(output.reasoning || "");

        // 1. [story_summary] Synopsis and Meta Update
        const summaryPayload: any = {
            is_synthesized: true,
            last_synthesized_at: new Date().toISOString(),
            analysis_status: 'synthesized',
            source_metadata: {
                ...story.source_metadata,
                adaptation_reasoning: finalizedReasoning,
                applied_adaptation_level: level,
                engine_v: "zero-cost-hyper-v7-hardened",
                context_state: output.source_metadata?.context_state || {},
                foreshadowing_applied: output.source_metadata?.foreshadowing_applied || "None"
            }
        };

        if (language === 'KO') {
            summaryPayload.synthesized_title_kr = finalizedTitle;
            // No longer overwriting synthesized_body_kr with the full prose in NOVEL mode
            // to keep the synopsis intact for the left-side view.
            if (format !== 'NOVEL') summaryPayload.synthesized_body_kr = finalizedStory;
            // Save Audio Palette overrides (prefer KO if available, fallback to AI suggestion)
            summaryPayload.audio_palette_bgm_kr = output.audio_palette_bgm || undefined;
            summaryPayload.audio_palette_ambience_kr = output.audio_palette_ambience || undefined;
        } else {
            summaryPayload.synthesized_title_en = finalizedTitle;
            if (format !== 'NOVEL') summaryPayload.synthesized_body_en = finalizedStory;
            summaryPayload.audio_palette_bgm_en = output.audio_palette_bgm || undefined;
            summaryPayload.audio_palette_ambience_en = output.audio_palette_ambience || undefined;
        }

        await supabase.from('story_summary').update(summaryPayload).eq('id', storyId);

        // 2. [episodes] Full Prose Update (Novel/Script)
        // [New] Fetch existing volume_stats to prevent overwriting between Novel/Script
        const { data: existingEpisode } = await supabase
            .from('episodes')
            .select('volume_stats')
            .eq('story_id', storyId)
            .maybeSingle();

        const currentVolumeStats = existingEpisode?.volume_stats || {};
        const newStats = {
            word_count: output.body_kr?.length || output.synthesized_kr?.length || 0,
            updated_at: new Date().toISOString()
        };

        const episodePayload: any = {
            story_id: storyId,
            project_id: projectId,
            ep_order: story.order_index,
            title_kr: story.synthesized_title_kr || output.title_kr,
            title_en: story.synthesized_title_en || output.title_en,
            synopsis_kr: story.synthesized_body_kr || output.synthesized_kr?.substring(0, 500),
            synopsis_en: story.synthesized_body_en || output.synthesized_en?.substring(0, 500),
            updated_at: new Date().toISOString(),
            volume_stats: {
                ...currentVolumeStats,
                [format.toLowerCase()]: newStats
            }
        };

        if (format === 'NOVEL') {
            if (language === 'KO') episodePayload.prose_kr = output.synthesized_kr || output.body_kr;
            else episodePayload.prose_en = output.synthesized_en || output.body_en;
        } else {
            if (language === 'KO') episodePayload.script_kr = output.synthesized_kr || output.body_kr;
            else episodePayload.script_en = output.synthesized_en || output.body_en;
        }

        // UPSERT into episodes
        const { error: epError } = await supabase
            .from('episodes')
            .upsert(episodePayload, { onConflict: 'story_id' });

        if (epError) console.error(">>> Error saving to episodes table:", epError);

        // 2. [Adapted Character Update] 각색 캐릭터 정보 동기화 (v5.1 Adaptation Focus)
        // [NOVEL-ONLY] 캐릭터 DB 확정은 소설(NOVEL) 생성 시에만 수행.
        // 대본(SCRIPT) 생성 시에는 캐릭터 DB를 갱신하지 않아 소설 캐릭터 오염 방지.

        /**
         * [CHARACTER GUARDIAN] - 비인물/집단/원작 고유명사가 DB에 저장되는 것을 영구 차단
         * 아래 기준 중 하나라도 해당하면 캐릭터 저장을 거부합니다.
         */
        const isValidCharacter = (char: any): boolean => {
            const name = (char.reinterpreted_name_kr || char.new_name || '').trim();
            if (!name) return false;

            // 1. 필수 필드 없으면 거부
            if (!char.reinterpreted_role_kr && !char.new_role && !char.role_kr) {
                console.warn(`>>> [CHARACTER GUARDIAN] Rejected (no role): "${name}"`);
                return false;
            }

            // 2. 집단·군중·개념을 나타내는 복수/집합 명사 패턴 차단
            const collectivePatterns = [
                /들$/, /집단$/, /세력$/, /무리$/, /조직$/, /군중$/, /영혼$/, /군상$/,
                /들의/, /집합/, /그룹/, /군단/, /부대/, /종족/
            ];
            if (collectivePatterns.some(p => p.test(name))) {
                console.warn(`>>> [CHARACTER GUARDIAN] Rejected (collective entity): "${name}"`);
                return false;
            }

            // 3. Prevent generic or known blocked patterns in character names
            const blockedPatterns: RegExp[] = []; // Intentionally left empty for project-specific customization
            if (blockedPatterns.some(p => p.test(name))) {
                console.warn(`>>> [CHARACTER GUARDIAN] Rejected (common cliché pattern): "${name}"`);
                return false;
            }

            // 4. 장소·사물·개념만 있는 단어 차단 (접미사 기반)
            const nonPersonSuffixes = [/감옥$/, /시설$/, /장소$/, /공간$/, /시스템$/];
            if (nonPersonSuffixes.some(p => p.test(name))) {
                console.warn(`>>> [CHARACTER GUARDIAN] Rejected (non-person entity): "${name}"`);
                return false;
            }

            return true;
        };

        if (format !== 'SCRIPT' && output.characters && output.characters.length > 0) {
            const validChars = output.characters.filter(isValidCharacter);
            console.log(`>>> Character Guardian: ${output.characters.length} total → ${validChars.length} valid, ${output.characters.length - validChars.length} blocked.`);

            for (const char of validChars) {
                // Find existing adaptation by reinterpreted name 
                const targetName = char.reinterpreted_name_kr || char.new_name;
                const { data: existingChar } = await supabase
                    .from('characters')
                    .select('id')
                    .eq('project_id', projectId)
                    .eq('reinterpreted_name_kr', targetName)
                    .maybeSingle();

                const actualTier = (char.reinterpreted_tier || char.tier || 'EXTRA').toUpperCase();

                const payload: any = {
                    project_id: projectId,
                    reinterpreted_name_kr: targetName,
                    reinterpreted_name_en: char.reinterpreted_name_en || char.new_name_en || char.name_en,
                    reinterpreted_role_kr: char.reinterpreted_role_kr || char.new_role || char.role_kr,
                    reinterpreted_role_en: char.reinterpreted_role_en || char.role_en,
                    reinterpreted_personality_kr: char.reinterpreted_personality_kr || char.new_description || char.personality_kr,
                    reinterpreted_personality_en: char.reinterpreted_personality_en || char.personality_en,
                    reinterpreted_tier_kr: actualTier.includes('MAIN') ? '주연' : actualTier.includes('SUPPORT') ? '조연' : '엑스트라',
                    reinterpreted_tier_en: actualTier.includes('MAIN') ? 'MAIN' : actualTier.includes('SUPPORT') ? 'SUPPORT' : 'EXTRA',
                    // Preserve existing matrices if not provided by the current agent
                    trauma_matrix_kr: char.trauma_matrix_kr || char.trauma_matrix || undefined,
                    trauma_matrix_en: char.trauma_matrix_en || undefined
                };

                // Remove undefined keys
                Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

                if (existingChar) {
                    await supabase.from('characters').update(payload).eq('id', existingChar.id);
                } else {
                    console.log(`>>> Creating NEW character record: ${payload.reinterpreted_name_kr}`);
                    await supabase.from('characters').insert(payload);
                }
            }
        } else if (format === 'SCRIPT') {
            console.log(`>>> [SCRIPT MODE] Character DB sync skipped. Characters are read-only during screenplay generation.`);
        }

        // 3. [NEW] Narrative Audit (Lifecycle Management & State Persistence)
        console.log(">>> Running Narrative Audit for Lifecycle Management...");
        const { NarrativeAuditor } = await import('../../../agents/chamber-2-6-auditor');
        const auditResult = await NarrativeAuditor.audit(
            episodePayload.prose_kr || episodePayload.prose_en || episodePayload.script_kr || episodePayload.script_en || "",
            output.characters || activeCharacters,
            story.order_index,
            prevContextStateObj?.character_states || {},
            project.world_city_kr
        );

        if (auditResult.success && auditResult.data.updates) {
            console.log(`>>> Auditor found ${auditResult.data.updates.length} lifecycle/state changes.`);

            // Cumulative State Merging
            const currentContextState = output.source_metadata?.context_state || prevContextStateObj || {};
            if (!currentContextState.character_states) currentContextState.character_states = {};

            for (const update of auditResult.data.updates) {
                // Update Character Bible (Permanent)
                const charUpdate: any = {
                    status: update.status,
                    bound_location: update.bound_location,
                    exit_reason: update.exit_reason,
                    last_seen_episode: story.order_index
                };
                await supabase.from('characters').update(charUpdate).eq('id', update.character_id);

                // Update Context State (Episodic Cumulative)
                const charName = activeCharacters.find(c => c.id === update.character_id)?.reinterpreted_name_kr || update.character_id;
                currentContextState.character_states[charName] = {
                    ...(currentContextState.character_states[charName] || {}),
                    location: update.bound_location || currentContextState.character_states[charName]?.location,
                    status: update.status,
                    ...update.narrative_state
                };
            }

            // Sync merged state back to story_summary
            await supabase.from('story_summary').update({
                source_metadata: {
                    ...summaryPayload.source_metadata,
                    context_state: currentContextState
                }
            }).eq('id', storyId);
        }

        // 3. [L1 Special Logic] L1 각색인 경우, '각색 설계도(Adapted Blueprint)'를 생성하여 저장
        // 디버깅: 조건 확인
        console.log(`>>> Checking L1 Blueprint Condition: Hierarchy=${story.hierarchy_group}, Index=${story.order_index}, SynLen=${output.synthesized_kr?.length}`);

        // 조건 완화: L1 그룹이거나 순서가 1번인 경우
        if ((story.hierarchy_group === 'L1' || story.order_index === 1) && output.synthesized_kr) {
            console.log('>>> L1 Synthesis Detected: Building Adapted Narrative Blueprint...');

            try {
                // 각색된 줄거리와 캐릭터 정보를 바탕으로 설계도 생성 요청
                const blueprintResult = await GrandDirector.buildBlueprint(
                    JSON.stringify({
                        facts: output.synthesized_kr,
                        characters: output.characters || allCharacters
                    }),
                    level // Adaptation Level
                );

                console.log(`>>> Blueprint Build Result: Success=${blueprintResult.success}, Error=${blueprintResult.error}`);

                if (blueprintResult.success) {
                    const blueprint = blueprintResult.data;
                    console.log('>>> Saving Adapted Blueprint to DB...');

                    // story_blueprints 테이블에 'ADAPTED' 타입으로 저장
                    // 기존 'ADAPTED' 레코드가 있으면 업데이트, 없으면 생성
                    const { data: existBp, error: fetchErr } = await supabase
                        .from('story_blueprints')
                        .select('id')
                        .eq('project_id', projectId)
                        .eq('blueprint_type', 'ADAPTED')
                        .maybeSingle();

                    if (fetchErr) console.error(">>> Error fetching existing blueprint:", fetchErr);

                    let saveError;
                    if (existBp) {
                        console.log(`>>> Updating existing blueprint (ID: ${existBp.id})`);
                        const { error } = await supabase.from('story_blueprints').update({
                            core_premise: blueprint.core_premise || {},
                            world_bible: blueprint.world_bible || {},
                            glossary: blueprint.glossary || [],
                            conflict_layers: blueprint.conflict_layers || {},
                            theme_message: blueprint.theme_message || {},
                            style_guide: blueprint.style_guide || {},
                            structural_arc: blueprint.structural_arc || [],
                            timeline: blueprint.timeline || [],
                            foreshadowing_matrix: blueprint.foreshadowing_matrix || [],
                            character_arcs: blueprint.character_blueprint || blueprint.character_arcs || [],
                            tone_guide: blueprint.tone_guide || {},
                            updated_at: new Date().toISOString()
                        }).eq('id', existBp.id);
                        saveError = error;
                    } else {
                        console.log(`>>> Inserting new Adapted Blueprint`);
                        const { error } = await supabase.from('story_blueprints').insert({
                            project_id: projectId,
                            blueprint_type: 'ADAPTED',
                            core_premise: blueprint.core_premise || {},
                            world_bible: blueprint.world_bible || {},
                            glossary: blueprint.glossary || [],
                            conflict_layers: blueprint.conflict_layers || {},
                            theme_message: blueprint.theme_message || {},
                            style_guide: blueprint.style_guide || {},
                            structural_arc: blueprint.structural_arc || [],
                            timeline: blueprint.timeline || [],
                            foreshadowing_matrix: blueprint.foreshadowing_matrix || [],
                            character_arcs: blueprint.character_blueprint || blueprint.character_arcs || [],
                            tone_guide: blueprint.tone_guide || {}
                        });
                        saveError = error;
                    }

                    if (saveError) {
                        console.error('>>> Failed to save Adapted Blueprint to DB:', saveError);
                    } else {
                        console.log('>>> Adapted Blueprint Saved Successfully.');
                    }
                } else {
                    console.warn('>>> Failed to build Adapted Blueprint logic:', blueprintResult.error);
                }
            } catch (bpError) {
                console.error('>>> Critical Error during Blueprint Generation:', bpError);
            }
        } else {
            console.log('>>> L1 Blueprint Logic Skipped (Conditions not met)');
        }

        return NextResponse.json({
            success: true,
            data: output,
            rawText: agentResult.rawText
        });
    } catch (error: any) {
        console.error('V5 Hyper-Write Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
