import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const projectId = 'test_1';

async function testMapping() {
    const { data: blueprintData } = await supabase.from('story_blueprints').select('*').eq('project_id', projectId).eq('blueprint_type', 'ADAPTED').maybeSingle();
    const { data: originalBp } = await supabase.from('story_blueprints').select('*').eq('project_id', projectId).eq('blueprint_type', 'ORIGINAL').maybeSingle();

    const nameMap = {};
    const forbiddenNames = [];

    if (originalBp?.glossary && blueprintData?.glossary) {
        const originalGlossary = typeof originalBp.glossary === 'string' ? JSON.parse(originalBp.glossary) : originalBp.glossary;
        const adaptedGlossary = typeof blueprintData.glossary === 'string' ? JSON.parse(blueprintData.glossary) : blueprintData.glossary;

        originalGlossary.forEach((item, idx) => {
            const adaptedItem = adaptedGlossary[idx];
            if (item.term_kr && adaptedItem?.term_kr && item.term_kr !== adaptedItem.term_kr) {
                nameMap[item.term_kr] = adaptedItem.term_kr;
                forbiddenNames.push(item.term_kr);
            }
        });
    }

    console.log('--- TEST MAPPING RESULTS ---');
    console.log('Azkaban Map:', nameMap['아즈카반'] || 'NOT MAPPED');
    console.log('Horcrux Map:', nameMap['호크룩스'] || 'NOT MAPPED');
    console.log('Forbidden Count:', forbiddenNames.length);
}

testMapping();
