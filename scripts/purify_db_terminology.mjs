import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PROJECT_ID = 'test_1';

async function purify() {
    console.log(`>>> Starting Purification for Project: ${PROJECT_ID}`);

    // 1. Fetch Blueprints to build map
    const { data: blueprints } = await supabase.from('story_blueprints').select('*').eq('project_id', PROJECT_ID);
    const originalBp = blueprints.find(b => b.blueprint_type === 'ORIGINAL');
    const adaptedBp = blueprints.find(b => b.blueprint_type === 'ADAPTED');

    if (!originalBp || !adaptedBp) {
        console.error("Missing blueprints. Aborting.");
        return;
    }

    const nameMap = {};
    const originalGlossary = typeof originalBp.glossary === 'string' ? JSON.parse(originalBp.glossary) : originalBp.glossary;
    const adaptedGlossary = typeof adaptedBp.glossary === 'string' ? JSON.parse(adaptedBp.glossary) : adaptedBp.glossary;

    originalGlossary.forEach((item, idx) => {
        const adaptedItem = adaptedGlossary[idx];
        if (item.term_kr && adaptedItem?.term_kr && item.term_kr !== adaptedItem.term_kr) {
            nameMap[item.term_kr] = adaptedItem.term_kr;
        }
        if (item.term_en && adaptedItem?.term_en && item.term_en !== adaptedItem.term_en) {
            nameMap[item.term_en] = adaptedItem.term_en;
        }
    });

    // Hardcoded safety defaults for the most leaked terms
    nameMap['아즈카반'] = nameMap['아즈카반'] || '시안 제6 데이터 감옥';
    nameMap['호크룩스'] = nameMap['호크룩스'] || '호문쿨루스';

    console.log('>>> Replacement Map:', nameMap);

    const clean = (text) => {
        if (!text) return text;
        let c = text;
        Object.entries(nameMap).forEach(([old, newName]) => {
            const escaped = old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            c = c.replace(new RegExp(escaped, 'gi'), newName);
        });
        return c;
    };

    // 2. Sanitize story_summary
    console.log('>>> Sanitizing story_summary...');
    const { data: summaries } = await supabase.from('story_summary').select('*').eq('project_id', PROJECT_ID);
    for (const s of summaries || []) {
        const newBody = clean(s.synthesized_body_kr);
        const newTitle = clean(s.synthesized_title_kr);
        if (newBody !== s.synthesized_body_kr || newTitle !== s.synthesized_title_kr) {
            console.log(`  Updating Summary ${s.id}: ${s.synthesized_title_kr}`);
            await supabase.from('story_summary').update({
                synthesized_body_kr: newBody,
                synthesized_title_kr: newTitle
            }).eq('id', s.id);
        }
    }

    // 3. Sanitize characters
    console.log('>>> Sanitizing characters...');
    const { data: characters } = await supabase.from('characters').select('*').eq('project_id', PROJECT_ID);
    for (const char of characters || []) {
        const newRole = clean(char.reinterpreted_role_kr);
        const newPersonality = clean(char.reinterpreted_personality_kr);
        if (newRole !== char.reinterpreted_role_kr || newPersonality !== char.reinterpreted_personality_kr) {
            console.log(`  Updating Character ${char.id}: ${char.reinterpreted_name_kr}`);
            await supabase.from('characters').update({
                reinterpreted_role_kr: newRole,
                reinterpreted_personality_kr: newPersonality
            }).eq('id', char.id);
        }
    }

    console.log('>>> Purification Complete.');
}

purify();
