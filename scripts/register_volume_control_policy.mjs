import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

const volumeControlPolicy = `
# Volume Control Policy (분량 제어 정책)

## 핵심 원칙
**모든 소설 및 대본 생성 작업은 반드시 'project_master_config.target_minutes' 값을 기준으로 분량을 산출해야 합니다.**

## 1분당 글자수 기준 (Density)

### 소설 (NOVEL)
- **1분당 1,200자** (공백 포함)
- 에이전트 설정: \`NOVEL_DENSITY = 1200\`
- 분할 기본 한계: \`SECTION_LIMIT = 3000\`
- 한국어 전용 분할 한계 (Gemini 출력 한계 고려): \`SECTION_LIMIT_KO = 700\`
- 영어 전용 분할 한계: \`SECTION_LIMIT_EN = 3000\`
- 한국어 분량 비율 보정: \`NOVEL_KO_RATIO = 0.42\`

### 대본 (SCRIPT)
- **1분당 400자** (공백 포함)
- 에이전트 설정: \`SCRIPT_DENSITY = 400\`

## 분량 산출 공식

\`\`\`
최종 목표 글자수 = (1분당 글자수) × (project_master_config.target_minutes)
\`\`\`

**예시**: 프로젝트 설정에서 target_minutes = 10인 경우
- 소설: 1,200 × 10 = 12,000자 목표
- 대본: 400 × 10 = 4,000자 목표

## 오차 허용 범위
- **±10%** 이내의 자연스러운 오차는 허용됩니다.

## 구현 위치
- **API**: \`/api/synthesize-story/route.ts\`
- **에이전트**: \`agents/chamber-2-4-scribe.ts\`
- **DB 설정**: \`agent_config_registry\` 테이블

## 변경 이력
- 2026-02-17: 정책 최초 도입 (v6.1)
  - 하드코딩 제거, DB 중앙화 완료
`;

async function main() {
    console.log('\n=== Registering Volume Control Policy to agent_sop_registry ===\n');

    const { data: existing, error: fetchError } = await supabase
        .from('agent_sop_registry')
        .select('*')
        .eq('sop_type', 'VOLUME_CONTROL_POLICY')
        .maybeSingle();

    if (fetchError) {
        console.error('❌ Error fetching SOP:', fetchError);
        return;
    }

    if (existing) {
        const { error: updateError } = await supabase
            .from('agent_sop_registry')
            .update({
                instruction: volumeControlPolicy,
                is_active: true
            })
            .eq('id', existing.id);

        if (updateError) {
            console.error('❌ Error updating SOP:', updateError);
        } else {
            console.log('✅ Volume Control Policy updated successfully!');
        }
    } else {
        const { error: insertError } = await supabase
            .from('agent_sop_registry')
            .insert({
                sop_type: 'VOLUME_CONTROL_POLICY',
                instruction: volumeControlPolicy,
                is_active: true
            });

        if (insertError) {
            console.error('❌ Error inserting SOP:', insertError);
        } else {
            console.log('✅ Volume Control Policy registered successfully!');
        }
    }

    // Verify
    const { data: verified } = await supabase
        .from('agent_sop_registry')
        .select('*')
        .eq('sop_type', 'VOLUME_CONTROL_POLICY')
        .single();

    console.log('\n📋 Verified SOP:');
    console.log('- SOP Type:', verified.sop_type);
    console.log('- Active:', verified.is_active);
    console.log('- Length:', verified.instruction.length, 'characters');
}

main().catch(console.error);

