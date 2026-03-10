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

async function viewFullSOP() {
    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('instruction')
        .eq('sop_type', 'SCRIBE_GUIDELINES')
        .order('version', { ascending: false })
        .limit(1);

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    if (data && data.length > 0) {
        console.log('\n=== [SCRIBE_GUIDELINES] FULL CONTENT ===\n');
        console.log(data[0].instruction);
    }
}

viewFullSOP();
