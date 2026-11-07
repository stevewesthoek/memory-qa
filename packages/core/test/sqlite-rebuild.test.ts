import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
	initializeMemoryIndexDatabase,
	initializeWorkspace,
	rebuildMemoryIndex,
	storeReviewedMemory,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

async function createWorkspace() {
	const root = await mkdtemp(join(tmpdir(), "prochat-index-rebuild-"));
	temporaryDirectories.push(root);
	return initializeWorkspace(root);
}

function reviewedMetadata(id: string, project = "retail-web") {
	return {
		id,
		scope: "client-project",
		status: "reviewed",
		created: "2026-06-19",
		source_ref: `sanitized-${id}`,
		name: id.replaceAll("-", " "),
		project,
	};
}

function readIndexedRows(indexFile: string) {
	const index = initializeMemoryIndexDatabase(indexFile);

	try {
		return index.database
			.prepare(`
        SELECT id, source_path, project_alias, body
        FROM memory_entries
        ORDER BY id
      `)
			.all() as Array<{
			id: string;
			source_path: string;
			project_alias: string | null;
			body: string;
		}>;
	} finally {
		index.close();
	}
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("SQLite index rebuild", () => {
	it("indexes nested project Markdown paths and FTS rows", async () => {
		const config = await createWorkspace();
		await storeReviewedMemory(
			config,
			reviewedMetadata("login-selector-failure"),
			"Use the stable data-testid selector.",
		);
		await storeReviewedMemory(
			config,
			reviewedMetadata("checkout-timeout", "storefront"),
			"The checkout request can timeout after a deployment.",
		);

		const result = await rebuildMemoryIndex(config);
		const rows = readIndexedRows(config.indexFile);
		const index = initializeMemoryIndexDatabase(config.indexFile);

		try {
			const ftsRows = index.database
				.prepare("SELECT id FROM memory_entries_fts ORDER BY id")
				.all() as Array<{ id: string }>;

			expect(result).toEqual({ indexedFiles: 2, indexFile: config.indexFile });
			expect(rows).toEqual([
				{
					id: "checkout-timeout",
					source_path: "client-project/storefront/checkout-timeout.md",
					project_alias: "storefront",
					body: "The checkout request can timeout after a deployment.",
				},
				{
					id: "login-selector-failure",
					source_path: "client-project/retail-web/login-selector-failure.md",
					project_alias: "retail-web",
					body: "Use the stable data-testid selector.",
				},
			]);
			expect(ftsRows).toEqual([
				{ id: "checkout-timeout" },
				{ id: "login-selector-failure" },
			]);
		} finally {
			index.close();
		}
	});

	it("rebuilds an empty repository", async () => {
		const config = await createWorkspace();

		const result = await rebuildMemoryIndex(config);

		expect(result.indexedFiles).toBe(0);
		expect(readIndexedRows(config.indexFile)).toEqual([]);
	});

	it("is repeatable without duplicating indexed rows", async () => {
		const config = await createWorkspace();
		await storeReviewedMemory(
			config,
			reviewedMetadata("login-selector-failure"),
			"Stable selector guidance.",
		);

		await rebuildMemoryIndex(config);
		await rebuildMemoryIndex(config);

		expect(readIndexedRows(config.indexFile)).toHaveLength(1);
	});

	it("removes index rows when Markdown files are removed", async () => {
		const config = await createWorkspace();
		const first = await storeReviewedMemory(
			config,
			reviewedMetadata("login-selector-failure"),
			"Stable selector guidance.",
		);
		await storeReviewedMemory(
			config,
			reviewedMetadata("checkout-timeout"),
			"Checkout timeout guidance.",
		);
		await rebuildMemoryIndex(config);

		await unlink(first.path);
		await rebuildMemoryIndex(config);

		expect(readIndexedRows(config.indexFile).map((row) => row.id)).toEqual([
			"checkout-timeout",
		]);
	});

	it("preserves the previous index when one Markdown file is invalid", async () => {
		const config = await createWorkspace();
		await storeReviewedMemory(
			config,
			reviewedMetadata("login-selector-failure"),
			"Stable selector guidance.",
		);
		await rebuildMemoryIndex(config);

		const invalidDirectory = join(
			config.memoryRoot,
			"client-project",
			"broken",
		);
		await mkdir(invalidDirectory, { recursive: true });
		await writeFile(
			join(invalidDirectory, "invalid.md"),
			"not frontmatter\n",
			"utf8",
		);

		await expect(rebuildMemoryIndex(config)).rejects.toThrow();
		expect(readIndexedRows(config.indexFile).map((row) => row.id)).toEqual([
			"login-selector-failure",
		]);
	});
});
