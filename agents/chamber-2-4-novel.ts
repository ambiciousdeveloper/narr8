import { GoogleGenerativeAI } from '@google/generative-ai';
import { AgentFactory, type AgentResponse } from './chamber-0-repository';
import { safeParseJSON } from '../lib/json-repair';
import {
    GEMINI_MODEL,
    DEFAULT_NOVEL_DENSITY,
    DEFAULT_SECTION_LIMIT_KO,
    DEFAULT_SECTION_LIMIT_EN,
    DEFAULT_NOVEL_KO_RATIO,
} from '../lib/constants';
import {
    buildCoTPrefix,
    buildFewShotBlock,
    buildConstraintBlock,
    buildCTRLTokens,
    DEFAULT_NOVEL_CONSTRAINTS,
    judgeProseQuality,
    DEFAULT_NOVEL_RUBRIC,
    type CTRLParams,
} from '../lib/narrative-intelligence';


export class NovelScribe {
    /**
     * Chamber 2-4: Novel Scribe
     * Responsibility: High-fidelity novel synthesis and descriptive expansion.
     */
    public static async synthesize(
        originalPlot: string,
        charContext: string,
        activeBlueprint: any,
        level: number,
        chronicle: string = "",
        worldSettings: string = "",
        format: 'NOVEL' = 'NOVEL', // Locked to NOVEL
        language: 'KO' | 'EN' = 'KO',
        targetLength: number,
        mode: 'CREATE' | 'TRANSLATE' | 'ADAPT_TO_SCRIPT' = 'CREATE',
        refText: string = ""
    ): Promise<AgentResponse> {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        const creativity = Math.min(0.9, 0.70 + (level * 0.05));

        // 1. Fetch Configuration & SOPs from DB
        const [
            volumeSop,
            sopGuidelines,
            sopPersona
        ] = await Promise.all([
            AgentFactory.fetchSOP('VOLUME_CONTROL_POLICY'),
            AgentFactory.fetchSOP('SCRIBE_GUIDELINES_NOVEL'), // Dedicated Novel SOP
            AgentFactory.fetchSOP(mode === 'CREATE' ? 'SCRIBE_PERSONA_NOVEL' : (mode === 'TRANSLATE' ? 'SCRIBE_MISSION_TRANSLATE' : 'SCRIBE_MISSION_ADAPT'))
        ]);

        // 우선순위: system_config → VOLUME_CONTROL_POLICY SOP → lib/constants 기본값
        // system_config 키: NOVEL_DENSITY, SECTION_LIMIT, NOVEL_DENSITY_KO_RATIO
        const novelDensitySop = AgentFactory.parseVolumeConfig(volumeSop, 'NOVEL_DENSITY', DEFAULT_NOVEL_DENSITY);
        const novelDensity = await AgentFactory.fetchConfig('NOVEL_DENSITY', novelDensitySop);

        const sectionLimitKoSop = AgentFactory.parseVolumeConfig(volumeSop, 'SECTION_LIMIT_KO', DEFAULT_SECTION_LIMIT_KO);
        const sectionLimitKo = await AgentFactory.fetchConfig('SECTION_LIMIT_KO', sectionLimitKoSop);

        // system_config의 SECTION_LIMIT 키 사용 (영문 기준)
        const sectionLimitEnSop = AgentFactory.parseVolumeConfig(volumeSop, 'SECTION_LIMIT_EN', DEFAULT_SECTION_LIMIT_EN);
        const sectionLimitEn = await AgentFactory.fetchConfig('SECTION_LIMIT', sectionLimitEnSop);

        // system_config 키: NOVEL_DENSITY_KO_RATIO
        const novelKoRatioSop = AgentFactory.parseVolumeConfig(volumeSop, 'NOVEL_DENSITY_KO_RATIO', DEFAULT_NOVEL_KO_RATIO);
        const novelKoRatio = await AgentFactory.fetchConfig('NOVEL_DENSITY_KO_RATIO', novelKoRatioSop);

        // [V3.1 Forced Turbo]
        const blueprintText = originalPlot;
        let beats = blueprintText.split(/Beat\s*#?\d+:?|비트\s*#?\d+:?|\n\n/gi).filter((b: string) => b.trim().length > 20);

        // [V6.0 Enhanced Language-Specific Volume Control]
        const ratio = language === 'KO' ? Number(novelKoRatio) : 1.0;
        const totalTargetChars = Math.max(2000, targetLength * Number(novelDensity) * ratio);

        // Dynamic Sectioning & Linear Redistribution
        // [V8.0 Zero-Hardcoding] Reading language-specific SECTION_LIMIT from DB.
        // LLMs struggle to output >1200 Korean chars of continuous prose in one go.
        let initialCharsPerSection = language === 'KO' ? Number(sectionLimitKo) : Number(sectionLimitEn);
        let totalSections = Math.ceil(totalTargetChars / initialCharsPerSection);

        // [V6.3 Optimization] Do NOT force totalSections to match beats.length.
        // Let them merge naturally into totalSections to respect Volume Control.
        if (totalSections < 1) totalSections = 1;
        // Limit max sections to prevent extreme fragmentation
        if (totalSections > 8) totalSections = 8;

        // [V6.2 Precision Tuning] Removed buffer to prevent overshoot.
        const adjustedCharsPerSection = Math.floor(totalTargetChars / totalSections);

        console.log(`>>> [V6.2 Multi-Lang Volume] Lang: ${language}, Ratio: ${ratio}, Target: ${totalTargetChars} chars. Sections: ${totalSections}, Target Per Section: ${adjustedCharsPerSection}`);

        const isMultiStep = totalSections > 1;

        if (isMultiStep) {
            console.log(`>>> [V4.0 Turbo Scribe] ${totalSections} segments identified.`);

            // Split beats logic (Same as before)
            if (beats.length < totalSections) {
                // If there aren't enough natural beats, split by sentences to force the correct number of chunks
                const sentenceMatches = blueprintText.match(/[^.!?]+[.!?]+/g);
                if (sentenceMatches && sentenceMatches.length > beats.length) {
                    beats = sentenceMatches.map(s => s.trim()).filter(s => s.length > 0);
                }
            }

            // Re-check just in case sentences were still fewer than totalSections
            // If beats are extremely short, we might not reach totalSections, but we'll distribute as best as possible.
            const actualSections = Math.min(beats.length, totalSections);
            const chunks = [];
            const baseSize = Math.floor(beats.length / actualSections);
            let remainder = beats.length % actualSections;
            let currentIndex = 0;

            for (let i = 0; i < actualSections; i++) {
                const currentChunkSize = baseSize + (remainder > 0 ? 1 : 0);
                remainder--;
                chunks.push(beats.slice(currentIndex, currentIndex + currentChunkSize).join('\n\n'));
                currentIndex += currentChunkSize;
            }

            let fullStory = "";
            let lastReasoning = "";
            let finalCharacters: any[] = [];
            let lastContextState = {};

            for (let i = 0; i < chunks.length; i++) {
                console.log(`>>> [Turbo Scribe] Section ${i + 1}/${actualSections}...`);
                // Calculate target characters for this specific chunk based on actual sections being generated,
                // adjusting in case `actualSections` is less than initially requested `totalSections`.
                const sectionTarget = Math.floor(totalTargetChars / actualSections);

                const chunkPrompt = buildScribePrompt(
                    chunks[i] || "Content continues...",
                    charContext,
                    activeBlueprint,
                    level,
                    i === 0 ? chronicle : `${chronicle}\n\n[PREVIOUSLY]: ${fullStory.substring(fullStory.length - 2000)}`,
                    worldSettings,
                    format,
                    language,
                    sectionTarget,
                    mode,
                    refText,
                    sopGuidelines, // Pass fetched SOP
                    sopPersona,    // Pass fetched Persona
                    i + 1,
                    actualSections
                );

                const result = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: chunkPrompt }] }],
                    generationConfig: { temperature: creativity, maxOutputTokens: 12000 }
                });

                let chunkResponse = safeParseJSON(result.response.text());

                // ── Iterative Refinement: LLM-as-Judge 품질 게이트 ──────────────
                // 첫 번째 생성 결과가 기준치 미달이면 한 번 재생성합니다.
                if (chunkResponse.success) {
                    const rawContent = chunkResponse.data?.content || chunkResponse.data?.prose || "";
                    if (rawContent.length > 200) {
                        const judgeResult = await judgeProseQuality(
                            rawContent,
                            DEFAULT_NOVEL_RUBRIC,
                            process.env.GEMINI_API_KEY!,
                            `Section ${i + 1}/${actualSections}`
                        );
                        console.log(`>>> [Iterative Refinement] Section ${i + 1} Score: ${judgeResult.totalScore.toFixed(1)} | ${judgeResult.summary}`);

                        if (!judgeResult.approved && judgeResult.totalScore < 70) {
                            console.warn(`>>> [Iterative Refinement] Score too low (${judgeResult.totalScore.toFixed(1)}), regenerating...`);
                            const refinedPrompt = chunkPrompt + `\n\n[REFINEMENT FEEDBACK — 이전 생성물의 문제점]\n${judgeResult.summary}\n${judgeResult.breakdown.filter(b => b.score < 70).map(b => `• ${b.criterion}: ${b.comment}`).join('\n')}\n위 문제점을 수정하여 다시 작성하라.`;
                            const retryResult = await model.generateContent({
                                contents: [{ role: 'user', parts: [{ text: refinedPrompt }] }],
                                generationConfig: { temperature: Math.min(creativity + 0.05, 0.95), maxOutputTokens: 12000 }
                            });
                            const retryResponse = safeParseJSON(retryResult.response.text());
                            if (retryResponse.success) {
                                chunkResponse = retryResponse;
                                console.log(`>>> [Iterative Refinement] Section ${i + 1} regenerated.`);
                            }
                        }
                    }
                }
                // ─────────────────────────────────────────────────────────────────

                if (chunkResponse.success) {
                    const data = chunkResponse.data;
                    const content = data.content || data.prose || (language === 'KO' ? data.synthesized_kr : data.synthesized_en) || "";
                    const charCount = content?.length || 0;
                    console.log(`>>> [Turbo Scribe] Section ${i + 1} Done: ${charCount} chars. (Target: ${sectionTarget})`);
                    fullStory += (content + "\n\n");
                    lastReasoning += ` | Section ${i + 1}: ${data.reasoning?.substring(0, 100)}`;
                    if (data.characters) {
                        data.characters.forEach((newChar: any) => {
                            if (!finalCharacters.find((c: any) => c.reinterpreted_name_kr === newChar.reinterpreted_name_kr)) {
                                finalCharacters.push(newChar);
                            }
                        });
                    }
                    if (data.source_metadata?.context_state) lastContextState = { ...lastContextState, ...data.source_metadata.context_state };
                } else {
                    console.warn(`>>> Section ${i + 1} Failed. Using filtered fallback.`);
                    // Filter out JSON structure lines to avoid leaking system text into prose
                    const rawLines = (chunkResponse.rawText || "").split('\n');
                    const proseLines = rawLines.filter(l =>
                        !l.trim().startsWith('{') && !l.trim().startsWith('}') &&
                        !l.trim().startsWith('"') && !l.trim().startsWith('[') &&
                        l.trim().length > 10
                    );
                    const fallbackContent = proseLines.length > 2 ? proseLines.join('\n') : (chunkResponse.rawText || "");
                    fullStory += (fallbackContent + "\n\n");
                }
            }

            return {
                success: true,
                data: {
                    synthesized_title_kr: activeBlueprint?.saga_title_kr || activeBlueprint?.synthesized_title_kr || "Generated Story",
                    synthesized_kr: language === 'KO' ? fullStory.trim() : "",
                    synthesized_en: language === 'EN' ? fullStory.trim() : "",
                    reasoning: `[V4.0 Dynamic] ${totalTargetChars} chars (${actualSections} sections). ${lastReasoning}`,
                    characters: finalCharacters,
                    source_metadata: { context_state: lastContextState }
                },
                rawText: "Merged Output"
            };
        }

        // Single-Shot
        console.log(`>>> [One-Shot Scribe] Target: ${totalTargetChars} chars...`);
        const prompt = buildScribePrompt(
            originalPlot,
            charContext,
            activeBlueprint,
            level,
            chronicle,
            worldSettings,
            format,
            language,
            totalTargetChars,
            mode,
            refText,
            sopGuidelines,
            sopPersona,
            1,
            1
        );

        try {
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: creativity, maxOutputTokens: 16384 }
            });
            const response = safeParseJSON(result.response.text());
            if (response.success) {
                const data = response.data;
                return {
                    success: true,
                    data: {
                        synthesized_title_kr: data.title || activeBlueprint?.saga_title_kr || "Generated Story",
                        synthesized_kr: language === 'KO' ? (data.content || data.prose) : "",
                        synthesized_en: language === 'EN' ? (data.content || data.prose) : "",
                        reasoning: data.reasoning,
                        characters: data.characters,
                        source_metadata: data.source_metadata
                    }
                };
            }
            return response;
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}

/**
 * ---------------------------------------------------------
 * HELPER FUNCTIONS
 * ---------------------------------------------------------
 */

function buildScribePrompt(
    originalPlot: string,
    charContext: string,
    activeBlueprint: any,
    level: number,
    chronicle: string,
    worldSettings: string,
    format: 'NOVEL' | 'SCRIPT',
    language: 'KO' | 'EN',
    targetLength: number,
    mode: 'CREATE' | 'TRANSLATE' | 'ADAPT_TO_SCRIPT',
    refText: string,
    customSop?: string,
    personaSop?: string, // [NEW] Persona SOP
    sectionIndex?: number,
    totalSections?: number
): string {
    const bpChars = activeBlueprint?.character_arcs ? JSON.stringify(activeBlueprint.character_arcs) : "None";
    const bpGlossary = activeBlueprint?.glossary ? JSON.stringify(activeBlueprint.glossary) : "None";
    const bpRules = activeBlueprint?.world_bible?.rules_kr || "None";
    const outputField = language === 'KO' ? 'synthesized_kr' : 'synthesized_en';

    // NOVEL-ONLY Section Focus
    const sectionFocus = sectionIndex ? `
    [SECTION FOCUS: ${sectionIndex}/${totalSections}]
    - **LENGTH TARGET**: Stay close to **${targetLength}** characters. Prioritize narrative punch over length.
    - **[ANTI-REDUNDANCY]**: Do NOT repeat background descriptions or internal thoughts already mentioned in previous context.
    - **[PROGRESSION FOCUS]**: Focus on moving the story forward. Every sentence must lead to a new action or a change in status.
    - **EFFICIENT DESCRIBING STRATEGY**:
      1. **Cinematic Highlighting**: Focus on the most impactful moments. Spend detail where it matters, and keep transitions lean.
      2. **1:5 Rule**: Expand key actions into 5-8 vivid sentences to build atmosphere without being verbose.
      3. **Show, Don't Tell**: Describe physical reactions instead of simple emotion labels.
      4. **Sensory Touch**: Evoke senses (Sound, Smell, Touch, etc.) only when it adds meaningful atmosphere to the scene.
    - **CRITICAL**: This is NOT a summary. This is a FULL-LENGTH NOVEL CHAPTER. Each beat must be exploded into a symphony of details.
    - **[NAME SUBSTITUTION TABLE]**: You MUST use the provided [MANDATORY NAME SUBSTITUTIONS].
    - **[ANTI-EPIC-ENDING RULE]**:
      - **CRITICAL**: Do NOT end the section with a "hero's mission statement" or an "epic resolution" sentence (e.g., "He was the guardian...", "His journey continues...", "He will never give up...").
      - Every section is just a **middle fragment** of a larger scene. End naturally mid-action or with a lingering thought.
      - Never write a concluding paragraph that summarizes the theme of the section.
    - **[PROHIBITED PHRASES (NO REPETITION)]**:
      - Do NOT use: "도시의 수호자", "여정은 아직 끝나지 않았다", "결코 포기하지 않을 것이다", "빛을 찾아 헤매는", "미래를 향해 나아가야만 했다".
    - **[TRANSITION RULE]**: Connect seamlessly with the [Previous Context State]. Stop immediately when the beat is fulfilled.` : "";

    // ── AI 기법 주입 블록 ────────────────────────────────────────────────────
    // Chain-of-Thought: 씬 작성 전 단계적 추론 유도
    const cotPrefix = buildCoTPrefix('NOVEL_SCENE');

    // Few-Shot: 저품질 → 고품질 예시 쌍으로 원하는 수준 학습
    const fewShotBlock = buildFewShotBlock('PROSE_EXPANSION');

    // Constraint-Based: 명시적 DO/DON'T 제약 목록
    const constraintBlock = buildConstraintBlock(DEFAULT_NOVEL_CONSTRAINTS);

    // Controllable Generation (CTRL): 장르·톤·페이싱 제어 토큰
    const ctrlParams: CTRLParams = {
        genre:   activeBlueprint?.style_guide?.tone_en   || 'Literary Fiction',
        tone:    activeBlueprint?.style_guide?.tone_kr   || '감성적',
        pov:     '3인칭 제한적',
        pacing:  sectionIndex && totalSections && sectionIndex > Math.floor(totalSections * 0.7) ? 'FAST' : 'MEDIUM',
    };
    const ctrlTokens = buildCTRLTokens(ctrlParams);
    // ────────────────────────────────────────────────────────────────────────

    return `
        [IDENTITY & MISSION]
        ${personaSop || "Role: Master Storyteller."}

        ${ctrlTokens}

        ${cotPrefix}

        ${fewShotBlock}

        [CORE OBJECTIVE]
        Generate high-quality ${format} content. Language: ${language}.
        Target Length: ${targetLength} characters.
        ${sectionFocus}

        [INPUT DATA]
        - Plot/Context: ${originalPlot}
        ${mode !== 'CREATE' ? `- Reference Text: ${refText}` : ''}

        [GUIDELINES (SOP)]
        ${customSop || "Adhere to high literary standards. Avoid repetitive metaphors and clichés."}
        - **Prose Diversity (CRITICAL)**: Do NOT start consecutive paragraphs with the same word or naming subject.
        - **[ANTI-NAME-START PENALTY]**: ABSOLUTELY DO NOT start paragraphs with the protagonist's name or pronoun (e.g., "주인공은...", "그는..."). This is a glaring AI mistake. Use Deep POV: start paragraphs with environmental changes, sensory details, an opposing force, an object, or a dialogue. (e.g., Instead of "주인공은 문을 열었다", write "녹슨 철문이 비명을 지르며 젖은 어둠을 토해냈다.")
        - **Sensory Saturation**: Every paragraph should evoke at least one of the five senses.

        ${constraintBlock}

        [CONSTRAINTS]
        - **Naming**: Use accepted DB names only. DO NOT use common clichés.
        - Use ONLY the reinterpreted names and terms provided in the Character Arcs and Character DB below. Original names should remain invisible in the final story text.
        - **[ULTIMATE NARRATIVE EXPANSION]**: Each SINGLE SENTENCE in the synopsis must be exploded into at least 15-20 vivid, sensory sentences. 
        - **[VERBOSITY COMMAND]**: Do NOT be concise. Describe the air's temperature, the specific smell of the environment, the minute twitch of a finger, and the internal struggle.
        - **[STRICT LENGTH CHECK]**: This section MUST be at least ${Math.floor(targetLength * 0.9)} Korean characters (공백 포함 글자수). You MUST generate at least 25-30 long sentences per chunk. If you output less than ${Math.floor(targetLength * 0.8)} characters, you will fail the mission. Keep extending the scenes with deep inner thoughts and environmental descriptions.
        - Focus on **"Showing, Not Telling"**. Instead of saying "He was angry", describe the tightening of his jaw, the heat rising in his chest, and the way his knuckles turned white as he gripped the desk.
        [STRICT LANGUAGE ISOLATION]
        - You MUST write the story ONLY in **${language === 'KO' ? 'KOREAN' : 'ENGLISH'}**.
        - Do NOT include any ${language === 'KO' ? 'English' : 'Korean'} words, translations, or JSON keys in the "content" field.
        
        - **[STRICT NEGATIVE CONSTRAINTS]**
        - **FORBIDDEN NAMES**: ABSOLUTELY DO NOT use specific names, locations, or terminology from ANY existing world-famous source material (novels, movies, games). 
        - **FORBIDDEN YEARS**: Do NOT mention a specific future year (e.g., "2077") unless it is the explicit current year of this project settings.
        - If any of these forbidden terms appear in the input context, you MUST ignore them or replace them with their reinterpreted cyberpunk counterparts.
        
        [OUTPUT JSON SCHEMA]
        {
          "title": "Scene Title",
          "content": "Full expanded prose in ${language === 'KO' ? 'KOREAN' : 'ENGLISH'}. Minimum ${Math.floor(targetLength * 0.9)} characters.",
          "reasoning": "Reasoning for the expansion",
          "audio_palette_bgm": "Recommended BGM Style for this chapter (e.g. Tense Suspense Strings)",
          "audio_palette_ambience": "Recommended Ambience for this chapter (e.g. Neon City Bustle)",
          "characters": [
            {
              "original_name": "원작 이름 (개인 인물만 포함. 집단·조직·장소·개념은 절대 포함 금지)",
              "reinterpreted_name_kr": "각색된 한국어 이름 (반드시 개인 인물, 단일 캐릭터)",
              "reinterpreted_role_kr": "역할 설명",
              "tier": "MAIN|SUPPORTING|EXTRA"
            }
          ],
          "source_metadata": { "context_state": { "inventory": [], "hp": "..." } }
        }
        ⚠️ characters 배열 규칙: 이름이 있는 단일 개인 인물만 포함하십시오.
        절대 포함 금지: 집단(~들, ~세력, ~군단), 조직명, 장소명, 개념명, 영혼들.

        [BLUEPRINT CONTEXT]
        1. World Rules: ${bpRules}
        2. Glossary: ${bpGlossary}
        3. Character Arcs: ${bpChars}

        [WORLD SETTINGS]
        ${worldSettings.substring(0, 5000)}

        [PRIOR CONTEXT]
        ${chronicle.substring(Math.max(0, chronicle.length - 8000))}

        [CURRENT BEATS]
        ${originalPlot}

        [CHARACTER DB]
        ${charContext}
    `;
}


// safeParseJSON is imported from lib/json-repair.ts
