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

async function fetchSops() {
    console.log('\n=== Fetching L1 & L2 SOPs from agent_sop_registry ===\n');

    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('sop_type, version, instruction')
        .in('sop_type', ['L1_ORIGINAL', 'L1_ADAPTED', 'L2_EXPANSION'])
        .eq('is_active', true);

    if (error) {
        console.error('❌ Error:', error);
        return;
    }

    data.forEach(sop => {
        console.log(`\n--- [${sop.sop_type}] (${sop.version}) ---`);
        console.log(sop.instruction);
        console.log('\n----------------------------------------\n');
    });

    console.log('\n==================\n');
}

fetchSops();
