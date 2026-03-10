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

async function listSOPs() {
    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('*');

    if (error) {
        console.error('❌ Error listing SOPs:', error);
    } else {
        console.table(data.map(d => ({
            id: d.id,
            sop_type: d.sop_type,
            version: d.version,
            is_active: d.is_active
        })));
    }
}

listSOPs();
