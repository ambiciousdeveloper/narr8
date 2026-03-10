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

async function viewSpecificSOP() {
    console.log('\n=== Viewing VOLUME_CONTROL_POLICY ===\n');

    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('*')
        .eq('sop_type', 'VOLUME_CONTROL_POLICY')
        .order('version', { ascending: false })
        .limit(1);

    if (error) {
        console.error('❌ Error fetching SOP:', error.message);
        return;
    }

    if (data && data.length > 0) {
        console.log(JSON.stringify(data[0], null, 2));
    } else {
        console.log('❌ SOP not found.');
    }
}

viewSpecificSOP();
