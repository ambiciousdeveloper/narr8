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

const SEARCH_TERMS = ['아즈카반', 'Azkaban', 'azkaban'];

async function searchTable(table, columns) {
    for (const col of columns) {
        for (const term of SEARCH_TERMS) {
            const { data, error } = await supabase
                .from(table)
                .select(`id, project_id, ${col}`)
                .ilike(col, `%${term}%`)
                .limit(5);
            if (error) continue;
            if (data && data.length > 0) {
                console.log(`\n🔴 FOUND in [${table}.${col}] (${data.length} rows):`);
                data.forEach(row => {
                    const snippet = String(row[col] || '').substring(0, 300);
                    console.log(`  → ID: ${row.id}, project_id: ${row.project_id}`);
                    console.log(`    SNIPPET: ...${snippet}...`);
                });
            }
        }
    }
}

async function main() {
    console.log('🔎 Searching for Azkaban source leakage across DB tables...\n');

    // 1. story_blueprints - 각색 설계도 (character_arcs, storyline_kr, world_rules_kr)
    await searchTable('story_blueprints', ['storyline_kr', 'world_rules_kr', 'character_arcs', 'saga_title_kr']);

    // 2. story_summary - 원문/각색 시놉시스
    await searchTable('story_summary', ['original_body_kr', 'synthesized_body_kr', 'original_title_kr']);

    // 3. literary_assets - 문학 자료
    await searchTable('literary_assets', ['content_kr', 'origin_source']);

    // 4. characters - 캐릭터 설명
    await searchTable('characters', ['reinterpreted_role_kr', 'reinterpreted_personality_kr', 'detailed_profile_kr']);

    // 5. agent_sop_registry - SOP 지침
    await searchTable('agent_sop_registry', ['instruction']);

    // 6. world_building (if exists)
    await searchTable('world_building', ['content_kr', 'description_kr']).catch(() => { });

    // 7. writing_gold_standards
    await searchTable('writing_gold_standards', ['content_kr']).catch(() => { });

    console.log('\n✅ Search complete.');
}

main().catch(console.error);
