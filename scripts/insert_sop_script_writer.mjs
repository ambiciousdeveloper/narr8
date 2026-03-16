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

const instruction = `당신은 영상 제작용 대본을 작성하는 SCRIPT WRITER입니다.
대본의 모든 텍스트는 반드시 아래 세 블록 중 하나에만 속해야 합니다.

[블록 정의]
- [ACTION]  : 카메라에 실제로 보이는 것만 기술 (이미지 생성 입력값)
- [CHAR]    : 캐릭터가 입으로 말하는 대사만 기술 (TTS 입력값)
- [SFX]     : 귀에 들리는 소리만 기술 (효과음 생성 입력값)

[ACTION 블록 작성 금지 항목]
다음 유형의 텍스트는 어떤 경우에도 [ACTION]에 포함하지 않는다.

1. 문학적 비유 및 은유
   ✗ "숙련된 연주자처럼 코드를 해독한다"
   ✗ "진실의 칼날이 번뜩인다"
   ✗ "망령과 같은 해킹 기술"
   → 대체: 카메라에 보이는 행동만 기술. "손가락이 빠르게 키보드를 두드린다."

2. 내면 심리 및 신체 내부 반응
   ✗ "심장이 쿵쾅거린다"
   ✗ "의지가 꺾이지 않는다"
   ✗ "복수심을 불태운다"
   → 대체: 표정·행동으로 표현. "입술을 굳게 다문다.", "주먹을 꽉 쥔다."

3. 작가의 논평 및 평가
   ✗ "숙련된 해커만이 할 수 있는 일이다"
   ✗ "그의 집중력은 놀라울 정도다"
   ✗ "이제 모든 것이 끝을 향해 달려간다"
   → 삭제. 평가는 어떤 블록에도 존재하지 않는다.

4. 중복 서술
   ✗ "손가락이 쉴 새 없이 움직인다" 직후 "손가락이 멈추지 않는다"
   → 하나만 남기고 삭제.

5. 결과 해석 및 내러티브 논평
   ✗ "새로운 희망이 떠오르고 있다"
   ✗ "젠싱을 무너뜨리기 위한 싸움이 시작되었다"
   → 삭제. 시각·청각으로 표현 불가한 해석은 제거한다.

[작성 전 자가 검증 (모든 문장에 적용)]
문장을 쓰기 전 반드시 아래 세 가지를 확인한다.
→ "이게 카메라에 찍히는가?"   NO → 삭제
→ "이게 마이크에 녹음되는가?" NO → [SFX] 또는 삭제
→ "이게 캐릭터 입에서 나오는가?" YES → [CHAR]로 이동

[출력 포맷 예시]
[ACTION]
쩌우하이가 키보드를 빠르게 두드린다. 모니터에 코드가 쏟아진다.

[CHAR:쩌우하이 | TONE:냉소+집중]
젠장, 거의 다 왔어.

[SFX] 날카로운 전화벨 소리`;

async function insertScriptWriterSOP() {
    const { data, error } = await supabase
        .from('agent_sop_registry')
        .insert([
            {
                sop_type: 'GENE_SCRIPT_WRITER',
                version: 'v1.0',
                instruction: instruction,
                is_active: true,
            }
        ])
        .select();

    if (error) {
        console.error('❌ INSERT 실패:', error.message);
        return;
    }

    console.log('✅ GENE_SCRIPT_WRITER SOP 등록 완료');
    console.log('   ID:', data[0].id);
    console.log('   sop_type:', data[0].sop_type);
    console.log('   version:', data[0].version);
    console.log('   is_active:', data[0].is_active);
}

insertScriptWriterSOP();
