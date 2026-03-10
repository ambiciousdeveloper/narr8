import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function inspectStyles() {
    const projectId = 'test_1';
    console.log(`\n=== Inspecting Styles for Project: ${projectId} ===\n`);

    const { data: project, error: pError } = await supabase
        .from('project_master_config')
        .select('*')
        .eq('project_id', projectId)
        .single();

    if (pError) {
        console.error('❌ Project Error:', pError);
    } else {
        console.log('Project Master Config:');
        console.log(`- art_style_en: ${project.art_style_en}`);
        console.log(`- art_style_kr: ${project.art_style_kr}`);
        console.log(`- aesthetic_dna_en: ${project.aesthetic_dna_en}`);
        console.log(`- cinematography_en: ${project.cinematography_en}`);
        console.log(`- genre_en: ${project.genre_en}`);
    }

    const { data: characters, error: cError } = await supabase
        .from('characters')
        .select('id, reinterpreted_name_kr, character_visuals(*)')
        .eq('project_id', projectId);

    if (cError) {
        console.error('❌ Characters Error:', cError);
    } else {
        console.log('\nCharacters Visual Settings:');
        characters.forEach(c => {
            const visual = c.character_visuals?.[0];
            console.log(`\n--- ${c.reinterpreted_name_kr} (${c.id}) ---`);
            if (visual) {
                console.log(`- style_guide_kr: ${visual.style_guide_kr}`);
                console.log(`- visual_traits_kr: ${visual.visual_traits_kr}`);
                console.log(`- prompt: ${visual.prompt?.substring(0, 200)}...`);
                console.log(`- image_url: ${visual.image_url}`);
            } else {
                console.log('No visual settings found.');
            }
        });
    }
}

inspectStyles().catch(console.error);
