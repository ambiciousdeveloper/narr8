import { GoogleGenerativeAI } from "@google/generative-ai";
import { AgentFactory } from './chamber-0-repository';
import { GEMINI_MODEL } from '../lib/constants';
import {
    buildCoTPrefix,
    checkConstitution,
    NARRATIVE_CONSTITUTION,
    scoreFluency,
    type ConstitutionCheckResult,
    type FluencyResult,
} from '../lib/narrative-intelligence';

interface CriticismResult {
    score: number;
    approved: boolean;
    issues: string[];
    feedback: string;
    // 추가 필드
    constitutionCheck?: ConstitutionCheckResult;
    fluencyResult?: FluencyResult;
}

export interface DebateResult {
    finalApproved: boolean;
    finalScore: number;
    criticArgument: CriticismResult;
    advocateFeedback: string;
    verdict: string;
}

/**
 * Chamber 2-6: Story Critic Agent
 * 기법:
 *   - Chain-of-Thought 비평 추론
 *   - Constitutional AI 헌법 검사
 *   - Fluency Scoring
 *   - Adversarial Debate (비평 ↔ 옹호 → 최종 판정)
 */
export const StoryCritic = {

    // ─── 1. 기본 비평 (Chain-of-Thought + Constitutional + Fluency) ──────────

    async critique(
        storyBody: string,
        contextCheck: {
            limitTime?: string;
            timeAnchor?: string;
            sagaRange?: string;
            characters?: any[];
            logicRules?: string[];
            skipConstitution?: boolean; // 빠른 모드: 헌법 검사 생략
            skipFluency?: boolean;
        }
    ): Promise<CriticismResult> {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        const sop = await AgentFactory.fetchSOP('CRITIC_GUIDELINES');

        // Chain-of-Thought 비평 추론 체인 삽입
        const cotPrefix = buildCoTPrefix('SCENE_CRITIQUE');

        let prompt = sop || `
        Role: Senior Story Editor & Guardrail Auditor
        Task: Review the SCENE for Event Integrity and Narrative Progress.

        [INTEGRITY AUDIT RULES]
        1. **EVENT LOYALTY**: Did the writer only cover the assigned events?
           - Fail if: They summarized future events from the chapter.
           - Fail if: They repeated events already covered in previous scenes.
        2. **CAUSAL CONTINUITY**: Does the scene ignore or contradict previous facts?
        3. **TEMPORAL INTEGRITY**: Is the timeframe consistent with the Anchor?
        4. **LITERARY DENSITY**: Is the writing detailed (Show, Don't Tell) or just a summary?

        [STORY SEGMENT TO REVIEW]
        {{storyBody}}

        [AUDIT CONTEXT]
        - Allowed Events: {{allowedEvents}}
        - Current Anchor: {{timeAnchor}}
        - Saga Range: {{sagaRange}}

        [OUTPUT FORMAT]
        Return ONLY a JSON object:
        {
          "score": number (0-100),
          "approved": boolean (true if score >= 90),
          "issues": ["List of specific violations found..."],
          "feedback": "Direct instructions to the writer on how to fix Event Leaks or redundancy."
        }
      `;

        const fullPrompt = cotPrefix + '\n\n' + (sop
            ? sop
                .replace('{{storyBody}}', storyBody)
                .replace('{{allowedEvents}}', contextCheck.logicRules?.join(', ') || "N/A")
                .replace('{{timeAnchor}}', contextCheck.timeAnchor || "N/A")
                .replace('{{sagaRange}}', contextCheck.sagaRange || "N/A")
            : prompt.replace('{{storyBody}}', storyBody)
                    .replace('{{allowedEvents}}', contextCheck.logicRules?.join(', ') || "N/A")
                    .replace('{{timeAnchor}}', contextCheck.timeAnchor || "N/A")
                    .replace('{{sagaRange}}', contextCheck.sagaRange || "N/A"));

        // Constitutional AI 검사와 Fluency 검사를 병렬 실행
        const [critiqueResult, constitutionResult, fluencyResult] = await Promise.all([
            // 기존 비평
            model.generateContent(fullPrompt).then(r => {
                const text = r.response.text();
                const jsonString = text.replace(/```json|```/g, "").trim();
                return JSON.parse(jsonString);
            }).catch(() => ({ score: 0, approved: false, issues: ["Critic parse failed"], feedback: "" })),

            // Constitutional AI: 헌법 규칙 검사
            contextCheck.skipConstitution
                ? Promise.resolve<ConstitutionCheckResult>({ passed: true, violations: [], feedback: '' })
                : checkConstitution(storyBody, NARRATIVE_CONSTITUTION, process.env.GEMINI_API_KEY!),

            // Fluency Scoring
            contextCheck.skipFluency
                ? Promise.resolve<FluencyResult>({ score: 75, issues: [], approved: true })
                : scoreFluency(storyBody, process.env.GEMINI_API_KEY!),
        ]);

        // Constitutional 위반이 있으면 점수 페널티
        const constitutionPenalty = constitutionResult.violations
            .filter(v => v.severity === 'CRITICAL').length * 15
            + constitutionResult.violations.filter(v => v.severity === 'WARN').length * 5;

        const finalScore = Math.max(0, (critiqueResult.score || 50) - constitutionPenalty);
        const allIssues = [
            ...(critiqueResult.issues || []),
            ...constitutionResult.violations.map(v => `[${v.severity}] ${v.rule}: ${v.detail}`),
            ...fluencyResult.issues.map(i => `[FLUENCY] ${i}`),
        ];

        console.log(`>>> [StoryCritic] Score: ${finalScore} (Constitution penalty: -${constitutionPenalty}, Fluency: ${fluencyResult.score})`);

        return {
            score: finalScore,
            approved: finalScore >= 75 && constitutionResult.passed,
            issues: allIssues,
            feedback: [critiqueResult.feedback, constitutionResult.feedback].filter(Boolean).join('\n\n'),
            constitutionCheck: constitutionResult,
            fluencyResult,
        };
    },

    // ─── 2. Adversarial Debate: 비평 ↔ 옹호 → 최종 판정 ────────────────────

    /**
     * adversarialDebate
     * 1단계: Critic이 텍스트의 문제점을 공격적으로 나열
     * 2단계: Advocate가 텍스트의 강점으로 반론
     * 3단계: Arbiter가 양측 주장을 종합하여 최종 판정
     *
     * 단순 일방향 비평보다 균형 잡힌 평가를 생성합니다.
     */
    async adversarialDebate(
        storyBody: string,
        contextHint: string = ''
    ): Promise<DebateResult> {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        // Step 1: Critic (공격자) — 텍스트의 약점 집중 나열
        const criticPrompt = `
Role: HARSH LITERARY CRITIC
Mission: Find every weakness, cliché, inconsistency, and narrative flaw in this text.
Be rigorous. Do not praise. Only attack.

${contextHint ? `[CONTEXT]\n${contextHint}\n` : ''}
[TEXT]
${storyBody.substring(0, 4000)}

Return ONLY JSON:
{
  "score": 45,
  "issues": ["Issue 1", "Issue 2", ...],
  "feedback": "Aggressive correction instructions in Korean"
}`;

        // Step 2: Advocate (옹호자) — 텍스트의 강점 방어
        const criticResult = await model.generateContent(criticPrompt);
        const criticRaw = JSON.parse(criticResult.response.text().replace(/```json|```/g, '').trim());

        const advocatePrompt = `
Role: PASSIONATE STORY ADVOCATE
Mission: Defend the following text against these criticisms.
Find genuine strengths, successful techniques, and moments of effective storytelling.

[TEXT]
${storyBody.substring(0, 4000)}

[CRITICISMS TO REBUT]
${(criticRaw.issues || []).join('\n')}

Return ONLY a JSON string with your defense:
{
  "advocateFeedback": "Defense argument in Korean, pointing out strengths",
  "scoreAdjustment": 20
}`;

        const advocateResult = await model.generateContent(advocatePrompt);
        const advocateRaw = JSON.parse(advocateResult.response.text().replace(/```json|```/g, '').trim());

        // Step 3: Arbiter (판정자) — 양측 종합
        const arbitratorPrompt = `
Role: IMPARTIAL SENIOR EDITOR
Mission: Given the Critic's attack and the Advocate's defense, make a final balanced judgment.

[CRITIC SCORE]: ${criticRaw.score}
[CRITIC ISSUES]: ${(criticRaw.issues || []).slice(0, 5).join('; ')}
[ADVOCATE DEFENSE]: ${advocateRaw.advocateFeedback}

Return ONLY JSON:
{
  "finalScore": 72,
  "finalApproved": true,
  "verdict": "Final balanced assessment in Korean (3-4 sentences)"
}
finalApproved is true if finalScore >= 70.`;

        const arbitratorResult = await model.generateContent(arbitratorPrompt);
        const arbitratorRaw = JSON.parse(arbitratorResult.response.text().replace(/```json|```/g, '').trim());

        console.log(`>>> [Adversarial Debate] Critic: ${criticRaw.score} | Final: ${arbitratorRaw.finalScore} | Approved: ${arbitratorRaw.finalApproved}`);

        return {
            finalApproved: arbitratorRaw.finalApproved ?? false,
            finalScore: arbitratorRaw.finalScore ?? 0,
            criticArgument: {
                score: criticRaw.score ?? 0,
                approved: false,
                issues: criticRaw.issues ?? [],
                feedback: criticRaw.feedback ?? '',
            },
            advocateFeedback: advocateRaw.advocateFeedback ?? '',
            verdict: arbitratorRaw.verdict ?? '',
        };
    },
};
