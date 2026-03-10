import { GoogleGenerativeAI } from '@google/generative-ai';
import { AgentFactory } from './chamber-0-repository';
import type { AgentResponse } from './chamber-0-repository';

/**
 * Chamber 2-6: Narrative Auditor
 * Responsibility: Analyzes the finished story to update character status (Lifecycle Management).
 */
export class NarrativeAuditor {
    public static async audit(
        storyText: string,
        characters: any[],
        episodeIndex: number,
        previousState: any = {},
        location: string = ""
    ): Promise<AgentResponse> {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1 // High objectivity required
            }
        });

        const sop = await AgentFactory.fetchSOP('AUDITOR_RULES');
        const charList = characters.map(c => `- ID: ${c.id}, Name: ${c.reinterpreted_name_kr || '이름 없음'}, Tier: ${c.tier || c.reinterpreted_tier_kr}`).join('\n');

        const prevStateContext = previousState && Object.keys(previousState).length > 0
            ? `[PREVIOUS NARRATIVE STATE (CUMULATIVE)]\n${JSON.stringify(previousState, null, 2)}`
            : "No previous state. This is the starting point.";

        let prompt = sop || `
            Task: You are a NARRATIVE AUDITOR. Your goal is to analyze the story text and update the status and narrative state of participating characters.
            
            [STORY TEXT]
            ${storyText}
            
            [PARTICIPATING CHARACTERS]
            ${charList}

            ${prevStateContext}
            
            [AUDIT GUIDELINES]
            1. **Active Status**: By default, characters remain 'ACTIVE'.
            2. **EXTRA Tier Policy**: EXTRA characters (Extras) are typically one-time roles. Set them to 'RETIRED' after their scene.
            3. **State Persistence (CUMULATIVE)**:
               - **Emotional State**: Extract current mood (e.g., "불안함", "결연함").
               - **Inventory**: Merge current findings with [PREVIOUS NARRATIVE STATE]. If an item is acquired, add it. If lost, remove it.
               - **Decisions**: List key choices made in this episode. Append to historical decisions if highly significant.
               - **Knowledge**: List critical info learned.
            
            [OUTPUT SCHEMA]
            Return a JSON object:
            {
              "updates": [
                {
                  "character_id": "uuid",
                  "status": "ACTIVE | RETIRED | DECEASED | DEPARTED",
                  "bound_location": "string | null",
                  "exit_reason": "string (KO)",
                  "narrative_state": {
                    "emotional_state": "string (KO)",
                    "inventory": ["string"],
                    "decisions_made": ["string"],
                    "knowledge_gained": ["string"]
                  }
                }
              ],
              "summary": "Professional summary in Korean"
            }
        `;

        if (sop) {
            prompt = sop
                .replace('{{storyText}}', storyText)
                .replace('{{characters}}', charList);
        }

        try {
            console.log(`>>> [Chamber 2-6 Auditor] Auditing Episode ${episodeIndex}...`);
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            return {
                success: true,
                data: JSON.parse(responseText.replace(/```json|```/g, "").trim()),
                rawText: responseText
            };
        } catch (error: any) {
            console.error(">>> Auditor Execution Error:", error);
            return { success: false, error: error.message };
        }
    }
}
