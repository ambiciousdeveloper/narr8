import { GoogleGenerativeAI } from '@google/generative-ai';
import { AgentFactory, type AgentResponse } from './chamber-0-repository';
import { safeParseJSON } from '../lib/json-repair';
import {
    GEMINI_MODEL,
    DEFAULT_SCRIPT_DENSITY,
    DEFAULT_SCRIPT_SECTION_LIMIT,
    DEFAULT_SCRIPT_KO_RATIO,
    DEFAULT_SCRIPT_SCENE_AVG_CHARS,
} from '../lib/constants';

// ─────────────────────────────────────────────────────────────────────────────
// V171: SceneSlot — 원작 소설에서 추출한 확정 씬 구조
// ─────────────────────────────────────────────────────────────────────────────
interface SceneSlot {
    n: number;           // 확정 씬 번호 (S# n)
    intExt: 'INT' | 'EXT';
    location: string;    // 한국어 장소명
    timeOfDay: string;   // 밤|낮|새벽|아침|저녁|오후|오전 등
    characters: string[]; // 이 씬에 등장하는 캐릭터명
    beat: string;        // 핵심 사건 1문장
}

/**
 * V171: Scene Slot Extractor
 * 원작 소설 단락(slicedRef)을 분석해 확정 씬 구조(SceneSlot[])를 추출한다.
 * AI를 사용하지만 temperature=0으로 결정론적으로 동작하며, 실패 시 빈 배열을 반환해 graceful fallback.
 */
async function extractSceneSlots(
    novelProse: string,
    canonicalNames: string[],
    model: any,
    startSceneNumber: number,
    maxScenes: number
): Promise<SceneSlot[]> {
    if (!novelProse || novelProse.trim().length < 80) return [];

    const nameHint = canonicalNames.length > 0
        ? `등장 가능한 캐릭터 이름: ${canonicalNames.slice(0, 10).join(', ')}`
        : '';

    const prompt = `다음 소설 단락을 읽고 씬 구조를 추출하세요.
장소 변화, 시간 변화, 핵심 등장인물 변화가 있을 때마다 새 씬으로 구분하세요.
최대 ${maxScenes}개 씬까지만 추출하세요.
${nameHint}

규칙:
- intExt: 실내면 "INT", 실외면 "EXT"
- location: 한국어 장소명 (예: "서울 뒷골목", "천도당 내부")
- timeOfDay: 밤|낮|새벽|아침|저녁|오후|오전 중 하나
- characters: 이 씬에서 실제로 행동하거나 대화하는 인물 이름 배열
- beat: 이 씬의 핵심 사건을 한 문장으로

JSON 배열만 출력 (다른 텍스트 없이):
[{"intExt":"INT","loc":"장소명","time":"밤","chars":["이름"],"beat":"핵심 사건"}]

소설:
${novelProse.substring(0, 2500)}`;

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.0, maxOutputTokens: 600 }
        });
        const raw = result.response.text().replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
        const arrStart = raw.indexOf('[');
        const arrEnd = raw.lastIndexOf(']');
        if (arrStart === -1 || arrEnd === -1) {
            console.warn(`>>> [V171] Scene slot extraction: no JSON array found.`);
            return [];
        }
        const parsed = JSON.parse(raw.substring(arrStart, arrEnd + 1));
        if (!Array.isArray(parsed) || parsed.length === 0) return [];

        return parsed
            .slice(0, maxScenes)
            .map((s: any, idx: number): SceneSlot => ({
                n: startSceneNumber + idx,
                intExt: (String(s.intExt || 'INT').toUpperCase() === 'EXT') ? 'EXT' : 'INT',
                location: String(s.loc || s.location || '').trim() || '장소 미상',
                timeOfDay: String(s.time || s.timeOfDay || '').trim() || '낮',
                characters: Array.isArray(s.chars || s.characters)
                    ? (s.chars || s.characters).map(String)
                    : [],
                beat: String(s.beat || '').trim(),
            }));
    } catch (e) {
        console.warn(`>>> [V171] Scene slot extraction failed: ${e}`);
        return [];
    }
}

/**
 * V171: Confirmed Skeleton Formatter
 * SceneSlot[] → 프롬프트에 삽입할 확정 씬 구조 텍스트
 */
function formatConfirmedSkeleton(slots: SceneSlot[], hardMin: number): string {
    const lines = slots.map(s => {
        const charList = s.characters.length > 0 ? ` [등장: ${s.characters.join(', ')}]` : '';
        return `S# ${s.n}. ${s.intExt}. ${s.location} - ${s.timeOfDay}${charList}\n    → ${s.beat}`;
    }).join('\n');

    return `
[확정 씬 구조 — 원작 소설 추출 — 수정 불가 ⛔]
아래 씬 구조(장소·시간·등장인물)는 원작 소설에서 추출된 확정 정보입니다.
AI는 이 구조를 변경하지 마세요. 지문(action lines)과 대사(dialogue)만 작성하세요.

${lines}

각 씬에서 작성해야 할 것:
- 물리적 지문 (카메라로 촬영 가능한 것만): 최소 3줄
- 대사: 최소 1 교환 (캐릭터명 단독 줄 → 대사 줄)
- 씬 분량: 각 씬 최소 ${hardMin}자 이상
[확정 씬 구조 끝]
`;
}

export class ScriptScribe {
    /**
     * Chamber 2-5: Script Scribe (V80 Architecture)
     * Goal: Pure, visual-tactile screenplay adaptation with zero-prose leak and absolute linear progression.
     */
    public static async synthesize(
        originalPlot: string,
        charContext: string,
        activeBlueprint: any,
        level: number,
        chronicle: string = "",
        worldSettings: string = "",
        format: 'SCRIPT' = 'SCRIPT',
        language: 'KO' | 'EN' = 'KO',
        targetLength: number,
        mode: 'CREATE' | 'TRANSLATE' | 'ADAPT_TO_SCRIPT' = 'CREATE',
        refText: string = ""
    ): Promise<AgentResponse> {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        // Note: ScriptScribe uses `currentTemp` (dynamic per-chunk), not a static creativity value.

        // 1. Unified Configuration Fetching
        const [volumeSop, sopGuidelines, sopPersona] = await Promise.all([
            AgentFactory.fetchSOP('VOLUME_CONTROL_POLICY'),
            AgentFactory.fetchSOP('SCRIBE_GUIDELINES_SCRIPT'),
            AgentFactory.fetchSOP('SCRIBE_PERSONA_SCRIPT')
        ]);

        const fetchConfigMultiplier = async (key: string, def: number) => {
            const val = AgentFactory.parseVolumeConfig(volumeSop, key, def);
            return await AgentFactory.fetchConfig(key, val);
        };

        // 우선순위: system_config → VOLUME_CONTROL_POLICY SOP → lib/constants 기본값
        const scriptDensity = await fetchConfigMultiplier('SCRIPT_DENSITY', DEFAULT_SCRIPT_DENSITY);
        const sectionLimit = await fetchConfigMultiplier('SECTION_LIMIT', DEFAULT_SCRIPT_SECTION_LIMIT);
        // system_config 키: SCRIPT_DENSITY, SECTION_LIMIT, SCRIPT_DENSITY_KO_RATIO
        const scriptKoRatio = await fetchConfigMultiplier('SCRIPT_DENSITY_KO_RATIO', DEFAULT_SCRIPT_KO_RATIO);
        const globalDensity = await AgentFactory.fetchConfig('GLOBAL_SCRIPT_DENSITY_MULTIPLIER', 1.0);
        // 씬(S#) 1개당 평균 글자 수 — system_config: SCRIPT_SCENE_AVG_CHARS
        const sceneAvgChars = await fetchConfigMultiplier('SCRIPT_SCENE_AVG_CHARS', DEFAULT_SCRIPT_SCENE_AVG_CHARS);

        const ratio = language === 'KO' ? Number(scriptKoRatio) : 1.0;
        const totalTargetChars = Math.max(1500, targetLength * Number(scriptDensity) * ratio * Number(globalDensity));

        // 2. [V81 Paragraph-Aware Sectioning]
        // \n 단위로 분할해 beats.length를 늘림 → actualSections이 beats.length에 막히지 않도록
        const beats = originalPlot.split(/Beat\s*#?\d+:?|비트\s*#?\d+:?|\n/gi).filter(b => b.trim().length > 30);
        const novelParagraphs = refText.split(/\n\n+/).filter(p => p.trim().length > 0);

        const idealSections = Math.ceil(totalTargetChars / Number(sectionLimit));
        // beats.length가 너무 적으면(fallback=1) idealSections 그대로 사용해 여러 번 호출
        const actualSections = beats.length <= 1
            ? idealSections
            : Math.max(1, Math.min(beats.length, idealSections));
        const sectionLengthTarget = Math.floor(totalTargetChars / actualSections);

        console.log(`>>> [ScriptScribe V81 Hardened] beats=${beats.length}, idealSections=${idealSections}, actualSections=${actualSections}, targetPerSection=${sectionLengthTarget}, totalTarget=${totalTargetChars}`);

        // [V168] Pre-generation: extract canonical character names from charContext.
        // These are injected into EVERY chunk prompt so the AI never drifts to a wrong name.
        // Extraction is fully deterministic — no AI involvement.
        console.log(`>>> [V168 Debug] charContext preview (first 400 chars): ${charContext.substring(0, 400).replace(/\n/g, '\\n')}`);
        const canonicalNames = extractCanonicalNamesFromContext(charContext);
        console.log(`>>> [V168 Name Roster] Canonical names extracted: [${canonicalNames.join(', ')}]`);

        // V176: Pre-seed protagonist pronoun from charContext gender markers.
        // This ensures chunk 1 already receives the correct pronoun lock instruction,
        // preventing V158 from locking in a wrong pronoun from AI-generated content alone.
        const preInitPronoun = extractProtagonistGenderFromContext(charContext, canonicalNames);
        if (preInitPronoun) {
            console.log(`>>> [V176 Gender Pre-init] Protagonist pronoun pre-set to "${preInitPronoun}" from charContext.`);
        }

        // 3. Unified Generation Loop
        let fullScript = "";
        let finalCharacters: any[] = [];
        let lastRawResponse = "";
        let contextState = {
            lastSlugline: "",
            lastAction: "",
            lastThreeLines: "",
            forbiddenBeats: [] as string[],
            lastSceneNumber: 0,
            recentSlugs: [] as string[],
            dreamSceneCount: 0,  // V148: 전체 대본에서 악몽/수면 씬 누적 카운트 (최대 2회 허용)
            protagonistPronouns: preInitPronoun,  // V176: pre-seeded from charContext gender; falls back to V158 AI detection
            lastTimeOfDay: '' as string,   // V161: 마지막 씬의 시간대 (밤/새벽/아침/낮/저녁) — 청크 간 시간 역행 방지
            lastLocation: '' as string     // V161: 마지막 씬의 장소 — 청크 간 갑작스러운 장소 변경 시 전환 씬 요구
        };

        const beatChunk = Math.ceil(beats.length / actualSections);
        const paraChunk = Math.ceil(novelParagraphs.length / actualSections);

        let lastChunkHeader = "";
        for (let i = 0; i < actualSections; i++) {
            const chunk = beats.slice(i * beatChunk, (i + 1) * beatChunk).join('\n\n');
            const slicedRef = novelParagraphs.slice(i * paraChunk, (i + 1) * paraChunk).join('\n\n');
            if (!chunk && i > 0) break;

            let retryCount = 0;
            // 후반 청크(3번째 이후)는 JSON 파싱 실패율이 높으므로 temperature를 낮춰 준수율 향상
            let currentTemp = i >= 2 ? 0.5 : 0.6;
            let dialogueRetry = false;

            // V171: Scene Slot Extraction — while 루프 바깥에서 청크당 1회만 실행
            const skeletonTargetScenesForExtract = Math.max(3, Math.min(6,
                Math.ceil(sectionLengthTarget / (Number(sceneAvgChars) || 300))
            ));
            const confirmedSlots: SceneSlot[] = mode === 'ADAPT_TO_SCRIPT' && slicedRef.trim().length > 80
                ? await extractSceneSlots(slicedRef, canonicalNames, model, contextState.lastSceneNumber + 1, skeletonTargetScenesForExtract)
                : [];
            console.log(`>>> [V171] Chunk ${i + 1}: confirmed slots = ${confirmedSlots.length} (mode=${mode}, refLen=${slicedRef.length})`);

            while (retryCount < 3) {
                // V169: Scene Skeleton — compute before prompt build
                const skeletonTargetScenes = Math.max(3, Math.min(6,
                    Math.ceil((sectionLengthTarget) / (Number(sceneAvgChars) || 300))
                ));
                const sceneSkeleton = buildSceneSkeleton({
                    startScene: contextState.lastSceneNumber + 1,
                    targetScenes: skeletonTargetScenes,
                    targetChars: sectionLengthTarget,
                    recentSlugs: contextState.recentSlugs ?? [],
                    dreamSceneCount: contextState.dreamSceneCount ?? 0,
                    lastTimeOfDay: contextState.lastTimeOfDay ?? '',
                });

                const prompt = buildUnifiedPrompt({
                    plot: chunk,
                    characters: charContext,
                    blueprint: activeBlueprint,
                    settings: worldSettings,
                    canonicalNames,
                    sceneSkeleton,
                    confirmedSlots,  // V171: confirmed scene slots from source novel (empty = fallback to V169)
                    // V140: Stabilized Continuity Bridge — only last scene to avoid "story already done" hallucination.
                    chronicle: i === 0 ? chronicle : (() => {
                        // Extract only the last scene from fullScript as anchor, not the entire history
                        const scenes = fullScript.split(/(?=S#\s*\d+\.)/);
                        const lastScene = scenes[scenes.length - 1]?.trim() || fullScript.slice(-800);
                        return `[CONTINUATION ANCHOR — last scene written:]\n${lastScene}\n\n[TASK]: Write NEW scenes continuing from S# ${contextState.lastSceneNumber + 1}. Do NOT repeat any of the above.`;
                    })(),
                    language,
                    targetChars: sectionLengthTarget,
                    sceneAvgChars: Number(sceneAvgChars),
                    sourceProse: slicedRef,
                    idx: i + 1,
                    total: actualSections,
                    nextSceneNumber: contextState.lastSceneNumber + 1,
                    sopPersona,
                    sopGuidelines,
                    dialogueRetry,
                    ...contextState
                });

                const result = await generateWithRetry(model, {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature: currentTemp, maxOutputTokens: 24000 }
                }, `Chunk ${i + 1} main generation`);

                lastRawResponse = result.response.text();
                const response = safeParseJSON(lastRawResponse);

                if (response.success) {
                    let content = scrubMeta(response.data.content || "");

                    // V140.6: JSON parsed but no `content` field — check for `scenes` array format
                    if (!content && Array.isArray(response.data?.scenes) && response.data.scenes.length > 0) {
                        const converted = convertScenesJsonToScreenplay(response.data.scenes);
                        if (converted.length > 100) {
                            content = scrubMeta(converted);
                            console.warn(`>>> [V140.6 Scenes Fallback] Chunk ${i + 1}: Converted ${response.data.scenes.length} scenes from JSON array (${content.length} chars).`);
                        }
                    }

                    // V140.5: JSON parsed but content field is empty
                    if (!content) {
                        // Case A: model used 'screenplay' key instead of 'content'
                        const altKey = response.data?.screenplay || response.data?.script || response.data?.text || '';
                        if (typeof altKey === 'string' && altKey.length > 50) {
                            content = scrubMeta(altKey);
                            console.warn(`>>> [V140.5 Key Fix] Chunk ${i + 1}: Extracted from alt JSON key (${content.length} chars).`);
                        }
                    }

                    if (!content && lastRawResponse.trim().startsWith('{')) {
                        // Case B: raw response is JSON — re-parse and probe known screenplay keys
                        try {
                            const reparsed = JSON.parse(lastRawResponse);
                            const candidate = reparsed.screenplay || reparsed.content || reparsed.script || reparsed.text || '';
                            if (typeof candidate === 'string' && candidate.length > 50) {
                                content = scrubMeta(candidate);
                                console.warn(`>>> [V140.5 JSON Key] Chunk ${i + 1}: Re-parsed JSON key match (${content.length} chars).`);
                            }
                        } catch { /* fall through to regex recovery */ }
                    }

                    if (!content && lastRawResponse.includes('S#')) {
                        // Case C: regex recovery — strip JSON wrapper artifacts before and after S# block
                        const sceneMatch = lastRawResponse.match(/S#\s*\d+[\s\S]*/);
                        if (sceneMatch) {
                            let recovered = sceneMatch[0];
                            // Strip trailing JSON blob that may follow inline screenplay text
                            const jsonBlobIdx = recovered.search(/\n\s*\{[\s\S]*"(?:title|scenes|scene_number)"/);
                            if (jsonBlobIdx > 50) {
                                recovered = recovered.substring(0, jsonBlobIdx).trim();
                                console.warn(`>>> [V140.5] Stripped trailing JSON blob from raw recovery.`);
                            }
                            // Strip trailing JSON closer: \n" } or " }
                            recovered = recovered.replace(/\\n"\s*\}?\s*$/, '').replace(/"\s*\}\s*$/, '').trim();
                            if (recovered.length > 50) {
                                content = scrubMeta(recovered);
                                console.warn(`>>> [V140.5 Raw Fallback] Chunk ${i + 1}: JSON content empty, recovered ${content.length} chars from raw text.`);
                            }
                        }
                    }

                    // V140: Circuit Breaker - Repetition / Stuttering Detection
                    const currentHeader = content.substring(0, 100).trim();
                    if (i > 0 && currentHeader === lastChunkHeader && retryCount === 0) {
                        console.warn(`>>> [V140 Circuit Breaker] Repetition detected at chunk ${i + 1}. Retrying with higher entropy...`);
                        currentTemp = 0.7; // Break the loop
                        retryCount++;
                        continue;
                    }

                    // V141: Dialogue Density Enforcement — retry if empty or dialogue ratio < 20%
                    const density = content ? getDialogueDensity(content) : 0;
                    if ((!content || density < 0.20) && retryCount < 2) {
                        console.warn(`>>> [V141 Dialogue Density] Chunk ${i + 1} ${!content ? 'empty' : `density ${(density * 100).toFixed(1)}%`}. Retrying...`);
                        currentTemp = Math.min(0.9, currentTemp + 0.2);
                        dialogueRetry = true;
                        retryCount++;
                        continue;
                    }

                    // V143: Expansion Pass — only for non-empty content that is too short or too sparse
                    // Empty content means main generation failed entirely; V143 (expansion) cannot fix that.
                    if (content && (content.length < sectionLengthTarget * 0.90 || density < 0.20)) {
                        const shortage = sectionLengthTarget - content.length;
                        console.warn(`>>> [V143 Expansion Pass] Chunk ${i + 1}: ${content.length}/${sectionLengthTarget} chars, density ${(density * 100).toFixed(1)}%. Expanding...`);
                        // V171 fix: if confirmed skeleton exists, list its sluglines so expansion cannot add new scenes
                        const confirmedSlugNote = confirmedSlots.length > 0
                            ? `\n⛔ CONFIRMED SCENE LIST (from source novel — DO NOT add scenes beyond this list):\n${confirmedSlots.map(s => `  S# ${s.n}. ${s.intExt}. ${s.location} - ${s.timeOfDay}`).join('\n')}\nYou may ONLY expand content within the scenes listed above. Creating S# ${confirmedSlots[confirmedSlots.length - 1].n + 1} or any new scene number is FORBIDDEN.\n`
                            : '';
                        const expandPrompt = `You are a professional Korean screenplay writer. The following screenplay is too short AND has too little dialogue. Expand it by adding MORE DIALOGUE EXCHANGES between characters.
${confirmedSlugNote}
⛔ LENGTH GATE — MANDATORY:
  CURRENT length: ${content.length} characters
  TARGET length:  ${sectionLengthTarget} characters
  REQUIRED ADDITION: at least ${shortage} characters
  If your output is less than ${Math.floor(sectionLengthTarget * 0.85)} characters total, it will be REJECTED as invalid.
  Do NOT stop expanding until you have added the required amount.

RULES:
1. Add dialogue after every 2-3 action lines: character name alone on one line, spoken text on the next.
2. Characters must speak — to each other, to themselves, or to the situation aloud.
3. ZERO PROSE LEAK: Action lines describe ONLY what a camera physically records. No internal state or emotional narration.
   FORBIDDEN (cannot be filmed — delete or replace with action/dialogue):
   × "마음속에", "내면", "~을 느낀다", "생각에 잠겼다", "불안감을 느끼", "혼란스러움", "깨달았다"
   × "복잡한 감정", "마치 ~같았다", any sentence about thoughts/emotions without a physical act
   If you encounter these in the existing text, REPLACE them with a physical action or dialogue line.
4. Keep all existing scene sluglines (S# N. ...) intact. Write in Korean only.
5. Add ${shortage} characters through dialogue exchanges — WITHIN existing scenes only. NOT monologue, NOT narration.
6. LOCATION VARIETY CHECK: If 3 or more consecutive scenes share the exact same slugline, you MUST change at least one of them to a neighboring sub-location (append "계단", "안쪽", "입구", etc. to the place name) or shift the time label (새벽 → 이른 아침). Identical sluglines repeated 3+ times in a row is a formatting error.
7. SOLO SCENE CHECK: If a character is alone for 3 or more consecutive scenes, add another character appearing briefly (knock on door, phone call, passer-by) to break the solo streak.

Current screenplay:
${content}

Output the full expanded screenplay in Korean S# format.`;
                        const expandResult = await generateWithRetry(model, {
                            contents: [{ role: 'user', parts: [{ text: expandPrompt }] }],
                            generationConfig: { temperature: 0.6, maxOutputTokens: 16000 }
                        }, `Chunk ${i + 1} V143 expansion`);
                        const expandedText = expandResult.response.text().replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
                        if (expandedText && expandedText.length > content.length) {
                            content = scrubMeta(expandedText);
                            content = scrubInternalStatementsFallback(content); // V152 lightweight per-chunk pass
                        }
                        // V143B: Second expansion pass — if first expansion still left content under 70% of target
                        if (content && content.length < sectionLengthTarget * 0.70) {
                            const shortage2 = sectionLengthTarget - content.length;
                            console.warn(`>>> [V143B 2nd Expansion] Chunk ${i + 1}: ${content.length}/${sectionLengthTarget} chars after 1st expansion. Running 2nd pass...`);
                            const confirmedSlugNote2 = confirmedSlots.length > 0
                                ? `\n⛔ CONFIRMED SCENE LIST — do NOT create scenes beyond this list:\n${confirmedSlots.map(s => `  S# ${s.n}. ${s.intExt}. ${s.location} - ${s.timeOfDay}`).join('\n')}\n`
                                : '';
                            const expandPrompt2 = `You are a professional Korean screenplay writer. The following screenplay needs MORE content to reach the target length of ${sectionLengthTarget} characters. It is currently only ${content.length} characters.
${confirmedSlugNote2}
⛔ LENGTH GATE — MANDATORY:
  CURRENT length: ${content.length} characters
  TARGET length:  ${sectionLengthTarget} characters
  REQUIRED ADDITION: at least ${shortage2} characters
  If your output is less than ${Math.floor(sectionLengthTarget * 0.85)} characters total, it will be REJECTED as invalid.

TASK: Add ${shortage2} more characters by expanding EXISTING scenes — NOT adding new plot events.
- Extend dialogue exchanges: add 2-3 more turns per existing conversation
- Add reaction shots and physical detail to action lines
- Deepen character interactions with follow-up dialogue
- Add environmental/sensory detail (sounds, textures, lighting) to scene descriptions
- Keep all existing S# sluglines and scene structure intact

DIALOGUE FORMAT (mandatory — do not deviate):
캐릭터명
대사 내용
(Character name alone on one line → spoken text on the next line. No inline embedding.)

RULES:
1. Do NOT add new scenes or new characters
2. Do NOT add internal-state descriptions (마음속에, 생각에 잠겼다, etc.)
3. Each expansion must be filmable — physical action or spoken dialogue only
4. Write in Korean only

Current screenplay:
${content}

Output the full expanded screenplay.`;
                            try {
                                const expandResult2 = await generateWithRetry(model, {
                                    contents: [{ role: 'user', parts: [{ text: expandPrompt2 }] }],
                                    generationConfig: { temperature: 0.65, maxOutputTokens: 16000 }
                                }, `Chunk ${i + 1} V143B 2nd expansion`);
                                const expandedText2 = expandResult2.response.text().replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
                                if (expandedText2 && expandedText2.length > content.length) {
                                    content = scrubMeta(expandedText2);
                                    content = scrubInternalStatementsFallback(content); // V152 lightweight per-chunk pass
                                    console.warn(`>>> [V143B 2nd Expansion] Chunk ${i + 1}: expanded to ${content.length} chars.`);
                                }
                            } catch (e) {
                                console.warn(`>>> [V143B 2nd Expansion] Chunk ${i + 1}: error — ${e}.`);
                            }
                        }
                    } else if (!content) {
                        console.warn(`>>> [V143 Skip] Chunk ${i + 1}: no content after retries. Running V144 mini-generation...`);
                        // V144: Mini-Generation — clean pass from beats only, no JSON wrapper required
                        const miniSceneCount = Math.max(2, Math.min(5, Math.ceil(sectionLengthTarget / 400)));
                        const miniPrompt = `당신은 전문 한국어 시나리오 작가입니다.
아래 스토리 비트를 바탕으로 S# ${contextState.lastSceneNumber + 1}부터 시작하는 시나리오 ${miniSceneCount}개 씬을 작성하세요.

[스토리 비트]
${chunk}

[필수 규칙]
1. 형식: S# N. INT/EXT. 장소 - 시간대
2. 모든 씬에 반드시 대사 포함 (캐릭터명 단독 한 줄 → 대사 다음 줄)
3. 지문은 카메라로 촬영 가능한 것만 (내면 심리 금지)
4. 한국어로만 작성
5. JSON 래퍼 없이 시나리오 텍스트만 출력

시나리오:`;
                        try {
                            const miniResult = await generateWithRetry(model, {
                                contents: [{ role: 'user', parts: [{ text: miniPrompt }] }],
                                generationConfig: { temperature: 0.75, maxOutputTokens: 8000 }
                            }, `Chunk ${i + 1} V144 mini-gen`);
                            const miniText = miniResult.response.text().replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
                            if (miniText && miniText.length > 100) {
                                content = scrubMeta(miniText);
                                console.warn(`>>> [V144 Mini-Gen] Chunk ${i + 1}: Generated ${content.length} chars.`);
                            } else {
                                console.warn(`>>> [V144 Mini-Gen] Chunk ${i + 1}: Mini-generation empty. Chunk skipped.`);
                            }
                        } catch (e) {
                            console.warn(`>>> [V144 Mini-Gen] Chunk ${i + 1}: Error — ${e}. Chunk skipped.`);
                        }
                    }

                    // V141 final density after all passes — if still < 15%, use programmatic injection
                    // (raised from 5% → 15% to catch the 8.5% case that slipped through)
                    const finalDensity = content ? getDialogueDensity(content) : 0;
                    if (content && finalDensity < 0.15) {
                        console.warn(`>>> [V141 Fallback] Chunk ${i + 1} still at ${(finalDensity * 100).toFixed(1)}% after expansion. Running programmatic injection...`);
                        content = await injectDialoguePass(content, charContext, model, canonicalNames);
                    }
                    // V175: use rawMode=true so V173 penalty doesn't re-apply after V142 injection
                    console.log(`>>> [V141] Chunk ${i + 1} FINAL dialogue density: ${(getDialogueDensity(content, true) * 100).toFixed(1)}%`);

                    // V145: Consecutive slugline violation check + V147 auto-fix
                    if (content) {
                        const slugViolations = detectConsecutiveSlugs(content);
                        if (slugViolations > 0) {
                            console.warn(`>>> [V145 Slug Check] Chunk ${i + 1}: ${slugViolations} location(s) used 3+ times consecutively.`);
                            content = await fixSlugViolations(content, model, i + 1);
                        }
                        // V149: Base location streak check (3+ scenes in same general area)
                        const baseViolations = detectBaseLocationStreak(content);
                        if (baseViolations > 0) {
                            console.warn(`>>> [V149 Base Slug Check] Chunk ${i + 1}: ${baseViolations} base location(s) used ${BASE_STREAK_LIMIT}+ times consecutively. Running fix...`);
                            content = await fixSlugViolations(content, model, i + 1);
                        } else {
                            console.log(`>>> [V149 Base Slug Check] Chunk ${i + 1}: OK.`);
                        }

                        // V153: Per-chunk dream scene cap — enforce max 1 sleep/nightmare scene per chunk.
                        // Detection scans only the slug line + first 3 stage-direction lines of each scene block
                        // (excludes dialogue lines starting with a character name) to avoid false positives from
                        // characters mentioning "악몽" in conversation.
                        // '꿈' is intentionally excluded — caught via slug fast-path (- 꿈 suffix) to avoid
                        // false positives from action words like '꿈틀거리다', '꿈결' etc.
                        const DREAM_DETECT_V153 = ['악몽', '잠들', '잠에서', '꿈에서', '꿈을 꾸', '수면', '잠꼬대', '잠자리', '침대', '누워'];
                        const chunkBlocks = content.split(/(?=^S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.)/m).filter(b => b.trim());
                        // Shared inline-format dialogue detector: "이름 대사내용" on one line.
                        // Matches 2-6 Korean chars (name) followed by space and at least one more char.
                        // Used by both per-chunk and full-script dream detection.
                        const isInlineDialogueLine = (t: string): boolean =>
                            /^[가-힣]{2,6}\s+\S/.test(t) && !EXCLUDED_WORDS.has(t.split(/\s/)[0] ?? '');
                        function isDreamSceneBlock(block: string): boolean {
                            const lines = block.split('\n');
                            // Fast-path: slug line ends with "- 꿈" marker
                            const slugLine = lines.find(l => /^S#\s*\d/.test(l.trim()));
                            if (slugLine && /[-–]\s*꿈\s*$/i.test(slugLine)) return true;
                            // Scan slug + first 4 pure action lines only.
                            // Exclude: inline dialogue ("이름 대사"), slug lines (already scanned).
                            const actionLines: string[] = [];
                            for (const line of lines) {
                                if (actionLines.length >= 4) break;
                                const trimmed = line.trim();
                                if (!trimmed) continue;
                                if (/^S#\s*\d/.test(trimmed)) continue;      // slug — skip (already scanned)
                                if (isInlineDialogueLine(trimmed)) continue; // inline dialogue — skip
                                actionLines.push(trimmed);
                            }
                            const scanText = actionLines.join(' ');
                            return DREAM_DETECT_V153.some(kw => scanText.includes(kw));
                        }
                        const dreamBlocks = chunkBlocks.filter(isDreamSceneBlock);
                        if (dreamBlocks.length > 1) {
                            // V153: Deterministic-only removal — AI consolidation removed.
                            // AI consolidation (2 retries) had a high failure rate (output too short, wrong format).
                            // Instead: keep the longest dream block (most developed), remove the rest directly.
                            console.warn(`>>> [V153 Dream Cap] Chunk ${i + 1}: ${dreamBlocks.length} dream scene(s) detected (max 1). Removing extras deterministically...`);
                            const allSceneBlocks = content.split(/(?=^S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.)/m).filter(b => b.trim());
                            const sortedDreams = [...dreamBlocks].sort((a, b) => b.length - a.length);
                            const removeDreamSet = new Set(sortedDreams.slice(1)); // keep first (longest)
                            const filtered = allSceneBlocks.filter(b => !removeDreamSet.has(b));
                            const patched = filtered.join('');
                            if (patched && patched.length > content.length * 0.5) {
                                content = renumberScenes(patched);
                                const remaining = content.split(/(?=^S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.)/m).filter(b => b.trim() && isDreamSceneBlock(b)).length;
                                console.warn(`>>> [V153 Dream Cap] Chunk ${i + 1}: removed ${sortedDreams.length - 1} extra dream scene(s). Remaining: ${remaining}`);
                            }
                        } else {
                            console.log(`>>> [V153 Dream Cap] Chunk ${i + 1}: OK (${dreamBlocks.length} dream scene(s)).`);
                        }
                    }

                    if (content) {
                        fullScript += (content + "\n\n");
                        lastChunkHeader = currentHeader;
                    }

                    if (response.data.characters) {
                        response.data.characters.forEach((nc: any) => {
                            if (!finalCharacters.some(c => c.reinterpreted_name_kr === nc.reinterpreted_name_kr)) {
                                finalCharacters.push(nc);
                            }
                        });
                    }
                    contextState = updateContextState(content, contextState);
                    break; // Success
                } else {
                    console.warn(`>>> [V140 Fail-Safe] Chunk ${i + 1} parsing failed.`);
                    const lines = lastRawResponse.split('\n').filter(l => l.includes('S#') || l.includes(':') || l.length > 25);
                    if (lines.length > 3) {
                        const emergencyContent = scrubMeta(lines.join('\n'));
                        fullScript += (emergencyContent + "\n\n");
                        break;
                    }
                    retryCount++;
                    currentTemp = 0.8;
                }
            }
        }

        if (!fullScript.trim()) {
            return { success: false, error: "대본 생성 결과가 비어있습니다.", rawText: lastRawResponse };
        }

        // V142: Post-process dialogue injection — final safety net if all retries failed
        if (!hasDialogue(fullScript)) {
            console.warn(`>>> [V142 Dialogue Injection] All retries produced no dialogue. Running dedicated injection pass...`);
            fullScript = await injectDialoguePass(fullScript, charContext, model, canonicalNames);
        }

        // V164: Character name normalization — fix surname drift across chunks
        // e.g. "김해리" in first half → "도해리" in second half (AI changed surname)
        fullScript = normalizeCharacterNames(fullScript, charContext);

        // V176: Cross-chunk gender pronoun normalizer — fixes action-line pronoun inconsistencies
        // in single-speaker scenes where the charContext gender is known.
        fullScript = fixGenderPronouns(fullScript, charContext, canonicalNames);

        // V165: Anonymous protagonist fix — replace scenes where ONLY "그" is used
        // (no character name at all) with the dominant protagonist name from earlier scenes.
        fullScript = fixAnonymousProtagonist(fullScript);

        // V146: Renumber scenes sequentially to fix duplicates from Rule 6 splits
        fullScript = renumberScenes(fullScript);

        // V157: Remove duplicate transition lines between consecutive scenes
        fullScript = removeDuplicateSceneTransitions(fullScript);

        // V166: Intra-script time regression fix — auto-correct backward time jumps
        fullScript = fixTimeRegression(fullScript);

        // V167: Forbidden dialogue pattern fixer — detects and replaces clichéd lines
        fullScript = fixForbiddenPatterns(fullScript);

        // V160: Fix unnumbered bare slug lines embedded in scene bodies
        fullScript = fixUnnumberedSlugs(fullScript);

        // V162: Fix invalid/missing time-of-day in sluglines (계속, 계단-as-time, no dash)
        fullScript = fixSlugTimeOfDay(fullScript);

        // V163: Strip action/event words from slugline sub-location tokens (깨어남, 대치, 몸싸움 etc.)
        fullScript = stripActionWordsFromSlugs(fullScript);

        // V170: Empty scene remover — eliminates scenes that are just a slugline with no content.
        // These appear when V169 skeleton slots are filled with only a header and nothing else.
        // Must run BEFORE V152 scrub so empty scenes don't survive into the final script.
        fullScript = removeEmptyScenes(fullScript);

        // V152: Final internal-state scrub on assembled script (AI pass + regex fallback)
        fullScript = await scrubInternalStatements(fullScript, model);

        // V145 full-script check (cross-chunk violations) + V147 auto-fix
        const totalSlugViolations = detectConsecutiveSlugs(fullScript);
        if (totalSlugViolations > 0) {
            console.warn(`>>> [V145 Full-Script Slug Check] ${totalSlugViolations} location(s) appear 3+ times consecutively across full script. Running V147 cross-chunk fix...`);
            fullScript = await fixSlugViolations(fullScript, model, 0);
        } else {
            console.log(`>>> [V145 Full-Script Slug Check] OK — no consecutive slug violations.`);
        }

        // V149 full-script base location streak check — deterministic fix (AI fix removed).
        // Previous AI fix (fixBaseLocationViolations) consistently failed because:
        //   - It added only sub-suffixes (입구/끝/안쪽) which detectBaseLocationStreak strips
        //   - Result: V145 violations = 0 but V149 violations remain unchanged
        // New approach: inject qualifiers that are NOT in BASE_LOC_SUFFIXES, so the base changes.
        {
            const totalBaseViolations = detectBaseLocationStreak(fullScript);
            if (totalBaseViolations > 0) {
                console.warn(`>>> [V149 Full-Script Base Slug Check] ${totalBaseViolations} base location(s) appear ${BASE_STREAK_LIMIT}+ times consecutively. Running deterministic fix...`);
                fullScript = fixBaseLocationsDeterministic(fullScript);
                const afterFix = detectBaseLocationStreak(fullScript);
                if (afterFix > 0) {
                    console.warn(`>>> [V149 Full-Script Base Slug Check] ${afterFix} violation(s) remain after fix.`);
                } else {
                    console.log(`>>> [V149 Full-Script Base Slug Check] All violations resolved.`);
                }
            } else {
                console.log(`>>> [V149 Full-Script Base Slug Check] OK.`);
            }
        }

        // V153 Full-Script Dream Total Cap: max 2 dream/nightmare scenes across the entire script.
        // Per-chunk cap (max 1 per chunk) already ran; this catches the case where each chunk
        // passes individually but the assembled script has too many (e.g. 4 chunks × 1 = 4 dream scenes).
        {
            const DREAM_DETECT_FULL = ['악몽', '잠들', '잠에서', '꿈에서', '꿈을 꾸', '수면', '잠꼬대', '잠자리', '침대', '누워'];
            const FULL_DREAM_MAX = 2;
            const allBlocks = fullScript.split(/(?=^S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.)/m).filter(b => b.trim());
            // Inline dialogue detector (mirrors per-chunk isDreamSceneBlock logic)
            const isInlineDial = (t: string): boolean =>
                /^[가-힣]{2,6}\s+\S/.test(t) && !['새벽','아침','밤','낮','저녁','오전','오후','실내','실외','골목','거리','현재','과거','회상'].includes(t.split(/\s/)[0] ?? '');
            const isDream = (block: string) => {
                const lines = block.split('\n');
                const slugLine = lines[0] ?? '';
                // Slug fast-path: slugline ending in "- 꿈"
                if (/[-–]\s*꿈\s*$/.test(slugLine)) return true;
                // Scan first 4 pure action lines only — exclude inline dialogue to avoid false positives
                // from characters MENTIONING dreams in conversation ("악몽을 꿨어" etc.)
                const actionLines = lines.slice(1).filter(l => {
                    const t = l.trim();
                    if (!t) return false;
                    if (/^S#\s*\d/.test(t)) return false;  // nested slug — skip
                    if (isInlineDial(t)) return false;       // inline dialogue — skip
                    return true;
                }).slice(0, 4);
                return DREAM_DETECT_FULL.some(kw => (slugLine + ' ' + actionLines.join(' ')).includes(kw));
            };
            const dreamBlocks = allBlocks.filter(isDream);
            if (dreamBlocks.length > FULL_DREAM_MAX) {
                console.warn(`>>> [V153 Full-Script Dream Cap] ${dreamBlocks.length} dream scene(s) in assembled script (max ${FULL_DREAM_MAX}). Removing extras programmatically...`);
                // Sort by length (keep longest), remove shortest extras beyond limit
                const sorted = [...dreamBlocks].sort((a, b) => b.length - a.length);
                const toRemove = new Set(sorted.slice(FULL_DREAM_MAX).map(b => b.trim()));
                let patched = allBlocks.filter(b => !toRemove.has(b.trim())).join('');
                patched = renumberScenes(patched);
                fullScript = patched;
                console.warn(`>>> [V153 Full-Script Dream Cap] Removed ${dreamBlocks.length - FULL_DREAM_MAX} excess dream scene(s). Renumbered.`);
            } else {
                console.log(`>>> [V153 Full-Script Dream Cap] OK (${dreamBlocks.length}/${FULL_DREAM_MAX} dream scene(s)).`);
            }
        }

        // V166 (2nd pass): Re-run AFTER V153 Full-Script Dream Cap, which removes/renumbers scenes
        // and can introduce new time regressions that the earlier V166 pass never saw.
        fullScript = fixTimeRegression(fullScript);

        // ── Final Verification Summary ─────────────────────────────────────────────
        // Runs after ALL post-processing passes. Reports any remaining violations
        // without triggering further fixes (prevents infinite fix loop).
        // A non-zero count here means a fix pass was ineffective — useful for debugging.
        {
            const finalV145 = detectConsecutiveSlugs(fullScript);
            const finalV149 = detectBaseLocationStreak(fullScript);
            const finalScenes = (fullScript.match(/^S#\s*\d+/gm) || []).length;
            if (finalV145 > 0 || finalV149 > 0) {
                console.warn(`>>> [Final Verify] ⚠ Remaining violations — V145(exact): ${finalV145}, V149(base): ${finalV149}. Total scenes: ${finalScenes}.`);
            } else {
                console.log(`>>> [Final Verify] ✓ All slug/location rules satisfied. Total scenes: ${finalScenes}.`);
            }
            // V177: Post-generation check for characters invented beyond the approved roster
            detectUnregisteredCharacters(fullScript, canonicalNames);
        }

        return {
            success: true,
            data: {
                synthesized_title_kr: activeBlueprint?.saga_title_kr || "Generated Script",
                synthesized_kr: language === 'KO' ? fullScript.trim() : "",
                synthesized_en: language === 'EN' ? fullScript.trim() : "",
                reasoning: `Screenplay via ScriptScribe V141.`,
                characters: finalCharacters,
                source_metadata: { context_state: contextState }
            },
            rawText: fullScript.trim() || lastRawResponse
        };
    }
}

/**
 * V135: Multi-Stage Scrubber
 * Removes prompt leakage, tags, and common AI clutter.
 */
function scrubMeta(text: string): string {
    return text
        .replace(/\[\[SYSTEM_PROTOCOL\]\][\s\S]*?\[\[\/SYSTEM_PROTOCOL\]\]/gi, "")
        .replace(/<STRICT_REASONING_PROTOCOL>[\s\S]*?<\/STRICT_REASONING_PROTOCOL>/gi, "")
        .replace(/Professional.*Screenplay.*/gi, "")
        .replace(/High-density.*no.*\(혼잣말\).*/gi, "")
        // Remove all parenthetical stage directions from dialogue lines (e.g. (혼잣말), (잠꼬대), (펜을 멈추고))
        // Extended to 80 chars to catch longer action-in-parenthesis patterns like "(잠시 멈춰 서서 하늘을 바라본다. 눈빛이 어둡다.)"
        .replace(/\([^)]{1,80}\)\s*/g, "")
        .replace(/^.*대본.*:.*$/gm, "")
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        // V151: Replace English emotion/psychology words that slip into KO scripts
        .replace(/\bfrustration\b/gi, '좌절감')
        .replace(/\banxiety\b/gi, '불안감')
        .replace(/\bdespair\b/gi, '절망감')
        .replace(/\banger\b/gi, '분노')
        .replace(/\bconfusion\b/gi, '혼란')
        .replace(/\bguilt\b/gi, '죄책감')
        .replace(/\bdread\b/gi, '공포감')
        .replace(/\bpanic\b/gi, '공황')
        .replace(/\brelief\b/gi, '안도감')
        // V155: Remove stray English sentences (3+ consecutive English words) that bleed into KO scripts
        .replace(/^[A-Za-z][A-Za-z\s,.'"-]{15,}$/gm, '')
        .trim();
}

/**
 * V152: Internal State Scrubber
 * Primary: AI scrub pass — catches any phrasing AI generates (open-ended).
 * Fallback: regex pattern list — runs only if AI call fails or output is too short.
 *
 * Design rationale: 100+ regex patterns only ever cover observed patterns.
 * AI generates new internal-state phrasings every run, so an AI pass is the only
 * approach that can keep pace without requiring constant manual updates.
 */

// ── V152 Fallback regex patterns ─────────────────────────────────────────────
// These run ONLY when the AI scrub pass fails. They cover common patterns as a
// safety net. Do NOT continue adding new entries here — extend the AI prompt instead.
const INTERNAL_STATE_PATTERNS: RegExp[] = [
    /[^。\n]*마음속에[는은이가]?\s[^。\n]*/g,
    /[^。\n]*내면을\s*들여다본다[^。\n]*/g,
    /[^。\n]*내면에[는은]\s[^。\n]*/g,
    /[^。\n]*내면이\s[^。\n]*/g,
    /[^。\n]*불안감을\s*느낀다[^。\n]*/g,
    /[^。\n]*불안과\s*혼란이\s*가득하다[^。\n]*/g,
    /[^。\n]*혼란스러움이?\s[^。\n]*/g,
    /[^。\n]*복잡한\s*감정[^。\n]*/g,
    /[^。\n]*생각에\s*잠겼다[^。\n]*/g,
    /[^。\n]*생각에\s*잠긴다[^。\n]*/g,
    /[^。\n]*깊은\s*생각에[^。\n]*/g,
    /[^。\n]*결심한다[^。\n]*/g,
    /[^。\n]*결심을\s*다진다[^。\n]*/g,
    /[^。\n]*고독과\s*불안[^。\n]*/g,
    /[^。\n]*두려움을\s*느[^。\n]*/g,
    /[^。\n]*[을를]\s*느끼[며고]?[^。\n]*/g,
    // 결심/다짐 (과거형 포함)
    /[^。\n]*결심했다[^。\n]*/g,
    /[^。\n]*결심하[고며][^。\n]*/g,
    /[^。\n]*다짐한다[^。\n]*/g,
    /[^。\n]*다짐했다[^。\n]*/g,
    // 감정 수용/위안
    /[^。\n]*위안을\s*얻[는는다고며][^。\n]*/g,
    /[^。\n]*위로[가를이]\s*[^。\n]*/g,
    /[^。\n]*마음을\s*진정[^。\n]*/g,
    /[^。\n]*마음이\s*진정[^。\n]*/g,
    /[^。\n]*온기가\s*[^。\n]*마음[^。\n]*/g,
    /[^。\n]*따뜻한\s*[^。\n]*마음[^。\n]*/g,
    // 미래 서술형 (내면 추측)
    /[^。\n]*\uac83이다\s*$/,
    /[^。\n]*노력할\s*것이다[^。\n]*/g,
    /[^。\n]*싸워나갈\s*것이다[^。\n]*/g,
    /[^。\n]*[을를]\s*찾기\s*위해\s*노력[^。\n]*/g,
    // 운명/삶 관조
    /[^。\n]*자신의\s*운명[^。\n]*/g,
    /[^。\n]*삶의\s*고단함[^。\n]*/g,
    /[^。\n]*희망을\s*동시에[^。\n]*/g,
    /[^。\n]*믿는다\s*$/,
    /[^。\n]*알\s*수\s*있다\s*$/,
    // 추가 내면묘사 동사
    /[^。\n]*느껴진다[^。\n]*/g,
    /[^。\n]*짓누른다[^。\n]*/g,
    /[^。\n]*감지한\s*듯[^。\n]*/g,
    // ~한 듯 / ~인 듯 형태의 추측/내면 묘사 패턴
    /[^。\n]*결심한\s*듯[^。\n]*/g,
    /[^。\n]*생각하는\s*듯[^。\n]*/g,
    /[^。\n]*알고\s*있는\s*듯[^。\n]*/g,
    /[^。\n]*짐작하[고는]?\s*있는\s*듯[^。\n]*/g,
    /[^。\n]*골똘히\s*생각[^。\n]*/g,
    /[^。\n]*무언가를\s*생각[^。\n]*/g,
    /[^。\n]*깊은\s*고민[^。\n]*/g,
    /[^。\n]*고민의\s*흔적[^。\n]*/g,
    /[^。\n]*마음을\s*더욱\s*무겁[^。\n]*/g,
    /[^。\n]*무거운\s*마음[^。\n]*/g,
    // V152 추가 — 대본에서 발견된 잔존 패턴
    /[^。\n]*눈에는\s*슬픔[^。\n]*/g,
    /[^。\n]*눈에는\s*[가-힣]+이\s*가득[^。\n]*/g,
    /[^。\n]*눈빛에\s*스며든[^。\n]*/g,
    /[^。\n]*결연한\s*의지[^。\n]*/g,
    /[^。\n]*의지가\s*엿보인[^。\n]*/g,
    /[^。\n]*마음이\s*흔들[^。\n]*/g,
    /[^。\n]*뒤섞여\s*있[^。\n]*/g,
    /[^。\n]*걱정과\s*반가움[^。\n]*/g,
    /[^。\n]*불안감[이가]?\s*엄습[^。\n]*/g,
    /[^。\n]*공포가\s*엄습[^。\n]*/g,
    /[^。\n]*두려움이\s*밀려[^。\n]*/g,
    // V152 추가 — 이번 대본에서 발견된 잔존 패턴
    /[^。\n]*불안감이\s*밀려[^。\n]*/g,
    /[^。\n]*위험이\s*도사리[^。\n]*/g,
    /[^。\n]*본능적으로\s*[^。\n]*감지[^。\n]*/g,
    /[^。\n]*온몸의\s*털이\s*쭈뼛[^。\n]*/g,
    /[^。\n]*폐\s*속\s*깊[^。\n]*불안[^。\n]*/g,
    /[^。\n]*심장이\s*쿵[^。\n]*/g,
    /[^。\n]*어둠\s*속에\s*잠[겨긴][^。\n]*/g,
    /[^。\n]*희망이라는\s*단어[^。\n]*/g,
    /[^。\n]*고독은\s*깊어[^。\n]*/g,
    /[^。\n]*눈빛은\s*[가-힣\s]+으로\s*가득[^。\n]*/g,
    /[^。\n]*두려움에\s*굴복[^。\n]*/g,
    // V152 추가 — 이번 대본에서 발견된 잔존 내면 서술 패턴
    /[^。\n]*두려움에\s*사로잡[혀힌][^。\n]*/g,
    /[^。\n]*공포에\s*사로잡[혀힌][^。\n]*/g,
    /[^。\n]*힘을\s*제어할\s*수\s*없[^。\n]*/g,
    /[^。\n]*직감[하한했]다[^。\n]*/g,
    /[^。\n]*순간이\s*왔음을\s*직감[^。\n]*/g,
    /[^。\n]*마음이\s*복잡[^。\n]*/g,
    /[^。\n]*갈피를\s*잡지\s*못[^。\n]*/g,
    /[^。\n]*믿어야\s*할지.*의심[^。\n]*/g,
    /[^。\n]*두려움을\s*억누[르른][^。\n]*/g,
    /[^。\n]*이끌림[을에][^。\n]*/g,
    // V152 추가 — 이번 대본에서 발견된 인지·고민·감각 내면 서술
    /[^。\n]*어떻게\s*다뤄야\s*할지\s*고민[^。\n]*/g,
    /[^。\n]*[이가]\s*고민[한하]다[^。\n]*/g,
    /[^。\n]*[을를]\s*생각한다[^。\n]*/g,
    /[^。\n]*모른다고\s*생각[^。\n]*/g,
    /[^。\n]*것이라고\s*생각[^。\n]*/g,
    /[^。\n]*지도\s*모른다고[^。\n]*/g,
    /[^。\n]*짓누르는\s*[가-힣]+\s*기운[^。\n]*/g,
    /[^。\n]*온몸이\s*굳[어었][^。\n]*/g,
    /[^。\n]*[이가]\s*멈[춰춰]버린\s*듯[^。\n]*/g,
    /[^。\n]*마지막\s*힘을\s*짜[내냈][^。\n]*/g,
    /[^。\n]*자책하[지지]\s*마[^。\n]*/g,
];
/**
 * V152 Fallback: regex-based scrub applied when AI pass is unavailable or failed.
 * Handles the actual screenplay inline format ("이름 대사" on one line).
 */
function scrubInternalStatementsFallback(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    // Inline dialogue detector — mirrors isDreamSceneBlock logic
    const isInlineDial = (t: string) =>
        /^[가-힣]{2,6}\s+\S/.test(t) && !EXCLUDED_WORDS.has(t.split(/\s/)[0] ?? '');

    for (const raw of lines) {
        const line = raw.trim();
        // Always keep sluglines and inline dialogue untouched
        if (/^S#\s*\d+/.test(line) || isInlineDial(line)) {
            result.push(raw);
            continue;
        }
        // Action line — apply regex scrub
        let cleaned = line;
        for (const pattern of INTERNAL_STATE_PATTERNS) {
            cleaned = cleaned.replace(pattern, '');
        }
        cleaned = cleaned.trim();
        if (cleaned.length < 4) continue;
        result.push(cleaned !== line ? cleaned : raw);
    }
    return result.join('\n');
}

/**
 * V152 Primary: AI-based internal-state scrub pass.
 * Sends the assembled script to the model and asks it to remove all
 * content that cannot be filmed (internal state, past tense, narrator intrusion).
 * Falls back to regex scrub if the AI call fails or output is suspiciously short.
 */
async function scrubInternalStatements(text: string, model: any): Promise<string> {
    const scrubPrompt = `다음 한국어 시나리오 대본에서 카메라로 촬영 불가능한 내용만 지문(action line)에서 삭제하세요.

삭제 대상 — 지문에서만 해당 (대사는 절대 수정 금지):
1. 감정·심리 내면 묘사: "마음속에", "내면에", "불안감을 느낀다", "결심한다", "두려움이 밀려온다", "직감한다"
2. 과거형 시제: "~했다", "~았다/었다", "~ㅆ다" (지문은 반드시 현재형)
3. 소설체 수사: "마치 ~처럼", "~인 듯한", 직유·은유 표현
4. 서술자 개입: "~일까?", "~할 것이다", 독자에게 묻거나 미래를 단정하는 문장
5. 운명·관조 서술: "운명", "삶의 고단함", "희망과 절망이 교차", "고독은 깊어"

절대 삭제 금지:
- S# N. INT/EXT. 장소 - 시간 형식의 슬러그라인
- 인라인 대사 ("이름 대사내용" 형식의 줄 전체)
- 카메라에 보이는 행동 묘사 ("걷는다", "꺼낸다", "돌아본다", "주먹을 쥔다")

삭제된 문장이 있다면 앞뒤 지문이 자연스럽게 이어지도록 유지하세요.
수정된 대본 전체를 그대로 출력하세요. 설명·주석 없이.

대본:
${text}`;

    try {
        const result = await generateWithRetry(model, {
            contents: [{ role: 'user', parts: [{ text: scrubPrompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 24000 }
        }, 'V152 AI scrub pass');
        const scrubbed = result.response.text().replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
        // Accept if output is 80%–102% of original (prevents over-trimming AND content addition)
        const ratio = scrubbed.length / text.length;
        if (scrubbed && ratio >= 0.80 && ratio <= 1.02) {
            const removedChars = text.length - scrubbed.length;
            console.log(`>>> [V152 AI Scrub] Done. Removed ~${removedChars} chars of internal-state content.`);
            return scrubbed;
        }
        if (ratio > 1.02) {
            console.warn(`>>> [V152 AI Scrub] AI added content (${scrubbed.length} > ${text.length}). Falling back to regex scrub.`);
        } else {
            console.warn(`>>> [V152 AI Scrub] Output too short (${scrubbed.length}/${text.length}). Falling back to regex scrub.`);
        }
    } catch (e) {
        console.warn(`>>> [V152 AI Scrub] Error — ${e}. Falling back to regex scrub.`);
    }
    // Fallback: regex-based scrub
    const fallbackResult = scrubInternalStatementsFallback(text);
    console.log(`>>> [V152 Fallback Scrub] Regex scrub applied.`);
    return fallbackResult;
}

/**
 * V140: Total Restoration Engine
 * Professional Screenplay Format + Numerical Lockdown.
 */
function buildUnifiedPrompt(p: any): string {
    const isKo = p.language === 'KO';
    const langLabel = isKo ? 'KOREAN' : 'ENGLISH';
    const nextNum = p.nextSceneNumber || 1;

    const personaBlock = p.sopPersona ? `[PERSONA]\n${p.sopPersona}\n` : '';
    const guidelinesBlock = p.sopGuidelines ? `[ADDITIONAL GUIDELINES]\n${p.sopGuidelines}\n` : '';

    // 씬당 평균 글자 수: system_config SCRIPT_SCENE_AVG_CHARS 에서 fetch한 값 사용
    const avgCharsPerScene = p.sceneAvgChars || 300;
    // Cap per-section scene count: too many short scenes causes beat exhaustion in chunk 1
    const targetScenes = Math.max(3, Math.min(6, Math.ceil((p.targetChars || 1500) / avgCharsPerScene)));
    const stopAtScene = nextNum + targetScenes - 1;

    // V171: Confirmed skeleton — replaces V169 density block when extracted from source novel
    const confirmedSlots: SceneSlot[] = Array.isArray(p.confirmedSlots) && p.confirmedSlots.length > 0
        ? p.confirmedSlots
        : [];
    const hardMin = Math.max(350, Math.floor((p.targetChars || 1500) / Math.max(targetScenes, 1) * 0.85));
    const confirmedSkeletonBlock = confirmedSlots.length > 0
        ? formatConfirmedSkeleton(confirmedSlots, hardMin)
        : '';

    const dialogueAlert = p.dialogueRetry ? `
🚨 DIALOGUE FAILURE ALERT 🚨
Your previous response was REJECTED because it contained ZERO dialogue lines.
You are generating description-only content, which is a CRITICAL ERROR.
You MUST write character dialogue in EVERY single scene, no exceptions.
FORMAT: character name alone on one line → dialogue text on the next line.
DO NOT submit another response without spoken dialogue.
🚨 END ALERT 🚨
` : '';

    // V148: Dream/sleep ban — if ≥2 sleep/nightmare scenes already used, ban completely; if 1, issue strong warning
    const dreamCount = p.dreamSceneCount ?? 0;
    const dreamBan = dreamCount >= 2 ? `
⛔ [DREAM/SLEEP BAN — ACTIVE — THIS OVERRIDES ALL STORY BEATS]
This script already contains ${dreamCount} sleep/nightmare/awakening scene(s). TWO is the HARD LIMIT for the entire script.
MANDATORY: Even if the [STORY BEATS] section below explicitly mentions sleeping, dreaming, or waking from a nightmare — you MUST IGNORE THAT BEAT and write the NEXT non-sleep beat instead.
This ban takes ABSOLUTE PRIORITY over every story beat instruction below.
FORBIDDEN in this section (zero exceptions):
  × Falling asleep / lying in bed / 잠들다
  × Nightmare or dream sequence / 악몽 / 꿈을 꾸다
  × Waking up drenched in sweat / 악몽에서 깨다 / 또 악몽
  × Any "또 그 꿈" or flashback-dream hybrid
If a beat is about sleeping or nightmares → SKIP IT ENTIRELY, move to the next action beat.
⛔ [END DREAM BAN]
` : dreamCount >= 1 ? `
⚠️ [DREAM/SLEEP WARNING — 1 of 2 allowed scenes already used]
One sleep/nightmare scene has already been written. You have AT MOST ONE MORE allowed for the entire script.
MANDATORY: If the beats include "falls asleep + nightmare + wakes up" — merge ALL into EXACTLY ONE scene. Do not split into multiple S# scenes.
Do NOT write another full nightmare cycle (잠들다 → 악몽 → 깨어남) in this section.
⚠️ [END WARNING]
` : '';

    const bp = p.blueprint || {};
    const bpRules = bp.world_bible?.rules_kr || "";
    const bpGlossary = bp.glossary ? JSON.stringify(bp.glossary).substring(0, 1000) : "";
    const bpChars = bp.character_arcs ? JSON.stringify(bp.character_arcs).substring(0, 1500) : "";

    // V161: Time-of-day continuity lock — prevent temporal regression between chunks
    const timeOrder = ['낮', '저녁', '밤', '새벽', '아침'];
    const timeLock = p.lastTimeOfDay ? `
⏰ [TIME-OF-DAY CONTINUITY — MANDATORY]
The previous section ended at: **${p.lastTimeOfDay}**
Time MUST move FORWARD (or stay the same) in this section. Time progression order: 낮 → 저녁 → 밤 → 새벽 → 아침 → 낮 (next day).
FORBIDDEN: Writing a scene set in an EARLIER time-of-day than "${p.lastTimeOfDay}" without an explicit time-skip marker (e.g. "다음 날", "몇 시간 후").
If the story beats imply a different time, insert one line of narration marking the time-skip before the first scene.
⏰ [END TIME LOCK]
` : '';

    // V161: Location continuity — require a transition beat when jumping between very different locations
    const locationLock = p.lastLocation ? `
📍 [LOCATION CONTINUITY — MANDATORY]
The previous section's last scene was at: **${p.lastLocation}**
If the FIRST scene of THIS section is at a DIFFERENT location, you MUST include at least one transition beat:
- One action line showing the character leaving (e.g., "한소라, 골목을 빠져나간다.")  OR arriving (e.g., "한소라, 학원 앞에 멈춰 선다.")
- Do NOT cut directly from one distinct location to another without any bridging line.
📍 [END LOCATION LOCK]
` : '';

    // V158: Protagonist pronoun lock — inject explicit pronoun instruction if detected from prior chunks
    const pronounLock = p.protagonistPronouns ? `
🔒 [PROTAGONIST PRONOUN LOCK — MANDATORY — CANNOT BE OVERRIDDEN]
The protagonist of this script uses **${p.protagonistPronouns === '그녀' ? '그녀/그녀의/그녀를/그녀에게 (female)' : '그/그의/그를/그에게 (male)'}** pronouns.
This was determined from previously generated scenes and is LOCKED for the rest of the script.
EVERY action line referring to the protagonist MUST use ${p.protagonistPronouns === '그녀' ? '"그녀"' : '"그"'} — no exceptions.
Using ${p.protagonistPronouns === '그녀' ? '"그는", "그의", "그를"' : '"그녀는", "그녀의", "그녀를"'} for the protagonist is a CRITICAL ERROR that will be rejected.
🔒 [END PRONOUN LOCK]
` : '';

    return `
[[SYSTEM_PROTOCOL]]
[ROLE]
Professional Script Adaptor.
${confirmedSlots.length > 0
    ? `Your role for this section: **Scene Cinematographer** — the scene structure (sluglines, locations, time, characters) is PRE-CONFIRMED from the source novel. You write ONLY the action lines (physical, filmable) and dialogue for each confirmed scene. Do NOT invent new scenes, skip scenes, or change sluglines.`
    : `Convert PROSE into a high-density, visual SCREENPLAY in **${langLabel}** ONLY.`}
${pronounLock}${timeLock}${locationLock}${dreamBan}${dialogueAlert}${personaBlock}
[GOLDEN FORMAT SAMPLE — 2-character exchange (this is the standard)]
S# 10. INT. 낡은 무도장 - 밤
먼지 쌓인 매트리스 위로 달빛이 스며든다.
강태준, 가죽 장갑을 탁자 위로 던진다. 툭, 둔탁한 소리.
문이 삐걱거리며 열린다. 이서아가 들어선다. 그녀의 눈이 바닥에 놓인 장갑을 포착한다.
이서아
또 시작하려고요?
강태준
...네 알 바 아니다.
이서아, 장갑을 집어 그에게 내민다. 그는 받지 않는다.
이서아
혼자서는 감당 못 해요. 그거 알잖아요.
강태준은 등을 돌린다. 하지만 손이 장갑 쪽으로 천천히 움직인다.

[TARGET VOLUME]
This section MUST reach **${p.targetChars} characters** total. ${confirmedSlots.length > 0
    ? `Write the ${confirmedSlots.length} confirmed scenes listed below (S# ${nextNum} through S# ${nextNum + confirmedSlots.length - 1}).`
    : `Write exactly ${targetScenes} scenes: S# ${nextNum} through S# ${stopAtScene}.`}
- ${confirmedSlots.length > 0
    ? `HARD STOP: Do NOT write beyond S# ${nextNum + confirmedSlots.length - 1}. The scene structure is FIXED — do not add or remove scenes.`
    : `HARD STOP: Do NOT write S# ${stopAtScene + 1} or beyond. Stop exactly at S# ${stopAtScene}.`}
- Each scene MUST have at least 4 action lines + 2 dialogue exchanges. One-liner scenes are INVALID.
- Expand each scene with physical detail, reaction shots, and dialogue to fill the target length.
- MINIMUM LENGTH ENFORCEMENT: If you finish all scenes and your total output is less than ${Math.floor((p.targetChars || 1500) * 0.85)} characters, go back and expand the shortest scenes — add more action lines, more dialogue turns, more environmental detail — until you reach the minimum. Do NOT stop early.
- COVER ONLY the story beats listed in [STORY BEATS]. Do NOT advance to events not in those beats.
${confirmedSlots.length > 0 ? confirmedSkeletonBlock : (p.sceneSkeleton ? p.sceneSkeleton : '')}

[MANDATORY RULES]
1. **SCENE NUMBERING**: You MUST start the content with "S# ${nextNum}.". Use format "S# N. [PLACE] - [TIME]".
2. **HIGH DENSITY**: Merge multiple paragraphs into one dense S# sequence. NO "S1", "S2" shortcuts.
3. **ZERO PROSE LEAK**: Action lines describe ONLY what a camera physically records — movement, sound, touch, visible expression. If a line CANNOT be filmed, DELETE it and replace it with spoken dialogue or a physical action.
   FORBIDDEN phrases (these cannot be filmed — replace with action or dialogue):
   × "마음속에", "내면", "~을 느낀다", "생각에 잠겼다", "불안감을 느끼", "혼란스러움", "깨달았다", "복잡한 감정"
   × "~인 듯", "마치 ~같았다", "~한 표정" (unless followed by a specific physical detail)
   × Any sentence describing internal emotion, intention, or attitude that has no physical manifestation
4. **DIALOGUE PURITY**: No "(혼잣말)", "(침묵)". Action lines for silence.
5. **DIALOGUE MANDATORY**: Every scene MUST contain at least ONE spoken dialogue line. Characters MUST speak. A scene with ZERO dialogue lines is INVALID and will be rejected. OUTPUT WITH NO DIALOGUE WILL BE DISCARDED. IF THE SOURCE HAS NO DIALOGUE, YOU MUST INVENT APPROPRIATE DIALOGUE — DO NOT use the absence of dialogue in the source as an excuse to omit it.
6. **NO CONSECUTIVE SILENT SCENES**: You MUST NOT write 3 or more consecutive scenes without dialogue. Insert spoken lines to break any silent streak.
7. **DIALOGUE DENSITY**: At least 30% of all lines in the output must be character dialogue lines (character name on its own line followed by spoken text).
8. **3:1 RULE**: After every 3 action lines, you MUST write a dialogue exchange (character name + spoken line). This is a hard structural constraint. A "block" of more than 3 consecutive action lines with no dialogue is a formatting error that will be rejected.
9. **DIALOGUE FORMAT**: Write the character name alone on one line, then the spoken line below it. Example:
김해리
여기서 뭘 하는 거요?
10. **INVENT DIALOGUE**: Screenwriters CREATE dialogue. Even when adapting prose with no dialogue, you MUST give characters voices. Invent lines that reveal character, advance plot, or react to the situation.
11. **NO REPETITION**: Every scene MUST advance the story forward. If a scene does not change the situation, location, or character state compared to the previous scene — DO NOT write it. Merge or skip it. Writing the same hesitation, awakening, or action twice in two consecutive scenes is a CRITICAL ERROR.
    **SLEEP/DREAM HARD LIMIT**: If the beats include any combination of "falls asleep", "has nightmare", and "wakes up" — write ALL of this as EXACTLY ONE SCENE. Do NOT split the sleep cycle into 2, 3, or 4 separate S# scenes. Merge "잠들다 → 악몽 → 깨어남" into a SINGLE slugline. Maximum 1 sleep-related S# scene per section, regardless of how many beats reference it.
    **NIGHTMARE CYCLE TOTAL LIMIT**: The ENTIRE script (all sections combined) may contain at most 2 sleep/nightmare/waking scenes. If your beats list multiple nightmare occurrences, select only the MOST DRAMATICALLY IMPORTANT ONE and skip the rest.
12. **MULTI-CHARACTER SCENES**: Whenever the story beats involve 2+ characters, scenes MUST feature dialogue exchanges between them — not solo monologue. A character talking only to themselves when other characters are present is an error.
13. **SOLO SCENE RULE**: When a character is genuinely alone:
    (a) Limit spoken self-talk to MAXIMUM **1 dialogue block** (one line or two lines at most) per solo scene. A character talking to themselves in multiple separate speech turns (two NAME: … blocks in one scene) is FORBIDDEN.
    (b) Fill the scene with: physical actions (문을 박찬다, 주먹을 쥔다, 사진을 뒤집는다), ambient sounds (발소리, 빗소리, 전화벨), environmental changes (바람이 창문을 흔든다, 가로등이 깜박인다).
    (c) Inner reflection MUST be expressed through a PHYSICAL OBJECT or ACTION — never as a spoken thought. BAD: "내가 왜 이렇게 됐지?" / "젠장, 이놈의 우울은 끝이 없나." → GOOD: character picks up a photo, stares at it, then puts it face-down.
    (d) After MAXIMUM 3 consecutive scenes with the same character alone, you MUST introduce another character (even briefly — a knock, a call, a passer-by).
    (e) A scene where a character walks alone and ONLY delivers self-talk monologues (no meaningful action, no other person) does NOT deserve its own scene number. Merge it into the next or previous scene instead.
14. **LOCATION VARIETY**:
    (a) EXACT SLUGLINE: Do NOT write more than 2 consecutive scenes with the EXACT same slugline (same place AND same time of day). Two scenes with identical sluglines back-to-back is a formatting error.
    (b) GENERAL AREA: Do NOT write more than **3** consecutive scenes in the same GENERAL AREA (same building, same street, same zone), even with different sub-location suffixes (입구/중앙/안쪽/부엌/방 한가운데/세면대 etc.). Example: "INT. 낡은 방" appearing 3 scenes in a row (방 한가운데, 세면대 앞, 문 앞) is a VIOLATION — move the character outside or to a completely different building after 2 sub-scenes.
    (c) BATTLE/ACTION: Fight sequences are especially prone to location clumping. After 2 combat scenes in the same area, MOVE to a completely different location — rooftop, building interior, nearby plaza, etc.
    (d) SLUG TIME FORMAT: Every slugline MUST end with a valid Korean time-of-day: 낮/저녁/밤/새벽/아침/이른 아침/늦은 밤/한밤중. FORBIDDEN time markers: "계속", "계속됨", "이어서", "cont.". If a scene continues in the same time, repeat the actual time word (e.g. "- 아침" again). Sub-locations like "계단", "복도" MUST appear BEFORE the final dash, never after it: "INT. 건물 계단 - 아침" (✓) vs "INT. 건물 - 계단" (✗).
15. **LOCATION TRANSITION**: Whenever the story moves from one distinct location to another (e.g., alley → school, point-A → point-B), you MUST include a brief transition beat showing the character LEAVING or ARRIVING. Never cut directly between two very different locations without a bridging line. Example: one action line + one dialogue is sufficient.
16. **SCENE COMPLETION**: Every scene you start MUST be fully written before moving to the next. Never end a scene mid-action or mid-dialogue. An incomplete final scene is worse than writing one fewer scene.
17. **RESOLVED CONFLICT RULE**: Once a conflict is explicitly RESOLVED within the episode (a character overcomes a fear, thanks someone for curing a problem, leaves smiling), do NOT reintroduce the SAME conflict again later in the same episode without a clear narrative justification (e.g., a time-skip, a new cause, or a plot twist that makes sense). Repeating a conflict that was already resolved is a story continuity error. Example: if nightmares are cured in scene 16, scene 17 must NOT show the same character waking from the same nightmares.
18. **UNIQUE DIALOGUE PER SCENE**: Each character's lines must be DISTINCT across all scenes in this section AND across the entire script.
    - Do NOT copy the same spoken sentence verbatim in two different scenes. Even close paraphrases of the same sentiment are forbidden if they already appeared in the [VISUAL BRIDGE] or continuation anchor above.
    - FORBIDDEN repeated patterns: "넌 할 수 있어", "포기하지 마", "내가 옆에 있잖아", "우리가 있잖아", "고마워, [이름]. 네가 있어서 정말 다행이야", "당연하지. 우리는 [X]잖아."
    - If a supporting character needs to comfort the protagonist again, use a COMPLETELY DIFFERENT approach: reference a specific shared memory, make a joke, give a concrete task, ask a hard question, or say nothing and act physically instead.
    - BEFORE writing any dialogue, mentally check: "Did any character say something very similar earlier in this script?" If yes — rewrite the line entirely.
19. **CONSISTENT GENDER PRONOUNS**: Check the [CHARACTER DB] for each character's gender. Use 그녀/그녀의/그녀를/그녀에게 for female characters and 그/그의/그를/그에게 for male characters CONSISTENTLY across EVERY scene you write. Never switch pronouns for the same character between scenes. If the source prose uses incorrect pronouns for a character, use the [CHARACTER DB] gender as the authoritative source and correct them. Mixing 그 and 그녀 for the same character within a single script section is a CRITICAL ERROR.
20. **NO DUPLICATE TRANSITION LINES**: When writing consecutive scenes in the same location or continuing an action from the previous scene, do NOT repeat the same action line as both the closing line of one scene and the opening line of the next. Each scene must open with NEW content. Example of FORBIDDEN pattern — S# 4 ends with "강유나, 뒤따라 들어간다." and S# 5 opens with the same "강유나, 뒤따라 들어간다." → delete the duplicate opening line from S# 5 and start S# 5 with the NEXT action.
21. **SLUG FORMAT — TIME OF DAY MANDATORY**: Every single slugline MUST follow the format: "S# N. INT/EXT. 장소명 [선택: 서브위치] - 시간대". Rules:
    × Time-of-day token (밤/새벽/아침/낮/저녁/이른 아침/늦은 밤) MUST be the LAST element after the final dash.
    × FORBIDDEN time markers: "계속", "계속됨", "이어서", "cont." — repeat the actual time word instead.
    × Sub-location (계단, 복도, 계단, 거울 앞 etc.) MUST appear BEFORE the dash: "INT. 건물 계단 - 아침" (✓) NOT "INT. 건물 - 계단" (✗).
    × FORBIDDEN action words as sub-location: "전투", "결투", "격전", "추격", "전장" — these are EVENTS not places. Describe the event in the ACTION LINE instead. Use the physical place: "EXT. 서울 뒷골목 - 저녁" (✓) NOT "EXT. 서울 뒷골목 전투 - 저녁" (✗).
    × A BATTLE or CHASE in the same general area must NOT get a new sub-location slug for every exchange. Write the entire fight under ONE slug, and use action lines to show movement within that space.
${guidelinesBlock}
[[/SYSTEM_PROTOCOL]]

${p.canonicalNames?.length > 0 ? `🔒 [CHARACTER NAME ROSTER — EXACT SPELLING — MANDATORY]
The following are the ONLY correct spellings for character names in this script.
You MUST use these exact names in every action line and dialogue header. No variants, no typos, no surname changes.
${(p.canonicalNames as string[]).map((n: string) => `  • ${n}`).join('\n')}
Using any other spelling (e.g. a different surname with the same given name) is a CRITICAL ERROR that causes script corruption.
🔒 [END NAME ROSTER]

` : ''}[CHARACTER DB]
${(p.characters || "").substring(0, 3000)}

[BLUEPRINT CONTEXT]
World Rules: ${bpRules}
Character Arcs: ${bpChars}
Glossary: ${bpGlossary}

[WORLD SETTINGS]
${(p.settings || "").substring(0, 2000)}

[STORY BEATS]
${p.plot}

[SOURCE PROSE]
${p.sourceProse}

[VISUAL BRIDGE]
${p.chronicle}
${p.recentSlugs?.length > 0 ? `
[RECENTLY USED SLUGLINES — DO NOT OVERUSE]
The following scene locations were already used in previous sections. You MUST introduce at least 2 NEW locations this section. Do NOT write 3 or more consecutive scenes that share the same location+time from this list:
${([...new Set(p.recentSlugs)] as string[]).map(s => `- ${s}`).join('\n')}
` : ''}
[JSON OUTPUT — MANDATORY]
⚠️ YOU MUST RETURN ONLY VALID JSON. Do NOT output raw screenplay text outside of a JSON object.
⚠️ The "content" field MUST contain ALL screenplay text as a single JSON string value (use \\n for line breaks inside the string).
⚠️ If your response is not parseable JSON, the entire chunk will be DISCARDED and the script will be broken.
⚠️ Do NOT wrap the JSON in markdown code blocks (no \`\`\`json). Output raw JSON only.
{
  "title": "Sequence ${p.idx}/${p.total}",
  "content": "S# ${nextNum}. [PLACE] - [TIME]\\n[action]\\n[CHARACTER NAME]\\n[spoken dialogue]\\n...",
  "characters": []
}
`;
}

function updateContextState(content: string, state: any) {
    const lines = content.split('\n').filter(l => l.trim());

    // V140: Strict Slugline Tracking.
    const slugMatches = content.match(/^S#\s*(\d+)/gm) || content.match(/S#\s*(\d+)/g) || content.match(/^S\s*(\d+)/gm);
    let lastScene = state.lastSceneNumber;
    if (slugMatches) {
        const numbers = slugMatches.map(m => parseInt(m.replace(/\D/g, "")));
        lastScene = Math.max(...numbers, state.lastSceneNumber);
    }

    // Capture visual anchor.
    const actionLines = lines.filter(l =>
        !l.includes('S#') &&
        l.trim().length > 15 &&
        !/^[가-힣A-Z\s]+$/.test(l.trim()) &&
        !l.includes('{') &&
        !l.includes('}')
    );
    const lastAction = actionLines[actionLines.length - 1] || state.lastAction;

    // Track recently used sluglines to inject into the next chunk prompt (include A-suffix variants)
    const sluglineMatches = content.match(/^S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.\s*[^\n]+/gm) || [];
    const extractedSlugs = sluglineMatches.map(s => s.replace(/^S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.\s*/, '').trim()).filter(Boolean);
    const updatedSlugs = [...(state.recentSlugs || []), ...extractedSlugs].slice(-8);

    // V148: dream scene tracking — count sleep/nightmare S# scene blocks (not keyword mentions)
    const DREAM_DETECT = ['악몽', '잠들', '잠에서', '꿈에서', '꿈을 꾸', '수면', '잠꼬대', '잠자', '자리에 누워'];
    // Count how many S# scene blocks in this chunk contain dream/sleep content
    const sceneBlocks = content.split(/(?=^S#\s*\d+)/m).filter(b => b.trim());
    const dreamBlocksInChunk = sceneBlocks.filter(b =>
        DREAM_DETECT.some(kw => b.includes(kw))
    ).length;

    // V158: Protagonist pronoun detection — scan action lines (non-dialogue) for 그녀 vs 그 usage.
    // Only update if not yet determined. This locks in the pronoun after the first chunk generates content.
    let detectedPronoun = state.protagonistPronouns || '';
    if (!detectedPronoun) {
        // Count pronoun usage in action lines only (skip dialogue lines)
        const actionOnlyText = (() => {
            const scriptLines = content.split('\n');
            const result: string[] = [];
            let skipNext = false;
            for (const ln of scriptLines) {
                const t = ln.trim();
                if (!t || t.startsWith('S#')) { skipNext = false; continue; }
                const isName = /^[가-힣]{2,6}$/.test(t) && !EXCLUDED_WORDS.has(t);
                if (isName) { skipNext = true; continue; }
                if (skipNext) { skipNext = false; continue; }
                result.push(t);
            }
            return result.join(' ');
        })();
        const herCount = (actionOnlyText.match(/그녀/g) || []).length;
        // Match 그/그의/그는/그를/그에게 but NOT 그녀 (negative lookbehind on 녀)
        const himCount = (actionOnlyText.match(/(?<![가-힣])그(?:의|는|를|가|에게|와|도|만|조차|마저)(?!녀)/g) || []).length;
        if (herCount + himCount >= 3) {
            detectedPronoun = herCount >= himCount ? '그녀' : '그';
        }
    }

    // V161: Track last time-of-day and last location from the final slug line in this chunk
    const TIME_OF_DAY_ORDER = ['낮', '저녁', '밤', '새벽', '아침'];
    let lastTimeOfDay = state.lastTimeOfDay || '';
    let lastLocation = state.lastLocation || '';
    if (sluglineMatches.length > 0) {
        const lastSlug = sluglineMatches[sluglineMatches.length - 1];
        const slugBody = lastSlug.replace(/^S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.\s*/, '').trim();
        // Extract time-of-day: last segment after final dash
        const dashParts = slugBody.split('-');
        const timePart = dashParts[dashParts.length - 1]?.trim() ?? '';
        if (timePart && TIME_OF_DAY_ORDER.some(t => timePart.includes(t))) {
            lastTimeOfDay = timePart;
        }
        // Extract base location: first segment before dash
        const locPart = dashParts[0]?.replace(/^(INT|EXT|I|E)\.\s*/i, '').trim() ?? '';
        if (locPart) lastLocation = locPart;
    }

    return {
        ...state,
        lastAction: scrubMeta(lastAction).substring(0, 300),
        lastSceneNumber: lastScene,
        lastThreeLines: lines.slice(-3).join('\n'),
        recentSlugs: updatedSlugs,
        dreamSceneCount: (state.dreamSceneCount ?? 0) + dreamBlocksInChunk,
        protagonistPronouns: detectedPronoun,
        lastTimeOfDay,
        lastLocation
    };
}

/**
 * V141: Dialogue Presence Validator
 * Detects at least one character name line followed by a dialogue line.
 * False-positive guard: excludes common time/place words (새벽, 아침, 밤, etc.)
 *
 * Strategy 1 (standard format): standalone name line → next line is dialogue
 * Strategy 2 (prose-embedded format): speech-pattern sentences within continuous prose
 *   — handles cases where expansion passes strip standalone name headers but dialogue
 *     remains embedded inline (e.g. "어서 오세요.", "저는...요?", "...알겠습니다.")
 */
const EXCLUDED_WORDS = new Set([
    // Time of day
    '새벽', '아침', '밤', '낮', '저녁', '오전', '오후',
    // Place tokens
    '실내', '실외', '골목', '거리', '입구', '복도', '계단', '옥상', '창가', '문앞', '앞마당',
    // Narrative markers
    '현재', '과거', '회상', '계속', '동시',
    // Relational nouns — CRITICAL: prevent V168 from picking these up as character names
    '친구', '선생', '교수', '학생', '교장', '교감', '형사', '경찰', '의사', '간호',
    '노인', '행인', '손님', '주인', '사장', '직원', '점원', '관리', '기자',
    // Role/archetype nouns that appear in charContext descriptions
    '악령', '악당', '괴물', '귀신', '영혼', '존재', '형체', '그림자',
    // Common pronoun-like words that slip through
    '그녀가', '그들이', '우리가', '그들을',
    // V173 fix: abstract nouns from charContext descriptions mistaken for character names (V168 Pattern E)
    '잠재력', '역할', '수행', '교육', '방식', '성격', '비밀', '관계', '능력',
    '미래', '세대', '흥미', '과거', '멘토', '조언', '조력', '릴리프', '결정',
    '현대', '전통', '융합', '수업', '스파이', '이중', '마법', '무술', '개성',
]);

// Speech-ending patterns that reliably indicate spoken Korean dialogue
// Matches: 요./요?  세요  나요  인가요  하죠  합니까  겠습니다  etc.
const SPEECH_PATTERN_RE = /(?:요|세요|나요|인가요|하죠|죠|합니까|겠습니다|십시오|해봐요|봐요)[.?!]?\s*$/;
// Conversational starters / reactions common in dialogue
const SPEECH_STARTER_RE = /^(?:아|어|오|이|네|예|응|그래|맞아|좋아|알았어|알겠|잠깐|잠시만|저|나|우리|당신|너|뭐|왜|어떻게|언제|어디|누구)/;

function hasDialogue(content: string): boolean {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

    // Strategy 1: standard screenplay format — standalone name line → dialogue line
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        const isKoreanName = /^[가-힣]{2,6}$/.test(line) && !EXCLUDED_WORDS.has(line) && !line.includes('.');
        const isEnglishName = /^[A-Z][A-Z\s]{1,24}$/.test(line);
        if ((isKoreanName || isEnglishName) && !lines[i + 1].startsWith('S#') && lines[i + 1].length > 4) {
            return true;
        }
    }

    // Strategy 2: prose-embedded format — detect speech patterns within body text.
    // Strip slug prefix from each line before checking.
    const SLUG_PREFIX_RE = /^S#\s*\d+[A-Za-z가-힣]?\.\s*(?:INT|EXT|I|E)\.[^-]+-\s*\S+\s*/i;
    for (const rawLine of lines) {
        const body = rawLine.replace(SLUG_PREFIX_RE, '').trim();
        if (!body) continue;
        // Split body into individual sentences
        const sentences = body.split(/(?<=[.!?…])\s+/);
        for (const sent of sentences) {
            const s = sent.trim();
            if (s.length < 4 || s.length > 120) continue;
            if (SPEECH_PATTERN_RE.test(s)) return true;
            if (SPEECH_STARTER_RE.test(s) && s.length < 60) return true;
            // Ellipsis mid-sentence (very common in Korean dialogue hesitation)
            if (s.includes('...') && s.length < 50) return true;
        }
    }

    return false;
}

/**
 * Measures the ratio of dialogue lines to total non-empty, non-slugline lines.
 * A "dialogue line" is the spoken text immediately following a character name line.
 * Returns a value between 0.0 and 1.0.
 *
 * Strategy 1: standard format (standalone name header)
 * Strategy 2: prose-embedded format — counts sentences with speech endings as dialogue
 */
// V175: rawMode=true skips the V173 monologue penalty — used for final FINAL logging
// after V142 injection where we know injection already ran and further retries won't help.
function getDialogueDensity(content: string, rawMode = false): number {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    let dialogueLines = 0;
    let totalLines = 0;
    const speakers = new Set<string>(); // V173: track unique speakers for monologue detection

    // Strategy 1: standard format
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('S#')) continue; // skip sluglines
        totalLines++;
        const isKoreanName = /^[가-힣]{2,6}$/.test(line) && !EXCLUDED_WORDS.has(line) && !line.includes('.');
        const isEnglishName = /^[A-Z][A-Z\s]{1,24}$/.test(line);
        if ((isKoreanName || isEnglishName) && i + 1 < lines.length && !lines[i + 1].startsWith('S#') && lines[i + 1].length > 4) {
            speakers.add(line); // track who speaks
            dialogueLines++; // name line
            i++;             // advance to spoken line
            totalLines++;    // spoken line also counts toward total
            dialogueLines++; // spoken line
        }
    }

    // If standard format detected dialogue, return that ratio
    if (dialogueLines > 0) {
        const rawDensity = Math.min(1.0, dialogueLines / Math.max(1, totalLines));
        // V173: monologue penalty — single speaker = internal monologue, not exchange dialogue
        // Apply 50% penalty so V141 fallback (threshold 15%) triggers correctly.
        // rawMode bypasses penalty (used for final logging after V142 injection).
        if (!rawMode && speakers.size <= 1) {
            const soloName = [...speakers][0] ?? '?';
            console.warn(`>>> [V173 Monologue] Single speaker "${soloName}" — applying 50% monologue penalty (${(rawDensity * 100).toFixed(1)}% → ${(rawDensity * 50).toFixed(1)}%).`);
            return rawDensity * 0.5;
        }
        return rawDensity;
    }

    // Strategy 2: prose-embedded format — count speech-pattern sentences
    const SLUG_PREFIX_RE = /^S#\s*\d+[A-Za-z가-힣]?\.\s*(?:INT|EXT|I|E)\.[^-]+-\s*\S+\s*/i;
    let totalSentences = 0;
    let speechSentences = 0;
    for (const rawLine of lines) {
        const body = rawLine.replace(SLUG_PREFIX_RE, '').trim();
        if (!body) continue;
        const sentences = body.split(/(?<=[.!?…])\s+/);
        for (const sent of sentences) {
            const s = sent.trim();
            if (s.length < 4) continue;
            totalSentences++;
            if (SPEECH_PATTERN_RE.test(s) || (SPEECH_STARTER_RE.test(s) && s.length < 60) || (s.includes('...') && s.length < 50)) {
                speechSentences++;
            }
        }
    }
    if (totalSentences === 0) return 0;
    return Math.min(1.0, speechSentences / totalSentences);
}

/**
 * V142: Guaranteed Per-Scene Dialogue Injection
 * Runs when the main generation loop produces zero dialogue after all retries.
 *
 * Strategy: instead of asking the AI to rewrite the whole script (which it keeps ignoring),
 * we split by S# scene, extract the character name per scene, batch-generate one dialogue
 * line per scene in a single focused LLM call, then INSERT them programmatically.
 * The insertion format is controlled by our code, not the AI — guaranteeing correct format.
 */
// V174: Forbidden patterns that V142 must never inject into a script
const V142_FORBIDDEN_INJECT = [
    '내가 옆에 있잖아', '넌 할 수 있어', '포기하지 마', '함께라면 해낼 수 있어',
    '할 수 있어', '포기하지마', '포기 하지마', '힘내',
];

async function injectDialoguePass(script: string, charContext: string, model: any, canonicalNames?: string[]): Promise<string> {
    // Split into S# scene blocks
    const sceneBlocks = script.split(/(?=S#\s*\d+\.)/).filter(b => b.trim());
    if (!sceneBlocks.length) return script;

    // For each scene, identify the dominant character using canonicalNames (preferred)
    // or fall back to first action-subject pattern.
    // V174 fix: do NOT use action verbs like "스며들자" as character names.
    const sceneInfos = sceneBlocks.map((block, idx) => {
        let charName: string | null = null;
        if (canonicalNames && canonicalNames.length > 0) {
            // Prefer a canonical name that appears as a standalone dialogue header in this scene
            const standaloneRe = new RegExp(`^(${canonicalNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`, 'm');
            const m = block.match(standaloneRe);
            charName = m ? m[1] : null;
            // Fallback: canonical name that appears anywhere in the block (action subject)
            if (!charName) {
                charName = canonicalNames.find(n => block.includes(n)) ?? null;
            }
        } else {
            // Legacy: match action-subject pattern — but ONLY accept names that are ≥3 chars
            // to avoid single/dual-char verbs like "스며들자" being misidentified.
            const nameMatch = block.match(/(?:^|\n)([가-힣]{3,4}),\s/);
            charName = nameMatch && !EXCLUDED_WORDS.has(nameMatch[1]) ? nameMatch[1] : null;
        }
        return { idx, block, charName };
    });

    const scenesWithChars = sceneInfos.filter(s => s.charName);
    if (!scenesWithChars.length) {
        console.warn(`>>> [V142] No character names found in scenes. Cannot inject dialogue.`);
        return script;
    }

    // Batch-generate one dialogue line per scene in a single LLM call
    const batchPrompt = `You are writing Korean screenplay dialogue.
For each numbered scene below, write ONE short Korean spoken line for the named character.
Output ONLY a JSON array of strings, one per scene, in the same order.
RULES:
- Natural spoken Korean only — no action descriptions
- NO parentheticals like (혼잣말) or (잠꼬대) — just the spoken words
- Keep each line concise (1-2 sentences)
Example output: ["이게 맞는 길인가...", "거기서 뭐 하는 거야?", "아무 말 하지마."]

[CHARACTER INFO]
${charContext.substring(0, 1500)}

[SCENES]
${scenesWithChars.map((s, i) => `Scene ${i + 1} — ${s.charName} speaks:\n${s.block.substring(0, 250)}`).join('\n\n')}`;

    try {
        const result = await generateWithRetry(model, {
            contents: [{ role: 'user', parts: [{ text: batchPrompt }] }],
            generationConfig: { temperature: 0.8, maxOutputTokens: 2000 }
        }, 'V142 dialogue injection');
        const responseText = result.response.text();
        const match = responseText.match(/\[[\s\S]*\]/);
        if (!match) {
            console.warn(`>>> [V142] Batch dialogue generation returned no JSON array.`);
            return script;
        }

        const dialogueLines: string[] = JSON.parse(match[0]);

        // Programmatically insert each dialogue line into the correct scene block
        const updatedBlocks = [...sceneBlocks];
        scenesWithChars.forEach((sceneInfo, i) => {
            const dialogueLine = (dialogueLines[i] || "").trim();
            if (!dialogueLine) return;
            // V174: skip injection if generated line contains a forbidden cliché pattern
            if (V142_FORBIDDEN_INJECT.some(p => dialogueLine.includes(p))) {
                console.warn(`>>> [V142 Forbidden Skip] Line rejected for scene ${sceneInfo.idx + 1}: "${dialogueLine.substring(0, 40)}"`);
                return;
            }

            const lines = sceneInfo.block.split('\n');
            // Insert after the second non-empty line (after scene heading + first action)
            const insertAt = Math.min(3, lines.length);
            lines.splice(insertAt, 0, `${sceneInfo.charName}\n${dialogueLine}`);
            updatedBlocks[sceneInfo.idx] = lines.join('\n');
        });

        const injected = updatedBlocks.join('');
        console.log(`>>> [V142] Dialogue injected into ${scenesWithChars.length} scenes programmatically.`);
        return injected;
    } catch (err) {
        console.error(`>>> [V142] Injection pass failed:`, err);
        return script;
    }
}

/**
 * V140.6: Converts a `scenes` JSON array (model alternate output format) to S# screenplay text.
 * Called when safeParseJSON succeeds but response.data has no `content` field, only `scenes`.
 */
function convertScenesJsonToScreenplay(scenes: any[]): string {
    return scenes.map((scene: any) => {
        const slug = `S# ${scene.scene_number}. ${scene.location}`;
        const body = Array.isArray(scene.actions) ? scene.actions.join('\n') : '';
        return `${slug}\n${body}`;
    }).filter(s => s.trim()).join('\n\n');
}

/**
 * V145: Extracts only the "INT/EXT. LOCATION - TIME" portion from a slugline,
 * stripping any action text that may appear on the same line.
 */
function extractSlugKey(rawSlug: string): string {
    // Remove "S# N." or "S# 13A." prefix (alpha suffix included)
    const body = rawSlug.replace(/^S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.\s*/, '').trim();
    // Match up to and including the time indicator (밤/낮/새벽/아침/오후/저녁/황혼/심야 etc.)
    const m = body.match(/^(?:INT|EXT)\..+?-\s*(?:밤|낮|새벽|이른\s*아침|아침|오후|저녁|황혼|심야|한낮|정오)/);
    return m ? m[0].trim() : body.split(/\s{2,}/)[0].trim();
}

/**
 * V147: When V145 finds 3+ consecutive slugline violations in a chunk,
 * runs a targeted slugline-only correction pass. Content is never altered.
 */
async function fixSlugViolations(script: string, model: any, chunkNum: number): Promise<string> {
    const fixPrompt = `아래 한국어 대본에서 동일한 씬 헤더(S# N. 장소 - 시간대)가 3번 이상 연속으로 반복됩니다.
연속된 씬 헤더 중 일부를 씬 내용에 어울리는 더 구체적인 하위 장소로 수정하세요.

규칙:
1. S# 번호는 절대 변경하지 마세요.
2. 씬 헤더(S# N. 부분)만 수정. 액션/대사 내용은 절대 변경 금지.
3. 수정된 헤더는 씬 내용(해당 씬에서 실제 일어나는 일)과 일치해야 합니다.
4. 실내(INT.) 동일 장소가 연속될 때는 구역/방위/상태 접미사로 분리하세요.
   예) 훈련장 → 훈련장 입구 / 훈련장 중앙 / 훈련장 한쪽
   예) 사무실 → 사무실 창가 / 사무실 복도 / 사무실 안쪽
   예) 교실 → 교실 앞 / 교실 뒤 / 교실 복도
5. 실외(EXT.) 동일 장소가 연속될 때는 구체적 위치/상태 접미사로 분리하세요.
   예) 골목 → 골목 입구 / 골목 안쪽 / 골목 끝
   예) 건물 앞 → 건물 정문 앞 / 건물 옆길 / 건물 뒤쪽
6. 수정 후 동일 헤더가 연속 3번 이상 나타나지 않도록 반드시 확인하세요.
7. 한국어로만 작성. 수정된 대본 전체를 그대로 출력하세요.
8. ⚠️ 씬 헤더에 행동 묘사 단어를 절대 포함하지 마세요. "뒤돌아보는", "묻는", "싸우는", "대화하는", "달리는" 같은 동사형 표현은 FORBIDDEN입니다. 헤더는 오직 장소명 + 시간대만 포함해야 합니다. 나쁜 예) "EXT. 골목길 뒤돌아보는 강준혁 - 새벽" → 좋은 예) "EXT. 골목길 안쪽 - 새벽"

대본:
${script}`;

    try {
        // Full-script fix needs more tokens than per-chunk fix
        const fixTokens = script.length > 6000 ? 24000 : 12000;
        const result = await generateWithRetry(model, {
            contents: [{ role: 'user', parts: [{ text: fixPrompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: fixTokens }
        }, `V147 slug fix chunk ${chunkNum}`);
        const fixed = result.response.text().replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
        if (fixed && fixed.length > script.length * 0.9) {
            const remaining = detectConsecutiveSlugs(fixed);
            console.warn(`>>> [V147 Slug Fix] Chunk ${chunkNum}: violations fixed. Remaining: ${remaining}`);
            return fixed;
        }
    } catch (e) {
        console.warn(`>>> [V147 Slug Fix] Chunk ${chunkNum}: Error — ${e}.`);
    }
    return script;
}

/**
 * V149 전용 Fix: 동일 베이스 장소가 BASE_STREAK_LIMIT번 이상 연속될 때 호출.
 * V147(fixSlugViolations)과 달리, 서브 suffix 추가가 아닌 장소명 자체를 인접 다른 장소로
 * 변경하도록 AI에게 지시한다. fix 후 detectBaseLocationStreak으로 잔류를 재확인한다.
 *
 * 설계 이유:
 *  - V147은 "서울 골목 입구 / 안쪽 / 끝"처럼 suffix를 추가 → detectConsecutiveSlugs(완전 일치)에서는 0이지만
 *    detectBaseLocationStreak(베이스 비교)에서는 여전히 "서울 골목" 3연속으로 감지됨.
 *  - 따라서 V149 위반은 베이스 장소를 실질적으로 다른 장소로 교체해야만 해결됨.
 */
async function fixBaseLocationViolations(script: string, model: any): Promise<string> {
    const fixPrompt = `아래 한국어 대본에서 동일한 넓은 지역(예: "서울 골목", "허름한 방", "훈련장")이 3개 이상 씬에서 연속으로 사용되어 있습니다.
이 경우 서브 위치 접미사(입구/안쪽/끝)를 추가하는 것만으로는 부족합니다. 연속된 씬 중 하나 이상의 장소를 실제로 다른 인접 장소로 변경하세요.

규칙:
1. S# 번호는 절대 변경하지 마세요.
2. 씬 헤더(S# N. 부분)만 수정. 액션/대사 내용은 절대 변경 금지.
3. 장소를 변경할 때는 씬 내 실제 행동·공간 묘사와 일치하는 인접 장소로 바꾸세요.
   예) "서울 골목" 3연속 → 중간 씬을 "EXT. 서울 거리 모퉁이" 또는 "EXT. 버려진 건물 앞"으로 변경
   예) "허름한 방" 3연속 → 한 씬을 "INT. 허름한 방 복도" 또는 "INT. 건물 계단"으로 변경
   예) "신성학원 훈련장" 3연속 → 한 씬을 "INT. 신성학원 복도" 또는 "EXT. 신성학원 운동장"으로 변경
4. 변경 후 동일 베이스 장소(넓은 지역)가 연속 3번 이상 등장하지 않도록 확인하세요.
5. 한국어로만 작성. 수정된 대본 전체를 그대로 출력하세요. 설명 없이.
6. ⚠️ 씬 헤더에 행동 묘사 단어를 절대 포함하지 마세요. 헤더는 오직 장소명 + 시간대만 포함.

대본:
${script}`;

    try {
        const fixTokens = script.length > 6000 ? 24000 : 12000;
        const result = await generateWithRetry(model, {
            contents: [{ role: 'user', parts: [{ text: fixPrompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: fixTokens }
        }, 'V149 base-location fix');
        const fixed = result.response.text().replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
        if (fixed && fixed.length > script.length * 0.85) {
            const remaining = detectBaseLocationStreak(fixed);
            const remainingExact = detectConsecutiveSlugs(fixed);
            console.warn(`>>> [V149 Base Fix] Done. Remaining base violations: ${remaining}, exact violations: ${remainingExact}`);
            return fixed;
        }
        console.warn(`>>> [V149 Base Fix] Output too short (${result.response.text().length}/${script.length}), keeping original.`);
    } catch (e) {
        console.warn(`>>> [V149 Base Fix] Error — ${e}.`);
    }
    return script;
}

/**
 * V145: Detects how many distinct locations appear 3+ times consecutively in a script.
 * Returns the count of such violations for logging purposes.
 */
function detectConsecutiveSlugs(script: string): number {
    // Include optional alpha suffix (e.g. S# 13A.) so A-variants are counted as scene headers
    const slugLines = script.match(/^S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.\s*.+/gm) || [];
    const locations = slugLines.map(extractSlugKey);
    let violations = 0;
    let streak = 1;
    for (let j = 1; j < locations.length; j++) {
        if (locations[j] === locations[j - 1]) {
            streak++;
            if (streak === 3) violations++;
        } else {
            streak = 1;
        }
    }
    return violations;
}

/**
 * V149: Extracts the BASE location name, stripping sub-location suffixes added by V147.
 * Example: "EXT. 낡은 골목길 초입 - 새벽" → "EXT. 낡은 골목길 - 새벽"
 */
// V149 BASE_LOC_SUFFIXES: strips sub-location tokens appearing BEFORE the "- 시간대" dash.
// CRITICAL: Do NOT include actual location names (뒷골목, 골목, 거리 are PLACES not suffixes).
// Only list words that describe a sub-area WITHIN a larger named location.
// V149 BASE_LOC_SUFFIXES: sub-area tokens that appear BEFORE "- 시간대" within a slugline.
// Rules:
//  1. Only include words that describe a sub-area WITHIN a larger named place (e.g. "중앙", "입구").
//  2. Do NOT include compound tokens like "골목 입구" — "입구" alone already handles
//     "서울 골목 입구" correctly (strips " 입구" → "서울 골목"), while "골목 입구" would
//     over-strip, making "서울 골목 입구" → "서울" (wrong base).
//  3. Action/event words are listed in SLUG_ACTION_WORDS (V163) and must NOT appear here.
const BASE_LOC_SUFFIXES = /\s+(입구|출구|중앙|중간|한가운데|안쪽|한쪽|끝|구석|옆길|뒤쪽|위|아래|강변|강가|강위|산위|산아래|정문\s*앞|창가|복도|계단|세면대\s*앞|문\s*앞|초입|막다른\s*길|연기\s*속|어둠\s*속|책상\s*앞|가로등\s*아래|담벼락\s*앞|담벼락|침대\s*옆|침대\s*앞|냉장고\s*앞|현관\s*앞|현관|명상\s*중|창문\s*앞|바닥|지하|2층|3층|옥상|어귀|한복판|거울\s*앞)(?=\s*-)/u;
function extractBaseLocation(rawSlug: string): string {
    return extractSlugKey(rawSlug).replace(BASE_LOC_SUFFIXES, '').trim();
}

// V149: threshold lowered 5→3 to match Rule 14b (max 3 consecutive general-area scenes).
const BASE_STREAK_LIMIT = 3;

/**
 * V149: Detects how many distinct BASE locations appear BASE_STREAK_LIMIT+ times consecutively.
 * Catches battles/chases where V147 sub-location splits fool V145.
 */
function detectBaseLocationStreak(script: string): number {
    const slugLines = script.match(/^S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.\s*.+/gm) || [];
    const bases = slugLines.map(extractBaseLocation);
    let violations = 0;
    let streak = 1;
    for (let j = 1; j < bases.length; j++) {
        if (bases[j] === bases[j - 1]) {
            streak++;
            if (streak === BASE_STREAK_LIMIT) violations++; // trigger at exactly LIMIT, not LIMIT+1
        } else {
            streak = 1;
        }
    }
    return violations;
}

/**
 * V146: Renumber all S# scene numbers in assembled fullScript sequentially.
 * Handles both "S# 13." and "S# 13A." (alpha-suffixed) formats produced when
 * the model bypasses HARD STOP by inserting 13A instead of a new number.
 */
function renumberScenes(script: string): string {
    let counter = 0;
    // Match S# followed by digits with optional alpha/Korean suffix (e.g. 13A, 14B, 12계단, 23 계단) then a dot
    // Handles both attached suffixes (23A, 23계단) and space-separated Korean words (23 계단)
    return script.replace(/^(S#\s*)\d+(?:\s*[A-Za-z가-힣]+)?(\.\s*)/gm, (_, prefix, suffix) => {
        counter++;
        return `${prefix}${counter}${suffix}`;
    });
}

/**
 * V157: Removes duplicate action lines that appear at the end of one scene and
 * the beginning of the next. Prevents verbatim repetition when the AI echoes a
 * transition beat as both a closing action and an opening action.
 */
function removeDuplicateSceneTransitions(script: string): string {
    const blocks = script.split(/(?=^S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.)/m).filter(b => b.trim());
    if (blocks.length < 2) return script;

    let removedTotal = 0;
    const result: string[] = [blocks[0]];

    for (let i = 1; i < blocks.length; i++) {
        const prevBlock = result[result.length - 1];
        const currBlock = blocks[i];

        // Collect last meaningful action lines of previous block (non-slug, non-empty, substantial)
        const prevLines = prevBlock.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('S#'));
        const prevTail = new Set(prevLines.slice(-5).filter(l => l.length > 10));

        // Find slug line index in current block
        const currBlockLines = currBlock.split('\n');
        const slugIdx = currBlockLines.findIndex(l => /^S#\s*\d+/.test(l.trim()));
        const afterSlug = currBlockLines.slice(slugIdx + 1);

        // Detect duplicate lines at start of current block's content
        let dupCount = 0;
        for (const line of afterSlug.slice(0, 5)) {
            const trimmed = line.trim();
            if (trimmed.length > 10 && prevTail.has(trimmed)) {
                dupCount++;
            } else if (trimmed) {
                break; // stop at first non-duplicate non-empty line
            }
        }

        if (dupCount > 0) {
            // Remove duplicate opening lines from current block
            let removed = 0;
            const cleanedAfterSlug = afterSlug.filter(line => {
                if (removed >= dupCount) return true;
                if (!line.trim()) return true; // keep blank lines
                if (line.trim().length > 10 && prevTail.has(line.trim())) {
                    removed++;
                    return false;
                }
                return true;
            });
            const slugLine = slugIdx >= 0 ? currBlockLines[slugIdx] : currBlockLines[0];
            result.push([slugLine, ...cleanedAfterSlug].join('\n'));
            removedTotal += removed;
            console.warn(`>>> [V157 Dup Remove] Scene ${i + 1}: removed ${removed} duplicate opening line(s).`);
        } else {
            result.push(currBlock);
        }
    }

    if (removedTotal > 0) {
        console.log(`>>> [V157 Dup Remove] Total ${removedTotal} duplicate transition line(s) removed across script.`);
    }
    return result.join('');
}

/**
 * V162: Fix invalid time-of-day markers in sluglines.
 * Handles two problems:
 *   (a) "- 계속" / "- 계속됨" / "- continued" — replace with the last valid time-of-day seen
 *   (b) Missing time-of-day entirely (e.g. "INT. 천도당 - 계단") — append last valid time
 * Valid time markers: 낮, 저녁, 밤, 새벽, 아침, 오전, 오후, 이른 아침, 한낮, 한밤, 늦은 밤, 해질녘
 */
function fixSlugTimeOfDay(script: string): string {
    const VALID_TIMES = ['이른 아침', '늦은 밤', '한밤중', '해질녘', '한낮', '이른 저녁', '낮', '저녁', '밤', '새벽', '아침', '오전', '오후'];
    const INVALID_TIME_RE = /^(계속됨?|continued|cont\.?|이어서)$/i;

    let lastValidTime = '아침'; // sensible fallback
    let fixed = 0;

    const result = script.replace(
        /^(S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.\s*(?:INT|EXT|I|E)\.[^\n]+)$/gm,
        (slugLine) => {
            // Extract time segment: everything after the last '-'
            const dashIdx = slugLine.lastIndexOf('-');
            if (dashIdx === -1) {
                // No dash at all — append last valid time
                fixed++;
                const newSlug = `${slugLine.trimEnd()} - ${lastValidTime}`;
                console.warn(`>>> [V162 Slug Time Fix] No time-of-day → appended "${lastValidTime}": ${slugLine.trim()}`);
                return newSlug;
            }

            const timePart = slugLine.substring(dashIdx + 1).trim();

            // Check if time part is valid
            const isValid = VALID_TIMES.some(t => timePart.includes(t));
            if (isValid) {
                // Update lastValidTime to the matched token
                const matched = VALID_TIMES.find(t => timePart.includes(t));
                if (matched) lastValidTime = matched;
                return slugLine;
            }

            // Invalid time (계속, 계단 used as time, etc.) — replace with last valid
            if (INVALID_TIME_RE.test(timePart) || !timePart) {
                fixed++;
                const base = slugLine.substring(0, dashIdx).trimEnd();
                const newSlug = `${base} - ${lastValidTime}`;
                console.warn(`>>> [V162 Slug Time Fix] Invalid time "${timePart}" → replaced with "${lastValidTime}": ${slugLine.trim()}`);
                return newSlug;
            }

            // Looks like a sub-location or action word used as time (e.g. "계단", "복도", "전투") —
            // Integrated V163 logic: if the token is an action word, drop it entirely (don't move to place).
            // Otherwise move it into the place-name part and append correct time.
            // This avoids double-dash AND eliminates the separate V163 pass for this specific case.
            const isSubLoc = /^[가-힣\s]{1,10}$/.test(timePart) && !VALID_TIMES.some(t => timePart.includes(t));
            if (isSubLoc) {
                fixed++;
                const placeBase = slugLine.substring(0, dashIdx).trimEnd();
                // Check if the token is an action/event word — if so, just drop it (don't pollute the place name)
                const isActionWord = SLUG_ACTION_WORDS_SET.has(timePart.trim());
                const newSlug = isActionWord
                    ? `${placeBase} - ${lastValidTime}`                   // drop action word
                    : `${placeBase} ${timePart} - ${lastValidTime}`;      // move sub-loc to place name
                console.warn(`>>> [V162 Slug Time Fix] Sub-loc-as-time "${timePart}" (${isActionWord ? 'action word — dropped' : 'sub-loc — moved'}) → ${newSlug.trim()}`);
                return newSlug;
            }

            return slugLine;
        }
    );

    if (fixed > 0) {
        console.warn(`>>> [V162 Slug Time Fix] Fixed ${fixed} slug(s) with invalid/missing time-of-day.`);
    }
    return result;
}

/**
 * V163: Strip action/event words from slugline sub-location tokens.
 * AI sometimes uses verbs or event descriptions as sub-locations:
 *   "INT. 천도당 깨어남 - 새벽" → "INT. 천도당 - 새벽"
 *   "INT. 천도당 안쪽 대치 - 이른 아침" → "INT. 천도당 안쪽 - 이른 아침"
 * These words describe WHAT HAPPENS in the scene, not WHERE it takes place.
 * They must appear in action lines, not sluglines.
 */
const SLUG_ACTION_WORDS = /\s+(깨어남|마주침|대립|대치|몸싸움|충돌|도주|추적|탈출|은신|잠복|운명의\s*시작|어둠\s*속|격전|전투|결투|추격|격전지|긴장|위기|위험|절정|전야|결전|각성|발동|변신|폭발|충격|맞닥뜨림|발각|침투|잠입|대결|비밀|고백|위협|협박|습격|매복|기습)(?=\s*-)/gu;
// Set version for O(1) lookup inside V162 isSubLoc branch
const SLUG_ACTION_WORDS_SET = new Set(['깨어남','마주침','대립','대치','몸싸움','충돌','도주','추적','탈출','은신','잠복','운명의 시작','어둠 속','격전','전투','결투','추격','격전지','긴장','위기','위험','절정','전야','결전','각성','발동','변신','폭발','충격','맞닥뜨림','발각','침투','잠입','대결','비밀','고백','위협','협박','습격','매복','기습']);

function stripActionWordsFromSlugs(script: string): string {
    let fixed = 0;
    const result = script.replace(
        /^(S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.\s*(?:INT|EXT|I|E)\.[^\n]+)$/gm,
        (slugLine) => {
            const cleaned = slugLine.replace(SLUG_ACTION_WORDS, (match, word) => {
                fixed++;
                console.warn(`>>> [V163 Slug Action Strip] Removed action word "${word.trim()}" from slug: ${slugLine.trim()}`);
                return ''; // remove the token entirely; trailing space before '-' handled by regex
            });
            return cleaned;
        }
    );
    if (fixed > 0) {
        console.warn(`>>> [V163 Slug Action Strip] Removed ${fixed} action-word token(s) from sluglines.`);
    }
    return result;
}

/**
 * V160: Fix unnumbered slug lines embedded in scene bodies.
 * Detects lines like "EXT. 장소 - 시간" or "INT. 장소 - 시간" that are missing the "S# N." prefix
 * and assigns them proper sequential scene numbers.
 */
function fixUnnumberedSlugs(script: string): string {
    // Regex matches a slug-like line that does NOT start with S#
    // Pattern: line starts with INT./EXT./I./E. followed by location - time
    const unnumberedSlugRe = /^((?:INT|EXT|I|E)\.[ \t].+?-[ \t].+)$/gm;
    const matches = [...script.matchAll(unnumberedSlugRe)];
    if (matches.length === 0) return script;

    let fixed = script;
    let repaired = 0;
    for (const m of matches) {
        const line = m[1];
        // Skip if already preceded by S# on the same line (shouldn't happen but be safe)
        if (/S#\s*\d/.test(line)) continue;
        // Find the last S# number before this position
        const before = fixed.substring(0, fixed.indexOf(line));
        const prevNums = [...before.matchAll(/^S#\s*(\d+)/gm)].map(x => parseInt(x[1], 10));
        const lastNum = prevNums.length > 0 ? Math.max(...prevNums) : 0;
        const newNum = lastNum + 1;
        // Replace the bare slug line with a properly numbered one
        fixed = fixed.replace(line, `S# ${newNum}. ${line}`);
        repaired++;
    }
    if (repaired > 0) {
        console.warn(`>>> [V160 Unnumbered Slug Fix] Assigned S# numbers to ${repaired} bare slug line(s).`);
        fixed = renumberScenes(fixed);
    }
    return fixed;
}

/**
 * V170: Empty Scene Remover
 * Detects and removes scenes where the content beneath the slugline is absent or
 * trivially short (< EMPTY_SCENE_THRESHOLD chars). These arise when V169 skeleton
 * slots are opened but not filled by the AI.
 *
 * Strategy:
 *   - Split script into scene blocks on S# boundaries
 *   - For each block: strip the slugline, measure remaining content length
 *   - If content < EMPTY_SCENE_THRESHOLD → mark for removal
 *   - Renumber after removal
 */
function removeEmptyScenes(script: string): string {
    const EMPTY_SCENE_THRESHOLD = 40; // chars — below this the scene is considered empty
    const blocks = script.split(/(?=^S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.)/m).filter(b => b.trim());

    let removedCount = 0;
    const kept: string[] = [];
    for (const block of blocks) {
        const lines = block.split('\n');
        const slugIdx = lines.findIndex(l => /^S#\s*\d/.test(l.trim()));
        if (slugIdx === -1) {
            // Not a scene block (e.g. leading whitespace), keep as-is
            kept.push(block);
            continue;
        }
        // Content = everything after the slug line
        const contentLines = lines.slice(slugIdx + 1).filter(l => l.trim());
        const contentLength = contentLines.join('').length;
        if (contentLength < EMPTY_SCENE_THRESHOLD) {
            removedCount++;
            // Omit this block
        } else {
            kept.push(block);
        }
    }

    if (removedCount > 0) {
        console.warn(`>>> [V170 Empty Scene] Removed ${removedCount} empty/stub scene(s) (< ${EMPTY_SCENE_THRESHOLD} chars of content).`);
        return renumberScenes(kept.join(''));
    }
    console.log(`>>> [V170 Empty Scene] OK — no empty scenes detected.`);
    return script;
}

/**
 * V149: Deterministic Base Location Streak Fix
 *
 * Previous approach (AI): reliably failed — AI added sub-suffixes (입구/끝/안쪽) that
 * `detectBaseLocationStreak` strips via BASE_LOC_SUFFIXES → violations remained.
 *
 * New approach: inject qualifiers that are NOT in BASE_LOC_SUFFIXES so the base
 * location string actually changes, breaking the streak detection.
 *
 * Algorithm (multi-pass until clean or max 5 iterations):
 *   1. Parse all sluglines with line indices
 *   2. Walk the sequence; at each position where streak >= BASE_STREAK_LIMIT,
 *      inject a qualifier into that slugline before "- [time]"
 *   3. The qualifier is chosen from UNIQUE_QUALIFIERS (all absent from BASE_LOC_SUFFIXES)
 *   4. Repeat until detectBaseLocationStreak = 0 or no further changes possible
 */
function fixBaseLocationsDeterministic(script: string): string {
    // Qualifiers that do NOT appear in BASE_LOC_SUFFIXES — each uniquely changes the base
    const UNIQUE_QUALIFIERS = ['모퉁이', '사거리', '외벽', '도로변', '갈림길', '건물 사이', '지하 통로'];
    let qualIdx = 0;
    let current = script;

    for (let pass = 0; pass < 5; pass++) {
        if (detectBaseLocationStreak(current) === 0) break;

        const lines = current.split('\n');
        const slugPattern = /^S#\s*\d+(?:\s*[A-Za-z가-힣]+)?\.\s*.+/;

        // Build slug index: [ {lineIdx, rawLine, base} ]
        const slugEntries: Array<{ lineIdx: number; rawLine: string; base: string }> = [];
        for (let i = 0; i < lines.length; i++) {
            if (slugPattern.test(lines[i].trim())) {
                slugEntries.push({ lineIdx: i, rawLine: lines[i], base: extractBaseLocation(lines[i].trim()) });
            }
        }

        let streak = 1;
        let madeChange = false;
        for (let j = 1; j < slugEntries.length; j++) {
            if (slugEntries[j].base === slugEntries[j - 1].base) {
                streak++;
                if (streak >= BASE_STREAK_LIMIT) {
                    // Inject qualifier before the "- [time]" portion of this slugline
                    const entry = slugEntries[j];
                    const qualifier = UNIQUE_QUALIFIERS[qualIdx % UNIQUE_QUALIFIERS.length];
                    qualIdx++;
                    const timeRe = /(\s*-\s*(?:밤|낮|새벽|이른\s*아침|아침|오후|저녁|황혼|심야|한낮|정오))/;
                    const newRawLine = entry.rawLine.replace(timeRe, ` ${qualifier}$1`);
                    if (newRawLine !== entry.rawLine) {
                        lines[entry.lineIdx] = newRawLine;
                        slugEntries[j].base = extractBaseLocation(newRawLine.trim());
                        madeChange = true;
                        streak = 1; // reset after injection
                    }
                }
            } else {
                streak = 1;
            }
        }

        current = lines.join('\n');
        if (!madeChange) break;
    }

    const remaining = detectBaseLocationStreak(current);
    console.warn(`>>> [V149 Deterministic Fix] Done. Remaining base violations: ${remaining}`);
    return current;
}

/**
 * V169: Scene Density Enforcer (redesigned — slot-list approach removed)
 *
 * PREVIOUS APPROACH (slot-list) caused scene fragmentation:
 *   - Listing N scene slots → AI treated each slot as a checkbox
 *   - Result: 33 scenes → 41 scenes with same total volume (shorter per scene)
 *   - Empty scenes appeared when AI ran out of content (S#28, S#33 with only sluglines)
 *
 * NEW APPROACH (density enforcement):
 *   - Still specifies exact scene count and start number
 *   - Explicitly FORBIDS skeleton scenes (slugline-only or < hardMin chars)
 *   - Tells the AI what to do when content runs out: expand PREVIOUS scenes, don't open new ones
 *   - Provides per-scene minimum char budget as a hard constraint, not just a target
 *   - Dream ban and overused location avoidance remain
 */
function buildSceneSkeleton(params: {
    startScene: number;
    targetScenes: number;
    targetChars: number;
    recentSlugs: string[];
    dreamSceneCount: number;
    lastTimeOfDay: string;
}): string {
    const { startScene, targetScenes, targetChars, recentSlugs, dreamSceneCount } = params;
    if (targetScenes <= 0) return '';

    const minCharsPerScene = Math.floor(targetChars / targetScenes);
    // Hard minimum: 85% of even-split budget, floor at 350 chars (~4 action lines + 2 dialogue)
    const hardMin = Math.max(350, Math.floor(minCharsPerScene * 0.85));
    const stopAtScene = startScene + targetScenes - 1;

    // Find overused base locations (appeared ≥ 2 times in the last 8 slugs)
    const baseCount = new Map<string, number>();
    for (const slug of recentSlugs) {
        const base = slug.replace(/^(INT|EXT|I|E)\.\s*/i, '').split('-')[0]?.trim() ?? '';
        if (base) baseCount.set(base, (baseCount.get(base) ?? 0) + 1);
    }
    const overusedLocs = [...baseCount.entries()].filter(([_, c]) => c >= 2).map(([loc]) => loc);

    const dreamBanLine = dreamSceneCount >= 1
        ? `\n🚫 DREAM/NIGHTMARE TOTAL BAN: ${dreamSceneCount} dream scene(s) already written. Do NOT write any sleep/nightmare/dream/bed scene in this chunk — not even one.`
        : '';

    const locBanLine = overusedLocs.length > 0
        ? `\n📍 OVERUSED LOCATIONS (do NOT use as a consecutive base): ${overusedLocs.slice(0, 3).join(' / ')}`
        : '';

    return `
[SCENE DENSITY REQUIREMENT — HARD RULES]
Write exactly ${targetScenes} scenes: S# ${startScene} through S# ${stopAtScene}.

🚫 SKELETON SCENES ARE FORBIDDEN:
   A "skeleton scene" is a slugline (S# N. PLACE - TIME) with fewer than ${hardMin} characters of actual content beneath it.
   If you open a new S# and realize you have nothing to write, DO NOT leave it as a heading.
   Instead: go BACK to the previous scene and add more dialogue turns, reaction shots, or environmental detail.

🚫 EMPTY SCENES ARE FORBIDDEN:
   Every S# MUST contain AT LEAST: 3 action lines + 1 spoken dialogue exchange.
   A scene with zero dialogue or zero action lines is INVALID and causes script corruption.

📏 PER-SCENE MINIMUM: Each scene must be at least ${hardMin} characters long (excluding its slugline).
   Total output must be at least ${Math.floor(targetChars * 0.85)} characters.
   If you finish all ${targetScenes} scenes below ${Math.floor(targetChars * 0.85)} characters,
   revisit the SHORTEST scenes and expand them — never add extra stub scenes to reach the count.
${dreamBanLine}${locBanLine}
[END SCENE DENSITY REQUIREMENT]
`;
}

/**
 * V168: Canonical Character Name Extractor
 * Deterministically extracts character names from charContext before generation begins.
 * Only accepts names that appear ≥2 times in charContext (avoids incidental word matches).
 * Used to build the NAME ROSTER injected into every chunk prompt.
 */
function extractCanonicalNamesFromContext(charContext: string): string[] {
    const counts = new Map<string, number>();

    // Pattern A: action subject "이름," — e.g. "김해리, 문을 열며"
    for (const m of charContext.matchAll(/([가-힣]{2,4}),/g)) {
        const n = m[1];
        if (!EXCLUDED_WORDS.has(n)) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    // Pattern B: standalone name on its own line (dialogue header format)
    for (const line of charContext.split('\n')) {
        const t = line.trim();
        if (/^[가-힣]{2,4}$/.test(t) && !EXCLUDED_WORDS.has(t)) {
            counts.set(t, (counts.get(t) ?? 0) + 1);
        }
    }
    // Pattern C: "이름:" label format common in character description sheets
    for (const m of charContext.matchAll(/([가-힣]{2,4})\s*[:：]/g)) {
        const n = m[1];
        if (!EXCLUDED_WORDS.has(n)) counts.set(n, (counts.get(n) ?? 0) + 2); // slightly boosted
    }
    // Pattern D: "- 이름 (" bullet-point with parenthetical English name
    // e.g. "- 김해리 (Kim Hae-ri):", "- 백산 (Choi Dohyun):"
    for (const m of charContext.matchAll(/[-•]\s*([가-힣]{2,4})\s+\(/g)) {
        const n = m[1];
        if (!EXCLUDED_WORDS.has(n)) counts.set(n, (counts.get(n) ?? 0) + 3); // high boost — primary roster format
    }
    // Pattern E: possessive/object marker "이름의|이름을|이름이|이름은|이름을|이름에게"
    // catches names in description text like "해리의 잠재력", "해리를 돕는"
    for (const m of charContext.matchAll(/([가-힣]{2,4})(?:의|을|이|은|를|에게|과|와)\s/g)) {
        const n = m[1];
        if (!EXCLUDED_WORDS.has(n) && n.length >= 2) counts.set(n, (counts.get(n) ?? 0) + 1);
    }

    // V168 fix: lower threshold to 1 for Pattern D names (they are definitively canonical)
    // Names with Pattern D boost (≥3 initial) pass even with threshold=2
    return [...counts.entries()]
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name);
}

/**
 * V167: Forbidden Dialogue Pattern Fixer
 * Detects clichéd consolation/solidarity dialogue patterns and replaces them with
 * non-clichéd alternatives. Previously read-only; now auto-corrects.
 *
 * Each entry: [label, findRegex, replacement]
 */
function fixForbiddenPatterns(script: string): string {
    // Replacement can be a plain string or a context-aware function.
    // Function signature: (match, offset, fullStr) => replacementString
    type Replacer = string | ((match: string, offset: number, str: string) => string);
    const FORBIDDEN: Array<[string, RegExp, Replacer]> = [
        // Solidarity/consolation clichés → direct/action-oriented alternatives
        ['우리가 있잖아',            /우리가 있잖아/g,                      '여기 있어.'],
        ['내가 옆에 있잖아',         /내가 옆에 있잖아/g,                   '여기 있어.'],
        ['네가 있어서 정말 다행',     /네가 있어서 정말 다행이야/g,          '같이 해결하면 돼.'],
        ['너희들이 있어서 정말 다행', /너희들이 있어서 정말 다행이야/g,      '같이 움직이자.'],
        // V167 context-aware: if a solidarity phrase immediately precedes (있잖아/함께/같이/여기 있),
        // the simple "같이 해결하자." replacement would create a redundant pair.
        // In that case use a more contrasting reply; otherwise use the default replacement.
        ['혼자가 아니야', /혼자가 아니[야에][.!]?/g, (match: string, offset: number, str: string) => {
            const preceding = str.substring(Math.max(0, offset - 70), offset);
            return /있잖아|함께|같이|여기 있|우리/.test(preceding)
                ? '그래도 뭐가 달라져.'
                : '같이 해결하자.';
        }],
        ['혼자 짊어지지 마',         /혼자\s*짊어지지?\s*마[.!]?/g,         '움직이자. 같이.'],
        ['우리가 함께할게',          /우리가\s*함께할게[.!]?/g,             '따라와.'],
        ['함께라면 무엇이든',        /함께라면\s*무엇이든[^.!?]*/g,         '같이 움직이자.'],
        ['함께니까',                 /함께니까[.!]?/g,                      '같이 가자.'],
        // Encouragement clichés → concrete alternatives
        ['포기하지 마',              /포기하지\s*마[.!]?/g,                 '앞으로 가.'],
        ['넌 할 수 있어',            /넌\s*할 수 있어[.!]?/g,               '해내는 거야.'],
        ['할 수 있을 거야',          /할 수 있을 거[야야]?[.!]?/g,          '반드시 해내야 해.'],
        // Gratitude-relief combos — replace entire matched segment
        ['고마워.+다행이야',         /고마워(.{0,20})다행이야[.!]?/g,       '고마워.'],
        ['다행이야.+고마워',         /다행이야(.{0,20})고마워[.!]?/g,       '고마워.'],
    ];

    let result = script;
    const hits: string[] = [];
    for (const [label, re, replacement] of FORBIDDEN) {
        if (re.test(result)) {
            result = typeof replacement === 'function'
                ? result.replace(re, replacement as (match: string, ...args: any[]) => string)
                : result.replace(re, replacement);
            hits.push(label);
        }
    }

    if (hits.length > 0) {
        console.warn(`>>> [V167 Forbidden Patterns] Fixed ${hits.length} pattern(s): ${hits.join(' | ')}`);
    } else {
        console.log(`>>> [V167 Forbidden Patterns] OK — no forbidden patterns detected.`);
    }
    return result;
}

/**
 * V166: Intra-Script Time Regression Fixer
 * Scans all sluglines in sequence. When time-of-day moves BACKWARD without a skip marker,
 * replaces the regressed time label with the forward-flowing continuation of the previous time.
 * Time order: 낮 → 저녁 → 밤 → 새벽 → 아침 → 낮 (next day)
 * Forward-next map: 낮→저녁, 저녁→밤, 밤→새벽, 새벽→이른 아침, 아침→낮
 */
function fixTimeRegression(script: string): string {
    const TIME_ORDER = ['낮', '저녁', '밤', '새벽', '아침'];
    const FORWARD_NEXT: Record<string, string> = {
        '낮': '저녁', '저녁': '밤', '밤': '새벽', '새벽': '이른 아침', '아침': '낮'
    };
    const SKIP_MARKERS = ['다음 날', '몇 시간 후', '다음날', '며칠 후', '이튿날', '그 다음 날'];
    // V173 fix: capture multi-word Korean time labels like "이른 아침", "늦은 밤", "한밤중"
    // [가-힣]+(?:\s+[가-힣]+)? = one or two Korean words; post captures trailing notes like "(꿈)"
    const SLUG_RE = /^(S#\s*\d+[A-Za-z가-힣]?\.\s*(?:INT|EXT|I|E)\.[^-]+-\s*)([가-힣]+(?:\s+[가-힣]+)?)(.*)/m;

    // Collect all slugline positions and their matched times
    const entries: Array<{ time: string; matchIdx: number; fullMatch: string; pre: string; post: string }> = [];
    const globalRe = /^(S#\s*\d+[A-Za-z가-힣]?\.\s*(?:INT|EXT|I|E)\.[^-]+-\s*)([가-힣]+(?:\s+[가-힣]+)?)(.*)/gm;
    for (const m of script.matchAll(globalRe)) {
        const timeToken = m[2]?.trim() ?? '';
        // V173: store the BASE time key (for ordering) and the FULL token (for replacement)
        // e.g. "이른 아침" → base='아침', fullToken='이른 아침'
        const baseTime = TIME_ORDER.find(t => timeToken.includes(t));
        if (baseTime) {
            entries.push({ time: baseTime, matchIdx: m.index ?? 0, fullMatch: m[0], pre: m[1], post: m[3] ?? '' });
        }
    }

    let fixed = script;
    let fixCount = 0;
    // Iterate in reverse order so string replacement offsets don't drift
    for (let i = entries.length - 1; i >= 1; i--) {
        const prev = entries[i - 1];
        const curr = entries[i];
        const prevIdx = TIME_ORDER.indexOf(prev.time);
        const currIdx = TIME_ORDER.indexOf(curr.time);
        const isRegression = currIdx < prevIdx && !(prevIdx >= 3 && currIdx <= 1);
        if (!isRegression) continue;
        // Check skip marker in the text between prev and curr sluglines
        const between = fixed.substring(prev.matchIdx, curr.matchIdx);
        if (SKIP_MARKERS.some(m => between.includes(m))) continue;
        // Compute the corrected time: one step forward from prev.time
        const correctedTime = FORWARD_NEXT[prev.time] ?? prev.time;
        // Replace only the time token in the current slugline
        const correctedSlug = curr.pre + correctedTime + curr.post;
        fixed = fixed.substring(0, curr.matchIdx) + correctedSlug + fixed.substring(curr.matchIdx + curr.fullMatch.length);
        console.warn(`>>> [V166 Time Regression] ${curr.fullMatch.split('.')[0]}: ${prev.time} → ${curr.time} fixed to "${correctedTime}"`);
        fixCount++;
    }
    if (fixCount === 0) {
        console.log(`>>> [V166 Time Regression] OK — no time regressions detected.`);
    } else {
        console.warn(`>>> [V166 Time Regression] Fixed ${fixCount} regression(s).`);
    }
    return fixed;
}

/**
 * V165: Anonymous Protagonist Fix
 * Detects scene blocks that use only generic "그" as the subject with NO 3-char Korean name
 * in the action lines. Replaces the first occurrence of "그," (action subject) with the
 * dominant protagonist name derived from the rest of the script.
 *
 * Scope: only action lines (not dialogue lines) and only when the scene has ZERO named actors.
 */
function fixAnonymousProtagonist(script: string): string {
    // Find the dominant protagonist: most-used 3-char Korean name with action suffix
    const nameRe = /([가-힣]{3}),/g;
    const counts = new Map<string, number>();
    for (const m of script.matchAll(nameRe)) {
        const n = m[1];
        if (EXCLUDED_WORDS.has(n)) continue;
        counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    if (counts.size === 0) return script;
    const protagonist = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    // Split into scene blocks and check each
    const sceneBlocks = script.split(/(?=^S#\s*\d+)/m);
    let fixedCount = 0;
    const result = sceneBlocks.map(block => {
        // If the block already has a named character (3-char name + comma), leave it
        if (nameRe.test(block)) {
            nameRe.lastIndex = 0; // reset stateful regex
            return block;
        }
        nameRe.lastIndex = 0;
        // If block uses "그," as subject at least once, replace first occurrence
        if (/(?:^|\n)그,/.test(block)) {
            const fixed = block.replace(/(?<=(?:^|\n))그,/, `${protagonist},`);
            if (fixed !== block) fixedCount++;
            return fixed;
        }
        return block;
    }).join('');

    if (fixedCount > 0) {
        console.warn(`>>> [V165 Anon Fix] Replaced anonymous "그," with "${protagonist}" in ${fixedCount} scene(s).`);
    } else {
        console.log(`>>> [V165 Anon Fix] No anonymous protagonist scenes detected.`);
    }
    return result;
}

/**
 * V175: Build an alias map from charContext English-name romanizations.
 * Handles cases like "강이현 (Kim Hae-ri)" where the English name back-romanizes to "김해리"
 * — a completely different Korean name that the model may use in later chunks.
 */
function buildEnglishNameAliasMap(charContext: string): Map<string, string> {
    // Common Korean surname romanizations → Hangul
    const KO_SURNAMES: Record<string, string> = {
        'kim': '김', 'park': '박', 'pak': '박', 'choi': '최', 'choe': '최',
        'kang': '강', 'gang': '강', 'lee': '이', 'yi': '이', 'rhee': '이', 'li': '이',
        'jung': '정', 'jeong': '정', 'jeon': '전', 'han': '한', 'oh': '오',
        'seo': '서', 'ko': '고', 'koh': '고', 'yoon': '윤', 'shin': '신',
        'lim': '임', 'im': '임', 'ahn': '안', 'an': '안', 'jang': '장',
        'yoo': '유', 'yu': '유', 'cho': '조', 'joo': '주', 'baek': '백',
        'song': '송', 'yang': '양', 'kwon': '권', 'moon': '문',
        'nam': '남', 'ryu': '류', 'bae': '배', 'cha': '차', 'chun': '천',
    };
    // Common given-name syllable romanizations → Hangul
    const KO_SYLLABLES: Record<string, string> = {
        'hae': '해', 'ri': '리', 'do': '도', 'hyun': '현', 'ro': '로', 'un': '운',
        'hye': '혜', 'mi': '미', 'jun': '준', 'hyuk': '혁', 'su': '수', 'jin': '진',
        'young': '영', 'min': '민', 'soo': '수', 'na': '나', 'ra': '라', 'ha': '하',
        'won': '원', 'woo': '우', 'jae': '재', 'ji': '지', 'in': '인', 'yun': '윤',
        'ho': '호', 'ki': '기', 'gi': '기', 'kyung': '경', 'sung': '성',
        'tae': '태', 'uk': '욱', 'wook': '욱', 'bin': '빈',
    };

    const aliasMap = new Map<string, string>();
    // Parse "- 이름 (EnglishName):" entries
    for (const m of charContext.matchAll(/[-•]\s*([가-힣]{2,4})\s+\(([A-Za-z][A-Za-z\s-]+)\)/g)) {
        const korName = m[1];
        const engName = m[2].trim().toLowerCase().replace(/-/g, ' ');
        const parts = engName.split(/\s+/).filter(Boolean);
        if (parts.length < 2) continue;
        const koSurname = KO_SURNAMES[parts[0]];
        if (!koSurname) continue;
        let koGiven = '';
        for (const part of parts.slice(1)) koGiven += KO_SYLLABLES[part] ?? '';
        if (!koGiven) continue;
        const koAlias = koSurname + koGiven;
        if (koAlias !== korName) aliasMap.set(koAlias, korName);
    }
    return aliasMap;
}

/**
 * V177: Unregistered Character Detector
 * Scans the assembled script for standalone Korean name lines (dialogue headers).
 * Warns if any name is NOT in the canonicalNames roster extracted from charContext.
 * These represent characters the AI invented beyond the approved roster.
 */
function detectUnregisteredCharacters(script: string, canonicalNames: string[]): void {
    const canonicalSet = new Set(canonicalNames);
    const unregistered = new Set<string>();

    for (const line of script.split('\n')) {
        const t = line.trim();
        if (!t || /^S#\s*\d+/.test(t)) continue;
        // Standalone Korean name line (2-6 chars) = dialogue header format
        if (/^[가-힣]{2,6}$/.test(t) && !EXCLUDED_WORDS.has(t) && !canonicalSet.has(t)) {
            unregistered.add(t);
        }
    }

    if (unregistered.size > 0) {
        console.warn(`>>> [V177 Unregistered Characters] ${unregistered.size} character(s) used as dialogue headers are NOT in charContext NAME ROSTER: [${[...unregistered].join(', ')}]`);
    } else {
        console.log(`>>> [V177 Unregistered Characters] OK — all dialogue speakers are in charContext NAME ROSTER.`);
    }
}

/**
 * V176: Protagonist gender extractor from charContext.
 * Searches charContext near each canonical name for 여성/여자/그녀 (female)
 * or 남성/남자 (male) markers. Returns '그녀', '그', or '' if undetermined.
 */
function extractProtagonistGenderFromContext(charContext: string, canonicalNames: string[]): string {
    for (const name of canonicalNames.slice(0, 3)) {
        const idx = charContext.indexOf(name);
        if (idx < 0) continue;
        const window = charContext.substring(idx, Math.min(charContext.length, idx + 400));
        if (/여성|여자|그녀/.test(window)) return '그녀';
        if (/남성|남자/.test(window)) return '그';
    }
    return '';
}

/**
 * V176: Cross-chunk gender pronoun normalizer.
 * In single-speaker scenes (only one canonical character has dialogue), normalizes
 * action-line pronouns to match the charContext-defined gender for that character.
 * Skips multi-speaker scenes to avoid cross-character false positives.
 */
function fixGenderPronouns(script: string, charContext: string, canonicalNames: string[]): string {
    if (!canonicalNames.length) return script;

    // Build gender map from charContext
    const genderMap = new Map<string, '그' | '그녀'>();
    for (const name of canonicalNames) {
        const idx = charContext.indexOf(name);
        if (idx < 0) continue;
        const ctx = charContext.substring(idx, Math.min(charContext.length, idx + 400));
        if (/여성|여자|그녀/.test(ctx)) genderMap.set(name, '그녀');
        else if (/남성|남자/.test(ctx)) genderMap.set(name, '그');
    }
    if (genderMap.size === 0) {
        console.log('>>> [V176 Gender Fix] No gender markers found in charContext — skipping.');
        return script;
    }

    const canonicalSet = new Set(canonicalNames);
    const blocks = script.split(/(?=^S#\s*\d+)/m);
    let totalFixes = 0;

    const processed = blocks.map(block => {
        const lines = block.split('\n');

        // Identify canonical speakers (dialogue headers) in this scene block
        const speakers = new Set<string>();
        for (const line of lines) {
            const t = line.trim();
            if (/^[가-힣]{2,6}$/.test(t) && canonicalSet.has(t)) speakers.add(t);
        }

        // Only fix single-speaker scenes to avoid cross-character pronoun false positives
        if (speakers.size !== 1) return block;
        const [speaker] = [...speakers];
        const canonGender = genderMap.get(speaker);
        if (!canonGender) return block;

        // Fix action lines only — skip character name header line and the dialogue line after it
        let skipNext = false;
        return lines.map(line => {
            const t = line.trim();
            if (!t || /^S#\s*\d+/.test(t)) { skipNext = false; return line; }
            if (/^[가-힣]{2,6}$/.test(t) && canonicalSet.has(t)) { skipNext = true; return line; }
            if (skipNext) { skipNext = false; return line; } // dialogue line — skip

            // Action line: apply gender normalization
            if (canonGender === '그녀') {
                // Replace 그의/그는/그를/그가/그에게 etc. (but NOT 그녀…) → 그녀의/그녀는/…
                return line.replace(/그(?!녀)(의|는|를|가|에게|와|도|만|조차|마저)/g, (_, p) => {
                    totalFixes++;
                    return `그녀${p}`;
                });
            } else {
                // Replace 그녀의/그녀는/그녀를/그녀가 etc. → 그의/그는/그를/그가
                return line.replace(/그녀(의|는|를|가|에게|와|도|만|조차|마저)/g, (_, p) => {
                    totalFixes++;
                    return `그${p}`;
                });
            }
        }).join('\n');
    });

    if (totalFixes > 0) {
        console.warn(`>>> [V176 Gender Fix] Normalized ${totalFixes} pronoun(s) in single-speaker scene action lines.`);
    } else {
        console.log('>>> [V176 Gender Fix] OK — no cross-chunk pronoun mismatches in single-speaker scenes.');
    }
    return processed.join('');
}

/**
 * V164: Character Name Normalization
 * Detects surname drift across chunks (e.g. "김해리" → "도해리") and corrects it.
 *
 * Algorithm:
 * 0. [V175] Apply alias map from charContext English names first (catches "강이현↔김해리")
 * 1. Extract all 3-char Korean names used in the script (surname 1 char + given name 2 chars).
 * 2. Group names by their 2-char given name (chars 1-2 of the 3-char name).
 * 3. If two names share the same given name but differ in surname, the one appearing MORE
 *    often is treated as canonical. The minority variant is replaced.
 * 4. Log each substitution so the caller can see what was fixed.
 *
 * Also extracts known names from charContext to bias the canonical selection.
 */
function normalizeCharacterNames(script: string, charContext: string): string {
    // V175: Apply alias map FIRST — catches English-romanized name aliases across chunks
    const aliasMap = buildEnglishNameAliasMap(charContext);
    let result = script;
    for (const [alias, canonical] of aliasMap) {
        const re = new RegExp(alias, 'g');
        const count = (result.match(re) || []).length;
        if (count > 0) {
            result = result.replace(re, canonical);
            console.warn(`>>> [V175 Alias Fix] "${alias}" → "${canonical}" (${count} occurrence(s))`);
        }
    }
    // --- EXTRACTION STRATEGY ---
    // Only consider a word a "character name" if it appears as:
    //   A) Action subject:  "이름," (name followed by comma — the Korean screenplay actor pattern)
    //   B) Dialogue header: standalone line matching /^[가-힣]{2,4}$/ (name alone on its own line)
    // This excludes ALL common Korean words (소리, 마음, 여기, 앞으로, 나에게, etc.)
    // which never appear before a comma as an action subject.

    const counts = new Map<string, number>();

    // A) Action subject pattern: "이름," — most reliable character name indicator
    // Note: scan `result` (post-V175 alias replacement) so counts reflect fixed names
    const actionSubjectRe = /([가-힣]{2,4}),/g;
    for (const m of result.matchAll(actionSubjectRe)) {
        const n = m[1];
        if (EXCLUDED_WORDS.has(n)) continue;
        counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    // Also scan charContext for known names (boosts canonical selection)
    for (const m of charContext.matchAll(actionSubjectRe)) {
        const n = m[1];
        if (EXCLUDED_WORDS.has(n)) continue;
        counts.set(n, (counts.get(n) ?? 0) + 5);
    }

    // B) Dialogue header lines: standalone name on its own line (scan result, not script)
    for (const line of result.split('\n')) {
        const t = line.trim();
        if (/^[가-힣]{2,4}$/.test(t) && !EXCLUDED_WORDS.has(t)) {
            counts.set(t, (counts.get(t) ?? 0) + 1);
        }
    }

    // Require ≥3 total occurrences to qualify as a real character name
    // (prevents single-use words or rare occurrences from being treated as names)
    for (const [name, count] of counts.entries()) {
        if (count < 3) counts.delete(name);
    }

    if (counts.size < 2) {
        console.log(`>>> [V164 Name Norm] No surname drift candidates (< 2 qualifying names).`);
        return script;
    }

    // Group by given name (last 2 chars of 3-char name, or full name for 2-char names)
    // Only process 3-char names (1 surname + 2 given) — the most common Korean name form
    const byGivenName = new Map<string, string[]>();
    for (const name of counts.keys()) {
        if (name.length !== 3) continue;
        const given = name.slice(1); // e.g. "해리" from "김해리"
        const arr = byGivenName.get(given) ?? [];
        arr.push(name);
        byGivenName.set(given, arr);
    }

    // result already has V175 alias replacements applied — continue on that
    let fixed = 0;
    for (const [given, variants] of byGivenName) {
        if (variants.length < 2) continue;
        // Sort descending by count — highest count = canonical
        variants.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
        const canonical = variants[0];
        const minorities = variants.slice(1);
        for (const wrong of minorities) {
            if ((counts.get(wrong) ?? 0) === 0) continue;
            // Replace all occurrences of the wrong name with the canonical one
            const re = new RegExp(wrong, 'g');
            const before = result;
            result = result.replace(re, canonical);
            const n = (before.match(re) || []).length;
            if (n > 0) {
                console.warn(`>>> [V164 Name Norm] Replaced "${wrong}" → "${canonical}" (${n} occurrence(s), given name: "${given}")`);
                fixed += n;
            }
        }
    }
    if (fixed === 0) {
        console.log(`>>> [V164 Name Norm] No surname drift detected.`);
    }
    return result;
}

/**
 * V159: Rate-limit aware wrapper for model.generateContent().
 * Retries up to 4 times with exponential backoff on 429 Too Many Requests errors.
 */
async function generateWithRetry(model: any, request: any, context: string = ''): Promise<any> {
    const delays = [2000, 4000, 8000, 16000];
    for (let attempt = 0; attempt <= 4; attempt++) {
        try {
            return await model.generateContent(request);
        } catch (err: any) {
            const is429 = err?.status === 429
                || err?.message?.includes('429')
                || err?.message?.includes('Too Many Requests')
                || err?.message?.includes('Resource exhausted');
            if (is429 && attempt < 4) {
                const delay = delays[attempt];
                console.warn(`>>> [V159 Rate Limit] ${context}: 429 received. Waiting ${delay}ms before retry ${attempt + 1}/4...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw err;
        }
    }
}

// safeParseJSON is imported from lib/json-repair.ts
