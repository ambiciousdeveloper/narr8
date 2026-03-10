import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectSchema() {
    const { data, error } = await supabase.rpc('exec_sql', {
        sql_string: "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'master_option_library'"
    });

    if (error) {
        console.error('Error:', error);
    } else {
        console.table(data);
    }
}

inspectSchema();
