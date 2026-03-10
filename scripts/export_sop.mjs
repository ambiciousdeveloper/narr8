import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function exportFullSOP() {
    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('instruction, sop_type')
        .eq('sop_type', 'SCRIBE_GUIDELINES')
        .order('version', { ascending: false })
        .limit(1);

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    if (data && data.length > 0) {
        fs.writeFileSync(join(__dirname, '../temp_sop_view.md'), data[0].instruction);
        console.log('✅ SOP exported to temp_sop_view.md');
    }
}

exportFullSOP();
