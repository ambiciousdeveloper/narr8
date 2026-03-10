import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkBlueprints() {
    console.log('\n=== Checking story_blueprints Data ===\n');

    const projectId = 'test_1'; // Assuming this project id based on previous context

    const { data, error } = await supabase
        .from('story_blueprints')
        .select('*')
        .eq('project_id', projectId);

    if (error) {
        console.error('❌ Error:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No blueprints found for this project.');
        return;
    }

    data.forEach(bp => {
        console.log(`\n--- Blueprint: ${bp.blueprint_type} ---`);
        console.log(`- foreshadowing_matrix: ${JSON.stringify(bp.foreshadowing_matrix).substring(0, 100)}... (Length: ${bp.foreshadowing_matrix?.length})`);
        console.log(`- character_arcs: ${JSON.stringify(bp.character_arcs).substring(0, 100)}... (Length: ${bp.character_arcs?.length})`);
        console.log(`- tone_guide: ${Object.keys(bp.tone_guide || {}).join(', ')}`);
        console.log(`- theme_message: ${Object.keys(bp.theme_message || {}).join(', ')}`);
        console.log(`- timeline: ${bp.timeline?.length} items`);
        console.log(`- style_guide: ${Object.keys(bp.style_guide || {}).join(', ')}`);
        console.log(`- core_premise key count: ${Object.keys(bp.core_premise || {}).length}`);
    });
}

checkBlueprints().catch(console.error);
