import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    try {
        const { data: s } = await supabase.from('story_summary').select('*').limit(1).single();
        console.log('story_summary_keys:', Object.keys(s || {}));

        const { data: b } = await supabase.from('story_blueprints').select('*').limit(1).single();
        console.log('story_blueprints_keys:', Object.keys(b || {}));

        if (b) {
            console.log('Sample blueprint:', b);
        } else {
            const { data: bAll } = await supabase.from('story_blueprints').select('*').limit(5);
            console.log('All blueprints sample:', bAll);
        }
    } catch (e) {
        console.error(e);
    }
}

check();
