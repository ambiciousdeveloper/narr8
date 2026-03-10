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

// Mock implementation of parseVolumeConfig
function parseVolumeConfig(sop, key, defaultValue) {
    if (!sop) return defaultValue;
    const regex = new RegExp(`${key}[^\\n]*?:?\\s*(\\d+\\.?\\d*)`, 'i');
    const match = sop.match(regex);
    if (match && match[1]) {
        return parseFloat(match[1]);
    }
    return defaultValue;
}

async function verifySOPParsing() {
    console.log('\n=== Verifying SOP Parsing from Database ===\n');

    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('instruction')
        .eq('sop_type', 'VOLUME_CONTROL_POLICY')
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        console.error('❌ Error fetching SOP:', error);
        return;
    }

    const sop = data.instruction;
    console.log('--- SOP Instruction ---');
    console.log(sop);
    console.log('-----------------------\n');

    const tests = [
        { key: 'NOVEL_DENSITY', default: 3500 },
        { key: 'NOVEL_KO_RATIO', default: 0.85 },
        { key: 'SECTION_LIMIT', default: 2500 },
        { key: 'SCRIPT_DENSITY', default: 800 },
        { key: 'SCRIPT_KO_RATIO', default: 0.50 }
    ];

    console.log('--- Parsed Results ---');
    tests.forEach(t => {
        const val = parseVolumeConfig(sop, t.key, t.default);
        console.log(`${t.key}: ${val} (Fallback: ${t.default})`);
    });
}

verifySOPParsing();
