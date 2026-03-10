import { GoogleGenerativeAI } from '@google/generative-ai';
import { AgentFactory, type AgentResponse } from './chamber-0-repository';
import {
    GEMINI_MODEL,
    DEFAULT_SCRIPT_DENSITY,
    DEFAULT_SCRIPT_SECTION_LIMIT,
    DEFAULT_SCRIPT_KO_RATIO,
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
        const creativity = Math.min(0.9, 0.7 + (level * 0.05));

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

        const ratio = language === 'KO' ? Number(scriptKoRatio) : 1.0;
        const totalTargetChars = Math.max(1500, targetLength * Number(scriptDensity) * ratio * Number(globalDensity));

        // 2. [V81 Paragraph-Aware Sectioning]
        const beats = originalPlot.split(/Beat\s*#?\d+:?|비트\s*#?\d+:?|\n\n/gi).filter(b => b.trim().length > 20);
        const novelParagraphs = refText.split(/\n\n+/).filter(p => p.trim().length > 0);

        const idealSections = Math.ceil(totalTargetChars / Number(sectionLimit));
        const actualSections = Math.max(1, Math.min(beats.length, idealSections));
        const sectionLengthTarget = Math.floor(totalTargetChars / actualSections);

        console.log(`>>> [ScriptScribe V81 Hardened] Target: ${totalTargetChars}, Sections: ${actualSections}`);

        // 3. Unified Generation Loop
        let fullScript = "";
        let finalCharacters: any[] = [];
        let lastRawResponse = "";
        let contextState = {
            lastSlugline: "",
            lastAction: "",
            lastThreeLines: "",
            forbiddenBeats: [] as string[],
            lastSceneNumber: 0
        };

        const beatChunk = Math.ceil(beats.length / actualSections);
        const paraChunk = Math.ceil(novelParagraphs.length / actualSections);

        let lastChunkHeader = "";
        for (let i = 0; i < actualSections; i++) {
            const chunk = beats.slice(i * beatChunk, (i + 1) * beatChunk).join('\n\n');
            const slicedRef = novelParagraphs.slice(i * paraChunk, (i + 1) * paraChunk).join('\n\n');
            if (!chunk && i > 0) break;

            let retryCount = 0;
            let currentTemp = 0.5;

            while (retryCount < 2) {
                const prompt = buildUnifiedPrompt({
                    plot: chunk,
                    characters: charContext,
                    blueprint: activeBlueprint,
                    // V140: Stabilized Continuity Bridge.
                    chronicle: i === 0 ? chronicle : `[STABLE_BRIDGE]\n${fullScript.slice(-2500)}\n\n[TASK]: Resume from S# ${contextState.lastSceneNumber + 1}.`,
                    settings: worldSettings,
                    language,
                    targetChars: sectionLengthTarget,
                    sourceProse: slicedRef,
                    idx: i + 1,
                    total: actualSections,
                    nextSceneNumber: contextState.lastSceneNumber + 1,
                    sopPersona,
                    sopGuidelines,
                    ...contextState
                });

                const result = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature: currentTemp, maxOutputTokens: 10000 }
                });

                lastRawResponse = result.response.text();
                const response = safeParseJSON(lastRawResponse);

                if (response.success) {
                    let content = scrubMeta(response.data.content || "");

                    // V140: Circuit Breaker - Repetition / Stuttering Detection
                    const currentHeader = content.substring(0, 100).trim();
                    if (i > 0 && currentHeader === lastChunkHeader && retryCount === 0) {
                        console.warn(`>>> [V140 Circuit Breaker] Repetition detected at chunk ${i + 1}. Retrying with higher entropy...`);
                        currentTemp = 0.7; // Break the loop
                        retryCount++;
                        continue;
                    }

                    // V141: Dialogue Enforcement - Reject silent scripts and retry
                    if (content && !hasDialogue(content) && retryCount < 2) {
                        console.warn(`>>> [V141 Dialogue Enforcer] No dialogue detected in chunk ${i + 1}. Retrying with dialogue injection...`);
                        currentTemp = Math.min(0.9, currentTemp + 0.2);
                        retryCount++;
                        continue;
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
            return { success: false, error: "대본 생성 결과가 비어있습니다. (V135 파싱 실패)", rawText: lastRawResponse };
        }

        return {
            success: true,
            data: {
                synthesized_title_kr: activeBlueprint?.saga_title_kr || "Generated Script",
                synthesized_kr: language === 'KO' ? fullScript.trim() : "",
                synthesized_en: language === 'EN' ? fullScript.trim() : "",
                reasoning: `Screenplay via ScriptScribe V135 Fail-Safe. Instruction isolation active.`,
                characters: finalCharacters
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
        .replace(/\(혼잣말\)/g, "")
        .replace(/\(침묵\)/g, "")
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

    return `
[[SYSTEM_PROTOCOL]]
[ROLE]
Professional Script Adaptor.
Convert PROSE into a high-density, visual SCREENPLAY in **${langLabel}** ONLY.
${personaBlock}
[GOLDEN FORMAT SAMPLE]
S# 10. INT. 낡은 무도장 - 밤
먼지 쌓인 매트리스 위로 달빛이 세상을 비춘다.
강태준, 가죽 장갑을 탁자 위로 던진다. 툭, 하는 둔탁한 소리.
그가 심호흡을 하자 차가운 공기가 하얀 입김이 되어 흩어진다.
강태준
...결국, 다시 시작인 건가.
경직된 턱 근육이 대변하듯 그는 룬 문자를 뚫어져라 응시한다.

[MANDATORY RULES]
1. **SCENE NUMBERING**: You MUST start the content with "S# ${nextNum}.". Use format "S# N. [PLACE] - [TIME]".
2. **HIGH DENSITY**: Merge multiple paragraphs into one dense S# sequence. NO "S1", "S2" shortcuts.
3. **ZERO PROSE LEAK**: No "feels", "thinks", "decides". Only pixel-level physical actions.
4. **DIALOGUE PURITY**: No "(혼잣말)", "(침묵)". Action lines for silence.
5. **DIALOGUE MANDATORY**: Every scene MUST contain at least ONE spoken dialogue line. Characters MUST speak. A scene with ZERO dialogue lines is INVALID and will be rejected. OUTPUT WITH NO DIALOGUE WILL BE DISCARDED.
6. **NO CONSECUTIVE SILENT SCENES**: You MUST NOT write 3 or more consecutive scenes without dialogue. Insert spoken lines to break any silent streak.
7. **DIALOGUE DENSITY**: At least 30% of all lines in the output must be character dialogue lines (character name on its own line followed by spoken text).
8. **ANTI-NARRATION**: Do NOT write scenes that only describe environment, atmosphere, or internal state. Every scene must advance through CHARACTER SPEECH AND ACTION together.
9. **DIALOGUE FORMAT**: Write the character name alone on one line, then the spoken line below it. Example:
김해리
여기서 뭘 하는 거요?
${guidelinesBlock}
[[/SYSTEM_PROTOCOL]]

[STORY BEATS]
${p.plot}

[SOURCE PROSE]
${p.sourceProse}

[VISUAL BRIDGE]
${p.chronicle}

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

    return {
        ...state,
        lastAction: scrubMeta(lastAction).substring(0, 300),
        lastSceneNumber: lastScene,
        lastThreeLines: lines.slice(-3).join('\n')
    };
}

/**
 * V141: Dialogue Presence Validator
 * Detects at least one character name line followed by a dialogue line.
 */
function hasDialogue(content: string): boolean {
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        // Korean name (2-6 chars) or uppercase English name alone on line
        const isNameLine = /^[가-힣]{2,6}$/.test(line) || /^[A-Z][A-Z\s]{1,20}$/.test(line);
        if (isNameLine && !lines[i + 1].startsWith('S#') && lines[i + 1].length > 2) {
            return true;
        }
    }
    return false;
}

function safeParseJSON(text: string): AgentResponse {
    let jsonString = text.trim();
    try {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) jsonString = match[1];
        else {
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start !== -1 && end !== -1 && end > start) jsonString = text.substring(start, end + 1);
        }
        jsonString = jsonString.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "").replace(/,(\s*[}\]])/g, "$1");
        return { success: true, data: JSON.parse(jsonString), rawText: text };
    } catch (e) {
        return aggressiveRepairJSON(jsonString, text);
    }
}

function aggressiveRepairJSON(jsonString: string, originalText: string): AgentResponse {
    try {
        let repaired = jsonString.replace(/(": ")([\s\S]*?)(",?\n\s*")/g, (m, p, c, s) => p + c.replace(/(?<!\\)"/g, '\\"') + s);
        const open = (repaired.match(/\{/g) || []).length;
        const close = (repaired.match(/\}/g) || []).length;
        if (open > close) repaired += "}".repeat(open - close);
        return { success: true, data: JSON.parse(repaired), rawText: originalText };
    } catch {
        const match = originalText.match(/"content":\s*"([\s\S]*?)"(?=\s*,\s*"|(?:\s*\n?\s*\}))/);
        if (match) return { success: true, data: { content: match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') }, rawText: originalText };
        return { success: false, error: "JSON Final Failure", rawText: originalText };
    }
}
