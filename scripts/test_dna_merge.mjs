import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testDnaMerge() {
    // 1. Get a project and its first episode
    const { data: project } = await supabase.from('project_master_config').select('*').limit(1).single();
    if (!project) {
        console.error("No project found for testing.");
        return;
    }

    const { data: episode } = await supabase.from('episodes').select('*').eq('project_id', project.project_id).limit(1).single();
    if (!episode) {
        console.error("No episode found for this project.");
        return;
    }

    console.log(`\n--- [DNA Merge Test] ---`);
    console.log(`Project Defaults: ${project.art_style_en}, ${project.aesthetic_dna_en}`);

    // 2. Set an override on the episode
    const testOverlay = {
        art_style: "NEON PUNK OVERRIDE",
        aesthetic_dna: "EXTREME CONTRAST",
        genre: "Sci-Fi Horror"
    };

    console.log(`Setting Overlay: ${JSON.stringify(testOverlay)}`);
    const { error: upErr } = await supabase
        .from('episodes')
        .update({ style_dna_overlay: testOverlay })
        .eq('id', episode.id);

    if (upErr) {
        console.error("Failed to update episode overlay:", upErr);
        return;
    }

    // 3. Simulate Merging Logic (Same as in APIs)
    const { data: epData } = await supabase
        .from('episodes')
        .select('style_dna_overlay')
        .eq('id', episode.id)
        .single();

    const overlay = epData.style_dna_overlay || {};

    const mergedArtStyle = overlay.art_style || project.art_style_en || 'Default';
    const mergedAesthetic = overlay.aesthetic_dna || project.aesthetic_dna_en || 'Default';
    const mergedGenre = overlay.genre || project.genre_en || 'Default';

    console.log(`\n--- Results ---`);
    console.log(`Merged Art Style: ${mergedArtStyle} (Expected: NEON PUNK OVERRIDE)`);
    console.log(`Merged Aesthetic: ${mergedAesthetic} (Expected: EXTREME CONTRAST)`);
    console.log(`Merged Genre: ${mergedGenre} (Expected: Sci-Fi Horror)`);

    if (mergedArtStyle === "NEON PUNK OVERRIDE" && mergedAesthetic === "EXTREME CONTRAST") {
        console.log("\n✅ DNA Merging Logic verified!");
    } else {
        console.log("\n❌ DNA Merging Logic failed.");
    }

    // 4. Cleanup
    await supabase.from('episodes').update({ style_dna_overlay: {} }).eq('id', episode.id);
    process.exit(0);
}

testDnaMerge();
