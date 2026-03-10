import { GoogleGenerativeAI } from '@google/generative-ai';
import { AgentFactory } from './chamber-0-repository';

export interface StoryEvent {
    id: number;
    description: string;
    density: 'low' | 'medium' | 'high';
}

export interface StoryBeat {
    order_index: number;
    assigned_events: StoryEvent[];
    mission_kr: string;
    resolution_focus: string;
    camerawork: string;
    location: string;
}

export class StoryDistributor {
    private model: any;

    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        this.model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    }

    async distribute(l2Synopsis: string, sceneCount?: number): Promise<StoryBeat[]> {
        const sop = await AgentFactory.fetchSOP('DISTRIBUTOR_CORE');

        // Fallback or use fetched SOP
        // [Dynamic Allocation Logic]
        // We no longer force a fixed scene count. The AI determines it based on density.
        let prompt = sop || `
      역할: 서사 해상도 오케스트레이터 (에피소드 배분 지시자)
      
      [단계 1: 사건 추출 및 밀도 분석]
      L2 시놉시스를 분석하여 시간 순서대로 모든 이벤트를 추출하고 각각의 "서사 밀도"를 할당하십시오.
      - low: 분위기 조성, 내면 묘사 중심 -> 0.5~1개의 에피소드 할당
      - medium: 일반적인 액션 및 대화 전개
      - high: 핵심 갈등, 클라이맥스 -> 전용 에피소드 할당

      [단계 2: 동적 배분 (핵심)]
      전체 서사 밀도를 바탕으로 최적의 에피소드 개수 (3개 ~ 10개)를 결정하십시오.
      - 고정된 개수를 강제하지 마십시오.
      - 이야기가 서정적이고 감정적이라면 더 많은 에피소드(6-10개)를 사용하여 '마이크로 페이싱'을 구현하십시오.
      - 이야기가 빠르고 긴박하다면 더 적은 에피소드(3-5개)를 사용하여 긴장감을 유지하십시오.

      [L2 시놉시스]
      ${l2Synopsis}
      
      [출력 형식]
      반드시 StoryBeat 객체의 JSON 배열만 반환하십시오. 배열의 길이가 곧 에피소드 개수가 됩니다.
      [
        {
          "order_index": 1,
          "assigned_events": [{"id": 1, "description": "...", "density": "low"}],
          "mission_kr": "해당 에피소드에서 다룰 사건 요약",
          "resolution_focus": "문학적 깊이를 위한 초점 포인트",
          "camerawork": "연출 및 페이싱 지침",
          "location": "장소"
        }
      ]
    `;

        if (sop) {
            prompt = sop.replace('{{l2Synopsis}}', l2Synopsis);
        }

        try {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            const jsonStart = text.indexOf('[');
            const jsonEnd = text.lastIndexOf(']') + 1;
            return JSON.parse(text.substring(jsonStart, jsonEnd));
        } catch (err) {
            console.error(">>> Distributor Failed.", err);
            return [];
        }
    }
}
