import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from './constants';

/**
 * ============================================================
 * Context Window Manager
 * ============================================================
 * AI 기법: Sliding Window Context + Memory / Context Compression
 *
 * 장편 스토리에서 LLM 컨텍스트 한계를 극복하기 위해:
 *   1. 가장 최근 N개 씬의 전문(Full Text)을 슬라이딩 윈도우로 유지
 *   2. 그 이전 씬들은 LLM을 통해 압축 요약(Summary)으로 보존
 *   3. 프롬프트 주입 시 [요약 이력 + 최근 전문]을 반환
 *
 * 결과: 씬 수가 늘어나도 컨텍스트 크기가 폭발하지 않으며
 *       청크 경계 연속성 문제를 구조적으로 해결합니다.
 * ============================================================
 */

export interface SceneEntry {
    sceneIndex: number;
    title?: string;
    fullText: string;
    summary?: string;       // LLM 압축 요약 (생성 후 저장)
    characterIds?: string[];
    location?: string;
    timestamp?: string;
}

export class ContextWindow {
    /** 전문을 유지할 최근 씬 수 */
    private readonly fullWindowSize: number;
    /** 요약본을 유지할 최대 씬 수 (전문 윈도우 이전의 씬들) */
    private readonly summaryWindowSize: number;

    private fullScenes: SceneEntry[] = [];
    private summarizedScenes: SceneEntry[] = [];

    constructor(fullWindowSize = 3, summaryWindowSize = 10) {
        this.fullWindowSize = fullWindowSize;
        this.summaryWindowSize = summaryWindowSize;
    }

    /**
     * addScene
     * 새 씬을 윈도우에 추가합니다.
     * 윈도우가 꽉 차면 가장 오래된 씬을 압축하여 요약 풀로 이동합니다.
     */
    async addScene(entry: SceneEntry, apiKey: string): Promise<void> {
        this.fullScenes.push(entry);

        // 전문 윈도우 초과 시 → 가장 오래된 씬 압축
        while (this.fullScenes.length > this.fullWindowSize) {
            const oldest = this.fullScenes.shift()!;
            if (!oldest.summary) {
                oldest.summary = await this.compress(oldest.fullText, oldest.title, apiKey);
            }
            this.summarizedScenes.push(oldest);

            // 요약 풀도 최대 크기 초과 시 가장 오래된 요약 제거 (메모리 보호)
            if (this.summarizedScenes.length > this.summaryWindowSize) {
                this.summarizedScenes.shift();
            }
        }
    }

    /**
     * compress
     * 단일 씬 텍스트를 LLM을 통해 핵심 정보만 남겨 압축합니다.
     */
    async compress(text: string, title?: string, apiKey?: string): Promise<string> {
        if (!apiKey) return text.substring(0, 300) + '...';

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        const prompt = `
다음 씬 텍스트를 3-5문장으로 압축 요약하라.
보존 필수: 등장 인물, 핵심 사건, 씬 종료 시점의 인물 상태, 중요한 대화 내용.
제거 가능: 세부 묘사, 중복 감정 표현, 장황한 배경 묘사.
언어: 한국어.

${title ? `씬 제목: ${title}\n` : ''}씬 내용:
${text.substring(0, 4000)}

요약만 반환하라. 부가 설명 없이.`;

        try {
            const result = await model.generateContent(prompt);
            return result.response.text().trim();
        } catch {
            return text.substring(0, 300) + '...';
        }
    }

    /**
     * getContext
     * 프롬프트에 주입할 컨텍스트 문자열을 반환합니다.
     * 구조: [압축 요약 이력] + [최근 N씬 전문]
     */
    getContext(maxChars = 8000): string {
        const parts: string[] = [];

        // 1. 압축 요약 이력 (오래된 씬들)
        if (this.summarizedScenes.length > 0) {
            const summaryBlock = this.summarizedScenes.map(s =>
                `[S#${s.sceneIndex}${s.title ? ` - ${s.title}` : ''}] ${s.summary || s.fullText.substring(0, 150)}...`
            ).join('\n');
            parts.push(`[COMPRESSED PRIOR CONTEXT — 이전 씬 요약]\n${summaryBlock}`);
        }

        // 2. 최근 씬 전문 (슬라이딩 윈도우)
        if (this.fullScenes.length > 0) {
            const recentBlock = this.fullScenes.map(s =>
                `[S#${s.sceneIndex}${s.title ? ` - ${s.title}` : ''} — FULL]\n${s.fullText}`
            ).join('\n\n---\n\n');
            parts.push(`[RECENT CONTEXT — 최근 씬 전문]\n${recentBlock}`);
        }

        const combined = parts.join('\n\n');
        // 최대 문자 수 초과 시 최근 내용을 우선으로 자름
        if (combined.length <= maxChars) return combined;
        return combined.substring(combined.length - maxChars);
    }

    /**
     * getAnchorText
     * 직전 씬의 마지막 단락만 반환합니다.
     * 씬 경계 연속성 확보를 위해 다음 씬 프롬프트에 주입합니다.
     */
    getAnchorText(lines = 5): string {
        const last = this.fullScenes[this.fullScenes.length - 1];
        if (!last) return '';
        const tail = last.fullText.split('\n').filter(l => l.trim()).slice(-lines).join('\n');
        return `[SCENE ANCHOR — 직전 씬 마지막 내용]\n${tail}`;
    }

    /** 전체 씬 수 */
    get sceneCount(): number {
        return this.fullScenes.length + this.summarizedScenes.length;
    }

    /** JSON 직렬화 (DB 저장용) */
    serialize(): object {
        return {
            fullScenes: this.fullScenes,
            summarizedScenes: this.summarizedScenes,
            fullWindowSize: this.fullWindowSize,
            summaryWindowSize: this.summaryWindowSize,
        };
    }

    /** 복원 (DB 로드용) */
    static deserialize(data: any): ContextWindow {
        const cw = new ContextWindow(data.fullWindowSize ?? 3, data.summaryWindowSize ?? 10);
        cw.fullScenes = data.fullScenes ?? [];
        cw.summarizedScenes = data.summarizedScenes ?? [];
        return cw;
    }
}
