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

async function forceUpdateSOP() {
    const instruction = `# Volume Control Policy (분량 제어 정책) v1.2

이 정책은 소설 및 대본 생성 시 에이전트가 준수해야 할 정량적 기준을 정의합니다.

## 1. 소설 (NOVEL) 설정
- **NOVEL_DENSITY**: 1200
- **NOVEL_KO_RATIO**: 0.35
- **SECTION_LIMIT**: 3000

## 2. 대본 (SCRIPT) 설정
- **SCRIPT_DENSITY**: 800
- **SCRIPT_KO_RATIO**: 0.50

## 3. 공통 준칙
- 모든 에이전트는 위 설정값을 기준점으로 삼아 분량을 산출해야 합니다.
- 목표 시간(target_minutes)에 가중치와 밀도를 곱하여 최종 글자 수를 결정하십시오.
- 이 문서는 Single Source of Truth입니다.`;

    console.log('>>> Force Deactivating old SOPs...');
    await supabase.from('agent_sop_registry')
        .update({ is_active: false })
        .eq('sop_type', 'VOLUME_CONTROL_POLICY');

    console.log('>>> Inserting new v1.2 SOP...');
    const { data, error } = await supabase
        .from('agent_sop_registry')
        .insert({
            sop_type: 'VOLUME_CONTROL_POLICY',
            version: 'v1.2',
            is_active: true,
            instruction: instruction
        });

    if (error) {
        console.error('❌ Insert failed:', error.message);
    } else {
        console.log('✅ SOP Successfully Updated (v1.2, Active)');
    }
}

forceUpdateSOP();
