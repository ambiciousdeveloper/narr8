import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function dumpColumns() {
    const tables = ['project_master_config', 'story_summary', 'episodes'];
    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (data && data.length > 0) {
            const cols = Object.keys(data[0]).sort();
            console.log(`[TABLE: ${table}]`);
            console.log(cols.join(', '));
            console.log('---');
        } else {
            console.log(`[TABLE: ${table}] (NO DATA)`);
        }
    }
}

dumpColumns().then(() => process.exit(0));
