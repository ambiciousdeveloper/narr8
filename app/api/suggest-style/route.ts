import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
    try {
        const { concept, lang } = await req.json();

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `
        Role: Story Stylist & Genre Specialist
        Task: Analyze the user's story concept and suggest the most appropriate bibliographic metadata.

        [User Concept]
        "${concept}"

        [Output JSON Schema]
        Return ONLY a JSON object with this structure:
        {
            "source_identity_kr": "Identified Original Title (KO)",
            "source_identity_en": "Identified Original Title (EN)",
            "source_author_kr": "Original Author (KO)",
            "source_author_en": "Original Author (EN)",
            "genre_kr": "Recommended Genre (KO)",
            "genre_en": "Recommended Genre (EN)",
            "story_tone_kr": "Recommended Tone (KO)",
            "story_tone_en": "Recommended Tone (EN)",
            "world_country_kr": "Setting Country (KO)",
            "world_country_en": "Setting Country (EN)",
            "world_city_kr": "Setting City (KO)",
            "world_city_en": "Setting City (EN)",
            "cultural_setting_kr": "Cultural Context (KO)",
            "cultural_setting_en": "Cultural Context (EN)",
            "art_style_kr": "Visual Style (KO)",
            "art_style_en": "Visual Style (EN)",
            "aesthetic_dna_kr": "Aesthetic Keyword (KO)",
            "aesthetic_dna_en": "Aesthetic Keyword (EN)",
            "cinematography_kr": "Camera Style (KO)",
            "cinematography_en": "Camera Style (EN)",
            "narrative_tempo_kr": "Pacing (KO)",
            "narrative_tempo_en": "Pacing (EN)",
            "audio_palette_bgm_kr": "Recommended BGM Style (KO) - e.g. 웅장한 오케스트라",
            "audio_palette_bgm_en": "Recommended BGM Style (EN) - e.g. Epic Orchestral",
            "audio_palette_ambience_kr": "Recommended Ambience (KO) - e.g. 빗소리와 천둥",
            "audio_palette_ambience_en": "Recommended Ambience (EN) - e.g. Rain & Thunder",
            "structure_l1_kr": "Saga Structure (KO)",
            "structure_l1_en": "Saga Structure (EN)",
            "structure_l2_kr": "Volume Structure (KO)",
            "structure_l2_en": "Volume Structure (EN)",
            "structure_l3_kr": "Chapter Structure (KO)",
            "structure_l3_en": "Chapter Structure (EN)"
        }

        [Instructions]
        - If the concept matches a famous existing work (e.g., Harry Potter, Dune), USE the official metadata.
        - If it's an original idea, suggest the best fitting metadata.
        - Ensure bilingual output (Korean/English).
        - AUDIO PALETTE: Ensure the BGM and Ambience "pair perfectly" with the Art Style and Aesthetic DNA.
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        let jsonString = text;
        const codeBlockMatch = text.match(/```(?:json)?([\s\S]*?)```/);
        if (codeBlockMatch) {
            jsonString = codeBlockMatch[1];
        }

        const data = JSON.parse(jsonString);
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("Suggest Style Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
