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

async function checkCharacterData() {
    console.log('\n=== Checking Character Data for test_1 ===\n');

    const { data: chars } = await supabase
        .from('characters')
        .select('original_name_kr, original_role_kr, original_personality_kr, reinterpreted_name_kr, reinterpreted_personality_en')
        .eq('project_id', 'test_1')
        .limit(5);

    if (chars && chars.length > 0) {
        chars.forEach((char, i) => {
            console.log(`[${i + 1}] ${char.original_name_kr || 'UNNAMED'}:`);
            console.log(`    original_role_kr: ${char.original_role_kr || 'NULL'}`);
            console.log(`    original_personality_kr: ${char.original_personality_kr || 'NULL'}`);
            console.log(`    reinterpreted_name_kr: ${char.reinterpreted_name_kr || 'NULL'}`);
            console.log(`    reinterpreted_personality_en: ${char.reinterpreted_personality_en || 'NULL'}`);
            console.log('');
        });
    } else {
        console.log('No character data found for test_1');
    }

    console.log('==================\n');
}

checkCharacterData();
