import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from '@/lib/constants';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
    try {
        const { projectId, episodeId } = await req.json();

        if (!projectId || !episodeId) {
            return NextResponse.json({ error: 'Missing projectId or episodeId' }, { status: 400 });
        }

        // 1. Fetch Episode Script
        const { data: episode } = await supabase
            .from('episodes')
            .select('script_kr')
            .eq('story_id', episodeId)
            .single();

        if (!episode?.script_kr) {
            return NextResponse.json({ error: 'Script not found for this episode' }, { status: 404 });
        }

        // 2. Fetch Project Assets (Characters, Locations, Props)
        const [
            { data: characters },
            { data: locations },
            { data: props },
            { data: voices }
        ] = await Promise.all([
            supabase.from('characters').select('id, reinterpreted_name_kr, reinterpreted_name_en').eq('project_id', projectId),
            supabase.from('story_locations').select('id, name_kr, name_en').eq('project_id', projectId),
            supabase.from('story_props').select('id, name_kr, name_en').eq('project_id', projectId),
            supabase.from('character_voices').select('id, character_id, audio_url').eq('project_id', projectId)
        ]);

        // 3. Asset Visuals (Get latest visual for each)
        const [
            { data: charVisuals },
            { data: locVisuals },
            { data: propVisuals }
        ] = await Promise.all([
            supabase.from('character_visuals').select('character_id, image_url').eq('project_id', projectId).order('created_at', { ascending: false }),
            supabase.from('location_visuals').select('location_id, image_url').eq('project_id', projectId).order('created_at', { ascending: false }),
            supabase.from('prop_visuals').select('prop_id, image_url').eq('project_id', projectId).order('created_at', { ascending: false }),
        ]);

        // Map visuals for easy lookup
        const charMap = new Map();
        characters?.forEach(c => {
            const visual = charVisuals?.find(v => v.character_id === c.id);
            const voice = voices?.find(v => v.character_id === c.id);
            charMap.set(c.reinterpreted_name_kr, { id: c.id, visual: visual?.image_url, voice: voice?.audio_url });
        });

        const locMap = new Map();
        locations?.forEach(l => {
            const visual = locVisuals?.find(v => v.location_id === l.id);
            locMap.set(l.name_kr, { id: l.id, visual: visual?.image_url });
        });

        const propMap = new Map();
        props?.forEach(p => {
            const visual = propVisuals?.find(v => v.prop_id === p.id);
            propMap.set(p.name_kr, { id: p.id, visual: visual?.image_url });
        });

        // 0. Fetch Existing Storyboard for Data Protection
        const { data: existingStoryboard } = await supabase
            .from('episode_storyboards')
            .select('timeline_data')
            .eq('episode_id', episodeId)
            .single();

        const existingClips = existingStoryboard?.timeline_data?.tracks[0]?.clips || [];

        // 4. Analyze Script via Gemini
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        const prompt = `
            Analyze the following screenplay and break it down into a sequence of "Shots" for video production.
            
            [SCREENPLAY]
            ${episode.script_kr}

            [AVAILABLE ENTITIES]
            Characters: ${Array.from(charMap.keys()).join(', ')}
            Locations: ${Array.from(locMap.keys()).join(', ')}
            Props: ${Array.from(propMap.keys()).join(', ')}

            [OUTPUT RULES]
            1. Output a JSON object with a "tracks" array.
            2. Each "Shot" must have:
               - "character": Character name (if speaking/present)
               - "location": Location name
               - "prop": Prop name (if relevant)
               - "dialogue": The line being spoken (if any)
               - "duration": Estimated duration in seconds (based on dialogue length)
            3. Group dialogue turns into logical shots.
            
            [SCHEMA]
            {
              "tracks": [
                {
                  "type": "video",
                  "clips": [
                    { "name": "Shot Name", "character": "...", "location": "...", "prop": "...", "dialogue": "...", "duration": 5 }
                  ]
                }
              ]
            }
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Failed to parse Gemini output');

        const rawTimeline = JSON.parse(jsonMatch[0]);

        // 5. Link Assets to Timeline
        if (!rawTimeline?.tracks?.[0]?.clips) {
            throw new Error('Invalid timeline structure: missing tracks or clips');
        }
        let currentTime = 0;
        const processedClips = rawTimeline.tracks[0].clips.map((clip: any, idx: number) => {
            const charData = charMap.get(clip.character);
            const locData = locMap.get(clip.location);
            const propData = propMap.get(clip.prop);

            // [Data Protection Logic]
            // Strictly NO raw materials in the final production. 
            // Only previously synthesized shots (/vault/storyboards/) are allowed.
            const existingShot = existingClips.find((c: any) => c.id === `shot_${idx}`);
            const isSynthesized = existingShot?.visual_url?.includes('/vault/storyboards/');

            const visualUrl = isSynthesized ? existingShot.visual_url : null;

            const shot = {
                ...clip,
                id: `shot_${idx}`,
                start: currentTime,
                character_id: charData?.id || null,
                location_id: locData?.id || null,
                prop_id: propData?.id || null,
                visual_url: visualUrl,
                audio_url: charData?.voice || null,
                color: charData ? 'bg-blue-500' : 'bg-gray-500'
            };
            currentTime += clip.duration;
            return shot;
        });

        // 5b. Fetch BGM Link
        const { data: bgmData } = await supabase
            .from('chapter_audio_assets')
            .select('storage_url')
            .eq('project_id', projectId)
            .eq('story_id', episodeId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        const finalTimeline = {
            bgm_url: bgmData?.storage_url || null,
            tracks: [
                { id: 'v1', type: 'video', name: 'Visual Layer', clips: processedClips },
                {
                    id: 'a1',
                    type: 'audio',
                    name: 'Voice/SFX',
                    clips: processedClips
                        .filter((c: any) => c.audio_url)
                        .map((c: any) => ({ ...c, color: 'bg-green-500' }))
                }
            ],
            duration: currentTime
        };

        // 6. Save to DB
        await supabase
            .from('episode_storyboards')
            .upsert({
                episode_id: episodeId,
                project_id: projectId,
                timeline_data: finalTimeline
            });

        return NextResponse.json(finalTimeline);

    } catch (error: any) {
        console.error('Breakdown Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
