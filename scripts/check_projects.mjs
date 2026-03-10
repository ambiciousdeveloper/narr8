import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase URL or Key");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProjects() {
    console.log("=== Checking project_master_config table ===");
    const { data, error } = await supabase
        .from('project_master_config')
        .select('*');

    if (error) {
        console.error("Error fetching project configs:", error);
    } else {
        console.log("Rows found:", data.length);
        if (data.length > 0) {
            console.log("Available Columns:", Object.keys(data[0]).sort().join(', '));
            data.forEach(row => {
                console.log(`\nRow:`);
                Object.entries(row).forEach(([k, v]) => {
                    console.log(`  ${k}: ${v}`);
                });
            });
        }
    }

    console.log("\n=== Checking story_summary table ===");
    const { data: stories, error: sError } = await supabase
        .from('story_summary')
        .select('id, project_id, synthesized_title_kr, world_city_kr');

    if (sError) {
        console.error("Error fetching stories:", sError);
    } else {
        console.log("Stories found:", stories.length);
        stories.forEach(s => {
            console.log(`- ID: ${s.id}, Project ID: ${s.project_id}, Title: ${s.synthesized_title_kr}`);
        });
    }
}

checkProjects();
