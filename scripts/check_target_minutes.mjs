import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkTargetMinutes() {
    console.log('\n=== Checking target_minutes from DB ===\n');

    const { data, error } = await supabase
        .from('project_master_config')
        .select('project_id, target_minutes')
        .eq('project_id', 'test_1')
        .single();

    if (error) {
        console.error('❌ Error:', error);
        return;
    }

    console.log('✅ Result:', data);
    console.log(`\nProject: ${data.project_id}`);
    console.log(`Target Minutes: ${data.target_minutes || 'NOT SET (will use default 5)'}`);
    console.log(`Expected chars: ${(data.target_minutes || 5) * 1200}`);
}

checkTargetMinutes().catch(console.error);
