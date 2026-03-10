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

const L2_EXPANSION_SOP = `
[L2 구조적 수평 확장 지침 - 한글 버전]
- **목표**: L1 내용을 챕터별로 확장하여, 10분 에피소드들이 탄생할 수 있는 풍성한 기초(L2)를 구축합니다.

[STRICT RULE: PROLOGUE FIRST]
- 모든 이야기는 반드시 **"Episode 0: Prologue (프롤로그)"**로 시작해야 합니다.
- 프롤로그의 \`order_index\`는 **0**으로 설정하며, \`unit_type\`은 **"PROLOGUE"**로 명시합니다.
- 프롤로그는 세계관의 초기 상태(Normal World)와 첫 번째 사건의 불씨(Inciting Incident)를 다룹니다.

[핵심 전술]
1. **마이크로 시닝 (4비트 구조)**: 모든 주요 사건을 [감각 설정 - 행동/대사 - 심리 묘사 - 여파]의 4단계로 확장하십시오.
2. **1:10 법칙**: 사건의 1초를 10문장의 묘사로 늘리십시오. 호흡을 늦추어 독자가 현장감을 느끼게 하는 것이 목적입니다.
3. **브릿지 장면 삽입**: 주요 Plot Point 사이에 이동, 대기, 준비, 식사 등 인물의 인간적 면모와 긴장감을 빌드업하는 '연결 장면'을 필수 창작하십시오.
4. **감정의 증폭**: 단편적 감정(슬펐다)을 생생한 반응(심장이 조여오고 숨이 가빠졌다)으로 상세화하십시오.

[출력 요구]
- 해당 챕터(L2)에 대해 최소 5~7개의 구체적인 Scene Beat를 생성하십시오.
`;

async function registerSOP() {
    console.log('\n=== Registering L2 Expansion SOP to agent_sop_registry ===\n');

    // Check if SOP already exists
    const { data: existing } = await supabase
        .from('agent_sop_registry')
        .select('*')
        .eq('sop_type', 'L2_EXPANSION')
        .eq('version', 'v1.0');

    if (existing && existing.length > 0) {
        console.log('⚠️  L2_EXPANSION v1.0 already exists. Deactivating old version...');

        // Deactivate all old versions
        await supabase
            .from('agent_sop_registry')
            .update({ is_active: false })
            .eq('sop_type', 'L2_EXPANSION');
    }

    // Insert new version
    const { data, error } = await supabase
        .from('agent_sop_registry')
        .insert({
            sop_type: 'L2_EXPANSION',
            version: 'v1.0',
            instruction: L2_EXPANSION_SOP,
            is_active: true,
            last_updated: new Date().toISOString()
        })
        .select();

    if (error) {
        console.error('❌ Error registering SOP:', error);
        return;
    }

    console.log('✅ L2_EXPANSION SOP registered successfully!');
    console.log('   ID:', data[0].id);
    console.log('   Active:', data[0].is_active);
    console.log('\n==================\n');
}

registerSOP();
