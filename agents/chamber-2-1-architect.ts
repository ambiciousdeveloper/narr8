import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AgentResponse } from './chamber-0-repository';
import { AgentFactory } from './chamber-0-repository';
import { GEMINI_MODEL } from '../lib/constants';

export class StoryArchitect {

  /**
   * Main Analysis Function
   */
  public static async analyze(level: string, context: string, isAdapted: boolean = false, extraContext?: any): Promise<AgentResponse> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        maxOutputTokens: 40000,
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

    // [.cursorrules Rule 3] Inject DB SOP if not provided
    if (!extraContext || !extraContext.customSop) {
      let sopType = '';

      if (level === 'L1') {
        sopType = isAdapted ? 'L1_ADAPTED' : 'L1_ORIGINAL';
      } else if (isAdapted && level !== 'L1') {
        sopType = 'L2_EXPANSION';
      }

      if (sopType) {
        const dbSop = await AgentFactory.fetchSOP(sopType);
        if (dbSop) {
          extraContext = { ...extraContext, customSop: dbSop };
          console.log(`>>> [SOP Loaded] ${sopType} fetched from DB`);
        } else {
          console.warn(`>>> [SOP Warning] ${sopType} not found in DB, using fallback`);
        }
      }
    }

    const prompt = buildArchitectPrompt(level, context, isAdapted, extraContext);
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount <= maxRetries) {
      try {
        console.log(`>>> [Chamber 2-1 Architect] 분석 시작 (시도: ${retryCount + 1}/${maxRetries + 1}): ${level} (${isAdapted ? '각색' : '원작'})...`);
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return safeParseJSON(text);

      } catch (error: any) {
        // 429 Too Many Requests check
        if ((error.message?.includes('429') || error.message?.includes('Resource exhausted')) && retryCount < maxRetries) {
          // Increase wait time: 3s, 6s, 12s + random jitter
          const waitTime = Math.pow(2, retryCount) * 3000 + (Math.random() * 1000);
          console.warn(`>>> [429 Error] 리소스 소진. ${Math.round(waitTime)}ms 후 재시도합니다... (시도 ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          retryCount++;
          continue;
        }

        console.error(">>> Architect Error:", error);
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: "API 요청 재시도 횟수를 초과했습니다." };
  }
}

/**
 * ---------------------------------------------------------
 * HELPER FUNCTIONS (Prompt Engineering)
 * ---------------------------------------------------------
 */

function buildArchitectPrompt(level: string, context: string, isAdapted: boolean, extraContext?: any): string {
  const schemaTip = getJsonSchema(level, isAdapted);
  const objective = getObjective(level, isAdapted);
  const instructions = getAdditionalInstructions(level, isAdapted, extraContext?.customSop);

  return `
      Role: Story Architect
      Objective: ${objective}
      Level: ${level}
      Branch: ${isAdapted ? "ADAPTED" : "ORIGINAL"}
      
      [Output Schema]
      ${schemaTip}
      
      [Instructions V2.6 - Saga Scope & Naming Diversity]
      1. 반드시 유효하고 완성된 JSON 형식으로만 반환할 것. 서술적인 설명이나 인사말 등을 절대 포함하지 말 것.
      2. [Saga Scope]: 만약 입력된 주제가 연작물(Series)인 경우, 특정 1권에 매몰되지 말고 **시리즈 전체의 대서사를 조망하는 아웃라인**을 추출할 것.
      3. [Naming Diversity Guide]: 인물 각색 시 배경에 관계없이 **AI가 흔히 생성하는 클리셰 이름을 절대 사용하지 마십시오.** (예: 금지어 - 흔한 성씨와 이름의 조합, 서브컬처에서 반복되는 전형적인 주인공명 등)
         - 대신 장르에 부합하는 개성 있는 이름을 고안하십시오 (예: 성씨 20종 활용 - 범, 제갈, 남궁, 견, 선우 등 특이 성씨 포함 권장).
      4. [L1 전구간 분석]: 시리즈 전체를 관통하는 핵심 고유 명사 및 설정(Glossary)을 15개 이상 추출할 것.
      5. [L1 아웃라인]: 전체 시리즈의 시작부터 최종 결말까지를 포함하여 약 800자 내외로 작성할 것 (synthesized_body_kr 또는 massive_saga_outline_kr).
      6. [L1 서사 설계]: 시리즈의 거대한 분기점(Timeline) 최소 5개, 복선(Foreshadowing) 최소 3개, 그리고 상위 5명의 인물 아크(Character Arcs)를 반드시 상세히 기술할 것. 빈 배열([])을 절대 반환하지 말 것.
      7. "_kr" 키에는 한국어를, "_en" 키에는 영어를 사용할 것. 스키마에 이중 언어 키가 있으면 반드시 둘 다 채울 것.
      8. [필수 섹션 충실도]:
         - "timeline": 시리즈의 거대한 분기점(Major Milestones)을 시간순으로 최소 5개 이상 기술할 것.
         - "character_arcs": 인물의 1권 시점 상태가 아닌, 시리즈 전체를 관통하는 '성장과 변화'의 시작-전환점-결말을 기록할 것.
      9. [인물 각색 규칙]:
         - isAdapted가 true인 경우, 원작 이름과 각색된 이름을 엄격히 매핑하고 aging_evolution을 시리즈 전체 타임라인에 맞춰 작성할 것.
         - **[핵심 - 이름 노출 금지]**: 각색된 아웃라인(synthesized_body_kr/en) 내에서는 **절대로 원작의 인물명, 고유 명사, 지명을 직접 노출하지 마십시오.** 
         - 예: '원작의 주인공 명칭'은 '각색된 새로운 이름'으로, '원작의 주요 배경'은 '새로운 장르적 근거지' 등으로 철저히 치환하여 작성할 것. 원작의 이름이 섞이면 세계관 몰입도가 깨집니다.
      10. ${isAdapted ? '[중요] 원작의 설정을 파괴적으로 재창조하십시오. (예: 고전적 배경 -> 미래적/현대적 집단). 장르, 시대상, 갈등의 양상을 창의적으로 비틀어 완전히 새로운 이야기를 구축할 것.' : '[CRITICAL] 원작 분석(Original Analysis) 시 제공된 JSON 스키마의 모든 필드를 빠짐없이 채우십시오. 특히 복선(Foreshadowing), 타임라인(Timeline), 인물(Character) 데이터는 원작의 텍스트에서 최대한 상세히 추출하여 기술해야 합니다. 빈 배열([])이나 null 반환을 엄격히 금지합니다.'}
      11. [Naming Pureness]: **JSON 출력 내의 모든 "name" 또는 "original_name" 필드에 '(원작)', '(각색)', '(Original)' 등의 접미사를 절대 붙이지 마십시오.** 오직 순수한 이름만 기입하십시오.
      12. [Leakage Guard]: **isAdapted=true인 경우, "name", "role", "personality" 등 모든 인물 관련 필드 내에서 원작의 고유 명칭을 절대 언급하지 마십시오.** 대신 해당 세계관의 각색된 이름을 사용하거나, 관계 중심형 표현을 사용하십시오.
      
      ${instructions}
      
      [Context]
      ${context.substring(0, 30000)}
    `;
}

function getObjective(level: string, isAdapted: boolean): string {
  if (level === 'L1') {
    return `Analyze the story and create a high-level Master Narrative Blueprint.
    [STRICT LIMIT] Extract EXACTLY 5 key characters that DEFINITELY appear in your generated outline.
    [CRITICAL] You MUST generate exactly 4 items in "structural_arc" (Introduction, Development, Turn, Conclusion).
    [BILINGUAL REQUIREMENT] Every character MUST have BOTH Korean (name_kr) AND English (name_en) names. If source is Korean-only, romanize or translate to English.`;
  }
  if (isAdapted) {
    return `Create structured list for ${level} based on ADAPTED BLUEPRINT.`;
  }
  return `Break down raw story into segments for ${level}.`;
}

function getAdditionalInstructions(level: string, isAdapted: boolean, customSop?: string): string {
  // [.cursorrules Rule 3 Compliance] 
  // All prompts MUST be fetched from agent_sop_registry (L1_ORIGINAL, L1_ADAPTED, L2_EXPANSION)
  // The caller (analyze function) handles DB fetch and passes it via customSop parameter

  if (!customSop) {
    console.error('[ARCHITECT ERROR] No SOP provided! Check DB fetch logic in analyze() function.');
    return '[CRITICAL ERROR: SOP must be fetched from agent_sop_registry]';
  }

  return customSop;
}

function getJsonSchema(level: string, isAdapted: boolean): string {
  // [L1 SCHEMA]
  if (level === 'L1') {
    if (isAdapted) {
      // [L1 ADAPTED SCHEMA] - Requires Reinterpreted Fields
      return `{
        "blueprint": {
          "synthesized_title_kr": "각색된 대서사 제목 (KO)",
          "synthesized_title_en": "Synthesized Saga Title (EN)",
          "synthesized_body_kr": "각색된 대서사 전체 아웃라인 (KO - 800자 이상)",
          "synthesized_body_en": "Synthesized Massive Saga Outline (EN)",
          "core_premise": { 
             "logline_kr": "각색된 로그라인 (KO)", "logline_en": "Logline (EN)",
             "theme_kr": "각색된 테마 (KO)", "theme_en": "Theme (EN)"
          },
          "world_bible": { 
             "era_kr": "각색된 시대적 배경 (KO)", "era_en": "Era (EN)",
             "location_kr": "각색된 공간적 배경 (KO)", "location_en": "Location (EN)",
             "system_kr": "각색된 사회/시스템 (KO)", "system_en": "System (EN)",
             "rules_kr": "각색된 기술/능력 규칙 (KO)", "rules_en": "Rules (EN)"
          },
          "glossary": [ { "term_kr": "신규 용어", "term_en": "Term", "def_kr": "정의", "def_en": "Def" } ],
          "structural_arc": [
            { "act_no": 1, "act_title_kr": "기 - 발단", "goal_kr": "각색된 도입부 목표", "assigned_volumes": ["Vol.1 (Ch.1-5)"], "volume_plan": [{ "vol_no": 1, "title_kr": "Title", "key_conflict_kr": "Conflict" }] },
            { "act_no": 2, "act_title_kr": "승 - 전개", "goal_kr": "각색된 전개 목표", "assigned_volumes": ["Vol.2 (Ch.1-5)"], "volume_plan": [{ "vol_no": 2, "title_kr": "Title", "key_conflict_kr": "Conflict" }] },
            { "act_no": 3, "act_title_kr": "전 - 절정", "goal_kr": "각색된 절정 목표", "assigned_volumes": ["Vol.3 (Ch.1-5)"], "volume_plan": [{ "vol_no": 3, "title_kr": "Title", "key_conflict_kr": "Conflict" }] },
            { "act_no": 4, "act_title_kr": "결 - 결말", "goal_kr": "각색된 결말 목표", "assigned_volumes": ["Vol.4 (Ch.1-3)"], "volume_plan": [{ "vol_no": 4, "title_kr": "Title", "key_conflict_kr": "Conflict" }] }
          ],
          "conflict_layers": { 
            "external_kr": "각색된 외적 갈등 상세", "external_en": "External Conflict", 
            "internal_kr": "각색된 내적 갈등 상세", "internal_en": "Internal Conflict" 
          },
          "theme_message": { "core_theme_kr": "각색된 핵심 주제", "core_theme_en": "Core Theme", "main_message_kr": "각색된 주요 메시지", "main_message_en": "Main Message" },
          "tone_guide": { "tone_kr": "각색된 문체 톤", "tone_en": "Tone", "atmosphere_kr": "분위기", "atmosphere_en": "Atmosphere" },
          "style_guide": { "prose_style_kr": "각색 문체", "visual_motifs_kr": "비주얼 모티프" },
          "foreshadowing_matrix": [{ "clue_kr": "각색된 복선", "meaning_kr": "의미", "seed_at": "Vol.1", "reveal_at": "Vol.4" }],
          "timeline": [{ "time_kr": "각색된 시점", "event_kr": "사건" }],
          "character_arcs": [
            { 
              "original_name_kr": "원작 이름 (매핑용)",
              "reinterpreted_name_kr": "각색된 이름 (필수 - 성씨 고유성 확보)",
              "reinterpreted_name_en": "Reinterpreted Name (EN)",
              "reinterpreted_role_kr": "각색된 역할 (필수 - 50자 내외 핵심 역할)",
              "reinterpreted_role_en": "Reinterpreted Role (EN)",
              "reinterpreted_tier_kr": "주연/조연/엑스트라",
              "reinterpreted_tier_en": "MAIN/SUPPORT/EXTRA"
            }
          ]
        },
        "characters": [
          { 
            "reinterpreted_name_kr": "각색된 이름 (필수)", 
            "reinterpreted_role_kr": "각색된 역할", 
            "tier": "MAIN/SUPPORTING/EXTRA"
          }
        ]
      }`;
    } else {
      // [L1 ORIGINAL SCHEMA] - Requires Original Analysis Fields
      return `{
        "blueprint": {
          "saga_title_kr": "대서사 제목 (KO)",
          "saga_title_en": "Saga Title (EN)",
          "massive_saga_outline_kr": "전체 대서사 아웃라인 (KO - 약 800자)",
          "massive_saga_outline_en": "Massive Saga Outline (EN - approx 800 chars)",
          "core_premise": { 
            "logline_kr": "한 문장 요약 (KO)", "logline_en": "Logline (EN)",
            "theme_kr": "테마 (KO)", "theme_en": "Theme (EN)"
          },
          "world_bible": { 
            "era_kr": "시대적 배경 상세 설명 (KO)", "era_en": "Detailed Era Setting (EN)",
            "location_kr": "공간적 배경 상세 설명 (KO)", "location_en": "Detailed Spatial Setting (EN)",
            "system_kr": "사회/시스템 상세 설명 (KO)", "system_en": "Detailed Social System (EN)",
            "rules_kr": "기술 및 능력 시스템 상세 규칙 (KO)", "rules_en": "Tech & Power System Detailed Rules (EN)"
          },
          "glossary": [
            { "term_kr": "용어 (KO)", "term_en": "Term (EN)", "def_kr": "정의 (KO)", "def_en": "Definition (EN)" }
          ],
          "structural_arc": [
            { 
              "act_no": 1, 
              "act_title_kr": "기 - 발단", 
              "act_title_en": "Setup",
              "goal_kr": "도입부의 구체적인 목표와 전개 계획 (KO - 100자 이상)",
              "goal_en": "Detailed goals and development plan for the introduction (EN - 100+ chars)",
              "assigned_volumes": ["Vol.1 (Ch.1-5)"],
              "volume_plan": [{ "vol_no": 1, "title_kr": "Volume 1 Title (KO)", "title_en": "Volume 1 Title (EN)", "key_conflict_kr": "핵심 갈등 (KO)", "key_conflict_en": "Core Conflict (EN)" }]
            },
            { "act_no": 2, "act_title_kr": "승 - 전개", "act_title_en": "Confrontation", "goal_kr": "갈등 심화 및 단계별 전개 상세 (KO)", "goal_en": "Details of conflict escalation and development (EN)", "assigned_volumes": ["Vol.2 (Ch.1-5)"], "volume_plan": [{ "vol_no": 2, "title_kr": "Title (KO)", "title_en": "Title (EN)", "key_conflict_kr": "Conflict (KO)", "key_conflict_en": "Conflict (EN)" }] },
            { "act_no": 3, "act_title_kr": "전 - 절정", "act_title_en": "Climax", "goal_kr": "위기 및 절정의 구체적인 연출 계획 (KO)", "goal_en": "Detailed plan for the crisis and climax (EN)", "assigned_volumes": ["Vol.3 (Ch.1-5)"], "volume_plan": [{ "vol_no": 3, "title_kr": "Title (KO)", "title_en": "Title (EN)", "key_conflict_kr": "Conflict (KO)", "key_conflict_en": "Conflict (EN)" }] },
            { "act_no": 4, "act_title_kr": "결 - 결말", "act_title_en": "Resolution", "goal_kr": "해소 과정 및 결말의 핵심 메시지 상세 (KO)", "goal_en": "Details of the resolution and core message (EN)", "assigned_volumes": ["Vol.4 (Ch.1-3)"], "volume_plan": [{ "vol_no": 4, "title_kr": "Title (KO)", "title_en": "Title (EN)", "key_conflict_kr": "Conflict (KO)", "key_conflict_en": "Conflict (EN)" }] }
          ],
          "conflict_layers": { 
            "external_kr": "외적 갈등의 상세한 내용과 필수 전개 양상 (KO)", "external_en": "Detailed description of external conflicts (EN)", 
            "internal_kr": "주인공의 내적 갈등 및 심리적 딜레마 상세 (KO - 필수)", "internal_en": "Detailed internal conflicts and dilemmas (EN - Required)" 
          },
          "theme_message": { "core_theme_kr": "핵심 주제 (KO)", "core_theme_en": "Core Theme (EN)", "main_message_kr": "주요 메시지 (KO)", "main_message_en": "Main Message (EN)" },
          "tone_guide": { "tone_kr": "문체 톤 (KO)", "tone_en": "Tone (EN)", "atmosphere_kr": "분위기 (KO)", "atmosphere_en": "Atmosphere (EN)" },
          "style_guide": { "prose_style_kr": "문장 스타일 (KO)", "prose_style_en": "Prose Style (EN)", "visual_motifs_kr": "비주얼 모티프 (KO)", "visual_motifs_en": "Visual Motifs (EN)" },
          "timeline": [{ "time_kr": "시점 (KO)", "time_en": "Time (EN)", "event_kr": "사건 상세 (KO)", "event_en": "Detailed Event (EN)" }],
          "foreshadowing_matrix": [{ "clue_kr": "단서", "clue_en": "Clue", "seed_at": "Vol.1", "reveal_at": "Vol.4", "meaning_kr": "의미", "meaning_en": "Meaning" }],
          "character_arcs": [
            { 
              "original_name_kr": "인물 성명",
              "original_name_en": "Original Name (EN)",
              "original_role_kr": "서사적 역할 (KO)",
              "original_role_en": "Narrative Role (EN)", 
              "tier": "MAIN/SUPPORT/EXTRA"
            }
          ]
        },
        "characters": [
          { 
            "reinterpreted_name_kr": "인물 성명 (KO)", 
            "reinterpreted_role_kr": "역할 (KO)", 
            "tier": "MAIN/SUPPORTING/EXTRA"
          }
        ]
      }`;
    }
  }

  // [L2, L3 SCHEMA]
  if (isAdapted) {
    return `{
      "items": [
        { 
          "order_index": 0, 
          "unit_type": "PROLOGUE", 
          "unit_title_kr": "프롤로그 제목", 
          "unit_title_en": "Prologue Title", 
          "original_context_kr": "원작 배경", 
          "synthesized_body_kr": "각색된 오프닝 시노프시스" 
        },
        { 
          "order_index": 1, 
          "unit_type": "CHAPTER", 
          "unit_title_kr": "첫 번째 챕터 제목", 
          "unit_title_en": "First Chapter Title", 
          "original_context_kr": "원작 줄거리", 
          "synthesized_body_kr": "각색된 챕터 줄거리" 
        }
      ],
      "characters": [
        { 
          "original_name_kr": "원작 이름 (매핑 시 필수)", 
          "original_name_en": "Original Name",
          "reinterpreted_name_kr": "각색 이름", 
          "reinterpreted_name_en": "Reinterpreted Name (EN)",
          "reinterpreted_role_kr": "각색 역할", 
          "reinterpreted_personality_kr": "각색된 성격/성향",
          "reinterpreted_personality_en": "Reinterpreted Personality (EN)",
          "tier": "MAIN/SUPPORT/EXTRA"
        }
      ]
    }`;
  }

  // Original mode schema (L2/L3)
  return `{
      "items": [
        { "order_index": 1, "unit_title_kr": "제목", "original_body_kr": "내용" }
      ],
      "characters": [
        { 
          "original_name_kr": "원작 인물명", 
          "original_role_kr": "원작 역할", 
          "tier": "MAIN/SUPPORT/EXTRA"
        }
      ]
    }`;
}

/**
 * ---------------------------------------------------------
 * HELPER FUNCTIONS (JSON Handling)
 * ---------------------------------------------------------
 */

function safeParseJSON(text: string): AgentResponse {
  let jsonString = text.trim();

  // 0. Stage 0: Code Block Extraction
  const codeBlockMatch = text.match(/```(?:json)?([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonString = codeBlockMatch[1].trim();
  } else {
    // 1. Stage 1: Search for the first root { or [
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    let startPos = -1;
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) startPos = firstBrace;
    else if (firstBracket !== -1) startPos = firstBracket;
    if (startPos !== -1) jsonString = text.substring(startPos);
  }

  const performRepairs = (input: string): string => {
    let s = input.trim();

    // [Step A] Handle unescaped newlines and raw control characters
    s = s.replace(/"((?:[^"\\]|\\.)*?)"/g, (match, content) => {
      return '"' + content.replace(/\n|[\x00-\x1F\x7F]/g, (char: string) => {
        if (char === '\n') return '\\n';
        if (char === '\r') return '\\r';
        if (char === '\t') return '\\t';
        return '';
      }) + '"';
    });

    // [Step B] Fix missing colons & commas manually (LLM noise cleanup)
    // B-1: Fix missing colon: "key" "value" or "key" {
    s = s.replace(/([{,]\s*"[^"]+")\s+("|\{|\[)/g, '$1: $2');

    // B-2: Fix missing comma between key-value pairs in objects (CRITICAL FIX)
    // Matches: "value" "nextKey": or 123 "nextKey": or true "nextKey":
    // This is the most common error in large LLM JSON blocks.
    s = s.replace(/("|\d|true|false|null|}|\])\s+("(?=[^"]+"\s*:))/g, '$1, $2');

    // B-3: Fix missing comma in arrays between elements
    // Matches: } { or ] [ or 123 { etc.
    s = s.replace(/(\})(\s*)(\{)/g, '}, $2{');
    s = s.replace(/(\])(\s*)(\[)/g, '], $2[');
    s = s.replace(/(\d|true|false|null|")\s+(\{|\[)/g, '$1, $2');

    // [Step C] Structural Balancing & Truncation Recovery
    const stack: string[] = [];
    let inQuote = false;
    let endPos = s.length;
    let foundRoot = false;

    for (let i = 0; i < s.length; i++) {
      const char = s[i];
      // Handle escaped quotes correctly: ignore \" but count \\" as an escaped backslash followed by a quote
      if (char === '"' && (i === 0 || s[i - 1] !== '\\' || (s[i - 1] === '\\' && s[i - 2] === '\\'))) {
        inQuote = !inQuote;
      }

      if (!inQuote) {
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
          } else if (foundRoot) {
            endPos = i;
            break;
          }
        }
      }
    }

    s = s.substring(0, endPos);

    if (inQuote) {
      // [CRITICAL] Truncation Detection
      // If we are ending inside a quote, it means the LLM response was cut off.
      // Append a warning to the truncated string so it's obvious to the user/logic.
      s = s.replace(/\\u[0-9a-fA-F]{0,3}$/, '');
      s = s.replace(/\\[^u]?$/, '');
      if (s.endsWith('\\')) s = s.slice(0, -1);
      s += " [TRUNCATED]\"";
    }

    while (stack.length > 0) {
      const needed = stack.pop();
      const trimmed = s.trim();
      if (trimmed.endsWith(':')) s += ' "..."';
      else if (trimmed.endsWith(',')) s = s.substring(0, s.lastIndexOf(','));
      else if (stack.length > 0 && needed === '}' && !trimmed.endsWith('{') && !trimmed.includes(':') && trimmed.lastIndexOf('"') > trimmed.lastIndexOf('{')) {
        // Heuristic: If we are closing an object and we seem to have a key without a value at the end
        s += ': "..."';
      }
      s += needed;
    }

    // Final Stage: Minor Cleanups
    s = s.replace(/,(\s*[\]}])/g, '$1');
    s = s.replace(/,\s*,/g, ',');

    return s;
  };

  try {
    const repaired = performRepairs(jsonString);
    return { success: true, data: JSON.parse(repaired), rawText: text };
  } catch (e1: any) {
    console.warn(">>> JSON Semi-Repair failed, attempting Multi-Stage Desperation Recovery...");

    // Attempt multiple cut points (try the last 5 structural closers)
    const cutPoints: number[] = [];
    let lastIdx = jsonString.length;
    for (let i = 0; i < 5; i++) {
      const b1 = jsonString.lastIndexOf('}', lastIdx - 1);
      const b2 = jsonString.lastIndexOf(']', lastIdx - 1);
      const cut = Math.max(b1, b2);
      if (cut === -1) break;
      cutPoints.push(cut);
      lastIdx = cut;
    }

    for (const cut of cutPoints) {
      try {
        const desperation = jsonString.substring(0, cut + 1);
        const finalTry = performRepairs(desperation);
        return { success: true, data: JSON.parse(finalTry), rawText: text };
      } catch (inner) { }
    }
    const errorPos = e1.message.match(/at position (\d+)/)?.[1];
    if (errorPos) {
      const pos = parseInt(errorPos);
      const snippet = text.substring(Math.max(0, pos - 40), Math.min(text.length, pos + 40));
      console.error(`>>> JSON Parse Critical Failure at pos ${pos}. Snippet: ...${snippet.replace(/\n/g, '\\n')}...`);
    } else {
      console.error(">>> JSON Parse Critical Failure:", e1.message);
    }
    return { success: false, error: `JSON Critical Failure: ${e1.message}`, rawText: text };
  }
}