import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    const projectId = 'test_1';

    // Check story_summary columns
    console.log('--- Inspecting story_summary columns ---');
    const { data: summaryCols, error: summaryColErr } = await supabase.rpc('get_table_columns', { table_name: 'story_summary' });
    // If rpc doesn't exist, we can try to get one row and see keys
    const { data: summaryRow } = await supabase.from('story_summary').select('*').limit(1).single();
    if (summaryRow) console.log('story_summary columns:', Object.keys(summaryRow));

    // Check story_blueprints columns
    console.log('\n--- Inspecting story_blueprints columns ---');
    const { data: blueRow } = await supabase.from('story_blueprints').select('*').limit(1).single();
    if (blueRow) console.log('story_blueprints columns:', Object.keys(blueRow));
    else {
        // Just try to select everything and see if it fails
        const { data: blueAll, error: blueAllErr } = await supabase.from('story_blueprints').select('*').eq('project_id', projectId);
        if (blueAllErr) console.error('Error fetching all story_blueprints:', blueAllErr);
        else console.log(`Found ${blueAll.length} blueprints. Sample keys:`, blueAll.length > 0 ? Object.keys(blueAll[0]) : 'No data');
    }

    // Check relationship or bridging
    console.log('\n--- Checking for L3 summary data for other projects ---');
    const { data: allL3 } = await supabase.from('story_summary').select('project_id, count(*)').eq('hierarchy_group', 'L3').group('project_id');
    console.log('L3 counts by project:', allL3);

    const { data: blueprints } = await supabase.from('story_blueprints').select('*').eq('project_id', projectId);
    console.log(`\nBlueprints for ${projectId}:`, blueprints);
}

check();
