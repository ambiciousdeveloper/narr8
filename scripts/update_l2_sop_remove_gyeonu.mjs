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

async function updateL2SOP() {
    console.log('\n=== Removing "Gyeonu" from L2_EXPANSION SOP ===\n');

    // Fetch current SOP
    const { data: sop } = await supabase
        .from('agent_sop_registry')
        .select('instruction')
        .eq('sop_type', 'L2_EXPANSION')
        .eq('is_active', true)
        .single();

    if (!sop) return;

    // Replace "견우" with "주인공" or generic name
    let newInstruction = sop.instruction.replace(/견우/g, '현우');

    const { error } = await supabase
        .from('agent_sop_registry')
        .update({
            instruction: newInstruction,
            version: 'v1.2-prologue-enhanced-clean', // Increment version
            last_updated: new Date().toISOString()
        })
        .eq('sop_type', 'L2_EXPANSION')
        .eq('is_active', true);

    if (error) {
        console.error('❌ Error:', error);
    } else {
        console.log('✅ L2_EXPANSION SOP updated (Removed "Gyeonu")');
    }

    console.log('\n==================\n');
}

updateL2SOP();
