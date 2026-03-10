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

async function neutralizeL2SOP() {
    console.log('\n=== Neutralizing Names in L2_EXPANSION SOP ===\n');

    // Fetch current SOP
    const { data: sop } = await supabase
        .from('agent_sop_registry')
        .select('instruction')
        .eq('sop_type', 'L2_EXPANSION')
        .eq('is_active', true)
        .single();

    if (!sop) return;

    // Replace "현우" with "주인공"
    let newInstruction = sop.instruction.replace(/현우/g, '주인공');

    // Additional cleanup if needed (e.g. "견우" missed)
    newInstruction = newInstruction.replace(/견우/g, '주인공');

    const { error } = await supabase
        .from('agent_sop_registry')
        .update({
            instruction: newInstruction,
            version: 'v1.3-prologue-enhanced-neutral', // Increment version
            last_updated: new Date().toISOString()
        })
        .eq('sop_type', 'L2_EXPANSION')
        .eq('is_active', true);

    if (error) {
        console.error('❌ Error:', error);
    } else {
        console.log('✅ L2_EXPANSION SOP neutralized (Replaced specific names with "Protagonist")');
    }

    console.log('\n==================\n');
}

neutralizeL2SOP();
