import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual .env.local loader for local script execution
const envPath = path.resolve('.env.local');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        }
    });
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
    console.log('>>> [MIGRATION] Applying V21: Remove Granularity Columns...');

    // Note: Supabase JS client doesn't support DROP COLUMN directly via RPC easily if not exposed.
    // We'll use a raw SQL approach if possible, or assume the user runs it in the dashboard.
    // However, for automation, we'll try to use a placeholder or check if we can run it.

    const sql = fs.readFileSync('scripts/v21_remove_granularity.sql', 'utf8');

    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error('Migration Error:', error.message);
        console.log('NOTICE: If "exec_sql" is not available, please run the SQL manually in Supabase Dashboard.');
    } else {
        console.log('✅ Migration V21 Successful!');
    }
}

runMigration();
