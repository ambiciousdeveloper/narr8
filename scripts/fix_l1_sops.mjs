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

const L1_ORIGINAL_SOP_V12 = `
[ORIGINAL BRANCH ANALYSIS MISSION]
- You are performing a DEEP ANALYSIS of the SOURCE MATERIAL.
- **[CRITICAL]**: Even though it is the original story, you MUST populate the entire blueprint (foreshadowing_matrix, character_arcs, theme_message, style_guide, timeline, glossary).

[STRICT RULE: COMPLETE ALL FIELDS]
- You MUST fill out EVERY field in the JSON schema.
- DO NOT leave any field as null, empty array [], or empty object {}.
- If information is unclear, make reasonable inferences based on the context.
- For arrays like 'foreshadowing_matrix' or 'timeline', provide AT LEAST 3-5 items.
- For objects like 'tone_guide' or 'theme_message', ALL sub-fields must be populated.

[CRITICAL: CHARACTER_ARCS COMPLETENESS]
- The 'character_arcs' array MUST include ALL significant characters (MAIN + SUPPORT), not just the protagonist.
- For EACH character in character_arcs, you MUST fill:
  ✓ original_name_kr/en
  ✓ reinterpreted_name_kr/en (even in ORIGINAL mode, fill with same as original_name if no reinterpretation)
  ✓ tier (MAIN/SUPPORT/EXTRA)
  ✓ original_role_kr/en
  ✓ original_personality_kr/en
  ✓ original_tier_kr/en (주연/조연/엑스트라)
  ✓ turning_point_kr/en
  ✓ start_state_kr/en
  ✓ end_state_kr/en
  ✓ detailed_profile_kr/en

[CRITICAL: CHARACTERS TABLE COMPLETENESS]
- The 'characters' array MUST include ALL significant characters, not just the protagonist.
- For EACH character in the 'characters' array, you MUST fill:
  ✓ original_name_kr/en
  ✓ reinterpreted_name_kr/en (even in ORIGINAL mode, fill with same as original_name)
  ✓ tier (MAIN/SUPPORT/EXTRA)
  ✓ original_role_kr/en - MANDATORY for ALL characters
  ✓ original_personality_kr/en - MANDATORY for ALL characters  
  ✓ All other personality/trauma/aging fields

[Authoritative Analysis & Naming Protocol]
- Rank characters by importance using **tier**: MAIN (Protagonist), SUPPORT (Supporting), EXTRA (Background).
- **[RULE]**: If a character is MAIN or SUPPORT, they MUST have a **Proper Name** (e.g., "[설정에 맞는 고유명]", "[A Name Fitting the World]").
- **Naming Strategy**: If the source text only refers to an important character by their role (e.g., "The Professor", "The Librarian"), you MUST **invent a fitting proper name** for them based on the setting (e.g., "[역할+설정에 어울리는 고유명]").
- **Generic Roles**: Characters who remain unnamed or are referred to as "Student 1", "Guard", "Janitor" MUST be assigned the **EXTRA** tier.
- Define their **role**: Explicitly state their narrative function. Do NOT leave as "Unknown".

[Extraction Guide]
- Foreshadowing: Identify subtle hints early in the saga that lead to later reveals.
- Character Arcs: Record how ALL MAIN and SUPPORT characters' values or states change from start to end in the source text.
- World Bible: Extract the established settings, era, and logic of the original world.
- Tone Guide: Describe the narrative tone, atmosphere, and writing style.
- Timeline: Create a chronological event sequence with at least 5 key points.
- Style Guide: Document prose style, visual motifs, and distinctive narrative techniques.

[FINAL CHECK BEFORE SUBMISSION]
Before submitting your response, verify:
✓ foreshadowing_matrix has at least 3 items
✓ character_arcs has entries for ALL MAIN/SUPPORT characters (typically 3-5 characters)
✓ EACH character_arc has ALL fields filled (original_name, reinterpreted_name, role, personality, tier, etc.)
✓ tone_guide has all sub-fields (tone_kr, tone_en, atmosphere_kr, atmosphere_en)
✓ theme_message has all sub-fields (core_theme_kr/en, main_message_kr/en)
✓ timeline has at least 5 events
✓ style_guide has all sub-fields (prose_style_kr/en, visual_motifs_kr/en)
✓ characters array has ALL significant characters
✓ EACH character has original_role_kr/en and original_personality_kr/en filled (NO NULLS!)

DO NOT invent virtual characters, but DO analyze the depth of ALL existing significant ones.
`;

const L1_ADAPTED_SOP_V12 = L1_ORIGINAL_SOP_V12 + `

[ADDITIONAL RULES FOR ADAPTED MODE]
- **MANDATORY**: For character_arcs, 'reinterpreted_name_kr/en' MUST be filled with culturally appropriate Korean names that fit the new setting.
- **MANDATORY**: For characters table, ALL characters MUST ALSO have 'reinterpreted_name_kr/en', 'reinterpreted_role_kr/en', and 'reinterpreted_personality_kr/en' filled.
- Reinterpreted names should fit the new setting and culture (e.g., Korean diaspora sci-fi → Korean names).
- Reinterpreted personalities should maintain core traits while adapting to the new world context.
- **[CRITICAL]**: Original names are NEVER mentioned in synthesized_body_kr/en or any narrative descriptions.

[FINAL CHECK - ADAPTED VERSION]
In addition to the ORIGINAL checks, verify:
✓ character_arcs: ALL characters have reinterpreted_name_kr/en
✓ characters: ALL characters have reinterpreted_name_kr/en
✓ characters: ALL characters have reinterpreted_role_kr/en  
✓ characters: ALL characters have reinterpreted_personality_kr/en
✓ Original names are NEVER mentioned in synthesized_body_kr/en
`;

async function fixL1SOPs() {
    console.log('\n=== Fixing L1 SOPs (v1.1 → v1.2) ===\n');

    // Update L1_ORIGINAL v1.1 to v1.2 and activate
    const { error: origError } = await supabase
        .from('agent_sop_registry')
        .update({
            version: 'v1.2',
            instruction: L1_ORIGINAL_SOP_V12,
            is_active: true,
            last_updated: new Date().toISOString()
        })
        .eq('sop_type', 'L1_ORIGINAL');

    if (origError) {
        console.error('❌ L1_ORIGINAL error:', origError);
    } else {
        console.log('✅ L1_ORIGINAL → v1.2 ACTIVE');
    }

    // Update L1_ADAPTED v1.1 to v1.2 and activate
    const { error: adaptError } = await supabase
        .from('agent_sop_registry')
        .update({
            version: 'v1.2',
            instruction: L1_ADAPTED_SOP_V12,
            is_active: true,
            last_updated: new Date().toISOString()
        })
        .eq('sop_type', 'L1_ADAPTED');

    if (adaptError) {
        console.error('❌ L1_ADAPTED error:', adaptError);
    } else {
        console.log('✅ L1_ADAPTED → v1.2 ACTIVE');
    }

    console.log('\n==================\n');
}

fixL1SOPs();
