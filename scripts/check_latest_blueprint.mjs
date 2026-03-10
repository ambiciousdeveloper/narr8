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

async function checkLatestBlueprintData() {
    console.log('\n=== Checking Latest Blueprint Data for test_1 ===\n');

    const { data: blueprints } = await supabase
        .from('story_blueprints')
        .select('id, blueprint_type, updated_at, foreshadowing_matrix, character_arcs, tone_guide, theme_message, timeline, style_guide')
        .eq('project_id', 'test_1')
        .order('updated_at', { ascending: false })
        .limit(2);

    if (blueprints && blueprints.length > 0) {
        blueprints.forEach((bp, i) => {
            console.log(`\n[${i + 1}] ${bp.blueprint_type} Blueprint:`);
            console.log(`    ID: ${bp.id}`);
            console.log(`    Last Updated: ${bp.updated_at}`);
            console.log(`\n    Field Status:`);

            const fields = ['foreshadowing_matrix', 'character_arcs', 'tone_guide', 'theme_message', 'timeline', 'style_guide'];
            fields.forEach(field => {
                const value = bp[field];
                let status = 'NULL';

                if (value !== null) {
                    if (Array.isArray(value)) {
                        status = value.length > 0 ? `✅ ${value.length} items` : '❌ EMPTY []';
                    } else if (typeof value === 'object') {
                        const keys = Object.keys(value);
                        status = keys.length > 0 ? `✅ ${keys.length} keys` : '❌ EMPTY {}';
                    }
                }

                console.log(`      ${field}: ${status}`);
            });
        });
    } else {
        console.log('❌ No blueprint data found for test_1');
    }

    // Check if current SOP version is being used
    console.log('\n\n=== Current Active L1 SOPs ===\n');
    const { data: sops } = await supabase
        .from('agent_sop_registry')
        .select('sop_type, version, is_active, last_updated')
        .in('sop_type', ['L1_ORIGINAL', 'L1_ADAPTED'])
        .eq('is_active', true);

    if (sops) {
        sops.forEach(sop => {
            console.log(`${sop.sop_type}: ${sop.version} (updated: ${sop.last_updated})`);
        });
    }

    console.log('\n==================\n');
}

checkLatestBlueprintData();
