import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function debugL2() {
    console.log('\n=== L2 Data Diagnosis for test_1 ===\n');

    // 1. Check L1
    const { data: l1Data } = await supabase
        .from('story_summary')
        .select('*')
        .eq('project_id', 'test_1')
        .eq('hierarchy_group', 'L1')
        .maybeSingle();

    console.log('L1 Data:');
    console.log(`  ID: ${l1Data?.id}`);
    console.log(`  Title (KR): ${l1Data?.unit_title_kr}`);
    console.log(`  Synthesized: ${l1Data?.is_synthesized}`);
    console.log(`  Branch Type: ${l1Data?.branch_type}`);

    // 2. Check L2 items
    const { data: l2Data } = await supabase
        .from('story_summary')
        .select('*')
        .eq('project_id', 'test_1')
        .eq('hierarchy_group', 'L2')
        .order('order_index');

    console.log(`\nL2 Items Found: ${l2Data?.length || 0}`);

    if (l2Data && l2Data.length > 0) {
        l2Data.forEach((item, index) => {
            console.log(`\n  [${index + 1}] ${item.unit_title_kr || item.synthesized_title_kr}`);
            console.log(`      ID: ${item.id}`);
            console.log(`      Parent ID: ${item.parent_id}`);
            console.log(`      Branch Type: ${item.branch_type}`);
            console.log(`      Order Index: ${item.order_index}`);
        });

        // 3. Check if parent_id matches L1
        const parentMatches = l2Data.every(item => item.parent_id === l1Data?.id);
        console.log(`\n  ✓ All L2 items have correct parent_id: ${parentMatches}`);

        // 4. Check branch consistency
        const branches = [...new Set(l2Data.map(item => item.branch_type))];
        console.log(`  ✓ Branch types in L2: ${branches.join(', ')}`);
    }

    console.log('\n==================\n');
}

debugL2();
