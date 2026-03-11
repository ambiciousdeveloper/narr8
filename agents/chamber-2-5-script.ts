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
            recentSlugs: [] as string[]
        };

        const beatChunk = Math.ceil(beats.length / actualSections);
        const paraChunk = Math.ceil(novelParagraphs.length / actualSections);

        let lastChunkHeader = "";
        for (let i = 0; i < actualSections; i++) {
            const chunk = beats.slice(i * beatChunk, (i + 1) * beatChunk).join('\n\n');
            const slicedRef = novelParagraphs.slice(i * paraChunk, (i + 1) * paraChunk).join('\n\n');
            if (!chunk && i > 0) break;

            let retryCount = 0;
            let currentTemp = 0.6;
            let dialogueRetry = false;

            while (retryCount < 3) {
                const prompt = buildUnifiedPrompt({
                    plot: chunk,
                    characters: charContext,
                    blueprint: activeBlueprint,
                    settings: worldSettings,
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

                const result = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature: currentTemp, maxOutputTokens: 24000 }
                });

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

                    // V140.5: JSON parsed but content field is empty — salvage screenplay from rawText
                    if (!content && lastRawResponse.includes('S#')) {
                        const sceneMatch = lastRawResponse.match(/S#\s*\d+[\s\S]*/);
                        if (sceneMatch) {
                            let recovered = sceneMatch[0];
                            // Strip trailing JSON blob that may follow inline screenplay text
                            const jsonBlobIdx = recovered.search(/\n\s*\{[\s\S]*"(?:title|scenes|scene_number)"/);
                            if (jsonBlobIdx > 50) {
                                recovered = recovered.substring(0, jsonBlobIdx).trim();
                                console.warn(`>>> [V140.5] Stripped trailing JSON blob from raw recovery.`);
                            }
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
                    if (content && (content.length < sectionLengthTarget * 0.75 || density < 0.20)) {
                        const shortage = sectionLengthTarget - content.length;
                        console.warn(`>>> [V143 Expansion Pass] Chunk ${i + 1}: ${content.length}/${sectionLengthTarget} chars, density ${(density * 100).toFixed(1)}%. Expanding...`);
                        const expandPrompt = `You are a professional Korean screenplay writer. The following screenplay is too short AND has too little dialogue. Expand it by adding MORE DIALOGUE EXCHANGES between characters. Target: approximately ${sectionLengthTarget} total characters.

RULES:
1. Add dialogue after every 2-3 action lines: character name alone on one line, spoken text on the next.
2. Characters must speak — to each other, to themselves, or to the situation aloud.
3. Action lines describe ONLY what the camera physically records. No internal state or emotional narration.
4. Keep all existing scene sluglines (S# N. ...) intact. Write in Korean only.
5. Add approximately ${shortage} more characters through dialogue.
6. LOCATION VARIETY CHECK: If 3 or more consecutive scenes share the exact same slugline, you MUST change at least one of them to a neighboring sub-location (append "계단", "안쪽", "입구", etc. to the place name) or shift the time label (새벽 → 이른 아침). Identical sluglines repeated 3+ times in a row is a formatting error.

Current screenplay:
${content}

Output the full expanded screenplay in Korean S# format.`;
                        const expandResult = await model.generateContent({
                            contents: [{ role: 'user', parts: [{ text: expandPrompt }] }],
                            generationConfig: { temperature: 0.6, maxOutputTokens: 16000 }
                        });
                        const expandedText = expandResult.response.text().replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
                        if (expandedText && expandedText.length > content.length) {
                            content = scrubMeta(expandedText);
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
                            const miniResult = await model.generateContent({
                                contents: [{ role: 'user', parts: [{ text: miniPrompt }] }],
                                generationConfig: { temperature: 0.75, maxOutputTokens: 8000 }
                            });
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

                    // V141 final density after all passes — if still 0%, use programmatic injection
                    const finalDensity = content ? getDialogueDensity(content) : 0;
                    if (content && finalDensity < 0.05) {
                        console.warn(`>>> [V141 Fallback] Chunk ${i + 1} still at ${(finalDensity * 100).toFixed(1)}% after expansion. Running programmatic injection...`);
                        content = await injectDialoguePass(content, charContext, model);
                    }
                    console.log(`>>> [V141] Chunk ${i + 1} FINAL dialogue density: ${(getDialogueDensity(content) * 100).toFixed(1)}%`);

                    // V145: Consecutive slugline violation check
                    if (content) {
                        const slugViolations = detectConsecutiveSlugs(content);
                        if (slugViolations > 0) {
                            console.warn(`>>> [V145 Slug Check] Chunk ${i + 1}: ${slugViolations} location(s) used 3+ times consecutively.`);
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
            fullScript = await injectDialoguePass(fullScript, charContext, model);
        }

        // V146: Renumber scenes sequentially to fix duplicates from Rule 6 splits
        fullScript = renumberScenes(fullScript);

        // V145 full-script check (cross-chunk violations)
        const totalSlugViolations = detectConsecutiveSlugs(fullScript);
        if (totalSlugViolations > 0) {
            console.warn(`>>> [V145 Full-Script Slug Check] ${totalSlugViolations} location(s) appear 3+ times consecutively across full script.`);
        } else {
            console.log(`>>> [V145 Full-Script Slug Check] OK — no consecutive slug violations.`);
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
        .replace(/\([^)]{1,20}\)\s*/g, "")
        .replace(/^.*대본.*:.*$/gm, "")
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
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

    const dialogueAlert = p.dialogueRetry ? `
🚨 DIALOGUE FAILURE ALERT 🚨
Your previous response was REJECTED because it contained ZERO dialogue lines.
You are generating description-only content, which is a CRITICAL ERROR.
You MUST write character dialogue in EVERY single scene, no exceptions.
FORMAT: character name alone on one line → dialogue text on the next line.
DO NOT submit another response without spoken dialogue.
🚨 END ALERT 🚨
` : '';

    const bp = p.blueprint || {};
    const bpRules = bp.world_bible?.rules_kr || "";
    const bpGlossary = bp.glossary ? JSON.stringify(bp.glossary).substring(0, 1000) : "";
    const bpChars = bp.character_arcs ? JSON.stringify(bp.character_arcs).substring(0, 1500) : "";

    return `
[[SYSTEM_PROTOCOL]]
[ROLE]
Professional Script Adaptor.
Convert PROSE into a high-density, visual SCREENPLAY in **${langLabel}** ONLY.
${dialogueAlert}${personaBlock}
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
This section MUST reach **${p.targetChars} characters** total. Write exactly ${targetScenes} scenes: S# ${nextNum} through S# ${stopAtScene}.
- HARD STOP: Do NOT write S# ${stopAtScene + 1} or beyond. Stop exactly at S# ${stopAtScene}.
- Each scene MUST have at least 4 action lines + 2 dialogue exchanges. One-liner scenes are INVALID.
- Expand each scene with physical detail, reaction shots, and dialogue to fill the target length.
- COVER ONLY the story beats listed in [STORY BEATS]. Do NOT advance to events not in those beats.

[MANDATORY RULES]
1. **SCENE NUMBERING**: You MUST start the content with "S# ${nextNum}.". Use format "S# N. [PLACE] - [TIME]".
2. **HIGH DENSITY**: Merge multiple paragraphs into one dense S# sequence. NO "S1", "S2" shortcuts.
3. **ZERO PROSE LEAK**: Action lines describe ONLY what a camera physically records — movement, sound, touch, visible expression. If a line cannot be filmed (emotion, thought, intention, attitude), DELETE it and replace it with spoken dialogue or a physical action.
4. **DIALOGUE PURITY**: No "(혼잣말)", "(침묵)". Action lines for silence.
5. **DIALOGUE MANDATORY**: Every scene MUST contain at least ONE spoken dialogue line. Characters MUST speak. A scene with ZERO dialogue lines is INVALID and will be rejected. OUTPUT WITH NO DIALOGUE WILL BE DISCARDED. IF THE SOURCE HAS NO DIALOGUE, YOU MUST INVENT APPROPRIATE DIALOGUE — DO NOT use the absence of dialogue in the source as an excuse to omit it.
6. **NO CONSECUTIVE SILENT SCENES**: You MUST NOT write 3 or more consecutive scenes without dialogue. Insert spoken lines to break any silent streak.
7. **DIALOGUE DENSITY**: At least 30% of all lines in the output must be character dialogue lines (character name on its own line followed by spoken text).
8. **3:1 RULE**: After every 3 action lines, you MUST write a dialogue exchange (character name + spoken line). This is a hard structural constraint. A "block" of more than 3 consecutive action lines with no dialogue is a formatting error that will be rejected.
9. **DIALOGUE FORMAT**: Write the character name alone on one line, then the spoken line below it. Example:
김해리
여기서 뭘 하는 거요?
10. **INVENT DIALOGUE**: Screenwriters CREATE dialogue. Even when adapting prose with no dialogue, you MUST give characters voices. Invent lines that reveal character, advance plot, or react to the situation.
11. **NO REPETITION**: Every scene MUST advance the story forward. If a scene does not change the situation, location, or character state compared to the previous scene — DO NOT write it. Merge or skip it. Writing the same hesitation or action twice in two consecutive scenes is a CRITICAL ERROR.
14. **LOCATION VARIETY**: Do NOT write more than 2 consecutive scenes at the exact same slugline (same place AND same time of day). If action continues, use CUT TO, move to a different sub-location, or shift the time indicator (e.g., 밤 → 새벽). Three or more scenes with the identical slugline in a row is a formatting error.
12. **MULTI-CHARACTER SCENES**: Whenever the story beats involve 2+ characters, scenes MUST feature dialogue exchanges between them — not solo monologue. A character talking only to themselves when other characters are present is an error.
13. **SOLO MONOLOGUE LIMIT**: If a character is genuinely alone, limit self-talk to 2 lines per scene. Fill remaining dialogue requirement with physical actions, ambient sounds, or reactive behaviour.
${guidelinesBlock}
[[/SYSTEM_PROTOCOL]]

[CHARACTER DB]
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
[JSON OUTPUT]
{
  "title": "Sequence",
  "content": "Professional ${langLabel} screenplay starting with S# ${nextNum}...",
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

    // Track recently used sluglines to inject into the next chunk prompt
    const sluglineMatches = content.match(/^S#\s*\d+\.\s*[^\n]+/gm) || [];
    const extractedSlugs = sluglineMatches.map(s => s.replace(/^S#\s*\d+\.\s*/, '').trim()).filter(Boolean);
    const updatedSlugs = [...(state.recentSlugs || []), ...extractedSlugs].slice(-8);

    return {
        ...state,
        lastAction: scrubMeta(lastAction).substring(0, 300),
        lastSceneNumber: lastScene,
        lastThreeLines: lines.slice(-3).join('\n'),
        recentSlugs: updatedSlugs
    };
}

/**
 * V141: Dialogue Presence Validator
 * Detects at least one character name line followed by a dialogue line.
 * False-positive guard: excludes common time/place words (새벽, 아침, 밤, etc.)
 */
const EXCLUDED_WORDS = new Set(['새벽', '아침', '밤', '낮', '저녁', '오전', '오후', '실내', '실외', '골목', '거리', '현재', '과거', '회상']);

function hasDialogue(content: string): boolean {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        // Korean name: 2-6 chars, not a time/place word, not starting with S# or punctuation
        const isKoreanName = /^[가-힣]{2,6}$/.test(line) && !EXCLUDED_WORDS.has(line) && !line.includes('.');
        // English character name: all caps, 2-25 chars
        const isEnglishName = /^[A-Z][A-Z\s]{1,24}$/.test(line);
        if ((isKoreanName || isEnglishName) && !lines[i + 1].startsWith('S#') && lines[i + 1].length > 4) {
            return true;
        }
    }
    return false;
}

/**
 * Measures the ratio of dialogue lines to total non-empty, non-slugline lines.
 * A "dialogue line" is the spoken text immediately following a character name line.
 * Returns a value between 0.0 and 1.0.
 */
function getDialogueDensity(content: string): number {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    let dialogueLines = 0;
    let totalLines = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('S#')) continue; // skip sluglines
        totalLines++;
        const isKoreanName = /^[가-힣]{2,6}$/.test(line) && !EXCLUDED_WORDS.has(line) && !line.includes('.');
        const isEnglishName = /^[A-Z][A-Z\s]{1,24}$/.test(line);
        if ((isKoreanName || isEnglishName) && i + 1 < lines.length && !lines[i + 1].startsWith('S#') && lines[i + 1].length > 4) {
            dialogueLines++; // name line
            i++;             // advance to spoken line
            totalLines++;    // spoken line also counts toward total
            dialogueLines++; // spoken line
        }
    }
    if (totalLines === 0) return 0;
    return Math.min(1.0, dialogueLines / totalLines); // cap at 1.0
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
async function injectDialoguePass(script: string, charContext: string, model: any): Promise<string> {
    // Split into S# scene blocks
    const sceneBlocks = script.split(/(?=S#\s*\d+\.)/).filter(b => b.trim());
    if (!sceneBlocks.length) return script;

    // For each scene, find the first Korean character name (2-4 chars followed by comma)
    const sceneInfos = sceneBlocks.map((block, idx) => {
        const nameMatch = block.match(/\b([가-힣]{2,4}),[\s]/);
        const charName = nameMatch && !EXCLUDED_WORDS.has(nameMatch[1]) ? nameMatch[1] : null;
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
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: batchPrompt }] }],
            generationConfig: { temperature: 0.8, maxOutputTokens: 2000 }
        });
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
    // Remove "S# N. " prefix
    const body = rawSlug.replace(/^S#\s*\d+\.\s*/, '').trim();
    // Match up to and including the time indicator (밤/낮/새벽/아침/오후/저녁/황혼/심야 etc.)
    const m = body.match(/^(?:INT|EXT)\..+?-\s*(?:밤|낮|새벽|이른\s*아침|아침|오후|저녁|황혼|심야|한낮|정오)/);
    return m ? m[0].trim() : body.split(/\s{2,}/)[0].trim();
}

/**
 * V145: Detects how many distinct locations appear 3+ times consecutively in a script.
 * Returns the count of such violations for logging purposes.
 */
function detectConsecutiveSlugs(script: string): number {
    const slugLines = script.match(/^S#\s*\d+\.\s*.+/gm) || [];
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
 * V146: Renumber all S# scene numbers in assembled fullScript sequentially.
 * Fixes duplicates caused by V143 Rule 6 splitting a scene into two with same number.
 */
function renumberScenes(script: string): string {
    let counter = 0;
    return script.replace(/^(S#\s*)\d+(\.\s*)/gm, (_, prefix, suffix) => {
        counter++;
        return `${prefix}${counter}${suffix}`;
    });
}

// safeParseJSON is imported from lib/json-repair.ts
