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
        console.log('story_summary_columns:', Object.keys(s || {}));

        const { data: b } = await supabase.from('story_blueprints').select('*').limit(1).single();
        if (b) {
            console.log('story_blueprints_columns:', Object.keys(b));
        } else {
            console.log('story_blueprints: No data found for .single(), trying limit(1)');
            const { data: bList } = await supabase.from('story_blueprints').select('*').limit(1);
            if (bList && bList.length > 0) {
                console.log('story_blueprints_columns:', Object.keys(bList[0]));
            } else {
                console.log('story_blueprints: Truly empty or inaccessible.');
            }
        }

        const projectId = 'test_1';
        const { data: bCount } = await supabase.from('story_blueprints').select('id', { count: 'exact' }).eq('project_id', projectId);
        console.log(`Blueprints count for ${projectId}:`, bCount?.length);

    } catch (e) {
        console.error(e);
    }
}

check();
