import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectProject1() {
    console.log(">>> Full Inspection for project 'test_1' locations...");
    const { data, error } = await supabase
        .from('story_locations')
        .select('*')
        .eq('project_id', 'test_1');

    if (data) {
        data.forEach(l => {
            console.log(`\n--- [${l.name_kr}] ---`);
            console.log(`  Name (EN): ${l.name_en}`);
            console.log(`  Desc (KR): ${l.description_kr}`);
            console.log(`  Desc (EN): ${l.description_en}`);
            console.log(`  Traits (KR): ${l.visual_traits_kr}`);
            console.log(`  Traits (EN): ${l.visual_traits_en}`);
        });
    }
}

inspectProject1();
