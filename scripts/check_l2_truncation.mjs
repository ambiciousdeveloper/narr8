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

async function checkL2Truncation() {
    console.log('\n=== Checking L2 Chapter Truncation ===\n');

    // Get most recent L2 items
    const { data: l2Items, error } = await supabase
        .from('story_summary')
        .select('id, order_index, synthesized_title_kr, synthesized_body_kr')
        .eq('hierarchy_group', 'L2')
        .eq('branch_type', 'ADAPTED')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!l2Items || l2Items.length === 0) {
        console.log('No L2 items found.');
        return;
    }

    console.log(`Found ${l2Items.length} L2 items:\n`);

    for (const item of l2Items) {
        const body = item.synthesized_body_kr || '';
        const bodyLength = body.length;
        const isTruncated = body.endsWith('...') || body.includes('[TRUNCATED]');
        const lastChars = body.slice(-50);

        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`Order: ${item.order_index}`);
        console.log(`Title: ${item.synthesized_title_kr}`);
        console.log(`Length: ${bodyLength} chars`);
        console.log(`Truncated: ${isTruncated ? '❌ YES' : '✅ NO'}`);
        console.log(`Last 50 chars: ...${lastChars}`);
        console.log();
    }

    console.log('==================\n');
}

checkL2Truncation();
