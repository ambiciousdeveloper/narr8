/**
 * ============================================================
 * Central Constants Registry
 * ============================================================
 * 모든 AI 모델명, 기본값, 설정 상수를 이 파일에서 관리합니다.
 * 값을 변경할 때는 이 파일 한 곳만 수정하면 됩니다.
 *
 * 우선순위:
 *   system_config (Supabase) > agent_sop_registry > 이 파일의 상수값
 * ============================================================
 */

// ─── AI 모델 ──────────────────────────────────────────────────────────────────

/** 모든 에이전트 및 API 라우트에서 공통으로 사용하는 Gemini 모델 */
export const GEMINI_MODEL = "gemini-2.0-flash";

/** ElevenLabs TTS 모델 */
export const ELEVENLABS_MODEL = "eleven_multilingual_v2";

/** Replicate Flux Schnell 이미지 생성 모델 경로 */
export const REPLICATE_MODEL_FLUX_SCHNELL = "black-forest-labs/flux-schnell";

// ─── 소설 볼륨 설정 폴백 기본값 ────────────────────────────────────────────────
// 실제 적용 우선순위: system_config 테이블 → VOLUME_CONTROL_POLICY SOP → 아래 상수
//
// system_config 테이블 실제 키 이름:
//   NOVEL_DENSITY             → 소설 섹션당 기준 글자 수
//   SECTION_LIMIT             → 1회 패스당 최대 글자 수 (영문 기준)
//   NOVEL_DENSITY_KO_RATIO    → 한국어 소설 분량 비율 (영문 대비)

/** 소설 섹션당 기준 글자 수 (system_config: NOVEL_DENSITY) */
export const DEFAULT_NOVEL_DENSITY = 1200;

/** 소설 생성 1회 패스당 최대 한국어 글자 수 (system_config 별도 키 없음 → 이 값 사용) */
export const DEFAULT_SECTION_LIMIT_KO = 700;

/** 소설 생성 1회 패스당 최대 영어 글자 수 (system_config: SECTION_LIMIT) */
export const DEFAULT_SECTION_LIMIT_EN = 3000;

/** 한국어 소설의 밀도 비율 (system_config: NOVEL_DENSITY_KO_RATIO) */
export const DEFAULT_NOVEL_KO_RATIO = 0.42;

// ─── 스크립트 볼륨 설정 폴백 기본값 ───────────────────────────────────────────
// 실제 적용 우선순위: system_config 테이블 → VOLUME_CONTROL_POLICY SOP → 아래 상수
//
// system_config 테이블 실제 키 이름:
//   SCRIPT_DENSITY            → 스크립트 섹션당 기준 글자 수
//   SECTION_LIMIT             → 1회 패스당 최대 글자 수
//   SCRIPT_DENSITY_KO_RATIO   → 한국어 스크립트 분량 비율 (영문 대비)

/** 스크립트 섹션당 기준 글자 수 (system_config: SCRIPT_DENSITY) */
export const DEFAULT_SCRIPT_DENSITY = 800;

/** 스크립트 생성 1회 패스당 최대 글자 수 (system_config: SECTION_LIMIT) */
export const DEFAULT_SCRIPT_SECTION_LIMIT = 1500;

/** 한국어 스크립트의 밀도 비율 (system_config: SCRIPT_DENSITY_KO_RATIO) */
export const DEFAULT_SCRIPT_KO_RATIO = 0.50;

/** 한국어 대본 씬(S#) 1개당 평균 글자 수 (system_config: SCRIPT_SCENE_AVG_CHARS) */
export const DEFAULT_SCRIPT_SCENE_AVG_CHARS = 200;

// ─── 보이스 설정 기본값 ────────────────────────────────────────────────────────

/** 캐릭터 보이스 초기화 시 사용되는 기본 설정 */
export const INITIAL_VOICE_SETTINGS = {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.0,
    use_speaker_boost: true,
};

/**
 * 연령대별 ElevenLabs 보이스 설정
 * - OLD:    중후하고 안정적, 허스키한 노인톤
 * - MATURE: 중간 무게감, 절제된 개성
 * - YOUNG:  역동적이고 맑은 청년톤
 */
export const AGE_VOICE_SETTINGS = {
    OLD:    { stability: 0.75, similarity_boost: 0.65, style: 0.08 },
    MATURE: { stability: 0.60, similarity_boost: 0.70, style: 0.18 },
    YOUNG:  { stability: 0.35, similarity_boost: 0.80, style: 0.30 },
} as const;

/**
 * ElevenLabs API 장애 시 사용할 폴백 보이스 풀
 * 각 키는 "{gender}-{ageGroup}" 형태입니다.
 */
export const FALLBACK_VOICE_POOLS: Record<string, [string, string][]> = {
    'male-old': [
        ['VR6AewLTigWG4xSOukaG', 'Arnold (Fallback)'],
        ['N2lVS1wzEx9vC9n2BkoX', 'Josh (Old-Fallback)'],
        ['ErXwobaYiN019PkySvjV', 'Antoni (Old-Fallback)'],
    ],
    'male-middle aged': [
        ['TxGEqnHWrfWFTfGW9XjX', 'Josh (Fallback)'],
        ['ErXwobaYiN019PkySvjV', 'Antoni (Mature-Fallback)'],
        ['VR6AewLTigWG4xSOukaG', 'Arnold (Mature-Fallback)'],
    ],
    'male-young': [
        ['ErXwobaYiN019PkySvjV', 'Antoni (Fallback)'],
        ['TxGEqnHWrfWFTfGW9XjX', 'Josh (Young-Fallback)'],
    ],
    'female-old': [
        ['z9fAnlkpzviPz146aGWa', 'Glinda (Fallback)'],
        ['21m00Tcm4TlvDq8ikWAM', 'Rachel (Old-Fallback)'],
    ],
    'female-middle aged': [
        ['z9fAnlkpzviPz146aGWa', 'Glinda (Fallback)'],
        ['EXAVITQu4vr4xnSDxMaL', 'Bella (Fallback)'],
    ],
    'female-young': [
        ['21m00Tcm4TlvDq8ikWAM', 'Rachel (Fallback)'],
        ['EXAVITQu4vr4xnSDxMaL', 'Bella (Young-Fallback)'],
    ],
};

/** ElevenLabs 보이스 매칭용 퍼스널리티 키워드 맵 */
export const VOICE_KEYWORD_SCORE_MAP: Record<string, string[]> = {
    strong:        ['strong', 'powerful', 'commanding', 'authority', 'forceful', '강한', '강력', '권위', '카리스마'],
    soft:          ['soft', 'gentle', 'calm', 'warm', 'kind', 'tender', '부드러운', '따뜻한', '온화한', '친절'],
    raspy:         ['raspy', 'gravelly', 'rough', 'husky', 'gritty', '허스키', '거친', '굵은'],
    authoritative: ['boss', 'executive', 'leader', 'ceo', 'chief', 'president', 'magistrate', '대표', '대통령', '사장', '리더', '지도자'],
    villainous:    ['villain', 'manipulate', 'scheming', 'cold', 'ruthless', 'sinister', '악당', '조종', '냉혹', '잔인'],
    friendly:      ['friendly', 'cheerful', 'bright', 'outgoing', 'social', '쾌활', '명랑', '사교적', '친근한'],
    mysterious:    ['mysterious', 'enigmatic', 'secretive', 'quiet', 'introverted', '신비', '내성적', '조용한'],
    narrator:      ['narrator', 'narration', 'storytelling', '내레이터', '서술'],
};

// ─── 비주얼 생성 기본값 ────────────────────────────────────────────────────────
// project_master_config에 값이 없을 때 사용되는 폴백입니다.
// 프로젝트 고유 설정이 없는 경우의 최종 안전망 역할을 합니다.

export const DEFAULT_VISUAL_STYLE = {
    artStyleEn:        "photorealistic, high detail",
    aestheticDnaEn:    "cinematic lighting, 8k",
    cinematographyEn:  "shallow depth of field",
    genreEn:           "Cinematic",
    storyToneEn:       "Neutral",
};

export const DEFAULT_LOCATION_VISUAL_STYLE = {
    ...DEFAULT_VISUAL_STYLE,
    cinematographyEn: "wide angle, sharp focus",
};

/**
 * project_master_config에 세계관 정보가 없을 때 사용하는 폴백.
 * 프로젝트 생성 시 반드시 project_master_config에 값을 입력해야 합니다.
 */
export const DEFAULT_PROJECT_WORLD = {
    worldCountryEn:    "",
    worldCityEn:       "",
    culturalSettingEn: "",
};
