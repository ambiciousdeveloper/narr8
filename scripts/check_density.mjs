import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkDensityConfig() {
    console.log('\n=== Checking NOVEL_DENSITY and SCRIPT_DENSITY ===\n');

    const { data, error } = await supabase
        .from('agent_config_registry')
        .select('config_key, config_value')
        .in('config_key', ['NOVEL_DENSITY', 'SCRIPT_DENSITY']);

    if (error) {
        console.error('❌ Error:', error);
        return;
    }

    console.log('✅ Found configs:');
    data.forEach(item => {
        console.log(`  ${item.config_key}: ${item.config_value} chars/min`);
    });

    const novelDensity = data.find(d => d.config_key === 'NOVEL_DENSITY')?.config_value;
    const scriptDensity = data.find(d => d.config_key === 'SCRIPT_DENSITY')?.config_value;

    console.log(`\n📊 Calculation:`);
    console.log(`  Novel: 10 min × ${novelDensity || 'NOT SET'} = ${(novelDensity || 0) * 10} chars`);
    console.log(`  Script: 10 min × ${scriptDensity || 'NOT SET'} = ${(scriptDensity || 0) * 10} chars`);
}

checkDensityConfig().catch(console.error);
