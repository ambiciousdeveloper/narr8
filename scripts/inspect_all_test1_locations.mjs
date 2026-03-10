import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectAll() {
    const { data, error } = await supabase
        .from('story_locations')
        .select('*')
        .eq('project_id', 'test_1');

    if (data) {
        console.log(`>>> Found ${data.length} locations for test_1`);
        data.forEach(l => {
            console.log(`\n--- [${l.name_kr}] (${l.id}) ---`);
            console.log(`  Name (EN): ${l.name_en}`);
            console.log(`  Desc (KR): ${l.description_kr ? l.description_kr.substring(0, 50) + '...' : 'null'}`);
            console.log(`  Desc (EN): ${l.description_en ? l.description_en.substring(0, 50) + '...' : 'null'}`);
        });
    }
}

inspectAll();
