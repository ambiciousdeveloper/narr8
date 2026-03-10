import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectSchema() {
    const tables = ['project_master_config', 'story_summary', 'episodes'];
    for (const table of tables) {
        console.log(`\n--- Columns for ${table} ---`);
        try {
            const { data, error } = await supabase.from(table).select('*').limit(1);
            if (error) {
                console.error(`Error fetching ${table}:`, error);
                continue;
            }
            if (data && data.length > 0) {
                console.log(Object.keys(data[0]).sort().join(', '));
            } else {
                console.log("(Table is empty, trying to find columns via another method...)");
                // If table is empty, we can try to find another project that might have data
                const { data: allData } = await supabase.from(table).select('*').limit(10);
                if (allData && allData.length > 0) {
                    console.log(Object.keys(allData[0]).sort().join(', '));
                } else {
                    console.log("No data found in table to infer columns.");
                }
            }
        } catch (e) {
            console.error(`Exception for ${table}:`, e);
        }
    }
}

inspectSchema();
