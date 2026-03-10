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

async function listAllSOPs() {
    console.log('\n=== All SOPs in agent_sop_registry ===\n');

    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('sop_type, version, is_active, last_updated')
        .order('sop_type');

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log(`Found ${data.length} SOPs:\n`);
        data.forEach((sop, i) => {
            const status = sop.is_active ? '✅ ACTIVE' : '❌ Inactive';
            console.log(`[${i + 1}] ${sop.sop_type} (${sop.version}) - ${status}`);
            console.log(`    Last updated: ${sop.last_updated}\n`);
        });
    } else {
        console.log('No SOPs found');
    }

    console.log('==================\n');
}

listAllSOPs();
