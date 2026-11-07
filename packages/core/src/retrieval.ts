import type {
	MemoryScope,
	MemoryStatus,
	RetrievalResult,
	WorkspaceConfig,
} from "./index.js";
import { initializeMemoryIndexDatabase } from "./sqlite-index.js";
import { validateProjectAlias } from "./workspace.js";

export interface RetrieveMemoryInput {
	readonly projectAlias: string;
	readonly query: string;
	readonly limit?: number;
}

interface RetrievalRow {
	id: string;
	project_alias: string | null;
	scope: MemoryScope;
	status: MemoryStatus;
	source_path: string;
	last_reviewed: string | null;
	name: string | null;
	source_ref: string;
	body: string;
	text_rank: number;
}

const STATUS_BOOST: Readonly<Record<MemoryStatus, number>> = {
	trusted: 40,
	reviewed: 30,
	raw: 10,
	draft: 5,
	deprecated: -20,
};

function tokenizeQuery(query: string): string[] {
	return [
		...new Set(
			query
				.toLowerCase()
				.split(/[^a-z0-9]+/)
				.filter((term) => term.length > 1),
		),
	];
}

function buildFtsQuery(terms: readonly string[]): string {
	return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR ");
}

export function retrieveMemory(
	config: WorkspaceConfig,
	input: RetrieveMemoryInput,
): readonly RetrievalResult[] {
	const projectAlias = validateProjectAlias(input.projectAlias);
	const terms = tokenizeQuery(input.query.trim());

	if (terms.length === 0) {
		return [];
	}

	const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
	const index = initializeMemoryIndexDatabase(config.indexFile);

	try {
		const rows = index.database
			.prepare(`
        SELECT
          memory_entries.id,
          memory_entries.project_alias,
          memory_entries.scope,
          memory_entries.status,
          memory_entries.source_path,
          memory_entries.last_reviewed,
          memory_entries.name,
          memory_entries.source_ref,
          memory_entries.body,
          bm25(memory_entries_fts) AS text_rank
        FROM memory_entries_fts
        JOIN memory_entries ON memory_entries.id = memory_entries_fts.id
        WHERE memory_entries_fts MATCH ?
          AND memory_entries.status != 'deprecated'
          AND (
            memory_entries.scope IN ('personal', 'cross-project', 'company-approved')
            OR (
              memory_entries.scope = 'client-project'
              AND memory_entries.project_alias = ?
            )
          )
        ORDER BY text_rank ASC, memory_entries.id ASC
        LIMIT ?
      `)
			.all(
				buildFtsQuery(terms),
				projectAlias,
				limit,
			) as unknown as RetrievalRow[];

		return rows
			.map((row) => {
				const searchable = [row.name, row.body, row.source_ref]
					.filter((value): value is string => value !== null)
					.join(" ")
					.toLowerCase();
				const matchedTerms = terms.filter((term) => searchable.includes(term));
				const textScore = Math.max(0, 100 - Math.abs(row.text_rank) * 10);
				const score = textScore + STATUS_BOOST[row.status];
				const scopeExplanation =
					row.scope === "client-project"
						? `project '${projectAlias}'`
						: `${row.scope} scope`;

				const result: RetrievalResult = {
					memoryId: row.id,
					scope: row.scope,
					status: row.status,
					sourcePath: row.source_path,
					score,
					matchedTerms,
					explanation: `Matched ${matchedTerms.join(", ")} in ${scopeExplanation}; status ${row.status}.`,
				};

				if (row.project_alias !== null) {
					result.projectAlias = row.project_alias;
				}
				if (row.last_reviewed !== null) {
					result.lastReviewed = row.last_reviewed;
				}

				return result;
			})
			.sort(
				(left, right) =>
					right.score - left.score ||
					left.memoryId.localeCompare(right.memoryId),
			);
	} finally {
		index.close();
	}
}
