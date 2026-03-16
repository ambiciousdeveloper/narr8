/**
 * ============================================================
 * Narrative Graph
 * ============================================================
 * AI 기법: Narrative Graph
 *
 * 씬(Node)과 인과·시간·캐릭터 관계(Edge)를 그래프로 표현합니다.
 *
 * 활용:
 *   - 플롯 모순 탐지 (사이클 감지)
 *   - 캐릭터별 등장 씬 추적
 *   - 복선 → 개화 경로 시각화
 *   - 다음 씬 생성 시 관련 씬 컨텍스트 주입
 * ============================================================
 */

export interface SceneNode {
    id: string;                         // 고유 씬 ID
    index: number;                      // 씬 순서
    title?: string;
    summary?: string;                   // 씬 요약 (압축)
    location?: string;
    characterIds?: string[];
    keywords?: string[];               // 씬 핵심 키워드
    actNo?: number;                    // 기(1)·승(2)·전(3)·결(4)
    sceneType?: 'ACTION' | 'DIALOGUE' | 'REVELATION' | 'TRANSITION' | 'CLIMAX';
}

export interface SceneEdge {
    from: string;                       // source node id
    to: string;                         // target node id
    type: 'CAUSAL'           |          // A가 B를 야기함
          'TEMPORAL'         |          // A 이후 B
          'CHARACTER_LINK'   |          // 같은 캐릭터가 연결
          'FORESHADOWING'    |          // A가 B의 복선
          'PARALLEL'         |          // A와 B는 동시에 발생
          'CALLBACK';                   // B가 A를 회상·참조
    label?: string;                     // 관계 설명
    weight?: number;                    // 관련도 (0~1)
}

export interface PlotConflict {
    type: 'CYCLE' | 'ORPHAN' | 'TIMELINE_GAP' | 'UNREACHABLE_FORESHADOWING';
    description: string;
    involvedNodes: string[];
}

export class NarrativeGraph {
    private nodes: Map<string, SceneNode> = new Map();
    private edges: SceneEdge[] = [];

    // ─── 그래프 구성 ──────────────────────────────────────────────────────────

    addNode(node: SceneNode): void {
        this.nodes.set(node.id, node);
    }

    addEdge(edge: SceneEdge): void {
        // 중복 엣지 방지
        const exists = this.edges.some(
            e => e.from === edge.from && e.to === edge.to && e.type === edge.type
        );
        if (!exists) this.edges.push(edge);
    }

    updateNode(id: string, patch: Partial<SceneNode>): void {
        const current = this.nodes.get(id);
        if (current) this.nodes.set(id, { ...current, ...patch });
    }

    // ─── 쿼리 ─────────────────────────────────────────────────────────────────

    getNode(id: string): SceneNode | undefined {
        return this.nodes.get(id);
    }

    getAllNodes(): SceneNode[] {
        return Array.from(this.nodes.values()).sort((a, b) => a.index - b.index);
    }

    getEdges(fromId?: string, type?: SceneEdge['type']): SceneEdge[] {
        return this.edges.filter(e =>
            (!fromId || e.from === fromId) &&
            (!type   || e.type  === type)
        );
    }

    /** 해당 캐릭터가 등장하는 모든 씬 */
    getScenesByCharacter(characterId: string): SceneNode[] {
        return this.getAllNodes().filter(n =>
            (n.characterIds ?? []).includes(characterId)
        );
    }

    /** 복선 씬 → 개화 씬 경로 */
    getForeshadowingPaths(): Array<{ seed: SceneNode; reveal: SceneNode; label?: string }> {
        return this.edges
            .filter(e => e.type === 'FORESHADOWING')
            .map(e => ({
                seed: this.nodes.get(e.from)!,
                reveal: this.nodes.get(e.to)!,
                label: e.label,
            }))
            .filter(p => p.seed && p.reveal);
    }

    /** 이전 씬 N개 (슬라이딩 윈도우 보완용) */
    getPrecedingNodes(id: string, n = 2): SceneNode[] {
        const current = this.nodes.get(id);
        if (!current) return [];
        return this.getAllNodes()
            .filter(node => node.index < current.index)
            .slice(-n);
    }

    // ─── 플롯 모순 탐지 ───────────────────────────────────────────────────────

    /**
     * detectConflicts
     * 그래프 구조를 분석하여 잠재적인 플롯 문제를 반환합니다.
     */
    detectConflicts(): PlotConflict[] {
        const conflicts: PlotConflict[] = [];

        // 1. 사이클 탐지 (인과 관계에서 시간적 루프)
        const causalCycles = this.detectCycles('CAUSAL');
        for (const cycle of causalCycles) {
            conflicts.push({
                type: 'CYCLE',
                description: `인과 관계 사이클: ${cycle.join(' → ')} — 시간적 모순 가능성`,
                involvedNodes: cycle,
            });
        }

        // 2. 고립 씬 탐지 (어느 씬과도 연결되지 않은 씬)
        const connectedIds = new Set(this.edges.flatMap(e => [e.from, e.to]));
        for (const node of this.getAllNodes()) {
            if (this.nodes.size > 1 && !connectedIds.has(node.id)) {
                conflicts.push({
                    type: 'ORPHAN',
                    description: `고립 씬: S#${node.index}${node.title ? ` (${node.title})` : ''} — 다른 씬과 연결되지 않음`,
                    involvedNodes: [node.id],
                });
            }
        }

        // 3. 개화 없는 복선 탐지
        const foreshadowings = this.edges.filter(e => e.type === 'FORESHADOWING');
        const revealedIds = new Set(foreshadowings.map(e => e.to));
        for (const fe of foreshadowings) {
            if (!revealedIds.has(fe.to) || !this.nodes.has(fe.to)) {
                conflicts.push({
                    type: 'UNREACHABLE_FORESHADOWING',
                    description: `미개화 복선: S#${this.nodes.get(fe.from)?.index} → 아직 개화 씬 없음`,
                    involvedNodes: [fe.from],
                });
            }
        }

        return conflicts;
    }

    private detectCycles(type: SceneEdge['type']): string[][] {
        const adj = new Map<string, string[]>();
        for (const e of this.edges.filter(ed => ed.type === type)) {
            if (!adj.has(e.from)) adj.set(e.from, []);
            adj.get(e.from)!.push(e.to);
        }

        const visited = new Set<string>();
        const recStack = new Set<string>();
        const cycles: string[][] = [];

        const dfs = (node: string, path: string[]) => {
            visited.add(node);
            recStack.add(node);
            for (const neighbor of (adj.get(node) ?? [])) {
                if (!visited.has(neighbor)) {
                    dfs(neighbor, [...path, neighbor]);
                } else if (recStack.has(neighbor)) {
                    const cycleStart = path.indexOf(neighbor);
                    cycles.push(path.slice(cycleStart));
                }
            }
            recStack.delete(node);
        };

        for (const node of adj.keys()) {
            if (!visited.has(node)) dfs(node, [node]);
        }

        return cycles;
    }

    // ─── 프롬프트 주입 ────────────────────────────────────────────────────────

    /**
     * toContextBlock
     * 현재 씬 기준으로 연결된 관련 씬들을 프롬프트 주입용 텍스트로 반환합니다.
     */
    toContextBlock(currentNodeId: string): string {
        const preceding = this.getPrecedingNodes(currentNodeId, 2);
        const foreshadowPaths = this.getForeshadowingPaths().filter(
            p => p.reveal.id === currentNodeId
        );
        const conflicts = this.detectConflicts();

        const parts: string[] = ['[NARRATIVE GRAPH CONTEXT]'];

        if (preceding.length > 0) {
            const prevLines = preceding.map(n =>
                `  S#${n.index}${n.title ? ` "${n.title}"` : ''}: ${n.summary ?? '요약 없음'}`
            );
            parts.push(`선행 씬:\n${prevLines.join('\n')}`);
        }

        if (foreshadowPaths.length > 0) {
            const fsLines = foreshadowPaths.map(p =>
                `  복선 회수 — S#${p.seed.index}에서 심어진 "${p.label ?? '복선'}"을 이 씬에서 개화시킬 것`
            );
            parts.push(`복선 회수 알림:\n${fsLines.join('\n')}`);
        }

        if (conflicts.length > 0) {
            const warnLines = conflicts.slice(0, 3).map(c => `  ⚠️ ${c.description}`);
            parts.push(`잠재적 플롯 충돌:\n${warnLines.join('\n')}`);
        }

        return parts.join('\n\n');
    }

    /** JSON 직렬화 */
    serialize(): object {
        return {
            nodes: Array.from(this.nodes.values()),
            edges: this.edges,
        };
    }

    static deserialize(data: any): NarrativeGraph {
        const graph = new NarrativeGraph();
        for (const n of (data.nodes ?? [])) graph.addNode(n);
        for (const e of (data.edges ?? [])) graph.addEdge(e);
        return graph;
    }
}
