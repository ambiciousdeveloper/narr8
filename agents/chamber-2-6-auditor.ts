import { GoogleGenerativeAI } from '@google/generative-ai';
import { AgentFactory } from './chamber-0-repository';
import type { AgentResponse } from './chamber-0-repository';
import { GEMINI_MODEL } from '../lib/constants';
import {
    judgeProseQuality,
    DEFAULT_NOVEL_RUBRIC,
    type JudgeResult,
} from '../lib/narrative-intelligence';

/**
 * Chamber 2-6: Narrative Auditor
 * 기법:
 *   - 기존: 캐릭터 라이프사이클 관리 (상태 추적)
 *   - 추가: LLM-as-Judge (루브릭 기반 품질 점수)
 */
export class NarrativeAuditor {
    public static async audit(
        storyText: string,
        characters: any[],
        episodeIndex: number,
        previousState: any = {},
        location: string = ""
    ): Promise<AgentResponse> {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({
            model: GEMINI_MODEL,
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1 // High objectivity required
            }
        });

        const sop = await AgentFactory.fetchSOP('AUDITOR_RULES');
        const charList = characters.map(c => `- ID: ${c.id}, Name: ${c.reinterpreted_name_kr || '이름 없음'}, Tier: ${c.tier || c.reinterpreted_tier_kr}`).join('\n');

        const prevStateContext = previousState && Object.keys(previousState).length > 0
            ? `[PREVIOUS NARRATIVE STATE (CUMULATIVE)]\n${JSON.stringify(previousState, null, 2)}`
            : "No previous state. This is the starting point.";

        let prompt = sop || `
            Task: You are a NARRATIVE AUDITOR. Your goal is to analyze the story text and update the status and narrative state of participating characters.

            [STORY TEXT]
            ${storyText}

            [PARTICIPATING CHARACTERS]
            ${charList}

            ${prevStateContext}

            [AUDIT GUIDELINES]
            1. **Active Status**: By default, characters remain 'ACTIVE'.
            2. **EXTRA Tier Policy**: EXTRA characters (Extras) are typically one-time roles. Set them to 'RETIRED' after their scene.
            3. **State Persistence (CUMULATIVE)**:
               - **Emotional State**: Extract current mood (e.g., "불안함", "결연함").
               - **Inventory**: Merge current findings with [PREVIOUS NARRATIVE STATE]. If an item is acquired, add it. If lost, remove it.
               - **Decisions**: List key choices made in this episode. Append to historical decisions if highly significant.
               - **Knowledge**: List critical info learned.

            [OUTPUT SCHEMA]
            Return a JSON object:
            {
              "updates": [
                {
                  "character_id": "uuid",
                  "status": "ACTIVE | RETIRED | DECEASED | DEPARTED",
                  "bound_location": "string | null",
                  "exit_reason": "string (KO)",
                  "narrative_state": {
                    "emotional_state": "string (KO)",
                    "inventory": ["string"],
                    "decisions_made": ["string"],
                    "knowledge_gained": ["string"]
                  }
                }
              ],
              "summary": "Professional summary in Korean"
            }
        `;

        if (sop) {
            prompt = sop
                .replace('{{storyText}}', storyText)
                .replace('{{characters}}', charList);
        }

        try {
            console.log(`>>> [Chamber 2-6 Auditor] Auditing Episode ${episodeIndex}...`);
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            const auditData = JSON.parse(responseText.replace(/```json|```/g, "").trim());

            return {
                success: true,
                data: auditData,
                rawText: responseText
            };
        } catch (error: any) {
            console.error(">>> Auditor Execution Error:", error);
            return { success: false, error: error.message };
        }
    }

    // ─── LLM-as-Judge: 루브릭 기반 품질 점수화 ──────────────────────────────

    /**
     * judgeQuality
     * 생성된 에피소드의 문학적 품질을 루브릭 기반으로 0~100 점수화합니다.
     * 루브릭: 감각적 몰입도 / 인물 일관성 / 플롯 진전 / 문체 다양성 / 감정 공명
     */
    public static async judgeQuality(
        storyText: string,
        episodeIndex: number,
        contextHint: string = ''
    ): Promise<JudgeResult> {
        console.log(`>>> [LLM-as-Judge] Scoring Episode ${episodeIndex}...`);
        const result = await judgeProseQuality(
            storyText,
            DEFAULT_NOVEL_RUBRIC,
            process.env.GEMINI_API_KEY!,
            contextHint
        );
        console.log(`>>> [LLM-as-Judge] Episode ${episodeIndex} Score: ${result.totalScore.toFixed(1)} | Approved: ${result.approved}`);
        if (!result.approved) {
            console.warn(`>>> [LLM-as-Judge] Low quality. Issues:\n${
                result.breakdown.filter(b => b.score < 70).map(b => `  • ${b.criterion}: ${b.comment}`).join('\n')
            }`);
        }
        return result;
    }

    /**
     * auditAndJudge
     * 캐릭터 상태 감사(audit) + 품질 점수(judge)를 병렬로 실행합니다.
     */
    public static async auditAndJudge(
        storyText: string,
        characters: any[],
        episodeIndex: number,
        previousState: any = {},
        location: string = ''
    ): Promise<AgentResponse & { qualityScore?: JudgeResult }> {
        const [auditResult, judgeResult] = await Promise.all([
            NarrativeAuditor.audit(storyText, characters, episodeIndex, previousState, location),
            NarrativeAuditor.judgeQuality(storyText, episodeIndex),
        ]);

        return {
            ...auditResult,
            qualityScore: judgeResult,
            data: {
                ...(auditResult.data || {}),
                quality_score: {
                    total: judgeResult.totalScore,
                    approved: judgeResult.approved,
                    summary: judgeResult.summary,
                    breakdown: judgeResult.breakdown,
                },
            },
        };
    }
}
