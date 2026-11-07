import { mkdirSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { WorkspaceConfig } from "./index.js";
import { parseMemoryMarkdown } from "./markdown.js";

export const MEMORY_INDEX_SCHEMA_VERSION = 1;

export interface MemoryIndexDatabase {
	readonly database: DatabaseSync;
	readonly path: string;
	close(): void;
}

export interface MemoryIndexRebuildResult {
	readonly indexedFiles: number;
	readonly indexFile: string;
}

export function initializeMemoryIndexDatabase(
	indexFile: string,
): MemoryIndexDatabase {
	mkdirSync(dirname(indexFile), { recursive: true });

	const database = new DatabaseSync(indexFile);

	database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA user_version = ${MEMORY_INDEX_SCHEMA_VERSION};

    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      source_path TEXT NOT NULL UNIQUE,
      scope TEXT NOT NULL CHECK (
        scope IN (
          'personal',
          'client-project',
          'cross-project',
          'company-approved'
        )
      ),
      status TEXT NOT NULL CHECK (
        status IN ('raw', 'draft', 'reviewed', 'trusted', 'deprecated')
      ),
      project_alias TEXT,
      name TEXT,
      created TEXT NOT NULL,
      last_reviewed TEXT,
      source_ref TEXT NOT NULL,
      body TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_entries_fts USING fts5(
      id UNINDEXED,
      name,
      body,
      source_ref,
      tokenize = 'unicode61'
    );

    CREATE TABLE IF NOT EXISTS index_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    INSERT INTO index_metadata (key, value)
    VALUES ('schema_version', '${MEMORY_INDEX_SCHEMA_VERSION}')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value;
  `);

	return {
		database,
		path: indexFile,
		close: () => database.close(),
	};
}

async function listMarkdownFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const path = join(directory, entry.name);

		if (entry.isDirectory()) {
			files.push(...(await listMarkdownFiles(path)));
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			files.push(path);
		}
	}

	return files.sort((left, right) => left.localeCompare(right));
}

export async function rebuildMemoryIndex(
	config: WorkspaceConfig,
): Promise<MemoryIndexRebuildResult> {
	const files = await listMarkdownFiles(config.memoryRoot);
	const parsedEntries = await Promise.all(
		files.map(async (path) => ({
			path,
			parsed: parseMemoryMarkdown(await readFile(path, "utf8")),
		})),
	);

	const index = initializeMemoryIndexDatabase(config.indexFile);
	const { database } = index;

	const insertMemory = database.prepare(`
    INSERT INTO memory_entries (
      id,
      source_path,
      scope,
      status,
      project_alias,
      name,
      created,
      last_reviewed,
      source_ref,
      body
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
	const insertSearch = database.prepare(`
    INSERT INTO memory_entries_fts (id, name, body, source_ref)
    VALUES (?, ?, ?, ?)
  `);

	try {
		database.exec("BEGIN IMMEDIATE");
		database.exec(
			"DELETE FROM memory_entries_fts; DELETE FROM memory_entries;",
		);

		for (const entry of parsedEntries) {
			const { metadata, body } = entry.parsed;
			const sourcePath = relative(config.memoryRoot, entry.path).replaceAll(
				"\\",
				"/",
			);

			insertMemory.run(
				metadata.id,
				sourcePath,
				metadata.scope,
				metadata.status,
				metadata.projectAlias ?? null,
				metadata.name ?? null,
				metadata.created,
				metadata.lastReviewed ?? null,
				metadata.sourceRef,
				body,
			);
			insertSearch.run(
				metadata.id,
				metadata.name ?? null,
				body,
				metadata.sourceRef,
			);
		}

		database.exec("COMMIT");
	} catch (error) {
		database.exec("ROLLBACK");
		throw error;
	} finally {
		index.close();
	}

	return {
		indexedFiles: parsedEntries.length,
		indexFile: config.indexFile,
	};
}
