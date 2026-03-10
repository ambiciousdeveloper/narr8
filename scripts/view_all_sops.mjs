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

async function viewSpecificSOPs() {
    const targetSops = ['SCRIBE_GUIDELINES', 'SCRIBE_MISSION_ADAPT', 'SCRIBE_PERSONA_SCRIPT', 'SCRIBE_PERSONA_NOVEL'];
    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('*')
        .in('sop_type', targetSops);

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    data.forEach(sop => {
        console.log(`\n=== [${sop.sop_type}] (v${sop.version}) ===\n`);
        console.log(sop.instruction);
        console.log('-------------------------------------------');
    });
}

viewSpecificSOPs();
