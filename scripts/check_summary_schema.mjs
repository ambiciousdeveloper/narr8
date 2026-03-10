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

async function checkEpisodesSchema() {
    console.log('\n=== Checking episodes Schema ===\n');

    const { data, error } = await supabase
        .from('episodes')
        .select('*')
        .limit(1);

    if (error) {
        console.error('❌ Error fetching episodes:', error.message);
        return;
    }

    if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
    } else {
        console.log('No data in episodes to check columns.');
    }
}

checkEpisodesSchema();
