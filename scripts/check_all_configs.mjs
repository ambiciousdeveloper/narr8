import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkAllConfigs() {
    console.log('\n=== [1] Checking Current Database Configs (system_config table) ===\n');
    const { data: configs, error: configError } = await supabase
        .from('system_config')
        .select('*')
        .in('key', ['NOVEL_DENSITY', 'NOVEL_DENSITY_KO_RATIO', 'SCRIPT_DENSITY', 'SECTION_LIMIT']);

    if (configError) {
        console.error('❌ Error fetching configs:', configError);
    } else {
        console.table(configs.map(c => ({ Key: c.key, Value: c.value })));
    }

    console.log('\n=== [2] Checking Active VOLUME_CONTROL_POLICY (agent_sop_registry) ===\n');
    const { data: sops, error: sopError } = await supabase
        .from('agent_sop_registry')
        .select('sop_type, version, instruction')
        .eq('sop_type', 'VOLUME_CONTROL_POLICY')
        .order('version', { ascending: false })
        .limit(1);

    if (sopError) {
        console.error('❌ Error fetching SOP:', sopError);
    } else if (sops && sops.length > 0) {
        console.log(`Version: ${sops[0].version}`);
        console.log(`Instruction Summary: ${sops[0].instruction.substring(0, 200)}...`);
    } else {
        console.log('❌ No active Volume SOP found.');
    }

    console.log('\n=== [3] Checking User Target (project_master_config) ===\n');
    const { data: projects, error: projectError } = await supabase
        .from('project_master_config')
        .select('project_id, target_minutes');

    if (projectError) {
        console.error('❌ Error fetching project config:', projectError);
    } else {
        console.table(projects.map(p => ({ ProjectID: p.project_id, TargetMinutes: p.target_minutes })));
    }
}

checkAllConfigs();
