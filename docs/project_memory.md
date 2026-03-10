# 프로젝트 메모리 (Project Memory)

이 파일은 AI 에이전트가 마지막 작업 상태와 핵심 결정 사항을 스스로 기억하기 위해 유지하는 문서입니다.

## 1. 최근 주요 변경 사항
- **[DB]** `characters` 테이블 이중 언어 구조(`_kr`, `_en`)로 재설계됨.
  - 관련 파일: `database/recreate_characters_table.sql`
  - 핵심 변경: `original_name`, `original_role`, `original_personality`, `original_tier` 등 모든 컬럼을 `_kr`와 `_en`으로 분리. `aging_evolution`, `trauma_matrix`도 분리.
- **[Frontend]** `story-bible/page.tsx` UI 언어 적용.
  - `Adaptation Level` 슬라이더, `Auto-Sync` 토글 등을 `lang` 상태에 따라 한글/영어로 표기되도록 수정.
- **[Rules]** `.cursorrules` 파일 생성.
  - 한국어 답변 원칙, 코드 주석 한글화, 다국어 설계 원칙 준수 등 명시.

## 3. 백업 및 복구 기록 (Backup History)
- **[2026-02-12 23:30 KST]** 전방위 백업 완료
  - 위치: `/backups/`
  - 대상: `script-studio`, `story-bible`, `blueprint` (UI), `agents` (AI), `database/` (DB 스키마)
  - 목적: UI 정렬 복구 및 핵심 기능 안정성 확보 후 골든 이미지 생성

## 4. 미결 과제 (Pending Tasks)
- **DB 업데이트 대기:** 사용자가 `recreate_characters_table.sql`을 실행해야 함.
- **AI 재분석 대기:** SQL 실행 후 웹 대시보드에서 `[재분석]` 버튼을 눌러야 데이터가 채워짐.
- **영문 데이터 생성 설정:** AI가 `role_en`, `personality_en`, `aging_evolution_en` 데이터를 생성하도록 `chamber-2-1-architect.ts` 설정 완료. `api/analyze-story/route.ts`에서도 해당 데이터를 DB로 동기화하도록 매핑 완료 (Active).
