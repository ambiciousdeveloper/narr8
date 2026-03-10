import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getSchema() {
    const tables = ['character_voices', 'character_visuals'];
    for (const table of tables) {
        console.log(`\n--- Full Schema for: ${table} ---`);
        const { data, error } = await supabase.rpc('exec_sql', {
            sql: `SELECT column_name, data_type, is_nullable, column_default 
                  FROM information_schema.columns 
                  WHERE table_name = '${table}' 
                  ORDER BY ordinal_position;`
        });
        if (error) {
            console.error(`Error for ${table}:`, error.message);
            // Fallback: check if table exists
            const { data: exists } = await supabase.rpc('exec_sql', {
                sql: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '${table}');`
            });
            console.log(`Table exists:`, exists);
        } else {
            console.log(JSON.stringify(data, null, 2));
        }
    }
}

getSchema();
