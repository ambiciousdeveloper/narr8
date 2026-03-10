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

async function inspectSopTable() {
    console.log('\n=== Inspecting agent_sop_registry table structure ===\n');

    // Query information_schema to get column info
    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('*')
        .limit(1);

    if (error) {
        console.error('❌ Error:', error);
        console.log('\n📋 Attempting to query information_schema...\n');

        // Try raw SQL query
        const { data: schemaData, error: schemaError } = await supabase
            .rpc('exec_sql', {
                sql: `SELECT column_name, data_type, is_nullable 
                      FROM information_schema.columns 
                      WHERE table_name = 'agent_sop_registry' 
                      ORDER BY ordinal_position;`
            });

        if (schemaError) {
            console.error('Schema query failed. Table might not exist.');
            console.log('\n💡 Checking if table exists...\n');

            const { data: tables } = await supabase
                .rpc('exec_sql', {
                    sql: `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';`
                });

            console.log('Available tables:', tables);
        }
        return;
    }

    if (data && data.length > 0) {
        console.log('✅ Table exists. Sample row:');
        console.log(JSON.stringify(data[0], null, 2));
        console.log('\n📋 Available columns:', Object.keys(data[0]));
    } else {
        console.log('⚠️  Table exists but is empty');
    }

    console.log('\n==================\n');
}

inspectSopTable();
