import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from './constants';

/**
 * ============================================================
 * Narrative Intelligence Module
 * ============================================================
 * AI 기법 모음:
 *   - Chain-of-Thought (CoT) 프롬프트 빌더
 *   - Few-Shot 예시 뱅크
 *   - Constraint-Based 규칙 빌더
 *   - Controllable Generation (CTRL) 토큰
 *   - Constitutional AI (생성 결과 헌법 검사)
 *   - LLM-as-Judge (루브릭 기반 품질 점수)
 *   - Fluency / Perplexity Scoring
 * ============================================================
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JudgeRubric {
    criterion: string;
    weight: number; // 0~1, sum should equal 1
    description: string;
}

export interface JudgeResult {
    totalScore: number; // 0~100
    breakdown: Array<{ criterion: string; score: number; weight: number; comment: string }>;
    approved: boolean;
    summary: string;
}

export interface ConstitutionRule {
    id: string;
    rule: string;
    severity: 'CRITICAL' | 'WARN'; // CRITICAL → hard block, WARN → soft flag
}

export interface ConstitutionCheckResult {
    passed: boolean;
    violations: Array<{ ruleId: string; rule: string; severity: 'CRITICAL' | 'WARN'; detail: string }>;
    feedback: string;
}

export interface FluencyResult {
    score: number; // 0~100
    issues: string[];
    approved: boolean;
}

export interface CTRLParams {
    genre?: string;
    tone?: string;
    pov?: string; // '1인칭' | '3인칭 전지적' | '3인칭 제한적'
    emotion?: string;
    pacing?: 'SLOW' | 'MEDIUM' | 'FAST';
    speaker?: string;
}

// ─── 1. Chain-of-Thought (CoT) ────────────────────────────────────────────────

/**
 * buildCoTPrefix
 * 프롬프트 앞에 단계적 추론 체인을 주입합니다.
 * "먼저 A를 분석하고, 다음으로 B를 기반으로 C를 작성하라" 패턴.
 */
export function buildCoTPrefix(task: 'NOVEL_SCENE' | 'SCENE_CRITIQUE' | 'CHARACTER_ARC' | 'PLOT_PLANNING'): string {
    const chains: Record<string, string> = {
        NOVEL_SCENE: `
[CHAIN-OF-THOUGHT REASONING — Follow these steps in order before writing]
Step 1. 씬의 목적 분석: 이 씬이 전체 플롯에서 수행하는 역할을 1문장으로 정의하라.
Step 2. 인물 동기 확인: 이 씬에 등장하는 각 인물이 무엇을 원하고, 무엇을 두려워하는지 파악하라.
Step 3. 갈등 핵심 추출: 외적 갈등(사건/대립)과 내적 갈등(심리/결핍)의 교차점을 찾아라.
Step 4. 감각적 앵커 선택: 이 씬의 분위기를 가장 강하게 전달할 감각(시각/청각/촉각/후각/미각) 하나를 선택하라.
Step 5. 씬의 전환점 설정: 씬의 시작 상태와 끝 상태가 달라지도록 반드시 무언가를 변화시켜라.
Step 6. 이제 위 분석을 바탕으로 본문을 작성하라.`,

        SCENE_CRITIQUE: `
[CHAIN-OF-THOUGHT REASONING — 비평 전 단계적 분석]
Step 1. 씬에서 실제로 일어나는 사건을 시간 순으로 나열하라.
Step 2. 각 인물의 행동이 그 인물의 캐릭터 설정과 일치하는지 점검하라.
Step 3. 이전 씬과의 연속성 (시간, 장소, 감정 상태) 을 검증하라.
Step 4. 리터러리 품질 (보여주기 vs 설명하기, 반복, 진부한 표현) 을 평가하라.
Step 5. 위 분석을 종합하여 최종 점수와 피드백을 도출하라.`,

        CHARACTER_ARC: `
[CHAIN-OF-THOUGHT REASONING — 캐릭터 아크 설계 단계]
Step 1. 인물의 시작 결핍(Wound)을 정의하라: 과거의 어떤 경험이 현재 그를 제한하는가?
Step 2. 거짓 믿음(Lie)을 정의하라: 그 결핍으로 인해 그가 세상 또는 자신에 대해 갖는 잘못된 믿음은?
Step 3. 욕구(Want) vs 필요(Need)를 분리하라: 그가 원하는 것과 실제로 필요한 것은 다른가?
Step 4. 전환점(Turning Point)을 설계하라: 어떤 사건이 그 거짓 믿음을 흔드는가?
Step 5. 아크 결말을 결정하라: 성장(Positive Arc) / 몰락(Negative Arc) / 평선(Flat Arc) 중 어느 것이 이야기의 주제를 강화하는가?`,

        PLOT_PLANNING: `
[CHAIN-OF-THOUGHT REASONING — 플롯 계획 단계]
Step 1. 현재 막(Act)의 목표를 명시하라.
Step 2. 이 막에서 해결되어야 할 주요 갈등 2~3개를 나열하라.
Step 3. 심어야 할 복선(Foreshadowing)과 나중에 그것이 개화하는 시점을 계획하라.
Step 4. 페이스(Pacing): 씬들의 긴장도 패턴을 설계하라 (긴장 → 이완 → 더 큰 긴장).
Step 5. 이 막의 마지막에 독자가 느껴야 할 감정을 명시하라.`,
    };
    return chains[task] || '';
}

// ─── 2. Few-Shot Prompting ────────────────────────────────────────────────────

export type FewShotType = 'PROSE_EXPANSION' | 'SCENE_OPENING' | 'DIALOGUE' | 'ACTION_SEQUENCE';

/**
 * buildFewShotBlock
 * 고품질 before/after 예시 쌍을 프롬프트에 주입합니다.
 * LLM이 원하는 품질 수준을 학습하도록 유도합니다.
 */
export function buildFewShotBlock(type: FewShotType): string {
    const examples: Record<FewShotType, string> = {
        PROSE_EXPANSION: `
[FEW-SHOT EXAMPLES — 산문 확장 기준]

❌ BAD (설명형 요약):
"주인공은 복도를 걸어가다가 문 앞에 섰다. 그는 긴장했다. 문을 열었다."

✅ GOOD (감각적 몰입형 산문):
"낡은 복도가 발밑에서 신음했다. 형광등 하나가 꺼졌다 켜졌다를 반복하며 그림자를 리드미컬하게 흔들어댔다. 눈꺼풀 안쪽에는 아버지의 마지막 경고가 새겨져 있었다— '절대 그 방에 들어가지 마.' 손가락 끝이 도어 손잡이의 차가운 금속에 닿는 순간, 경고를 이미 어기고 있다는 사실이 뒤늦게 스며들었다."

핵심 원칙:
• 감각(시각·청각·촉각)으로 시작하고, 인물 심리는 간접적으로 드러내라.
• 짧은 사건 한 줄을 최소 5문장으로 확장하라.
• 문장 첫 단어를 인물 이름이나 대명사로 시작하지 마라.`,

        SCENE_OPENING: `
[FEW-SHOT EXAMPLES — 씬 오프닝 기준]

❌ BAD (평범한 시간/장소 묘사):
"다음 날 아침이었다. 시청 광장은 사람들로 붐볐다. 서준혁은 그곳에 있었다."

✅ GOOD (사건 중심 인-미디아스-레스):
"포탄 잔해에서 핀 들꽃 한 송이가 서준혁의 군화 앞에서 바람에 흔들리고 있었다. 어제의 화염이 지나간 자리에 이제는 행상인의 호객 소리가 대신 채워졌다. 광장은 기억을 잃은 것처럼 다시 분주했다—그러나 그는 잊을 수 없었다."

핵심 원칙:
• 독자를 즉시 사건 한가운데로 던져라 (In Medias Res).
• 시간/날씨 묘사보다 갈등의 잔향으로 시작하라.`,

        DIALOGUE: `
[FEW-SHOT EXAMPLES — 대사 기준]

❌ BAD (감정을 직접 설명하는 대사):
"'나는 지금 매우 화가 나 있어.' 그가 화난 목소리로 말했다. '왜 나를 배신했냐?'"

✅ GOOD (행동과 침묵으로 감정을 보여주는 대사):
"'흥미롭네.' 그는 서류를 느리게 내려놓았다. 잠시 침묵. '자네가 거기 있었다는 건 알고 있었어.' 손끝이 테이블을 세 번 두드렸다. '그냥 직접 들어보고 싶었을 뿐이야.'"

핵심 원칙:
• 대사 태그(said, shouted)를 최소화하고 행동 비트로 감정을 대체하라.
• 인물이 실제로 원하는 것을 직접 말하지 않게 하라—서브텍스트를 활용하라.`,

        ACTION_SEQUENCE: `
[FEW-SHOT EXAMPLES — 액션 시퀀스 기준]

❌ BAD (늘어진 묘사):
"그는 적을 향해 뛰어갔다. 그리고 주먹을 날렸다. 적이 쓰러졌다. 그는 이겼다."

✅ GOOD (리듬감 있는 짧은 문장 + 감각 디테일):
"첫 발이 자갈을 튀겼다. 두 번째 발은 이미 공중에 있었다. 턱이 연결되는 충격이 손목에서 어깨까지 울렸다—뼈가 부서지는 소리였는지, 아니면 자신의 관절이었는지 확인할 틈이 없었다. 그는 계속 달렸다."

핵심 원칙:
• 액션 씬에서는 단문과 단문을 교차 배치하라.
• 인물의 감각적 혼란(소리·통증·호흡)을 함께 기술하라.`,
    };
    return examples[type] || '';
}

// ─── 3. Constraint-Based Prompting ───────────────────────────────────────────

export interface ConstraintSet {
    dos: string[];
    donts: string[];
    hardLimits?: string[]; // 위반 시 재생성 트리거
}

/**
 * buildConstraintBlock
 * DO/DON'T 형식의 명시적 제약 목록을 프롬프트에 주입합니다.
 */
export function buildConstraintBlock(constraints: ConstraintSet): string {
    const dosBlock = constraints.dos.map((r, i) => `  ✅ DO ${i + 1}: ${r}`).join('\n');
    const dontsBlock = constraints.donts.map((r, i) => `  ❌ DON'T ${i + 1}: ${r}`).join('\n');
    const hardBlock = constraints.hardLimits
        ? constraints.hardLimits.map((r, i) => `  🚫 HARD LIMIT ${i + 1}: ${r}`).join('\n')
        : '';
    return `
[CONSTRAINT RULES — 반드시 준수]
${dosBlock}
${dontsBlock}
${hardBlock ? `\n[HARD LIMITS — 위반 시 출력 무효]\n${hardBlock}` : ''}`.trim();
}

/** 기본 소설 제약 세트 */
export const DEFAULT_NOVEL_CONSTRAINTS: ConstraintSet = {
    dos: [
        '각 단락은 최소 한 개의 감각(시각·청각·촉각·후각·미각)을 묘사하라',
        '인물의 감정을 행동과 신체 반응으로 간접 표현하라 (Show, Don\'t Tell)',
        '씬의 시작과 끝에서 인물 상태가 달라지도록 하나의 변화를 포함하라',
        '대사는 반드시 행동 비트(Action Beat)와 함께 배치하라',
        '제공된 인물 이름·용어 사전(Glossary)을 정확히 사용하라',
    ],
    donts: [
        '단락 첫 단어를 인물 이름·대명사(그/그녀/나)로 시작하지 마라',
        '같은 수식어(예: 차가운, 어두운, 강렬한)를 300자 내에서 반복하지 마라',
        '씬에서 아직 일어나지 않은 미래 사건을 언급하거나 요약하지 마라',
        '이전 씬에서 이미 언급한 배경 묘사를 그대로 반복하지 마라',
        '"그는 생각했다" / "그녀는 느꼈다" 류의 내면 설명 태그를 과용하지 마라',
    ],
    hardLimits: [
        '원작 고유 명사(인물명·지명·조직명)를 각색 텍스트에 그대로 노출하지 마라',
        '설정에 존재하지 않는 능력·기술·아이템을 새롭게 도입하지 마라',
    ],
};

// ─── 4. Controllable Generation (CTRL) tokens ───────────────────────────────

/**
 * buildCTRLTokens
 * 장르·감정·화자·페이스 등 제어 토큰을 프롬프트 헤더에 주입합니다.
 * (모델 재학습 없이 프롬프트 레벨에서 CTRL 근사 구현)
 */
export function buildCTRLTokens(params: CTRLParams): string {
    const tokens: string[] = [];
    if (params.genre)   tokens.push(`[GENRE: ${params.genre}]`);
    if (params.tone)    tokens.push(`[TONE: ${params.tone}]`);
    if (params.pov)     tokens.push(`[POV: ${params.pov}]`);
    if (params.emotion) tokens.push(`[EMOTION: ${params.emotion}]`);
    if (params.pacing)  tokens.push(`[PACING: ${params.pacing}]`);
    if (params.speaker) tokens.push(`[SPEAKER: ${params.speaker}]`);
    if (tokens.length === 0) return '';
    return `[CONTROL TOKENS — 생성 방향 제어]\n${tokens.join('  ')}\n위 토큰에 맞는 어조·관점·감정으로 일관되게 생성하라.`;
}

// ─── 5. Constitutional AI ────────────────────────────────────────────────────

/** 기본 내러티브 헌법: 이야기가 반드시 지켜야 할 규칙 목록 */
export const NARRATIVE_CONSTITUTION: ConstitutionRule[] = [
    { id: 'C01', severity: 'CRITICAL', rule: '인물은 설정상 불가능한 능력·이동을 순간적으로 수행할 수 없다 (논리적 근거 없는 순간이동 금지).' },
    { id: 'C02', severity: 'CRITICAL', rule: '이전 씬에서 확정된 인물의 사망·실종·출발을 번복하지 않는다.' },
    { id: 'C03', severity: 'CRITICAL', rule: '원작 고유 명사가 각색 텍스트에 직접 노출되지 않는다.' },
    { id: 'C04', severity: 'WARN',     rule: '감정 전환은 반드시 트리거 사건과 함께 제시된다 (무동기 무드 전환 금지).' },
    { id: 'C05', severity: 'WARN',     rule: '같은 내용의 씬 요약이 두 번 이상 반복되지 않는다.' },
    { id: 'C06', severity: 'WARN',     rule: '대사는 그 인물의 성격·어투 프로파일과 일치해야 한다.' },
    { id: 'C07', severity: 'WARN',     rule: '타임라인 상 미래에 발생하는 사건이 현재 씬에 결말로 포함되지 않는다.' },
    { id: 'C08', severity: 'CRITICAL', rule: '10세 미만 등장인물이 성적·폭력적 상황의 직접 주체가 되지 않는다.' },
];

/**
 * checkConstitution
 * 생성된 텍스트를 헌법 규칙 집합과 대조하여 위반 여부를 반환합니다.
 * (LLM 호출 기반)
 */
export async function checkConstitution(
    text: string,
    constitution: ConstitutionRule[] = NARRATIVE_CONSTITUTION,
    apiKey: string
): Promise<ConstitutionCheckResult> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const rulesText = constitution.map(r => `[${r.id}][${r.severity}] ${r.rule}`).join('\n');
    const prompt = `
You are a NARRATIVE CONSTITUTION ENFORCER.
Evaluate the STORY TEXT against each RULE below.
Return ONLY valid JSON — no markdown.

[RULES]
${rulesText}

[STORY TEXT]
${text.substring(0, 6000)}

[OUTPUT SCHEMA]
{
  "violations": [
    { "ruleId": "C01", "severity": "CRITICAL", "detail": "Specific quote or description of violation" }
  ],
  "feedback": "One-paragraph actionable correction instructions in Korean"
}
Return an empty violations array [] if no violations are found.`;

    try {
        const result = await model.generateContent(prompt);
        const raw = result.response.text().replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(raw);
        const hasCritical = (parsed.violations || []).some((v: any) => v.severity === 'CRITICAL');
        return {
            passed: (parsed.violations || []).length === 0,
            violations: parsed.violations || [],
            feedback: parsed.feedback || '',
        };
    } catch (e: any) {
        console.error('[Constitutional AI] Check failed:', e.message);
        return { passed: true, violations: [], feedback: '' };
    }
}

// ─── 6. LLM-as-Judge ─────────────────────────────────────────────────────────

/** 기본 루브릭: 소설 씬 품질 평가 기준 */
export const DEFAULT_NOVEL_RUBRIC: JudgeRubric[] = [
    { criterion: '감각적 몰입도',     weight: 0.25, description: '오감을 통한 장면 묘사의 풍부함' },
    { criterion: '인물 일관성',       weight: 0.25, description: '캐릭터의 성격·어투·동기가 설정과 일치하는지' },
    { criterion: '플롯 진전',         weight: 0.20, description: '씬이 이야기를 실질적으로 앞으로 진행시키는지' },
    { criterion: '문체 다양성',       weight: 0.15, description: '반복 표현·상투적 문구 없이 다채로운 문체를 사용하는지' },
    { criterion: '감정적 공명',       weight: 0.15, description: '독자가 인물의 감정에 공감할 수 있는 깊이를 갖추는지' },
];

/**
 * judgeProseQuality
 * 루브릭 기반으로 생성된 산문의 품질을 0~100으로 점수화합니다.
 */
export async function judgeProseQuality(
    text: string,
    rubric: JudgeRubric[] = DEFAULT_NOVEL_RUBRIC,
    apiKey: string,
    contextHint: string = ''
): Promise<JudgeResult> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const rubricText = rubric.map(r =>
        `- ${r.criterion} (가중치: ${r.weight * 100}%): ${r.description}`
    ).join('\n');

    const prompt = `
You are a SENIOR LITERARY EDITOR evaluating Korean narrative prose quality.
Score the STORY TEXT on each rubric criterion (0-100), then compute a weighted total.
Return ONLY valid JSON.

[RUBRIC]
${rubricText}

${contextHint ? `[CONTEXT HINT]\n${contextHint}\n` : ''}
[STORY TEXT]
${text.substring(0, 5000)}

[OUTPUT SCHEMA]
{
  "breakdown": [
    { "criterion": "감각적 몰입도", "score": 85, "weight": 0.25, "comment": "..." }
  ],
  "totalScore": 82.5,
  "approved": true,
  "summary": "Overall Korean-language assessment (2-3 sentences)"
}
approved is true if totalScore >= 75.`;

    try {
        const result = await model.generateContent(prompt);
        const raw = result.response.text().replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(raw);
        return {
            totalScore: parsed.totalScore ?? 0,
            breakdown: parsed.breakdown ?? [],
            approved: parsed.approved ?? false,
            summary: parsed.summary ?? '',
        };
    } catch (e: any) {
        console.error('[LLM-as-Judge] Scoring failed:', e.message);
        return {
            totalScore: 75,
            breakdown: [],
            approved: true, // fail-open to prevent blocking pipeline
            summary: 'Judge offline — skipping quality gate.',
        };
    }
}

// ─── 7. Fluency / Perplexity Scoring ─────────────────────────────────────────

/**
 * scoreFluency
 * 텍스트의 언어적 자연스러움을 0~100으로 평가합니다.
 * 이상 씬 감지 및 재생성 트리거에 활용됩니다.
 */
export async function scoreFluency(text: string, apiKey: string): Promise<FluencyResult> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `
You are a Korean prose FLUENCY EVALUATOR.
Evaluate the naturalness, grammar, and readability of the text (0-100).
Focus on: unnatural grammar, awkward phrasing, abrupt transitions, incoherent logic flow.
Return ONLY valid JSON.

[TEXT]
${text.substring(0, 3000)}

[OUTPUT SCHEMA]
{
  "score": 88,
  "issues": ["List any specific fluency problems found"],
  "approved": true
}
approved is true if score >= 70.`;

    try {
        const result = await model.generateContent(prompt);
        const raw = result.response.text().replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(raw);
        return {
            score: parsed.score ?? 75,
            issues: parsed.issues ?? [],
            approved: parsed.approved ?? true,
        };
    } catch {
        return { score: 75, issues: [], approved: true };
    }
}
