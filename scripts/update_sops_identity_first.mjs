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

const IDENTITY_RULE = `
[CHARACTER IDENTITY ABSOLUTE: SOURCE OF TRUTH]
1. **Source of Truth**: The database ('characters' table) is the ONLY source of truth for character identities.
2. **Identification Only (L1)**: During Master Blueprint (L1) creation, focus on **Casting**: Identify the name and the high-level archetypal role. Do NOT finalize deep psychological traits here.
3. **Master Forge**: All detailed traits (personality, trauma, tone, visual) are managed EXCLUSIVELY by the centralization engine.
4. **Referential Integrity (L2/L3)**: During storyline expansion, you MUST use the character data provided in context as FIXED CONSTRAINTS. You are STRICTLY FORBIDDEN from changing a character's core personality, gender, age, or trauma history.
`;

async function updateSops() {
    console.log('\n=== Injecting Identity-First Rules into SOP Registry ===\n');

    const sopTypes = ['L1_ORIGINAL', 'L1_ADAPTED', 'L2_EXPANSION'];

    for (const type of sopTypes) {
        // Fetch current
        const { data, error } = await supabase
            .from('agent_sop_registry')
            .select('instruction, version')
            .eq('sop_type', type)
            .eq('is_active', true)
            .maybeSingle();

        if (error || !data) {
            console.error(`❌ Skip ${type}:`, error?.message || 'Not found');
            continue;
        }

        if (data.instruction.includes('[CHARACTER IDENTITY ABSOLUTE')) {
            console.log(`ℹ️ ${type} already has the rule. Skipping.`);
            continue;
        }

        const newInstruction = `${data.instruction}\n\n${IDENTITY_RULE}`;
        const newVersion = `${data.version}-v4.0-identity`;

        const { error: uErr } = await supabase
            .from('agent_sop_registry')
            .update({
                instruction: newInstruction,
                version: newVersion,
                last_updated: new Date().toISOString()
            })
            .eq('sop_type', type)
            .eq('is_active', true);

        if (uErr) {
            console.error(`❌ Error updating ${type}:`, uErr.message);
        } else {
            console.log(`✅ Updated ${type} to ${newVersion}`);
        }
    }

    console.log('\n==================\n');
}

updateSops();
