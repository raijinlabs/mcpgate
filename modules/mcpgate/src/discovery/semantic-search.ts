/**
 * Semantic tool discovery — TF-IDF + cosine similarity search.
 *
 * Builds an in-memory inverted index over tool names and descriptions.
 * At query time, computes TF-IDF vectors and returns tools ranked by
 * cosine similarity.  Zero external dependencies.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface ToolEntry {
  server_id: string
  server_name: string
  tool_name: string
  description: string
}

export interface SearchResult {
  server_id: string
  server_name: string
  tool_name: string
  description: string
  score: number
}

// ── Tokenizer ──────────────────────────────────────────────────────────

/** Simple tokenizer: lowercase, split on non-alphanumeric, remove stopwords. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet',
  'both', 'either', 'neither', 'each', 'every', 'all', 'any', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same',
  'than', 'too', 'very', 'just', 'because', 'if', 'when', 'where',
  'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
  'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
  'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
}

// ── TF-IDF Engine ──────────────────────────────────────────────────────

export class ToolSearchIndex {
  private entries: ToolEntry[] = []
  private tokensByDoc: string[][] = []
  private idf = new Map<string, number>()

  // ── index ─────────────────────────────────────────────────────────

  /** Build the index from a flat list of tools. Call once at startup. */
  index(tools: ToolEntry[]): void {
    this.entries = tools
    this.tokensByDoc = []
    const df = new Map<string, number>()

    // Tokenize each document (tool_name + description)
    for (const entry of tools) {
      const text = `${entry.tool_name} ${entry.description}`
      const tokens = tokenize(text)
      this.tokensByDoc.push(tokens)

      // Document frequency: count unique terms per doc
      const unique = new Set(tokens)
      for (const term of unique) {
        df.set(term, (df.get(term) ?? 0) + 1)
      }
    }

    // Compute IDF: log(N / df)
    const N = tools.length || 1
    this.idf.clear()
    for (const [term, count] of df) {
      this.idf.set(term, Math.log(N / count))
    }
  }

  // ── search ────────────────────────────────────────────────────────

  /** Search for tools matching the query. Returns top-K results sorted by score. */
  search(query: string, topK = 10): SearchResult[] {
    if (this.entries.length === 0) return []

    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    // Build query TF-IDF vector (sparse)
    const queryTf = new Map<string, number>()
    for (const t of queryTokens) {
      queryTf.set(t, (queryTf.get(t) ?? 0) + 1)
    }

    const scores: Array<{ index: number; score: number }> = []

    for (let i = 0; i < this.entries.length; i++) {
      const docTokens = this.tokensByDoc[i]
      if (docTokens.length === 0) continue

      // Doc TF
      const docTf = new Map<string, number>()
      for (const t of docTokens) {
        docTf.set(t, (docTf.get(t) ?? 0) + 1)
      }

      // Cosine similarity between query and doc TF-IDF vectors
      let dotProduct = 0
      let queryNorm = 0
      let docNorm = 0

      // Only iterate over query terms (sparse dot product)
      for (const [term, qtf] of queryTf) {
        const idf = this.idf.get(term) ?? 0
        const qWeight = qtf * idf
        queryNorm += qWeight * qWeight

        const dtf = docTf.get(term) ?? 0
        const dWeight = dtf * idf
        dotProduct += qWeight * dWeight
      }

      // Compute full doc norm for accurate cosine
      for (const [term, dtf] of docTf) {
        const idf = this.idf.get(term) ?? 0
        const dWeight = dtf * idf
        docNorm += dWeight * dWeight
      }

      const denom = Math.sqrt(queryNorm) * Math.sqrt(docNorm)
      const score = denom > 0 ? dotProduct / denom : 0

      if (score > 0) {
        scores.push({ index: i, score })
      }
    }

    // Sort by score descending, take top-K
    scores.sort((a, b) => b.score - a.score)

    return scores.slice(0, topK).map(({ index, score }) => ({
      server_id: this.entries[index].server_id,
      server_name: this.entries[index].server_name,
      tool_name: this.entries[index].tool_name,
      description: this.entries[index].description,
      score: Math.round(score * 1000) / 1000,  // 3 decimal places
    }))
  }

  /** Number of indexed tools. */
  get size(): number {
    return this.entries.length
  }
}
