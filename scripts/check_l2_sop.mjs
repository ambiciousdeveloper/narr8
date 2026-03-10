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

async function checkL2ExpansionSOP() {
    console.log('\n=== Checking L2_EXPANSION SOP for Prologue Rules ===\n');

    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('instruction')
        .eq('sop_type', 'L2_EXPANSION')
        .eq('is_active', true)
        .single();

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (data) {
        console.log('L2_EXPANSION SOP Content:\n');
        console.log(data.instruction);
        console.log('\n==================\n');
    }
}

checkL2ExpansionSOP();
