import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiKey);

async function repairTest1Locations() {
    console.log(">>> Starting Repair for Project 'test_1' Location Data...");

    const { data: locations, error } = await supabase
        .from('story_locations')
        .select('*')
        .eq('project_id', 'test_1');

    if (error || !locations) {
        console.error("Failed to fetch locations:", error);
        return;
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    for (const loc of locations) {
        console.log(`\n>>> Repairing: ${loc.name_kr}`);

        // Check for mismatch (School description in Bus title, etc)
        const prompt = `
      You are a professional translator and script editor. 
      The following location entry in our database has a mismatch or needs verification.
      
      Korean Title: ${loc.name_kr}
      Korean Description: ${loc.description_kr}
      Existing English Title: ${loc.name_en}
      Existing English Description: ${loc.description_en}

      TASK:
      1. Provide a strictly accurate English Title (name_en) for "${loc.name_kr}".
      2. Provide a strictly accurate, cinematic English Description (description_en) that matches ONLY the Korean Title and Korean Description.
      3. Provide 3-5 English Visual Traits (visual_traits_en).

      Return ONLY a JSON object:
      {
        "name_en": "...",
        "description_en": "...",
        "visual_traits_en": "..."
      }
    `;

        try {
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const repaired = JSON.parse(jsonMatch[0]);
                console.log(`   Repaired Data:`, repaired);

                const { error: updateErr } = await supabase
                    .from('story_locations')
                    .update({
                        name_en: repaired.name_en,
                        description_en: repaired.description_en,
                        visual_traits_en: repaired.visual_traits_en
                    })
                    .eq('id', loc.id);

                if (updateErr) console.error(`   Update failed for ${loc.id}:`, updateErr);
                else console.log(`   Successfully repaired ${loc.name_kr}`);
            }
        } catch (e) {
            console.error(`   Error repairing ${loc.name_kr}:`, e.message);
        }
    }
}

repairTest1Locations();
