/**
 * ============================================================
 * Entity Tracker
 * ============================================================
 * AI 기법: Entity Tracking
 *
 * 씬 간에 인물의 위치·감정 상태·소지품·지식·관계를 추적합니다.
 * 매 씬 생성 전에 현재 상태를 프롬프트에 주입하여
 * OOC(Out-of-Character) 대사 및 설정 모순을 방지합니다.
 * ============================================================
 */

export interface EntityState {
    id: string;
    name: string;
    location?: string;
    emotionalState?: string;
    inventory?: string[];
    knowledge?: string[];        // 이 에피소드까지 습득한 정보
    relationships?: Record<string, string>; // character_id → 관계 설명
    status: 'ACTIVE' | 'RETIRED' | 'DECEASED' | 'DEPARTED' | 'UNKNOWN';
    lastSceneIndex: number;
    history?: Array<{           // 최근 N개 상태 변화 이력
        sceneIndex: number;
        summary: string;
    }>;
}

export class EntityTracker {
    private states: Map<string, EntityState> = new Map();
    private readonly historyMaxLen = 5;

    /** 엔티티 초기 등록 */
    register(entity: Omit<EntityState, 'lastSceneIndex' | 'history'>): void {
        this.states.set(entity.id, {
            ...entity,
            inventory: entity.inventory ?? [],
            knowledge: entity.knowledge ?? [],
            relationships: entity.relationships ?? {},
            history: [],
            lastSceneIndex: -1,
        });
    }

    /**
     * 씬 생성 후 엔티티 상태 업데이트
     * delta에 포함된 필드만 갱신됩니다 (undefined 필드는 보존).
     */
    update(id: string, delta: Partial<EntityState>, sceneIndex: number, changeSummary?: string): void {
        const current = this.states.get(id);
        if (!current) {
            // 새 엔티티로 자동 등록
            this.states.set(id, {
                id,
                name: delta.name ?? id,
                status: delta.status ?? 'ACTIVE',
                inventory: delta.inventory ?? [],
                knowledge: delta.knowledge ?? [],
                relationships: delta.relationships ?? {},
                history: [],
                lastSceneIndex: sceneIndex,
                ...delta,
            });
            return;
        }

        // 목록 필드는 merge (완전 교체 아님)
        const mergedInventory = delta.inventory !== undefined
            ? [...new Set([...(current.inventory ?? []), ...delta.inventory])]
            : current.inventory;

        const mergedKnowledge = delta.knowledge !== undefined
            ? [...new Set([...(current.knowledge ?? []), ...delta.knowledge])]
            : current.knowledge;

        const mergedRelationships = delta.relationships !== undefined
            ? { ...(current.relationships ?? {}), ...delta.relationships }
            : current.relationships;

        const updatedHistory = changeSummary
            ? [...(current.history ?? []).slice(-(this.historyMaxLen - 1)),
               { sceneIndex, summary: changeSummary }]
            : current.history;

        this.states.set(id, {
            ...current,
            ...delta,
            inventory: mergedInventory,
            knowledge: mergedKnowledge,
            relationships: mergedRelationships,
            history: updatedHistory,
            lastSceneIndex: sceneIndex,
        });
    }

    /** 상태 제거 (특정 아이템을 잃었을 때 등) */
    removeFromInventory(id: string, item: string): void {
        const current = this.states.get(id);
        if (!current) return;
        this.states.set(id, {
            ...current,
            inventory: (current.inventory ?? []).filter(i => i !== item),
        });
    }

    get(id: string): EntityState | undefined {
        return this.states.get(id);
    }

    getAll(): EntityState[] {
        return Array.from(this.states.values());
    }

    getActive(): EntityState[] {
        return this.getAll().filter(e => e.status === 'ACTIVE');
    }

    /**
     * compress
     * 현재 엔티티 상태를 프롬프트 주입용 텍스트로 압축합니다.
     * 토큰을 절약하기 위해 ACTIVE 엔티티의 핵심 필드만 포함합니다.
     */
    compress(includeIds?: string[]): string {
        const targets = includeIds
            ? this.getAll().filter(e => includeIds.includes(e.id))
            : this.getActive();

        if (targets.length === 0) return '[Entity Tracker: No active entities]';

        const lines = targets.map(e => {
            const inv = (e.inventory ?? []).length > 0 ? `소지: ${e.inventory!.join(', ')}` : '';
            const know = (e.knowledge ?? []).length > 0 ? `지식: ${e.knowledge!.slice(-3).join('; ')}` : '';
            const rels = Object.entries(e.relationships ?? {}).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(', ');
            const parts = [
                `[${e.name}]`,
                `위치: ${e.location ?? '미확인'}`,
                `감정: ${e.emotionalState ?? '미확인'}`,
                `상태: ${e.status}`,
                inv,
                know,
                rels ? `관계: ${rels}` : '',
            ].filter(Boolean);
            return parts.join(' | ');
        });

        return `[ENTITY STATE — 현재 씬 시점 기준]\n${lines.join('\n')}`;
    }

    /** JSON 직렬화 (DB 저장용) */
    serialize(): Record<string, EntityState> {
        return Object.fromEntries(this.states.entries());
    }

    /** JSON에서 복원 (DB 로드용) */
    static deserialize(data: Record<string, EntityState>): EntityTracker {
        const tracker = new EntityTracker();
        for (const [id, state] of Object.entries(data)) {
            tracker.states.set(id, state);
        }
        return tracker;
    }

    /**
     * applyAuditUpdate
     * NarrativeAuditor의 audit 결과를 자동으로 반영합니다.
     */
    applyAuditUpdate(auditUpdates: Array<{
        character_id: string;
        status?: EntityState['status'];
        bound_location?: string;
        exit_reason?: string;
        narrative_state?: {
            emotional_state?: string;
            inventory?: string[];
            decisions_made?: string[];
            knowledge_gained?: string[];
        };
    }>, sceneIndex: number): void {
        for (const upd of auditUpdates) {
            const ns = upd.narrative_state ?? {};
            this.update(upd.character_id, {
                status: upd.status ?? 'ACTIVE',
                location: upd.bound_location,
                emotionalState: ns.emotional_state,
                inventory: ns.inventory,
                knowledge: ns.knowledge_gained,
            }, sceneIndex, upd.exit_reason);
        }
    }
}
