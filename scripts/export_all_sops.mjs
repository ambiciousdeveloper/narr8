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

const ARTIFACTS_DIR = 'C:/Users/Hayden/.gemini/antigravity/brain/637234ad-3002-4faf-b244-d532cbc4267b';

async function exportSops() {
    console.log('\n=== Exporting SOPs to Artifacts ===\n');

    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('sop_type, version, instruction')
        .in('sop_type', ['L1_ORIGINAL', 'L1_ADAPTED', 'L2_EXPANSION'])
        .eq('is_active', true);

    if (error) {
        console.error('❌ Error:', error);
        return;
    }

    for (const sop of data) {
        const filePath = join(ARTIFACTS_DIR, `SOP_${sop.sop_type}_${sop.version}.md`);
        const content = `# SOP: ${sop.sop_type} (${sop.version})\n\n${sop.instruction}`;
        fs.writeFileSync(filePath, content);
        console.log(`✅ Exported: ${filePath}`);
    }

    console.log('\n==================\n');
}

exportSops();
