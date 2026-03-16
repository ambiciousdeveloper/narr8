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
슬러그라인(S# N. INT/EXT. 장소 - 시간대) 이후의 ACTION LINE은
카메라에 실제로 찍히는 것만 기술합니다.
아래 금지 항목은 모든 ACTION LINE 문장에 절대 적용됩니다.

[ACTION LINE 금지 항목]

1. 문학적 비유·은유
   ✗ "알고리즘의 미로 속에서 길을 찾아 나선다"
   ✗ "정보의 홍수 속에서 점점 지쳐간다"
   ✗ "파장이 카이의 온몸을 휘감는다"
   ✗ "진실의 칼날이 번뜩인다"
   ✓ "손가락이 키보드를 빠르게 두드린다. 모니터에 코드가 쏟아진다."

2. 신체 내부 반응·내면 심리
   ✗ "심장이 쿵, 쿵, 빠르게 뛴다"
   ✗ "손가락 끝이 저릿해진다"
   ✗ "등줄기를 타고 흐르는 식은땀"
   ✗ "복수심을 불태운다"
   ✗ "승리를 예감한다"
   ✓ "이마에 땀방울이 맺혔다. 주먹을 꽉 쥔다."

3. 작가 논평·평가·내러티브 예언
   ✗ "반드시 승리하여 모든 사람에게 자유를 되찾아 줄 것이다"
   ✗ "그의 집중력은 놀라울 정도다"
   ✗ "이제 진짜 싸움이 시작이야" (서술로 쓰인 경우)
   ✗ "새로운 희망이 떠오르고 있다"
   ✓ 삭제. 평가·예언은 어떤 블록에도 존재하지 않는다.

4. 비시각적 감각(후각·촉각·내부 감각) 서술
   ✗ "켜켜이 쌓인 먼지가 코를 간지럽힌다"
   ✗ "식어버린 커피만이 그의 곁을 지킨다" (의인화 서술)
   ✓ 시각으로 표현 불가한 감각은 삭제한다.

5. 중복 서술
   ✗ "손가락이 쉴 새 없이 움직인다" 직후 "손가락이 멈추지 않는다"
   ✓ 하나만 남기고 삭제.

[작성 전 자가 검증 — 모든 ACTION LINE 문장]
→ "이게 카메라 프레임에 찍히는가?"      NO  → 삭제
→ "내면·심리·평가·비유인가?"            YES → 삭제 또는 표정·행동으로 대체
→ "인물 입에서 나오는 소리인가?"        YES → 대사 블록으로 이동

[올바른 포맷 예시]

S# 1. INT. 쩌우하이의 작업실 - 밤

카이가 키보드를 빠르게 두드린다. 모니터에 코드가 쏟아진다.
이마에 땀방울이 맺혔다. 입술을 굳게 다문다.

카이
젠장, 거의 다 왔어.

전화벨이 울린다.

카이
(짜증스럽게 수화기를 집으며)
누구야, 이 밤에.`;

async function insertScriptWriterSOP() {
    console.log('>>> Deactivating existing GENE_SCRIPT_WRITER SOP entries...');
    await supabase
        .from('agent_sop_registry')
        .update({ is_active: false })
        .eq('sop_type', 'GENE_SCRIPT_WRITER');

    console.log('>>> Inserting GENE_SCRIPT_WRITER SOP v2.0...');
    const { data, error } = await supabase
        .from('agent_sop_registry')
        .insert([
            {
                sop_type: 'GENE_SCRIPT_WRITER',
                version: 'v2.0',
                instruction: instruction,
                is_active: true,
            }
        ])
        .select();

    if (error) {
        console.error('❌ INSERT 실패:', error.message);
        return;
    }

    console.log('✅ GENE_SCRIPT_WRITER SOP v2.0 등록 완료');
    console.log('   ID:', data[0].id);
    console.log('   sop_type:', data[0].sop_type);
    console.log('   version:', data[0].version);
    console.log('   is_active:', data[0].is_active);
}

insertScriptWriterSOP();
