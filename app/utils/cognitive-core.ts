/**
 * [PRism Cognitive Core - Dynamic Edition]
 * No hardcoded lore. Driven purely by project_master_config.
 */

export const PRODUCTION_MODES: any = {
    SYNOPSIS: {
        temp: 0.4,
        topP: 0.5,
        analysis_depth: "Analyze core causality and thematic logic.",
        tone: "Analytical and precise."
    },
    NOVEL: {
        temp: 0.9,
        topP: 0.9,
        analysis_depth: "Deep sensory immersion and psychological resonance.",
        tone: "Poetic and cinematic."
    }
};

/**
 * Generates dynamic sensory keywords based on the project's genre and style.
 */
function generateDynamicSensory(genre: string, style: string) {
    const isSciFi = /cyber|space|tech|future/i.test(genre + style);
    const isFantasy = /magic|sword|ancient|myth/i.test(genre + style);

    if (isSciFi) return "Ozonated air, humming neon, metallic vibrations, sterile synthetics.";
    if (isFantasy) return "Smell of old parchment, torchlight flickering, damp stone, cold steel.";
    return "Ambient environment textures, emotional scent-markers, and situational sounds.";
}

export function getCognitiveConfig(mode: string, orderIndex: number, plot: string = "", project: any) {
    const baseMode = PRODUCTION_MODES[mode] || PRODUCTION_MODES.SYNOPSIS;

    const genre = project?.genre_kr || project?.genre_en || "General";
    const style = project?.art_style_kr || project?.art_style_en || "Cinematic";
    const mood = project?.story_tone_kr || project?.story_tone_en || "Balanced";

    // Chamber 2: Strategic Impact Assessment (Dynamic Keywords)
    const climaxKeywords = /death|battle|reveal|climax|collapse|war|죽음|전투|결전|붕괴|반전|고백/i;
    const isClimax = orderIndex % 10 === 0 || climaxKeywords.test(plot);
    const impactScore = isClimax ? 5 : 3;
    const loops = isClimax ? 3 : 1;

    const adjustedTemp = Math.min(1.0, baseMode.temp + (impactScore - 3) * 0.1);
    const sensoryKeywords = generateDynamicSensory(genre, style);

    return {
        temperature: adjustedTemp,
        topP: baseMode.topP,
        loops,
        isClimax,
        instruction: `
          [COGNITIVE ARCHITECTURE: ${project?.project_id || 'UNKNOWN'}]
          - WORLD DNA: Genre: ${genre} / Style: ${style} / Mood: ${mood}
          - AGENT ROLE: ${mode} (${baseMode.analysis_depth})
          - CREATIVE TONE: ${baseMode.tone}
          - SENSORY GUIDELINE: Emphasize textures like ${sensoryKeywords}
          - INTENSITY: ${isClimax ? 'MAXIMUM (Climax Node)' : 'STANDARD'}
          - RULE: Ensure narrative continuity and adhere strictly to the World DNA defined above.
        `
    };
}
