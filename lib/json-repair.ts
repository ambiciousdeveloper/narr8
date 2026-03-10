import type { AgentResponse } from '../agents/chamber-0-repository';

/**
 * Shared JSON parsing utility for all Scribe agents.
 * Uses a multi-stage recovery strategy (parse → repair → last-resort regex).
 * Consolidated from chamber-2-4-novel.ts and chamber-2-5-script.ts to eliminate duplication.
 */

export function safeParseJSON(text: string): AgentResponse {
    let jsonString = text.trim();

    try {
        const codeBlockMatch = text.match(/```(?:json)?([\s\S]*?)```/);
        if (codeBlockMatch) {
            jsonString = codeBlockMatch[1].trim();
        } else {
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                jsonString = text.substring(firstBrace, lastBrace + 1);
            }
        }

        jsonString = jsonString
            .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "")
            .replace(/,(\s*[}\]])/g, "$1");

        return { success: true, data: JSON.parse(jsonString), rawText: text };
    } catch {
        return aggressiveRepairJSON(jsonString, text);
    }
}

function aggressiveRepairJSON(jsonString: string, originalText: string): AgentResponse {
    let repaired = jsonString;

    try {
        // Repair 1: Escape unescaped double quotes inside string values
        repaired = repaired.replace(/(": ")([\s\S]*?)(",?\n\s*")/g, (_match, prefix, content, suffix) => {
            const sanitized = content.replace(/(?<!\\)"/g, '\\"');
            return prefix + sanitized + suffix;
        });

        // Repair 2: Balance braces
        const openBraces = (repaired.match(/\{/g) || []).length;
        const closeBraces = (repaired.match(/\}/g) || []).length;
        if (openBraces > closeBraces) repaired += "}".repeat(openBraces - closeBraces);

        // Repair 3: Strip non-JSON wrapper
        const jsonMatch = repaired.match(/\{[\s\S]*\}/);
        if (jsonMatch) repaired = jsonMatch[0];

        return { success: true, data: JSON.parse(repaired), rawText: originalText };
    } catch {
        // Last resort: extract content field by regex
        const contentMatch = originalText.match(/"(?:content|prose|synthesized_kr|synthesized_en)":\s*"([\s\S]*?)"(?=\s*,\s*"|(?:\s*\n?\s*\}))/);
        if (contentMatch?.[1]) {
            const recovered = contentMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
            return {
                success: true,
                data: { content: recovered, reasoning: "JSON lost; prose recovered via regex." },
                rawText: originalText
            };
        }

        // Very last resort: treat raw text as content if no JSON at all
        if (originalText.length > 100 && !originalText.includes('{')) {
            return {
                success: true,
                data: { content: originalText.trim(), reasoning: "Raw text fallback (no JSON detected)" },
                rawText: originalText
            };
        }

        return { success: false, error: "JSON Parse Error", rawText: originalText };
    }
}
