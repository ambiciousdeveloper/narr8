import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSystemConfig() {
    console.log('\n=== Checking system_config table ===\n');

    const { data, error } = await supabase
        .from('system_config')
        .select('*')
        .in('key', ['NOVEL_DENSITY', 'SCRIPT_DENSITY', 'SECTION_LIMIT']);

    if (error) {
        console.error('❌ Error:', error);
        return;
    }

    if (data && data.length > 0) {
        console.log('✅ Found configs:');
        data.forEach(item => {
            console.log(`  ${item.key}: ${item.value} (description: ${item.description || 'N/A'})`);
        });
    } else {
        console.log('❌ NO CONFIGS FOUND! Table is empty or configs are missing.');
        console.log('\n📋 Need to insert:');
        console.log('  - NOVEL_DENSITY = 1200');
        console.log('  - SCRIPT_DENSITY = 400');
        console.log('  - SECTION_LIMIT = 1800');
    }
}

checkSystemConfig().catch(console.error);
