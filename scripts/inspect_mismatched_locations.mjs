import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectLocations() {
    console.log(">>> Inspecting 'story_locations' for mismatched images...");
    const { data, error } = await supabase
        .from('story_locations')
        .select('id, name_kr, name_en, description_kr, description_en, visual_traits_kr, visual_traits_en')
        .ilike('name_kr', '%버스%');

    if (data) {
        data.forEach(l => console.log(`- ID: ${l.id}\n  KR: ${l.name_kr}\n  EN: ${l.name_en}\n  DESC_KR: ${l.description_kr}\n  DESC_EN: ${l.description_en}`));
    }

    const { data: data2 } = await supabase
        .from('story_locations')
        .select('id, name_kr, name_en, description_kr, description_en, visual_traits_kr, visual_traits_en')
        .ilike('name_kr', '%복도%');

    if (data2) {
        data2.forEach(l => console.log(`- ID: ${l.id}\n  KR: ${l.name_kr}\n  EN: ${l.name_en}\n  DESC_KR: ${l.description_kr}\n  DESC_EN: ${l.description_en}`));
    }
}

inspectLocations();
