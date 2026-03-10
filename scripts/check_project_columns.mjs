import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkColumns() {
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'project_master_config' });

    // If RPC doesn't exist, try a simple query and check keys
    if (error) {
        console.log("RPC get_table_columns not found, trying select query...");
        const { data: sample, error: sError } = await supabase.from('project_master_config').select('*').limit(1).single();
        if (sError) {
            console.error("Error fetching sample:", sError);
        } else {
            console.log("Columns found via sample:", Object.keys(sample));
        }
    } else {
        console.log("Columns found via RPC:", data);
    }
}

checkColumns();
