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

async function debugScriptVolume() {
    console.log('\n=== 대본 분량 계산 디버그 ===\n');

    // 1. 관련 system_config 모두 조회
    const KEYS = [
        'SCRIPT_DENSITY',
        'SCRIPT_DENSITY_KO_RATIO',
        'SCRIPT_SCENE_AVG_CHARS',
        'SECTION_LIMIT',
        'GLOBAL_SCRIPT_DENSITY_MULTIPLIER',
    ];

    const { data: configs } = await supabase
        .from('system_config')
        .select('key, value, description')
        .in('key', KEYS);

    const configMap = {};
    console.log('[DB system_config 현재 값]');
    for (const key of KEYS) {
        const row = configs?.find(c => c.key === key);
        if (row) {
            configMap[key] = Number(row.value);
            console.log(`  ${key} = ${row.value}  (DB 있음)`);
        } else {
            console.log(`  ${key} = (DB 없음, fallback 사용)`);
        }
    }

    // 2. VOLUME_CONTROL_POLICY SOP 조회
    const { data: sops } = await supabase
        .from('agent_sop_registry')
        .select('instruction')
        .eq('sop_type', 'VOLUME_CONTROL_POLICY')
        .order('version', { ascending: false })
        .limit(1);

    const sop = sops?.[0]?.instruction || '';
    console.log('\n[VOLUME_CONTROL_POLICY SOP 파싱 결과]');
    const SOP_KEYS = ['SCRIPT_DENSITY', 'SCRIPT_KO_RATIO', 'SCRIPT_DENSITY_KO_RATIO', 'SECTION_LIMIT'];
    for (const k of SOP_KEYS) {
        const regex = new RegExp(`\\b${k}\\b[^\\n]*?:?\\s*(\\d+\\.?\\d*)`, 'i');
        const m = sop.match(regex);
        console.log(`  ${k} = ${m ? m[1] + '  (SOP 파싱됨)' : '(SOP에 없음)'}`);
    }

    // 3. project target_minutes 확인
    const { data: projects } = await supabase
        .from('project_master_config')
        .select('project_id, target_minutes')
        .order('created_at', { ascending: false })
        .limit(5);

    console.log('\n[최근 프로젝트 target_minutes]');
    projects?.forEach(p => console.log(`  project_id=${p.project_id}  target_minutes=${p.target_minutes}`));

    // 4. 실제 계산 시뮬레이션
    console.log('\n[분량 계산 시뮬레이션]');
    const DEFAULTS = {
        SCRIPT_DENSITY: 800,
        SCRIPT_DENSITY_KO_RATIO: 0.50,
        SCRIPT_SCENE_AVG_CHARS: 200,
        SECTION_LIMIT: 1500,
        GLOBAL_SCRIPT_DENSITY_MULTIPLIER: 1.0,
    };

    const get = (key) => {
        const row = configs?.find(c => c.key === key);
        return row ? Number(row.value) : DEFAULTS[key];
    };

    const scriptDensity = get('SCRIPT_DENSITY');
    const koRatio = get('SCRIPT_DENSITY_KO_RATIO');
    const sceneAvgChars = get('SCRIPT_SCENE_AVG_CHARS');
    const sectionLimit = get('SECTION_LIMIT');
    const globalDensity = get('GLOBAL_SCRIPT_DENSITY_MULTIPLIER');

    for (const targetMinutes of [3, 5, 10]) {
        const totalTargetChars = Math.max(1500,
            targetMinutes * scriptDensity * koRatio * globalDensity
        );
        const targetScenes = Math.max(3, Math.ceil(totalTargetChars / sceneAvgChars));
        const idealSections = Math.ceil(totalTargetChars / sectionLimit);
        console.log(`  target_minutes=${targetMinutes}  → totalTargetChars=${totalTargetChars}  idealSections=${idealSections}  targetScenes=${targetScenes}`);
    }

    console.log('\n  * actualSections = min(beats.length, idealSections)');
    console.log('  * GLOBAL_SCRIPT_DENSITY_MULTIPLIER가 0이면 totalTargetChars는 항상 1500으로 고정됩니다!\n');
}

debugScriptVolume();
