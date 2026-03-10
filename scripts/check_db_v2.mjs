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

    console.log(`Checking story_summary for project_id: ${projectId}...`);
    const { data: summary, error: summaryErr } = await supabase
        .from('story_summary')
        .select('*')
        .eq('project_id', projectId);

    if (summaryErr) console.error('Error fetching story_summary:', summaryErr);
    else {
        console.log(`Found ${summary.length} rows in story_summary.`);
        const l3Rows = summary.filter(r => r.hierarchy_group === 'L3');
        console.log(`Common hierarchy_groups:`, [...new Set(summary.map(r => r.hierarchy_group))]);
        console.log(`L3 rows count: ${l3Rows.length}`);
        if (l3Rows.length > 0) {
            console.log('Sample L3 row:', l3Rows[0]);
        }
    }

    console.log(`\nChecking story_blueprints for project_id: ${projectId}...`);
    const { data: blueprints, error: blueErr } = await supabase
        .from('story_blueprints')
        .select('id, summary_id, status, created_at')
        .eq('project_id', projectId);

    if (blueErr) console.error('Error fetching story_blueprints:', blueErr);
    else {
        console.log(`Found ${blueprints.length} rows in story_blueprints.`);
        if (blueprints.length > 0) {
            console.log('Sample blueprint row:', blueprints[0]);
        }
    }
}

check();
