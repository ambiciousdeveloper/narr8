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

// Original mode L1 analysis SOP
const L1_ORIGINAL_SOP = `
[ORIGINAL BRANCH ANALYSIS MISSION]
- You are performing a DEEP ANALYSIS of the SOURCE MATERIAL.
- **[CRITICAL]**: Even though it is the original story, you MUST populate the entire blueprint (foreshadowing_matrix, character_arcs, theme_message, style_guide, timeline, glossary).

[STRICT RULE: COMPLETE ALL FIELDS]
- You MUST fill out EVERY field in the JSON schema.
- DO NOT leave any field as null, empty array [], or empty object {}.
- If information is unclear, make reasonable inferences based on the context.
- For arrays like 'foreshadowing_matrix' or 'timeline', provide AT LEAST 3-5 items.
- For objects like 'tone_guide' or 'theme_message', ALL sub-fields must be populated.

[Authoritative Analysis & Naming Protocol]
- Rank characters by importance using **tier**: MAIN (Protagonist), SUPPORT (Supporting), EXTRA (Background).
- **[RULE]**: If a character is MAIN or SUPPORT, they MUST have a **Proper Name** (e.g., "[설정에 맞는 고유명]", "[A Name Fitting the World]").
- **Naming Strategy**: If the source text only refers to an important character by their role (e.g., "The Professor", "The Librarian"), you MUST **invent a fitting proper name** for them based on the setting (e.g., "[역할+설정에 어울리는 고유명]").
- **Generic Roles**: Characters who remain unnamed or are referred to as "Student 1", "Guard", "Janitor" MUST be assigned the **EXTRA** tier.
- Define their **role**: Explicitly state their narrative function. Do NOT leave as "Unknown".
- **MANDATORY**: ALL characters MUST have 'original_role_kr/en' and 'original_personality_kr/en' filled.

[Extraction Guide]
- Foreshadowing: Identify subtle hints early in the saga that lead to later reveals.
- Character Arcs: Record how the main characters' values or states change from start to end in the source text.
- World Bible: Extract the established settings, era, and logic of the original world.
- Tone Guide: Describe the narrative tone, atmosphere, and writing style.
- Timeline: Create a chronological event sequence with at least 5 key points.
- Style Guide: Document prose style, visual motifs, and distinctive narrative techniques.

[FINAL CHECK]
Before submitting your response, verify:
✓ foreshadowing_matrix has at least 3 items
✓ character_arcs has entries for all MAIN/SUPPORT characters
✓ tone_guide has all sub-fields (tone_kr, tone_en, atmosphere_kr, atmosphere_en)
✓ theme_message has all sub-fields (core_theme_kr/en, main_message_kr/en)
✓ timeline has at least 5 events
✓ style_guide has all sub-fields (prose_style_kr/en, visual_motifs_kr/en)
✓ ALL characters have original_role_kr/en and original_personality_kr/en

DO NOT invent virtual characters, but DO analyze the depth of the existing ones.
`;

// L1 Adapted mode inherits from ORIGINAL + additional reinterpretation rules
const L1_ADAPTED_SOP = `
${L1_ORIGINAL_SOP}

[ADDITIONAL RULES FOR ADAPTED MODE]
- **MANDATORY**: ALL characters MUST ALSO have 'reinterpreted_name_kr/en', 'reinterpreted_role_kr/en', and 'reinterpreted_personality_kr/en' filled.
- Reinterpreted names should fit the new setting and culture.
- Reinterpreted personalities should maintain core traits while adapting to the new world context.

[FINAL CHECK - ADAPTED VERSION]
In addition to the ORIGINAL checks, verify:
✓ ALL characters have reinterpreted_name_kr/en
✓ ALL characters have reinterpreted_role_kr/en  
✓ ALL characters have reinterpreted_personality_kr/en
✓ Original names are NEVER mentioned in synthesized_body_kr/en
`;

async function registerL1SOPs() {
    console.log('\n=== Registering L1 Analysis SOPs ===\n');

    // Deactivate old L1 SOPs if any
    await supabase
        .from('agent_sop_registry')
        .update({ is_active: false })
        .in('sop_type', ['L1_ORIGINAL', 'L1_ADAPTED']);

    // Register ORIGINAL SOP
    const { data: original, error: origError } = await supabase
        .from('agent_sop_registry')
        .insert({
            sop_type: 'L1_ORIGINAL',
            version: 'v1.1',
            instruction: L1_ORIGINAL_SOP,
            is_active: true,
            last_updated: new Date().toISOString()
        })
        .select();

    if (origError) {
        console.error('❌ Error registering L1_ORIGINAL:', origError);
    } else {
        console.log('✅ L1_ORIGINAL SOP registered');
        console.log('   ID:', original[0].id);
    }

    // Register ADAPTED SOP
    const { data: adapted, error: adaptError } = await supabase
        .from('agent_sop_registry')
        .insert({
            sop_type: 'L1_ADAPTED',
            version: 'v1.1',
            instruction: L1_ADAPTED_SOP,
            is_active: true,
            last_updated: new Date().toISOString()
        })
        .select();

    if (adaptError) {
        console.error('❌ Error registering L1_ADAPTED:', adaptError);
    } else {
        console.log('✅ L1_ADAPTED SOP registered');
        console.log('   ID:', adapted[0].id);
    }

    console.log('\n==================\n');
}

registerL1SOPs();
