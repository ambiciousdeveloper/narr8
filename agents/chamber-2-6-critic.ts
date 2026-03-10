import { GoogleGenerativeAI } from "@google/generative-ai";
import { AgentFactory } from './chamber-0-repository';
import { GEMINI_MODEL } from '../lib/constants';

interface CriticismResult {
    score: number;
    approved: boolean;
    issues: string[];
    feedback: string;
}

/**
 * Story Critic Agent
 * Analyzes a story segment against specific criteria (Time Ceiling, Logic, Character Age).
 */
export const StoryCritic = {
    async critique(
        storyBody: string,
        contextCheck: {
            limitTime?: string; // Time Ceiling
            timeAnchor?: string; // Current Anchor
            sagaRange?: string; // Total Saga Range
            characters?: any[]; // Character Data
            logicRules?: string[]; // Specific logic rules
        }
    ): Promise<CriticismResult> {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        const sop = await AgentFactory.fetchSOP('CRITIC_GUIDELINES');

        let prompt = sop || `
        Role: Senior Story Editor & Guardrail Auditor
        Task: Review the SCENE for Event Integrity and Narrative Progress.
        
        [INTEGRITY AUDIT RULES]
        1. **EVENT LOYALTY**: Did the writer only cover the assigned events?
           - Fail if: They summarized future events from the chapter.
           - Fail if: They repeated events already covered in previous scenes.
        2. **CAUSAL CONTINUITY**: Does the scene ignore or contradict previous facts?
        3. **TEMPORAL INTEGRITY**: Is the timeframe consistent with the Anchor?
        4. **LITERARY DENSITY**: Is the writing detailed (Show, Don't Tell) or just a summary?
        
        [STORY SEGMENT TO REVIEW]
        {{storyBody}}
        
        [AUDIT CONTEXT]
        - Allowed Events: {{allowedEvents}}
        - Current Anchor: {{timeAnchor}}
        - Saga Range: {{sagaRange}}
        
        [OUTPUT FORMAT]
        Return ONLY a JSON object:
        {
          "score": number (0-100),
          "approved": boolean (true if score >= 90),
          "issues": ["List of specific violations found..."],
          "feedback": "Direct instructions to the writer on how to fix Event Leaks or redundancy."
        }
      `;

        if (sop) {
            prompt = sop
                .replace('{{storyBody}}', storyBody)
                .replace('{{allowedEvents}}', contextCheck.logicRules?.join(', ') || "N/A")
                .replace('{{timeAnchor}}', contextCheck.timeAnchor || "N/A")
                .replace('{{sagaRange}}', contextCheck.sagaRange || "N/A");
        }

        try {
            const result = await model.generateContent(prompt);
            const text = result.response.text();

            // Clean JSON
            const jsonString = text.replace(/```json|```/g, "").trim();
            const data = JSON.parse(jsonString);

            return {
                score: data.score || 0,
                approved: data.approved || false,
                issues: data.issues || [],
                feedback: data.feedback || "No feedback provided."
            };
        } catch (error) {
            console.error(">>> Critic Agent Error:", error);
            // Fail safe: reject if critic fails to avoid saving low-quality content silently.
            // Caller should handle approved: false by logging a warning and continuing
            // (since critique is currently advisory, not a hard gate).
            return {
                score: 0,
                approved: false,
                issues: ["Critic Agent Failed - result unreliable"],
                feedback: "Critic system offline. Manual review recommended."
            };
        }
    }
};
