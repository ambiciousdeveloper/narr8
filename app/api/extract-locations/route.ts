import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
    try {
        const { projectId, existingLocations } = await req.json();

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 0. Project Validation & Meta Fetch
        const { data: project, error: pError } = await supabase
            .from('project_master_config')
            .select('project_id, world_city_kr')
            .eq('project_id', projectId)
            .single();

        if (pError || !project) {
            return NextResponse.json({ error: "유효하지 않은 프로젝트 ID입니다." }, { status: 404 });
        }

        const worldContext = project.world_city_kr
            ? `This story is set in ${project.world_city_kr}.`
            : "World/City information is not defined yet.";

        // 1. Fetch Novel & Script Content (Both from episodes table)
        const { data: scenes, error: sceneError } = await supabase
            .from('episodes')
            .select('id, prose_kr, script_kr')
            .eq('project_id', projectId)
            .order('id', { ascending: true });

        if (sceneError) throw sceneError;
        if (!scenes || scenes.length === 0) {
            return NextResponse.json({ error: "분석할 실제 소설 원고(prose) 또는 대본(script)이 없습니다." }, { status: 400 });
        }

        const fullProse = scenes.filter(s => s.prose_kr).map(s => s.prose_kr).join('\n\n');
        const fullScript = scenes.filter(s => s.script_kr).map(s => s.script_kr).join('\n\n');

        // 2. AI Analysis Prompt
        const prompt = `
            당신은 시나리오 작가이자 프로듀서입니다. 다음 '대본(Script)'과 '소설 원고(Prose)'를 분석하여 마스터 배경(Master Location) 리스트를 추출하세요.

            [지역적 배경]
            ${worldContext}

            [중요: 장소 추출 전략]
            1. **대본(Script) 우선**: 대본의 'INT.' 또는 'EXT.'로 시작하는 씬 헤더를 바탕으로 실제 영상화에 필요한 장소들을 식별하세요. 
            2. **소설(Prose) 보완**: 대본에서 식별된 각 장소의 세부적인 시각적 묘사(조명, 질감, 분위기, 핵심 요소)는 소설 원고의 내용을 적극 참고하여 보완하세요.
            3. **장소만 추출**: 물리적인 공간(Space)만 추출하세요. 컴퓨터 화면, 사진 액자 같은 '사물(Object)'은 절대 로케이션으로 간주하지 마세요.

            [중점 사항]
            이미 등록된 장소 리스트: [${existingLocations?.join(', ') || '없음'}]
            위 리스트에 있는 장소와 명칭이 조금 다르더라도 '의미상 같은 장소'라고 판단되면 제안 목록에서 제외하세요. 

            [결과 형식]
            결과는 반드시 다음과 같은 JSON 리스트 형식으로만 답변하세요.

            [JSON 형식]
            [
              {
                "name_kr": "장소 이름 (예: 주인공의 오피스텔)",
                "name_en": "Place Name in English",
                "description_kr": "시각적 분위기 (소설의 묘사를 반영한 2~3문장)",
                "description_en": "Cinematic visual description in English for AI generation",
                "visual_traits_kr": "핵심 요소 (쉼표 구분)",
                "visual_traits_en": "Core visual traits in English",
                "importance": "High/Medium"
              }
            ]

            [대본 데이터]
            ${fullScript.substring(0, 8000)}

            [소설 원고 데이터]
            ${fullProse.substring(0, 8000)}
        `;

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Clean JSON response (extract from markdown if needed)
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        const locations = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        return NextResponse.json({ success: true, locations });

    } catch (err: any) {
        console.error(">>> [Location Extraction Error]", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
