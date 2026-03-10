import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── 헬퍼 함수 ────────────────────────────────────────────────────────────────

/**
 * [CHARACTER GUARDIAN] 비인물/집단/원작 고유명사가 DB에 저장되는 것을 영구 차단
 */
function isValidCharacter(char: Record<string, unknown>): boolean {
    const name = ((char.reinterpreted_name_kr as string) || (char.new_name as string) || '').trim();
    if (!name) return false;

    if (!char.reinterpreted_role_kr && !char.new_role && !char.role_kr) {
        console.warn(`>>> [CHARACTER GUARDIAN] Rejected (no role): "${name}"`);
        return false;
    }

    const collectivePatterns = [
        /들$/, /집단$/, /세력$/, /무리$/, /조직$/, /군중$/, /영혼$/, /군상$/,
        /들의/, /집합/, /그룹/, /군단/, /부대/, /종족/
    ];
    if (collectivePatterns.some(p => p.test(name))) {
        console.warn(`>>> [CHARACTER GUARDIAN] Rejected (collective entity): "${name}"`);
        return false;
    }

    const nonPersonSuffixes = [/감옥$/, /시설$/, /장소$/, /공간$/, /시스템$/];
    if (nonPersonSuffixes.some(p => p.test(name))) {
        console.warn(`>>> [CHARACTER GUARDIAN] Rejected (non-person entity): "${name}"`);
        return false;
    }

    return true;
}

/**
 * [NAME SWAP MAP] 원작 이름 → 각색 이름 치환 맵 + 금지어 목록 생성
 * 1순위: 블루프린트 character_arcs에서 추출
 * 2순위: glossary에서 추출
 * 3순위: DB characters 테이블 직접 조회 (fallback)
 */
async function buildNameSwapMap(
    originalBp: Record<string, unknown> | null,
    adaptedBp: Record<string, unknown> | null,
    projectId: string
): Promise<{ nameMap: Record<string, string>; forbiddenNames: string[] }> {
    const nameMap: Record<string, string> = {};
    const forbiddenNames: string[] = [];

    if (originalBp?.character_arcs) {
        try {
            const arcs = typeof originalBp.character_arcs === 'string'
                ? JSON.parse(originalBp.character_arcs)
                : originalBp.character_arcs as Record<string, string>[];
            arcs.forEach((char: Record<string, string>) => {
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

    // Fallback: DB에서 직접 조회
    if (Object.keys(nameMap).length === 0) {
        try {
            const { data: dbCharacters } = await supabase
                .from('characters')
                .select('original_name_kr, original_name_en, reinterpreted_name_kr, reinterpreted_name_en, aliases')
                .eq('project_id', projectId)
                .eq('status', 'ACTIVE');

            if (dbCharacters && dbCharacters.length > 0) {
                console.log(`>>> Found ${dbCharacters.length} characters in DB for nameMap`);
                dbCharacters.forEach((char: Record<string, unknown>) => {
                    if (char.original_name_kr && char.reinterpreted_name_kr) {
                        nameMap[char.original_name_kr as string] = char.reinterpreted_name_kr as string;
                        forbiddenNames.push(char.original_name_kr as string);
                    }
                    if (char.original_name_en && char.reinterpreted_name_en) {
                        nameMap[char.original_name_en as string] = char.reinterpreted_name_en as string;
                        forbiddenNames.push(char.original_name_en as string);
                    }
                    if (char.aliases && Array.isArray(char.aliases)) {
                        (char.aliases as string[]).forEach((alias) => {
                            if (char.reinterpreted_name_kr) {
                                nameMap[alias] = char.reinterpreted_name_kr as string;
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

    // Glossary 매핑
    if (originalBp?.glossary && adaptedBp?.glossary) {
        try {
            const originalGlossary = typeof originalBp.glossary === 'string'
                ? JSON.parse(originalBp.glossary)
                : originalBp.glossary as Record<string, string>[];
            const adaptedGlossary = typeof adaptedBp.glossary === 'string'
                ? JSON.parse(adaptedBp.glossary)
                : adaptedBp.glossary as Record<string, string>[];

            console.log(`>>> Building Name Swap Map from Glossaries: ${originalGlossary.length} items`);
            originalGlossary.forEach((item: Record<string, string>, idx: number) => {
                const adaptedItem = adaptedGlossary[idx];
                if (item.term_kr && adaptedItem?.term_kr && item.term_kr !== adaptedItem.term_kr) {
                    nameMap[item.term_kr] = adaptedItem.term_kr;
                    forbiddenNames.push(item.term_kr);
                }
                if (item.term_en && adaptedItem?.term_en && item.term_en !== adaptedItem.term_en) {
                    nameMap[item.term_en] = adaptedItem.term_en;
                    forbiddenNames.push(item.term_en);
                }
                if (item.term_kr) forbiddenNames.push(item.term_kr);
                if (item.term_en) forbiddenNames.push(item.term_en);
            });
        } catch (e) {
            console.warn(">>> Error parsing glossary for swap map:", e);
        }
    }

    return { nameMap, forbiddenNames };
}

/**
 * [L1 BLUEPRINT SAVE] L1 각색 완료 후 Adapted Blueprint를 DB에 저장/업데이트
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveAdaptedBlueprint(
    GrandDirector: { buildBlueprint: (input: string, level: number) => Promise<{ success: boolean; data?: any; error?: string }> },
    story: { hierarchy_group: string; order_index: number },
    projectId: string,
    level: number,
    output: Record<string, unknown>,
    allCharacters: unknown[]
): Promise<void> {
    if (!((story.hierarchy_group === 'L1' || story.order_index === 1) && output.synthesized_kr)) {
        console.log('>>> L1 Blueprint Logic Skipped (Conditions not met)');
        return;
    }

    console.log('>>> L1 Synthesis Detected: Building Adapted Narrative Blueprint...');
    try {
        const blueprintResult = await GrandDirector.buildBlueprint(
            JSON.stringify({ facts: output.synthesized_kr, characters: output.characters || allCharacters }),
            level
        );
        console.log(`>>> Blueprint Build Result: Success=${blueprintResult.success}, Error=${blueprintResult.error}`);

        if (!blueprintResult.success) {
            console.warn('>>> Failed to build Adapted Blueprint logic:', blueprintResult.error);
            return;
        }

        const blueprint = blueprintResult.data;
        const bpFields = {
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
        };

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
            const { error } = await supabase.from('story_blueprints')
                .update({ ...bpFields, updated_at: new Date().toISOString() })
                .eq('id', existBp.id);
            saveError = error;
        } else {
            console.log('>>> Inserting new Adapted Blueprint');
            const { error } = await supabase.from('story_blueprints')
                .insert({ project_id: projectId, blueprint_type: 'ADAPTED', ...bpFields });
            saveError = error;
        }

        if (saveError) {
            console.error('>>> Failed to save Adapted Blueprint to DB:', saveError);
        } else {
            console.log('>>> Adapted Blueprint Saved Successfully.');
        }
    } catch (bpError) {
        console.error('>>> Critical Error during Blueprint Generation:', bpError);
    }
}

// ─── API 핸들러 ──────────────────────────────────────────────────────────────

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
            customConcept,
            format = 'NOVEL',
            language = 'KO',
            mode = 'CREATE',
            refText = ''
        } = await req.json();

        // 1. 기초 데이터 병렬 로드 (Batch 1: projectId / storyId 기반 독립 쿼리)
        const [
            { data: project },
            { data: story },
            { data: allCharacters },
            { data: litAssets },
            { data: goldStandards },
            { data: blueprintDataBatch },
            { data: originalBpBatch },
            { data: rootStoryBatch }
        ] = await Promise.all([
            supabase.from('project_master_config').select('*').eq('project_id', projectId).single(),
            supabase.from('story_summary').select('*').eq('id', storyId).single(),
            supabase.from('characters').select('*').eq('project_id', projectId),
            supabase.from('literary_assets').select('content_kr, origin_source').limit(3),
            supabase.from('writing_gold_standards').select('*').limit(5),
            supabase.from('story_blueprints').select('*').eq('project_id', projectId).eq('blueprint_type', 'ADAPTED').maybeSingle(),
            supabase.from('story_blueprints').select('*').eq('project_id', projectId).eq('blueprint_type', 'ORIGINAL').maybeSingle(),
            supabase.from('story_summary').select('synthesized_body_kr').eq('project_id', projectId).eq('hierarchy_group', 'L1').maybeSingle()
        ]);

        if (!project) throw new Error('Project not found');
        if (!story) throw new Error('Story item not found');

        const targetLength = project.target_minutes || 5;

        console.log('\n=== [VOLUME CONTROL DEBUG] ===');
        console.log(`[1] DB Query: target_minutes = ${project.target_minutes}`);
        console.log(`[2] Language: ${language}, Format: ${format}`);
        console.log(`[3] Final targetLength (minutes) = ${targetLength}`);
        console.log(`[4] Note: CreativeScribe will apply language-specific ratio (KO_Novel: 0.42, KO_Script: 0.50)`);

        // [New] CLM Filter: Only include ACTIVE characters or those mentioned in the current customConcept (Ghost Mode)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activeCharacters: any[] = allCharacters?.filter((c: any) => {
            const isActive = (c.status === 'ACTIVE' || !c.status);
            const isMentioned = customConcept && (c.reinterpreted_name_kr && customConcept.includes(c.reinterpreted_name_kr));
            return isActive || isMentioned;
        }) || [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const charContext = activeCharacters.map((c: any) => {
            const statusTag = c.status && c.status !== 'ACTIVE' ? ` [STATUS: ${c.status}]` : '';
            return `- ${c.reinterpreted_name_kr} (${c.reinterpreted_name_en}): ${c.reinterpreted_role_kr}${statusTag}`;
        }).join('\n');

        const level = project.adaptation_level || 3;

        // 2. story 기반 병렬 로드 (Batch 2: story.hierarchy_group / parent_id 필요)
        const [
            { data: previousEpisodes },
            { data: parentStory },
            { data: nextEpisode }
        ] = await Promise.all([
            supabase.from('story_summary')
                .select('id, order_index, synthesized_title_kr, synthesized_body_kr, source_metadata')
                .eq('project_id', projectId)
                .eq('hierarchy_group', story.hierarchy_group)
                .lt('order_index', story.order_index)
                .eq('is_synthesized', true)
                .order('order_index', { ascending: true }),
            story.parent_id
                ? supabase.from('story_summary')
                    .select('synthesized_title_kr, synthesized_body_kr, source_metadata')
                    .eq('id', story.parent_id)
                    .single()
                : Promise.resolve({ data: null, error: null }),
            supabase.from('story_summary')
                .select('synthesized_title_kr, synthesized_body_kr')
                .eq('project_id', projectId)
                .eq('hierarchy_group', story.hierarchy_group)
                .eq('order_index', story.order_index + 1)
                .maybeSingle()
        ]);

        // [Chronicle 크기 제한] 최근 10개 에피소드만 포함, 총 5000자 상한
        const MAX_CHRONICLE_CHARS = 5000;
        const recentEpisodes = previousEpisodes?.slice(-10) || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawChronicle = recentEpisodes.map((ep: any) =>
            `Ep ${ep.order_index} [${ep.synthesized_title_kr}]: ${ep.synthesized_body_kr?.substring(0, 300)}...`
        ).join('\n\n') || "첫 번째 에피소드입니다.";
        const chronicle = rawChronicle.length > MAX_CHRONICLE_CHARS
            ? rawChronicle.substring(rawChronicle.length - MAX_CHRONICLE_CHARS)
            : rawChronicle;

        // [중복 쿼리 제거] previousEpisodes에 source_metadata가 이미 포함됨 → 별도 lastEpData 쿼리 불필요
        let prevContextStateObj: any = null;
        if (previousEpisodes && previousEpisodes.length > 0) {
            const lastEp = previousEpisodes[previousEpisodes.length - 1];
            if (lastEp?.source_metadata?.context_state) {
                prevContextStateObj = lastEp.source_metadata.context_state;
            }
        }
        const prevContextState = prevContextStateObj ? JSON.stringify(prevContextStateObj, null, 2) : "No previous state.";

        // [L2 Context] parentStory는 Batch 2에서 이미 로드됨
        let parentContext = "";
        let foreshadowingNote = "";
        if (parentStory) {
            parentContext = `
          [BROADER CONTEXT: CURRENT VOLUME (${parentStory.synthesized_title_kr})]
          ${parentStory.synthesized_body_kr || "No summary available."}

          [L2 ROADMAP & GUIDELINES]
          ${JSON.stringify(parentStory.source_metadata?.roadmap || "Follow the natural flow.", null, 2)}
            `;
            if (parentStory.source_metadata?.foreshadowing_notes) {
                foreshadowingNote = `[FORESHADOWING INSTRUCTION]: ${parentStory.source_metadata.foreshadowing_notes}`;
            }
        }

        // [Next Episode Preview] nextEpisode는 Batch 2에서 이미 로드됨
        let nextEpisodeContext = "";

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

        // [Blueprint Context] Batch 1에서 이미 로드됨 - 중복 쿼리 제거
        const blueprintData = blueprintDataBatch;
        const originalBp = originalBpBatch;

        // [V5.9 Anti-Leakage] Build Name Swap Map (Characters + Glossary)
        const { nameMap, forbiddenNames } = await buildNameSwapMap(
            originalBp as Record<string, unknown> | null,
            blueprintData as Record<string, unknown> | null,
            projectId
        );

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
        const cleanedRootSummary = cleanText(rootStoryBatch?.synthesized_body_kr?.substring(0, 1000) || "");
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
          ${litAssets?.map((a: any) => a.content_kr).join('\n\n') || "표현 가이드 없음"}

          [NARRATIVE STATE (MUST INHERIT)]
          - Previous Context State: ${prevContextState}
          - Transition Policy: Read the end of the previous segment to avoid repetitive openings.
          ${foreshadowingNote}
          ${nextEpisodeContext}
        `;


        // Final BP for reference
        const activeBlueprint = blueprintData || originalBp;

        // [Step 2] Scribe Agent 준비 및 비트 확장
        let finalBeats: string[] = [];
        let agentResult;

        // [Step 1] Grand Director에게 조율 및 비트 확장 요청
        // orchestrate()는 현재 미구현(stub)이므로 호출 제거
        // await GrandDirector.orchestrate('STORY_SYNTHESIS', { projectId, storyId });

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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const charName = activeCharacters.find((c: any) => c.id === update.character_id)?.reinterpreted_name_kr || update.character_id;
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
        console.log(`>>> Checking L1 Blueprint Condition: Hierarchy=${story.hierarchy_group}, Index=${story.order_index}, SynLen=${output.synthesized_kr?.length}`);
        await saveAdaptedBlueprint(
            GrandDirector,
            story,
            projectId,
            level,
            output,
            allCharacters || []
        );

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
