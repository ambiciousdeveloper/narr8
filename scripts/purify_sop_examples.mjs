/**
 * purify_sop_examples.mjs
 * ============================================================
 * 특정 캐릭터명/지명/장르가 AI 환각을 유발하는 문제 해결.
 * SOP 예시들에서 하드코딩된 구체적 예시(견우, 서울, 2077, 해킹 등)를
 * 범용 형식 템플릿으로 교체하여 DB에 반영합니다.
 *
 * 실행: node scripts/purify_sop_examples.mjs
 * ============================================================
 */
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

// ─── L1 Naming Protocol (범용 버전) ─────────────────────────────────────────
const NAMING_PROTOCOL_CLEAN = `
[Authoritative Analysis & Naming Protocol]
- Rank characters by importance using **tier**: MAIN (Protagonist), SUPPORT (Supporting), EXTRA (Background).
- **[RULE]**: If a character is MAIN or SUPPORT, they MUST have a **Proper Name** (e.g., "[설정에 맞는 고유명]", "[A Name Fitting the World]").
- **Naming Strategy**: If the source text only refers to an important character by their role (e.g., "The Professor", "The Librarian"), you MUST **invent a fitting proper name** for them based on the setting (e.g., "[역할+설정에 어울리는 고유명]").
- **Generic Roles**: Characters who remain unnamed or are referred to as "Student 1", "Guard", "Janitor" MUST be assigned the **EXTRA** tier.
- Define their **role**: Explicitly state their narrative function. Do NOT leave as "Unknown".
`;

// ─── L2 Prologue SOP (범용 버전) ─────────────────────────────────────────────
const L2_EXPANSION_SOP_CLEAN = `
[L2 구조적 수평 확장 지침 - 한글 버전]
- **목표**: L1 내용을 챕터별로 확장하여, 10분 에피소드들이 탄생할 수 있는 풍성한 기초(L2)를 구축합니다.

[STRICT RULE: PROLOGUE FIRST]
- 모든 이야기는 반드시 **"Episode 0: Prologue (프롤로그)"**로 시작해야 합니다.
- 프롤로그의 \`order_index\`는 **0**으로 설정하며, \`unit_type\`은 **"PROLOGUE"**로 명시합니다.

[CRITICAL: PROLOGUE CONTENT STRUCTURE]
프롤로그는 다음 3단계 구조를 **반드시** 포함해야 합니다:

**1단계: Normal World (세계관 초기 상태)**
- 시공간 배경 제시 (연도, 장소, 사회 시스템)
- 주인공의 일상적 삶 묘사
- 형식: "[시대/장소 배경]. [세계관의 핵심 특징과 분위기]. [주인공]은 [현재의 일상적 상황]..."

**2단계: Character Introduction (주인공 소개)**
- 주인공의 핵심 특성 2-3가지
- 현재 상황 및 감정 상태
- 형식: "[나이/성장 맥락]의 [주인공]은 [핵심 특성 1]을 지녔지만, [내적 갈등 또는 현재의 결핍 상황]."

**3단계: Inciting Incident Foreshadowing (사건의 불씨 암시)**
- 평온을 깨뜨릴 사건의 징조
- 주인공에게 다가올 변화의 신호
- 형식: "[시점], [주인공]에게 [예상치 못한 사건 또는 징조]가 찾아왔다. [변화를 암시하는 단서나 긴장감]..."

[프롤로그 필수 요소 체크리스트]
✓ 시공간 배경이 명확히 제시되었는가?
✓ 주인공의 일상(Normal World)이 구체적으로 묘사되었는가?
✓ 주인공의 핵심 특성이 2가지 이상 드러났는가?
✓ Inciting Incident의 징조가 암시되었는가?
✓ 300자 이상의 충분한 분량인가?

[핵심 전술]
1. **마이크로 시닝 (4비트 구조)**: 모든 주요 사건을 [감각 설정 - 행동/대사 - 심리 묘사 - 여파]의 4단계로 확장하십시오.
2. **1:10 법칙**: 사건의 1초를 10문장의 묘사로 늘리십시오. 호흡을 늦추어 독자가 현장감을 느끼게 하는 것이 목적입니다.
3. **브릿지 장면 삽입**: 주요 Plot Point 사이에 이동, 대기, 준비, 식사 등 인물의 인간적 면모와 긴장감을 빌드업하는 '연결 장면'을 필수 창작하십시오.
4. **감정의 증폭**: 단편적 감정(슬펐다)을 생생한 반응(심장이 조여오고 숨이 가빠졌다)으로 상세화하십시오.

[출력 요구]
- 해당 챕터(L2)에 대해 최소 5~7개의 구체적인 Scene Beat를 생성하십시오.
`;

// ─── DB 반영 함수 ─────────────────────────────────────────────────────────────

async function patchSopNamingProtocol(sopType) {
    // 현재 활성 SOP 조회
    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('id, instruction, version')
        .eq('sop_type', sopType)
        .eq('is_active', true)
        .single();

    if (error || !data) {
        console.warn(`  ⚠️  ${sopType} 활성 SOP 없음 (건너뜀)`);
        return;
    }

    // 구체적 예시 패턴을 범용 형식으로 교체
    let updated = data.instruction
        .replace(
            /(e\.g\.,\s*)"이현우",\s*"Namgung Hyeon"/g,
            '$1"[설정에 맞는 고유명]", "[A Name Fitting the World]"'
        )
        .replace(
            /(e\.g\.,\s*)"사서 정수연"/g,
            '$1"[역할+설정에 어울리는 고유명]"'
        );

    if (updated === data.instruction) {
        console.log(`  ✅ ${sopType}: 이미 정리된 상태입니다.`);
        return;
    }

    const { error: updateErr } = await supabase
        .from('agent_sop_registry')
        .update({ instruction: updated, last_updated: new Date().toISOString() })
        .eq('id', data.id);

    if (updateErr) {
        console.error(`  ❌ ${sopType} 업데이트 실패:`, updateErr.message);
    } else {
        console.log(`  ✅ ${sopType}: 네이밍 예시 정리 완료 (${data.version})`);
    }
}

async function patchL2ExpansionSOP() {
    const { data, error } = await supabase
        .from('agent_sop_registry')
        .select('id, version')
        .eq('sop_type', 'L2_EXPANSION')
        .eq('is_active', true)
        .single();

    if (error || !data) {
        console.warn('  ⚠️  L2_EXPANSION 활성 SOP 없음 (건너뜀)');
        return;
    }

    const { error: updateErr } = await supabase
        .from('agent_sop_registry')
        .update({
            instruction: L2_EXPANSION_SOP_CLEAN,
            version: 'v1.2-generic',
            last_updated: new Date().toISOString()
        })
        .eq('id', data.id);

    if (updateErr) {
        console.error('  ❌ L2_EXPANSION 업데이트 실패:', updateErr.message);
    } else {
        console.log(`  ✅ L2_EXPANSION: 프롤로그 예시 정리 완료 (${data.version} → v1.2-generic)`);
    }
}

async function main() {
    console.log('\n🧹 SOP 예시 정화 시작 (특정 이름/지명/장르 → 범용 형식)\n');

    // L1 계열 SOPs - naming 예시 패치
    console.log('[L1 SOPs] 네이밍 예시 정화...');
    for (const sopType of ['L1_ORIGINAL', 'L1_ADAPTED']) {
        await patchSopNamingProtocol(sopType);
    }

    // L2_EXPANSION SOP - 프롤로그 예시 전면 교체
    console.log('\n[L2_EXPANSION SOP] 프롤로그 예시 정화...');
    await patchL2ExpansionSOP();

    console.log('\n✨ 완료. AI가 더 이상 특정 배경/이름에 편향되지 않습니다.\n');
}

main().catch(console.error);
