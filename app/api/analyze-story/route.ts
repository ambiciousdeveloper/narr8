import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from '@/lib/constants';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
  console.log('>>> Analyze API Triggered (Branching Mode)');
  try {
    const body = await req.json();
    const { projectId, level = 'L1', parentId, lang = 'KO', isAdapted: ia, isAdaptation, isReAnalyze = false, context } = body;
    const isAdapted = (ia === true || ia === 'true' || isAdaptation === true || isAdaptation === 'true');
    const currentBranch = isAdapted ? 'ADAPTED' : 'ORIGINAL';

    console.log(`>>> 레벨: ${level}, 부모ID: ${parentId}, 브랜치: ${currentBranch}, 재분석: ${isReAnalyze}`);

    const { data: project, error: pError } = await supabase.from('project_master_config').select('*').eq('project_id', projectId).single();
    if (pError || !project) throw new Error(`프로젝트(${projectId}) 정보를 불러올 수 없습니다.`);

    // [Note] syncCharacters definition removed. Character identity is now centralized in /api/analyze-characters.

    let parentContext = "";
    let timeAnchor = null; // [신규] 시간적 앵커

    if (parentId) {
      const { data: parent, error: parError } = await supabase.from('story_summary').select('*').eq('id', parentId).single();
      if (parError || !parent) throw new Error('상위 서사 데이터를 찾을 수 없습니다.');

      const contentBody = isAdapted ? parent.synthesized_body_kr : parent.original_body_kr;

      parentContext = `
        [PARENT CONTEXT]
        Level: ${parent.hierarchy_group}
        Title: ${parent.unit_title_kr}
        Content: ${contentBody}
        Current Mode: ${currentBranch} Architecture
      `;

      // [신규] 콘텐츠에서 시간적 앵커 추출 (예: "2742년 1월")
      if (contentBody) {
        // "YYYY년 M월" 또는 "YYYY년 MM월" 패턴 매칭
        const dateMatch = contentBody.match(/(\d{4}년\s*\d{1,2}월)/);
        if (dateMatch) {
          timeAnchor = dateMatch[0];
          console.log(`>>> 시간적 앵커 발견: ${timeAnchor}`);
        }
      }
    }

    // Fetch characters for context
    const { data: allCharacters } = await supabase.from('characters').select('*').eq('project_id', projectId);

    // [New] CLM Filter: Only include ACTIVE characters or those mentioned in the context (Ghost Mode)
    const characters = allCharacters?.filter(c => {
      const isActive = (c.status === 'ACTIVE' || !c.status);
      const isMentioned = parentContext && (c.reinterpreted_name_kr && parentContext.includes(c.reinterpreted_name_kr));
      return isActive || isMentioned;
    }) || [];

    const charContext = characters.map(c => {
      const statusTag = c.status && c.status !== 'ACTIVE' ? ` [STATUS: ${c.status}]` : '';
      return `- ${c.reinterpreted_name_kr} (${c.reinterpreted_name_en}): ${c.reinterpreted_role_kr}${statusTag}`;
    }).join('\n') || "기존 캐릭터 없음";

    // Fetch relevant blueprint
    const bpType = isAdapted ? 'ADAPTED' : 'ORIGINAL';
    const { data: blueprint } = await supabase.from('story_blueprints')
      .select('*')
      .eq('project_id', projectId)
      .eq('blueprint_type', bpType)
      .maybeSingle();

    const bpContexts = [];
    if (blueprint) {
      bpContexts.push(`
        [MASTER NARRATIVE BLUEPRINT (${bpType})]
        - Core Theme: ${blueprint.core_premise?.theme_kr}
        - Structural Arc: ${JSON.stringify(blueprint.structural_arc)}
        - Glossary: ${JSON.stringify(blueprint.glossary)}
        - World Rules: ${blueprint.world_bible?.rules_kr}
        - Style Guide: ${JSON.stringify(blueprint.style_guide)}
      `);
    }

    // [NEW] If adapting L1, fetch ORIGINAL L1 context as source
    if (isAdapted && level === 'L1') {
      const { data: origL1 } = await supabase.from('story_summary')
        .select('*')
        .eq('project_id', projectId)
        .eq('hierarchy_group', 'L1')
        .eq('branch_type', 'ORIGINAL')
        .maybeSingle();

      const { data: origBP } = await supabase.from('story_blueprints')
        .select('*')
        .eq('project_id', projectId)
        .eq('blueprint_type', 'ORIGINAL')
        .maybeSingle();

      if (origL1) {
        bpContexts.push(`
          [SOURCE MATERIAL (ORIGINAL L1) — 구조·테마 참조 전용]
          ⚠️ 아래 내용은 각색 구조 설계를 위한 참조 자료입니다.
          ⚠️ 원작의 고유명사(인물명, 지명, 마법명 등)를 출력 JSON에 절대 그대로 사용하지 마십시오.
          ⚠️ 반드시 각색된 세계관의 새로운 이름으로 완전 치환하여 사용하십시오.
          Title: ${origL1.unit_title_kr}
          Summary: ${origL1.original_body_kr}
        `);
      }
      if (origBP) {
        bpContexts.push(`
          [SOURCE BLUEPRINT (ORIGINAL) — 캐릭터·세계관 매핑 참조 전용]
          ⚠️ character_arcs의 original_name은 내부 매핑용입니다. 출력 JSON의 synthesized 필드에 original_name을 절대 노출하지 마십시오.
          ⚠️ glossary의 원작 용어들을 각색된 용어로 완전 교체하십시오.
          ${JSON.stringify(origBP)}
        `);
      }
    }

    const bpContext = bpContexts.join('\n');

    // [최적화] 필요한 에이전트들을 한 번에 로드
    const { StoryArchitect } = await import('../../../agents/chamber-2-1-architect');
    // const { GrandDirector } = await import('../../../agents/chamber-1-director');
    const { analyzeSingleEpisode } = await import('../../../agents/chamber-2-2-designer');
    const { StoryDistributor } = await import('../../../agents/chamber-2-3-distributor');
    const { StoryCritic } = await import('../../../agents/chamber-2-6-critic');

    // [최적화] SOP 한 번만 로드
    let storyHierarchySop = "";
    try {
      const { data: sopData } = await supabase.from('agent_sop_registry').select('instruction').eq('sop_type', 'STORY_HIERARCHY').eq('is_active', true).maybeSingle();
      storyHierarchySop = sopData?.instruction || "";
    } catch (err) { console.warn(">>> SOP 로드 실패."); }

    // [Step 2] Architect Execution
    // ADAPTED 모드에서는 raw 원문 대신 bpContext(origL1 + origBP)를 통해 원작 정보를 전달
    const sourceMaterial = (level === 'L1' && !isAdapted) ? context : '';

    const contextForAgent = `
      Project Identity: ${project.source_identity_kr}
      Hierachy Level: ${level}
      Branch Type: ${currentBranch}
      ${isAdapted ? `World Country: ${project.world_country_kr || ''} (${project.world_country_en || ''})
      World City: ${project.world_city_kr || ''} (${project.world_city_en || ''})
      Cultural Setting: ${project.cultural_setting_kr || ''} (${project.cultural_setting_en || ''})` : ''}
      [SOURCE MATERIAL]
      ${sourceMaterial}

      Parent Context: ${parentContext}
      Blueprint Context: ${bpContext}
      Existing Characters: ${charContext}
      Target Units: L2=${project.l2_unit_type}, L3=${project.l3_unit_type}
    `;

    let agentResult: any;
    const useSequentialGeneration = isAdapted && (level === 'L2' || level === 'L3');

    if (useSequentialGeneration) {
      console.log(`>>> [Sequential Generation] Level: ${level}, Episodes: 5`);

      let sagaRange = "Unknown";
      if (blueprint?.timeline?.[0]) {
        sagaRange = `${blueprint.timeline[0].year || "Start"} ~ ${blueprint.timeline[blueprint.timeline.length - 1].year || "End"}`;
      }

      // [DISTRIBUTION] Map the Chapter into 5 High-Resolution Beats
      const sanitizeMetadata = (text: string) => {
        return text
          .replace(/Current Mode:.*$/gm, "")
          .replace(/Branch:.*$/gm, "")
          .replace(/Architecture:.*$/gm, "")
          .trim();
      };

      const distributor = new StoryDistributor();
      const l2Synopsis = sanitizeMetadata(parentContext);

      // [DYNAMIC DISTRIBUTION] No longer forcing 5 episodes. AI decides.
      const beats = await distributor.distribute(l2Synopsis);
      const dynamicEpisodeCount = beats.length;

      console.log(`>>> [Dynamic Distribution] Generated ${dynamicEpisodeCount} Episodes based on density.`);

      // [DYNAMIC TRACKING] Extract all events for progress monitoring
      const allEvents = beats.flatMap(b => b.assigned_events || []);
      const completedEvents: any[] = [];

      const episodes = [];
      let previousState = null;
      let lastSentence = "";
      let limitTime = "Unknown";
      // [N+1 방지] 루프 내 캐릭터 sync 대신, 모든 에피소드 생성 후 한 번에 처리
      const allSuggestedChars: any[] = [];

      for (let i = 1; i <= dynamicEpisodeCount; i++) {
        const currentBeat = beats[i - 1];
        if (!currentBeat) continue;

        // Calculate Forbidden (Past) and Remaining (Future) Events
        const assignedIds = (currentBeat.assigned_events || []).map(e => e.id);
        const forbidden = completedEvents.map(e => `- ${e.description}`).join('\n');
        const remaining = allEvents
          .filter(e => !assignedIds.includes(e.id) && !completedEvents.some(ce => ce.id === e.id))
          .map(e => `- ${e.description}`).join('\n');

        console.log(`>>> [L3 Gen] Episode ${i}/${dynamicEpisodeCount} | Target: ${currentBeat.assigned_events?.map(e => e.description).join(', ')}`);

        const result = await analyzeSingleEpisode({
          level,
          context: l2Synopsis,
          isAdapted,
          episodeNumber: i,
          totalEpisodes: dynamicEpisodeCount,
          previousContextState: previousState,
          blueprintTimeline: blueprint?.timeline || [],
          blueprintCharacters: blueprint?.character_arcs || [],
          timeAnchor,
          sagaRange,
          limitTime,
          feedbackContext: "",
          specificMission: JSON.stringify(currentBeat),
          lastSentenceOfPreviousScene: lastSentence,
          customSop: storyHierarchySop,
          forbiddenEvents: forbidden,
          remainingEvents: remaining
        });

        if (!result.success) throw new Error(result.error);

        const sceneData = result.data.episode;
        const bodyText = sceneData.synthesized_body_kr || "";

        // [N+1 Fix] 캐릭터를 누적 수집만 하고, 루프 밖에서 일괄 sync
        if (result.data?.characters && result.data.characters.length > 0) {
          allSuggestedChars.push(...result.data.characters);
        }

        // [AUTO-CRITIC] Validate against assigned events
        const logicRules = currentBeat.assigned_events?.map(e => e.description) || [];
        const critique = await StoryCritic.critique(bodyText, { timeAnchor, limitTime, sagaRange, logicRules });
        if (!critique.approved) {
            console.warn(`>>> Episode ${i} Critic REJECTED (Score: ${critique.score}): ${critique.issues.join(', ')}`);
        } else {
            console.log(`>>> Episode ${i} Score: ${critique.score} (Approved: ${critique.approved})`);
        }

        // Record progress
        completedEvents.push(...(currentBeat.assigned_events || []));
        episodes.push(sceneData);
        previousState = sceneData.source_metadata?.context_state;
        const sentences = bodyText.split(/[.!?]\s+/);
        lastSentence = sentences[sentences.length - 1] || "";
      }

      // [N+1 Fix] 루프 완료 후 중복 제거 + 일괄 캐릭터 sync
      if (allSuggestedChars.length > 0) {
        const uniqueChars = Array.from(
          new Map(allSuggestedChars.map(c => [c.reinterpreted_name_kr || c.name_kr, c])).values()
        );
        const allBodyText = episodes.map(e => e.synthesized_body_kr || '').join('\n');
        console.log(`>>> [Batch Character Sync] ${allSuggestedChars.length} collected → ${uniqueChars.length} unique`);
        try {
          const charEngineUrl = new URL('/api/analyze-characters', req.url);
          await fetch(charEngineUrl.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              suggestedCharacters: uniqueChars,
              sceneText: allBodyText.substring(0, 5000),
              isAdapted
            })
          });
        } catch (err) {
          console.error(">>> [Batch Character Sync] Failed:", err);
        }
      }

      agentResult = { success: true, data: { items: episodes } };
    } else {
      agentResult = await StoryArchitect.analyze(level, contextForAgent, isAdapted,
        isAdapted ? {
          worldCountry: project.world_country_kr || project.world_country_en || '',
          worldCountryEn: project.world_country_en || '',
          worldCity: project.world_city_kr || project.world_city_en || '',
          worldCityEn: project.world_city_en || '',
        } : undefined
      );
    }

    if (!agentResult.success) {
      throw new Error(`[Chamber 1 Error] ${agentResult.error}`);
    }

    const data = agentResult.data;

    // L1 Logic (Root Sync)
    if (level === 'L1') {
      console.log('>>> [L1 Debug] Data Keys:', Object.keys(data));
      // [Added Logging] Trace fallback triggers
      if (!data.blueprint) console.warn('>>> [L1 Debug] NO BLUEPRINT WRAPPER DETECTED');

      // Root updates project config (only if original)
      if (!isAdapted) {
        await supabase.from('project_master_config').update({
          source_scale: data.source_scale || 'Saga',
          l2_unit_type: data.l2_unit_type || 'Volume',
          l3_unit_type: data.l3_unit_type || 'Episode'
        }).eq('project_id', projectId);
      }

      // [Schema Defense] Some LLM models return flat structure for Original L1 Analysis, omitting 'blueprint' wrapper.
      // We implement a fallback to treat 'data' itself as the blueprint source if critical fields are found at root.
      let blueprintData = data.blueprint;

      if (!blueprintData && (data.foreshadowing_matrix || data.character_arcs || data.core_premise)) {
        console.warn(">>> [Schema Warning] 'blueprint' wrapper missing. Using root data as blueprint source.");
        blueprintData = data;
      }

      // [ROBUST EXTRACTION] Check multiple fields for title and summary
      // Use blueprintData if available, otherwise fallback to data
      const b = blueprintData || {};

      // Title extraction priorities
      const originalTitle = b.saga_title_kr || b.synthesized_title_kr || data.synthesized_title_kr || data.title_kr || data.unit_title_kr || data.title || project.source_identity_kr;

      // Body extraction priorities
      const sagaSummary = b.massive_saga_outline_kr || b.synthesized_body_kr || data.synthesized_body_kr || b.saga_summary_kr || data.summary_kr || data.body_kr || data.summary || "내용 없음";

      const titleEn = b.saga_title_en || b.synthesized_title_en || data.synthesized_title_en || data.title_en || data.unit_title_en;
      const summaryEn = b.massive_saga_outline_en || b.synthesized_body_en || data.synthesized_body_en || data.summary_en || data.summary;

      // Build L1 Payload based on branch
      const l1Payload: any = {
        project_id: projectId,
        parent_id: null,
        order_index: 1,
        hierarchy_group: 'L1',
        level_depth: 1,
        branch_type: 'ORIGINAL' // L1 is shared root, anchored to ORIGINAL
      };

      // [Protect] Only update Original unit titles when NOT in adaptive mode
      if (!isAdapted) {
        l1Payload.unit_title_kr = originalTitle;
        l1Payload.unit_title_en = data.title_en;
      }

      // [Fix] Explicit Lookup for Existing L1 to avoid Duplicates
      const { data: existingL1 } = await supabase.from('story_summary')
        .select('id')
        .eq('project_id', projectId)
        .eq('hierarchy_group', 'L1')
        .eq('order_index', 1)
        .maybeSingle();

      if (existingL1) {
        l1Payload.id = existingL1.id;
      }

      if (isAdapted) {
        l1Payload.synthesized_title_kr = b.synthesized_title_kr || b.saga_title_kr || data.title_kr || `각색된 ${originalTitle}`;
        l1Payload.synthesized_title_en = titleEn;
        l1Payload.synthesized_body_kr = sagaSummary;
        l1Payload.synthesized_body_en = summaryEn;
        l1Payload.is_synthesized = true;
      } else {
        l1Payload.original_body_kr = sagaSummary;
        l1Payload.original_body_en = summaryEn;
      }

      // Root Upsert
      const { data: root, error: insError } = await supabase.from('story_summary')
        .upsert(l1Payload)
        .select()
        .single();

      if (insError) throw insError;

      // Save Blueprint automatically on L1 analysis
      if (blueprintData) {
        console.log(`>>> [L1 Params] saving blueprint... arcs=${blueprintData.character_arcs?.length}, foreshad=${blueprintData.foreshadowing_matrix?.length}`);

        const bpPayload: any = {
          project_id: projectId,
          blueprint_type: bpType,
          core_premise: {
            ...(blueprintData.core_premise || {}),
            saga_title_kr: blueprintData.saga_title_kr,
            massive_saga_outline_kr: blueprintData.massive_saga_outline_kr || blueprintData.saga_summary_kr
          },
          world_bible: blueprintData.world_bible || {},
          glossary: blueprintData.glossary || [],
          structural_arc: blueprintData.structural_arc || [],
          conflict_layers: blueprintData.conflict_layers || {},
          theme_message: blueprintData.theme_message || {},
          style_guide: blueprintData.style_guide || {},
          tone_guide: blueprintData.tone_guide || blueprintData.style_guide || {}, // Fallback to style_guide if tone missing
          timeline: blueprintData.timeline || [],
          foreshadowing_matrix: blueprintData.foreshadowing_matrix || [],
          character_arcs: blueprintData.character_arcs || [],
          is_active: true
        };

        const { error: bpError } = await supabase.from('story_blueprints').upsert(bpPayload, { onConflict: 'project_id, blueprint_type' });
        if (bpError) console.error("Blueprint Auto-Save Error:", bpError);
      } else {
        console.error(">>> [CRITICAL] No Blueprint Data found! L1 Analysis result format issue.");
      }

      // [Step 5] Centralized Character Identity Sync (V4.0)
      console.log('>>> [Dispatcher] Delegating character sync to centralized engine...');
      try {
        const characterEngineUrl = new URL('/api/analyze-characters', req.url);
        const charSyncResponse = await fetch(characterEngineUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            suggestedCharacters: blueprintData?.character_arcs || [],
            sceneText: data.synthesized_body_kr || data.original_body_kr || "Detailed story blueprint generated.",
            isAdapted
          })
        });

        const charSyncResult = await charSyncResponse.json();
        console.log('>>> [Dispatcher] Character synchronization completed:', charSyncResult.summary);

        return NextResponse.json({ ...data, syncReport: charSyncResult.summary });
      } catch (charSyncErr: any) {
        console.error('>>> [Dispatcher Error] Character sync delegation failed:', charSyncErr);
        return NextResponse.json({ ...data, syncReport: { error: charSyncErr.message } });
      }

    } else {
      // L2 / L3 Logic (Sequential Generation with Context State)
      const rawItems = Array.isArray(data) ? data : (data.items || data.episodes || data.scenes || data.chapter_list || []);
      if (rawItems.length === 0) throw new Error(`${currentBranch} 항목이 생성되지 않았습니다.`);

      // [NEW] Enforce Prologue for L2 ADAPTED mode
      if (level === 'L2' && isAdapted) {
        const hasPrologue = rawItems.some((item: any) => item.order_index === 0 || item.unit_type === 'PROLOGUE');

        if (!hasPrologue) {
          console.log('>>> [Prologue Enforcement] AI did not generate prologue. Creating intelligent prologue...');

          // Fetch L1 blueprint for context
          const { data: blueprintData } = await supabase.from('story_blueprints')
            .select('*')
            .eq('project_id', projectId)
            .eq('blueprint_type', 'ADAPTED')
            .maybeSingle();

          // Get main protagonist
          const protagonist = characters.find(c => c.reinterpreted_tier_en === 'MAIN') || characters[0];

          // Extract timeline/world info
          const timeline = blueprintData?.timeline?.[0];
          const worldBible = blueprintData?.world_bible;
          const corePremise = blueprintData?.core_premise;

          // Build 3-stage prologue structure
          const firstItem = rawItems[0];
          // Stage 1: Normal World Setup
          const timeContext = timeline?.time_kr || timeline?.year || '머나먼 과거';
          const worldRules = worldBible?.rules_kr || corePremise?.premise_kr || project.source_identity_kr;
          const stage1 = `${timeContext}, ${worldRules}`;

          // Stage 2: Character Introduction
          const protagonistName = protagonist?.reinterpreted_name_kr || '주인공';
          const protagonistRole = protagonist?.reinterpreted_role_kr || '이야기의 중심인물';
          const protagonistPersonality = protagonist?.reinterpreted_personality_kr || '';
          const stage2 = `${protagonistName}${protagonistRole ? '는 ' + protagonistRole + '이었다' : ''}. ${protagonistPersonality ? (protagonistPersonality.length > 500 ? protagonistPersonality.substring(0, 500) + '...' : protagonistPersonality) : '평범한 일상을 살아가고 있었다'}.`;

          // Stage 3: Inciting Incident Foreshadowing (Priority: blueprint > excerpt)
          let incitingHint = '';

          // Try foreshadowing_matrix first
          if (blueprintData?.foreshadowing_matrix?.[0]) {
            const firstForeshadow = blueprintData.foreshadowing_matrix[0];
            incitingHint = firstForeshadow.clue_kr || firstForeshadow.meaning_kr || '';
          }

          // Fallback to timeline first event
          if (!incitingHint && blueprintData?.timeline?.[0]) {
            incitingHint = blueprintData.timeline[0].event_kr || '';
          }

          // Final fallback: limited excerpt from first chapter
          if (!incitingHint && firstItem.synthesized_body_kr) {
            incitingHint = firstItem.synthesized_body_kr.substring(0, 300) + '...';
          }

          const stage3 = incitingHint ? `운명의 전환점이 다가오고 있었다. ${incitingHint}` : '그러나 곧 모든 것이 변하게 될 것이었다.';

          // [Prologue Upgrade] Generate rich narrative instead of simple template
          const prologuePrompt = `
            Role: Expert Storyteller
            Task: Write an immersive, high-quality prologue for an ${isAdapted ? 'ADAPTED' : 'ORIGINAL'} story based on the provided context.
            
            [Context]
            1. World Setting (Normal World): ${stage1}
            2. Protagonist (Character): ${stage2}
            3. Inciting Incident (Hook): ${stage3}
            
            [Instructions]
            - Write a continuous, engaging narrative scene (NOT a summary or list).
            - Length: Approximately 800-1000 characters (Korean).
            - Style: Atmospheric, showing-not-telling, emotional engagement.
            - Start with the atmosphere of the world, introduce the protagonist in their daily life, and end with the hint of the incident.
            - Do NOT use headers like 【Normal World】. Just write the story.
          `;

          // Reuse genAI instance (declared at top of file)
          const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
          let prologueBody = "";

          try {
            console.log(">>> [Prologue Generation] Generating rich prologue narrative...");
            const result = await model.generateContent(prologuePrompt);
            prologueBody = result.response.text();
          } catch (err) {
            console.error(">>> [Prologue Generation Error] Fallback to template.", err);
            prologueBody = `[자동 생성된 프롤로그 (Fallback)]\n\n${stage1}\n\n${stage2}\n\n${stage3}`;
          }

          const prologueItem = {
            order_index: 0,
            unit_type: 'PROLOGUE',
            unit_title_kr: '프롤로그: 운명의 시작',
            unit_title_en: 'Prologue: The Beginning',
            synthesized_title_kr: '프롤로그: 운명의 시작',
            synthesized_title_en: 'Prologue: The Beginning',
            original_context_kr: firstItem.original_context_kr || '원작 도입부',
            synthesized_body_kr: prologueBody,
            synthesized_body_en: firstItem.synthesized_body_en
          };

          // Shift all existing items' order_index by 1
          rawItems.forEach((item: any) => {
            if (item.order_index !== undefined) {
              item.order_index += 1;
            }
          });

          // Insert prologue at the beginning
          rawItems.unshift(prologueItem);

          console.log(`>>> [Prologue Enforcement] Intelligent prologue created. Total items: ${rawItems.length}`);
        }
      }

      // Cleanup existing items in this branch only
      if (parentId) {
        await supabase.from('story_summary')
          .delete()
          .eq('parent_id', parentId)
          .eq('branch_type', currentBranch);
      }


      const insertedItems: any[] = [];

      // [NEW] Sequential Generation with Context State Pass-through
      for (let index = 0; index < rawItems.length; index++) {
        const item = rawItems[index];

        // 1. Get previous episode's context_state (if exists)
        const previousState = index > 0 ? insertedItems[index - 1].context_state : null;

        // 2. Prepare base payload
        const base = {
          project_id: projectId,
          parent_id: parentId,
          order_index: item.order_index || (index + 1),
          hierarchy_group: level,
          level_depth: level === 'L2' ? 2 : 3,
          unit_title_kr: item.unit_title_kr || item.title_kr || item.title || `New Item ${index + 1}`,
          unit_title_en: item.unit_title_en || item.title_en,
          branch_type: currentBranch
        };

        let payload: any;

        if (isAdapted) {
          // [ADAPTED] Map creative output to synthesized_body
          payload = {
            ...base,
            original_body_kr: item.original_context_kr || "원작 참조 데이터 요약",
            original_body_en: item.original_context_en,
            synthesized_body_kr: item.synthesized_body_kr || item.summary_kr || "각색된 줄거리가 생성되었습니다.",
            synthesized_body_en: item.synthesized_body_en || item.summary_en,
            synthesized_title_kr: item.synthesized_title_kr || item.title_kr,
            synthesized_title_en: item.synthesized_title_en || item.title_en,
            is_synthesized: true
          };

          // 3. Extract or generate context_state
          // AI should return this in source_metadata.context_state
          const endingState = item.source_metadata?.context_state || item.context_state || {
            timeline: {
              episode_number: index + 1,
              start: previousState?.timeline?.end || `Episode ${index + 1} Start`,
              end: `Episode ${index + 1} End`
            },
            character_states: {},
            revealed_information: previousState?.revealed_information || [],
            active_plot_threads: []
          };

          payload.context_state = endingState;

          // [NEW] Save full source_metadata (including Blueprint Alignment)
          payload.source_metadata = {
            ...(item.source_metadata || {}),
            context_state: undefined // already stored in separate column
          };

        } else {
          // [ORIGINAL] Map raw output to original_body
          payload = {
            ...base,
            original_body_kr: item.original_body_kr || item.summary_kr || "내용 없음",
            original_body_en: item.original_body_en || item.summary_en,
            context_state: null  // Original branch doesn't need context_state
          };
        }

        // 4. Insert one by one
        const { data: inserted, error: insertError } = await supabase
          .from('story_summary')
          .insert(payload)
          .select()
          .single();

        if (insertError) {
          console.error(`Error inserting episode ${index + 1}:`, insertError);
          throw insertError;
        }

        insertedItems.push(inserted);

        console.log(`>>> Episode ${index + 1}/${rawItems.length} inserted with context_state:`,
          inserted.context_state ? 'Yes' : 'No');
      }

      return NextResponse.json({ items: insertedItems });
    }

  } catch (error: any) {
    console.error('>>> Analyze API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
