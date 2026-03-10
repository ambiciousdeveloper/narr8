import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ENHANCED_L2_EXPANSION_SOP = `
[L2 구조적 수평 확장 지침 - 한글 버전]
- **목표**: L1 내용을 챕터별로 확장하여, 10분 에피소드들이 탄생할 수 있는 풍성한 기초(L2)를 구축합니다.

[STRICT RULE: PROLOGUE FIRST]
- 모든 이야기는 반드시 **"Episode 0: Prologue (프롤로그)"**로 시작해야 합니다.
- 프롤로그의 \`order_index\`는 **0**으로 설정하며, \`unit_type\`은 **"PROLOGUE"**로 명시합니다.

[CRITICAL: PROLOGUE CONTENT STRUCTURE]
프롤로그는 다음 3단계 구조를 **반드시** 포함해야 합니다:

**1단계: Normal World (세계관 초기 상태)**
- 시공간 배경 제시 (연도, 장소, 사회 시스템)
- 주인공의 일상적 삶 묘사
- 예시: "2077년 5월, 대한민국 서울. 거대 기업이 지배하는 디스토피아 사회에서 고아로 자란 견우는..."

**2단계: Character Introduction (주인공 소개)**
- 주인공의 핵심 특성 2-3가지
- 현재 상황 및 감정 상태
- 예시: "18세가 된 견우는 뛰어난 해킹 재능을 가졌지만, 억압적인 시스템 속에서 무력감을 느끼고 있었다."

**3단계: Inciting Incident Foreshadowing (사건의 불씨 암시)**
- 평온을 깨뜨릴 사건의 징조
- 주인공에게 다가올 변화의 신호
- 예시: "그날 밤, 견우의 단말기에 정체불명의 메시지가 도착했다. '진실을 알고 싶다면...'"

[프롤로그 필수 요소 체크리스트]
✓ 시공간 배경이 명확히 제시되었는가?
✓ 주인공의 일상(Normal World)이 구체적으로 묘사되었는가?
✓ 주인공의 핵심 특성이 2가지 이상 드러났는가?
✓ Inciting Incident의 징조가 암시되었는가?
✓ 300자 이상의 충분한 분량인가?

[핵심 전술]
1. **마이크로 시닝 (4비트 구조)**: 모든 주요 사건을 [감각 설정 - 행동/대사 - 심리 묘사 - 여파]의 4단계로 확장하십시오.
2. **1:10 법칙**: 사건의 1초를 10문장의 묘사로 늘리십시오. 호흡을 늦추어 독자가 현장감을 느끼게 하는 것이 목적입니다.
3. **브릿지 장면 삽입**: 주요 Plot Point 사이에 이동, 대기, 준비, 식사 등 인물의 인간적 면모와 긴장감을 빌드업하는 '연결 장면'을 필수 창작하십시오.
4. **감정의 증폭**: 단편적 감정(슬펐다)을 생생한 반응(심장이 조여오고 숨이 가빠졌다)으로 상세화하십시오.

[출력 요구]
- 해당 챕터(L2)에 대해 최소 5~7개의 구체적인 Scene Beat를 생성하십시오.
`;

async function updateL2ExpansionSOP() {
    console.log('\n=== Updating L2_EXPANSION SOP with Enhanced Prologue Rules ===\n');

    const { error } = await supabase
        .from('agent_sop_registry')
        .update({
            instruction: ENHANCED_L2_EXPANSION_SOP,
            version: 'v1.1-prologue-enhanced',
            last_updated: new Date().toISOString()
        })
        .eq('sop_type', 'L2_EXPANSION')
        .eq('is_active', true);

    if (error) {
        console.error('❌ Error:', error);
    } else {
        console.log('✅ L2_EXPANSION SOP updated to v1.1-prologue-enhanced');
        console.log('   Added 3-stage prologue structure requirements');
        console.log('   Added prologue content checklist');
    }

    console.log('\n==================\n');
}

updateL2ExpansionSOP();
