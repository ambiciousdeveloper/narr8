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

// SCRIPT_DENSITY=2000은 10분 × 2000 = 20,000자 목표 → 모델이 절대 채울 수 없음
// 1000으로 조정: 10분 × 1000 × 1.0 = 10,000자 → 섹션당 2,500자 × 4회 호출
const updates = [
    { key: 'SCRIPT_DENSITY', value: '1000', description: '대본 분당 목표 글자 수 (1000자/분 기준)' },
    { key: 'SCRIPT_SCENE_AVG_CHARS', value: '300', description: '씬 1개당 평균 글자 수 (300자 = 더 밀도 있는 씬)' },
];

async function fixScriptDensity() {
    console.log('\n=== SCRIPT_DENSITY 조정 ===\n');
    console.log('이전: SCRIPT_DENSITY=2000 → 10분 = 20,000자 목표 (달성 불가)');
    console.log('이후: SCRIPT_DENSITY=1000 → 10분 = 10,000자 목표 (4회 API 호출)\n');

    for (const item of updates) {
        const { error } = await supabase
            .from('system_config')
            .upsert(item, { onConflict: 'key' });

        if (error) {
            console.error(`  Failed ${item.key}:`, error.message);
        } else {
            console.log(`  OK  ${item.key} = ${item.value}`);
        }
    }

    // 결과 확인
    const { data } = await supabase
        .from('system_config')
        .select('key, value')
        .in('key', ['SCRIPT_DENSITY', 'SCRIPT_DENSITY_KO_RATIO', 'SCRIPT_SCENE_AVG_CHARS', 'SECTION_LIMIT']);

    console.log('\n현재 대본 설정:');
    data?.forEach(r => console.log(`  ${r.key} = ${r.value}`));

    const density = data?.find(r => r.key === 'SCRIPT_DENSITY')?.value || 1000;
    const ratio = data?.find(r => r.key === 'SCRIPT_DENSITY_KO_RATIO')?.value || 0.5;
    const limit = data?.find(r => r.key === 'SECTION_LIMIT')?.value || 2500;
    const target10 = 10 * Number(density) * Number(ratio);
    console.log(`\n예상 (10분 기준): ${target10}자 목표, 섹션 ${Math.ceil(target10 / Number(limit))}회 API 호출`);
}

fixScriptDensity();
