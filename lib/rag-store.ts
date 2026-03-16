/**
 * ============================================================
 * RAG Store (Retrieval-Augmented Generation)
 * ============================================================
 * AI 기법: Retrieval-Augmented Generation (RAG)
 *
 * 외부 벡터 DB 없이 TF-IDF 기반 코사인 유사도로
 * 관련 이전 씬·설정·용어를 검색하여 현재 생성 컨텍스트에 추가합니다.
 *
 * 활용 사례:
 *   - "이 씬에서 등장하는 장소에 대한 이전 묘사를 찾아 일관성 유지"
 *   - "같은 캐릭터가 나온 이전 씬을 참고하여 대사 톤 일관성 확보"
 *   - "특정 키워드와 관련된 복선(foreshadowing) 씬 검색"
 * ============================================================
 */

export interface RAGDocument {
    id: string;
    text: string;
    metadata: {
        type: 'SCENE' | 'CHARACTER' | 'GLOSSARY' | 'WORLD_BIBLE' | 'FORESHADOWING';
        sceneIndex?: number;
        title?: string;
        characterIds?: string[];
        tags?: string[];
    };
}

export interface RAGResult {
    document: RAGDocument;
    score: number; // cosine similarity 0~1
}

export class RAGStore {
    private documents: Array<RAGDocument & { tfidf: Map<string, number> }> = [];

    // ─── 공개 API ──────────────────────────────────────────────────────────────

    /** 문서 추가 */
    add(doc: RAGDocument): void {
        this.documents.push({
            ...doc,
            tfidf: this.computeTFIDF(doc.text),
        });
    }

    /** 여러 문서 일괄 추가 */
    addAll(docs: RAGDocument[]): void {
        for (const doc of docs) this.add(doc);
    }

    /**
     * search
     * 쿼리와 가장 유사한 문서 topK개를 반환합니다.
     * @param query 검색 쿼리 (자연어 또는 키워드)
     * @param topK 반환할 최대 결과 수
     * @param filter 특정 type만 검색하려면 지정
     */
    search(query: string, topK = 3, filter?: RAGDocument['metadata']['type']): RAGResult[] {
        if (this.documents.length === 0) return [];

        const queryTFIDF = this.computeTFIDF(query);
        const candidates = filter
            ? this.documents.filter(d => d.metadata.type === filter)
            : this.documents;

        const scored = candidates.map(doc => ({
            document: doc,
            score: this.cosineSimilarity(queryTFIDF, doc.tfidf),
        }));

        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .filter(r => r.score > 0.01); // 최소 관련성 필터
    }

    /**
     * buildContextBlock
     * 검색 결과를 프롬프트 주입용 텍스트 블록으로 변환합니다.
     */
    buildContextBlock(query: string, topK = 3, filter?: RAGDocument['metadata']['type']): string {
        const results = this.search(query, topK, filter);
        if (results.length === 0) return '';

        const blocks = results.map((r, i) => {
            const meta = r.document.metadata;
            const label = meta.title
                ? `[${meta.type} / ${meta.title}]`
                : `[${meta.type} #${meta.sceneIndex ?? i}]`;
            const preview = r.document.text.substring(0, 400);
            return `${label} (유사도: ${(r.score * 100).toFixed(1)}%)\n${preview}`;
        });

        return `[RAG RETRIEVED CONTEXT — 관련 이전 정보]\n${blocks.join('\n\n---\n')}`;
    }

    get documentCount(): number {
        return this.documents.length;
    }

    /** JSON 직렬화 (DB 저장용 - TF-IDF 제외) */
    serialize(): RAGDocument[] {
        return this.documents.map(({ tfidf, ...doc }) => doc);
    }

    /** 복원 (TF-IDF 재계산) */
    static deserialize(docs: RAGDocument[]): RAGStore {
        const store = new RAGStore();
        store.addAll(docs);
        return store;
    }

    // ─── 내부 TF-IDF ──────────────────────────────────────────────────────────

    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\w\s가-힣]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 1);
    }

    private computeTF(tokens: string[]): Map<string, number> {
        const tf = new Map<string, number>();
        for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
        // 정규화
        for (const [k, v] of tf) tf.set(k, v / tokens.length);
        return tf;
    }

    private computeIDF(term: string): number {
        const N = this.documents.length;
        if (N === 0) return 1;
        const df = this.documents.filter(d => d.tfidf.has(term)).length;
        return df === 0 ? 1 : Math.log((N + 1) / (df + 1)) + 1;
    }

    private computeTFIDF(text: string): Map<string, number> {
        const tokens = this.tokenize(text);
        const tf = this.computeTF(tokens);
        const tfidf = new Map<string, number>();
        for (const [term, tfScore] of tf) {
            tfidf.set(term, tfScore * this.computeIDF(term));
        }
        return tfidf;
    }

    private cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
        let dot = 0, normA = 0, normB = 0;
        for (const [k, v] of a) {
            dot += v * (b.get(k) ?? 0);
            normA += v * v;
        }
        for (const v of b.values()) normB += v * v;
        if (normA === 0 || normB === 0) return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
