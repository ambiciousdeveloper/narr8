import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function syncConfigs() {
    console.log(">>> Syncing Configs for High Density...");

    const configs = [
        { key: 'NOVEL_DENSITY', value: '1200' },
        { key: 'NOVEL_DENSITY_KO_RATIO', value: '0.35' },
        { key: 'SCRIPT_DENSITY', value: '800' },
        { key: 'SECTION_LIMIT', value: '3000' }
    ];

    for (const cfg of configs) {
        const { data, error } = await supabase
            .from('system_config')
            .upsert({ key: cfg.key, value: cfg.value }, { onConflict: 'key' });

        if (error) console.error(`Error updating ${cfg.key}:`, error);
        else console.log(`✓ Updated ${cfg.key} to ${cfg.value}`);
    }
}

syncConfigs();
