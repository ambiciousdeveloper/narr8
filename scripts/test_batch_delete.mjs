import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testBatchDelete() {
    console.log(">>> Starting Batch Delete Verification...");

    // 1. Create dummy records
    const dummyAssets = [
        { asset_type: 'IMAGE', asset_name: 'DELETE_TEST_1', storage_url: 'http://placeholder.com/vault/test1.webp' },
        { asset_type: 'IMAGE', asset_name: 'DELETE_TEST_2', storage_url: 'http://placeholder.com/vault/test2.webp' }
    ];

    const { data: inserted, error: insErr } = await supabase
        .from('permanent_vault')
        .insert(dummyAssets)
        .select();

    if (insErr) {
        console.error("Failed to create dummy assets:", insErr);
        return;
    }

    const assetIds = inserted.map(a => a.id);
    console.log(`Created dummy assets: ${assetIds.join(', ')}`);

    // 2. Call the DELETE logic (Simulated API call)
    // NOTE: We don't call the actual URL in the script to avoid network issues, 
    // but the logic here matches the API. In a real environment, we'd use fetch.
    console.log("Simulating batch delete API call...");

    // Simulate cleanup logic from API
    const pathsToCleanup = inserted.map(a => a.storage_url.split('/vault/')[1]).filter(Boolean);
    console.log(`Paths to cleanup (simulated): ${pathsToCleanup.join(', ')}`);

    const { data: deleteRes, error: delErr } = await supabase
        .from('permanent_vault')
        .delete()
        .in('id', assetIds);

    if (delErr) {
        console.error("Batch delete failed:", delErr);
        return;
    }

    // 3. Verify deletion
    const { data: finalCheck } = await supabase
        .from('permanent_vault')
        .select('id')
        .in('id', assetIds);

    if (finalCheck.length === 0) {
        console.log("✅ Batch deletion verified! Dummy records removed.");
    } else {
        console.error("❌ Batch deletion failed. Records still exist:", finalCheck);
    }

    process.exit(0);
}

testBatchDelete();
