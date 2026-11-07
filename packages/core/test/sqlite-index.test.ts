import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	MEMORY_INDEX_SCHEMA_VERSION,
	initializeMemoryIndexDatabase,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "prochat-sqlite-index-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("SQLite index schema", () => {
	it("creates the database file and required schema objects", async () => {
		const root = await createTemporaryDirectory();
		const indexFile = join(root, ".prochat", "index.sqlite");
		const index = initializeMemoryIndexDatabase(indexFile);

		try {
			const objects = index.database
				.prepare(`
          SELECT name, type
          FROM sqlite_master
          WHERE name IN (
            'memory_entries',
            'memory_entries_fts',
            'index_metadata'
          )
          ORDER BY name
        `)
				.all() as Array<{ name: string; type: string }>;

			expect(objects).toEqual([
				{ name: "index_metadata", type: "table" },
				{ name: "memory_entries", type: "table" },
				{ name: "memory_entries_fts", type: "table" },
			]);
		} finally {
			index.close();
		}

		expect((await stat(indexFile)).isFile()).toBe(true);
	});

	it("stores the schema version in SQLite metadata", async () => {
		const root = await createTemporaryDirectory();
		const index = initializeMemoryIndexDatabase(
			join(root, ".prochat", "index.sqlite"),
		);

		try {
			const userVersion = index.database
				.prepare("PRAGMA user_version")
				.get() as { user_version: number };
			const metadataVersion = index.database
				.prepare(
					"SELECT value FROM index_metadata WHERE key = 'schema_version'",
				)
				.get() as { value: string };

			expect(userVersion.user_version).toBe(MEMORY_INDEX_SCHEMA_VERSION);
			expect(metadataVersion.value).toBe(String(MEMORY_INDEX_SCHEMA_VERSION));
		} finally {
			index.close();
		}
	});

	it("can initialize the same disposable index more than once", async () => {
		const root = await createTemporaryDirectory();
		const indexFile = join(root, ".prochat", "index.sqlite");

		initializeMemoryIndexDatabase(indexFile).close();
		const reopened = initializeMemoryIndexDatabase(indexFile);

		try {
			const table = reopened.database
				.prepare("SELECT name FROM sqlite_master WHERE name = 'memory_entries'")
				.get() as { name: string };

			expect(table.name).toBe("memory_entries");
		} finally {
			reopened.close();
		}
	});
});
