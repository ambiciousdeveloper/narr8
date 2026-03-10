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

// [Restore + Merge]: This restores the user's original detailed word count policy
// and merges the new Zero-Hardcoding SECTION_LIMIT variables.
const restoredInstruction = `
# Volume Control Policy (분량 제어 정책)

## 핵심 규칙
**모든 소설 및 대본 생성 작업은 반드시 'project_master_config.target_minutes' 값을 기준으로 분량을 산출해야 합니다.**
- **기준 밀도(Density)**: 
  - 소설(NOVEL): 1,200자/분 (영문 기준)
  - 대본(SCRIPT): 400자/분 (영문 기준)
- **분할 기본 한계 (제로-하드코딩 연동)**:
  - 분할 기본 한계: \`SECTION_LIMIT = 3000\`
  - 한국어 전용 분할 한계: \`SECTION_LIMIT_KO = 700\`
  - 영어 전용 분할 한계: \`SECTION_LIMIT_EN = 3000\`

## 언어별 분량 이원화 (Multi-Language Adaptation) ⭐
영문과 국문의 독서/낭독 속도 차이를 반영하기 위해 다음 가중치를 적용합니다.
- **국문(KO) 가중치**:
  - 소설: **0.42** (약 500자/분 수준)
  - 대본: **0.50** (약 200자/분 수준)
- **공식**: \`최종 목표 글자수 = target_minutes × 기준 밀도 × 언어 가중치\`

## 오차 허용 범위
- **±10%** 이내의 자연스러운 오차는 허용됩니다.
- 예 (국문 10분 소설): 10 × 1,200 × 0.42 = **5,040자** (허용 범위: 4,536 ~ 5,544자)

## 적용 범위
- ✅ 모든 프롤로그, 에피소드, 챕터 생성 (Create Mode)
- ✅ L1 -> L2, L2 -> L3 각색 작업 (Adapt Mode)
- ❌ 단순 번역 (Translate Mode): 원문의 리듬과 길이를 최대한 유지

## 변경 이력
- 2026-03-07: (v6.3) 제로 하드코딩 지원을 위한 언어별 분할 한계(SECTION_LIMIT_KO) 중앙화
- 2026-02-17: (v6.2) 언어별 분량 이원화 가중치(Ratio) 정책 추가
- 2026-02-17: (v6.1) 정책 최초 도입 (DB 중앙화 및 밀도 기준 수립)

## 구현 참조
- **DB 설정**: \`system_config\` (NOVEL_DENSITY, NOVEL_DENSITY_KO_RATIO 등)
- **에이전트**: \`agents/chamber-2-4-scribe.ts\` - CreativeScribe.synthesize, \`agents/chamber-2-4-novel.ts\`
`;

async function main() {
    console.log('\\n🚀 Restoring Merged VOLUME_CONTROL_POLICY...\\n');

    const { error } = await supabase
        .from('agent_sop_registry')
        .update({ instruction: restoredInstruction })
        .eq('sop_type', 'VOLUME_CONTROL_POLICY');

    if (error) {
        console.error('❌ Failed to update SOP:', error.message);
    } else {
        console.log('✅ Successfully restored VOLUME_CONTROL_POLICY with user original multi-language limits and new chunk limits.');
    }
}

main().catch(console.error);
