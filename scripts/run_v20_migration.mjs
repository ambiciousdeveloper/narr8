import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    try {
        const sql = fs.readFileSync('C:/Users/Hayden/.gemini/antigravity/brain/1f0d9a96-d853-4397-b857-b8e23e511e1d/v20_audio_palette_init.sql', 'utf8');

        // Attempting with sql_string based on previous error hint
        const { error } = await supabase.rpc('exec_sql', { sql_string: sql });

        if (error) {
            console.error('SQL Error:', error);
            process.exit(1);
        }

        console.log('SQL Migration Successful');
    } catch (err) {
        console.error('Unexpected Error:', err);
        process.exit(1);
    }
}

main();
