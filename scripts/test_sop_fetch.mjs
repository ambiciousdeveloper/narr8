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

// Test SOP fetch logic
async function testSOPFetch() {
    console.log('\n=== Testing SOP Fetch Logic ===\n');

    const sopTypes = ['L1_ORIGINAL', 'L1_ADAPTED', 'L2_EXPANSION'];

    for (const sopType of sopTypes) {
        const { data, error } = await supabase
            .from('agent_sop_registry')
            .select('instruction')
            .eq('sop_type', sopType)
            .eq('is_active', true)
            .single();

        if (error) {
            console.log(`❌ ${sopType}: ERROR - ${error.message}`);
        } else if (!data) {
            console.log(`❌ ${sopType}: NOT FOUND`);
        } else {
            const preview = data.instruction.substring(0, 100);
            console.log(`✅ ${sopType}: ${preview}...`);
            console.log(`   Length: ${data.instruction.length} chars\n`);
        }
    }

    console.log('==================\n');
}

testSOPFetch();
