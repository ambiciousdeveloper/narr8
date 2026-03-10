import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export interface AgentResponse {
    success: boolean;
    data?: any;
    error?: string;
    rawText?: string;
}

export class AgentFactory {
    public static async fetchSOP(type: string): Promise<string> {
        try {
            const { data, error } = await supabase
                .from('agent_sop_registry')
                .select('instruction')
                .eq('sop_type', type)
                .eq('is_active', true)
                .single();

            if (error || !data) {
                console.warn(`[AgentFactory] SOP not found for ${type}, using fallback.`);
                return '';
            }
            return data.instruction;
        } catch (err) {
            console.error(`[AgentFactory] DB Error fetching SOP ${type}:`, err);
            return '';
        }
    }

    public static async createPrompt(geneType: string, customContext: string): Promise<string> {
        const coreBase = await this.fetchSOP('CORE_BASE');
        const geneSop = await this.fetchSOP(geneType);

        return `
      [CORE SYSTEM LOGIC]
      ${coreBase || '지정된 원칙을 준수하십시오.'}

      [SPECIALIZED GENE: ${geneType}]
      ${geneSop || '주어진 업무에 충실하십시오.'}

      [TASK CONTEXT]
      ${customContext}

      최종 결과물은 반드시 JSON 형식으로만 응답하십시오. (markdown backticks 사용 금지)
    `;
    }

    public static getModel(isPro: boolean = false) {
        // 최신 차세대 엔진 Gemini 2.0 Flash로 전면 교체
        return genAI.getGenerativeModel({
            model: "gemini-2.0-flash"
        });
    }

    /**
     * [Technical Debt Clearance] Fetch System Config
     */
    public static async fetchConfig(key: string, defaultValue: any): Promise<any> {
        try {
            const { data, error } = await supabase
                .from('system_config')
                .select('value')
                .eq('key', key)
                .single();

            if (error || !data) return defaultValue;

            // Handle numeric strings automatically
            const val = data.value;
            if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
                return Number(val);
            }
            return val;
        } catch (err) {
            console.warn(`[AgentFactory] Config fetch failed for ${key}, using default: ${defaultValue}`);
            return defaultValue;
        }
    }

    /**
     * Parse numerical values from VOLUME_CONTROL_POLICY SOP
     */
    public static parseVolumeConfig(sop: string, key: string, defaultValue: number): number {
        if (!sop) return defaultValue;
        // [V8.1 Zero-Conflict] Use word boundary \\b to prevent 'SECTION_LIMIT' from matching 'SECTION_LIMIT_KO'
        const regex = new RegExp(`\\b${key}\\b[^\\n]*?:?\\s*(\\d+\\.?\\d*)`, 'i');
        const match = sop.match(regex);
        if (match && match[1]) {
            return parseFloat(match[1]);
        }
        return defaultValue;
    }

}
