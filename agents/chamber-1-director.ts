import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AgentResponse } from './chamber-0-repository';
import { GEMINI_MODEL } from '../lib/constants';

export class GrandDirector {

  /**
   * Chamber 0: 전략 및 세계관 설계 부서
   * 이사님의 비전을 구체적인 '각색 설계도(Narrative Blueprint)'로 구축합니다.
   * (DB SOP 의존성을 제거하고 하드코딩된 Robust Prompt 사용)
   */
  public static async buildBlueprint(inputJson: string, adaptationLevel: number): Promise<AgentResponse> {
    // 1. Input Parsing (Handle both raw string and JSON object string)
    let facts = inputJson;
    let characters: any[] = [];
    try {
      const parsed = JSON.parse(inputJson);
      if (parsed.facts) {
        facts = parsed.facts; // Main story content
        characters = parsed.characters || [];
      }
    } catch (e) {
      // If parsing fails, treat inputJson as raw text facts
    }

    // 2. Initialize Gemini Model (Direct instantiation for reliability)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    // 3. Construct System Instruction & Prompt
    const systemInstruction = `
        Role: Grand Architect (The Narrative Planner)
        Objective: Construct a detailed [Master Narrative Blueprint] based on the provided story context and adaptation level.
        
        [Adaptation Level: ${adaptationLevel}/5]
        - Level 1-2: Enhance strict structure and foreshadowing while keeping original plot.
        - Level 3-5: Reinterpret the structure, themes, and character arcs creatively.

        [Output JSON Schema]
        You MUST return ONLY a JSON object with this exact structure.
        Provide ALL text fields in both Korean (_kr) and English (_en).
        {
          "core_premise": { 
              "logline_kr": "핵심 한 줄 요약", "logline_en": "Key One-liner", 
              "theme_kr": "중심 테마", "theme_en": "Central Theme" 
          },
          "world_bible": {
            "era_kr": "시대적 배경", "era_en": "Period/Era Setting",
            "location_kr": "공간적 배경", "location_en": "Spatial Setting",
            "system_kr": "사회/정치 시스템", "system_en": "Social/Political System",
            "rules_kr": "기술/능력 시스템의 핵심 규칙 및 메커니즘", "rules_en": "Core rules and mechanisms of technology/power systems"
          },
          "glossary": [
            { "term_kr": "고유 용어", "term_en": "Unique Term", "def_kr": "용어 정의 및 설정", "def_en": "Definition and lore" }
          ],
          "conflict_layers": {
            "external_kr": "외적 갈등 (사건/대립)", "external_en": "External Conflict",
            "internal_kr": "내적 갈등 (심리/결핍)", "internal_en": "Internal Conflict"
          },
          "theme_message": {
            "core_theme_kr": "핵심 주제", "core_theme_en": "Core Theme",
            "main_message_kr": "전달하고자 하는 메시지", "main_message_en": "Primary Message"
          },
          "style_guide": {
            "tone_kr": "작품의 전체적 톤 (예: 다크 디스토피아)", "tone_en": "Overall Tone (e.g., Dark Dystopia)",
            "prose_style_kr": "문체 가이드라인", "prose_style_en": "Writing style guidelines",
            "visual_motifs_kr": "핵심 시각적/감각적 테마", "visual_motifs_en": "Key visual/sensory motifs"
          },
          "structural_arc": [
            // IMPORTANT: You MUST generate exactly 4 items (Acts 1-4) corresponding to Ki-Seung-Jeon-Gyeol.
            // Infer logical Volume assignments (e.g., 'Vol.1') based on story length. Assign at least one volume per act.
            { 
              "act_no": 1, 
              "act_title_kr": "기 - 발단", "act_title_en": "Setup", 
              "goal_kr": "소개 및 설정", "goal_en": "Introduction", 
              "assigned_volumes": ["Vol.1 (Ch.1-5)"] 
            },
            { 
              "act_no": 2, 
              "act_title_kr": "승 - 전개", "act_title_en": "Confrontation", 
              "goal_kr": "갈등 고조", "goal_en": "Conflict Rises", 
              "assigned_volumes": ["Vol.2 (Ch.1-6)", "Vol.3 (Ch.1-4)"] 
            },
            { 
              "act_no": 3, 
              "act_title_kr": "전 - 위기/절정", "act_title_en": "Resolution", 
              "goal_kr": "클라이막스", "goal_en": "Climax", 
              "assigned_volumes": ["Vol.4 (Ch.1-8)"] 
            },
            { 
              "act_no": 4, 
              "act_title_kr": "결 - 결말", "act_title_en": "Conclusion", 
              "goal_kr": "대단원", "goal_en": "Final Payoff", 
              "assigned_volumes": ["Vol.5 (Ch.1-3)"] 
            }
          ],
          "timeline": [
            { "time_kr": "시점", "time_en": "Timepoint", "event_kr": "핵심 사건 요약", "event_en": "Key Event Summary" }
          ],
          "foreshadowing_matrix": [
            { 
              "clue_kr": "단서 내용", "clue_en": "Clue content", 
              "seed_at": "Vol.1 (Ch.3)", "reveal_at": "Vol.4 (Ch.7)", 
              "meaning_kr": "의미 및 효과", "meaning_en": "Meaning & Payoff" 
            }
          ],
          "character_arcs": [
            { 
              "original_name_kr": "원작 이름 (KO)", 
              "original_name_en": "Original Name (EN)", 
              "reinterpreted_name_kr": "각색/생성된 이름 (KO)", 
              "reinterpreted_name_en": "Reinterpreted Name (EN)", 
              "role_kr": "역할 (KO)", "role_en": "Role (EN)",
              "personality_kr": "성격 (KO)", "personality_en": "Personality (EN)",
              "start_state_kr": "시작 상태 (KO)", "start_state_en": "Start State (EN)", 
              "end_state_kr": "종료 상태 (KO)", "end_state_en": "End State (EN)", 
              "turning_point_kr": "Vol.2 (Ch.5) - 사건 설명", "turning_point_en": "Vol.2 (Ch.5) - Event Description",
              "aging_evolution_kr": "나이대별 변화 (필수: 숫자 나이 포함, 예: 17세(미숙) -> 25세(성숙))",
              "aging_evolution_en": "Aging Evolution (Must include numeric age, e.g., 17yo -> 25yo)"
            }
          ],
        "characters": [
          { 
            "reinterpreted_name_kr": "원작 캐릭터의 각색 이름", 
            "reinterpreted_role_kr": "각색된 역할", 
            "reinterpreted_personality_kr": "각색된 성격",
            "tier": "MAIN/SUPPORTING/EXTRA"
          }
        ]
      }`;

    const prompt = `
        ${systemInstruction}
        
        [INSTRUCTION]
        - Analyze the provided STORY CONTEXT thoroughly.
        - Generate the designated fields in BOTH Korean and English.
        - [STRICT ADAPTATION RULE] If adaptation level > 0, **NEVER mention original character names or world terms** in reinterpreted fields or synthesized outlines.
        - [IMPORTANT] character_arcs MUST include ALL primary protagonists and central figures identified in the story context. Do not omit any main character's growth arc.
        - [IMPORTANT] assigned_volumes and foreshadowing points MUST include specific sub-unit coordinates (e.g., "Vol.1 (Ch.1-5)") to ensure L3-level precision throughout the blueprint.
        - [IMPORTANT] Create a robust Glossary with AT LEAST 20 UNIQUE TERMS and a detailed Timeline based on the context to ensure narrative consistency.
        - Even if the source is English, translate the content to Korean for _kr fields.
        - Even if the source is Korean, translate the content to English for _en fields.

        [STORY CONTEXT]
        ${facts.substring(0, 20000)}

        [CHARACTERS]
        ${JSON.stringify(characters).substring(0, 5000)}
        `;

    try {
      console.log('>>> [GrandDirector] Generating Blueprint...');
      const result = await model.generateContent(prompt);
      const text = result.response.text();

      // Extract JSON from potential markdown blocks
      let jsonString = text;
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        jsonString = match[0];
      }

      // [REPAIR 1] Definitively Fix Unescaped Control Characters ONLY inside String Values
      jsonString = jsonString.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
        return match.replace(/[\x00-\x1F\x7F]/g, (char) => {
          if (char === '\n') return '\\n';
          if (char === '\r') return '\\r';
          if (char === '\t') return '\\t';
          const hex = char.charCodeAt(0).toString(16).padStart(4, '0');
          return '\\u' + hex;
        });
      });

      // [REPAIR 2] Sanitize REMAINING Control Characters (Outside Strings)
      jsonString = jsonString.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");

      // [REPAIR 3] Fix Trailing Commas
      jsonString = jsonString.replace(/,(\s*[}\]])/g, "$1");

      return {
        success: true,
        data: JSON.parse(jsonString),
        rawText: text
      };
    } catch (error: any) {
      console.error("Blueprint Generation Failed:", error);
      return { success: false, error: error.message };
    }
  }

  public static async fillExtraNames(characters: any[], worldContext: any): Promise<any[]> {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

      const context = `
                 [WORLD CONTEXT]
                 World Name: ${worldContext.world_name_kr}
                 Genre/Tone: ${worldContext.genre || 'Fantasy'}
                 Naming Style: Create names fitting for this world.
     
                 [CHARACTERS TO NAMING]
                 ${characters.map(c => `- ID: ${c.id}, Original: ${c.original_name_en || c.original_name_kr || 'Unknown'}, Role: ${c.role_kr || 'Extra'}`).join('\n')}
     
                 [INSTRUCTION]
                 Generate distinct, fitting names for these extra characters.
                 Return a JSON array of objects with 'id' and 'new_name'.
                 Example: [{"id": "...", "new_name": "NewName"}]
             `;

      const prompt = `
                 You are the Naming Specialist.
                 Based on the world context, rename these extra characters to fit the setting.
                 Avoid using the original names if the adaptation level implies change.
                 Output ONLY valid JSON.
                 ${context}
             `;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\[[\s\S]*\]/);

      if (!jsonMatch) return [];
      return JSON.parse(jsonMatch[0]);

    } catch (error) {
      console.error("Naming failed:", error);
      return [];
    }
  }

  public static async orchestrate(taskId: string, payload: any): Promise<AgentResponse> {
    console.log(`[Chamber 0] Grand Director Orchestrating Task: ${taskId}`);
    return { success: true, data: { message: "Orchestration successful." } };
  }

  /**
   * [NEW v5.6] Recursive Beat Expansion
   * Turns a single synopsis into a detailed list of narrative beats for the Scribe.
   */
  public static async expandBeats(synopsis: string, worldSettings: string, charContext: string): Promise<string[]> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `
        Role: Master Narrative Architect
        Objective: Expand the provided synopsis into a detailed sequence of 8-15 narrative beats.
        
        [WORLD SETTINGS]
        ${worldSettings.substring(0, 5000)}

        [CHARACTER CONTEXT]
        ${charContext.substring(0, 5000)}

        [SYNOPSIS TO EXPAND]
        ${synopsis}

        [INSTRUCTION]
        - Break down the synopsis into a logical, high-tension sequence of beats.
        - Each beat must be descriptive, specifying the action, atmospheric details, and character focus.
        - These beats will be used by a Creative Scribe to write a full-length novel.
        - Return ONLY a JSON array of strings.
        - Example: ["Beat 1: Character enters the ruins, sensing a cold presence...", "Beat 2: Transition to a flashback..."]
    `;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
      return [synopsis]; // Fallback to original
    } catch (error) {
      console.error(">>> [GrandDirector] Beat Expansion Failed:", error);
      return [synopsis];
    }
  }

  /**
   * [NEW v7.0] Novel-to-Beat Extraction
   * Extracts precise narrative beats from an existing novel episode.
   * Used to ensure the screenplay stays perfectly in sync with the novel's pacing.
   */
  public static async extractBeatsFromProse(prose: string, charContext: string): Promise<string[]> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const prompt = `
        Role: Narrative Analyst for Screenplay Adaptation
        Objective: Deconstruct the provided NOVEL PROSE into a sequence of 8-15 screenplay-ready narrative beats.

        [INSTRUCTION]
        - Analyze the pacing, events, and dialogue in the prose.
        - The resulting beats must represent exactly what happens in this specific prose, no more, no less.
        - Each beat should describe a distinct scene or movement suitable for screenplay conversion.
        - CRITICAL: For each beat, you MUST specify what the character(s) SAY in that scene.
          If the prose has no dialogue, INVENT realistic dialogue that fits the scene and character.
          Format: "Beat N: [action description] — [CHARACTER NAME] says: '[invented dialogue line]'"
        - Every beat MUST include a spoken line. Beats with no dialogue are invalid.
        - Return ONLY a JSON array of strings.

        [CHARACTER CONTEXT]
        ${charContext}

        [NOVEL PROSE TO ANALYZE]
        ${prose.substring(0, 15000)}
    `;

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch {
          // Sanitize unescaped control characters inside JSON string tokens and retry
          const cleaned = match[0].replace(/"(?:[^"\\]|\\.)*"/g, (token) =>
            token
              .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
              .replace(/\n/g, '\\n')
              .replace(/\r/g, '\\r')
              .replace(/\t/g, '\\t')
          );
          try {
            const parsed = JSON.parse(cleaned);
            console.warn(`>>> [GrandDirector] Prose Extraction: Sanitized control chars, re-parsed ${parsed.length} beats.`);
            return parsed;
          } catch { /* fall through */ }
        }
      }
      return [prose.substring(0, 500)];
    } catch (error) {
      console.error(">>> [GrandDirector] Prose Extraction Failed:", error);
      return ["Beat 1: Analysis failed, falling back to raw prose content."];
    }
  }
}
