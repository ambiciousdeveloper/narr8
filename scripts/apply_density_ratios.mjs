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

async function applyDensityRatios() {
    console.log('\n🚀 Applying Multi-Language Density Ratios...\n');

    const config = [
        { key: 'NOVEL_DENSITY_KO_RATIO', value: '0.42', description: '국문 소설 분량 비율 (영문 대비, 약 500자/분)' },
        { key: 'SCRIPT_DENSITY_KO_RATIO', value: '0.50', description: '국문 대본 분량 비율 (영문 대비, 약 200자/분)' }
    ];

    for (const item of config) {
        const { error } = await supabase
            .from('system_config')
            .upsert(item, { onConflict: 'key' });

        if (error) {
            console.error(`❌ Failed to apply ${item.key}:`, error.message);
        } else {
            console.log(`✅ Applied ${item.key} = ${item.value}`);
        }
    }

    console.log('\n✨ Done!');
}

applyDensityRatios();
