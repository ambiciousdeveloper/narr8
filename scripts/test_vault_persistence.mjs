import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testPersistence() {
    console.log(">>> Starting Vault Persistence Verification (Global Fetch)...");

    const testUrl = "https://picsum.photos/200";
    const fileName = `test_persist_${Date.now()}.jpg`;
    const filePath = `test/${fileName}`;

    try {
        console.log(`Downloading test image from ${testUrl}...`);
        const res = await fetch(testUrl);
        if (!res.ok) throw new Error("Fetch failed");

        // Use arrayBuffer() for better compatibility with Supabase storage upload
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log(`Uploading to 'vault' bucket at ${filePath}...`);
        const { data: uploadData, error: uploadErr } = await supabase.storage
            .from('vault')
            .upload(filePath, buffer, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (uploadErr) {
            console.error("❌ Upload failed:", uploadErr);
            return;
        }

        console.log("Upload successful:", uploadData);

        const { data: publicUrlData } = supabase.storage
            .from('vault')
            .getPublicUrl(filePath);

        console.log("✅ Persistence verified! Public URL:", publicUrlData.publicUrl);

        // Verification check: list the file
        const { data: files } = await supabase.storage.from('vault').list('test');
        if (files && files.some(f => f.name === fileName)) {
            console.log("✅ File confirmed in storage bucket.");
        } else {
            console.error("❌ File not found in bucket listing.");
        }

    } catch (err) {
        console.error("❌ Test failed:", err);
    }

    process.exit(0);
}

testPersistence();
