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

async function exportGenericSOP(sopType) {
    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('instruction')
        .eq('sop_type', sopType)
        .order('version', { ascending: false })
        .limit(1);

    if (error) {
        console.error('❌ Error:', error.message);
        return;
    }

    if (data && data.length > 0) {
        const filePath = join(__dirname, `../temp_${sopType}.md`);
        fs.writeFileSync(filePath, data[0].instruction);
        console.log(`✅ SOP ${sopType} exported to ${filePath}`);
    } else {
        console.log(`❌ SOP ${sopType} not found.`);
    }
}

const target = process.argv[2];
if (!target) {
    console.error('Please specify SOP type as argument.');
} else {
    exportGenericSOP(target);
}
