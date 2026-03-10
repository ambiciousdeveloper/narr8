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

async function searchSOPs() {
    console.log('\n=== Searching SOPs for "견우" ===\n');

    // Fetch all SOPs
    const { data: sops, error } = await supabase
        .from('agent_sop_registry')
        .select('sop_type, version, instruction')
        .eq('is_active', true);

    if (error) {
        console.error('Error:', error);
        return;
    }

    let found = false;
    for (const sop of sops) {
        if (sop.instruction.includes('견우')) {
            console.log(`[FOUND in SOP] Type: ${sop.sop_type} (v${sop.version})`);

            // Show context
            const lines = sop.instruction.split('\n');
            lines.forEach((line, index) => {
                if (line.includes('견우')) {
                    console.log(`   Line ${index + 1}: ${line.trim()}`);
                }
            });
            found = true;
            console.log('-----------------------------------');
        }
    }

    if (!found) {
        console.log('✅ "견우" not found in any active SOPs.');
    }

    console.log('\n==================\n');
}

searchSOPs();
