import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// =====================================================================
// FIX 1: SCRIBE_GUIDELINES_SCRIPT - 대본 전용 SOP
// 캐릭터 강제 바인딩 + 씬 중복 방지 포함
// =====================================================================
const scriptGuidelines = `[대본 집필 SOP - 시네마틱 스크립트 V1.0]

[CRITICAL: 캐릭터 아이덴티티 절대 사수 - CHARACTER LOCK]
이것은 최상위 규칙입니다. 다른 모든 창의적 지침보다 우선합니다.
1. 반드시 제공된 [Characters DB]에 등록된 이름(adapted_name_kr 또는 reinterpreted_name_kr)만 사용하십시오.
2. 등록되지 않은 새로운 주인공 이름을 임의로 창조하는 것은 엄격히 금지합니다.
3. 대사 화자명(캐릭터 큐)도 DB 이름과 100% 일치해야 합니다. 풀네임/단축명을 혼용하지 마십시오. 하나로 통일하십시오.

[CRITICAL: 씬 중복 금지 - ANTI-DUPLICATION]
1. 이미 작성한 씬과 동일하거나 유사한 내용(장소+사건 조합)을 반복 작성하지 마십시오.
2. 멀티 섹션 생성 시, [PREVIOUS SCENES] 컨텍스트를 반드시 확인하고 이미 작성한 사건/대화를 다시 쓰지 마십시오.
3. 같은 장소(예: INT. 은신처)에서 이미 발생한 동일 행동(자금 추적, 프로젝트 발견 등)이 다시 등장하면 즉시 다음 서사 단계로 전환하십시오.

[서사 연속성]
1. 제공된 [Chronicle/Previous Context]의 서사 단계를 정확히 파악하고, 그 다음 단계부터 작성하십시오.
2. 이미 해결된 사건이나 이미 만난 캐릭터를 처음 만나는 것처럼 묘사하는 것을 금지합니다.

[대본 형식 표준]
1. FORMAT: INT./EXT. 장소명 - 시간대 형식의 슬러그라인 사용
2. 구조: 슬러그라인 -> 액션라인(시각적 묘사) -> 캐릭터명 -> 대사 -> (괄호 지문)
3. 내면 묘사 금지. 화면에서 보이거나 들리는 것만 작성하십시오.
4. 대사 중심으로 이야기를 전달할 것
5. 한 씬당 최소 4-6번의 대화 교환 확보`;

// =====================================================================
// FIX 2: CRITIC_GUIDELINES - 캐릭터 이름 불일치 + 씬 중복 감지 룰 추가
// =====================================================================
const updatedCriticGuidelines = `Role: Senior Story Editor & Guardrail Auditor
Task: Review the SCENE for Event Integrity and Narrative Progress.

[INTEGRITY AUDIT RULES]
1. **EVENT LOYALTY**: Did the writer only cover the assigned events?
   - Fail if: They summarized future events from the chapter.
   - Fail if: They repeated events already covered in previous scenes.
2. **CAUSAL CONTINUITY**: Does the scene ignore or contradict previous facts?
3. **TEMPORAL INTEGRITY**: Is the timeframe consistent with the Anchor?
4. **LITERARY DENSITY**: Is the writing detailed (Show, Don't Tell) or just a summary?
5. **[CHARACTER LOCK]**: Are ALL character names exactly matching the DB registered names?
   - Fail if: A character appears with a name NOT in the provided character list.
   - Fail if: The same character is referred to by two different names in the same output (e.g., mixing full name and short name).
6. **[ANTI-DUPLICATION]**: Does this scene repeat a location+event combination already used?
   - Fail if: The same INT./EXT. location AND the same core action appear again (e.g., hacking the same target).
   - Fail if: Identical or near-identical dialogue exchanges are repeated across sections.

[STORY SEGMENT TO REVIEW]
{{storyBody}}

[AUDIT CONTEXT]
- Allowed Events: {{allowedEvents}}
- Current Anchor: {{timeAnchor}}
- Saga Range: {{sagaRange}}
- Character DB Names (ALL names in output MUST match exactly): {{characterNames}}

[OUTPUT FORMAT]
Return ONLY a JSON object:
{
  "score": number (0-100),
  "approved": boolean (true if score >= 90),
  "issues": ["List of specific violations found..."],
  "feedback": "Direct instructions to the writer on how to fix Event Leaks, name mismatches, or redundancy."
}`;

async function main() {
    console.log('\n🚀 Applying Script Consistency Fixes...\n');

    // Fix 1: Upsert SCRIBE_GUIDELINES_SCRIPT
    const { error: scriptErr } = await supabase
        .from('agent_sop_registry')
        .upsert({
            sop_type: 'SCRIBE_GUIDELINES_SCRIPT',
            version: 'v1.0',
            instruction: scriptGuidelines,
            is_active: true
        }, { onConflict: 'sop_type' });

    console.log('1. SCRIBE_GUIDELINES_SCRIPT:', scriptErr ? `❌ ${scriptErr.message}` : '✅ OK');

    // Fix 2: Update CRITIC_GUIDELINES
    const { error: criticErr } = await supabase
        .from('agent_sop_registry')
        .update({ instruction: updatedCriticGuidelines })
        .eq('sop_type', 'CRITIC_GUIDELINES');

    console.log('2. CRITIC_GUIDELINES (updated):', criticErr ? `❌ ${criticErr.message}` : '✅ OK');
}

main().catch(console.error);
