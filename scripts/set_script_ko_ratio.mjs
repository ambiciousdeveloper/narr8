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

// 원하는 비율 값으로 변경하세요 (기본값: 0.50, 최대: 1.00)
const TARGET_RATIO = '1.00';

async function setScriptKoRatio() {
    console.log(`\n Setting SCRIPT_DENSITY_KO_RATIO = ${TARGET_RATIO} in system_config...\n`);

    const { error } = await supabase
        .from('system_config')
        .upsert(
            { key: 'SCRIPT_DENSITY_KO_RATIO', value: TARGET_RATIO, description: '국문 대본 분량 비율 (영문 대비)' },
            { onConflict: 'key' }
        );

    if (error) {
        console.error('Failed:', error.message);
    } else {
        console.log(`OK  SCRIPT_DENSITY_KO_RATIO = ${TARGET_RATIO} 적용 완료`);
        console.log(`    (이전: 0.50 → 현재: ${TARGET_RATIO}, 분량 ${Math.round(Number(TARGET_RATIO) / 0.50 * 100)}%)`);
    }

    // 현재 DB 값 확인
    const { data } = await supabase
        .from('system_config')
        .select('key, value')
        .in('key', ['SCRIPT_DENSITY_KO_RATIO', 'SCRIPT_DENSITY', 'GLOBAL_SCRIPT_DENSITY_MULTIPLIER']);

    console.log('\n현재 대본 관련 설정:');
    data?.forEach(row => console.log(`  ${row.key} = ${row.value}`));
}

setScriptKoRatio();
