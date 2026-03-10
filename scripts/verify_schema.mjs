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

async function verifySchema() {
    console.log('\n=== [.cursorrules Rule 1] DB Schema Verification ===\n');

    // Check story_blueprints columns
    console.log('📋 Checking story_blueprints table...\n');
    const { data: blueprints } = await supabase
        .from('story_blueprints')
        .select('*')
        .limit(1);

    if (blueprints && blueprints.length > 0) {
        const columns = Object.keys(blueprints[0]);
        console.log('Available columns:', columns);

        const requiredFields = ['foreshadowing_matrix', 'character_arcs', 'tone_guide', 'theme_message', 'timeline', 'style_guide'];
        const missing = requiredFields.filter(f => !columns.includes(f));

        if (missing.length > 0) {
            console.log('❌ Missing columns:', missing);
        } else {
            console.log('✅ All required JSONB fields exist');
        }
    }

    // Check characters columns
    console.log('\n📋 Checking characters table...\n');
    const { data: chars } = await supabase
        .from('characters')
        .select('*')
        .limit(1);

    if (chars && chars.length > 0) {
        const columns = Object.keys(chars[0]);
        console.log('Available columns:', columns);

        // v5.1 Absolute Isolation: original_* columns must be GONE
        const legacyFields = ['original_role_kr', 'original_role_en', 'original_personality_kr', 'original_personality_en'];
        const existingLegacy = legacyFields.filter(f => columns.includes(f));

        if (existingLegacy.length > 0) {
            console.log('❌ Legacy columns still exist (Migration likely failed or partial):', existingLegacy);
        } else {
            console.log('✅ Legacy original_* columns successfully REMOVED (v5.1 Isolation Complete)');
        }

        const requiredReinterpreted = ['reinterpreted_name_kr', 'reinterpreted_name_en', 'reinterpreted_role_kr', 'reinterpreted_role_en'];
        const missingReinterpreted = requiredReinterpreted.filter(f => !columns.includes(f));

        if (missingReinterpreted.length > 0) {
            console.log('❌ Missing required reinterpreted_* columns:', missingReinterpreted);
        } else {
            console.log('✅ All reinterpreted_* fields exist');
        }

        // Check for tier fields
        const tierFields = columns.filter(c => c.includes('tier'));
        console.log('Tier-related columns:', tierFields);
    }

    // Sample actual data to see what's populated
    console.log('\n📊 Sampling actual data from test_1 project...\n');

    const { data: testBlueprints } = await supabase
        .from('story_blueprints')
        .select('foreshadowing_matrix, character_arcs, tone_guide, theme_message, timeline, style_guide')
        .eq('project_id', 'test_1')
        .limit(1);

    if (testBlueprints && testBlueprints.length > 0) {
        console.log('Blueprint data sample:');
        Object.entries(testBlueprints[0]).forEach(([key, value]) => {
            console.log(`  ${key}: ${value === null ? 'NULL' : typeof value === 'object' ? JSON.stringify(value).substring(0, 50) + '...' : value}`);
        });
    }

    const { data: testChars } = await supabase
        .from('characters')
        .select('reinterpreted_name_kr, reinterpreted_role_kr, reinterpreted_personality_kr, reinterpreted_personality_en')
        .eq('project_id', 'test_1')
        .limit(3);

    if (testChars && testChars.length > 0) {
        console.log('\nCharacter data samples (v5.1 Isolated):');
        testChars.forEach((char, i) => {
            console.log(`\n  [${i + 1}] ${char.reinterpreted_name_kr || 'N/A'}:`);
            console.log(`      reinterpreted_role_kr: ${char.reinterpreted_role_kr || 'NULL'}`);
            console.log(`      reinterpreted_personality_kr: ${char.reinterpreted_personality_kr || 'NULL'}`);
        });
    }

    console.log('\n==================\n');
}

verifySchema();
