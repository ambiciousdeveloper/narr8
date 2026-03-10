
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in process.env');
    console.log('Available env keys:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log('>>> Checking latest projects...');
    const { data: projects, error: pErr } = await supabase.from('project_master_config').select('project_id, source_identity_kr').order('created_at', { ascending: false }).limit(3);

    if (pErr) {
        console.error('Error fetching projects:', pErr);
        return;
    }

    if (!projects || projects.length === 0) {
        console.log('No projects found at all in project_master_config table.');
        return;
    }

    for (const p of projects) {
        console.log(`\n--- Project: ${p.project_name} (${p.project_id}) ---`);

        const { data: blueprints } = await supabase.from('story_blueprints').select('blueprint_type, character_arcs').eq('project_id', p.project_id);
        console.log(`Blueprints found: ${blueprints?.length || 0}`);
        blueprints?.forEach(bp => {
            console.log(` - Type: ${bp.blueprint_type}, Arcs Count: ${bp.character_arcs?.length || 0}`);
        });

        const { data: characters } = await supabase.from('characters').select('id, original_name_kr, reinterpreted_name_kr').eq('project_id', p.project_id);
        console.log(`Characters found: ${characters?.length || 0}`);
        characters?.forEach(c => {
            console.log(` - [${c.id}] Name: ${c.reinterpreted_name_kr || c.original_name_kr}`);
        });
    }
}

debug();
