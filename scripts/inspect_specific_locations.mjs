import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSpecific() {
    const { data, error } = await supabase
        .from('story_locations')
        .select('*')
        .ilike('name_kr', '%버스%');

    if (data) {
        data.forEach(l => {
            console.log(`\n--- [${l.name_kr}] ---`);
            console.log(`  Name (EN): ${l.name_en}`);
            console.log(`  Desc (KR): ${l.description_kr}`);
            console.log(`  Desc (EN): ${l.description_en}`);
        });
    }

    const { data: data2 } = await supabase
        .from('story_locations')
        .select('*')
        .ilike('name_kr', '%복도%');

    if (data2) {
        data2.forEach(l => {
            console.log(`\n--- [${l.name_kr}] ---`);
            console.log(`  Name (EN): ${l.name_en}`);
            console.log(`  Desc (KR): ${l.description_kr}`);
            console.log(`  Desc (EN): ${l.description_en}`);
        });
    }
}

inspectSpecific();
