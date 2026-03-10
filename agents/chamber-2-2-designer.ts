import { GoogleGenerativeAI } from '@google/generative-ai';
import { AgentFactory, type AgentResponse } from './chamber-0-repository';

/**
 * Designer Agent Input Interface
 */
export interface DesignerInput {
  level: string;
  context: string;
  isAdapted: boolean;
  episodeNumber: number;
  totalEpisodes: number;
  previousContextState?: any;
  blueprintTimeline?: any[];
  blueprintCharacters?: any[]; // L1 character_arcs from blueprint
  timeAnchor?: string | null;
  sagaRange?: string;
  limitTime?: string;
  feedbackContext?: string;
  specificMission?: string;
  lastSentenceOfPreviousScene?: string;
  customSop?: string;
  forbiddenEvents?: string;
  remainingEvents?: string;
}

/**
 * Chamber 2-2: Designer Agent (Episode Architect)
 */
// [Technical Debt Clearance] Refactored for DB SOP & Strict V3.2 Schema
export async function analyzeSingleEpisode(input: DesignerInput): Promise<AgentResponse> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash", // [Confirmed] Using Flash 2.0
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  });

  const { episodeNumber, totalEpisodes } = input;

  // 1. Fetch SOP from DB if not provided
  if (!input.customSop) {
    // Fetch base instruction from DB
    let dbSop = await AgentFactory.fetchSOP('DESIGNER_CORE_INSTRUCTION');

    // Fallback if DB is empty (Safety Net)
    if (!dbSop) {
      dbSop = `[Fallback] Write Scene ${episodeNumber}. Focus on sensory details and character psychology.`;
    }

    // Replace dynamic placeholders
    input.customSop = dbSop
      .replace('{{episodeNumber}}', String(episodeNumber))
      .replace('{{totalEpisodes}}', String(totalEpisodes))
      .replace('{{level}}', input.level);
  }

  const prompt = buildDesignerPrompt(input);

  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount <= maxRetries) {
    try {
      console.log(`>>> [Chamber 2-2 Designer] Generating Ep ${episodeNumber}/${totalEpisodes}... (Try: ${retryCount + 1})`);
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return parseModelOutput(text);

    } catch (error: any) {
      if ((error.message?.includes('429') || error.message?.includes('Resource exhausted')) && retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 3000 + (Math.random() * 1000);
        console.warn(`>>> [Designer 429] Resource Exhausted. Retrying in ${Math.round(waitTime)}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        retryCount++;
        continue;
      }
      console.error(`>>> [Chamber 2-2 Error] Ep ${episodeNumber}:`, error);
      return { success: false, error: String(error) };
    }
  }
  return { success: false, error: `Designer API Limit Exceeded (Ep ${episodeNumber})` };
}

/**
 * Helper: Constructs the massive system prompt
 */
function buildDesignerPrompt(input: DesignerInput): string {
  const {
    level, context, isAdapted, episodeNumber, totalEpisodes,
    previousContextState, blueprintTimeline, blueprintCharacters, timeAnchor, sagaRange,
    feedbackContext, specificMission,
    customSop, forbiddenEvents, remainingEvents
  } = input;

  // Use the DB-fetched customSop directly. Hardcoded fallback removed.
  const STORY_HIERARCHY_SOP = customSop || "System Error: Missing SOP Instructions.";

  const schemaTip = getJsonSchema(episodeNumber);
  const previousStateContext = buildPreviousStateContext(input);
  const pacingGuide = calculatePacing(episodeNumber, totalEpisodes);
  const timelineContext = buildTimelineContext(blueprintTimeline || [], timeAnchor || "");

  // [REFACTOR] Robust Mission Parsing
  const { allowedEvents, curFocus } = parseMissionContext(specificMission);

  // [Technical Debt Clearance] Strict V3.2 Schema Enforcement
  const characterContext = blueprintCharacters && blueprintCharacters.length > 0
    ? `
    [MASTER CHARACTER LIST (L1 Blueprint)]
    You MUST use these character names ONLY WHEN they naturally appear in your assigned scene. 
    DO NOT forcefully inject them if they do not belong in this specific narrative beat.
    ${blueprintCharacters.map((c: any) => {
      // STRICT V3.2 MAPPING
      const origName = c.original_name_kr || c.original_name_en || "Unknown";
      const reinterpName = c.reinterpreted_name_kr || c.reinterpreted_name_en || c.original_name_kr || "Unknown";
      const role = c.reinterpreted_role_kr || c.original_role_kr || 'Unknown Role';

      return `- ${reinterpName} (${role})`;
    }).join('\n')}

    CRITICAL: For production consistency, you MUST identify and 'cast' every character who has dialogue or significant action. 
    1. **DB Characters**: When a DB character is naturally needed, use the EXACT names from the Master List above.
    2. **Functional NPCs (EXTRA)**: If a role is needed (e.g., "The Teacher", "Detective Choi", "Chief Lee") but not in the DB, CREATE them as new characters in the 'characters' array. 
       - **Strict Tier Rule**: Only characters with unique proper names (e.g., 'John Doe') can be MAIN/SUPPORTING. Others MUST be **EXTRA**.
    3. **Reason**: Every named person in your story MUST be registered so that we can generate their visual profile and voice beforehand.
    "Nameless" extras without dialogue do not need to be cast.
    ` : "[No character list provided. CAST new characters based on plot.]";

  return `
    Role: Story Architect (Sequential Scene Generator)
    
    ${STORY_HIERARCHY_SOP}

    [NARRATIVE HIERARCHY]
    - Level 1: Full Saga (The Book)
    - Level 2: Chapter (e.g., Genesis) -> This is the "Context" you received.
    - Level 3: Scene (Detailed events within the Chapter) -> **THIS IS YOUR TASK.**

    Task: You are writing **SCENE ${episodeNumber}** of **CHAPTER ${level}**.
    CRITICAL: This is only a small part of the whole story. Scene ${totalEpisodes} is just the end of Chapter ${level}.

    [PROGRESS STATUS]
    Episode: ${episodeNumber}/${totalEpisodes}

    [PARENT CONTEXT (L2)]
    ${context}

    ${characterContext}

    ${timelineContext}

    [SPECIFIC NARRATIVE MISSION (Your Assigned Slice)]
    ${specificMission}

    ${curFocus ? `[MANDATORY FOCUS]: ${curFocus}` : ""}

    ${allowedEvents ? `[YOUR EPISODE SCOPE]\n${allowedEvents}` : "No specific events. Use natural flow."}

    ${forbiddenEvents ? `[FORBIDDEN (Already Covered in Previous Episodes)]\n${forbiddenEvents}` : ""}

    ${remainingEvents ? `[RESERVED FOR FUTURE EPISODES]\n${remainingEvents}` : ""}

    ${previousStateContext}

    [PACING GUIDE]
    ${pacingGuide}

    ${feedbackContext ? `[CRITIC FEEDBACK (FIX THESE ISSUES)]\n${feedbackContext}` : ""}

    [CONSTRAINTS]
    - Time Anchor: ${timeAnchor || "N/A"} (Continue naturally from prior scene)
    - Saga Range: ${sagaRange || "Unknown Span"}
    - Format: Korean
    - Mode: ${isAdapted ? 'ADAPTED (각색)' : 'ORIGINAL (원작 분석)'}

    [FORESHADOWING INSTRUCTIONS]
    - Subtly plant clues that will pay off in later episodes.
    - If this is the FINAL episode of a volume, provide clear closure but leave micro-threads for next volume (if not final saga conclusion).

    [CORE MISSION: HIGH-RESOLUTION SCENING]
    - Your goal is NOT to summarize, but to **Directorially Orchestrate** the scene.
    - **Step-by-Step Beat Generation**: Break down the specific mission into **10-15 granular narrative beats**.
    - Each beat MUST contain: [ACTION / DIALOGUE / REACTION / SENSORY DETAIL].
    - Use the "Atmospheric Scening" protocol: Start with a sensory anchor (smell, sound, temperature) and maintain a cinematic pace.

    [OUTPUT REQUIREMENT]
    Output ONLY valid JSON in the following schema, NO MARKDOWN:
    ${schemaTip}

    [CRITICAL RULES]
    - MUST USE CHARACTER NAMES from the Master Character List above ONLY IF they fit the scene. Do NOT forcefully include all characters. Do NOT create abstract names like "Bus Passenger" or "Researcher (Voice)" for main/supporting characters.
    - [STRICT IP PROTECTION]: If the source material uses metaphors or references to existing famous IPs (e.g., "Voldemort", "Horcrux" from Harry Potter), DO NOT literally materialize characters, settings, or magic systems from those IPs. They are METAPHORS only. 
    - BILINGUAL REQUIREMENT: Every character MUST have BOTH Korean (_kr) AND English (_en) names.
    - If isAdapted=true, focus on creating rich profiles for 'reinterpreted_*' fields. 
    - Use MAIN/SUPPORT/EXTRA for tier correctly based on screen time: 
      * MAIN: Protagonist(s), appear in 4+ scenes across multiple episodes
      * SUPPORT: Key supporting roles, appear in 2-3 important scenes
      * EXTRA: Background characters, appear in 1 brief scene (waiters, guards, passersby)
    - Your episode number is ${episodeNumber}/${totalEpisodes}.
    - If this is Episode 1, set a strong hook. If final episode, provide resolution.
    - **[VOLUME REQUIREMENT]**: The \`synthesized_body_kr/en\` MUST be a rich, multi-paragraph sequence of events (at least 1,200 characters of treatment).
    - Do NOT repeat events from forbidden list.
    - Do NOT prematurely resolve events reserved for future episodes.

    ${isAdapted ? `
    [ADAPTATION INSTRUCTIONS - STRICT]
    - Reimagine the narrative creatively.
    - **[STRICT NAME PROTECTION]**: NEVER mention the original names (e.g., 'Harry', 'Dumbledore', 'Hogwarts') in your 'synthesized_body_kr/en'.
    - Use ONLY the reinterpreted names provided in the Master Character List. Original names are for internal mapping only and must NOT appear in the story prose.
    - Preserve core emotional beats but adapt cultural/setting details.
    - Make it feel fresh, not a translation.
    ` : ""}
  `;
}

/**
 * Helper: Validates and parses the specific mission/beat object.
 * Prevents silent failures by checking JSON structure explicitly.
 */
function parseMissionContext(specificMission?: string): { allowedEvents: string; curFocus: string } {
  // defaults
  let allowedEvents = "Follow natural flow";
  let curFocus = specificMission || "General Flow";

  if (!specificMission) return { allowedEvents, curFocus };

  try {
    // Only attempt parse if it looks like an object
    if (specificMission.trim().startsWith('{')) {
      const beat = JSON.parse(specificMission);

      // Check if it matches StoryBeat structure (assigned_events array existence)
      if (beat && typeof beat === 'object' && Array.isArray(beat.assigned_events)) {

        const events = beat.assigned_events.map((e: any) => `- ${e.description} (Density: ${e.density})`).join('\n');
        if (events.trim()) allowedEvents = events;

        // Rich Focus
        const parts = [];
        if (beat.resolution_focus) parts.push(`ZOOM 100x ON: ${beat.resolution_focus}`);
        if (beat.mission_kr) parts.push(`- Narrative Beat: ${beat.mission_kr}`);
        if (beat.camerawork) parts.push(`- Camerawork: ${beat.camerawork}`);

        if (parts.length > 0) curFocus = parts.join('\n');

      } else {
        // JSON is valid but not a StoryBeat? Use raw text provided in JSON or just stringify it.
        // This handles cases where specificMission might be a different JSON object.
        console.warn(">>> [Designer] Warning: input is JSON but missing 'assigned_events'. Using raw fallback.");
        curFocus = specificMission;
      }
    }
  } catch (e) {
    // Parsing failed. IF it started with '{', it was probably meant to be JSON.
    if (specificMission.trim().startsWith('{')) {
      console.warn(">>> [Designer] JSON Parse Warning: specificMission started with '{' but failed to parse. Using raw string.");
    }
    // Fallback to raw string
    curFocus = specificMission;
  }

  return { allowedEvents, curFocus };
}

/**
 * Helper: JSON Schema Definition
 */
function getJsonSchema(episodeNumber: number): string {
  return `
    {
      "episode": {
        "order_index": ${episodeNumber},
        "unit_title_kr": "Title (KO)",
        "unit_title_en": "Title (EN)",
        "original_context_kr": "Original Context",
        "synthesized_body_kr": "Full Synthesized Synopsis (KO - Integrated Prose)",
        "synthesized_body_en": "Synthesized Synopsis (EN)",
        "source_metadata": {
          "structure": {
            "introduction_kr": "Intro (Goal)",
            "development_kr": "Dev (Conflict)",
            "climax_kr": "Climax (Crisis)",
            "resolution_kr": "Res (Settlement)",
            "next_episode_hook": "Hook (Next)"
          },
          "context_state": {
            "timeline": {
              "meta": { "episode_number": ${episodeNumber}, "sequence_order": ${episodeNumber} },
              "story": {
                "current_time_kr": "Current Time (KO)",
                "end_time_kr": "End Time (KO)",
                "time_jump_kr": "Time Jump (KO - e.g. 3 years later)"
              }
            },
            "character_states": {
              "CharacterName": {
                "location": "Loc", "emotional_state": "Emo",
                "knowledge": { "knows": [], "suspects": [], "unaware": [] },
                "inventory": [], "decisions_made": []
              }
            },
            "revealed_information": [],
            "active_plot_threads": [],
            "foreshadowing": { "planted": [], "revealed": [] }
          },
          "blueprint_alignment": {
            "narrative_coordinates": {
              "narrative_progress": 0, // 0-100 Int
              "absolute_time_coordinate": "Time Coord",
              "pacing_check": "Diagnosis"
            }
          }
        }
      },
      "characters": [
        {
          "reinterpreted_name_kr": "각색된 한국 이름",
          "reinterpreted_name_en": "Reinterpreted Name (EN)",
          "reinterpreted_role_kr": "각색된 역할",
          "reinterpreted_role_en": "Reinterpreted Role",
          "reinterpreted_personality_kr": "각색된 성격/성향",
          "reinterpreted_personality_en": "Reinterpreted Personality",
          "reinterpreted_tier": "MAIN/SUPPORT/EXTRA",
          "aging_evolution_kr": "나이대별 성장 및 변화",
          "trauma_matrix_kr": { "type": "유형(KO)", "depth": "5", "description": "설명(KO)" },
          "trauma_matrix_en": { "type": "Type(EN)", "depth": "5", "description": "Description(EN)" }
        }
      ]
    }
  `;
}

/**
 * Helper: Previous State Formatting
 */
function buildPreviousStateContext(input: DesignerInput): string {
  const { previousContextState, episodeNumber } = input;
  if (!previousContextState) {
    return `
    [FIRST EPISODE]
    Establish the initial state clearly.
    Timeline: Start at the specific story time provided.
    `;
  }

  return `
    [PREVIOUS EPISODE ENDING STATE]
    Episode: ${previousContextState.timeline?.meta?.episode_number || episodeNumber - 1}
    Ended At: ${previousContextState.timeline?.story?.end_time_kr || 'Unknown'}
    
    Character Knowledge:
    ${JSON.stringify(previousContextState.character_states || {}, null, 2)}
    
    Active Threads:
    ${JSON.stringify(previousContextState.active_plot_threads || [])}
    `;
}

/**
 * Helper: Timeline Filtering
 */
function buildTimelineContext(blueprintTimeline: any[], timeAnchor: string): string {
  if (!blueprintTimeline || blueprintTimeline.length === 0) return "";

  const currentYearMatch = timeAnchor?.match(/(\d{4})/);
  const currentYear = currentYearMatch ? currentYearMatch[1] : "";

  const relevantEvents = blueprintTimeline.filter((t: any) => t.time_kr.includes(currentYear));
  const futureEvents = blueprintTimeline.filter((t: any) => !t.time_kr.includes(currentYear));

  return `
    [MASTER TIMELINE GUIDANCE]
    [CURRENT EVENTS]: ${relevantEvents.map((t: any) => `${t.time_kr}: ${t.event_kr}`).join(' / ')}
    [FUTURE EVENTS (BLOCKED)]: ${futureEvents.map((t: any) => `${t.time_kr}: ${t.event_kr}`).join(' / ')}
    `;
}

/**
 * Helper: Pacing Calculation
 */
function calculatePacing(episodeNumber: number, totalEpisodes: number): string {
  const progress = episodeNumber / totalEpisodes;
  if (totalEpisodes <= 3) {
    if (episodeNumber === 1) return "PHASE: SETUP & INCITING INCIDENT";
    if (episodeNumber === totalEpisodes) return "PHASE: CLIMAX & RESOLUTION";
    return "PHASE: RISING ACTION & MIDPOINT";
  }
  if (progress <= 0.2) return "PHASE: INTRODUCTION (Establish status quo)";
  if (progress <= 0.4) return "PHASE: RISING ACTION (Escalate conflicts)";
  if (progress <= 0.6) return "PHASE: MIDPOINT CRISIS (Point of no return)";
  if (progress <= 0.8) return "PHASE: FALLING ACTION (Pre-Climax)";
  return "PHASE: CLIMAX & RESOLUTION (Final Payoff)";
}

/**
 * Helper: Output Parser
 */
function parseModelOutput(text: string): AgentResponse {
  let jsonString = text.trim();

  // 1. Stage 1: Greedy search for the first root { or [
  const codeBlockMatch = text.match(/```(?:json)?([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonString = codeBlockMatch[1].trim();
  } else {
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    let startPos = -1;
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) startPos = firstBrace;
    else if (firstBracket !== -1) startPos = firstBracket;
    if (startPos !== -1) jsonString = text.substring(startPos);
  }

  const performRepairs = (input: string): string => {
    let s = input.trim();

    // Stage A: Handle Unterminated Strings & Escapes inside strings only
    s = s.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
      return match.replace(/[\x00-\x1F\x7F]/g, (char) => {
        if (char === '\n') return '\\n';
        if (char === '\r') return '\\r';
        if (char === '\t') return '\\t';
        return '';
      });
    });

    // Stage B: Fix missing colons (common LLM mistake: "key" "value")
    s = s.replace(/([{,]\s*"[^"]+")\s*"/g, '$1: "');

    // Stage C: Balance Structural Brackets & Extract FIRST complete object
    const stack: string[] = [];
    let currentInQuote = false;
    let endPos = s.length;
    let foundRoot = false;

    for (let i = 0; i < s.length; i++) {
      const char = s[i];
      if (char === '"' && (i === 0 || s[i - 1] !== '\\' || (i >= 2 && s[i - 2] === '\\'))) currentInQuote = !currentInQuote;
      if (!currentInQuote) {
        if (char === '{' || char === '[') {
          stack.push(char === '{' ? '}' : ']');
          foundRoot = true;
        } else if (char === '}' || char === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === char) {
            stack.pop();
            if (foundRoot && stack.length === 0) {
              endPos = i + 1;
              break;
            }
          }
        }
      }
    }

    s = s.substring(0, endPos);
    if (currentInQuote) {
      // [CRITICAL] Truncation Detection
      s += " [TRUNCATED]\"";
    }
    while (stack.length > 0) {
      if (s.trim().endsWith(':')) s += ' null';
      s += stack.pop();
    }

    // Stage D: Quality Fixes (Common LLM JSON bugs)
    s = s.replace(/\}\s*(?!\s*,)\s*\{/g, '}, {');
    s = s.replace(/,(\s*[}\]])/g, "$1");
    s = s.replace(/,\s*,/g, ",");

    return s;
  };

  try {
    const repaired = performRepairs(jsonString);
    return { success: true, data: JSON.parse(repaired), rawText: text };
  } catch (e: any) {
    console.warn(">>> [Designer] JSON Parse Failed:", e.message);
    return { success: false, error: `JSON Parse Error: ${e.message}`, rawText: text };
  }
}
