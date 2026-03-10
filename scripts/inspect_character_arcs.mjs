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

async function inspectCharacterArcData() {
    console.log('\n=== Inspecting character_arcs JSONB Data ===\n');

    // Get character_arcs from story_blueprints
    const { data: blueprints } = await supabase
        .from('story_blueprints')
        .select('id, blueprint_type, character_arcs')
        .eq('project_id', 'test_1')
        .not('character_arcs', 'is', null);

    if (blueprints && blueprints.length > 0) {
        blueprints.forEach((bp, i) => {
            console.log(`\n[${i + 1}] Blueprint (${bp.blueprint_type}):`);
            console.log(`    ID: ${bp.id}`);

            if (Array.isArray(bp.character_arcs) && bp.character_arcs.length > 0) {
                console.log(`    character_arcs: ${bp.character_arcs.length} items`);

                // Show first 2 character arcs in detail
                bp.character_arcs.slice(0, 2).forEach((arc, j) => {
                    console.log(`\n    [Character ${j + 1}]:`);
                    console.log(`      tier: ${arc.tier || 'N/A'}`);
                    console.log(`      original_name_kr: ${arc.original_name_kr || 'N/A'}`);
                    console.log(`      original_name_en: ${arc.original_name_en || 'N/A'}`);
                    console.log(`      reinterpreted_name_kr: ${arc.reinterpreted_name_kr || 'MISSING!'}`);
                    console.log(`      reinterpreted_name_en: ${arc.reinterpreted_name_en || 'MISSING!'}`);
                    console.log(`      start_state_kr: ${arc.start_state_kr ? arc.start_state_kr.substring(0, 30) + '...' : 'N/A'}`);
                    console.log(`      end_state_kr: ${arc.end_state_kr ? arc.end_state_kr.substring(0, 30) + '...' : 'N/A'}`);
                });
            } else {
                console.log('    character_arcs: EMPTY or NULL');
            }
        });
    } else {
        console.log('No blueprint data found with character_arcs');
    }

    // Also check characters table
    console.log('\n\n=== Checking characters table for test_1 ===\n');

    const { data: chars } = await supabase
        .from('characters')
        .select('original_name_kr, original_role_kr, original_personality_kr, original_tier_kr, reinterpreted_name_kr')
        .eq('project_id', 'test_1')
        .order('id')
        .limit(5);

    if (chars && chars.length > 0) {
        chars.forEach((char, i) => {
            console.log(`[${i + 1}] ${char.original_name_kr || 'UNNAMED'}:`);
            console.log(`    original_role_kr: ${char.original_role_kr || 'NULL'}`);
            console.log(`    original_personality_kr: ${char.original_personality_kr ? char.original_personality_kr.substring(0, 40) + '...' : 'NULL'}`);
            console.log(`    original_tier_kr: ${char.original_tier_kr || 'NULL'}`);
            console.log(`    reinterpreted_name_kr: ${char.reinterpreted_name_kr || 'NULL'}`);
            console.log('');
        });
    }

    console.log('==================\n');
}

inspectCharacterArcData();
