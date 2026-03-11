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
            recentSlugs: [] as string[],
            dreamSceneCount: 0  // V148: 전체 대본에서 악몽/수면 씬 누적 카운트 (최대 2회 허용)
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
                        const expandPrompt = `You are a professional Korean screenplay writer. The following screenplay is too short AND has too little dialogue. Expand it by adding MORE DIALOGUE EXCHANGES between characters. Target: approximately ${sectionLengthTarget} total characters.

RULES:
1. Add dialogue after every 2-3 action lines: character name alone on one line, spoken text on the next.
2. Characters must speak — to each other, to themselves, or to the situation aloud.
3. ZERO PROSE LEAK: Action lines describe ONLY what a camera physically records. No internal state or emotional narration.
   FORBIDDEN (cannot be filmed — delete or replace with action/dialogue):
   × "마음속에", "내면", "~을 느낀다", "생각에 잠겼다", "불안감을 느끼", "혼란스러움", "깨달았다"
   × "복잡한 감정", "마치 ~같았다", any sentence about thoughts/emotions without a physical act
   If you encounter these in the existing text, REPLACE them with a physical action or dialogue line.
4. Keep all existing scene sluglines (S# N. ...) intact. Write in Korean only.
5. Add approximately ${shortage} more characters through dialogue.
6. LOCATION VARIETY CHECK: If 3 or more consecutive scenes share the exact same slugline, you MUST change at least one of them to a neighboring sub-location (append "계단", "안쪽", "입구", etc. to the place name) or shift the time label (새벽 → 이른 아침). Identical sluglines repeated 3+ times in a row is a formatting error.
7. SOLO SCENE CHECK: If a character is alone for 3 or more consecutive scenes, add another character appearing briefly (knock on door, phone call, passer-by) to break the solo streak.

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
                            content = scrubInternalStatements(content); // V152
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

                    // V145: Consecutive slugline violation check + V147 auto-fix
                    if (content) {
                        const slugViolations = detectConsecutiveSlugs(content);
                        if (slugViolations > 0) {
                            console.warn(`>>> [V145 Slug Check] Chunk ${i + 1}: ${slugViolations} location(s) used 3+ times consecutively.`);
                            content = await fixSlugViolations(content, model, i + 1);
                        }
                        // V149: Base location streak check (5+ scenes in same general area)
                        const baseViolations = detectBaseLocationStreak(content);
                        if (baseViolations > 0) {
                            console.warn(`>>> [V149 Base Slug Check] Chunk ${i + 1}: ${baseViolations} base location(s) used 5+ times consecutively. Running fix...`);
                            content = await fixSlugViolations(content, model, i + 1);
                        } else {
                            console.log(`>>> [V149 Base Slug Check] Chunk ${i + 1}: OK.`);
                        }

                        // V153: Per-chunk dream scene cap — enforce max 1 sleep/nightmare scene per chunk.
                        // Detection scans only the slug line + first 3 stage-direction lines of each scene block
                        // (excludes dialogue lines starting with a character name) to avoid false positives from
                        // characters mentioning "악몽" in conversation.
                        const DREAM_DETECT_V153 = ['악몽', '잠들', '잠에서', '꿈에서', '꿈을 꾸', '수면', '잠꼬대', '잠자리', '침대', '누워'];
                        const chunkBlocks = content.split(/(?=^S#\s*\d+[A-Za-z]?\.)/m).filter(b => b.trim());
                        // Extract only header + stage directions (non-dialogue lines) for detection
                        function isDreamSceneBlock(block: string): boolean {
                            const lines = block.split('\n');
                            // slug line is always first; then collect non-dialogue direction lines (up to 4 lines total)
                            const directionLines: string[] = [];
                            for (const line of lines) {
                                if (directionLines.length >= 4) break;
                                const trimmed = line.trim();
                                if (!trimmed) continue;
                                // Skip pure dialogue lines: lines that start with a known character-name pattern
                                // (Korean name followed by space or nothing, then dialogue content)
                                // We heuristically detect dialogue as lines NOT starting with S# and not all-caps slug patterns
                                // that contain Korean dialogue verbs — treat slug line + stage directions only
                                const isDialogue = /^[가-힣\s]{1,8}\s/.test(trimmed) && !/^(INT|EXT|S#|내레이터)/.test(trimmed);
                                if (!isDialogue) directionLines.push(trimmed);
                            }
                            const scanText = directionLines.join(' ');
                            return DREAM_DETECT_V153.some(kw => scanText.includes(kw));
                        }
                        let dreamBlocks = chunkBlocks.filter(isDreamSceneBlock);
                        if (dreamBlocks.length > 1) {
                            // V153: retry loop — up to 2 consolidation attempts
                            for (let attempt = 1; attempt <= 2 && dreamBlocks.length > 1; attempt++) {
                                console.warn(`>>> [V153 Dream Cap] Chunk ${i + 1}: ${dreamBlocks.length} dream scenes detected (max 1). Consolidation attempt ${attempt}/2...`);
                                const dreamSceneNums = dreamBlocks.map(b => b.match(/^S#\s*(\d+[A-Za-z]?)\./m)?.[1] ?? '?').join(', ');
                                const consolidatePrompt = `아래 한국어 시나리오에 악몽/꿈/수면/침대 관련 씬(S#)이 ${dreamBlocks.length}개 포함되어 있습니다 (S# ${dreamSceneNums}). 최대 1개만 허용됩니다.
규칙:
1. 악몽/수면/침대 씬 중 가장 극적으로 중요한 씬 1개만 남기고 나머지는 완전히 삭제하세요.
2. 삭제된 씬 번호를 포함하여 모든 S# 번호를 1부터 순서대로 재정렬하세요.
3. 씬 내부 대사와 지문은 절대 변경하지 마세요.
4. 수정된 대본 전체를 그대로 출력하세요. 설명이나 주석을 추가하지 마세요.

대본:
${content}`;
                                try {
                                    const consolidateResult = await model.generateContent({
                                        contents: [{ role: 'user', parts: [{ text: consolidatePrompt }] }],
                                        generationConfig: { temperature: 0.1, maxOutputTokens: 16000 }
                                    });
                                    const consolidated = consolidateResult.response.text().replace(/```[a-z]*/gi, '').replace(/```/g, '').trim();
                                    // Accept if output is >= 60% of original (allows meaningful removal)
                                    if (consolidated && consolidated.length > content.length * 0.6) {
                                        content = scrubMeta(consolidated);
                                        dreamBlocks = content.split(/(?=^S#\s*\d+[A-Za-z]?\.)/m).filter(b => b.trim() && isDreamSceneBlock(b));
                                        console.warn(`>>> [V153 Dream Cap] Chunk ${i + 1}: attempt ${attempt} → ${dreamBlocks.length} dream scene(s) remaining.`);
                                    } else {
                                        console.warn(`>>> [V153 Dream Cap] Chunk ${i + 1}: attempt ${attempt} output too short (${consolidated.length}/${content.length}), stopping.`);
                                        break;
                                    }
                                } catch (e) {
                                    console.warn(`>>> [V153 Dream Cap] Chunk ${i + 1}: attempt ${attempt} error — ${e}.`);
                                    break;
                                }
                            }
                            if (dreamBlocks.length > 1) {
                                console.warn(`>>> [V153 Dream Cap] Chunk ${i + 1}: ${dreamBlocks.length} dream scene(s) remain after retries.`);
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
            fullScript = await injectDialoguePass(fullScript, charContext, model);
        }

        // V146: Renumber scenes sequentially to fix duplicates from Rule 6 splits
        fullScript = renumberScenes(fullScript);

        // V152: Final internal-state scrub on assembled script
        fullScript = scrubInternalStatements(fullScript);

        // V145 full-script check (cross-chunk violations) + V147 auto-fix
        const totalSlugViolations = detectConsecutiveSlugs(fullScript);
        if (totalSlugViolations > 0) {
            console.warn(`>>> [V145 Full-Script Slug Check] ${totalSlugViolations} location(s) appear 3+ times consecutively across full script. Running V147 cross-chunk fix...`);
            fullScript = await fixSlugViolations(fullScript, model, 0);
        } else {
            console.log(`>>> [V145 Full-Script Slug Check] OK — no consecutive slug violations.`);
        }

        // V149 full-script base location streak check
        const totalBaseViolations = detectBaseLocationStreak(fullScript);
        if (totalBaseViolations > 0) {
            console.warn(`>>> [V149 Full-Script Base Slug Check] ${totalBaseViolations} base location(s) appear 5+ times consecutively. Running fix...`);
            fullScript = await fixSlugViolations(fullScript, model, 0);
        } else {
            console.log(`>>> [V149 Full-Script Base Slug Check] OK.`);
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
 * Removes action-line sentences that describe internal emotional/psychological state
 * (forbidden in screenplays: cannot be filmed). Only scrubs action lines — dialogue preserved.
 */
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
];
function scrubInternalStatements(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    let prevWasCharName = false;

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trim();

        // Slugline — always keep
        if (/^S#\s*\d+/.test(line)) {
            prevWasCharName = false;
            result.push(raw);
            continue;
        }

        // Character name line check (2–6 Korean chars, not an excluded time/place word)
        const isCharName = /^[가-힣]{2,6}$/.test(line)
            && !EXCLUDED_WORDS.has(line)
            && !line.includes('.');
        if (isCharName) {
            prevWasCharName = true;
            result.push(raw);
            continue;
        }

        // Dialogue line (immediately after character name) — never scrub
        if (prevWasCharName) {
            prevWasCharName = false;
            result.push(raw);
            continue;
        }
        prevWasCharName = false;

        // Action line — apply internal-state scrub
        let cleaned = line;
        for (const pattern of INTERNAL_STATE_PATTERNS) {
            cleaned = cleaned.replace(pattern, '');
        }
        cleaned = cleaned.trim();

        // Drop line if it became empty or a meaningless fragment after scrubbing
        if (cleaned.length < 4) continue;
        result.push(cleaned !== line ? cleaned : raw);
    }

    return result.join('\n');
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

    return `
[[SYSTEM_PROTOCOL]]
[ROLE]
Professional Script Adaptor.
Convert PROSE into a high-density, visual SCREENPLAY in **${langLabel}** ONLY.
${dreamBan}${dialogueAlert}${personaBlock}
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
- MINIMUM LENGTH ENFORCEMENT: If you finish all scenes and your total output is less than ${Math.floor((p.targetChars || 1500) * 0.85)} characters, go back and expand the shortest scenes — add more action lines, more dialogue turns, more environmental detail — until you reach the minimum. Do NOT stop early.
- COVER ONLY the story beats listed in [STORY BEATS]. Do NOT advance to events not in those beats.

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
    (a) Limit spoken self-talk to MAXIMUM 2 short lines per scene.
    (b) Fill the scene with: physical actions (문을 박찬다, 주먹을 쥔다, 사진을 뒤집는다), ambient sounds (발소리, 빗소리, 전화벨), environmental changes (바람이 창문을 흔든다, 가로등이 깜박인다).
    (c) Inner reflection MUST be expressed through a PHYSICAL OBJECT or ACTION — never as a spoken thought. BAD: "내가 왜 이렇게 됐지?" → GOOD: character picks up a photo, stares at it, then puts it face-down.
    (d) After MAXIMUM 3 consecutive scenes with the same character alone, you MUST introduce another character (even briefly — a knock, a call, a passer-by).
14. **LOCATION VARIETY**:
    (a) EXACT SLUGLINE: Do NOT write more than 2 consecutive scenes with the EXACT same slugline (same place AND same time of day).
    (b) GENERAL AREA: Do NOT write more than 4 consecutive scenes in the same GENERAL AREA (same building, same street, same zone), even with different sub-location suffixes (입구/중앙/안쪽 etc.).
    (c) BATTLE/ACTION: Fight sequences are especially prone to location clumping. After 3 combat scenes in the same area, MOVE to a completely different location — rooftop, building interior, nearby plaza, etc.
15. **LOCATION TRANSITION**: Whenever the story moves from one distinct location to another (e.g., alley → school, point-A → point-B), you MUST include a brief transition beat showing the character LEAVING or ARRIVING. Never cut directly between two very different locations without a bridging line. Example: one action line + one dialogue is sufficient.
16. **SCENE COMPLETION**: Every scene you start MUST be fully written before moving to the next. Never end a scene mid-action or mid-dialogue. An incomplete final scene is worse than writing one fewer scene.
17. **RESOLVED CONFLICT RULE**: Once a conflict is explicitly RESOLVED within the episode (a character overcomes a fear, thanks someone for curing a problem, leaves smiling), do NOT reintroduce the SAME conflict again later in the same episode without a clear narrative justification (e.g., a time-skip, a new cause, or a plot twist that makes sense). Repeating a conflict that was already resolved is a story continuity error. Example: if nightmares are cured in scene 16, scene 17 must NOT show the same character waking from the same nightmares.
18. **UNIQUE DIALOGUE PER SCENE**: Each character's lines must be DISTINCT across all scenes. Do NOT repeat the same supportive phrases like "넌 할 수 있어", "포기하지 마", "내가 옆에 있잖아" more than ONCE per script. If a supporting character encourages the protagonist multiple times, each scene must use a DIFFERENT approach: challenge them with a question, reference a shared past event, use humor, give concrete advice, or stay silent and act. Copying the same "you can do it" template is a dialogue error.
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
    const sluglineMatches = content.match(/^S#\s*\d+[A-Za-z]?\.\s*[^\n]+/gm) || [];
    const extractedSlugs = sluglineMatches.map(s => s.replace(/^S#\s*\d+[A-Za-z]?\.\s*/, '').trim()).filter(Boolean);
    const updatedSlugs = [...(state.recentSlugs || []), ...extractedSlugs].slice(-8);

    // V148: dream scene tracking — count sleep/nightmare S# scene blocks (not keyword mentions)
    const DREAM_DETECT = ['악몽', '잠들', '잠에서', '꿈에서', '꿈을 꾸', '수면', '잠꼬대', '잠자', '자리에 누워'];
    // Count how many S# scene blocks in this chunk contain dream/sleep content
    const sceneBlocks = content.split(/(?=^S#\s*\d+)/m).filter(b => b.trim());
    const dreamBlocksInChunk = sceneBlocks.filter(b =>
        DREAM_DETECT.some(kw => b.includes(kw))
    ).length;

    return {
        ...state,
        lastAction: scrubMeta(lastAction).substring(0, 300),
        lastSceneNumber: lastScene,
        lastThreeLines: lines.slice(-3).join('\n'),
        recentSlugs: updatedSlugs,
        dreamSceneCount: (state.dreamSceneCount ?? 0) + dreamBlocksInChunk
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
    // Remove "S# N." or "S# 13A." prefix (alpha suffix included)
    const body = rawSlug.replace(/^S#\s*\d+[A-Za-z]?\.\s*/, '').trim();
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

대본:
${script}`;

    try {
        // Full-script fix needs more tokens than per-chunk fix
        const fixTokens = script.length > 6000 ? 24000 : 12000;
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: fixPrompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: fixTokens }
        });
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
 * V145: Detects how many distinct locations appear 3+ times consecutively in a script.
 * Returns the count of such violations for logging purposes.
 */
function detectConsecutiveSlugs(script: string): number {
    // Include optional alpha suffix (e.g. S# 13A.) so A-variants are counted as scene headers
    const slugLines = script.match(/^S#\s*\d+[A-Za-z]?\.\s*.+/gm) || [];
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
const BASE_LOC_SUFFIXES = /\s+(입구|중앙|안쪽|한쪽|끝|구석|옆길|뒤쪽|정문\s*앞|창가|복도|계단|세면대\s*앞|문\s*앞|초입|막다른\s*길|부상|연기\s*속|책상\s*앞|가로등\s*아래|담벼락\s*앞|담벼락|골목\s*안쪽|골목\s*입구|골목\s*끝|침대\s*옆|침대\s*앞|냉장고\s*앞|현관\s*앞|현관|명상\s*중|창문\s*앞|바닥|지하|2층|3층|옥상|뒷골목|골목\s*어귀)(?=\s*-)/u;
function extractBaseLocation(rawSlug: string): string {
    return extractSlugKey(rawSlug).replace(BASE_LOC_SUFFIXES, '').trim();
}

/**
 * V149: Detects how many distinct BASE locations appear 5+ times consecutively.
 * Catches battles/chases where V147 sub-location splits fool V145.
 */
function detectBaseLocationStreak(script: string): number {
    const slugLines = script.match(/^S#\s*\d+[A-Za-z]?\.\s*.+/gm) || [];
    const bases = slugLines.map(extractBaseLocation);
    let violations = 0;
    let streak = 1;
    for (let j = 1; j < bases.length; j++) {
        if (bases[j] === bases[j - 1]) {
            streak++;
            if (streak === 5) violations++;
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
    // Match S# followed by digits with optional alpha or Korean suffix (e.g. 13A, 14B, 12계단) then a dot
    return script.replace(/^(S#\s*)\d+[A-Za-z가-힣]?(\.\s*)/gm, (_, prefix, suffix) => {
        counter++;
        return `${prefix}${counter}${suffix}`;
    });
}

// safeParseJSON is imported from lib/json-repair.ts
