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

async function checkStorySummary() {
    console.log('\n=== Checking story_summary Data ===\n');

    const { data: projects } = await supabase.from('project_master_config').select('project_id').limit(5);
    if (!projects) return;

    for (const p of projects) {
        console.log(`Project: ${p.project_id}`);
        const { data: stories, error } = await supabase
            .from('story_summary')
            .select('id, synthesized_title_kr, synthesized_body_kr')
            .eq('project_id', p.project_id)
            .limit(3);

        if (error) {
            console.error(`  ❌ Error: ${error.message}`);
            continue;
        }

        if (stories && stories.length > 0) {
            stories.forEach(s => {
                console.log(`  - [ID: ${s.id}] Title: ${s.synthesized_title_kr}`);
                console.log(`    Body length: ${s.synthesized_body_kr?.length || 0}`);
            });
        } else {
            console.log('  No stories found.');
        }
    }
}

checkStorySummary();
