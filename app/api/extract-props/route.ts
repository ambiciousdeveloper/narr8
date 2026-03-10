import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from '@/lib/constants';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
    try {
        const { projectId, existingPropNames } = await req.json();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Fetch Project Config & Context (Inventory)
        const { data: project, error: pError } = await supabase
            .from('project_master_config')
            .select('world_city_kr')
            .eq('project_id', projectId)
            .single();

        if (pError || !project) {
            return NextResponse.json({ error: "유효하지 않은 프로젝트 ID입니다." }, { status: 404 });
        }

        const { data: summaries } = await supabase
            .from('story_summary')
            .select('context_state')
            .eq('project_id', projectId)
            .not('context_state', 'is', null);

        const allInventories: string[] = [];
        summaries?.forEach(s => {
            if (s.context_state?.character_states) {
                Object.values(s.context_state.character_states).forEach((state: any) => {
                    if (state.inventory) allInventories.push(...state.inventory);
                });
            }
        });
        const uniqueInventoryItems = [...new Set(allInventories)];

        // 2. Fetch Novel & Script
        const { data: scenes } = await supabase
            .from('episodes')
            .select('prose_kr, script_kr')
            .eq('project_id', projectId)
            .order('id', { ascending: true });

        const fullProse = scenes?.map(s => s.prose_kr).filter(Boolean).join('\n\n') || "";
        const fullScript = scenes?.map(s => s.script_kr).filter(Boolean).join('\n\n') || "";

        // 3. AI Extraction Prompt
        const prompt = `
            당신은 영화 제작의 소품 감독(Prop Master)입니다. 다음 데이터를 분석하여 스토리상 중요한 '핵심 소품(Key Prop)' 리스트를 추출하세요.

            [지역적 배경]
            도시: ${project?.world_city_kr || '설정 미입력'}

            [데이터 원천]
            1. **캐릭터 인벤토리**: [${uniqueInventoryItems.join(', ')}]
            2. **대본(Script)**: 인물이 손에 쥐거나 조작하는 물건
            3. **소설(Novel)**: 시각적으로 상세히 묘사되거나 상징성이 부여된 물건

            [중요도 판별 기준]
            - **동사 결합도**: 인물이 쥐다, 쓰다, 부수다 등 직접적으로 상호작용하는가?
            - **상태 변화**: 빛나거나, 작동하거나, 망가지는 등 묘사가 구체적인가?
            - **이미 등록된 소품**: [${existingPropNames?.join(', ') || '없음'}] (중복 제외)

            [결과 형식]
            반드시 다음과 같은 JSON 리스트 형식으로만 답변하세요.
            [
              {
                "name_kr": "소품 이름 (예: 낡은 해킹 덱)",
                "name_en": "Prop Name in English",
                "description_kr": "소설 속 묘사를 요약한 시각적 분위기 (2~3문장)",
                "description_en": "Cinematic visual description for AI generation",
                "visual_traits_kr": "핵심 특징 (예: 푸른 빛, 금속 재질, 긁힌 자국)",
                "visual_traits_en": "Core traits (comma separated)",
                "importance": "High/Medium"
              }
            ]

            [대본]
            ${fullScript.substring(0, 5000)}

            [소설]
            ${fullProse.substring(0, 8000)}
        `;

        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        const props = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        return NextResponse.json({ success: true, props });

    } catch (err: any) {
        console.error(">>> [Prop Extraction Error]", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
