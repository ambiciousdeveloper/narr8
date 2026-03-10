import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
    try {
        const { projectId, episodeId, concept, lengthSettings } = await req.json();

        if (!projectId || !concept) {
            return NextResponse.json({ error: 'Missing projectId or concept' }, { status: 400 });
        }

        // 1. Fetch Core Data
        const { data: project } = await supabase.from('project_master_config').select('*').eq('project_id', projectId).single();
        if (!project) throw new Error('Project not found');

        const { data: story } = episodeId
            ? await supabase.from('story_summary').select('*').eq('id', episodeId).single()
            : { data: null };

        const { data: characters } = await supabase.from('characters').select('*').eq('project_id', projectId);
        const charContext = characters?.map(c =>
            `- New: ${c.reinterpreted_name_kr || c.reinterpreted_name_en} (${c.reinterpreted_role_kr || c.role_kr})`
        ).join('\n');

        const level = project.adaptation_level || 3;

        // 2. Continuity & Context (Story Chronicle)
        const { data: previousEpisodes } = await supabase
            .from('story_summary')
            .select('id, order_index, synthesized_title_kr, synthesized_body_kr, source_metadata')
            .eq('project_id', projectId)
            .eq('hierarchy_group', story?.hierarchy_group || 'L3')
            .lt('order_index', story?.order_index || 999)
            .eq('is_synthesized', true)
            .order('order_index', { ascending: true });

        const chronicle = previousEpisodes?.map(ep =>
            `Ep ${ep.order_index} [${ep.synthesized_title_kr}]: ${ep.synthesized_body_kr?.substring(0, 300)}...`
        ).join('\n\n') || "첫 번째 에피소드입니다.";

        // L2/Volume Context
        let foreshadowingNote = "";
        if (story?.parent_id) {
            const { data: parentStory } = await supabase
                .from('story_summary')
                .select('source_metadata')
                .eq('id', story.parent_id)
                .single();
            if (parentStory?.source_metadata?.foreshadowing_notes) {
                foreshadowingNote = `[FORESHADOWING INSTRUCTION]: ${parentStory.source_metadata.foreshadowing_notes}`;
            }
        }

        const worldSettings = `
          [ABSOLUTE GROUND TRUTH: WORLD SETTINGS]
          - Genre: ${project.genre_kr || project.target_genre || 'Fantasy'}
          - Tone: ${project.story_tone_kr || project.story_tone || 'Mysterious'}
          - World/City: ${project.world_city_kr || 'Unknown City'}
          - Cultural Background: ${project.cultural_setting_kr || 'N/A'}
          - Art Style: ${project.art_style_kr || project.art_style || 'High Fidelity'}
          ${foreshadowingNote}
        `;

        // 3. Blueprint Context
        const { data: blueprintData } = await supabase
            .from('story_blueprints')
            .select('*')
            .eq('project_id', projectId)
            .eq('blueprint_type', 'ADAPTED')
            .maybeSingle();

        const { data: originalBp } = await supabase
            .from('story_blueprints')
            .select('*')
            .eq('project_id', projectId)
            .eq('blueprint_type', 'ORIGINAL')
            .maybeSingle();

        const activeBlueprint = blueprintData || originalBp;

        // Helper to run scribe
        const runScribe = async (format: 'NOVEL' | 'SCRIPT', language: 'KO' | 'EN', targetLength: number) => {
            let result;
            if (format === 'NOVEL') {
                const { NovelScribe } = await import('../../../agents/chamber-2-4-novel');
                result = await NovelScribe.synthesize(
                    concept,
                    charContext || "정보 없음",
                    activeBlueprint,
                    level,
                    chronicle,
                    worldSettings,
                    'NOVEL',
                    language,
                    targetLength
                );
            } else {
                const { ScriptScribe } = await import('../../../agents/chamber-2-5-script');
                result = await ScriptScribe.synthesize(
                    concept,
                    charContext || "정보 없음",
                    activeBlueprint,
                    level,
                    chronicle,
                    worldSettings,
                    'SCRIPT',
                    language,
                    targetLength
                );
            }
            if (!result.success) throw new Error(`[Scribe Error ${format}-${language}] ${result.error}`);
            return result.data;
        };

        // Use lengthSettings from client or fallback to project default
        const defaultLen = Number(project.target_minutes || 30);
        const lengths = lengthSettings || {
            novel_kr: defaultLen,
            novel_en: defaultLen,
            script_kr: defaultLen,
            script_en: defaultLen
        };

        console.log(`>>> Starting Parallel Full-Stack Generation for project ${projectId}...`);

        const [novelKr, novelEn, scriptKr, scriptEn] = await Promise.all([
            runScribe('NOVEL', 'KO', lengths.novel_kr),
            runScribe('NOVEL', 'EN', lengths.novel_en),
            runScribe('SCRIPT', 'KO', lengths.script_kr),
            runScribe('SCRIPT', 'EN', lengths.script_en)
        ]);

        // 5. Combine Results
        const response = {
            novel_kr: novelKr.synthesized_kr,
            novel_en: novelEn.synthesized_en, // Use correct field for English
            script_kr: scriptKr.synthesized_kr,
            script_en: scriptEn.synthesized_en, // Use correct field for English
            metadata: {
                titles: {
                    novel_kr: novelKr.synthesized_title_kr,
                    novel_en: novelEn.synthesized_title_kr,
                    script_kr: scriptKr.synthesized_title_kr,
                    script_en: scriptEn.synthesized_title_kr
                },
                reasoning: novelKr.reasoning // Representative reasoning
            }
        };

        console.log(`>>> Parallel Generation Complete.`);
        console.log(`[Stats] Novel KR: ${response.novel_kr?.length || 0} chars, Novel EN: ${response.novel_en?.split(' ').length || 0} words`);
        console.log(`[Stats] Script KR: ${response.script_kr?.length || 0} chars, Script EN: ${response.script_en?.split(' ').length || 0} words`);

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('Full-Stack Generation Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
