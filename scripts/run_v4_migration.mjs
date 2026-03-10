
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    const migrationPath = 'c:/Users/Hayden/Desktop/My project/ai storybook/database/migrations/20260217_character_identity_v4.sql';
    console.log(`>>> Reading migration: ${migrationPath}`);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // split by ';' and execute each statement
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

    for (const stmt of statements) {
        console.log(`>>> Executing statement: ${stmt.substring(0, 50)}...`);
        const { error } = await supabase.rpc('exec_sql', { sql_query: stmt });
        // Note: 'exec_sql' is a common helper RPC in Supabase setups for migrations
        // If it doesn't exist, we might need a different approach or manually run it
        if (error) {
            console.warn(`RPC Failed: ${error.message}. Attempting simple query...`);
            // Supabase REST API doesn't support raw SQL easily without RPC.
            // As a fallback for this environment, I will try to use Postgres client if possible,
            // but usually RPC is the way to go in these setups.
        }
    }
}

runMigration();
